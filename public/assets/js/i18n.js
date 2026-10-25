// Whole-site translation: English (source), Igbo, Hausa, Yoruba.
//
// Every visible string on the page — static copy, content loaded from the CRM, messages written by
// scripts — is looked up by its English text in /assets/i18n/<lang>.json. Blocks that contain inline
// formatting (a <strong> or a link inside a sentence) are translated as a whole so word order stays
// natural. Anything not in the dictionary (for example a blog post published after launch) is sent to
// /api/public/translate once, machine-translated, and cached.
//
// Add a language: create /assets/i18n/<code>.json and add it to LANGS.
import { $$ } from './core.js';

export const LANGS = { en: 'English', ig: 'Igbo', ha: 'Hausa', yo: 'Yorùbá' };

const INLINE = new Set(['A', 'STRONG', 'EM', 'B', 'I', 'BR', 'SPAN', 'SMALL', 'ABBR', 'SUP', 'SUB', 'KBD', 'MARK', 'TIME', 'U', 'S', 'Q', 'CITE', 'DFN', 'WBR', 'BDI']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'TEXTAREA', 'CODE', 'PRE', 'TEMPLATE', 'IFRAME', 'CANVAS', 'VIDEO', 'AUDIO', 'MATH']);
const ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];
const LETTER = /\p{L}/u;
const NUM = /\d+(?:[.,]\d+)*/g;

const dicts = {};      // code -> Promise<dict>
const resolved = {};   // code -> dict
const pending = {};    // code -> Set of missing keys waiting for machine translation
let current = 'en';
let observer = null;

// Originals, so we can switch back (or to another language) without reloading.
const origHtml = new WeakMap();   // element -> English innerHTML (block mode)
const origText = new WeakMap();   // text node -> English text
const origAttr = new WeakMap();   // element -> { attr: English value }
const touched = new Set();        // WeakRefs to everything we changed
const lastSet = new WeakMap();    // node -> what we wrote, to notice when a script rewrites it

export const norm = (s) => s.replace(/\s+/g, ' ').trim();
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');
const decode = (html) => { const d = document.createElement('textarea'); d.innerHTML = html.replace(/<[^>]*>/g, ''); return d.value; };
// "Save 5% on 3 items" -> "Save {0}% on {1} items" (numbers inside tags, e.g. links, are left alone)
const template = (key) => {
  const nums = [];
  const k = key.split(/(<[^>]+>)/).map((p) => (p.startsWith('<') ? p : p.replace(NUM, (m) => `{${nums.push(m) - 1}}`))).join('');
  return { k, nums };
};

function skipped(el) {
  return el.closest('[translate="no"], .notranslate, [data-no-i18n], [contenteditable="true"]');
}

// Is this element a "sentence block" we can swap as a whole?
function isBlock(el) {
  if (!el.firstChild || !LETTER.test(el.textContent)) return false;
  for (const d of el.querySelectorAll('*')) {
    if (!INLINE.has(d.tagName)) return false;
    // Scripts may hold references to inner elements (live counters, status text) — translate their text nodes instead.
    if (d.id || [...d.attributes].some((a) => a.name.startsWith('data-'))) return false;
  }
  // Only worth it when there is inline markup; plain text is handled per text node.
  return el.children.length > 0 && [...el.childNodes].some((n) => n.nodeType === 3 && LETTER.test(n.nodeValue));
}

const reverse = {}; // lang -> Set of translated strings (so we never try to translate a translation)
function lookup(dict, key) {
  if (!key || !LETTER.test(key)) return null;
  if (reverse[current]?.has(key)) return null;
  if (dict[key] != null) return dict[key];
  if (/\d/.test(key)) {
    const { k, nums } = template(key);
    const v = dict[k];
    if (v != null) return v.replace(/\{(\d+)\}/g, (_, i) => nums[+i] ?? '');
  }
  return undefined; // undefined = missing (null = not translatable)
}

function want(key) {
  if (current === 'en' || !key || key.length > 4000) return;
  (pending[current] ||= new Set()).add(key);
  scheduleMachine();
}

// Walk a subtree. mode 'apply' translates; mode 'collect' returns the English keys (used to build dictionaries).
function walk(root, dict, mode, out) {
  const visit = (el) => {
    if (el.nodeType !== 1 || SKIP.has(el.tagName) || skipped(el)) return;
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const store = origAttr.get(el) || {};
      const lastA = lastSet.get(el)?.[a];
      const curA = el.getAttribute(a);
      const en = a in store && lastA === curA ? store[a] : curA;
      if (a in store && lastA !== curA) store[a] = curA;
      const key = escapeHtml(norm(en));
      if (mode === 'collect') { if (LETTER.test(key)) out.add(key); continue; }
      const v = lookup(dict, key);
      if (v) { if (!(a in store)) { store[a] = en; origAttr.set(el, store); touched.add(new WeakRef(el)); } const dv = decode(v); el.setAttribute(a, dv); lastSet.set(el, { ...(lastSet.get(el) || {}), [a]: dv }); }
      else if (v === undefined) want(key);
    }
    if (el.tagName === 'INPUT' && (el.type === 'submit' || el.type === 'button') && el.value) {
      const key = escapeHtml(norm(el.value));
      if (mode === 'collect') out.add(key);
    }
    if (isBlock(el)) {
      const cur = el.innerHTML;
      const en = origHtml.has(el) && lastSet.get(el)?.__html === cur ? origHtml.get(el) : cur;
      const key = norm(en);
      if (mode === 'collect') { out.add(key); return; }
      const v = lookup(dict, key);
      if (v) {
        if (!origHtml.has(el)) touched.add(new WeakRef(el));
        origHtml.set(el, en);
        if (cur !== v) el.innerHTML = v;
        lastSet.set(el, { ...(lastSet.get(el) || {}), __html: el.innerHTML });
        return;
      }
      if (v === undefined) want(key);
      // fall through: translate the pieces at least
    }
    for (const n of [...el.childNodes]) {
      if (n.nodeType === 3) {
        const en = origText.has(n) && lastSet.get(n) === n.nodeValue ? origText.get(n) : n.nodeValue;
        if (!LETTER.test(en)) continue;
        const key = escapeHtml(norm(en));
        if (mode === 'collect') { out.add(key); continue; }
        const v = lookup(dict, key);
        if (v) {
          if (!origText.has(n)) touched.add(new WeakRef(n));
          origText.set(n, en);
          const lead = en.match(/^\s*/)[0], trail = en.match(/\s*$/)[0];
          const t = lead + decode(v) + trail;
          if (n.nodeValue !== t) n.nodeValue = t;
          lastSet.set(n, t);
        } else if (v === undefined) want(key);
      } else visit(n);
    }
  };
  visit(root);
  return out;
}

function restore() {
  for (const ref of touched) {
    const n = ref.deref();
    if (!n) continue;
    const last = lastSet.get(n);
    if (n.nodeType === 3) { if (origText.has(n) && last === n.nodeValue) n.nodeValue = origText.get(n); origText.delete(n); lastSet.delete(n); continue; }
    if (origHtml.has(n) && last?.__html === n.innerHTML) n.innerHTML = origHtml.get(n);
    const a = origAttr.get(n); if (a) for (const k in a) if (last?.[k] === n.getAttribute(k)) n.setAttribute(k, a[k]);
    origHtml.delete(n); origAttr.delete(n); lastSet.delete(n);
  }
  touched.clear();
}

async function load(code) {
  if (code === 'en') return {};
  if (!dicts[code]) {
    dicts[code] = fetch(`/assets/i18n/${code}.json?v=3`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((d) => {
      try { Object.assign(d, JSON.parse(localStorage.getItem(`vs-mt-${code}`) || '{}')); } catch {}
      return d;
    });
  }
  return dicts[code];
}

// Machine translation for strings the dictionary does not cover yet (new CRM content).
let mtTimer = null;
function scheduleMachine() {
  clearTimeout(mtTimer);
  mtTimer = setTimeout(async () => {
    const code = current, set = pending[code];
    if (!set || !set.size || code === 'en') return;
    const keys = [...set].slice(0, 60); keys.forEach((k) => set.delete(k));
    try {
      const r = await fetch('/api/public/translate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang: code, items: keys }) });
      if (!r.ok) return;
      const { items } = await r.json();
      const dict = resolved[code]; let cache = {};
      try { cache = JSON.parse(localStorage.getItem(`vs-mt-${code}`) || '{}'); } catch {}
      keys.forEach((k, i) => { const v = items?.[i]; dict[k] = v || null; if (v) { cache[k] = v; reverse[code]?.add(norm(v)); } });
      try { localStorage.setItem(`vs-mt-${code}`, JSON.stringify(cache).slice(0, 400000)); } catch {}
      if (current === code) walk(document.body, dict, 'apply');
      if (set.size) scheduleMachine();
    } catch {}
  }, 700);
}

export async function applyLang(code) {
  if (!LANGS[code]) code = 'en';
  const dict = await load(code);
  resolved[code] = dict;
  if (!reverse[code]) reverse[code] = new Set(Object.values(dict).filter(Boolean).map((v) => norm(v)));
  restore();
  current = code;
  document.documentElement.setAttribute('lang', code);
  try { localStorage.setItem('vs-lang', code); } catch {}
  $$('select[data-lang-select]').forEach((s) => (s.value = code));
  if (code !== 'en') {
    walk(document.body, dict, 'apply');
    if (!document.__vsTitle) document.__vsTitle = document.title;
    const tv = lookup(dict, escapeHtml(norm(document.__vsTitle))); if (tv) document.title = decode(tv);
  } else if (document.__vsTitle) document.title = document.__vsTitle;
  observe();
  window.dispatchEvent(new CustomEvent('vs:lang', { detail: code }));
}

// Re-translate whatever scripts add or change while a non-English language is active.
function observe() {
  if (observer) observer.disconnect();
  if (current === 'en') return;
  let queue = new Set(), raf = 0;
  observer = new MutationObserver((records) => {
    for (const r of records) {
      const t = r.type === 'attributes' ? r.target : r.target.nodeType === 3 ? r.target.parentElement : r.target;
      if (t) queue.add(t);
    }
    if (!raf) raf = requestAnimationFrame(() => {
      raf = 0; const dict = resolved[current] || {};
      const items = [...queue]; queue = new Set();
      for (const el of items) if (el.isConnected) walk(el, dict, 'apply');
    });
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'aria-label', 'title', 'alt'] });
}

// Translate a single string from scripts: t('any.key', 'English text').
export function t(_key, fallback) {
  if (current === 'en' || !fallback) return fallback;
  const v = lookup(resolved[current] || {}, escapeHtml(norm(fallback)));
  return v ? decode(v) : fallback;
}

export function initI18n() {
  let saved = 'en';
  try { saved = (localStorage.getItem('vs-lang') || 'en').replace(/"/g, ''); } catch {}
  $$('select[data-lang-select]').forEach((s) => {
    s.value = LANGS[saved] ? saved : 'en';
    s.addEventListener('change', () => applyLang(s.value));
  });
  if (saved !== 'en' && LANGS[saved]) applyLang(saved);
  else document.documentElement.setAttribute('lang', 'en');
}

export const currentLang = () => current;

// Used by scripts/extract-i18n.mjs to list every English string on a page.
window.__vsI18nCollect = () => [...walk(document.body, {}, 'collect', new Set()), escapeHtml(norm(document.title))];
