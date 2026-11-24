import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/app.js';
import {migrate,transaction} from '../server/db.js';
import {fixtures,testDatabase,testPassword} from './database.js';

test('Verified new-station onboarding preserves private proposals and atomic access decisions',async t=>{
  const db=await testDatabase(),users=await fixtures(db),sessions={};
  let failApprovalAudit=false;
  const guarded={query:db.query.bind(db),async connect(){
    const client=await db.connect();return {release:()=>client.release(),async query(sql,params){
      if(failApprovalAudit&&params?.[1]==='station-request.approve'){failApprovalAudit=false;throw new Error('injected audit failure');}
      return client.query(sql,params);
    }};
  }};
  const origin='http://localhost:3000';
  const server=createApp(guarded,{APP_ORIGIN:origin,NODE_ENV:'test',TRUST_PROXY_HOPS:0,LOG_LEVEL:'silent',ROUTING_URL:''}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await db.end();});
  const base=`http://127.0.0.1:${server.address().port}`;
  async function request(path,{as,method='GET',body,headers={},raw}={}){
    const session=sessions[as];
    const response=await fetch(`${base}/api/v1${path}`,{method,headers:{origin,'x-requested-with':'MafutaWatch',...(session?{cookie:session.cookie,'x-csrf-token':session.csrfToken}:{}),...(body?{'content-type':'application/json'}:{}),...headers},body:raw??(body?JSON.stringify(body):undefined)});
    return {status:response.status,data:response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text(),response};
  }
  async function login(name,slot=name){const r=await request('/auth/login',{method:'POST',body:{email:users[name].email,password:testPassword}});assert.equal(r.status,200);sessions[slot]={...r.data,cookie:r.response.headers.get('set-cookie').split(';')[0]};}
  for(const name of Object.keys(users))await login(name);
  const proposal={stationName:'Verified Lira Forecourt',operatorName:'New Lira Energy',district:'Lira',area:'Lira town',region:'Northern',latitude:2.24,longitude:32.9,contactName:'Station applicant',contactPhone:'+256700000000',contactEmail:'applicant@example.test',licenseReference:'LIC-LIRA-001'};
  const submit=(as,body=proposal,key=randomUUID())=>request('/station-requests',{as,method:'POST',headers:{'idempotency-key':key},body});
  const upload=(as,id)=>request(`/station-requests/${id}/attachments`,{as,method:'POST',headers:{'content-type':'application/pdf','x-file-name':'licence.pdf'},raw:Buffer.from('%PDF-1.7\nPrivate operating licence\n%%EOF')});
  const decide=(id,body={status:'approved',reason:'Licence and site authority independently verified.'},as='admin')=>request(`/admin/station-requests/${id}`,{as,method:'PATCH',body});
  const count=async table=>(await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
  let first,attachmentId;
  await t.test('migrations rerun and the runtime role can use the new request table',async()=>{
    await migrate(db);
    await transaction(db,async client=>{await client.query('SET LOCAL ROLE mafuta_app');await client.query('SELECT * FROM station_requests');});
  });
  await t.test('only citizens submit; all fields are validated and retries cannot ignore changed details',async()=>{
    assert.equal((await submit(undefined)).status,401);
    for(const role of ['operator','inspector','analyst','admin'])assert.equal((await submit(role)).status,403);
    assert.equal((await submit('alice',{...proposal,latitude:90})).status,400);
    assert.equal((await submit('alice',{...proposal,role:'operator'})).status,400);
    const key=randomUUID(),created=await submit('alice',proposal,key);assert.equal(created.status,201,JSON.stringify(created.data));first=created.data;
    assert.equal((await submit('alice',proposal,key)).data.id,first.id);
    assert.equal((await submit('alice')).data.id,first.id);
    assert.equal((await submit('alice',{...proposal,contactPhone:'+256711111111'},key)).status,409);
    assert.equal((await submit('alice',{...proposal,operatorName:'Changed brand'})).status,409);
    assert.equal(await count('station_requests'),1);
    assert.equal(await count('stations'),2);assert.equal(await count('operators'),1);
    assert.equal((await request(`/stations?q=${encodeURIComponent(proposal.stationName)}`)).data.total,0);
    assert.equal((await request('/summary')).data.stations,2);
    assert.equal((await request('/operator/stations',{as:'alice'})).status,403);
  });
  await t.test('proposals, contacts and evidence are private; missing or invalid documents never authorize approval',async()=>{
    assert.equal((await request('/station-requests')).status,401);
    assert.equal((await request('/station-requests',{as:'bob'})).data.items.length,0);
    for(const name of ['alice','inspector','analyst','operator'])assert.equal((await request('/admin/station-requests',{as:name})).status,403);
    assert.equal((await decide(first.id,undefined,'alice')).status,403);
    assert.equal((await decide(first.id)).status,400);
    assert.equal((await upload('bob',first.id)).status,404);
    assert.equal((await request(`/station-requests/${first.id}/attachments`,{as:'alice',method:'POST',headers:{'content-type':'application/json','x-file-name':'invalid.pdf'},raw:Buffer.from('{}')})).status,400);
    assert.equal((await decide(first.id)).status,400);
    const stored=await upload('alice',first.id);assert.equal(stored.status,201);attachmentId=stored.data.id;
    assert.equal((await upload('alice',first.id)).data.id,attachmentId,'A lost upload response must be safely retryable.');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM attachments WHERE station_request_id=$1',[first.id])).rows[0].n,1);
    for(const name of [undefined,'bob','inspector','analyst'])assert.equal((await request(`/attachments/${attachmentId}`,{as:name})).status,name?404:401);
    for(const name of ['alice','admin']){const file=await request(`/attachments/${attachmentId}`,{as:name});assert.equal(file.status,200);assert.match(file.response.headers.get('content-disposition'),/attachment/);assert.equal(file.response.headers.get('cache-control'),'no-store');}
  });
  await t.test('a late transaction failure rolls back brand, station, role, assignments, revocation and decision',async()=>{
    await login('alice','secondAlice');
    const before={stations:await count('stations'),operators:await count('operators'),sessions:await count('sessions'),notices:await count('notifications'),audit:await count('audit_log')};
    failApprovalAudit=true;assert.equal((await decide(first.id)).status,500);
    assert.equal(await count('stations'),before.stations);assert.equal(await count('operators'),before.operators);
    assert.equal(await count('sessions'),before.sessions);assert.equal(await count('notifications'),before.notices);assert.equal(await count('audit_log'),before.audit);
    assert.equal((await db.query('SELECT role FROM users WHERE id=$1',[users.alice.id])).rows[0].role,'citizen');
    assert.equal((await db.query('SELECT status FROM station_requests WHERE id=$1',[first.id])).rows[0].status,'pending');
    assert.equal((await db.query('SELECT * FROM station_staff WHERE user_id=$1',[users.alice.id])).rowCount,0);
  });
  let approvedStation;
  await t.test('approval commits once, revokes every old session and enables only the assigned station after login',async()=>{
    const decisions=await Promise.all([decide(first.id),decide(first.id)]);assert.deepEqual(decisions.map(r=>r.status).sort(),[200,409]);
    const row=(await db.query('SELECT * FROM station_requests WHERE id=$1',[first.id])).rows[0];approvedStation=row.station_id;
    assert.equal(row.status,'approved');assert.equal(row.reviewed_by,users.admin.id);assert.ok(row.reviewed_at);
    assert.equal(await count('stations'),3);assert.equal(await count('operators'),2);
    for(const as of ['alice','secondAlice'])assert.equal((await request(`/stations/${approvedStation}/prices`,{as,method:'PUT',body:{fuel:'petrol',price:5500}})).status,401);
    await login('alice');
    assert.deepEqual((await request('/operator/stations',{as:'alice'})).data.items.map(s=>s.id),[approvedStation]);
    assert.equal((await request(`/stations/${approvedStation}/prices`,{as:'alice',method:'PUT',body:{fuel:'petrol',price:5500}})).status,200);
    assert.equal((await request('/stations/1/prices',{as:'alice',method:'PUT',body:{fuel:'petrol',price:5500}})).status,403);
    assert.equal((await request('/tokens',{as:'alice',method:'POST',body:{stationId:1,name:'Unassigned integration'}})).status,403);
    assert.ok((await request('/me/notifications',{as:'alice'})).data.items.some(n=>/Sign in again/.test(n.message)));
    const event=(await db.query("SELECT details FROM audit_log WHERE action='station-request.approve' AND entity_id=$1",[first.id])).rows[0];
    assert.equal(event.details.stationId,approvedStation);assert.equal(event.details.reason,'Licence and site authority independently verified.');assert.equal(event.details.sessionsRevoked,2);
    assert.equal((await upload('alice',first.id)).status,409);
  });
  await t.test('duplicate warnings guide to existing access; association never creates or alters a directory record',async()=>{
    const p={...proposal,stationName:'Kampala Test Station',operatorName:'Incorrect proposed brand',district:'Kampala',latitude:0.31,longitude:32.58};
    const check=await request('/station-requests/duplicates',{as:'bob',method:'POST',body:{stationName:p.stationName,latitude:p.latitude,longitude:p.longitude}});assert.equal(check.data.items[0].id,1);
    const r=await submit('bob',p);assert.equal(r.status,201);assert.equal(r.data.duplicates[0].id,1);
    assert.equal((await upload('bob',r.data.id)).status,201);
    const review=(await request('/admin/station-requests',{as:'admin'})).data.items.find(item=>item.id===r.data.id);assert.equal(review.duplicates[0].id,1);
    assert.equal((await decide(r.data.id)).status,409);
    const before=(await db.query('SELECT * FROM stations WHERE id=1')).rows[0];
    assert.equal((await decide(r.data.id,{status:'approved',reason:'Verified this is the existing forecourt and applicant is authorized.',stationId:1})).status,200);
    assert.equal(await count('stations'),3);assert.equal(await count('operators'),2);
    assert.deepEqual((await db.query('SELECT * FROM stations WHERE id=1')).rows[0],before);
  });
  await t.test('rejection preserves roles, sessions and directory records and leaves an accountable decision',async()=>{
    const r=await submit('verified1',{...proposal,stationName:'Rejected proposal',latitude:1.8,longitude:34});assert.equal(r.status,201);
    const before={stations:await count('stations'),operators:await count('operators'),sessions:(await db.query('SELECT * FROM sessions WHERE user_id=$1',[users.verified1.id])).rows};
    assert.equal((await decide(r.data.id,{status:'rejected',reason:'Licence authority could not confirm this proposed station.'})).status,200);
    assert.equal(await count('stations'),before.stations);assert.equal(await count('operators'),before.operators);
    assert.deepEqual((await db.query('SELECT * FROM sessions WHERE user_id=$1',[users.verified1.id])).rows,before.sessions);
    assert.equal((await request('/auth/session',{as:'verified1'})).data.user.role,'citizen');
    assert.equal((await request('/operator/stations',{as:'verified1'})).status,403);
    assert.equal((await upload('verified1',r.data.id)).status,409);
    assert.ok((await request('/me/notifications',{as:'verified1'})).data.items.some(n=>/rejected/.test(n.message)));
    assert.equal((await decide(r.data.id)).status,409);
  });
  await t.test('simultaneous requests are rechecked at approval and an existing brand is reused case-insensitively',async()=>{
    const p={...proposal,stationName:'Verified Kabale Forecourt',operatorName:'TEST OPERATOR',district:'Kabale',region:'Western',latitude:-1.2,longitude:30};
    const a=await submit('verified2',p),b=await submit('verified3',p);assert.equal(a.status,201);assert.equal(b.status,201);
    await upload('verified2',a.data.id);await upload('verified3',b.data.id);
    const results=await Promise.all([decide(a.data.id),decide(b.data.id)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    assert.equal(await count('stations'),4);assert.equal(await count('operators'),2);
    const station=(await db.query('SELECT * FROM stations WHERE name=$1',[p.stationName])).rows[0];assert.equal(station.operator_id,1);
    const loser=results[0].status===409?a.data:b.data;
    assert.equal((await decide(loser.id,{status:'approved',reason:'Confirmed the same approved site and authorized applicant.',stationId:station.id})).status,200);
    assert.equal(await count('stations'),4);
  });
});
