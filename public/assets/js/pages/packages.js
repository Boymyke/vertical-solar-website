// Packages list + load calculator.
import { $, $$, esc, naira, store } from '../core.js';
import { packageCard } from '../render.js';
import { trackEvent } from '../track.js';
import { APPLIANCES, PANEL_W, size, recommend, packagePrice, fuelMonthly } from '../sizing.js';

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
    const lithium = $('[data-battery]').value === 'lithium';
    const s = size(rows, { lithium, night: Number($('[data-night]').value) });
    const { load, dailyKwh, inverter: inv, battery: batt, panels } = s;
    const genMonthly = fuelMonthly(dailyKwh, Number($('[data-fuel-price]').value || 0));
    const current = Number($('[data-current-spend]').value || 0);
    out('load', `${Math.round(load).toLocaleString()} W`);
    out('daily', `${dailyKwh.toFixed(1)} kWh`);
    out('inverter', load ? `${inv} kVA` : '—');
    out('battery', load ? `${batt.toFixed(1)} kWh ${lithium ? 'lithium' : 'lead-acid'}` : '—');
    out('panels', load ? `${panels} × ${PANEL_W}W (${(panels * PANEL_W / 1000).toFixed(1)} kWp)` : '—');
    out('gen', load ? `${naira(current || genMonthly)}${current ? ' (your figure)' : ''}` : '—');
    $('[data-meter]').style.width = Math.min(100, (inv / 10) * 100) + '%';
    const fit = recommend(packages, s);
    if (!load) { out('pkg', 'Add appliances to see a recommendation'); out('pkgnote', ''); }
    else if (fit) {
      const price = packagePrice(fit, lithium);
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
