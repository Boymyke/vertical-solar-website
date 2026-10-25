import { $, $$, api, esc, naira, date, toast, fail, table, statusPill, modal, confirmBox, debounce, copy, waLink } from '../lib.js';
import { customerForm } from './customers.js';

export default async function (ctx) {
  const { root, params, setTitle } = ctx;
  if (params[0]) return editor(ctx, params[0] === 'new' ? null : params[0]);
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const state = { q: '', status: qs.get('status') || '' };
  setTitle('Quotes', 'Solar quotation engine — build, send as a link, and track views and acceptance', '<a class="btn btn-primary" href="#/quotes/new"><i class="ri-file-add-line"></i> New quote</a>');
  root.innerHTML = `<div class="card"><div class="toolbar"><div class="search"><i class="ri-search-line"></i><input class="input" data-q placeholder="Search quote number, title, customer"></div>
    <div class="seg">${['', 'draft', 'sent', 'viewed', 'accepted', 'declined', 'expired'].map((s) => `<button data-s="${s}" class="${s === state.status ? 'on' : ''}">${s || 'All'}</button>`).join('')}</div></div><div data-body></div></div>`;
  async function load() {
    const p = new URLSearchParams({ per: 100 }); if (state.q) p.set('q', state.q); if (state.status) p.set('status', state.status);
    const r = await api('/api/admin/quotes?' + p);
    $('[data-body]', root).innerHTML = table({ rows: r.items, onRow: true, empty: 'No quotes yet. Create one from a customer or the button above.', columns: [
      { label: 'Quote', render: (q) => `<strong>${esc(q.number)}</strong><div class="muted small">${esc(q.title)}</div>` },
      { label: 'Customer', render: (q) => `${esc(q.customer_name || '—')}<div class="muted small">${esc(q.customer_phone || '')}</div>` },
      { label: 'Total', align: 'right', render: (q) => `<strong>${naira(q.total)}</strong>` },
      { label: 'Status', render: (q) => statusPill(q.status) },
      { label: 'Views', render: (q) => (q.view_count ? `<i class="ri-eye-line"></i> ${q.view_count}` : '—') },
      { label: 'Created', render: (q) => date(q.created_at) }, { label: 'Valid until', render: (q) => date(q.valid_until) }] });
    $$('tr[data-row]', root).forEach((tr) => (tr.onclick = () => (location.hash = `#/quotes/${r.items[tr.dataset.row].id}`)));
  }
  $('[data-q]', root).oninput = debounce((e) => { state.q = e.target.value; load(); });
  $$('[data-s]', root).forEach((b) => (b.onclick = () => { state.status = b.dataset.s; $$('[data-s]', root).forEach((x) => x.classList.toggle('on', x === b)); load(); }));
  load();
}

async function editor(ctx, id) {
  const { root, setTitle } = ctx;
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const [quote, pk, prods] = await Promise.all([
    id ? api(`/api/admin/quotes/${id}`) : Promise.resolve({ title: '', items: [], system: {}, discount: 0, vat_rate: 7.5, status: 'draft', customer_id: Number(qs.get('customer')) || null }),
    api('/api/admin/packages?per=50').catch(() => ({ items: [] })),
    api('/api/admin/products?per=500&active=1').catch(() => ({ items: [] })),
  ]);
  let customer = null;
  if (quote.customer_id) customer = await api(`/api/admin/customers/${quote.customer_id}`).catch(() => null);
  const q = { ...quote, items: quote.items?.length ? quote.items : [], system: quote.system || {} };
  setTitle(id ? `Quote ${quote.number}` : 'New quote', id ? `${quote.status} · created ${date(quote.created_at)}${quote.view_count ? ` · viewed ${quote.view_count}×` : ''}` : 'Build a quotation for a customer',
    id ? `<button class="btn" data-dup><i class="ri-file-copy-2-line"></i> Duplicate</button><button class="btn" data-preview><i class="ri-eye-line"></i> Preview / PDF</button><button class="btn btn-accent" data-send><i class="ri-send-plane-line"></i> Send</button>` : '');
  root.innerHTML = `
  <div class="grid g-21">
    <div class="stack">
      <div class="card"><div class="card-h"><h2>Customer &amp; project</h2></div><div class="card-b form-grid">
        <div class="field full"><label>Customer</label><div class="row"><div class="search grow" style="max-width:none"><i class="ri-user-search-line"></i><input class="input" data-cust-q placeholder="Search customers…" value="${esc(customer?.name || '')}" autocomplete="off"></div><button class="btn" data-newcust type="button"><i class="ri-user-add-line"></i> New</button></div>
          <div class="list card" data-cust-results hidden style="margin-top:6px;max-height:220px;overflow:auto"></div><span class="hint" data-cust-info>${customer ? `${esc(customer.phone || '')} ${esc(customer.email || '')} · ${esc(customer.city || '')}` : 'Pick who this quote is for.'}</span></div>
        <div class="field full"><label for="q-title">Project title</label><input class="input" id="q-title" value="${esc(q.title)}" placeholder="e.g. 5kVA hybrid system with 10kWh lithium — Lekki residence" required></div>
        <div class="field"><label for="q-valid">Valid until</label><input class="input" type="date" id="q-valid" value="${esc(String(q.valid_until || new Date(Date.now() + 14 * 864e5).toISOString()).slice(0, 10))}"></div>
        <div class="field"><label for="q-status">Status</label><select class="input" id="q-status">${['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired'].map((s) => `<option ${s === q.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      </div></div>
      <div class="card"><div class="card-h"><h2>System design</h2><select class="input" data-pkg style="width:auto;margin-left:auto"><option value="">Start from a package…</option>${pk.items.map((p) => `<option value="${p.id}">${esc(p.name)} — ${p.inverter_kva}kVA</option>`).join('')}</select>
        <select class="input" data-pkgbat style="width:auto"><option value="lead">Lead-acid price</option><option value="lithium">Lithium price</option></select></div>
        <div class="card-b"><div class="form-grid" style="grid-template-columns:repeat(3,1fr)">
          ${[['inverter_kva', 'Inverter (kVA)'], ['pv_kwp', 'Solar array (kWp)'], ['battery_kwh', 'Battery (kWh)'], ['daily_kwh', 'Daily energy (kWh)'], ['backup_hours', 'Backup (hours)']].map(([k, l]) => `<div class="field"><label>${l}</label><input class="input" type="number" step="any" data-sys="${k}" value="${esc(q.system[k] ?? '')}"></div>`).join('')}
          <div class="field"><label>Battery type</label><select class="input" data-sys="battery_type">${['', 'Lithium (LiFePO4)', 'Lead-acid / tubular'].map((b) => `<option ${b === q.system.battery_type ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
        </div></div></div>
      <div class="card"><div class="card-h"><h2>Line items</h2><div class="row" style="margin-left:auto"><select class="input" data-addprod style="width:auto;max-width:260px"><option value="">Add from inventory…</option>${prods.items.map((p) => `<option value="${p.id}">${esc(p.name)}${p.price ? ' — ' + naira(p.price) : ''}</option>`).join('')}</select><button class="btn" data-addline><i class="ri-add-line"></i> Line</button></div></div>
        <div class="table-wrap"><table class="t"><thead><tr><th style="width:40%">Description</th><th>Qty</th><th>Unit</th><th>Unit price (₦)</th><th style="text-align:right">Amount</th><th></th></tr></thead><tbody data-items></tbody></table></div>
        <div class="card-b" style="border-top:1px solid var(--line)"><div class="row" style="justify-content:flex-end;gap:16px">
          <div class="field" style="width:160px"><label>Discount (₦)</label><input class="input" type="number" data-discount value="${q.discount || 0}"></div>
          <div class="field" style="width:120px"><label>VAT %</label><input class="input" type="number" step="0.1" data-vat value="${q.vat_rate ?? 7.5}"></div>
          <div style="min-width:240px" data-totals></div></div></div></div>
      <div class="card"><div class="card-h"><h2>Notes &amp; terms</h2></div><div class="card-b form-grid">
        <div class="field full"><label for="q-notes">Notes to customer</label><textarea class="input" id="q-notes" rows="3" placeholder="Scope, exclusions, timeline…">${esc(q.notes || '')}</textarea></div>
        <div class="field full"><label for="q-terms">Terms</label><textarea class="input" id="q-terms" rows="3" placeholder="Leave blank to use the standard terms">${esc(q.terms || '')}</textarea></div></div></div>
    </div>
    <div class="stack">
      <div class="card" style="position:sticky;top:80px"><div class="card-h"><h2>Summary</h2></div><div class="card-b stack" data-summary></div>
        <div class="card-b stack" style="border-top:1px solid var(--line);gap:8px"><button class="btn btn-primary btn-lg" data-save><i class="ri-save-line"></i> Save quote</button>
        ${id ? `<button class="btn" data-convert><i class="ri-tools-line"></i> Convert to installation</button><button class="btn btn-danger" data-del><i class="ri-delete-bin-line"></i> Delete</button>` : ''}
        ${id && quote.status === 'accepted' ? `<div class="alert ok"><i class="ri-checkbox-circle-line"></i><span>Accepted by ${esc(quote.accepted_name || 'customer')} on ${date(quote.responded_at)}${quote.response_note ? `<br>“${esc(quote.response_note)}”` : ''}</span></div>` : ''}
        ${id && quote.status === 'declined' ? `<div class="alert err"><i class="ri-close-circle-line"></i><span>Declined${quote.response_note ? `: “${esc(quote.response_note)}”` : ''}</span></div>` : ''}</div></div>
    </div>
  </div>`;
  let custId = q.customer_id;
  const itemsEl = $('[data-items]', root);
  const renderItems = () => {
    itemsEl.innerHTML = q.items.map((it, i) => `<tr><td><input class="input" data-it="description" data-i="${i}" value="${esc(it.description)}" placeholder="Item"><input class="input small" style="margin-top:4px;min-height:30px" data-it="detail" data-i="${i}" value="${esc(it.detail || '')}" placeholder="Detail (optional)"></td>
      <td><input class="input" type="number" min="0" step="any" style="width:80px" data-it="qty" data-i="${i}" value="${it.qty}"></td><td><input class="input" style="width:70px" data-it="unit" data-i="${i}" value="${esc(it.unit || 'pcs')}"></td>
      <td><input class="input" type="number" min="0" style="width:140px" data-it="unit_price" data-i="${i}" value="${it.unit_price}"></td><td style="text-align:right" class="num"><strong>${naira(it.qty * it.unit_price)}</strong></td>
      <td><button class="icon-btn" data-rm="${i}" aria-label="Remove line"><i class="ri-delete-bin-line"></i></button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Add items from a package, inventory or a blank line.</td></tr>';
    totals();
  };
  const totals = () => {
    const sub = q.items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unit_price || 0), 0);
    const disc = Math.min(sub, Number($('[data-discount]', root).value || 0));
    const vr = Number($('[data-vat]', root).value || 0);
    const vat = (sub - disc) * vr / 100;
    $('[data-totals]', root).innerHTML = `<div class="row between"><span class="muted">Subtotal</span><strong>${naira(sub)}</strong></div>${disc ? `<div class="row between"><span class="muted">Discount</span><span>− ${naira(disc)}</span></div>` : ''}<div class="row between"><span class="muted">VAT ${vr}%</span><span>${naira(vat)}</span></div><div class="row between" style="font-size:18px;border-top:1px solid var(--line);margin-top:6px;padding-top:6px"><strong>Total</strong><strong>${naira(sub - disc + vat)}</strong></div>`;
    $('[data-summary]', root).innerHTML = `<div class="muted small">Customer</div><strong>${esc($('[data-cust-q]', root).value || '—')}</strong><div class="muted small">Total</div><strong style="font-size:24px;color:var(--heading)">${naira(sub - disc + vat)}</strong><div class="muted small">${q.items.length} line item${q.items.length === 1 ? '' : 's'}</div>`;
  };
  itemsEl.addEventListener('input', (e) => { const el = e.target; if (el.dataset.it == null) return; const it = q.items[el.dataset.i]; it[el.dataset.it] = ['qty', 'unit_price'].includes(el.dataset.it) ? Number(el.value) : el.value; if (['qty', 'unit_price'].includes(el.dataset.it)) { el.closest('tr').querySelector('strong').textContent = naira(it.qty * it.unit_price); totals(); } });
  itemsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { q.items.splice(Number(b.dataset.rm), 1); renderItems(); } });
  $('[data-addline]', root).onclick = () => { q.items.push({ description: '', qty: 1, unit: 'pcs', unit_price: 0 }); renderItems(); };
  $('[data-addprod]', root).onchange = (e) => { const p = prods.items.find((x) => x.id === Number(e.target.value)); if (p) { q.items.push({ product_id: p.id, description: p.name, detail: p.brand || '', qty: 1, unit: p.unit || 'pcs', unit_price: p.price || 0 }); renderItems(); } e.target.value = ''; };
  $('[data-pkg]', root).onchange = (e) => {
    const p = pk.items.find((x) => x.id === Number(e.target.value)); if (!p) return;
    const lith = $('[data-pkgbat]', root).value === 'lithium' && p.price_lithium;
    const sys = { inverter_kva: p.inverter_kva, pv_kwp: Math.round(p.pv_wp / 10) / 100, battery_kwh: p.battery_kwh, battery_type: lith ? 'Lithium (LiFePO4)' : 'Lead-acid / tubular' };
    Object.entries(sys).forEach(([k, v]) => { const el = $(`[data-sys="${k}"]`, root); if (el) el.value = v; });
    q.items.push({ description: `${p.name} solar package — ${p.inverter_kva}kVA complete system`, detail: `${p.pv_wp}Wp panels, ${p.battery_kwh}kWh ${lith ? 'lithium' : 'lead-acid'} storage, protection, mounting, installation & commissioning. Runs: ${p.loads}`, qty: 1, unit: 'set', unit_price: lith ? p.price_lithium : p.price_lead_acid });
    if (!$('#q-title', root).value) $('#q-title', root).value = `${p.name} ${p.inverter_kva}kVA solar system${customer ? ' — ' + customer.name : ''}`;
    renderItems(); e.target.value = '';
  };
  $('[data-discount]', root).oninput = totals; $('[data-vat]', root).oninput = totals;
  // customer search
  const cq = $('[data-cust-q]', root), cr = $('[data-cust-results]', root);
  cq.oninput = debounce(async () => {
    if (cq.value.length < 2) { cr.hidden = true; return; }
    const r = await api(`/api/admin/customers?q=${encodeURIComponent(cq.value)}&per=8`);
    cr.hidden = false;
    cr.innerHTML = r.items.map((c) => `<button type="button" class="li" style="border:0;background:none;width:100%;text-align:left;cursor:pointer" data-cid="${c.id}"><div class="body"><strong>${esc(c.name)}</strong><div class="meta">${esc(c.phone || '')} ${esc(c.city || '')}</div></div></button>`).join('') || '<div class="empty small">No match — use New.</div>';
    cr.onclick = (e) => { const b = e.target.closest('[data-cid]'); if (!b) return; const c = r.items.find((x) => x.id === Number(b.dataset.cid)); custId = c.id; cq.value = c.name; $('[data-cust-info]', root).textContent = `${c.phone || ''} ${c.email || ''} · ${c.city || ''}`; cr.hidden = true; totals(); };
  }, 250);
  $('[data-newcust]', root).onclick = () => customerForm(null, (c) => { custId = c.id; cq.value = c.name; totals(); });
  renderItems();

  const collect = () => ({
    customer_id: custId, title: $('#q-title', root).value.trim(), status: $('#q-status', root).value, valid_until: $('#q-valid', root).value,
    items: q.items, discount: Number($('[data-discount]', root).value || 0), vat_rate: Number($('[data-vat]', root).value || 0),
    notes: $('#q-notes', root).value, terms: $('#q-terms', root).value || undefined,
    system: Object.fromEntries($$('[data-sys]', root).map((el) => [el.dataset.sys, el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value])),
  });
  const save = async () => {
    const body = collect();
    if (!body.title) { $('#q-title', root).reportValidity(); throw new Error('Add a project title'); }
    if (!body.customer_id) throw new Error('Choose a customer');
    const r = id ? await api(`/api/admin/quotes/${id}`, { method: 'PUT', body }) : await api('/api/admin/quotes', { body });
    return r.item;
  };
  $('[data-save]', root).onclick = async (e) => { e.currentTarget.classList.add('loading'); try { const it = await save(); toast('Quote saved'); location.hash = `#/quotes/${it.id}`; if (id) editor(ctx, id); } catch (err) { fail(err); } finally { e.currentTarget?.classList.remove('loading'); } };
  if (!id) return;
  const link = `${location.origin}/q/${quote.token}`;
  $('[data-preview]').onclick = () => window.open(`/q/${quote.token}?preview=1`, '_blank', 'noopener');
  $('[data-dup]').onclick = async () => { const r = await api(`/api/admin/quotes/${id}/duplicate`, { method: 'POST' }); location.hash = `#/quotes/${r.id}`; };
  $('[data-del]', root).onclick = async () => { if (await confirmBox('Delete this quote permanently?', { danger: true, ok: 'Delete' })) { await api(`/api/admin/quotes/${id}`, { method: 'DELETE' }); location.hash = '#/quotes'; } };
  $('[data-convert]', root).onclick = async () => { const r = await api(`/api/admin/quotes/${id}/convert`, { method: 'POST' }); toast('Installation created'); location.hash = `#/installations/${r.id}`; };
  $('[data-send]').onclick = async () => {
    try { await save(); await api(`/api/admin/quotes/${id}/send`, { method: 'POST' }); } catch (err) { return fail(err); }
    const cust = await api(`/api/admin/customers/${custId}`).catch(() => ({}));
    const first = (cust.name || '').split(' ')[0];
    const msg = `Hello ${first}, thank you for choosing Vertical Solar. Here is your quotation ${quote.number} for "${$('#q-title', root).value}". You can view, download as PDF and accept it here: ${link}`;
    const es = await api('/api/admin/email/status').catch(() => ({ configured: false }));
    const { el } = modal({ title: 'Send quote', body: `<div class="stack"><p class="muted" style="margin:0">The quote is marked as sent and a follow-up to chase it has been scheduled in 3 days.</p>
      <div class="field"><label>Shareable link</label><div class="row"><input class="input grow" value="${esc(link)}" readonly><button class="btn" data-cp><i class="ri-file-copy-line"></i> Copy</button></div></div>
      <div class="field"><label>Message</label><textarea class="input" rows="4" data-msg>${esc(msg)}</textarea></div>
      <div class="row">${cust.whatsapp || cust.phone ? `<a class="btn btn-accent" data-wa target="_blank" rel="noopener"><i class="ri-whatsapp-line"></i> Send on WhatsApp</a>` : ''}
        ${cust.email ? (es.configured ? '<button class="btn btn-primary" data-mail><i class="ri-mail-send-line"></i> Email from CRM</button>' : `<a class="btn" data-gmail target="_blank" rel="noopener"><i class="ri-google-fill"></i> Gmail</a><a class="btn" data-mailto><i class="ri-mail-line"></i> Email app</a>`) : '<span class="muted small">Add an email to the customer to send by email.</span>'}
        <button class="btn" data-pdf><i class="ri-file-pdf-2-line"></i> Open PDF view</button></div></div>` });
    const m = () => $('[data-msg]', el).value;
    $('[data-cp]', el).onclick = () => copy(link);
    const wa = $('[data-wa]', el); if (wa) wa.onclick = () => (wa.href = waLink(cust.whatsapp || cust.phone, m()));
    const gm = $('[data-gmail]', el); if (gm) gm.onclick = () => (gm.href = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(cust.email)}&su=${encodeURIComponent('Your Vertical Solar quotation ' + quote.number)}&body=${encodeURIComponent(m())}`);
    const mt = $('[data-mailto]', el); if (mt) mt.onclick = () => (location.href = `mailto:${cust.email}?subject=${encodeURIComponent('Your Vertical Solar quotation ' + quote.number)}&body=${encodeURIComponent(m())}`);
    const ml = $('[data-mail]', el); if (ml) ml.onclick = async () => { ml.classList.add('loading'); try { await api('/api/admin/email/send', { body: { to: cust.email, subject: `Your Vertical Solar quotation ${quote.number}`, body: m(), customer_id: custId } }); toast('Email sent'); } catch (err) { fail(err); } finally { ml.classList.remove('loading'); } };
    $('[data-pdf]', el).onclick = () => window.open(`/q/${quote.token}?preview=1`, '_blank', 'noopener');
  };
}
