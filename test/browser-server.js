import { fixtures,testDatabase } from './database.js';
import { createApp } from '../server/app.js';
import { seedDemo } from '../server/seed.js';
import { randomUUID } from 'node:crypto';

// Isolated in-memory test server, never used by npm start or production images.
if(process.env.TEST_DATABASE_URL)throw new Error('Browser fixtures use an isolated embedded test database.');
const db=await testDatabase();await seedDemo(db);
// seedDemo owns ids 1–60; fixtures requires its own empty operator/station register.
// Only provision test accounts here to avoid collisions with seeded brands.
const accountDb={query:async(sql,params)=>{
  if(sql.startsWith('INSERT INTO operators')||sql.startsWith('INSERT INTO stations')||sql.startsWith('INSERT INTO rooms'))return {rows:[],rowCount:0};
  return db.query(sql,params);
}};
await fixtures(accountDb);
await db.query('INSERT INTO messages(id,user_id,room_id,body) SELECT $1,id,1,$2 FROM users WHERE email=$3',[randomUUID(),'<img src=x onerror="window.XSS=true"> Browser test observation','bob@example.test']);
const port=Number(process.env.BROWSER_TEST_PORT||3100);
if(![3100,3101,3102,3103,3104,3105,3106].includes(port))throw new Error('Browser fixtures must use their dedicated test ports.');
const app=createApp(db,{APP_ORIGIN:`http://localhost:${port}`,NODE_ENV:'test',TRUST_PROXY_HOPS:0,LOG_LEVEL:'silent',ROUTING_URL:''});
const server=app.listen(port,()=>console.log(`Browser fixture ready on ${port}`));
async function stop(){server.close(async()=>{await db.end();process.exit(0);});}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
