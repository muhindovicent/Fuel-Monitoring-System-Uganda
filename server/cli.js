import { randomUUID } from 'node:crypto';
import { configuration } from './config.js';
import { database,migrate,transaction } from './db.js';
import { audit,emailSchema,passwordSchema,passwordHash,ensure } from './security.js';
import { seedDemo } from './seed.js';
import { z } from 'zod';

const config=configuration();
const db=database(config,process.env.MIGRATION_DATABASE_URL||config.DATABASE_URL);
const [command,email,role='citizen',displayName='Platform user']=process.argv.slice(2);
try {
  if(command==='migrate') {await migrate(db);console.log('Migrations applied.');}
  else if(command==='seed') {
    ensure(config.NODE_ENV!=='production',400,'Demo seed is disabled in production.');
    await seedDemo(db);console.log('Demo stations imported. All prices remain explicitly labeled demo.');
  } else if(command==='user') {
    const validatedEmail=emailSchema.parse(email);
    const validatedRole=z.enum(['citizen','operator','inspector','analyst','admin']).parse(role);
    const password=passwordSchema.parse(process.env.USER_PASSWORD);
    const name=z.string().trim().min(2).max(80).parse(displayName);
    await transaction(db,async client=>{
      const existing=(await client.query('SELECT id FROM users WHERE email=$1 FOR UPDATE',[validatedEmail])).rows[0];
      const id=existing?.id??randomUUID();
      await client.query(`INSERT INTO users(id,email,display_name,password_hash,role) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,role=EXCLUDED.role,display_name=EXCLUDED.display_name,disabled=false`,[id,validatedEmail,name,await passwordHash(password),validatedRole]);
      await client.query('DELETE FROM sessions WHERE user_id=$1',[id]);
      await client.query('UPDATE api_tokens SET revoked_at=now() WHERE user_id=$1',[id]);
      await audit(client,null,'cli.account_provision',id,{email:validatedEmail,role:validatedRole});
    });console.log('Account provisioned; existing sessions and integration credentials revoked.');
  } else if(command==='maintain') {
    await transaction(db,async client=>{
      await client.query('DELETE FROM sessions WHERE expires_at<now()');
      await client.query('DELETE FROM rate_limits WHERE expires_at<now()');
      await client.query("UPDATE reports SET status='expired',decision_reason='No decision within the 48-hour observation window' WHERE status='pending' AND created_at<now()-interval '48 hours'");
      await client.query("DELETE FROM notifications WHERE created_at<now()-interval '90 days'");
      await audit(client,null,'maintenance.complete','system');
    });console.log('Expired sessions/rate limits cleaned, pending observations expired, old notifications removed.');
  } else throw new Error('Usage: cli.js migrate | seed | maintain | user <email> <role> <display name>. Set USER_PASSWORD for provisioning.');
} finally {await db.end();}
