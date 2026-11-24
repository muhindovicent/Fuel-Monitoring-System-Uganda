import {target,DeploymentError} from './hosting-shared.mjs';

export async function verifyHosted(origin,email,password){
  if(![target.backend,target.frontend].includes(origin))throw new DeploymentError('Smoke tests require an authorized hosting origin.');
  async function request(path,{status=200,method='GET',headers={},body}={}){
    const response=await fetch(`${origin}${path}`,{method,redirect:'error',signal:AbortSignal.timeout(60000),headers,...(body?{body:JSON.stringify(body)}:{})});
    if(response.status!==status)throw new DeploymentError(`Hosted check failed: ${method} ${path} returned ${response.status}; expected ${status}.`);
    return response;
  }
  const home=await request('/'),policy=home.headers.get('content-security-policy')??'';
  if(!policy.includes("default-src 'self'")||!policy.includes("frame-ancestors 'none'")||home.headers.get('x-frame-options')!=='DENY'||home.headers.get('x-content-type-options')!=='nosniff'||!home.headers.has('strict-transport-security'))throw new DeploymentError('Hosted root document security headers are incomplete.');
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
  return {origin,rootSecurityHeaders:true,readiness:true,publicCollections:true,administratorLogin:true,sessionCookieFlags:true,originAndCsrfProtection:true,logoutRevocation:true};
}

export async function verifyHostedBrowser(email,password){
  const {chromium}=await import('playwright'),browser=await chromium.launch();let page,context;
  try{
    context=await browser.newContext({viewport:{width:1440,height:1000}});page=await context.newPage();page.setDefaultTimeout(60000);
    const errors=[];page.on('pageerror',()=>errors.push(true));
    await page.goto(target.frontend,{waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{name:'Find Affordable Fuel. Drive Smarter.',exact:true}).waitFor();
    const access=page.locator('#stakeholderAccess');
    for(const name of ['Citizen Registration','Sign In','Authorized Staff Sign In'])await access.getByRole('button',{name,exact:true}).waitFor();
    await access.getByRole('link',{name:'Station Operator Access Request',exact:true}).waitFor();
    await page.locator('#accountButton').click();
    await page.locator('#authForm [name=email]').fill(email);
    await page.locator('#authForm [name=password]').fill(password);
    await page.locator('#authForm button[type=submit]').click();
    await page.locator('#authDialog').waitFor({state:'hidden'});
    const session=await page.evaluate(()=>fetch('/api/v1/auth/session',{cache:'no-store'}).then(r=>r.json()));
    const cookie=(await context.cookies(target.frontend)).find(c=>c.name==='mfw_session');
    if(session.user?.role!=='admin'||!cookie?.httpOnly||!cookie.secure||cookie.sameSite!=='Strict')throw new DeploymentError('Hosted browser session/cookie verification failed.');
    await page.locator('#workspaceLink').click();
    await page.getByRole('heading',{name:'National Command Center',exact:true}).waitFor();
    const dashboard=await page.evaluate(()=>fetch('/api/v1/admin/dashboard',{cache:'no-store'}).then(r=>r.status));
    if(dashboard!==200)throw new DeploymentError('Hosted browser cannot access the authorized administrator workspace.');
    await page.locator('#logoutButton').click();await page.locator('#logoutButton').waitFor({state:'hidden'});
    const ended=await page.evaluate(()=>fetch('/api/v1/auth/session',{cache:'no-store'}).then(r=>r.json()));
    if(ended.user!==null||errors.length)throw new DeploymentError('Hosted browser logout or JavaScript verification failed.');
    return {origin:target.frontend,chromiumLogin:true,browserCookieAccepted:true,administratorWorkspace:true,browserLogout:true,javascriptErrors:0};
  }catch(error){
    if(error instanceof DeploymentError)throw error;
    throw new DeploymentError('Hosted browser smoke test failed. Secret-bearing browser details are suppressed.');
  }finally{
    try{if(page)await page.evaluate(async()=>{const session=await fetch('/api/v1/auth/session',{cache:'no-store'}).then(r=>r.json());if(session.user)await fetch('/api/v1/auth/logout',{method:'POST',headers:{'X-Requested-With':'MafutaWatch','X-CSRF-Token':session.csrfToken}});});}catch(_error){/* Best-effort cleanup; no session contents are logged. */}
    await context?.close();await browser.close();
  }
}
