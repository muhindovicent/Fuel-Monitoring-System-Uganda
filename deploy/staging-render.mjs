import pg from 'pg';
import {pathToFileURL} from 'node:url';

export const target={
  backend:'https://mafuta-watch-api.onrender.com',
  frontend:'https://mafuta-watch-staging.vercel.app',
  repository:'https://github.com/muhindovicent/Fuel-Monitoring-System-Uganda',
  branch:'ui/map-first-command-center',
  schema:'mafuta_v3',
  runtimeRole:'mafuta_v3_app',
};
export class DeploymentError extends Error {}
const requireValue=(env,name)=>{if(!env[name])throw new DeploymentError(`Required deployment secret is missing: ${name}`);return env[name];};

export function sameDatabase(left,right){
  const a=new URL(left),b=new URL(right);
  const host=value=>value.hostname.toLowerCase().replace('-pooler.','.');
  return host(a)===host(b)&&decodeURIComponent(a.pathname)===decodeURIComponent(b.pathname)&&(a.port||'5432')===(b.port||'5432');
}
export function secureConnection(value){
  const url=new URL(value);
  if(!['postgres:','postgresql:'].includes(url.protocol))throw new DeploymentError('A PostgreSQL connection is required.');
  // Explicit verification cannot be weakened by libpq-compatible URL parameters.
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert','uselibpqcompat'])url.searchParams.delete(key);
  return {connectionString:url.toString(),ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:15000,statement_timeout:15000};
}
export async function renderRequest(key,path,{method='GET',body}={}){
  const response=await fetch(`https://api.render.com/v1${path}`,{
    method,signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${key.trim()}`,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
    body:body?JSON.stringify(body):undefined,
  });
  if(!response.ok)throw new DeploymentError(`Render API request failed with HTTP ${response.status}.`);
  if(response.status===204)return null;
  return response.json();
}
export async function renderContext(env){
  const key=requireValue(env,'RENDER_API_KEY');
  const list=await renderRequest(key,'/services?name=mafuta-watch-api&limit=100');
  const services=list.map(entry=>entry.service??entry).filter(s=>s.serviceDetails?.url?.replace(/\/$/,'')===target.backend);
  if(services.length!==1)throw new DeploymentError('Exactly one matching MafutaWatch Render service is required.');
  const service=services[0];
  if(service.type!=='web_service')throw new DeploymentError('The target must be the existing web service.');
  const repository=new URL(service.repo);repository.username='';repository.password='';
  if(repository.toString().replace(/\.git\/?$/,'').replace(/\/$/,'')!==target.repository)throw new DeploymentError('Render repository does not match the authorized repository.');
  const entries=await renderRequest(key,`/services/${service.id}/env-vars?limit=100`);
  const variables=Object.fromEntries(entries.map(x=>x.envVar??x).map(x=>[x.key,x.value]));
  if(!variables.DATABASE_URL)throw new DeploymentError('The Render database connection could not be resolved from its service environment.');
  return {key,service,variables};
}
export async function inspectDatabase(connection,email){
  const pool=new pg.Pool(secureConnection(connection));pool.on('error',()=>{});let client;
  try{
    client=await pool.connect();await client.query('BEGIN READ ONLY');
    const privileges=(await client.query(`SELECT rolcreaterole AS can_create_roles,rolcreatedb AS can_create_databases,
      has_database_privilege(current_user,current_database(),'CREATE') AS can_create_schema FROM pg_roles WHERE rolname=current_user`)).rows[0];
    const columns=(await client.query(`SELECT table_schema,table_name,column_name FROM information_schema.columns
      WHERE table_schema IN ('public','mafuta_v3') AND table_name IN ('app_users','users','stations','price_reports','verified_prices','schema_migrations')
      ORDER BY table_schema,table_name,ordinal_position`)).rows;
    const legacy={};
    for(const table of ['app_users','stations','price_reports','verified_prices','audit_events']){
      const exists=(await client.query('SELECT to_regclass($1) AS relation',[`public.${table}`])).rows[0].relation;
      if(exists)legacy[table]=Number((await client.query(`SELECT count(*) AS count FROM public.${table}`)).rows[0].count);
    }
    let matchingAdmin=0;
    if(legacy.app_users)matchingAdmin=Number((await client.query("SELECT count(*) AS count FROM public.app_users WHERE email=$1 AND role='admin' AND active",[email.trim().toLowerCase()])).rows[0].count);
    await client.query('COMMIT');return {privileges,columns,legacy,matchingBootstrapAdministrator:matchingAdmin};
  }finally{client?.release();await pool.end();}
}
export async function inspect(env=process.env){
  const direct=requireValue(env,'NEON_DIRECT_DATABASE_URL'),email=requireValue(env,'BOOTSTRAP_ADMIN_EMAIL');
  const context=await renderContext(env);
  const databaseMatches=sameDatabase(context.variables.DATABASE_URL,direct);
  const report={service:{id:context.service.id,name:context.service.name,branch:context.service.branch,rootDirectory:context.service.rootDir,runtime:context.service.serviceDetails.runtime,plan:context.service.serviceDetails.plan,healthCheckPath:context.service.serviceDetails.healthCheckPath},environmentNames:Object.keys(context.variables).sort(),renderAndOwnerDatabaseMatch:databaseMatches};
  if(!databaseMatches)throw new DeploymentError('Render and the direct database secret do not identify the same database. No changes made.');
  report.database=await inspectDatabase(direct,email);
  console.log(JSON.stringify(report,null,2));return context;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(process.argv[2]!=='inspect')throw new DeploymentError('Only the read-only inspect operation is currently enabled.');
    await inspect();
  }catch(error){
    console.error(error instanceof DeploymentError?error.message:`Deployment inspection failed${error.code?` (${String(error.code).replace(/[^A-Z0-9_]/gi,'')})`:''}. Secret-bearing details are suppressed.`);
    process.exitCode=1;
  }
}
