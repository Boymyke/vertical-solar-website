// Home page: CMS blocks, hero text from the CRM and the quick cost estimator.
import { $, $$, esc, naira, store } from '../core.js';
import { fillBlocks } from '../render.js';
import { mountVideo } from '../media.js';
import { appliance, size, recommend, packagePrice, fuelMonthly, PANEL_W } from '../sizing.js';
import { trackEvent } from '../track.js';

// Appliances shown as tiles, with a sensible starting household.
const QUICK = [['led', 10], ['fan', 3], ['tv', 1], ['decoder', 1], ['fridge', 1], ['freezer', 0], ['laptop', 1], ['wifi', 1], ['ac1', 0], ['ac15', 0], ['pump', 0], ['washer', 0]];
const PETROL = 1100; // ₦ per litre used when the visitor doesn't tell us their spend

function estimator(site) {
  const box = $('[data-qcalc]'); if (!box) return;
  const saved = store.get('vs-qcalc', null);
  const state = { counts: Object.fromEntries(QUICK.map(([k, q]) => [k, saved?.counts?.[k] ?? q])), lithium: saved?.lithium ?? true, night: saved?.night ?? 0.6, spend: saved?.spend || '' };
  const tiles = $('[data-qtiles]');
  tiles.innerHTML = QUICK.map(([k]) => {
    const a = appliance(k);
    return `<div class="qtile" data-k="${k}"><div class="qtile-top"><i class="${a[5]}" aria-hidden="true"></i><span>${esc(a[1])}</span></div>
      <div class="stepper" role="group" aria-label="${esc(a[1])}"><button type="button" data-d="-1" aria-label="Remove one">−</button><input type="number" min="0" max="99" inputmode="numeric" aria-label="How many"><button type="button" data-d="1" aria-label="Add one">+</button></div></div>`;
  }).join('');
  const out = (k, v) => { const el = $(`[data-q="${k}"]`, box); if (el) el.textContent = v; };
  const seg = (sel, v) => $$(`${sel} button`, box).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
  $('[data-q-spend]').value = state.spend;

  function render() {
    $$('.qtile', tiles).forEach((el) => {
      const q = state.counts[el.dataset.k] || 0;
      el.classList.toggle('on', q > 0);
      const inp = $('input', el); if (document.activeElement !== inp) inp.value = q;
    });
    seg('[data-q-bat]', state.lithium ? 'lithium' : 'lead'); seg('[data-q-night]', state.night);
    store.set('vs-qcalc', state);
    const rows = Object.entries(state.counts).filter(([, q]) => q > 0).map(([k, q]) => ({ k, q, h: appliance(k)[3] }));
    const s = size(rows, { lithium: state.lithium, night: state.night });
    const fit = recommend(site?.packages, s);
    const price = packagePrice(fit, state.lithium);
    const cta = $('[data-q-cta]', box);
    const summary = rows.map((r) => `${r.q}× ${appliance(r.k)[1]}`).join(', ');
    if (!s.load) {
      out('name', 'Your estimate'); out('price', '—'); out('pricenote', 'Add an appliance to see a price.');
      ['inverter', 'battery', 'panels', 'daily'].forEach((k) => out(k, '—'));
      $('[data-q-savebox]', box).hidden = true; cta.href = '/get-quote'; return;
    }
    out('inverter', `${s.inverter} kVA`);
    out('battery', `${s.battery.toFixed(1)} kWh`);
    out('panels', `${s.panels} × ${PANEL_W}W`);
    out('daily', `${s.dailyKwh.toFixed(1)} kWh`);
    const nameEl = $('[data-q="name"]', box);
    if (fit && price) {
      nameEl.setAttribute('translate', 'no'); // package names stay as they are
      out('name', `${fit.name} · ${fit.inverter_kva} kVA`);
      out('price', `From ${naira(price)}`);
      out('pricenote', state.lithium ? 'Installed, with lithium batteries.' : 'Installed, with lead-acid batteries.');
    } else {
      nameEl.removeAttribute('translate');
      out('name', 'Custom system');
      out('price', 'Custom design');
      out('pricenote', 'Your load is larger than our standard packages — an engineer will design and price it for you.');
    }
    const monthly = Number(state.spend) || fuelMonthly(s.dailyKwh, PETROL);
    const save = $('[data-q-savebox]', box);
    save.hidden = !monthly;
    if (monthly) {
      const months = price ? Math.max(1, Math.round(price / monthly)) : 0;
      out('save', `${state.spend ? 'You spend about' : 'A generator would cost about'} ${naira(monthly)} a month for this power.${months ? ` Solar pays for itself in about ${months} months.` : ''}`);
    }
    const qs = new URLSearchParams({ package: fit ? `${fit.name} (${fit.inverter_kva}kVA)` : 'Custom / larger system', battery: state.lithium ? 'Lithium-ion' : 'Lead-acid / tubular', load: summary });
    cta.href = `/get-quote?${qs}`;
  }

  tiles.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-d]'); if (!b) return;
    const k = b.closest('.qtile').dataset.k;
    state.counts[k] = Math.max(0, Math.min(99, (state.counts[k] || 0) + Number(b.dataset.d)));
    render();
  });
  tiles.addEventListener('input', (e) => {
    const k = e.target.closest('.qtile')?.dataset.k; if (!k) return;
    state.counts[k] = Math.max(0, Math.min(99, Math.round(Number(e.target.value) || 0)));
    render();
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-q-bat] button, [data-q-night] button'); if (!b) return;
    if (b.closest('[data-q-bat]')) state.lithium = b.dataset.v === 'lithium'; else state.night = Number(b.dataset.v);
    render();
  });
  $('[data-q-spend]').addEventListener('input', (e) => { state.spend = e.target.value; render(); });
  $('[data-q-cta]', box).addEventListener('click', () => trackEvent('estimate_quote'));
  render();
  window.addEventListener('vs:lang', render);
}

// Process steps light up one after another as the section scrolls into view.
function stepsOnScroll() {
  const list = $('[data-steps]'); if (!list || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cards = $$('.step-card', list), dots = $$('.steps-progress i'), bar = $('.steps-progress');
  list.classList.add('js-steps');
  let raf = 0;
  const update = () => {
    raf = 0;
    const vh = innerHeight, r = list.getBoundingClientRect();
    const oneRow = cards.length > 1 && Math.abs(cards[0].getBoundingClientRect().top - cards[cards.length - 1].getBoundingClientRect().top) < 4;
    if (oneRow) {
      // 0 when the cards' top reaches 85% of the screen, 1 when it reaches 35%.
      const p = Math.min(1, Math.max(0, (vh * .85 - r.top) / (vh * .5)));
      bar?.style.setProperty('--p', p.toFixed(3));
      cards.forEach((c, i) => { const on = p >= (i + .5) / cards.length - .08; c.classList.toggle('on', on); dots[i]?.classList.toggle('on', on); });
    } else {
      cards.forEach((c) => c.classList.toggle('on', c.getBoundingClientRect().top < vh * .82));
    }
  };
  const req = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener('scroll', req, { passive: true }); addEventListener('resize', req); update();
}

export default async function (site) {
  stepsOnScroll();
  const applyHero = () => {
    if (!site?.hero) return;
    const h1 = $('#hero-title'), sub = $('.hero .lede');
    if (site.hero.headline && h1 && h1.textContent.trim() !== site.hero.headline.trim()) h1.textContent = site.hero.headline;
    if (site.hero.subheadline && sub && sub.textContent.trim() !== site.hero.subheadline.trim()) sub.textContent = site.hero.subheadline;
  };
  applyHero();
  estimator(site);
  await fillBlocks(site);
  const v = site?.videos?.[0];
  if (v?.url) {
    const sec = $('[data-video-section]'); sec.hidden = false;
    mountVideo($('[data-home-video]'), v.url, v.poster || '/images/site/team-installing-panels.webp', v.title || 'See how we install');
  }
}
