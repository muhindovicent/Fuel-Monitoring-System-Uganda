import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { database,migrate } from '../server/db.js';
import { passwordHash } from '../server/security.js';

export const testPassword='Test-only-password-2026!';
export async function testDatabase() {
  let db;
  if(process.env.TEST_DATABASE_URL) {
    const url=new URL(process.env.TEST_DATABASE_URL);
    if(url.pathname!=='/mafuta_test')throw new Error('Tests may reset only the mafuta_test database.');
    db=database({DATABASE_URL:url.href,PGSSLMODE:'disable'});
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  } else {
    const engine=new PGlite();
    // The embedded engine has one connection. Hold the same mutex for entire transactions.
    let tail=Promise.resolve();
    async function acquire() {let release;const previous=tail;tail=new Promise(resolve=>{release=resolve;});await previous;return release;}
    const query=async(text,params=[])=>{
      const result=params.length?await engine.query(text,params):(await engine.exec(text)).at(-1);
      return {...result,rowCount:result?.rows?.length||result?.affectedRows||0};
    };
    db={
      async query(text,params){const release=await acquire();try{return await query(text,params);}finally{release();}},
      async connect(){const release=await acquire();return {query,release};},
      async end(){await engine.close();},
    };
  }
  await db.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mafuta_app') THEN CREATE ROLE mafuta_app NOSUPERUSER NOCREATEDB NOCREATEROLE; END IF; END; $$;");
  await migrate(db);
  const grants=await readFile(new URL('../deploy/runtime-grants.sql',import.meta.url),'utf8');
  await db.query(grants.replaceAll(':"runtime_role"','"mafuta_app"'));
  return db;
}
export async function fixtures(db) {
  await db.query("INSERT INTO operators(id,name,short_name) VALUES (1,'Test operator','Test')");
  await db.query("INSERT INTO stations(id,operator_id,name,area,district,region,latitude,longitude) VALUES (1,1,'Kampala Test Station','Central','Kampala','Central',0.31,32.58),(2,1,'Jinja Test Station','Town','Jinja','Eastern',0.425,33.204)");
  await db.query("INSERT INTO rooms(id,name) VALUES (1,'Kampala–Jinja')");
  const users={};const encoded=await passwordHash(testPassword);
  for(const [name,role,verified] of [['admin','admin',true],['inspector','inspector',true],['analyst','analyst',false],['operator','operator',true],['alice','citizen',false],['bob','citizen',false],['verified1','citizen',true],['verified2','citizen',true],['verified3','citizen',true]]) {
    const id=randomUUID();users[name]={id,email:`${name}@example.test`,role};
    await db.query('INSERT INTO users(id,email,display_name,password_hash,role,identity_verified) VALUES ($1,$2,$3,$4,$5,$6)',[id,users[name].email,name,encoded,role,verified]);
  }
  await db.query('INSERT INTO station_staff(user_id,station_id) VALUES ($1,1)',[users.operator.id]);
  for(const table of ['stations','operators','rooms'])await db.query(`SELECT setval(pg_get_serial_sequence('${table}','id'),greatest(1,(SELECT max(id) FROM ${table})))`);
  return users;
}
