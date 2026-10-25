import { $, $$, api, esc, naira, num, datetime, toast, fail, table, modal, statusPill } from '../lib.js';
import { resourceList, editForm } from '../resource.js';

export const CATEGORIES = [['kits', 'Solar kits'], ['panels', 'Solar panels'], ['inverters', 'Inverters'], ['batteries', 'Batteries'], ['charge-controllers', 'Charge controllers'], ['accessories', 'Accessories'], ['services', 'Services']];
export const PRODUCT_FIELDS = [
  { name: 'name', label: 'Product name', required: true, full: true }, { name: 'sku', label: 'SKU / code' }, { name: 'brand', label: 'Brand' },
  { name: 'category', label: 'Category', type: 'select', options: CATEGORIES }, { name: 'unit', label: 'Unit', placeholder: 'pcs, set, m' },
  { name: 'price', label: 'Selling price (₦)', type: 'number', required: true }, { name: 'compare_price', label: 'Was price (₦)', type: 'number', hint: 'Optional — shows a crossed-out price in the shop' },
  { name: 'cost', label: 'Cost price (₦)', type: 'number' }, { name: 'stock', label: 'Opening stock', type: 'number', hint: 'Only on creation — use “Adjust stock” afterwards' },
  { name: 'reorder_level', label: 'Reorder level', type: 'number', hint: 'You get a low-stock alert at or below this' }, { name: 'location', label: 'Store / warehouse location' },
  { name: 'warranty_months', label: 'Warranty (months)', type: 'number' }, { name: 'slug', label: 'Web address (slug)', hint: 'Auto-generated if blank' },
  { name: 'description', label: 'Description (shown in shop)', type: 'textarea', full: true, rows: 4 },
  { name: 'specs', label: 'Specifications (JSON: {"Capacity":"5kWh"})', type: 'json', full: true, rows: 4 },
  { name: 'images', label: 'Product photos', type: 'images', full: true, folder: 'products' },
  { name: 'in_shop', label: 'Show in online shop', type: 'switch' }, { name: 'featured', label: 'Featured', type: 'switch' }, { name: 'active', label: 'Active', type: 'switch', default: 1 },
];

function stockModal(p, reload) {
  const { el, close } = modal({ title: `Adjust stock — ${p.name}`, size: 'narrow', body: `<div class="stack"><div class="muted">Current stock: <strong>${p.stock} ${esc(p.unit || '')}</strong></div>
    <div class="field"><label>Reason</label><select class="input" data-reason><option value="purchase">Received / purchased (+)</option><option value="return">Customer return (+)</option><option value="installation">Used on installation (−)</option><option value="sale">Sold (−)</option><option value="damaged">Damaged / lost (−)</option><option value="adjustment">Stock count correction (±)</option></select></div>
    <div class="field"><label>Quantity</label><input class="input" type="number" data-qty value="1"><span class="hint">For corrections, enter a negative number to reduce.</span></div>
    <div class="field"><label>Reference</label><input class="input" data-ref placeholder="Invoice no., job, quote…"></div><div class="field"><label>Note</label><input class="input" data-note></div></div>`, footer: '<button class="btn btn-primary" data-ok>Save movement</button>' });
  $('[data-ok]', el).onclick = async () => { try { const r = await api(`/api/admin/products/${p.id}/stock`, { body: { reason: $('[data-reason]', el).value, qty: Number($('[data-qty]', el).value), ref: $('[data-ref]', el).value, note: $('[data-note]', el).value } }); toast(`Stock now ${r.stock}`); close(); reload(); } catch (err) { fail(err); } };
}

export default async function ({ root, setTitle }) {
  setTitle('Inventory', 'Stock levels, movements and low-stock alerts — products here also power quotes and the online shop');
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  root.innerHTML = `<div class="grid g-4" data-sum style="margin-bottom:16px"></div><div class="tabs"><button class="on" data-t="p">Products</button><button data-t="m">Stock movements</button><button data-t="s">Suppliers</button></div><div data-tab></div>`;
  const s = await api('/api/admin/inventory-summary');
  $('[data-sum]', root).innerHTML = [['Products', num(s.items), 'ri-archive-line'], ['Units in stock', num(s.units), 'ri-stack-line'], ['Stock value (cost)', naira(s.cost_value), 'ri-money-dollar-box-line'], ['Low / out of stock', `${s.low || 0} / ${s.out_of_stock || 0}`, 'ri-alert-line']]
    .map(([l, v, i]) => `<div class="card card-b row"><span class="card-icon"><i class="${i}"></i></span><div><div class="muted small">${l}</div><strong style="font-size:20px">${v}</strong></div></div>`).join('');
  const tab = $('[data-tab]', root);
  const show = async (t) => {
    $$('[data-t]', root).forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    if (t === 'p') {
      const list = resourceList({ mount: tab, resource: 'products', title: 'product', fields: PRODUCT_FIELDS, query: { low: qs.get('low') || '' },
        filters: `<select class="input" data-filter="category" style="width:auto"><option value="">All categories</option>${CATEGORIES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select><select class="input" data-filter="low" style="width:auto"><option value="">All stock levels</option><option value="1" ${qs.get('low') ? 'selected' : ''}>Low stock only</option></select>`,
        columns: [
          { label: 'Product', render: (p) => `<div class="person">${p.images?.[0] ? `<img class="thumb" src="${esc(p.images[0])}" alt="">` : '<span class="thumb" style="display:grid;place-items:center"><i class="ri-archive-line"></i></span>'}<div><strong>${esc(p.name)}</strong><span>${esc(p.sku || '')} ${esc(p.brand || '')}</span></div></div>` },
          { label: 'Category', render: (p) => `<span class="pill">${esc(p.category)}</span>` },
          { label: 'Price', align: 'right', render: (p) => (p.price ? naira(p.price) : '<span class="pill warn">Set price</span>') },
          { label: 'Stock', align: 'right', render: (p) => `<strong style="color:${p.stock <= 0 ? 'var(--bad)' : p.stock <= p.reorder_level ? 'var(--warn)' : 'inherit'}">${p.stock}</strong> <span class="muted small">${esc(p.unit || '')}</span>` },
          { label: 'Shop', render: (p) => (p.in_shop ? '<span class="pill ok">Listed</span>' : '<span class="pill">Hidden</span>') },
          { label: '', render: (p) => `<button class="btn btn-sm" data-adj="${p.id}"><i class="ri-arrow-up-down-line"></i> Adjust stock</button>` }],
        prepare: (b, item) => { if (item) delete b.stock; return b; } });
      tab.onclick = async (e) => { const b = e.target.closest('[data-adj]'); if (!b) return; const p = await api(`/api/admin/products/${b.dataset.adj}`); stockModal(p, list.reload); };
    }
    if (t === 'm') {
      const r = await api('/api/admin/stock-moves');
      tab.innerHTML = `<div class="card">${table({ rows: r.items, empty: 'No stock movements yet.', columns: [{ label: 'When', render: (m) => datetime(m.created_at) }, { label: 'Product', render: (m) => esc(m.product_name) },
        { label: 'Qty', align: 'right', render: (m) => `<strong style="color:${m.qty < 0 ? 'var(--bad)' : 'var(--ok)'}">${m.qty > 0 ? '+' : ''}${m.qty}</strong>` }, { label: 'Reason', render: (m) => statusPill(m.reason) }, { label: 'Reference', render: (m) => esc(m.ref || '') }, { label: 'Note', render: (m) => esc(m.note || '') }, { label: 'By', render: (m) => esc(m.user_name || '') }] })}</div>`;
    }
    if (t === 's') resourceList({ mount: tab, resource: 'suppliers', title: 'supplier', fields: [{ name: 'name', label: 'Supplier name', required: true }, { name: 'contact', label: 'Contact person' }, { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'notes', label: 'Notes', type: 'textarea', full: true }],
      columns: [{ label: 'Supplier', render: (s2) => `<strong>${esc(s2.name)}</strong>` }, { label: 'Contact', render: (s2) => esc(s2.contact || '') }, { label: 'Phone', render: (s2) => esc(s2.phone || '') }, { label: 'Email', render: (s2) => esc(s2.email || '') }] });
  };
  $$('[data-t]', root).forEach((b) => (b.onclick = () => show(b.dataset.t)));
  show('p');
}
