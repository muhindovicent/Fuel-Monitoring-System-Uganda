import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testDatabase,testPassword} from './database.js';
import {provisionApplication,verifyRuntime} from '../deploy/staging-database.mjs';
import {target} from '../deploy/hosting-shared.mjs';

test('deployment bootstrap is repeatable, preserves existing credentials and restricts the runtime role',async()=>{
  const db=await testDatabase();
  try{
    await db.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${target.runtimeRole}') THEN CREATE ROLE ${target.runtimeRole} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT; END IF; END; $$;`);
    await provisionApplication(db,'bootstrap@example.test',testPassword);
    const original=(await db.query('SELECT id,password_hash FROM users')).rows[0];
    await provisionApplication(db,'bootstrap@example.test',testPassword);
    assert.deepEqual((await db.query('SELECT id,password_hash FROM users')).rows,[original]);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM audit_log')).rows[0].count,1);
    await assert.rejects(()=>provisionApplication(db,'bootstrap@example.test','Another-test-password-2026!'),/not overwritten/);
    assert.deepEqual((await db.query('SELECT id,password_hash FROM users')).rows,[original]);
    // Pool.query discards connections after SQL errors. Hold one session so a
    // denied statement cannot silently reconnect as the test database owner.
    const runtime=await db.connect();
    try{
      await runtime.query(`SET ROLE ${target.runtimeRole}`);
      assert.equal((await verifyRuntime(runtime)).auditAndMigrationMutationDenied,true);
      await assert.rejects(()=>runtime.query("UPDATE audit_log SET action='modified'"),{code:'42501'});
      await assert.rejects(()=>runtime.query("UPDATE schema_migrations SET checksum='modified'"),{code:'42501'});
      await assert.rejects(()=>runtime.query('CREATE TABLE unexpected_runtime_ddl(id integer)'),{code:'42501'});
      assert.equal((await runtime.query('SELECT count(*)::int AS count FROM users')).rows[0].count,1);
    }finally{await runtime.query('RESET ROLE');runtime.release();}
  }finally{await db.end();}
});
