import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase, fixtures, testPassword } from './database.js';
import { createApp } from '../server/app.js';

const origin='http://localhost:3000';

function client(server){
  const base=`http://127.0.0.1:${server.address().port}`;
  const sessions={};
  async function request(path,{as,method='GET',body,headers={}}={}){
    const session=sessions[as];
    const response=await fetch(`${base}/api/v1${path}`,{method,headers:{origin,'x-requested-with':'MafutaWatch',...(session?{cookie:session.cookie,'x-csrf-token':session.csrfToken}:{}),...(body?{'content-type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
    const data=response.status===204?null:await response.json();
    return {status:response.status,data,response};
  }
  async function login(email,password=testPassword){
    const result=await request('/auth/login',{method:'POST',body:{email,password}});
    if(result.status!==200)throw new Error(`Login failed for ${email}: ${result.status}`);
    return {...result.data,cookie:result.response.headers.get('set-cookie').split(';')[0]};
  }
  return {request,login,sessions};
}

test('Public profile privacy keeps members anonymous by default and follows explicit choices',async t=>{
  const db=await testDatabase(),users=await fixtures(db);
  const app=createApp(db,{APP_ORIGIN:origin,NODE_ENV:'test',TRUST_PROXY_HOPS:0,LOG_LEVEL:'silent',ROUTING_URL:''});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await db.end();});
  const {request,login,sessions}=client(server);
  sessions.bob=await login(users.bob.email);
  sessions.alice=await login(users.alice.email);
  sessions.admin=await login(users.admin.email);
  const reviewBody='Clear pump prices at this stop.';
  const messageBody='Corridor update from the road.';
  const findReview=async()=>(await request('/stations/1')).data.reviews.find(review=>review.body===reviewBody);
  const findMessage=async()=>(await request('/rooms/1/messages')).data.items.find(message=>message.body===messageBody);

  await t.test('reviews and community messages carry no member identity without an explicit preference',async()=>{
    assert.equal((await request('/stations/1/reviews',{as:'bob',method:'POST',body:{rating:5,body:reviewBody}})).status,201);
    assert.equal((await request('/rooms/1/messages',{as:'bob',method:'POST',body:{body:messageBody}})).status,201);
    const review=await findReview();
    assert.equal(review.display_name,'Anonymous Member');
    assert.deepEqual(Object.keys(review).sort(),['body','created_at','display_name','id','rating']);
    const message=await findMessage();
    assert.equal(message.display_name,'Anonymous Member');
    assert.deepEqual(Object.keys(message).sort(),['body','created_at','display_name','id','votes']);
  });

  await t.test('an explicit opt-in publishes the display name on existing public content',async()=>{
    assert.equal((await request('/me/preferences',{as:'bob',method:'PATCH',body:{privacy:{publicDisplayName:true}}})).status,200);
    assert.equal((await findReview()).display_name,'bob');
    assert.equal((await findMessage()).display_name,'bob');
  });

  await t.test('the preference persists across logout and login',async()=>{
    assert.equal((await request('/auth/logout',{as:'bob',method:'POST'})).status,204);
    delete sessions.bob;
    sessions.bob=await login(users.bob.email);
    const prefs=await request('/me/preferences',{as:'bob'});
    assert.equal(prefs.data.preferences.privacy.publicDisplayName,true);
    assert.equal((await findMessage()).display_name,'bob');
  });

  await t.test('turning the choice off hides the name again',async()=>{
    assert.equal((await request('/me/preferences',{as:'bob',method:'PATCH',body:{privacy:{publicDisplayName:false}}})).status,200);
    assert.equal((await findReview()).display_name,'Anonymous Member');
    assert.equal((await findMessage()).display_name,'Anonymous Member');
  });

  await t.test('preferences can only ever be changed for the signed-in account',async()=>{
    const before=(await db.query('SELECT privacy FROM user_preferences WHERE user_id=$1',[users.bob.id])).rows[0];
    const rejected=await request('/me/preferences',{as:'alice',method:'PATCH',body:{userId:users.bob.id,privacy:{publicDisplayName:true}}});
    assert.equal(rejected.status,400);
    const after=(await db.query('SELECT privacy FROM user_preferences WHERE user_id=$1',[users.bob.id])).rows[0];
    assert.deepEqual(after,before);
    assert.equal((await request('/me/preferences',{as:'alice',method:'PATCH',body:{privacy:{publicDisplayName:true}}})).status,200);
    assert.equal((await findMessage()).display_name,'Anonymous Member','One member opt-in never exposes another member.');
    assert.equal((await request('/me/preferences')).status,401);
    assert.equal((await request('/me/preferences',{method:'PATCH',body:{privacy:{publicDisplayName:true}}})).status,401);
  });

  await t.test('official announcements are attributed to the platform without user identifiers',async()=>{
    const advisory=await request('/advisories',{as:'admin',method:'POST',body:{title:'Fuel supply advisory',body:'Plan refuelling ahead of the weekend.',sourceUrl:'https://example.test/advisory'}});
    assert.equal(advisory.status,201);
    const advisories=await request('/advisories');
    const item=advisories.data.items.find(entry=>entry.id===advisory.data.id);
    assert.equal(item.author,'MafutaWatch Uganda');
    assert.deepEqual(Object.keys(item).sort(),['author','body','created_at','id','source_url','title']);
    assert.equal(JSON.stringify(advisories.data).includes(users.admin.id),false);

    const news=await request('/news',{as:'admin',method:'POST',body:{title:'Published price bulletin',summary:'Weekly published price summary.',body:'Weekly published price summary body content.',sourceUrl:'https://example.test/news',sourceName:'MafutaWatch desk',category:'fuel-prices'}});
    assert.equal(news.status,201);
    const articles=await request('/news');
    const article=articles.data.items.find(entry=>entry.id===news.data.id);
    assert.equal(article.author,'MafutaWatch Uganda');
    assert.equal('created_by' in article,false);
    assert.equal(JSON.stringify(articles.data).includes(users.admin.id),false);
  });

  await t.test('authorized surfaces keep real attribution',async()=>{
    const staff=await request('/admin/users',{as:'admin'});
    assert.equal(staff.status,200);
    const admin=staff.data.items.find(entry=>entry.id===users.admin.id);
    assert.equal(admin.email,users.admin.email);
    assert.equal(admin.display_name,'admin');
    assert.equal((await request('/admin/users')).status,401);
    assert.equal((await request('/admin/users',{as:'bob'})).status,403);

    const created=await request('/tickets',{as:'alice',method:'POST',headers:{'idempotency-key':randomUUID()},body:{stationId:1,category:'quality',vehicleType:'boda',incidentDate:new Date().toISOString().slice(0,10),description:'Engine stalled immediately after refuelling.'}});
    assert.equal(created.status,201);
    assert.equal((await request(`/tickets/${created.data.id}/messages`,{as:'alice',method:'POST',body:{body:'Adding my receipt detail.'}})).status,201);
    const state=await request(`/tickets/${created.data.id}`,{as:'alice'});
    const mine=state.data.messages.find(entry=>entry.body==='Adding my receipt detail.');
    assert.equal(mine.display_name,'alice');
    assert.equal((await request(`/tickets/${created.data.id}`,{as:'bob'})).status,404);
  });
});
