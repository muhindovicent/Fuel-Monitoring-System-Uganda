import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/app.js';
import {transaction,migrate} from '../server/db.js';
import {testDatabase,fixtures,testPassword} from './database.js';
import {videoSource,secureMediaUrl} from '../app/js/media-utils.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');
const mp4=Buffer.from('00000018667479706d703432000000006d70343269736f6d','hex');
test('administrator media uploads, publication, access and persistent storage',async t=>{
  const db=await testDatabase();await fixtures(db);const origin='http://localhost:3000';
  const config={APP_ORIGIN:origin,NODE_ENV:'test',TRUST_PROXY_HOPS:0,LOG_LEVEL:'silent',ROUTING_URL:''};
  let server,base;async function start(){server=createApp(db,config).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}/api/v1`;}
  await start();t.after(async()=>{await new Promise(resolve=>server.close(resolve));await db.end();});
  const sessions={};
  async function request(path,{as,method='GET',body,raw,headers={}}={}){
    const session=sessions[as];const response=await fetch(base+path,{method,headers:{origin,'x-requested-with':'MafutaWatch',...(session?{cookie:session.cookie,'x-csrf-token':session.csrfToken}:{}),...(body?{'content-type':'application/json'}:{}),...headers},body:raw??(body?JSON.stringify(body):undefined)});
    const data=response.status===204?null:await response.json();return {status:response.status,data,response};
  }
  for(const name of ['admin','alice','inspector','analyst','operator']){const login=await request('/auth/login',{method:'POST',body:{email:`${name}@example.test`,password:testPassword}});assert.equal(login.status,200);sessions[name]={...login.data,cookie:login.response.headers.get('set-cookie').split(';')[0]};}
  const upload=(bytes=png,type='image/png',as='admin',headers={})=>request('/admin/media-assets',{as,method:'POST',headers:{'content-type':type,...headers},raw:bytes});
  const imageBody={title:'Original station photograph',description:'A documented fuel station photograph.',category:'fuel-stations',photographer:'Test photographer',source:'Own photography',license:'CC BY 4.0',caption:'A useful photograph caption.',altText:'Station entrance'};
  let asset,imageId;
  await t.test('only administrators can manage or upload; CSRF is required',async()=>{
    assert.equal((await upload(png,'image/png',null)).status,401);
    for(const as of ['alice','inspector','analyst','operator']){
      assert.equal((await upload(png,'image/png',as)).status,403);assert.equal((await request('/admin/media',{as})).status,403);
      for(const kind of ['media','videos','news']){
        assert.equal((await request(`/${kind}`,{as,method:'POST',body:{}})).status,403);
        assert.equal((await request(`/${kind}/${randomUUID()}`,{as,method:'PATCH',body:{status:'published'}})).status,403);
        assert.equal((await request(`/${kind}/${randomUUID()}`,{as,method:'DELETE'})).status,403);
      }
    }
    assert.equal((await upload(png,'image/png','admin',{'x-csrf-token':''})).status,403);
  });
  await t.test('rejects invalid bytes, SVG and oversized image/video uploads',async()=>{
    assert.equal((await upload(Buffer.from('<script>alert(1)</script>'))).status,415);
    assert.equal((await upload(png,'image/jpeg')).status,415);
    assert.equal((await upload(Buffer.from('<svg/>'),'image/svg+xml')).status,415);
    assert.equal((await upload(Buffer.alloc(0))).status,400);
    assert.equal((await upload(Buffer.alloc(10*1024*1024+1))).status,413);
    assert.equal((await upload(Buffer.alloc(25*1024*1024+1),'video/mp4')).status,413);
  });
  await t.test('device image bytes persist privately until their content is published',async()=>{
    const result=await upload();assert.equal(result.status,201,JSON.stringify(result.data));asset=result.data;
    assert.equal((await fetch(base+asset.url.replace('/api/v1',''))).status,404);
    const draft=await request('/media',{as:'admin',method:'POST',body:{...imageBody,imageUrl:asset.url,status:'draft'}});assert.equal(draft.status,201,JSON.stringify(draft.data));imageId=draft.data.id;
    assert.equal((await request('/media')).data.items.length,0);
    const listing=await request('/admin/media',{as:'admin'});assert.equal(listing.data.media[0].caption,imageBody.caption);assert.equal(listing.data.media[0].alt_text,imageBody.altText);
    assert.equal((await request(`/media/${imageId}`,{as:'admin',method:'PATCH',body:{status:'published'}})).status,200);
    const served=await fetch(base+asset.url.replace('/api/v1',''));assert.equal(served.status,200);assert.equal(served.headers.get('content-type'),'image/png');assert.match(served.headers.get('cache-control'),/no-store/);assert.deepEqual(Buffer.from(await served.arrayBuffer()),png);
    await new Promise(resolve=>server.close(resolve));await start();
    const afterRestart=await fetch(base+asset.url.replace('/api/v1',''));assert.equal(afterRestart.status,200);assert.deepEqual(Buffer.from(await afterRestart.arrayBuffer()),png);
    await transaction(db,async client=>{await client.query('SET LOCAL ROLE mafuta_app');assert.equal((await client.query('SELECT size FROM media_assets WHERE id=$1',[asset.id])).rows[0].size,png.length);});
    await migrate(db);
  });
  await t.test('unpublish, replace, edit and delete preserve shared files and remove unused files',async()=>{
    const news=await request('/news',{as:'admin',method:'POST',body:{title:'Shared featured photograph',summary:'Article summary for a shared photograph.',body:'Article content for the shared photograph.',sourceName:'Test source',sourceUrl:'https://example.test/news',category:'transport',imageUrl:asset.url,status:'draft'}});assert.equal(news.status,201);
    assert.equal((await request(`/admin/media-assets/${asset.id}`,{as:'admin',method:'DELETE'})).status,409);
    assert.equal((await request(`/media/${imageId}`,{as:'admin',method:'PATCH',body:{status:'draft',title:'Edited station photograph'}})).status,200);
    assert.equal((await fetch(base+asset.url.replace('/api/v1',''))).status,404);
    assert.equal((await request(`/media/${imageId}`,{as:'admin',method:'DELETE'})).status,204);
    assert.equal((await db.query('SELECT 1 FROM media_assets WHERE id=$1',[asset.id])).rowCount,1);
    assert.equal((await request(`/news/${news.data.id}`,{as:'admin',method:'DELETE'})).status,204);
    assert.equal((await db.query('SELECT 1 FROM media_assets WHERE id=$1',[asset.id])).rowCount,0);
    const first=(await upload()).data,second=(await upload()).data;
    const created=await request('/media',{as:'admin',method:'POST',body:{...imageBody,imageUrl:first.url}});assert.equal(created.status,201);
    assert.equal((await request(`/media/${created.data.id}`,{as:'admin',method:'PATCH',body:{imageUrl:second.url}})).status,200);
    assert.equal((await db.query('SELECT 1 FROM media_assets WHERE id=$1',[first.id])).rowCount,0);
    assert.equal((await request(`/media/${created.data.id}`,{as:'admin',method:'DELETE'})).status,204);
  });
  await t.test('video uploads support playback byte ranges and publishing metadata',async()=>{
    const video=await upload(mp4,'video/mp4');assert.equal(video.status,201,JSON.stringify(video.data));
    const body={title:'Device uploaded tutorial',description:'A tutorial recorded by the platform team.',category:'platform-howto',videoUrl:video.data.url,duration:'0:01',source:'Platform team',license:'All Rights Reserved',status:'draft'};
    const created=await request('/videos',{as:'admin',method:'POST',body});assert.equal(created.status,201,JSON.stringify(created.data));
    assert.equal((await fetch(base+video.data.url.replace('/api/v1',''))).status,404);
    assert.equal((await request(`/videos/${created.data.id}`,{as:'admin',method:'PATCH',body:{status:'published'}})).status,200);
    const response=await fetch(base+video.data.url.replace('/api/v1',''),{headers:{range:'bytes=4-11'}});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes 4-11/${mp4.length}`);assert.deepEqual(Buffer.from(await response.arrayBuffer()),mp4.subarray(4,12));
    assert.equal((await fetch(base+video.data.url.replace('/api/v1',''),{headers:{range:'bytes=999-1000'}})).status,416);
    assert.equal((await request(`/videos/${created.data.id}`,{as:'admin',method:'PATCH',body:{status:'draft'}})).status,200);
    assert.equal((await request('/videos')).data.items.length,0);
    assert.equal((await request(`/videos/${created.data.id}`,{as:'admin',method:'DELETE'})).status,204);
    assert.equal((await db.query('SELECT 1 FROM media_assets WHERE id=$1',[video.data.id])).rowCount,0);
  });
  await t.test('scheduled news is private, secure URLs and attribution are validated, missing rows return 404',async()=>{
    const image=(await upload()).data;
    const body={title:'Future publication headline',summary:'Scheduled publication summary.',body:'Scheduled news body text.',sourceName:'News desk',sourceUrl:'https://example.test/news',category:'energy-policy',imageUrl:image.url,status:'published',publicationDate:'2099-01-01T12:00:00Z'};
    const created=await request('/news',{as:'admin',method:'POST',body});assert.equal(created.status,201);
    assert.equal((await request('/news')).data.items.length,0);assert.equal((await fetch(base+image.url.replace('/api/v1',''))).status,404);
    assert.equal((await request(`/news/${created.data.id}`,{as:'admin',method:'PATCH',body:{publicationDate:'2026-01-01T12:00:00Z'}})).status,200);
    assert.equal((await request('/news')).data.items[0].title,body.title);
    for(const imageUrl of ['javascript:alert(1)','http://example.test/a.png','https://user:pass@example.test/image.png',`/api/v1/media-assets/${randomUUID()}`])assert.equal((await request('/media',{as:'admin',method:'POST',body:{...imageBody,imageUrl}})).status,400);
    for(const kind of ['media','videos','news'])assert.equal((await request(`/${kind}/${randomUUID()}`,{as:'admin',method:'PATCH',body:{status:'draft'}})).status,404);
    const videoBody={title:'Missing attribution video',description:'Video with no recorded source attribution.',category:'fuel-saving',videoUrl:'https://example.test/video.mp4',duration:'0:30'};
    assert.equal((await request('/videos',{as:'admin',method:'POST',body:videoBody})).status,400);
    assert.equal((await request('/videos',{as:'admin',method:'POST',body:{...videoBody,source:'Owner',license:'All Rights Reserved',videoUrl:'https://untrusted.test/embed/xyz'}})).status,400);
    assert.equal((await request(`/news/${created.data.id}`,{as:'admin',method:'DELETE'})).status,204);
    assert.ok((await db.query("SELECT 1 FROM audit_log WHERE action='media.asset.upload'")).rowCount>0);
  });
});
test('video link normalization accepts only supported secure players',()=>{
  assert.deepEqual(videoSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),{kind:'embed',url:'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'});
  assert.deepEqual(videoSource('https://vimeo.com/123456'),{kind:'embed',url:'https://player.vimeo.com/video/123456'});
  for(const value of ['javascript:alert(1)','http://example.test/video.mp4','https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ','https://example.test/index.html'])assert.equal(videoSource(value),null);
  assert.equal(secureMediaUrl('https://user:secret@example.test/a.png'),false);
});
