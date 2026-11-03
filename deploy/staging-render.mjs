import pg from 'pg';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {target,DeploymentError,requireValue,sameDatabase,secureConnection,managedConnection,assertEmptyLegacy} from './hosting-shared.mjs';
import {prepareDatabase} from './staging-database.mjs';
import {verifyHosted,verifyHostedBrowser} from './staging-smoke.mjs';
export {target,DeploymentError,sameDatabase,secureConnection} from './hosting-shared.mjs';
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
  if(!databaseMatches&&!managedConnection(context.variables.DATABASE_URL,direct))throw new DeploymentError('Render and the direct database secret do not identify an authorized database. No changes made.');
  report.database=await inspectDatabase(direct,email);
  console.log(JSON.stringify(report,null,2));return context;
}
export async function waitForDeploy(key,serviceId,deployId){
  let previous;
  const deadline=Date.now()+10*60*1000;
  while(Date.now()<deadline){
    const deployment=await renderRequest(key,`/services/${serviceId}/deploys/${deployId}`);
    if(deployment.status!==previous){console.log(`Render deployment ${deployId}: ${deployment.status}`);previous=deployment.status;}
    if(deployment.status==='live')return deployment;
    if(['build_failed','update_failed','pre_deploy_failed','canceled','deactivated'].includes(deployment.status))throw new DeploymentError(`Render deployment ended with status ${deployment.status}.`);
    await delay(10000);
  }
  throw new DeploymentError('Render deployment did not become live within ten minutes.');
}
export async function upgrade(env=process.env){
  if(env.GITHUB_REPOSITORY!=='muhindovicent/Fuel-Monitoring-System-Uganda'||env.GITHUB_REF!==`refs/heads/${target.branch}`||!/^([a-f0-9]{40})$/.test(env.GITHUB_SHA??''))throw new DeploymentError('Deployment must run from the authorized GitHub Actions feature branch.');
  const owner=requireValue(env,'NEON_DIRECT_DATABASE_URL'),email=requireValue(env,'BOOTSTRAP_ADMIN_EMAIL').trim().toLowerCase(),password=requireValue(env,'BOOTSTRAP_ADMIN_PASSWORD');
  const context=await renderContext(env),{key,service,variables}=context,base=`/services/${service.id}`;
  if(!sameDatabase(variables.DATABASE_URL,owner)&&!managedConnection(variables.DATABASE_URL,owner))throw new DeploymentError('Render does not identify the authorized legacy or managed database.');
  const before=await inspectDatabase(owner,email);assertEmptyLegacy(before);
  if(!before.privileges.can_create_roles||!before.privileges.can_create_databases)throw new DeploymentError('The owner secret lacks database provisioning privileges.');
  const prepared=await prepareDatabase(owner,variables.DATABASE_URL,email,password);
  console.log(JSON.stringify({database:target.database,legacyRecordsPreserved:true,runtime:prepared.privileges}));
  const environment={DATABASE_URL:prepared.runtimeUrl,NODE_ENV:'production',NODE_VERSION:'24',APP_ORIGIN:target.frontend,PGSSLMODE:'verify-full',TRUST_PROXY_HOPS:'1',PORT:'10000'};
  const settings={branch:target.branch,rootDir:'',autoDeployTrigger:'off',serviceDetails:{healthCheckPath:'/health/ready',envSpecificDetails:{dockerfilePath:'./Dockerfile',dockerContext:'.',dockerCommand:'node server/index.js'}}};
  const deployments=await renderRequest(key,`${base}/deploys?limit=20`),live=deployments.map(d=>d.deploy??d).find(d=>d.status==='live');
  const unchanged=live?.commit?.id===env.GITHUB_SHA&&service.branch===target.branch&&service.rootDir===''&&service.serviceDetails.healthCheckPath==='/health/ready'&&Object.entries(environment).every(([name,value])=>variables[name]===value);
  if(!unchanged){
    let changed=false;const changedNames=[];
    try{
      changed=true;
      await renderRequest(key,base,{method:'PATCH',body:settings});
      for(const [name,value] of Object.entries(environment)){await renderRequest(key,`${base}/env-vars/${name}`,{method:'PUT',body:{value}});changedNames.push(name);}
      const deployment=await renderRequest(key,`${base}/deploys`,{method:'POST',body:{commitId:env.GITHUB_SHA,clearCache:'do_not_clear'}});
      await waitForDeploy(key,service.id,deployment.id);
      console.log(JSON.stringify(await verifyHosted(target.backend,email,password)));
    }catch(error){
      if(changed){
        try{
          const docker=service.serviceDetails.envSpecificDetails;
          await renderRequest(key,base,{method:'PATCH',body:{branch:service.branch,rootDir:service.rootDir,autoDeployTrigger:service.autoDeployTrigger??(service.autoDeploy==='yes'?'commit':'off'),serviceDetails:{healthCheckPath:service.serviceDetails.healthCheckPath,envSpecificDetails:{dockerfilePath:docker.dockerfilePath,dockerContext:docker.dockerContext,dockerCommand:docker.dockerCommand}}}});
          for(const name of changedNames)await renderRequest(key,`${base}/env-vars/${name}`,Object.hasOwn(variables,name)?{method:'PUT',body:{value:variables[name]}}:{method:'DELETE'});
          if(live?.commit?.id){const rollback=await renderRequest(key,`${base}/deploys`,{method:'POST',body:{commitId:live.commit.id}});await waitForDeploy(key,service.id,rollback.id);}
          console.log('Previous Render service configuration and environment restored. Both databases were preserved.');
        }catch(_rollbackError){console.error('Render rollback could not be completed. Check the service dashboard; databases were preserved.');}
      }
      throw error;
    }
  }else console.log(JSON.stringify(await verifyHosted(target.backend,email,password)));
  const after=await inspectDatabase(owner,email);
  if(JSON.stringify(before.legacy)!==JSON.stringify(after.legacy)||before.matchingBootstrapAdministrator!==after.matchingBootstrapAdministrator)throw new DeploymentError('Legacy record counts changed during deployment.');
  let frontendReady=false;
  try{const response=await fetch(`${target.frontend}/health/ready`,{signal:AbortSignal.timeout(60000)});frontendReady=response.ok&&(await response.json()).status==='ready';}catch(_error){/* Frontend publication follows backend verification. */}
  if(frontendReady){console.log(JSON.stringify(await verifyHosted(target.frontend,email,password)));console.log(JSON.stringify(await verifyHostedBrowser(email,password)));}
  else console.log('Backend verified. Publish the matching Vercel frontend, then rerun this workflow to verify its same-origin authentication.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(process.argv[2]==='inspect')await inspect();
    else if(process.argv[2]==='upgrade')await upgrade();
    else throw new DeploymentError('Select the inspect or upgrade operation.');
  }catch(error){
    console.error(error instanceof DeploymentError?error.message:`Deployment operation failed${error.code?` (${String(error.code).replace(/[^A-Z0-9_]/gi,'')})`:''}. Secret-bearing details are suppressed.`);
    process.exitCode=1;
  }
}
