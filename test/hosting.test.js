import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sameDatabase,secureConnection} from '../deploy/staging-render.mjs';

test('deployment matches pooled/direct database identity without requiring identical credentials',()=>{
  assert.equal(sameDatabase('postgresql://runtime:placeholder@ep-example-pooler.test/mafuta','postgresql://owner:placeholder@ep-example.test/mafuta'),true);
  assert.equal(sameDatabase('postgresql://runtime:placeholder@ep-example.test/mafuta','postgresql://owner:placeholder@ep-example.test/other'),false);
  assert.equal(sameDatabase('postgresql://runtime:placeholder@ep-example.test/mafuta','postgresql://owner:placeholder@ep-unrelated.test/mafuta'),false);
});
test('deployment connections enforce certificate verification despite permissive SSL URL flags',()=>{
  const result=secureConnection('postgresql://owner:placeholder@ep-example.test/mafuta?sslmode=require&uselibpqcompat=true&options=-c%20search_path%3Dpublic');
  assert.equal(result.ssl.rejectUnauthorized,true);
  assert.equal(new URL(result.connectionString).searchParams.has('sslmode'),false);
  assert.equal(new URL(result.connectionString).searchParams.get('options'),'-c search_path=public');
  assert.throws(()=>secureConnection('https://example.test'),/PostgreSQL/);
});
