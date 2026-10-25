import { $, $$, api, esc, datetime, time, ago, table, statusPill, leaflet, baseMap, confirmBox, toast } from '../lib.js';

export default async function ({ root, setTitle }) {
  setTitle('Staff attendance', 'Who is on site now, location alerts and clock-in history', '<button class="btn" data-refresh><i class="ri-refresh-line"></i> Refresh</button>');
  const today = new Date().toISOString().slice(0, 10);
  root.innerHTML = `
  <div class="alert info" style="margin-bottom:14px"><i class="ri-information-line"></i><span>Staff clock in from the <strong>My field work</strong> page on their phone. Their location is checked against the job site's geofence, and while clocked in their phone reports location every few minutes with the page open. You get a notification when someone leaves the site, returns, or stops reporting for 25 minutes.</span></div>
  <div class="grid g-21"><div class="card"><div class="card-h"><h2>Live map</h2><span class="muted small" style="margin-left:auto" data-updated></span></div><div class="card-b"><div class="map tall" data-map></div></div></div>
    <div class="card"><div class="card-h"><h2>On site now</h2></div><div class="list" data-live></div></div></div>
  <div class="card" style="margin-top:16px"><div class="toolbar"><h2 style="margin-right:auto">History</h2><label class="small">From <input class="input" type="date" data-from value="${new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)}" style="width:auto"></label><label class="small">To <input class="input" type="date" data-to value="${today}" style="width:auto"></label><select class="input" data-user style="width:auto"><option value="">All staff</option></select><button class="btn btn-sm" data-csv><i class="ri-download-2-line"></i> CSV</button></div><div data-hist></div></div>`;
  const L = await leaflet();
  const map = baseMap(L, $('[data-map]', root));
  const layer = L.layerGroup().addTo(map);
  const users = await api('/api/admin/users').catch(() => ({ items: [] }));
  $('[data-user]', root).innerHTML += users.items.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
  let hist = [];
  async function live() {
    const r = await api('/api/admin/attendance?status=open');
    layer.clearLayers();
    const pts = [];
    r.items.forEach((a) => {
      if (a.site_lat) { L.circle([a.site_lat, a.site_lng], { radius: a.radius_m, color: '#2F8A3C', weight: 1 }).addTo(layer); pts.push([a.site_lat, a.site_lng]); }
      if (a.last_lat) { L.circleMarker([a.last_lat, a.last_lng], { radius: 8, color: a.offsite ? '#C02B2B' : '#282358', fillOpacity: .9 }).bindPopup(`<strong>${esc(a.user_name)}</strong><br>${esc(a.site || '')}<br>Last seen ${ago(a.last_ping_at)} · ${a.last_distance}m from site`).addTo(layer); pts.push([a.last_lat, a.last_lng]); }
    });
    if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
    $('[data-live]', root).innerHTML = r.items.map((a) => `<div class="li"><span class="avatar" style="${a.offsite ? 'background:var(--bad);color:#fff' : ''}">${esc(a.user_name.slice(0, 1))}</span><div class="body"><strong>${esc(a.user_name)}</strong><div class="meta">${esc(a.site || '')} · in at ${time(a.clock_in_at)}</div>
      <div class="meta">${a.offsite ? `<span style="color:var(--bad)"><i class="ri-alarm-warning-line"></i> Away from site (~${a.last_distance}m) since ${time(a.offsite_since)}</span>` : `<i class="ri-map-pin-line"></i> ${a.last_distance ?? '?'}m from centre`} · ping ${ago(a.last_ping_at)}</div></div>
      <button class="btn btn-sm" data-trail="${a.id}" title="Show route"><i class="ri-route-line"></i></button><button class="btn btn-sm btn-ghost" data-close="${a.id}" title="Clock out for them"><i class="ri-logout-box-r-line"></i></button></div>`).join('') || '<div class="empty"><i class="ri-user-location-line"></i>No one is clocked in.</div>';
    $('[data-updated]', root).textContent = `Updated ${new Date().toLocaleTimeString()}`;
  }
  async function history() {
    const p = new URLSearchParams({ from: $('[data-from]', root).value, to: $('[data-to]', root).value }); const u = $('[data-user]', root).value; if (u) p.set('user_id', u);
    hist = (await api('/api/admin/attendance?' + p)).items;
    const hrs = (a) => (a.clock_out_at ? ((new Date(a.clock_out_at.replace(' ', 'T') + 'Z') - new Date(a.clock_in_at.replace(' ', 'T') + 'Z')) / 36e5).toFixed(1) : '—');
    $('[data-hist]', root).innerHTML = table({ rows: hist, empty: 'No attendance in this period.', columns: [
      { label: 'Staff', render: (a) => `<strong>${esc(a.user_name)}</strong>` }, { label: 'Site', render: (a) => esc(a.site || '—') },
      { label: 'Clock in', render: (a) => `${datetime(a.clock_in_at)}<div class="muted small">${Math.round(a.in_distance ?? 0)}m from centre</div>` },
      { label: 'Clock out', render: (a) => (a.clock_out_at ? `${datetime(a.clock_out_at)}${a.out_distance != null ? `<div class="muted small">${Math.round(a.out_distance)}m from centre</div>` : ''}` : statusPill(a.status)) },
      { label: 'Hours', render: (a) => hrs(a) }, { label: 'Off site', render: (a) => (a.offsite_minutes ? `<span class="pill warn">${Math.round(a.offsite_minutes)} min</span>` : '—') },
      { label: 'Notes', render: (a) => `<span class="small muted">${esc(a.note || '')}</span>` }, { label: '', render: (a) => `<button class="btn btn-sm" data-trail="${a.id}"><i class="ri-route-line"></i> Route</button>` }] });
  }
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-trail]');
    if (t) {
      const r = await api(`/api/admin/attendance/${t.dataset.trail}/pings`);
      if (!r.items.length) return toast('No location points recorded');
      layer.clearLayers();
      const line = r.items.map((p) => [p.lat, p.lng]);
      L.polyline(line, { color: '#282358', weight: 3 }).addTo(layer);
      r.items.forEach((p) => L.circleMarker([p.lat, p.lng], { radius: 4, color: p.inside ? '#2F8A3C' : '#C02B2B', fillOpacity: 1 }).bindTooltip(`${time(p.created_at)} · ${p.distance}m`).addTo(layer));
      map.fitBounds(line, { padding: [40, 40] }); $('[data-map]', root).scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const c = e.target.closest('[data-close]');
    if (c && (await confirmBox('Clock this person out now?'))) { await api(`/api/admin/attendance/${c.dataset.close}/close`, { method: 'POST' }); live(); history(); }
  });
  $$('[data-from],[data-to],[data-user]', root).forEach((x) => (x.onchange = history));
  $('[data-refresh]').onclick = () => { live(); history(); };
  $('[data-csv]', root).onclick = () => {
    const rows = [['Staff', 'Site', 'Clock in', 'Clock out', 'In distance (m)', 'Out distance (m)', 'Off-site minutes', 'Status', 'Notes'], ...hist.map((a) => [a.user_name, a.site, a.clock_in_at, a.clock_out_at, a.in_distance, a.out_distance, a.offsite_minutes, a.status, a.note])];
    const blob = new Blob([rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'attendance.csv'; a.click();
  };
  live(); history();
  const timer = setInterval(() => { if (!document.body.contains(root) || !location.hash.startsWith('#/attendance')) return clearInterval(timer); live(); }, 30000);
}
