import { api, esc, naira, num, ago, date, chartjs, statusPill, waLink, STAGES, emptyState } from '../lib.js';

const trend = (c) => (c == null ? '' : `<span class="trend ${c >= 0 ? 'up' : 'down'}"><i class="${c >= 0 ? 'ri-arrow-right-up-line' : 'ri-arrow-right-down-line'}"></i>${Math.abs(c)}%</span>`);
const kpi = ({ label, value, icon, change, foot, href, hl }) => `<a class="card kpi ${hl ? 'hl' : ''}" href="${href}">
  <div class="top"><span class="card-icon"><i class="${icon}"></i></span><span class="label">${esc(label)}</span></div>
  <div class="row" style="gap:10px;align-items:baseline"><span class="value">${value}</span>${trend(change)}</div>
  <div class="foot"><span>${foot}</span><i class="ri-arrow-right-up-line"></i></div></a>`;
const op = ({ label, value, icon, tone, href, rows, empty }) => `<div class="card op"><a class="op-h" href="${href}"><span class="op-ic ${tone}"><i class="${icon}"></i></span><div><div class="label">${esc(label)}</div><div class="value">${value}</div></div><span class="go"><i class="ri-arrow-right-up-line"></i></span></a>
  <div class="op-list">${rows.length ? rows.join('') : `<div class="op-empty"><i class="ri-checkbox-circle-fill"></i>${esc(empty)}</div>`}</div></div>`;
const URG = { urgent: 'bad', high: 'warn', normal: 'info', low: '' };
const SHIFT = { arrived: ['ok', 'On site'], late: ['warn', 'Late'], missed: ['bad', 'Missed'], scheduled: ['', 'Expected'] };
const lagosTime = (utc) => new Date(utc.replace(' ', 'T') + 'Z').toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });

export default async function ({ root, user, can, setTitle }) {
  const hour = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Lagos' }));
  setTitle(`Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${user.name.split(' ')[0]}`, 'Here is what is happening across sales, sites and the website today.',
    `${can('crm') ? '<a class="btn" href="#/customers/new"><i class="ri-user-add-line"></i> New lead</a>' : ''}${can('quotes') ? '<a class="btn btn-primary" href="#/quotes/new"><i class="ri-file-add-line"></i> New quote</a>' : ''}`);
  const d = await api('/api/admin/dashboard');
  const k = d.kpis;
  const stageMap = Object.fromEntries(d.funnel.map((f) => [f.stage, f]));
  const totalPipe = d.funnel.reduce((s, f) => s + f.n, 0);
  const ticketRows = d.ticketList.map((t) => `<a class="op-row" href="#/support/${t.id}"><div class="grow"><strong>${esc(t.subject)}</strong><span>${esc(t.number)} · ${ago(t.created_at)}</span></div>${statusPill(t.priority)}</a>`);
  const stockRows = d.lowList.map((p) => `<a class="op-row" href="#/inventory?low=1"><div class="grow"><strong>${esc(p.name)}</strong><span>Reorder at ${p.reorder_level} ${esc(p.unit || 'pcs')}</span></div><span class="pill ${p.stock <= 0 ? 'bad' : 'warn'}">${p.stock <= 0 ? 'Out' : `${p.stock} left`}</span></a>`);
  const jobRows = d.jobs.slice(0, 3).map((j) => `<a class="op-row" href="#/installations/${j.id}"><div class="grow"><strong>${esc(j.title)}</strong><span>${esc(j.customer || '')}${j.start_date ? ' · ' + date(j.start_date) : ''}</span></div><span class="mini-bar" title="${j.progress || 0}% done"><span style="width:${j.progress || 0}%"></span></span></a>`);
  const issueRows = d.issues.slice(0, 3).map((s) => `<a class="op-row" href="#/issues/${s.id}"><div class="grow"><strong>${esc(s.message)}</strong><span>${esc(s.user_name)}${s.site ? ' · ' + esc(s.site) : ''} · ${ago(s.created_at)}</span></div><span class="pill ${URG[s.urgency]}">${esc(s.urgency)}</span></a>`);
  const shiftRows = d.todayShifts.map((s) => { const [cls, txt] = SHIFT[s.status] || SHIFT.scheduled; return `<div class="li"><span class="li-icon" style="width:52px;font-size:13px;font-weight:600">${lagosTime(s.starts_at)}</span><div class="body"><strong>${esc(s.user_name)}</strong><div class="meta">${esc(s.site)}${s.status === 'arrived' && s.late_minutes > 10 ? ` · arrived ${s.late_minutes} min late` : ''}</div></div><span class="pill ${cls}">${txt}</span></div>`; });

  root.innerHTML = `
  <div class="grid g-4">
    ${kpi({ hl: true, label: 'Won revenue · 30 days', value: naira(k.revenue.value), icon: 'ri-money-dollar-circle-line', change: k.revenue.change, foot: `${num(k.won.value)} quote${k.won.value === 1 ? '' : 's'} accepted`, href: '#/quotes?status=accepted' })}
    ${kpi({ label: 'New leads · 30 days', value: num(k.leads.value), icon: 'ri-user-add-line', change: k.leads.change, foot: `${num(k.due_followups.value)} follow-up${k.due_followups.value === 1 ? '' : 's'} due`, href: '#/customers' })}
    ${kpi({ label: 'Open quotes', value: num(k.open_quotes.value), icon: 'ri-file-list-3-line', foot: `${naira(k.open_quotes.amount)} waiting for a reply`, href: '#/quotes' })}
    ${kpi({ label: 'Website visitors · 30 days', value: num(k.visitors.value), icon: 'ri-global-line', change: k.visitors.change, foot: `${num(k.chats.value)} AI chat${k.chats.value === 1 ? '' : 's'}`, href: '#/analytics' })}
  </div>
  <div class="grid g-21" style="margin-top:16px">
    <div class="card fill"><div class="card-h"><div><h2>Leads &amp; website visitors</h2><div class="sub">Last 30 days</div></div><a class="card-icon" href="#/analytics" title="Open analytics"><i class="ri-line-chart-line"></i></a></div>
      <div class="card-b"><div class="chart-box"><canvas id="c-trend" aria-label="Leads and visitors chart" role="img"></canvas></div></div></div>
    <div class="card"><div class="card-h"><div><h2>Sales pipeline</h2><div class="sub">${num(totalPipe)} contact${totalPipe === 1 ? '' : 's'}</div></div><a class="card-icon" href="#/customers?view=board" title="Open pipeline board"><i class="ri-kanban-view"></i></a></div>
      ${totalPipe ? STAGES.map((s) => { const f = stageMap[s] || { n: 0, v: 0 }; return `<div class="funnel-row"><div style="flex:1;min-width:0"><strong style="text-transform:capitalize">${s.replace('_', ' ')}</strong><span>${naira(f.v)} estimated value</span><div class="bar" style="margin-top:6px"><span style="width:${Math.round((f.n / totalPipe) * 100)}%"></span></div></div><strong style="margin-left:16px">${f.n}</strong></div>`; }).join('')
        : emptyState('ri-team-line', 'No leads yet\nLeads from the website, the chat assistant and the quote form appear here.', can('crm') ? '<a class="btn btn-sm" href="#/customers/new"><i class="ri-user-add-line"></i> Add a lead</a>' : '')}
    </div>
  </div>
  <h2 style="margin:28px 0 12px;font-size:17px">Operations</h2>
  <div class="ops">
    ${op({ label: 'Open tickets', value: k.tickets.value, icon: 'ri-customer-service-2-line', tone: 't1', href: '#/support', rows: ticketRows, empty: 'No open tickets — customers are happy.' })}
    ${op({ label: 'Low-stock items', value: k.low_stock.value, icon: 'ri-archive-stack-line', tone: 't2', href: '#/inventory?low=1', rows: stockRows, empty: 'Stock levels are fine.' })}
    ${op({ label: 'Active jobs', value: k.active_jobs.value, icon: 'ri-tools-line', tone: 't3', href: '#/installations', rows: jobRows, empty: 'No installations in progress.' })}
    ${op({ label: 'Site issues', value: d.open_issues, icon: 'ri-alarm-warning-line', tone: 't4', href: '#/issues', rows: issueRows, empty: 'No problems reported from site.' })}
  </div>
  <div class="grid g-3" style="margin-top:16px">
    <div class="card"><div class="card-h"><h2>Due follow-ups</h2><a class="btn btn-sm btn-ghost" href="#/followups">View all</a></div>
      <div class="list">${d.upcoming.length ? d.upcoming.map((f) => `<div class="li"><span class="li-icon"><i class="${{ call: 'ri-phone-line', whatsapp: 'ri-whatsapp-line', checkup: 'ri-heart-pulse-line', maintenance: 'ri-tools-line', quote: 'ri-file-list-3-line' }[f.type] || 'ri-calendar-line'}"></i></span>
        <div class="body"><strong class="ellipsis" style="display:block">${esc(f.title)}</strong><div class="meta">${esc(f.customer || '')} · <span style="color:${new Date(f.due_at.replace(' ', 'T') + 'Z') < new Date() ? 'var(--bad)' : 'inherit'}">${ago(f.due_at)}</span></div></div>
        ${f.phone ? `<a class="icon-btn" href="${waLink(f.phone)}" target="_blank" rel="noopener" title="WhatsApp ${esc(f.customer || '')}"><i class="ri-whatsapp-line"></i></a>` : ''}</div>`).join('') : emptyState('ri-calendar-check-line', 'You are all caught up\nNew calls and reminders show up here when they are due.')}</div></div>
    <div class="card"><div class="card-h"><h2>Newest leads</h2><a class="btn btn-sm btn-ghost" href="#/customers">View all</a></div>
      <div class="list">${d.recentLeads.length ? d.recentLeads.map((c) => `<a class="li" href="#/customers/${c.id}"><span class="avatar" style="background:var(--surface-2);color:var(--heading)">${esc((c.name || '?').slice(0, 1))}</span><div class="body"><strong>${esc(c.name)}</strong><div class="meta">${esc((c.source || '').replace(/_/g, ' '))} · ${ago(c.created_at)}</div></div>${statusPill(c.stage)}</a>`).join('') : emptyState('ri-user-search-line', 'No leads yet\nWebsite enquiries arrive here automatically.')}</div></div>
    <div class="card"><div class="card-h"><div><h2>Today on site</h2><div class="sub">${k.active_jobs.on_site} clocked in now</div></div>${can('attendance') ? '<a class="btn btn-sm btn-ghost" href="#/attendance/schedule">Schedule</a>' : ''}</div>
      <div class="list">${shiftRows.length ? shiftRows.join('') : emptyState('ri-calendar-schedule-line', 'Nobody is scheduled today\nSet times for staff to be on site from Staff & schedules.', can('attendance') ? '<a class="btn btn-sm" href="#/attendance/schedule"><i class="ri-add-line"></i> Schedule staff</a>' : '')}</div></div>
  </div>
  <div class="grid g-2" style="margin-top:16px">
    <div class="card"><div class="card-h"><h2>Where leads come from</h2><span class="sub">Last 90 days</span></div><div class="card-b">${d.sources.length ? '<div class="chart-box sm"><canvas id="c-src" role="img" aria-label="Lead sources chart"></canvas></div>' : emptyState('ri-pie-chart-line', 'Not enough data yet')}</div></div>
    <div class="card"><div class="card-h"><h2>Installations in progress</h2><a class="btn btn-sm btn-ghost" href="#/installations">View all</a></div>
      <div class="list">${d.jobs.length ? d.jobs.map((j) => `<a class="li" href="#/installations/${j.id}"><span class="li-icon"><i class="ri-tools-line"></i></span><div class="body"><strong>${esc(j.title)}</strong><div class="meta">${esc(j.customer || '')} · ${date(j.start_date)}</div><div class="bar" style="margin-top:6px"><span style="width:${j.progress || 0}%"></span></div></div>${statusPill(j.status)}</a>`).join('') : emptyState('ri-tools-line', 'No active installations')}</div></div>
  </div>`;
  const Chart = await chartjs();
  if (!document.getElementById('c-trend')) return; // left the page while loading
  const dark = document.documentElement.getAttribute('data-admin-theme') === 'dark';
  const days = [...Array(30)].map((_, i) => new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10));
  const lm = Object.fromEntries(d.leadSeries.map((x) => [x.d, x.n])), vm = Object.fromEntries(d.visitSeries.map((x) => [x.d, x.n]));
  new Chart(document.getElementById('c-trend'), {
    type: 'line',
    data: { labels: days.map((x) => new Date(x).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })), datasets: [
      { label: 'Visitors', data: days.map((x) => vm[x] || 0), borderColor: '#1E6B3A', backgroundColor: 'rgba(136,210,63,.16)', fill: true, cubicInterpolationMode: 'monotone', pointRadius: 0, borderWidth: 2, yAxisID: 'y' },
      { label: 'Leads', data: days.map((x) => lm[x] || 0), borderColor: dark ? '#89D041' : '#141716', backgroundColor: dark ? '#89D041' : '#141716', cubicInterpolationMode: 'monotone', pointRadius: 2, borderWidth: 2, yAxisID: 'y1' }] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 8, usePointStyle: true } } },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } }, y: { beginAtZero: true, grid: { color: dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)' }, ticks: { precision: 0 } }, y1: { beginAtZero: true, position: 'right', grid: { display: false }, ticks: { precision: 0 } } } },
  });
  if (d.sources.length) new Chart(document.getElementById('c-src'), {
    type: 'bar', data: { labels: d.sources.map((s) => s.source.replace(/_/g, ' ')), datasets: [{ data: d.sources.map((s) => s.n), backgroundColor: '#88D23F', borderRadius: 8 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { grid: { display: false } } } },
  });
}
