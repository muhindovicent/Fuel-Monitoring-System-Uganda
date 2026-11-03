import express, { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fileTypeFromBuffer } from 'file-type';
import { transaction } from './db.js';
import { audit, ensure, requireUser, roles, limit, hash, secret } from './security.js';
import { stationProjection, stationLock, submitPriceReport, publishPrice, notify } from './pricing.js';
import { provisionStaffByAdministrator } from './provisioning.js';

const uuid=z.uuid();
const positiveId=z.coerce.number().int().positive().max(2147483647);
const fuel=z.enum(['petrol','diesel','kerosene']);
const amount=z.number().int().min(100).max(100000);
const httpsUrl=z.url().max(2000).refine(value=>{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;},'Use an HTTPS source URL without credentials.');
const pageSchema=z.object({limit:z.coerce.number().int().min(1).max(100).default(50),offset:z.coerce.number().int().min(0).max(100000).default(0)});
const staff=roles('admin','inspector');
const readers=roles('admin','inspector','analyst');
const reportInput=z.object({stationId:positiveId,fuel,price:amount,note:z.string().trim().max(500).default(''),latitude:z.number().min(-90).max(90).optional(),longitude:z.number().min(-180).max(180).optional()}).strict().refine(v=>(v.latitude===undefined)===(v.longitude===undefined),'Both GPS coordinates are required together.');

export function apiRoutes(db,config) {
  const router=Router();
  const key=req=>uuid.parse(req.get('idempotency-key'));
  async function ticketAccess(client,id,user,lock=false) {
    const ticket=(await client.query(`SELECT * FROM tickets WHERE id=$1 ${lock?'FOR UPDATE':''}`,[uuid.parse(id)])).rows[0];
    ensure(ticket && (ticket.user_id===user.id||['admin','inspector'].includes(user.role)),404,'Ticket not found.');
    return ticket;
  }
  async function applicationAccess(client,id,user,lock=false) {
    const application=(await client.query(`SELECT * FROM applications WHERE id=$1 ${lock?'FOR UPDATE':''}`,[uuid.parse(id)])).rows[0];
    ensure(application && (application.user_id===user.id||user.role==='admin'),404,'Application not found.');
    return application;
  }
  router.get('/stations',async(req,res)=>{
    const input=z.object({q:z.string().trim().max(100).default(''),fuel:fuel.optional(),sort:z.enum(['name','price']).default('name'),district:z.string().max(100).optional(),lat:z.coerce.number().min(-90).max(90).optional(),lng:z.coerce.number().min(-180).max(180).optional(),radius:z.coerce.number().min(0.1).max(100).default(10),...pageSchema.shape}).refine(v=>(v.lat===undefined)===(v.lng===undefined),'Both coordinates required.').parse(req.query);
    const params=[`%${input.q}%`,input.district??null,input.fuel??null];
    let where=` WHERE s.active AND (s.name ILIKE $1 OR s.area ILIKE $1 OR s.district ILIKE $1) AND ($2::text IS NULL OR s.district=$2)
      AND ($3::text IS NULL OR EXISTS(SELECT 1 FROM prices p WHERE p.station_id=s.id AND p.fuel=$3))`;
    if(input.lat!==undefined) {
      params.push(input.lat,input.lng,input.radius);
      where+=` AND s.latitude BETWEEN $4-$6/111.0 AND $4+$6/111.0
        AND 6371*2*asin(sqrt(least(1.0,power(sin(radians(s.latitude-$4)/2),2)+cos(radians($4))*cos(radians(s.latitude))*power(sin(radians(s.longitude-$5)/2),2))))<=$6`;
    }
    params.push(input.limit,input.offset);
    const ordering=input.sort==='price'?"(SELECT p.price FROM prices p WHERE p.station_id=s.id AND p.fuel=coalesce($3,'petrol') AND p.updated_at>now()-interval '48 hours' AND p.source<>'demo') ASC NULLS LAST,s.name,s.id":'s.name,s.id';
    const rows=(await db.query(`${stationProjection}${where} ORDER BY ${ordering} LIMIT $${params.length-1} OFFSET $${params.length}`,params)).rows;
    res.json({items:rows,limit:input.limit,offset:input.offset});
  });
  router.get('/stations/:id',async(req,res)=>{
    const station=(await db.query(`${stationProjection} WHERE s.id=$1 AND s.active`,[positiveId.parse(req.params.id)])).rows[0];
    ensure(station,404,'Station not found.');
    const reviews=(await db.query(`SELECT r.id,r.rating,r.body,r.created_at,u.display_name FROM reviews r JOIN users u ON u.id=r.user_id WHERE station_id=$1 ORDER BY r.created_at DESC LIMIT 30`,[station.id])).rows;
    const history=(await db.query('SELECT fuel,price,source,created_at FROM price_history WHERE station_id=$1 ORDER BY created_at DESC LIMIT 90',[station.id])).rows;
    res.json({...station,reviews,history});
  });
  router.get('/summary',async(_req,res)=>{
    const totals=(await db.query(`SELECT (SELECT count(*)::int FROM stations WHERE active) AS stations,
      (SELECT count(*)::int FROM reports WHERE status='verified' AND reviewed_at>=date_trunc('day',now() AT TIME ZONE 'Africa/Kampala') AT TIME ZONE 'Africa/Kampala') AS verified_today,
      (SELECT count(*)::int FROM tickets WHERE status NOT IN ('resolved','closed')) AS active_tickets,
      (SELECT count(*)::int FROM tickets WHERE status='resolved') AS resolved_tickets,
      (SELECT count(*)::int FROM stations WHERE active AND demo) AS demo_stations`)).rows[0];
    const regions=(await db.query(`SELECT s.region,p.fuel,round(avg(p.price))::int AS average,count(*)::int AS samples FROM prices p JOIN stations s ON s.id=p.station_id
      WHERE s.active AND NOT s.demo AND p.source<>'demo' AND p.updated_at>now()-interval '48 hours' GROUP BY s.region,p.fuel ORDER BY s.region,p.fuel`)).rows;
    res.json({...totals,regions,as_of:new Date().toISOString()});
  });
  router.get('/caps',async(_req,res)=>res.json({items:(await db.query('SELECT district,fuel,price,source_url,effective_from,effective_until FROM price_caps WHERE effective_from<=now() AND effective_until>now() ORDER BY district,fuel')).rows}));
  router.get('/operators',async(_req,res)=>res.json({items:(await db.query('SELECT * FROM operators ORDER BY name')).rows}));
  router.post('/reports',requireUser,async(req,res)=>{
    const input=reportInput.parse(req.body), requestKey=key(req);
    await limit(db,`report:${req.user.id}`,10,3600);
    const report=await transaction(db,client=>submitPriceReport(client,req.user,input,requestKey));
    res.status(201).json(report);
  });
  router.get('/me/reports',requireUser,async(req,res)=>{
    const {limit,offset}=pageSchema.parse(req.query);
    res.json({items:(await db.query('SELECT r.*,s.name AS station_name FROM reports r JOIN stations s ON s.id=r.station_id WHERE user_id=$1 ORDER BY r.created_at DESC LIMIT $2 OFFSET $3',[req.user.id,limit,offset])).rows});
  });
  router.put('/stations/:id/prices',requireUser,async(req,res)=>{
    const stationId=positiveId.parse(req.params.id);
    const input=z.object({fuel,price:amount,expectedUpdatedAt:z.iso.datetime({offset:true}).nullable().optional()}).strict().parse(req.body);
    ensure(['admin','operator'].includes(req.user.role),403,'Only authorized station operators can publish prices.');
    if(req.apiToken) ensure(req.apiToken.station_id===stationId,403,'Credential is scoped to another station.');
    await limit(db,`price:${req.user.id}`,120,3600);
    await transaction(db,async client=>{
      await stationLock(client,stationId);
      if(req.user.role!=='admin'||req.apiToken) ensure((await client.query('SELECT 1 FROM station_staff WHERE user_id=$1 AND station_id=$2',[req.user.id,stationId])).rowCount,403,'You are not assigned to this station.');
      if(input.expectedUpdatedAt!==undefined) {
        // Compare inside PostgreSQL so its microsecond precision is not lost to JS Date.
        const current=(await client.query('SELECT updated_at=$3::timestamptz AS unchanged FROM prices WHERE station_id=$1 AND fuel=$2',[stationId,input.fuel,input.expectedUpdatedAt])).rows[0];
        ensure(current ? current.unchanged : input.expectedUpdatedAt===null,409,'Price changed since you loaded it. Refresh before updating.');
      }
      await publishPrice(client,req.user.id,stationId,input.fuel,input.price,'operator');
    });
    res.json({saved:true});
  });
  router.get('/operator/stations',roles('admin','operator'),async(req,res)=>{
    res.json({items:(await db.query(`${stationProjection} WHERE s.active AND ($1::boolean OR EXISTS(SELECT 1 FROM station_staff ss WHERE ss.station_id=s.id AND ss.user_id=$2)) ORDER BY s.name`,[req.user.role==='admin',req.user.id])).rows});
  });
  router.get('/operator/reports',roles('admin','operator'),async(req,res)=>{
    const {limit,offset}=pageSchema.parse(req.query);
    res.json({items:(await db.query(`SELECT r.id,r.station_id,s.name AS station_name,r.fuel,r.price,r.status,r.created_at FROM reports r JOIN stations s ON s.id=r.station_id
      WHERE ($1::boolean OR EXISTS(SELECT 1 FROM station_staff ss WHERE ss.station_id=r.station_id AND ss.user_id=$2)) ORDER BY r.created_at DESC LIMIT $3 OFFSET $4`,[req.user.role==='admin',req.user.id,limit,offset])).rows});
  });
  router.post('/stations/:id/reviews',requireUser,async(req,res)=>{
    const input=z.object({rating:z.number().int().min(1).max(5),body:z.string().trim().max(2000)}).strict().parse(req.body);
    const stationId=positiveId.parse(req.params.id);
    await limit(db,`review:${req.user.id}`,10,3600);
    await transaction(db,async client=>{
      await stationLock(client,stationId);
      await client.query(`INSERT INTO reviews(id,user_id,station_id,rating,body) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT(user_id,station_id) DO UPDATE SET rating=EXCLUDED.rating,body=EXCLUDED.body,created_at=now()`,[randomUUID(),req.user.id,stationId,input.rating,input.body]);
    });
    res.status(201).json({saved:true});
  });
  router.get('/me/subscriptions',requireUser,async(req,res)=>res.json({items:(await db.query('SELECT station_id FROM subscriptions WHERE user_id=$1',[req.user.id])).rows}));
  router.put('/stations/:id/subscription',requireUser,async(req,res)=>{
    const enabled=z.object({enabled:z.boolean()}).strict().parse(req.body).enabled;
    await transaction(db,async client=>{
      const id=positiveId.parse(req.params.id); await stationLock(client,id);
      if(enabled) await client.query('INSERT INTO subscriptions(user_id,station_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[req.user.id,id]);
      else await client.query('DELETE FROM subscriptions WHERE user_id=$1 AND station_id=$2',[req.user.id,id]);
    });
    res.json({saved:true});
  });
  router.get('/me/notifications',requireUser,async(req,res)=>res.json({items:(await db.query('SELECT id,message,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[req.user.id])).rows}));
  router.post('/me/notifications/read',requireUser,async(req,res)=>{
    const ids=z.object({ids:z.array(uuid).max(100)}).strict().parse(req.body).ids;
    await db.query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND id=ANY($2::uuid[])',[req.user.id,ids]);res.json({saved:true});
  });
  router.post('/tickets',requireUser,async(req,res)=>{
    const input=z.object({stationId:positiveId,category:z.enum(['tampering','adulterated','overpricing','refusal','quality','other']),vehicleType:z.enum(['truck','boda','private','other']),incidentDate:z.iso.date(),description:z.string().trim().min(10).max(5000)}).strict().parse(req.body);
    ensure(input.incidentDate<=new Date().toISOString().slice(0,10),400,'Incident date cannot be in the future.');
    const requestKey=key(req); await limit(db,`ticket:${req.user.id}`,10,3600);
    const result=await transaction(db,async client=>{
      await stationLock(client,input.stationId);
      const existing=(await client.query('SELECT * FROM tickets WHERE user_id=$1 AND idempotency_key=$2',[req.user.id,requestKey])).rows[0];
      if(existing) { ensure(existing.station_id===input.stationId&&existing.description===input.description&&existing.category===input.category&&existing.vehicle_type===input.vehicleType&&new Date(existing.incident_date).toISOString().slice(0,10)===input.incidentDate,409,'Submission key already used.');return existing; }
      const id=randomUUID(),reference=`C2G-${new Date().getUTCFullYear()}-${id.slice(0,8).toUpperCase()}`;
      const ticket=(await client.query(`INSERT INTO tickets(id,reference,user_id,station_id,category,vehicle_type,incident_date,description,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[id,reference,req.user.id,input.stationId,input.category,input.vehicleType,input.incidentDate,input.description,requestKey])).rows[0];
      await audit(client,req.user.id,'ticket.create',id,{reference}); await notify(client,req.user.id,`Complaint ${reference} received. Track updates in My activity.`); return ticket;
    });
    res.status(201).json(result);
  });
  router.get('/tickets',requireUser,async(req,res)=>{
    const {limit,offset}=pageSchema.parse(req.query);const isStaff=['admin','inspector'].includes(req.user.role);
    const status=z.enum(['open','investigating','dispatched','resolved','closed']).optional().parse(req.query.status);
    res.json({items:(await db.query(`SELECT t.*,s.name AS station_name,u.display_name AS assignee,
      t.due_at<now() AND t.status NOT IN ('resolved','closed') AS overdue FROM tickets t JOIN stations s ON s.id=t.station_id LEFT JOIN users u ON u.id=t.assigned_to
      WHERE ($1::boolean OR t.user_id=$2) AND ($3::text IS NULL OR t.status=$3) ORDER BY t.due_at,t.id LIMIT $4 OFFSET $5`,[isStaff,req.user.id,status??null,limit,offset])).rows});
  });
  router.get('/tickets/:id',requireUser,async(req,res)=>{
    const ticket=await ticketAccess(db,req.params.id,req.user);
    const messages=(await db.query(`SELECT m.id,m.body,m.created_at,u.display_name,u.role FROM ticket_messages m JOIN users u ON u.id=m.user_id WHERE ticket_id=$1 ORDER BY m.created_at`,[ticket.id])).rows;
    const attachments=(await db.query('SELECT id,name,media_type,octet_length(content) AS size FROM attachments WHERE ticket_id=$1',[ticket.id])).rows;
    res.json({...ticket,messages,attachments});
  });
  router.post('/tickets/:id/messages',requireUser,async(req,res)=>{
    const {body}=z.object({body:z.string().trim().min(1).max(3000)}).strict().parse(req.body);
    await limit(db,`ticket-message:${req.user.id}`,60,3600);
    await transaction(db,async client=>{
      const ticket=await ticketAccess(client,req.params.id,req.user,true);
      ensure(!['resolved','closed'].includes(ticket.status),409,'This ticket is closed for replies.');
      await client.query('INSERT INTO ticket_messages(id,ticket_id,user_id,body) VALUES ($1,$2,$3,$4)',[randomUUID(),ticket.id,req.user.id,body]);
      if(['admin','inspector'].includes(req.user.role)) {
        await client.query('UPDATE tickets SET first_response_at=coalesce(first_response_at,now()) WHERE id=$1',[ticket.id]);
        await notify(client,ticket.user_id,`A case officer replied to ${ticket.reference}.`);
      }
      await audit(client,req.user.id,'ticket.message',ticket.id);
    });res.status(201).json({saved:true});
  });
  router.patch('/tickets/:id',staff,async(req,res)=>{
    const input=z.object({status:z.enum(['open','investigating','dispatched','resolved','closed']),assignedTo:uuid.optional(),reason:z.string().trim().min(5).max(1000),version:z.number().int().positive()}).strict().parse(req.body);
    const transitions={open:['investigating'],investigating:['dispatched','resolved'],dispatched:['resolved'],resolved:['closed'],closed:[]};
    const result=await transaction(db,async client=>{
      const ticket=await ticketAccess(client,req.params.id,req.user,true);
      ensure(ticket.version===input.version,409,'Ticket was updated by another officer. Refresh and retry.');
      ensure(transitions[ticket.status].includes(input.status)||ticket.status===input.status,409,'Invalid ticket status transition.');
      const assignee=input.assignedTo??ticket.assigned_to??req.user.id;
      ensure((await client.query("SELECT 1 FROM users WHERE id=$1 AND role IN ('admin','inspector') AND NOT disabled",[assignee])).rowCount,400,'Assignee must be an active case officer.');
      await client.query(`UPDATE tickets SET status=$1,assigned_to=$2,updated_at=now(),version=version+1,
        first_response_at=coalesce(first_response_at,now()),resolved_at=CASE WHEN $1='resolved' THEN now() ELSE resolved_at END WHERE id=$3`,[input.status,assignee,ticket.id]);
      await client.query('INSERT INTO ticket_messages(id,ticket_id,user_id,body) VALUES ($1,$2,$3,$4)',[randomUUID(),ticket.id,req.user.id,`${input.status}: ${input.reason}`]);
      await notify(client,ticket.user_id,`${ticket.reference}: ${input.status}. ${input.reason}`);
      await audit(client,req.user.id,'ticket.transition',ticket.id,{from:ticket.status,to:input.status,assignee,reason:input.reason});
      return {saved:true};
    });res.json(result);
  });
  router.post('/applications',requireUser,async(req,res)=>{
    const input=z.object({stationId:positiveId,licenseReference:z.string().trim().min(3).max(200)}).strict().parse(req.body);
    const requestKey=key(req);
    await limit(db,`application:${req.user.id}`,5,3600);
    const application=await transaction(db,async client=>{
      await stationLock(client,input.stationId);
      const existing=(await client.query('SELECT * FROM applications WHERE user_id=$1 AND idempotency_key=$2',[req.user.id,requestKey])).rows[0];
      if(existing){ensure(existing.station_id===input.stationId&&existing.license_reference===input.licenseReference,409,'Submission key already used.');return existing;}
      const result=(await client.query('INSERT INTO applications(id,user_id,station_id,license_reference,idempotency_key) VALUES ($1,$2,$3,$4,$5) RETURNING *',[randomUUID(),req.user.id,input.stationId,input.licenseReference,requestKey])).rows[0];
      await audit(client,req.user.id,'application.submit',result.id); return result;
    });res.status(201).json(application);
  });
  router.get('/applications',requireUser,async(req,res)=>{
    const {limit,offset}=pageSchema.parse(req.query);
    res.json({items:(await db.query(`SELECT a.*,s.name AS station_name,u.display_name,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f.id,'name',f.name)) FROM attachments f WHERE f.application_id=a.id),'[]') AS attachments
      FROM applications a JOIN stations s ON s.id=a.station_id JOIN users u ON u.id=a.user_id WHERE ($1::boolean OR a.user_id=$2) ORDER BY a.created_at DESC LIMIT $3 OFFSET $4`,[req.user.role==='admin',req.user.id,limit,offset])).rows});
  });
  router.patch('/applications/:id',roles('admin'),async(req,res)=>{
    const input=z.object({status:z.enum(['approved','rejected']),reason:z.string().trim().min(10).max(1000)}).strict().parse(req.body);
    await transaction(db,async client=>{
      const application=await applicationAccess(client,req.params.id,req.user,true);
      ensure(application.status==='pending',409,'Application already reviewed.');
      ensure(application.user_id!==req.user.id,403,'You cannot review your own application.');
      if(input.status==='approved') {
        ensure((await client.query('SELECT 1 FROM attachments WHERE application_id=$1',[application.id])).rowCount,400,'Review supporting license documents before approval.');
        const applicant=(await client.query('SELECT role,disabled FROM users WHERE id=$1 FOR UPDATE',[application.user_id])).rows[0];
        ensure(!applicant.disabled && ['citizen','operator'].includes(applicant.role),409,'Applicant must be an active citizen or operator.');
        await client.query("UPDATE users SET role='operator' WHERE id=$1",[application.user_id]);
        await client.query('INSERT INTO station_staff(user_id,station_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[application.user_id,application.station_id]);
      }
      await client.query('UPDATE applications SET status=$1,decision_reason=$2,reviewed_by=$3 WHERE id=$4',[input.status,input.reason,req.user.id,application.id]);
      await notify(client,application.user_id,`Station access application ${input.status}: ${input.reason}`);
      await audit(client,req.user.id,'application.review',application.id,input);
    });res.json({saved:true});
  });
  // Raw uploads are size-bounded before buffering; signatures are checked independently of MIME headers.
  for(const kind of ['tickets','applications']) router.post(`/${kind}/:id/attachments`,requireUser,express.raw({type:()=>true,limit:'5mb'}),async(req,res)=>{
    ensure(Buffer.isBuffer(req.body)&&req.body.length,400,'Choose a file.');
    const detected=await fileTypeFromBuffer(req.body).catch(()=>null);
    ensure(detected&&['image/png','image/jpeg','application/pdf'].includes(detected.mime),400,'Only PNG, JPEG or PDF evidence is accepted.');
    const name=z.string().min(1).max(180).refine(value=>!value.includes('/')&&!value.includes('\\')&&[...value].every(c=>c.charCodeAt(0)>=32&&c.charCodeAt(0)!==127),'Invalid file name.').parse(req.get('x-file-name'));
    await limit(db,`upload:${req.user.id}`,20,3600);
    const id=await transaction(db,async client=>{
      const parent=kind==='tickets'?await ticketAccess(client,req.params.id,req.user,true):await applicationAccess(client,req.params.id,req.user,true);
      ensure(parent.user_id===req.user.id,403,'Only the submitter can add evidence.');
      ensure(kind==='tickets'?!['resolved','closed'].includes(parent.status):parent.status==='pending',409,'Evidence collection is closed.');
      const column=kind==='tickets'?'ticket_id':'application_id';
      const count=(await client.query(`SELECT count(*)::int AS n FROM attachments WHERE ${column}=$1`,[parent.id])).rows[0].n;
      ensure(count<3,400,'Maximum three attachments per submission.');
      const id=randomUUID();
      await client.query(`INSERT INTO attachments(id,owner_id,${column},name,media_type,content) VALUES ($1,$2,$3,$4,$5,$6)`,[id,req.user.id,parent.id,name,detected.mime,req.body]);
      await audit(client,req.user.id,'evidence.upload',id,{parent:parent.id,size:req.body.length,type:detected.mime});return id;
    });res.status(201).json({id});
  });
  router.get('/attachments/:id',requireUser,async(req,res)=>{
    const metadata=(await db.query('SELECT id,ticket_id,application_id,name,media_type FROM attachments WHERE id=$1',[uuid.parse(req.params.id)])).rows[0];
    ensure(metadata,404,'Attachment not found.');
    if(metadata.ticket_id) await ticketAccess(db,metadata.ticket_id,req.user); else await applicationAccess(db,metadata.application_id,req.user);
    const file=(await db.query('SELECT content FROM attachments WHERE id=$1',[metadata.id])).rows[0];
    res.set('Content-Security-Policy',"default-src 'none'; sandbox").type(metadata.media_type).attachment(metadata.name).send(file.content);
  });
  router.get('/tokens',roles('operator','admin'),async(req,res)=>res.json({items:(await db.query('SELECT id,name,station_id,prefix,expires_at,revoked_at,last_used_at FROM api_tokens WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[req.user.id])).rows}));
  router.post('/tokens',roles('operator','admin'),async(req,res)=>{
    const input=z.object({stationId:positiveId,name:z.string().trim().min(3).max(80)}).strict().parse(req.body);
    await limit(db,`tokens:${req.user.id}`,10,3600);
    const token=`mfw_${secret()}`,id=randomUUID();
    await transaction(db,async client=>{
      ensure((await client.query('SELECT 1 FROM station_staff WHERE user_id=$1 AND station_id=$2',[req.user.id,input.stationId])).rowCount,403,'Assign this account to the station before generating a scoped credential.');
      await client.query('INSERT INTO api_tokens(id,user_id,station_id,name,token_hash,prefix) VALUES ($1,$2,$3,$4,$5,$6)',[id,req.user.id,input.stationId,input.name,hash(token),token.slice(0,12)]);
      await audit(client,req.user.id,'token.create',id,{stationId:input.stationId});
    });res.status(201).json({id,token});
  });
  router.delete('/tokens/:id',roles('operator','admin'),async(req,res)=>{
    await transaction(db,async client=>{
      const result=await client.query('UPDATE api_tokens SET revoked_at=now() WHERE id=$1 AND user_id=$2 RETURNING id',[uuid.parse(req.params.id),req.user.id]);
      ensure(result.rowCount,404,'Credential not found.'); await audit(client,req.user.id,'token.revoke',req.params.id);
    });res.status(204).end();
  });
  router.get('/rooms',async(_req,res)=>res.json({items:(await db.query('SELECT * FROM rooms ORDER BY name')).rows}));
  router.get('/rooms/:id/messages',async(req,res)=>{
    res.json({items:(await db.query(`SELECT m.id,m.body,m.created_at,u.display_name,m.user_id,
      (SELECT count(*)::int FROM message_votes v WHERE v.message_id=m.id) AS votes FROM messages m JOIN users u ON u.id=m.user_id
      WHERE m.room_id=$1 AND NOT m.hidden ORDER BY m.created_at DESC LIMIT 50`,[positiveId.parse(req.params.id)])).rows.reverse()});
  });
  router.post('/rooms/:id/messages',requireUser,async(req,res)=>{
    const {body}=z.object({body:z.string().trim().min(1).max(500)}).strict().parse(req.body);
    await limit(db,`chat:${req.user.id}`,30,600);
    await db.query('INSERT INTO messages(id,user_id,room_id,body) VALUES ($1,$2,$3,$4)',[randomUUID(),req.user.id,positiveId.parse(req.params.id),body]);res.status(201).json({saved:true});
  });
  router.put('/messages/:id/vote',requireUser,async(req,res)=>{
    const id=uuid.parse(req.params.id);
    ensure((await db.query('SELECT 1 FROM messages WHERE id=$1 AND NOT hidden AND user_id<>$2',[id,req.user.id])).rowCount,400,'You can only vote on another visible message.');
    await db.query('INSERT INTO message_votes(user_id,message_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',[req.user.id,id]);res.json({saved:true});
  });
  router.delete('/messages/:id',staff,async(req,res)=>{
    await transaction(db,async client=>{
      const result=await client.query('UPDATE messages SET hidden=true WHERE id=$1 RETURNING id',[uuid.parse(req.params.id)]);
      ensure(result.rowCount,404,'Message not found.');await audit(client,req.user.id,'message.hide',req.params.id);
    });res.status(204).end();
  });
  router.get('/advisories',async(_req,res)=>res.json({items:(await db.query('SELECT a.*,u.display_name AS author FROM advisories a JOIN users u ON u.id=a.author_id ORDER BY a.created_at DESC LIMIT 100')).rows}));
  router.post('/advisories',roles('admin'),async(req,res)=>{
    const input=z.object({title:z.string().trim().min(5).max(200),body:z.string().trim().min(10).max(10000),sourceUrl:httpsUrl}).strict().parse(req.body);
    const id=randomUUID();await transaction(db,async client=>{
      await client.query('INSERT INTO advisories(id,author_id,title,body,source_url) VALUES ($1,$2,$3,$4,$5)',[id,req.user.id,input.title,input.body,input.sourceUrl]);
      await audit(client,req.user.id,'advisory.publish',id);
    });res.status(201).json({id});
  });
  router.get('/town-halls',async(_req,res)=>res.json({items:(await db.query(`SELECT h.*,coalesce((SELECT jsonb_agg(jsonb_build_object('id',q.id,'body',q.body,'answer',q.answer)) FROM questions q WHERE q.hall_id=h.id),'[]') AS questions FROM town_halls h ORDER BY h.starts_at DESC LIMIT 30`)).rows}));
  router.post('/town-halls',roles('admin'),async(req,res)=>{
    const input=z.object({title:z.string().trim().min(5).max(200),host:z.string().trim().min(2).max(100),startsAt:z.iso.datetime({offset:true})}).strict().parse(req.body);
    ensure(new Date(input.startsAt)>new Date(),400,'Choose a future start time.');
    const id=randomUUID();await transaction(db,async client=>{
      await client.query('INSERT INTO town_halls(id,title,host,starts_at,created_by) VALUES ($1,$2,$3,$4,$5)',[id,input.title,input.host,input.startsAt,req.user.id]);await audit(client,req.user.id,'townhall.create',id);
    });res.status(201).json({id});
  });
  router.post('/town-halls/:id/questions',requireUser,async(req,res)=>{
    const {body}=z.object({body:z.string().trim().min(5).max(1000)}).strict().parse(req.body);const id=uuid.parse(req.params.id);
    await limit(db,`question:${req.user.id}`,10,3600);
    ensure((await db.query('SELECT 1 FROM town_halls WHERE id=$1 AND starts_at>now()',[id])).rowCount,400,'Questions are closed for this session.');
    await db.query('INSERT INTO questions(id,hall_id,user_id,body) VALUES ($1,$2,$3,$4)',[randomUUID(),id,req.user.id,body]);res.status(201).json({saved:true});
  });
  router.patch('/questions/:id',roles('admin'),async(req,res)=>{
    const {answer}=z.object({answer:z.string().trim().min(5).max(3000)}).strict().parse(req.body);
    await transaction(db,async client=>{
      const updated=await client.query('UPDATE questions SET answer=$1,answered_by=$2 WHERE id=$3 RETURNING id',[answer,req.user.id,uuid.parse(req.params.id)]);
      ensure(updated.rowCount,404,'Question not found.'); await audit(client,req.user.id,'question.answer',req.params.id);
    });res.json({saved:true});
  });
  router.get('/admin/dashboard',readers,async(_req,res)=>{
    const totals=(await db.query(`SELECT (SELECT count(*)::int FROM reports) AS reports,
      (SELECT count(*)::int FROM reports WHERE status='verified') AS verified,
      (SELECT count(*)::int FROM reports WHERE status IN ('pending','flagged')) AS review_queue,
      (SELECT count(*)::int FROM tickets WHERE status NOT IN ('resolved','closed') AND due_at<now()) AS overdue,
      (SELECT count(*)::int FROM applications WHERE status='pending') AS applications,
      (SELECT count(DISTINCT user_id)::int FROM sessions WHERE created_at>=date_trunc('day',now() AT TIME ZONE 'Africa/Kampala') AT TIME ZONE 'Africa/Kampala') AS signed_in_today,
      (SELECT round(avg(extract(epoch FROM (first_response_at-created_at))/3600)::numeric,1) FROM tickets WHERE first_response_at IS NOT NULL) AS average_response_hours`)).rows[0];
    const trend=(await db.query(`SELECT (created_at AT TIME ZONE 'Africa/Kampala')::date AS day,fuel,round(avg(price))::int AS average FROM price_history WHERE source<>'demo' AND created_at>now()-interval '30 days' GROUP BY (created_at AT TIME ZONE 'Africa/Kampala')::date,fuel ORDER BY day,fuel`)).rows;
    res.json({...totals,trend});
  });
  router.get('/admin/reports',staff,async(req,res)=>{
    const {limit,offset}=pageSchema.parse(req.query);
    res.json({items:(await db.query(`SELECT r.*,s.name AS station_name FROM reports r JOIN stations s ON s.id=r.station_id WHERE r.status IN ('pending','flagged') ORDER BY r.created_at LIMIT $1 OFFSET $2`,[limit,offset])).rows});
  });
  router.patch('/admin/reports/:id',staff,async(req,res)=>{
    const input=z.object({status:z.enum(['verified','rejected']),reason:z.string().trim().min(5).max(1000)}).strict().parse(req.body),id=uuid.parse(req.params.id);
    await transaction(db,async client=>{
      // Station lock order matches ingestion and operator updates, avoiding publication races.
      const initial=(await client.query('SELECT station_id FROM reports WHERE id=$1',[id])).rows[0];ensure(initial,404,'Report not found.');
      await stationLock(client,initial.station_id);
      const report=(await client.query('SELECT * FROM reports WHERE id=$1 FOR UPDATE',[id])).rows[0];
      ensure(['pending','flagged'].includes(report.status),409,'Report has already been reviewed.');
      ensure(report.user_id!==req.user.id,403,'You cannot moderate your own report.');
      // Old observations may be accepted as evidence, but must not replace newer pump prices.
      if(input.status==='verified') {
        const newer=(await client.query('SELECT 1 FROM prices p JOIN reports r ON r.id=$3 WHERE p.station_id=$1 AND p.fuel=$2 AND p.updated_at>r.created_at',[report.station_id,report.fuel,id])).rowCount;
        ensure(!newer,409,'A newer price exists. Reject this stale report with a reason instead.');
        await publishPrice(client,req.user.id,report.station_id,report.fuel,report.price,'moderator',id);
      }
      await client.query('UPDATE reports SET status=$1,decision_reason=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$4',[input.status,input.reason,req.user.id,id]);
      await audit(client,req.user.id,'report.review',id,input);await notify(client,report.user_id,`Price report ${input.status}: ${input.reason}`);
    });res.json({saved:true});
  });
  router.get('/admin/audit',readers,async(req,res)=>{
    const {limit,offset}=pageSchema.parse(req.query);
    res.json({items:(await db.query('SELECT a.*,u.display_name AS actor FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT $1 OFFSET $2',[limit,offset])).rows});
  });
  router.get('/admin/users',roles('admin'),async(req,res)=>{
    const {limit,offset}=pageSchema.parse(req.query);
    res.json({items:(await db.query('SELECT id,email,display_name,role,identity_verified,disabled FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',[limit,offset])).rows});
  });
  router.get('/admin/officers',staff,async(_req,res)=>res.json({items:(await db.query("SELECT id,display_name FROM users WHERE role IN ('admin','inspector') AND NOT disabled ORDER BY display_name")).rows}));
  router.patch('/admin/users/:id',roles('admin'),async(req,res)=>{
    const input=z.object({identityVerified:z.boolean().optional(),disabled:z.boolean().optional(),role:z.enum(['citizen','operator','inspector','analyst']).optional(),reason:z.string().trim().min(10).max(1000)}).strict().refine(v=>v.identityVerified!==undefined||v.disabled!==undefined||v.role!==undefined,'Choose an action.').parse(req.body);
    const id=uuid.parse(req.params.id);ensure(id!==req.user.id,403,'Use another administrator to change your own account.');
    await transaction(db,async client=>{
      const user=(await client.query('SELECT role FROM users WHERE id=$1 FOR UPDATE',[id])).rows[0];ensure(user,404,'Account not found.');
      ensure(user.role!=='admin',403,'Administrator account changes require the administrative CLI.');
      const roleChanged=input.role!==undefined&&input.role!==user.role;
      await client.query('UPDATE users SET identity_verified=coalesce($1,identity_verified),disabled=coalesce($2,disabled),role=coalesce($3,role) WHERE id=$4',[input.identityVerified??null,input.disabled??null,input.role??null,id]);
      if(roleChanged&&input.role!=='operator')await client.query('DELETE FROM station_staff WHERE user_id=$1',[id]);
      if(input.disabled||roleChanged){await client.query('DELETE FROM sessions WHERE user_id=$1',[id]);await client.query('UPDATE api_tokens SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[id]);}
      await audit(client,req.user.id,roleChanged?'account.role':'account.review',id,input);
    });res.json({saved:true});
  });
  router.post('/admin/staff',roles('admin'),async(req,res)=>{
    await limit(db,`staff-provision-manual:${req.user.id}`,10,3600);
    const input=z.object({email:z.email().max(254),displayName:z.string().trim().min(2).max(80),password:z.string().min(12).max(128),role:z.enum(['inspector','analyst']),administratorPassword:z.string().min(1).max(128),identityVerified:z.literal(true),reason:z.string().trim().min(20).max(500)}).strict().parse(req.body);
    const account=await provisionStaffByAdministrator(db,{account:{email:input.email,displayName:input.displayName,password:input.password,role:input.role},administrator:{id:req.user.id,password:input.administratorPassword},reason:input.reason});
    res.status(201).json({id:account.id,role:account.role});
  });
  router.get('/admin/operator-accounts',roles('admin'),async(_req,res)=>{
    res.json({items:(await db.query("SELECT id,email,display_name FROM users WHERE role='operator' AND NOT disabled ORDER BY display_name,email LIMIT 500")).rows});
  });
  router.post('/admin/operators',roles('admin'),async(req,res)=>{
    const input=z.object({name:z.string().trim().min(2).max(150),shortName:z.string().trim().min(2).max(30)}).strict().parse(req.body);
    const result=await transaction(db,async client=>{
      const item=(await client.query('INSERT INTO operators(name,short_name) VALUES ($1,$2) RETURNING *',[input.name,input.shortName])).rows[0];await audit(client,req.user.id,'operator.create',item.id);return item;
    });res.status(201).json(result);
  });
  router.post('/admin/rooms',roles('admin'),async(req,res)=>{
    const {name}=z.object({name:z.string().trim().min(3).max(100)}).strict().parse(req.body);
    const room=await transaction(db,async client=>{
      const row=(await client.query('INSERT INTO rooms(name) VALUES ($1) RETURNING *',[name])).rows[0];
      await audit(client,req.user.id,'room.create',row.id,{name});return row;
    });res.status(201).json(room);
  });
  router.get('/admin/stations',roles('admin'),async(req,res)=>{
    const {limit,offset}=pageSchema.parse(req.query);
    res.json({items:(await db.query(`${stationProjection} ORDER BY s.id LIMIT $1 OFFSET $2`,[limit,offset])).rows});
  });
  router.get('/admin/assignments',roles('admin'),async(req,res)=>{
    const {limit,offset}=pageSchema.parse(req.query);
    res.json({items:(await db.query(`SELECT ss.user_id,ss.station_id,s.name AS station_name,u.display_name,u.email
      FROM station_staff ss JOIN stations s ON s.id=ss.station_id JOIN users u ON u.id=ss.user_id ORDER BY s.id,u.display_name LIMIT $1 OFFSET $2`,[limit,offset])).rows});
  });
  router.post('/admin/stations/:id/staff',roles('admin'),async(req,res)=>{
    await limit(db,`station-assign:${req.user.id}`,60,3600);
    const stationId=positiveId.parse(req.params.id);
    const input=z.object({userId:uuid,reason:z.string().trim().min(10).max(500)}).strict().parse(req.body);
    await transaction(db,async client=>{
      const station=(await client.query('SELECT id,name,active FROM stations WHERE id=$1 FOR UPDATE',[stationId])).rows[0];ensure(station,404,'Station not found.');
      ensure(station.active,409,'Choose an active station.');
      const user=(await client.query('SELECT id,role,disabled FROM users WHERE id=$1 FOR UPDATE',[input.userId])).rows[0];
      ensure(user&&!user.disabled&&user.role==='operator',409,'Choose an active operator account.');
      const inserted=(await client.query('INSERT INTO station_staff(user_id,station_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING station_id',[input.userId,stationId])).rows[0];
      ensure(inserted,409,'That operator is already assigned to this station.');
      await audit(client,req.user.id,'station.access_grant',stationId,{userId:input.userId,reason:input.reason});
      await notify(client,input.userId,`You now have access to ${station.name}.`);
    });res.status(201).json({saved:true});
  });
  router.delete('/admin/stations/:id/staff/:userId',roles('admin'),async(req,res)=>{
    const stationId=positiveId.parse(req.params.id),userId=uuid.parse(req.params.userId);
    await transaction(db,async client=>{
      const result=await client.query('DELETE FROM station_staff WHERE station_id=$1 AND user_id=$2 RETURNING station_id',[stationId,userId]);ensure(result.rowCount,404,'Assignment not found.');
      await client.query('UPDATE api_tokens SET revoked_at=now() WHERE station_id=$1 AND user_id=$2',[stationId,userId]);
      await audit(client,req.user.id,'station.access_revoke',stationId,{userId});await notify(client,userId,`Your access to station #${stationId} has been revoked.`);
    });res.status(204).end();
  });
  router.post('/admin/stations',roles('admin'),async(req,res)=>{
    const input=z.object({operatorId:positiveId,name:z.string().trim().min(2).max(200),area:z.string().trim().min(2).max(100),district:z.string().trim().min(2).max(100),region:z.enum(['Central','Eastern','Northern','Western']),latitude:z.number().min(-1.6).max(4.3),longitude:z.number().min(29.5).max(35.1)}).strict().parse(req.body);
    const station=await transaction(db,async client=>{
      const row=(await client.query('INSERT INTO stations(operator_id,name,area,district,region,latitude,longitude) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',[input.operatorId,input.name,input.area,input.district,input.region,input.latitude,input.longitude])).rows[0];await audit(client,req.user.id,'station.create',row.id,input);return row;
    });res.status(201).json(station);
  });
  router.patch('/admin/stations/:id',roles('admin'),async(req,res)=>{
    const input=z.object({active:z.boolean(),reason:z.string().trim().min(10).max(500)}).strict().parse(req.body);
    await transaction(db,async client=>{
      const result=await client.query('UPDATE stations SET active=$1 WHERE id=$2 RETURNING id',[input.active,positiveId.parse(req.params.id)]);ensure(result.rowCount,404,'Station not found.');await audit(client,req.user.id,'station.status',req.params.id,input);
    });res.json({saved:true});
  });
  router.put('/admin/caps',roles('admin'),async(req,res)=>{
    const input=z.object({district:z.string().trim().min(2).max(100),fuel,price:amount,sourceUrl:httpsUrl,effectiveFrom:z.iso.datetime({offset:true}),effectiveUntil:z.iso.datetime({offset:true})}).strict().parse(req.body);
    ensure(new Date(input.effectiveUntil)>new Date(input.effectiveFrom),400,'Expiry must follow the effective date.');
    await transaction(db,async client=>{
      await client.query(`INSERT INTO price_caps(district,fuel,price,source_url,effective_from,effective_until,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(district,fuel) DO UPDATE SET price=EXCLUDED.price,source_url=EXCLUDED.source_url,effective_from=EXCLUDED.effective_from,effective_until=EXCLUDED.effective_until,updated_by=EXCLUDED.updated_by`,[input.district,input.fuel,input.price,input.sourceUrl,input.effectiveFrom,input.effectiveUntil,req.user.id]);
      await audit(client,req.user.id,'cap.publish',`${input.district}:${input.fuel}`,input);
    });res.json({saved:true});
  });
  router.post('/trip',async(req,res)=>{
    const point=z.object({latitude:z.number().min(-1.6).max(4.3),longitude:z.number().min(29.5).max(35.1)}).strict();
    const input=z.object({from:point.optional(),to:point.optional(),distanceKm:z.number().positive().max(3000).optional(),kmPerLitre:z.number().min(1).max(100),fuel}).strict().parse(req.body);
    let distance=input.distanceKm,method='manual distance estimate';
    if(config.ROUTING_URL&&input.from&&input.to) {
      try {
        const {from,to}=input;
        const response=await fetch(`${config.ROUTING_URL.replace(/\/$/,'')}/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=false`,{signal:AbortSignal.timeout(5000)});
        ensure(response.ok,503,'Routing provider unavailable.');const payload=await response.json();
        ensure(payload.code==='Ok'&&Number.isFinite(payload.routes?.[0]?.distance),422,'No road route found.');
        distance=payload.routes[0].distance/1000;method='road route';
      } catch(error) {if(!distance) throw error;method='manual fallback — routing unavailable';}
    }
    ensure(distance,400,'Enter your road distance, or supply coordinates with a configured routing service.');
    const average=(await db.query(`SELECT round(avg(p.price))::int AS price FROM prices p JOIN stations s ON s.id=p.station_id
      WHERE p.fuel=$1 AND p.updated_at>now()-interval '48 hours' AND s.active AND NOT s.demo AND p.source<>'demo'`,[input.fuel])).rows[0]?.price;
    res.json({distanceKm:distance,litres:distance/input.kmPerLitre,averagePrice:average??null,cost:average?Math.round(distance/input.kmPerLitre*average):null,method});
  });
  return router;
}
