// Language switching: English (default), Igbo, Hausa, Yoruba. More languages = add a JSON file + an <option>.
import { $$, store } from './core.js';

export const LANGS = { en: 'English', ig: 'Igbo', ha: 'Hausa', yo: 'Yorùbá' };
const cache = {};
const resolved = {};
let current = 'en';

async function load(code) {
  if (code === 'en') return {};
  if (!cache[code]) cache[code] = fetch(`/assets/i18n/${code}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return cache[code];
}

function remember(el) {
  if (!el.dataset.i18nEn) el.dataset.i18nEn = el.innerHTML;
  if (el.dataset.i18nAttr) {
    el.dataset.i18nAttr.split(',').forEach((a) => { const k = `i18nEn${a}`; if (!(k in el.dataset)) el.dataset[k] = el.getAttribute(a) || ''; });
  }
}

export async function applyLang(code, root = document) {
  if (!LANGS[code]) code = 'en';
  current = code;
  const dict = await load(code);
  resolved[code] = dict;
  $$('[data-i18n]', root).forEach((el) => {
    remember(el);
    const key = el.dataset.i18n;
    const v = code === 'en' ? null : dict[key];
    if (el.dataset.i18nAttr) {
      el.dataset.i18nAttr.split(',').forEach((a) => {
        const av = code === 'en' ? null : dict[`${key}.${a}`];
        el.setAttribute(a, av || el.dataset[`i18nEn${a}`]);
      });
      if (el.dataset.i18nAttrOnly) return;
    }
    el.innerHTML = v || el.dataset.i18nEn;
  });
  document.documentElement.setAttribute('lang', code);
  try { localStorage.setItem('vs-lang', code); } catch {}
  $$('select[data-lang-select]').forEach((s) => (s.value = code));
  window.dispatchEvent(new CustomEvent('vs:lang', { detail: code }));
}

export function t(key, fallback) {
  const d = resolved[current];
  return (d && d[key]) || fallback;
}

export function initI18n() {
  let saved = 'en';
  try { saved = localStorage.getItem('vs-lang') || 'en'; } catch {}
  saved = saved.replace(/"/g, '');
  $$('select[data-lang-select]').forEach((s) => {
    s.value = saved;
    s.addEventListener('change', () => applyLang(s.value));
  });
  if (saved !== 'en') applyLang(saved);
  else document.documentElement.setAttribute('lang', 'en');
}

export const currentLang = () => current;
