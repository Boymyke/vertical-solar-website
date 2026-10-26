// My profile: photo, personal and emergency details, password, phone alerts.
// The same form is shown full-screen the first time a staff member signs in.
import { $, api, esc, toast, fail, initials, uploadFiles, pickFiles, validate } from '../lib.js';

const STATES = ['Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'];
const opt = (list, v) => list.map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');

export async function profileForm(mount, { onboarding = false, user, onDone } = {}) {
  const [me, site] = await Promise.all([api('/api/auth/profile'), fetch('/api/public/site').then((r) => r.json()).catch(() => null)]);
  const p = me.profile || {};
  const branches = (site?.branches || []).map((b) => b.name.replace(/^Vertical Solar\s+[—-]\s+/, ''));
  let avatar = me.avatar || '';
  const owner = me.role === 'owner';
  mount.innerHTML = `
  ${onboarding ? `<div class="card" style="margin-bottom:16px"><div class="card-b"><h1>Welcome, ${esc(me.name.split(' ')[0])}!</h1><p class="muted" style="margin:6px 0 0">Before you start, add your photo and a few details. The administrator uses them to know who is on each site and who to call in an emergency. Only the administrator can see this information.</p><div class="steps-dots" style="margin-top:16px"><span class="on"></span><span class="on"></span><span></span></div><span class="small muted">Step 2 of 3 — password done, now your profile</span></div></div>` : ''}
  <form class="stack" data-profile novalidate>
    <div class="card"><div class="card-h"><h2>Your photo</h2>${onboarding ? '<span class="pill warn">Required</span>' : ''}</div>
      <div class="card-b"><div class="photo-pick"><span data-av>${avatar ? `<img class="avatar xl" src="${esc(avatar)}" alt="Your photo">` : `<span class="avatar xl">${esc(initials(me.name))}</span>`}</span>
        <div class="stack" style="gap:8px"><div class="row"><button class="btn btn-primary" type="button" data-photo="user"><i class="ri-camera-line"></i> Take a photo</button><button class="btn" type="button" data-photo=""><i class="ri-image-add-line"></i> Choose a picture</button></div>
        <span class="hint muted small">A clear photo of your face, like a passport photo. It appears on your attendance records and job sites.</span></div></div></div></div>
    <div class="card"><div class="card-h"><h2>Personal details</h2></div><div class="card-b"><div class="form-grid">
      <div class="field"><label for="pf-name">Full name</label><input class="input" id="pf-name" name="name" required value="${esc(me.name)}" autocomplete="name"></div>
      <div class="field"><label for="pf-phone">Phone / WhatsApp</label><input class="input" id="pf-phone" name="phone" type="tel" ${owner ? '' : 'required'} value="${esc(me.phone || '')}" placeholder="0803 123 4567" autocomplete="tel"></div>
      <div class="field"><label for="pf-dob">Date of birth</label><input class="input" id="pf-dob" name="date_of_birth" type="date" ${owner ? '' : 'required'} value="${esc(p.date_of_birth || '')}" max="${new Date(Date.now() - 15 * 365.25 * 864e5).toISOString().slice(0, 10)}"></div>
      <div class="field"><label for="pf-gender">Gender <span class="opt">(optional)</span></label><select class="input" id="pf-gender" name="gender"><option value="">Prefer not to say</option>${opt(['Female', 'Male'], p.gender)}</select></div>
      <div class="field full"><label for="pf-addr">Home address</label><div class="place-field"><input class="input" id="pf-addr" name="address" ${owner ? '' : 'required'} value="${esc(p.address || '')}" placeholder="Start typing your street or area" data-place-plain></div><span class="hint">Pick from the list so the address is confirmed.</span></div>
      <div class="field"><label for="pf-state">State of origin <span class="opt">(optional)</span></label><select class="input" id="pf-state" name="state_of_origin"><option value="">Choose…</option>${opt(STATES, p.state_of_origin)}</select></div>
      <div class="field"><label for="pf-marital">Marital status <span class="opt">(optional)</span></label><select class="input" id="pf-marital" name="marital_status"><option value="">Prefer not to say</option>${opt(['Single', 'Married', 'Other'], p.marital_status)}</select></div>
    </div></div></div>
    <div class="card"><div class="card-h"><div><h2>Emergency contact</h2><div class="sub">Who we call if something happens to you on site</div></div></div><div class="card-b"><div class="form-grid">
      <div class="field"><label for="pf-en">Name</label><input class="input" id="pf-en" name="emergency_name" ${owner ? '' : 'required'} value="${esc(p.emergency_name || '')}"></div>
      <div class="field"><label for="pf-ep">Phone</label><input class="input" id="pf-ep" name="emergency_phone" type="tel" ${owner ? '' : 'required'} value="${esc(p.emergency_phone || '')}" placeholder="0803 123 4567"></div>
      <div class="field"><label for="pf-er">Relationship <span class="opt">(optional)</span></label><select class="input" id="pf-er" name="emergency_relation"><option value="">Choose…</option>${opt(['Spouse', 'Parent', 'Brother / sister', 'Child', 'Relative', 'Friend'], p.emergency_relation)}</select></div>
    </div></div></div>
    <div class="card"><div class="card-h"><h2>Work</h2></div><div class="card-b"><div class="form-grid">
      <div class="field"><label>Job title</label><input class="input" value="${esc(me.job_title || (owner ? 'Administrator' : ''))}" readonly><span class="hint">Set by the administrator.</span></div>
      <div class="field"><label for="pf-branch">Branch</label><select class="input" id="pf-branch" name="branch"><option value="">Choose…</option>${opt(branches, p.branch)}</select></div>
      <div class="field"><label for="pf-start">Date you started <span class="opt">(optional)</span></label><input class="input" id="pf-start" name="start_date" type="date" value="${esc(p.start_date || '')}"></div>
      <div class="field full"><label for="pf-skills">Skills <span class="opt">(optional)</span></label><textarea class="input" id="pf-skills" name="skills" rows="2" placeholder="e.g. Panel mounting, inverter wiring, battery installation, driving">${esc(p.skills || '')}</textarea></div>
      <div class="field full"><label for="pf-certs">Certificates and training <span class="opt">(optional)</span></label><textarea class="input" id="pf-certs" name="certifications" rows="2" placeholder="e.g. NABCEP PV Associate, working at height, first aid">${esc(p.certifications || '')}</textarea></div>
    </div></div></div>
    <div class="alert err" data-err hidden></div>
    <div class="row"><button class="btn btn-primary btn-lg" type="submit"><i class="ri-check-line"></i> ${onboarding ? 'Save and start' : 'Save profile'}</button>${onboarding ? '<button class="btn btn-ghost" type="button" data-signout>Sign out</button>' : ''}</div>
  </form>`;
  const form = $('[data-profile]', mount), err = $('[data-err]', mount);
  import('/assets/js/places.js').then(({ attachPlace }) => attachPlace($('#pf-addr', mount)));
  mount.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-photo]');
    if (b) {
      const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; if (b.dataset.photo) input.capture = b.dataset.photo;
      input.onchange = async () => {
        const f = input.files[0]; if (!f) return;
        b.classList.add('loading');
        try { const r = await uploadFiles([f], 'staff'); avatar = r.url; $('[data-av]', mount).innerHTML = `<img class="avatar xl" src="${esc(avatar)}" alt="Your photo">`; toast('Photo added'); $('[data-photo-err]', mount)?.remove(); $('[data-photo]', mount)?.closest('.card')?.classList.remove('has-error'); }
        catch (ex) { fail(ex); } finally { b.classList.remove('loading'); }
      };
      input.click();
    }
    if (e.target.closest('[data-signout]')) { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); location.hash = '#/login'; location.reload(); }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.hidden = true;
    const photoCard = $('[data-photo]', mount)?.closest('.card');
    const noPhoto = !owner && !avatar;
    photoCard?.classList.toggle('has-error', noPhoto);
    const okFields = validate(form);
    if (noPhoto) { let m = $('[data-photo-err]', mount); if (!m) photoCard?.querySelector('.card-b')?.insertAdjacentHTML('beforeend', '<span class="field-error" data-photo-err><i class="ri-error-warning-fill" aria-hidden="true"></i> Add a clear photo of your face</span>'); if (okFields) { photoCard?.scrollIntoView({ block: 'center', behavior: 'smooth' }); toast('Add your photo to continue', 'err'); } }
    if (noPhoto || !okFields) return;
    const fd = new FormData(form);
    const keys = ['date_of_birth', 'gender', 'address', 'state_of_origin', 'marital_status', 'emergency_name', 'emergency_phone', 'emergency_relation', 'branch', 'start_date', 'skills', 'certifications'];
    const btn = $('[type=submit]', form); btn.classList.add('loading');
    try {
      const r = await api('/api/auth/profile', { method: 'PUT', body: { name: fd.get('name'), phone: fd.get('phone'), avatar, profile: Object.fromEntries(keys.map((k) => [k, fd.get(k) || ''])) } });
      if (onboarding && !r.complete) throw new Error('Please fill in every required field.');
      toast(onboarding ? 'Thank you — you are all set' : 'Profile saved');
      onDone?.(r);
    } catch (ex) { err.hidden = false; err.innerHTML = `<i class="ri-error-warning-line"></i><span>${esc(ex.message)}</span>`; }
    finally { btn.classList.remove('loading'); }
  });
}

export default async function ({ root, setTitle, user }) {
  setTitle('My profile', 'Your photo, details, password and alerts');
  root.innerHTML = `<div class="grid g-21" style="align-items:start"><div data-pf></div><div class="stack">
    <div class="card"><div class="card-h"><h2>Password</h2></div><form class="card-b stack" data-pw><div class="field"><label for="pw-cur">Current password</label><input class="input" id="pw-cur" type="password" name="current" required autocomplete="current-password"></div>
      <div class="field"><label for="pw-new">New password</label><input class="input" id="pw-new" type="password" name="password" required minlength="10" autocomplete="new-password"><span class="hint">At least 10 characters with upper and lower case letters and a number. Your other devices will be signed out.</span></div><div><button class="btn btn-primary">Change password</button></div></form></div>
    <div class="card"><div class="card-h"><h2>Alerts on this device</h2></div><div class="card-b stack"><p class="muted" style="margin:0">Get reminders and urgent alerts as phone notifications, even when the app is closed.</p><div data-push-state></div></div></div>
    <div class="card"><div class="card-h"><h2>Login email</h2></div><div class="card-b"><strong>${esc(user.email)}</strong><p class="muted small" style="margin:6px 0 0">${user.role === 'owner' ? 'To change it, open Staff logins and click your own row.' : 'Only the administrator can change login emails.'}</p></div></div>
  </div></div>`;
  await profileForm($('[data-pf]', root), { user, onDone: () => {} });
  $('[data-pw]', root).onsubmit = async (e) => { e.preventDefault(); const fd = new FormData(e.target); try { await api('/api/auth/password', { body: { current: fd.get('current'), password: fd.get('password') } }); toast('Password changed'); e.target.reset(); } catch (err) { fail(err); } };
  const ps = $('[data-push-state]', root);
  const draw = () => {
    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    const st = supported ? Notification.permission : 'unsupported';
    ps.innerHTML = st === 'granted' ? '<span class="pill ok"><i class="ri-checkbox-circle-line"></i> Alerts are on</span>'
      : st === 'denied' ? '<div class="alert warn"><i class="ri-notification-off-line"></i><span>Alerts are blocked in this browser. Open the browser\'s site settings for this page and allow notifications.</span></div>'
      : st === 'unsupported' ? '<div class="alert info"><i class="ri-smartphone-line"></i><span>This browser can\'t show alerts. On iPhone, tap Share → Add to Home Screen, then open the app from your home screen.</span></div>'
      : '<button class="btn btn-primary" type="button" data-on><i class="ri-notification-badge-line"></i> Turn on alerts</button>';
    $('[data-on]', ps)?.addEventListener('click', async () => { await window.__vsEnablePush?.(true); draw(); });
  };
  draw();
}
