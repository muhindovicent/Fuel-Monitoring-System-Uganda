import {test,expect} from '@playwright/test';
import {testPassword} from '../database.js';
import {openWorkspacePage} from './helpers.js';

async function signIn(page,who='alice'){
  await page.goto('/#activity');await page.locator('#accountButton').click();
  await page.getByLabel('Email address').fill(`${who}@example.test`);await page.getByLabel('Password',{exact:true}).fill(testPassword);
  await page.locator('#authForm').getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.locator('#authDialog')).not.toBeVisible();await expect(page.getByRole('heading',{name:'Your contributions. In one place.'})).toBeVisible();
}
for(const width of [360,768,1024,1440]){
  test(`dashboard shell is responsive and keyboard accessible at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:1000});await signIn(page,'analyst');await openWorkspacePage(page,'Operations dashboard');
    await expect(page.locator('#workspaceRole')).toHaveText('Market analysis');
    if(width<=900){
      await expect(page.locator('#workspaceSidebar')).not.toBeVisible();
      await page.locator('#sidebarToggle').click();await expect(page.locator('#sidebarToggle')).toHaveAttribute('aria-expanded','true');
      await expect(page.locator('#workspaceSidebar')).toBeVisible();await page.keyboard.press('Escape');
      await expect(page.locator('#sidebarToggle')).toBeFocused();await expect(page.locator('#workspaceSidebar')).not.toBeVisible();
    }else{
      await page.locator('#sidebarToggle').click();await expect(page.locator('#sidebarToggle')).toHaveAttribute('aria-expanded','false');
      await expect(page.locator('#navigation').getByRole('link',{name:'My activity',exact:true})).toBeVisible();
      await page.locator('#sidebarToggle').click();await expect(page.locator('#sidebarToggle')).toHaveAttribute('aria-expanded','true');
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:test.info().outputPath(`workspace-${width}.png`),fullPage:true});
    await expect(page.getByRole('button',{name:'Price review',exact:true})).toHaveCount(0);
    expect((await page.request.get('/api/v1/admin/reports')).status()).toBe(403);
  });
}
for(const [who,role,workspace] of [['alice','citizen','My activity'],['operator','operator','Station workspace'],['inspector','inspector','Operations dashboard'],['analyst','analyst','Operations dashboard'],['admin','admin','Operations dashboard']]){
  test(`${role} retains its authorized stakeholder workspace`,async({page})=>{
    await signIn(page,who);await openWorkspacePage(page,workspace);
    await expect(page.locator('#accountButton')).toContainText(role);
    if(role==='operator'){await expect(page.locator('#operatorPrice')).toBeVisible();await expect(page.locator('#tokenForm')).toBeVisible();}
    if(role==='citizen')await expect(page.locator('#navigation').getByRole('link',{name:'Operations dashboard'})).toHaveCount(0);
    if(['inspector','admin'].includes(role))await expect(page.getByRole('button',{name:'Consumer cases',exact:true})).toBeVisible();
    if(role==='admin'){
      const sessionResponse=await page.request.get('/api/v1/auth/session');expect(sessionResponse.status()).toBe(200);
      const session=await sessionResponse.json();
      const published=await page.request.put('/api/v1/stations/1/prices',{headers:{Origin:new URL(page.url()).origin,'X-Requested-With':'MafutaWatch','X-CSRF-Token':session.csrfToken},data:{fuel:'petrol',price:5555}});expect(published.status()).toBe(200);
      await page.getByRole('button',{name:'Refresh data',exact:true}).click();
      const data=await (await page.request.get('/api/v1/admin/dashboard')).json();
      expect(data.trend.length).toBeGreaterThan(0);await expect(page.locator('.trend-column')).toHaveCount(Math.min(14,data.trend.length));await expect(page.locator('.price-trend')).toContainText(Number(data.trend.at(-1).average).toLocaleString('en-UG'));
    }
  });
}
test('truck and boda preferences personalize existing citizen forms without changing permissions',async({page})=>{
  await signIn(page);await page.getByRole('button',{name:'Truck driver',exact:true}).click();
  await expect(page.getByRole('button',{name:'Truck driver',exact:true})).toHaveAttribute('aria-pressed','true');
  await openWorkspacePage(page,'Trip cost planner');await expect(page.locator('#tripForm [name=kmPerLitre]')).toHaveValue('3');await expect(page.locator('#tripForm [name=fuel]')).toHaveValue('diesel');
  await openWorkspacePage(page,'Consumer complaints');await page.getByText('+ Open a consumer case',{exact:true}).click();await expect(page.locator('#complaintForm [name=vehicleType]')).toHaveValue('truck');
  const session=await page.request.get('/api/v1/auth/session');expect(session.status()).toBe(200);expect((await session.json()).user.role).toBe('citizen');
  expect((await page.request.get('/api/v1/admin/dashboard')).status()).toBe(403);
  await openWorkspacePage(page,'My activity');await page.getByRole('button',{name:'Boda rider',exact:true}).click();
  await openWorkspacePage(page,'Trip cost planner');await expect(page.locator('#tripForm [name=kmPerLitre]')).toHaveValue('30');await expect(page.locator('#tripForm [name=fuel]')).toHaveValue('petrol');
});
test('notification drawer reads real case updates and marks only displayed records read',async({page})=>{
  await signIn(page);await openWorkspacePage(page,'Consumer complaints');await page.getByText('+ Open a consumer case',{exact:true}).click();
  await page.locator('#complaintForm [name=stationId]').selectOption('1');await page.getByLabel('What happened?').fill('Notification test: requesting review of a receipt and pump reading.');
  await page.getByRole('button',{name:'Create tracked case'}).click();await expect(page.locator('.ticket-card').filter({hasText:'Notification test:'})).toBeVisible();
  await page.locator('#notificationButton').click();await expect(page.locator('#detailTitle')).toHaveText('Notifications');await expect(page.locator('.notification-item')).not.toHaveCount(0);
  await expect(page.locator('#detailContent')).toContainText('received');
  await page.getByRole('button',{name:'Mark displayed notifications read',exact:true}).click();await expect(page.locator('#detailDialog')).not.toBeVisible();
  const records=await (await page.request.get('/api/v1/me/notifications')).json();expect(records.items.slice(0,10).every(n=>n.read_at)).toBe(true);
});
