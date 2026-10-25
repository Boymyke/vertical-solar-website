// Scheduled jobs: field-staff safety checks, follow-up automation, reminders and housekeeping.
import { notify } from './lib/auth.js';
import { getSettings } from './lib/site.js';
import { now } from './lib/util.js';

export async function everyTenMinutes(env) {
  // Staff whose phone stopped reporting location while clocked in.
  const { results: silent } = await env.DB.prepare(`SELECT a.id, u.name, i.title FROM attendance a JOIN users u ON u.id=a.user_id LEFT JOIN installations i ON i.id=a.installation_id
    WHERE a.status='open' AND a.lost_contact_alerted=0 AND a.last_ping_at < datetime('now','-25 minutes')`).all();
  for (const a of silent) {
    await notify(env, { module: 'attendance', type: 'warning', title: `No location from ${a.name} for 25+ min`, body: `${a.title || 'Job site'} — phone may be off, out of data, or the field app was closed.`, link: '/admin/#/attendance' });
    await env.DB.prepare('UPDATE attendance SET lost_contact_alerted=1 WHERE id=?').bind(a.id).run();
  }
  // Forgotten clock-outs.
  const { results: stale } = await env.DB.prepare(`SELECT a.id, u.name FROM attendance a JOIN users u ON u.id=a.user_id WHERE a.status='open' AND a.clock_in_at < datetime('now','-14 hours')`).all();
  for (const a of stale) {
    await env.DB.prepare(`UPDATE attendance SET status='auto_closed', clock_out_at=COALESCE(last_ping_at, ?), note=COALESCE(note,'') || ' Auto-closed after 14h without clock-out.' WHERE id=?`).bind(now(), a.id).run();
    await notify(env, { module: 'attendance', type: 'warning', title: `${a.name} did not clock out`, body: 'Shift auto-closed after 14 hours.', link: '/admin/#/attendance' });
  }
  await env.DB.prepare(`UPDATE quotes SET status='expired' WHERE status IN ('sent','viewed') AND valid_until < datetime('now')`).run();
}

export async function daily(env) {
  // 1. Maintenance visits due within 7 days → call reminder follow-ups.
  const { results: visits } = await env.DB.prepare(`SELECT m.id, m.installation_id, m.customer_id, m.scheduled_at, c.name FROM maintenance_visits m LEFT JOIN customers c ON c.id=m.customer_id
    WHERE m.status='scheduled' AND m.scheduled_at <= datetime('now','+7 days')
    AND NOT EXISTS (SELECT 1 FROM followups f WHERE f.installation_id=m.installation_id AND f.type='maintenance' AND f.status='pending')`).all();
  for (const v of visits) {
    await env.DB.prepare(`INSERT INTO followups (customer_id, installation_id, type, title, due_at, auto) VALUES (?,?, 'maintenance', ?, datetime('now'), 1)`)
      .bind(v.customer_id, v.installation_id, `Book maintenance visit for ${v.name || 'customer'} (due ${String(v.scheduled_at).slice(0, 10)})`).run();
  }
  // 2. Customers not contacted for 90 days → check-in call (keeps relationships warm and drives referrals).
  const { results: quiet } = await env.DB.prepare(`SELECT id, name FROM customers WHERE status='customer'
    AND COALESCE(last_contacted_at, updated_at) < datetime('now','-90 days')
    AND NOT EXISTS (SELECT 1 FROM followups f WHERE f.customer_id=customers.id AND f.status='pending') LIMIT 50`).all();
  for (const c of quiet) {
    await env.DB.prepare(`INSERT INTO followups (customer_id, type, title, due_at, auto) VALUES (?, 'checkup', ?, datetime('now'), 1)`).bind(c.id, `Quarterly check-in: ${c.name} — ask about system performance & referrals`).run();
  }
  // 3. Warranties expiring in the next 30 days.
  const w = await env.DB.prepare(`SELECT COUNT(*) n FROM warranties WHERE end_date BETWEEN date('now') AND date('now','+30 days')`).first();
  if (w.n) await notify(env, { module: 'maintenance', type: 'warning', title: `${w.n} warrant${w.n > 1 ? 'ies' : 'y'} expiring within 30 days`, body: 'Good time to offer an extended service plan.', link: '/admin/#/warranties' });
  // 4. Today's follow-ups digest.
  const f = await env.DB.prepare(`SELECT COUNT(*) n, SUM(CASE WHEN due_at < date('now') THEN 1 ELSE 0 END) overdue FROM followups WHERE status='pending' AND due_at < date('now','+1 day')`).first();
  if (f.n) await notify(env, { module: 'followups', type: f.overdue ? 'warning' : 'info', title: `${f.n} follow-up${f.n > 1 ? 's' : ''} due today`, body: f.overdue ? `${f.overdue} overdue` : 'Open the follow-up board to start calling.', link: '/admin/#/followups' });
  // 5. Low stock digest.
  const ls = await env.DB.prepare('SELECT COUNT(*) n FROM products WHERE active=1 AND stock <= reorder_level').first();
  if (ls.n) await notify(env, { module: 'inventory', type: 'warning', title: `${ls.n} product${ls.n > 1 ? 's are' : ' is'} low on stock`, link: '/admin/#/inventory' });
  // 6. Housekeeping.
  const nowS = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(nowS - 3600),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')"),
    env.DB.prepare("DELETE FROM heat_events WHERE created_at < datetime('now','-180 days')"),
    env.DB.prepare("DELETE FROM location_pings WHERE created_at < datetime('now','-365 days')"),
    env.DB.prepare("DELETE FROM notifications WHERE created_at < datetime('now','-90 days')"),
  ]);
  // 7. Optional email digest to managers.
  const s = await getSettings(env);
  if (env.RESEND_API_KEY && s.integrations.email_from && s.integrations.notify_emails) {
    const leads = await env.DB.prepare(`SELECT COUNT(*) n FROM customers WHERE created_at >= datetime('now','-1 day')`).first();
    const to = s.integrations.notify_emails.split(/[,;\s]+/).filter(Boolean).slice(0, 10);
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: `${s.integrations.email_from_name} <${s.integrations.email_from}>`, to, subject: `Daily brief: ${leads.n} new leads, ${f.n || 0} follow-ups due`,
        text: `Good morning,\n\nNew leads (24h): ${leads.n}\nFollow-ups due today: ${f.n || 0} (${f.overdue || 0} overdue)\nLow-stock items: ${ls.n}\nWarranties expiring in 30 days: ${w.n}\n\nOpen the CRM: ${env.SITE_URL}/admin\n` }),
    }).catch(() => {});
  }
}
