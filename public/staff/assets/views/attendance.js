// Staff & schedules: who is on site now, who is expected where, staff profiles and clock-in history.
import { $, $$, api, esc, datetime, time, ago, date, table, statusPill, leaflet, baseMap, confirmBox, toast, modal, emptyState, initials, waLink } from '../lib.js';
import { scheduleModal, shiftRows, bindShiftActions, avatarOf } from './schedule.js';

const TABS = [['live', 'On site now', 'ri-map-pin-user-line'], ['schedule', 'Schedule', 'ri-calendar-schedule-line'], ['staff', 'Staff profiles', 'ri-contacts-book-line'], ['history', 'Clock-in history', 'ri-history-line']];
const lagosDate = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
const dayLabel = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' });
const age = (dob) => (dob ? Math.floor((Date.now() - new Date(dob)) / 3.15576e10) : null);

export async function staffProfile(id) {
  const u = await api(`/api/admin/users/${id}/profile`);
  const p = u.profile || {};
  const s = u.stats;
  const row = (k, v) => (v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : '');
  modal({ title: 'Staff profile', size: 'wide', body: `<div class="stack" style="gap:18px">
    <div class="profile-card">${u.avatar ? `<img class="avatar xl" src="${esc(u.avatar)}" alt="">` : `<span class="avatar xl">${esc(initials(u.name))}</span>`}
      <div style="min-width:0"><h2 style="font-size:22px">${esc(u.name)}</h2><div class="muted">${esc(u.job_title || 'Staff')}${p.branch ? ` · ${esc(p.branch)}` : ''}</div>
      <div class="row" style="margin-top:10px">${u.phone ? `<a class="btn btn-sm" href="tel:${esc(u.phone)}"><i class="ri-phone-line"></i> Call</a><a class="btn btn-sm" href="${waLink(u.phone)}" target="_blank" rel="noopener"><i class="ri-whatsapp-line"></i> WhatsApp</a>` : ''}${u.active ? '' : '<span class="pill bad">Access revoked</span>'}${u.profile_completed_at ? '<span class="pill ok">Profile complete</span>' : '<span class="pill warn">Profile not filled in yet</span>'}</div></div></div>
    <div class="grid g-4">
      <div class="card kpi"><div class="label">Shifts (90 days)</div><div class="value">${s.shifts.total || 0}</div></div>
      <div class="card kpi"><div class="label">On time</div><div class="value">${s.shifts.on_time || 0}</div></div>
      <div class="card kpi"><div class="label">Late / missed</div><div class="value">${(s.shifts.late || 0) + (s.shifts.missed || 0)}</div></div>
      <div class="card kpi"><div class="label">Hours (30 days)</div><div class="value">${Math.round(s.attendance.hours || 0)}</div></div>
    </div>
    <div class="grid g-2">
      <div class="card"><div class="card-h"><h2>Personal</h2></div><div class="card-b"><dl class="kv">${row('Email', u.email)}${row('Phone', u.phone)}${row('Date of birth', p.date_of_birth ? `${date(p.date_of_birth)} (${age(p.date_of_birth)} yrs)` : '')}${row('Gender', p.gender)}${row('Marital status', p.marital_status)}${row('Home address', p.address)}${row('State of origin', p.state_of_origin)}</dl></div></div>
      <div class="stack">
        <div class="card"><div class="card-h"><h2>Emergency contact</h2></div><div class="card-b">${p.emergency_name ? `<dl class="kv">${row('Name', p.emergency_name)}${row('Relationship', p.emergency_relation)}${row('Phone', p.emergency_phone)}</dl>${p.emergency_phone ? `<a class="btn btn-sm" style="margin-top:10px" href="tel:${esc(p.emergency_phone)}"><i class="ri-phone-line"></i> Call ${esc(p.emergency_name.split(' ')[0])}</a>` : ''}` : '<span class="muted">Not provided yet.</span>'}</div></div>
        <div class="card"><div class="card-h"><h2>Work</h2></div><div class="card-b"><dl class="kv">${row('Started', p.start_date ? date(p.start_date) : '')}${row('Skills', p.skills)}${row('Training', p.certifications)}${row('Last sign-in', u.last_login_at ? ago(u.last_login_at) : 'Never')}${row('Site issues reported', String(s.issues))}</dl></div></div>
      </div>
    </div></div>` });
}

export default async function ({ root, params, setTitle, can }) {
  const tab = TABS.some(([k]) => k === params[0]) ? params[0] : 'live';
  setTitle('Staff & schedules', 'Who is on site, who is expected where, and everyone\'s details', can('installations') ? '<button class="btn btn-primary" type="button" data-new-shift><i class="ri-calendar-schedule-line"></i> Schedule staff</button>' : '');
  root.innerHTML = `<div class="tabs">${TABS.map(([k, l, i]) => `<a href="#/attendance/${k}" class="${k === tab ? 'on' : ''}"><i class="${i}"></i> ${l}</a>`).join('')}</div><div data-tab></div>`;
  const mount = $('[data-tab]', root);
  const [users, sites] = await Promise.all([api('/api/admin/users').then((r) => r.items).catch(() => []), api('/api/admin/installations?per=200').then((r) => r.items.filter((i) => ['scheduled', 'in_progress', 'on_hold'].includes(i.status))).catch(() => [])]);
  $('[data-new-shift]')?.addEventListener('click', () => {
    if (!sites.length) return toast('Create an installation (job site) first', 'err');
    scheduleModal({ installations: sites, users: users.filter((u) => u.active), onSaved: () => (tab === 'schedule' ? T.schedule() : (location.hash = '#/attendance/schedule')) });
  });

  const T = {
    async live() {
      mount.innerHTML = `<div class="alert info" style="margin-bottom:16px"><i class="ri-information-line"></i><span>Staff clock in from <strong>My field work</strong> on their phone. Their location is checked against the job site's clock-in zone, and while they are on shift the phone reports location every few minutes. You're alerted when someone leaves the site, comes back, stops reporting for 25 minutes, or is late for a scheduled start.</span></div>
      <div class="grid g-21"><div class="card"><div class="card-h"><h2>Live map</h2><span class="muted small" data-updated></span></div><div class="card-b"><div class="map tall" data-map></div></div></div>
        <div class="card"><div class="card-h"><h2>On site now</h2><button class="btn btn-sm btn-ghost" type="button" data-refresh><i class="ri-refresh-line"></i> Refresh</button></div><div class="list" data-live><div class="loading-row"><span class="spinner"></span></div></div></div></div>`;
      const L = await leaflet();
      const map = baseMap(L, $('[data-map]', mount));
      const layer = L.layerGroup().addTo(map);
      const pic = (a) => { const u = users.find((x) => x.id === a.user_id); return u ? avatarOf(u) : `<span class="avatar">${esc(initials(a.user_name))}</span>`; };
      async function live() {
        const r = await api('/api/admin/attendance?status=open');
        layer.clearLayers();
        const pts = [];
        r.items.forEach((a) => {
          if (a.site_lat) { L.circle([a.site_lat, a.site_lng], { radius: a.radius_m, color: '#1E6B3A', weight: 1 }).addTo(layer); pts.push([a.site_lat, a.site_lng]); }
          if (a.last_lat) { L.circleMarker([a.last_lat, a.last_lng], { radius: 8, color: a.offsite ? '#C0302B' : '#141716', fillOpacity: .9 }).bindPopup(`<strong>${esc(a.user_name)}</strong><br>${esc(a.site || '')}<br>Last seen ${ago(a.last_ping_at)} · ${a.last_distance}m from site`).addTo(layer); pts.push([a.last_lat, a.last_lng]); }
        });
        if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
        $('[data-live]', mount).innerHTML = r.items.map((a) => `<div class="li">${pic(a)}<div class="body"><strong>${esc(a.user_name)}</strong><div class="meta">${esc(a.site || '')} · in at ${time(a.clock_in_at)}</div>
          <div class="meta">${a.offsite ? `<span style="color:var(--bad)"><i class="ri-alarm-warning-line"></i> Away from site (~${a.last_distance}m) since ${time(a.offsite_since)}</span>` : `<i class="ri-map-pin-line"></i> ${a.last_distance ?? '?'}m from centre`} · updated ${ago(a.last_ping_at)}</div></div>
          <button class="icon-btn" type="button" data-trail="${a.id}" title="Show route" aria-label="Show route"><i class="ri-route-line"></i></button><button class="icon-btn" type="button" data-close="${a.id}" title="Clock out for them" aria-label="Clock out for them"><i class="ri-logout-box-r-line"></i></button></div>`).join('')
          || emptyState('ri-user-location-line', 'No one is clocked in\nWhen staff arrive on site and clock in, they appear here and on the map.');
        $('[data-updated]', mount).textContent = `Updated ${new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}`;
      }
      mount.addEventListener('click', async (e) => {
        const t = e.target.closest('[data-trail]');
        if (t) {
          const r = await api(`/api/admin/attendance/${t.dataset.trail}/pings`);
          if (!r.items.length) return toast('No location points recorded yet');
          layer.clearLayers();
          const line = r.items.map((p) => [p.lat, p.lng]);
          L.polyline(line, { color: '#141716', weight: 3 }).addTo(layer);
          r.items.forEach((p) => L.circleMarker([p.lat, p.lng], { radius: 4, color: p.inside ? '#1E6B3A' : '#C0302B', fillOpacity: 1 }).bindTooltip(`${time(p.created_at)} · ${p.distance}m`).addTo(layer));
          map.fitBounds(line, { padding: [40, 40] });
        }
        const c = e.target.closest('[data-close]');
        if (c && (await confirmBox('Clock this person out now?', { ok: 'Clock out' }))) { await api(`/api/admin/attendance/${c.dataset.close}/close`, { method: 'POST' }); live(); }
        if (e.target.closest('[data-refresh]')) live();
      });
      await live();
      const timer = setInterval(() => { if (!document.body.contains(mount) || !location.hash.startsWith('#/attendance')) return clearInterval(timer); live(); }, 30000);
    },

    async schedule() {
      const start = new Date();
      mount.innerHTML = `<div class="card"><div class="toolbar"><div class="seg" role="group" aria-label="Period"><button type="button" class="on" data-range="7">Next 7 days</button><button type="button" data-range="14">14 days</button><button type="button" data-range="-7">Last 7 days</button></div>
        <select class="input" data-u><option value="">Everyone</option>${users.filter((u) => u.role !== 'owner').map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select>
        <select class="input" data-s><option value="">All job sites</option>${sites.map((s) => `<option value="${s.id}">${esc(s.title)}</option>`).join('')}</select></div><div data-days><div class="loading-row"><span class="spinner"></span></div></div></div>`;
      let range = 7;
      const load = async () => {
        const from = range > 0 ? lagosDate(start) : lagosDate(new Date(Date.now() + range * 864e5));
        const to = range > 0 ? lagosDate(new Date(Date.now() + range * 864e5)) : lagosDate(start);
        const q = new URLSearchParams({ from, to }); if ($('[data-u]', mount).value) q.set('user_id', $('[data-u]', mount).value); if ($('[data-s]', mount).value) q.set('installation_id', $('[data-s]', mount).value);
        const r = await api('/api/admin/shifts?' + q);
        const byDay = {};
        r.items.forEach((s) => { const d = lagosDate(new Date(s.starts_at.replace(' ', 'T') + 'Z')); (byDay[d] ||= []).push(s); });
        const days = Object.keys(byDay).sort();
        $('[data-days]', mount).innerHTML = days.length ? days.map((d) => `<div class="card-h" style="background:var(--surface-2)"><h2>${dayLabel(d)}${d === lagosDate(new Date()) ? ' <span class="pill ink">Today</span>' : ''}</h2><span class="sub">${byDay[d].length} scheduled</span></div><div class="list">${shiftRows(byDay[d])}</div>`).join('')
          : emptyState('ri-calendar-schedule-line', 'Nothing scheduled in this period\nUse "Schedule staff" to set when each person should be on a job site. They get reminders and you are told if they are late.', can('installations') ? '<button class="btn btn-primary" type="button" data-new2><i class="ri-add-line"></i> Schedule staff</button>' : '');
        $('[data-new2]', mount)?.addEventListener('click', () => $('[data-new-shift]')?.click());
      };
      $$('[data-range]', mount).forEach((b) => (b.onclick = () => { range = Number(b.dataset.range); $$('[data-range]', mount).forEach((x) => x.classList.toggle('on', x === b)); load(); }));
      $('[data-u]', mount).onchange = load; $('[data-s]', mount).onchange = load;
      bindShiftActions(mount, load);
      await load();
    },

    async staff() {
      const staff = users.filter((u) => u.role !== 'owner');
      mount.innerHTML = staff.length ? `<div class="grid g-3">${staff.map((u) => `<button type="button" class="card" data-profile="${u.id}" style="text-align:left;cursor:pointer;font:inherit;color:inherit;padding:18px;display:flex;gap:14px;align-items:center">
          ${u.avatar ? `<img class="avatar lg" src="${esc(u.avatar)}" alt="">` : `<span class="avatar lg">${esc(initials(u.name))}</span>`}
          <span style="min-width:0;flex:1"><strong style="display:block;color:var(--heading);font-size:15px">${esc(u.name)}</strong><span class="small muted">${esc(u.job_title || 'Staff')}${u.branch ? ` · ${esc(u.branch)}` : ''}</span>
          <span class="row" style="margin-top:8px;gap:6px">${u.active ? '' : '<span class="pill bad">Revoked</span>'}${u.profile_complete ? '<span class="pill ok">Profile complete</span>' : '<span class="pill warn">Waiting for details</span>'}</span></span><i class="ri-arrow-right-s-line" style="font-size:20px;color:var(--muted)"></i></button>`).join('')}</div>`
        : `<div class="card">${emptyState('ri-team-line', 'No staff yet\nCreate staff logins from "Staff logins". Each person fills in their photo and details the first time they sign in.', can('users') ? '<a class="btn btn-primary" href="#/users"><i class="ri-user-add-line"></i> Add staff</a>' : '')}</div>`;
      mount.onclick = (e) => { const b = e.target.closest('[data-profile]'); if (b) staffProfile(b.dataset.profile); };
    },

    async history() {
      const today = lagosDate(new Date());
      mount.innerHTML = `<div class="card"><div class="toolbar"><label class="small row" style="gap:6px">From <input class="input" type="date" data-from value="${lagosDate(new Date(Date.now() - 7 * 864e5))}" style="width:auto"></label><label class="small row" style="gap:6px">To <input class="input" type="date" data-to value="${today}" style="width:auto"></label>
        <select class="input" data-user><option value="">All staff</option>${users.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select><button class="btn btn-sm" type="button" data-csv><i class="ri-download-2-line"></i> Download CSV</button></div><div data-hist><div class="loading-row"><span class="spinner"></span></div></div></div>`;
      let hist = [];
      const load = async () => {
        const p = new URLSearchParams({ from: $('[data-from]', mount).value, to: $('[data-to]', mount).value }); const u = $('[data-user]', mount).value; if (u) p.set('user_id', u);
        hist = (await api('/api/admin/attendance?' + p)).items;
        const hrs = (a) => (a.clock_out_at ? ((new Date(a.clock_out_at.replace(' ', 'T') + 'Z') - new Date(a.clock_in_at.replace(' ', 'T') + 'Z')) / 36e5).toFixed(1) : '—');
        $('[data-hist]', mount).innerHTML = table({ rows: hist, empty: 'No clock-ins in this period', emptyIcon: 'ri-time-line', columns: [
          { label: 'Staff', render: (a) => `<strong>${esc(a.user_name)}</strong>` }, { label: 'Site', render: (a) => esc(a.site || '—') },
          { label: 'Clock in', render: (a) => `${datetime(a.clock_in_at)}<div class="muted small">${Math.round(a.in_distance ?? 0)}m from centre</div>` },
          { label: 'Clock out', render: (a) => (a.clock_out_at ? `${datetime(a.clock_out_at)}${a.out_distance != null ? `<div class="muted small">${Math.round(a.out_distance)}m from centre</div>` : ''}` : statusPill(a.status)) },
          { label: 'Hours', render: (a) => hrs(a) }, { label: 'Off site', render: (a) => (a.offsite_minutes ? `<span class="pill warn">${Math.round(a.offsite_minutes)} min</span>` : '—') },
          { label: 'Notes', render: (a) => `<span class="small muted">${esc(a.note || '')}</span>` }] });
      };
      $$('[data-from],[data-to],[data-user]', mount).forEach((x) => (x.onchange = load));
      $('[data-csv]', mount).onclick = () => {
        const rows = [['Staff', 'Site', 'Clock in', 'Clock out', 'In distance (m)', 'Out distance (m)', 'Off-site minutes', 'Status', 'Notes'], ...hist.map((a) => [a.user_name, a.site, a.clock_in_at, a.clock_out_at, a.in_distance, a.out_distance, a.offsite_minutes, a.status, a.note])];
        const blob = new Blob([rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'attendance.csv'; a.click();
      };
      await load();
    },
  };
  await T[tab]();
}
