import { $, $$, api, esc, datetime, ago, toast, fail, table, statusPill, modal, formHtml, readForm, validate, waLink } from '../lib.js';
import { staffOptions } from './customers.js';

export default async function (ctx) {
  const { root, params, setTitle } = ctx;
  setTitle('Customer support', 'Fault reports, warranty claims and questions from customers', '<button class="btn btn-primary" data-new><i class="ri-add-line"></i> New ticket</button>');
  const users = await staffOptions();
  $('[data-new]').onclick = () => {
    const fields = [{ name: 'name', label: 'Customer name', required: true }, { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email', type: 'email' },
      { name: 'category', label: 'Category', type: 'select', options: [['fault', 'Fault'], ['installation', 'Installation'], ['warranty', 'Warranty'], ['billing', 'Billing'], ['general', 'General']] },
      { name: 'priority', label: 'Priority', type: 'select', options: ['normal', 'high', 'urgent', 'low'] }, { name: 'assigned_to', label: 'Assign to', type: 'select', options: [['', 'Unassigned'], ...users.map((u) => [u.id, u.name])] },
      { name: 'subject', label: 'Subject', required: true, full: true }, { name: 'message', label: 'Details', type: 'textarea', full: true }];
    const { el, close } = modal({ title: 'New support ticket', size: 'wide', body: `<form data-f>${formHtml(fields, { priority: 'normal', category: 'fault' })}</form>`, footer: '<button class="btn btn-primary" data-ok>Create ticket</button>' });
    $('[data-ok]', el).onclick = async () => { const f = $('[data-f]', el); if (!validate(f)) return; const b = readForm(f, fields); if (!b.assigned_to) b.assigned_to = null; try { const r = await api('/api/admin/tickets', { body: b }); close(); location.hash = `#/support/${r.item.id}`; } catch (err) { fail(err); } };
  };
  root.innerHTML = `<div class="grid g-12"><div class="card"><div class="toolbar"><div class="seg">${['open', 'pending', 'resolved', ''].map((s) => `<button data-s="${s}" class="${s === 'open' ? 'on' : ''}">${s ? s[0].toUpperCase() + s.slice(1) : 'All'}</button>`).join('')}</div></div><div class="list" data-list style="max-height:72vh;overflow:auto"></div></div><div data-detail><div class="card empty"><i class="ri-customer-service-2-line"></i>Select a ticket.</div></div></div>`;
  let status = 'open';
  async function load() {
    const r = await api(`/api/admin/tickets?per=200${status ? '&status=' + status : ''}`);
    $('[data-list]', root).innerHTML = r.items.map((t) => `<button class="li" style="border:0;border-bottom:1px solid var(--line);background:${String(t.id) === params[0] ? 'var(--surface-2)' : 'none'};width:100%;text-align:left;cursor:pointer" data-id="${t.id}">
      <span class="li-icon" style="${t.priority === 'urgent' || t.priority === 'high' ? 'color:var(--bad)' : ''}"><i class="${t.category === 'fault' ? 'ri-alarm-warning-line' : t.category === 'warranty' ? 'ri-shield-check-line' : 'ri-question-line'}"></i></span>
      <div class="body"><strong class="nowrap" style="display:block;overflow:hidden;text-overflow:ellipsis">${esc(t.subject)}</strong><div class="meta">${esc(t.number)} · ${esc(t.name || '')} · ${ago(t.created_at)}</div></div>${statusPill(t.priority === 'normal' ? t.status : t.priority)}</button>`).join('') || '<div class="empty">No tickets 🎉</div>';
    $$('[data-id]', root).forEach((b) => (b.onclick = () => (location.hash = `#/support/${b.dataset.id}`)));
  }
  async function detail(id) {
    const [t, rep] = await Promise.all([api(`/api/admin/tickets/${id}`), api(`/api/admin/tickets/${id}/replies`)]);
    $('[data-detail]', root).innerHTML = `<div class="card"><div class="card-h"><div><div class="sub">${esc(t.number)} · ${esc(t.category)} · via ${esc(t.source)}</div><h2>${esc(t.subject)}</h2></div><div class="row" style="margin-left:auto">${statusPill(t.status)}${statusPill(t.priority)}</div></div>
      <div class="card-b stack">
        <div class="row"><strong>${esc(t.name || '')}</strong><span class="muted">${esc(t.phone || '')} ${esc(t.email || '')}</span>${t.phone ? `<a class="btn btn-sm" href="tel:${esc(t.phone)}"><i class="ri-phone-line"></i></a><a class="btn btn-sm" target="_blank" rel="noopener" href="${waLink(t.phone, `Hello ${(t.name || '').split(' ')[0]}, this is Vertical Solar support about ticket ${t.number}.`)}"><i class="ri-whatsapp-line"></i></a>` : ''}${t.customer_id ? `<a class="btn btn-sm" href="#/customers/${t.customer_id}">Customer</a>` : ''}</div>
        <div class="alert info" style="white-space:pre-wrap">${esc(t.message)}</div>
        <div class="timeline">${rep.items.map((r) => `<div class="tl"><span class="li-icon"><i class="${r.internal ? 'ri-lock-line' : 'ri-reply-line'}"></i></span><div><div class="meta">${esc(r.user_name || 'Staff')} · ${datetime(r.created_at)}${r.internal ? ' · internal note' : ''}</div><p>${esc(r.body)}</p></div></div>`).join('')}</div>
        <form class="stack" data-reply style="gap:8px"><textarea class="input" name="body" rows="3" required placeholder="Write an update or note…"></textarea>
          <div class="row"><label class="check small"><input type="checkbox" name="internal"><span>Internal note (staff only)</span></label>
          <select class="input" name="status" style="width:auto;margin-left:auto"><option value="">Keep status</option><option value="pending">Pending</option><option value="resolved">Resolved</option><option value="closed">Closed</option><option value="open">Re-open</option></select>
          <button class="btn btn-primary" type="submit">Add update</button></div>
          <p class="muted small" style="margin:0">Updates are recorded here. Contact the customer by phone/WhatsApp, or send an email from the Email page.</p></form>
        <div class="form-grid"><div class="field"><label>Assigned to</label><select class="input" data-assign><option value="">Unassigned</option>${users.map((u) => `<option value="${u.id}" ${u.id === t.assigned_to ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Priority</label><select class="input" data-prio>${['low', 'normal', 'high', 'urgent'].map((p) => `<option value="${p}" ${p === t.priority ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></div></div>
      </div></div>`;
    $('[data-reply]', root).onsubmit = async (e) => { e.preventDefault(); const fd = new FormData(e.target); try { await api(`/api/admin/tickets/${id}/replies`, { body: { body: fd.get('body'), internal: !!fd.get('internal'), status: fd.get('status') || undefined } }); toast('Saved'); detail(id); load(); } catch (err) { fail(err); } };
    $('[data-assign]', root).onchange = (e) => api(`/api/admin/tickets/${id}`, { method: 'PUT', body: { assigned_to: e.target.value || null } }).then(() => toast('Assigned'));
    $('[data-prio]', root).onchange = (e) => api(`/api/admin/tickets/${id}`, { method: 'PUT', body: { priority: e.target.value } }).then(() => { toast('Priority updated'); load(); });
  }
  $$('[data-s]', root).forEach((b) => (b.onclick = () => { status = b.dataset.s; $$('[data-s]', root).forEach((x) => x.classList.toggle('on', x === b)); load(); }));
  await load();
  if (params[0]) detail(params[0]);
}
