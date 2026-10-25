// Shared helpers for the public website.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const naira = (n) => '₦' + Math.round(Number(n || 0)).toLocaleString('en-NG');
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

export async function api(path, opts = {}) {
  const init = { method: opts.method || (opts.body ? 'POST' : 'GET'), headers: { accept: 'application/json' } };
  if (opts.body !== undefined) {
    if (opts.body instanceof FormData || opts.body instanceof Blob) init.body = opts.body;
    else { init.body = JSON.stringify(opts.body); init.headers['content-type'] = 'application/json'; }
  }
  const res = await fetch(path, init);
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

let sitePromise;
export function getSite() {
  if (!sitePromise) {
    const cached = (() => { try { return JSON.parse(sessionStorage.getItem('vs-site') || 'null'); } catch { return null; } })();
    if (cached && Date.now() - cached.t < 60000) sitePromise = Promise.resolve(cached.d);
    else sitePromise = api('/api/public/site').then((d) => { try { sessionStorage.setItem('vs-site', JSON.stringify({ t: Date.now(), d })); } catch {} return d; })
      .catch(() => null);
  }
  return sitePromise;
}

export function toast(msg, ms = 3200) {
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export const lang = () => document.documentElement.getAttribute('lang') || 'en';

export function fmtDate(d) {
  if (!d) return '';
  const x = new Date(String(d).replace(' ', 'T') + (String(d).includes('Z') ? '' : 'Z'));
  return x.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function waLink(number, text) {
  return `https://wa.me/${String(number || '').replace(/\D/g, '')}?text=${encodeURIComponent(text || '')}`;
}

export function initialsOf(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export function stars(n = 5) {
  const k = Math.max(0, Math.min(5, Math.round(n)));
  return `<span class="stars" aria-label="${k} out of 5 stars">${'★'.repeat(k)}${'☆'.repeat(5 - k)}</span>`;
}
