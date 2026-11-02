import { pool } from './db.js';
import { isEmail, isPassword, hashPassword } from './security.js';
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!isEmail(email) || !isPassword(password)) {
  console.error('Set BOOTSTRAP_ADMIN_EMAIL and a unique BOOTSTRAP_ADMIN_PASSWORD (12+ chars) temporarily.');
  process.exit(1);
}
try {
  await pool.query('BEGIN');
  await pool.query('SELECT pg_advisory_xact_lock(724901)');
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM app_users WHERE role='admin'");
  if (rows[0].n !== 0) throw new Error('An administrator already exists. Bootstrap refused.');
  const passHash = await hashPassword(password);
  await pool.query("INSERT INTO app_users(email,password_hash,role) VALUES ($1,$2,'admin')", [email,passHash]);
  await pool.query('COMMIT');
  console.log('Initial administrator created. Remove bootstrap secrets from deployment configuration.');
} catch (e) {
  await pool.query('ROLLBACK');
  console.error(e.message);
  process.exitCode = 1;
} finally { await pool.end(); }
