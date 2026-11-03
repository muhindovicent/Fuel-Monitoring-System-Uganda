import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { migrate,transaction } from '../server/db.js';
import { configuration } from '../server/config.js';
import { fixtures,testDatabase,testPassword } from './database.js';

test('API security, persistence and stakeholder workflows',async t=>{
  const db=await testDatabase(),users=await fixtures(db);
  const origin='http://localhost:3000';
  const app=createApp(db,{APP_ORIGIN:origin,NODE_ENV:'test',TRUST_PROXY_HOPS:0,LOG_LEVEL:'silent',ROUTING_URL:''});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await db.end();});
  const sessions={};
  async function request(path,{as,method='GET',body,headers={},raw}={}) {
    const session=sessions[as];
    const response=await fetch(`${base}/api/v1${path}`,{method,headers:{origin,'x-requested-with':'MafutaWatch',...(session?{cookie:session.cookie,'x-csrf-token':session.csrfToken}:{}),...(body?{'content-type':'application/json'}:{}),...headers},body:raw??(body?JSON.stringify(body):undefined)});
    const data=response.status===204?null:await response.json();return {status:response.status,data,response};
  }
  for(const [name,user] of Object.entries(users)) {
    const result=await request('/auth/login',{method:'POST',body:{email:user.email,password:testPassword}});
    assert.equal(result.status,200,JSON.stringify(result.data));
    sessions[name]={...result.data,cookie:result.response.headers.get('set-cookie').split(';')[0]};
  }
  const submit=(as,stationId=1,price=5400,requestKey=randomUUID())=>request('/reports',{as,method:'POST',headers:{'idempotency-key':requestKey},body:{stationId,fuel:'petrol',price}});
  await t.test('versioned migrations are repeatable and production origin requires HTTPS',async()=>{
    await migrate(db);
    assert.throws(()=>configuration({DATABASE_URL:'postgresql://test',NODE_ENV:'production',APP_ORIGIN:origin}));
    assert.equal((await fetch(`${base}/health/ready`)).status,200);
  });
  await t.test('registration cannot self-assign authority',async()=>{
    const malicious=await request('/auth/register',{method:'POST',body:{email:'evil@example.test',password:testPassword,displayName:'Evil user',consent:true,role:'admin'}});assert.equal(malicious.status,400);
    const registered=await request('/auth/register',{method:'POST',body:{email:'new@example.test',password:testPassword,displayName:'New user',consent:true}});
    assert.equal(registered.status,201);assert.equal(registered.data.user.role,'citizen');assert.equal(registered.data.user.identity_verified,false);
    assert.match(registered.response.headers.get('set-cookie'),/HttpOnly/i);assert.match(registered.response.headers.get('set-cookie'),/SameSite=Strict/i);
  });
  await t.test('authentication, RBAC, origin and CSRF are enforced',async()=>{
    assert.equal((await request('/admin/dashboard')).status,401);
    assert.equal((await request('/admin/dashboard',{as:'alice'})).status,403);
    assert.equal((await request('/admin/dashboard',{as:'analyst'})).status,200);
    assert.equal((await request('/admin/reports',{as:'analyst'})).status,403);
    assert.equal((await request('/reports',{as:'alice',method:'POST',body:{},headers:{origin:'https://evil.example'}})).status,403);
    assert.equal((await request('/reports',{as:'alice',method:'POST',body:{},headers:{'x-csrf-token':'bad'}})).status,403);
    const headers=(await request('/auth/session',{as:'alice'})).response.headers;
    assert.equal(headers.get('cache-control'),'no-store');assert.match(headers.get('content-security-policy'),/script-src 'self'/);assert.equal(headers.get('x-frame-options'),'DENY');
  });
  await t.test('unverified repeat reports cannot manufacture consensus; retries are idempotent',async()=>{
    const requestKey=randomUUID();const first=await submit('alice',1,5400,requestKey);assert.equal(first.status,201);
    const retry=await submit('alice',1,5400,requestKey);assert.equal(first.data.id,retry.data.id);
    assert.equal((await submit('alice',1,5401,requestKey)).status,409);
    await submit('alice');await submit('alice');await submit('bob');
    assert.equal((await db.query('SELECT * FROM prices')).rows.length,0);
    const own=await request('/me/reports',{as:'bob'});assert.equal(own.data.items.length,1);
    assert.ok(own.data.items.every(r=>r.user_id===users.bob.id));
  });
  await t.test('independent identity-verified citizens publish a transactional consensus',async()=>{
    await submit('verified1');await submit('verified2');const third=await submit('verified3');
    assert.equal(third.data.status,'verified');
    const price=(await db.query('SELECT * FROM prices WHERE station_id=1')).rows[0];assert.equal(price.price,5400);assert.equal(price.source,'consensus');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM reports WHERE status='verified'")).rows[0].n,3);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM price_history')).rows[0].n,1);
  });
  await t.test('concurrent reports serialize publication and old votes cannot overwrite a newer operator observation',async()=>{
    const results=await Promise.all(['verified1','verified2','verified3'].map(name=>submit(name,2,5400)));
    assert.ok(results.every(r=>r.status===201));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM prices WHERE station_id=2')).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM price_history WHERE station_id=2')).rows[0].n,1);
    await submit('verified1',2,5401);
    assert.equal((await request('/stations/2/prices',{as:'admin',method:'PUT',body:{fuel:'petrol',price:5600}})).status,200);
    await submit('verified2',2,5401);await submit('verified3',2,5401);
    assert.equal((await db.query("SELECT price FROM prices WHERE station_id=2 AND fuel='petrol'")).rows[0].price,5600);
  });
  await t.test('manual verification accepts fresh evidence and denies self-review and stale overwrite',async()=>{
    const self=await submit('inspector',2,5700);
    assert.equal((await request(`/admin/reports/${self.data.id}`,{as:'inspector',method:'PATCH',body:{status:'verified',reason:'Attempted self-review should fail.'}})).status,403);
    const fresh=await submit('alice',2,5700);
    assert.equal((await request(`/admin/reports/${fresh.data.id}`,{as:'inspector',method:'PATCH',body:{status:'verified',reason:'Station observation independently confirmed.'}})).status,200);
    assert.equal((await db.query("SELECT price FROM prices WHERE station_id=2 AND fuel='petrol'")).rows[0].price,5700);
    assert.equal((await request(`/admin/reports/${self.data.id}`,{as:'admin',method:'PATCH',body:{status:'verified',reason:'Older observation cannot replace a newer accepted price.'}})).status,409);
  });
  await t.test('flagged outliers require moderation and cannot bypass review',async()=>{
    const outlier=await submit('verified1',1,9000);assert.equal(outlier.data.status,'flagged');
    assert.equal((await db.query('SELECT price FROM prices WHERE station_id=1')).rows[0].price,5400);
    const decision=await request(`/admin/reports/${outlier.data.id}`,{as:'inspector',method:'PATCH',body:{status:'rejected',reason:'Receipt does not match reported price.'}});assert.equal(decision.status,200);
    assert.equal((await request(`/admin/reports/${outlier.data.id}`,{as:'inspector',method:'PATCH',body:{status:'verified',reason:'Retry should not publish.'}})).status,409);
  });
  await t.test('operator assignments, optimistic concurrency, notifications and hashed API scopes',async()=>{
    assert.equal((await request('/stations/2/prices',{as:'operator',method:'PUT',body:{fuel:'petrol',price:5500}})).status,403);
    await request('/stations/1/subscription',{as:'alice',method:'PUT',body:{enabled:true}});
    const station=await request('/stations/1');const updatedAt=station.data.prices[0].updated_at;
    assert.equal((await request('/stations/1/prices',{as:'operator',method:'PUT',body:{fuel:'petrol',price:5500,expectedUpdatedAt:updatedAt}})).status,200);
    assert.equal((await request('/stations/1/prices',{as:'operator',method:'PUT',body:{fuel:'petrol',price:5600,expectedUpdatedAt:updatedAt}})).status,409);
    assert.match((await request('/me/notifications',{as:'alice'})).data.items[0].message,/5,500/);
    const created=await request('/tokens',{as:'operator',method:'POST',body:{stationId:1,name:'Test pump integration'}});assert.equal(created.status,201);
    assert.notEqual((await db.query('SELECT token_hash FROM api_tokens WHERE id=$1',[created.data.id])).rows[0].token_hash,created.data.token);
    const headers={authorization:`Bearer ${created.data.token}`};
    assert.equal((await request('/stations/1/prices',{method:'PUT',headers,body:{fuel:'diesel',price:5200}})).status,200);
    assert.equal((await request('/stations/2/prices',{method:'PUT',headers,body:{fuel:'diesel',price:5200}})).status,403);
    assert.equal((await request('/me/reports',{headers})).status,403);
    await request(`/tokens/${created.data.id}`,{as:'operator',method:'DELETE'});
    assert.equal((await request('/stations/1/prices',{method:'PUT',headers,body:{fuel:'diesel',price:5200}})).status,401);
  });
  let ticket;
  await t.test('complaints are private, idempotent and evidence is stored with authorization',async()=>{
    const requestKey=randomUUID(),body={stationId:1,category:'quality',vehicleType:'boda',incidentDate:new Date().toISOString().slice(0,10),description:'Engine stalled immediately after refuelling.'};
    const created=await request('/tickets',{as:'alice',method:'POST',headers:{'idempotency-key':requestKey},body});assert.equal(created.status,201,JSON.stringify(created.data));ticket=created.data;
    const retry=await request('/tickets',{as:'alice',method:'POST',headers:{'idempotency-key':requestKey},body});assert.equal(retry.status,201,JSON.stringify(retry.data));assert.equal(retry.data.id,ticket.id);
    assert.equal((await request(`/tickets/${ticket.id}`,{as:'bob'})).status,404);
    assert.equal((await request('/tickets',{as:'bob'})).data.items.length,0);
    const upload=await request(`/tickets/${ticket.id}/attachments`,{as:'alice',method:'POST',headers:{'content-type':'application/pdf','x-file-name':'receipt.pdf'},raw:Buffer.from('%PDF-1.7\nTest evidence\n%%EOF')});assert.equal(upload.status,201,JSON.stringify(upload.data));
    const file=await fetch(`${base}/api/v1/attachments/${upload.data.id}`,{headers:{cookie:sessions.alice.cookie}});assert.equal(file.status,200);assert.match(file.headers.get('content-disposition'),/attachment/);assert.match(await file.text(),/%PDF/);
    assert.equal((await request(`/attachments/${upload.data.id}`,{as:'bob'})).status,404);
    const fake=await request(`/tickets/${ticket.id}/attachments`,{as:'alice',method:'POST',headers:{'content-type':'image/png','x-file-name':'fake.png'},raw:Buffer.from('<script>alert(1)</script>')});assert.equal(fake.status,400);
  });
  await t.test('case state machine, version conflicts, assignment and citizen replies work',async()=>{
    assert.equal((await request(`/tickets/${ticket.id}`,{as:'inspector',method:'PATCH',body:{status:'resolved',version:1,reason:'Cannot skip investigation.'}})).status,409);
    assert.equal((await request(`/tickets/${ticket.id}`,{as:'inspector',method:'PATCH',body:{status:'investigating',assignedTo:users.inspector.id,version:1,reason:'Reviewing receipt with laboratory team.'}})).status,200);
    assert.equal((await request(`/tickets/${ticket.id}`,{as:'inspector',method:'PATCH',body:{status:'dispatched',version:1,reason:'Stale update.'}})).status,409);
    assert.equal((await request(`/tickets/${ticket.id}/messages`,{as:'alice',method:'POST',body:{body:'I can provide a fuel sample.'}})).status,201);
    const state=await request(`/tickets/${ticket.id}`,{as:'alice'});assert.equal(state.data.status,'investigating');assert.equal(state.data.messages.length,2);assert.ok(state.data.first_response_at);
  });
  await t.test('operator applications need evidence and manual approval before station access',async()=>{
    const requestKey=randomUUID(),body={stationId:2,licenseReference:'TEST-LICENSE-2'};
    const created=await request('/applications',{as:'bob',method:'POST',headers:{'idempotency-key':requestKey},body});assert.equal(created.status,201);
    assert.equal((await request('/applications',{as:'bob',method:'POST',headers:{'idempotency-key':requestKey},body})).data.id,created.data.id);
    const decide=()=>request(`/applications/${created.data.id}`,{as:'admin',method:'PATCH',body:{status:'approved',reason:'License checked with issuing authority.'}});
    assert.equal((await decide()).status,400);
    await request(`/applications/${created.data.id}/attachments`,{as:'bob',method:'POST',headers:{'content-type':'application/pdf','x-file-name':'license.pdf'},raw:Buffer.from('%PDF-1.7\nLicense\n%%EOF')});
    assert.equal((await decide()).status,200);
    assert.equal((await request('/operator/stations',{as:'bob'})).data.items[0].id,2);
  });
  await t.test('community attribution, unique votes and moderation are enforced',async()=>{
    const body='<img src=x onerror=alert(1)> information';
    assert.equal((await request('/rooms/1/messages',{as:'alice',method:'POST',body:{body,userId:users.admin.id}})).status,400);
    await request('/rooms/1/messages',{as:'alice',method:'POST',body:{body}});
    const message=(await request('/rooms/1/messages')).data.items[0];assert.equal(message.user_id,users.alice.id);
    for(let i=0;i<2;i++)assert.equal((await request(`/messages/${message.id}/vote`,{as:'operator',method:'PUT',body:{}})).status,200);
    assert.equal((await request('/rooms/1/messages')).data.items[0].votes,1);
    assert.equal((await request(`/messages/${message.id}/vote`,{as:'alice',method:'PUT',body:{}})).status,400);
    await request(`/messages/${message.id}`,{as:'inspector',method:'DELETE'});assert.equal((await request('/rooms/1/messages')).data.items.length,0);
  });
  await t.test('only administrators publish source-linked advisories and valid caps',async()=>{
    const body={title:'Supply update',body:'Verified supply information for consumers.',sourceUrl:'https://example.test/directive'};
    assert.equal((await request('/advisories',{as:'alice',method:'POST',body})).status,403);
    assert.equal((await request('/advisories',{as:'admin',method:'POST',body:{...body,sourceUrl:'javascript:alert(1)'}})).status,400);
    assert.equal((await request('/advisories',{as:'admin',method:'POST',body})).status,201);
    assert.equal((await request('/caps')).data.items.length,0);
    const input={district:'Kampala',fuel:'petrol',price:6000,sourceUrl:'https://example.test/directive',effectiveFrom:new Date(Date.now()-3600000).toISOString(),effectiveUntil:new Date(Date.now()+86400000).toISOString()};
    assert.equal((await request('/admin/caps',{as:'admin',method:'PUT',body:input})).status,200);
    assert.equal((await request('/caps')).data.items.length,1);
  });
  await t.test('audit is append-only and publication rollback leaves no partial data',async()=>{
    await assert.rejects(db.query("UPDATE audit_log SET action='tampered'"),/append-only/);
    await assert.rejects(db.query('DELETE FROM audit_log'),/append-only/);
    await assert.rejects(db.query('TRUNCATE audit_log'),/append-only/);
    const before=(await db.query('SELECT count(*)::int AS n FROM price_history')).rows[0].n;
    await assert.rejects(transaction(db,async client=>{await client.query("INSERT INTO price_history(station_id,fuel,price,source) VALUES (1,'petrol',5100,'operator')");throw new Error('forced failure');}),/forced failure/);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM price_history')).rows[0].n,before);
    await assert.rejects(transaction(db,async client=>{
      await client.query('SET LOCAL ROLE mafuta_app');await client.query("UPDATE audit_log SET action='tamper'");
    }),/permission denied/);
    await assert.rejects(transaction(db,async client=>{
      await client.query('SET LOCAL ROLE mafuta_app');await client.query("UPDATE schema_migrations SET checksum='tamper'");
    }),/permission denied/);
    await transaction(db,async client=>{
      await client.query('SET LOCAL ROLE mafuta_app');await client.query('SELECT * FROM audit_log LIMIT 1');
    });
  });
  await t.test('query validation, SQL injection input, trip estimates and real aggregates',async()=>{
    assert.equal((await request('/stations?lat=0.31')).status,400);
    assert.equal((await request('/stations?limit=100000')).status,400);
    assert.equal((await request(`/stations?q=${encodeURIComponent("';DROP TABLE users;--")}`)).status,200);
    assert.equal((await request('/stations?lat=0.31&lng=32.58&radius=3')).data.items.length,1);
    const trip=await request('/trip',{method:'POST',body:{distanceKm:100,kmPerLitre:10,fuel:'diesel'}});assert.equal(trip.data.cost,52000);assert.equal(trip.data.method,'manual distance estimate');
    const dashboard=await request('/admin/dashboard',{as:'analyst'});assert.ok(dashboard.data.reports>0);assert.ok(dashboard.data.average_response_hours!==undefined);
  });
  await t.test('directory administration, assignment revocation, evidence quotas and server SLA state',async()=>{
    const room=await request('/admin/rooms',{as:'admin',method:'POST',body:{name:'Western test corridor'}});assert.equal(room.status,201);
    assert.equal((await request('/admin/rooms',{as:'operator',method:'POST',body:{name:'Unauthorized room'}})).status,403);
    assert.equal((await request('/admin/stations/2',{as:'admin',method:'PATCH',body:{active:false,reason:'Temporarily closed for maintenance.'}})).status,200);
    assert.equal((await request('/stations/2')).status,404);
    assert.ok((await request('/admin/stations',{as:'admin'})).data.items.some(s=>s.id===2&&!s.active));
    assert.equal((await request('/admin/stations/2',{as:'admin',method:'PATCH',body:{active:true,reason:'Maintenance complete, reopened.'}})).status,200);
    assert.equal((await request(`/admin/stations/2/staff/${users.bob.id}`,{as:'admin',method:'DELETE'})).status,204);
    assert.equal((await request('/stations/2/prices',{as:'bob',method:'PUT',body:{fuel:'petrol',price:5500}})).status,403);
    for(let n=0;n<2;n++)assert.equal((await request(`/tickets/${ticket.id}/attachments`,{as:'alice',method:'POST',headers:{'content-type':'application/pdf','x-file-name':`receipt-${n}.pdf`},raw:Buffer.from('%PDF-1.7\nEvidence\n%%EOF')})).status,201);
    assert.equal((await request(`/tickets/${ticket.id}/attachments`,{as:'alice',method:'POST',headers:{'content-type':'application/pdf','x-file-name':'fourth.pdf'},raw:Buffer.from('%PDF-1.7\nFourth\n%%EOF')})).status,400);
    await db.query("UPDATE tickets SET due_at=now()-interval '1 hour' WHERE id=$1",[ticket.id]);
    assert.equal((await request('/tickets',{as:'inspector'})).data.items.find(t=>t.id===ticket.id).overdue,true);
  });
  await t.test('password changes revoke sessions and logout invalidates cookies',async()=>{
    const result=await request('/auth/password',{as:'alice',method:'POST',body:{currentPassword:testPassword,newPassword:'New-test-password-2026!'}});assert.equal(result.status,204);
    assert.equal((await request('/me/reports',{as:'alice'})).status,401);
    assert.equal((await request('/auth/logout',{as:'inspector',method:'POST',body:{}})).status,204);
    assert.equal((await request('/admin/reports',{as:'inspector'})).status,401);
  });
});
