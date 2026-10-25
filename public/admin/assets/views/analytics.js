import { $, $$, api, esc, num, ago, table, chartjs, leaflet, baseMap } from '../lib.js';

const FLAG = (cc) => (cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))) : '🌐');
const dur = (s) => (s ? (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`) : '—');

export default async function ({ root, setTitle }) {
  setTitle('Analytics & heatmaps', 'Where visitors come from, what they read and where they click', '<div class="seg" data-range><button data-d="7">7 days</button><button data-d="30" class="on">30 days</button><button data-d="90">90 days</button></div>');
  root.innerHTML = `<div class="tabs"><button class="on" data-t="o">Overview</button><button data-t="g">Visitor locations</button><button data-t="h">Heatmaps</button><button data-t="l">Live</button></div><div data-tab></div>`;
  let days = 30, current = 'o';
  const tab = $('[data-tab]', root);
  const charts = [];
  const destroy = () => { while (charts.length) charts.pop().destroy(); };
  async function overview() {
    destroy();
    const d = await api(`/api/admin/analytics/overview?days=${days}`);
    const t = d.totals;
    tab.innerHTML = `<div class="grid g-4">${[['Visitors', num(t.visitors), 'ri-user-3-line'], ['Page views', num(t.pageviews), 'ri-file-list-line'], ['Avg. time on page', dur(t.avg_duration), 'ri-time-line'], ['Leads from website', `${num(t.leads)} <span class="small muted">(${t.conversion}% of visitors)</span>`, 'ri-user-add-line']]
      .map(([l, v, i]) => `<div class="card card-b row"><span class="card-icon"><i class="${i}"></i></span><div><div class="muted small">${l}</div><strong style="font-size:20px">${v}</strong></div></div>`).join('')}</div>
    <div class="grid g-21" style="margin-top:16px"><div class="card"><div class="card-h"><h2>Traffic</h2><span class="muted small" style="margin-left:auto">Bounce rate ${t.bounce_rate}% · avg scroll ${t.avg_scroll || 0}%</span></div><div class="card-b"><div class="chart-box lg"><canvas id="a-tr"></canvas></div></div></div>
      <div class="card"><div class="card-h"><h2>Devices</h2></div><div class="card-b"><div class="chart-box sm"><canvas id="a-dev"></canvas></div><div class="row" style="margin-top:10px;font-size:12px">${d.browsers.slice(0, 4).map((b) => `<span class="pill">${esc(b.k)} ${b.n}</span>`).join('')}${d.os.slice(0, 4).map((b) => `<span class="pill">${esc(b.k)} ${b.n}</span>`).join('')}</div></div></div></div>
    <div class="grid g-2" style="margin-top:16px">
      <div class="card"><div class="card-h"><h2>Top pages</h2></div>${table({ rows: d.pages, columns: [{ label: 'Page', render: (p) => `<a href="${esc(p.path)}" target="_blank" rel="noopener">${esc(p.path)}</a>` }, { label: 'Views', align: 'right', key: 'views' }, { label: 'Visitors', align: 'right', key: 'visitors' }, { label: 'Avg. time', align: 'right', render: (p) => dur(p.avg_time) }, { label: 'Scroll', align: 'right', render: (p) => `${p.avg_scroll || 0}%` }, { label: '', render: (p) => `<button class="btn btn-sm" data-heat="${esc(p.path)}"><i class="ri-fire-line"></i></button>` }] })}</div>
      <div class="stack"><div class="card"><div class="card-h"><h2>Where visitors come from</h2></div>${table({ rows: d.referrers, columns: [{ label: 'Source', render: (r) => esc(r.ref) }, { label: 'Views', align: 'right', key: 'n' }] })}</div>
        <div class="card"><div class="card-h"><h2>Leads by form</h2></div>${table({ rows: d.leads, empty: 'No leads in this period.', columns: [{ label: 'Form', render: (r) => esc(r.k.replace('lead_', '').replace(/_/g, ' ')) }, { label: 'Leads', align: 'right', key: 'n' }] })}</div>
        <div class="card"><div class="card-h"><h2>Busiest hours (Lagos time)</h2></div><div class="card-b"><div class="chart-box sm"><canvas id="a-hr"></canvas></div></div></div>
        <div class="card"><div class="card-h"><h2>Languages</h2></div><div class="card-b row">${d.langs.map((l) => `<span class="pill lime">${esc({ en: 'English', ig: 'Igbo', ha: 'Hausa', yo: 'Yorùbá' }[l.k] || l.k)} · ${l.n}</span>`).join('') || '<span class="muted">No data</span>'}</div></div></div>
    </div>`;
    const Chart = await chartjs();
    charts.push(new Chart($('#a-tr'), { type: 'line', data: { labels: d.series.map((x) => x.d.slice(5)), datasets: [{ label: 'Page views', data: d.series.map((x) => x.views), borderColor: '#2F8A3C', backgroundColor: 'rgba(136,210,63,.18)', fill: true, tension: .35, pointRadius: 0 }, { label: 'Visitors', data: d.series.map((x) => x.visitors), borderColor: '#282358', tension: .35, pointRadius: 0 }] }, options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8 } } } } }));
    charts.push(new Chart($('#a-dev'), { type: 'doughnut', data: { labels: d.devices.map((x) => x.k), datasets: [{ data: d.devices.map((x) => x.n), backgroundColor: ['#2F8A3C', '#282358', '#88D23F', '#A3B39A'] }] }, options: { maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'right' } } } }));
    const hrs = Array.from({ length: 24 }, (_, h) => d.hours.find((x) => x.h === h)?.n || 0);
    charts.push(new Chart($('#a-hr'), { type: 'bar', data: { labels: hrs.map((_, h) => h), datasets: [{ data: hrs, backgroundColor: '#88D23F', borderRadius: 4 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { display: false } } } }));
    $$('[data-heat]', tab).forEach((b) => (b.onclick = () => { current = 'h'; $$('[data-t]', root).forEach((x) => x.classList.toggle('on', x.dataset.t === 'h')); heatmaps(b.dataset.heat); }));
  }
  async function geo() {
    destroy();
    const d = await api(`/api/admin/analytics/overview?days=${days}`);
    tab.innerHTML = `<div class="grid g-21"><div class="card"><div class="card-h"><h2>Visitor cities</h2><span class="muted small" style="margin-left:auto">Approximate location from the visitor's network — IP addresses are not stored</span></div><div class="card-b"><div class="map tall" data-map></div></div></div>
      <div class="stack"><div class="card"><div class="card-h"><h2>Countries</h2></div>${table({ rows: d.countries, columns: [{ label: 'Country', render: (c) => `${FLAG(c.country)} ${esc(c.country)}` }, { label: 'Visitors', align: 'right', key: 'visitors' }, { label: 'Views', align: 'right', key: 'views' }] })}</div>
      <div class="card"><div class="card-h"><h2>Top cities</h2></div>${table({ rows: d.cities.slice(0, 15), columns: [{ label: 'City', render: (c) => `${esc(c.city)}<div class="muted small">${esc(c.region || '')} ${esc(c.country || '')}</div>` }, { label: 'Visitors', align: 'right', key: 'visitors' }] })}</div></div></div>`;
    const L = await leaflet();
    const map = baseMap(L, $('[data-map]', tab), [9, 8], 5);
    const max = Math.max(1, ...d.cities.map((c) => c.visitors));
    d.cities.filter((c) => c.lat).forEach((c) => L.circleMarker([c.lat, c.lng], { radius: 6 + (c.visitors / max) * 24, color: '#2F8A3C', fillColor: '#88D23F', fillOpacity: .55, weight: 1 }).bindTooltip(`${c.city}: ${c.visitors} visitor${c.visitors > 1 ? 's' : ''}`).addTo(map));
  }
  async function heatmaps(path) {
    destroy();
    const pages = await api('/api/admin/analytics/heat-pages');
    const opts = [...new Set(['/', ...pages.items.map((p) => p.path)])];
    tab.innerHTML = `<div class="card"><div class="toolbar"><select class="input" data-path style="width:auto">${opts.map((p) => `<option ${p === path ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
      <div class="seg" data-dev><button data-v="desktop" class="on"><i class="ri-computer-line"></i> Desktop</button><button data-v="tablet"><i class="ri-tablet-line"></i> Tablet</button><button data-v="mobile"><i class="ri-smartphone-line"></i> Mobile</button></div>
      <div class="seg" data-type><button data-v="click" class="on">Clicks</button><button data-v="move">Mouse movement</button><button data-v="rage">Rage clicks</button></div><span class="muted small" data-count style="margin-left:auto"></span></div>
      <div class="grid g-21" style="padding:14px"><div class="heat-stage" data-stage></div><div class="stack"><div><h3>Scroll depth</h3><p class="muted small">How far down the page visitors scrolled.</p><div data-scroll></div></div><div><h3>Most-clicked elements</h3><div data-targets class="small"></div></div></div></div></div>`;
    const state = { path: path || opts[0], device: 'desktop', type: 'click' };
    const widths = { desktop: 1280, tablet: 820, mobile: 390 };
    async function draw() {
      const r = await api(`/api/admin/analytics/heatmap?path=${encodeURIComponent(state.path)}&device=${state.device}&type=${state.type}&days=${days}`);
      $('[data-count]', tab).textContent = `${num(r.count)} ${state.type === 'move' ? 'movement samples' : 'clicks'}`;
      const stage = $('[data-stage]', tab);
      const w = widths[state.device];
      const scale = Math.min(1, (stage.clientWidth - 2) / w);
      stage.innerHTML = `<iframe title="Page preview" src="${esc(state.path)}${state.path.includes('?') ? '&' : '?'}vs_heatmap=1" width="${w}" height="1200" style="transform:scale(${scale})"></iframe><canvas></canvas>`;
      const frame = $('iframe', stage), cv = $('canvas', stage);
      frame.onload = () => {
        let h = 3000;
        try { h = frame.contentDocument.documentElement.scrollHeight; frame.contentDocument.querySelectorAll('.fab-stack,.fab-a11y,.consent,.popup').forEach((x) => x.remove()); } catch {}
        frame.height = h; stage.style.height = Math.min(h * scale, innerHeight * .78) + 'px';
        cv.width = w * scale; cv.height = h * scale; cv.style.width = cv.width + 'px'; cv.style.height = cv.height + 'px';
        heat(cv, r.points.map(([x, y]) => [x * w * scale, y * scale]), state.type === 'move' ? 18 : 24);
      };
      const sc = r.scroll; const tot = sc.reduce((a, b) => a + b.n, 0) || 1;
      let reach = tot;
      $('[data-scroll]', tab).innerHTML = [0, 25, 50, 75, 100].map((p) => { reach = sc.filter((b) => b.bucket >= p).reduce((a, b) => a + b.n, 0); return `<div class="row" style="margin-bottom:6px"><span style="width:44px" class="small">${p}%</span><div class="bar grow"><span style="width:${Math.round((reach / tot) * 100)}%"></span></div><span class="small" style="width:40px;text-align:right">${Math.round((reach / tot) * 100)}%</span></div>`; }).join('');
      $('[data-targets]', tab).innerHTML = r.topTargets.length ? r.topTargets.map((t) => `<div class="row between" style="padding:4px 0;border-bottom:1px solid var(--line)"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80%">${esc(t.target)}</span><strong>${t.n}</strong></div>`).join('') : '<span class="muted">No clicks recorded yet.</span>';
    }
    $('[data-path]', tab).onchange = (e) => { state.path = e.target.value; draw(); };
    $$('[data-dev] button', tab).forEach((b) => (b.onclick = () => { state.device = b.dataset.v; $$('[data-dev] button', tab).forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
    $$('[data-type] button', tab).forEach((b) => (b.onclick = () => { state.type = b.dataset.v; $$('[data-type] button', tab).forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
    draw();
  }
  async function live() {
    destroy();
    const r = await api('/api/admin/analytics/live');
    tab.innerHTML = `<div class="card"><div class="card-h"><h2><span class="pill ok">${r.active} active</span> visitors in the last 5 minutes</h2><button class="btn btn-sm" data-rl style="margin-left:auto"><i class="ri-refresh-line"></i></button></div>${table({ rows: r.items, empty: 'No one on the site right now.', columns: [{ label: 'Page', render: (p) => esc(p.path) }, { label: 'Location', render: (p) => `${FLAG(p.country)} ${esc(p.city || '')}` }, { label: 'Device', key: 'device' }, { label: 'When', render: (p) => ago(p.created_at) }] })}</div>`;
    $('[data-rl]', tab).onclick = live;
  }
  const views = { o: overview, g: geo, h: () => heatmaps(), l: live };
  $$('[data-t]', root).forEach((b) => (b.onclick = () => { current = b.dataset.t; $$('[data-t]', root).forEach((x) => x.classList.toggle('on', x === b)); views[current](); }));
  $$('[data-range] button').forEach((b) => (b.onclick = () => { days = Number(b.dataset.d); $$('[data-range] button').forEach((x) => x.classList.toggle('on', x === b)); views[current](); }));
  overview();
}

// Simple heatmap renderer (density → colour ramp).
function heat(canvas, points, radius) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  if (!w || !h) return;
  const shadow = document.createElement('canvas'); shadow.width = w; shadow.height = h;
  const s = shadow.getContext('2d');
  const alpha = Math.min(.5, Math.max(.06, 18 / Math.sqrt(points.length + 1)));
  for (const [x, y] of points) {
    const g = s.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(0,0,0,${alpha})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    s.fillStyle = g; s.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const img = s.getImageData(0, 0, w, h), px = img.data;
  const ramp = (a) => { const t = a / 255; if (t < .25) return [0, 120 * t * 4, 255]; if (t < .5) return [0, 255, 255 * (1 - (t - .25) * 4)]; if (t < .75) return [255 * (t - .5) * 4, 255, 0]; return [255, 255 * (1 - (t - .75) * 4), 0]; };
  for (let i = 0; i < px.length; i += 4) { const a = px[i + 3]; if (!a) continue; const [r, g, b] = ramp(a); px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = Math.min(220, a * 1.6 + 40); }
  ctx.clearRect(0, 0, w, h); ctx.putImageData(img, 0, 0);
}
