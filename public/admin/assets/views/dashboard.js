import { api, esc, naira, num, ago, date, chartjs, statusPill, waLink, STAGES } from '../lib.js';

const kpi = (label, value, icon, change, foot, href) => `<div class="card kpi"><div class="top"><div><div class="label">${esc(label)}</div><div class="value">${value}${change != null ? `<span class="trend ${change >= 0 ? 'up' : 'down'}"><i class="${change >= 0 ? 'ri-arrow-up-line' : 'ri-arrow-down-line'}"></i>${Math.abs(change)}%</span>` : ''}</div></div><span class="card-icon"><i class="${icon}"></i></span></div>
  <a class="bottom" href="${href}"><span>${foot}</span><i class="ri-arrow-right-line"></i></a></div>`;

export default async function ({ root, user, can, setTitle }) {
  const hour = new Date().getHours();
  setTitle('Dashboard', `Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${user.name.split(' ')[0]}`,
    `${can('crm') ? '<a class="btn" href="#/customers/new"><i class="ri-user-add-line"></i> New lead</a>' : ''}${can('quotes') ? '<a class="btn btn-primary" href="#/quotes/new"><i class="ri-file-add-line"></i> New quote</a>' : ''}`);
  const d = await api('/api/admin/dashboard');
  const k = d.kpis;
  const stageMap = Object.fromEntries(d.funnel.map((f) => [f.stage, f]));
  const totalPipe = d.funnel.reduce((s, f) => s + f.n, 0) || 1;
  root.innerHTML = `
  <div class="grid g-4">
    ${kpi('New leads (30 days)', num(k.leads.value), 'ri-user-add-line', k.leads.change, `${num(k.due_followups.value)} follow-ups due`, '#/customers')}
    ${kpi('Won revenue (30 days)', naira(k.revenue.value), 'ri-money-dollar-circle-line', k.revenue.change, `${num(k.won.value)} quotes accepted`, '#/quotes?status=accepted')}
    ${kpi('Open quotes', num(k.open_quotes.value), 'ri-file-list-3-line', null, `${naira(k.open_quotes.amount)} awaiting reply`, '#/quotes')}
    ${kpi('Website visitors (30 days)', num(k.visitors.value), 'ri-global-line', k.visitors.change, `${num(k.chats.value)} AI chats`, '#/analytics')}
  </div>
  <div class="grid g-21" style="margin-top:16px">
    <div class="card"><div class="card-h"><div><div class="sub">Last 30 days</div><h2>Leads &amp; website visitors</h2></div><span class="card-icon" style="margin-left:auto"><i class="ri-line-chart-line"></i></span></div>
      <div class="card-b"><div class="chart-box"><canvas id="c-trend" aria-label="Leads and visitors chart" role="img"></canvas></div></div></div>
    <div class="card"><div class="card-h"><div><div class="sub">Sales pipeline</div><h2>${num(totalPipe === 1 && !d.funnel.length ? 0 : totalPipe)} contacts</h2></div><a class="card-icon" href="#/customers?view=board" style="margin-left:auto" title="Open pipeline"><i class="ri-kanban-view"></i></a></div>
      ${STAGES.map((s) => { const f = stageMap[s] || { n: 0, v: 0 }; return `<div class="funnel-row"><div style="flex:1"><strong style="text-transform:capitalize">${s.replace('_', ' ')}</strong><span>${naira(f.v)} est. value</span><div class="bar" style="margin-top:6px"><span style="width:${Math.round((f.n / totalPipe) * 100)}%"></span></div></div><strong style="margin-left:16px">${f.n}</strong></div>`; }).join('')}
    </div>
  </div>
  <div class="grid g-3" style="margin-top:16px">
    <div class="card"><div class="card-h"><h2>Due follow-ups</h2><a class="btn btn-sm btn-ghost" href="#/followups" style="margin-left:auto">View all</a></div>
      <div class="list">${d.upcoming.length ? d.upcoming.map((f) => `<div class="li"><span class="li-icon"><i class="${{ call: 'ri-phone-line', whatsapp: 'ri-whatsapp-line', checkup: 'ri-heart-pulse-line', maintenance: 'ri-tools-line', quote: 'ri-file-list-3-line' }[f.type] || 'ri-calendar-line'}"></i></span>
        <div class="body"><strong class="nowrap">${esc(f.title)}</strong><div class="meta">${esc(f.customer || '')} · <span style="color:${new Date(f.due_at.replace(' ', 'T') + 'Z') < new Date() ? 'var(--bad)' : 'inherit'}">${ago(f.due_at)}</span></div></div>
        ${f.phone ? `<a class="icon-btn" href="${waLink(f.phone)}" target="_blank" rel="noopener" title="WhatsApp"><i class="ri-whatsapp-line"></i></a>` : ''}</div>`).join('') : '<div class="empty"><i class="ri-calendar-check-line"></i>You are all caught up.</div>'}</div></div>
    <div class="card"><div class="card-h"><h2>Newest leads</h2><a class="btn btn-sm btn-ghost" href="#/customers" style="margin-left:auto">View all</a></div>
      <div class="list">${d.recentLeads.length ? d.recentLeads.map((c) => `<a class="li" href="#/customers/${c.id}" style="text-decoration:none;color:inherit"><span class="avatar" style="background:var(--surface-2);color:var(--heading)">${esc((c.name || '?').slice(0, 1))}</span><div class="body"><strong>${esc(c.name)}</strong><div class="meta">${esc((c.source || '').replace(/_/g, ' '))} · ${ago(c.created_at)}</div></div>${statusPill(c.stage)}</a>`).join('') : '<div class="empty">No leads yet.</div>'}</div></div>
    <div class="card"><div class="card-h"><h2>Active installations</h2><span class="pill ${k.active_jobs.on_site ? 'ok' : ''}" style="margin-left:auto">${k.active_jobs.on_site} staff on site</span></div>
      <div class="list">${d.jobs.length ? d.jobs.map((j) => `<a class="li" href="#/installations/${j.id}" style="text-decoration:none;color:inherit"><span class="li-icon"><i class="ri-tools-line"></i></span><div class="body"><strong>${esc(j.title)}</strong><div class="meta">${esc(j.customer || '')} · ${date(j.start_date)}</div><div class="bar" style="margin-top:6px"><span style="width:${j.progress || 0}%"></span></div></div>${statusPill(j.status)}</a>`).join('') : '<div class="empty">No active jobs.</div>'}</div></div>
  </div>
  <div class="grid g-4" style="margin-top:16px">
    <a class="card card-b row" href="#/support" style="text-decoration:none;color:inherit"><span class="card-icon"><i class="ri-customer-service-2-line"></i></span><div><div class="muted small">Open tickets</div><strong style="font-size:20px">${k.tickets.value}</strong></div></a>
    <a class="card card-b row" href="#/inventory?low=1" style="text-decoration:none;color:inherit"><span class="card-icon" style="${k.low_stock.value ? 'color:var(--warn)' : ''}"><i class="ri-archive-line"></i></span><div><div class="muted small">Low-stock items</div><strong style="font-size:20px">${k.low_stock.value}</strong></div></a>
    <a class="card card-b row" href="#/installations" style="text-decoration:none;color:inherit"><span class="card-icon"><i class="ri-hammer-line"></i></span><div><div class="muted small">Active jobs</div><strong style="font-size:20px">${k.active_jobs.value}</strong></div></a>
    <div class="card"><div class="card-h"><h2>Lead sources (90 days)</h2></div><div class="card-b"><div class="chart-box sm"><canvas id="c-src" role="img" aria-label="Lead sources chart"></canvas></div></div></div>
  </div>`;
  const Chart = await chartjs();
  const days = [...Array(30)].map((_, i) => { const x = new Date(Date.now() - (29 - i) * 864e5); return x.toISOString().slice(0, 10); });
  const lm = Object.fromEntries(d.leadSeries.map((x) => [x.d, x.n])), vm = Object.fromEntries(d.visitSeries.map((x) => [x.d, x.n]));
  new Chart(document.getElementById('c-trend'), {
    type: 'line',
    data: { labels: days.map((x) => x.slice(5)), datasets: [
      { label: 'Visitors', data: days.map((x) => vm[x] || 0), borderColor: '#2F8A3C', backgroundColor: 'rgba(136,210,63,.18)', fill: true, tension: .35, pointRadius: 0, borderWidth: 2, yAxisID: 'y' },
      { label: 'Leads', data: days.map((x) => lm[x] || 0), borderColor: '#282358', backgroundColor: '#282358', tension: .35, pointRadius: 2, borderWidth: 2, yAxisID: 'y1' }] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 10, usePointStyle: true } } },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.05)' }, ticks: { precision: 0 } }, y1: { beginAtZero: true, position: 'right', grid: { display: false }, ticks: { precision: 0 } } } },
  });
  new Chart(document.getElementById('c-src'), {
    type: 'bar', data: { labels: d.sources.map((s) => s.source.replace(/_/g, ' ')), datasets: [{ data: d.sources.map((s) => s.n), backgroundColor: '#88D23F', borderRadius: 6 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { display: false } } } },
  });
}
