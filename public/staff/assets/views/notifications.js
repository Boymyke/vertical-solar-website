import { $, $$, api, emptyState } from '../lib.js';

export default async function ({ root, setTitle }) {
  const { notifHtml, dismiss } = window.__vsNotif;
  setTitle('Notifications', 'Alerts from the website, your team and reminders — last 30 days', '<button class="btn" type="button" data-readall><i class="ri-check-double-line"></i> Mark all read</button><button class="btn" type="button" data-clearall><i class="ri-delete-bin-6-line"></i> Clear all</button>');
  let items = [];
  const draw = () => {
    root.innerHTML = `<div class="card notif-list" style="max-width:820px">${items.length ? items.map(notifHtml).join('') : emptyState('ri-notification-off-line', 'You\'re all caught up\nNew alerts from the website and your team show up here.')}</div>`;
  };
  items = (await api('/api/admin/notifications')).items; draw();
  root.addEventListener('click', async (e) => {
    const x = e.target.closest('[data-dismiss]');
    if (x) { const row = x.closest('[data-nid]'); const id = Number(row.dataset.nid); items = items.filter((n) => n.id !== id); await dismiss([id], [row]); if (!items.length) setTimeout(draw, 260); }
    const a = e.target.closest('[data-open]'); if (a) api('/api/admin/notifications/read', { body: { ids: [Number(a.closest('[data-nid]').dataset.nid)] } });
  });
  $('[data-readall]').onclick = async () => { await api('/api/admin/notifications/read', { body: { ids: items.map((n) => n.id) } }); items.forEach((n) => (n.read = 1)); draw(); };
  $('[data-clearall]').onclick = async () => { const ids = items.map((n) => n.id); await dismiss(ids, $$('.notif', root)); items = []; setTimeout(draw, 260); };
}
