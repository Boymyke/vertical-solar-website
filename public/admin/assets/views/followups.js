import { $, $$, api, esc, ago, datetime, toast, fail, waLink, statusPill } from '../lib.js';
import { followupModal } from './customers.js';

const ICON = { call: 'ri-phone-line', whatsapp: 'ri-whatsapp-line', checkup: 'ri-heart-pulse-line', maintenance: 'ri-tools-line', payment: 'ri-bank-card-line', quote: 'ri-file-list-3-line', other: 'ri-calendar-line' };

export default async function ({ root, setTitle }) {
  setTitle('Follow-ups', 'Who to contact, when — including automatic check-ups after installation and maintenance reminders',
    '<button class="btn btn-primary" data-new><i class="ri-alarm-line"></i> New follow-up</button>');
  $('[data-new]').onclick = () => followupModal({}, load);
  root.innerHTML = `<div class="row" style="margin-bottom:14px"><div class="seg"><button class="on" data-mine="0">Everyone</button><button data-mine="1">Assigned to me</button></div>
    <select class="input" data-type style="width:auto"><option value="">All types</option>${Object.keys(ICON).map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
    <span class="muted small" style="margin-left:auto"><i class="ri-information-line"></i> Automatic follow-ups are created for new leads, sent quotes, completed installations, due maintenance and customers not contacted in 90 days.</span></div>
    <div class="grid g-3" data-cols></div>`;
  const state = { mine: '0', type: '' };
  const card = (f) => `<div class="kcard" style="cursor:default"><div class="row" style="gap:8px;align-items:flex-start"><span class="li-icon" style="width:30px;height:30px"><i class="${ICON[f.type] || ICON.other}"></i></span>
    <div style="flex:1;min-width:0"><strong>${esc(f.title)}</strong><div class="meta">${f.customer_name ? `<a href="#/customers/${f.customer_id}">${esc(f.customer_name)}</a> · ` : ''}${datetime(f.due_at)} (${ago(f.due_at)})</div>
    ${f.notes ? `<div class="meta" style="margin-top:4px;white-space:pre-wrap">${esc(f.notes.slice(0, 160))}</div>` : ''}<div class="meta">${f.assigned_name ? `<i class="ri-user-line"></i> ${esc(f.assigned_name)}` : 'Unassigned'}${f.auto ? ' · <span class="pill lime" style="font-size:10px">auto</span>' : ''}</div></div></div>
    <div class="row" style="margin-top:8px;gap:6px">${f.customer_phone ? `<a class="btn btn-sm" href="tel:${esc(f.customer_phone)}"><i class="ri-phone-line"></i></a><a class="btn btn-sm" target="_blank" rel="noopener" href="${waLink(f.customer_whatsapp || f.customer_phone, `Hello ${(f.customer_name || '').split(' ')[0]}, this is Vertical Solar. `)}"><i class="ri-whatsapp-line"></i></a>` : ''}
      <button class="btn btn-sm btn-primary" data-done="${f.id}" style="margin-left:auto"><i class="ri-check-line"></i> Done</button><button class="btn btn-sm" data-snooze="${f.id}" title="Snooze 1 day"><i class="ri-time-line"></i></button><button class="btn btn-sm btn-ghost" data-skip="${f.id}" title="Skip"><i class="ri-close-line"></i></button></div></div>`;
  async function load() {
    const p = new URLSearchParams({ status: 'pending', per: 300 });
    if (state.mine === '1') p.set('mine', '1');
    if (state.type) p.set('type', state.type);
    const [r, done] = await Promise.all([api('/api/admin/followups?' + p), api('/api/admin/followups?status=done&per=15&sort=followups.completed_at%20desc')]);
    const now = Date.now(), endToday = new Date(); endToday.setHours(23, 59, 59);
    const t = (f) => new Date(f.due_at.replace(' ', 'T') + 'Z').getTime();
    const cols = [
      ['Overdue', 'var(--bad)', r.items.filter((f) => t(f) < now && new Date(t(f)).toDateString() !== new Date().toDateString())],
      ['Today', 'var(--warn)', r.items.filter((f) => new Date(t(f)).toDateString() === new Date().toDateString())],
      ['Upcoming', 'var(--ok)', r.items.filter((f) => t(f) > endToday.getTime())],
    ];
    $('[data-cols]', root).innerHTML = cols.map(([title, color, list]) => `<div class="col"><h3><span><i class="ri-checkbox-blank-circle-fill" style="color:${color};font-size:10px"></i> ${title}</span><span class="muted">${list.length}</span></h3>${list.map(card).join('') || '<div class="empty small">Nothing here</div>'}</div>`).join('') +
      `<div class="card" style="grid-column:1/-1"><div class="card-h"><h2>Recently completed</h2></div><div class="list">${done.items.map((f) => `<div class="li"><span class="li-icon"><i class="ri-checkbox-circle-line"></i></span><div class="body"><strong>${esc(f.title)}</strong><div class="meta">${esc(f.customer_name || '')} · ${f.outcome ? esc(f.outcome) + ' · ' : ''}${ago(f.completed_at)}</div></div>${statusPill('done')}</div>`).join('') || '<div class="empty small">None yet.</div>'}</div></div>`;
  }
  root.addEventListener('click', async (e) => {
    const done = e.target.closest('[data-done]'), sn = e.target.closest('[data-snooze]'), sk = e.target.closest('[data-skip]');
    try {
      if (done) { const outcome = prompt('Outcome / notes (optional)', ''); if (outcome === null) return; await api(`/api/admin/followups/${done.dataset.done}`, { method: 'PUT', body: { status: 'done', outcome } }); toast('Done — logged to the customer timeline'); load(); }
      if (sn) { await api(`/api/admin/followups/${sn.dataset.snooze}`, { method: 'PUT', body: { due_at: new Date(Date.now() + 864e5).toISOString().replace('T', ' ').slice(0, 19) } }); toast('Snoozed to tomorrow'); load(); }
      if (sk) { await api(`/api/admin/followups/${sk.dataset.skip}`, { method: 'PUT', body: { status: 'skipped' } }); load(); }
    } catch (err) { fail(err); }
  });
  $$('[data-mine]', root).forEach((b) => (b.onclick = () => { state.mine = b.dataset.mine; $$('[data-mine]', root).forEach((x) => x.classList.toggle('on', x === b)); load(); }));
  $('[data-type]', root).onchange = (e) => { state.type = e.target.value; load(); };
  load();
}
