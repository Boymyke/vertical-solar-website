// Admin / CRM API.
import { json, ok, fail, readJson } from '../lib/http.js';
import {
  requirePerm, can, audit, notify, hashPassword, generatePassword, MODULE_KEYS, effectivePermissions, rateLimit,
} from '../lib/auth.js';
import { crud, inflate } from '../lib/crud.js';
import { getSettings, DEFAULT_SETTINGS } from '../lib/site.js';
import {
  str, num, bool, now, parseJSON, randomToken, slugify, nextNumber, isoDate, addMonths, sqlDate, isEmail, normPhone,
  stripHtml, clamp, escapeHtml, naira,
} from '../lib/util.js';

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

function quoteTotals(items, discount = 0, vatRate = 7.5) {
  const clean = (Array.isArray(items) ? items : []).slice(0, 200).map((i) => ({
    product_id: num(i.product_id, null),
    description: str(i.description, 300) || 'Item',
    detail: str(i.detail, 300),
    qty: Math.max(0, num(i.qty, 1)),
    unit: str(i.unit, 20) || 'pcs',
    unit_price: Math.max(0, num(i.unit_price, 0)),
  })).map((i) => ({ ...i, total: Math.round(i.qty * i.unit_price * 100) / 100 }));
  const subtotal = clean.reduce((s, i) => s + i.total, 0);
  const disc = Math.min(Math.max(0, num(discount, 0)), subtotal);
  const vat = Math.round((subtotal - disc) * (num(vatRate, 7.5) / 100) * 100) / 100;
  return { items: clean, subtotal, discount: disc, vat, total: subtotal - disc + vat };
}

export function registerAdmin(r) {
  // ───────────────────────── Dashboard ─────────────────────────
  r.get('/api/admin/dashboard', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'dashboard');
    const q = (sql, ...a) => env.DB.prepare(sql).bind(...a).first();
    const all = (sql, ...a) => env.DB.prepare(sql).bind(...a).all().then((x) => x.results);
    const [leads30, leadsPrev, won30, revenue30, revenuePrev, openQuotes, quoteValue, activeJobs, onSite, openTickets,
      lowStock, dueFollowups, visitors30, visitorsPrev, chats30] = await Promise.all([
      q(`SELECT COUNT(*) c FROM customers WHERE created_at >= datetime('now','-30 days')`),
      q(`SELECT COUNT(*) c FROM customers WHERE created_at >= datetime('now','-60 days') AND created_at < datetime('now','-30 days')`),
      q(`SELECT COUNT(*) c FROM quotes WHERE status='accepted' AND responded_at >= datetime('now','-30 days')`),
      q(`SELECT COALESCE(SUM(total),0) v FROM (SELECT total FROM quotes WHERE status='accepted' AND responded_at >= datetime('now','-30 days') UNION ALL SELECT total FROM orders WHERE status IN ('paid','processing','delivered') AND created_at >= datetime('now','-30 days'))`),
      q(`SELECT COALESCE(SUM(total),0) v FROM (SELECT total FROM quotes WHERE status='accepted' AND responded_at >= datetime('now','-60 days') AND responded_at < datetime('now','-30 days') UNION ALL SELECT total FROM orders WHERE status IN ('paid','processing','delivered') AND created_at >= datetime('now','-60 days') AND created_at < datetime('now','-30 days'))`),
      q(`SELECT COUNT(*) c FROM quotes WHERE status IN ('sent','viewed')`),
      q(`SELECT COALESCE(SUM(total),0) v FROM quotes WHERE status IN ('sent','viewed')`),
      q(`SELECT COUNT(*) c FROM installations WHERE status IN ('scheduled','in_progress')`),
      q(`SELECT COUNT(*) c FROM attendance WHERE status='open'`),
      q(`SELECT COUNT(*) c FROM tickets WHERE status IN ('open','pending')`),
      q(`SELECT COUNT(*) c FROM products WHERE active=1 AND reorder_level > 0 AND stock <= reorder_level`),
      q(`SELECT COUNT(*) c FROM followups WHERE status='pending' AND due_at <= datetime('now','+1 day')`),
      q(`SELECT COUNT(DISTINCT visitor_id) c FROM pageviews WHERE created_at >= datetime('now','-30 days')`),
      q(`SELECT COUNT(DISTINCT visitor_id) c FROM pageviews WHERE created_at >= datetime('now','-60 days') AND created_at < datetime('now','-30 days')`),
      q(`SELECT COUNT(*) c FROM chats WHERE created_at >= datetime('now','-30 days')`),
    ]);
    const [leadSeries, visitSeries, funnel, pipeline, recentLeads, upcoming, jobs, sources, ticketList, lowList, issues, todayShifts] = await Promise.all([
      all(`SELECT date(created_at) d, COUNT(*) n FROM customers WHERE created_at >= datetime('now','-30 days') GROUP BY d ORDER BY d`),
      all(`SELECT date(created_at) d, COUNT(DISTINCT visitor_id) n FROM pageviews WHERE created_at >= datetime('now','-30 days') GROUP BY d ORDER BY d`),
      all(`SELECT stage, COUNT(*) n, COALESCE(SUM(value_estimate),0) v FROM customers WHERE status!='inactive' GROUP BY stage`),
      all(`SELECT status, COUNT(*) n, COALESCE(SUM(total),0) v FROM quotes GROUP BY status`),
      all(`SELECT id, name, phone, source, stage, interest, created_at FROM customers ORDER BY id DESC LIMIT 6`),
      all(`SELECT f.id, f.title, f.type, f.due_at, c.name customer, c.id customer_id, c.phone FROM followups f LEFT JOIN customers c ON c.id=f.customer_id WHERE f.status='pending' ORDER BY f.due_at LIMIT 8`),
      all(`SELECT i.id, i.title, i.status, i.progress, i.start_date, c.name customer FROM installations i LEFT JOIN customers c ON c.id=i.customer_id WHERE i.status IN ('scheduled','in_progress') ORDER BY i.start_date LIMIT 6`),
      all(`SELECT COALESCE(source,'manual') source, COUNT(*) n FROM customers WHERE created_at >= datetime('now','-90 days') GROUP BY source ORDER BY n DESC LIMIT 8`),
      all(`SELECT id, number, subject, priority, status, created_at FROM tickets WHERE status IN ('open','pending') ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, id DESC LIMIT 3`),
      all(`SELECT id, name, stock, reorder_level, unit FROM products WHERE active=1 AND reorder_level > 0 AND stock <= reorder_level ORDER BY stock - reorder_level, name LIMIT 3`),
      all(`SELECT s.id, s.urgency, s.category, s.message, s.created_at, u.name user_name, i.title site FROM site_issues s JOIN users u ON u.id=s.user_id LEFT JOIN installations i ON i.id=s.installation_id WHERE s.status != 'resolved' ORDER BY CASE s.urgency WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, s.id DESC LIMIT 4`),
      all(`SELECT s.id, s.status, s.starts_at, s.late_minutes, u.name user_name, i.title site FROM shifts s JOIN users u ON u.id=s.user_id JOIN installations i ON i.id=s.installation_id
        WHERE s.status != 'cancelled' AND s.starts_at >= datetime('now','start of day','-1 hours') AND s.starts_at < datetime('now','start of day','+23 hours') ORDER BY s.starts_at LIMIT 8`),
    ]);
    const pct = (a, b) => (b ? Math.round(((a - b) / b) * 1000) / 10 : a ? 100 : 0);
    return json({
      kpis: {
        leads: { value: leads30.c, change: pct(leads30.c, leadsPrev.c) },
        revenue: { value: revenue30.v, change: pct(revenue30.v, revenuePrev.v) },
        won: { value: won30.c },
        open_quotes: { value: openQuotes.c, amount: quoteValue.v },
        active_jobs: { value: activeJobs.c, on_site: onSite.c },
        tickets: { value: openTickets.c },
        low_stock: { value: lowStock.c },
        due_followups: { value: dueFollowups.c },
        visitors: { value: visitors30.c, change: pct(visitors30.c, visitorsPrev.c) },
        chats: { value: chats30.c },
      },
      leadSeries, visitSeries, funnel, pipeline, recentLeads, upcoming, jobs, sources, ticketList, lowList, issues, todayShifts,
      open_issues: (await q(`SELECT COUNT(*) c FROM site_issues WHERE status != 'resolved'`)).c,
    });
  });

  r.get('/api/admin/dashboard-counts', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, ...MODULE_KEYS);
    const out = {};
    if (can(ctx.user, 'followups') || can(ctx.user, 'crm')) out.followups = (await env.DB.prepare(`SELECT COUNT(*) c FROM followups WHERE status='pending' AND due_at <= datetime('now','+1 day')`).first()).c;
    if (can(ctx.user, 'support')) out.tickets = (await env.DB.prepare(`SELECT COUNT(*) c FROM tickets WHERE status IN ('open','pending')`).first()).c;
    if (can(ctx.user, 'installations') || can(ctx.user, 'attendance')) out.issues = (await env.DB.prepare(`SELECT COUNT(*) c FROM site_issues WHERE status='open'`).first()).c;
    return json(out);
  });

  // ───────────────────────── Notifications ─────────────────────────
  r.get('/api/admin/notifications', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, ...MODULE_KEYS);
    const perms = effectivePermissions(ctx.user);
    const ph = perms.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT n.*, CASE WHEN nr.user_id IS NULL THEN 0 ELSE 1 END AS read FROM notifications n
       LEFT JOIN notification_reads nr ON nr.notification_id=n.id AND nr.user_id=?
       WHERE (n.user_id = ? OR (n.user_id IS NULL AND (n.module IS NULL OR n.module IN (${ph}))))
       AND n.id NOT IN (SELECT notification_id FROM notification_dismissals WHERE user_id=?)
       AND n.created_at >= datetime('now','-30 days') ORDER BY n.id DESC LIMIT 60`
    ).bind(ctx.user.id, ctx.user.id, ...perms, ctx.user.id).all();
    return json({ items: results, unread: results.filter((n) => !n.read).length });
  });
  r.post('/api/admin/notifications/read', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, ...MODULE_KEYS);
    const b = await readJson(req, 16384);
    const ids = (Array.isArray(b.ids) ? b.ids : []).map((x) => num(x, 0)).filter(Boolean).slice(0, 100);
    if (ids.length) await env.DB.batch(ids.map((id) => env.DB.prepare('INSERT OR IGNORE INTO notification_reads (notification_id, user_id) VALUES (?,?)').bind(id, ctx.user.id)));
    return ok();
  });

  // ───────────────────────── Users & access ─────────────────────────
  r.get('/api/admin/users', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'users', 'installations', 'attendance');
    const { results } = await env.DB.prepare(`SELECT id,name,email,phone,job_title,role,permissions,active,avatar,last_login_at,created_at,profile_completed_at,profile FROM users
      ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, active DESC, name`).all();
    const full = can(ctx.user, 'users');
    return json({ items: results.map((u) => {
      const p = parseJSON(u.profile, {});
      const base = { ...u, profile: undefined, branch: p.branch || '', profile_complete: u.role === 'owner' || !!u.profile_completed_at };
      return full ? { ...base, permissions: parseJSON(u.permissions, []) } : pick(base, ['id', 'name', 'job_title', 'role', 'active', 'avatar', 'phone', 'branch', 'profile_complete']);
    }) });
  });

  // There is one administrator (the owner). Managing logins and company settings stays with them.
  const OWNER_ONLY = ['users', 'settings'];
  const sanitizePerms = (actor, perms) => {
    const list = (Array.isArray(perms) ? perms : []).filter((p) => MODULE_KEYS.includes(p) && !OWNER_ONLY.includes(p));
    return actor.role === 'owner' ? list : list.filter((p) => can(actor, p));
  };

  r.post('/api/admin/users', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'users');
    const b = await readJson(req, 16384);
    const name = str(b.name, 120), email = str(b.email, 160)?.toLowerCase();
    if (!name || !isEmail(email)) fail(400, 'Name and a valid work email are required');
    const role = 'staff';
    const perms = sanitizePerms(ctx.user, b.permissions?.length ? b.permissions : ['field']);
    if (await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first()) fail(409, 'A user with that email already exists');
    const temp = generatePassword();
    const { hash, salt } = await hashPassword(temp);
    const u = await env.DB.prepare(`INSERT INTO users (name,email,phone,job_title,role,permissions,password_hash,password_salt,must_change_password,created_by)
      VALUES (?,?,?,?,?,?,?,?,1,?) RETURNING id`).bind(name, email, normPhone(b.phone), str(b.job_title, 80), role, JSON.stringify(perms), hash, salt, ctx.user.id).first();
    await audit(env, req, ctx.user, 'user_created', 'users', u.id, { role, perms });
    return ok({ id: u.id, temporary_password: temp });
  });

  r.put('/api/admin/users/:id', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'users');
    const target = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();
    if (!target) fail(404, 'User not found');
    if (target.role === 'owner' && ctx.user.role !== 'owner') fail(403, 'Only the owner can change the owner account');
    const b = await readJson(req, 16384);
    if (target.id === ctx.user.id && 'active' in b && !bool(b.active)) fail(400, 'You cannot deactivate yourself');
    const data = {};
    if ('name' in b) data.name = str(b.name, 120);
    if ('email' in b) { if (!isEmail(b.email)) fail(400, 'Invalid email'); data.email = str(b.email, 160).toLowerCase(); }
    if ('phone' in b) data.phone = normPhone(b.phone);
    if ('job_title' in b) data.job_title = str(b.job_title, 80);
    if ('permissions' in b && target.role !== 'owner') data.permissions = JSON.stringify(sanitizePerms(ctx.user, b.permissions));
    if ('active' in b && target.role !== 'owner') data.active = bool(b.active);
    data.updated_at = now();
    const keys = Object.keys(data);
    await env.DB.prepare(`UPDATE users SET ${keys.map((k) => k + '=?').join(',')} WHERE id=?`).bind(...keys.map((k) => data[k]), id).run();
    if (data.active === 0) await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
    if ('permissions' in data || 'role' in data) await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
    await audit(env, req, ctx.user, data.active === 0 ? 'user_revoked' : 'user_updated', 'users', id, { fields: keys });
    return ok();
  });

  r.post('/api/admin/users/:id/reset-password', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'users');
    const target = await env.DB.prepare('SELECT id, role FROM users WHERE id=?').bind(id).first();
    if (!target) fail(404, 'User not found');
    if (target.role === 'owner' && ctx.user.role !== 'owner') fail(403, 'Only the owner can reset the owner password');
    const temp = generatePassword();
    const { hash, salt } = await hashPassword(temp);
    await env.DB.prepare('UPDATE users SET password_hash=?, password_salt=?, must_change_password=1, failed_logins=0, locked_until=NULL WHERE id=?').bind(hash, salt, id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
    await audit(env, req, ctx.user, 'password_reset', 'users', id);
    return ok({ temporary_password: temp });
  });

  r.delete('/api/admin/users/:id', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'users');
    const target = await env.DB.prepare('SELECT id, role FROM users WHERE id=?').bind(id).first();
    if (!target) fail(404, 'User not found');
    if (target.role === 'owner') fail(403, 'The owner account cannot be deleted');
    if (target.id === ctx.user.id) fail(400, 'You cannot delete yourself');
    await env.DB.prepare('DELETE FROM users WHERE id=?').bind(id).run();
    await audit(env, req, ctx.user, 'user_deleted', 'users', id);
    return ok();
  });

  r.get('/api/admin/audit', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'users');
    const { results } = await env.DB.prepare(`SELECT a.*, u.name user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 300`).all();
    return json({ items: results });
  });

  // ───────────────────────── Settings ─────────────────────────
  const SETTINGS_PERMS = {
    company: 'settings', integrations: 'settings', shop: 'shop', hero: 'website', seo: 'website', stats: 'website',
    features: 'website', ai: 'website', videos: 'website', financing: 'website',
  };
  r.get('/api/admin/settings', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'settings', 'website', 'shop');
    const s = await getSettings(env);
    return json({ settings: s, secrets: {
      resend: !!env.RESEND_API_KEY, paystack: !!env.PAYSTACK_SECRET_KEY, turnstile: !!env.TURNSTILE_SECRET, spitch: !!env.SPITCH_API_KEY,
    } });
  });
  r.put('/api/admin/settings/:key', async (req, env, { key }, ctx) => {
    const perm = SETTINGS_PERMS[key];
    if (!perm) fail(400, 'Unknown settings group');
    requirePerm(ctx.user, perm, 'settings');
    const b = await readJson(req, 128 * 1024);
    const value = b.value;
    if (value == null) fail(400, 'Missing value');
    const def = DEFAULT_SETTINGS[key];
    if (Array.isArray(def) !== Array.isArray(value)) fail(400, 'Invalid value');
    await env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
      .bind(key, JSON.stringify(value), now()).run();
    await audit(env, req, ctx.user, 'settings_updated', 'settings', key);
    return ok();
  });

  // ───────────────────────── Media uploads (R2) ─────────────────────────
  const ALLOWED_TYPES = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'application/pdf': 'pdf',
  };
  async function storeUpload(env, file, folder, userId) {
    if (!(file instanceof File)) fail(400, 'No file');
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) fail(415, 'Only JPG, PNG, WebP, GIF, AVIF images, MP4/WebM video and PDF files are allowed');
    const max = file.type.startsWith('video/') ? 95 * 1024 * 1024 : 15 * 1024 * 1024;
    if (file.size > max) fail(413, `File too large (max ${Math.round(max / 1048576)}MB)`);
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const sig = [...head].map((b) => b.toString(16).padStart(2, '0')).join('');
    const okSig = (ext === 'jpg' && sig.startsWith('ffd8')) || (ext === 'png' && sig.startsWith('89504e47')) ||
      (ext === 'gif' && sig.startsWith('474946')) || (ext === 'pdf' && sig.startsWith('25504446')) ||
      (ext === 'webp' && sig.startsWith('52494646')) || ['avif', 'mp4', 'webm'].includes(ext);
    if (!okSig) fail(415, 'File content does not match its type');
    const key = `${slugify(folder || 'general')}/${isoDate().slice(0, 7)}/${randomToken(10)}.${ext}`;
    await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type, contentDisposition: ext === 'pdf' ? 'inline' : undefined } });
    await env.DB.prepare('INSERT INTO media (key, filename, content_type, size, folder, uploaded_by) VALUES (?,?,?,?,?,?)')
      .bind(key, str(file.name, 200), file.type, file.size, slugify(folder || 'general'), userId).run();
    return { url: `/media/${key}`, key, name: file.name, type: file.type, size: file.size };
  }

  r.post('/api/admin/upload', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, ...MODULE_KEYS);
    await rateLimit(env, `upload:${ctx.user.id}`, 120, 600);
    const form = await req.formData();
    const folder = str(form.get('folder'), 40) || 'general';
    const files = form.getAll('file');
    if (!files.length) fail(400, 'No file uploaded');
    const out = [];
    for (const f of files.slice(0, 12)) out.push(await storeUpload(env, f, folder, ctx.user.id));
    return ok({ files: out, url: out[0]?.url });
  });

  r.get('/api/admin/media', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'website', 'blog', 'inventory', 'settings');
    const folder = new URL(req.url).searchParams.get('folder');
    const { results } = await env.DB.prepare(`SELECT * FROM media ${folder ? 'WHERE folder=?' : ''} ORDER BY id DESC LIMIT 300`).bind(...(folder ? [folder] : [])).all();
    return json({ items: results.map((m) => ({ ...m, url: `/media/${m.key}` })) });
  });
  r.delete('/api/admin/media/:id', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'website', 'settings');
    const m = await env.DB.prepare('SELECT * FROM media WHERE id=?').bind(id).first();
    if (!m) fail(404, 'Not found');
    await env.MEDIA.delete(m.key);
    await env.DB.prepare('DELETE FROM media WHERE id=?').bind(id).run();
    return ok();
  });

  // expose for field routes
  r.storeUpload = storeUpload;

  // ───────────────────────── CRM: customers & leads ─────────────────────────
  crud(r, {
    name: 'customers', table: 'customers', perm: 'crm', readPerm: ['crm', 'quotes', 'installations', 'support', 'maintenance', 'email'],
    from: 'customers LEFT JOIN users ON users.id = customers.assigned_to',
    select: 'customers.*, users.name AS assigned_name', getExtra: 'users.name AS assigned_name',
    order: 'customers.updated_at DESC',
    fields: {
      name: 'str:120', company: 'str:120', email: 'str:160', phone: 'str:30', whatsapp: 'str:30', address: 'str:300', city: 'str:80',
      state: 'str:80', lat: 'num', lng: 'num', segment: 'str:20', status: 'str:20', stage: 'str:20', source: 'str:40', interest: 'str:160',
      value_estimate: 'num', assigned_to: 'int', tags: 'json', notes: 'text', next_followup_at: 'date',
    },
    json: ['tags'], required: ['name'],
    search: ['customers.name', 'customers.phone', 'customers.email', 'customers.company', 'customers.city'],
    filters: ['customers.stage', 'customers.status', 'customers.segment', 'customers.source', 'customers.assigned_to'],
    beforeSave: async (d, { existing, ctx, env }) => {
      if (d.phone) d.phone = normPhone(d.phone);
      if (d.whatsapp) d.whatsapp = normPhone(d.whatsapp);
      if (d.email && !isEmail(d.email)) fail(400, 'Invalid email');
      if (d.stage === 'won' && (!existing || existing.status === 'lead')) d.status = 'customer';
      if (existing && d.stage && d.stage !== existing.stage) {
        await env.DB.prepare(`INSERT INTO activities (customer_id, user_id, type, body) VALUES (?,?, 'system', ?)`)
          .bind(existing.id, ctx.user.id, `Stage changed: ${existing.stage} → ${d.stage}`).run();
      }
      if (!existing && !d.source) d.source = 'manual';
      return d;
    },
  });

  r.get('/api/admin/customers/:id/timeline', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'crm', 'support', 'maintenance', 'quotes');
    const all = (sql) => env.DB.prepare(sql).bind(id).all().then((x) => x.results);
    const [activities, followups, quotes, installations, tickets, orders, warranties, chats, emails] = await Promise.all([
      all('SELECT a.*, u.name user_name FROM activities a LEFT JOIN users u ON u.id=a.user_id WHERE a.customer_id=? ORDER BY a.id DESC LIMIT 100'),
      all('SELECT f.*, u.name assigned_name FROM followups f LEFT JOIN users u ON u.id=f.assigned_to WHERE f.customer_id=? ORDER BY f.due_at DESC'),
      all('SELECT id, number, title, status, total, created_at, token FROM quotes WHERE customer_id=? ORDER BY id DESC'),
      all('SELECT id, title, status, progress, start_date, completed_at, next_maintenance_at FROM installations WHERE customer_id=? ORDER BY id DESC'),
      all('SELECT id, number, subject, status, priority, created_at FROM tickets WHERE customer_id=? ORDER BY id DESC'),
      all('SELECT id, number, total, status, created_at FROM orders WHERE customer_id=? ORDER BY id DESC'),
      all('SELECT * FROM warranties WHERE customer_id=? ORDER BY end_date'),
      all('SELECT id, messages_count, created_at FROM chats WHERE customer_id=? ORDER BY created_at DESC'),
      all('SELECT id, subject, status, created_at FROM emails WHERE customer_id=? ORDER BY id DESC'),
    ]);
    return json({ activities, followups, quotes, installations, tickets, orders, warranties, chats, emails });
  });

  r.post('/api/admin/customers/:id/activities', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'crm', 'support', 'maintenance');
    const b = await readJson(req, 16384);
    const type = ['note', 'call', 'whatsapp', 'email', 'visit', 'sms', 'meeting'].includes(b.type) ? b.type : 'note';
    const body = str(b.body, 4000);
    if (!body) fail(400, 'Write something first');
    await env.DB.prepare('INSERT INTO activities (customer_id, user_id, type, body) VALUES (?,?,?,?)').bind(id, ctx.user.id, type, body).run();
    if (type !== 'note') await env.DB.prepare('UPDATE customers SET last_contacted_at=?, updated_at=? WHERE id=?').bind(now(), now(), id).run();
    if (b.stage) await env.DB.prepare('UPDATE customers SET stage=? WHERE id=?').bind(str(b.stage, 20), id).run();
    return ok();
  });

  r.get('/api/admin/customers-export', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'crm');
    const { results } = await env.DB.prepare('SELECT id,name,company,phone,whatsapp,email,city,state,segment,status,stage,source,interest,value_estimate,created_at,last_contacted_at FROM customers ORDER BY id').all();
    const cols = Object.keys(results[0] || { id: 1 });
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.join(','), ...results.map((r2) => cols.map((c) => esc(r2[c])).join(','))].join('\n');
    await audit(env, req, ctx.user, 'export', 'customers', null, { rows: results.length });
    return new Response(csv, { headers: { 'content-type': 'text/csv', 'content-disposition': `attachment; filename="customers-${isoDate()}.csv"` } });
  });

  // ───────────────────────── Follow-ups ─────────────────────────
  crud(r, {
    name: 'followups', table: 'followups', perm: ['followups', 'crm'],
    from: 'followups LEFT JOIN customers c ON c.id = followups.customer_id LEFT JOIN users u ON u.id = followups.assigned_to',
    select: 'followups.*, c.name AS customer_name, c.phone AS customer_phone, c.whatsapp AS customer_whatsapp, c.email AS customer_email, u.name AS assigned_name',
    order: "CASE followups.status WHEN 'pending' THEN 0 ELSE 1 END, followups.due_at ASC",
    fields: { customer_id: 'int', installation_id: 'int', assigned_to: 'int', type: 'str:20', title: 'str:200', notes: 'text', due_at: 'date', status: 'str:20', outcome: 'text' },
    required: ['title', 'due_at'], hasUpdatedAt: false,
    search: ['followups.title', 'c.name', 'c.phone'],
    filters: ['followups.status', 'followups.type', 'followups.assigned_to', 'followups.customer_id'],
    listHook: (u, where, args, ctx) => {
      const due = u.searchParams.get('due');
      if (due === 'overdue') where.push("followups.status='pending' AND followups.due_at < datetime('now')");
      if (due === 'today') where.push("followups.status='pending' AND date(followups.due_at) = date('now')");
      if (due === 'week') where.push("followups.status='pending' AND followups.due_at <= datetime('now','+7 days')");
      if (u.searchParams.get('mine') === '1') { where.push('followups.assigned_to = ?'); args.push(ctx.user.id); }
    },
    beforeSave: (d, { ctx, existing }) => {
      if (!existing) d.created_by = ctx.user.id;
      if (d.status === 'done' && (!existing || existing.status !== 'done')) { d.completed_at = now(); d.completed_by = ctx.user.id; }
      return d;
    },
    afterSave: async (row, { env, ctx, existing }) => {
      if (row.status === 'done' && existing?.status !== 'done' && row.customer_id) {
        await env.DB.prepare(`INSERT INTO activities (customer_id, user_id, type, body) VALUES (?,?,?,?)`)
          .bind(row.customer_id, ctx.user.id, row.type === 'whatsapp' ? 'whatsapp' : row.type === 'call' ? 'call' : 'note', `Follow-up done: ${row.title}${row.outcome ? ' — ' + row.outcome : ''}`).run();
        await env.DB.prepare('UPDATE customers SET last_contacted_at=? WHERE id=?').bind(now(), row.customer_id).run();
      }
    },
  });

  // ───────────────────────── Quotes ─────────────────────────
  crud(r, {
    name: 'quotes', table: 'quotes', perm: 'quotes',
    from: 'quotes LEFT JOIN customers c ON c.id = quotes.customer_id',
    getExtra: 'c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email, c.whatsapp AS customer_whatsapp',
    select: 'quotes.id, quotes.number, quotes.token, quotes.title, quotes.status, quotes.total, quotes.created_at, quotes.sent_at, quotes.viewed_at, quotes.view_count, quotes.valid_until, quotes.customer_id, c.name AS customer_name, c.phone AS customer_phone',
    fields: { customer_id: 'int', title: 'str:200', status: 'str:20', items: 'json', system: 'json', discount: 'num', vat_rate: 'num', notes: 'text', terms: 'text', valid_until: 'date' },
    json: ['items', 'system'], required: ['title'],
    search: ['quotes.number', 'quotes.title', 'c.name'], filters: ['quotes.status', 'quotes.customer_id'],
    beforeSave: async (d, { env, ctx, body, existing }) => {
      const items = body.items ?? parseJSON(existing?.items, []);
      const t = quoteTotals(items, body.discount ?? existing?.discount, body.vat_rate ?? existing?.vat_rate ?? 7.5);
      Object.assign(d, { items: JSON.stringify(t.items), subtotal: t.subtotal, discount: t.discount, vat: t.vat, total: t.total });
      if (!existing) {
        d.number = await nextNumber(env, 'VS-Q', 'quotes');
        d.token = randomToken(18);
        d.created_by = ctx.user.id;
        if (!d.valid_until) d.valid_until = sqlDate(Date.now() + 14 * 864e5);
        if (!d.terms) d.terms = '70% advance payment to commence; balance on completion. Prices valid for 14 days due to exchange-rate changes. Includes delivery, installation and commissioning within the stated city. Warranty per manufacturer terms (panels up to 25 years performance, inverters and lithium batteries typically 2–5 years).';
      }
      return d;
    },
    afterSave: async (row, { env, ctx, created }) => {
      if (created && row.customer_id) {
        await env.DB.prepare(`INSERT INTO activities (customer_id, user_id, type, body) VALUES (?,?, 'system', ?)`).bind(row.customer_id, ctx.user.id, `Quote ${row.number} created (${naira(row.total)})`).run();
      }
    },
  });

  r.post('/api/admin/quotes/:id/send', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'quotes');
    const q = await env.DB.prepare('SELECT * FROM quotes WHERE id=?').bind(id).first();
    if (!q) fail(404, 'Quote not found');
    await env.DB.prepare(`UPDATE quotes SET status=CASE WHEN status IN ('draft','expired') THEN 'sent' ELSE status END, sent_at=COALESCE(sent_at, ?), updated_at=? WHERE id=?`).bind(now(), now(), id).run();
    if (q.customer_id) {
      await env.DB.prepare(`UPDATE customers SET stage=CASE WHEN stage IN ('new','contacted','site_survey') THEN 'quoted' ELSE stage END, last_contacted_at=?, updated_at=? WHERE id=?`).bind(now(), now(), q.customer_id).run();
      await env.DB.prepare(`INSERT INTO activities (customer_id, user_id, type, body) VALUES (?,?, 'system', ?)`).bind(q.customer_id, ctx.user.id, `Quote ${q.number} sent`).run();
      await env.DB.prepare(`INSERT INTO followups (customer_id, assigned_to, type, title, due_at, auto, created_by) VALUES (?,?, 'quote', ?, datetime('now','+3 days'), 1, ?)`)
        .bind(q.customer_id, ctx.user.id, `Chase quote ${q.number}`, ctx.user.id).run();
    }
    return ok({ link: `/q/${q.token}` });
  });

  r.post('/api/admin/quotes/:id/duplicate', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'quotes');
    const q = await env.DB.prepare('SELECT * FROM quotes WHERE id=?').bind(id).first();
    if (!q) fail(404, 'Quote not found');
    const number = await nextNumber(env, 'VS-Q', 'quotes');
    const row = await env.DB.prepare(`INSERT INTO quotes (number, token, customer_id, title, items, system, subtotal, discount, vat_rate, vat, total, notes, terms, valid_until, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(number, randomToken(18), q.customer_id, q.title + ' (copy)', q.items, q.system, q.subtotal, q.discount, q.vat_rate, q.vat, q.total, q.notes, q.terms, sqlDate(Date.now() + 14 * 864e5), ctx.user.id).first();
    return ok({ id: row.id });
  });

  r.post('/api/admin/quotes/:id/convert', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'quotes', 'installations');
    const q = await env.DB.prepare('SELECT q.*, c.address, c.lat, c.lng, c.city FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id WHERE q.id=?').bind(id).first();
    if (!q) fail(404, 'Quote not found');
    const row = await env.DB.prepare(`INSERT INTO installations (customer_id, quote_id, title, address, lat, lng, system, status, created_by) VALUES (?,?,?,?,?,?,?, 'scheduled', ?) RETURNING id`)
      .bind(q.customer_id, q.id, q.title, [q.address, q.city].filter(Boolean).join(', ') || null, q.lat, q.lng, q.system, ctx.user.id).first();
    return ok({ id: row.id });
  });

  // ───────────────────────── Inventory ─────────────────────────
  crud(r, {
    name: 'products', table: 'products', perm: ['inventory', 'shop'], readPerm: ['inventory', 'shop', 'quotes'],
    fields: {
      sku: 'str:60', name: 'str:200', slug: 'str:120', category: 'str:40', brand: 'str:80', description: 'html', specs: 'json',
      price: 'num', compare_price: 'num', cost: 'num', reorder_level: 'int', unit: 'str:20', location: 'str:80', images: 'json',
      warranty_months: 'int', in_shop: 'bool', featured: 'bool', active: 'bool',
    },
    json: ['specs', 'images'], required: ['name'],
    search: ['name', 'sku', 'brand'], filters: ['category', 'in_shop', 'active'],
    listHook: (u, where) => { if (u.searchParams.get('low') === '1') where.push('reorder_level > 0 AND stock <= reorder_level'); },
    beforeSave: async (d, { env, existing, body }) => {
      if (d.name && (!existing || !existing.slug) && !d.slug) d.slug = slugify(d.name);
      if (d.slug) {
        d.slug = slugify(d.slug);
        const clash = await env.DB.prepare('SELECT id FROM products WHERE slug=? AND id != ?').bind(d.slug, existing?.id || 0).first();
        if (clash) d.slug = `${d.slug}-${randomToken(3).toLowerCase()}`;
      }
      if (d.sku === '') d.sku = null;
      if (!existing && body.stock != null) d.stock = Math.max(0, Math.round(num(body.stock, 0)));
      return d;
    },
    afterSave: async (row, { env, ctx, created, body }) => {
      if (created && row.stock > 0) await env.DB.prepare(`INSERT INTO stock_moves (product_id, qty, reason, note, user_id) VALUES (?,?, 'adjustment', 'Opening stock', ?)`).bind(row.id, row.stock, ctx.user.id).run();
    },
  });

  r.post('/api/admin/products/:id/stock', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'inventory');
    const b = await readJson(req, 8192);
    const reasons = ['purchase', 'sale', 'installation', 'adjustment', 'return', 'damaged'];
    const reason = reasons.includes(b.reason) ? b.reason : 'adjustment';
    let qty = Math.round(num(b.qty, 0));
    if (!qty) fail(400, 'Enter a quantity');
    if (['sale', 'installation', 'damaged'].includes(reason)) qty = -Math.abs(qty);
    if (['purchase', 'return'].includes(reason)) qty = Math.abs(qty);
    const p = await env.DB.prepare('UPDATE products SET stock = stock + ?, updated_at=? WHERE id=? RETURNING id, name, stock, reorder_level').bind(qty, now(), id).first();
    if (!p) fail(404, 'Product not found');
    await env.DB.prepare('INSERT INTO stock_moves (product_id, qty, reason, ref, note, user_id) VALUES (?,?,?,?,?,?)').bind(id, qty, reason, str(b.ref, 80), str(b.note, 300), ctx.user.id).run();
    if (p.reorder_level > 0 && p.stock <= p.reorder_level) await notify(env, { module: 'inventory', type: 'warning', title: `Low stock: ${p.name}`, body: `${p.stock} left (reorder level ${p.reorder_level})`, link: '/admin/#/inventory' });
    return ok({ stock: p.stock });
  });

  r.get('/api/admin/stock-moves', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'inventory');
    const pid = new URL(req.url).searchParams.get('product_id');
    const { results } = await env.DB.prepare(`SELECT m.*, p.name product_name, u.name user_name FROM stock_moves m JOIN products p ON p.id=m.product_id LEFT JOIN users u ON u.id=m.user_id
      ${pid ? 'WHERE m.product_id=?' : ''} ORDER BY m.id DESC LIMIT 200`).bind(...(pid ? [pid] : [])).all();
    return json({ items: results });
  });

  r.get('/api/admin/inventory-summary', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'inventory');
    const s = await env.DB.prepare(`SELECT COUNT(*) items, COALESCE(SUM(stock),0) units, COALESCE(SUM(stock*cost),0) cost_value, COALESCE(SUM(stock*price),0) retail_value,
      SUM(CASE WHEN reorder_level > 0 AND stock <= reorder_level THEN 1 ELSE 0 END) low, SUM(CASE WHEN stock <= 0 THEN 1 ELSE 0 END) out_of_stock FROM products WHERE active=1`).first();
    const cats = (await env.DB.prepare('SELECT category, COUNT(*) n, SUM(stock) units FROM products WHERE active=1 GROUP BY category').all()).results;
    return json({ ...s, categories: cats });
  });

  crud(r, { name: 'suppliers', table: 'suppliers', perm: 'inventory', fields: { name: 'str:120', contact: 'str:120', phone: 'str:30', email: 'str:160', notes: 'text' }, required: ['name'], search: ['name', 'contact'], hasUpdatedAt: false, order: 'name' });

  // ───────────────────────── Shop orders ─────────────────────────
  crud(r, {
    name: 'orders', table: 'orders', perm: 'shop',
    fields: { status: 'str:20', payment_method: 'str:20', payment_ref: 'str:120', admin_notes: 'text', delivery: 'num', address: 'str:300', city: 'str:80', phone: 'str:30', name: 'str:120', email: 'str:160' },
    json: ['items'], search: ['number', 'name', 'phone', 'email'], filters: ['status'],
    beforeSave: async (d, { existing, env, ctx }) => {
      if (!existing) fail(400, 'Orders are created from the website checkout');
      if (d.delivery != null) d.total = existing.subtotal + d.delivery;
      if (d.status === 'paid' && existing.status !== 'paid') d.paid_at = now();
      // Deduct stock once, when an order is confirmed paid/processing.
      if (['paid', 'processing', 'delivered'].includes(d.status) && !['paid', 'processing', 'delivered'].includes(existing.status)) {
        for (const it of parseJSON(existing.items, [])) {
          await env.DB.prepare('UPDATE products SET stock = stock - ? WHERE id=?').bind(it.qty, it.product_id).run();
          await env.DB.prepare(`INSERT INTO stock_moves (product_id, qty, reason, ref, user_id) VALUES (?,?, 'sale', ?, ?)`).bind(it.product_id, -it.qty, existing.number, ctx.user.id).run();
        }
      }
      return d;
    },
  });

  // ───────────────────────── Installations & job sites ─────────────────────────
  crud(r, {
    name: 'installations', table: 'installations', perm: 'installations', readPerm: ['installations', 'attendance', 'maintenance'],
    from: 'installations LEFT JOIN customers c ON c.id = installations.customer_id',
    select: `installations.*, c.name AS customer_name, c.phone AS customer_phone,
      (SELECT COUNT(*) FROM installation_staff s WHERE s.installation_id = installations.id) AS staff_count,
      (SELECT COUNT(*) FROM attendance a WHERE a.installation_id = installations.id AND a.status='open') AS on_site,
      (SELECT COUNT(*) FROM work_reports w WHERE w.installation_id = installations.id) AS reports`,
    getExtra: 'c.name AS customer_name, c.phone AS customer_phone',
    order: "CASE installations.status WHEN 'in_progress' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END, installations.start_date",
    fields: {
      customer_id: 'int', quote_id: 'int', title: 'str:200', address: 'str:300', lat: 'num', lng: 'num', radius_m: 'int', status: 'str:20',
      progress: 'int', start_date: 'date', end_date: 'date', system: 'json', notes: 'text', warranty_months: 'int', maintenance_interval_months: 'int', next_maintenance_at: 'date',
    },
    json: ['system'], required: ['title'],
    search: ['installations.title', 'installations.address', 'c.name'], filters: ['installations.status', 'installations.customer_id'],
    beforeSave: (d, { existing, ctx }) => {
      if (!existing) d.created_by = ctx.user.id;
      if (d.radius_m != null) d.radius_m = clamp(d.radius_m, 30, 5000);
      if (d.status === 'completed' && existing?.status !== 'completed') {
        d.completed_at = now();
        d.progress = 100;
        const months = d.maintenance_interval_months ?? existing?.maintenance_interval_months ?? 6;
        if (!d.next_maintenance_at) d.next_maintenance_at = sqlDate(addMonths(new Date(), months));
      }
      return d;
    },
    afterSave: async (row, { env, ctx, existing, created }) => {
      if (row.status === 'completed' && existing?.status !== 'completed' && row.customer_id) {
        await env.DB.prepare(`UPDATE customers SET status='customer', stage='won', updated_at=? WHERE id=?`).bind(now(), row.customer_id).run();
        await env.DB.prepare(`INSERT INTO activities (customer_id, user_id, type, body) VALUES (?,?, 'system', ?)`).bind(row.customer_id, ctx.user.id, `Installation completed: ${row.title}`).run();
        // Automatic after-sales follow-ups: 1-week check-in + maintenance reminder + maintenance visit.
        await env.DB.prepare(`INSERT INTO followups (customer_id, installation_id, type, title, due_at, auto, created_by) VALUES (?,?, 'checkup', ?, datetime('now','+7 days'), 1, ?)`)
          .bind(row.customer_id, row.id, `1-week check-in after installation: ${row.title}`, ctx.user.id).run();
        await env.DB.prepare(`INSERT INTO maintenance_visits (installation_id, customer_id, scheduled_at, type) VALUES (?,?,?, 'routine')`).bind(row.id, row.customer_id, row.next_maintenance_at).run();
        const w = row.warranty_months || 12;
        await env.DB.prepare(`INSERT INTO warranties (customer_id, installation_id, item, provider, start_date, end_date, notes) VALUES (?,?,?,?,?,?,?)`)
          .bind(row.customer_id, row.id, `Installation workmanship — ${row.title}`, 'Vertical Solar', isoDate(), isoDate(addMonths(new Date(), w)), 'Auto-created on completion').run();
      }
      if (created && row.customer_id) {
        await env.DB.prepare(`INSERT INTO activities (customer_id, user_id, type, body) VALUES (?,?, 'system', ?)`).bind(row.customer_id, ctx.user.id, `Installation scheduled: ${row.title}`).run();
      }
    },
  });

  r.get('/api/admin/installations/:id/detail', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'installations', 'attendance', 'maintenance');
    const inst = await env.DB.prepare('SELECT i.*, c.name customer_name, c.phone customer_phone FROM installations i LEFT JOIN customers c ON c.id=i.customer_id WHERE i.id=?').bind(id).first();
    if (!inst) fail(404, 'Not found');
    const all = (sql) => env.DB.prepare(sql).bind(id).all().then((x) => x.results);
    const [staff, attendance, reports, visits, warranties] = await Promise.all([
      all('SELECT u.id, u.name, u.job_title, u.phone, u.avatar FROM installation_staff s JOIN users u ON u.id=s.user_id WHERE s.installation_id=?'),
      all('SELECT a.*, u.name user_name FROM attendance a JOIN users u ON u.id=a.user_id WHERE a.installation_id=? ORDER BY a.id DESC LIMIT 100'),
      all('SELECT w.*, u.name user_name, r.name reviewer_name FROM work_reports w JOIN users u ON u.id=w.user_id LEFT JOIN users r ON r.id=w.reviewed_by WHERE w.installation_id=? ORDER BY w.id DESC'),
      all('SELECT m.*, u.name technician_name FROM maintenance_visits m LEFT JOIN users u ON u.id=m.technician_id WHERE m.installation_id=? ORDER BY m.scheduled_at DESC'),
      all('SELECT * FROM warranties WHERE installation_id=?'),
    ]);
    return json({ installation: inflate(inst, ['system']), staff, attendance, reports: reports.map((x) => inflate(x, ['images'])), visits, warranties });
  });

  r.put('/api/admin/installations/:id/staff', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'installations');
    const b = await readJson(req, 8192);
    const ids = (Array.isArray(b.user_ids) ? b.user_ids : []).map((x) => num(x, 0)).filter(Boolean).slice(0, 50);
    const before = (await env.DB.prepare('SELECT user_id FROM installation_staff WHERE installation_id=?').bind(id).all()).results.map((x) => x.user_id);
    const inst = await env.DB.prepare('SELECT title FROM installations WHERE id=?').bind(id).first();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM installation_staff WHERE installation_id=?').bind(id),
      ...ids.map((u) => env.DB.prepare('INSERT INTO installation_staff (installation_id, user_id) VALUES (?,?)').bind(id, u)),
    ]);
    for (const u of ids.filter((x) => !before.includes(x))) {
      await notify(env, { userId: u, type: 'info', title: 'New job assigned', body: inst?.title, link: '/admin/#/field' });
    }
    return ok();
  });

  r.put('/api/admin/work-reports/:id/review', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'installations');
    const b = await readJson(req, 8192);
    await env.DB.prepare('UPDATE work_reports SET reviewed_by=?, reviewed_at=?, review_note=? WHERE id=?').bind(ctx.user.id, now(), str(b.note, 1000), id).run();
    const w = await env.DB.prepare('SELECT user_id FROM work_reports WHERE id=?').bind(id).first();
    if (w) await notify(env, { userId: w.user_id, type: 'success', title: 'Your work report was reviewed', body: str(b.note, 140), link: '/admin/#/field' });
    return ok();
  });

  r.get('/api/admin/work-reports', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'installations');
    const { results } = await env.DB.prepare(`SELECT w.*, u.name user_name, i.title installation_title FROM work_reports w JOIN users u ON u.id=w.user_id LEFT JOIN installations i ON i.id=w.installation_id ORDER BY w.id DESC LIMIT 100`).all();
    return json({ items: results.map((x) => inflate(x, ['images'])) });
  });

  // ───────────────────────── Attendance (admin view) ─────────────────────────
  r.get('/api/admin/attendance', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'attendance', 'installations');
    const u = new URL(req.url);
    const where = [];
    const args = [];
    if (u.searchParams.get('status')) { where.push('a.status=?'); args.push(u.searchParams.get('status')); }
    if (u.searchParams.get('user_id')) { where.push('a.user_id=?'); args.push(u.searchParams.get('user_id')); }
    if (u.searchParams.get('from')) { where.push('a.clock_in_at >= ?'); args.push(u.searchParams.get('from')); }
    if (u.searchParams.get('to')) { where.push('a.clock_in_at <= ?'); args.push(u.searchParams.get('to') + ' 23:59:59'); }
    const { results } = await env.DB.prepare(`SELECT a.*, u.name user_name, u.phone user_phone, i.title site, i.lat site_lat, i.lng site_lng, i.radius_m
      FROM attendance a JOIN users u ON u.id=a.user_id LEFT JOIN installations i ON i.id=a.installation_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC LIMIT 300`).bind(...args).all();
    return json({ items: results });
  });
  r.get('/api/admin/attendance/:id/pings', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'attendance', 'installations');
    const { results } = await env.DB.prepare('SELECT lat, lng, accuracy, distance, inside, created_at FROM location_pings WHERE attendance_id=? ORDER BY id').bind(id).all();
    return json({ items: results });
  });
  r.post('/api/admin/attendance/:id/close', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'attendance');
    await env.DB.prepare(`UPDATE attendance SET status='closed', clock_out_at=?, note=COALESCE(note,'') || ' Closed by admin.' WHERE id=? AND status='open'`).bind(now(), id).run();
    await audit(env, req, ctx.user, 'attendance_closed', 'attendance', id);
    return ok();
  });

  // ───────────────────────── Maintenance & warranties ─────────────────────────
  crud(r, {
    name: 'maintenance', table: 'maintenance_visits', perm: 'maintenance',
    from: 'maintenance_visits LEFT JOIN customers c ON c.id = maintenance_visits.customer_id LEFT JOIN installations i ON i.id = maintenance_visits.installation_id LEFT JOIN users u ON u.id = maintenance_visits.technician_id',
    select: 'maintenance_visits.*, c.name AS customer_name, c.phone AS customer_phone, i.title AS installation_title, u.name AS technician_name',
    order: "CASE maintenance_visits.status WHEN 'scheduled' THEN 0 ELSE 1 END, maintenance_visits.scheduled_at",
    fields: { installation_id: 'int', customer_id: 'int', scheduled_at: 'date', done_at: 'date', technician_id: 'int', type: 'str:20', status: 'str:20', findings: 'text', cost: 'num' },
    required: ['scheduled_at'], hasUpdatedAt: false, search: ['c.name', 'i.title'], filters: ['maintenance_visits.status'],
    beforeSave: async (d, { existing, env }) => {
      if (d.installation_id && !d.customer_id) {
        const i = await env.DB.prepare('SELECT customer_id FROM installations WHERE id=?').bind(d.installation_id).first();
        d.customer_id = i?.customer_id ?? null;
      }
      if (d.status === 'done' && existing?.status !== 'done' && !d.done_at) d.done_at = now();
      return d;
    },
    afterSave: async (row, { env, existing }) => {
      if (row.status === 'done' && existing?.status !== 'done' && row.installation_id) {
        const i = await env.DB.prepare('SELECT maintenance_interval_months m FROM installations WHERE id=?').bind(row.installation_id).first();
        const next = sqlDate(addMonths(new Date(), i?.m || 6));
        await env.DB.prepare('UPDATE installations SET next_maintenance_at=? WHERE id=?').bind(next, row.installation_id).run();
        await env.DB.prepare(`INSERT INTO maintenance_visits (installation_id, customer_id, scheduled_at, type) VALUES (?,?,?, 'routine')`).bind(row.installation_id, row.customer_id, next).run();
        if (row.customer_id) await env.DB.prepare(`INSERT INTO activities (customer_id, type, body) VALUES (?, 'visit', ?)`).bind(row.customer_id, `Maintenance visit done${row.findings ? ': ' + row.findings : ''}. Next visit ${next.slice(0, 10)}.`).run();
      }
    },
  });

  crud(r, {
    name: 'warranties', table: 'warranties', perm: 'maintenance',
    from: 'warranties LEFT JOIN customers c ON c.id = warranties.customer_id',
    select: "warranties.*, c.name AS customer_name, c.phone AS customer_phone, CAST(julianday(warranties.end_date) - julianday('now') AS INTEGER) AS days_left",
    order: 'warranties.end_date',
    fields: { customer_id: 'int', installation_id: 'int', product_id: 'int', item: 'str:200', serial: 'str:120', provider: 'str:120', start_date: 'date', end_date: 'date', notes: 'text' },
    required: ['item', 'start_date', 'end_date'], hasUpdatedAt: false, search: ['warranties.item', 'warranties.serial', 'c.name'],
    listHook: (u, where) => { if (u.searchParams.get('expiring') === '1') where.push("warranties.end_date <= date('now','+60 days') AND warranties.end_date >= date('now')"); },
  });

  // ───────────────────────── Support tickets ─────────────────────────
  crud(r, {
    name: 'tickets', table: 'tickets', perm: 'support',
    from: 'tickets LEFT JOIN users u ON u.id = tickets.assigned_to',
    select: 'tickets.*, u.name AS assigned_name, (SELECT COUNT(*) FROM ticket_replies tr WHERE tr.ticket_id = tickets.id) AS replies',
    order: "CASE tickets.status WHEN 'open' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, CASE tickets.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, tickets.id DESC",
    fields: { customer_id: 'int', name: 'str:120', email: 'str:160', phone: 'str:30', subject: 'str:200', message: 'text', category: 'str:20', priority: 'str:20', status: 'str:20', assigned_to: 'int' },
    required: ['subject'], search: ['tickets.number', 'tickets.subject', 'tickets.name', 'tickets.phone'], filters: ['tickets.status', 'tickets.priority', 'tickets.category'],
    beforeSave: async (d, { env, existing }) => {
      if (!existing) { d.number = await nextNumber(env, 'TKT', 'tickets'); d.source = 'admin'; if (!d.message) d.message = d.subject; }
      return d;
    },
  });
  r.get('/api/admin/tickets/:id/replies', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'support');
    const { results } = await env.DB.prepare('SELECT r.*, u.name user_name FROM ticket_replies r LEFT JOIN users u ON u.id=r.user_id WHERE ticket_id=? ORDER BY id').bind(id).all();
    return json({ items: results });
  });
  r.post('/api/admin/tickets/:id/replies', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'support');
    const b = await readJson(req, 16384);
    const body = str(b.body, 5000);
    if (!body) fail(400, 'Reply is empty');
    await env.DB.prepare('INSERT INTO ticket_replies (ticket_id, user_id, body, internal) VALUES (?,?,?,?)').bind(id, ctx.user.id, body, bool(b.internal)).run();
    if (b.status) await env.DB.prepare('UPDATE tickets SET status=?, updated_at=? WHERE id=?').bind(str(b.status, 20), now(), id).run();
    return ok();
  });

  // ───────────────────────── Website CMS ─────────────────────────
  const slugUnique = (table) => async (d, { env, existing }) => {
    if (d.title && !d.slug && !existing) d.slug = slugify(d.title);
    if (d.slug) {
      d.slug = slugify(d.slug);
      const clash = await env.DB.prepare(`SELECT id FROM ${table} WHERE slug=? AND id != ?`).bind(d.slug, existing?.id || 0).first();
      if (clash) d.slug = `${d.slug}-${randomToken(3).toLowerCase()}`;
    }
    return d;
  };

  crud(r, {
    name: 'posts', table: 'posts', perm: 'blog',
    select: 'id, slug, title, excerpt, cover, category, status, published_at, views, author_name, updated_at',
    order: 'COALESCE(published_at, created_at) DESC',
    fields: { slug: 'str:120', title: 'str:200', excerpt: 'str:400', body: 'html', cover: 'str:300', category: 'str:40', tags: 'json', status: 'str:20', published_at: 'date', seo_title: 'str:200', seo_description: 'str:320', author_name: 'str:120' },
    json: ['tags'], required: ['title'], search: ['title', 'excerpt'], filters: ['status', 'category'],
    beforeSave: async (d, o) => {
      await slugUnique('posts')(d, o);
      if (!o.existing) { d.author_id = o.ctx.user.id; if (!d.author_name) d.author_name = o.ctx.user.name; }
      if (d.status === 'published' && !d.published_at && !o.existing?.published_at) d.published_at = now();
      if (d.body != null) d.read_minutes = Math.max(1, Math.round(stripHtml(d.body).split(' ').length / 220));
      if (d.body != null && !d.excerpt && !o.existing?.excerpt) d.excerpt = stripHtml(d.body).slice(0, 220);
      return d;
    },
  });

  crud(r, {
    name: 'projects', table: 'projects', perm: 'website', order: 'featured DESC, sort, id DESC', hasUpdatedAt: false,
    fields: { slug: 'str:120', title: 'str:200', client: 'str:160', location: 'str:160', category: 'str:40', summary: 'str:600', body: 'html', pv_kwp: 'num', inverter_kw: 'num', battery_kwh: 'num', images: 'json', video_url: 'str:300', featured: 'bool', published: 'bool', sort: 'int', completed_at: 'date' },
    json: ['images'], required: ['title'], search: ['title', 'client', 'location'], filters: ['category', 'published'],
    beforeSave: slugUnique('projects'),
  });

  crud(r, {
    name: 'testimonials', table: 'testimonials', perm: 'website', order: 'featured DESC, sort, id DESC', hasUpdatedAt: false,
    fields: { name: 'str:120', role: 'str:120', location: 'str:120', photo: 'str:300', quote: 'text:2000', rating: 'int', video_url: 'str:300', evidence: 'json', system: 'str:200', savings: 'str:200', project_id: 'int', customer_id: 'int', verified: 'bool', consent: 'bool', featured: 'bool', published: 'bool', sort: 'int' },
    json: ['evidence'], required: ['name', 'quote'], search: ['name', 'quote', 'location'], filters: ['published'],
    beforeSave: (d, { existing }) => {
      const published = d.published ?? existing?.published;
      const consent = d.consent ?? existing?.consent;
      if (published && !consent) fail(400, 'Record the customer’s consent before publishing their testimonial');
      if (d.rating != null) d.rating = clamp(d.rating, 1, 5);
      return d;
    },
  });

  crud(r, { name: 'certificates', table: 'certificates', perm: 'website', order: 'sort, id', hasUpdatedAt: false,
    fields: { title: 'str:200', issuer: 'str:160', image: 'str:300', link: 'str:300', issued_at: 'date', published: 'bool', sort: 'int' }, required: ['title'] });
  crud(r, { name: 'socials', table: 'socials', perm: 'website', order: 'sort, id', hasUpdatedAt: false,
    fields: { platform: 'str:60', icon: 'str:60', url: 'str:300', active: 'bool', sort: 'int' }, required: ['platform', 'icon', 'url'],
    beforeSave: (d) => { if (d.icon && !/^ri-[a-z0-9-]+$/.test(d.icon)) fail(400, 'Choose an icon from the icon picker'); if (d.url && !/^(https?:|mailto:|tel:)/.test(d.url)) fail(400, 'Link must start with https://'); return d; } });
  crud(r, { name: 'popups', table: 'popups', perm: 'website', hasUpdatedAt: false,
    fields: { title: 'str:200', body: 'text:2000', image: 'str:300', cta_text: 'str:60', cta_url: 'str:300', style: 'str:20', pages: 'str:500', trigger: 'str:20', delay_seconds: 'int', frequency: 'str:20', starts_at: 'date', ends_at: 'date', active: 'bool' }, required: ['title'],
    beforeSave: (d) => {
      if (d.cta_url && !/^(\/|#|https:\/\/|http:\/\/|tel:|mailto:)/i.test(d.cta_url)) fail(400, 'The button link must be a page of the website or start with https://');
      if (d.style && !['modal', 'corner', 'banner'].includes(d.style)) d.style = 'modal';
      return d;
    } });
  crud(r, { name: 'faqs', table: 'faqs', perm: 'website', order: 'sort, id', hasUpdatedAt: false,
    fields: { question: 'str:300', answer: 'text:4000', category: 'str:40', published: 'bool', sort: 'int' }, required: ['question', 'answer'], search: ['question'] });
  crud(r, { name: 'packages', table: 'packages', perm: 'website', readPerm: ['website', 'quotes'], order: 'sort, id', hasUpdatedAt: false,
    fields: { name: 'str:80', tier: 'str:40', tagline: 'str:200', inverter_kva: 'num', pv_wp: 'num', battery_kwh: 'num', loads: 'str:400', price_lead_acid: 'num', price_lithium: 'num', featured: 'bool', published: 'bool', sort: 'int' }, required: ['name'] });
  crud(r, { name: 'branches', table: 'branches', perm: ['website', 'settings'], order: 'is_hq DESC, sort, id', hasUpdatedAt: false,
    fields: { name: 'str:120', state: 'str:80', address: 'str:300', phones: 'json', email: 'str:160', hours: 'str:200', lat: 'num', lng: 'num', is_hq: 'bool', sort: 'int' }, json: ['phones'], required: ['name'] });
  crud(r, { name: 'subscribers', table: 'subscribers', perm: ['email', 'website'], hasUpdatedAt: false, fields: { email: 'str:160', source: 'str:60' }, search: ['email'] });

  // ───────────────────────── AI chat inbox ─────────────────────────
  r.get('/api/admin/chats', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'chats');
    const u = new URL(req.url);
    const q = str(u.searchParams.get('q'), 80);
    const { results } = await env.DB.prepare(`SELECT ch.*, (SELECT content FROM chat_messages m WHERE m.chat_id=ch.id AND m.role='user' ORDER BY m.id LIMIT 1) AS first_message
      FROM chats ch ${q ? "WHERE ch.id IN (SELECT chat_id FROM chat_messages WHERE content LIKE ?) OR ch.contact_name LIKE ?" : ''} ORDER BY ch.updated_at DESC LIMIT 200`)
      .bind(...(q ? [`%${q}%`, `%${q}%`] : [])).all();
    return json({ items: results });
  });
  r.get('/api/admin/chats/:id', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'chats');
    const chat = await env.DB.prepare('SELECT * FROM chats WHERE id=?').bind(id).first();
    if (!chat) fail(404, 'Not found');
    const { results } = await env.DB.prepare('SELECT m.*, u.name agent_name FROM chat_messages m LEFT JOIN users u ON u.id=m.user_id WHERE chat_id=? ORDER BY m.id').bind(id).all();
    return json({ chat, messages: results });
  });
  r.post('/api/admin/chats/:id/reply', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'chats');
    const b = await readJson(req, 8192);
    const content = str(b.content, 2000);
    if (!content) fail(400, 'Message is empty');
    await env.DB.prepare(`INSERT INTO chat_messages (chat_id, role, content, user_id) VALUES (?, 'agent', ?, ?)`).bind(id, content, ctx.user.id).run();
    await env.DB.prepare(`UPDATE chats SET status='human', updated_at=?, messages_count=messages_count+1 WHERE id=?`).bind(now(), id).run();
    return ok();
  });
  r.post('/api/admin/chats/:id/status', async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, 'chats');
    const b = await readJson(req, 1024);
    const st = ['open', 'human', 'closed'].includes(b.status) ? b.status : 'open';
    await env.DB.prepare('UPDATE chats SET status=? WHERE id=?').bind(st, id).run();
    return ok();
  });

  // ───────────────────────── Email ─────────────────────────
  r.get('/api/admin/email/status', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'email', 'quotes', 'crm');
    const s = await getSettings(env);
    return json({ configured: !!(env.RESEND_API_KEY && s.integrations.email_from), from: s.integrations.email_from, from_name: s.integrations.email_from_name });
  });
  r.get('/api/admin/emails', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'email');
    const { results } = await env.DB.prepare('SELECT e.*, u.name sender FROM emails e LEFT JOIN users u ON u.id=e.sent_by ORDER BY e.id DESC LIMIT 200').all();
    return json({ items: results });
  });
  r.post('/api/admin/email/send', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'email', 'quotes', 'crm');
    await rateLimit(env, `mail:${ctx.user.id}`, 60, 3600);
    const b = await readJson(req, 128 * 1024);
    const recipients = (Array.isArray(b.to) ? b.to : String(b.to || '').split(/[,;\s]+/)).map((e) => e.trim()).filter(isEmail).slice(0, 50);
    const subject = str(b.subject, 200), body = str(b.body, 50000);
    if (!recipients.length || !subject || !body) fail(400, 'Recipient, subject and message are required');
    const s = await getSettings(env);
    if (!env.RESEND_API_KEY || !s.integrations.email_from) fail(412, 'Email sending is not configured yet. Use the "Open in Gmail / Outlook" buttons instead, or ask the owner to add a Resend API key in settings.');
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1b2414;max-width:620px">
      ${escapeHtml(body).replace(/\n/g, '<br>')}
      <hr style="border:none;border-top:1px solid #e3ead8;margin:24px 0"><p style="color:#5b6b52;font-size:13px">${escapeHtml(s.company.name)} · ${escapeHtml(s.company.phones.join(' · '))} · ${escapeHtml(env.SITE_URL || '')}</p></div>`;
    const results = [];
    for (const to of recipients) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: `${s.integrations.email_from_name || s.company.name} <${s.integrations.email_from}>`, to: [to], subject, html, text: body, reply_to: s.company.email }),
      });
      const data = await res.json().catch(() => ({}));
      const status = res.ok ? 'sent' : 'failed';
      const cust = await env.DB.prepare('SELECT id FROM customers WHERE email=? COLLATE NOCASE').bind(to).first();
      await env.DB.prepare('INSERT INTO emails (to_email, subject, body, customer_id, status, provider_id, error, sent_by) VALUES (?,?,?,?,?,?,?,?)')
        .bind(to, subject, body, cust?.id ?? num(b.customer_id, null), status, data.id || null, res.ok ? null : JSON.stringify(data).slice(0, 500), ctx.user.id).run();
      if (cust && res.ok) await env.DB.prepare(`INSERT INTO activities (customer_id, user_id, type, body) VALUES (?,?, 'email', ?)`).bind(cust.id, ctx.user.id, `Email sent: ${subject}`).run();
      results.push({ to, status });
    }
    return ok({ results });
  });
}
