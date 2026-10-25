// Accessibility panel: text size, contrast, readable font, spacing, link highlight, pause motion,
// large cursor, reading guide, grayscale and "read page aloud". Preferences persist per device.
import { $, $$, store } from './core.js';
import { t } from './i18n.js';

const KEY = 'vs-a11y';
const TOGGLES = [
  ['a11y-contrast', 'ri-contrast-2-line', 'High contrast'],
  ['a11y-dyslexic', 'ri-font-size', 'Readable font'],
  ['a11y-spacing', 'ri-line-height', 'Text spacing'],
  ['a11y-links', 'ri-links-line', 'Highlight links'],
  ['a11y-still', 'ri-pause-circle-line', 'Pause animations'],
  ['a11y-cursor', 'ri-cursor-line', 'Big cursor'],
  ['a11y-guide', 'ri-ruler-line', 'Reading guide'],
  ['a11y-gray', 'ri-drop-line', 'Grayscale'],
];
const SIZES = ['', 'a11y-text-1', 'a11y-text-2', 'a11y-text-3'];

const html = document.documentElement;
const save = () => store.set(KEY, [...html.classList].filter((c) => c.startsWith('a11y-')));

let speaking = false;
export function readAloud(target) {
  if (!('speechSynthesis' in window)) return alert('Read aloud is not supported in this browser.');
  if (speaking) { speechSynthesis.cancel(); speaking = false; return; }
  const el = typeof target === 'string' ? $(target) : target || $('main');
  const text = (el?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 12000);
  if (!text) return;
  const chunks = text.match(/[^.!?]+[.!?]*/g) || [text];
  const lang = html.getAttribute('lang') || 'en';
  const voices = speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang.toLowerCase().startsWith(lang)) || voices.find((v) => /en-(NG|GB|US)/i.test(v.lang));
  speaking = true;
  chunks.forEach((c, i) => {
    const u = new SpeechSynthesisUtterance(c);
    if (voice) u.voice = voice;
    u.rate = 1;
    if (i === chunks.length - 1) u.onend = () => (speaking = false);
    speechSynthesis.speak(u);
  });
}

export function initA11y() {
  const btn = document.createElement('button');
  btn.className = 'fab-a11y';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Accessibility options (Alt + A)');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'a11y-panel');
  btn.innerHTML = '<i class="ri-accessibility-line" aria-hidden="true"></i>';
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.className = 'a11y-panel';
  panel.id = 'a11y-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Accessibility options');
  panel.innerHTML = `
    <header><h2 data-i18n="a11y.title">Accessibility</h2><button class="icon-btn" type="button" data-close aria-label="Close accessibility options"><i class="ri-close-line" aria-hidden="true"></i></button></header>
    <p class="muted" style="font-size:.85rem;margin-bottom:12px" data-i18n="a11y.intro">Adjust the site to suit how you see, read and move. Your choices are saved on this device.</p>
    <div class="a11y-grid">
      <button class="a11y-opt" type="button" data-size aria-label="Text size"><i class="ri-text" aria-hidden="true"></i><span data-i18n="a11y.size">Bigger text</span><span class="lvl" aria-hidden="true"><b></b><b></b><b></b></span></button>
      ${TOGGLES.map(([c, i, l]) => `<button class="a11y-opt" type="button" data-toggle="${c}" aria-pressed="false"><i class="${i}" aria-hidden="true"></i><span data-i18n="${c}">${l}</span></button>`).join('')}
      <button class="a11y-opt" type="button" data-read><i class="ri-volume-up-line" aria-hidden="true"></i><span data-i18n="a11y.read">Read page aloud</span></button>
    </div>
    <div class="row"><button class="btn btn-ghost btn-sm" type="button" data-reset><i class="ri-restart-line" aria-hidden="true"></i><span data-i18n="a11y.reset">Reset</span></button><a class="btn btn-ghost btn-sm" href="/accessibility" data-i18n="a11y.statement">Accessibility statement</a></div>`;
  document.body.appendChild(panel);

  const guide = document.createElement('div');
  guide.className = 'reading-guide';
  guide.setAttribute('aria-hidden', 'true');
  document.body.appendChild(guide);
  document.addEventListener('mousemove', (e) => { if (html.classList.contains('a11y-guide')) guide.style.top = e.clientY - 22 + 'px'; }, { passive: true });

  const sync = () => {
    $$('[data-toggle]', panel).forEach((b) => b.setAttribute('aria-pressed', html.classList.contains(b.dataset.toggle)));
    const lvl = SIZES.findIndex((s) => s && html.classList.contains(s));
    $$('.lvl b', panel).forEach((b, i) => b.classList.toggle('on', i < lvl));
  };
  const open = (v) => { panel.hidden = !v; btn.setAttribute('aria-expanded', v); if (v) panel.querySelector('button')?.focus(); };
  btn.addEventListener('click', () => open(panel.hidden));
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.close != null) { open(false); btn.focus(); }
    if (b.dataset.toggle) { html.classList.toggle(b.dataset.toggle); save(); sync(); }
    if (b.dataset.size != null) {
      const lvl = SIZES.findIndex((s) => s && html.classList.contains(s));
      SIZES.forEach((s) => s && html.classList.remove(s));
      const next = lvl < 0 ? 1 : (lvl + 1) % SIZES.length;
      if (SIZES[next]) html.classList.add(SIZES[next]);
      save(); sync();
    }
    if (b.dataset.read != null) readAloud($('main'));
    if (b.dataset.reset != null) { [...html.classList].filter((c) => c.startsWith('a11y-')).forEach((c) => html.classList.remove(c)); save(); sync(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); open(panel.hidden); }
    if (e.key === 'Escape' && !panel.hidden) { open(false); btn.focus(); }
  });
  document.addEventListener('click', (e) => {
    const r = e.target.closest('[data-read-aloud]');
    if (r) readAloud(r.dataset.readAloud);
  });
  sync();
}
