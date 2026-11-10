import test from 'node:test';
import assert from 'node:assert/strict';
import { testDatabase, fixtures, testPassword } from './database.js';
import { createApp } from '../server/app.js';

const origin='http://localhost:3000';

function client(server){
  const base=`http://127.0.0.1:${server.address().port}`;
  const sessions={};
  async function request(path,{as,method='GET',body,headers={}}={}){
    const session=sessions[as];
    const response=await fetch(`${base}/api/v1${path}`,{method,headers:{origin,'x-requested-with':'MafutaWatch',...(session?{cookie:session.cookie,'x-csrf-token':session.csrfToken}:{}),...(body?{'content-type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
    const data=response.status===204?null:await response.json();
    return {status:response.status,data,response};
  }
  async function login(email,password=testPassword){
    const result=await request('/auth/login',{method:'POST',body:{email,password}});
    if(result.status!==200)throw new Error(`Login failed for ${email}: ${result.status}`);
    return {...result.data,cookie:result.response.headers.get('set-cookie').split(';')[0]};
  }
  return {request,login,sessions};
}

test('Account deletion requests require review, prevent duplicates and never erase automatically',async t=>{
  const db=await testDatabase(),users=await fixtures(db);
  const app=createApp(db,{APP_ORIGIN:origin,NODE_ENV:'test',TRUST_PROXY_HOPS:0,LOG_LEVEL:'silent',ROUTING_URL:''});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await db.end();});
  const {request,login,sessions}=client(server);
  sessions.bob=await login(users.bob.email);
  sessions.alice=await login(users.alice.email);
  sessions.admin=await login(users.admin.email);
  sessions.inspector=await login(users.inspector.email);
  sessions.analyst=await login(users.analyst.email);
  const reason='I no longer use this fuel monitoring account.';
  const notifications=async userId=>(await db.query('SELECT message FROM notifications WHERE user_id=$1 ORDER BY created_at',[userId])).rows;
  const audits=async action=>(await db.query('SELECT * FROM audit_log WHERE action=$1 ORDER BY id',[action])).rows;
  const bobRequest=async()=>(await request('/me/deletion-request',{as:'bob'})).data.request;
  const adminList=async()=>(await request('/admin/deletion-requests',{as:'admin'})).data.items;
  const bobRow=async()=>(await adminList()).find(row=>row.user_id===users.bob.id);

  await t.test('submission requires an authenticated account, the current password and a substantial reason',async()=>{
    assert.equal((await request('/me/deletion-request',{method:'POST',body:{reason,password:testPassword}})).status,401);
    assert.equal((await request('/me/deletion-request',{as:'alice',method:'POST',body:{reason,password:'Wrong-password-1'}})).status,401);
    assert.equal((await request('/me/deletion-request',{as:'alice',method:'POST',body:{reason:'hi',password:testPassword}})).status,400);
    assert.equal((await request('/me/deletion-request',{as:'bob',method:'POST',body:{reason,password:testPassword}})).status,202);
    const stored=await bobRequest();
    assert.equal(stored.status,'pending');
    assert.equal(stored.reason,reason);
    assert.deepEqual(Object.keys(stored).sort(),['created_at','reason','review_note','reviewed_at','status','user_response']);
    const submitted=await audits('deletion.request');
    assert.ok(submitted.some(row=>row.actor_id===users.bob.id&&row.details.reason===reason));
  });

  await t.test('an account cannot open a second active request',async()=>{
    const rejected=await request('/me/deletion-request',{as:'bob',method:'POST',body:{reason,password:testPassword}});
    assert.equal(rejected.status,409);
    assert.match(rejected.data.error,/active deletion request/i);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM deletion_requests WHERE user_id=$1',[users.bob.id])).rows[0].n,1);
  });

  await t.test('only administrators can see or review deletion requests',async()=>{
    assert.equal((await request('/admin/deletion-requests')).status,401);
    assert.equal((await request('/admin/deletion-requests/00000000-0000-4000-8000-000000000000',{method:'PATCH',body:{action:'approve',note:'Trying to approve without authority.'}})).status,401);
    for(const as of ['alice','inspector','analyst'])assert.equal((await request('/admin/deletion-requests',{as})).status,403,`${as} must not read the review queue`);
    for(const as of ['alice','inspector','analyst'])assert.equal((await request(`/admin/deletion-requests/${(await bobRow()).id}`,{as,method:'PATCH',body:{action:'approve',note:'Trying to approve without authority.'}})).status,403,`${as} must not decide requests`);
    const other=await request('/me/deletion-request',{as:'alice'});
    assert.equal(other.data.request,null,'Members only ever read their own request.');
    const listed=await bobRow();
    assert.equal(listed.display_name,'bob');
    assert.equal(listed.email,users.bob.email);
    assert.equal(listed.role,'citizen');
    assert.equal(listed.reason,reason);
    assert.equal(listed.status,'pending');
    assert.ok(listed.created_at);
  });

  await t.test('every decision records a reason and administrators cannot review their own request',async()=>{
    const id=(await bobRow()).id;
    for(const body of [{action:'approve'},{action:'approve',note:'too short'},{action:'erase',note:'A perfectly valid recorded reason.'},{action:'approve',note:'A perfectly valid recorded reason.',extra:true}])
      assert.equal((await request(`/admin/deletion-requests/${id}`,{as:'admin',method:'PATCH',body})).status,400);
    assert.equal((await request('/admin/deletion-requests/00000000-0000-4000-8000-000000000000',{as:'admin',method:'PATCH',body:{action:'approve',note:'A request that does not exist anywhere.'}})).status,404);
    assert.equal((await request('/me/deletion-request',{as:'admin',method:'POST',body:{reason:'Administrator testing self-review protection.',password:testPassword}})).status,202);
    const own=(await adminList()).find(row=>row.user_id===users.admin.id);
    assert.equal((await request(`/admin/deletion-requests/${own.id}`,{as:'admin',method:'PATCH',body:{action:'approve',note:'Administrators must never approve their own request.'}})).status,403);
    assert.equal((await adminList()).find(row=>row.user_id===users.admin.id).status,'pending');
  });

  await t.test('requesting more information moves the request back to the member',async()=>{
    const id=(await bobRow()).id;
    const notified=await notifications(users.bob.id);
    assert.equal((await request(`/admin/deletion-requests/${id}`,{as:'admin',method:'PATCH',body:{action:'request_info',note:'Confirm the email address you want kept for receipts.'}})).status,200);
    let stored=await bobRequest();
    assert.equal(stored.status,'info_requested');
    assert.equal(stored.review_note,'Confirm the email address you want kept for receipts.');
    assert.ok((await notifications(users.bob.id)).length>notified.length);
    assert.match((await notifications(users.bob.id)).at(-1).message,/requested more information/i);
    const reviews=await audits('deletion.review');
    assert.ok(reviews.some(row=>row.entity_id===id&&row.details.action==='request_info'&&row.details.to==='info_requested'&&row.details.subject===users.bob.id));
    assert.equal((await request(`/admin/deletion-requests/${id}`,{as:'admin',method:'PATCH',body:{action:'request_info',note:'Information was already requested from this member.'}})).status,409);
  });

  await t.test('the member answers a request for more information and the reply returns to review',async()=>{
    assert.equal((await request('/me/deletion-request',{as:'bob',method:'PATCH',body:{response:'short'}})).status,400);
    assert.equal((await request('/me/deletion-request',{as:'alice',method:'PATCH',body:{response:'Alice has no deletion request to answer.'}})).status,409);
    assert.equal((await request('/me/deletion-request',{as:'bob',method:'PATCH',body:{response:'Keep receipts under kenya.example.test, not the old address.'}})).status,200);
    const stored=await bobRequest();
    assert.equal(stored.status,'pending');
    assert.equal(stored.user_response,'Keep receipts under kenya.example.test, not the old address.');
    assert.equal(stored.review_note,'Confirm the email address you want kept for receipts.');
    assert.ok((await audits('deletion.response')).some(row=>row.actor_id===users.bob.id));
    assert.equal((await request('/me/deletion-request',{as:'bob',method:'PATCH',body:{response:'Trying to answer again while already back in review.'}})).status,409);
  });

  await t.test('approval never erases accounts or evidence automatically',async()=>{
    assert.equal((await request('/me/preferences',{as:'bob',method:'PATCH',body:{notifications:{priceChanges:false,reportUpdates:false,complaintUpdates:false,advisories:false}}})).status,200);
    const id=(await bobRow()).id;
    const before=await notifications(users.bob.id);
    assert.equal((await request(`/admin/deletion-requests/${id}`,{as:'admin',method:'PATCH',body:{action:'approve',note:'Approved after confirming the receipt address with the member.'}})).status,200);
    const stored=await bobRequest();
    assert.equal(stored.status,'approved');
    assert.ok(stored.reviewed_at);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM users WHERE id=$1',[users.bob.id])).rows[0].n,1,'The account row survives approval.');
    assert.equal((await login(users.bob.email)).user.id,users.bob.id,'The member can still sign in after approval.');
    const after=await notifications(users.bob.id);
    assert.ok(after.length>before.length,'Essential deletion notices are delivered even with every optional notification off.');
    assert.match(after.at(-1).message,/approved/i);
    assert.match(after.at(-1).message,/never erases accounts or evidence automatically/i);
    const rejected=await request(`/admin/deletion-requests/${id}`,{as:'admin',method:'PATCH',body:{action:'reject',note:'Trying to reverse an already approved request.'}});
    assert.equal(rejected.status,409);
    assert.match((await request(`/admin/deletion-requests/${id}`,{as:'admin',method:'PATCH',body:{action:'approve',note:'Trying to approve the same request twice.'}})).data.error,/already been decided/i);
  });

  await t.test('a rejected request keeps the account active and the trail persists across sessions',async()=>{
    assert.equal((await request('/me/deletion-request',{as:'bob',method:'POST',body:{reason:'Changed my mind earlier; submitting once more after the decision.',password:testPassword}})).status,202);
    const id=(await bobRow()).id;
    assert.equal((await request(`/admin/deletion-requests/${id}`,{as:'admin',method:'PATCH',body:{action:'reject',note:'Duplicate household account; the active station operator account remains in use.'}})).status,200);
    const stored=await bobRequest();
    assert.equal(stored.status,'rejected');
    assert.equal(stored.reason,'Changed my mind earlier; submitting once more after the decision.');
    assert.match((await notifications(users.bob.id)).at(-1).message,/rejected/i);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM users WHERE id=$1',[users.bob.id])).rows[0].n,1);
    assert.equal((await request('/auth/logout',{as:'bob',method:'POST'})).status,204);
    delete sessions.bob;
    sessions.bob=await login(users.bob.email);
    const persisted=await bobRequest();
    assert.equal(persisted.status,'rejected');
    assert.equal(persisted.reason,'Changed my mind earlier; submitting once more after the decision.');
    const queue=await adminList();
    assert.equal(queue.filter(row=>row.user_id===users.bob.id).length,2,'Decided requests remain as reviewable history.');
    assert.ok(queue.every(row=>!('password_hash' in row)&&!('csrf_token' in row)));
  });

  await t.test('review lookup and decisions work for requests beyond the first review page',async()=>{
    await db.query(`INSERT INTO users(id,email,display_name,password_hash,role,identity_verified)
      SELECT gen_random_uuid(),'queue-seed-'||g||'@example.test','Queue seed '||g,'seeded-placeholder-hash','citizen',false
      FROM generate_series(1,60) g`);
    await db.query(`INSERT INTO deletion_requests(id,user_id,reason,status,created_at)
      SELECT gen_random_uuid(),id,'Seeded queue request for the review pagination check.','pending',now()-interval '1 second'*(row_number() OVER (ORDER BY email))
      FROM users WHERE email LIKE 'queue-seed-%@example.test'`);
    const pageOne=(await request('/admin/deletion-requests?limit=50&offset=0',{as:'admin'})).data.items;
    const pageTwo=(await request('/admin/deletion-requests?limit=50&offset=50',{as:'admin'})).data.items;
    const beyond=pageTwo.find(row=>row.status==='pending');
    assert.ok(beyond,'A pending request must appear beyond the first review page.');
    assert.ok(!pageOne.some(row=>row.id===beyond.id));
    const single=await request(`/admin/deletion-requests/${beyond.id}`,{as:'admin'});
    assert.equal(single.status,200);
    assert.equal(single.data.request.id,beyond.id);
    assert.equal(single.data.request.status,'pending');
    assert.equal(single.data.request.display_name,beyond.display_name);
    assert.equal((await request(`/admin/deletion-requests/${beyond.id}`)).status,401);
    for(const as of ['alice','inspector','analyst'])assert.equal((await request(`/admin/deletion-requests/${beyond.id}`,{as})).status,403,`${as} must not read a single request`);
    assert.equal((await request('/admin/deletion-requests/00000000-0000-4000-8000-000000000000',{as:'admin'})).status,404);
    assert.equal((await request('/admin/deletion-requests/not-a-uuid',{as:'admin'})).status,400);
    assert.equal((await request(`/admin/deletion-requests/${beyond.id}`,{as:'admin',method:'PATCH',body:{action:'request_info',note:'Please confirm the email address for this queued account.'}})).status,200);
    assert.equal((await request(`/admin/deletion-requests/${beyond.id}`,{as:'admin'})).data.request.status,'info_requested');
    await db.query("DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'queue-seed-%@example.test')");
    await db.query("DELETE FROM deletion_requests WHERE reason='Seeded queue request for the review pagination check.'");
    await db.query("DELETE FROM users WHERE email LIKE 'queue-seed-%@example.test'");
  });
});
