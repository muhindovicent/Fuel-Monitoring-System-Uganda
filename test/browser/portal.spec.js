import { test,expect } from '@playwright/test';

for(const width of [360,768,1024,1440]){
  test(`public portal layout and navigation at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/');await expect(page.getByRole('heading',{name:/Fairer fuel starts/})).toBeVisible();
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
    await page.locator('#primaryNavigation').getByRole('link',{name:'Contact',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Find the right way to get help.'})).toBeVisible();
    await expect(page.locator('#view')).toContainText('No public support phone number or email address has been configured.');
    if(width<=900)await expect(page.locator('#menuToggle')).toHaveAttribute('aria-expanded','false');
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
  await form.getByLabel('District',{exact:true}).selectOption('Jinja');await form.getByRole('button',{name:'Apply filters'}).click();
  await expect(page.locator('#homeMapStatus')).toContainText('matching locations loaded');
  await expect(page.locator('#homeMapResults')).toContainText('Shell Jinja Main');
  await form.getByRole('button',{name:'Reset',exact:true}).click();
  await form.getByRole('button',{name:'Near me',exact:true}).click();await expect(page.locator('#homeMapStatus')).toContainText('within 10 km');
  await page.locator('#homeMapResults .map-result').first().click();await expect(page.locator('#detailDialog')).toBeVisible();
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
  await page.locator('#workspaceLink').click();await expect(page.getByRole('heading',{name:'Your contributions. In one place.'})).toBeVisible();
});
