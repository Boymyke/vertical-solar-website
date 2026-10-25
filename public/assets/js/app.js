// Website entry point — loaded on every public page.
import { $, $$, esc, api, getSite, store, toast, waLink } from './core.js';
import { initI18n, applyLang } from './i18n.js';
import { initA11y } from './a11y.js';
import { initTracking, trackEvent } from './track.js';
import { initCart } from './cart.js';
import { initChat } from './chat.js';
import { mountVideo } from './media.js';
export { mountVideo };

const html = document.documentElement;

/* ── Theme: auto (follows Lagos time) / day / night ── */
function initTheme() {
  const btn = $('[data-theme-toggle]');
  if (!btn) return;
  const label = () => {
    const mode = html.dataset.themeMode;
    btn.setAttribute('aria-label', `Theme: ${mode === 'auto' ? 'automatic (follows the sun in Lagos)' : mode}. Click to change.`);
    btn.title = mode === 'auto' ? 'Auto — follows the sun' : mode === 'day' ? 'Day mode' : 'Night mode';
  };
  btn.addEventListener('click', () => {
    const order = ['auto', 'day', 'night'];
    const next = order[(order.indexOf(html.dataset.themeMode || 'auto') + 1) % 3];
    const h = (new Date().getUTCHours() + 1 + new Date().getUTCMinutes() / 60) % 24;
    const theme = next === 'auto' ? (h >= 6.6 && h < 18.75 ? 'day' : 'night') : next;
    html.dataset.themeMode = next;
    html.dataset.theme = theme;
    try { localStorage.setItem('vs-theme', next); } catch {}
    label();
    toast(next === 'auto' ? 'Auto: the site follows the sun in Lagos' : next === 'day' ? 'Day mode' : 'Night mode');
    window.dispatchEvent(new Event('vs:theme'));
  });
  label();
}

/* ── Header & navigation ── */
function initNav() {
  const header = $('.site-header');
  const onScroll = () => header?.classList.toggle('is-solid', scrollY > 24);
  onScroll(); addEventListener('scroll', onScroll, { passive: true });
  const toggle = $('.menu-toggle'), nav = $('.main-nav');
  toggle?.addEventListener('click', () => {
    const open = !nav.classList.contains('open');
    nav.classList.toggle('open', open); header.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open);
    toggle.innerHTML = `<i class="${open ? 'ri-close-line' : 'ri-menu-3-line'}" aria-hidden="true"></i>`;
    document.body.style.overflow = open ? 'hidden' : '';
  });
  $$('.has-sub > .nav-trigger').forEach((b) => b.addEventListener('click', () => {
    const li = b.parentElement; const open = !li.classList.contains('open');
    $$('.has-sub.open').forEach((x) => x !== li && x.classList.remove('open'));
    li.classList.toggle('open', open); b.setAttribute('aria-expanded', open);
  }));
  document.addEventListener('click', (e) => { if (!e.target.closest('.has-sub')) $$('.has-sub.open').forEach((x) => { x.classList.remove('open'); x.querySelector('.nav-trigger')?.setAttribute('aria-expanded', 'false'); }); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.has-sub.open').forEach((x) => x.classList.remove('open')); });
  const here = location.pathname.replace(/\/$/, '') || '/';
  $$('.main-nav a').forEach((a) => { if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page'); });
}

/* ── Content managed from the CRM: contacts, socials, certificates, branches ── */
function renderSite(site) {
  if (!site) return;
  const c = site.company;
  $$('[data-phone]').forEach((a) => { a.href = `tel:${c.phones[0]}`; if (a.dataset.phone === 'text') a.textContent = c.phones[0]; });
  $$('[data-email]').forEach((a) => { a.href = `mailto:${c.email}`; if (a.dataset.email === 'text') a.textContent = c.email; });
  $$('[data-whatsapp]').forEach((a) => { a.href = waLink(c.whatsapp, a.dataset.whatsapp || 'Hello Vertical Solar, I would like to make an enquiry.'); a.target = '_blank'; a.rel = 'noopener'; });
  $$('[data-address]').forEach((el) => (el.textContent = c.address));
  $$('[data-hours]').forEach((el) => (el.textContent = c.hours));
  const socials = $$('[data-socials]');
  socials.forEach((el) => {
    el.innerHTML = site.socials.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener me" aria-label="${esc(s.platform)}"><i class="${esc(s.icon)}" aria-hidden="true"></i></a>`).join('');
  });
  $$('[data-certs]').forEach((el) => {
    const wrap = el.closest('[data-certs-wrap]');
    if (!site.certificates.length) { if (wrap) wrap.hidden = true; return; }
    if (wrap) wrap.hidden = false;
    el.innerHTML = site.certificates.map((x) => `<${x.link || x.image ? 'a' : 'span'} class="cert" ${x.link ? `href="${esc(x.link)}" target="_blank" rel="noopener"` : x.image ? `href="${esc(x.image)}" target="_blank" rel="noopener"` : ''}>
      ${x.image ? `<img src="${esc(x.image)}" alt="" loading="lazy">` : '<i class="ri-award-line" aria-hidden="true" style="font-size:1.6rem"></i>'}<span><strong>${esc(x.title)}</strong>${x.issuer ? esc(x.issuer) : ''}</span></${x.link || x.image ? 'a' : 'span'}>`).join('');
  });
  $$('[data-branch-list]').forEach((el) => {
    el.innerHTML = site.branches.map((b) => `<li><a href="/contact#branch-${b.id}">${esc(b.name)}</a></li>`).join('');
  });
  // Stats from settings
  $$('[data-stats]').forEach((el) => {
    el.innerHTML = site.stats.map((s) => `<div><strong>${s.plain ? s.value : Number(s.value).toLocaleString()}${esc(s.suffix || '')}</strong><span>${esc(s.label)}</span></div>`).join('');
  });
  if (site.features?.blog_enabled === false) $$('a[href="/blog"]').forEach((a) => (a.closest('li') || a).setAttribute('hidden', ''));
  if (site.features?.testimonials_enabled === false) $$('[data-testimonials-section], a[href="/testimonials"]').forEach((el) => (el.closest('li') || el).setAttribute('hidden', ''));
  if (site.integrations?.turnstile_site_key) window.VS_TURNSTILE = site.integrations.turnstile_site_key;
}

/* ── Forms → CRM ── */
let turnstileLoaded;
function loadTurnstile() {
  if (!window.VS_TURNSTILE) return Promise.resolve();
  if (!turnstileLoaded) turnstileLoaded = new Promise((res) => { const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.onload = res; document.head.appendChild(s); });
  return turnstileLoaded;
}
function initForms() {
  $$('form[data-form]').forEach(async (form) => {
    await getSite();
    if (window.VS_TURNSTILE) {
      await loadTurnstile();
      const box = document.createElement('div'); box.className = 'ts';
      form.querySelector('[type="submit"]')?.before(box);
      window.turnstile?.render(box, { sitekey: window.VS_TURNSTILE, callback: (t) => (form.dataset.ts = t) });
    }
  });
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const status = form.querySelector('.form-status') || form.appendChild(Object.assign(document.createElement('div'), { className: 'form-status', role: 'status' }));
    status.hidden = true;
    const invalid = [...form.elements].find((el) => el.willValidate && !el.checkValidity());
    if (invalid) { invalid.setAttribute('aria-invalid', 'true'); invalid.reportValidity(); invalid.focus(); return; }
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    body.page = location.pathname;
    body.turnstile = form.dataset.ts;
    if (form.dataset.extra) Object.assign(body, JSON.parse(form.dataset.extra));
    const btn = form.querySelector('[type="submit"]');
    btn?.classList.add('is-loading');
    const endpoint = { lead: '/api/public/lead', ticket: '/api/public/ticket', subscribe: '/api/public/subscribe' }[form.dataset.form];
    try {
      const r = await api(endpoint, { body });
      trackEvent(`form_${form.dataset.form}`, { kind: body.kind });
      if (form.dataset.success === 'replace') {
        form.innerHTML = `<div class="form-success" role="status"><i class="ri-checkbox-circle-line" aria-hidden="true"></i><h3>${esc(form.dataset.successTitle || 'Thank you!')}</h3><p class="muted">${esc(r.message || '')}</p>
          ${form.dataset.form !== 'subscribe' ? `<a class="btn btn-ghost" data-whatsapp href="#"><i class="ri-whatsapp-line" aria-hidden="true"></i> Continue on WhatsApp</a>` : ''}</div>`;
        renderSite(await getSite());
      } else {
        status.className = 'form-status ok'; status.hidden = false;
        status.innerHTML = `<i class="ri-checkbox-circle-line" aria-hidden="true"></i><span>${esc(r.message || 'Thank you!')}</span>`;
        form.reset();
      }
    } catch (err) {
      status.className = 'form-status err'; status.hidden = false;
      status.innerHTML = `<i class="ri-error-warning-line" aria-hidden="true"></i><span>${esc(err.message)}</span>`;
    } finally { btn?.classList.remove('is-loading'); window.turnstile?.reset?.(); }
  });
  document.addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));
}

/* ── Popups / adverts managed in the CRM ── */
function initPopups(site) {
  if (!site?.popups?.length || new URLSearchParams(location.search).has('vs_heatmap')) return;
  const path = location.pathname;
  const seen = store.get('vs-popups', {});
  const p = site.popups.find((x) => {
    const pages = (x.pages || '*').split(',').map((s) => s.trim()).filter(Boolean);
    const match = pages.includes('*') || pages.some((pg) => (pg.endsWith('*') ? path.startsWith(pg.slice(0, -1)) : pg === path));
    if (!match) return false;
    if (x.frequency === 'once' && seen[x.id]) return false;
    if (x.frequency === 'session') { try { if (sessionStorage.getItem('vs-pop-' + x.id)) return false; } catch {} }
    return true;
  });
  if (!p) return;
  const show = () => {
    if (document.querySelector('.popup')) return;
    const wrap = document.createElement('div');
    wrap.className = `popup ${p.style || 'modal'}`;
    wrap.setAttribute('role', p.style === 'banner' ? 'region' : 'dialog');
    wrap.setAttribute('aria-label', p.title);
    wrap.innerHTML = `<div class="box">${p.image && p.style !== 'banner' ? `<img src="${esc(p.image)}" alt="">` : ''}<div class="content"><h2>${esc(p.title)}</h2>${p.body ? `<p>${esc(p.body)}</p>` : ''}
      ${p.cta_text && p.cta_url ? `<a class="btn ${p.style === 'banner' ? 'btn-ghost btn-sm' : 'btn-primary'}" href="${esc(p.cta_url)}" data-pop-cta>${esc(p.cta_text)}</a>` : ''}</div>
      <button class="icon-btn close" type="button" aria-label="Close"><i class="ri-close-line" aria-hidden="true"></i></button></div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector('.close').addEventListener('click', close);
    if (p.style === 'modal') wrap.addEventListener('click', (e) => e.target === wrap && close());
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
    wrap.querySelector('[data-pop-cta]')?.addEventListener('click', () => navigator.sendBeacon?.(`/api/public/popup/${p.id}/stat`, new Blob([JSON.stringify({ kind: 'click' })], { type: 'application/json' })));
    if (p.style === 'modal') wrap.querySelector('.close').focus();
    seen[p.id] = Date.now(); store.set('vs-popups', seen);
    try { sessionStorage.setItem('vs-pop-' + p.id, '1'); } catch {}
    fetch(`/api/public/popup/${p.id}/stat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'view' }) }).catch(() => {});
  };
  if (p.trigger === 'load') show();
  else if (p.trigger === 'scroll') addEventListener('scroll', function s() { if (scrollY / (document.body.scrollHeight - innerHeight) > .5) { show(); removeEventListener('scroll', s); } }, { passive: true });
  else if (p.trigger === 'exit') document.addEventListener('mouseout', function ex(e) { if (!e.relatedTarget && e.clientY < 10) { show(); document.removeEventListener('mouseout', ex); } });
  else setTimeout(show, (p.delay_seconds || 6) * 1000);
}

/* ── Consent (NDPA-friendly) ── */
function initConsent() {
  if (store.get('vs-consent')) return;
  const bar = document.createElement('div');
  bar.className = 'consent'; bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Privacy notice');
  bar.innerHTML = `<p data-i18n="consent.text">We use privacy-friendly, cookie-free analytics to improve this site. No personal data is sold. <a href="/privacy">Learn more</a></p>
    <div class="btn-row"><button class="btn btn-ghost btn-sm" type="button" data-c="declined" data-i18n="consent.no">No thanks</button><button class="btn btn-primary btn-sm" type="button" data-c="accepted" data-i18n="consent.ok">OK</button></div>`;
  document.body.appendChild(bar);
  bar.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; store.set('vs-consent', b.dataset.c); bar.remove(); });
}

/* ── Media: lightbox, lazy video embeds ── */
function initMedia() {
  document.addEventListener('click', (e) => {
    const item = e.target.closest('[data-full]');
    if (!item) return;
    const group = $$('[data-full]', item.closest('[data-lightbox]') || document);
    let i = group.indexOf(item);
    const lb = document.createElement('div');
    lb.className = 'lightbox'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-label', 'Photo viewer');
    lb.innerHTML = `<img alt=""><button class="icon-btn lb-close" type="button" aria-label="Close"><i class="ri-close-line"></i></button>
      ${group.length > 1 ? '<button class="icon-btn lb-prev" type="button" aria-label="Previous"><i class="ri-arrow-left-s-line"></i></button><button class="icon-btn lb-next" type="button" aria-label="Next"><i class="ri-arrow-right-s-line"></i></button>' : ''}`;
    const img = lb.querySelector('img');
    const show = () => { img.src = group[i].dataset.full; img.alt = group[i].querySelector('img')?.alt || ''; };
    show(); document.body.appendChild(lb); lb.querySelector('.lb-close').focus();
    const close = () => { lb.remove(); item.focus(); document.removeEventListener('keydown', key); };
    const key = (ev) => { if (ev.key === 'Escape') close(); if (ev.key === 'ArrowRight') { i = (i + 1) % group.length; show(); } if (ev.key === 'ArrowLeft') { i = (i - 1 + group.length) % group.length; show(); } };
    document.addEventListener('keydown', key);
    lb.addEventListener('click', (ev) => {
      if (ev.target === lb || ev.target.closest('.lb-close')) close();
      if (ev.target.closest('.lb-next')) { i = (i + 1) % group.length; show(); }
      if (ev.target.closest('.lb-prev')) { i = (i - 1 + group.length) % group.length; show(); }
    });
  });
  $$('[data-video]').forEach((el) => mountVideo(el, el.dataset.video, el.dataset.poster, el.dataset.caption));
}

/* ── Small UI behaviours ── */
function initMisc() {
  $$('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));
  // Animated counters (only for numbers that are visible, once)
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => entries.forEach((en) => {
    if (!en.isIntersecting) return;
    io.unobserve(en.target);
    const el = en.target, target = Number(el.dataset.count), suffix = el.dataset.suffix || '';
    if (html.classList.contains('a11y-still') || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = target.toLocaleString() + suffix; return; }
    const t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / 1400); el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString() + suffix; if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), { threshold: .6 }) : null;
  $$('[data-count]').forEach((el) => io?.observe(el));
  // Share
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-share]')) return;
    const data = { title: document.title, url: location.href };
    if (navigator.share) { try { await navigator.share(data); } catch {} }
    else { await navigator.clipboard?.writeText(location.href); toast('Link copied'); }
  });
  // Table of contents for articles
  $$('[data-toc]').forEach((box) => {
    const src = $(box.dataset.toc); if (!src) return;
    const hs = $$('h2, h3', src);
    if (hs.length < 2) { box.hidden = true; return; }
    const ol = document.createElement('ol');
    hs.forEach((h, i) => { if (!h.id) h.id = 's-' + i + '-' + h.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40); ol.insertAdjacentHTML('beforeend', `<li style="${h.tagName === 'H3' ? 'padding-left:12px' : ''}"><a href="#${h.id}">${esc(h.textContent)}</a></li>`); });
    box.appendChild(ol);
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-optout]');
    if (b) { store.set('vs-consent', 'declined'); b.textContent = 'Analytics turned off on this device'; b.disabled = true; }
  });
  // Track key CTAs
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="tel:"], a[href*="wa.me"], a[href="/get-quote"]');
    if (a) trackEvent(a.href.startsWith('tel:') ? 'click_call' : a.href.includes('wa.me') ? 'click_whatsapp' : 'click_quote');
  });
}

async function boot() {
  initTheme();
  initNav();
  initI18n();
  initA11y();
  initMedia();
  initMisc();
  initForms();
  initTracking();
  const site = await getSite();
  renderSite(site);
  initCart(site ? site.shop.enabled : true);
  initChat();
  initConsent();
  initPopups(site);
  if (site?.seo?.ga4_id && /^G-[A-Z0-9]+$/.test(site.seo.ga4_id) && store.get('vs-consent') === 'accepted') {
    const g = document.createElement('script'); g.async = true; g.src = `https://www.googletagmanager.com/gtag/js?id=${site.seo.ga4_id}`; document.head.appendChild(g);
    window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); }; window.gtag('js', new Date()); window.gtag('config', site.seo.ga4_id, { anonymize_ip: true });
  }
  const lg = html.getAttribute('lang');
  if (lg && lg !== 'en') applyLang(lg);
  const page = document.body.dataset.page;
  if (page) {
    try { const m = await import(`./pages/${page}.js`); m.default?.(site); }
    catch (e) { console.error(e); }
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
}
boot();
