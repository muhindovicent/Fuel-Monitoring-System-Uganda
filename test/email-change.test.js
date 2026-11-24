import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { testDatabase, fixtures, testPassword } from './database.js';
import { createApp } from '../server/app.js';
import { configuration } from '../server/config.js';

const origin='http://localhost:3000';
const hash=token=>createHash('sha256').update(token).digest('hex');

async function mailbox(){
  const messages=[];
  const server=http.createServer((req,res)=>{
    let body='';req.setEncoding('utf8');req.on('data',chunk=>body+=chunk);
    req.on('end',()=>{try{messages.push(JSON.parse(body));}catch{/* ignore unparsable captures */}res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true}');});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {messages,url:`http://127.0.0.1:${server.address().port}/send`,close:()=>new Promise(resolve=>server.close(resolve))};
}
// Pass-through database that can be armed to fail one matching statement, so a
// mid-transaction fault can be proven to roll back every earlier write.
function failingDatabase(db){
  const armed={pattern:null};
  const guard=query=>async(text,params)=>{
    if(armed.pattern&&armed.pattern.test(text)){armed.pattern=null;throw new Error('injected database failure');}
    return query(text,params);
  };
  return {
    arm:pattern=>{armed.pattern=pattern;},
    disarm:()=>{armed.pattern=null;},
    query:guard(db.query.bind(db)),
    async connect(){const client=await db.connect();return {query:guard(client.query.bind(client)),release:client.release};},
    end:()=>db.end()
  };
}
function startApp(db,extra={}){
  return createApp(db,{APP_ORIGIN:origin,NODE_ENV:'test',TRUST_PROXY_HOPS:0,LOG_LEVEL:'silent',ROUTING_URL:'',...extra});
}
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
const linkToken=message=>/token=([a-f0-9]{64})/.exec(message?.text||'')?.[1];
const lastLink=(messages,to)=>linkToken(messages.filter(message=>message.to===to).at(-1));
const tokensOf=async(db,userId)=>(await db.query('SELECT kind,token_hash,used_at FROM email_change_tokens WHERE user_id=$1 ORDER BY kind',[userId])).rows;

test('Email change verification needs approval from both mailboxes and stays atomic',async t=>{
  const db=await testDatabase(),users=await fixtures(db);
  const box=await mailbox();
  const guarded=failingDatabase(db);
  const app=startApp(guarded,{EMAIL_PROVIDER:'http',EMAIL_HTTP_URL:box.url,EMAIL_FROM:'MafutaWatch <no-reply@example.test>'});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await box.close();await db.end();});
  const {request,login,sessions}=client(server);
  sessions.analyst=await login(users.analyst.email);
  const currentEmail=async userId=>(await db.query('SELECT email FROM users WHERE id=$1',[userId])).rows[0].email;
  const auditCount=async(userId,action)=>(await db.query('SELECT count(*)::int AS count FROM audit_log WHERE actor_id=$1 AND action=$2',[userId,action])).rows[0].count;

  await t.test('delivery is reported as configured',async()=>{
    const status=await request('/me/email/status',{as:'analyst'});
    assert.equal(status.status,200);
    assert.deepEqual({enabled:status.data.enabled,provider:status.data.provider},{enabled:true,provider:'http'});
  });

  let tokenNew,tokenOld;
  await t.test('the current password is required, no token is returned and both mailboxes are mailed',async()=>{
    const wrong=await request('/me/email/change-request',{as:'analyst',method:'POST',body:{newEmail:'new-analyst@example.test',currentPassword:'wrong-password'}});
    assert.equal(wrong.status,401);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM email_change_tokens')).rows[0].count,0,'A failed password check must not create a token.');

    const created=await request('/me/email/change-request',{as:'analyst',method:'POST',body:{newEmail:'new-analyst@example.test',currentPassword:testPassword}});
    assert.equal(created.status,202);
    assert.equal(created.data.accepted,true);
    assert.ok(!('token' in created.data),'Verification tokens must never be returned by the API.');
    assert.ok(!/[a-f0-9]{64}/.test(JSON.stringify(created.data)),'The response must not contain a raw verification token.');
    assert.match(created.data.message,/Two single-use links/);

    assert.equal(await currentEmail(users.analyst.id),users.analyst.email,'The original email must stay in place until both approvals.');
    assert.equal(box.messages.length,2,'Both mailboxes are notified.');
    const approval=box.messages.find(message=>message.to===users.analyst.email);
    const confirmation=box.messages.find(message=>message.to==='new-analyst@example.test');
    assert.equal(approval.subject,'Approve the email change for your MafutaWatch account');
    assert.equal(confirmation.subject,'Confirm your new MafutaWatch email address');
    assert.ok(approval.text.includes(`${origin}/#email-verify?token=`),'The approval link points at the deployed origin.');
    assert.ok(confirmation.text.includes(`${origin}/#email-verify?token=`),'The confirmation link points at the deployed origin.');
    tokenOld=linkToken(approval);tokenNew=linkToken(confirmation);
    assert.ok(tokenOld&&tokenNew&&tokenOld!==tokenNew,'Each mailbox receives its own single-use token.');
    const stored=await tokensOf(db,users.analyst.id);
    assert.deepEqual(stored.map(row=>row.kind),['new','old']);
    const raw={new:tokenNew,old:tokenOld};
    for(const row of stored)assert.notEqual(row.token_hash,raw[row.kind],'Only hashes may be stored.');
    assert.equal((await auditCount(users.analyst.id,'email.change.request')),1);
  });

  await t.test('invalid and foreign verification tokens fail',async()=>{
    assert.equal((await request('/me/email/confirm',{as:'analyst',method:'POST',body:{token:'not-a-token'}})).status,400);
    assert.equal((await request('/me/email/confirm',{as:'analyst',method:'POST',body:{token:'f'.repeat(64)}})).status,400);
    sessions.admin=await login(users.admin.email);
    const foreign=await request('/me/email/confirm',{as:'admin',method:'POST',body:{token:tokenNew}});
    assert.equal(foreign.status,400,'A token only works for the account that requested it.');
    assert.equal(await currentEmail(users.analyst.id),users.analyst.email);
    for(const row of await tokensOf(db,users.analyst.id))assert.equal(row.used_at,null,'A failed confirmation must not consume a token.');
  });

  await t.test('approving only the new address changes nothing',async()=>{
    const first=await request('/me/email/confirm',{as:'analyst',method:'POST',body:{token:tokenNew}});
    assert.equal(first.status,200);
    assert.deepEqual({complete:first.data.complete,approved:first.data.approved},{complete:false,approved:'new'});
    assert.match(first.data.message,/your current address/);
    assert.equal(await currentEmail(users.analyst.id),users.analyst.email,'One approval must never change the address.');
    assert.equal((await request('/me/profile',{as:'analyst'})).status,200,'The account stays signed in until the change completes.');
    const audit=await db.query("SELECT details FROM audit_log WHERE actor_id=$1 AND action='email.change.confirm'",[users.analyst.id]);
    assert.equal(audit.rows.length,0,'A partial approval is not recorded as a completed change.');
  });

  await t.test('re-opening a confirmed link while waiting stays pending',async()=>{
    const replay=await request('/me/email/confirm',{as:'analyst',method:'POST',body:{token:tokenNew}});
    assert.equal(replay.status,200,'The already-approved link answers idempotently instead of failing.');
    assert.equal(replay.data.complete,false);
    assert.equal(await currentEmail(users.analyst.id),users.analyst.email);
  });

  await t.test('the second approval completes the change and revokes every session',async()=>{
    const second=await request('/me/email/confirm',{as:'analyst',method:'POST',body:{token:tokenOld}});
    assert.equal(second.status,204);
    assert.equal(await currentEmail(users.analyst.id),'new-analyst@example.test');
    assert.equal((await tokensOf(db,users.analyst.id)).length,0,'Consumed tokens are removed with the completed change.');
    assert.equal((await request('/me/profile',{as:'analyst'})).status,401,'Sessions are invalidated after a successful change.');
    const oldLogin=await request('/auth/login',{method:'POST',body:{email:users.analyst.email,password:testPassword}});
    assert.equal(oldLogin.status,401,'The previous address can no longer sign in.');
    sessions.analyst=await login('new-analyst@example.test');
    const profile=await request('/me/profile',{as:'analyst'});
    assert.equal(profile.data.profile.email,'new-analyst@example.test');
    const confirmations=await db.query("SELECT details FROM audit_log WHERE actor_id=$1 AND action='email.change.confirm'",[users.analyst.id]);
    assert.equal(confirmations.rows.length,1);
    assert.deepEqual(confirmations.rows[0].details.approvals,['new','old'],'The audit record names both approvals.');
    const replay=await request('/me/email/confirm',{as:'analyst',method:'POST',body:{token:tokenOld}});
    assert.equal(replay.status,400,'A consumed link cannot be replayed after completion.');
  });

  await t.test('a registered address cannot be claimed by a new request',async()=>{
    const duplicate=await request('/me/email/change-request',{as:'analyst',method:'POST',body:{newEmail:users.admin.email,currentPassword:testPassword}});
    assert.equal(duplicate.status,409);
    assert.match(duplicate.data.error,/already registered/);
    assert.equal(await currentEmail(users.analyst.id),'new-analyst@example.test');
  });

  await t.test('an expired link fails while the other approval simply waits',async()=>{
    sessions.operator=await login(users.operator.email);
    const created=await request('/me/email/change-request',{as:'operator',method:'POST',body:{newEmail:'expired-target@example.test',currentPassword:testPassword}});
    assert.equal(created.status,202);
    const expiredToken=lastLink(box.messages,'expired-target@example.test');
    await db.query('UPDATE email_change_tokens SET expires_at=now()-interval \'1 minute\' WHERE token_hash=$1',[hash(expiredToken)]);
    const expired=await request('/me/email/confirm',{as:'operator',method:'POST',body:{token:expiredToken}});
    assert.equal(expired.status,400);
    assert.match(expired.data.error,/expired/i);
    const other=await request('/me/email/confirm',{as:'operator',method:'POST',body:{token:lastLink(box.messages,users.operator.email)}});
    assert.equal(other.status,200);
    assert.equal(other.data.complete,false);
    assert.equal(await currentEmail(users.operator.id),users.operator.email,'An expired link must never change the address.');
  });

  await t.test('concurrent confirmations of the same link claim it exactly once',async()=>{
    const created=await request('/me/email/change-request',{as:'operator',method:'POST',body:{newEmail:'concurrent-target@example.test',currentPassword:testPassword}});
    assert.equal(created.status,202);
    const token=lastLink(box.messages,'concurrent-target@example.test');
    const results=await Promise.all([
      request('/me/email/confirm',{as:'operator',method:'POST',body:{token}}),
      request('/me/email/confirm',{as:'operator',method:'POST',body:{token}})
    ]);
    for(const result of results){assert.equal(result.status,200);assert.equal(result.data.complete,false);}
    assert.equal(await currentEmail(users.operator.id),users.operator.email,'A racing double-click must not change the address.');
    const rows=await tokensOf(db,users.operator.id);
    assert.equal(rows.filter(row=>row.used_at).length,1,'Exactly one claim is recorded.');
    assert.equal(rows.filter(row=>!row.used_at).length,1,'The other mailbox approval is still outstanding.');
  });

  await t.test('concurrent approvals from both mailboxes complete exactly once',async()=>{
    const previous=await currentEmail(users.admin.id);
    sessions.admin=await login(previous);
    const created=await request('/me/email/change-request',{as:'admin',method:'POST',body:{newEmail:'concurrent-admin@example.test',currentPassword:testPassword}});
    assert.equal(created.status,202);
    const newToken=lastLink(box.messages,'concurrent-admin@example.test');
    const oldToken=lastLink(box.messages,previous);
    const results=await Promise.all([
      request('/me/email/confirm',{as:'admin',method:'POST',body:{token:newToken}}),
      request('/me/email/confirm',{as:'admin',method:'POST',body:{token:oldToken}})
    ]);
    const completed=results.filter(result=>result.status===204);
    const waiting=results.filter(result=>result.status===200&&result.data.complete===false);
    assert.equal(completed.length,1,'Exactly one approval finishes the change.');
    assert.equal(waiting.length,1,'The other approval reports that it is still waiting.');
    assert.equal(await currentEmail(users.admin.id),'concurrent-admin@example.test');
    assert.equal((await request('/me/profile',{as:'admin'})).status,401,'Sessions are revoked once, atomically with the change.');
    assert.equal((await tokensOf(db,users.admin.id)).length,0,'Consumed tokens are removed with the completed change.');
  });

  await t.test('a database failure rolls back claim, address update, revocation and audit',async()=>{
    const previous=await currentEmail(users.admin.id);
    sessions.admin=await login(previous);
    const created=await request('/me/email/change-request',{as:'admin',method:'POST',body:{newEmail:'rollback-target@example.test',currentPassword:testPassword}});
    assert.equal(created.status,202);
    const newToken=lastLink(box.messages,'rollback-target@example.test');
    const oldToken=lastLink(box.messages,previous);
    const pending=await request('/me/email/confirm',{as:'admin',method:'POST',body:{token:newToken}});
    assert.equal(pending.status,200);
    const before={email:await currentEmail(users.admin.id),audits:await auditCount(users.admin.id,'email.change.confirm')};
    guarded.arm(/UPDATE users SET email/);
    const failed=await request('/me/email/confirm',{as:'admin',method:'POST',body:{token:oldToken}});
    assert.equal(failed.status,500);
    assert.equal(failed.data.error,'The service is temporarily unavailable. Please retry.');
    assert.equal(await currentEmail(users.admin.id),before.email,'A failed transaction must leave the address untouched.');
    const rows=await tokensOf(db,users.admin.id);
    assert.equal(rows.find(row=>row.kind==='old').used_at,null,'The claim is rolled back with the failure.');
    assert.ok(rows.find(row=>row.kind==='new').used_at,'The earlier approval is still recorded.');
    assert.equal((await request('/me/profile',{as:'admin'})).status,200,'Sessions survive a failed change.');
    assert.equal(await auditCount(users.admin.id,'email.change.confirm'),before.audits,'No audit row is written for a rolled-back change.');
    const retried=await request('/me/email/confirm',{as:'admin',method:'POST',body:{token:oldToken}});
    assert.equal(retried.status,204,'The same link works once the database recovers.');
    assert.equal(await currentEmail(users.admin.id),'rollback-target@example.test');
    assert.equal((await request('/me/profile',{as:'admin'})).status,401);
  });

  await t.test('a pending address cannot replace a registered one at confirmation time',async()=>{
    const previous=await currentEmail(users.admin.id);
    sessions.admin=await login(previous);
    const created=await request('/me/email/change-request',{as:'admin',method:'POST',body:{newEmail:'dup-target@example.test',currentPassword:testPassword}});
    assert.equal(created.status,202);
    const token=lastLink(box.messages,'dup-target@example.test');
    const registered=await request('/auth/register',{method:'POST',body:{email:'dup-target@example.test',password:'Registration-password-2026!',displayName:'Duplicate',consent:true}});
    assert.equal(registered.status,201,'The address was still free when the pending request was created.');
    const confirm=await request('/me/email/confirm',{as:'admin',method:'POST',body:{token}});
    assert.equal(confirm.status,409,'A pending request cannot overwrite an address that became registered.');
    assert.match(confirm.data.error,/already registered/);
    assert.equal(await currentEmail(users.admin.id),previous,'The original address stays in place.');
  });

  await t.test('rate limits repeated requests',async()=>{
    sessions.inspector=await login(users.inspector.email);
    for(let attempt=1;attempt<=3;attempt++){
      const result=await request('/me/email/change-request',{as:'inspector',method:'POST',body:{newEmail:`inspector-target-${attempt}@example.test`,currentPassword:testPassword}});
      assert.equal(result.status,202,`Request ${attempt} should be accepted.`);
    }
    const limited=await request('/me/email/change-request',{as:'inspector',method:'POST',body:{newEmail:'inspector-target-4@example.test',currentPassword:testPassword}});
    assert.equal(limited.status,429);
  });

  await t.test('registration rejects a duplicate email address',async()=>{
    const duplicate=await request('/auth/register',{method:'POST',body:{email:users.inspector.email,password:'Registration-password-2026!',displayName:'Duplicate',consent:true}});
    assert.equal(duplicate.status,409);
    assert.match(duplicate.data.error,/already registered/);
  });
});

test('Email changes are disabled truthfully without a delivery provider',async t=>{
  const db=await testDatabase(),users=await fixtures(db);
  const app=startApp(db);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await db.end();});
  const {request,login,sessions}=client(server);
  sessions.admin=await login(users.admin.email);

  await t.test('status reports the disabled provider',async()=>{
    const status=await request('/me/email/status',{as:'admin'});
    assert.equal(status.status,200);
    assert.deepEqual({enabled:status.data.enabled,provider:status.data.provider},{enabled:false,provider:''});
  });

  await t.test('requests refuse with an honest explanation and no token',async()=>{
    const created=await request('/me/email/change-request',{as:'admin',method:'POST',body:{newEmail:'disabled-target@example.test',currentPassword:testPassword}});
    assert.equal(created.status,503);
    assert.match(created.data.error,/not configured/i);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM email_change_tokens')).rows[0].count,0,'A disabled deployment must not create tokens.');
    assert.equal((await db.query('SELECT email FROM users WHERE id=$1',[users.admin.id])).rows[0].email,users.admin.email);
  });

  await t.test('confirmation fails safely without any token',async()=>{
    const confirm=await request('/me/email/confirm',{as:'admin',method:'POST',body:{token:'a'.repeat(64)}});
    assert.equal(confirm.status,400);
    assert.equal((await db.query('SELECT email FROM users WHERE id=$1',[users.admin.id])).rows[0].email,users.admin.email);
  });
});

test('Email provider configuration is validated without hardcoded credentials',()=>{
  const production={DATABASE_URL:'postgresql://user:pass@localhost/mafuta',APP_ORIGIN:'https://mafuta.example',NODE_ENV:'production'};
  assert.throws(()=>configuration({...production,EMAIL_PROVIDER:'smtp',EMAIL_FROM:'MafutaWatch <no-reply@mafuta.example>'}),/EMAIL_SMTP_HOST/);
  assert.throws(()=>configuration({...production,EMAIL_PROVIDER:'smtp',EMAIL_SMTP_HOST:'smtp.example',EMAIL_FROM:''}),/EMAIL_FROM/);
  assert.throws(()=>configuration({...production,EMAIL_PROVIDER:'http',EMAIL_HTTP_URL:'http://insecure.example',EMAIL_FROM:'ops@mafuta.example'}),/HTTPS/);
  const configured=configuration({...production,EMAIL_PROVIDER:'smtp',EMAIL_SMTP_HOST:'smtp.example',EMAIL_FROM:'MafutaWatch <no-reply@mafuta.example>',EMAIL_SMTP_USER:'apikey',EMAIL_SMTP_PASSWORD:'from-env-only'});
  assert.equal(configured.EMAIL_SMTP_PASSWORD,'from-env-only');
  const emptyFields=configuration({...production,EMAIL_PROVIDER:'smtp',EMAIL_SMTP_HOST:'smtp.example',EMAIL_FROM:'MafutaWatch <no-reply@mafuta.example>',EMAIL_SMTP_PORT:'',EMAIL_SMTP_SECURE:''});
  assert.equal(emptyFields.EMAIL_SMTP_PORT,'','Empty compose fields fall back to the SMTP default port.');
  assert.equal(emptyFields.EMAIL_SMTP_SECURE,'');
  assert.equal(configuration({...production}).EMAIL_PROVIDER,'');
});
