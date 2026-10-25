// Field staff app: geofenced clock in/out, live location pings, work reports with photos.
import { json, ok, fail, readJson } from '../lib/http.js';
import { requirePerm, can, notify, rateLimit } from '../lib/auth.js';
import { str, num, now, haversine, clamp, parseJSON } from '../lib/util.js';
import { markArrival, utcToLagosHm } from './staff.js';

const GPS_SLACK_MAX = 100; // metres of GPS inaccuracy we tolerate on top of the site radius

function readCoords(b) {
  const lat = num(b.lat, null), lng = num(b.lng, null);
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) fail(400, 'Location is required. Please allow location access and try again.');
  return { lat, lng, accuracy: clamp(num(b.accuracy, 50), 0, 5000) };
}

async function assignedSite(env, user, installationId) {
  const site = await env.DB.prepare('SELECT * FROM installations WHERE id=?').bind(installationId).first();
  if (!site) fail(404, 'Job site not found');
  if (!can(user, 'installations')) {
    const a = await env.DB.prepare('SELECT 1 FROM installation_staff WHERE installation_id=? AND user_id=?').bind(installationId, user.id).first();
    if (!a) fail(403, 'You are not assigned to this job site');
  }
  return site;
}

export function registerField(r) {
  r.get('/api/field/me', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'field');
    const uid = ctx.user.id;
    const [jobs, open, history, reports, shifts, issues] = await Promise.all([
      env.DB.prepare(`SELECT i.id, i.title, i.address, i.lat, i.lng, i.radius_m, i.status, i.progress, i.start_date, i.end_date, i.notes, c.name customer_name, c.phone customer_phone
        FROM installation_staff s JOIN installations i ON i.id=s.installation_id LEFT JOIN customers c ON c.id=i.customer_id
        WHERE s.user_id=? AND i.status IN ('scheduled','in_progress','on_hold') ORDER BY i.start_date`).bind(uid).all(),
      env.DB.prepare(`SELECT a.*, i.title site, i.lat site_lat, i.lng site_lng, i.radius_m FROM attendance a LEFT JOIN installations i ON i.id=a.installation_id WHERE a.user_id=? AND a.status='open' ORDER BY a.id DESC LIMIT 1`).bind(uid).first(),
      env.DB.prepare(`SELECT a.id, a.clock_in_at, a.clock_out_at, a.status, a.offsite_minutes, i.title site FROM attendance a LEFT JOIN installations i ON i.id=a.installation_id WHERE a.user_id=? ORDER BY a.id DESC LIMIT 20`).bind(uid).all(),
      env.DB.prepare(`SELECT w.id, w.message, w.images, w.progress, w.created_at, w.review_note, w.reviewed_at, i.title site FROM work_reports w LEFT JOIN installations i ON i.id=w.installation_id WHERE w.user_id=? ORDER BY w.id DESC LIMIT 20`).bind(uid).all(),
      env.DB.prepare(`SELECT s.id, s.installation_id, s.starts_at, s.ends_at, s.status, s.note, s.late_minutes, i.title site, i.address FROM shifts s JOIN installations i ON i.id=s.installation_id
        WHERE s.user_id=? AND s.status != 'cancelled' AND s.starts_at >= datetime('now','-12 hours') AND s.starts_at <= datetime('now','+14 days') ORDER BY s.starts_at LIMIT 20`).bind(uid).all(),
      env.DB.prepare(`SELECT s.id, s.category, s.urgency, s.message, s.status, s.response, s.created_at, i.title site FROM site_issues s LEFT JOIN installations i ON i.id=s.installation_id WHERE s.user_id=? ORDER BY s.id DESC LIMIT 10`).bind(uid).all(),
    ]);
    return json({ jobs: jobs.results, open, history: history.results, reports: reports.results.map((x) => ({ ...x, images: parseJSON(x.images, []) })),
      shifts: shifts.results.map((x) => ({ ...x, start_local: utcToLagosHm(x.starts_at), end_local: x.ends_at ? utcToLagosHm(x.ends_at) : null })), issues: issues.results });
  });

  r.post('/api/field/clock-in', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'field');
    await rateLimit(env, `clk:${ctx.user.id}`, 20, 600);
    const b = await readJson(req, 4096);
    const { lat, lng, accuracy } = readCoords(b);
    const open = await env.DB.prepare(`SELECT id FROM attendance WHERE user_id=? AND status='open'`).bind(ctx.user.id).first();
    if (open) fail(409, 'You are already clocked in. Clock out first.');
    const site = await assignedSite(env, ctx.user, num(b.installation_id, 0));
    if (site.lat == null || site.lng == null) fail(400, 'This job site has no map location yet. Ask an admin to set it.');
    const distance = Math.round(haversine(lat, lng, site.lat, site.lng));
    const allowed = site.radius_m + Math.min(accuracy, GPS_SLACK_MAX);
    if (distance > allowed) {
      await notify(env, { module: 'attendance', type: 'warning', title: `Clock-in blocked: ${ctx.user.name}`, body: `${distance}m from ${site.title} (allowed ${site.radius_m}m)`, link: '/admin/#/attendance' });
      fail(403, `You are about ${distance >= 1000 ? (distance / 1000).toFixed(1) + 'km' : distance + 'm'} from ${site.title}. You must be on site (within ${site.radius_m}m) to clock in.`, { distance });
    }
    const row = await env.DB.prepare(`INSERT INTO attendance (user_id, installation_id, clock_in_at, in_lat, in_lng, in_accuracy, in_distance, last_ping_at, last_lat, last_lng, last_distance)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).bind(ctx.user.id, site.id, now(), lat, lng, accuracy, distance, now(), lat, lng, distance).first();
    await env.DB.prepare('INSERT INTO location_pings (attendance_id, lat, lng, accuracy, distance, inside) VALUES (?,?,?,?,?,1)').bind(row.id, lat, lng, accuracy, distance).run();
    if (site.status === 'scheduled') await env.DB.prepare(`UPDATE installations SET status='in_progress', updated_at=? WHERE id=?`).bind(now(), site.id).run();
    const arrival = await markArrival(env, ctx.user.id, site.id, row.id);
    const lateTxt = arrival && arrival.late > 10 ? ` · ${arrival.late} min late` : arrival ? ' · on time' : '';
    await notify(env, { module: 'attendance', type: arrival && arrival.late > 10 ? 'warning' : 'success', title: `${ctx.user.name} clocked in`, body: `${site.title} · ${distance}m from site centre${lateTxt}`, link: '/admin/#/attendance' });
    return ok({ id: row.id, distance, late: arrival?.late ?? null });
  });

  r.post('/api/field/ping', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'field');
    await rateLimit(env, `ping:${ctx.user.id}`, 120, 600);
    const b = await readJson(req, 4096);
    const { lat, lng, accuracy } = readCoords(b);
    const a = await env.DB.prepare(`SELECT a.*, i.lat site_lat, i.lng site_lng, i.radius_m, i.title site FROM attendance a JOIN installations i ON i.id=a.installation_id WHERE a.user_id=? AND a.status='open' ORDER BY a.id DESC LIMIT 1`).bind(ctx.user.id).first();
    if (!a) return ok({ clocked_in: false });
    const distance = Math.round(haversine(lat, lng, a.site_lat, a.site_lng));
    // Use a generous buffer so weak GPS doesn't trigger false alarms.
    const inside = distance <= a.radius_m + Math.min(accuracy, GPS_SLACK_MAX) + 50;
    await env.DB.prepare('INSERT INTO location_pings (attendance_id, lat, lng, accuracy, distance, inside) VALUES (?,?,?,?,?,?)').bind(a.id, lat, lng, accuracy, distance, inside ? 1 : 0).run();
    const updates = { last_ping_at: now(), last_lat: lat, last_lng: lng, last_distance: distance, lost_contact_alerted: 0 };
    if (!inside && !a.offsite) {
      updates.offsite = 1;
      updates.offsite_since = now();
      await notify(env, { module: 'attendance', type: 'danger', title: `${ctx.user.name} left the job site`, body: `${a.site} · now ~${distance >= 1000 ? (distance / 1000).toFixed(1) + 'km' : distance + 'm'} away`, link: '/admin/#/attendance' });
    } else if (inside && a.offsite) {
      const mins = a.offsite_since ? (Date.now() - new Date(a.offsite_since.replace(' ', 'T') + 'Z').getTime()) / 60000 : 0;
      updates.offsite = 0;
      updates.offsite_since = null;
      updates.offsite_minutes = Math.round((a.offsite_minutes + mins) * 10) / 10;
      await notify(env, { module: 'attendance', type: 'info', title: `${ctx.user.name} is back on site`, body: `${a.site} · away ${Math.round(mins)} min`, link: '/admin/#/attendance' });
    }
    const keys = Object.keys(updates);
    await env.DB.prepare(`UPDATE attendance SET ${keys.map((k) => k + '=?').join(',')} WHERE id=?`).bind(...keys.map((k) => updates[k]), a.id).run();
    return ok({ clocked_in: true, inside, distance, radius: a.radius_m });
  });

  r.post('/api/field/clock-out', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'field');
    const b = await readJson(req, 8192);
    const { lat, lng, accuracy } = readCoords(b);
    const a = await env.DB.prepare(`SELECT a.*, i.lat site_lat, i.lng site_lng, i.radius_m, i.title site FROM attendance a LEFT JOIN installations i ON i.id=a.installation_id WHERE a.user_id=? AND a.status='open' ORDER BY a.id DESC LIMIT 1`).bind(ctx.user.id).first();
    if (!a) fail(409, 'You are not clocked in');
    const distance = a.site_lat != null ? Math.round(haversine(lat, lng, a.site_lat, a.site_lng)) : null;
    const away = distance != null && distance > a.radius_m + Math.min(accuracy, GPS_SLACK_MAX) + 50;
    let offMins = a.offsite_minutes;
    if (a.offsite && a.offsite_since) offMins += (Date.now() - new Date(a.offsite_since.replace(' ', 'T') + 'Z').getTime()) / 60000;
    await env.DB.prepare(`UPDATE attendance SET status='closed', clock_out_at=?, out_lat=?, out_lng=?, out_accuracy=?, out_distance=?, offsite=0, offsite_minutes=?, note=? WHERE id=?`)
      .bind(now(), lat, lng, accuracy, distance, Math.round(offMins * 10) / 10, [a.note, str(b.note, 500), away ? `Clocked out ${distance}m from site` : null].filter(Boolean).join(' · ') || null, a.id).run();
    const hours = ((Date.now() - new Date(a.clock_in_at.replace(' ', 'T') + 'Z').getTime()) / 3600000).toFixed(1);
    await notify(env, { module: 'attendance', type: away ? 'warning' : 'info', title: `${ctx.user.name} clocked out`, body: `${a.site} · ${hours}h on shift${away ? ` · ${distance}m away from site` : ''}`, link: '/admin/#/attendance' });
    return ok({ hours: Number(hours) });
  });

  r.post('/api/field/report', async (req, env, _p, ctx, router) => {
    requirePerm(ctx.user, 'field');
    await rateLimit(env, `rep:${ctx.user.id}`, 30, 600);
    const form = await req.formData();
    const site = await assignedSite(env, ctx.user, num(form.get('installation_id'), 0));
    const message = str(form.get('message'), 4000);
    if (!message) fail(400, 'Please describe the work you completed');
    const images = [];
    for (const f of form.getAll('photos').slice(0, 10)) {
      if (f instanceof File && f.size) images.push((await router.storeUpload(env, f, 'work-reports', ctx.user.id)).url);
    }
    const progress = form.get('progress') ? clamp(num(form.get('progress'), 0), 0, 100) : null;
    const open = await env.DB.prepare(`SELECT id FROM attendance WHERE user_id=? AND status='open'`).bind(ctx.user.id).first();
    await env.DB.prepare('INSERT INTO work_reports (installation_id, user_id, attendance_id, message, images, progress, lat, lng) VALUES (?,?,?,?,?,?,?,?)')
      .bind(site.id, ctx.user.id, open?.id ?? null, message, JSON.stringify(images), progress, num(form.get('lat'), null), num(form.get('lng'), null)).run();
    if (progress != null) await env.DB.prepare('UPDATE installations SET progress=MAX(progress, ?), updated_at=? WHERE id=?').bind(progress, now(), site.id).run();
    await notify(env, { module: 'installations', type: 'success', title: `Work report: ${site.title}`, body: `${ctx.user.name}: ${message.slice(0, 100)}${images.length ? ` (${images.length} photo${images.length > 1 ? 's' : ''})` : ''}`, link: `/admin/#/installations/${site.id}` });
    return ok({ images });
  });
}
