import { scrypt as scryptCb, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCb);

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const FUELS = new Set(['petrol', 'diesel']);
export const REPORT_STATUSES = new Set(['verified', 'rejected']);
export const COMPLAINT_TYPES = new Set(['incorrect_price', 'fuel_quality', 'service', 'other']);
export const COMPLAINT_STATUSES = new Set(['investigating', 'resolved', 'dismissed']);
export const isEmail = value => typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value);
export const isPassword = value => typeof value === 'string' && value.length >= 12 && Buffer.byteLength(value) <= 128;
export const isText = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
export const isPositiveId = value => /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));
export const isPrice = value => Number.isInteger(value) && value >= 1000 && value <= 30000;
export const isCoordinate = (v, max) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;
export const hashToken = token => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export async function hashPassword(password) {
  if (!isPassword(password)) throw new Error('Password must be 12-128 bytes');
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  try {
    if (typeof password !== 'string' || Buffer.byteLength(password) > 128) return false;
    const [method, salt, hex] = stored.split('$');
    if (method !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hex)) return false;
    const derived = await scrypt(password, salt, 64);
    return timingSafeEqual(derived, Buffer.from(hex, 'hex'));
  } catch { return false; }
}
export function parseCookies(raw = '') {
  const out = {};
  for (const chunk of raw.split(';')) {
    const index = chunk.indexOf('=');
    if (index < 0) continue;
    const key = chunk.slice(0, index).trim(), value = chunk.slice(index + 1).trim();
    if (key === 'mw_session' && /^[A-Za-z0-9_-]{40,100}$/.test(value)) out[key] = value;
  }
  return out;
}
