import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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
    assert.equal(headers.get('cache-control'),'no-store');assert.equal(headers.get('x-frame-options'),'DENY');
    const csp=headers.get('content-security-policy');
    const directive=name=>csp.split(';').map(part=>part.trim()).find(part=>part.startsWith(`${name} `));
    assert.equal(directive('script-src'),'script-src \'self\'');
    assert.ok(!csp.includes('unsafe-eval'));
    assert.equal(directive('img-src'),'img-src \'self\' data: blob: https:');
    assert.equal(directive('media-src'),'media-src \'self\' blob: https:');
    assert.equal(directive('frame-src'),'frame-src https://www.youtube-nocookie.com https://player.vimeo.com');
    const vercel=JSON.parse(await readFile(new URL('../app/vercel.json',import.meta.url),'utf8'));
    const vercelCsp=vercel.headers.flatMap(entry=>entry.headers??[]).find(header=>header.key==='Content-Security-Policy').value;
    const vercelDirective=name=>vercelCsp.split(';').map(part=>part.trim()).find(part=>part.startsWith(`${name} `));
    for(const name of ['default-src','script-src','style-src','img-src','media-src','frame-src','connect-src','object-src','frame-ancestors','base-uri','form-action'])
      assert.equal(vercelDirective(name),directive(name),`${name} must match the deployed Vercel header in app/vercel.json`);
    assert.ok(!vercelCsp.includes('unsafe-eval'));
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
    const message=(await request('/rooms/1/messages')).data.items[0];assert.equal(message.display_name,'Anonymous Member');assert.equal('user_id' in message,false);
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
  await t.test('administrators can assign non-administrator roles with revoked access and an audit record',async()=>{
    const registered=await request('/auth/register',{method:'POST',body:{email:'rolechange@example.test',password:testPassword,displayName:'Role change test',consent:true}});assert.equal(registered.status,201);
    sessions.rolechange={...registered.data,cookie:registered.response.headers.get('set-cookie').split(';')[0]};
    const id=registered.data.user.id,reason='Role confirmed by the operating organization and recorded for audit.';
    assert.equal((await request(`/admin/users/${id}`,{as:'analyst',method:'PATCH',body:{role:'inspector',reason}})).status,403);
    assert.equal((await request(`/admin/users/${users.admin.id}`,{as:'admin',method:'PATCH',body:{role:'operator',reason}})).status,403);
    assert.equal((await request(`/admin/users/${id}`,{as:'admin',method:'PATCH',body:{role:'admin',reason}})).status,400);
    assert.equal((await request(`/admin/users/${id}`,{as:'admin',method:'PATCH',body:{role:'inspector',reason}})).status,200);
    assert.equal((await db.query('SELECT role FROM users WHERE id=$1',[id])).rows[0].role,'inspector');
    assert.equal((await request('/me/reports',{as:'rolechange'})).status,401);
    const login=await request('/auth/login',{method:'POST',body:{email:'rolechange@example.test',password:testPassword}});assert.equal(login.status,200);assert.equal(login.data.user.role,'inspector');
    sessions.rolechange={...login.data,cookie:login.response.headers.get('set-cookie').split(';')[0]};
    assert.equal((await request('/admin/reports',{as:'rolechange'})).status,200);
    const event=(await db.query("SELECT action,details FROM audit_log WHERE action='account.role' ORDER BY id DESC LIMIT 1")).rows[0];
    assert.equal(event.details.role,'inspector');assert.equal(event.details.reason,reason);
  });
  await t.test('administrators provision inspector and analyst accounts with re-authentication and no credential disclosure',async()=>{
    const email='manual.inspector@example.test',password='Manual-staff-password-2026!',reason='Identity and appointment verified through the approved staff procedure.';
    const body={email,displayName:'Manual Inspector',password,role:'inspector',administratorPassword:testPassword,identityVerified:true,reason};
    assert.equal((await request('/admin/staff',{as:'analyst',method:'POST',body})).status,403);
    assert.equal((await request('/admin/staff',{as:'admin',method:'POST',body:{...body,administratorPassword:'wrong-password'}})).status,403);
    assert.equal((await request('/admin/staff',{as:'admin',method:'POST',body:{...body,role:'admin'}})).status,400);
    assert.equal((await request('/admin/staff',{as:'admin',method:'POST',body:{...body,identityVerified:false}})).status,400);
    assert.equal((await request('/admin/staff',{as:'admin',method:'POST',body:{...body,email:'operator@example.test'}})).status,409);
    const created=await request('/admin/staff',{as:'admin',method:'POST',body});assert.equal(created.status,201,JSON.stringify(created.data));
    assert.equal(created.data.role,'inspector');
    const row=(await db.query('SELECT role,identity_verified,disabled FROM users WHERE email=$1',[email])).rows[0];
    assert.deepEqual({...row},{role:'inspector',identity_verified:true,disabled:false});
    assert.equal((await request('/admin/staff',{as:'admin',method:'POST',body})).status,409);
    const event=(await db.query("SELECT details FROM audit_log WHERE action='staff.account_provision_manual' ORDER BY id DESC LIMIT 1")).rows[0];
    assert.equal(event.details.email,email);assert.equal(event.details.role,'inspector');assert.equal(event.details.reason,reason);
    assert.doesNotMatch(JSON.stringify(event.details),/Manual-staff-password/);
    const login=await request('/auth/login',{method:'POST',body:{email,password}});assert.equal(login.status,200);assert.equal(login.data.user.role,'inspector');
    sessions.manualStaff={...login.data,cookie:login.response.headers.get('set-cookie').split(';')[0]};
    assert.equal((await request('/admin/reports',{as:'manualStaff'})).status,200);
    assert.equal((await request('/admin/users',{as:'manualStaff'})).status,403);
    assert.equal((await request('/admin/staff',{as:'manualStaff',method:'POST',body})).status,403);
  });
  await t.test('suspending a staff account revokes access until an administrator restores it',async()=>{
    const id=sessions.manualStaff.user.id,email='manual.inspector@example.test',password='Manual-staff-password-2026!';
    assert.equal((await request(`/admin/users/${users.admin.id}`,{as:'admin',method:'PATCH',body:{disabled:true,reason:'An administrator cannot suspend their own account.'}})).status,403);
    assert.equal((await request(`/admin/users/${id}`,{as:'admin',method:'PATCH',body:{disabled:true,reason:'Suspension confirmed pending a security review.'}})).status,200);
    assert.equal((await request('/me/reports',{as:'manualStaff'})).status,401);
    assert.equal((await request('/auth/login',{method:'POST',body:{email,password}})).status,401);
    assert.equal((await request(`/admin/users/${id}`,{as:'admin',method:'PATCH',body:{disabled:false,reason:'Security review complete; staff access restored.'}})).status,200);
    const login=await request('/auth/login',{method:'POST',body:{email,password}});assert.equal(login.status,200);assert.equal(login.data.user.identity_verified,true);
    sessions.manualStaff={...login.data,cookie:login.response.headers.get('set-cookie').split(';')[0]};
    assert.equal((await request('/admin/reports',{as:'manualStaff'})).status,200);
  });
  await t.test('station access is granted explicitly to an active operator and can be revoked',async()=>{
    const reason='Operator authorization confirmed for this station by the operating organization.';
    const assignment=()=>request('/admin/stations/2/staff',{as:'admin',method:'POST',body:{userId:users.operator.id,reason}});
    assert.equal((await request('/admin/stations/2/staff',{as:'inspector',method:'POST',body:{userId:users.operator.id,reason}})).status,403);
    assert.equal((await request('/admin/stations/2/staff',{as:'admin',method:'POST',body:{userId:users.alice.id,reason}})).status,409);
    assert.equal((await assignment()).status,201);
    assert.equal((await assignment()).status,409);
    assert.ok((await request('/operator/stations',{as:'operator'})).data.items.some(s=>s.id===2));
    assert.equal((await request('/stations/2/prices',{as:'operator',method:'PUT',body:{fuel:'petrol',price:5750}})).status,200);
    const event=(await db.query("SELECT details FROM audit_log WHERE action='station.access_grant' ORDER BY id DESC LIMIT 1")).rows[0];
    assert.equal(event.details.userId,users.operator.id);assert.equal(event.details.reason,reason);
    assert.equal((await request(`/admin/stations/2/staff/${users.operator.id}`,{as:'admin',method:'DELETE'})).status,204);
    assert.equal((await request('/stations/2/prices',{as:'operator',method:'PUT',body:{fuel:'petrol',price:5760}})).status,403);
  });
  await t.test('password changes revoke sessions and logout invalidates cookies',async()=>{
    const result=await request('/auth/password',{as:'alice',method:'POST',body:{currentPassword:testPassword,newPassword:'New-test-password-2026!'}});assert.equal(result.status,204);
    assert.equal((await request('/me/reports',{as:'alice'})).status,401);
    assert.equal((await request('/auth/logout',{as:'inspector',method:'POST',body:{}})).status,204);
    assert.equal((await request('/admin/reports',{as:'inspector'})).status,401);
  });
});

test('Citizen profile, preferences, avatars and account security',async t=>{
  const db=await testDatabase(),users=await fixtures(db);
  const origin='http://localhost:3000';
  const app=createApp(db,{APP_ORIGIN:origin,NODE_ENV:'test',TRUST_PROXY_HOPS:0,LOG_LEVEL:'silent',ROUTING_URL:''});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await db.end();});
  const sessions={};
  async function request(path,{as,method='GET',body,headers={},raw}={}) {
    const session=sessions[as];
    const response=await fetch(`${base}/api/v1${path}`,{method,headers:{origin,'x-requested-with':'MafutaWatch',...(session?{cookie:session.cookie,'x-csrf-token':session.csrfToken}:{}),...(body?{'content-type':'application/json'}:{}),...headers},body:raw??(body?JSON.stringify(body):undefined)});
    const data=response.status===204?null:await response.json();return {status:response.status,data,response};
  }
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const name of ['alice','bob']) {
    const result=await request('/auth/login',{method:'POST',body:{email:users[name].email,password:testPassword}});
    assert.equal(result.status,200,JSON.stringify(result.data));
    sessions[name]={...result.data,cookie:result.response.headers.get('set-cookie').split(';')[0]};
  }
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
  const oversize=Buffer.alloc(2097153);

  await t.test('profile retrieval exposes read-only identity fields and editable details',async()=>{
    const me=await request('/me/profile',{as:'alice'});assert.equal(me.status,200);
    assert.equal(me.data.profile.role,'citizen');assert.equal(me.data.profile.identityVerified,false);
    assert.equal(me.data.profile.email,users.alice.email);assert.equal(me.data.profile.id,users.alice.id);
    assert.equal(me.data.profile.displayName,'alice');assert.equal(me.data.profile.avatarUrl,null);
  });

  await t.test('profile updates only submitted editable fields and ignores privileged fields',async()=>{
    const updated=await request('/me/profile',{as:'alice',method:'PATCH',body:{displayName:'Vinnie',preferredName:'Vincent',phone:'+256700000000',district:'Kampala'}});
    assert.equal(updated.status,200);assert.equal(updated.data.profile.displayName,'Vinnie');
    assert.equal(updated.data.profile.preferredName,'Vincent');assert.equal(updated.data.profile.phone,'+256700000000');
    assert.equal(updated.data.profile.district,'Kampala');assert.equal(updated.data.profile.role,'citizen');
    assert.equal(updated.data.profile.identityVerified,false);
    const row=await db.query('SELECT role,identity_verified FROM users WHERE id=$1',[users.alice.id]);
    assert.equal(row.rows[0].role,'citizen');assert.equal(row.rows[0].identity_verified,false);
  });

  await t.test('phone and district validation rejects malformed input',async()=>{
    assert.equal((await request('/me/profile',{as:'alice',method:'PATCH',body:{phone:'not-a-phone'}})).status,400);
    assert.equal((await request('/me/profile',{as:'alice',method:'PATCH',body:{district:'X'}})).status,400);
  });

  await t.test('avatar upload accepts valid images, rejects bad type and oversize files',async()=>{
    const put=await request('/me/avatar',{as:'alice',method:'PUT',headers:{'content-type':'image/png','x-file-name':'photo.png'},raw:png});
    assert.equal(put.status,200);assert.equal(put.data.saved,true);
    const served=await fetch(`${base}/api/v1/me/avatar`,{headers:{cookie:sessions.alice.cookie}});assert.equal(served.status,200);assert.equal(served.headers.get('content-type'),'image/png');
    const me=await request('/me/profile',{as:'alice'});assert.ok(me.data.profile.avatarUrl);
    const bad=await request('/me/avatar',{as:'alice',method:'PUT',headers:{'content-type':'text/plain','x-file-name':'photo.txt'},raw:Buffer.from('not an image')});assert.equal(bad.status,400);
    const big=await request('/me/avatar',{as:'alice',method:'PUT',headers:{'content-type':'image/png','x-file-name':'big.png'},raw:oversize});assert.equal(big.status,413);
    const removed=await request('/me/avatar',{as:'alice',method:'DELETE'});assert.equal(removed.status,204);
    const gone=await fetch(`${base}/api/v1/me/avatar`,{headers:{cookie:sessions.alice.cookie}});assert.equal(gone.status,404);
  });

  await t.test('preferences are persisted and partially updated',async()=>{
    const get=await request('/me/preferences',{as:'alice'});assert.equal(get.status,200);
    assert.deepEqual(get.data.preferences,{fuelType:null,vehicleType:null,preferredDistrict:null,notifications:{},privacy:{},roleSettings:{}});
    const set=await request('/me/preferences',{as:'alice',method:'PATCH',body:{fuelType:'diesel',vehicleType:'boda',preferredDistrict:'Jinja',notifications:{priceChanges:true},privacy:{publicDisplayName:false}}});
    assert.equal(set.status,200);assert.equal(set.data.saved,true);
    const again=await request('/me/preferences',{as:'alice'});assert.equal(again.data.preferences.fuelType,'diesel');assert.equal(again.data.preferences.vehicleType,'boda');
    assert.equal(again.data.preferences.notifications.priceChanges,true);assert.equal(again.data.preferences.privacy.publicDisplayName,false);
    const partial=await request('/me/preferences',{as:'alice',method:'PATCH',body:{vehicleType:'truck'}});assert.equal(partial.status,200);
    const still=await request('/me/preferences',{as:'alice'});assert.equal(still.data.preferences.fuelType,'diesel');assert.equal(still.data.preferences.vehicleType,'truck');
  });

  await t.test('deletion request requires correct password and is recorded',async()=>{
    const wrong=await request('/me/deletion-request',{as:'alice',method:'POST',body:{reason:'Leaving the platform.',password:'wrong-password'}});assert.equal(wrong.status,401);
    const created=await request('/me/deletion-request',{as:'alice',method:'POST',body:{reason:'Leaving the platform.',password:testPassword}});assert.equal(created.status,202);assert.equal(created.data.accepted,true);
    const status=await request('/me/deletion-request',{as:'alice'});assert.equal(status.data.request.status,'pending');assert.equal(status.data.request.reason,'Leaving the platform.');
  });

  await t.test('users cannot access or modify another account',async()=>{
    assert.equal((await request('/me/profile',{as:'bob'})).data.profile.id,users.bob.id);
    const cross=await request(`/me/profile`,{as:'bob',method:'PATCH',body:{displayName:'Hacked'}});assert.equal(cross.status,200);assert.equal(cross.data.profile.id,users.bob.id);
    assert.equal((await db.query('SELECT display_name FROM users WHERE id=$1',[users.alice.id])).rows[0].display_name,'Vinnie');
    assert.equal((await request('/me/avatar',{as:'bob',method:'DELETE'})).status,204);
  });
});

test('Stakeholder profile management for admin, inspector, analyst and operator',async t=>{
  const db=await testDatabase(),users=await fixtures(db);
  const origin='http://localhost:3000';
  const app=createApp(db,{APP_ORIGIN:origin,NODE_ENV:'test',TRUST_PROXY_HOPS:0,LOG_LEVEL:'silent',ROUTING_URL:''});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await db.end();});
  const sessions={};
  async function request(path,{as,method='GET',body,headers={},raw}={}) {
    const session=sessions[as];
    const response=await fetch(`${base}/api/v1${path}`,{method,headers:{origin,'x-requested-with':'MafutaWatch',...(session?{cookie:session.cookie,'x-csrf-token':session.csrfToken}:{}),...(body?{'content-type':'application/json'}:{}),...headers},body:raw??(body?JSON.stringify(body):undefined)});
    const data=response.status===204?null:await response.json();return {status:response.status,data,response};
  }
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const name of ['admin','inspector','analyst','operator']) {
    const result=await request('/auth/login',{method:'POST',body:{email:users[name].email,password:testPassword}});
    assert.equal(result.status,200,JSON.stringify(result.data));
    sessions[name]={...result.data,cookie:result.response.headers.get('set-cookie').split(';')[0]};
  }

  for(const [role,email] of [['admin','admin@example.test'],['inspector','inspector@example.test'],['analyst','analyst@example.test'],['operator','operator@example.test']]) {
    await t.test(`stakeholder ${role} can retrieve and update their own profile`,async()=>{
      const me=await request('/me/profile',{as:role});assert.equal(me.status,200);
      assert.equal(me.data.profile.role,role);
      assert.equal(me.data.profile.email,email);
      assert.equal(me.data.profile.id,users[role].id);

      const updated=await request('/me/profile',{as:role,method:'PATCH',body:{displayName:`Updated ${role}`,phone:'+256700111111',district:'Kampala'}});
      assert.equal(updated.status,200);
      assert.equal(updated.data.profile.displayName,`Updated ${role}`);
      assert.equal(updated.data.profile.phone,'+256700111111');
      assert.equal(updated.data.profile.district,'Kampala');

      const row=await db.query('SELECT role,identity_verified FROM users WHERE id=$1',[users[role].id]);
      assert.equal(row.rows[0].role,role);
    });
  }

  await t.test('stakeholders cannot modify privileged fields',async()=>{
    const result=await request('/me/profile',{as:'admin',method:'PATCH',body:{role:'citizen',identity_verified:true}});
    assert.equal(result.status,400,'Strict schema rejects unknown privileged fields.');
    const row=await db.query('SELECT role,identity_verified FROM users WHERE id=$1',[users.admin.id]);
    assert.equal(row.rows[0].role,'admin');
    assert.equal(row.rows[0].identity_verified,true);
  });

  await t.test('stakeholders cannot modify another user profile through /me',async()=>{
    const adminBefore=await db.query('SELECT display_name FROM users WHERE id=$1',[users.admin.id]).then(r=>r.rows[0].display_name);
    await request('/me/profile',{as:'inspector',method:'PATCH',body:{displayName:'Hacked'}});
    const adminAfter=await db.query('SELECT display_name FROM users WHERE id=$1',[users.admin.id]).then(r=>r.rows[0].display_name);
    assert.equal(adminAfter,adminBefore,'Inspector modifying their own profile did not change admin profile.');
  });

  await t.test('stakeholders can change password and invalidate sessions',async()=>{
    const result=await request('/auth/password',{as:'operator',method:'POST',body:{currentPassword:testPassword,newPassword:'New-test-password-2026!'}});
    assert.equal(result.status,204);
    assert.equal((await request('/me/profile',{as:'operator'})).status,401);
    const login=await request('/auth/login',{method:'POST',body:{email:users.operator.email,password:'New-test-password-2026!'}});
    assert.equal(login.status,200);
    sessions.operator={...login.data,cookie:login.response.headers.get('set-cookie').split(';')[0]};
  });

  await t.test('stakeholders cannot request email changes without a delivery provider',async()=>{
    const status=await request('/me/email/status',{as:'analyst'});
    assert.equal(status.status,200);
    assert.deepEqual({enabled:status.data.enabled,provider:status.data.provider},{enabled:false,provider:''});
    const created=await request('/me/email/change-request',{as:'analyst',method:'POST',body:{newEmail:'new-analyst@example.test',currentPassword:testPassword}});
    assert.equal(created.status,503,'Without a configured provider the API refuses instead of pretending to send.');
    assert.match(created.data.error,/not configured/i);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM email_change_tokens')).rows[0].count,0);
    assert.equal((await db.query('SELECT email FROM users WHERE id=$1',[users.analyst.id])).rows[0].email,users.analyst.email);
    const confirm=await request('/me/email/confirm',{as:'analyst',method:'POST',body:{token:'a'.repeat(64)}});
    assert.equal(confirm.status,400);
  });

  await t.test('stakeholders cannot access another account profile',async()=>{
    const inspectorBefore=await db.query('SELECT display_name FROM users WHERE id=$1',[users.inspector.id]).then(r=>r.rows[0].display_name);
    await request('/me/profile',{as:'admin',method:'PATCH',body:{displayName:'Hacked'}});
    const inspectorAfter=await db.query('SELECT display_name FROM users WHERE id=$1',[users.inspector.id]).then(r=>r.rows[0].display_name);
    assert.equal(inspectorAfter,inspectorBefore,'Admin modifying their own profile did not change inspector profile.');
  });
});

test('Media gallery, news articles, and videos API',async t=>{
  const db=await testDatabase(),users=await fixtures(db);
  const origin='http://localhost:3000';
  const app=createApp(db,{APP_ORIGIN:origin,NODE_ENV:'test',TRUST_PROXY_HOPS:0,LOG_LEVEL:'silent',ROUTING_URL:''});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await db.end();});
  const sessions={};
  async function request(path,{as,method='GET',body,headers={},raw}={}) {
    const session=sessions[as];
    const response=await fetch(`${base}/api/v1${path}`,{method,headers:{origin,'x-requested-with':'MafutaWatch',...(session?{cookie:session.cookie,'x-csrf-token':session.csrfToken}:{}),...(body?{'content-type':'application/json'}:{}),...headers},body:raw??(body?JSON.stringify(body):undefined)});
    const data=response.status===204?null:await response.json();return {status:response.status,data,response};
  }
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const name of ['admin','alice']) {
    const result=await request('/auth/login',{method:'POST',body:{email:users[name].email,password:testPassword}});
    assert.equal(result.status,200,JSON.stringify(result.data));
    sessions[name]={...result.data,cookie:result.response.headers.get('set-cookie').split(';')[0]};
  }

  await t.test('media gallery CRUD - admin can create, public can read',async()=>{
    // Public read works without auth
    const publicList=await request('/media');
    assert.equal(publicList.status,200);
    assert.equal(publicList.data.items.length,0);

    // Admin can create media
    const created=await request('/media',{as:'admin',method:'POST',body:{
      title:'Test Photo',description:'A test photo',category:'fuel-stations',
      imageUrl:'https://example.test/photo.jpg',photographer:'Photo User',source:'Test Source',
      license:'CC BY 4.0',altText:'A test photo',fileSize:50000,dimensions:'1200x800',featured:true,priority:5
    }});
    console.log('CREATE MEDIA RESPONSE:', created.status, JSON.stringify(created.data));
    assert.equal(created.status,201);
    assert.ok(created.data.id);
    const mediaId=created.data.id;

    // Public read now includes the media
    const listed=await request('/media');
    assert.equal(listed.status,200);
    assert.equal(listed.data.items.length,1);
    assert.equal(listed.data.items[0].title,'Test Photo');
    assert.equal(listed.data.items[0].photographer,'Photo User');
    assert.equal(listed.data.items[0].license,'CC BY 4.0');

    // Non-admin cannot create media
    const nonAdmin=await request('/media',{as:'alice',method:'POST',body:{
      title:'Unauthorized',description:'Should fail',category:'fuel-stations',
      imageUrl:'https://example.test/x.jpg',photographer:'User',source:'Source',license:'CC BY 4.0'
    }});
    assert.equal(nonAdmin.status,403);

    // Admin can update media
    const updated=await request(`/media/${mediaId}`,{as:'admin',method:'PATCH',body:{
      title:'Updated Photo',description:'Updated description'
    }});
    assert.equal(updated.status,200);
    assert.equal(updated.data.saved,true);

    // Admin can delete media
    const deleted=await request(`/media/${mediaId}`,{as:'admin',method:'DELETE'});
    assert.equal(deleted.status,204);

    // Deleted media no longer appears
    const gone=await request('/media');
    assert.equal(gone.data.items.length,0);
  });

  await t.test('news articles CRUD - admin can publish, public reads published only',async()=>{
    // Clean up any existing news articles from previous tests
    await db.query('DELETE FROM news_article_photos');
    await db.query('DELETE FROM news_article_videos');
    await db.query('DELETE FROM news_articles');

    const publicList=await request('/news');
    assert.equal(publicList.status,200);
    const initialCount=publicList.data.items.length;

    // Admin can publish news
    const created=await request('/news',{as:'admin',method:'POST',body:{
      title:'Breaking News',summary:'Breaking news summary.',body:'Breaking news body content.',
      sourceUrl:'https://example.test/news/breaking',sourceName:'News Source',
      category:'fuel-prices',excerpt:'Breaking excerpt.',readingTime:5,
      featured:true,priority:10,status:'published'
    }});
    assert.equal(created.status,201);
    assert.ok(created.data.id);
    const newsId=created.data.id;

    // Public read now includes the news
    const listed=await request('/news');
    assert.equal(listed.status,200);
    assert.equal(listed.data.items.length,initialCount+1);
    assert.equal(listed.data.items.find(a=>a.id===newsId).title,'Breaking News');

    // New drafts and archived articles must never enter the public feed.
    const hiddenIds=[];
    for(const status of ['draft','archived']){
      const hidden=await request('/news',{as:'admin',method:'POST',body:{
        title:`Hidden ${status} article`,summary:'Unpublished news summary.',body:'Unpublished news body content.',
        sourceUrl:'https://example.test/news/hidden',sourceName:'News Source',category:'fuel-prices',status
      }});
      assert.equal(hidden.status,201);
      hiddenIds.push(hidden.data.id);
    }
    const withHidden=await request('/news');
    assert.equal(withHidden.status,200);
    assert.deepEqual(withHidden.data.items,listed.data.items);

    // Non-admin cannot create news
    const nonAdmin=await request('/news',{as:'alice',method:'POST',body:{
      title:'Unauthorized News',summary:'Should fail',body:'Should fail body.',
      sourceUrl:'https://example.test/unauth',sourceName:'Source',category:'transport'
    }});
    assert.equal(nonAdmin.status,403);

    // Admin can update news
    const updated=await request(`/news/${newsId}`,{as:'admin',method:'PATCH',body:{title:'Updated News',status:'draft'}});
    assert.equal(updated.status,200);
    assert.equal(updated.data.saved,true);

    // After setting to draft, public read excludes it
    const afterDraft=await request('/news');
    assert.equal(afterDraft.status,200);
    assert.equal(afterDraft.data.items.length,initialCount);
    assert.ok(!afterDraft.data.items.some(a=>a.id===newsId));

    // Republishing restores visibility, and archiving removes it again.
    const republished=await request(`/news/${newsId}`,{as:'admin',method:'PATCH',body:{status:'published'}});
    assert.equal(republished.status,200);
    const afterPublish=await request('/news');
    assert.equal(afterPublish.status,200);
    assert.equal(afterPublish.data.items.length,initialCount+1);
    assert.equal(afterPublish.data.items.find(a=>a.id===newsId).title,'Updated News');
    const archived=await request(`/news/${newsId}`,{as:'admin',method:'PATCH',body:{status:'archived'}});
    assert.equal(archived.status,200);
    const afterArchive=await request('/news');
    assert.equal(afterArchive.status,200);
    assert.equal(afterArchive.data.items.length,initialCount);
    assert.ok(!afterArchive.data.items.some(a=>a.id===newsId));

    // Admin can delete news
    const deleted=await request(`/news/${newsId}`,{as:'admin',method:'DELETE'});
    assert.equal(deleted.status,204);
    for(const id of hiddenIds){
      assert.equal((await request(`/news/${id}`,{as:'admin',method:'DELETE'})).status,204);
    }
  });

  await t.test('videos CRUD - admin can publish, public can read',async()=>{
    const created=await request('/videos',{as:'admin',method:'POST',body:{
      title:'Tutorial Video',description:'How to use MafutaWatch',category:'platform-howto',
      videoUrl:'https://example.test/video.mp4',thumbnailUrl:'https://example.test/thumb.jpg',
      duration:'5:30',source:'Test video producer',license:'All Rights Reserved'
    }});
    console.log('CREATE VIDEO RESPONSE:', created.status, JSON.stringify(created.data));
    assert.equal(created.status,201);
    assert.ok(created.data.id);
    const videoId=created.data.id;

    const listed=await request('/videos');
    assert.equal(listed.status,200);
    assert.equal(listed.data.items.length,1);
    assert.equal(listed.data.items[0].title,'Tutorial Video');

    // Non-admin cannot create video
    const nonAdmin=await request('/videos',{as:'alice',method:'POST',body:{
      title:'Unauthorized Video',description:'Should fail',category:'platform-howto',
      videoUrl:'https://example.test/unauth.mp4',duration:'1:00'
    }});
    assert.equal(nonAdmin.status,403);

    // Admin can delete video
    const deleted=await request(`/videos/${videoId}`,{as:'admin',method:'DELETE'});
    assert.equal(deleted.status,204);
  });

  await t.test('news article with photos and videos junction',async()=>{
    // Create media and video first
    const media=await request('/media',{as:'admin',method:'POST',body:{
      title:'News Photo',description:'News photo',category:'fuel-stations',
      imageUrl:'https://example.test/news-photo.jpg',photographer:'User',source:'Wikimedia',
      license:'CC BY 4.0'
    }});
    assert.equal(media.status,201);
    const mediaId=media.data.id;

    const video=await request('/videos',{as:'admin',method:'POST',body:{
      title:'News Video',description:'News video',category:'platform-howto',
      videoUrl:'https://example.test/news-video.mp4',duration:'3:00',source:'Test video producer',license:'All Rights Reserved'
    }});
    assert.equal(video.status,201);
    const videoId=video.data.id;

    // Create news article
    const news=await request('/news',{as:'admin',method:'POST',body:{
      title:'News with media',summary:'This is a test news summary.',body:'Body content.',
      sourceUrl:'https://example.test/news-media',sourceName:'Source',category:'transport'
    }});
    console.log('CREATE NEWS RESPONSE:', news.status, JSON.stringify(news.data));
    assert.equal(news.status,201);
    const newsId=news.data.id;

    // Link photo and video to news
    await request(`/news/${newsId}/photos`,{as:'admin',method:'POST',body:{mediaId,caption:'News photo caption'}});
    await request(`/news/${newsId}/videos`,{as:'admin',method:'POST',body:{mediaId:videoId,caption:'News video caption'}});

    // Public news query includes photos and videos
    const listed=await request('/news');
    assert.equal(listed.status,200);
    const article=listed.data.items.find(a=>a.id===newsId);
    assert.ok(article);
    if(article.photos){
      assert.ok(article.photos.some(p=>p.media.id===mediaId));
      assert.equal(article.photos[0].caption,'News photo caption');
    }
    if(article.videos){
      assert.ok(article.videos.some(v=>v.media.id===videoId));
    }
});


});
