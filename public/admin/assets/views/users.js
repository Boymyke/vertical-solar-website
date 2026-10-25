import { $, $$, api, esc, datetime, ago, toast, fail, table, statusPill, modal, confirmBox, copy } from '../lib.js';

const PRESETS = {
  'Field technician': ['field'],
  'Site supervisor': ['field', 'installations', 'attendance', 'maintenance'],
  'Sales rep': ['dashboard', 'crm', 'followups', 'quotes', 'ai', 'chats'],
  'Customer care': ['dashboard', 'crm', 'followups', 'support', 'maintenance', 'chats', 'email'],
  'Store keeper': ['inventory', 'shop'],
  'Marketing': ['dashboard', 'website', 'blog', 'analytics', 'email', 'chats'],
  'Manager (everything)': null,
};

export default async function ({ root, user, setTitle }) {
  setTitle('Users & access', 'Create staff logins, choose what each person can see, and revoke access instantly', '<button class="btn btn-primary" data-new><i class="ri-user-add-line"></i> Add user</button>');
  root.innerHTML = `<div class="tabs"><button class="on" data-t="u">People</button><button data-t="a">Audit log</button></div><div data-tab></div>`;
  const me = await api('/api/auth/me');
  const MODS = me.modules;
  const tab = $('[data-tab]', root);
  async function users() {
    const r = await api('/api/admin/users');
    tab.innerHTML = `<div class="card">${table({ rows: r.items, onRow: true, columns: [
      { label: 'Person', render: (u) => `<div class="person"><span class="avatar">${esc(u.name.slice(0, 1))}</span><div><strong>${esc(u.name)}</strong><span>${esc(u.email)}</span></div></div>` },
      { label: 'Role', render: (u) => `<span class="pill ${u.role === 'owner' ? 'lime' : u.role === 'admin' ? 'info' : ''}">${esc(u.role)}</span><div class="muted small">${esc(u.job_title || '')}</div>` },
      { label: 'Access', render: (u) => (u.role === 'owner' ? '<span class="small">Everything</span>' : `<span class="small">${u.permissions.map((p) => esc(MODS[p]?.split(' (')[0] || p)).join(', ') || 'None'}</span>`) },
      { label: 'Last sign-in', render: (u) => ago(u.last_login_at) }, { label: 'Status', render: (u) => (u.active ? '<span class="pill ok">Active</span>' : '<span class="pill bad">Revoked</span>') }] })}</div>`;
    $$('tr[data-row]', tab).forEach((tr) => (tr.onclick = () => edit(r.items[tr.dataset.row])));
  }
  function permGrid(selected, role) {
    const canGrant = (k) => me.role === 'owner' || me.permissions.includes(k);
    return `<div class="row" style="margin-bottom:8px"><span class="small muted">Quick presets:</span>${Object.keys(PRESETS).map((p) => `<button type="button" class="btn btn-sm" data-preset="${esc(p)}">${esc(p)}</button>`).join('')}</div>
      <div class="grid g-2" style="gap:6px">${Object.entries(MODS).map(([k, l]) => `<label class="check" style="padding:8px;border:1px solid var(--line);border-radius:10px;${canGrant(k) ? '' : 'opacity:.5'}"><input type="checkbox" name="perm" value="${k}" ${selected.includes(k) ? 'checked' : ''} ${canGrant(k) ? '' : 'disabled'}><span>${esc(l)}</span></label>`).join('')}</div>`;
  }
  function bindPresets(el) { $$('[data-preset]', el).forEach((b) => (b.onclick = () => { const v = PRESETS[b.dataset.preset]; $$('[name=perm]', el).forEach((c) => { if (!c.disabled) c.checked = v === null ? true : v.includes(c.value); }); if (v === null) $('[name=role]', el).value = 'admin'; })); }
  function showPassword(email, pw, title) {
    const { el } = modal({ title, size: 'narrow', body: `<div class="stack"><div class="alert ok"><i class="ri-key-2-line"></i><span>Share these login details privately (in person or by direct message). They will be asked to choose a new password on first sign-in.</span></div>
      <div class="field"><label>Login page</label><input class="input" readonly value="${esc(location.origin)}/admin"></div><div class="field"><label>Email</label><input class="input" readonly value="${esc(email)}"></div>
      <div class="field"><label>Temporary password</label><div class="row"><input class="input grow" readonly value="${esc(pw)}" style="font-family:ui-monospace,monospace"><button class="btn" data-cp><i class="ri-file-copy-line"></i></button></div></div>
      <p class="muted small" style="margin:0">This password is shown only once.</p></div>` });
    $('[data-cp]', el).onclick = () => copy(`Vertical Solar CRM\nLogin: ${location.origin}/admin\nEmail: ${email}\nTemporary password: ${pw}`);
  }
  $('[data-new]').onclick = () => {
    const { el, close } = modal({ title: 'Add user', size: 'wide', body: `<form class="stack" data-f><div class="form-grid"><div class="field"><label>Full name *</label><input class="input" name="name" required></div><div class="field"><label>Work email *</label><input class="input" name="email" type="email" required></div>
      <div class="field"><label>Phone</label><input class="input" name="phone"></div><div class="field"><label>Job title</label><input class="input" name="job_title" placeholder="Installer, Sales rep…"></div>
      <div class="field"><label>Account type</label><select class="input" name="role"><option value="staff">Staff</option><option value="admin">Admin</option></select><span class="hint">Admins with "Users, roles &amp; access" can create other users. They can only grant sections they have themselves.</span></div></div>
      <div><div class="label" style="margin-bottom:6px">What can they use?</div>${permGrid(['field'], 'staff')}</div></form>`, footer: '<button class="btn btn-primary" data-ok><i class="ri-user-add-line"></i> Create login</button>' });
    bindPresets(el);
    $('[data-ok]', el).onclick = async () => {
      const f = $('[data-f]', el); if (!f.reportValidity()) return;
      const fd = new FormData(f);
      try { const r = await api('/api/admin/users', { body: { name: fd.get('name'), email: fd.get('email'), phone: fd.get('phone'), job_title: fd.get('job_title'), role: fd.get('role'), permissions: fd.getAll('perm') } }); close(); users(); showPassword(fd.get('email'), r.temporary_password, 'Login created'); } catch (err) { fail(err); }
    };
  };
  function edit(u) {
    const self = u.id === me.id, owner = u.role === 'owner';
    const { el, close } = modal({ title: u.name, size: 'wide', body: `<form class="stack" data-f><div class="form-grid"><div class="field"><label>Full name</label><input class="input" name="name" value="${esc(u.name)}"></div><div class="field"><label>Work email</label><input class="input" name="email" type="email" value="${esc(u.email)}"></div>
      <div class="field"><label>Phone</label><input class="input" name="phone" value="${esc(u.phone || '')}"></div><div class="field"><label>Job title</label><input class="input" name="job_title" value="${esc(u.job_title || '')}"></div>
      ${owner ? '' : `<div class="field"><label>Account type</label><select class="input" name="role"><option value="staff" ${u.role === 'staff' ? 'selected' : ''}>Staff</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option></select></div>`}</div>
      ${owner ? '<div class="alert info"><i class="ri-vip-crown-line"></i><span>The owner always has full access.</span></div>' : `<div><div class="label" style="margin-bottom:6px">Access</div>${permGrid(u.permissions, u.role)}</div>`}</form>`,
      footer: `${!owner && !self ? `<button class="btn ${u.active ? 'btn-danger' : ''}" data-toggle>${u.active ? '<i class="ri-forbid-line"></i> Revoke access' : '<i class="ri-checkbox-circle-line"></i> Restore access'}</button><button class="btn btn-ghost" data-delete title="Delete user"><i class="ri-delete-bin-line"></i></button>` : ''}<button class="btn" data-reset style="margin-left:auto"><i class="ri-key-2-line"></i> Reset password</button><button class="btn btn-primary" data-ok>Save</button>` });
    bindPresets(el);
    $('[data-ok]', el).onclick = async () => {
      const fd = new FormData($('[data-f]', el));
      const body = { name: fd.get('name'), email: fd.get('email'), phone: fd.get('phone'), job_title: fd.get('job_title') };
      if (!owner) { body.role = fd.get('role'); body.permissions = fd.getAll('perm'); }
      try { await api(`/api/admin/users/${u.id}`, { method: 'PUT', body }); toast('Saved — they will need to sign in again if access changed'); close(); users(); } catch (err) { fail(err); }
    };
    $('[data-toggle]', el)?.addEventListener('click', async () => { if (u.active && !(await confirmBox(`Revoke ${u.name}'s access? They will be signed out immediately.`, { danger: true, ok: 'Revoke' }))) return; try { await api(`/api/admin/users/${u.id}`, { method: 'PUT', body: { active: u.active ? 0 : 1 } }); toast(u.active ? 'Access revoked' : 'Access restored'); close(); users(); } catch (err) { fail(err); } });
    $('[data-delete]', el)?.addEventListener('click', async () => { if (!(await confirmBox(`Delete ${u.name} permanently? Their records stay, but the login is removed. Revoking is usually better.`, { danger: true, ok: 'Delete' }))) return; try { await api(`/api/admin/users/${u.id}`, { method: 'DELETE' }); close(); users(); } catch (err) { fail(err); } });
    $('[data-reset]', el).onclick = async () => { if (!(await confirmBox(`Generate a new temporary password for ${u.name}? Their current password stops working.`))) return; try { const r = await api(`/api/admin/users/${u.id}/reset-password`, { method: 'POST' }); close(); showPassword(u.email, r.temporary_password, 'New temporary password'); } catch (err) { fail(err); } };
  }
  async function audit() {
    const r = await api('/api/admin/audit');
    tab.innerHTML = `<div class="card">${table({ rows: r.items, empty: 'No activity yet.', columns: [{ label: 'When', render: (a) => datetime(a.created_at) }, { label: 'Who', render: (a) => esc(a.user_name || '—') }, { label: 'Action', render: (a) => `<span class="pill">${esc(a.action.replace(/_/g, ' '))}</span>` }, { label: 'Record', render: (a) => `${esc(a.entity || '')} ${esc(a.entity_id || '')}` }, { label: 'IP', render: (a) => `<span class="small muted">${esc(a.ip || '')}</span>` }] })}</div>`;
  }
  $$('[data-t]', root).forEach((b) => (b.onclick = () => { $$('[data-t]', root).forEach((x) => x.classList.toggle('on', x === b)); b.dataset.t === 'u' ? users() : audit(); }));
  users();
}
