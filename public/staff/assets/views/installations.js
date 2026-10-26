import { $, $$, api, esc, naira, date, datetime, ago, time, toast, fail, table, statusPill, modal, formHtml, readForm, validate, confirmBox, leaflet, baseMap, debounce, bindWidgets } from '../lib.js';
import { staffOptions } from './customers.js';
import { scheduleModal, shiftRows, bindShiftActions, avatarOf } from './schedule.js';
import { emptyState } from '../lib.js';

const STATUS = [['scheduled', 'Scheduled'], ['in_progress', 'In progress'], ['on_hold', 'On hold'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];

export default async function (ctx) {
  const { root, params, setTitle } = ctx;
  if (params[0]) return detail(ctx, params[0]);
  setTitle('Installations', 'Job sites, crews, progress and geofences for staff clock-in', '<button class="btn btn-primary" data-new><i class="ri-add-line"></i> New installation</button>');
  $('[data-new]').onclick = async () => { const r = await api('/api/admin/installations', { body: { title: 'New installation', status: 'scheduled' } }); location.hash = `#/installations/${r.item.id}`; };
  root.innerHTML = `<div class="grid g-21"><div class="card"><div class="toolbar"><div class="search"><i class="ri-search-line"></i><input class="input" data-q placeholder="Search job, address, customer"></div>
    <select class="input" data-st style="width:auto"><option value="">All statuses</option>${STATUS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div><div data-body></div></div>
    <div class="card"><div class="card-h"><h2>Job map</h2></div><div class="card-b"><div class="map tall" data-map></div></div></div></div>`;
  const state = { q: '', status: '' };
  const L = await leaflet();
  const map = baseMap(L, $('[data-map]', root));
  const layer = L.layerGroup().addTo(map);
  async function load() {
    const p = new URLSearchParams({ per: 200 }); if (state.q) p.set('q', state.q); if (state.status) p.set('status', state.status);
    const r = await api('/api/admin/installations?' + p);
    $('[data-body]', root).innerHTML = table({ rows: r.items, onRow: true, empty: 'No installations yet.', columns: [
      { label: 'Job', render: (i) => `<strong>${esc(i.title)}</strong><div class="muted small">${esc(i.customer_name || '')} · ${esc(i.address || 'No address')}</div>` },
      { label: 'Status', render: (i) => statusPill(i.status) },
      { label: 'Progress', render: (i) => `<div class="bar" style="width:90px"><span style="width:${i.progress || 0}%"></span></div><span class="small muted">${i.progress || 0}%</span>` },
      { label: 'Crew', render: (i) => `${i.staff_count} <span class="muted small">assigned</span>${i.on_site ? ` · <span class="pill ok">${i.on_site} on site</span>` : ''}` },
      { label: 'Start', render: (i) => date(i.start_date) },
      { label: 'Geofence', render: (i) => (i.lat ? `<span class="pill ok"><i class="ri-map-pin-line"></i> ${i.radius_m}m</span>` : '<span class="pill warn">Not set</span>') }] });
    $$('tr[data-row]', root).forEach((tr) => (tr.onclick = () => (location.hash = `#/installations/${r.items[tr.dataset.row].id}`)));
    layer.clearLayers();
    const pts = r.items.filter((i) => i.lat);
    pts.forEach((i) => { L.circle([i.lat, i.lng], { radius: i.radius_m, color: i.status === 'in_progress' ? '#2F8A3C' : '#282358' }).addTo(layer); L.marker([i.lat, i.lng]).bindPopup(`<strong>${esc(i.title)}</strong><br>${esc(i.customer_name || '')}<br><a href="#/installations/${i.id}">Open</a>`).addTo(layer); });
    if (pts.length) map.fitBounds(pts.map((i) => [i.lat, i.lng]), { padding: [30, 30], maxZoom: 14 });
  }
  $('[data-q]', root).oninput = debounce((e) => { state.q = e.target.value; load(); });
  $('[data-st]', root).onchange = (e) => { state.status = e.target.value; load(); };
  load();
}

async function detail(ctx, id) {
  const { root, setTitle } = ctx;
  const d = await api(`/api/admin/installations/${id}/detail`);
  const i = d.installation;
  setTitle(i.title, `${i.customer_name || 'No customer'} · ${i.status.replace('_', ' ')}`, `<a class="btn" href="#/installations"><i class="ri-arrow-left-line"></i> All jobs</a>${i.customer_id ? `<a class="btn" href="#/customers/${i.customer_id}"><i class="ri-user-line"></i> Customer</a>` : ''}`);
  const users = await staffOptions();
  const fields = [
    { name: 'title', label: 'Job title', required: true, full: true },
    { name: 'status', label: 'Status', type: 'select', options: STATUS }, { name: 'progress', label: 'Progress %', type: 'number', min: 0 },
    { name: 'start_date', label: 'Start date', type: 'date' }, { name: 'end_date', label: 'Target finish', type: 'date' },
    { name: 'address', label: 'Site address', type: 'place', full: true, hint: 'Type the address and pick it from the list. The map pin and clock-in zone move there — drag the pin to fine-tune.' },
    { name: 'radius_m', label: 'Clock-in zone', type: 'select', options: [['75', 'Tight — 75 m (small compound)'], ['150', 'Normal — 150 m (most homes)'], ['300', 'Wide — 300 m (estate or plaza)'], ['600', 'Very wide — 600 m (factory or farm)'], ['1000', 'Huge — 1 km']], hint: 'Staff must be inside this circle to clock in.' },
    { name: 'warranty_months', label: 'Workmanship warranty (months)', type: 'number' }, { name: 'maintenance_interval_months', label: 'Maintenance every (months)', type: 'number' },
    { name: 'notes', label: 'Notes for the crew', type: 'textarea', full: true },
  ];
  root.innerHTML = `
  <div class="grid g-4" style="margin-bottom:16px">
    <div class="card kpi hl"><div class="label">Progress</div><div class="value">${i.progress || 0}%</div><div class="bar" style="background:rgba(255,255,255,.15)"><span style="width:${i.progress || 0}%;background:var(--lime)"></span></div></div>
    <div class="card kpi"><div class="label">Crew assigned</div><div class="value">${d.staff.length}</div></div>
    <div class="card kpi"><div class="label">On site now</div><div class="value">${d.attendance.filter((a) => a.status === 'open').length}</div></div>
    <div class="card kpi"><div class="label">Work reports</div><div class="value">${d.reports.length}</div></div>
  </div>
  <div class="grid g-2">
    <div class="stack">
      <div class="card"><div class="card-h"><h2>Job details</h2></div><div class="card-b"><form data-f>${formHtml(fields, i)}</form>
        <div class="row" style="margin-top:14px"><button class="btn btn-primary" data-save><i class="ri-save-line"></i> Save</button>${i.status !== 'completed' ? '<button class="btn btn-accent" data-complete><i class="ri-checkbox-circle-line"></i> Mark completed</button>' : ''}<button class="btn btn-danger" data-del style="margin-left:auto"><i class="ri-delete-bin-line"></i></button></div>
        <p class="hint small muted">Completing a job sets the next maintenance date, creates a 1-week check-in follow-up and a workmanship warranty automatically.</p></div></div>
      <div class="card"><div class="card-h"><h2>Crew</h2><button class="btn btn-sm" data-crew><i class="ri-user-add-line"></i> Assign staff</button></div>
        <div class="list">${d.staff.map((s) => `<div class="li">${avatarOf(s)}<div class="body"><strong>${esc(s.name)}</strong><div class="meta">${esc(s.job_title || '')} ${s.phone ? '· ' + esc(s.phone) : ''}</div></div>${d.attendance.some((a) => a.user_id === s.id && a.status === 'open') ? '<span class="pill ok">On site</span>' : ''}</div>`).join('') || emptyState('ri-team-line', 'No one assigned yet\nAssigned staff see this job in their field app and can clock in here.')}</div></div>
      <div class="card"><div class="card-h"><div><h2>Schedule</h2><div class="sub">When each person should be on site</div></div><button class="btn btn-sm btn-primary" data-sched><i class="ri-calendar-schedule-line"></i> Schedule staff</button></div><div class="list" data-shifts><div class="loading-row"><span class="spinner"></span></div></div></div>
    </div>
    <div class="stack">
      <div class="card"><div class="card-h"><h2>Site location &amp; clock-in zone</h2><button class="btn btn-sm" data-locate><i class="ri-crosshair-2-line"></i> I'm on site now</button></div>
        <div class="card-b"><div class="map" data-map></div><p class="hint small muted" style="margin:8px 0 0">Search the address on the left, or tap the map to place the pin. The green circle is where staff can clock in.</p></div></div>
      <div class="card"><div class="card-h"><h2>Attendance log</h2></div><div data-att></div></div>
    </div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-h"><h2>Work reports from the field</h2></div><div class="card-b stack" data-reports></div></div>`;
  const form = $('[data-f]', root);
  bindWidgets(form);
  if (!['75', '150', '300', '600', '1000'].includes(String(i.radius_m))) { const sel = form.querySelector('[name=radius_m]'); sel.add(new Option(`Custom — ${i.radius_m} m`, i.radius_m), 0); sel.value = i.radius_m; }
  // Map & geofence
  const L = await leaflet();
  const center = i.lat ? [i.lat, i.lng] : [6.5244, 3.3792];
  const map = baseMap(L, $('[data-map]', root), center, i.lat ? 16 : 11);
  let marker = i.lat ? L.marker(center, { draggable: true }).addTo(map) : null;
  let circle = i.lat ? L.circle(center, { radius: i.radius_m, color: '#2F8A3C' }).addTo(map) : null;
  const setPos = (lat, lng) => {
    form.querySelector('[name=lat]').value = lat.toFixed(6); form.querySelector('[name=lng]').value = lng.toFixed(6);
    const r = Number(form.querySelector('[name=radius_m]').value || 150);
    if (!marker) { marker = L.marker([lat, lng], { draggable: true }).addTo(map); marker.on('dragend', (e) => setPos(e.target.getLatLng().lat, e.target.getLatLng().lng)); circle = L.circle([lat, lng], { radius: r, color: '#2F8A3C' }).addTo(map); }
    marker.setLatLng([lat, lng]); circle.setLatLng([lat, lng]); circle.setRadius(r);
  };
  marker?.on('dragend', (e) => setPos(e.target.getLatLng().lat, e.target.getLatLng().lng));
  map.on('click', (e) => setPos(e.latlng.lat, e.latlng.lng));
  form.querySelector('[name=radius_m]').onchange = (e) => circle?.setRadius(Number(e.target.value || 150));
  form.querySelector('[name=address]').addEventListener('change', () => { const la = Number(form.querySelector('[name=lat]').value), ln = Number(form.querySelector('[name=lng]').value); if (la && ln) { setPos(la, ln); map.setView([la, ln], 17); } });
  $('[data-locate]', root).onclick = () => navigator.geolocation.getCurrentPosition((p) => { setPos(p.coords.latitude, p.coords.longitude); map.setView([p.coords.latitude, p.coords.longitude], 17); }, () => toast('Could not get your location', 'err'), { enableHighAccuracy: true });
  d.attendance.filter((a) => a.status === 'open' && a.last_lat).forEach((a) => L.circleMarker([a.last_lat, a.last_lng], { radius: 7, color: a.offsite ? '#C02B2B' : '#282358', fillOpacity: .9 }).bindTooltip(a.user_name).addTo(map));

  $('[data-save]', root).onclick = async (e) => {
    if (!validate(form)) return;
    const body = readForm(form, fields); body.radius_m = Number(body.radius_m) || 150;
    const busyBtn = e.currentTarget; busyBtn.classList.add('loading');
    try { await api(`/api/admin/installations/${id}`, { method: 'PUT', body }); toast('Saved'); detail(ctx, id); } catch (err) { fail(err); busyBtn.classList.remove('loading'); }
  };
  $('[data-complete]', root)?.addEventListener('click', async () => { if (!(await confirmBox('Mark this installation as completed? Warranty, maintenance schedule and a check-in follow-up will be created.', { ok: 'Complete job' }))) return; await api(`/api/admin/installations/${id}`, { method: 'PUT', body: { status: 'completed' } }); toast('Job completed'); detail(ctx, id); });
  $('[data-del]', root).onclick = async () => { if (await confirmBox('Delete this installation and its attendance/report records?', { danger: true, ok: 'Delete' })) { await api(`/api/admin/installations/${id}`, { method: 'DELETE' }); location.hash = '#/installations'; } };
  $('[data-crew]', root).onclick = () => {
    const assigned = new Set(d.staff.map((s) => s.id));
    const { el, close } = modal({ title: 'Assign crew', body: `<div class="stack" style="gap:6px">${users.map((u) => `<label class="check"><input type="checkbox" value="${u.id}" ${assigned.has(u.id) ? 'checked' : ''}><span><strong>${esc(u.name)}</strong> <span class="muted small">${esc(u.job_title || u.role)}</span></span></label>`).join('')}</div>`, footer: '<button class="btn btn-primary" data-ok>Save crew</button>' });
    $('[data-ok]', el).onclick = async () => { await api(`/api/admin/installations/${id}/staff`, { method: 'PUT', body: { user_ids: $$('input:checked', el).map((x) => Number(x.value)) } }); toast('Crew updated — they have been notified'); close(); detail(ctx, id); };
  };
  $('[data-att]', root).innerHTML = table({ rows: d.attendance, empty: 'No clock-ins yet.', columns: [
    { label: 'Staff', render: (a) => `<strong>${esc(a.user_name)}</strong>` }, { label: 'In', render: (a) => `${datetime(a.clock_in_at)}<div class="muted small">${Math.round(a.in_distance ?? 0)}m from centre</div>` },
    { label: 'Out', render: (a) => (a.clock_out_at ? time(a.clock_out_at) : statusPill(a.status)) },
    { label: 'Off site', render: (a) => (a.offsite ? '<span class="pill bad">Away now</span>' : a.offsite_minutes ? `<span class="pill warn">${Math.round(a.offsite_minutes)} min</span>` : '—') }] });
  $('[data-reports]', root).innerHTML = d.reports.length ? d.reports.map((w) => `<div class="tl" style="grid-template-columns:40px 1fr"><span class="avatar">${esc(w.user_name.slice(0, 1))}</span><div style="min-width:0"><div class="row between"><strong>${esc(w.user_name)}</strong><span class="muted small">${datetime(w.created_at)}${w.progress != null ? ` · ${w.progress}% complete` : ''}</span></div>
    <p style="white-space:pre-wrap">${esc(w.message)}</p>${w.images.length ? `<div class="photo-grid" style="margin-top:8px">${w.images.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Work photo"></a>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:8px">${w.reviewed_at ? `<span class="pill ok"><i class="ri-check-double-line"></i> Reviewed by ${esc(w.reviewer_name || '')}${w.review_note ? ': ' + esc(w.review_note) : ''}</span>` : `<button class="btn btn-sm" data-review="${w.id}"><i class="ri-check-double-line"></i> Mark reviewed</button>`}</div></div></div>`).join('') : '<div class="empty"><i class="ri-camera-line"></i><strong>No work reports yet</strong><span>Field staff send photos and notes from their phones. They appear here.</span></div>';
  $$('[data-review]', root).forEach((b) => (b.onclick = () => {
    const { el, close } = modal({ title: 'Review work report', size: 'narrow', body: '<div class="field"><label for="rv">Feedback for the crew <span class="opt">(optional)</span></label><input class="input" id="rv" value="Good job — thank you."></div>', footer: '<button class="btn" data-x2>Cancel</button><button class="btn btn-primary" data-ok>Mark reviewed</button>' });
    $('[data-x2]', el).onclick = close;
    $('[data-ok]', el).onclick = async () => { await api(`/api/admin/work-reports/${b.dataset.review}/review`, { method: 'PUT', body: { note: $('#rv', el).value } }); toast('Reviewed — the crew has been told'); close(); detail(ctx, id); };
  }));
  const loadShifts = async () => {
    const from = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    const r = await api(`/api/admin/shifts?installation_id=${id}&from=${from}`);
    $('[data-shifts]', root).innerHTML = shiftRows(r.items, { showSite: false }) || emptyState('ri-calendar-schedule-line', 'No schedule yet\nSet the date and time each person should be on site. They get reminders, and you are told if they are late.');
  };
  bindShiftActions($('[data-shifts]', root), loadShifts);
  $('[data-sched]', root).onclick = () => scheduleModal({ installationId: Number(id), users, assigned: new Set(d.staff.map((s) => s.id)), onSaved: () => detail(ctx, id) });
  loadShifts();
}
