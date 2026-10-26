// Scroll motion: text and cards rise into place, photos open with a soft mask wipe and settle from a slight zoom.
// Everything stays visible without JavaScript, with reduced motion, or with the "stop animations" setting.
const TEXT = [
  '.section .head-split > h2', '.section .head-split p', '.section .head-split .btn', '.section-head > *', '.page-hero h1', '.page-hero .lede', '.page-hero .btn-row',
  '.solution-card', '.pkg', '.project-card', '.post-card', '.t-card', '.t-empty', '.branch', '.faq-item', '.bento-card', '.bento-intro', '.feature', '.stat',
  '.calc-wrap > *', '.qcalc > *', '.cta-band', '.trusted-inner > *', '.prose > *', '.contact-card', '.product-card', '.timeline > *', '.value-card', '.team-card',
];
const IMAGES = ['.solution-card figure', '.project-card .img', '.post-card-img', '.bento-photo', '.media-frame', '.page-hero-photo', '.gallery-item', '.split-photo', '.about-photo', '.product-card .img'];

export function initMotion() {
  const html = document.documentElement;
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches || html.classList.contains('a11y-still')) return;
  html.classList.add('motion');
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (!en.isIntersecting) return;
    en.target.classList.add('in');
    io.unobserve(en.target);
  }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  const tag = (root = document) => {
    root.querySelectorAll(TEXT.join(',')).forEach((el) => {
      if (el.closest('.hero, .site-header, .site-footer, .modal, .chat-panel, .lightbox') || el.dataset.mo) return;
      el.dataset.mo = 'up';
      // Stagger siblings in the same row/list so cards arrive one after another.
      const sibs = el.parentElement ? [...el.parentElement.children].filter((c) => c.dataset.mo === 'up') : [];
      el.style.setProperty('--d', `${Math.min(sibs.indexOf(el), 5) * 90}ms`);
      io.observe(el);
    });
    root.querySelectorAll(IMAGES.join(',')).forEach((el) => {
      if (el.closest('.hero, .modal, .lightbox') || el.dataset.mi) return;
      el.dataset.mi = '1';
      io.observe(el);
    });
  };
  tag();
  // Cards rendered later from the CRM (projects, posts, reviews...) are picked up too.
  let pending = false;
  new MutationObserver(() => {
    if (pending) return; pending = true;
    requestAnimationFrame(() => { pending = false; tag(document.querySelector('main') || document); });
  }).observe(document.querySelector('main') || document.body, { childList: true, subtree: true });
  // Safety net: anything still hidden after 4s (e.g. printed or very tall pages) is shown.
  setTimeout(() => document.querySelectorAll('[data-mo]:not(.in), [data-mi]:not(.in)').forEach((el) => {
    const r = el.getBoundingClientRect(); if (r.top < innerHeight) el.classList.add('in');
  }), 4000);
}

// Headline numbers count up from zero when they first come into view ("500+" rolls 0 → 500, then the "+" stays).
export function countUp(root = document) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('a11y-still');
  root.querySelectorAll('[data-stats] strong, [data-count]').forEach((el) => {
    if (el.dataset.counted) return;
    const m = el.textContent.trim().match(/^([\d,]+(?:\.\d+)?)(.*)$/);
    if (!m) return;
    el.dataset.counted = '1';
    const target = Number(m[1].replace(/,/g, '')), tail = m[2], dec = (m[1].split('.')[1] || '').length;
    if (still || !target) return;
    const fmt = (v) => (dec ? v.toFixed(dec) : Math.round(v).toLocaleString()) + tail;
    el.style.minWidth = `${el.getBoundingClientRect().width}px`; // no jiggle while digits change
    el.textContent = fmt(0);
    const run = () => {
      const t0 = performance.now(), dur = 1800;
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(2, -10 * p); // ease-out
        el.textContent = fmt(p >= 1 ? target : target * e);
        if (p < 1) requestAnimationFrame(tick); else el.style.minWidth = '';
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) { io.disconnect(); setTimeout(run, el.closest('.hero') ? 450 : 0); } }, { threshold: .4 });
    io.observe(el);
  });
}
