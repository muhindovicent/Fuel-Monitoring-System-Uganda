import {readFile,appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {z} from 'zod';
import {staffRequestSchema,provisionStaffAccount} from '../server/provisioning.js';
import {renderContext} from './staging-render.mjs';
import {verifyRuntime} from './staging-database.mjs';
import {target,managedMarker,DeploymentError,requireValue,secureConnection} from './hosting-shared.mjs';

export function parseRequest(value){
  const envelope=z.object({enabled:z.boolean(),requestId:z.string(),role:z.enum(['inspector','analyst']),reason:z.string()}).strict().parse(value);
  if(!envelope.enabled)return null;
  return staffRequestSchema.parse({requestId:envelope.requestId,role:envelope.role,reason:envelope.reason});
}
export function assertWorkflowScope(env){
  if(env.GITHUB_REPOSITORY!=='muhindovicent/Fuel-Monitoring-System-Uganda'||env.GITHUB_REF!==`refs/heads/${target.branch}`||!['push','workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??''))throw new DeploymentError('Staff provisioning requires the authorized repository and feature branch.');
}
export function assertProvisioners(env){
  const allowed=(env.STAFF_PROVISIONERS??'').split(',').map(actor=>actor.trim()).filter(Boolean);
  if(!allowed.length)throw new DeploymentError('Staff provisioning requires a STAFF_PROVISIONERS repository variable containing administrator logins.');
  const actors=new Set([env.GITHUB_ACTOR,env.GITHUB_TRIGGERING_ACTOR??env.GITHUB_ACTOR]);
  for(const actor of actors){
    if(!/^[\w-]+$/.test(actor??'')||!allowed.includes(actor))throw new DeploymentError('Only the configured repository administrators may request or rerun staff provisioning.');
  }
}
export async function authorizeGithub(env){
  assertWorkflowScope(env);
  assertProvisioners(env);
}
async function requested(env){
  if(env.GITHUB_EVENT_NAME==='workflow_dispatch')return parseRequest({enabled:true,requestId:env.STAFF_REQUEST_ID,role:env.STAFF_ROLE,reason:env.STAFF_REASON});
  return parseRequest(JSON.parse(await readFile(new URL('../.github/staff-provisioning-request.json',import.meta.url),'utf8')));
}
export async function run(env=process.env){
  const request=await requested(env);
  if(!request){console.log('No staff provisioning request is enabled.');return;}
  await authorizeGithub(env);
  const context=await renderContext(env),connection=context.variables.DATABASE_URL,url=new URL(connection);
  if(context.service.branch!==target.branch||decodeURIComponent(url.pathname)!==`/${target.database}`||decodeURIComponent(url.username)!==target.runtimeRole)throw new DeploymentError('Staff provisioning requires the existing managed application runtime database.');
  const db=new pg.Pool(secureConnection(connection));db.on('error',()=>{});
  try{
    await verifyRuntime(db);
    const marker=(await db.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()")).rows[0]?.marker;
    if(marker!==managedMarker)throw new DeploymentError('The database does not have the managed application identity.');
    const result=await provisionStaffAccount(db,{request,account:{email:requireValue(env,'STAFF_ACCOUNT_EMAIL').trim(),displayName:requireValue(env,'STAFF_ACCOUNT_DISPLAY_NAME'),password:requireValue(env,'STAFF_ACCOUNT_PASSWORD')},administrator:{email:requireValue(env,'BOOTSTRAP_ADMIN_EMAIL'),password:requireValue(env,'BOOTSTRAP_ADMIN_PASSWORD')},github:{actor:env.GITHUB_ACTOR,runId:env.GITHUB_RUN_ID,commit:env.GITHUB_SHA}});
    console.log(JSON.stringify({requestId:request.requestId,role:result.role,created:result.created,alreadyProvisioned:result.alreadyProvisioned??false,auditRecorded:true}));
  }finally{await db.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(process.argv[2]==='validate'){
      assertWorkflowScope(process.env);const request=await requested(process.env);
      if(request)assertProvisioners(process.env);
      if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`requested=${Boolean(request)}\n`);
      console.log(request?JSON.stringify({requestId:request.requestId,role:request.role,approvalRequired:true}):'No staff provisioning request is enabled.');
    }else if(process.argv[2]==='provision')await run();
    else throw new DeploymentError('Choose validate or provision.');
  }catch(error){console.error(error instanceof DeploymentError?error.message:'Staff provisioning failed. Secret-bearing details are suppressed. Check private inputs and administrator authorization.');process.exitCode=1;}
}
