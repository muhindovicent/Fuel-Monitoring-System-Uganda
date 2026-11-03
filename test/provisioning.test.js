import assert from 'node:assert/strict';
import test from 'node:test';
import {fixtures,testDatabase,testPassword} from './database.js';
import {parseRequest,assertWorkflowScope,assertProvisioners} from '../deploy/provision-staff.mjs';
import {provisionAccount,provisionStaffAccount} from '../server/provisioning.js';
import {passwordMatches} from '../server/security.js';
import {target} from '../deploy/hosting-shared.mjs';

const request={requestId:'APPROVAL-2026-0001',role:'inspector',reason:'Approved field inspection staffing request.'};
function workflow(overrides={}){
  return {GITHUB_REPOSITORY:'muhindovicent/Fuel-Monitoring-System-Uganda',GITHUB_REF:`refs/heads/${target.branch}`,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_SHA:'a'.repeat(40),...overrides};
}

test('staff provisioning requires an active application administrator and records accountable provenance',async()=>{
  const db=await testDatabase();const users=await fixtures(db);
  try{
    const account={email:'new.inspector@example.test',displayName:'New Inspector',password:'Provisioned-password-2026!'};
    await assert.rejects(()=>provisionStaffAccount(db,{request,account,administrator:{email:'analyst@example.test',password:testPassword},github:{actor:'admin',runId:'41604059549',commit:'b'.repeat(40)}}),/administrator must authorize/);
    await assert.rejects(()=>provisionStaffAccount(db,{request,account,administrator:{email:users.admin.email,password:'incorrect-password'},github:{actor:'admin',runId:'41604059549',commit:'b'.repeat(40)}}),/administrator must authorize/);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM users WHERE role=$$inspector$$ AND email=$1',[account.email])).rows[0].count,0);
    const created=await provisionStaffAccount(db,{request,account,administrator:{email:users.admin.email,password:testPassword},github:{actor:'admin',runId:'41604059549',commit:'b'.repeat(40)}});
    assert.equal(created.created,true);assert.equal(created.role,'inspector');
    const row=(await db.query('SELECT id,email,role,display_name,password_hash FROM users WHERE email=$1',[account.email])).rows[0];
    assert.equal(row.role,'inspector');assert.equal(row.display_name,account.displayName);assert.equal(await passwordMatches(account.password,row.password_hash),true);
    const event=(await db.query("SELECT actor_id,entity_id,details FROM audit_log WHERE action='staff.account_provision'")).rows[0];
    assert.equal(event.actor_id,users.admin.id);assert.equal(event.entity_id,row.id);
    assert.equal(event.details.requestId,request.requestId);assert.equal(event.details.reason,request.reason);
    assert.equal(event.details.githubActor,'admin');assert.equal(event.details.githubRunId,'41604059549');assert.equal(event.details.commit,'b'.repeat(40));
  }finally{await db.end();}
});

test('staff provisioning is create-only and idempotent for the approved request',async()=>{
  const db=await testDatabase();const users=await fixtures(db);
  try{
    const account={email:'new.analyst@example.test',displayName:'New Analyst',password:'Provisioned-password-2026!'};
    const github={actor:'admin',runId:'41604059549',commit:'b'.repeat(40)};
    const admin={email:users.admin.email,password:testPassword};
    assert.equal((await provisionStaffAccount(db,{request:{...request,requestId:'APPROVAL-2026-0002',role:'analyst'},account,administrator:admin,github})).created,true);
    const original=(await db.query('SELECT id,password_hash FROM users WHERE email=$1',[account.email])).rows[0];
    const replay=await provisionStaffAccount(db,{request:{...request,requestId:'APPROVAL-2026-0002',role:'analyst'},account:{...account,password:'Different-password-2026!'},administrator:admin,github});
    assert.equal(replay.created,false);assert.equal(replay.alreadyProvisioned,true);
    assert.deepEqual((await db.query('SELECT id,password_hash FROM users WHERE email=$1',[account.email])).rows,[original]);
    assert.equal(await passwordMatches(account.password,original.password_hash),true);
    await assert.rejects(()=>provisionStaffAccount(db,{request:{...request,requestId:'APPROVAL-2026-0002',role:'analyst'},account:{...account,displayName:'Different Person'},administrator:admin,github}),/already used for a different staff account/);
    await assert.rejects(()=>provisionStaffAccount(db,{request:{...request,requestId:'APPROVAL-2026-0003',role:'admin'},account,administrator:admin,github}),/Invalid/);
    await assert.rejects(()=>provisionStaffAccount(db,{request:{...request,requestId:'APPROVAL-2026-0004',role:'inspector'},account:{...account,email:users.operator.email},administrator:admin,github}),/cannot change its role, password, verification or access/);
    assert.equal((await db.query('SELECT role FROM users WHERE email=$1',[users.operator.email])).rows[0].role,'operator');
    assert.equal((await db.query("SELECT count(*)::int AS count FROM audit_log WHERE action='staff.account_provision'")).rows[0].count,1);
  }finally{await db.end();}
});

test('the least-privilege runtime role can create only the approved staff account',async()=>{
  const db=await testDatabase();const users=await fixtures(db);const session=await db.connect();
  try{
    await session.query('SET ROLE mafuta_app');
    const runtime={query:session.query,connect:async()=>({query:session.query,release(){}}),end:async()=>{}};
    const account={email:'runtime.inspector@example.test',displayName:'Runtime Inspector',password:'Provisioned-password-2026!'};
    const created=await provisionStaffAccount(runtime,{request:{...request,requestId:'APPROVAL-2026-0006'},account,administrator:{email:users.admin.email,password:testPassword},github:{actor:'admin',runId:'41604059549',commit:'b'.repeat(40)}});
    assert.equal(created.created,true);
    await assert.rejects(()=>provisionStaffAccount(runtime,{request:{...request,requestId:'APPROVAL-2026-0007',role:'analyst'},account:{...account,role:'inspector'},administrator:{email:users.admin.email,password:testPassword},github:{actor:'admin',runId:'41604059549',commit:'b'.repeat(40)}}),/cannot change its role, password, verification or access/);
    await assert.rejects(()=>session.query("UPDATE audit_log SET action='tampered'"),/permission denied|append-only/);
  }finally{await session.query('RESET ROLE');session.release();await db.end();}
});

test('the generic provisioning command creates accounts and revokes existing access',async()=>{
  const db=await testDatabase();
  try{
    await provisionAccount(db,{email:'cli.citizen@example.test',role:'citizen',displayName:'CLI Citizen',password:'Provisioned-password-2026!'});
    await db.query("INSERT INTO sessions(user_id,token_hash,csrf_token,expires_at) SELECT id,$$old$$,$$old-csrf$$,now()+interval '1 hour' FROM users WHERE email=$1",['cli.citizen@example.test']);
    await provisionAccount(db,{email:'cli.citizen@example.test',role:'operator',displayName:'CLI Operator',password:'Updated-password-2026!'});
    const row=(await db.query('SELECT role,display_name,password_hash FROM users WHERE email=$1',['cli.citizen@example.test'])).rows[0];
    assert.equal(row.role,'operator');assert.equal(row.display_name,'CLI Operator');
    assert.equal(await passwordMatches('Updated-password-2026!',row.password_hash),true);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM sessions')).rows[0].count,0);
    assert.equal((await db.query("SELECT count(*)::int AS count FROM audit_log WHERE action='cli.account_provision'")).rows[0].count,2);
  }finally{await db.end();}
});

test('the provisioning request file and workflow scope fail closed',()=>{
  assert.equal(parseRequest({enabled:false,requestId:'',role:'inspector',reason:''}),null);
  assert.deepEqual(parseRequest({enabled:true,requestId:'APPROVAL-2026-0005',role:'analyst',reason:'Approved market intelligence staffing request.'}),{requestId:'APPROVAL-2026-0005',role:'analyst',reason:'Approved market intelligence staffing request.'});
  assert.throws(()=>parseRequest({enabled:true,requestId:'short',role:'analyst',reason:'Approved market intelligence staffing request.'}),/Invalid/);
  assert.throws(()=>parseRequest({enabled:true,requestId:'APPROVAL-2026-0005',role:'admin',reason:'Approved market intelligence staffing request.'}),/Invalid/);
  assert.doesNotThrow(()=>assertWorkflowScope(workflow()));
  assert.doesNotThrow(()=>assertWorkflowScope(workflow({GITHUB_EVENT_NAME:'push'})));
  assert.throws(()=>assertWorkflowScope(workflow({GITHUB_REPOSITORY:'someone/else'})),/authorized repository/);
  assert.throws(()=>assertWorkflowScope(workflow({GITHUB_REF:'refs/heads/main'})),/authorized repository/);
  assert.throws(()=>assertWorkflowScope(workflow({GITHUB_EVENT_NAME:'pull_request'})),/authorized repository/);
  assert.throws(()=>assertWorkflowScope(workflow({GITHUB_SHA:'not-a-commit'})),/authorized repository/);
  assert.throws(()=>assertProvisioners(workflow()),/STAFF_PROVISIONERS/);
  assert.throws(()=>assertProvisioners(workflow({STAFF_PROVISIONERS:'vicent',GITHUB_ACTOR:'someone-else'})),/configured repository administrators/);
  assert.throws(()=>assertProvisioners(workflow({STAFF_PROVISIONERS:'vicent',GITHUB_ACTOR:'vicent',GITHUB_TRIGGERING_ACTOR:'someone-else'})),/configured repository administrators/);
  assert.doesNotThrow(()=>assertProvisioners(workflow({STAFF_PROVISIONERS:'vicent, second-admin',GITHUB_ACTOR:'vicent',GITHUB_TRIGGERING_ACTOR:'second-admin'})));
});
