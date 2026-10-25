// CRM shell: authentication, permission-aware navigation, routing, notifications.
import { $, $$, api, esc, initials, toast, fail, ago, modal, debounce } from './lib.js';

const NAV = [
  { group: 'Main menu' },
  { path: 'dashboard', label: 'Dashboard', icon: 'ri-home-6-line', perm: ['dashboard'] },
  { path: 'customers', label: 'Customers & leads', icon: 'ri-team-line', perm: ['crm'] },
  { path: 'followups', label: 'Follow-ups', icon: 'ri-calendar-todo-line', perm: ['followups', 'crm'], count: 'followups' },
  { path: 'quotes', label: 'Quotes', icon: 'ri-file-list-3-line', perm: ['quotes'] },
  { path: 'installations', label: 'Installations', icon: 'ri-tools-line', perm: ['installations'] },
  { path: 'attendance', label: 'Staff attendance', icon: 'ri-map-pin-user-line', perm: ['attendance'] },
  { path: 'field', label: 'My field work', icon: 'ri-hammer-line', perm: ['field'] },
  { group: 'Operations' },
  { path: 'inventory', label: 'Inventory', icon: 'ri-archive-stack-line', perm: ['inventory'] },
  { path: 'orders', label: 'Shop & orders', icon: 'ri-shopping-bag-3-line', perm: ['shop'] },
  { path: 'support', label: 'Customer support', icon: 'ri-customer-service-2-line', perm: ['support'], count: 'tickets' },
  { path: 'maintenance', label: 'Maintenance & warranty', icon: 'ri-shield-check-line', perm: ['maintenance'] },
  { group: 'Insights' },
  { path: 'analytics', label: 'Analytics & heatmaps', icon: 'ri-line-chart-line', perm: ['analytics'] },
  { path: 'chats', label: 'Website chats', icon: 'ri-chat-3-line', perm: ['chats'] },
  { path: 'ai', label: 'AI sales assistant', icon: 'ri-sparkling-2-line', perm: ['ai'] },
  { group: 'Website' },
  { path: 'website', label: 'Website content', icon: 'ri-layout-masonry-line', perm: ['website'] },
  { path: 'blog', label: 'Blog', icon: 'ri-article-line', perm: ['blog'] },
  { path: 'email', label: 'Email', icon: 'ri-mail-send-line', perm: ['email'] },
  { group: 'Account' },
  { path: 'users', label: 'Users & access', icon: 'ri-user-settings-line', perm: ['users'] },
  { path: 'settings', label: 'Settings', icon: 'ri-settings-3-line', perm: ['settings', 'shop', 'website'] },
];
const VIEWS = {
  dashboard: 'dashboard', customers: 'customers', followups: 'followups', quotes: 'quotes', installations: 'installations', attendance: 'attendance',
  field: 'field', inventory: 'inventory', orders: 'orders', support: 'support', maintenance: 'maintenance', warranties: 'maintenance', analytics: 'analytics',
  chats: 'chats', ai: 'ai', website: 'website', blog: 'blog', email: 'email', users: 'users', settings: 'settings', profile: 'settings', notifications: 'notifications',
};

export const state = { user: null, logo: '' };
export const can = (...p) => state.user && (state.user.role === 'owner' || p.some((x) => state.user.permissions.includes(x)));

async function logoSvg() {
  if (!state.logo) state.logo = (await fetch('/assets/img/logo.svg').then((r) => r.text())).replace(/<style>.*?<\/style>/, '').replace('role="img"', 'aria-hidden="true"');
  return state.logo;
}

/* ── Auth screens ── */
async function authScreen(kind) {
  const logo = await logoSvg();
  const root = $('#root');
  const status = await api('/api/auth/status').catch(() => ({ needs_setup: false }));
  if (status.needs_setup && kind !== 'setup') kind = 'setup';
  const forms = {
    login: `<h1>Welcome back</h1><p class="muted" style="margin:0 0 22px">Sign in with your work email and password.</p>
      <form class="stack" data-login><div class="field"><label for="em">Work email</label><input class="input" id="em" name="email" type="email" required autocomplete="username"></div>
      <div class="field"><label for="pw">Password</label><input class="input" id="pw" name="password" type="password" required autocomplete="current-password"></div>
      <div class="alert err" hidden data-err></div><button class="btn btn-primary btn-lg" type="submit">Sign in</button>
      <p class="muted small" style="margin:0">Forgot your password? Ask your administrator to reset it from Users &amp; access.</p></form>`,
    setup: `<h1>Set up your CRM</h1><p class="muted" style="margin:0 0 22px">Create the owner account. You'll need the one-time setup code you were given.</p>
      <form class="stack" data-setup><div class="field"><label for="sc">Setup code</label><input class="input" id="sc" name="setup_code" required autocomplete="one-time-code"></div>
      <div class="field"><label for="nm">Your full name</label><input class="input" id="nm" name="name" required autocomplete="name"></div>
      <div class="field"><label for="em">Work email</label><input class="input" id="em" name="email" type="email" required autocomplete="username"></div>
      <div class="field"><label for="pw">Password</label><input class="input" id="pw" name="password" type="password" required minlength="10" autocomplete="new-password"><span class="hint">At least 10 characters with upper and lower case letters and a number.</span></div>
      <div class="alert err" hidden data-err></div><button class="btn btn-primary btn-lg" type="submit">Create owner account</button></form>`,
    'change-password': `<h1>Choose a new password</h1><p class="muted" style="margin:0 0 22px">For your security, replace the temporary password you were given.</p>
      <form class="stack" data-change><div class="field"><label for="cur">Temporary / current password</label><input class="input" id="cur" name="current" type="password" required autocomplete="current-password"></div>
      <div class="field"><label for="pw">New password</label><input class="input" id="pw" name="password" type="password" required minlength="10" autocomplete="new-password"><span class="hint">At least 10 characters with upper and lower case letters and a number.</span></div>
      <div class="alert err" hidden data-err></div><button class="btn btn-primary btn-lg" type="submit">Save password</button></form>`,
  };
  root.innerHTML = `<div class="auth"><aside class="auth-side">${logo}<div><h2>Every lead, quote, install and service visit — in one place.</h2><p style="max-width:42ch;color:#C9DDBC">Vertical Solar's CRM for sales, field teams and customer care.</p></div><small style="color:#9FB893">Secure area · Authorised staff only</small></aside>
    <main class="auth-main"><div class="auth-card">${forms[kind]}</div></main></div>`;
  const form = $('form', root), err = $('[data-err]', root);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.hidden = true;
    const btn = $('[type=submit]', form); btn.classList.add('loading');
    const body = Object.fromEntries(new FormData(form).entries());
    try {
      if (kind === 'login') { const r = await api('/api/auth/login', { body }); location.hash = r.must_change_password ? '#/change-password' : '#/'; }
      if (kind === 'setup') { await api('/api/auth/setup', { body }); location.hash = '#/'; }
      if (kind === 'change-password') { await api('/api/auth/password', { body }); toast('Password updated'); state.user = null; location.hash = '#/'; }
      route();
    } catch (ex) { err.hidden = false; err.textContent = ex.message; } finally { btn.classList.remove('loading'); }
  });
}

/* ── Layout ── */
async function layout() {
  const u = state.user;
  const logo = await logoSvg();
  const links = NAV.filter((n, i) => {
    if (n.group) { const next = NAV.slice(i + 1); const sect = next.slice(0, next.findIndex((x) => x.group) === -1 ? next.length : next.findIndex((x) => x.group)); return sect.some((x) => can(...x.perm)); }
    return can(...n.perm);
  });
  $('#root').innerHTML = `<div class="app">
    <aside class="sidebar" id="sidebar" aria-label="Main navigation">
      <div class="side-brand"><a href="#/" aria-label="Dashboard">${logo}</a><a class="icon-btn" href="/" target="_blank" rel="noopener" title="Open website" style="color:#C9DDBC"><i class="ri-external-link-line"></i></a></div>
      <button class="side-search" type="button" data-search><i class="ri-search-line"></i><span>Search</span><kbd>Ctrl K</kbd></button>
      <nav>${links.map((n) => n.group ? `<div class="nav-group">${esc(n.group)}</div>` : `<a class="nav-link" href="#/${n.path}" data-nav="${n.path}"><i class="${n.icon}"></i><span>${esc(n.label)}</span>${n.count ? `<span class="count" data-count="${n.count}" hidden></span>` : ''}</a>`).join('')}</nav>
      <div class="side-foot"><div class="side-user">${u.avatar ? `<img class="avatar" src="${esc(u.avatar)}" alt="">` : `<span class="avatar">${esc(initials(u.name))}</span>`}<div style="min-width:0"><strong class="nowrap" style="overflow:hidden;text-overflow:ellipsis">${esc(u.name)}</strong><span>${esc(u.job_title || u.role)}</span></div><button type="button" data-logout title="Sign out" aria-label="Sign out"><i class="ri-logout-box-r-line"></i></button></div></div>
    </aside>
    <div class="main">
      <header class="topbar"><button class="icon-btn menu-btn" type="button" data-menu aria-label="Open menu"><i class="ri-menu-line"></i></button>
        <div class="title"><h1 data-title>Dashboard</h1><small data-subtitle></small></div>
        <div class="tools"><div data-actions class="row"></div>
          <button class="icon-btn" type="button" data-theme title="Light / dark"><i class="ri-contrast-2-line"></i></button>
          <div style="position:relative"><button class="icon-btn" type="button" data-bell aria-label="Notifications"><i class="ri-notification-3-line"></i><span class="dot" data-unread hidden></span></button><div class="notif-panel" data-notifs hidden></div></div>
          <a class="icon-btn" href="#/profile" title="My profile"><i class="ri-user-line"></i></a></div></header>
      <main class="content" id="view" tabindex="-1"></main>
    </div></div>`;
  $('[data-logout]').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); state.user = null; location.hash = '#/login'; };
  $('[data-menu]').onclick = () => $('#sidebar').classList.toggle('open');
  $('[data-theme]').onclick = () => { const d = document.documentElement; const next = d.getAttribute('data-admin-theme') === 'dark' ? 'light' : 'dark'; d.setAttribute('data-admin-theme', next); localStorage.setItem('vs-admin-theme', next); };
  $('[data-bell]').onclick = toggleNotifs;
  $('[data-search]').onclick = openSearch;
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); } });
  document.addEventListener('click', (e) => { if (!e.target.closest('[data-bell]') && !e.target.closest('[data-notifs]')) $('[data-notifs]')?.setAttribute('hidden', ''); if (e.target.closest('.nav-link') && innerWidth < 980) $('#sidebar').classList.remove('open'); });
  pollNotifs();
  setInterval(pollNotifs, 30000);
  if (can('field')) import('./views/field.js?v=1').then((m) => m.resumeTracking()).catch(() => {});
}

export function setTitle(title, sub = '', actions = '') {
  $('[data-title]').textContent = title;
  $('[data-subtitle]').textContent = sub;
  $('[data-actions]').innerHTML = actions;
  document.title = `${title} · Vertical Solar CRM`;
}

/* ── Notifications ── */
let lastNotifId = 0, notifs = [];
const NI = { success: ['ri-checkbox-circle-line', 'var(--ok-bg)', 'var(--ok)'], warning: ['ri-alert-line', 'var(--warn-bg)', 'var(--warn)'], danger: ['ri-alarm-warning-line', 'var(--bad-bg)', 'var(--bad)'], info: ['ri-information-line', 'var(--info-bg)', 'var(--info)'] };
async function pollNotifs() {
  try {
    const r = await api('/api/admin/notifications');
    notifs = r.items;
    const dot = $('[data-unread]'); if (dot) { dot.hidden = !r.unread; dot.textContent = r.unread > 99 ? '99+' : r.unread; }
    const newest = r.items[0]?.id || 0;
    if (lastNotifId && newest > lastNotifId) {
      const fresh = r.items.filter((n) => n.id > lastNotifId && !n.read);
      fresh.slice(0, 3).forEach((n) => toast(n.title, n.type === 'danger' ? 'err' : 'ok'));
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) fresh.slice(0, 3).forEach((n) => new Notification(n.title, { body: n.body || '', icon: '/assets/img/icon-192.png', tag: 'vs-' + n.id }));
    }
    lastNotifId = Math.max(lastNotifId, newest);
    const counts = await api('/api/admin/dashboard-counts').catch(() => null);
    if (counts) for (const [k, v] of Object.entries(counts)) { const el = $(`[data-count="${k}"]`); if (el) { el.hidden = !v; el.textContent = v; } }
  } catch {}
}
function toggleNotifs() {
  const p = $('[data-notifs]');
  if (!p.hidden) { p.hidden = true; return; }
  p.hidden = false;
  p.innerHTML = `<div class="card-h"><h2>Notifications</h2><button class="btn btn-sm btn-ghost" data-readall style="margin-left:auto">Mark all read</button></div>
    ${'Notification' in window && Notification.permission === 'default' ? '<div style="padding:10px 14px;border-bottom:1px solid var(--line)"><button class="btn btn-sm" data-allow><i class="ri-notification-badge-line"></i> Enable desktop alerts</button></div>' : ''}
    ${notifs.length ? notifs.map((n) => { const [ic, bg, fg] = NI[n.type] || NI.info; return `<a class="notif ${n.read ? '' : 'unread'}" href="${esc(n.link || '#/')}" data-nid="${n.id}"><i class="${ic}" style="background:${bg};color:${fg}"></i><div><strong>${esc(n.title)}</strong>${n.body ? `<span>${esc(n.body)}</span><br>` : ''}<span>${ago(n.created_at)}</span></div></a>`; }).join('') : '<div class="empty"><i class="ri-notification-off-line"></i>No notifications yet.</div>'}`;
  p.onclick = async (e) => {
    if (e.target.closest('[data-readall]')) { await api('/api/admin/notifications/read', { body: { ids: notifs.map((n) => n.id) } }); pollNotifs(); p.hidden = true; }
    if (e.target.closest('[data-allow]')) Notification.requestPermission();
    const a = e.target.closest('[data-nid]'); if (a) { api('/api/admin/notifications/read', { body: { ids: [Number(a.dataset.nid)] } }).then(pollNotifs); p.hidden = true; if (a.getAttribute('href').startsWith('/admin/')) { e.preventDefault(); location.hash = a.getAttribute('href').replace('/admin/', ''); } }
  };
}

/* ── Global search ── */
function openSearch() {
  const { el, close } = modal({ title: 'Search', body: `<div class="search" style="max-width:none"><i class="ri-search-line"></i><input class="input" data-q placeholder="Customers, quotes, products, tickets…" autocomplete="off"></div><div data-results style="margin-top:12px"></div>` });
  const out = $('[data-results]', el);
  $('[data-q]', el).addEventListener('input', debounce(async (e) => {
    const q = e.target.value.trim(); if (q.length < 2) { out.innerHTML = ''; return; }
    const tasks = [];
    if (can('crm', 'quotes')) tasks.push(api(`/api/admin/customers?q=${encodeURIComponent(q)}&per=6`).then((r) => r.items.map((c) => [`#/customers/${c.id}`, 'ri-user-line', c.name, `${c.phone || ''} · ${c.stage}`])));
    if (can('quotes')) tasks.push(api(`/api/admin/quotes?q=${encodeURIComponent(q)}&per=5`).then((r) => r.items.map((x) => [`#/quotes/${x.id}`, 'ri-file-list-3-line', `${x.number} — ${x.title}`, x.customer_name || ''])));
    if (can('inventory', 'shop')) tasks.push(api(`/api/admin/products?q=${encodeURIComponent(q)}&per=5`).then((r) => r.items.map((x) => [`#/inventory`, 'ri-archive-line', x.name, `${x.stock} in stock`])));
    if (can('support')) tasks.push(api(`/api/admin/tickets?q=${encodeURIComponent(q)}&per=5`).then((r) => r.items.map((x) => [`#/support/${x.id}`, 'ri-customer-service-2-line', `${x.number} — ${x.subject}`, x.name || ''])));
    const res = (await Promise.all(tasks.map((t) => t.catch(() => [])))).flat();
    out.innerHTML = res.length ? `<div class="list">${res.map(([h, i, t, s]) => `<a class="li" href="${h}" style="text-decoration:none;color:inherit"><span class="li-icon"><i class="${i}"></i></span><div class="body"><strong>${esc(t)}</strong><div class="meta">${esc(s)}</div></div></a>`).join('')}</div>` : '<div class="empty">No matches.</div>';
    out.onclick = (ev) => { if (ev.target.closest('a')) close(); };
  }, 250));
}

/* ── Router ── */
async function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, ...params] = hash.split('/');
  if (['login', 'setup'].includes(name)) return authScreen(name);
  if (!state.user) {
    try { state.user = await api('/api/auth/me'); }
    catch { return authScreen('login'); }
    if (state.user.must_change_password) return authScreen('change-password');
    await layout();
  }
  if (name === 'change-password') return authScreen('change-password');
  const fallback = can('dashboard') ? 'dashboard' : can('field') ? 'field' : NAV.find((n) => n.path && can(...n.perm))?.path;
  const view = VIEWS[name] ? name : fallback;
  if (!view) { $('#view').innerHTML = '<div class="empty"><i class="ri-lock-line"></i>Your account has no sections assigned yet. Ask an administrator to grant access.</div>'; return; }
  $$('.nav-link').forEach((a) => a.classList.toggle('active', a.dataset.nav === (view === 'warranties' ? 'maintenance' : view === 'profile' ? 'settings' : view)));
  const el = $('#view');
  el.innerHTML = '<div class="empty" style="padding-top:20vh"><i class="ri-loader-4-line" style="animation:spin 1s linear infinite"></i>Loading…</div>';
  try {
    const mod = await import(`./views/${VIEWS[view]}.js?v=1`);
    await mod.default({ root: el, params, name: view, user: state.user, can, setTitle });
    el.focus({ preventScroll: true });
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="alert err"><i class="ri-error-warning-line"></i><span>${esc(e.message)}</span></div>`;
  }
}

addEventListener('hashchange', route);
route();
