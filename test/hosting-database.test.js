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
    await db.query(`SET ROLE ${target.runtimeRole}`);
    assert.equal((await verifyRuntime(db)).auditAndMigrationMutationDenied,true);
    await assert.rejects(()=>db.query("UPDATE audit_log SET action='modified'"),{code:'42501'});
    await assert.rejects(()=>db.query("UPDATE schema_migrations SET checksum='modified'"),{code:'42501'});
    await assert.rejects(()=>db.query('CREATE TABLE unexpected_runtime_ddl(id integer)'),{code:'42501'});
    assert.equal((await db.query('SELECT count(*)::int AS count FROM users')).rows[0].count,1);
    await db.query('RESET ROLE');
  }finally{await db.end();}
});
