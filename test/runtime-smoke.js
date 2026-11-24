// Manual deployment bootstrap verification; run only against an isolated database.
import assert from 'node:assert/strict';
import { configuration } from '../server/config.js';
import { database } from '../server/db.js';
import { createApp } from '../server/app.js';

const config=configuration();
assert.equal(new URL(config.DATABASE_URL).pathname,'/mafuta_deploy_test','Use only a disposable deployment test database.');
assert.ok(process.env.USER_PASSWORD,'Provide the separately provisioned administrator password.');
const db=database(config),server=createApp(db,config).listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
try {
  assert.equal((await fetch(`${base}/health/ready`)).status,200);
  const response=await fetch(`${base}/api/v1/auth/login`,{method:'POST',headers:{origin:config.APP_ORIGIN,'x-requested-with':'MafutaWatch','content-type':'application/json'},body:JSON.stringify({email:'admin@example.test',password:process.env.USER_PASSWORD})});
  assert.equal(response.status,200,await response.clone().text());
  assert.match(response.headers.get('set-cookie'),/Secure/);
  const cookie=response.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(`${base}/api/v1/admin/dashboard`,{headers:{cookie}})).status,200);
  await assert.rejects(db.query("UPDATE audit_log SET action='tampered'"),/permission denied/);
  await assert.rejects(db.query("UPDATE schema_migrations SET checksum='tampered'"),/permission denied/);
  console.log('Native deployment smoke passed: schema-owner CLI migrations/provisioning, runtime login/dashboard, Secure cookie, restricted audit/migration privileges.');
} finally {await new Promise(resolve=>server.close(resolve));await db.end();}
