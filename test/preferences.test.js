import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase, fixtures, testPassword } from './database.js';
import { createApp } from '../server/app.js';

test('Account preferences persist, preserve authority and control event delivery',async t=>{
  const db=await testDatabase(),users=await fixtures(db),origin='http://localhost:3000';
  const server=createApp(db,{APP_ORIGIN:origin,NODE_ENV:'test',TRUST_PROXY_HOPS:0,LOG_LEVEL:'silent',ROUTING_URL:''}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await db.end();});
  const sessions={},base=`http://127.0.0.1:${server.address().port}/api/v1`;
  async function request(path,{as,method='GET',body,expected=200}={}){
    const session=sessions[as];
    const response=await fetch(base+path,{method,headers:{origin,'x-requested-with':'MafutaWatch','idempotency-key':randomUUID(),...(session?{cookie:session.cookie,'x-csrf-token':session.csrfToken}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    const data=response.status===204?null:await response.json();
    assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(data)}`);
    return {data,response};
  }
  async function login(as,password=testPassword){
    const {data,response}=await request('/auth/login',{method:'POST',body:{email:users[as].email,password}});
    sessions[as]={...data,cookie:response.headers.get('set-cookie').split(';')[0]};
  }
  const prefs=async as=>(await request('/me/preferences',{as})).data.preferences;
  const save=(as,body)=>request('/me/preferences',{as,method:'PATCH',body});
  const count=async as=>(await db.query('SELECT count(*)::int AS n FROM notifications WHERE user_id=$1',[users[as].id])).rows[0].n;
  const ticket=async()=> (await request('/tickets',{as:'alice',method:'POST',expected:201,body:{stationId:1,category:'quality',vehicleType:'private',incidentDate:new Date().toISOString().slice(0,10),description:'Please investigate this pump reading and receipt.'}})).data;
  for(const as of ['alice','admin','inspector','analyst','operator'])await login(as);

  for(const [as,body] of [
    ['alice',{notifications:{complaintUpdates:false}}],
    ['admin',{roleSettings:{securityAlerts:false,dashboardPreferences:true,lastAdminTab:'audit'}}],
    ['inspector',{roleSettings:{assignedCaseNotifications:false,workspacePreferences:true,lastCaseStatus:'',lastCaseAssignment:'unassigned'}}],
    ['analyst',{roleSettings:{savedChartFilters:true,lastFuelView:'diesel'}}],
    ['operator',{roleSettings:{priceUpdateNotifications:false,assignedStationDashboard:true,lastStationId:2}}]
  ])await t.test(`${as}: save and re-login retain settings`,async()=>{
    await save(as,body);
    await request('/auth/logout',{as,method:'POST',expected:204});await login(as);
    for(const [key,value] of Object.entries(body))assert.deepEqual((await prefs(as))[key],value);
  });

  await t.test('partial and concurrent updates preserve other keys and sections',async()=>{
    await save('admin',{fuelType:'diesel',vehicleType:'truck',preferredDistrict:'Jinja',notifications:{priceChanges:false,advisories:false},privacy:{publicDisplayName:true}});
    await Promise.all([save('admin',{notifications:{reportUpdates:false}}),save('admin',{notifications:{complaintUpdates:false}})]);
    await save('admin',{roleSettings:{securityAlerts:true}});
    assert.deepEqual(await prefs('admin'),{fuelType:'diesel',vehicleType:'truck',preferredDistrict:'Jinja',notifications:{priceChanges:false,advisories:false,reportUpdates:false,complaintUpdates:false},privacy:{publicDisplayName:true},roleSettings:{securityAlerts:true,dashboardPreferences:true,lastAdminTab:'audit'}});
  });

  await t.test('invalid, cross-role and unauthenticated updates cannot change authority',async()=>{
    const authority=async()=>({users:(await db.query('SELECT id,role,identity_verified,disabled FROM users ORDER BY id')).rows,assignments:(await db.query('SELECT * FROM station_staff ORDER BY user_id,station_id')).rows});
    const before=await authority(),other=await prefs('admin');
    await request('/me/preferences',{method:'PATCH',body:{notifications:{advisories:false}},expected:401});
    for(const body of [{role:'admin'},{userId:users.admin.id},{identityVerified:true},{stationId:2},{assignedTo:users.inspector.id},{roleSettings:{securityAlerts:true}},{notifications:{unknown:false}},{privacy:{unknown:true}}])await request('/me/preferences',{as:'alice',method:'PATCH',body,expected:400});
    for(const [as,roleSettings] of [['admin',{inspectionAlerts:true}],['inspector',{lastCaseAssignment:'any'}],['analyst',{lastFuelView:'gas'}],['operator',{lastStationId:-1}],['operator',{assignedStationDashboard:'yes'}]])await request('/me/preferences',{as,method:'PATCH',body:{roleSettings},expected:400});
    await save('operator',{roleSettings:{lastStationId:999999}});
    assert.deepEqual(await authority(),before);assert.deepEqual(await prefs('admin'),other);
    await request('/admin/users',{as:'alice',expected:403});
    await request('/stations/2/prices',{as:'operator',method:'PUT',body:{fuel:'petrol',price:5400},expected:403});
  });

  for(const enabled of [false,true])await t.test(`case receipt, reply, transition and inspector alerts: ${enabled}`,async()=>{
    await save('alice',{notifications:{complaintUpdates:enabled}});
    await save('inspector',{roleSettings:{inspectionAlerts:enabled,assignedCaseNotifications:enabled}});
    const citizenBefore=await count('alice'),officerBefore=await count('inspector');
    const created=await ticket();
    await request(`/tickets/${created.id}/messages`,{as:'admin',method:'POST',expected:201,body:{body:'Receipt review has started.'}});
    await request(`/tickets/${created.id}`,{as:'admin',method:'PATCH',body:{status:'investigating',assignedTo:users.inspector.id,reason:'Assigned for receipt investigation.',version:created.version}});
    assert.equal(await count('alice')-citizenBefore,enabled?3:0);
    assert.equal(await count('inspector')-officerBefore,enabled?2:0);
  });

  await request('/stations/1/subscription',{as:'alice',method:'PUT',body:{enabled:true}});
  for(const enabled of [false,true])await t.test(`subscriber and assigned operator price alerts: ${enabled}`,async()=>{
    await save('alice',{notifications:{priceChanges:enabled}});await save('operator',{roleSettings:{priceUpdateNotifications:enabled}});
    const citizenBefore=await count('alice'),operatorBefore=await count('operator');
    await request('/stations/1/prices',{as:'admin',method:'PUT',body:{fuel:'petrol',price:enabled?5600:5500}});
    assert.equal(await count('alice')-citizenBefore,enabled?1:0);assert.equal(await count('operator')-operatorBefore,enabled?1:0);
  });

  for(const enabled of [false,true])await t.test(`advisory and report review alerts: ${enabled}`,async()=>{
    await save('alice',{notifications:{advisories:enabled,reportUpdates:enabled}});
    const before=await count('alice');
    await request('/advisories',{as:'admin',method:'POST',expected:201,body:{title:'Fuel receipt advisory',body:'Keep a receipt for every fuel purchase.',sourceUrl:'https://example.org/advisory'}});
    const report=(await request('/reports',{as:'alice',method:'POST',expected:201,body:{stationId:1,fuel:'diesel',price:5300,note:'Receipt observation.'}})).data;
    await request(`/admin/reports/${report.id}`,{as:'admin',method:'PATCH',body:{status:'rejected',reason:'Insufficient receipt evidence.'}});
    assert.equal(await count('alice')-before,enabled?2:0);
  });

  await t.test('consensus checks each reporter preference and delivers by default',async()=>{
    for(const as of ['verified1','verified2','verified3'])await login(as);
    await save('verified1',{notifications:{reportUpdates:false}});
    await save('verified2',{notifications:{reportUpdates:true}});
    for(const as of ['verified1','verified2','verified3'])await request('/reports',{as,method:'POST',expected:201,body:{stationId:2,fuel:'kerosene',price:4100}});
    const messages=async as=>(await request('/me/notifications',{as})).data.items.filter(n=>n.message.includes('consensus'));
    assert.equal((await messages('verified1')).length,0);
    assert.equal((await messages('verified2')).length,1);assert.equal((await messages('verified3')).length,1);
  });

  await db.query("UPDATE users SET role='admin' WHERE id=$1",[users.bob.id]);await login('bob');
  for(const enabled of [false,true])await t.test(`other-admin security alerts: ${enabled}`,async()=>{
    await save('bob',{roleSettings:{securityAlerts:enabled}});
    const before=await count('bob');
    await request(`/admin/users/${users.alice.id}`,{as:'admin',method:'PATCH',body:{identityVerified:enabled,reason:'Identity evidence reviewed by an administrator.'}});
    await request('/admin/staff',{as:'admin',method:'POST',expected:201,body:{email:`staff-${enabled}@example.test`,displayName:'Provisioned officer',password:testPassword,role:'inspector',administratorPassword:testPassword,identityVerified:true,reason:'Verified officer provisioned for field investigation.'}});
    assert.equal(await count('bob')-before,enabled?2:0);
  });

  await t.test('essential password and station access notices bypass all optional choices',async()=>{
    await save('operator',{notifications:{priceChanges:false,reportUpdates:false,complaintUpdates:false,advisories:false},roleSettings:{priceUpdateNotifications:false,assignedStationDashboard:false}});
    const before=await count('operator'),adminBefore=await count('bob');
    await request('/admin/stations/2/staff',{as:'admin',method:'POST',expected:201,body:{userId:users.operator.id,reason:'Assigning station for operational coverage.'}});
    await request(`/admin/stations/2/staff/${users.operator.id}`,{as:'admin',method:'DELETE',expected:204});
    await request(`/admin/users/${users.operator.id}/password`,{as:'admin',method:'POST',body:{newPassword:'Replacement-test-password-2026!',administratorPassword:testPassword,reason:'Verified account owner requested credential recovery.'}});
    assert.equal(await count('operator')-before,3);assert.equal(await count('bob')-adminBefore,1);
    await login('operator','Replacement-test-password-2026!');
    assert.ok((await request('/me/notifications',{as:'operator'})).data.items.some(n=>n.message.includes('reset your MafutaWatch password')));
  });
});
