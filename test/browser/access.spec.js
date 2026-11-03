import {test,expect} from '@playwright/test';
import {testPassword} from '../database.js';

const roles=[
  ['admin','admin','admin','National Command Center','/api/v1/admin/users',200],
  ['inspector','inspector','admin','Inspection Workspace','/api/v1/admin/reports',200],
  ['analyst','analyst','admin','Market Intelligence Workspace','/api/v1/admin/dashboard',200],
  ['operator','operator','operator','Assigned Station Workspace','/api/v1/operator/stations',200],
  ['alice','citizen','activity','Citizen Dashboard','/api/v1/admin/dashboard',403],
];
for(const width of [360,1440])for(const [account,role,route,title,endpoint,status] of roles){
  test(`${role} signs in, navigates and signs out without unauthorized access at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:1000});await page.goto('/');
    const access=page.locator('#stakeholderAccess');
    for(const name of ['Citizen Registration','Sign In','Authorized Staff Sign In'])await expect(access.getByRole('button',{name,exact:true})).toBeVisible();
    await expect(access.getByRole('link',{name:'Station Operator Access Request',exact:true})).toHaveAttribute('href','#operator');
    // A citizen can use the staff entry point, but the API still returns only its citizen role.
    await access.getByRole('button',{name:role==='operator'?'Sign In':'Authorized Staff Sign In',exact:true}).click();
    await page.getByLabel('Email address').fill(`${account}@example.test`);
    await page.getByLabel('Password',{exact:true}).fill(testPassword);
    await page.locator('#authForm button[type=submit]').click();
    await expect(page).toHaveURL(new RegExp(`#${route}$`));
    await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
    await expect(page.locator('#accountButton')).toContainText(role);
    const session=await(await page.request.get('/api/v1/auth/session')).json();expect(session.user.role).toBe(role);
    expect((await page.request.get(endpoint)).status()).toBe(status);
    if(role!=='admin')expect((await page.request.get('/api/v1/admin/users')).status()).toBe(403);
    if(['analyst','operator','citizen'].includes(role))expect((await page.request.get('/api/v1/admin/reports')).status()).toBe(403);
    if(['analyst','inspector'].includes(role))expect((await page.request.get('/api/v1/operator/stations')).status()).toBe(403);
    if(['citizen','operator'].includes(role)){
      await page.goto('/#admin');await expect(page.getByRole('heading',{name:'Workspace access is restricted.',exact:true})).toBeVisible();
      expect((await page.request.get('/api/v1/admin/dashboard')).status()).toBe(403);
      await page.locator('#accountButton').click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
    }
    if(width===360){
      await page.locator('#sidebarToggle').click();await expect(page.locator('#workspaceSidebar')).toBeVisible();
      await page.keyboard.press('Escape');await expect(page.locator('#workspaceSidebar')).not.toBeVisible();
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const cookie=(await page.context().cookies()).find(c=>c.name==='mfw_session');expect(cookie.httpOnly).toBe(true);expect(cookie.sameSite).toBe('Strict');
    const original=await page.request.get('/api/v1/auth/session');const authenticated=await original.json();
    const refused=await page.request.post('/api/v1/auth/logout',{headers:{Origin:new URL(page.url()).origin,'X-Requested-With':'MafutaWatch','X-CSRF-Token':'incorrect'}});expect(refused.status()).toBe(403);
    await page.locator('#logoutButton').click();await expect(page.locator('#stakeholderAccess')).toBeVisible();await expect(page).toHaveURL(/#overview$/);
    expect((await(await page.request.get('/api/v1/auth/session')).json()).user).toBeNull();
    expect((await page.request.get('/api/v1/admin/dashboard')).status()).toBe(401);
    const replay=await page.request.get('/api/v1/auth/session',{headers:{Cookie:`mfw_session=${cookie.value}`}});expect((await replay.json()).user).toBeNull();
    expect(authenticated.csrfToken).toBeTruthy();
  });
}
test('administrators assign a non-administrator role from User management',async({page})=>{
  await page.goto('/');await page.locator('#stakeholderAccess').getByRole('button',{name:'Citizen Registration',exact:true}).click();
  await page.getByLabel('Display name').fill('Role Browser');await page.getByLabel('Email address').fill('role.browser@example.test');
  await page.getByLabel('Password',{exact:true}).fill(testPassword);await page.locator('#authForm input[name=consent]').check();
  await page.locator('#authForm button[type=submit]').click();await expect(page.getByRole('heading',{name:'Citizen Dashboard',exact:true})).toBeVisible();
  await page.locator('#logoutButton').click();
  await page.locator('#stakeholderAccess').getByRole('button',{name:'Authorized Staff Sign In',exact:true}).click();
  await page.getByLabel('Email address').fill('admin@example.test');await page.getByLabel('Password',{exact:true}).fill(testPassword);
  await page.locator('#authForm button[type=submit]').click();await expect(page.getByRole('heading',{name:'National Command Center',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'User management',exact:true}).click();await expect(page.getByRole('heading',{name:'Staff accounts & access',exact:true})).toBeVisible();
  page.on('dialog',async dialog=>dialog.type()==='confirm'?dialog.accept():dialog.accept('Role confirmed by the operating organization for this browser check.'));
  const row=page.locator('tbody tr').filter({hasText:'role.browser@example.test'});await expect(row.locator('select[data-role-for]')).toHaveValue('citizen');
  await row.locator('select[data-role-for]').selectOption('inspector');await row.getByRole('button',{name:'Update role',exact:true}).click();
  await expect(page.locator('#toast')).toContainText('Account role updated and recorded.');
  await expect(page.locator('tbody tr').filter({hasText:'role.browser@example.test'})).toContainText('inspector');
});
test('administrators provision an inspector account that can immediately sign in',async({page})=>{
  const email='provisioned.inspector@example.test',password='Provisioned-staff-password-2026!';
  await page.goto('/');await page.locator('#stakeholderAccess').getByRole('button',{name:'Authorized Staff Sign In',exact:true}).click();
  await page.getByLabel('Email address').fill('admin@example.test');await page.getByLabel('Password',{exact:true}).fill(testPassword);
  await page.locator('#authForm button[type=submit]').click();await expect(page.getByRole('heading',{name:'National Command Center',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'User management',exact:true}).click();await expect(page.getByRole('heading',{name:'Staff accounts & access',exact:true})).toBeVisible();
  const form=page.locator('#staffProvision');
  await form.locator('[name=email]').fill(email);await form.locator('[name=displayName]').fill('Provisioned Inspector');
  await form.locator('[name=role]').selectOption('inspector');await form.locator('[name=password]').fill(password);await form.locator('[name=confirmPassword]').fill(password);
  await form.locator('[name=administratorPassword]').fill(testPassword);await form.locator('[name=reason]').fill('Identity and appointment verified through the approved staff procedure.');
  await form.locator('[name=identityVerified]').check();await form.getByRole('button',{name:'Provision staff account',exact:true}).click();
  await expect(page.locator('#toast')).toContainText('Staff account created.');
  await expect(page.locator('tbody')).toContainText(email);
  await page.locator('#logoutButton').click();
  await page.locator('#stakeholderAccess').getByRole('button',{name:'Authorized Staff Sign In',exact:true}).click();
  await page.getByLabel('Email address').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);
  await page.locator('#authForm button[type=submit]').click();
  await expect(page).toHaveURL(/#admin$/);await expect(page.getByRole('heading',{name:'Inspection Workspace',exact:true})).toBeVisible();
  expect((await page.request.get('/api/v1/admin/reports')).status()).toBe(200);
  expect((await page.request.get('/api/v1/admin/users')).status()).toBe(403);
});
test('administrators assign an operator account to a station from the directory',async({page})=>{
  await page.goto('/');await page.locator('#stakeholderAccess').getByRole('button',{name:'Authorized Staff Sign In',exact:true}).click();
  await page.getByLabel('Email address').fill('admin@example.test');await page.getByLabel('Password',{exact:true}).fill(testPassword);
  await page.locator('#authForm button[type=submit]').click();await expect(page.getByRole('heading',{name:'National Command Center',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Station directory',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Assign an operator to a station',exact:true})).toBeVisible();
  const form=page.locator('#stationAssign'),stationOption=form.locator('[name=stationId] option').nth(1);
  const stationId=await stationOption.getAttribute('value'),stationName=(await stationOption.textContent()).replace(/ · .*$/,'');
  await form.locator('[name=stationId]').selectOption(stationId);
  const operatorValue=await form.locator('[name=userId] option').filter({hasText:'operator@example.test'}).getAttribute('value');
  await form.locator('[name=userId]').selectOption(operatorValue);
  await form.locator('[name=reason]').fill('Operator authorization confirmed for this station by the operating organization.');
  await form.getByRole('button',{name:'Assign station access',exact:true}).click();
  await expect(page.locator('#toast')).toContainText('Station assignment saved and audited.');
  await expect(page.locator('.list-item').filter({hasText:'operator@example.test'}).filter({hasText:stationName})).toHaveCount(1);
  await page.locator('#logoutButton').click();
  await page.locator('#stakeholderAccess').getByRole('button',{name:'Sign In',exact:true}).click();
  await page.getByLabel('Email address').fill('operator@example.test');await page.getByLabel('Password',{exact:true}).fill(testPassword);
  await page.locator('#authForm button[type=submit]').click();await expect(page.getByRole('heading',{name:'Assigned Station Workspace',exact:true})).toBeVisible();
  await expect(page.locator(`#operatorPrice [name=stationId] option[value="${stationId}"]`)).toHaveCount(1);
});
test('operator request continues the citizen application flow without self-promotion',async({page})=>{
  await page.goto('/');await page.locator('#stakeholderAccess').getByRole('link',{name:'Station Operator Access Request'}).click();
  await expect(page.getByRole('heading',{name:'Station Operator Access Request',exact:true})).toBeVisible();
  await expect(page.locator('#view')).toContainText('Registration does not make you an operator.');
  await page.locator('#view').getByRole('button',{name:'Sign In',exact:true}).click();
  await page.getByLabel('Email address').fill('bob@example.test');await page.getByLabel('Password',{exact:true}).fill(testPassword);
  await page.locator('#authForm button[type=submit]').click();await expect(page.getByRole('heading',{name:'Citizen Dashboard',exact:true})).toBeVisible();
  await page.locator('#view').getByRole('link',{name:'Station Operator Access Request →'}).click();
  await expect(page.locator('#applicationForm')).toBeVisible();
  await page.locator('#applicationForm [name=stationId]').selectOption('1');await page.locator('#applicationForm [name=licenseReference]').fill('Browser license review fixture');
  await page.getByRole('button',{name:'Submit access application',exact:true}).click();await expect(page.locator('.list-item').filter({hasText:'Browser license review fixture'})).toContainText('pending');
  expect((await(await page.request.get('/api/v1/auth/session')).json()).user.role).toBe('citizen');
  expect((await page.request.get('/api/v1/operator/stations')).status()).toBe(403);
});
