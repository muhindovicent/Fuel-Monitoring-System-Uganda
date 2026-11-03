import { test,expect } from '@playwright/test';
import {testPassword} from '../database.js';

for(const width of [360,768,1024,1440]){
  test(`public portal layout and navigation at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/');await expect(page.getByRole('heading',{name:'Find Affordable Fuel. Drive Smarter.',exact:true})).toBeVisible();
    await expect(page.locator('.service-card')).toHaveCount(9);
    await page.getByRole('link',{name:'Skip to content',exact:true}).focus();await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();expect(new URL(page.url()).hash).toBe('');
    await expect(page.locator('#stationMap')).toHaveClass(/leaflet-container/);
    expect(await page.locator('.hero-photograph').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('.citizen-photo').scrollIntoViewIfNeeded();
    await expect(page.locator('.citizen-photo img')).toBeVisible();
    await expect.poll(()=>page.locator('.citizen-photo img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:test.info().outputPath(`portal-${width}.png`),fullPage:true});
    if(width===1440)await page.locator('#stationMap').screenshot({path:test.info().outputPath('station-map.png')});
    if(width<=900){
      await page.locator('#menuToggle').click();await expect(page.locator('#menuToggle')).toHaveAttribute('aria-expanded','true');
      await page.keyboard.press('Escape');await expect(page.locator('#menuToggle')).toHaveAttribute('aria-expanded','false');
      await page.locator('#menuToggle').click();
    }
    await page.locator('#primaryNavigation').getByRole('link',{name:'Citizen Services',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Every journey. A practical service.'})).toBeVisible();
    if(width<=900)await expect(page.locator('#menuToggle')).toHaveAttribute('aria-expanded','false');
    await page.locator('.site-footer').getByRole('link',{name:'Help & contact',exact:true}).click();
    await expect(page.locator('#view')).toContainText('No public support phone number or email address has been configured.');
    expect(errors).toEqual([]);
  });
}
test('public search sends real district and fuel filters, then opens station details',async({page})=>{
  await page.goto('/');const form=page.locator('#homeSearch');await expect(form).toBeVisible();
  await form.getByLabel('Station name or area').fill('Ntinda');
  await form.getByLabel('District',{exact:true}).selectOption('Kampala');await form.getByLabel('Fuel type').selectOption('diesel');
  const response=page.waitForResponse(r=>r.url().includes('/api/v1/stations?')&&r.url().includes('district=Kampala')&&r.url().includes('fuel=diesel'));
  await form.getByRole('button',{name:'Search prices'}).click();expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(/#prices$/);await expect(page.locator('#view')).toContainText('Total Ntinda');
  await expect(page.locator('#stationFilter [name=district]')).toHaveValue('Kampala');
  await page.getByRole('button',{name:'View station',exact:true}).first().click();
  await expect(page.locator('#detailDialog')).toBeVisible();await expect(page.locator('#detailTitle')).toHaveText('Total Ntinda');
  await page.keyboard.press('Escape');await expect(page.locator('#detailDialog')).not.toBeVisible();
});
test('homepage map supports real district filtering and consent-based GPS radius',async({page,context})=>{
  await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:0.3145,longitude:32.5795});
  await page.goto('/');const form=page.locator('#homeMapFilter');await expect(form).toBeVisible();
  await form.getByLabel('District or city',{exact:true}).fill('Jinja');await form.getByRole('button',{name:'Apply filters'}).click();
  await expect(page.locator('#homeMapStatus')).toContainText('matching locations loaded');
  await expect(page.locator('#discoveryResults')).toContainText('Shell Jinja Main');
  const mainCard=page.locator('[data-station-card]').filter({hasText:'Shell Jinja Main'});
  await mainCard.getByRole('button',{name:'Show Shell Jinja Main on map',exact:true}).click();await expect(mainCard).toHaveClass(/selected/);
  const otherPin=page.getByRole('button',{name:'Select Total Jinja on map',exact:true});await otherPin.focus();await otherPin.press('Enter');
  await expect(page.locator('[data-station-card]').filter({hasText:'Total Jinja'})).toHaveClass(/selected/);
  await expect(mainCard).not.toHaveClass(/selected/);
  await form.getByRole('button',{name:'Reset filters',exact:true}).click();
  await form.getByRole('button',{name:'Near me',exact:true}).click();await expect(page.locator('#homeMapStatus')).toContainText('within 10 km');
  await page.locator('#discoveryResults').getByRole('button',{name:'View station',exact:true}).first().click();await expect(page.locator('#detailDialog')).toBeVisible();
});
test('public records stay truthful and photography attribution is accessible',async({page,request})=>{
  const expected=await (await request.get('/api/v1/summary')).json();await page.goto('/');
  await expect(page.locator('.home-kpis .metric').nth(0).locator('strong')).toHaveText(expected.verified_today.toLocaleString('en-UG'));
  await expect(page.locator('.home-kpis .metric').nth(1).locator('strong')).toHaveText((expected.stations-expected.demo_stations).toLocaleString('en-UG'));
  await expect(page.locator('#demoBanner')).toBeVisible();await expect(page.locator('.hero-price-card')).toContainText('Awaiting data');
  await page.locator('.site-footer').getByRole('link',{name:'Photography credits'}).click();
  await expect(page.locator('#view')).toContainText('Kyakwera');await expect(page.locator('#view')).toContainText('Owobusingye');
  await expect(page.getByRole('link',{name:'CC BY-SA 4.0 ↗',exact:true})).toHaveAttribute('href','https://creativecommons.org/licenses/by-sa/4.0/');
});
test('header registration creates only a citizen and preserves server authorization',async({page})=>{
  await page.goto('/');await page.locator('#registerButton').click();await expect(page.locator('#authTitle')).toHaveText('Create a citizen account');
  await page.getByLabel('Display name',{exact:true}).fill('Portal registration test');
  await page.getByLabel('Email address').fill(`portal-${Date.now()}@example.test`);await page.getByLabel('Password',{exact:true}).fill('Portal-test-password-2026!');
  await page.locator('#consentLabel input').check();await page.locator('#authForm').getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.locator('#authDialog')).not.toBeVisible();await expect(page.locator('#accountButton')).toContainText('citizen');
  const admin=await page.request.get('/api/v1/admin/dashboard');expect(admin.status()).toBe(403);
  await page.locator('#workspaceLink').click();await expect(page.getByRole('heading',{name:'Citizen Dashboard'})).toBeVisible();
});
test('fresh verified discovery, insights and station history use records published through the real API',async({page,request,baseURL})=>{
  const origin=new URL(baseURL).origin;
  const login=await request.post('/api/v1/auth/login',{headers:{Origin:origin,'X-Requested-With':'MafutaWatch'},data:{email:'admin@example.test',password:testPassword}});expect(login.status()).toBe(200);
  const session=await login.json(),headers={Origin:origin,'X-Requested-With':'MafutaWatch','X-CSRF-Token':session.csrfToken};
  for(const [name,price]of [['Browser operational station A',5120],['Browser operational station B',4990]]){
    const response=await request.post('/api/v1/admin/stations',{headers,data:{operatorId:1,name,area:'Nakawa',district:'Kampala',region:'Central',latitude:0.33,longitude:32.59}});expect(response.status()).toBe(201);const s=await response.json();
    expect((await request.put(`/api/v1/stations/${s.id}/prices`,{headers,data:{fuel:'petrol',price}})).status()).toBe(200);
  }
  await page.goto('/');const form=page.locator('#homeMapFilter');await expect(form).toBeVisible();
  await form.getByLabel('Only fresh verified records').check();await form.getByLabel('Price freshness').selectOption('6');await form.getByRole('button',{name:'Apply filters'}).click();
  await expect(page.locator('.discovery-card')).toHaveCount(2);await expect(page.locator('.discovery-card').first()).toContainText('Browser operational station B');
  await expect(page.locator('.discovery-card .badge.verified')).toHaveCount(2);await expect(page.locator('.verified-update-feed')).toContainText('Browser operational station A');
  await page.locator('.discovery-card').first().getByRole('button',{name:'View station',exact:true}).click();await expect(page.locator('#detailContent')).toContainText('UGX 4,990');await expect(page.locator('#detailContent')).toContainText('operator');
});
for(const width of [360,768]){
  test(`mobile station sheet and floating filters are usable at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:1000});await page.goto('/');const root=page.locator('#fuelDiscovery');await expect(root).toBeVisible();
    const toggle=root.locator('[data-discovery=sheet]');await expect(toggle).toHaveAttribute('aria-expanded','false');await expect(root.locator('#discoveryResults')).not.toBeVisible();
    await toggle.click();await expect(root.locator('#discoveryResults')).toBeVisible();await toggle.click();await expect(root.locator('#discoveryResults')).not.toBeVisible();
    const filters=root.getByRole('button',{name:'Search & filters',exact:true});await filters.click();
    const form=root.locator('#homeMapFilter');await expect(form).toBeVisible();await expect(form.getByLabel('Station name or area')).toBeFocused();
    expect(await form.getByLabel('Station name or area').evaluate(el=>getComputedStyle(el).fontSize)).toBe('16px');
    await page.keyboard.press('Escape');await expect(form).not.toBeVisible();await expect(filters).toBeFocused();
    await filters.click();await form.getByLabel('District or city').fill('Jinja');await form.getByRole('button',{name:'Apply filters'}).click();
    await expect(root.locator('.discovery-card')).toHaveCount(2);await expect(form).not.toBeVisible();await expect(toggle).toHaveAttribute('aria-expanded','true');
    await expect(page.locator('#authDialog')).not.toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await root.screenshot({path:test.info().outputPath(`mobile-discovery-${width}.png`)});
  });
}
test('denied GPS never fabricates proximity and keeps station discovery available',async({page})=>{
  await page.addInitScript(()=>{window.geoRequests=0;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(_ok,failed){window.geoRequests++;failed({code:1});}}});});
  await page.goto('/');await expect(page.locator('#fuelDiscovery')).toBeVisible();expect(await page.evaluate(()=>window.geoRequests)).toBe(0);
  await page.getByRole('button',{name:'Find Fuel Near Me',exact:true}).click();
  await expect(page.locator('#homeMapStatus')).toContainText('permission denied');await expect(page.locator('#homeMapStatus')).toContainText('No distance filter was applied');
  await expect(page.locator('#fuelDiscovery')).toHaveAttribute('aria-busy','false');expect(await page.evaluate(()=>window.geoRequests)).toBe(1);
  await expect(page.locator('.discovery-card')).not.toHaveCount(0);await expect(page.locator('#discoveryResults')).not.toContainText('km away');
});
test('map-library failure preserves real filtering and station details',async({page})=>{
  await page.route('**/vendor/leaflet/leaflet.js',route=>route.abort());await page.goto('/');
  await expect(page.locator('#stationMap')).toContainText('Map library unavailable');
  const form=page.locator('#homeMapFilter');await form.getByLabel('District or city').fill('Jinja');await form.getByRole('button',{name:'Apply filters'}).click();
  await expect(page.locator('.discovery-card')).toHaveCount(2);await page.locator('#discoveryResults').getByRole('button',{name:'View station',exact:true}).first().click();await expect(page.locator('#detailDialog')).toBeVisible();
});
test('real data loading exposes a skeleton and honors reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});let release;const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/api/v1/summary',async route=>{await gate;await route.continue();});
  try{await page.goto('/');await expect(page.locator('#view')).toHaveAttribute('aria-busy','true');await expect(page.locator('.loading-surface')).toBeVisible();
    expect(await page.locator('.skeleton').first().evaluate(el=>getComputedStyle(el,'::after').animationName)).toBe('none');
  }finally{release();}
  await expect(page.getByRole('heading',{name:'Find Affordable Fuel. Drive Smarter.',exact:true})).toBeVisible();await expect(page.locator('#view')).toHaveAttribute('aria-busy','false');
});
