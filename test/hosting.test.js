import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sameDatabase,secureConnection} from '../deploy/staging-render.mjs';
import {applicationUrl,managedConnection,assertEmptyLegacy,target} from '../deploy/hosting-shared.mjs';

test('deployment matches pooled/direct database identity without requiring identical credentials',()=>{
  assert.equal(sameDatabase('postgresql://runtime:placeholder@ep-example-pooler.test/mafuta','postgresql://owner:placeholder@ep-example.test/mafuta'),true);
  assert.equal(sameDatabase('postgresql://runtime:placeholder@ep-example.test/mafuta','postgresql://owner:placeholder@ep-example.test/other'),false);
  assert.equal(sameDatabase('postgresql://runtime:placeholder@ep-example.test/mafuta','postgresql://owner:placeholder@ep-unrelated.test/mafuta'),false);
});
test('managed connection authorizes only the isolated database and runtime role on the same Neon endpoint',()=>{
  const owner='postgresql://owner:placeholder@ep-example.test/legacy?sslmode=require&options=old-schema';
  const managed=applicationUrl(owner,{username:target.runtimeRole,password:'runtime-placeholder'});
  assert.equal(new URL(managed).pathname,`/${target.database}`);
  assert.equal(new URL(managed).searchParams.has('options'),false);
  assert.equal(managedConnection(managed,owner),true);
  assert.equal(managedConnection(managed.replace('ep-example','ep-unrelated'),owner),false);
  assert.equal(managedConnection(managed.replace(target.runtimeRole,'owner'),owner),false);
  assert.equal(managedConnection(managed.replace(target.database,'legacy'),owner),false);
});
test('legacy transition refuses additional accounts, business records, or incomplete inspection',()=>{
  const empty={legacy:{app_users:1,stations:0,price_reports:0,verified_prices:0,audit_events:0},matchingBootstrapAdministrator:1};
  assert.doesNotThrow(()=>assertEmptyLegacy(empty));
  for(const table of Object.keys(empty.legacy))assert.throws(()=>assertEmptyLegacy({...empty,legacy:{...empty.legacy,[table]:empty.legacy[table]+1}}),/explicit data migration/);
  assert.throws(()=>assertEmptyLegacy({...empty,matchingBootstrapAdministrator:0}),/explicit data migration/);
  assert.throws(()=>assertEmptyLegacy({legacy:{},matchingBootstrapAdministrator:1}),/explicit data migration/);
});
test('deployment connections enforce certificate verification despite permissive SSL URL flags',()=>{
  const result=secureConnection('postgresql://owner:placeholder@ep-example.test/mafuta?sslmode=require&uselibpqcompat=true&options=-c%20search_path%3Dpublic');
  assert.equal(result.ssl.rejectUnauthorized,true);
  assert.equal(new URL(result.connectionString).searchParams.has('sslmode'),false);
  assert.equal(new URL(result.connectionString).searchParams.get('options'),'-c search_path=public');
  assert.throws(()=>secureConnection('https://example.test'),/PostgreSQL/);
});
