require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
if (!process.env.DATABASE_URL || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 16) {
  throw new Error('DATABASE_URL, valid BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (16+ chars) required');
}
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO app_users(email,password_hash,role) VALUES($1,$2,'admin') ON CONFLICT (email) DO NOTHING RETURNING id",
      [email, hash]
    );
    if (!result.rowCount) throw new Error('Account already exists; refusing to overwrite its credentials');
    console.log('Created admin account with id', result.rows[0].id);
  } finally { await pool.end(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
