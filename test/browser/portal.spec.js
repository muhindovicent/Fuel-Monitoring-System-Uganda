import { test,expect } from '@playwright/test';
import {testPassword} from '../database.js';

for(const width of [360,768,1024,1440]){
  test(`public portal layout and navigation at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/');await expect(page.getByRole('heading',{name:'Find Affordable Fuel. Drive Smarter.',exact:true})).toBeVisible();
    await expect(page.locator('.service-card')).toHaveCount(9);
    await page.getByRole('link',{name:'Skip to content',exact:true}).focus();await page.keyboard.press('Enter');
    await expect(page.locator('#main')).toBeFocused();expect(new URL(page.url()).hash).toBe('');
    await expect(page.locator('#fuelDiscovery')).toHaveAttribute('data-view','list');
    await expect(page.locator('#stationMap')).not.toBeVisible();
    await expect(page.locator('.discovery-card').first()).toBeVisible();
    expect(await page.locator('.hero-photograph').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('.citizen-photo').scrollIntoViewIfNeeded();
    await expect(page.locator('.citizen-photo img')).toBeVisible();
    await expect.poll(()=>page.locator('.citizen-photo img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:test.info().outputPath(`portal-${width}.png`),fullPage:true});
    if(width===1440)await page.locator('#fuelDiscovery').screenshot({path:test.info().outputPath('station-list.png')});
    if(width<=900){
      await page.locator('#menuToggle').click();await expect(page.locator('#menuToggle')).toHaveAttribute('aria-expanded','true');
      await page.keyboard.press('Escape');await expect(page.locator('#menuToggle')).toHaveAttribute('aria-expanded','false');
      await page.locator('#menuToggle').click();
    }
    await page.locator('#primaryNavigation').getByRole('link',{name:'Citizen Services',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Every journey. A practical service.'})).toBeVisible();
    if(width<=900)await expect(page.locator('#menuToggle')).toHaveAttribute('aria-expanded','false');
    await page.locator('.site-footer').getByRole('link',{name:'Help & contact',exact:true}).click();
    await expect(page.locator('#infoDialog')).toBeVisible();await expect(page.locator('#infoTitle')).toHaveText('Help & contact');
    await expect(page.locator('#infoContent')).toContainText('No public support phone number or email address has been configured.');
    await page.keyboard.press('Escape');await expect(page.locator('#infoDialog')).not.toBeVisible();
    expect(errors).toEqual([]);
  });
}
test('homepage renders gallery and advisory API items',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/v1/media',route=>route.fulfill({json:{items:[
    {title:'Published gallery photograph',image_url:'/assets/kampala-road.jpg',photographer:'Gallery photographer'}
  ]}}));
  await page.route('**/api/v1/advisories',route=>route.fulfill({json:{items:[
    {title:'Published source-linked advisory',body:'A published advisory body.',author:'Platform administrator',created_at:'2026-01-01T12:00:00Z',source_url:'https://example.test/advisory'}
  ]}}));
  await page.goto('/');
  await expect(page.locator('.carousel-slide')).toHaveCount(1);
  await expect(page.locator('.carousel-slide img')).toHaveAttribute('alt','Published gallery photograph');
  await expect(page.locator('.carousel-slide')).toContainText('Gallery photographer');
  await expect(page.locator('.advisory-card')).toContainText('Published source-linked advisory');
  await expect(page.locator('.advisory-card a')).toHaveAttribute('href','https://example.test/advisory');
  expect(errors).toEqual([]);
});
test('homepage stays usable when gallery and advisory requests fail',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const path of ['media','advisories'])await page.route(`**/api/v1/${path}`,route=>route.fulfill({status:503,json:{error:'Temporarily unavailable.'}}));
  await page.goto('/');
  await expect(page.locator('#homeSearch')).toBeVisible();
  await expect(page.locator('.carousel-slide')).toHaveCount(2);
  await expect(page.locator('.carousel-status')).toContainText('unavailable');
  await expect(page.locator('[data-overview="advisories"]')).toContainText('unavailable');
  await expect(page.locator('.advisory-empty')).toHaveCount(0);
  await page.getByRole('button',{name:'Next image',exact:true}).click();
  await expect(page.locator('.carousel-slide').nth(1)).toBeVisible();
  expect(errors).toEqual([]);
});
test('public search sends real district and fuel filters, then opens station details',async({page})=>{
  await page.goto('/');const form=page.locator('#homeSearch');await expect(form).toBeVisible();
  await form.getByLabel('Station name or area').fill('Ntinda');
  await expect(form.getByLabel('District',{exact:true}).locator('option[value="Kampala"]')).toBeAttached();
  await form.getByLabel('District',{exact:true}).selectOption('Kampala');await form.getByLabel('Fuel type').selectOption('diesel');
  const response=page.waitForResponse(r=>r.url().includes('/api/v1/stations?')&&r.url().includes('district=Kampala')&&r.url().includes('fuel=diesel'));
  await form.getByRole('button',{name:'Search prices'}).click();expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(/#prices$/);await expect(page.locator('#view')).toContainText('Total Ntinda');
  await expect(page.locator('#stationMap')).not.toBeVisible();expect(await page.evaluate(()=>Boolean(window.L))).toBe(false);
  await expect(page.locator('#stationFilter [name=district]')).toHaveValue('Kampala');
  await page.getByRole('button',{name:'View station',exact:true}).first().click();
  await expect(page.locator('#detailDialog')).toBeVisible();await expect(page.locator('#detailTitle')).toHaveText('Total Ntinda');
  await page.keyboard.press('Escape');await expect(page.locator('#detailDialog')).not.toBeVisible();
  await page.getByRole('button',{name:'Map View',exact:true}).click();await expect(page.locator('#stationMap .leaflet-overlay-pane > svg')).toBeVisible();
  await page.getByRole('button',{name:'Back to List',exact:true}).click();await expect(page.locator('#stationMap')).not.toBeVisible();await expect(page.locator('#view')).toContainText('Total Ntinda');
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
  await expect(page.locator('#infoDialog')).toBeVisible();
  await expect(page.locator('#infoContent')).toContainText('Kyakwera');await expect(page.locator('#infoContent')).toContainText('Owobusingye');
  await expect(page.locator('#infoContent').getByRole('link',{name:'CC BY-SA 4.0 ↗',exact:true})).toHaveAttribute('href','https://creativecommons.org/licenses/by-sa/4.0/');
  await page.keyboard.press('Escape');await expect(page.locator('#infoDialog')).not.toBeVisible();
});
test('information popup supports internal sublinks, Back and preserves page position',async({page})=>{
  await page.goto('/');
  await page.locator('.site-footer').getByRole('link',{name:'About MafutaWatch',exact:true}).click();
  await expect(page.locator('#infoDialog')).toBeVisible();await expect(page.locator('#infoTitle')).toHaveText('About MafutaWatch');
  const scrollBefore=await page.evaluate(()=>window.scrollY);
  await page.locator('#infoContent').getByRole('link',{name:'Read our data-use notice'}).click();
  await expect(page.locator('#infoTitle')).toHaveText('Privacy & data use');
  await expect(page.locator('#infoContent')).toContainText('What is collected');
  await page.locator('#backInfo').click();
  await expect(page.locator('#infoTitle')).toHaveText('About MafutaWatch');
  await expect(page.locator('#infoContent')).toContainText('Know what is behind the price');
  expect(await page.evaluate(()=>window.scrollY)).toBe(scrollBefore);
  await page.keyboard.press('Escape');await expect(page.locator('#infoDialog')).not.toBeVisible();
});
test('information popup workflow links close popup and navigate to workspace',async({page})=>{
  await page.goto('/');
  await page.locator('.site-footer').getByRole('link',{name:'About MafutaWatch',exact:true}).click();
  await expect(page.locator('#infoDialog')).toBeVisible();
  await page.locator('#infoContent').getByRole('link',{name:'Open a consumer case'}).click();
  await expect(page.locator('#infoDialog')).not.toBeVisible();
  await expect(page).toHaveURL(/#complaints$/);
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
for(const width of [360,768,1440])for(const path of ['/','/#stations']){
  test(`list-first discovery preserves filters and station selection at ${width}px on ${path}`,async({page})=>{
    const errors=[],mapRequests=[];page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(/\/vendor\/leaflet\/|tile\.openstreetmap\.org/.test(request.url()))mapRequests.push(request.url());});
    await page.addInitScript(()=>{window.geoRequests=0;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(){window.geoRequests++;}}});});
    await page.setViewportSize({width,height:900});await page.goto(path);
    const root=page.locator('#fuelDiscovery'),form=root.locator('#homeMapFilter');
    await expect(root).toHaveAttribute('data-view','list');await expect(root.getByRole('button',{name:'List View',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('#stationMap')).not.toBeVisible();await expect(root.locator('.discovery-card').first()).toBeVisible();
    expect(await page.evaluate(()=>Boolean(window.L))).toBe(false);expect(mapRequests).toEqual([]);
    await form.getByLabel('District or city').fill('Jinja');await form.getByLabel('Fuel type',{exact:true}).selectOption('diesel');await form.getByRole('button',{name:'Apply filters'}).click();
    await expect(root.locator('.discovery-card')).toHaveCount(2);expect(mapRequests).toEqual([]);
    const card=root.locator('[data-station-card]').filter({hasText:'Shell Jinja Main'});
    await card.getByRole('button',{name:'Show on map',exact:true}).click();
    await expect(root).toHaveAttribute('data-view','map');await expect(root.locator('#stationMap')).toHaveClass(/leaflet-container/);
    await expect(card).toHaveClass(/selected/);await expect(page.locator('.leaflet-popup-content')).toContainText('diesel:');
    await expect.poll(()=>mapRequests.some(url=>url.includes('tile.openstreetmap.org'))).toBe(true);
    expect(await page.evaluate(()=>window.geoRequests)).toBe(0);
    if(width<=900){
      const dialog=page.locator('.discovery-map-dialog');await expect(dialog).toBeVisible();
      expect(await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return el.open&&r.x===0&&r.y===0&&r.width===innerWidth&&r.height===innerHeight;})).toBe(true);
      await expect(root.getByRole('button',{name:'Back to List',exact:true})).toBeFocused();
      const filters=root.getByRole('button',{name:'Search & filters',exact:true});await filters.click();
      await expect(form.getByLabel('Station name or area')).toBeFocused();await expect(form.getByLabel('Fuel type',{exact:true})).toHaveValue('diesel');
      expect(await form.getByLabel('Station name or area').evaluate(el=>getComputedStyle(el).fontSize)).toBe('16px');
      await page.keyboard.press('Escape');await expect(form).not.toBeVisible();await expect(filters).toBeFocused();await expect(dialog).toBeVisible();
      await filters.click();await form.getByLabel('Station name or area').fill('Jinja');await form.getByRole('button',{name:'Apply filters',exact:true}).click();
      await expect(form).not.toBeVisible();await expect(root.locator('.discovery-card')).toHaveCount(2);await expect(card).toHaveClass(/selected/);
    }
    const pin=root.getByRole('button',{name:'Select Total Jinja on map',exact:true});await pin.focus();await pin.press('Enter');
    await expect(root.locator('.discovery-card.selected')).toContainText('Total Jinja');
    await root.getByRole('button',{name:'Back to List',exact:true}).click();
    await expect(root).toHaveAttribute('data-view','list');await expect(page.locator('#stationMap')).not.toBeVisible();await expect(root.locator('.leaflet-map-pane')).toHaveCount(0);
    await expect(form).toBeVisible();await expect(form.getByLabel('District or city')).toHaveValue('Jinja');await expect(form.getByLabel('Fuel type',{exact:true})).toHaveValue('diesel');
    await expect(form.getByLabel('Station name or area')).toHaveValue(width<=900?'Jinja':'');
    await expect(root.locator('.discovery-card.selected')).toContainText('Total Jinja');
    await root.getByRole('button',{name:'Map View',exact:true}).click();await expect(root.locator('#stationMap')).toHaveClass(/leaflet-container/);
    await expect(root.locator('.leaflet-popup-content')).toContainText('Total Jinja');
    await root.locator('.leaflet-popup-content').getByRole('button',{name:'View station',exact:true}).click();
    await expect(page.locator('#detailTitle')).toHaveText('Total Jinja');await expect(page.locator('#detailContent')).toContainText('Recent accepted price history');
    await page.keyboard.press('Escape');await expect(page.locator('#detailDialog')).not.toBeVisible();
    await root.getByRole('button',{name:'List View',exact:true}).click();await expect(root).toHaveAttribute('data-view','list');
    await root.getByRole('button',{name:'Map View',exact:true}).click();await expect(root.locator('#stationMap')).toHaveClass(/leaflet-container/);
    await page.keyboard.press('Escape');await expect(root).toHaveAttribute('data-view','list');
    await expect(root.getByRole('button',{name:'Map View',exact:true})).toBeFocused();
    expect(mapRequests.filter(url=>url.endsWith('/vendor/leaflet/leaflet.js'))).toHaveLength(1);
    expect(mapRequests.filter(url=>url.endsWith('/vendor/leaflet/leaflet.css'))).toHaveLength(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
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
  await page.getByRole('button',{name:'Map View',exact:true}).click();
  await expect(page.locator('#stationMap')).toContainText('Map library unavailable');
  await page.getByRole('button',{name:'Back to List',exact:true}).click();
  const form=page.locator('#homeMapFilter');await form.getByLabel('District or city').fill('Jinja');await form.getByRole('button',{name:'Apply filters'}).click();
  await expect(page.locator('.discovery-card')).toHaveCount(2);await page.locator('#discoveryResults').getByRole('button',{name:'View station',exact:true}).first().click();await expect(page.locator('#detailDialog')).toBeVisible();
  await page.keyboard.press('Escape');await page.unroute('**/vendor/leaflet/leaflet.js');
  await page.getByRole('button',{name:'Map View',exact:true}).click();await expect(page.locator('#stationMap .leaflet-overlay-pane > svg')).toBeVisible();
});
test('mobile map handles denied GPS and unavailable tiles without losing stations',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>{window.geoRequests=0;Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(_ok,failed){window.geoRequests++;failed({code:1});}}});});
  await page.route('https://*.tile.openstreetmap.org/**',route=>route.abort());
  await page.goto('/#stations');await page.getByRole('button',{name:'Map View',exact:true}).click();
  await expect(page.locator('#stationMap')).toContainText('Basemap tiles unavailable');
  expect(await page.evaluate(()=>window.geoRequests)).toBe(0);
  await page.getByRole('button',{name:'Find fuel near my location',exact:true}).click();
  await expect(page.locator('#homeMapStatus')).toContainText('permission denied');expect(await page.evaluate(()=>window.geoRequests)).toBe(1);
  await page.getByRole('button',{name:'Select Shell Jinja Main on map',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.locator('.discovery-card.selected')).toContainText('Shell Jinja Main');
  await page.getByRole('button',{name:'Back to List',exact:true}).click();
  await expect(page.locator('.discovery-card.selected')).toBeVisible();await expect(page.locator('#discoveryResults')).not.toContainText('km away');
});
test('Near me works in the mobile list without opening a map',async({page,context})=>{
  await page.setViewportSize({width:390,height:844});await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:0.3145,longitude:32.5795});
  await page.goto('/#stations');await page.locator('#homeMapFilter').getByRole('button',{name:'Near me',exact:true}).click();
  await expect(page.locator('#homeMapStatus')).toContainText('within 10 km');await expect(page.locator('#discoveryResults')).toContainText('km away');
  await expect(page.locator('#fuelDiscovery')).toHaveAttribute('data-view','list');expect(await page.evaluate(()=>Boolean(window.L))).toBe(false);
  await page.getByRole('button',{name:'Map View',exact:true}).click();await expect(page.locator('#stationMap .leaflet-overlay-pane > svg')).toBeVisible();
  await page.getByRole('button',{name:'Back to List',exact:true}).click();await expect(page.locator('#homeMapFilter [name=sort]')).toHaveValue('distance');await expect(page.locator('#homeMapFilter [name=radius]')).toHaveValue('10');
});
test('closing a map during library loading does not initialize a hidden map',async({page})=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/vendor/leaflet/leaflet.js',async route=>{await gate;await route.continue();});
  try{
    await page.goto('/#stations');await page.getByRole('button',{name:'Map View',exact:true}).click();await expect(page.locator('#homeMapStatus')).toHaveText('Loading map…');
    await page.getByRole('button',{name:'Back to List',exact:true}).click();
  }finally{release();}
  await expect.poll(()=>page.evaluate(()=>Boolean(window.L))).toBe(true);
  await expect(page.locator('.leaflet-map-pane')).toHaveCount(0);await expect(page.locator('#fuelDiscovery')).toHaveAttribute('data-view','list');
  await page.getByRole('button',{name:'Map View',exact:true}).click();await expect(page.locator('#stationMap .leaflet-overlay-pane > svg')).toBeVisible();
});
test('real data loading exposes a skeleton and honors reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});let release;const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/api/v1/summary',async route=>{await gate;await route.continue();});
  try{await page.goto('/');await expect(page.locator('#view')).toHaveAttribute('aria-busy','true');await expect(page.locator('.loading-surface').first()).toBeVisible();
    expect(await page.locator('.skeleton').first().evaluate(el=>getComputedStyle(el,'::after').animationName)).toBe('none');
  }finally{release();}
  await expect(page.getByRole('heading',{name:'Find Affordable Fuel. Drive Smarter.',exact:true})).toBeVisible();await expect(page.locator('#view')).toHaveAttribute('aria-busy','false');
});
test('homepage discovery fetches one server page instead of the full directory',async({page})=>{
  const stationQueries=[];
  page.on('request',request=>{const url=new URL(request.url());if(url.pathname==='/api/v1/stations')stationQueries.push(url.searchParams);});
  await page.goto('/');
  await expect(page.locator('.discovery-card').first()).toBeVisible();
  await expect(page.locator('#discoveryCount')).not.toHaveText('Loading stations…');
  expect(stationQueries).toHaveLength(1);
  expect(stationQueries[0].get('limit')).toBe('50');
  expect(stationQueries[0].get('offset')).toBe('0');
  const total=Number((await page.locator('#discoveryCount').textContent()).replace(/\D/g,''));
  expect(total).toBeGreaterThan(100);
  expect(await page.locator('.discovery-card').count()).toBeLessThanOrEqual(50);
});
test('Show more pages additional server results while preserving filters and map selection',async({page})=>{
  const offsets=[];
  page.on('request',request=>{const url=new URL(request.url());if(url.pathname==='/api/v1/stations')offsets.push(url.searchParams.get('offset'));});
  await page.goto('/#stations');
  const form=page.locator('#homeMapFilter');await expect(form).toBeVisible();
  await form.getByLabel('District or city').fill('Generated District');
  await form.getByRole('button',{name:'Apply filters'}).click();
  await expect(page.locator('#discoveryCount')).toContainText('55 matching stations');
  await expect(page.locator('.discovery-card')).toHaveCount(50);
  await page.getByRole('button',{name:'Show more matching stations',exact:true}).click();
  await expect(page.locator('.discovery-card')).toHaveCount(55);
  expect(offsets).toContain('50');
  const card=page.locator('[data-station-card]').filter({hasText:'ZZ Generated Station 010'});
  await card.getByRole('button',{name:'Show ZZ Generated Station 010 on map',exact:true}).click();
  await expect(card).toHaveClass(/selected/);
  await expect(form.getByLabel('District or city')).toHaveValue('Generated District');
  await form.getByRole('button',{name:'Apply filters'}).click();
  await expect(page.locator('.discovery-card.selected')).toContainText('ZZ Generated Station 010');
  await expect(page.locator('#discoveryCount')).toContainText('55 matching stations');
  await expect(page.locator('.discovery-card')).toHaveCount(50);
  await expect(form.getByLabel('District or city')).toHaveValue('Generated District');
});
test('failed section requests surface real errors instead of fabricating empty states',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const paths=['/api/v1/stations','/api/v1/stations/insights','/api/v1/news','/api/v1/videos','/api/v1/media','/api/v1/advisories'];
  await page.route(url=>paths.includes(url.pathname),route=>route.fulfill({status:503,json:{error:'Temporarily unavailable.'}}));
  await page.goto('/');
  await expect(page.locator('#homeSearch')).toBeVisible();
  await expect(page.locator('.discovery-error')).toBeVisible();
  await expect(page.locator('.discovery-empty')).toHaveCount(0);
  await expect(page.locator('#discoveryCount')).toHaveText('Station results unavailable');
  await expect(page.locator('#homeMapStatus')).toContainText('unavailable right now');
  await expect(page.locator('[data-overview="price-comparison"]')).toContainText('unavailable');
  await expect(page.locator('[data-overview="recent-updates"]')).toContainText('unavailable');
  await expect(page.locator('[data-overview="distribution"]')).toContainText('unavailable');
  await expect(page.locator('[data-overview="news"]')).toContainText('unavailable');
  await expect(page.locator('[data-overview="videos"]')).toContainText('unavailable');
  await expect(page.locator('[data-overview="advisories"]')).toContainText('unavailable');
  await expect(page.locator('.carousel-status')).toContainText('unavailable');
  await expect(page.locator('.home-kpis .metric').first()).toBeVisible();
  await expect(page.locator('.service-card')).toHaveCount(9);
  expect(errors).toEqual([]);
});
test('homepage sections render independently while station discovery waits on a slow API',async({page})=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  await page.route(url=>url.pathname==='/api/v1/stations',async route=>{await gate;await route.continue();});
  try{
    await page.goto('/');
    await expect(page.getByRole('heading',{name:'Find Affordable Fuel. Drive Smarter.',exact:true})).toBeVisible();
    await expect(page.locator('.service-card')).toHaveCount(9);
    await expect(page.locator('.home-kpis .metric').first()).toBeVisible();
    await expect(page.locator('[data-overview="news"] .section-heading')).toBeVisible();
    await expect(page.locator('[data-overview="price-comparison"]')).not.toContainText('Loading');
    await expect(page.locator('#view')).toHaveAttribute('aria-busy','false');
    await expect(page.locator('#discoveryCount')).toHaveText('Loading stations…');
    await expect(page.locator('.discovery-card')).toHaveCount(0);
  }finally{release();}
  await expect(page.locator('.discovery-card').first()).toBeVisible();
  await expect(page.locator('#discoveryCount')).not.toHaveText('Loading stations…');
});
test('hero image preload is added only while the homepage is active',async({page})=>{
  await page.goto('/');
  await expect(page.locator('link#heroPreload')).toHaveCount(1);
  await page.evaluate(()=>{location.hash='prices';});
  await expect(page.locator('link#heroPreload')).toHaveCount(0);
  await page.evaluate(()=>{location.hash='overview';});
  await expect(page.locator('link#heroPreload')).toHaveCount(1);
});
