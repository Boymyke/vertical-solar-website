import { $, $$, api, esc, naira, date, ago, datetime, modal, formHtml, readForm, validate, toast, fail, table, statusPill, STAGES, SEGMENTS, waLink, confirmBox, debounce, fromLocalInput, toLocalInput, bindWidgets } from '../lib.js';

export const CUSTOMER_FIELDS = [
  { name: 'name', label: 'Full name', required: true }, { name: 'company', label: 'Company / organisation' },
  { name: 'phone', label: 'Phone', type: 'tel' }, { name: 'whatsapp', label: 'WhatsApp', type: 'tel', hint: 'Leave blank if same as phone' },
  { name: 'email', label: 'Email', type: 'email' }, { name: 'segment', label: 'Segment', type: 'select', options: SEGMENTS },
  { name: 'address', label: 'Address', type: 'place', full: true, hint: 'Pick the address from the list — it is used later for the installation site and directions.' }, { name: 'city', label: 'City / area' }, { name: 'state', label: 'State' },
  { name: 'stage', label: 'Pipeline stage', type: 'select', options: STAGES.map((s) => [s, s.replace('_', ' ')]) },
  { name: 'status', label: 'Status', type: 'select', options: [['lead', 'Lead'], ['customer', 'Customer'], ['inactive', 'Inactive']] },
  { name: 'source', label: 'Source', type: 'select', options: [['manual', 'Manual entry'], ['referral', 'Referral'], ['walk_in', 'Walk-in'], ['phone', 'Phone call'], ['whatsapp', 'WhatsApp'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['website_quote', 'Website quote'], ['chatbot', 'AI chat'], ['shop', 'Shop'], ['event', 'Event']] },
  { name: 'interest', label: 'Interested in' }, { name: 'value_estimate', label: 'Estimated value (₦)', type: 'number' },
  { name: 'assigned_to', label: 'Looked after by', type: 'select', options: [] },
  { name: 'notes', label: 'Notes', type: 'textarea', full: true },
];

let usersCache;
export async function staffOptions() {
  if (!usersCache) usersCache = api('/api/admin/users').then((r) => r.items.filter((u) => u.active)).catch(() => []);
  return usersCache;
}

export async function customerForm(existing, onSaved) {
  const users = await staffOptions();
  const fields = CUSTOMER_FIELDS.map((f) => (f.name === 'assigned_to' ? { ...f, options: [['', 'Unassigned'], ...users.map((u) => [u.id, u.name])] } : f));
  const { el, close } = modal({ title: existing ? `Edit ${existing.name}` : 'New customer / lead', size: 'wide',
    body: `<form data-f>${formHtml(fields, existing || { stage: 'new', status: 'lead', segment: 'residential', source: 'manual' })}</form>`,
    footer: `<button class="btn" data-x2>Cancel</button><button class="btn btn-primary" data-save><i class="ri-save-line"></i> Save</button>` });
  const form = $('[data-f]', el);
  bindWidgets(form);
  import('/assets/js/places.js').then(() => form.querySelector('[name=address]').addEventListener('change', () => {
    const p = form.querySelector('[name=address]')._place; if (!p) return;
    if (!form.querySelector('[name=city]').value && p.city) form.querySelector('[name=city]').value = p.city;
    if (!form.querySelector('[name=state]').value && p.state) form.querySelector('[name=state]').value = p.state;
  }));
  $('[data-x2]', el).onclick = close;
  $('[data-save]', el).onclick = async (e) => {
    const f = $('[data-f]', el); if (!validate(f)) return;
    const body = readForm(f, fields);
    if (!body.whatsapp) body.whatsapp = body.phone;
    if (body.assigned_to === '') body.assigned_to = null;
    e.currentTarget.classList.add('loading');
    try {
      const r = existing ? await api(`/api/admin/customers/${existing.id}`, { method: 'PUT', body }) : await api('/api/admin/customers', { body });
      toast('Saved'); close(); onSaved?.(r.item);
    } catch (err) { fail(err); e.currentTarget.classList.remove('loading'); }
  };
}

export default async function (ctx) {
  const { root, params, setTitle, can } = ctx;
  if (params[0] === 'new') { location.hash = '#/customers'; setTimeout(() => customerForm(null, (c) => (location.hash = `#/customers/${c.id}`)), 50); return; }
  if (params[0]) return detail(ctx, params[0]);
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const state = { q: '', stage: qs.get('stage') || '', segment: '', source: '', page: 1, view: qs.get('view') === 'board' ? 'board' : 'list' };
  setTitle('Customers & leads', 'Everyone who has asked about, bought or uses a Vertical Solar system',
    `<a class="btn" href="/api/admin/customers-export"><i class="ri-download-2-line"></i> Export CSV</a><button class="btn btn-primary" data-new><i class="ri-user-add-line"></i> New lead</button>`);
  $('[data-new]').onclick = () => customerForm(null, (c) => (location.hash = `#/customers/${c.id}`));
  root.innerHTML = `<div class="card"><div class="toolbar">
      <div class="search"><i class="ri-search-line"></i><input class="input" data-q placeholder="Search name, phone, email, city"></div>
      <select class="input" data-stage style="width:auto"><option value="">All stages</option>${STAGES.map((s) => `<option value="${s}">${s.replace('_', ' ')}</option>`).join('')}</select>
      <select class="input" data-segment style="width:auto"><option value="">All segments</option>${SEGMENTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
      <select class="input" data-status style="width:auto"><option value="">Leads &amp; customers</option><option value="lead">Leads</option><option value="customer">Customers</option><option value="inactive">Inactive</option></select>
      <div class="seg" style="margin-left:auto"><button data-v="list" class="${state.view === 'list' ? 'on' : ''}"><i class="ri-list-check"></i> List</button><button data-v="board" class="${state.view === 'board' ? 'on' : ''}"><i class="ri-kanban-view"></i> Pipeline</button></div>
    </div><div data-body></div></div>`;
  $('[data-stage]', root).value = state.stage;
  const body = $('[data-body]', root);
  async function load() {
    const p = new URLSearchParams({ page: state.page, per: state.view === 'board' ? 500 : 25 });
    for (const k of ['q', 'stage', 'segment', 'status']) if (state[k]) p.set(k, state[k]);
    const r = await api('/api/admin/customers?' + p);
    if (state.view === 'board') return board(r.items);
    body.innerHTML = table({
      rows: r.items, onRow: true, empty: 'No customers match. Leads from the website appear here automatically.',
      columns: [
        { label: 'Customer', render: (c) => `<div class="person"><span class="avatar" style="background:var(--surface-2);color:var(--heading)">${esc((c.name || '?').slice(0, 1))}</span><div><strong>${esc(c.name)}</strong><span>${esc(c.company || c.city || '')}</span></div></div>` },
        { label: 'Contact', render: (c) => `<div>${esc(c.phone || '—')}</div><div class="muted small">${esc(c.email || '')}</div>` },
        { label: 'Stage', render: (c) => statusPill(c.stage) },
        { label: 'Segment', render: (c) => `<span class="pill">${esc(c.segment || '')}</span>` },
        { label: 'Source', render: (c) => `<span class="small muted">${esc((c.source || '').replace(/_/g, ' '))}</span>` },
        { label: 'Value', align: 'right', render: (c) => (c.value_estimate ? naira(c.value_estimate) : '—') },
        { label: 'Owner', render: (c) => esc(c.assigned_name || '—') },
        { label: 'Last contact', render: (c) => `<span class="small">${ago(c.last_contacted_at)}</span>` },
      ],
    }) + (r.pages > 1 ? `<div class="pager">Page ${r.page} of ${r.pages} · ${r.total} records <button class="btn btn-sm" data-pg="-1" ${r.page <= 1 ? 'disabled' : ''}>Previous</button><button class="btn btn-sm" data-pg="1" ${r.page >= r.pages ? 'disabled' : ''}>Next</button></div>` : `<div class="pager">${r.total} records</div>`);
    $$('tr[data-row]', body).forEach((tr) => (tr.onclick = () => (location.hash = `#/customers/${r.items[tr.dataset.row].id}`)));
    $$('[data-pg]', body).forEach((b) => (b.onclick = () => { state.page += Number(b.dataset.pg); load(); }));
  }
  function board(items) {
    body.innerHTML = `<div class="card-b"><div class="kanban">${STAGES.map((s) => {
      const list = items.filter((c) => c.stage === s);
      return `<div class="col" data-stage="${s}"><h3><span>${s.replace('_', ' ')}</span><span class="muted">${list.length} · ${naira(list.reduce((a, c) => a + (c.value_estimate || 0), 0))}</span></h3>
        ${list.map((c) => `<div class="kcard" draggable="true" data-id="${c.id}"><strong>${esc(c.name)}</strong><div class="meta">${esc(c.interest || c.city || '')}</div><div class="row between" style="margin-top:6px"><span class="meta">${ago(c.updated_at)}</span>${c.value_estimate ? `<span class="small"><strong>${naira(c.value_estimate)}</strong></span>` : ''}</div></div>`).join('')}</div>`;
    }).join('')}</div><p class="muted small">Drag a card to move it to another stage. Click to open.</p></div>`;
    let dragId = null;
    $$('.kcard', body).forEach((k) => { k.ondragstart = () => (dragId = k.dataset.id); k.onclick = () => (location.hash = `#/customers/${k.dataset.id}`); });
    $$('.col', body).forEach((col) => {
      col.ondragover = (e) => { e.preventDefault(); col.classList.add('drop'); };
      col.ondragleave = () => col.classList.remove('drop');
      col.ondrop = async (e) => { e.preventDefault(); col.classList.remove('drop'); if (!dragId) return; try { await api(`/api/admin/customers/${dragId}`, { method: 'PUT', body: { stage: col.dataset.stage } }); toast(`Moved to ${col.dataset.stage.replace('_', ' ')}`); load(); } catch (err) { fail(err); } };
    });
  }
  $('[data-q]', root).oninput = debounce((e) => { state.q = e.target.value; state.page = 1; load(); });
  for (const k of ['stage', 'segment', 'status']) $(`[data-${k}]`, root).onchange = (e) => { state[k] = e.target.value; state.page = 1; load(); };
  $$('[data-v]', root).forEach((b) => (b.onclick = () => { state.view = b.dataset.v; $$('[data-v]', root).forEach((x) => x.classList.toggle('on', x === b)); load(); }));
  load();
}

const ACT_ICON = { note: 'ri-sticky-note-line', call: 'ri-phone-line', whatsapp: 'ri-whatsapp-line', email: 'ri-mail-line', visit: 'ri-map-pin-line', system: 'ri-robot-2-line', meeting: 'ri-team-line', sms: 'ri-message-2-line' };

async function detail(ctx, id) {
  const { root, setTitle, can } = ctx;
  const c = await api(`/api/admin/customers/${id}`);
  const tl = await api(`/api/admin/customers/${id}/timeline`);
  const wa = c.whatsapp || c.phone;
  setTitle(c.name, `${c.company ? c.company + ' · ' : ''}${c.segment} ${c.status} · added ${date(c.created_at)}`,
    `${c.phone ? `<a class="btn" href="tel:${esc(c.phone)}"><i class="ri-phone-line"></i> Call</a>` : ''}${wa ? `<a class="btn" href="${waLink(wa, `Hello ${c.name.split(' ')[0]}, this is Vertical Solar.`)}" target="_blank" rel="noopener"><i class="ri-whatsapp-line"></i> WhatsApp</a>` : ''}
     ${c.email && can('email', 'crm') ? `<a class="btn" href="#/email?to=${encodeURIComponent(c.email)}&customer=${c.id}"><i class="ri-mail-line"></i> Email</a>` : ''}<button class="btn" data-edit><i class="ri-edit-line"></i> Edit</button>`);
  $('[data-edit]').onclick = () => customerForm(c, () => detail(ctx, id));
  root.innerHTML = `
  <div class="grid g-12">
    <div class="stack">
      <div class="card"><div class="card-b stack" style="gap:10px">
        <div class="row"><span class="avatar" style="width:52px;height:52px;font-size:18px">${esc((c.name || '?').slice(0, 2).toUpperCase())}</span><div><strong style="font-size:16px;color:var(--heading)">${esc(c.name)}</strong><div class="muted small">${esc(c.company || '')}</div></div></div>
        <div class="field"><label for="stage-sel">Pipeline stage</label><select class="input" id="stage-sel">${STAGES.map((s) => `<option value="${s}" ${s === c.stage ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}</select></div>
        <div class="small"><i class="ri-phone-line"></i> ${esc(c.phone || '—')}</div><div class="small"><i class="ri-mail-line"></i> ${esc(c.email || '—')}</div>
        <div class="small"><i class="ri-map-pin-line"></i> ${esc([c.address, c.city, c.state].filter(Boolean).join(', ') || '—')}</div>
        <div class="small"><i class="ri-price-tag-3-line"></i> ${esc(c.interest || '—')}</div>
        <div class="small"><i class="ri-money-dollar-circle-line"></i> Est. value ${c.value_estimate ? naira(c.value_estimate) : '—'}</div>
        <div class="small"><i class="ri-user-star-line"></i> Owner: ${esc(c.assigned_name || 'Unassigned')}</div>
        <div class="small"><i class="ri-route-line"></i> Source: ${esc((c.source || '').replace(/_/g, ' '))}</div>
        ${c.notes ? `<div class="alert info" style="white-space:pre-wrap">${esc(c.notes)}</div>` : ''}
      </div></div>
      <div class="card"><div class="card-h"><h2>Quick actions</h2></div><div class="card-b stack" style="gap:8px">
        ${can('quotes') ? `<a class="btn" href="#/quotes/new?customer=${c.id}"><i class="ri-file-add-line"></i> Create quote</a>` : ''}
        ${can('followups', 'crm') ? '<button class="btn" data-fu><i class="ri-alarm-line"></i> Schedule follow-up</button>' : ''}
        ${can('installations') ? '<button class="btn" data-inst><i class="ri-tools-line"></i> Schedule installation</button>' : ''}
        ${can('ai') ? '<button class="btn" data-ai="summary"><i class="ri-sparkling-2-line"></i> AI summary</button><button class="btn" data-ai="followup"><i class="ri-quill-pen-line"></i> AI follow-up message</button>' : ''}
      </div></div>
    </div>
    <div class="stack">
      <div class="card"><div class="card-h"><h2>Log an interaction</h2></div><div class="card-b"><form class="stack" data-act style="gap:10px">
        <div class="row"><select class="input" name="type" style="width:auto"><option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="visit">Site visit</option><option value="meeting">Meeting</option><option value="note">Note</option></select>
        <span class="muted small">Logging a call/WhatsApp/visit updates "last contacted".</span></div>
        <textarea class="input" name="body" rows="3" placeholder="What happened? What's the next step?" required></textarea>
        <div class="row"><label class="check small"><input type="checkbox" name="fu"><span>Also schedule a follow-up in</span></label><select class="input" name="days" style="width:auto"><option value="1">1 day</option><option value="3" selected>3 days</option><option value="7">1 week</option><option value="30">1 month</option></select>
        <button class="btn btn-primary" type="submit" style="margin-left:auto"><i class="ri-add-line"></i> Save</button></div></form></div></div>
      <div class="card"><div class="tabs" style="padding:0 12px;margin:0" role="tablist">
        <button class="on" data-tab="tl">Timeline (${tl.activities.length})</button><button data-tab="fu">Follow-ups (${tl.followups.filter((f) => f.status === 'pending').length})</button><button data-tab="q">Quotes (${tl.quotes.length})</button>
        <button data-tab="i">Installations (${tl.installations.length})</button><button data-tab="t">Support (${tl.tickets.length})</button><button data-tab="w">Warranties (${tl.warranties.length})</button><button data-tab="o">Orders (${tl.orders.length})</button></div>
        <div class="card-b" data-tabbody></div></div>
    </div>
  </div>`;
  const tabs = {
    tl: () => tl.activities.length ? `<div class="timeline">${tl.activities.map((a) => `<div class="tl"><span class="li-icon"><i class="${ACT_ICON[a.type] || 'ri-chat-1-line'}"></i></span><div><div class="meta">${esc(a.type)} · ${datetime(a.created_at)}${a.user_name ? ' · ' + esc(a.user_name) : ''}</div><p>${esc(a.body)}</p></div></div>`).join('')}</div>` : '<div class="empty">No interactions yet.</div>',
    fu: () => table({ rows: tl.followups, empty: 'No follow-ups.', columns: [{ label: 'Task', render: (f) => `<strong>${esc(f.title)}</strong><div class="muted small">${esc(f.type)}</div>` }, { label: 'Due', render: (f) => datetime(f.due_at) }, { label: 'Owner', render: (f) => esc(f.assigned_name || '—') }, { label: 'Status', render: (f) => statusPill(f.status) },
      { label: '', render: (f) => (f.status === 'pending' ? `<button class="btn btn-sm" data-done="${f.id}"><i class="ri-check-line"></i> Done</button>` : '') }] }),
    q: () => table({ rows: tl.quotes, empty: 'No quotes yet.', onRow: true, columns: [{ label: 'Quote', render: (q) => `<strong>${esc(q.number)}</strong><div class="muted small">${esc(q.title)}</div>` }, { label: 'Total', render: (q) => naira(q.total) }, { label: 'Status', render: (q) => statusPill(q.status) }, { label: 'Date', render: (q) => date(q.created_at) }] }),
    i: () => table({ rows: tl.installations, empty: 'No installations yet.', onRow: true, columns: [{ label: 'Job', render: (x) => `<strong>${esc(x.title)}</strong>` }, { label: 'Status', render: (x) => statusPill(x.status) }, { label: 'Progress', render: (x) => `${x.progress || 0}%` }, { label: 'Next maintenance', render: (x) => date(x.next_maintenance_at) }] }),
    t: () => table({ rows: tl.tickets, empty: 'No support tickets.', onRow: true, columns: [{ label: 'Ticket', render: (x) => `<strong>${esc(x.number)}</strong><div class="muted small">${esc(x.subject)}</div>` }, { label: 'Priority', render: (x) => statusPill(x.priority) }, { label: 'Status', render: (x) => statusPill(x.status) }, { label: 'Opened', render: (x) => date(x.created_at) }] }),
    w: () => table({ rows: tl.warranties, empty: 'No warranties recorded.', columns: [{ label: 'Item', render: (x) => `<strong>${esc(x.item)}</strong><div class="muted small">${esc(x.serial || '')}</div>` }, { label: 'Provider', key: 'provider' }, { label: 'Ends', render: (x) => date(x.end_date) }] }),
    o: () => table({ rows: tl.orders, empty: 'No shop orders.', columns: [{ label: 'Order', key: 'number' }, { label: 'Total', render: (x) => naira(x.total) }, { label: 'Status', render: (x) => statusPill(x.status) }, { label: 'Date', render: (x) => date(x.created_at) }] }),
  };
  const tb = $('[data-tabbody]', root);
  const show = (k) => {
    tb.innerHTML = tabs[k]();
    $$('[data-tab]', root).forEach((b) => b.classList.toggle('on', b.dataset.tab === k));
    $$('tr[data-row]', tb).forEach((tr) => (tr.onclick = () => { const i = Number(tr.dataset.row); if (k === 'q') location.hash = `#/quotes/${tl.quotes[i].id}`; if (k === 'i') location.hash = `#/installations/${tl.installations[i].id}`; if (k === 't') location.hash = `#/support/${tl.tickets[i].id}`; }));
    $$('[data-done]', tb).forEach((b) => (b.onclick = async () => { const outcome = prompt('Outcome (optional)') || ''; await api(`/api/admin/followups/${b.dataset.done}`, { method: 'PUT', body: { status: 'done', outcome } }); toast('Marked done'); detail(ctx, id); }));
  };
  $$('[data-tab]', root).forEach((b) => (b.onclick = () => show(b.dataset.tab)));
  show('tl');
  $('#stage-sel').onchange = async (e) => { try { await api(`/api/admin/customers/${id}`, { method: 'PUT', body: { stage: e.target.value } }); toast('Stage updated'); detail(ctx, id); } catch (err) { fail(err); } };
  $('[data-act]', root).onsubmit = async (e) => {
    e.preventDefault(); const f = e.target; const fd = new FormData(f);
    try {
      await api(`/api/admin/customers/${id}/activities`, { body: { type: fd.get('type'), body: fd.get('body') } });
      if (fd.get('fu')) await api('/api/admin/followups', { body: { customer_id: Number(id), type: fd.get('type') === 'whatsapp' ? 'whatsapp' : 'call', title: `Follow up with ${c.name}`, notes: fd.get('body'), due_at: new Date(Date.now() + Number(fd.get('days')) * 864e5).toISOString().replace('T', ' ').slice(0, 19), assigned_to: ctx.user.id } });
      toast('Saved'); detail(ctx, id);
    } catch (err) { fail(err); }
  };
  $('[data-fu]', root)?.addEventListener('click', () => followupModal({ customer_id: Number(id), title: `Follow up with ${c.name}` }, () => detail(ctx, id)));
  $('[data-inst]', root)?.addEventListener('click', async () => {
    const r = await api('/api/admin/installations', { body: { customer_id: Number(id), title: `Installation — ${c.name}`, address: [c.address, c.city].filter(Boolean).join(', '), lat: c.lat, lng: c.lng } });
    location.hash = `#/installations/${r.item.id}`;
  });
  $$('[data-ai]', root).forEach((b) => (b.onclick = async () => {
    b.classList.add('loading');
    try {
      const r = await api('/api/admin/ai/assist', { body: { task: b.dataset.ai, customer_id: Number(id), prompt: b.dataset.ai === 'followup' ? 'Draft the follow-up now.' : 'Summarise this customer.' } });
      const { el } = modal({ title: b.dataset.ai === 'followup' ? 'Suggested follow-up' : 'AI customer summary', body: `<div class="ai-reply">${esc(r.reply)}</div>`,
        footer: `<button class="btn" data-copy><i class="ri-file-copy-line"></i> Copy</button>${wa ? `<a class="btn btn-primary" target="_blank" rel="noopener" data-wa><i class="ri-whatsapp-line"></i> Open WhatsApp</a>` : ''}` });
      $('[data-copy]', el).onclick = () => navigator.clipboard.writeText(r.reply).then(() => toast('Copied'));
      const w = $('[data-wa]', el); if (w) w.href = waLink(wa, r.reply.split(/\n\s*\n/)[0].replace(/^.*WhatsApp[^:]*:\s*/i, '').slice(0, 1000));
    } catch (err) { fail(err); } finally { b.classList.remove('loading'); }
  }));
}

export async function followupModal(preset = {}, onSaved) {
  const users = await staffOptions();
  const fields = [
    { name: 'title', label: 'What needs doing?', required: true, full: true },
    { name: 'type', label: 'Type', type: 'select', options: [['call', 'Call'], ['whatsapp', 'WhatsApp'], ['checkup', 'Customer check-up'], ['maintenance', 'Maintenance booking'], ['payment', 'Payment reminder'], ['quote', 'Chase quote'], ['other', 'Other']] },
    { name: 'due_at', label: 'Due', type: 'datetime', required: true },
    { name: 'assigned_to', label: 'Assign to', type: 'select', options: [['', 'Unassigned'], ...users.map((u) => [u.id, u.name])] },
    { name: 'notes', label: 'Notes', type: 'textarea', full: true },
  ];
  const vals = { due_at: new Date(Date.now() + 864e5).toISOString(), type: 'call', ...preset };
  const { el, close } = modal({ title: preset.id ? 'Edit follow-up' : 'Schedule follow-up', body: `<form data-f>${formHtml(fields, vals)}</form>`, footer: '<button class="btn btn-primary" data-save>Save</button>' });
  $('[data-save]', el).onclick = async () => {
    const f = $('[data-f]', el); if (!validate(f)) return;
    const body = { ...readForm(f, fields), customer_id: preset.customer_id ?? null };
    if (body.assigned_to === '') body.assigned_to = null;
    try { preset.id ? await api(`/api/admin/followups/${preset.id}`, { method: 'PUT', body }) : await api('/api/admin/followups', { body }); toast('Follow-up saved'); close(); onSaved?.(); } catch (err) { fail(err); }
  };
}
