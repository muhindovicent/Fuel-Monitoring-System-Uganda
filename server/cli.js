import { configuration } from './config.js';
import { database,migrate,transaction } from './db.js';
import { audit,ensure } from './security.js';
import { provisionAccount } from './provisioning.js';
import { seedDemo } from './seed.js';

const config=configuration();
const db=database(config,process.env.MIGRATION_DATABASE_URL||config.DATABASE_URL);
const [command,email,role='citizen',displayName='Platform user']=process.argv.slice(2);
try {
  if(command==='migrate') {await migrate(db);console.log('Migrations applied.');}
  else if(command==='seed') {
    ensure(config.NODE_ENV!=='production',400,'Demo seed is disabled in production.');
    await seedDemo(db);console.log('Demo stations imported. All prices remain explicitly labeled demo.');
  } else if(command==='user') {
    await provisionAccount(db,{email,role,password:process.env.USER_PASSWORD,displayName});
    console.log('Account provisioned; existing sessions and integration credentials revoked.');
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
