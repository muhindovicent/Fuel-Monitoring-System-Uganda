require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(4251983)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const dir = path.join(__dirname, '..', 'migrations');
    for (const file of fs.readdirSync(dir).filter(f => /^\d+.*\.sql$/.test(f)).sort()) {
      const present = await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [file]);
      if (present.rowCount) continue;
      await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [file]);
      console.log('Applied migration:', file);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
