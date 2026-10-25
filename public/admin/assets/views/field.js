// Field staff app: geofenced clock in/out, live location while on shift, work reports with photos.
import { $, $$, api, esc, datetime, time, ago, toast, fail, compressImage, statusPill, modal, emptyState } from '../lib.js';

const T = (window.__vsTracker ||= { watch: null, lastSent: 0, lastPos: null, lock: null, status: '' });

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This device does not support location. Use a phone with GPS.'));
    navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), (e) => reject(new Error(e.code === 1 ? 'Location permission was denied. Allow location for this site in your browser settings, then try again.' : 'Could not get your location. Move outdoors or turn on GPS and try again.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}
const dist = (a, b) => { const R = 6371000, r = (x) => (x * Math.PI) / 180; const dl = r(b.latitude - a.latitude), dn = r(b.longitude - a.longitude); return 2 * R * Math.asin(Math.sqrt(Math.sin(dl / 2) ** 2 + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(dn / 2) ** 2)); };

export function startTracking(onUpdate) {
  if (T.watch != null || !navigator.geolocation) return;
  T.watch = navigator.geolocation.watchPosition(async (p) => {
    const c = p.coords, now = Date.now();
    const moved = T.lastPos ? dist(T.lastPos, c) : Infinity;
    if (now - T.lastSent < 120000 && moved < 60) return; // every 2 min, or sooner if moved 60m+
    T.lastSent = now; T.lastPos = c;
    try {
      const r = await api('/api/field/ping', { body: { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy } });
      if (!r.clocked_in) return stopTracking();
      T.status = r.inside ? `On site · ${r.distance}m from centre` : `Outside site · ~${r.distance}m away — your supervisor has been notified`;
      onUpdate?.(r);
      window.dispatchEvent(new CustomEvent('vs:ping', { detail: r }));
    } catch {}
  }, () => {}, { enableHighAccuracy: true, maximumAge: 30000, timeout: 60000 });
  keepAwake(true);
}
export function stopTracking() { if (T.watch != null) navigator.geolocation.clearWatch(T.watch); T.watch = null; keepAwake(false); }
async function keepAwake(on) {
  try { if (on && 'wakeLock' in navigator && !T.lock) { T.lock = await navigator.wakeLock.request('screen'); T.lock.addEventListener('release', () => (T.lock = null)); } if (!on && T.lock) { await T.lock.release(); T.lock = null; } } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && T.watch != null) keepAwake(true); });
export async function resumeTracking() { try { const r = await api('/api/field/me'); if (r.open) startTracking(); } catch {} }

const ISSUE_CATS = [['safety', 'ri-first-aid-kit-line', 'Safety'], ['equipment', 'ri-plug-line', 'Equipment fault'], ['materials', 'ri-box-3-line', 'Missing materials'], ['customer', 'ri-user-voice-line', 'Customer'], ['access', 'ri-door-lock-line', 'Site access'], ['weather', 'ri-rainy-line', 'Weather'], ['other', 'ri-question-line', 'Other']];
const lagosDay = (utc) => new Date(utc.replace(' ', 'T') + 'Z').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });
const isToday = (utc) => new Date(utc.replace(' ', 'T') + 'Z').toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos' }) === new Date().toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos' });

// Report a problem from site. Sent immediately; the administrator gets an alert.
export function reportIssue(jobs, selected, onSent) {
  let files = [];
  const { el, close } = modal({ title: 'Report a problem on site', body: `<form class="stack" data-issue>
    <div class="field"><span class="label">What kind of problem?</span><div class="choice-pills">${ISSUE_CATS.map(([k, i, l], n) => `<label><input type="radio" name="category" value="${k}" ${n === 0 ? '' : ''}${k === 'equipment' ? 'checked' : ''}><span><i class="${i}"></i>${l}</span></label>`).join('')}</div></div>
    <div class="field"><span class="label">How urgent is it?</span><div class="urg">
      <label class="u-low"><input type="radio" name="urgency" value="low"><span><i class="ri-time-line"></i>Can wait</span></label>
      <label class="u-normal"><input type="radio" name="urgency" value="normal" checked><span><i class="ri-information-line"></i>Today</span></label>
      <label class="u-high"><input type="radio" name="urgency" value="high"><span><i class="ri-error-warning-line"></i>Soon</span></label>
      <label class="u-urgent"><input type="radio" name="urgency" value="urgent"><span><i class="ri-alarm-warning-line"></i>Urgent</span></label></div></div>
    ${jobs.length ? `<div class="field"><label for="is-job">Which site?</label><select class="input" id="is-job" name="installation_id"><option value="">Not at a site</option>${jobs.map((j) => `<option value="${j.id}" ${j.id === selected ? 'selected' : ''}>${esc(j.title)}</option>`).join('')}</select></div>` : ''}
    <div class="field"><label for="is-msg">What happened?</label><textarea class="input" id="is-msg" name="message" rows="4" required placeholder="e.g. The customer's main breaker is faulty, we can't connect the inverter until it's replaced."></textarea></div>
    <div class="field"><span class="label">Photos <span class="opt">(optional)</span></span><label class="dropzone"><input type="file" accept="image/*" capture="environment" multiple hidden data-iphotos><i class="ri-camera-line" style="font-size:22px"></i><br>Take or choose photos</label><div class="photo-grid" data-iprev></div></div>
    <div class="alert warn"><i class="ri-phone-line"></i><span>If anyone is hurt or in danger, call your supervisor first, then send this report.</span></div>
  </form>`, footer: '<button class="btn" type="button" data-cancel>Cancel</button><button class="btn btn-primary" type="button" data-send><i class="ri-send-plane-line"></i> Send now</button>' });
  const prev = $('[data-iprev]', el);
  const draw = () => (prev.innerHTML = files.map((f, i) => `<div style="position:relative"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" class="icon-btn" data-irm="${i}" style="position:absolute;top:2px;right:2px;background:#fff;width:26px;height:26px" aria-label="Remove photo"><i class="ri-close-line"></i></button></div>`).join(''));
  $('[data-iphotos]', el).onchange = async (e) => { for (const f of e.target.files) files.push(await compressImage(f, 1600, .8)); files = files.slice(0, 8); e.target.value = ''; draw(); };
  prev.onclick = (e) => { const b = e.target.closest('[data-irm]'); if (b) { files.splice(Number(b.dataset.irm), 1); draw(); } };
  $('[data-cancel]', el).onclick = close;
  $('[data-send]', el).onclick = async (e) => {
    const form = $('[data-issue]', el);
    if (!form.reportValidity()) return;
    const fd = new FormData(form); files.forEach((f) => fd.append('photos', f));
    if (T.lastPos) { fd.append('lat', T.lastPos.latitude); fd.append('lng', T.lastPos.longitude); }
    const btn = e.currentTarget; btn.classList.add('loading');
    try { await api('/api/field/issues', { body: fd }); toast('Sent — the administrator has been alerted'); close(); onSent?.(); }
    catch (ex) { fail(ex); btn.classList.remove('loading'); }
  };
}

export default async function ctxFn(ctx) {
  const { root, setTitle, user } = ctx;
  setTitle('My field work', `Hello ${user.name.split(' ')[0]} — clock in when you arrive on site`, '<button class="btn btn-danger" type="button" data-issue-btn><i class="ri-alarm-warning-line"></i> Report a problem</button>');
  const d = await api('/api/field/me');
  const open = d.open;
  let selected = open?.installation_id || d.shifts.find((x) => isToday(x.starts_at) && d.jobs.some((j) => j.id === x.installation_id))?.installation_id || d.jobs[0]?.id || null;
  const since = open ? Math.round((Date.now() - new Date(open.clock_in_at.replace(' ', 'T') + 'Z')) / 60000) : 0;
  root.innerHTML = `
  <div class="grid g-2">
    <div class="stack">
      <div class="field-hero"><span class="status ${open ? 'on' : ''}">${open ? 'Clocked in' : 'Not clocked in'}</span>
        <h2>${open ? esc(open.site || 'On shift') : d.jobs.length ? 'Choose your job site' : 'No job assigned yet'}</h2>
        <p style="margin:6px 0 16px;color:#C9DDBC">${open ? `Since ${time(open.clock_in_at)} · ${Math.floor(since / 60)}h ${since % 60}m` : d.jobs.length ? 'You must be at the site to clock in. Location is checked automatically.' : 'Your supervisor will assign you to a job.'}</p>
        <p data-trk style="margin:0 0 14px;font-size:13px;color:#E4F0DA">${open ? esc(T.status || 'Location tracking is active while this page is open.') : ''}</p>
        ${open ? '<button class="big-btn out" data-out><i class="ri-logout-box-r-line"></i> Clock out</button>' : d.jobs.length ? '<button class="big-btn in" data-in><i class="ri-map-pin-user-fill"></i> Clock in</button>' : ''}
        <div class="alert err" data-err hidden style="margin-top:12px"></div></div>
      ${open ? '<div class="alert warn"><i class="ri-smartphone-line"></i><span>Keep this page open with location on while you are on site. If you close it or your phone goes off, your supervisor is alerted after 25 minutes without a location update.</span></div>' : ''}
      <div class="card"><div class="card-h"><h2>My schedule</h2><span class="sub">When you're expected on site</span></div><div class="card-b stack" style="gap:8px">${d.shifts.length ? d.shifts.map((s) => {
        const today = isToday(s.starts_at); const late = s.status === 'late' || s.status === 'missed';
        return `<div class="shift ${today ? 'today' : ''} ${late ? 'late' : ''}"><div class="when"><strong>${esc(s.start_local)}</strong><span>${today ? 'Today' : esc(lagosDay(s.starts_at))}</span></div><div class="grow"><strong style="display:block;color:var(--heading)">${esc(s.site)}</strong><span class="small muted">${esc(s.address || '')}${s.end_local ? ` · until ${esc(s.end_local)}` : ''}</span>${s.note ? `<div class="small" style="margin-top:2px">${esc(s.note)}</div>` : ''}</div>
          ${s.status === 'arrived' ? `<span class="pill ok">${s.late_minutes > 10 ? `${s.late_minutes} min late` : 'On time'}</span>` : s.status === 'late' ? '<span class="pill warn">Running late</span>' : s.status === 'missed' ? '<span class="pill bad">Missed</span>' : '<span class="pill">Expected</span>'}</div>`; }).join('') : '<div class="empty" style="padding:20px"><i class="ri-calendar-line"></i><strong>No schedule yet</strong><span>When the administrator sets a time for you to be on site, it shows here and you get a reminder an hour before.</span></div>'}</div></div>
      <div class="card"><div class="card-h"><h2>My jobs</h2></div><div class="card-b stack" style="gap:10px">${d.jobs.map((j) => `<button type="button" class="job ${j.id === selected ? 'selected' : ''}" data-job="${j.id}" style="text-align:left;cursor:pointer;font:inherit;color:inherit" ${open ? 'disabled' : ''}>
        <div class="row between"><strong>${esc(j.title)}</strong>${statusPill(j.status)}</div><span class="muted small"><i class="ri-map-pin-line"></i> ${esc(j.address || 'Address not set')}</span>
        ${j.customer_name ? `<span class="small"><i class="ri-user-line"></i> ${esc(j.customer_name)} ${j.customer_phone ? `· <a href="tel:${esc(j.customer_phone)}">${esc(j.customer_phone)}</a>` : ''}</span>` : ''}
        ${j.notes ? `<span class="small muted" style="white-space:pre-wrap">${esc(j.notes)}</span>` : ''}
        <div class="row">${j.lat ? `<a class="btn btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${j.lat},${j.lng}"><i class="ri-direction-line"></i> Directions</a>` : '<span class="pill warn">No map pin yet</span>'}<span class="muted small">Progress ${j.progress || 0}%</span></div></button>`).join('') || '<div class="empty" style="padding:20px"><i class="ri-tools-line"></i><strong>No jobs assigned</strong><span>Your jobs appear here once the administrator adds you to a site.</span></div>'}</div></div>
    </div>
    <div class="stack">
      <div class="card"><div class="card-h"><h2>Report completed work</h2></div><form class="card-b stack" data-report>
        <div class="field"><label for="r-job">Job</label><select class="input" id="r-job" name="installation_id" required>${d.jobs.map((j) => `<option value="${j.id}" ${j.id === selected ? 'selected' : ''}>${esc(j.title)}</option>`).join('')}</select></div>
        <div class="field"><label for="r-msg">What did you complete?</label><textarea class="input" id="r-msg" name="message" rows="4" required placeholder="e.g. Mounted 8 panels on the east roof, ran DC cables to the inverter room. Tomorrow: inverter and battery wiring."></textarea></div>
        <div class="field"><label for="r-prog">Overall job progress: <strong data-pv>${d.jobs.find((j) => j.id === selected)?.progress || 0}%</strong></label><input id="r-prog" name="progress" type="range" min="0" max="100" step="5" value="${d.jobs.find((j) => j.id === selected)?.progress || 0}" style="accent-color:#2F6A09"></div>
        <div class="field"><label>Photos of the work</label><label class="dropzone"><input type="file" accept="image/*" capture="environment" multiple hidden data-photos><i class="ri-camera-line" style="font-size:24px"></i><br>Take or choose photos</label><div class="photo-grid" data-previews></div></div>
        <button class="btn btn-primary btn-lg" type="submit" ${d.jobs.length ? '' : 'disabled'}><i class="ri-send-plane-line"></i> Submit report</button></form></div>
      <div class="card"><div class="card-h"><h2>Problems I reported</h2><button class="btn btn-sm" type="button" data-issue-btn><i class="ri-add-line"></i> New</button></div><div class="list">${d.issues.map((i) => `<div class="li" style="align-items:flex-start"><span class="li-icon" style="${i.urgency === 'urgent' ? 'background:var(--bad-bg);color:var(--bad)' : ''}"><i class="ri-alarm-warning-line"></i></span><div class="body"><strong>${esc(i.message.slice(0, 90))}</strong><div class="meta">${esc(i.site || 'No site')} · ${ago(i.created_at)}</div>${i.response ? `<div class="small" style="margin-top:4px"><i class="ri-reply-line"></i> ${esc(i.response)}</div>` : ''}</div>${statusPill(i.status === 'acknowledged' ? 'seen' : i.status)}</div>`).join('') || '<div class="empty small" style="padding:20px"><i class="ri-shield-check-line"></i>Nothing reported.</div>'}</div></div>
      <div class="card"><div class="card-h"><h2>My recent reports</h2></div><div class="list">${d.reports.map((w) => `<div class="li" style="align-items:flex-start"><span class="li-icon"><i class="ri-file-text-line"></i></span><div class="body"><strong>${esc(w.site || '')}</strong><div class="meta">${datetime(w.created_at)} · ${w.images.length} photo${w.images.length === 1 ? '' : 's'}</div><div class="small" style="white-space:pre-wrap">${esc(w.message.slice(0, 180))}</div>${w.reviewed_at ? `<div class="pill ok" style="margin-top:6px"><i class="ri-check-double-line"></i> ${esc(w.review_note || 'Reviewed')}</div>` : ''}</div></div>`).join('') || '<div class="empty small" style="padding:20px"><i class="ri-file-text-line"></i>No reports yet.</div>'}</div></div>
      <div class="card"><div class="card-h"><h2>My shifts</h2></div><div class="list">${d.history.map((a) => `<div class="li"><span class="li-icon"><i class="ri-time-line"></i></span><div class="body"><strong>${esc(a.site || '—')}</strong><div class="meta">${datetime(a.clock_in_at)} → ${a.clock_out_at ? time(a.clock_out_at) : 'now'}${a.offsite_minutes ? ` · ${Math.round(a.offsite_minutes)} min off site` : ''}</div></div>${statusPill(a.status)}</div>`).join('') || '<div class="empty small" style="padding:20px"><i class="ri-time-line"></i>No shifts yet.</div>'}</div></div>
    </div>
  </div>`;
  const err = $('[data-err]', root);
  $$('[data-issue-btn]').forEach((b) => (b.onclick = () => reportIssue(d.jobs, selected, () => ctxFn(ctx))));
  const showErr = (m) => { err.hidden = false; err.textContent = m; };
  $$('[data-job]', root).forEach((b) => (b.onclick = () => { selected = Number(b.dataset.job); $$('[data-job]', root).forEach((x) => x.classList.toggle('selected', x === b)); $('#r-job', root).value = selected; }));
  $('[data-in]', root)?.addEventListener('click', async (e) => {
    err.hidden = true; const btn = e.currentTarget; btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line" style="animation:spin 1s linear infinite"></i> Checking your location…';
    try { const c = await getPosition(); const r = await api('/api/field/clock-in', { body: { installation_id: selected, lat: c.latitude, lng: c.longitude, accuracy: c.accuracy } }); toast(`Clocked in · ${r.distance}m from site centre${r.late > 10 ? ` · ${r.late} min late` : ''}`); T.lastSent = Date.now(); T.lastPos = c; startTracking(); ctxFn(ctx); }
    catch (ex) { showErr(ex.message); btn.disabled = false; btn.innerHTML = '<i class="ri-map-pin-user-fill"></i> Clock in'; }
  });
  $('[data-out]', root)?.addEventListener('click', async (e) => {
    const { confirmBox } = await import('../lib.js'); if (!(await confirmBox('Clock out now? Make sure you have sent your work report first.', { ok: 'Clock out' }))) return;
    err.hidden = true; const btn = e.currentTarget; btn.disabled = true;
    try { const c = await getPosition(); const r = await api('/api/field/clock-out', { body: { lat: c.latitude, lng: c.longitude, accuracy: c.accuracy } }); stopTracking(); toast(`Clocked out · ${r.hours}h on shift`); ctxFn(ctx); }
    catch (ex) { showErr(ex.message); btn.disabled = false; }
  });
  if (open) startTracking((r) => { const el = $('[data-trk]', root); if (el) el.textContent = T.status; });
  window.addEventListener('vs:ping', () => { const el = $('[data-trk]'); if (el) el.textContent = T.status; });
  // report
  let files = [];
  $('#r-prog', root).oninput = (e) => ($('[data-pv]', root).textContent = e.target.value + '%');
  const renderFiles = () => ($('[data-previews]', root).innerHTML = files.map((f, i) => `<div style="position:relative"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" class="icon-btn" data-rmf="${i}" style="position:absolute;top:2px;right:2px;background:#fff;width:26px;height:26px" aria-label="Remove"><i class="ri-close-line"></i></button></div>`).join(''));
  $('[data-photos]', root).onchange = async (e) => {
    for (const f of e.target.files) files.push(await compressImage(f, 1600, .8));
    files = files.slice(0, 10); e.target.value = ''; renderFiles();
  };
  $('[data-previews]', root).onclick = (e) => { const b = e.target.closest('[data-rmf]'); if (b) { files.splice(Number(b.dataset.rmf), 1); renderFiles(); } };
  $('[data-report]', root).onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target); fd.delete('photos');
    files.forEach((f) => fd.append('photos', f));
    if (T.lastPos) { fd.append('lat', T.lastPos.latitude); fd.append('lng', T.lastPos.longitude); }
    const btn = e.target.querySelector('[type=submit]'); btn.classList.add('loading');
    try { await api('/api/field/report', { body: fd }); toast('Report submitted — thank you!'); files = []; ctxFn(ctx); } catch (ex) { fail(ex); btn.classList.remove('loading'); }
  };
}
