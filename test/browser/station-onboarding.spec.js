import {test,expect} from '@playwright/test';
import {testPassword} from '../database.js';

const licence={name:'site-licence.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nPrivate site licence\n%%EOF')};
async function login(page,name){
  await page.goto('/');
  await page.locator('#stakeholderAccess').getByRole('button',{name:'Sign In',exact:true}).click();
  await page.getByLabel('Email address').fill(`${name}@example.test`);
  await page.getByLabel('Password',{exact:true}).fill(testPassword);
  await page.locator('#authForm button[type=submit]').click();
  await expect(page.locator('#authDialog')).not.toBeVisible();
}
async function proposal(page,name,latitude='1.51',longitude='34.95'){
  await page.goto('/#operator');
  await page.getByRole('link',{name:'Register a New Station',exact:true}).click();
  const form=page.locator('#stationRequestForm');
  await form.getByLabel('Proposed station name',{exact:true}).fill(name);
  await form.getByLabel('Operator / brand',{exact:true}).fill('Verified Frontier Energy');
  await form.getByLabel('Station district',{exact:true}).fill('Kumi');
  await form.getByLabel('Station area',{exact:true}).fill('Verified town site');
  await form.getByLabel('Station region',{exact:true}).selectOption('Eastern');
  await form.getByLabel('Station latitude',{exact:true}).fill(latitude);
  await form.getByLabel('Station longitude',{exact:true}).fill(longitude);
  await form.getByLabel('Applicant phone (international format)',{exact:true}).fill('+256700000000');
  await form.getByLabel('New station licence reference',{exact:true}).fill(`LIC-${name}`);
  return form;
}
async function review(page,name){
  await page.goto('/#admin');
  await page.getByRole('button',{name:'New station requests',exact:true}).click();
  const card=page.locator('.station-request').filter({hasText:name}).filter({has:page.locator('form.stationRequestReview')});
  await expect(card).toBeVisible();return card;
}
async function decision(card,status){
  await card.getByLabel('Decision',{exact:true}).selectOption(status);
  await card.getByLabel('Recorded review reason',{exact:true}).fill('Site, licence and applicant authority independently checked.');
  await card.getByRole('button',{name:'Record new station decision',exact:true}).click();
}
test('private proposal and later evidence become a verified station only after approval and fresh operator login',async({page,browser})=>{
  const adminContext=await browser.newContext({baseURL:test.info().project.use.baseURL}),admin=await adminContext.newPage();
  try{
    const name='O3 Verified Frontier Forecourt';
    await login(page,'alice');
    const form=await proposal(page,name);
    await form.getByRole('button',{name:'Check for existing stations',exact:true}).click();
    await expect(page.locator('#stationRequestDuplicates')).toContainText('No possible directory duplicates');
    await form.getByRole('button',{name:'Submit new station for verification',exact:true}).click();
    let card=page.locator('#stationRequests .station-request').filter({hasText:name});
    await expect(card).toContainText('Awaiting documents');
    expect((await (await page.request.get(`/api/v1/stations?q=${encodeURIComponent(name)}`)).json()).total).toBe(0);
    expect((await page.request.get('/api/v1/operator/stations')).status()).toBe(403);
    await login(admin,'admin');
    let adminCard=await review(admin,name);
    await expect(adminCard.locator('option[value=approved]')).toHaveAttribute('disabled','');
    await page.reload();
    card=page.locator('#stationRequests .station-request').filter({hasText:name});
    await card.locator('summary').click();
    await card.locator('input[name=evidence]').setInputFiles(licence);
    await card.getByRole('button',{name:'Upload station documents',exact:true}).click();
    await expect(card).toContainText('Pending verification');
    const request=(await (await page.request.get('/api/v1/station-requests')).json()).items.find(r=>r.station_name===name);
    const anonymous=await browser.newContext({baseURL:test.info().project.use.baseURL});
    expect((await anonymous.request.get(`/api/v1/attachments/${request.attachments[0].id}`)).status()).toBe(401);await anonymous.close();
    adminCard=await review(admin,name);
    await expect(adminCard.getByRole('link',{name:'site-licence.pdf ↓',exact:true})).toBeVisible();
    await decision(adminCard,'approved');
    await expect(admin.locator('#toast')).toContainText('New station decision recorded');
    const oldSession=await page.request.get('/api/v1/operator/stations');expect(oldSession.status()).toBe(401);
    await page.reload();await expect(page.locator('#accountButton')).toHaveText('Sign in');
    await login(page,'alice');
    await expect(page).toHaveURL(/#operator$/);
    await expect(page.getByRole('heading',{name:'Assigned Station Workspace',exact:true})).toBeVisible();
    const stations=(await (await page.request.get('/api/v1/operator/stations')).json()).items;
    expect(stations).toHaveLength(1);expect(stations[0].name).toBe(name);
    const price=page.locator('#operatorPrice');
    await price.locator('[name=stationId]').selectOption(String(stations[0].id));
    await price.locator('[name=price]').fill('5600');
    await price.getByRole('button',{name:'Publish official operator price',exact:true}).click();
    await expect(page.locator('#toast')).toContainText('Pump price published');
    expect((await (await page.request.get(`/api/v1/stations/${stations[0].id}`)).json()).prices[0].price).toBe(5600);
  }finally{await adminContext.close();}
});
test('duplicate guidance and administrator association reuse the verified station',async({page,browser})=>{
  const context=await browser.newContext({baseURL:test.info().project.use.baseURL}),admin=await context.newPage();
  try{
    await login(admin,'admin');
    const name='O3 Existing Association Forecourt';
    const session=await (await admin.request.get('/api/v1/auth/session')).json();
    const response=await admin.request.post('/api/v1/admin/stations',{headers:{origin:new URL(admin.url()).origin,'x-requested-with':'MafutaWatch','x-csrf-token':session.csrfToken},data:{operatorId:1,name,area:'Existing verified site',district:'Kumi',region:'Eastern',latitude:1.65,longitude:34.7}});
    expect(response.status()).toBe(201);const existing=await response.json();
    await login(page,'bob');
    const form=await proposal(page,name,'1.65','34.7');
    await form.getByRole('button',{name:'Check for existing stations',exact:true}).click();
    await expect(page.locator('#stationRequestDuplicates')).toContainText('Possible duplicate stations');
    await expect(page.locator('#stationRequestDuplicates')).toContainText('request access to that existing station');
    await form.locator('[name=evidence]').setInputFiles(licence);
    await form.getByRole('button',{name:'Submit new station for verification',exact:true}).click();
    await expect(page.locator('#stationRequests .station-request')).toContainText('Pending verification');
    const card=await review(admin,name);
    await decision(card,'approved');
    await expect(card.locator('.form-error')).toContainText('Possible duplicate stations');
    await card.getByLabel('Verified station association',{exact:true}).selectOption(String(existing.id));
    await decision(card,'approved');
    await expect(admin.locator('#toast')).toContainText('New station decision recorded');
    await page.reload();await login(page,'bob');
    expect((await (await page.request.get('/api/v1/operator/stations')).json()).items.map(s=>s.id)).toEqual([existing.id]);
    expect((await (await page.request.get(`/api/v1/stations?q=${encodeURIComponent(name)}`)).json()).total).toBe(1);
  }finally{await context.close();}
});
test('interrupted evidence upload is recoverable; changed retry details fail and rejection grants no access',async({page,browser})=>{
  await login(page,'verified1');
  const name='O3 Recoverable Proposed Site',form=await proposal(page,name,'1.8','34.8');
  await form.locator('[name=evidence]').setInputFiles(licence);
  await page.route('**/api/v1/station-requests/*/attachments',route=>route.abort(),{times:1});
  await form.getByRole('button',{name:'Submit new station for verification',exact:true}).click();
  await expect(form.locator('.form-error')).toContainText('Request saved, but documents were not all confirmed');
  await form.locator('[name=licenseReference]').fill('CHANGED-REFERENCE');
  await form.getByRole('button',{name:'Submit new station for verification',exact:true}).click();
  await expect(form.locator('.form-error')).toContainText('Submission key already used for different station details');
  await form.locator('[name=licenseReference]').fill(`LIC-${name}`);
  await form.getByRole('button',{name:'Submit new station for verification',exact:true}).click();
  await expect(page.locator('#stationRequests .station-request')).toContainText('Pending verification');
  const requests=(await (await page.request.get('/api/v1/station-requests')).json()).items;
  expect(requests).toHaveLength(1);expect(requests[0].attachments).toHaveLength(1);
  const context=await browser.newContext({baseURL:test.info().project.use.baseURL}),admin=await context.newPage();
  try{
    await login(admin,'admin');const card=await review(admin,name);await decision(card,'rejected');
    await expect(admin.locator('#toast')).toContainText('New station decision recorded');
    await page.reload();await expect(page.locator('#stationRequests .station-request')).toContainText('rejected');
    expect((await (await page.request.get('/api/v1/auth/session')).json()).user.role).toBe('citizen');
    expect((await page.request.get('/api/v1/operator/stations')).status()).toBe(403);
    expect((await (await page.request.get(`/api/v1/stations?q=${encodeURIComponent(name)}`)).json()).total).toBe(0);
  }finally{await context.close();}
});
