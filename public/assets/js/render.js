// Reusable renderers for CMS-driven content blocks.
import { $$, esc, naira, api, fmtDate, initialsOf, stars } from './core.js';
import { mountVideo } from './media.js';

export function packageCard(p, { compact = false } = {}) {
  const lith = p.price_lithium ? `<div><span>Lithium-ion</span><strong>${naira(p.price_lithium)}</strong></div>` : '';
  return `<article class="pkg${p.featured ? ' featured' : ''}">
    ${p.featured ? '<span class="ribbon">Popular choice</span>' : ''}
    <h3>${esc(p.name)}</h3><p class="tagline">${esc(p.tagline || '')}</p>
    <div class="specs"><span>${p.inverter_kva} kVA inverter</span><span>${Number(p.pv_wp).toLocaleString()} Wp panels</span><span>${p.battery_kwh} kWh storage</span></div>
    <p class="runs"><i class="ri-plug-line" aria-hidden="true"></i><span>${esc(p.loads || '')}</span></p>
    <div class="prices">${p.price_lead_acid ? `<div><span>From, lead-acid</span><strong>${naira(p.price_lead_acid)}</strong></div>` : ''}${lith}</div>
    <a class="btn ${p.featured ? 'btn-primary' : 'btn-ghost'} btn-block" href="/get-quote?package=${encodeURIComponent(p.name)}">Get this package</a>
  </article>`;
}

export function projectCard(p) {
  const img = p.images?.[0];
  return `<a class="project-card" href="/projects/${esc(p.slug)}">
    <div class="img">${img ? `<img src="${esc(img)}" alt="${esc(p.title)}" loading="lazy">` : ''}<span class="tag"><span class="chip">${esc(p.category || 'project')}</span></span></div>
    <div class="body"><h3>${esc(p.title)}</h3><span class="loc"><i class="ri-map-pin-2-line" aria-hidden="true"></i>${esc(p.location || '')}</span>
      <div class="spec-mini">
        <div><span>Solar PV</span><strong>${p.pv_kwp ? p.pv_kwp + ' kWp' : '—'}</strong></div>
        <div><span>Inverter</span><strong>${p.inverter_kw ? p.inverter_kw + ' kW' : '—'}</strong></div>
        <div><span>Storage</span><strong>${p.battery_kwh ? p.battery_kwh + ' kWh' : '—'}</strong></div>
      </div></div></a>`;
}

export function postCard(p) {
  return `<a class="post-card" href="/blog/${esc(p.slug)}">
    <div class="post-card-img">${p.cover ? `<img src="${esc(p.cover)}" alt="" loading="lazy">` : ''}</div>
    <div class="post-card-body"><span class="chip" style="align-self:flex-start">${esc((p.category || 'news').replace(/-/g, ' '))}</span><h3>${esc(p.title)}</h3><p>${esc((p.excerpt || '').slice(0, 140))}</p>
    <span class="muted" style="font-size:.8rem">${fmtDate(p.published_at)} · ${p.read_minutes || 3} min read</span></div></a>`;
}

export function testimonialCard(t) {
  return `<article class="t-card">
    ${stars(t.rating)}
    <blockquote>“${esc(t.quote)}”</blockquote>
    ${t.system || t.savings ? `<p class="muted" style="font-size:.85rem;margin:0">${t.system ? `<i class="ri-sun-line" aria-hidden="true"></i> ${esc(t.system)}` : ''}${t.savings ? ` &nbsp; <i class="ri-coins-line" aria-hidden="true"></i> ${esc(t.savings)}` : ''}</p>` : ''}
    ${t.evidence?.length ? `<div class="evidence" data-lightbox>${t.evidence.slice(0, 4).map((e, i) => `<button type="button" data-full="${esc(e)}" aria-label="Installation photo ${i + 1} for ${esc(t.name)}"><img src="${esc(e)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
    ${t.video_url ? `<div data-video="${esc(t.video_url)}" data-caption="${esc(t.name)}'s story" style="border-radius:14px"></div>` : ''}
    <div class="who">${t.photo ? `<img src="${esc(t.photo)}" alt="">` : `<span class="avatar">${esc(initialsOf(t.name))}</span>`}
      <div><strong>${esc(t.name)}</strong><span>${esc([t.role, t.location].filter(Boolean).join(', '))}</span>
      ${t.verified ? '<div class="badge-verified"><i class="ri-shield-check-fill" aria-hidden="true"></i> Verified customer</div>' : ''}
      ${t.project_slug ? `<a href="/projects/${esc(t.project_slug)}" style="font-size:.8rem">See their installation</a>` : ''}</div></div>
  </article>`;
}

export function branchCard(b) {
  return `<div class="branch" id="branch-${b.id}">
    <h3><i class="ri-map-pin-2-fill" aria-hidden="true" style="color:var(--primary)"></i>${esc(b.name)} ${b.is_hq ? '<span class="hq">Head office</span>' : ''}</h3>
    <p><i class="ri-road-map-line" aria-hidden="true"></i><span>${esc(b.address || '')}</span></p>
    <p><i class="ri-phone-line" aria-hidden="true"></i><span>${(b.phones || []).map((p) => `<a href="tel:${esc(p)}">${esc(p)}</a>`).join(', ')}</span></p>
    ${b.hours ? `<p><i class="ri-time-line" aria-hidden="true"></i><span>${esc(b.hours)}</span></p>` : ''}
    ${b.lat ? `<p><i class="ri-direction-line" aria-hidden="true"></i><a href="https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}" target="_blank" rel="noopener">Get directions</a></p>` : ''}
  </div>`;
}

const empty = (icon, text) => `<div class="empty" style="grid-column:1/-1"><i class="${icon}" aria-hidden="true"></i>${text}</div>`;

export async function fillBlocks(site) {
  const tasks = [];
  $$('[data-packages]').forEach((el) => {
    const limit = Number(el.dataset.limit || 99);
    const pk = (site?.packages || []);
    const list = el.dataset.tier ? pk.filter((p) => p.tier === el.dataset.tier) : pk;
    const sorted = limit < 99 ? [...list].sort((a, b) => b.featured - a.featured).slice(0, limit).sort((a, b) => a.sort - b.sort) : list;
    el.innerHTML = sorted.length ? sorted.map((p) => packageCard(p)).join('') : empty('ri-sun-line', 'Packages are being updated. Ask us for a quote.');
  });
  $$('[data-projects]').forEach((el) => tasks.push(api(`/api/public/projects${el.dataset.limit ? '?featured=' : ''}`).then((items) => {
    const list = items.slice(0, Number(el.dataset.limit || 99));
    el.innerHTML = list.length ? list.map(projectCard).join('') : empty('ri-building-line', 'Projects coming soon.');
  }).catch(() => (el.innerHTML = ''))));
  $$('[data-posts]').forEach((el) => tasks.push(api(`/api/public/posts?per=${el.dataset.limit || 9}${el.dataset.category ? '&category=' + el.dataset.category : ''}`).then((r) => {
    el.innerHTML = r.items.length ? r.items.map(postCard).join('') : empty('ri-article-line', 'New articles are on the way.');
  }).catch(() => (el.innerHTML = ''))));
  $$('[data-testimonials]').forEach((el) => tasks.push(api('/api/public/testimonials').then((items) => {
    const list = items.slice(0, Number(el.dataset.limit || 99));
    const section = el.closest('[data-testimonials-section]');
    if (!list.length) {
      if (section) { section.hidden = true; return; }
      el.innerHTML = el.dataset.fallback === 'cta'
        ? `<div class="t-empty"><i class="ri-chat-quote-line" aria-hidden="true"></i><div><strong>Reviews from our customers are being added.</strong><p>Had a system installed by us? We would love to hear how it is going.</p></div><a class="btn btn-accent" href="/contact">Share your experience</a></div>`
        : empty('ri-chat-quote-line', 'Verified customer reviews will appear here.');
      return;
    }
    if (section) section.hidden = false;
    el.innerHTML = list.map(testimonialCard).join('');
    $$('[data-video]', el).forEach((v) => mountVideo(v, v.dataset.video, null, v.dataset.caption));
  }).catch(() => {})));
  $$('[data-partners]').forEach((el) => {
    const list = site?.partners || [];
    if (!list.length) { el.closest('[data-partners-section]')?.setAttribute('hidden', ''); return; }
    const item = (p) => { const inner = p.logo ? `<img src="${esc(p.logo)}" alt="${esc(p.name)}" loading="lazy" decoding="async">` : `<span class="wordmark">${esc(p.name)}</span>`;
      return p.url ? `<a class="logo-item" translate="no" href="${esc(p.url)}" target="_blank" rel="noopener nofollow">${inner}</a>` : `<span class="logo-item" translate="no">${inner}</span>`; };
    const row = list.map(item).join('');
    // Two copies make the strip loop seamlessly; the second is hidden from screen readers.
    el.innerHTML = `<div class="marquee-track"><div class="marquee-group">${row}</div><div class="marquee-group" aria-hidden="true">${row}</div></div>`;
    el.classList.toggle('is-static', list.length < 4);
  });
  $$('[data-home-faqs]').forEach((el) => tasks.push(api('/api/public/faqs').then((items) => {
    const list = items.slice(0, Number(el.dataset.limit || 6));
    el.innerHTML = list.length ? list.map((f, i) => `<details class="faq-item"${i === 0 ? ' open' : ''}><summary><span>${esc(f.question)}</span><i class="ri-add-line" aria-hidden="true"></i></summary><div class="faq-a">${esc(f.answer).replace(/\n/g, '<br>')}</div></details>`).join('') : empty('ri-question-line', 'Questions and answers are on the way.');
  }).catch(() => (el.innerHTML = ''))));
  $$('[data-branches]').forEach((el) => { el.innerHTML = (site?.branches || []).map(branchCard).join(''); });
  await Promise.all(tasks);
}
