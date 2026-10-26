// Shared: set times for staff to be on a job site, and list those schedules.
import { $, $$, api, esc, toast, fail, modal, initials, emptyState, confirmBox } from '../lib.js';

const lagosDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }); // YYYY-MM-DD
const prettyDay = (utc) => new Date(utc.replace(' ', 'T') + 'Z').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });
const ST = { arrived: ['ok', 'Arrived'], late: ['warn', 'Running late'], missed: ['bad', 'Missed'], scheduled: ['', 'Expected'] };
export const avatarOf = (u, name = u.name || u.user_name) => (u.avatar || u.user_avatar ? `<img class="avatar" src="${esc(u.avatar || u.user_avatar)}" alt="">` : `<span class="avatar">${esc(initials(name))}</span>`);

export function shiftRows(items, { showSite = true, showPerson = true } = {}) {
  if (!items.length) return '';
  return items.map((s) => {
    let [cls, txt] = ST[s.status] || ST.scheduled;
    if (s.status === 'arrived') [cls, txt] = s.late_minutes > 10 ? ['warn', `Arrived ${s.late_minutes} min late`] : ['ok', 'Arrived on time'];
    const extra = txt;
    return `<div class="li" data-shift="${s.id}"><div class="li-icon" style="width:62px;flex-direction:column;display:flex;justify-content:center;font-size:11px;line-height:1.2;text-align:center"><strong style="font-size:14px">${esc(s.start_local)}</strong><span class="muted">${esc(prettyDay(s.starts_at).replace(/,.*/, ''))}</span></div>
      ${showPerson ? avatarOf(s) : ''}<div class="body"><strong>${showPerson ? esc(s.user_name) : esc(s.site)}</strong><div class="meta">${esc(prettyDay(s.starts_at))}${s.end_local ? ` · ${esc(s.start_local)}–${esc(s.end_local)}` : ''}${showSite && showPerson ? ` · ${esc(s.site)}` : ''}${s.note ? ` · ${esc(s.note)}` : ''}</div></div>
      <span class="pill tx ${cls}">${esc(extra)}</span>${s.status === 'scheduled' || s.status === 'late' ? `<button class="icon-btn" type="button" data-cancel-shift="${s.id}" title="Cancel this schedule" aria-label="Cancel this schedule"><i class="ri-close-circle-line"></i></button>` : ''}</div>`;
  }).join('');
}

export function bindShiftActions(root, onChange) {
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cancel-shift]'); if (!b) return;
    if (!(await confirmBox('Cancel this schedule? The staff member will be told they are no longer expected.', { ok: 'Cancel schedule', danger: true }))) return;
    try { await api(`/api/admin/shifts/${b.dataset.cancelShift}`, { method: 'PUT', body: { status: 'cancelled' } }); toast('Schedule cancelled'); onChange?.(); } catch (err) { fail(err); }
  });
}

// installations: [{id,title}] (or one fixed), users: [{id,name,job_title,avatar}], assigned: Set of user ids to tick
export function scheduleModal({ installations, installationId, users, assigned = new Set(), onSaved }) {
  const today = lagosDate();
  const staff = [...users].filter((u) => u.role !== 'owner').sort((a, b) => (assigned.has(b.id) - assigned.has(a.id)) || a.name.localeCompare(b.name));
  const { el, close } = modal({ title: 'Schedule staff on site', size: 'wide', body: `<form class="stack" data-sf>
    ${installationId ? `<input type="hidden" name="installation_id" value="${installationId}">` : `<div class="field"><label for="sf-site">Job site</label><select class="input" id="sf-site" name="installation_id" required><option value="">Choose a job site…</option>${installations.map((i) => `<option value="${i.id}">${esc(i.title)}</option>`).join('')}</select></div>`}
    <div class="field"><span class="label">Who should be there?</span>${staff.length ? `<div class="grid g-2" style="gap:6px">${staff.map((u) => `<label class="check" style="padding:9px 10px;border:1px solid var(--line);border-radius:12px;align-items:center"><input type="checkbox" name="user_ids" value="${u.id}" ${assigned.has(u.id) ? 'checked' : ''}>${avatarOf(u)}<span><strong style="display:block;color:var(--heading)">${esc(u.name)}</strong><span class="small muted">${esc(u.job_title || 'Staff')}${assigned.has(u.id) ? ' · on this job' : ''}</span></span></label>`).join('')}</div>` : '<div class="alert info"><i class="ri-information-line"></i><span>Create staff logins first (Staff logins in the menu).</span></div>'}</div>
    <div class="form-grid">
      <div class="field"><label for="sf-date">First day</label><input class="input" id="sf-date" type="date" name="date" value="${today}" min="${today}" required></div>
      <div class="field"><label for="sf-days">How many days?</label><select class="input" id="sf-days" name="days">${[1, 2, 3, 4, 5, 6, 7, 10, 14].map((n) => `<option value="${n}">${n === 1 ? 'Just this day' : `${n} days in a row`}</option>`).join('')}</select></div>
      <div class="field"><label for="sf-start">Be on site by</label><input class="input" id="sf-start" type="time" name="start_time" value="08:00" required></div>
      <div class="field"><label for="sf-end">Finish around <span class="opt">(optional)</span></label><input class="input" id="sf-end" type="time" name="end_time"></div>
      <div class="field full"><label class="check"><input type="checkbox" name="skip_sunday" checked><span>Skip Sundays</span></label></div>
      <div class="field full"><label for="sf-note">Note for the crew <span class="opt">(optional)</span></label><input class="input" id="sf-note" name="note" maxlength="300" placeholder="e.g. Bring the ladder and 6mm cable. Customer's gate code is 4421."></div>
    </div>
    <div class="alert info"><i class="ri-notification-3-line"></i><span>Each person gets a reminder an hour before, a "you're running late" alert 10 minutes after the start time if they haven't clocked in, and you're alerted at 30 minutes.</span></div>
  </form>`, footer: '<button class="btn" type="button" data-x2>Cancel</button><button class="btn btn-primary" type="button" data-ok><i class="ri-calendar-check-line"></i> Save schedule</button>' });
  $('[data-x2]', el).onclick = close;
  $('[data-ok]', el).onclick = async (e) => {
    const f = $('[data-sf]', el);
    if (!f.reportValidity()) return;
    const fd = new FormData(f);
    const ids = fd.getAll('user_ids').map(Number);
    if (!ids.length) return toast('Tick at least one person', 'err');
    if (fd.get('end_time') && fd.get('end_time') <= fd.get('start_time')) { $('#sf-end', el).setAttribute('aria-invalid', 'true'); return toast('The finish time must be later than the start time', 'err'); }
    const n = Number(fd.get('days')), dates = [];
    const d0 = new Date(fd.get('date') + 'T12:00:00Z');
    for (let i = 0; dates.length < n && i < n * 2; i++) { const d = new Date(d0.getTime() + i * 864e5); if (fd.get('skip_sunday') && d.getUTCDay() === 0) continue; dates.push(d.toISOString().slice(0, 10)); }
    const busyBtn = e.currentTarget; busyBtn.classList.add('loading');
    try {
      const r = await api('/api/admin/shifts', { body: { installation_id: Number(fd.get('installation_id')), user_ids: ids, dates, start_time: fd.get('start_time'), end_time: fd.get('end_time') || null, note: fd.get('note') } });
      toast(`${r.created} schedule${r.created === 1 ? '' : 's'} saved — staff have been notified`); close(); onSaved?.();
    } catch (err) { fail(err); busyBtn.classList.remove('loading'); }
  };
}

export { emptyState, $$ };
