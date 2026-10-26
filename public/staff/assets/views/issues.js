// Problems reported from job sites by field staff — handled as they come in, not at clock-out.
import { $, $$, api, esc, ago, datetime, toast, fail, modal, emptyState, initials, waLink } from '../lib.js';

const URG = { urgent: ['bad', 'Urgent'], high: ['warn', 'High'], normal: ['info', 'Normal'], low: ['', 'Low'] };
const CAT = { safety: ['ri-first-aid-kit-line', 'Safety'], equipment: ['ri-plug-line', 'Equipment fault'], materials: ['ri-box-3-line', 'Missing materials'], customer: ['ri-user-voice-line', 'Customer'], access: ['ri-door-lock-line', 'Site access'], weather: ['ri-rainy-line', 'Weather'], other: ['ri-question-line', 'Other'] };
const STATUS = { open: ['bad', 'New'], acknowledged: ['warn', 'Seen'], resolved: ['ok', 'Resolved'] };

export default async function ({ root, params, setTitle }) {
  setTitle('Site issues', 'Problems your team reports from site — they arrive the moment they are sent');
  let filter = 'active', items = [];
  root.innerHTML = `<div class="tabs" role="tablist">${[['active', 'Needs attention'], ['resolved', 'Resolved'], ['all', 'All']].map(([k, l]) => `<button type="button" data-f="${k}" class="${k === filter ? 'on' : ''}">${l}</button>`).join('')}</div><div data-list class="stack"></div>`;
  const list = $('[data-list]', root);
  const avatar = (i) => (i.user_avatar ? `<img class="avatar" src="${esc(i.user_avatar)}" alt="">` : `<span class="avatar">${esc(initials(i.user_name))}</span>`);
  const card = (i) => {
    const [uc, ul] = URG[i.urgency] || URG.normal, [ci, cl] = CAT[i.category] || CAT.other, [sc, sl] = STATUS[i.status] || STATUS.open;
    return `<div class="card" data-id="${i.id}"><div class="card-b stack" style="gap:12px">
      <div class="row between"><div class="row" style="gap:8px"><span class="pill ${uc}">${ul}</span><span class="pill"><i class="${ci}"></i> ${cl}</span><span class="pill ${sc}">${sl}</span></div><span class="muted small" title="${esc(datetime(i.created_at))}">${ago(i.created_at)}</span></div>
      <p style="margin:0;font-size:15px;color:var(--heading);white-space:pre-wrap">${esc(i.message)}</p>
      ${i.images.length ? `<div class="photo-grid">${i.images.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Photo from site"></a>`).join('')}</div>` : ''}
      <div class="row between" style="gap:12px"><div class="row" style="gap:10px;min-width:0">${avatar(i)}<div style="min-width:0"><strong style="display:block;color:var(--heading)">${esc(i.user_name)}</strong><span class="small muted">${esc(i.site || 'No site selected')}</span></div></div>
        <div class="row" style="gap:6px">${i.user_phone ? `<a class="btn btn-sm" href="tel:${esc(i.user_phone)}"><i class="ri-phone-line"></i> Call</a><a class="btn btn-sm" href="${waLink(i.user_phone)}" target="_blank" rel="noopener"><i class="ri-whatsapp-line"></i></a>` : ''}${i.lat ? `<a class="btn btn-sm" href="https://www.google.com/maps?q=${i.lat},${i.lng}" target="_blank" rel="noopener"><i class="ri-map-pin-line"></i> Map</a>` : ''}</div></div>
      ${i.response ? `<div class="alert ${i.status === 'resolved' ? 'ok' : 'info'}"><i class="ri-reply-line"></i><span><strong>${esc(i.handler_name || 'Reply')}:</strong> ${esc(i.response)}</span></div>` : ''}
      ${i.status !== 'resolved' ? `<div class="row">${i.status === 'open' ? '<button class="btn" type="button" data-act="acknowledged"><i class="ri-eye-line"></i> Mark as seen</button>' : ''}<button class="btn btn-primary" type="button" data-act="resolved"><i class="ri-check-line"></i> Resolve</button></div>` : ''}
    </div></div>`;
  };
  async function load() {
    list.innerHTML = '<div class="card"><div class="loading-row"><span class="spinner"></span>Loading issues…</div></div>';
    items = (await api(`/api/admin/issues${filter === 'resolved' ? '?status=resolved' : ''}`)).items;
    const shown = filter === 'active' ? items.filter((i) => i.status !== 'resolved') : items;
    list.innerHTML = shown.length ? shown.map(card).join('') : `<div class="card">${emptyState('ri-shield-check-line', filter === 'active' ? 'Nothing needs attention\nWhen staff report a problem from site, it shows up here immediately and you get an alert.' : 'No issues yet')}</div>`;
  }
  function respond(id, status) {
    const i = items.find((x) => x.id === id);
    const { el, close } = modal({ title: status === 'resolved' ? 'Resolve issue' : 'Mark as seen', size: 'narrow',
      body: `<div class="stack"><p class="muted" style="margin:0">${esc(i.message.slice(0, 160))}</p><div class="field"><label for="is-r">Message to ${esc(i.user_name.split(' ')[0])} <span class="opt">(optional)</span></label><textarea class="input" id="is-r" rows="3" placeholder="${status === 'resolved' ? 'e.g. Replacement breaker is on the way, ETA 2pm.' : 'e.g. Seen — calling you now.'}"></textarea></div></div>`,
      footer: `<button class="btn" data-x2>Cancel</button><button class="btn btn-primary" data-ok>${status === 'resolved' ? 'Resolve' : 'Mark as seen'}</button>` });
    $('[data-x2]', el).onclick = close;
    $('[data-ok]', el).onclick = async (e) => {
      const busyBtn = e.currentTarget; busyBtn.classList.add('loading');
      try { await api(`/api/admin/issues/${id}`, { method: 'PUT', body: { status, response: $('#is-r', el).value } }); toast(status === 'resolved' ? 'Resolved — staff member notified' : 'Marked as seen'); close(); load(); }
      catch (err) { fail(err); busyBtn.classList.remove('loading'); }
    };
  }
  root.addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]'); if (f) { filter = f.dataset.f; $$('[data-f]', root).forEach((b) => b.classList.toggle('on', b === f)); load(); }
    const a = e.target.closest('[data-act]'); if (a) respond(Number(a.closest('[data-id]').dataset.id), a.dataset.act);
  });
  await load();
  if (params[0]) { const el = $(`[data-id="${params[0]}"]`, root); if (el) { el.scrollIntoView({ block: 'center' }); el.style.outline = '2px solid var(--heading)'; } }
}
