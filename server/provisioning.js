import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {transaction} from './db.js';
import {audit,emailSchema,passwordSchema,passwordHash,passwordMatches,ensure} from './security.js';

const accountSchema=z.object({email:emailSchema,password:passwordSchema,role:z.enum(['citizen','operator','inspector','analyst','admin']),displayName:z.string().trim().min(2).max(80)}).strict();
export const staffRequestSchema=z.object({requestId:z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{7,63}$/),role:z.enum(['inspector','analyst']),reason:z.string().trim().min(20).max(500)}).strict();

async function writeAccount(client,input,{createOnly=false,actorId=null,action='cli.account_provision',details={}}={}){
  const existing=(await client.query('SELECT id FROM users WHERE email=$1 FOR UPDATE',[input.email])).rows[0];
  ensure(!createOnly||!existing,409,'An account already exists. Staff provisioning cannot change its role, password, verification or access.');
  const id=existing?.id??randomUUID();
  const conflict=createOnly?'':' ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,role=EXCLUDED.role,display_name=EXCLUDED.display_name,disabled=false';
  await client.query(`INSERT INTO users(id,email,display_name,password_hash,role) VALUES ($1,$2,$3,$4,$5)${conflict}`,[id,input.email,input.displayName,await passwordHash(input.password),input.role]);
  await client.query('DELETE FROM sessions WHERE user_id=$1',[id]);
  await client.query('UPDATE api_tokens SET revoked_at=now() WHERE user_id=$1',[id]);
  await audit(client,actorId,action,id,{email:input.email,role:input.role,...details});
  return {id,role:input.role,created:!existing};
}
export async function provisionAccount(db,input){
  const account=accountSchema.parse(input);
  return transaction(db,client=>writeAccount(client,account));
}
export async function provisionStaffAccount(db,{request,account,administrator,github}){
  const approved=staffRequestSchema.parse(request);
  const input=accountSchema.parse({...account,role:approved.role});
  const adminEmail=emailSchema.parse(administrator.email.trim()),adminPassword=z.string().min(1).max(128).parse(administrator.password);
  const provenance=z.object({actor:z.string().regex(/^[\w-]+$/),runId:z.string().regex(/^\d+$/),commit:z.string().regex(/^[a-f0-9]{40}$/)}).strict().parse(github);
  return transaction(db,async client=>{
    await client.query('SELECT pg_advisory_xact_lock(734183)');
    const admin=(await client.query('SELECT id,role,disabled,password_hash FROM users WHERE email=$1 FOR UPDATE',[adminEmail])).rows[0];
    ensure(admin&&admin.role==='admin'&&!admin.disabled&&await passwordMatches(adminPassword,admin.password_hash),403,'An active application administrator must authorize staff provisioning.');
    const previous=(await client.query("SELECT entity_id,details FROM audit_log WHERE action='staff.account_provision' AND details->>'requestId'=$1",[approved.requestId])).rows[0];
    if(previous){
      ensure(previous.details.email===input.email&&previous.details.role===approved.role&&previous.details.displayName===input.displayName,409,'The request identifier was already used for a different staff account.');
      return {created:false,alreadyProvisioned:true,role:approved.role};
    }
    return writeAccount(client,input,{createOnly:true,actorId:admin.id,action:'staff.account_provision',details:{requestId:approved.requestId,reason:approved.reason,displayName:input.displayName,githubActor:provenance.actor,githubRunId:provenance.runId,commit:provenance.commit}});
  });
}
