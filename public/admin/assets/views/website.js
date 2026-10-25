import { $, $$, api, esc, naira, date, toast, fail, statusPill, formHtml, readForm, bindWidgets, validate } from '../lib.js';
import { resourceList } from '../resource.js';

const TABS = [['home', 'Homepage'], ['testimonials', 'Testimonials'], ['projects', 'Projects'], ['certificates', 'Certificates'], ['socials', 'Social links'], ['popups', 'Pop-ups & adverts'], ['faqs', 'FAQs'], ['packages', 'Packages'], ['branches', 'Branches'], ['seo', 'SEO & features'], ['assistant', 'AI assistant']];

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

export default async function ({ root, params, setTitle }) {
  setTitle('Website content', 'Everything here updates the public website — no code needed', '<a class="btn" href="/" target="_blank" rel="noopener"><i class="ri-external-link-line"></i> View website</a>');
  const active = params[0] && TABS.some(([k]) => k === params[0]) ? params[0] : 'home';
  root.innerHTML = `<div class="tabs">${TABS.map(([k, l]) => `<a href="#/website/${k}" class="${k === active ? 'on' : ''}">${l}</a>`).join('')}</div><div data-tab></div>`;
  const tab = $('[data-tab]', root);
  const T = {
    home: () => settingsForm(tab, [
      { key: 'hero', title: 'Hero (top of homepage)', sub: 'Shown over the live sun/moon scene. Keep the headline short (under 70 characters). Translations for Igbo, Hausa and Yorùbá use the built-in wording.', fields: [{ name: 'headline', label: 'Headline', full: true }, { name: 'subheadline', label: 'Sub-headline', type: 'textarea', full: true }] },
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
        { name: 'summary', label: 'Summary', type: 'textarea', full: true }, { name: 'body', label: 'Full write-up (HTML allowed: <h2>, <p>, <ul>)', type: 'textarea', full: true, rows: 6 },
        { name: 'images', label: 'Photos', type: 'images', full: true, folder: 'projects' }, { name: 'video_url', label: 'Video link (optional)', full: true },
        { name: 'slug', label: 'Web address (slug)' }, { name: 'sort', label: 'Order', type: 'number' }, { name: 'featured', label: 'Featured on homepage', type: 'switch' }, { name: 'published', label: 'Published', type: 'switch', default: 1 }],
      columns: [{ label: 'Project', render: (p) => `<div class="person">${p.images[0] ? `<img class="thumb" src="${esc(p.images[0])}" alt="">` : ''}<div><strong>${esc(p.title)}</strong><span>${esc(p.location || '')}</span></div></div>` },
        { label: 'System', render: (p) => `<span class="small">${p.pv_kwp || '—'} kWp · ${p.inverter_kw || '—'} kW · ${p.battery_kwh || '—'} kWh</span>` }, { label: 'Status', render: (p) => `${p.published ? '<span class="pill ok">Live</span>' : '<span class="pill">Hidden</span>'}${p.featured ? ' <span class="pill lime">Featured</span>' : ''}` }, { label: '', render: (p) => `<a class="btn btn-sm" href="/projects/${esc(p.slug)}" target="_blank" rel="noopener"><i class="ri-external-link-line"></i></a>` }] }),
    certificates: () => { tab.innerHTML = '<div class="alert info" style="margin-bottom:12px"><i class="ri-award-line"></i><span>Published certificates appear in the website footer under "Certified &amp; accredited" on every page. Upload the certificate image or PDF and optionally link to the issuer\'s verification page.</span></div><div data-m></div>';
      resourceList({ mount: $('[data-m]', tab), resource: 'certificates', title: 'certificate', searchable: false,
        fields: [{ name: 'title', label: 'Certificate / accreditation', required: true, full: true, placeholder: 'e.g. NABCEP PV Associate, COREN, SON MANCAP, NEMSA' }, { name: 'issuer', label: 'Issued by' }, { name: 'issued_at', label: 'Issue date', type: 'date' },
          { name: 'image', label: 'Logo or certificate image (or PDF)', type: 'image', full: true, folder: 'certificates' }, { name: 'link', label: 'Verification link (optional)', full: true }, { name: 'sort', label: 'Order', type: 'number' }, { name: 'published', label: 'Show on website', type: 'switch', default: 1 }],
        columns: [{ label: 'Certificate', render: (c) => `<div class="person">${c.image ? `<img class="thumb" src="${esc(c.image)}" alt="">` : '<span class="thumb"></span>'}<div><strong>${esc(c.title)}</strong><span>${esc(c.issuer || '')}</span></div></div>` }, { label: 'Issued', render: (c) => date(c.issued_at) }, { label: 'Status', render: (c) => (c.published ? '<span class="pill ok">Shown</span>' : '<span class="pill">Hidden</span>') }] }); },
    socials: () => { tab.innerHTML = '<div class="alert info" style="margin-bottom:12px"><i class="ri-share-line"></i><span>Social links appear in the website footer. Choose an icon from the icon pack for each.</span></div><div data-m></div>';
      resourceList({ mount: $('[data-m]', tab), resource: 'socials', title: 'social link', searchable: false, size: 'narrow',
        fields: [{ name: 'platform', label: 'Platform name', required: true, placeholder: 'Instagram' }, { name: 'icon', label: 'Icon', type: 'icon', required: true, full: true }, { name: 'url', label: 'Profile link', required: true, full: true, placeholder: 'https://' }, { name: 'sort', label: 'Order', type: 'number' }, { name: 'active', label: 'Show on website', type: 'switch', default: 1 }],
        columns: [{ label: 'Platform', render: (s) => `<div class="row"><span class="card-icon"><i class="${esc(s.icon)}"></i></span><strong>${esc(s.platform)}</strong></div>` }, { label: 'Link', render: (s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a>` }, { label: 'Status', render: (s) => (s.active ? '<span class="pill ok">Shown</span>' : '<span class="pill">Hidden</span>') }] }); },
    popups: () => { tab.innerHTML = '<div class="alert info" style="margin-bottom:12px"><i class="ri-megaphone-line"></i><span>Pop-ups and adverts show on the pages you choose. Use <strong>modal</strong> for big promos, <strong>corner</strong> for a gentle card, or <strong>banner</strong> for a strip at the top. Views and clicks are counted.</span></div><div data-m></div>';
      resourceList({ mount: $('[data-m]', tab), resource: 'popups', title: 'pop-up', searchable: false,
        fields: [{ name: 'title', label: 'Headline', required: true, full: true }, { name: 'body', label: 'Text', type: 'textarea', full: true }, { name: 'image', label: 'Image / advert banner', type: 'image', full: true, folder: 'adverts' },
          { name: 'cta_text', label: 'Button text' }, { name: 'cta_url', label: 'Button link', placeholder: '/get-quote' },
          { name: 'style', label: 'Style', type: 'select', options: [['modal', 'Modal (centre of screen)'], ['corner', 'Corner card'], ['banner', 'Top banner']] },
          { name: 'trigger', label: 'When to show', type: 'select', options: [['delay', 'After a delay'], ['load', 'Immediately'], ['scroll', 'After scrolling halfway'], ['exit', 'When leaving (desktop)']] },
          { name: 'delay_seconds', label: 'Delay (seconds)', type: 'number', default: 6 }, { name: 'frequency', label: 'How often', type: 'select', options: [['session', 'Once per visit'], ['once', 'Once ever per device'], ['always', 'Every page view']] },
          { name: 'pages', label: 'Pages', default: '*', hint: '* = all pages, or e.g. /,/packages,/shop*', full: true }, { name: 'starts_at', label: 'Start', type: 'datetime' }, { name: 'ends_at', label: 'End', type: 'datetime' }, { name: 'active', label: 'Active', type: 'switch' }],
        columns: [{ label: 'Pop-up', render: (p) => `<div class="person">${p.image ? `<img class="thumb" src="${esc(p.image)}" alt="">` : ''}<div><strong>${esc(p.title)}</strong><span>${esc(p.style)} · ${esc(p.pages)}</span></div></div>` }, { label: 'Views', key: 'views' }, { label: 'Clicks', render: (p) => `${p.clicks}${p.views ? ` <span class="muted small">(${Math.round((p.clicks / p.views) * 100)}%)</span>` : ''}` }, { label: 'Status', render: (p) => (p.active ? '<span class="pill ok">Active</span>' : '<span class="pill">Off</span>') }] }); },
    faqs: () => resourceList({ mount: tab, resource: 'faqs', title: 'FAQ', fields: [{ name: 'question', label: 'Question', required: true, full: true }, { name: 'answer', label: 'Answer', type: 'textarea', required: true, full: true }, { name: 'category', label: 'Category' }, { name: 'sort', label: 'Order', type: 'number' }, { name: 'published', label: 'Published', type: 'switch', default: 1 }],
      columns: [{ label: 'Question', render: (f) => `<strong>${esc(f.question)}</strong>` }, { label: 'Category', key: 'category' }, { label: 'Status', render: (f) => (f.published ? '<span class="pill ok">Live</span>' : '<span class="pill">Hidden</span>') }] }),
    packages: () => resourceList({ mount: tab, resource: 'packages', title: 'package', searchable: false,
      fields: [{ name: 'name', label: 'Name', required: true }, { name: 'tier', label: 'For', type: 'select', options: [['residential', 'Homes'], ['commercial', 'Business']] }, { name: 'tagline', label: 'Tagline', full: true },
        { name: 'inverter_kva', label: 'Inverter (kVA)', type: 'number', step: 'any' }, { name: 'pv_wp', label: 'Panels (Wp)', type: 'number' }, { name: 'battery_kwh', label: 'Battery (kWh)', type: 'number', step: 'any' },
        { name: 'loads', label: 'What it runs', full: true }, { name: 'price_lead_acid', label: 'Price with lead-acid (₦)', type: 'number' }, { name: 'price_lithium', label: 'Price with lithium (₦)', type: 'number' },
        { name: 'sort', label: 'Order', type: 'number' }, { name: 'featured', label: 'Highlight as popular', type: 'switch' }, { name: 'published', label: 'Published', type: 'switch', default: 1 }],
      columns: [{ label: 'Package', render: (p) => `<strong>${esc(p.name)}</strong><div class="muted small">${p.inverter_kva}kVA · ${p.pv_wp}Wp · ${p.battery_kwh}kWh</div>` }, { label: 'Lead-acid', render: (p) => naira(p.price_lead_acid) }, { label: 'Lithium', render: (p) => (p.price_lithium ? naira(p.price_lithium) : '—') }, { label: 'Status', render: (p) => `${p.published ? '<span class="pill ok">Live</span>' : '<span class="pill">Hidden</span>'}${p.featured ? ' <span class="pill lime">Popular</span>' : ''}` }] }),
    branches: () => resourceList({ mount: tab, resource: 'branches', title: 'branch', searchable: false,
      fields: [{ name: 'name', label: 'Branch name', required: true }, { name: 'state', label: 'State' }, { name: 'address', label: 'Address', full: true }, { name: 'phones', label: 'Phone numbers (JSON list, e.g. ["0803…"])', type: 'json', empty: [], full: true, rows: 2 },
        { name: 'email', label: 'Email' }, { name: 'hours', label: 'Opening hours' }, { name: 'lat', label: 'Latitude', type: 'number', step: 'any' }, { name: 'lng', label: 'Longitude', type: 'number', step: 'any' }, { name: 'sort', label: 'Order', type: 'number' }, { name: 'is_hq', label: 'Head office', type: 'switch' }],
      columns: [{ label: 'Branch', render: (b) => `<strong>${esc(b.name)}</strong>${b.is_hq ? ' <span class="pill lime">HQ</span>' : ''}<div class="muted small">${esc(b.address || '')}</div>` }, { label: 'Phones', render: (b) => esc((b.phones || []).join(', ')) }, { label: 'Map', render: (b) => (b.lat ? '<span class="pill ok">Pinned</span>' : '<span class="pill warn">No pin</span>') }] }),
    seo: () => settingsForm(tab, [
      { key: 'seo', title: 'Search engine & sharing', sub: 'Default title/description used when a page has none, plus verification codes', fields: [{ name: 'title', label: 'Default title', full: true }, { name: 'description', label: 'Default description', type: 'textarea', full: true }, { name: 'keywords', label: 'Focus keywords (for reference)', type: 'textarea', full: true }, { name: 'og_image', label: 'Default share image', type: 'image', full: true }, { name: 'ga4_id', label: 'Google Analytics 4 ID (optional)', placeholder: 'G-XXXX' }] },
      { key: 'features', title: 'Website features', fields: [{ name: 'chat_enabled', label: 'AI chat assistant on the website', type: 'switch', full: true }, { name: 'voice_enabled', label: 'Voice conversations in the chat', type: 'switch', full: true }, { name: 'testimonials_enabled', label: 'Show testimonials', type: 'switch', full: true }, { name: 'blog_enabled', label: 'Show blog', type: 'switch', full: true }],
        read: (form, prev) => ({ ...prev, ...readForm(form, ['chat_enabled', 'voice_enabled', 'testimonials_enabled', 'blog_enabled'].map((n) => ({ name: n, type: 'switch' }))) }), map: (v) => v },
    ]),
    assistant: () => settingsForm(tab, [{ key: 'ai', title: 'AI website assistant', sub: 'Sola answers using your packages, branches, FAQs and shop. Add anything else it should know below — promotions, policies, delivery areas.', fields: [{ name: 'assistant_name', label: 'Assistant name' }, { name: 'greeting', label: 'Greeting message', type: 'textarea', full: true }, { name: 'extra_knowledge', label: 'Extra knowledge for the assistant', type: 'textarea', full: true, rows: 10, hint: 'Plain sentences work best. e.g. "This month: free panel cleaning with every maintenance visit. We do not install in Sokoto."' }] }]),
  };
  T[active]();
}
