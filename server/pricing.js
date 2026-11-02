import { randomUUID } from 'node:crypto';
import { ensure, audit } from './security.js';

export async function stationLock(db, stationId) {
  const station = (await db.query('SELECT * FROM stations WHERE id=$1 AND active FOR UPDATE',[stationId])).rows[0];
  ensure(station,404,'Station not found.');
  return station;
}

export async function publishPrice(db, actor, stationId, fuel, price, source, reportId = null) {
  const previous = (await db.query('SELECT price FROM prices WHERE station_id=$1 AND fuel=$2',[stationId,fuel])).rows[0];
  await db.query(`INSERT INTO prices(station_id,fuel,price,source,report_id) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT(station_id,fuel) DO UPDATE SET price=EXCLUDED.price,source=EXCLUDED.source,report_id=EXCLUDED.report_id,updated_at=now()`,[stationId,fuel,price,source,reportId]);
  await db.query('INSERT INTO price_history(station_id,fuel,price,source,actor_id) VALUES ($1,$2,$3,$4,$5)',[stationId,fuel,price,source,actor]);
  await audit(db,actor,'price.publish',stationId,{fuel,previous:previous?.price ?? null,price,source,reportId});
  if (previous?.price !== price) {
    const subscribers = (await db.query('SELECT user_id FROM subscriptions WHERE station_id=$1',[stationId])).rows;
    for (const sub of subscribers) await notify(db,sub.user_id,`Station #${stationId}: ${fuel} updated to UGX ${price.toLocaleString('en-UG')}/L (${source}).`);
  }
}
export async function notify(db,userId,message) {
  await db.query('INSERT INTO notifications(id,user_id,message) VALUES ($1,$2,$3)',[randomUUID(),userId,message]);
}

export async function submitPriceReport(db, user, input, idempotencyKey) {
  await stationLock(db,input.stationId);
  const existing = (await db.query('SELECT * FROM reports WHERE user_id=$1 AND idempotency_key=$2',[user.id,idempotencyKey])).rows[0];
  if (existing) {
    ensure(existing.station_id===input.stationId && existing.fuel===input.fuel && existing.price===input.price && existing.note===input.note && existing.latitude===(input.latitude??null) && existing.longitude===(input.longitude??null),409,'This submission key was already used for different report data.');
    return existing;
  }
  const baseline = (await db.query(`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY price) AS median FROM price_history
    WHERE station_id=$1 AND fuel=$2 AND source<>'demo' AND created_at>now()-interval '48 hours'`,[input.stationId,input.fuel])).rows[0]?.median;
  const cap = (await db.query(`SELECT price FROM price_caps WHERE district=(SELECT district FROM stations WHERE id=$1) AND fuel=$2
    AND effective_from<=now() AND effective_until>now()`,[input.stationId,input.fuel])).rows[0];
  const flagged = (baseline && Math.abs(input.price-Number(baseline))/Number(baseline)>0.25) || (cap && input.price>cap.price);
  const id = randomUUID();
  await db.query(`INSERT INTO reports(id,user_id,station_id,fuel,price,status,latitude,longitude,note,idempotency_key)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,user.id,input.stationId,input.fuel,input.price,flagged?'flagged':'pending',input.latitude??null,input.longitude??null,input.note,idempotencyKey]);
  await audit(db,user.id,'report.submit',id,{stationId:input.stationId,fuel:input.fuel,flagged:Boolean(flagged)});
  // Only independently identity-verified citizens contribute to automatic consensus.
  // Accounts alone are not proof of independent people; operators cannot self-confirm.
  if (!flagged && user.identity_verified && user.role==='citizen') {
    const candidates = (await db.query(`SELECT DISTINCT ON (r.user_id) r.id,r.user_id,r.price FROM reports r JOIN users u ON u.id=r.user_id
      WHERE r.station_id=$1 AND r.fuel=$2 AND r.status='pending' AND r.created_at>now()-interval '15 minutes'
      AND r.created_at>=coalesce((SELECT p.updated_at FROM prices p WHERE p.station_id=$1 AND p.fuel=$2 AND p.source<>'demo'),now()-interval '15 minutes')
      AND u.identity_verified AND NOT u.disabled AND u.role='citizen' AND abs(r.price-$3)::numeric/$3<=0.025
      ORDER BY r.user_id,r.created_at DESC`,[input.stationId,input.fuel,input.price])).rows;
    if (candidates.length>=3) {
      const ordered = candidates.map(c=>c.price).sort((a,b)=>a-b);
      const mid = Math.floor(ordered.length/2);
      const median = ordered.length%2 ? ordered[mid] : Math.round((ordered[mid-1]+ordered[mid])/2);
      for (const candidate of candidates) {
        await db.query("UPDATE reports SET status='verified',reviewed_at=now(),decision_reason='Independent verified-citizen consensus' WHERE id=$1",[candidate.id]);
        await notify(db,candidate.user_id,'Your price report was verified by independent citizen consensus.');
      }
      await publishPrice(db,user.id,input.stationId,input.fuel,median,'consensus',id);
    }
  }
  return (await db.query('SELECT * FROM reports WHERE id=$1',[id])).rows[0];
}

export const stationProjection = `SELECT s.*,o.name AS operator_name,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('fuel',p.fuel,'price',p.price,'source',p.source,'updated_at',p.updated_at,
    'stale',p.updated_at<now()-interval '48 hours')) FROM prices p WHERE p.station_id=s.id),'[]') AS prices
  FROM stations s JOIN operators o ON o.id=s.operator_id`;
