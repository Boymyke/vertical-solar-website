// Shared utilities.

export const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
export const isoDate = (d = new Date()) => new Date(d).toISOString().slice(0, 10);
export const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
export const addMonths = (d, n) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x; };
export const sqlDate = (d) => new Date(d).toISOString().replace('T', ' ').slice(0, 19);

export function randomToken(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function slugify(s = '') {
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
}

export function escapeHtml(s = '') {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Conservative HTML sanitizer for admin-authored rich text (blog posts, project write-ups).
const ALLOWED_TAGS = new Set(['p','br','strong','b','em','i','u','s','a','ul','ol','li','h2','h3','h4','blockquote','img','figure','figcaption','table','thead','tbody','tr','th','td','hr','code','pre','span','div','iframe','video','source','mark','small','sup','sub']);
const ALLOWED_IFRAME = /^https:\/\/(www\.youtube-nocookie\.com|www\.youtube\.com|player\.vimeo\.com)\//;
export function sanitizeHtml(html = '') {
  let out = String(html);
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/<(script|style|object|embed|form|input|button|textarea|select|link|meta|base)[\s\S]*?>[\s\S]*?<\/\1>/gi, '');
  out = out.replace(/<(script|style|object|embed|form|input|button|textarea|select|link|meta|base)\b[^>]*\/?>/gi, '');
  out = out.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (full, tag, attrs) => {
    const t = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(t)) return '';
    if (full.startsWith('</')) return `</${t}>`;
    const kept = [];
    attrs.replace(/([a-zA-Z-:]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g, (_, name, __, v1, v2, v3) => {
      const n = name.toLowerCase();
      const v = (v1 ?? v2 ?? v3 ?? '').trim();
      if (n.startsWith('on')) return;
      if (['href','src'].includes(n)) {
        if (/^\s*(javascript|vbscript|data):/i.test(v) && !(n === 'src' && /^data:image\//i.test(v))) return;
        if (t === 'iframe' && n === 'src' && !ALLOWED_IFRAME.test(v)) return;
      }
      if (['href','src','alt','title','class','width','height','loading','target','rel','colspan','rowspan','allow','allowfullscreen','controls','poster','type','id'].includes(n)) {
        kept.push(`${n}="${escapeHtml(v)}"`);
      }
    });
    if (t === 'a') kept.push('rel="noopener"');
    if (t === 'img' && !kept.some((k) => k.startsWith('loading='))) kept.push('loading="lazy"');
    return `<${t}${kept.length ? ' ' + kept.join(' ') : ''}>`;
  });
  return out;
}

export function stripHtml(html = '') {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function parseUA(ua = '') {
  const s = ua.toLowerCase();
  const device = /ipad|tablet|(android(?!.*mobile))/.test(s) ? 'tablet' : /mobi|iphone|android/.test(s) ? 'mobile' : 'desktop';
  const browser = /edg\//.test(s) ? 'Edge' : /opr\/|opera/.test(s) ? 'Opera' : /samsungbrowser/.test(s) ? 'Samsung' :
    /chrome\//.test(s) ? 'Chrome' : /firefox\//.test(s) ? 'Firefox' : /safari\//.test(s) ? 'Safari' : 'Other';
  const os = /windows/.test(s) ? 'Windows' : /iphone|ipad|ios/.test(s) ? 'iOS' : /android/.test(s) ? 'Android' :
    /mac os/.test(s) ? 'macOS' : /linux/.test(s) ? 'Linux' : 'Other';
  const bot = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse/.test(s);
  return { device, browser, os, bot };
}

export const parseJSON = (v, fallback) => {
  if (v == null || v === '') return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
};

export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

export const str = (v, max = 500) => (v == null ? null : String(v).trim().slice(0, max) || null);
export const num = (v, def = null) => (v === '' || v == null || isNaN(Number(v)) ? def : Number(v));
export const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' || v === 'on' ? 1 : 0);

export const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
export const normPhone = (p) => {
  const d = String(p || '').replace(/[^\d+]/g, '');
  if (!d) return null;
  if (d.startsWith('+')) return d;
  if (d.startsWith('234')) return '+' + d;
  if (d.startsWith('0') && d.length === 11) return '+234' + d.slice(1);
  return d;
};

export function naira(n) {
  return '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
}

export async function nextNumber(env, prefix, table) {
  const year = new Date().getUTCFullYear();
  const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE number LIKE ?`).bind(`${prefix}-${year}-%`).first();
  return `${prefix}-${year}-${String((row?.c || 0) + 1).padStart(4, '0')}`;
}
