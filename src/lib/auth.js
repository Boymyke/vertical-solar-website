// Authentication, sessions, permissions, rate limiting, audit + notifications.
import { HttpError, clientIp } from './http.js';
import { randomToken, sha256, now, sqlDate, parseJSON } from './util.js';

export const MODULES = {
  dashboard: 'Dashboard',
  crm: 'CRM & Sales (customers, leads, pipeline)',
  followups: 'Follow-ups & reminders',
  quotes: 'Solar Quotation Engine',
  installations: 'Installation Tracking & job sites',
  attendance: 'Staff attendance & location alerts',
  field: 'Field app (clock in/out, submit work reports)',
  inventory: 'Inventory Management',
  shop: 'Online shop & orders',
  support: 'Customer Support tickets',
  maintenance: 'Maintenance & Warranties',
  analytics: 'Analytics, visitors & heatmaps',
  chats: 'Website AI chat conversations',
  ai: 'AI Sales Assistant',
  website: 'Website content (pages, testimonials, certificates, socials, popups)',
  blog: 'Blog posts',
  email: 'Email customers',
  users: 'Users, roles & access',
  settings: 'Company settings',
};
export const MODULE_KEYS = Object.keys(MODULES);

const SESSION_DAYS = 7;
const PBKDF2_ITER = 100000;
const COOKIE = 'vs_session';

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function hashPassword(password, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256);
  return { hash: b64(bits), salt: b64(salt) };
}

export async function verifyPassword(password, hash, salt) {
  const { hash: h } = await hashPassword(password, salt);
  if (h.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

export function passwordProblems(pw = '') {
  const p = [];
  if (pw.length < 10) p.push('at least 10 characters');
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) p.push('upper and lower case letters');
  if (!/\d/.test(pw)) p.push('a number');
  return p;
}

export function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const a = crypto.getRandomValues(new Uint8Array(12));
  let s = [...a].map((n) => chars[n % chars.length]).join('');
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8) + '7';
}

function readCookie(req, name) {
  const c = req.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export async function createSession(env, req, userId) {
  const token = randomToken(32);
  const id = await sha256(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await env.DB.prepare('INSERT INTO sessions (id, user_id, ip, user_agent, expires_at) VALUES (?,?,?,?,?)')
    .bind(id, userId, clientIp(req), (req.headers.get('user-agent') || '').slice(0, 250), sqlDate(expires)).run();
  const secure = new URL(req.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}

export async function getSessionUser(env, req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const id = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.permissions, u.active, u.avatar, u.job_title, u.must_change_password, s.id AS session_id
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > datetime('now')`
  ).bind(id).first();
  if (!row || !row.active) return null;
  row.permissions = parseJSON(row.permissions, []);
  return row;
}

export function can(user, perm) {
  if (!user) return false;
  if (user.role === 'owner') return true;
  return user.permissions.includes(perm);
}

export function effectivePermissions(user) {
  return user.role === 'owner' ? MODULE_KEYS : user.permissions.filter((p) => MODULE_KEYS.includes(p));
}

export function requirePerm(user, ...perms) {
  if (!user) throw new HttpError(401, 'Please sign in');
  if (!perms.some((p) => can(user, p))) throw new HttpError(403, 'You do not have access to this section');
}

// Fixed-window rate limiter backed by D1.
export async function rateLimit(env, key, limit, windowSec) {
  const nowS = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, count, reset_at) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.reset_at < ?3 THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at < ?3 THEN ?2 ELSE rate_limits.reset_at END
     RETURNING count, reset_at`
  ).bind(key, nowS + windowSec, nowS).first();
  if (row && row.count > limit) {
    throw new HttpError(429, 'Too many requests — please wait a moment and try again.', { retry_after: row.reset_at - nowS });
  }
}

export async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true; // not configured → rely on honeypot + rate limits
  if (!token) throw new HttpError(400, 'Please complete the security check');
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  form.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const data = await r.json();
  if (!data.success) throw new HttpError(400, 'Security check failed — please refresh and try again');
  return true;
}

export async function audit(env, req, user, action, entity, entityId, meta) {
  try {
    await env.DB.prepare('INSERT INTO audit_log (user_id, action, entity, entity_id, meta, ip) VALUES (?,?,?,?,?,?)')
      .bind(user?.id ?? null, action, entity ?? null, entityId != null ? String(entityId) : null,
        meta ? JSON.stringify(meta).slice(0, 2000) : null, req ? clientIp(req) : null).run();
  } catch (e) { console.error('audit failed', e); }
}

export async function notify(env, { module = null, userId = null, type = 'info', title, body = null, link = null }) {
  await env.DB.prepare('INSERT INTO notifications (user_id, module, type, title, body, link, created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(userId, module, type, title, body, link, now()).run();
}
