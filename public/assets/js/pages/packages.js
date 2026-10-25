// Packages list + load calculator.
import { $, $$, esc, naira, store } from '../core.js';
import { packageCard } from '../render.js';
import { trackEvent } from '../track.js';

const APPLIANCES = [
  ['led', 'LED bulb', 10, 6, 1, 'ri-lightbulb-line'], ['fan', 'Standing / ceiling fan', 70, 8, 1, 'ri-windy-line'],
  ['tv', 'TV (32–55")', 100, 5, 1, 'ri-tv-2-line'], ['decoder', 'Decoder / sound bar', 25, 5, 1, 'ri-router-line'],
  ['fridge', 'Fridge', 150, 24, .4, 'ri-fridge-line', true], ['freezer', 'Deep freezer', 200, 24, .5, 'ri-fridge-fill', true],
  ['laptop', 'Laptop', 65, 6, 1, 'ri-macbook-line'], ['desktop', 'Desktop computer', 200, 8, 1, 'ri-computer-line'],
  ['phone', 'Phone charging', 10, 3, 1, 'ri-smartphone-line'], ['wifi', 'Wi-Fi router', 15, 24, 1, 'ri-wifi-line'],
  ['cctv', 'CCTV system', 40, 24, 1, 'ri-camera-line'], ['printer', 'Printer', 50, 2, 1, 'ri-printer-line'],
  ['ac1', 'Inverter AC 1HP', 900, 6, .7, 'ri-temp-cold-line', true], ['ac15', 'Inverter AC 1.5HP', 1300, 6, .7, 'ri-temp-cold-line', true],
  ['ac2', 'AC 2HP', 1800, 6, .75, 'ri-temp-cold-line', true], ['pump', 'Pumping machine (1HP)', 750, .5, 1, 'ri-drop-line', true],
  ['iron', 'Pressing iron', 1000, .5, .6, 'ri-t-shirt-line'], ['microwave', 'Microwave', 1200, .3, 1, 'ri-fire-line'],
  ['washer', 'Washing machine', 500, 1, .7, 'ri-t-shirt-air-line', true], ['gate', 'Gate motor', 300, .3, 1, 'ri-door-line', true],
];
const INVERTERS = [1, 1.5, 2.5, 3.5, 4.2, 5, 7.5, 10, 15, 20, 30];
const PANEL_W = 550, SUN_HOURS = 4.5, SYS_EFF = .8;

export default async function (site) {
  const packages = site?.packages || [];
  const list = $('[data-pkg-list]');
  const renderPkgs = (tier) => { const p = tier === 'all' ? packages : packages.filter((x) => x.tier === tier); list.innerHTML = p.map((x) => packageCard(x)).join(''); };
  renderPkgs('all');
  $$('.pkg-tabs button').forEach((b) => b.addEventListener('click', () => {
    $$('.pkg-tabs button').forEach((x) => x.setAttribute('aria-selected', x === b)); renderPkgs(b.dataset.tier);
  }));

  // ── Calculator ──
  const sel = $('[data-add-appliance]');
  sel.innerHTML += APPLIANCES.map(([k, n, w]) => `<option value="${k}">${n} (${w}W)</option>`).join('');
  let rows = store.get('vs-calc', null) || [{ k: 'led', q: 8, h: 6 }, { k: 'fan', q: 3, h: 8 }, { k: 'tv', q: 1, h: 5 }, { k: 'fridge', q: 1, h: 24 }];
  const box = $('[data-appliances]');
  const out = (k, v) => { const el = $(`[data-out="${k}"]`); if (el) el.textContent = v; };

  function draw() {
    box.innerHTML = rows.map((r, i) => {
      const a = APPLIANCES.find((x) => x[0] === r.k); if (!a) return '';
      return `<div class="appliance"><i class="${a[5]}" aria-hidden="true"></i><div class="name">${esc(a[1])}<small>${a[2]}W each</small></div>
        <div class="stepper" role="group" aria-label="Quantity of ${esc(a[1])}"><button type="button" data-i="${i}" data-d="-1" aria-label="Fewer">−</button><input type="number" min="1" max="99" value="${r.q}" data-i="${i}" data-f="q" aria-label="Quantity"><button type="button" data-i="${i}" data-d="1" aria-label="More">+</button></div>
        <label class="hours-wrap" style="display:flex;align-items:center;gap:6px;font-size:.8rem"><input class="input hours" style="min-height:36px;padding:4px 8px" type="number" min="0" max="24" step="0.5" value="${r.h}" data-i="${i}" data-f="h" aria-label="Hours per day for ${esc(a[1])}">h/day</label>
        <button class="icon-btn" type="button" data-rm="${i}" aria-label="Remove ${esc(a[1])}"><i class="ri-close-line" aria-hidden="true"></i></button></div>`;
    }).join('') || '<div class="empty">Add appliances from the list above.</div>';
    calc();
  }

  function calc() {
    store.set('vs-calc', rows);
    let load = 0, daily = 0, biggestMotor = 0;
    rows.forEach((r) => {
      const a = APPLIANCES.find((x) => x[0] === r.k); if (!a) return;
      load += a[2] * r.q;
      daily += a[2] * r.q * Math.min(24, r.h) * a[4];
      if (a[6]) biggestMotor = Math.max(biggestMotor, a[2]);
    });
    const dailyKwh = daily / 1000;
    const peakW = load * .75 + biggestMotor * 1.5; // diversity + motor start surge
    const kva = peakW / 0.8 / 1000 * 1.2;
    const inv = INVERTERS.find((x) => x >= kva) || Math.ceil(kva);
    const lithium = $('[data-battery]').value === 'lithium';
    const night = Number($('[data-night]').value);
    const batt = (dailyKwh * night) / (lithium ? .85 : .5);
    const pvKwp = dailyKwh / SUN_HOURS / SYS_EFF;
    const panels = Math.max(1, Math.ceil((pvKwp * 1000) / PANEL_W));
    const fuel = Number($('[data-fuel-price]').value || 0);
    const genMonthly = (dailyKwh / 1.6) * fuel * 30; // ~1.6 kWh delivered per litre of petrol (small generators)
    out('load', `${Math.round(load).toLocaleString()} W`);
    out('daily', `${dailyKwh.toFixed(1)} kWh`);
    out('inverter', load ? `${inv} kVA` : '—');
    out('battery', load ? `${batt.toFixed(1)} kWh ${lithium ? 'lithium' : 'lead-acid'}` : '—');
    out('panels', load ? `${panels} × ${PANEL_W}W (${(panels * PANEL_W / 1000).toFixed(1)} kWp)` : '—');
    const current = Number($('[data-current-spend]').value || 0);
    out('gen', load ? `${naira(current || genMonthly)}${current ? ' (your figure)' : ''}` : '—');
    $('[data-meter]').style.width = Math.min(100, (inv / 10) * 100) + '%';
    // recommend a package
    const fit = [...packages].sort((a, b) => a.inverter_kva - b.inverter_kva).find((p) =>
      p.inverter_kva >= inv && p.pv_wp / 1000 * SUN_HOURS * SYS_EFF >= dailyKwh * .85 && p.battery_kwh * (lithium ? .85 : .5) >= dailyKwh * night * .8);
    if (!load) { out('pkg', 'Add appliances to see a recommendation'); out('pkgnote', ''); }
    else if (fit) {
      const price = lithium ? fit.price_lithium || fit.price_lead_acid : fit.price_lead_acid;
      out('pkg', `${fit.name} — ${fit.inverter_kva}kVA`);
      out('pkgnote', `From ${naira(price)} installed.${genMonthly && price ? ` Pays back in about ${Math.max(1, Math.round(price / (current || genMonthly)))} months of generator spend.` : ''}`);
    } else { out('pkg', 'Custom system'); out('pkgnote', 'Your load is larger than our standard packages — an engineer will design it for you.'); }
    const form = $('[data-calc-form] form');
    form.dataset.extra = JSON.stringify({ kind: 'calculator', package: fit ? fit.name : 'Custom', battery: lithium ? 'Lithium' : 'Lead-acid',
      load: `${rows.map((r) => `${r.q}× ${APPLIANCES.find((x) => x[0] === r.k)?.[1]} ${r.h}h`).join(', ')} | ${dailyKwh.toFixed(1)} kWh/day | ${inv}kVA | ${batt.toFixed(1)} kWh battery | ${panels}×${PANEL_W}W` });
  }

  sel.addEventListener('change', () => {
    if (!sel.value) return;
    const a = APPLIANCES.find((x) => x[0] === sel.value);
    const ex = rows.find((r) => r.k === sel.value);
    if (ex) ex.q += 1; else rows.push({ k: a[0], q: 1, h: a[3] });
    sel.value = ''; draw(); trackEvent('calc_add', { item: a[0] });
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.rm != null) rows.splice(Number(b.dataset.rm), 1);
    if (b.dataset.d) { const r = rows[b.dataset.i]; r.q = Math.max(1, Math.min(99, r.q + Number(b.dataset.d))); }
    draw();
  });
  box.addEventListener('change', (e) => {
    const i = e.target.dataset.i; if (i == null) return;
    rows[i][e.target.dataset.f] = Math.max(e.target.dataset.f === 'q' ? 1 : 0, Number(e.target.value) || 0);
    calc();
  });
  $$('[data-battery],[data-night],[data-fuel-price],[data-current-spend]').forEach((el) => el.addEventListener('input', calc));
  $('[data-send-calc]').addEventListener('click', () => { const f = $('[data-calc-form]'); f.hidden = false; f.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#c-name').focus({ preventScroll: true }); });
  draw();
}
