import { $, $$, api, esc, naira, date, datetime, toast, fail, statusPill, formHtml, readForm, bindWidgets, validate, modal, confirmBox, emptyState, SITE_LINKS } from '../lib.js';
import { resourceList } from '../resource.js';

const TABS = [['home', 'Homepage'], ['popups', 'Pop-ups & adverts'], ['packages', 'Packages'], ['projects', 'Projects'], ['testimonials', 'Testimonials'], ['faqs', 'FAQs'], ['branches', 'Branches'], ['partners', 'Trusted companies'], ['policies', 'Policies'], ['certificates', 'Certificates'], ['socials', 'Social links'], ['seo', 'SEO & features'], ['assistant', 'AI assistant']];

async function settingsForm(mount, groups) {
  const { settings } = await api('/api/admin/settings');
  mount.innerHTML = groups.map((g) => `<div class="card" style="margin-bottom:16px"><div class="card-h"><div><h2>${esc(g.title)}</h2>${g.sub ? `<div class="sub">${esc(g.sub)}</div>` : ''}</div></div><form class="card-b" data-key="${g.key}">${g.custom ? g.custom(settings[g.key]) : formHtml(g.fields, g.map ? g.map(settings[g.key]) : settings[g.key])}<div class="row" style="margin-top:14px"><button class="btn btn-primary" type="submit"><i class="ri-save-line"></i> Save</button></div></form></div>`).join('');
  groups.forEach((g) => {
    const form = $(`[data-key="${g.key}"]`, mount);
    bindWidgets(form);
    form.onsubmit = async (e) => {
      e.preventDefault(); if (!validate(form)) return;
      let value;
      try { value = g.read ? g.read(form, settings[g.key]) : { ...settings[g.key], ...readForm(form, g.fields) }; } catch (err) { return fail(err); }
      try { await api(`/api/admin/settings/${g.key}`, { method: 'PUT', body: { value } }); settings[g.key] = value; toast('Saved — live on the website within a minute'); } catch (err) { fail(err); }
    };
  });
}


const POPUP_FIELDS = [
  { name: 'title', label: 'Headline', required: true, full: true, placeholder: 'e.g. Free site survey this month' },
  { name: 'body', label: 'Short message', type: 'textarea', full: true, rows: 3, placeholder: 'One or two sentences.' },
  { name: 'image', label: 'Picture (optional)', type: 'image', full: true, folder: 'adverts' },
  { name: 'cta_text', label: 'Button text', placeholder: 'e.g. Book now' }, { name: 'cta_url', label: 'Button opens', type: 'link' },
  { name: 'style', label: 'Look', type: 'select', options: [['modal', 'Big box in the middle'], ['corner', 'Small card in the corner'], ['banner', 'Thin strip across the top']] },
  { name: 'trigger', label: 'When it appears', type: 'select', options: [['delay', 'A few seconds after the page opens'], ['load', 'Straight away'], ['scroll', 'When they scroll halfway down'], ['exit', 'When they move to leave (computers only)']] },
  { name: 'delay_seconds', label: 'Seconds to wait', type: 'number', default: 6, min: 0 },
  { name: 'frequency', label: 'How often one person sees it', type: 'select', options: [['session', 'Once per visit'], ['once', 'Only once, ever'], ['always', 'On every page they open']] },
  { name: 'pages', label: 'Show it on', type: 'pages', full: true, default: '*' },
  { name: 'starts_at', label: 'Start showing (optional)', type: 'datetime' }, { name: 'ends_at', label: 'Stop showing (optional)', type: 'datetime' },
  { name: 'active', label: 'Switched on', type: 'switch', default: 1 },
];
function popupEditor(item, reload) {
  const { el, close } = modal({ title: item?.id ? 'Edit pop-up' : 'New pop-up', size: 'wide',
    body: `<div class="grid g-21" style="align-items:start"><form data-f>${formHtml(POPUP_FIELDS, item || { active: 1, style: 'modal', trigger: 'delay', delay_seconds: 6, frequency: 'session', pages: '*' })}</form>
      <div class="stack" style="position:sticky;top:0"><span class="label">Preview</span><div class="popup-preview" data-pv></div><p class="small muted" style="margin:0">This is roughly how it looks on the website.</p></div></div>`,
    footer: `${item?.id ? '<button class="btn btn-danger" data-del style="margin-right:auto"><i class="ri-delete-bin-line"></i> Delete</button>' : ''}<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save><i class="ri-save-line"></i> Save</button>` });
  const form = $('[data-f]', el);
  bindWidgets(form);
  const pv = () => {
    const v = (n) => form.querySelector(`[name="${n}"]`)?.value || '';
    const style = v('style'), img = v('image'), btn = v('cta_text');
    $('[data-pv]', el).innerHTML = style === 'banner'
      ? `<div class="pv banner"><strong>${esc(v('title') || 'Your headline')}</strong>${v('body') ? `<span class="small">${esc(v('body'))}</span>` : ''}${btn ? `<span class="b" style="background:#13382F;color:#fff;border-radius:999px;padding:5px 12px;font-size:12px">${esc(btn)}</span>` : ''}</div>`
      : `<div class="pv" style="${style === 'corner' ? 'width:220px;margin-left:auto;margin-top:auto' : ''}">${img ? `<img src="${esc(img)}" alt="">` : ''}<div class="c"><h4>${esc(v('title') || 'Your headline')}</h4>${v('body') ? `<p>${esc(v('body'))}</p>` : ''}${btn ? `<span class="b">${esc(btn)}</span>` : ''}</div></div>`;
    form.querySelector('[name="delay_seconds"]').closest('.field').hidden = v('trigger') !== 'delay';
  };
  form.addEventListener('input', pv); form.addEventListener('change', pv);
  new MutationObserver(pv).observe(form.querySelector('[data-preview]') || form, { attributes: true, subtree: true });
  pv();
  $('[data-cancel]', el).onclick = close;
  $('[data-save]', el).onclick = async (e) => {
    if (!validate(form)) return;
    const body = readForm(form, POPUP_FIELDS);
    if (body.cta_text && !body.cta_url) return fail(new Error('Choose where the button goes, or remove the button text.'));
    const busyBtn = e.currentTarget; busyBtn.classList.add('loading');
    try { item?.id ? await api(`/api/admin/popups/${item.id}`, { method: 'PUT', body }) : await api('/api/admin/popups', { body }); toast('Saved — live on the website within a minute'); close(); reload(); }
    catch (err) { fail(err); busyBtn.classList.remove('loading'); }
  };
  $('[data-del]', el)?.addEventListener('click', async () => { if (!(await confirmBox('Delete this pop-up?', { danger: true, ok: 'Delete' }))) return; await api(`/api/admin/popups/${item.id}`, { method: 'DELETE' }); toast('Deleted'); close(); reload(); });
}
const pagesLabel = (p) => (!p || p === '*' ? 'Every page' : p.split(',').map((x) => SITE_LINKS.find(([u]) => u === x)?.[1] || x.replace('/*', ' (all)')).join(', '));

async function policies(tab) {
  tab.innerHTML = '<div class="card"><div class="loading-row"><span class="spinner"></span>Loading policies…</div></div>';
  const { items } = await api('/api/admin/policies');
  tab.innerHTML = `<div class="alert info" style="margin-bottom:16px"><i class="ri-file-shield-2-line"></i><span>These pages are linked at the bottom of every page of the website. Edit the wording here — no code needed. If you change your mind, "Use the original" brings back the built-in text.</span></div>
    <div class="card"><div class="list">${items.map((p) => `<div class="li"><span class="li-icon"><i class="ri-file-text-line"></i></span><div class="body"><strong>${esc(p.custom?.title || p.title)}</strong><div class="meta">${p.custom ? `Edited ${datetime(p.custom.updated_at)}${p.custom.updated_by_name ? ` by ${esc(p.custom.updated_by_name)}` : ''}` : 'Original wording'} · <a href="${esc(p.path)}" target="_blank" rel="noopener">View page</a></div></div><button class="btn btn-sm" type="button" data-edit="${esc(p.key)}"><i class="ri-edit-line"></i> Edit</button></div>`).join('')}</div></div>`;
  tab.onclick = async (e) => {
    const b = e.target.closest('[data-edit]'); if (!b) return;
    const p = items.find((x) => x.key === b.dataset.edit);
    let title = p.custom?.title || p.title, body = p.custom?.body;
    if (!body) {
      const html = await fetch(p.path, { headers: { accept: 'text/html' } }).then((r) => r.text());
      const doc = new DOMParser().parseFromString(html, 'text/html');
      body = doc.querySelector('[data-policy-body]')?.innerHTML || '';
    }
    const fields = [{ name: 'title', label: 'Page title', required: true, full: true }, { name: 'body', label: 'Wording', type: 'richtext', headings: true, tall: true, full: true, hint: 'Use the H button for section headings and the list buttons for bullet points.' }];
    const { el, close } = modal({ title: `Edit: ${p.title}`, size: 'wide', body: `<form data-f>${formHtml(fields, { title, body })}</form>`,
      footer: `${p.custom ? '<button class="btn btn-ghost" data-reset style="margin-right:auto"><i class="ri-arrow-go-back-line"></i> Use the original</button>' : ''}<button class="btn" data-cancel>Cancel</button><button class="btn btn-primary" data-save><i class="ri-save-line"></i> Publish</button>` });
    const form = $('[data-f]', el); bindWidgets(form);
    $('[data-cancel]', el).onclick = close;
    $('[data-save]', el).onclick = async (ev) => {
      if (!validate(form)) return;
      const busyBtn = ev.currentTarget; busyBtn.classList.add('loading');
      try { await api(`/api/admin/policies/${p.key}`, { method: 'PUT', body: readForm(form, fields) }); toast('Published — the page is updated'); close(); policies(tab); }
      catch (err) { fail(err); busyBtn.classList.remove('loading'); }
    };
    $('[data-reset]', el)?.addEventListener('click', async () => { if (!(await confirmBox('Go back to the original wording for this page?', { ok: 'Use the original' }))) return; await api(`/api/admin/policies/${p.key}`, { method: 'DELETE' }); toast('Original wording restored'); close(); policies(tab); });
  };
}

export default async function ({ root, params, setTitle }) {
  setTitle('Website content', 'Everything here updates the public website — no code needed', '<a class="btn" href="/" target="_blank" rel="noopener"><i class="ri-external-link-line"></i> View website</a>');
  const active = params[0] && TABS.some(([k]) => k === params[0]) ? params[0] : 'home';
  root.innerHTML = `<div class="tabs">${TABS.map(([k, l]) => `<a href="#/website/${k}" class="${k === active ? 'on' : ''}">${l}</a>`).join('')}</div><div data-tab></div>`;
  const tab = $('[data-tab]', root);
  const T = {
    home: () => settingsForm(tab, [
      { key: 'hero', title: 'Top of the homepage', sub: 'Shown over the house photo at the top of the homepage. Keep the headline short (under 70 characters). Igbo, Hausa and Yorùbá use the built-in translation.', fields: [{ name: 'headline', label: 'Headline', full: true }, { name: 'subheadline', label: 'Sub-headline', type: 'textarea', full: true }] },
      { key: 'stats', title: 'Headline numbers', sub: 'Shown under the homepage hero and on the About page',
        custom: (v) => `<div class="stack" data-rows>${(v || []).map((s, i) => `<div class="row" data-i="${i}"><input class="input" style="width:110px" data-k="value" type="number" value="${esc(s.value)}"><input class="input" style="width:70px" data-k="suffix" value="${esc(s.suffix || '')}" placeholder="+"><input class="input grow" data-k="label" value="${esc(s.label)}"><label class="check small"><input type="checkbox" data-k="plain" ${s.plain ? 'checked' : ''}><span>No comma</span></label></div>`).join('')}</div>`,
        read: (form) => $$('[data-i]', form).map((r) => ({ value: Number($('[data-k=value]', r).value), suffix: $('[data-k=suffix]', r).value, label: $('[data-k=label]', r).value, plain: $('[data-k=plain]', r).checked })) },
      { key: 'videos', title: 'Homepage video', sub: 'Show a project video (YouTube, Vimeo, TikTok link or MP4). Leave empty to hide the section.',
        custom: (v) => formHtml([{ name: 'url', label: 'Video link', full: true }, { name: 'title', label: 'Caption' }, { name: 'poster', label: 'Thumbnail (optional)', type: 'image' }], v?.[0] || {}),
        read: (form) => { const x = readForm(form, [{ name: 'url' }, { name: 'title' }, { name: 'poster' }]); return x.url ? [x] : []; } },
      { key: 'financing', title: 'Financing (PaaP) summary', fields: [{ name: 'headline', label: 'Name of plan' }, { name: 'summary', label: 'Summary', type: 'textarea', full: true }] },
    ]),
    testimonials: () => resourceList({ mount: tab, resource: 'testimonials', title: 'testimonial', newLabel: 'Add testimonial',
      emptyText: 'No testimonials yet. Only add real customers who agreed to be featured — attach photos of their installation as evidence.',
      fields: [{ name: 'name', label: 'Customer name', required: true }, { name: 'role', label: 'Role / description', placeholder: 'Homeowner, Pharmacy owner…' }, { name: 'location', label: 'Location' },
        { name: 'rating', label: 'Rating (1–5)', type: 'number', min: 1, default: 5 }, { name: 'quote', label: 'What they said', type: 'textarea', required: true, full: true },
        { name: 'system', label: 'System installed', placeholder: '5kVA + 10kWh lithium' }, { name: 'savings', label: 'Result / savings', placeholder: 'No generator since March' },
        { name: 'photo', label: 'Customer photo', type: 'image', folder: 'testimonials' }, { name: 'video_url', label: 'Video testimonial link (optional)' },
        { name: 'evidence', label: 'Evidence: photos of their installation', type: 'images', full: true, folder: 'testimonials' },
        { name: 'consent', label: 'Customer gave written/recorded consent to publish', type: 'switch', full: true }, { name: 'verified', label: 'Verified — matched to an installation in our records (shows a badge)', type: 'switch', full: true },
        { name: 'featured', label: 'Feature on homepage', type: 'switch' }, { name: 'published', label: 'Published', type: 'switch' }, { name: 'sort', label: 'Order', type: 'number' }],
      columns: [{ label: 'Customer', render: (t) => `<div class="person">${t.photo ? `<img class="thumb" src="${esc(t.photo)}" alt="">` : ''}<div><strong>${esc(t.name)}</strong><span>${esc(t.location || '')}</span></div></div>` },
        { label: 'Quote', render: (t) => `<span class="small">${esc(t.quote.slice(0, 90))}…</span>` }, { label: 'Evidence', render: (t) => `${t.evidence.length} photo${t.evidence.length === 1 ? '' : 's'}` },
        { label: 'Status', render: (t) => `${t.published ? '<span class="pill ok">Published</span>' : '<span class="pill">Draft</span>'} ${t.verified ? '<span class="pill lime">Verified</span>' : ''} ${t.consent ? '' : '<span class="pill warn">No consent</span>'}` }] }),
    projects: () => resourceList({ mount: tab, resource: 'projects', title: 'project',
      fields: [{ name: 'title', label: 'Project title', required: true, full: true }, { name: 'client', label: 'Client' }, { name: 'location', label: 'Location' },
        { name: 'category', label: 'Category', type: 'select', options: [['residential', 'Residential'], ['commercial', 'Commercial'], ['industrial', 'Industrial']] }, { name: 'completed_at', label: 'Completed', type: 'date' },
        { name: 'pv_kwp', label: 'Solar PV (kWp)', type: 'number', step: 'any' }, { name: 'inverter_kw', label: 'Inverter (kW)', type: 'number', step: 'any' }, { name: 'battery_kwh', label: 'Battery (kWh)', type: 'number', step: 'any' },
        { name: 'summary', label: 'Summary', type: 'textarea', full: true }, { name: 'body', label: 'Full story', type: 'richtext', headings: true, full: true, placeholder: 'What the customer needed, what we installed and the result.' },
        { name: 'images', label: 'Photos', type: 'images', full: true, folder: 'projects' }, { name: 'video_url', label: 'Video link (optional)', full: true },
        { name: 'slug', label: 'Web address (slug)' }, { name: 'sort', label: 'Order', type: 'number' }, { name: 'featured', label: 'Featured on homepage', type: 'switch' }, { name: 'published', label: 'Published', type: 'switch', default: 1 }],
      columns: [{ label: 'Project', render: (p) => `<div class="person">${p.images[0] ? `<img class="thumb" src="${esc(p.images[0])}" alt="">` : ''}<div><strong>${esc(p.title)}</strong><span>${esc(p.location || '')}</span></div></div>` },
        { label: 'System', render: (p) => `<span class="small">${p.pv_kwp || '—'} kWp · ${p.inverter_kw || '—'} kW · ${p.battery_kwh || '—'} kWh</span>` }, { label: 'Status', render: (p) => `${p.published ? '<span class="pill ok">Live</span>' : '<span class="pill">Hidden</span>'}${p.featured ? ' <span class="pill lime">Featured</span>' : ''}` }, { label: '', render: (p) => `<a class="btn btn-sm" href="/projects/${esc(p.slug)}" target="_blank" rel="noopener"><i class="ri-external-link-line"></i></a>` }] }),
    certificates: () => { tab.innerHTML = '<div class="alert info" style="margin-bottom:12px"><i class="ri-award-line"></i><span>Published certificates appear in the website footer under "Certified &amp; accredited" on every page. Upload the certificate image or PDF and optionally link to the issuer\'s verification page.</span></div><div data-m></div>';
      resourceList({ mount: $('[data-m]', tab), resource: 'certificates', title: 'certificate', searchable: false,
        fields: [{ name: 'title', label: 'Certificate / accreditation', required: true, full: true, placeholder: 'e.g. NABCEP PV Associate, COREN, SON MANCAP, NEMSA' }, { name: 'issuer', label: 'Issued by' }, { name: 'issued_at', label: 'Issue date', type: 'date' },
          { name: 'image', label: 'Logo or certificate image (or PDF)', type: 'image', full: true, folder: 'certificates' }, { name: 'link', label: 'Verification link (optional)', full: true }, { name: 'sort', label: 'Order', type: 'number' }, { name: 'published', label: 'Show on website', type: 'switch', default: 1 }],
        columns: [{ label: 'Certificate', render: (c) => `<div class="person">${c.image ? `<img class="thumb" src="${esc(c.image)}" alt="">` : '<span class="thumb"></span>'}<div><strong>${esc(c.title)}</strong><span>${esc(c.issuer || '')}</span></div></div>` }, { label: 'Issued', render: (c) => date(c.issued_at) }, { label: 'Status', render: (c) => (c.published ? '<span class="pill ok">Shown</span>' : '<span class="pill">Hidden</span>') }] }); },
    partners: () => { tab.innerHTML = '<div class="alert info" style="margin-bottom:12px"><i class="ri-building-2-line"></i><span>Companies and estates you have worked for, shown as a logo strip near the top of the homepage. Upload each logo (a transparent PNG or SVG works best). Without a logo, the name is shown instead. Rows marked “Sample” are placeholders — replace or delete them.</span></div><div data-m></div>';
      resourceList({ mount: $('[data-m]', tab), resource: 'partners', title: 'company', newLabel: 'Add company', searchable: false, size: 'narrow',
        fields: [{ name: 'name', label: 'Company name', required: true, full: true }, { name: 'logo', label: 'Logo', type: 'image', full: true, folder: 'partners' }, { name: 'url', label: 'Website (optional)', full: true, placeholder: 'https://' }, { name: 'sort', label: 'Order', type: 'number' }, { name: 'active', label: 'Show on the website', type: 'switch', default: 1 }],
        columns: [{ label: 'Company', render: (c) => `<div class="person">${c.logo ? `<img class="thumb" src="${esc(c.logo)}" alt="" style="object-fit:contain;background:#fff">` : '<span class="thumb" style="display:grid;place-items:center"><i class="ri-building-2-line"></i></span>'}<div><strong>${esc(c.name)}</strong><span>${esc(c.url || '')}</span></div></div>` },
          { label: 'Status', render: (c) => `${c.active ? '<span class="pill ok">Shown</span>' : '<span class="pill">Hidden</span>'} ${c.sample ? '<span class="pill warn tx">Sample</span>' : ''}` }] }); },
    socials: () => { tab.innerHTML = '<div class="alert info" style="margin-bottom:12px"><i class="ri-share-line"></i><span>Social links appear in the website footer. Choose an icon from the icon pack for each.</span></div><div data-m></div>';
      resourceList({ mount: $('[data-m]', tab), resource: 'socials', title: 'social link', searchable: false, size: 'narrow',
        fields: [{ name: 'platform', label: 'Platform name', required: true, placeholder: 'Instagram' }, { name: 'icon', label: 'Icon', type: 'icon', required: true, full: true }, { name: 'url', label: 'Profile link', required: true, full: true, placeholder: 'https://' }, { name: 'sort', label: 'Order', type: 'number' }, { name: 'active', label: 'Show on website', type: 'switch', default: 1 }],
        columns: [{ label: 'Platform', render: (s) => `<div class="row"><span class="card-icon"><i class="${esc(s.icon)}"></i></span><strong>${esc(s.platform)}</strong></div>` }, { label: 'Link', render: (s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>` }, { label: 'Status', render: (s) => (s.active ? '<span class="pill ok">Shown</span>' : '<span class="pill">Hidden</span>') }] }); },
    popups: () => { tab.innerHTML = '<div class="alert info" style="margin-bottom:12px"><i class="ri-megaphone-line"></i><span>Pop-ups and adverts appear on the pages you choose. Pick a look, choose where the button goes from the list, and check the preview. Views and clicks are counted for you.</span></div><div data-m></div>';
      const list = resourceList({ mount: $('[data-m]', tab), resource: 'popups', title: 'pop-up', searchable: false, emptyText: 'No pop-ups yet\nCreate one to promote an offer, a new package or a free survey.',
        toolbar: '<button class="btn btn-primary" type="button" data-newpop style="margin-left:auto"><i class="ri-add-line"></i> New pop-up</button>',
        onRowClick: (item, reload) => api(`/api/admin/popups/${item.id}`).then((full) => popupEditor(full, reload)),
        columns: [{ label: 'Pop-up', render: (p) => `<div class="person">${p.image ? `<img class="thumb" src="${esc(p.image)}" alt="">` : '<span class="thumb" style="display:grid;place-items:center"><i class="ri-megaphone-line"></i></span>'}<div><strong>${esc(p.title)}</strong><span>${esc({ modal: 'Big box', corner: 'Corner card', banner: 'Top strip' }[p.style] || p.style)} · ${esc(pagesLabel(p.pages))}</span></div></div>` }, { label: 'Views', key: 'views' }, { label: 'Clicks', render: (p) => `${p.clicks}${p.views ? ` <span class="muted small">(${Math.round((p.clicks / p.views) * 100)}%)</span>` : ''}` }, { label: 'Status', render: (p) => (p.active ? '<span class="pill ok">On</span>' : '<span class="pill">Off</span>') }] });
      $('[data-newpop]', tab).onclick = () => popupEditor(null, list.reload); },
    faqs: () => resourceList({ mount: tab, resource: 'faqs', title: 'FAQ', fields: [{ name: 'question', label: 'Question', required: true, full: true }, { name: 'answer', label: 'Answer', type: 'textarea', required: true, full: true }, { name: 'category', label: 'Category' }, { name: 'sort', label: 'Order', type: 'number' }, { name: 'published', label: 'Published', type: 'switch', default: 1 }],
      columns: [{ label: 'Question', render: (f) => `<strong>${esc(f.question)}</strong>` }, { label: 'Category', key: 'category' }, { label: 'Status', render: (f) => (f.published ? '<span class="pill ok">Live</span>' : '<span class="pill">Hidden</span>') }] }),
    packages: () => resourceList({ mount: tab, resource: 'packages', title: 'package', searchable: false,
      fields: [{ name: 'name', label: 'Name', required: true }, { name: 'tier', label: 'For', type: 'select', options: [['residential', 'Homes'], ['commercial', 'Business']] }, { name: 'tagline', label: 'Tagline', full: true },
        { name: 'inverter_kva', label: 'Inverter (kVA)', type: 'number', step: 'any' }, { name: 'pv_wp', label: 'Panels (Wp)', type: 'number' }, { name: 'battery_kwh', label: 'Battery (kWh)', type: 'number', step: 'any' },
        { name: 'loads', label: 'What it runs', full: true }, { name: 'price_lead_acid', label: 'Price with lead-acid (₦)', type: 'number' }, { name: 'price_lithium', label: 'Price with lithium (₦)', type: 'number' },
        { name: 'sort', label: 'Order', type: 'number' }, { name: 'featured', label: 'Highlight as popular', type: 'switch' }, { name: 'published', label: 'Published', type: 'switch', default: 1 }],
      columns: [{ label: 'Package', render: (p) => `<strong>${esc(p.name)}</strong><div class="muted small">${p.inverter_kva}kVA · ${p.pv_wp}Wp · ${p.battery_kwh}kWh</div>` }, { label: 'Lead-acid', render: (p) => naira(p.price_lead_acid) }, { label: 'Lithium', render: (p) => (p.price_lithium ? naira(p.price_lithium) : '—') }, { label: 'Status', render: (p) => `${p.published ? '<span class="pill ok">Live</span>' : '<span class="pill">Hidden</span>'}${p.featured ? ' <span class="pill lime">Popular</span>' : ''}` }] }),
    branches: () => resourceList({ mount: tab, resource: 'branches', title: 'branch', searchable: false,
      fields: [{ name: 'name', label: 'Branch name', required: true }, { name: 'state', label: 'State' }, { name: 'address', label: 'Address', type: 'place', map: true, full: true, hint: 'Type the address and pick it from the list. Customers get directions to this spot.' }, { name: 'phones', label: 'Phone numbers', type: 'list', full: true, placeholder: '0803 123 4567, 0705 765 4321', hint: 'Separate numbers with commas' },
        { name: 'email', label: 'Email' }, { name: 'hours', label: 'Opening hours' }, { name: 'sort', label: 'Order', type: 'number' }, { name: 'is_hq', label: 'Head office', type: 'switch' }],
      columns: [{ label: 'Branch', render: (b) => `<strong>${esc(b.name)}</strong>${b.is_hq ? ' <span class="pill lime">HQ</span>' : ''}<div class="muted small">${esc(b.address || '')}</div>` }, { label: 'Phones', render: (b) => esc((b.phones || []).join(', ')) }, { label: 'Map', render: (b) => (b.lat ? '<span class="pill ok">Pinned</span>' : '<span class="pill warn">No pin</span>') }] }),
    policies: () => policies(tab),
    seo: () => settingsForm(tab, [
      { key: 'seo', title: 'Search engine & sharing', sub: 'Default title/description used when a page has none, plus verification codes', fields: [{ name: 'title', label: 'Default title', full: true }, { name: 'description', label: 'Default description', type: 'textarea', full: true }, { name: 'keywords', label: 'Focus keywords (for reference)', type: 'textarea', full: true }, { name: 'og_image', label: 'Default share image', type: 'image', full: true }, { name: 'ga4_id', label: 'Google Analytics 4 ID (optional)', placeholder: 'G-XXXX', hint: 'Our own visitor counting always runs (no cookies). Google Analytics only loads for visitors who allow it.' }] },
      { key: 'features', title: 'Website features', fields: [{ name: 'chat_enabled', label: 'AI chat assistant on the website', type: 'switch', full: true }, { name: 'voice_enabled', label: 'Voice conversations in the chat', type: 'switch', full: true }, { name: 'testimonials_enabled', label: 'Show testimonials', type: 'switch', full: true }, { name: 'blog_enabled', label: 'Show blog', type: 'switch', full: true }],
        read: (form, prev) => ({ ...prev, ...readForm(form, ['chat_enabled', 'voice_enabled', 'testimonials_enabled', 'blog_enabled'].map((n) => ({ name: n, type: 'switch' }))) }), map: (v) => v },
    ]),
    assistant: () => settingsForm(tab, [{ key: 'ai', title: 'AI website assistant', sub: 'Vola answers using your packages, branches, FAQs and shop. Add anything else it should know below — promotions, policies, delivery areas.', fields: [{ name: 'assistant_name', label: 'Assistant name' }, { name: 'greeting', label: 'Greeting message', type: 'textarea', full: true }, { name: 'extra_knowledge', label: 'Extra knowledge for the assistant', type: 'textarea', full: true, rows: 10, hint: 'Plain sentences work best. e.g. "This month: free panel cleaning with every maintenance visit. We do not install in Sokoto."' }] }]),
  };
  T[active]();
}
