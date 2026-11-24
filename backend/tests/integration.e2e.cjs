const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
test('PostgreSQL API enforces pending review and RBAC', { timeout: 60000 }, async () => {
  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) throw Error('Disposable database and JWT_SECRET required');
  const pool = new Pool({connectionString:process.env.DATABASE_URL});
  const port = 31937, base='http://127.0.0.1:'+port+'/api/v1';
  const server=spawn(process.execPath,['dist/main.js'],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
  const req=async(path,method='GET',body,token)=>{
    const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:res.status,data:await res.json()};
  };
  try {
    let up=false;
    for(let i=0;i<60;i++){
      if(server.exitCode!==null)break;
      try{if((await req('/health')).status===200){up=true;break;}}catch(_){}
      await new Promise(r=>setTimeout(r,250));
    }
    assert.ok(up,'API did not start');
    const user='ci'+Date.now()+'@example.test',pass='testing-unique-password-123456';
    const hash=await bcrypt.hash(pass,10);
    await pool.query("INSERT INTO app_users(email,password_hash,role) VALUES($1,$2,'admin')",[user,hash]);
    assert.equal((await req('/stations','POST',{name:'Unauthorized station',district:'Kampala'})).status,401);
    assert.equal((await req('/auth/login','POST',{email:user,password:'bad-password'})).status,401);
    const login=await req('/auth/login','POST',{email:user,password:pass});
    assert.equal(login.status,201);
    const token=login.data.accessToken;
    const station=await req('/stations','POST',{name:'Test Station',district:'Kampala',latitude:0.31,longitude:32.58},token);
    assert.equal(station.status,201);
    const stationId=station.data.id;
    const fakeVerify=await req('/reports','POST',{stationId,fuel:'petrol',price:5500,status:'verified'});
    assert.equal(fakeVerify.status,400);
    const report=await req('/reports','POST',{stationId,fuel:'petrol',price:5500,location:"Kampala');DROP TABLE stations;--"});
    assert.equal(report.status,201);assert.equal(report.data.status,'pending');
    const before=await req('/stations');
    assert.equal(before.data.data.find(s=>s.id===stationId).petrol,null);
    assert.equal((await req('/admin/reports/'+report.data.id+'/verify','POST',{})).status,401);
    assert.equal((await req('/admin/reports/'+report.data.id+'/verify','POST',{},token)).status,201);
    const after=await req('/stations');
    assert.equal(after.data.data.find(s=>s.id===stationId).petrol,5500);
    assert.equal((await req('/admin/reports/'+report.data.id+'/verify','POST',{},token)).status,409);
    const another=await req('/reports','POST',{stationId,fuel:'diesel',price:5100});
    assert.equal((await req('/admin/reports/'+another.data.id+'/reject','POST',{reason:'unconfirmed'},token)).status,201);
    const latest=await req('/stations');
    assert.equal(latest.data.data.find(s=>s.id===stationId).diesel,null);
  }finally{server.kill('SIGTERM');await pool.end();}
});
