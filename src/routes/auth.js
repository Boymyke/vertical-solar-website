// Sign-in, first-time setup, password changes and account bootstrap.
import { ok, json, fail, readJson, clientIp } from '../lib/http.js';
import {
  hashPassword, verifyPassword, createSession, clearCookie, rateLimit, audit, passwordProblems,
  effectivePermissions, MODULES, MODULE_KEYS,
} from '../lib/auth.js';
import { str, isEmail, now, sqlDate, sha256 } from '../lib/util.js';

export function registerAuth(r) {
  r.get('/api/auth/status', async (req, env) => {
    const c = await env.DB.prepare('SELECT COUNT(*) AS c FROM users').first();
    return json({ needs_setup: c.c === 0 });
  });

  // First-run: create the owner account. Requires the one-time setup code stored in settings.
  r.post('/api/auth/setup', async (req, env) => {
    await rateLimit(env, `setup:${clientIp(req)}`, 5, 900);
    const c = await env.DB.prepare('SELECT COUNT(*) AS c FROM users').first();
    if (c.c > 0) fail(403, 'Setup has already been completed');
    const b = await readJson(req, 8192);
    const codeRow = await env.DB.prepare("SELECT value FROM settings WHERE key='setup_code_hash'").first();
    const expected = codeRow ? JSON.parse(codeRow.value) : null;
    const provided = str(b.setup_code, 100);
    const validCode = (expected && provided && (await sha256(provided)) === expected) || (env.SETUP_KEY && provided === env.SETUP_KEY);
    if (!validCode) fail(403, 'Invalid setup code');
    const name = str(b.name, 120), email = str(b.email, 160)?.toLowerCase(), password = String(b.password || '');
    if (!name || !isEmail(email)) fail(400, 'Enter your name and a valid email');
    const probs = passwordProblems(password);
    if (probs.length) fail(400, 'Password needs ' + probs.join(', '));
    const { hash, salt } = await hashPassword(password);
    const u = await env.DB.prepare(`INSERT INTO users (name, email, role, permissions, password_hash, password_salt, must_change_password, job_title)
      VALUES (?,?, 'owner', ?, ?, ?, 0, 'Owner') RETURNING id`).bind(name, email, JSON.stringify(MODULE_KEYS), hash, salt).first();
    await env.DB.prepare("DELETE FROM settings WHERE key='setup_code_hash'").run();
    const cookie = await createSession(env, req, u.id);
    await audit(env, req, { id: u.id }, 'setup_owner', 'users', u.id);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'set-cookie': cookie, 'cache-control': 'no-store' } });
  });

  r.post('/api/auth/login', async (req, env) => {
    const ip = clientIp(req);
    await rateLimit(env, `login:${ip}`, 12, 900);
    const b = await readJson(req, 4096);
    const email = str(b.email, 160)?.toLowerCase();
    const password = String(b.password || '');
    if (!email || !password) fail(400, 'Enter your email and password');
    await rateLimit(env, `login-acct:${email}`, 8, 900);
    const u = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    const generic = 'Incorrect email or password';
    if (!u) { await hashPassword(password); fail(401, generic); }
    if (!u.active) fail(403, 'This account has been deactivated. Contact your administrator.');
    if (u.locked_until && u.locked_until > now()) fail(423, 'Account temporarily locked after failed attempts. Try again in 15 minutes.');
    const valid = await verifyPassword(password, u.password_hash, u.password_salt);
    if (!valid) {
      const fails = u.failed_logins + 1;
      const lock = fails >= 6 ? sqlDate(Date.now() + 15 * 60000) : null;
      await env.DB.prepare('UPDATE users SET failed_logins=?, locked_until=? WHERE id=?').bind(lock ? 0 : fails, lock, u.id).run();
      await audit(env, req, { id: u.id }, 'login_failed', 'users', u.id);
      fail(401, generic);
    }
    await env.DB.prepare('UPDATE users SET failed_logins=0, locked_until=NULL, last_login_at=? WHERE id=?').bind(now(), u.id).run();
    await env.DB.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
    const cookie = await createSession(env, req, u.id);
    await audit(env, req, { id: u.id }, 'login', 'users', u.id);
    return new Response(JSON.stringify({ ok: true, must_change_password: !!u.must_change_password }), {
      headers: { 'content-type': 'application/json', 'set-cookie': cookie, 'cache-control': 'no-store' },
    });
  });

  // Sign-in link for new staff: shows who it is for, then lets them choose a password and signs them in.
  const inviteUser = async (env, token) => {
    if (!token || String(token).length < 20) return null;
    const u = await env.DB.prepare('SELECT id, name, email, active, must_change_password, invite_expires FROM users WHERE invite_hash=?').bind(await sha256(String(token))).first();
    if (!u || !u.active || !u.must_change_password || !u.invite_expires || u.invite_expires < now()) return null;
    return u;
  };
  r.post('/api/auth/invite', async (req, env) => {
    await rateLimit(env, `invite:${clientIp(req)}`, 30, 900);
    const b = await readJson(req, 2048);
    const u = await inviteUser(env, b.token);
    if (!u) fail(410, 'This sign-in link has expired or was already used. Sign in with your email and password, or ask the administrator for a new link.');
    return json({ name: u.name, email: u.email });
  });
  r.post('/api/auth/invite/accept', async (req, env) => {
    await rateLimit(env, `invite:${clientIp(req)}`, 30, 900);
    const b = await readJson(req, 4096);
    const u = await inviteUser(env, b.token);
    if (!u) fail(410, 'This sign-in link has expired or was already used. Ask the administrator for a new link.');
    const probs = passwordProblems(String(b.password || ''));
    if (probs.length) fail(400, 'Your password needs ' + probs.join(', '));
    const { hash, salt } = await hashPassword(String(b.password));
    await env.DB.prepare('UPDATE users SET password_hash=?, password_salt=?, must_change_password=0, invite_hash=NULL, invite_expires=NULL, failed_logins=0, locked_until=NULL, last_login_at=?, updated_at=? WHERE id=?').bind(hash, salt, now(), now(), u.id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id).run();
    const cookie = await createSession(env, req, u.id);
    await audit(env, req, { id: u.id }, 'invite_accepted', 'users', u.id);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'set-cookie': cookie, 'cache-control': 'no-store' } });
  });

  r.post('/api/auth/logout', async (req, env, _p, ctx) => {
    if (ctx.user) await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(ctx.user.session_id).run();
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'set-cookie': clearCookie() } });
  });

  r.get('/api/auth/me', async (req, env, _p, ctx) => {
    if (!ctx.user) fail(401, 'Not signed in');
    const u = ctx.user;
    return json({
      id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, avatar: u.avatar, job_title: u.job_title,
      must_change_password: !!u.must_change_password, permissions: effectivePermissions(u), modules: MODULES,
      profile_complete: u.role === 'owner' || !!u.profile_completed_at,
    });
  });

  r.post('/api/auth/password', async (req, env, _p, ctx) => {
    if (!ctx.user) fail(401, 'Not signed in');
    await rateLimit(env, `pw:${ctx.user.id}`, 6, 900);
    const b = await readJson(req, 4096);
    const u = await env.DB.prepare('SELECT password_hash, password_salt FROM users WHERE id=?').bind(ctx.user.id).first();
    if (!(await verifyPassword(String(b.current || ''), u.password_hash, u.password_salt))) fail(400, 'Current password is incorrect');
    const probs = passwordProblems(String(b.password || ''));
    if (probs.length) fail(400, 'New password needs ' + probs.join(', '));
    const { hash, salt } = await hashPassword(String(b.password));
    await env.DB.prepare('UPDATE users SET password_hash=?, password_salt=?, must_change_password=0, invite_hash=NULL, invite_expires=NULL, updated_at=? WHERE id=?').bind(hash, salt, now(), ctx.user.id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND id != ?').bind(ctx.user.id, ctx.user.session_id).run();
    await audit(env, req, ctx.user, 'password_changed', 'users', ctx.user.id);
    return ok();
  });

}
