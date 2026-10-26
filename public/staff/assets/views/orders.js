import { $, $$, api, esc, naira, datetime, toast, fail, table, statusPill, modal, waLink, copy, confirmBox } from '../lib.js';

export default async function ({ root, setTitle, can }) {
  setTitle('Shop & orders', 'Turn the online shop on or off, and process orders', can('inventory') ? '<a class="btn" href="#/inventory"><i class="ri-archive-line"></i> Manage products</a>' : '');
  const s = (await api('/api/admin/settings')).settings;
  root.innerHTML = `
  <div class="card card-b row" style="margin-bottom:16px"><label class="switch"><input type="checkbox" data-shop ${s.shop.enabled ? 'checked' : ''}><span class="track"></span><span><strong>Online shop is <span data-shop-state>${s.shop.enabled ? 'ON' : 'OFF'}</span></strong></span></label>
    <span class="muted small grow">When off, the Shop link and cart disappear from the website — but you can still share the shop privately with the link below.</span><a class="btn btn-sm" href="#/settings?tab=shop"><i class="ri-bank-card-line"></i> Payment &amp; delivery settings</a></div>
  <div class="card card-b" style="margin-bottom:16px" data-share></div>
  <div class="card"><div class="toolbar"><div class="seg">${['', 'pending', 'paid', 'processing', 'delivered', 'cancelled'].map((x) => `<button data-s="${x}" class="${x ? '' : 'on'}">${x ? x[0].toUpperCase() + x.slice(1) : 'All'}</button>`).join('')}</div></div><div data-body></div></div>`;
  $('[data-shop]', root).onchange = async (e) => {
    try { await api('/api/admin/settings/shop', { method: 'PUT', body: { value: { ...s.shop, enabled: e.target.checked } } }); s.shop.enabled = e.target.checked; $('[data-shop-state]', root).textContent = e.target.checked ? 'ON' : 'OFF'; toast(`Shop ${e.target.checked ? 'opened' : 'closed'} on the website`); share(); }
    catch (err) { fail(err); e.target.checked = !e.target.checked; }
  };
  // Shop link: public when the shop is on; a private link (with a key) when it is off.
  let key = '';
  const share = async () => {
    const box = $('[data-share]', root);
    if (!key) { try { key = (await api('/api/admin/shop-link')).key; } catch { key = ''; } }
    const pub = `${location.origin}/shop`, priv = `${location.origin}/shop?key=${key}`;
    const link = s.shop.enabled ? pub : priv;
    const msg = `Hello! Here is the Vertical Solar online shop — panels, inverters, batteries and accessories you can order directly:\n${link}`;
    box.innerHTML = `<div class="row between" style="flex-wrap:wrap;gap:10px"><div><strong>${s.shop.enabled ? 'Shop link' : 'Private shop link'}</strong><div class="muted small">${s.shop.enabled ? 'The shop is public. Anyone can open it from the website menu.' : 'The shop is hidden from the website. Only people you send this link to can see it and order.'}</div></div>
      <div class="row" style="flex-wrap:wrap"><a class="btn btn-sm" href="${esc(link)}" target="_blank" rel="noopener"><i class="ri-external-link-line"></i> Open</a><a class="btn btn-sm btn-wa" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener"><i class="ri-whatsapp-line"></i> Share on WhatsApp</a>${s.shop.enabled ? '' : '<button class="btn btn-sm" type="button" data-reset title="Old private links stop working"><i class="ri-refresh-line"></i> New link</button>'}</div></div>
      <div class="row" style="margin-top:10px"><input class="input grow" readonly value="${esc(link)}" aria-label="Shop link"><button class="btn" type="button" data-cp title="Copy link" aria-label="Copy link"><i class="ri-file-copy-line"></i></button></div>`;
    $('[data-cp]', box).onclick = () => copy(link);
    $('[data-reset]', box)?.addEventListener('click', async () => {
      if (!(await confirmBox('Make a new private link? Anyone using the old link will no longer be able to open the shop.', { ok: 'Make new link' }))) return;
      try { key = (await api('/api/admin/shop-link/reset', { method: 'POST' })).key; toast('New private link ready'); share(); } catch (err) { fail(err); }
    });
  };
  share();
  let status = '';
  async function load() {
    const r = await api(`/api/admin/orders?per=200${status ? '&status=' + status : ''}`);
    $('[data-body]', root).innerHTML = table({ rows: r.items, onRow: true, empty: 'No orders yet.', columns: [
      { label: 'Order', render: (o) => `<strong>${esc(o.number)}</strong><div class="muted small">${datetime(o.created_at)}</div>` },
      { label: 'Customer', render: (o) => `${esc(o.name)}<div class="muted small">${esc(o.phone || '')} ${esc(o.city || '')}</div>` },
      { label: 'Items', render: (o) => `<span class="small">${o.items.map((i) => `${i.qty}× ${esc(i.name)}`).join('<br>')}</span>` },
      { label: 'Total', align: 'right', render: (o) => `<strong>${naira(o.total)}</strong>` }, { label: 'Payment', render: (o) => `<span class="small">${esc(o.payment_method)}</span>${o.paid_at ? '<br><span class="pill ok">paid</span>' : ''}` },
      { label: 'Status', render: (o) => statusPill(o.status) }] });
    $$('tr[data-row]', root).forEach((tr) => (tr.onclick = () => open(r.items[tr.dataset.row])));
  }
  function open(o) {
    const { el, close } = modal({ title: `Order ${o.number}`, size: 'wide', body: `<div class="grid g-2"><div class="stack" style="gap:6px"><strong>${esc(o.name)}</strong><span>${esc(o.phone || '')} ${o.email ? '· ' + esc(o.email) : ''}</span><span class="muted">${esc([o.address, o.city, o.state].filter(Boolean).join(', '))}</span>${o.notes ? `<div class="alert info">${esc(o.notes)}</div>` : ''}
      <div class="row"><a class="btn btn-sm" href="tel:${esc(o.phone)}"><i class="ri-phone-line"></i> Call</a><a class="btn btn-sm" target="_blank" rel="noopener" href="${waLink(o.phone, `Hello ${o.name.split(' ')[0]}, thank you for your Vertical Solar order ${o.number}.`)}"><i class="ri-whatsapp-line"></i> WhatsApp</a>${o.customer_id ? `<a class="btn btn-sm" href="#/customers/${o.customer_id}">Customer record</a>` : ''}</div></div>
      <div>${table({ rows: o.items, columns: [{ label: 'Item', render: (i) => `${esc(i.name)}${i.backorder ? ' <span class="pill warn">backorder</span>' : ''}` }, { label: 'Qty', key: 'qty' }, { label: 'Amount', align: 'right', render: (i) => naira(i.total) }] })}
      <div class="row between" style="padding:8px 14px"><span>Subtotal</span><strong>${naira(o.subtotal)}</strong></div></div></div>
      <div class="form-grid" style="margin-top:16px"><div class="field"><label>Status</label><select class="input" data-st>${['pending', 'paid', 'processing', 'delivered', 'cancelled'].map((x) => `<option value="${x}" ${x === o.status ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}</select><span class="hint">Marking paid/processing deducts the items from inventory.</span></div>
      <div class="field"><label>Delivery fee (₦)</label><input class="input" type="number" data-del value="${o.delivery || 0}"></div><div class="field"><label>Payment reference</label><input class="input" data-ref value="${esc(o.payment_ref || '')}"></div>
      <div class="field full"><label>Internal notes</label><textarea class="input" data-notes>${esc(o.admin_notes || '')}</textarea></div></div>`,
      footer: '<button class="btn btn-primary" data-save>Save</button>' });
    $('[data-save]', el).onclick = async () => { try { await api(`/api/admin/orders/${o.id}`, { method: 'PUT', body: { status: $('[data-st]', el).value, delivery: Number($('[data-del]', el).value || 0), payment_ref: $('[data-ref]', el).value, admin_notes: $('[data-notes]', el).value } }); toast('Order updated'); close(); load(); } catch (err) { fail(err); } };
  }
  $$('[data-s]', root).forEach((b) => (b.onclick = () => { status = b.dataset.s; $$('[data-s]', root).forEach((x) => x.classList.toggle('on', x === b)); load(); }));
  load();
}
