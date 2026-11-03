export const target={
  backend:'https://mafuta-watch-api.onrender.com',
  frontend:'https://mafuta-watch-staging.vercel.app',
  repository:'https://github.com/muhindovicent/Fuel-Monitoring-System-Uganda',
  branch:'ui/map-first-command-center',
  database:'mafutawatch_v3',
  runtimeRole:'mafuta_v3_app',
};
export const managedMarker='MafutaWatch Node24 staging; muhindovicent/Fuel-Monitoring-System-Uganda';
export class DeploymentError extends Error {}
export const requireValue=(env,name)=>{if(!env[name])throw new DeploymentError(`Required deployment secret is missing: ${name}`);return env[name];};
export const identifier=value=>`"${value.replace(/"/g,'""')}"`;
export const literal=value=>`'${value.replace(/'/g,"''")}'`;
export function sameDatabase(left,right){
  const a=new URL(left),b=new URL(right),host=value=>value.hostname.toLowerCase().replace('-pooler.','.');
  return host(a)===host(b)&&decodeURIComponent(a.pathname)===decodeURIComponent(b.pathname)&&(a.port||'5432')===(b.port||'5432');
}
export function applicationUrl(value,{username,password}={}){
  const url=new URL(value);url.pathname=`/${target.database}`;
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert','uselibpqcompat','options'])url.searchParams.delete(key);
  if(username)url.username=username;
  if(password)url.password=password;
  return url.toString();
}
export function managedConnection(value,owner){return decodeURIComponent(new URL(value).username)===target.runtimeRole&&sameDatabase(value,applicationUrl(owner));}
export function secureConnection(value){
  const url=new URL(value);
  if(!['postgres:','postgresql:'].includes(url.protocol))throw new DeploymentError('A PostgreSQL connection is required.');
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert','uselibpqcompat'])url.searchParams.delete(key);
  return {connectionString:url.toString(),ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:15000,statement_timeout:15000};
}
export function assertEmptyLegacy(report){
  const l=report.legacy;
  if(l.app_users!==1||report.matchingBootstrapAdministrator!==1||['stations','price_reports','verified_prices','audit_events'].some(t=>l[t]!==0)){
    throw new DeploymentError('Legacy business records or additional accounts require an explicit data migration. No service switch is allowed.');
  }
}
