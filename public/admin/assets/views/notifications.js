import { api, esc, ago } from '../lib.js';
export default async function ({ root, setTitle }) {
  setTitle('Notifications', 'Alerts from the website, field staff and automations (last 30 days)');
  const r = await api('/api/admin/notifications');
  root.innerHTML = `<div class="card"><div class="list">${r.items.map((n) => `<a class="li" href="${esc((n.link || '#/').replace('/admin/', ''))}" style="text-decoration:none;color:inherit"><span class="li-icon"><i class="ri-notification-3-line"></i></span><div class="body"><strong>${esc(n.title)}</strong><div class="meta">${esc(n.body || '')} · ${ago(n.created_at)}</div></div></a>`).join('') || '<div class="empty">No notifications.</div>'}</div></div>`;
}
