import { randomBytes, createHash, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';

const scrypt = promisify(derive);
export const secret = () => randomBytes(32).toString('hex');
export const hash = value => createHash('sha256').update(value).digest('hex');
export const emailSchema = z.email().max(254).transform(s => s.toLowerCase());
export const passwordSchema = z.string().min(12).max(128);
export const userFields = 'id,email,display_name,role,identity_verified';
export class HttpError extends Error {
  constructor(status, message, options = {}) { super(message); this.status = status; this.expose = options.expose === true; }
}
export function ensure(condition, status, message) { if (!condition) throw new HttpError(status,message); }
export async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function passwordMatches(password, encoded) {
  const [,salt,key] = encoded.split(':');
  const actual = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const expected = Buffer.from(key,'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function requireUser(req, _res, next) {
  ensure(req.user,401,'Sign in to continue.'); next();
}
export const roles = (...allowed) => (req, _res, next) => {
  ensure(req.user,401,'Sign in to continue.');
  ensure(!req.apiToken && allowed.includes(req.user.role),403,'You do not have permission for this action.');
  next();
};

export async function authenticate(db, req) {
  const bearer = req.get('authorization');
  if (bearer) {
    ensure(/^Bearer mfw_[a-f0-9]{64}$/.test(bearer),401,'Invalid API credential.');
    const token = (await db.query(`SELECT t.id,t.station_id,u.id AS user_id,u.role,u.display_name FROM api_tokens t
      JOIN users u ON u.id=t.user_id JOIN station_staff ss ON ss.user_id=u.id AND ss.station_id=t.station_id
      WHERE t.token_hash=$1 AND t.revoked_at IS NULL AND t.expires_at>now() AND NOT u.disabled AND u.role IN ('operator','admin')`, [hash(bearer.slice(7))])).rows[0];
    ensure(token,401,'Invalid or expired API credential.');
    req.user = { id:token.user_id, role:token.role, display_name:token.display_name };
    req.apiToken = token;
    await db.query('UPDATE api_tokens SET last_used_at=now() WHERE id=$1',[token.id]);
    return;
  }
  const token = req.cookies.mfw_session;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  const session = (await db.query(`SELECT s.token_hash,s.csrf_token,u.${userFields.split(',').join(',u.')}
    FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT u.disabled`, [hash(token)])).rows[0];
  if (session) { req.session = session; req.user = Object.fromEntries(userFields.split(',').map(k => [k,session[k]])); }
}

export async function limit(db, key, max, seconds) {
  const result = await db.query(`INSERT INTO rate_limits(key,hits,expires_at) VALUES ($1,1,now()+($2 * interval '1 second'))
    ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.expires_at<=now() THEN 1 ELSE rate_limits.hits+1 END,
    expires_at=CASE WHEN rate_limits.expires_at<=now() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END RETURNING hits`,[hash(key),seconds]);
  ensure(result.rows[0].hits<=max,429,'Too many requests. Please try again later.');
}

export function writeProtection(config) {
  return (req,_res,next) => {
    if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
    if (req.apiToken) {
      ensure(req.method==='PUT' && /^\/api\/v1\/stations\/\d+\/prices$/.test(req.path),403,'API credentials are restricted to station price updates.');
      return next();
    }
    ensure(req.get('origin')===config.APP_ORIGIN,403,'Request origin is not allowed.');
    ensure(req.get('x-requested-with')==='MafutaWatch',403,'Missing request protection header.');
    if (req.user) ensure(req.get('x-csrf-token')===req.session.csrf_token,403,'Session protection failed. Refresh and retry.');
    next();
  };
}

export async function audit(db, actor, action, entity, details = {}) {
  await db.query('INSERT INTO audit_log(actor_id,action,entity_id,details) VALUES ($1,$2,$3,$4)',[actor,action,String(entity),JSON.stringify(details)]);
}
