import {target,DeploymentError} from './hosting-shared.mjs';

export async function verifyHosted(origin,email,password){
  if(![target.backend,target.frontend].includes(origin))throw new DeploymentError('Smoke tests require an authorized hosting origin.');
  async function request(path,{status=200,method='GET',headers={},body}={}){
    const response=await fetch(`${origin}${path}`,{method,redirect:'error',signal:AbortSignal.timeout(60000),headers,...(body?{body:JSON.stringify(body)}:{})});
    if(response.status!==status)throw new DeploymentError(`Hosted check failed: ${method} ${path} returned ${response.status}; expected ${status}.`);
    return response;
  }
  const ready=await(await request('/health/ready')).json();
  if(ready.status!=='ready')throw new DeploymentError('Hosted database readiness failed.');
  for(const path of ['/api/v1/stations','/api/v1/operators','/api/v1/rooms','/api/v1/advisories']){
    const response=await request(path),data=await response.json();
    if(!Array.isArray(data.items)||!response.headers.get('cache-control')?.includes('no-store'))throw new DeploymentError(`Hosted collection or cache contract failed: ${path}.`);
  }
  await request('/api/v1/summary');
  await request('/api/v1/admin/dashboard',{status:401});
  const protection={'Content-Type':'application/json',Origin:target.frontend,'X-Requested-With':'MafutaWatch'};
  const login=await request('/api/v1/auth/login',{method:'POST',headers:protection,body:{email,password}});
  const cookies=login.headers.getSetCookie(),cookie=cookies.find(value=>value.startsWith('mfw_session='));
  if(!cookie||!['secure','httponly','samesite=strict'].every(flag=>cookie.toLowerCase().includes(flag)))throw new DeploymentError('Production session cookie flags are incomplete.');
  const auth=await login.json();
  if(auth.user?.role!=='admin'||!auth.csrfToken)throw new DeploymentError('Administrator authentication contract failed.');
  const sessionHeaders={Cookie:cookie.split(';')[0]};
  try{
    const session=await(await request('/api/v1/auth/session',{headers:sessionHeaders})).json();
    if(session.user?.role!=='admin'||session.csrfToken!==auth.csrfToken)throw new DeploymentError('Hosted session continuity failed.');
    for(const path of ['/api/v1/admin/dashboard','/api/v1/admin/users','/api/v1/tickets','/api/v1/applications'])await request(path,{headers:sessionHeaders});
    await request('/api/v1/auth/logout',{method:'POST',status:403,headers:{...protection,...sessionHeaders,'X-CSRF-Token':auth.csrfToken,Origin:'https://untrusted.example'}});
    await request('/api/v1/auth/logout',{method:'POST',status:403,headers:{...protection,...sessionHeaders}});
    await request('/api/v1/auth/logout',{method:'POST',status:403,headers:{...sessionHeaders,Origin:target.frontend,'X-CSRF-Token':auth.csrfToken}});
  }finally{
    await request('/api/v1/auth/logout',{method:'POST',status:204,headers:{...protection,...sessionHeaders,'X-CSRF-Token':auth.csrfToken}});
  }
  const ended=await(await request('/api/v1/auth/session',{headers:sessionHeaders})).json();
  if(ended.user!==null)throw new DeploymentError('Logout did not revoke the hosted session.');
  return {origin,readiness:true,publicCollections:true,administratorLogin:true,sessionCookieFlags:true,originAndCsrfProtection:true,logoutRevocation:true};
}
