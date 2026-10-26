// Home page: CMS blocks, hero text from the CRM and the quick cost estimator.
import { $, $$, esc, naira, store } from '../core.js';
import { fillBlocks } from '../render.js';
import { mountVideo } from '../media.js';
import { APPLIANCES, appliance, size, recommend, packagePrice, fuelMonthly, PANEL_W } from '../sizing.js';
import { trackEvent } from '../track.js';

// Appliances shown as tiles, with a sensible starting household.
const QUICK = [['led', 10], ['fan', 3], ['tv', 1], ['decoder', 1], ['fridge', 1], ['freezer', 0], ['laptop', 1], ['wifi', 1], ['ac1', 0], ['ac15', 0], ['pump', 0], ['washer', 0]];
const PETROL = 1100; // ₦ per litre used when the visitor doesn't tell us their spend

function estimator(site) {
  const box = $('[data-qcalc]'); if (!box) return;
  const saved = store.get('vs-qcalc', null);
  const state = { counts: Object.fromEntries(QUICK.map(([k, q]) => [k, saved?.counts?.[k] ?? q])), extra: (saved?.extra || []).filter((k) => appliance(k)), custom: saved?.custom || {}, lithium: saved?.lithium ?? true, night: saved?.night ?? 0.6, spend: saved?.spend || '' };
  state.extra.forEach((k) => (state.counts[k] = saved?.counts?.[k] ?? 1));
  Object.keys(state.custom).forEach((k) => (state.counts[k] = saved?.counts?.[k] ?? 1));
  const tiles = $('[data-qtiles]');
  const info = (k) => (state.custom[k] ? [k, state.custom[k].name, state.custom[k].w, state.custom[k].h, 1, 'ri-plug-line'] : appliance(k));
  const tile = (k) => {
    const a = info(k), own = !!state.custom[k], added = own || state.extra.includes(k);
    return `<div class="qtile" data-k="${k}"><div class="qtile-top"><i class="${a[5]}" aria-hidden="true"></i><span>${esc(a[1])}${own ? `<small>${a[2]} W · ${a[3]} h a day</small>` : ''}</span>${added ? `<button type="button" class="qtile-x" data-remove aria-label="Remove ${esc(a[1])}"><i class="ri-close-line" aria-hidden="true"></i></button>` : ''}</div>
      <div class="stepper" role="group" aria-label="${esc(a[1])}"><button type="button" data-d="-1" aria-label="Remove one">−</button><input type="number" min="0" max="99" inputmode="numeric" aria-label="How many"><button type="button" data-d="1" aria-label="Add one">+</button></div></div>`;
  };
  const shown = () => [...QUICK.map(([k]) => k), ...state.extra, ...Object.keys(state.custom)];
  const drawTiles = () => { tiles.innerHTML = shown().map(tile).join(''); };
  // "Add another appliance": the rest of the list, or type your own with its watts.
  const add = document.createElement('div');
  add.className = 'qadd';
  tiles.after(add);
  const drawAdd = () => {
    const rest = APPLIANCES.filter(([k]) => !shown().includes(k));
    add.innerHTML = `<div class="field"><label for="q-add" class="sr-only">Add another appliance</label><select id="q-add" data-q-add><option value="">+ Add another appliance…</option>${rest.map((a) => `<option value="${a[0]}">${esc(a[1])}</option>`).join('')}<option value="__own">Something else — type it in</option></select></div>
      <form class="qown" data-q-own hidden><div class="field"><label for="q-own-name">Appliance</label><input id="q-own-name" name="own_name" required maxlength="40" placeholder="e.g. Water dispenser"></div>
        <div class="field"><label for="q-own-w">Power (watts)</label><input id="q-own-w" name="w" type="number" inputmode="numeric" required min="1" max="20000" placeholder="e.g. 500"></div>
        <div class="field"><label for="q-own-h">Hours a day</label><input id="q-own-h" name="h" type="number" inputmode="decimal" min="0.5" max="24" step="0.5" value="4"></div>
        <div class="qown-actions"><button class="btn btn-primary btn-sm" type="submit">Add</button><button class="btn btn-ghost btn-sm" type="button" data-own-cancel>Cancel</button></div>
        <p class="fine">The watts are on the appliance’s label or manual.</p></form>`;
  };
  drawTiles(); drawAdd();
  add.addEventListener('change', (e) => {
    const v = e.target.closest('[data-q-add]')?.value; if (!v) return;
    if (v === '__own') { $('[data-q-own]', add).hidden = false; e.target.value = ''; $('#q-own-name', add).focus(); return; }
    state.extra.push(v); state.counts[v] = 1; drawTiles(); drawAdd(); render();
    $(`.qtile[data-k="${v}"] input`, tiles)?.focus();
  });
  add.addEventListener('click', (e) => { if (e.target.closest('[data-own-cancel]')) $('[data-q-own]', add).hidden = true; });
  add.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target, name = f.elements.own_name.value.trim(), w = Math.round(Number(f.elements.w.value)), h = Math.min(24, Math.max(.1, Number(f.elements.h.value) || 4));
    if (!name || !(w > 0)) { f.reportValidity(); return; }
    const k = `own${Date.now().toString(36)}`;
    state.custom[k] = { name: name.slice(0, 40), w: Math.min(20000, w), h }; state.counts[k] = 1;
    drawTiles(); drawAdd(); render();
  });
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
    const rows = Object.entries(state.counts).filter(([k, q]) => q > 0 && info(k)).map(([k, q]) => (state.custom[k] ? { k, q, ...state.custom[k] } : { k, q, h: appliance(k)[3] }));
    const s = size(rows, { lithium: state.lithium, night: state.night });
    const fit = recommend(site?.packages, s);
    const price = packagePrice(fit, state.lithium);
    const cta = $('[data-q-cta]', box);
    const summary = rows.map((r) => `${r.q}× ${info(r.k)[1]}${state.custom[r.k] ? ` (${state.custom[r.k].w}W)` : ''}`).join(', ');
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
    const x = e.target.closest('[data-remove]');
    if (x) {
      const k = x.closest('.qtile').dataset.k;
      delete state.counts[k]; delete state.custom[k]; state.extra = state.extra.filter((y) => y !== k);
      drawTiles(); drawAdd(); render(); return;
    }
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

// "From first call to first sunrise": on wide screens the section pins while the cards rise one by one;
// on smaller screens the cards stack (CSS sticky). Off entirely with reduced motion.
function stepsOnScroll() {
  const sec = $('[data-steps-pin]'), list = $('[data-steps]'); if (!sec || !list) return;
  const html = document.documentElement;
  const cards = $$('.step-card', list), dots = $$('.steps-progress i'), bar = $('.steps-progress');
  cards.forEach((c, i) => c.style.setProperty('--i', i));
  const wide = matchMedia('(min-width: 1081px) and (min-height: 700px)');
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches || html.classList.contains('a11y-still') || !html.classList.contains('motion');
  let raf = 0;
  const update = () => {
    raf = 0;
    const on = wide.matches && !still();
    html.classList.toggle('pin-on', on);
    if (!on) { cards.forEach((c) => c.style.removeProperty('--k')); bar?.style.setProperty('--p', 1); dots.forEach((d) => d.classList.add('on')); return; }
    const r = sec.getBoundingClientRect(), stage = innerHeight;
    const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - stage)));
    const n = cards.length, span = .8 / n;
    cards.forEach((c, i) => {
      const k = Math.min(1, Math.max(0, (p - i * span) / span));
      c.style.setProperty('--k', (1 - Math.pow(1 - k, 3)).toFixed(3));
      dots[i]?.classList.toggle('on', k > .5);
    });
    bar?.style.setProperty('--p', Math.min(1, p / .8).toFixed(3));
  };
  const req = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener('scroll', req, { passive: true }); addEventListener('resize', req); wide.addEventListener?.('change', req); update();
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
