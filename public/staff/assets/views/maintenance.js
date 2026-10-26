import { $, $$, api, esc, date, statusPill } from '../lib.js';
import { resourceList } from '../resource.js';
import { staffOptions } from './customers.js';

export default async function ({ root, name, setTitle }) {
  setTitle('Maintenance & warranties', 'Scheduled service visits and warranty coverage for every installed system');
  const users = await staffOptions();
  const inst = await api('/api/admin/installations?per=500').catch(() => ({ items: [] }));
  const custs = await api('/api/admin/customers?per=500&status=customer').catch(() => ({ items: [] }));
  root.innerHTML = `<div class="tabs"><button data-t="v" class="${name !== 'warranties' ? 'on' : ''}">Maintenance visits</button><button data-t="w" class="${name === 'warranties' ? 'on' : ''}">Warranties</button></div><div data-tab></div>`;
  const tab = $('[data-tab]', root);
  const show = (t) => {
    $$('[data-t]', root).forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    if (t === 'v') resourceList({ mount: tab, resource: 'maintenance', title: 'maintenance visit', query: { status: 'scheduled' },
      filters: '<select class="input" data-filter="status" style="width:auto"><option value="scheduled">Scheduled</option><option value="done">Done</option><option value="cancelled">Cancelled</option><option value="">All</option></select>',
      fields: [{ name: 'installation_id', label: 'Installation', type: 'select', options: [['', '—'], ...inst.items.map((i) => [i.id, `${i.title}${i.customer_name ? ' — ' + i.customer_name : ''}`])], full: true },
        { name: 'scheduled_at', label: 'Scheduled for', type: 'datetime', required: true }, { name: 'type', label: 'Type', type: 'select', options: [['routine', 'Routine service'], ['cleaning', 'Panel cleaning'], ['inspection', 'Inspection'], ['repair', 'Repair']] },
        { name: 'technician_id', label: 'Technician', type: 'select', options: [['', 'Unassigned'], ...users.map((u) => [u.id, u.name])] }, { name: 'status', label: 'Status', type: 'select', options: [['scheduled', 'Scheduled'], ['done', 'Done'], ['cancelled', 'Cancelled']] },
        { name: 'cost', label: 'Charge (₦)', type: 'number' }, { name: 'findings', label: 'Findings / work done', type: 'textarea', full: true, hint: 'Marking a visit done schedules the next one automatically.' }],
      prepare: (b) => { for (const k of ['installation_id', 'technician_id']) if (b[k] === '') b[k] = null; return b; },
      columns: [{ label: 'Due', render: (m) => `<strong>${date(m.scheduled_at)}</strong>` }, { label: 'Customer', render: (m) => `${esc(m.customer_name || '—')}<div class="muted small">${esc(m.customer_phone || '')}</div>` },
        { label: 'Installation', render: (m) => esc(m.installation_title || '—') }, { label: 'Type', render: (m) => `<span class="pill">${esc(m.type)}</span>` }, { label: 'Technician', render: (m) => esc(m.technician_name || '—') }, { label: 'Status', render: (m) => statusPill(m.status) }] });
    if (t === 'w') resourceList({ mount: tab, resource: 'warranties', title: 'warranty', query: { expiring: '' },
      filters: '<select class="input" data-filter="expiring" style="width:auto"><option value="">All warranties</option><option value="1">Expiring in 60 days</option></select>',
      fields: [{ name: 'customer_id', label: 'Customer', type: 'select', required: true, options: [['', 'Choose…'], ...custs.items.map((c) => [c.id, c.name])] }, { name: 'installation_id', label: 'Installation', type: 'select', options: [['', '—'], ...inst.items.map((i) => [i.id, i.title])] },
        { name: 'item', label: 'Item covered', required: true, full: true, placeholder: 'e.g. 5kVA hybrid inverter' }, { name: 'serial', label: 'Serial number' }, { name: 'provider', label: 'Warranty provider', placeholder: 'Manufacturer or Vertical Solar' },
        { name: 'start_date', label: 'Start date', type: 'date', required: true }, { name: 'end_date', label: 'End date', type: 'date', required: true }, { name: 'notes', label: 'Notes', type: 'textarea', full: true }],
      prepare: (b) => { if (b.installation_id === '') b.installation_id = null; return b; },
      columns: [{ label: 'Item', render: (w) => `<strong>${esc(w.item)}</strong><div class="muted small">${esc(w.serial || '')}</div>` }, { label: 'Customer', render: (w) => esc(w.customer_name || '—') }, { label: 'Provider', render: (w) => esc(w.provider || '') },
        { label: 'Ends', render: (w) => date(w.end_date) }, { label: 'Status', render: (w) => (w.days_left < 0 ? '<span class="pill bad">Expired</span>' : w.days_left <= 60 ? `<span class="pill warn">${w.days_left} days left</span>` : '<span class="pill ok">Active</span>') }] });
  };
  $$('[data-t]', root).forEach((b) => (b.onclick = () => show(b.dataset.t)));
  show(name === 'warranties' ? 'w' : 'v');
}
