import {test,expect} from '@playwright/test';
import {testPassword} from '../database.js';
import {openWorkspacePage} from './helpers.js';

const entryPoints=[['Sign In','login'],['Authorized Staff Sign In','staff'],['Citizen Registration','register']];

async function openAuth(page,buttonName){
  await page.goto('/');
  await page.locator('#stakeholderAccess').getByRole('button',{name:buttonName,exact:true}).click();
  await expect(page.locator('#authDialog')).toBeVisible();
}
async function signIn(page,account,buttonName='Authorized Staff Sign In'){
  await openAuth(page,buttonName);
  await page.getByLabel('Email address').fill(`${account}@example.test`);
  await page.getByLabel('Password',{exact:true}).fill(testPassword);
  await page.locator('#authForm button[type=submit]').click();
  await expect(page.locator('#authDialog')).not.toBeVisible();
}
for(const width of [360,1440])for(const [entry] of entryPoints){
  test(`sign-in password stays hidden and toggles with preserved value at ${width}px · ${entry}`,async({page})=>{
    await page.setViewportSize({width,height:1000});
    const errors=[];const logs=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>logs.push(m.text()));
    await openAuth(page,entry);
    const input=page.getByLabel('Password',{exact:true});
    const toggle=page.locator('#authForm .password-toggle');
    await expect(input).toHaveAttribute('type','password');
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toHaveAttribute('aria-label','Show password');
    await expect(toggle).toHaveAttribute('type','button');
    await input.fill('Toggle-check-value-2026!');
    // Label association is unchanged, so accessible names still read "Password".
    await expect(page.getByLabel('Password',{exact:true})).toHaveCount(1);
    await toggle.click();
    await expect(input).toHaveAttribute('type','text');
    await expect(input).toHaveValue('Toggle-check-value-2026!');
    await expect(toggle).toHaveAttribute('aria-label','Hide password');
    // Nothing outside the input reveals or records the typed value.
    const leaked=await page.evaluate(value=>[...document.querySelectorAll('button,[aria-label],[title],code')].filter(el=>(el.getAttribute('aria-label')||'').includes(value)||(el.getAttribute('title')||'').includes(value)||(el.textContent||'').includes(value)).length,'Toggle-check-value-2026!');
    expect(leaked).toBe(0);
    await toggle.click();
    await expect(input).toHaveAttribute('type','password');
    await expect(input).toHaveValue('Toggle-check-value-2026!');
    // Keyboard: focus reaches the toggle and Enter/Space switch visibility without submitting.
    await input.focus();
    await page.keyboard.press('Tab');
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(input).toHaveAttribute('type','text');
    await page.keyboard.press('Space');
    await expect(input).toHaveAttribute('type','password');
    await expect(page.locator('#authDialog')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-label','Show password');
    const target=await toggle.boundingBox();
    expect(target.width>=44&&target.height>=40).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    expect(logs.some(text=>text.includes('Toggle-check-value-2026!'))).toBe(false);
  });
}
test('registration starts hidden, keeps the value when shown, and re-hides when the form mode changes',async({page})=>{
  await page.setViewportSize({width:360,height:1000});
  await openAuth(page,'Citizen Registration');
  const input=page.getByLabel('Password',{exact:true}),toggle=page.locator('#authForm .password-toggle');
  await expect(input).toHaveAttribute('type','password');
  await input.fill('Registration-toggle-value!');
  await toggle.click();
  await expect(input).toHaveAttribute('type','text');
  await expect(input).toHaveValue('Registration-toggle-value!');
  await page.locator('#registerToggle').click();
  await expect(page.locator('#authTitle')).toHaveText('Sign in');
  await expect(input).toHaveAttribute('type','password');
  await expect(input).toHaveValue('Registration-toggle-value!');
  await expect(toggle).toHaveAttribute('aria-label','Show password');
  await toggle.click();
  await expect(input).toHaveValue('Registration-toggle-value!');
});
test('administrator, inspector and analyst sign-in share the same accessible toggle',async({page})=>{
  for(const [entry] of entryPoints.filter(([,mode])=>mode!=='register')){
    await openAuth(page,entry);
    await expect(page.locator('#authForm .password-toggle')).toHaveAttribute('aria-label','Show password');
    await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('type','password');
    await page.keyboard.press('Escape');
    await expect(page.locator('#authDialog')).not.toBeVisible();
  }
});
test('password change, confirmation and administrator reset fields toggle independently',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await signIn(page,'admin');
  await openWorkspacePage(page,'Operations dashboard');
  await page.getByRole('button',{name:'User management',exact:true}).click();
  const provision=page.locator('#staffProvision');
  await expect(provision.locator('.password-toggle')).toHaveCount(3);
  await provision.locator('[name=password]').fill('Provision-toggle-value-2026!');
  await provision.locator('[name=confirmPassword]').fill('Provision-toggle-value-2026!');
  await provision.locator('[name=administratorPassword]').fill(testPassword);
  const tempToggle=provision.locator('.password-toggle').first();
  await expect(tempToggle).toHaveAttribute('aria-label','Show Temporary password');
  await tempToggle.click();
  await expect(provision.locator('[name=password]')).toHaveAttribute('type','text');
  await expect(provision.locator('[name=password]')).toHaveValue('Provision-toggle-value-2026!');
  await expect(provision.locator('[name=confirmPassword]')).toHaveAttribute('type','password');
  await expect(provision.locator('[name=administratorPassword]')).toHaveAttribute('type','password');
  await expect(provision.locator('.password-toggle').nth(1)).toHaveAttribute('aria-label','Show Confirm temporary password');
  await provision.locator('.password-toggle').nth(2).click();
  await expect(provision.locator('[name=administratorPassword]')).toHaveAttribute('type','text');
  await expect(provision.locator('[name=administratorPassword]')).toHaveValue(testPassword);
  await expect(provision.locator('.password-toggle').nth(2)).toHaveAttribute('aria-label','Hide Your administrator password');
  const reset=page.locator('#adminPasswordReset');
  await expect(reset.locator('.password-toggle')).toHaveCount(3);
  await reset.locator('[name=newPassword]').fill('Reset-toggle-value-2026!');
  await reset.locator('[name=confirmPassword]').fill('Reset-toggle-value-2026!');
  await reset.locator('[name=administratorPassword]').fill(testPassword);
  await reset.locator('.password-toggle').first().click();
  await expect(reset.locator('[name=newPassword]')).toHaveAttribute('type','text');
  await expect(reset.locator('[name=newPassword]')).toHaveValue('Reset-toggle-value-2026!');
  await expect(reset.locator('[name=confirmPassword]')).toHaveAttribute('type','password');
  await expect(reset.locator('.password-toggle').first()).toHaveAttribute('aria-label','Hide New temporary password');
  await openWorkspacePage(page,'My profile');
  const forms=[['#profilePasswordForm','Show Current password'],['#deletionForm','Show Current password']];
  if(await page.locator('#profileEmailForm').count())forms.splice(1,0,['#profileEmailForm','Show Current password']);
  else await expect(page.locator('#view')).toContainText('Email changes are unavailable on this deployment');
  for(const [form,expected] of forms){
    const field=page.locator(form);
    await expect(field.locator('.password-toggle').first()).toHaveAttribute('aria-label',expected);
    await expect(field.locator('.password-field input').first()).toHaveAttribute('type','password');
    await field.locator('.password-toggle').first().click();
    await expect(field.locator('.password-field input').first()).toHaveAttribute('type','text');
  }
  expect(errors).toEqual([]);
});
test('citizen password change fields toggle without submitting the form',async({page})=>{
  await signIn(page,'alice','Sign In');
  await openWorkspacePage(page,'My activity');
  const summary=page.locator('summary').filter({hasText:'Change your password'});
  await summary.click();
  const form=page.locator('#passwordForm');
  await expect(form.locator('.password-toggle')).toHaveCount(2);
  await expect(form.locator('.password-toggle').first()).toHaveAttribute('aria-label','Show Current password');
  await expect(form.locator('.password-toggle').nth(1)).toHaveAttribute('aria-label','Show New password (at least 12 characters)');
  await form.locator('[name=currentPassword]').fill('Citizen-toggle-current!');
  await form.locator('[name=newPassword]').fill('Citizen-toggle-new-value!');
  await form.locator('.password-toggle').first().click();
  await expect(form.locator('[name=currentPassword]')).toHaveValue('Citizen-toggle-current!');
  await expect(form.locator('[name=newPassword]')).toHaveAttribute('type','password');
  await expect(form.locator('[name=newPassword]')).toHaveValue('Citizen-toggle-new-value!');
  await expect(form.locator('.form-error')).toBeEmpty();
  await expect(form.locator('.password-toggle').first()).toHaveAttribute('aria-label','Hide Current password');
});
