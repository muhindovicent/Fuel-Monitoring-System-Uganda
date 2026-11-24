import { expect } from '@playwright/test';

export async function openWorkspacePage(page,name){
  if(!await page.locator('#navigation').isVisible()){
    if(await page.locator('body').getAttribute('data-shell')==='workspace')await page.locator('#sidebarToggle').click();
    else if(await page.locator('#workspaceLink').isVisible())await page.locator('#workspaceLink').click();
    else{await page.locator('#menuToggle').scrollIntoViewIfNeeded();await page.locator('#menuToggle').click();await page.locator('#primaryNavigation').getByRole('link',{name:'My workspace',exact:true}).click();}
  }
  await expect(page.locator('body')).toHaveAttribute('data-shell','workspace');
  if(!await page.locator('#navigation').isVisible())await page.locator('#sidebarToggle').click();
  const link=page.locator('#navigation').getByRole('link',{name,exact:true});
  await expect(link).toBeVisible();await link.scrollIntoViewIfNeeded();await link.click();
}
