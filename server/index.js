import { configuration } from './config.js';
import { database } from './db.js';
import { createApp } from './app.js';

const config=configuration();
const db=database(config);
await db.query('SELECT name FROM schema_migrations LIMIT 1');
const server=createApp(db,config).listen(config.PORT,'0.0.0.0',()=>console.log(`MafutaWatch listening on ${config.APP_ORIGIN}`));
server.requestTimeout=30000;server.headersTimeout=15000;server.keepAliveTimeout=5000;
let shuttingDown=false;
async function shutdown() {
  if(shuttingDown)return;shuttingDown=true;
  const timeout=setTimeout(()=>process.exit(1),15000);timeout.unref();
  server.close(async()=>{await db.end();clearTimeout(timeout);process.exit(0);});
}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
