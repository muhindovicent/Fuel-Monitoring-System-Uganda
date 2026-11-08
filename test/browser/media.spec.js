import {test,expect} from '@playwright/test';
import {testPassword} from '../database.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
const imageFile={name:'device-image.png',mimeType:'image/png',buffer:png};
async function openManagement(page){
  await page.goto('/#activity');await page.locator('#accountButton').click();
  await page.getByLabel('Email address',{exact:true}).fill('admin@example.test');await page.getByLabel('Password',{exact:true}).fill(testPassword);
  await page.locator('#authForm').getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('#authDialog')).not.toBeVisible();
  await page.getByRole('button',{name:'Media management',exact:true}).click();await expect(page.getByRole('heading',{name:'Media Management',exact:true})).toBeVisible();
}
async function recordedVideo(page){
  const bytes=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const paint=canvas.getContext('2d');paint.fillStyle='#008751';paint.fillRect(0,0,64,64);
    const stream=canvas.captureStream(10),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks=[];
    const done=new Promise(resolve=>{recorder.ondataavailable=event=>chunks.push(event.data);recorder.onstop=resolve;});
    recorder.start();await new Promise(resolve=>setTimeout(resolve,350));paint.fillStyle='#0F2D52';paint.fillRect(0,0,64,64);await new Promise(resolve=>setTimeout(resolve,350));recorder.stop();await done;stream.getTracks().forEach(track=>track.stop());
    return [...new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer())];
  });return {name:'device-video.webm',mimeType:'video/webm',buffer:Buffer.from(bytes)};
}
for(const width of [360,1440])test(`administrator device uploads, previews, publication, editing and deletion at ${width}px`,async({page,context,baseURL})=>{
  test.setTimeout(90000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());await page.setViewportSize({width,height:1000});
  await openManagement(page);const editor=page.locator('#mediaEditor'),status=page.locator('.media-management-status');
  for(const name of ['Upload Image','Add Video','Publish News'])await expect(page.getByRole('button',{name,exact:true})).toBeVisible();
  const publicPage=await context.newPage();await publicPage.goto('/#gallery');await expect(publicPage.locator('#publicMediaContent')).toBeVisible();await page.bringToFront();
  await page.getByRole('button',{name:'Upload Image',exact:true}).click();
  await editor.getByLabel('Title',{exact:true}).fill(`Device photograph ${width}`);await editor.getByLabel('Description',{exact:true}).fill('An original photograph selected directly from the device.');
  await editor.getByLabel('Photographer',{exact:true}).fill('Test photographer');await editor.getByLabel('Source / owner',{exact:true}).fill('Original work by test photographer');await editor.getByLabel('License',{exact:true}).selectOption('CC BY 4.0');await editor.getByLabel('Caption',{exact:true}).fill(`Original caption ${width}`);
  await editor.getByLabel('Image file',{exact:true}).setInputFiles(imageFile);
  await expect(editor.locator('.media-preview img')).toHaveAttribute('src',/^blob:/);await expect.poll(()=>editor.locator('.media-preview img').evaluate(img=>img.naturalWidth)).toBe(1);
  const upload=page.waitForResponse(response=>response.url().endsWith('/api/v1/admin/media-assets')&&response.request().method()==='POST');
  await editor.getByRole('button',{name:'Save metadata',exact:true}).click();expect((await upload).status()).toBe(201);await expect(editor).not.toBeVisible();await expect(status).toContainText('saved as draft');
  let imageRow=page.locator('[data-media-kind="media"] [data-content-id]').filter({hasText:`Device photograph ${width}`});await expect(imageRow).toContainText('draft');
  let content=await (await page.request.get('/api/v1/admin/media')).json();const image=content.media.find(item=>item.title===`Device photograph ${width}`);
  expect((await fetch(`${baseURL}${image.image_url}`)).status).toBe(404);
  await imageRow.getByRole('button',{name:'Publish',exact:true}).click();await expect(status).toContainText('published successfully');
  await publicPage.bringToFront();await expect(publicPage.getByRole('heading',{name:`Device photograph ${width}`,exact:true})).toBeVisible();
  await expect.poll(()=>publicPage.locator('.media-card img').first().evaluate(img=>img.naturalWidth)).toBe(1);
  await publicPage.goto('/');await expect(publicPage.locator('.carousel-track')).toContainText(`Original caption ${width}`);
  await page.bringToFront();await imageRow.getByRole('button',{name:'Edit',exact:true}).click();await editor.getByLabel('Title',{exact:true}).fill(`Edited photograph ${width}`);await editor.getByLabel('Caption',{exact:true}).fill(`Edited caption ${width}`);await editor.getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor).not.toBeVisible();
  await publicPage.bringToFront();await expect(publicPage.locator('.carousel-track')).toContainText(`Edited caption ${width}`);
  await page.bringToFront();imageRow=page.locator('[data-media-kind="media"] [data-content-id]').filter({hasText:`Edited photograph ${width}`});await imageRow.getByRole('button',{name:'Unpublish',exact:true}).click();await expect(status).toContainText('unpublished');expect((await fetch(`${baseURL}${image.image_url}`)).status).toBe(404);
  await imageRow.getByRole('button',{name:'Publish',exact:true}).click();await expect(status).toContainText('published successfully');

  const videoFile=await recordedVideo(page);
  await page.getByRole('button',{name:'Add Video',exact:true}).click();await editor.getByLabel('Title',{exact:true}).fill(`Device tutorial ${width}`);await editor.getByLabel('Video file',{exact:true}).setInputFiles(videoFile);await editor.getByLabel('Thumbnail file (optional)',{exact:true}).setInputFiles(imageFile);
  await expect(editor.locator('.media-preview video')).toHaveAttribute('src',/^blob:/);await expect.poll(()=>editor.locator('.media-preview video').evaluate(video=>video.readyState)).toBeGreaterThan(0);
  await editor.getByLabel('Description',{exact:true}).fill('An original educational video selected from this device.');await editor.getByLabel('Duration (minutes:seconds or hours:minutes:seconds)',{exact:true}).fill('0:01');await editor.getByLabel('Source / owner',{exact:true}).fill('MafutaWatch test production team');
  await editor.getByRole('button',{name:'Publish',exact:true}).click();await expect(editor).not.toBeVisible();await expect(status).toContainText('published successfully');
  await publicPage.goto('/#videos');await publicPage.getByRole('button',{name:`Play Device tutorial ${width}`,exact:true}).click();await expect(publicPage.locator('#lightboxContent video')).toBeVisible();await expect.poll(()=>publicPage.locator('#lightboxContent video').evaluate(video=>video.readyState)).toBeGreaterThan(0);await publicPage.keyboard.press('Escape');
  await page.bringToFront();const videoRow=page.locator('[data-media-kind="videos"] [data-content-id]').filter({hasText:`Device tutorial ${width}`});await videoRow.getByRole('button',{name:'Edit',exact:true}).click();await editor.getByLabel('Title',{exact:true}).fill(`Edited tutorial ${width}`);await editor.getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor).not.toBeVisible();

  await page.getByRole('button',{name:'Publish News',exact:true}).click();await editor.getByLabel('Headline',{exact:true}).fill(`Device upload news ${width}`);await editor.getByLabel('Article content',{exact:true}).fill('Original article content.\n<img src=x onerror="window.mediaXss=true">');await editor.getByLabel('Source name',{exact:true}).fill('MafutaWatch news desk');await editor.getByLabel('Source URL',{exact:true}).fill('https://example.test/original-report');await editor.getByLabel('Featured image file',{exact:true}).setInputFiles(imageFile);
  await expect(editor.locator('.media-preview img')).toHaveAttribute('src',/^blob:/);await editor.getByRole('button',{name:'Publish',exact:true}).click();await expect(editor).not.toBeVisible();
  await publicPage.goto('/#news');await expect(publicPage.getByRole('heading',{name:`Device upload news ${width}`,exact:true})).toBeVisible();await publicPage.getByText('Read article',{exact:true}).click();await expect(publicPage.locator('.article-body')).toContainText('<img src=x');expect(await publicPage.evaluate(()=>window.mediaXss)).toBeUndefined();
  await publicPage.goto('/');await expect(publicPage.locator('#homePublishing')).toContainText(`Device upload news ${width}`);await expect(publicPage.locator('#homePublishing')).toContainText(`Edited tutorial ${width}`);
  await page.bringToFront();const newsRow=page.locator('[data-media-kind="news"] [data-content-id]').filter({hasText:`Device upload news ${width}`});await newsRow.getByRole('button',{name:'Edit',exact:true}).click();await editor.getByLabel('Headline',{exact:true}).fill(`Edited upload news ${width}`);await editor.getByRole('button',{name:'Save changes',exact:true}).click();await expect(editor).not.toBeVisible();
  content=await (await page.request.get('/api/v1/admin/media')).json();const video=content.videos.find(item=>item.title===`Edited tutorial ${width}`),news=content.news.find(item=>item.title===`Edited upload news ${width}`);
  for(const [kind,id]of [['news',news.id],['videos',video.id],['media',image.id]]){
    const row=page.locator(`[data-media-kind="${kind}"] [data-content-id="${id}"]`);await row.getByRole('button',{name:'Unpublish',exact:true}).click();await expect(row).toContainText('draft');await row.getByRole('button',{name:'Delete',exact:true}).click();await expect(row).toHaveCount(0);
  }
  for(const url of [image.image_url,video.video_url,video.thumbnail_url,news.image_url])expect((await fetch(`${baseURL}${url}`)).status).toBe(404);
  await publicPage.bringToFront();await expect(publicPage.locator('#homePublishing')).not.toContainText(`Edited upload news ${width}`);await expect(publicPage.locator('#homePublishing')).not.toContainText(`Edited tutorial ${width}`);
  expect(errors).toEqual([]);await publicPage.close();
});

test('editor preserves entries and reports rejected files and failed uploads',async({page})=>{
  await openManagement(page);await page.getByRole('button',{name:'Upload Image',exact:true}).click();const editor=page.locator('#mediaEditor');
  await editor.getByLabel('Image file',{exact:true}).setInputFiles({name:'unsafe.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await expect(editor.locator('.form-error')).toContainText('JPEG, PNG or WebP');
  await editor.getByLabel('Image file',{exact:true}).setInputFiles(imageFile);await editor.getByLabel('Title',{exact:true}).fill('Keep these image details');await editor.getByLabel('Description',{exact:true}).fill('Description remains available after a failed upload.');await editor.getByLabel('Photographer',{exact:true}).fill('Photographer');await editor.getByLabel('Source / owner',{exact:true}).fill('Own photograph');
  await page.route('**/api/v1/admin/media-assets',route=>route.fulfill({status:503,json:{error:'Persistent storage unavailable. Try again.'}}));
  await editor.getByRole('button',{name:'Publish',exact:true}).click();await expect(editor.locator('.form-error')).toContainText('Persistent storage unavailable');await expect(editor).toBeVisible();await expect(editor.getByLabel('Title',{exact:true})).toHaveValue('Keep these image details');
  await page.unroute('**/api/v1/admin/media-assets');await editor.getByRole('button',{name:'Publish',exact:true}).click();await expect(editor).not.toBeVisible();
  page.on('dialog',dialog=>dialog.accept());await page.locator('[data-media-kind="media"] [data-content-id]').filter({hasText:'Keep these image details'}).getByRole('button',{name:'Delete',exact:true}).click();await expect(page.locator('.media-management-status')).toContainText('deleted');
});

test('supported video links can be previewed, saved and unpublished',async({page})=>{
  await openManagement(page);await page.getByRole('button',{name:'Add Video',exact:true}).click();const editor=page.locator('#mediaEditor');
  await editor.getByLabel('Title',{exact:true}).fill('Source linked educational video');await editor.getByLabel('Video link (YouTube, Vimeo, HTTPS MP4/WebM)',{exact:true}).fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');await editor.getByLabel('Description',{exact:true}).fill('A source linked educational video used by the browser test.');await editor.getByLabel('Duration (minutes:seconds or hours:minutes:seconds)',{exact:true}).fill('3:30');await editor.getByLabel('Source / owner',{exact:true}).fill('Original video producer');
  await editor.getByRole('button',{name:'Preview selected content',exact:true}).click();await expect(editor.locator('iframe')).toHaveAttribute('src','https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  await editor.getByRole('button',{name:'Save draft',exact:true}).click();await expect(editor).not.toBeVisible();const row=page.locator('[data-media-kind="videos"] [data-content-id]').filter({hasText:'Source linked educational video'});await expect(row).toContainText('draft');await row.getByRole('button',{name:'Publish',exact:true}).click();await expect(row).toContainText('published');await row.getByRole('button',{name:'Unpublish',exact:true}).click();await expect(row).toContainText('draft');
  page.on('dialog',dialog=>dialog.accept());await row.getByRole('button',{name:'Delete',exact:true}).click();await expect(row).toHaveCount(0);
});
