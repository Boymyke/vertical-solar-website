// CRM shell: sign-in, first-time profile, permission-aware navigation, routing, notifications and push alerts.
import { $, $$, api, esc, initials, toast, ago, modal, debounce, skeleton, validate, markField } from './lib.js';

const V = '2';
const NAV = [
  { group: 'Main menu' },
  { path: 'dashboard', label: 'Dashboard', icon: 'ri-dashboard-line', perm: ['dashboard'] },
  { path: 'customers', label: 'Customers & leads', icon: 'ri-team-line', perm: ['crm'] },
  { path: 'followups', label: 'Follow-ups', icon: 'ri-calendar-todo-line', perm: ['followups', 'crm'], count: 'followups' },
  { path: 'quotes', label: 'Quotes', icon: 'ri-file-list-3-line', perm: ['quotes'] },
  { path: 'field', label: 'My field work', icon: 'ri-hammer-line', perm: ['field'], staffOnly: true },
  { group: 'Projects & staff' },
  { path: 'installations', label: 'Installations', icon: 'ri-tools-line', perm: ['installations'] },
  { path: 'attendance', label: 'Staff & schedules', icon: 'ri-map-pin-user-line', perm: ['attendance'] },
  { path: 'issues', label: 'Site issues', icon: 'ri-alarm-warning-line', perm: ['installations', 'attendance'], count: 'issues' },
  { group: 'Operations' },
  { path: 'inventory', label: 'Inventory', icon: 'ri-archive-stack-line', perm: ['inventory'] },
  { path: 'orders', label: 'Shop & orders', icon: 'ri-shopping-bag-3-line', perm: ['shop'] },
  { path: 'support', label: 'Customer support', icon: 'ri-customer-service-2-line', perm: ['support'], count: 'tickets' },
  { path: 'maintenance', label: 'Maintenance & warranty', icon: 'ri-shield-check-line', perm: ['maintenance'] },
  { group: 'Insights' },
  { path: 'analytics', label: 'Visitors & heatmaps', icon: 'ri-line-chart-line', perm: ['analytics'] },
  { path: 'chats', label: 'Website chats', icon: 'ri-chat-3-line', perm: ['chats'] },
  { path: 'ai', label: 'AI sales assistant', icon: 'ri-sparkling-2-line', perm: ['ai'] },
  { group: 'Website' },
  { path: 'website', label: 'Website content', icon: 'ri-layout-masonry-line', perm: ['website'] },
  { path: 'blog', label: 'Blog', icon: 'ri-article-line', perm: ['blog'] },
  { path: 'email', label: 'Email', icon: 'ri-mail-send-line', perm: ['email'] },
  { group: 'Account' },
  { path: 'users', label: 'Staff logins', icon: 'ri-user-settings-line', perm: ['users'] },
  { path: 'settings', label: 'Settings', icon: 'ri-settings-3-line', perm: ['settings', 'shop'] },
];
const VIEWS = {
  dashboard: 'dashboard', customers: 'customers', followups: 'followups', quotes: 'quotes', installations: 'installations', attendance: 'attendance',
  field: 'field', issues: 'issues', inventory: 'inventory', orders: 'orders', support: 'support', maintenance: 'maintenance', warranties: 'maintenance', analytics: 'analytics',
  chats: 'chats', ai: 'ai', website: 'website', blog: 'blog', email: 'email', users: 'users', settings: 'settings', profile: 'profile', notifications: 'notifications',
};

// Every password box gets an eye button to show or hide what was typed.
function enhancePasswords(root = document) {
  root.querySelectorAll('input[type="password"]:not([data-eye])').forEach((inp) => {
    inp.dataset.eye = '1';
    const wrap = document.createElement('span'); wrap.className = 'pw-wrap';
    inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pw-eye'; b.setAttribute('aria-label', 'Show password'); b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<i class="ri-eye-line" aria-hidden="true"></i>';
    b.addEventListener('click', () => {
      const show = inp.type === 'password'; inp.type = show ? 'text' : 'password';
      b.setAttribute('aria-pressed', String(show)); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      b.innerHTML = `<i class="${show ? 'ri-eye-off-line' : 'ri-eye-line'}" aria-hidden="true"></i>`; inp.focus();
    });
    wrap.appendChild(b);
  });
}
new MutationObserver(() => enhancePasswords()).observe(document.documentElement, { childList: true, subtree: true });

export const state = { user: null, logo: '' };
export const isOwner = () => state.user?.role === 'owner';
export const can = (...p) => state.user && (isOwner() || p.some((x) => state.user.permissions.includes(x)));
const visible = (n) => can(...n.perm) && !(n.staffOnly && isOwner());

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
  const pwHint = '<span class="hint">At least 10 characters, with upper and lower case letters and a number.</span>';
  const forms = {
    login: `<h1>Welcome back</h1><p class="muted" style="margin:0 0 24px">Sign in with your work email and password.</p>
      <form class="stack" data-login novalidate><div class="field"><label for="em">Work email</label><input class="input" id="em" name="email" type="email" required autocomplete="username"></div>
      <div class="field"><label for="pw">Password</label><input class="input" id="pw" name="password" type="password" required autocomplete="current-password"></div>
      <div class="alert err" hidden data-err></div><button class="btn btn-primary btn-lg" type="submit">Sign in</button>
      <p class="muted small" style="margin:0">Forgot your password? Ask the administrator to reset it from Staff logins.</p></form>`,
    setup: `<h1>Set up your CRM</h1><p class="muted" style="margin:0 0 24px">Create the administrator account. You'll need the one-time setup code you were given.</p>
      <form class="stack" data-setup novalidate><div class="field"><label for="sc">Setup code</label><input class="input" id="sc" name="setup_code" required autocomplete="one-time-code"></div>
      <div class="field"><label for="nm">Your full name</label><input class="input" id="nm" name="name" required autocomplete="name"></div>
      <div class="field"><label for="em">Work email</label><input class="input" id="em" name="email" type="email" required autocomplete="username"></div>
      <div class="field"><label for="pw">Password</label><input class="input" id="pw" name="password" type="password" required minlength="10" autocomplete="new-password">${pwHint}</div>
      <div class="alert err" hidden data-err></div><button class="btn btn-primary btn-lg" type="submit">Create administrator account</button></form>`,
    'change-password': `<h1>Choose your password</h1><p class="muted" style="margin:0 0 24px">Replace the temporary password you were given with one only you know.</p>
      <form class="stack" data-change novalidate><div class="field"><label for="cur">Temporary password</label><input class="input" id="cur" name="current" type="password" required autocomplete="current-password"></div>
      <div class="field"><label for="pw">New password</label><input class="input" id="pw" name="password" type="password" required minlength="10" autocomplete="new-password">${pwHint}</div>
      <div class="alert err" hidden data-err></div><button class="btn btn-primary btn-lg" type="submit">Save password</button></form>`,
  };
  root.innerHTML = `<div class="auth"><aside class="auth-side">${logo}<div><h2>Every lead, quote, install and service visit in one place.</h2><p style="max-width:40ch">Vertical Solar's workspace for sales, field teams and customer care.</p></div><small style="opacity:.75">Secure area · Authorised staff only</small></aside>
    <main class="auth-main"><div class="auth-card">${forms[kind]}</div></main></div>`;
  const form = $('form', root), err = $('[data-err]', root);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.hidden = true;
    if (!validate(form)) return;
    const btn = $('[type=submit]', form); btn.classList.add('loading');
    const body = Object.fromEntries(new FormData(form).entries());
    try {
      if (kind === 'login') { const r = await api('/api/auth/login', { body }); location.hash = r.must_change_password ? '#/change-password' : '#/'; }
      if (kind === 'setup') { await api('/api/auth/setup', { body }); location.hash = '#/'; }
      if (kind === 'change-password') { await api('/api/auth/password', { body }); toast('Password saved'); state.user = null; location.hash = '#/'; }
      route();
    } catch (ex) { err.hidden = false; err.textContent = ex.message; } finally { btn.classList.remove('loading'); }
  });
}

/* ── Sign-in link from the administrator: choose a password and go straight in ── */
async function welcomeScreen(token) {
  const logo = await logoSvg();
  const root = $('#root');
  const shell = (inner) => `<div class="auth"><aside class="auth-side">${logo}<div><h2>Welcome to the Vertical Solar team app.</h2><p style="max-width:40ch">Your schedule, job sites, clock-in and reports — all on your phone.</p></div><small style="opacity:.75">Secure area · Authorised staff only</small></aside><main class="auth-main"><div class="auth-card">${inner}</div></main></div>`;
  root.innerHTML = shell(skeleton('list'));
  let who;
  try { who = await api('/api/auth/invite', { body: { token } }); }
  catch (e) {
    root.innerHTML = shell(`<h1>Link not valid</h1><div class="alert warn" style="margin:12px 0 20px"><i class="ri-time-line"></i><span>${esc(e.message)}</span></div><a class="btn btn-primary btn-lg" href="#/login">Go to sign in</a>`);
    return;
  }
  root.innerHTML = shell(`<h1>Welcome, ${esc(who.name.split(' ')[0])}</h1><p class="muted" style="margin:0 0 20px">Choose a password for <strong>${esc(who.email)}</strong>. You will use it with this email to sign in from now on.</p>
    <form class="stack" data-welcome novalidate><input type="email" name="email" value="${esc(who.email)}" autocomplete="username" hidden>
      <div class="field"><label for="pw">New password</label><input class="input" id="pw" name="password" type="password" required minlength="10" autocomplete="new-password"><span class="hint">At least 10 characters, with upper and lower case letters and a number.</span></div>
      <div class="field"><label for="pw2">Type it again</label><input class="input" id="pw2" name="password2" type="password" required minlength="10" autocomplete="new-password"></div>
      <div class="alert err" hidden data-err></div><button class="btn btn-primary btn-lg" type="submit">Save password and continue</button></form>`);
  const form = $('[data-welcome]', root), err = $('[data-err]', root);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.hidden = true;
    if (!validate(form)) return;
    const pw = form.password.value;
    if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) { markField(form.password, 'Use upper and lower case letters and a number'); return; }
    if (pw !== form.password2.value) { markField(form.password2, 'The two passwords are not the same'); return; }
    const btn = $('[type=submit]', form); btn.classList.add('loading');
    try { await api('/api/auth/invite/accept', { body: { token, password: pw } }); toast('Password saved — welcome!'); state.user = null; history.replaceState(null, '', '#/'); route(); }
    catch (ex) { err.hidden = false; err.textContent = ex.message; } finally { btn.classList.remove('loading'); }
  });
}

/* ── First sign-in: staff fill in their profile before using the app ── */
async function onboarding() {
  const logo = await logoSvg();
  $('#root').innerHTML = `<div class="onboard"><div class="onboard-card"><div class="onboard-head">${logo}</div><div data-ob></div></div></div>`;
  const { profileForm } = await import(`./views/profile.js?v=${V}`);
  await profileForm($('[data-ob]'), { onboarding: true, user: state.user, onDone: async () => { state.user = null; location.hash = '#/'; route(); } });
}

/* ── Layout ── */
async function layout() {
  const u = state.user;
  const logo = await logoSvg();
  const links = NAV.filter((n, i) => {
    if (!n.group) return visible(n);
    const rest = NAV.slice(i + 1); const end = rest.findIndex((x) => x.group);
    return rest.slice(0, end === -1 ? rest.length : end).some(visible);
  });
  const avatar = (cls = '') => (u.avatar ? `<img class="avatar ${cls}" src="${esc(u.avatar)}" alt="">` : `<span class="avatar ${cls}">${esc(initials(u.name))}</span>`);
  const sideCard = isOwner()
    ? '<div class="side-card"><strong>Your website</strong><p>See your latest changes the way customers do.</p><a class="btn btn-sm" href="/" target="_blank" rel="noopener"><i class="ri-external-link-line"></i> Open website</a></div>'
    : '<div class="side-card" data-push-card hidden><strong>Never miss a reminder</strong><p>Turn on alerts so schedule reminders reach your phone.</p><button class="btn btn-sm" type="button" data-push-on><i class="ri-notification-badge-line"></i> Turn on alerts</button></div>';
  $('#root').innerHTML = `<div class="app">
    <aside class="sidebar" id="sidebar" aria-label="Main navigation">
      <div class="side-brand"><a href="#/" aria-label="Home">${logo}</a></div>
      <button class="side-search" type="button" data-search><i class="ri-search-line"></i><span>Search</span><kbd>Ctrl K</kbd></button>
      <nav>${links.map((n) => (n.group ? `<div class="nav-group">${esc(n.group)}</div>` : `<a class="nav-link" href="#/${n.path}" data-nav="${n.path}"><i class="${n.icon}"></i><span>${esc(n.label)}</span>${n.count ? `<span class="count" data-count="${n.count}" hidden></span>` : ''}</a>`)).join('')}</nav>
      <div class="side-foot">${sideCard}
        <div class="side-user">${avatar()}<div style="min-width:0"><strong class="ellipsis">${esc(u.name)}</strong><span>${isOwner() ? 'Administrator' : esc(u.job_title || 'Staff')}</span></div><button type="button" data-logout title="Sign out" aria-label="Sign out"><i class="ri-logout-box-r-line"></i></button></div></div>
    </aside>
    <div class="main">
      <header class="topbar"><button class="tool-btn menu-btn" type="button" data-menu aria-label="Open menu" aria-controls="sidebar" aria-expanded="false"><i class="ri-menu-2-line"></i></button>
        <button class="top-search" type="button" data-search><i class="ri-search-line"></i><span>Search customers, quotes, products…</span><kbd>Ctrl K</kbd></button>
        <div class="tools">
          <button class="tool-btn" type="button" data-search-m aria-label="Search" style="display:none"><i class="ri-search-line"></i></button>
          <button class="tool-btn" type="button" data-theme aria-label="Switch light or dark"><i class="ri-moon-line"></i></button>
          <div style="position:relative"><button class="tool-btn" type="button" data-bell aria-label="Notifications" aria-expanded="false"><i class="ri-notification-3-line"></i><span class="dot" data-unread hidden></span></button><div class="notif-panel" data-notifs hidden></div></div>
          <a class="me-btn" href="#/profile" title="My profile">${avatar()}<div><strong>${esc(u.name.split(' ')[0])}</strong><span>${isOwner() ? 'Administrator' : 'Staff'}</span></div></a>
        </div></header>
      <div class="page-head"><div style="min-width:0"><h1 data-title>Dashboard</h1><div class="sub" data-subtitle></div></div><div class="page-actions" data-actions></div></div>
      <main class="content" id="view" tabindex="-1"></main>
    </div></div>`;
  const side = $('#sidebar');
  const setMenu = (open) => {
    side.classList.toggle('open', open); $('[data-menu]').setAttribute('aria-expanded', String(open));
    $('.side-scrim')?.remove();
    if (open) { const s = document.createElement('div'); s.className = 'side-scrim'; s.onclick = () => setMenu(false); document.body.appendChild(s); }
  };
  $('[data-menu]').onclick = () => setMenu(!side.classList.contains('open'));
  $('[data-logout]').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); state.user = null; location.hash = '#/login'; };
  const themeIcon = () => { $('[data-theme] i').className = document.documentElement.getAttribute('data-admin-theme') === 'dark' ? 'ri-sun-line' : 'ri-moon-line'; };
  $('[data-theme]').onclick = () => { const d = document.documentElement; const next = d.getAttribute('data-admin-theme') === 'dark' ? 'light' : 'dark'; d.setAttribute('data-admin-theme', next); try { localStorage.setItem('vs-admin-theme', next); } catch {} themeIcon(); };
  themeIcon();
  $('[data-bell]').onclick = toggleNotifs;
  $$('[data-search],[data-search-m]').forEach((b) => (b.onclick = openSearch));
  if (matchMedia('(max-width: 1080px)').matches) $('[data-search-m]').style.display = '';
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); } if (e.key === 'Escape') { setMenu(false); $('[data-notifs]')?.setAttribute('hidden', ''); } });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-bell]') && !e.target.closest('[data-notifs]')) $('[data-notifs]')?.setAttribute('hidden', '');
    if (e.target.closest('.nav-link')) setMenu(false);
  });
  addEventListener('scroll', () => $('.topbar')?.classList.toggle('scrolled', scrollY > 4), { passive: true });
  $('[data-push-on]')?.addEventListener('click', () => enablePush(true));
  pollNotifs();
  setInterval(pollNotifs, 30000);
  setupPush();
  if (can('field') && !isOwner()) import(`./views/field.js?v=${V}`).then((m) => m.resumeTracking()).catch(() => {});
}

export function setTitle(title, sub = '', actions = '') {
  $('[data-title]').textContent = title;
  $('[data-subtitle]').textContent = sub;
  $('[data-actions]').innerHTML = actions;
  document.title = `${title} · Vertical Solar`;
}

/* ── Notifications ── */
let lastNotifId = 0, notifs = [];
const NI = { success: ['ri-checkbox-circle-line', 'var(--ok-bg)', 'var(--ok)'], warning: ['ri-alert-line', 'var(--warn-bg)', 'var(--warn)'], danger: ['ri-alarm-warning-line', 'var(--bad-bg)', 'var(--bad)'], info: ['ri-information-line', 'var(--info-bg)', 'var(--info)'] };
export const notifHtml = (n) => { const [ic, bg, fg] = NI[n.type] || NI.info; const href = (n.link || '#/').replace(/^\/(?:staff|admin)\//, ''); return `<div class="notif ${n.read ? '' : 'unread'}" data-nid="${n.id}"><i class="${ic}" style="background:${bg};color:${fg}" aria-hidden="true"></i><a href="${esc(href)}" data-open><strong>${esc(n.title)}</strong>${n.body ? `<span>${esc(n.body)}</span><br>` : ''}<span>${ago(n.created_at)}</span></a><button class="x" type="button" data-dismiss aria-label="Close this notification" title="Close"><i class="ri-close-line"></i></button></div>`; };
async function pollNotifs() {
  try {
    const r = await api('/api/admin/notifications');
    notifs = r.items;
    const dot = $('[data-unread]'); if (dot) { dot.hidden = !r.unread; dot.textContent = r.unread > 99 ? '99+' : r.unread; }
    const newest = r.items[0]?.id || 0;
    if (lastNotifId && newest > lastNotifId) {
      const fresh = r.items.filter((n) => n.id > lastNotifId && !n.read);
      fresh.slice(0, 3).forEach((n) => toast(n.title, n.type === 'danger' ? 'err' : 'ok'));
    }
    lastNotifId = Math.max(lastNotifId, newest);
    const counts = await api('/api/admin/dashboard-counts').catch(() => null);
    if (counts) for (const [k, v] of Object.entries(counts)) { const el = $(`[data-count="${k}"]`); if (el) { el.hidden = !v; el.textContent = v; } }
    if (!$('[data-notifs]')?.hidden) renderNotifs();
  } catch {}
}
export async function dismiss(ids, els = []) {
  els.forEach((el) => el.classList.add('gone'));
  notifs = notifs.filter((n) => !ids.includes(n.id));
  setTimeout(() => els.forEach((el) => el.remove()), 250);
  const dot = $('[data-unread]'); const unread = notifs.filter((n) => !n.read).length; if (dot) { dot.hidden = !unread; dot.textContent = unread; }
  await api('/api/admin/notifications/dismiss', { body: { ids } }).catch(() => {});
}
function renderNotifs() {
  const p = $('[data-notifs]');
  const pushRow = 'Notification' in window && 'serviceWorker' in navigator && Notification.permission === 'default'
    ? '<div class="push-cta"><i class="ri-notification-badge-line" style="font-size:18px"></i><span class="grow">Get alerts on this device even when the app is closed.</span><button class="btn btn-sm" data-allow>Turn on</button></div>' : '';
  p.innerHTML = `<div class="card-h"><h2>Notifications</h2>${notifs.length ? '<div class="row" style="gap:4px"><button class="btn btn-sm btn-ghost" data-readall>Mark all read</button><button class="btn btn-sm btn-ghost" data-clearall>Clear all</button></div>' : ''}</div>${pushRow}
    <div class="notif-list">${notifs.length ? notifs.map(notifHtml).join('') : '<div class="empty"><i class="ri-notification-off-line"></i><strong>You\'re all caught up</strong><span>New alerts from the website and your team show up here.</span></div>'}</div>`;
}
function toggleNotifs() {
  const p = $('[data-notifs]');
  if (!p.hidden) { p.hidden = true; $('[data-bell]').setAttribute('aria-expanded', 'false'); return; }
  p.hidden = false; $('[data-bell]').setAttribute('aria-expanded', 'true');
  renderNotifs();
  p.onclick = async (e) => {
    if (e.target.closest('[data-readall]')) { await api('/api/admin/notifications/read', { body: { ids: notifs.map((n) => n.id) } }); notifs.forEach((n) => (n.read = 1)); renderNotifs(); pollNotifs(); return; }
    if (e.target.closest('[data-clearall]')) { const ids = notifs.map((n) => n.id); await dismiss(ids, $$('.notif', p)); renderNotifs(); return; }
    if (e.target.closest('[data-allow]')) { enablePush(true).then(renderNotifs); return; }
    const x = e.target.closest('[data-dismiss]');
    if (x) { e.stopPropagation(); const row = x.closest('[data-nid]'); await dismiss([Number(row.dataset.nid)], [row]); if (!notifs.length) renderNotifs(); return; }
    const a = e.target.closest('[data-open]');
    if (a) { const id = Number(a.closest('[data-nid]').dataset.nid); api('/api/admin/notifications/read', { body: { ids: [id] } }).then(pollNotifs); p.hidden = true; }
  };
}

/* ── Push alerts (phone notifications when the app is closed) ── */
const b64ToBytes = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
async function setupPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.register('/staff/sw.js', { scope: '/staff/' });
    if (Notification.permission === 'granted') await enablePush(false, reg);
    else if (Notification.permission === 'default') $('[data-push-card]')?.removeAttribute('hidden');
  } catch (e) { console.warn('push setup', e); }
}
export async function enablePush(ask, reg) {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { if (ask) toast('This browser cannot show alerts. On iPhone, add the app to your Home Screen first.', 'err'); return false; }
    if (ask && Notification.permission !== 'granted') { const p = await Notification.requestPermission(); if (p !== 'granted') { toast('Alerts stay off. You can turn them on later from your profile.', 'err'); return false; } }
    reg = reg || (await navigator.serviceWorker.register('/staff/sw.js', { scope: '/staff/' }));
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) { const { key } = await api('/api/admin/push/key'); sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }); }
    await api('/api/admin/push/subscribe', { body: sub.toJSON() });
    $('[data-push-card]')?.setAttribute('hidden', '');
    if (ask) toast('Alerts are on for this device');
    return true;
  } catch (e) { if (ask) toast('Could not turn on alerts on this device', 'err'); console.warn(e); return false; }
}

window.__vsEnablePush = (ask) => enablePush(ask);
window.__vsNotif = { notifHtml, dismiss };

/* ── Global search ── */
function openSearch() {
  const { el, close } = modal({ title: 'Search', body: `<div class="search" style="max-width:none"><i class="ri-search-line"></i><input class="input" data-q placeholder="Customers, quotes, products, tickets…" autocomplete="off"></div><div data-results style="margin-top:12px"></div>` });
  const out = $('[data-results]', el);
  $('[data-q]', el).addEventListener('input', debounce(async (e) => {
    const q = e.target.value.trim(); if (q.length < 2) { out.innerHTML = ''; return; }
    out.innerHTML = '<div class="loading-row"><span class="spinner"></span>Searching…</div>';
    const tasks = [];
    if (can('crm', 'quotes')) tasks.push(api(`/api/admin/customers?q=${encodeURIComponent(q)}&per=6`).then((r) => r.items.map((c) => [`#/customers/${c.id}`, 'ri-user-line', c.name, `${c.phone || ''} · ${c.stage}`])));
    if (can('quotes')) tasks.push(api(`/api/admin/quotes?q=${encodeURIComponent(q)}&per=5`).then((r) => r.items.map((x) => [`#/quotes/${x.id}`, 'ri-file-list-3-line', `${x.number} — ${x.title}`, x.customer_name || ''])));
    if (can('inventory', 'shop')) tasks.push(api(`/api/admin/products?q=${encodeURIComponent(q)}&per=5`).then((r) => r.items.map((x) => [`#/inventory`, 'ri-archive-line', x.name, `${x.stock} in stock`])));
    if (can('support')) tasks.push(api(`/api/admin/tickets?q=${encodeURIComponent(q)}&per=5`).then((r) => r.items.map((x) => [`#/support/${x.id}`, 'ri-customer-service-2-line', `${x.number} — ${x.subject}`, x.name || ''])));
    const res = (await Promise.all(tasks.map((t) => t.catch(() => [])))).flat();
    out.innerHTML = res.length ? `<div class="list">${res.map(([h, i, t, s]) => `<a class="li" href="${h}"><span class="li-icon"><i class="${i}"></i></span><div class="body"><strong>${esc(t)}</strong><div class="meta">${esc(s)}</div></div></a>`).join('')}</div>` : '<div class="empty"><i class="ri-search-eye-line"></i><strong>No matches</strong><span>Try a name, phone number or quote number.</span></div>';
    out.onclick = (ev) => { if (ev.target.closest('a')) close(); };
  }, 250));
}

/* ── Router ── */
async function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, ...params] = hash.split('?')[0].split('/');
  if (['login', 'setup'].includes(name)) return authScreen(name);
  if (name === 'welcome' && params[0]) return welcomeScreen(params[0]);
  if (!state.user) {
    try { state.user = await api('/api/auth/me'); }
    catch { return authScreen('login'); }
    if (state.user.must_change_password) return authScreen('change-password');
    if (!state.user.profile_complete) return onboarding();
    await layout();
  }
  if (name === 'change-password') return authScreen('change-password');
  const fallback = can('dashboard') ? 'dashboard' : can('field') ? 'field' : NAV.find((n) => n.path && visible(n))?.path;
  let view = VIEWS[name] ? name : fallback;
  if (view === 'field' && isOwner()) view = 'dashboard';
  if (!view) { setTitle('Welcome'); $('#view').innerHTML = '<div class="card"><div class="empty"><i class="ri-lock-line"></i><strong>No sections yet</strong><span>Ask the administrator to give your login access to the parts of the app you need.</span></div></div>'; return; }
  const navKey = view === 'warranties' ? 'maintenance' : view;
  $$('.nav-link').forEach((a) => a.classList.toggle('active', a.dataset.nav === navKey));
  const el = $('#view');
  const meta = NAV.find((n) => n.path === navKey);
  setTitle(meta?.label || 'Loading…', '');
  el.innerHTML = view === 'dashboard' ? skeleton('page') : `<div class="card">${skeleton('list')}</div>`;
  try {
    const mod = await import(`./views/${VIEWS[view]}.js?v=${V}`);
    await mod.default({ root: el, params, name: view, user: state.user, can, setTitle, isOwner: isOwner() });
    el.focus({ preventScroll: true });
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="card"><div class="empty"><i class="ri-wifi-off-line"></i><strong>This page didn't load</strong><span>${esc(e.message)}</span><button class="btn" type="button" data-reload><i class="ri-refresh-line"></i> Try again</button></div></div>`;
  }
}

addEventListener('hashchange', () => { scrollTo(0, 0); route(); });
document.addEventListener('click', (e) => { if (e.target.closest('[data-reload]')) location.reload(); });
route();
