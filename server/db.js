import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Calendar dates must not become local-midnight Date objects and shift a day in UTC.
pg.types.setTypeParser(1082,value=>value);

export function database(config, url = config.DATABASE_URL) {
  const pool = new pg.Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000, statement_timeout: 10000,
    ssl: config.PGSSLMODE === 'verify-full' ? { rejectUnauthorized: true } : false });
  pool.on('error', error => console.error('PostgreSQL pool error:', error.code));
  return pool;
}

export async function transaction(db, callback) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function migrate(db) {
  await transaction(db, async client => {
    // One deployment migrator at a time; checksums prevent silently changed history.
    await client.query('SELECT pg_advisory_xact_lock(734182)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const directory = new URL('./migrations/', import.meta.url);
    for (const name of (await readdir(directory)).filter(n => n.endsWith('.sql')).sort()) {
      const sql = await readFile(new URL(name, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = (await client.query('SELECT checksum FROM schema_migrations WHERE name=$1', [name])).rows[0];
      if (existing && existing.checksum !== checksum) throw new Error(`Migration checksum mismatch: ${name}`);
      if (!existing) {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name,checksum) VALUES ($1,$2)', [name,checksum]);
      }
    }
  });
}
