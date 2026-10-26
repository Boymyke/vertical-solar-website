// Server-rendered, crawlable pages for dynamic content + sitemap/robots.
import { getSettings } from '../lib/site.js';
import { escapeHtml, parseJSON, stripHtml, naira } from '../lib/util.js';

const abs = (env, p) => (p && /^https?:/.test(p) ? p : (env.SITE_URL || '') + (p || ''));
const fmtDate = (d) => (d ? new Date(d.replace(' ', 'T') + 'Z').toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

async function renderTemplate(env, req, template, { title, description, image, canonical, jsonLd, html, type = 'article', noindex = false }) {
  const tpl = await env.ASSETS.fetch(new Request(new URL(template, req.url)));
  if (!tpl.ok) return new Response('Template missing', { status: 500 });
  const set = (sel, attr, val) => ({ element(el) { if (val != null) el.setAttribute(attr, val); } });
  const rw = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(title); } })
    .on('meta[name="description"]', set('', 'content', description))
    .on('meta[property="og:title"]', set('', 'content', title))
    .on('meta[property="og:description"]', set('', 'content', description))
    .on('meta[property="og:image"]', set('', 'content', image))
    .on('meta[property="og:url"]', set('', 'content', canonical))
    .on('meta[property="og:type"]', set('', 'content', type))
    .on('meta[name="twitter:title"]', set('', 'content', title))
    .on('meta[name="twitter:description"]', set('', 'content', description))
    .on('meta[name="twitter:image"]', set('', 'content', image))
    .on('link[rel="canonical"]', set('', 'href', canonical))
    .on('meta[name="robots"]', set('', 'content', noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'))
    .on('script#page-ld', { element(el) { el.setInnerContent(JSON.stringify(jsonLd || {}).replace(/</g, '\\u003c'), { html: true }); } })
    .on('#ssr-content', { element(el) { el.setInnerContent(html, { html: true }); } });
  const res = rw.transform(tpl);
  const out = new Response(res.body, res);
  out.headers.set('content-type', 'text/html; charset=utf-8');
  out.headers.set('cache-control', 'public, max-age=60, s-maxage=300');
  return out;
}

async function notFound(env, req) {
  const r = await env.ASSETS.fetch(new Request(new URL('/404', req.url)));
  return new Response(r.body, { status: 404, headers: r.headers });
}

const crumbs = (env, items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(env, path) })),
});

export function registerSeo(r) {
  r.get('/blog/:slug', async (req, env, { slug }) => {
    const p = await env.DB.prepare(`SELECT * FROM posts WHERE slug=? AND status='published' AND published_at <= datetime('now')`).bind(slug).first();
    if (!p) return notFound(env, req);
    env.ctx?.waitUntil(env.DB.prepare('UPDATE posts SET views=views+1 WHERE id=?').bind(p.id).run());
    const s = await getSettings(env);
    const related = (await env.DB.prepare(`SELECT slug, title, cover, published_at, read_minutes FROM posts WHERE status='published' AND id != ? AND category = ? ORDER BY published_at DESC LIMIT 3`).bind(p.id, p.category).all()).results;
    const url = abs(env, `/blog/${p.slug}`);
    const title = `${p.seo_title || p.title} | ${s.company.name} Blog`;
    const description = p.seo_description || p.excerpt || stripHtml(p.body).slice(0, 155);
    const image = abs(env, p.cover || s.seo.og_image);
    const catLabel = (p.category || 'news').replace(/-/g, ' ');
    const html = `
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><i class="ri-arrow-right-s-line" aria-hidden="true"></i><a href="/blog">Blog</a><i class="ri-arrow-right-s-line" aria-hidden="true"></i><span aria-current="page">${escapeHtml(p.title)}</span></nav>
<header class="post-head reveal">
  <a class="chip" href="/blog?category=${escapeHtml(p.category)}">${escapeHtml(catLabel)}</a>
  <h1>${escapeHtml(p.title)}</h1>
  ${p.excerpt ? `<p class="lede">${escapeHtml(p.excerpt)}</p>` : ''}
  <div class="post-meta"><span><i class="ri-user-3-line" aria-hidden="true"></i> ${escapeHtml(p.author_name || s.company.name)}</span><span><i class="ri-calendar-line" aria-hidden="true"></i> <time datetime="${escapeHtml(p.published_at)}">${fmtDate(p.published_at)}</time></span><span><i class="ri-time-line" aria-hidden="true"></i> ${p.read_minutes || 3} min read</span>
  <button class="btn btn-ghost btn-sm" type="button" data-read-aloud="#post-body"><i class="ri-volume-up-line" aria-hidden="true"></i> Listen</button>
  <button class="btn btn-ghost btn-sm" type="button" data-share><i class="ri-share-line" aria-hidden="true"></i> Share</button></div>
</header>
${p.cover ? `<figure class="post-cover reveal"><img src="${escapeHtml(p.cover)}" alt="${escapeHtml(p.title)}" width="1200" height="630" fetchpriority="high"></figure>` : ''}
<div class="post-layout">
  <article class="prose" id="post-body">${p.body}</article>
  <aside class="post-aside">
    <div class="card cta-card"><i class="ri-sun-line" aria-hidden="true"></i><h2>Need a system sized for you?</h2><p>Get a free load audit and a written quote from our engineers.</p><a class="btn btn-primary" href="/get-quote">Get a free quote</a></div>
    <div class="card toc" data-toc="#post-body"><h2>On this page</h2></div>
  </aside>
</div>
${related.length ? `<section class="related"><h2>Keep reading</h2><div class="grid-3">${related.map((x) => `
  <a class="post-card" href="/blog/${escapeHtml(x.slug)}"><div class="post-card-img">${x.cover ? `<img src="${escapeHtml(x.cover)}" alt="" loading="lazy">` : ''}</div><div class="post-card-body"><h3>${escapeHtml(x.title)}</h3><span class="muted">${fmtDate(x.published_at)} · ${x.read_minutes || 3} min</span></div></a>`).join('')}</div></section>` : ''}`;
    const jsonLd = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'BlogPosting', headline: p.title, description, image: [image], datePublished: p.published_at?.replace(' ', 'T') + 'Z',
          dateModified: (p.updated_at || p.published_at)?.replace(' ', 'T') + 'Z', mainEntityOfPage: url,
          author: { '@type': 'Organization', name: s.company.name, url: abs(env, '/') },
          publisher: { '@type': 'Organization', name: s.company.name, logo: { '@type': 'ImageObject', url: abs(env, '/assets/img/logo-mark.png') } },
        },
        crumbs(env, [['Home', '/'], ['Blog', '/blog'], [p.title, `/blog/${p.slug}`]]),
      ],
    };
    return renderTemplate(env, req, '/tpl/post', { title, description, image, canonical: url, jsonLd, html });
  });

  r.get('/projects/:slug', async (req, env, { slug }) => {
    const p = await env.DB.prepare('SELECT * FROM projects WHERE slug=? AND published=1').bind(slug).first();
    if (!p) return notFound(env, req);
    const s = await getSettings(env);
    const imgs = parseJSON(p.images, []);
    const t = (await env.DB.prepare('SELECT name, role, quote, photo, verified FROM testimonials WHERE project_id=? AND published=1 AND consent=1 LIMIT 2').bind(p.id).all()).results;
    const url = abs(env, `/projects/${p.slug}`);
    const title = `${p.title} — ${p.location || 'Nigeria'} Solar Project | ${s.company.name}`;
    const description = p.summary || `Solar installation by ${s.company.name} in ${p.location}.`;
    const spec = (label, v, unit, icon) => (v ? `<div class="spec"><i class="${icon}" aria-hidden="true"></i><span>${label}</span><strong>${v} ${unit}</strong></div>` : '');
    const html = `
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><i class="ri-arrow-right-s-line" aria-hidden="true"></i><a href="/projects">Projects</a><i class="ri-arrow-right-s-line" aria-hidden="true"></i><span aria-current="page">${escapeHtml(p.title)}</span></nav>
<header class="post-head reveal">
  <span class="chip">${escapeHtml(p.category || 'project')}</span>
  <h1>${escapeHtml(p.title)}</h1>
  <p class="lede"><i class="ri-map-pin-2-line" aria-hidden="true"></i> ${escapeHtml(p.location || '')}${p.client ? ' · Client: ' + escapeHtml(p.client) : ''}</p>
</header>
<div class="spec-row reveal">${spec('Solar PV', p.pv_kwp, 'kWp', 'ri-sun-line')}${spec('Inverter', p.inverter_kw, 'kW', 'ri-flashlight-line')}${spec('Battery storage', p.battery_kwh, 'kWh', 'ri-battery-2-charge-line')}</div>
${imgs.length ? `<section class="pgal" data-carousel aria-roledescription="carousel" aria-label="Project photos">
  <div class="pgal-stage" data-lightbox>
    <div class="pgal-track" data-track tabindex="0">${imgs.map((src, i) => `<button class="pgal-slide" type="button" data-full="${escapeHtml(src)}" aria-label="Photo ${i + 1} of ${imgs.length} — open full size"><img src="${escapeHtml(src)}" alt="${escapeHtml(p.title)} photo ${i + 1}" loading="${i ? 'lazy' : 'eager'}" decoding="async"></button>`).join('')}</div>
    ${imgs.length > 1 ? `<button class="pgal-nav prev" type="button" data-prev aria-label="Previous photo"><i class="ri-arrow-left-line" aria-hidden="true"></i></button><button class="pgal-nav next" type="button" data-next aria-label="Next photo"><i class="ri-arrow-right-line" aria-hidden="true"></i></button><span class="pgal-count" data-count-label aria-live="polite">1 / ${imgs.length}</span>` : ''}
  </div>
  ${imgs.length > 1 ? `<div class="pgal-thumbs">${imgs.map((src, i) => `<button type="button" data-go="${i}" aria-label="Show photo ${i + 1}"${i ? '' : ' aria-current="true"'}><img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async"></button>`).join('')}</div>` : ''}
</section>` : ''}
<div class="post-layout"><article class="prose">${p.summary ? `<p class="lede">${escapeHtml(p.summary)}</p>` : ''}${p.body || ''}
${p.video_url ? `<div class="video-embed" data-video="${escapeHtml(p.video_url)}"></div>` : ''}
${t.map((x) => `<blockquote class="quote-card"><p>“${escapeHtml(x.quote)}”</p><footer>${escapeHtml(x.name)}${x.role ? ', ' + escapeHtml(x.role) : ''}${x.verified ? ' <span class="badge-verified"><i class="ri-shield-check-fill" aria-hidden="true"></i> Verified customer</span>' : ''}</footer></blockquote>`).join('')}
</article>
<aside class="post-aside"><div class="card cta-card"><i class="ri-building-2-line" aria-hidden="true"></i><h2>Want results like this?</h2><p>Our engineers will audit your load and design a system for your site.</p><a class="btn btn-primary" href="/get-quote">Book a site survey</a></div></aside></div>`;
    const jsonLd = { '@context': 'https://schema.org', '@graph': [
      { '@type': 'CreativeWork', name: p.title, description, image: imgs.map((i) => abs(env, i)), locationCreated: p.location, creator: { '@type': 'Organization', name: s.company.name } },
      crumbs(env, [['Home', '/'], ['Projects', '/projects'], [p.title, `/projects/${p.slug}`]]),
    ] };
    return renderTemplate(env, req, '/tpl/project', { title, description, image: abs(env, imgs[0] || s.seo.og_image), canonical: url, jsonLd, html });
  });

  r.get('/shop/:slug', async (req, env, { slug }) => {
    const s = await getSettings(env);
    if (!s.shop.enabled) return Response.redirect(new URL('/shop', req.url).toString(), 302);
    const p = await env.DB.prepare('SELECT * FROM products WHERE slug=? AND in_shop=1 AND active=1').bind(slug).first();
    if (!p) return notFound(env, req);
    const imgs = parseJSON(p.images, []);
    const specs = parseJSON(p.specs, {});
    const url = abs(env, `/shop/${p.slug}`);
    const title = `${p.name}${p.brand ? ' — ' + p.brand : ''} | Buy in Nigeria | ${s.company.name}`;
    const description = stripHtml(p.description || '').slice(0, 155) || `Buy ${p.name} from ${s.company.name}. Genuine products, warranty and professional installation available.`;
    const inStock = p.stock > 0;
    const html = `
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><i class="ri-arrow-right-s-line" aria-hidden="true"></i><a href="/shop">Shop</a><i class="ri-arrow-right-s-line" aria-hidden="true"></i><span aria-current="page">${escapeHtml(p.name)}</span></nav>
<div class="product-detail" data-product='${escapeHtml(JSON.stringify({ id: p.id, name: p.name, price: p.price, image: imgs[0] || null, slug: p.slug }))}'>
  <div class="product-media reveal" data-lightbox>${imgs.length ? imgs.map((src, i) => `<button class="gallery-item${i ? '' : ' main'}" type="button" data-full="${escapeHtml(src)}"><img src="${escapeHtml(src)}" alt="${escapeHtml(p.name)}" loading="${i ? 'lazy' : 'eager'}"></button>`).join('') : '<div class="product-ph"><i class="ri-solar-panel-line" aria-hidden="true"></i></div>'}</div>
  <div class="product-info reveal">
    ${p.brand ? `<span class="chip">${escapeHtml(p.brand)}</span>` : ''}
    <h1>${escapeHtml(p.name)}</h1>
    <div class="price-row"><strong class="price">${naira(p.price)}</strong>${p.compare_price > p.price ? `<s class="muted">${naira(p.compare_price)}</s>` : ''}</div>
    <p class="stock ${inStock ? 'in' : 'out'}"><i class="${inStock ? 'ri-checkbox-circle-fill' : 'ri-time-line'}" aria-hidden="true"></i> ${inStock ? 'In stock' : 'Available on order'}${p.warranty_months ? ` · ${p.warranty_months}-month warranty` : ''}</p>
    <div class="qty-row"><label for="qty">Quantity</label><div class="qty"><button type="button" data-qty="-1" aria-label="Decrease">−</button><input id="qty" type="number" min="1" value="1" inputmode="numeric"><button type="button" data-qty="1" aria-label="Increase">+</button></div></div>
    <div class="btn-row"><button class="btn btn-primary" type="button" data-add-to-cart><i class="ri-shopping-bag-3-line" aria-hidden="true"></i> Add to cart</button><a class="btn btn-ghost" href="/get-quote?product=${encodeURIComponent(p.name)}"><i class="ri-tools-line" aria-hidden="true"></i> Add installation</a></div>
    <div class="prose">${p.description || ''}</div>
    ${Object.keys(specs).length ? `<table class="spec-table"><caption>Specifications</caption><tbody>${Object.entries(specs).map(([k, v]) => `<tr><th scope="row">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')}</tbody></table>` : ''}
  </div>
</div>`;
    const jsonLd = { '@context': 'https://schema.org', '@graph': [
      { '@type': 'Product', name: p.name, description, sku: p.sku || undefined, brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined, image: imgs.map((i) => abs(env, i)),
        offers: { '@type': 'Offer', priceCurrency: 'NGN', price: p.price, url, availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder', seller: { '@type': 'Organization', name: s.company.name } } },
      crumbs(env, [['Home', '/'], ['Shop', '/shop'], [p.name, `/shop/${p.slug}`]]),
    ] };
    return renderTemplate(env, req, '/tpl/product', { title, description, image: abs(env, imgs[0] || s.seo.og_image), canonical: url, jsonLd, html, type: 'product' });
  });

  r.get('/q/:token', async (req, env) => {
    const res = await env.ASSETS.fetch(new Request(new URL('/tpl/quote', req.url)));
    const out = new Response(res.body, res);
    out.headers.set('x-robots-tag', 'noindex, nofollow');
    out.headers.set('cache-control', 'no-store');
    return out;
  });

  r.get('/faq', async (req, env) => {
    const { results } = await env.DB.prepare('SELECT question, answer FROM faqs WHERE published=1 ORDER BY sort, id').all();
    const html = results.map((f) => `<details><summary>${escapeHtml(f.question)}</summary><div>${escapeHtml(f.answer)}</div></details>`).join('');
    const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: results.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) };
    const tpl = await env.ASSETS.fetch(new Request(new URL('/faq', req.url)));
    const res = new HTMLRewriter()
      .on('#ssr-content', { element(el) { el.setInnerContent(html, { html: true }); } })
      .on('script#page-ld', { element(el) { el.setInnerContent(JSON.stringify(ld).replace(/</g, '\\u003c'), { html: true }); } })
      .transform(tpl);
    const out = new Response(res.body, res);
    out.headers.set('cache-control', 'public, max-age=60, s-maxage=300');
    return out;
  });

  r.get('/robots.txt', async (req, env) => {
    const site = env.SITE_URL || new URL(req.url).origin;
    return new Response(`User-agent: *\nAllow: /\nDisallow: /staff\nDisallow: /api/\nDisallow: /q/\nDisallow: /tpl/\nDisallow: /cart\n\nSitemap: ${site}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=3600' } });
  });

  r.get('/sitemap.xml', async (req, env) => {
    const site = env.SITE_URL || new URL(req.url).origin;
    const s = await getSettings(env);
    const staticPages = ['', '/about', '/solutions/residential', '/solutions/commercial', '/solutions/industrial', '/packages', '/financing', '/projects', '/solar-care',
      '/blog', '/testimonials', '/faq', '/contact', '/get-quote', '/support', '/privacy', '/terms', '/installation-policy', '/support-policy', '/accessibility'];
    if (s.shop.enabled) staticPages.push('/shop');
    const [posts, projects, products] = await Promise.all([
      env.DB.prepare(`SELECT slug, COALESCE(updated_at, published_at) d FROM posts WHERE status='published' AND published_at <= datetime('now')`).all(),
      env.DB.prepare('SELECT slug, created_at d FROM projects WHERE published=1').all(),
      s.shop.enabled ? env.DB.prepare('SELECT slug, updated_at d FROM products WHERE in_shop=1 AND active=1').all() : { results: [] },
    ]);
    const u = (loc, lastmod, pr = '0.7', freq = 'weekly') => `<url><loc>${site}${loc}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ''}<changefreq>${freq}</changefreq><priority>${pr}</priority></url>`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[
      ...staticPages.map((p) => u(p || '/', null, p === '' ? '1.0' : '0.8')),
      ...posts.results.map((p) => u(`/blog/${p.slug}`, p.d, '0.7', 'monthly')),
      ...projects.results.map((p) => u(`/projects/${p.slug}`, p.d, '0.6', 'monthly')),
      ...products.results.map((p) => u(`/shop/${p.slug}`, p.d, '0.6')),
    ].join('')}</urlset>`;
    return new Response(xml, { headers: { 'content-type': 'application/xml', 'cache-control': 'public, max-age=3600' } });
  });
}
