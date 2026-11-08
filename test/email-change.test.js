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

test('Email change verification sends single-use links and protects registered addresses',async t=>{
  const db=await testDatabase(),users=await fixtures(db);
  const box=await mailbox();
  const app=startApp(db,{EMAIL_PROVIDER:'http',EMAIL_HTTP_URL:box.url,EMAIL_FROM:'MafutaWatch <no-reply@example.test>'});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await box.close();await db.end();});
  const {request,login,sessions}=client(server);
  sessions.analyst=await login(users.analyst.email);

  await t.test('delivery is reported as configured',async()=>{
    const status=await request('/me/email/status',{as:'analyst'});
    assert.equal(status.status,200);
    assert.deepEqual({enabled:status.data.enabled,provider:status.data.provider},{enabled:true,provider:'http'});
  });

  let tokenA;
  await t.test('the current password is required and no token is returned',async()=>{
    const wrong=await request('/me/email/change-request',{as:'analyst',method:'POST',body:{newEmail:'new-analyst@example.test',currentPassword:'wrong-password'}});
    assert.equal(wrong.status,401);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM email_change_tokens')).rows[0].count,0,'A failed password check must not create a token.');

    const created=await request('/me/email/change-request',{as:'analyst',method:'POST',body:{newEmail:'new-analyst@example.test',currentPassword:testPassword}});
    assert.equal(created.status,202);
    assert.equal(created.data.accepted,true);
    assert.ok(!('token' in created.data),'Verification tokens must never be returned by the API.');
    assert.ok(!/[a-f0-9]{64}/.test(JSON.stringify(created.data)),'The response must not contain a raw verification token.');
    assert.ok(created.data.message.includes('verification link'));

    const profile=await request('/me/profile',{as:'analyst'});
    assert.equal(profile.data.profile.email,users.analyst.email,'The original email must stay in place until verification.');
    assert.equal(box.messages.length,2,'Both the current and the proposed address are notified.');
    assert.equal(box.messages[0].to,users.analyst.email);
    assert.equal(box.messages[0].subject,'Email change requested for your MafutaWatch account');
    assert.equal(box.messages[1].to,'new-analyst@example.test');
    assert.ok(box.messages[1].text.includes(`${origin}/#email-verify?token=`),'The link points at the deployed origin.');
    tokenA=linkToken(box.messages[1]);
    assert.ok(tokenA,'The verification link carries a token.');
    const stored=(await db.query('SELECT token_hash FROM email_change_tokens')).rows;
    assert.equal(stored.length,1);
    assert.notEqual(stored[0].token_hash,tokenA,'Only the hash of the token may be stored.');
  });

  await t.test('invalid and foreign verification tokens fail',async()=>{
    assert.equal((await request('/me/email/confirm',{as:'analyst',method:'POST',body:{token:'not-a-token'}})).status,400);
    assert.equal((await request('/me/email/confirm',{as:'analyst',method:'POST',body:{token:'f'.repeat(64)}})).status,400);
    sessions.admin=await login(users.admin.email);
    const foreign=await request('/me/email/confirm',{as:'admin',method:'POST',body:{token:tokenA}});
    assert.equal(foreign.status,400,'A token only works for the account that requested it.');
    assert.equal((await db.query('SELECT email FROM users WHERE id=$1',[users.analyst.id])).rows[0].email,users.analyst.email);
    assert.equal((await db.query('SELECT used_at FROM email_change_tokens')).rows[0].used_at,null,'A failed confirmation must not consume the token.');
  });

  await t.test('valid verification succeeds, signs out sessions and is single use',async()=>{
    const confirm=await request('/me/email/confirm',{as:'analyst',method:'POST',body:{token:tokenA}});
    assert.equal(confirm.status,204);
    assert.equal((await request('/me/profile',{as:'analyst'})).status,401,'Sessions are invalidated after a successful change.');
    const oldLogin=await request('/auth/login',{method:'POST',body:{email:users.analyst.email,password:testPassword}});
    assert.equal(oldLogin.status,401,'The previous address can no longer sign in.');
    sessions.analyst=await login('new-analyst@example.test');
    const profile=await request('/me/profile',{as:'analyst'});
    assert.equal(profile.data.profile.email,'new-analyst@example.test');
    const replay=await request('/me/email/confirm',{as:'analyst',method:'POST',body:{token:tokenA}});
    assert.equal(replay.status,400);
    assert.match(replay.data.error,/already been used/);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM email_change_tokens WHERE used_at IS NULL')).rows[0].count,0);
  });

  await t.test('a registered address cannot be claimed',async()=>{
    const duplicate=await request('/me/email/change-request',{as:'analyst',method:'POST',body:{newEmail:users.admin.email,currentPassword:testPassword}});
    assert.equal(duplicate.status,409);
    assert.match(duplicate.data.error,/already registered/);
    assert.equal((await db.query('SELECT email FROM users WHERE id=$1',[users.analyst.id])).rows[0].email,'new-analyst@example.test');
  });

  await t.test('expired tokens fail',async()=>{
    sessions.operator=await login(users.operator.email);
    const created=await request('/me/email/change-request',{as:'operator',method:'POST',body:{newEmail:'expired-target@example.test',currentPassword:testPassword}});
    assert.equal(created.status,202);
    const token=linkToken(box.messages.at(-1));
    await db.query('UPDATE email_change_tokens SET expires_at=now()-interval \'1 minute\' WHERE token_hash=$1',[hash(token)]);
    const expired=await request('/me/email/confirm',{as:'operator',method:'POST',body:{token}});
    assert.equal(expired.status,400);
    assert.match(expired.data.error,/expired/i);
    assert.equal((await db.query('SELECT email FROM users WHERE id=$1',[users.operator.id])).rows[0].email,users.operator.email,'An expired link must not change the address.');
  });

  await t.test('a pending address cannot replace a registered one at confirmation time',async()=>{
    sessions.admin=await login(users.admin.email);
    const created=await request('/me/email/change-request',{as:'admin',method:'POST',body:{newEmail:'dup-target@example.test',currentPassword:testPassword}});
    assert.equal(created.status,202);
    const token=linkToken(box.messages.at(-1));
    const registered=await request('/auth/register',{method:'POST',body:{email:'dup-target@example.test',password:'Registration-password-2026!',displayName:'Duplicate',consent:true}});
    assert.equal(registered.status,201,'The address was still free when the pending request was created.');
    const confirm=await request('/me/email/confirm',{as:'admin',method:'POST',body:{token}});
    assert.equal(confirm.status,409,'A pending request cannot overwrite an address that became registered.');
    assert.match(confirm.data.error,/already registered/);
    assert.equal((await db.query('SELECT email FROM users WHERE id=$1',[users.admin.id])).rows[0].email,users.admin.email,'The original address stays in place.');
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
    const duplicate=await request('/auth/register',{method:'POST',body:{email:users.admin.email,password:'Registration-password-2026!',displayName:'Duplicate',consent:true}});
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
