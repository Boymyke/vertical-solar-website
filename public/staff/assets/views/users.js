import { $, $$, api, esc, datetime, ago, toast, fail, table, statusPill, modal, confirmBox, copy, initials, validate, waLink } from '../lib.js';
import { staffProfile } from './attendance.js';

const PRESETS = {
  'Field technician': ['field'],
  'Site supervisor': ['field', 'installations', 'attendance', 'maintenance'],
  'Sales rep': ['dashboard', 'crm', 'followups', 'quotes', 'ai', 'chats'],
  'Customer care': ['dashboard', 'crm', 'followups', 'support', 'maintenance', 'chats', 'email'],
  'Store keeper': ['inventory', 'shop'],
  'Marketing': ['dashboard', 'website', 'blog', 'analytics', 'email', 'chats'],
  'Manager (most sections)': null,
};

export default async function ({ root, user, setTitle }) {
  setTitle('Staff logins', 'You are the only administrator. Create logins for staff, choose what each person can use, and switch access off instantly.', '<button class="btn btn-primary" data-new><i class="ri-user-add-line"></i> Add staff member</button>');
  root.innerHTML = `<div class="tabs"><button class="on" data-t="u">People</button><button data-t="a">Activity log</button></div><div data-tab></div>`;
  const me = await api('/api/auth/me');
  const MODS = me.modules;
  const tab = $('[data-tab]', root);
  async function users() {
    const r = await api('/api/admin/users');
    tab.innerHTML = `<div class="card">${table({ rows: r.items, onRow: true, empty: 'No staff yet\nAdd a staff member to give them a login.', emptyIcon: 'ri-team-line', columns: [
      { label: 'Person', render: (u) => `<div class="person">${u.avatar ? `<img class="avatar" src="${esc(u.avatar)}" alt="">` : `<span class="avatar">${esc(initials(u.name))}</span>`}<div><strong>${esc(u.name)}</strong><span>${esc(u.email)}</span></div></div>` },
      { label: 'Role', render: (u) => `<span class="pill ${u.role === 'owner' ? 'ink' : ''}">${u.role === 'owner' ? 'Administrator' : 'Staff'}</span><div class="muted small">${esc(u.job_title || '')}</div>` },
      { label: 'Can use', render: (u) => (u.role === 'owner' ? '<span class="small">Everything</span>' : `<span class="small">${u.permissions.map((p) => esc(MODS[p]?.split(' (')[0] || p)).join(', ') || 'Nothing yet'}</span>`) },
      { label: 'Profile', render: (u) => (u.role === 'owner' ? '—' : u.profile_complete ? '<span class="pill ok">Complete</span>' : '<span class="pill warn">Not yet</span>') },
      { label: 'Last sign-in', render: (u) => (u.last_login_at ? ago(u.last_login_at) : 'Never') }, { label: 'Status', render: (u) => (u.active ? '<span class="pill ok">Active</span>' : '<span class="pill bad">Revoked</span>') }] })}</div>`;
    $$('tr[data-row]', tab).forEach((tr) => (tr.onclick = () => edit(r.items[tr.dataset.row])));
  }
  const OWNER_ONLY = ['users', 'settings'];
  function permGrid(selected) {
    return `<div class="row" style="margin-bottom:10px"><span class="small muted">Quick start:</span>${Object.keys(PRESETS).map((p) => `<button type="button" class="btn btn-sm" data-preset="${esc(p)}">${esc(p)}</button>`).join('')}</div>
      <div class="grid g-2" style="gap:6px">${Object.entries(MODS).filter(([k]) => !OWNER_ONLY.includes(k)).map(([k, l]) => `<label class="check" style="padding:9px 10px;border:1px solid var(--line);border-radius:12px"><input type="checkbox" name="perm" value="${k}" ${selected.includes(k) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>
      <p class="hint small muted" style="margin:8px 0 0">Staff logins and company settings stay with you, the administrator.</p>`;
  }
  function bindPresets(el) { $$('[data-preset]', el).forEach((b) => (b.onclick = () => { const v = PRESETS[b.dataset.preset]; $$('[name=perm]', el).forEach((c) => { c.checked = v === null ? !['field'].includes(c.value) : v.includes(c.value); }); })); }
  // After creating a login (or resetting a password): share a one-time sign-in link, with the temporary password as a fallback.
  function showPassword(u, r, title) {
    const link = r.invite_token ? `${location.origin}/staff/#/welcome/${r.invite_token}` : '';
    const first = (u.name || '').split(' ')[0] || 'there';
    const msg = `Hi ${first}, here is your Vertical Solar staff app login.\n\nOpen this link on your phone to choose your password:\n${link}\n\nYour login email: ${u.email}\nThe link works until you set your password (at most 7 days). Keep it private.`;
    const wa = u.phone ? waLink(u.phone, msg) : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    const { el } = modal({ title, size: 'narrow', body: `<div class="stack">
      <div class="share-hero"><span class="avatar lg">${esc(initials(u.name || u.email))}</span><div><strong>${esc(u.name || u.email)}</strong><span class="muted small">${esc(u.email)}</span></div></div>
      ${link ? `<p style="margin:0">Send ${esc(first)} this sign-in link. It lets them choose their own password and <strong>stops working as soon as they do</strong> (or after 7 days).</p>
      <div class="field"><label for="inv-link">Sign-in link</label><div class="row"><input class="input grow" id="inv-link" readonly value="${esc(link)}"><button class="btn" type="button" data-cplink title="Copy link" aria-label="Copy link"><i class="ri-file-copy-line"></i></button></div></div>
      <div class="row" style="flex-wrap:wrap"><a class="btn btn-wa" href="${esc(wa)}" target="_blank" rel="noopener"><i class="ri-whatsapp-line"></i> Send on WhatsApp</a>${navigator.share ? '<button class="btn" type="button" data-native><i class="ri-share-line"></i> Share…</button>' : ''}<button class="btn" type="button" data-cpmsg><i class="ri-chat-copy-line"></i> Copy message</button></div>` : ''}
      <details class="disclose"${link ? '' : ' open'}><summary>Or give them a temporary password</summary>
        <div class="stack" style="margin-top:10px"><div class="field"><label>Login page</label><input class="input" readonly value="${esc(location.origin)}/staff"></div>
        <div class="field"><label>Temporary password</label><div class="row"><input class="input grow" readonly value="${esc(r.temporary_password)}" style="font-family:ui-monospace,monospace"><button class="btn" type="button" data-cp title="Copy" aria-label="Copy temporary password"><i class="ri-file-copy-line"></i></button></div></div>
        <p class="muted small" style="margin:0">They will be asked to choose a new password the first time they sign in. Shown only once.</p></div></details>
      <div class="alert info"><i class="ri-shield-keyhole-line"></i><span>Send these privately — never in a group chat.</span></div></div>` });
    $('[data-cplink]', el)?.addEventListener('click', () => copy(link));
    $('[data-cpmsg]', el)?.addEventListener('click', () => copy(msg));
    $('[data-native]', el)?.addEventListener('click', () => navigator.share({ title: 'Vertical Solar staff login', text: msg }).catch(() => {}));
    $('[data-cp]', el).onclick = () => copy(`Vertical Solar staff app\nLogin: ${location.origin}/staff\nEmail: ${u.email}\nTemporary password: ${r.temporary_password}`);
  }
  // Job title: pick from the list, or add a new one.
  let titles = null;
  const titleField = async (current = '') => {
    if (!titles) titles = (await api('/api/admin/job-titles').catch(() => ({ items: [] }))).items;
    const list = current && !titles.some((t) => t.toLowerCase() === current.toLowerCase()) ? [...titles, current] : titles;
    return `<div class="field"><label for="jt">Job title</label><select class="input" id="jt" name="job_title_pick"><option value="">Choose a job title…</option>${list.map((t) => `<option ${t === current ? 'selected' : ''}>${esc(t)}</option>`).join('')}<option value="__new">+ Add a new job title…</option></select>
      <input class="input" name="job_title_new" placeholder="New job title, e.g. Battery technician" maxlength="80" hidden style="margin-top:6px"></div>`;
  };
  const bindTitle = (el) => { const sel = $('[name=job_title_pick]', el), inp = $('[name=job_title_new]', el); sel.addEventListener('change', () => { inp.hidden = sel.value !== '__new'; inp.required = !inp.hidden; if (!inp.hidden) inp.focus(); }); };
  const readTitle = (fd) => (fd.get('job_title_pick') === '__new' ? String(fd.get('job_title_new') || '').trim() : fd.get('job_title_pick'));
  $('[data-new]').onclick = async () => {
    const { el, close } = modal({ title: 'Add staff member', size: 'wide', body: `<form class="stack" data-f><div class="form-grid"><div class="field"><label>Full name *</label><input class="input" name="name" required></div><div class="field"><label>Work email *</label><input class="input" name="email" type="email" required></div>
      <div class="field"><label>Phone / WhatsApp</label><input class="input" name="phone" type="tel" placeholder="0803 123 4567"></div>${await titleField()}
      </div><div class="alert info"><i class="ri-information-line"></i><span>The first time they sign in, they choose their own password and add their photo, contact and emergency details.</span></div>
      <div><div class="label" style="margin-bottom:6px">What can they use?</div>${permGrid(['field'])}</div></form>`, footer: '<button class="btn btn-primary" data-ok><i class="ri-user-add-line"></i> Create login</button>' });
    bindPresets(el); bindTitle(el);
    $('[data-ok]', el).onclick = async (e) => {
      const f = $('[data-f]', el); if (!validate(f)) return;
      const fd = new FormData(f); const busyBtn = e.currentTarget; busyBtn.classList.add('loading');
      const body = { name: fd.get('name'), email: fd.get('email'), phone: fd.get('phone'), job_title: readTitle(fd), permissions: fd.getAll('perm') };
      try { const r = await api('/api/admin/users', { body }); titles = null; close(); users(); showPassword(body, r, 'Login created'); } catch (err) { fail(err); busyBtn.classList.remove('loading'); }
    };
  };
  async function edit(u) {
    const self = u.id === me.id, owner = u.role === 'owner';
    const { el, close } = modal({ title: u.name, size: 'wide', body: `<form class="stack" data-f><div class="form-grid"><div class="field"><label>Full name</label><input class="input" name="name" value="${esc(u.name)}"></div><div class="field"><label>Work email</label><input class="input" name="email" type="email" value="${esc(u.email)}"></div>
      <div class="field"><label>Phone / WhatsApp</label><input class="input" name="phone" type="tel" value="${esc(u.phone || '')}"></div>${await titleField(u.job_title || '')}</div>
      ${owner ? '<div class="alert info"><i class="ri-vip-crown-line"></i><span>You are the administrator and always have full access.</span></div>' : `<div class="row"><button type="button" class="btn btn-sm" data-view-profile><i class="ri-contacts-book-line"></i> View their profile</button></div><div><div class="label" style="margin-bottom:6px">What can they use?</div>${permGrid(u.permissions)}</div>`}</form>`,
      footer: `${!owner && !self ? `<button class="btn ${u.active ? 'btn-danger' : ''}" data-toggle>${u.active ? '<i class="ri-forbid-line"></i> Revoke access' : '<i class="ri-checkbox-circle-line"></i> Restore access'}</button><button class="btn btn-ghost" data-delete title="Delete user"><i class="ri-delete-bin-line"></i></button>` : ''}<button class="btn" data-reset style="margin-left:auto"><i class="ri-key-2-line"></i> Reset password</button><button class="btn btn-primary" data-ok>Save</button>` });
    bindPresets(el); bindTitle(el);
    $('[data-view-profile]', el)?.addEventListener('click', () => staffProfile(u.id));
    $('[data-ok]', el).onclick = async () => {
      const f = $('[data-f]', el); if (!validate(f)) return;
      const fd = new FormData(f);
      const body = { name: fd.get('name'), email: fd.get('email'), phone: fd.get('phone'), job_title: readTitle(fd) };
      if (!owner) body.permissions = fd.getAll('perm');
      try { await api(`/api/admin/users/${u.id}`, { method: 'PUT', body }); toast('Saved — they will need to sign in again if access changed'); close(); users(); } catch (err) { fail(err); }
    };
    $('[data-toggle]', el)?.addEventListener('click', async () => { if (u.active && !(await confirmBox(`Revoke ${u.name}'s access? They will be signed out immediately.`, { danger: true, ok: 'Revoke' }))) return; try { await api(`/api/admin/users/${u.id}`, { method: 'PUT', body: { active: u.active ? 0 : 1 } }); toast(u.active ? 'Access revoked' : 'Access restored'); close(); users(); } catch (err) { fail(err); } });
    $('[data-delete]', el)?.addEventListener('click', async () => { if (!(await confirmBox(`Delete ${u.name} permanently? Their records stay, but the login is removed. Revoking is usually better.`, { danger: true, ok: 'Delete' }))) return; try { await api(`/api/admin/users/${u.id}`, { method: 'DELETE' }); close(); users(); } catch (err) { fail(err); } });
    $('[data-reset]', el).onclick = async () => { if (!(await confirmBox(`Generate a new temporary password for ${u.name}? Their current password stops working.`))) return; try { const r = await api(`/api/admin/users/${u.id}/reset-password`, { method: 'POST' }); close(); showPassword(u, r, 'New sign-in details'); } catch (err) { fail(err); } };
  }
  async function audit() {
    const r = await api('/api/admin/audit');
    tab.innerHTML = `<div class="card">${table({ rows: r.items, empty: 'No activity yet.', columns: [{ label: 'When', render: (a) => datetime(a.created_at) }, { label: 'Who', render: (a) => esc(a.user_name || '—') }, { label: 'Action', render: (a) => `<span class="pill">${esc(a.action.replace(/_/g, ' '))}</span>` }, { label: 'Record', render: (a) => `${esc(a.entity || '')} ${esc(a.entity_id || '')}` }, { label: 'IP', render: (a) => `<span class="small muted">${esc(a.ip || '')}</span>` }] })}</div>`;
  }
  $$('[data-t]', root).forEach((b) => (b.onclick = () => { $$('[data-t]', root).forEach((x) => x.classList.toggle('on', x === b)); b.dataset.t === 'u' ? users() : audit(); }));
  users();
}
