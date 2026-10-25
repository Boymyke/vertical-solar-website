// Privacy-friendly first-party analytics: page views, time on page, scroll depth, clicks for heatmaps.
// No cookies, no IP stored. Visitors can opt out from the consent bar or /privacy.
import { store } from './core.js';

const ENDPOINT = '/api/public/track';
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 36);

export function trackingAllowed() {
  if (new URLSearchParams(location.search).has('vs_heatmap')) return false;
  return store.get('vs-consent') !== 'declined';
}

function send(body) {
  const data = JSON.stringify(body);
  if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, new Blob([data], { type: 'application/json' }));
  else fetch(ENDPOINT, { method: 'POST', body: data, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {});
}

export function trackEvent(name, meta) {
  if (!trackingAllowed()) return;
  send({ type: 'event', name, path: location.pathname, visitor_id: store.get('vs-vid'), meta });
}

export function initTracking() {
  if (!trackingAllowed()) return;
  let vid = store.get('vs-vid');
  const isNew = !vid;
  if (!vid) { vid = rid(); store.set('vs-vid', vid); }
  let sess = null;
  try {
    const s = JSON.parse(sessionStorage.getItem('vs-sess') || 'null');
    sess = s && Date.now() - s.t < 30 * 60000 ? s.id : rid();
    sessionStorage.setItem('vs-sess', JSON.stringify({ id: sess, t: Date.now() }));
  } catch { sess = rid(); }
  const pv = rid();
  const qs = new URLSearchParams(location.search);
  const ref = document.referrer && !document.referrer.startsWith(location.origin) ? new URL(document.referrer).hostname : '';
  send({
    type: 'pv', pv_id: pv, visitor_id: vid, session_id: sess, path: location.pathname, title: document.title.slice(0, 180), referrer: ref,
    utm_source: qs.get('utm_source'), utm_campaign: qs.get('utm_campaign'), lang: document.documentElement.lang, screen_w: innerWidth, is_new: isNew,
  });

  const start = Date.now();
  let maxScroll = 0;
  const device = innerWidth < 768 ? 'mobile' : innerWidth < 1100 ? 'tablet' : 'desktop';
  const docH = () => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  addEventListener('scroll', () => {
    const p = Math.round(((scrollY + innerHeight) / docH()) * 100);
    if (p > maxScroll) maxScroll = Math.min(100, p);
  }, { passive: true });

  let buf = [];
  const flush = () => { if (buf.length) { send({ type: 'heat', path: location.pathname, device, events: buf.splice(0, 60) }); } };
  let last = [];
  document.addEventListener('click', (e) => {
    const x = e.pageX / document.documentElement.scrollWidth, y = e.pageY;
    const el = e.target.closest('a,button,input,select,label,[data-track]') || e.target;
    const sel = (el.tagName || '').toLowerCase() + (el.id ? '#' + el.id : '') + (el.getAttribute?.('data-track') ? `[${el.getAttribute('data-track')}]` : '') +
      (el.textContent ? ` "${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)}"` : '');
    const now = Date.now();
    last = last.filter((c) => now - c.t < 700 && Math.abs(c.x - e.clientX) < 30 && Math.abs(c.y - e.clientY) < 30);
    last.push({ t: now, x: e.clientX, y: e.clientY });
    buf.push({ t: last.length >= 3 ? 'rage' : 'click', x, y, h: docH(), s: sel });
    if (buf.length >= 20) flush();
  }, { capture: true, passive: true });
  if (device === 'desktop') {
    let lastMove = 0;
    document.addEventListener('mousemove', (e) => {
      const now = Date.now();
      if (now - lastMove < 900) return;
      lastMove = now;
      buf.push({ t: 'move', x: e.pageX / document.documentElement.scrollWidth, y: e.pageY, h: docH() });
      if (buf.length >= 40) flush();
    }, { passive: true });
  }
  setInterval(flush, 10000);
  const end = () => { flush(); send({ type: 'end', pv_id: pv, duration: Math.round((Date.now() - start) / 1000), max_scroll: maxScroll }); };
  addEventListener('pagehide', end);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') end(); });
}
