// Staff features: profiles, site schedules, on-site issue reports, notifications (dismiss + push)
// and the website policy editor.
import { json, ok, fail, readJson } from '../lib/http.js';
import { requirePerm, can, notify, audit, rateLimit, MODULE_KEYS } from '../lib/auth.js';
import { vapidKeys } from '../lib/push.js';
import { str, num, now, parseJSON, sanitizeHtml, normPhone } from '../lib/util.js';

// Nigeria is on West Africa Time all year (UTC+1, no daylight saving).
const LAGOS_OFFSET_MIN = 60;
export const lagosToUtc = (date, hm) => {
  const [y, m, d] = date.split('-').map(Number), [h, mi] = hm.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, mi) - LAGOS_OFFSET_MIN * 60000).toISOString().replace('T', ' ').slice(0, 19);
};
export const utcToLagosHm = (sql) => new Date(new Date(sql.replace(' ', 'T') + 'Z').getTime() + LAGOS_OFFSET_MIN * 60000).toISOString().slice(11, 16);

export const PROFILE_FIELDS = {
  date_of_birth: 'str:10', gender: 'str:20', address: 'str:300', state_of_origin: 'str:60', marital_status: 'str:20',
  emergency_name: 'str:120', emergency_phone: 'str:30', emergency_relation: 'str:40',
  skills: 'str:600', certifications: 'str:600', start_date: 'str:10', branch: 'str:80', bio: 'str:600',
};
const REQUIRED_PROFILE = ['date_of_birth', 'address', 'emergency_name', 'emergency_phone'];

export const POLICIES = {
  privacy: 'Privacy policy', terms: 'Terms of service', 'installation-policy': 'Installation policy',
  'support-policy': 'Support & warranty policy', accessibility: 'Accessibility statement',
};

const ISSUE_CATS = ['safety', 'equipment', 'materials', 'customer', 'access', 'weather', 'other'];
const URGENCY = ['low', 'normal', 'high', 'urgent'];

export function registerStaff(r) {
  // ───────────── Notifications: close (dismiss), newest for push, push subscriptions ─────────────
  r.post('/api/admin/notifications/dismiss', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, ...MODULE_KEYS);
    const b = await readJson(req, 16384);
    const ids = (Array.isArray(b.ids) ? b.ids : []).map((x) => num(x, 0)).filter(Boolean).slice(0, 200);
    if (ids.length) {
      await env.DB.batch(ids.flatMap((id) => [
        env.DB.prepare('INSERT OR IGNORE INTO notification_dismissals (notification_id, user_id) VALUES (?,?)').bind(id, ctx.user.id),
        env.DB.prepare('INSERT OR IGNORE INTO notification_reads (notification_id, user_id) VALUES (?,?)').bind(id, ctx.user.id),
      ]));
    }
    return ok();
  });

  r.get('/api/admin/push/key', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, ...MODULE_KEYS);
    return json({ key: (await vapidKeys(env)).publicKey });
  });
  r.post('/api/admin/push/subscribe', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, ...MODULE_KEYS);
    const b = await readJson(req, 8192);
    const endpoint = str(b.endpoint, 1000);
    // Only real browser push services — never let the server be pointed at arbitrary URLs.
    const host = (() => { try { return new URL(endpoint).hostname; } catch { return ''; } })();
    const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com|push\.api\.chrome\.google\.com)$/;
    if (!endpoint || !endpoint.startsWith('https://') || !PUSH_HOSTS.test(host)) fail(400, 'Invalid subscription');
    await env.DB.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?,?,?,?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth`)
      .bind(ctx.user.id, endpoint, str(b.keys?.p256dh, 200), str(b.keys?.auth, 100)).run();
    return ok();
  });
  r.post('/api/admin/push/unsubscribe', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, ...MODULE_KEYS);
    const b = await readJson(req, 4096);
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?').bind(str(b.endpoint, 1000), ctx.user.id).run();
    return ok();
  });
  // Used by the service worker after a push wakes it.
  r.get('/api/admin/notifications/latest', async (req, env, _p, ctx) => {
    if (!ctx.user) return json({ item: null });
    const perms = ctx.user.role === 'owner' ? MODULE_KEYS : ctx.user.permissions;
    const ph = perms.map(() => '?').join(',') || "''";
    const item = await env.DB.prepare(`SELECT n.id, n.title, n.body, n.link, n.type FROM notifications n
      WHERE (n.user_id = ? OR (n.user_id IS NULL AND (n.module IS NULL OR n.module IN (${ph}))))
      AND n.id NOT IN (SELECT notification_id FROM notification_reads WHERE user_id=?) ORDER BY n.id DESC LIMIT 1`).bind(ctx.user.id, ...perms, ctx.user.id).first();
    return json({ item });
  });

  // ───────────── My profile (every signed-in person) ─────────────
  r.get('/api/auth/profile', async (req, env, _p, ctx) => {
    if (!ctx.user) fail(401, 'Not signed in');
    const u = await env.DB.prepare('SELECT id, name, email, phone, job_title, avatar, role, profile, profile_completed_at FROM users WHERE id=?').bind(ctx.user.id).first();
    return json({ ...u, profile: parseJSON(u.profile, {}) });
  });
  r.put('/api/auth/profile', async (req, env, _p, ctx) => {
    if (!ctx.user) fail(401, 'Not signed in');
    const b = await readJson(req, 16384);
    const cur = await env.DB.prepare('SELECT name, phone, avatar, profile, profile_completed_at FROM users WHERE id=?').bind(ctx.user.id).first();
    const profile = { ...parseJSON(cur.profile, {}) };
    for (const [k, t] of Object.entries(PROFILE_FIELDS)) if (k in (b.profile || {})) profile[k] = str(b.profile[k], Number(t.split(':')[1])) || '';
    if (profile.emergency_phone) profile.emergency_phone = normPhone(profile.emergency_phone) || profile.emergency_phone;
    if (profile.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(profile.date_of_birth)) fail(400, 'Date of birth looks wrong');
    const name = 'name' in b ? str(b.name, 120) : cur.name;
    const phone = 'phone' in b ? normPhone(b.phone) || str(b.phone, 30) : cur.phone;
    let avatar = 'avatar' in b ? str(b.avatar, 300) : cur.avatar;
    if (avatar && !/^\/media\//.test(avatar)) avatar = cur.avatar; // only photos uploaded to our own storage
    if (!name) fail(400, 'Please enter your name');
    const complete = ctx.user.role === 'owner' || (avatar && phone && REQUIRED_PROFILE.every((k) => profile[k]));
    await env.DB.prepare('UPDATE users SET name=?, phone=?, avatar=?, profile=?, profile_completed_at=?, updated_at=? WHERE id=?')
      .bind(name, phone, avatar, JSON.stringify(profile), complete ? cur.profile_completed_at || now() : null, now(), ctx.user.id).run();
    if (complete && !cur.profile_completed_at && ctx.user.role !== 'owner') {
      await notify(env, { module: 'users', type: 'info', title: `${name} completed their staff profile`, body: 'Photo, contact and emergency details are now on file.', link: '/admin/#/users' });
    }
    return ok({ complete: !!complete });
  });

  // Full staff record for the admin.
  r.get('/api/admin/users/:id/profile', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'users', 'attendance');
    const u = await env.DB.prepare('SELECT id, name, email, phone, job_title, avatar, role, active, profile, profile_completed_at, last_login_at, created_at FROM users WHERE id=?').bind(id).first();
    if (!u) fail(404, 'Staff member not found');
    const [shifts, attendance, issues] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN status='arrived' AND COALESCE(late_minutes,0) <= 10 THEN 1 ELSE 0 END) on_time,
        SUM(CASE WHEN late_minutes > 10 THEN 1 ELSE 0 END) late, SUM(CASE WHEN status='missed' THEN 1 ELSE 0 END) missed FROM shifts WHERE user_id=? AND starts_at >= datetime('now','-90 days') AND starts_at <= datetime('now')`).bind(id).first(),
      env.DB.prepare(`SELECT COUNT(*) shifts, COALESCE(SUM((julianday(COALESCE(clock_out_at, last_ping_at)) - julianday(clock_in_at)) * 24), 0) hours FROM attendance WHERE user_id=? AND clock_in_at >= datetime('now','-30 days')`).bind(id).first(),
      env.DB.prepare('SELECT COUNT(*) n FROM site_issues WHERE user_id=?').bind(id).first(),
    ]);
    return json({ ...u, profile: parseJSON(u.profile, {}), stats: { shifts, attendance, issues: issues.n } });
  });

  // ───────────── Site schedules (who should be where, and when) ─────────────
  r.get('/api/admin/shifts', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'installations', 'attendance');
    const u = new URL(req.url);
    const where = ["s.status != 'cancelled'"], args = [];
    const from = u.searchParams.get('from'), to = u.searchParams.get('to');
    if (from) { where.push('s.starts_at >= ?'); args.push(lagosToUtc(from, '00:00')); }
    if (to) { where.push('s.starts_at < ?'); args.push(lagosToUtc(to, '23:59')); }
    for (const k of ['user_id', 'installation_id']) if (u.searchParams.get(k)) { where.push(`s.${k}=?`); args.push(num(u.searchParams.get(k), 0)); }
    const { results } = await env.DB.prepare(`SELECT s.*, u.name user_name, u.avatar user_avatar, u.phone user_phone, i.title site, i.address site_address
      FROM shifts s JOIN users u ON u.id=s.user_id JOIN installations i ON i.id=s.installation_id
      WHERE ${where.join(' AND ')} ORDER BY s.starts_at LIMIT 500`).bind(...args).all();
    return json({ items: results.map((s) => ({ ...s, start_local: utcToLagosHm(s.starts_at), end_local: s.ends_at ? utcToLagosHm(s.ends_at) : null })) });
  });

  r.post('/api/admin/shifts', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'installations', 'attendance');
    const b = await readJson(req, 16384);
    const inst = await env.DB.prepare('SELECT id, title FROM installations WHERE id=?').bind(num(b.installation_id, 0)).first();
    if (!inst) fail(400, 'Choose a job site');
    const userIds = (Array.isArray(b.user_ids) ? b.user_ids : [b.user_id]).map((x) => num(x, 0)).filter(Boolean).slice(0, 30);
    const dates = (Array.isArray(b.dates) ? b.dates : [b.date]).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '')).slice(0, 31);
    const start = /^\d{2}:\d{2}$/.test(b.start_time || '') ? b.start_time : null;
    const end = /^\d{2}:\d{2}$/.test(b.end_time || '') ? b.end_time : null;
    if (!userIds.length) fail(400, 'Choose at least one staff member');
    if (!dates.length || !start) fail(400, 'Choose the date and the time they should be on site');
    if (end && end <= start) fail(400, 'The finish time must be later than the start time');
    const stmts = [];
    for (const d of dates) for (const uid of userIds) {
      stmts.push(env.DB.prepare('INSERT INTO shifts (installation_id, user_id, starts_at, ends_at, note, created_by) VALUES (?,?,?,?,?,?)')
        .bind(inst.id, uid, lagosToUtc(d, start), end ? lagosToUtc(d, end) : null, str(b.note, 300), ctx.user.id));
      stmts.push(env.DB.prepare('INSERT OR IGNORE INTO installation_staff (installation_id, user_id) VALUES (?,?)').bind(inst.id, uid));
    }
    await env.DB.batch(stmts);
    const when = dates.length === 1 ? `${dates[0]} at ${start}` : `${dates.length} days from ${dates[0]}, ${start}`;
    for (const uid of userIds) await notify(env, { userId: uid, type: 'info', title: `You're scheduled at ${inst.title}`, body: `Be on site ${when}.${b.note ? ' ' + str(b.note, 120) : ''}`, link: '/admin/#/field' });
    await audit(env, req, ctx.user, 'shifts_created', 'installations', inst.id, { users: userIds.length, dates: dates.length });
    return ok({ created: dates.length * userIds.length });
  });

  r.put('/api/admin/shifts/:id', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'installations', 'attendance');
    const s = await env.DB.prepare('SELECT s.*, i.title FROM shifts s JOIN installations i ON i.id=s.installation_id WHERE s.id=?').bind(id).first();
    if (!s) fail(404, 'Schedule not found');
    const b = await readJson(req, 4096);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : null;
    const start = /^\d{2}:\d{2}$/.test(b.start_time || '') ? b.start_time : null;
    if (b.status === 'cancelled') {
      await env.DB.prepare(`UPDATE shifts SET status='cancelled' WHERE id=?`).bind(id).run();
      await notify(env, { userId: s.user_id, type: 'info', title: `Schedule cancelled: ${s.title}`, body: 'You are no longer expected on this site at that time.', link: '/admin/#/field' });
      return ok();
    }
    if (date && start) {
      if (/^\d{2}:\d{2}$/.test(b.end_time || '') && b.end_time <= start) fail(400, 'The finish time must be later than the start time');
      const end = /^\d{2}:\d{2}$/.test(b.end_time || '') ? lagosToUtc(date, b.end_time) : null;
      await env.DB.prepare(`UPDATE shifts SET starts_at=?, ends_at=?, note=COALESCE(?, note), status=CASE WHEN status IN ('late','missed') THEN 'scheduled' ELSE status END,
        reminded_at=NULL, late_notified_at=NULL, escalated_at=NULL WHERE id=?`).bind(lagosToUtc(date, start), end, str(b.note, 300), id).run();
      await notify(env, { userId: s.user_id, type: 'info', title: `New time for ${s.title}`, body: `Be on site ${date} at ${start}.`, link: '/admin/#/field' });
    }
    return ok();
  });

  // ───────────── On-site issues ─────────────
  r.post('/api/field/issues', async (req, env, _p, ctx, router) => {
    requirePerm(ctx.user, 'field', 'installations');
    await rateLimit(env, `issue:${ctx.user.id}`, 20, 600);
    const form = await req.formData();
    const message = str(form.get('message'), 3000);
    if (!message) fail(400, 'Describe the problem first');
    const instId = num(form.get('installation_id'), null);
    const inst = instId ? await env.DB.prepare('SELECT id, title FROM installations WHERE id=?').bind(instId).first() : null;
    const category = ISSUE_CATS.includes(form.get('category')) ? form.get('category') : 'other';
    const urgency = URGENCY.includes(form.get('urgency')) ? form.get('urgency') : 'normal';
    const images = [];
    for (const f of form.getAll('photos').slice(0, 8)) if (f instanceof File && f.size) images.push((await router.storeUpload(env, f, 'site-issues', ctx.user.id)).url);
    const lat = num(form.get('lat'), null), lng = num(form.get('lng'), null);
    const row = await env.DB.prepare('INSERT INTO site_issues (installation_id, user_id, category, urgency, message, images, lat, lng) VALUES (?,?,?,?,?,?,?,?) RETURNING id')
      .bind(inst?.id ?? null, ctx.user.id, category, urgency, message, JSON.stringify(images), lat, lng).first();
    const type = urgency === 'urgent' ? 'danger' : urgency === 'high' ? 'warning' : 'info';
    await notify(env, { module: 'installations', type, push: true, title: `${urgency === 'urgent' ? 'URGENT: ' : ''}Site issue from ${ctx.user.name}`,
      body: `${inst ? inst.title + ' · ' : ''}${category}: ${message.slice(0, 110)}${images.length ? ` (${images.length} photo${images.length > 1 ? 's' : ''})` : ''}`, link: `/admin/#/issues/${row.id}` });
    return ok({ id: row.id });
  });

  r.get('/api/admin/issues', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'installations', 'attendance');
    const st = new URL(req.url).searchParams.get('status');
    const { results } = await env.DB.prepare(`SELECT s.*, u.name user_name, u.avatar user_avatar, u.phone user_phone, i.title site, h.name handler_name
      FROM site_issues s JOIN users u ON u.id=s.user_id LEFT JOIN installations i ON i.id=s.installation_id LEFT JOIN users h ON h.id=s.handled_by
      ${st ? 'WHERE s.status=?' : ''} ORDER BY CASE s.status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,
      CASE s.urgency WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, s.id DESC LIMIT 200`).bind(...(st ? [st] : [])).all();
    return json({ items: results.map((x) => ({ ...x, images: parseJSON(x.images, []) })) });
  });
  r.put('/api/admin/issues/:id', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'installations', 'attendance');
    const b = await readJson(req, 8192);
    const st = ['open', 'acknowledged', 'resolved'].includes(b.status) ? b.status : 'acknowledged';
    const issue = await env.DB.prepare('SELECT * FROM site_issues WHERE id=?').bind(id).first();
    if (!issue) fail(404, 'Issue not found');
    await env.DB.prepare('UPDATE site_issues SET status=?, response=COALESCE(?, response), handled_by=?, handled_at=? WHERE id=?').bind(st, str(b.response, 1000), ctx.user.id, now(), id).run();
    await notify(env, { userId: issue.user_id, type: st === 'resolved' ? 'success' : 'info', title: st === 'resolved' ? 'Your site issue was resolved' : 'Your site issue was seen', body: str(b.response, 140) || issue.message.slice(0, 100), link: '/admin/#/field' });
    return ok();
  });

  // ───────────── Website policies ─────────────
  r.get('/api/admin/policies', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'website', 'settings');
    const { results } = await env.DB.prepare('SELECT p.key, p.title, p.body, p.updated_at, u.name updated_by_name FROM policies p LEFT JOIN users u ON u.id=p.updated_by').all();
    const custom = Object.fromEntries(results.map((x) => [x.key, x]));
    return json({ items: Object.entries(POLICIES).map(([key, title]) => ({ key, title, path: `/${key}`, custom: custom[key] || null })) });
  });
  r.put('/api/admin/policies/:key', async (req, env, { key }, ctx) => {
    requirePerm(ctx.user, 'website', 'settings');
    if (!POLICIES[key]) fail(404, 'Unknown policy');
    const b = await readJson(req, 300 * 1024);
    const body = sanitizeHtml(String(b.body || '').slice(0, 200000));
    if (body.replace(/<[^>]*>/g, '').trim().length < 20) fail(400, 'The policy is too short');
    await env.DB.prepare(`INSERT INTO policies (key, title, body, updated_by, updated_at) VALUES (?,?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET title=excluded.title, body=excluded.body, updated_by=excluded.updated_by, updated_at=excluded.updated_at`)
      .bind(key, str(b.title, 120) || POLICIES[key], body, ctx.user.id, now()).run();
    await audit(env, req, ctx.user, 'policy_updated', 'policies', key);
    return ok();
  });
  r.delete('/api/admin/policies/:key', async (req, env, { key }, ctx) => {
    requirePerm(ctx.user, 'website', 'settings');
    await env.DB.prepare('DELETE FROM policies WHERE key=?').bind(key).run();
    await audit(env, req, ctx.user, 'policy_reset', 'policies', key);
    return ok();
  });

  // Public policy pages: the built page, with the CRM's version swapped in when there is one.
  for (const key of Object.keys(POLICIES)) {
    r.get(`/${key}`, async (req, env) => {
      const asset = await env.ASSETS.fetch(new Request(new URL(`/${key}`, req.url), req));
      const p = await env.DB.prepare('SELECT title, body, updated_at FROM policies WHERE key=?').bind(key).first().catch(() => null);
      if (!p || !asset.ok) return asset;
      const updated = new Date(p.updated_at.replace(' ', 'T') + 'Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
      const res = new HTMLRewriter()
        .on('[data-policy-body]', { element(el) { el.setInnerContent(p.body, { html: true }); } })
        .on('[data-policy-updated]', { element(el) { el.setInnerContent(`Last updated: ${updated}`); } })
        .on('[data-policy-title]', { element(el) { el.setInnerContent(p.title); } })
        .transform(asset);
      const out = new Response(res.body, res);
      out.headers.set('cache-control', 'public, max-age=60');
      return out;
    });
  }
}

// Called every 10 minutes by the cron: reminders before a shift, "running late" nudges, and escalation.
export async function shiftReminders(env) {
  const due = (sql) => env.DB.prepare(sql).all().then((r) => r.results);
  // 1) Starting within the hour.
  for (const s of await due(`SELECT s.id, s.user_id, s.starts_at, i.title FROM shifts s JOIN installations i ON i.id=s.installation_id
      WHERE s.status='scheduled' AND s.reminded_at IS NULL AND s.starts_at > datetime('now') AND s.starts_at <= datetime('now','+60 minutes')`)) {
    await notify(env, { userId: s.user_id, type: 'info', push: true, title: `Starting soon: ${s.title}`, body: `You're expected on site at ${utcToLagosHm(s.starts_at)}. Clock in when you arrive.`, link: '/admin/#/field' });
    await env.DB.prepare('UPDATE shifts SET reminded_at=? WHERE id=?').bind(now(), s.id).run();
  }
  // 2) 10+ minutes late and not clocked in → remind the staff member.
  for (const s of await due(`SELECT s.id, s.user_id, s.starts_at, i.title FROM shifts s JOIN installations i ON i.id=s.installation_id
      WHERE s.status='scheduled' AND s.late_notified_at IS NULL AND s.starts_at <= datetime('now','-10 minutes')`)) {
    await notify(env, { userId: s.user_id, type: 'warning', push: true, title: `You're running late for ${s.title}`, body: `You were due on site at ${utcToLagosHm(s.starts_at)}. Clock in as soon as you arrive, or call your supervisor if you can't make it.`, link: '/admin/#/field' });
    await env.DB.prepare(`UPDATE shifts SET status='late', late_notified_at=? WHERE id=?`).bind(now(), s.id).run();
  }
  // 3) 30+ minutes late → tell the admin.
  for (const s of await due(`SELECT s.id, s.starts_at, u.name, i.title FROM shifts s JOIN users u ON u.id=s.user_id JOIN installations i ON i.id=s.installation_id
      WHERE s.status='late' AND s.escalated_at IS NULL AND s.starts_at <= datetime('now','-30 minutes')`)) {
    await notify(env, { module: 'attendance', type: 'warning', push: true, title: `${s.name} hasn't arrived at ${s.title}`, body: `Due at ${utcToLagosHm(s.starts_at)} — not clocked in yet.`, link: '/admin/#/attendance' });
    await env.DB.prepare('UPDATE shifts SET escalated_at=? WHERE id=?').bind(now(), s.id).run();
  }
  // 4) Never showed up.
  await env.DB.prepare(`UPDATE shifts SET status='missed' WHERE status IN ('scheduled','late') AND starts_at <= datetime('now','-4 hours')`).run();
}

// When someone clocks in, close off their schedule for that site today.
export async function markArrival(env, userId, installationId, attendanceId) {
  const s = await env.DB.prepare(`SELECT id, starts_at FROM shifts WHERE user_id=? AND installation_id=? AND status IN ('scheduled','late','missed')
    AND starts_at BETWEEN datetime('now','-12 hours') AND datetime('now','+4 hours') ORDER BY ABS(julianday(starts_at) - julianday('now')) LIMIT 1`).bind(userId, installationId).first();
  if (!s) return null;
  const late = Math.max(0, Math.round((Date.now() - new Date(s.starts_at.replace(' ', 'T') + 'Z').getTime()) / 60000));
  await env.DB.prepare(`UPDATE shifts SET status='arrived', arrived_at=?, late_minutes=?, attendance_id=? WHERE id=?`).bind(now(), late, attendanceId, s.id).run();
  return { late };
}

