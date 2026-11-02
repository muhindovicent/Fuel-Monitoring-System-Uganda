import pg from 'pg';
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 12,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  application_name: 'mafuta_watch_api'
});
pool.on('error', error => console.error('PostgreSQL idle client error:', error.message));
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await fn(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
