// Public (unauthenticated) API used by the website.
import { json, ok, fail, readJson, clientIp } from '../lib/http.js';
import { rateLimit, verifyTurnstile, notify, getSessionUser } from '../lib/auth.js';
import { getPublicSite, getSettings } from '../lib/site.js';
import { str, num, isEmail, normPhone, parseJSON, parseUA, now, nextNumber, clamp } from '../lib/util.js';

const cacheJson = (data, seconds = 60) =>
  json(data, 200, { 'cache-control': `public, max-age=${seconds}, s-maxage=${seconds}` });

function honeypot(body) {
  if (body.website || body.company_website) fail(400, 'Rejected');
}

// Find an existing contact by phone/email or create a new lead.
export async function upsertLead(env, { name, phone, email, city, state, segment, interest, source, note, value, address, lat, lng }) {
  const okLat = Number.isFinite(lat) && Math.abs(lat) <= 90 ? lat : null, okLng = Number.isFinite(lng) && Math.abs(lng) <= 180 ? lng : null;
  const p = normPhone(phone);
  let row = null;
  if (p) row = await env.DB.prepare('SELECT id FROM customers WHERE phone = ? LIMIT 1').bind(p).first();
  if (!row && email) row = await env.DB.prepare('SELECT id FROM customers WHERE email = ? COLLATE NOCASE LIMIT 1').bind(email).first();
  let id;
  let isNew = false;
  if (row) {
    id = row.id;
    await env.DB.prepare(`UPDATE customers SET updated_at = ?, interest = COALESCE(?, interest), city = COALESCE(city, ?),
        email = COALESCE(email, ?), address = COALESCE(address, ?), lat = COALESCE(lat, ?), lng = COALESCE(lng, ?),
        name = CASE WHEN name = '' OR name IS NULL THEN ? ELSE name END WHERE id = ?`)
      .bind(now(), interest || null, city || null, email || null, address || null, okLat, okLng, name || 'Website visitor', id).run();
  } else {
    isNew = true;
    const r = await env.DB.prepare(`INSERT INTO customers (name, phone, whatsapp, email, city, state, address, lat, lng, segment, interest, source, value_estimate, next_followup_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now', '+1 day')) RETURNING id`)
      .bind(name || 'Website visitor', p, p, email || null, city || null, state || null, address || null, okLat, okLng, segment || 'residential',
        interest || null, source || 'website', value || 0).first();
    id = r.id;
    await env.DB.prepare(`INSERT INTO followups (customer_id, type, title, due_at, auto) VALUES (?, 'call', ?, datetime('now', '+2 hours'), 1)`)
      .bind(id, `Call new lead: ${name || p || email}`).run();
  }
  if (note) await env.DB.prepare(`INSERT INTO activities (customer_id, type, body) VALUES (?, 'system', ?)`).bind(id, note).run();
  return { id, isNew };
}

// Location search for address fields (website forms and the CRM). Photon (OpenStreetMap data) is built for
// search-as-you-type; results are limited to Nigeria and cached at the edge for a day.
const NG_BBOX = '2.67,4.07,14.68,13.89';
export async function searchPlaces(q, siteUrl) {
  const query = String(q || '').trim().slice(0, 120);
  if (query.length < 3) return [];
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=7&lang=en&bbox=${NG_BBOX}&lat=6.52&lon=3.38`;
  const cache = caches.default;
  const key = new Request(url);
  let res = await cache.match(key);
  if (!res) {
    res = await fetch(url, { headers: { 'user-agent': `VerticalSolarWebsite/1.0 (+${siteUrl || 'https://verticalsolar.com.ng'})`, accept: 'application/json' }, cf: { cacheTtl: 86400 } });
    if (!res.ok) return [];
    res = new Response(res.body, res);
    res.headers.set('cache-control', 'public, max-age=86400');
    await cache.put(key, res.clone());
  }
  const data = await res.json().catch(() => ({}));
  const seen = new Set();
  return (data.features || []).filter((f) => !f.properties?.countrycode || f.properties.countrycode === 'NG').map((f) => {
    const p = f.properties || {};
    const name = p.name || [p.housenumber, p.street].filter(Boolean).join(' ');
    const area = [p.district || p.locality, p.city || p.county, p.state].filter((x, i, a) => x && x !== name && a.indexOf(x) === i);
    const [lng, lat] = f.geometry?.coordinates || [];
    return { label: [name, ...area].filter(Boolean).join(', '), name, sub: area.join(', '), city: p.city || p.county || p.district || '', state: (p.state || '').replace(/ State$/, ''), lat, lng };
  }).filter((x) => x.label && Number.isFinite(x.lat) && !seen.has(x.label) && seen.add(x.label));
}

export function registerPublic(r) {
  r.get('/api/public/places', async (req, env) => {
    await rateLimit(env, `places:${clientIp(req)}`, 90, 300);
    const items = await searchPlaces(new URL(req.url).searchParams.get('q'), env.SITE_URL);
    return json({ items }, 200, { 'cache-control': 'public, max-age=3600' });
  });

  r.get('/api/public/site', async (req, env) => cacheJson(await getPublicSite(env), 30));

  r.get('/api/public/projects', async (req, env) => {
    const u = new URL(req.url);
    const cat = u.searchParams.get('category');
    const featured = u.searchParams.get('featured');
    let sql = 'SELECT id,slug,title,client,location,category,summary,pv_kwp,inverter_kw,battery_kwh,images,featured,completed_at FROM projects WHERE published=1';
    const args = [];
    if (cat) { sql += ' AND category=?'; args.push(cat); }
    if (featured) sql += ' AND featured=1';
    sql += ' ORDER BY featured DESC, sort, id DESC LIMIT 60';
    const { results } = await env.DB.prepare(sql).bind(...args).all();
    return cacheJson(results.map((p) => ({ ...p, images: parseJSON(p.images, []) })));
  });

  r.get('/api/public/projects/:slug', async (req, env, { slug }) => {
    const p = await env.DB.prepare('SELECT * FROM projects WHERE slug=? AND published=1').bind(slug).first();
    if (!p) fail(404, 'Project not found');
    p.images = parseJSON(p.images, []);
    return cacheJson(p);
  });

  r.get('/api/public/posts', async (req, env) => {
    const u = new URL(req.url);
    const cat = u.searchParams.get('category');
    const q = str(u.searchParams.get('q'), 80);
    const page = clamp(num(u.searchParams.get('page'), 1), 1, 200);
    const per = clamp(num(u.searchParams.get('per'), 9), 1, 30);
    let where = "status='published' AND published_at <= datetime('now')";
    const args = [];
    if (cat) { where += ' AND category=?'; args.push(cat); }
    if (q) { where += ' AND (title LIKE ? OR excerpt LIKE ?)'; args.push(`%${q}%`, `%${q}%`); }
    const total = await env.DB.prepare(`SELECT COUNT(*) c FROM posts WHERE ${where}`).bind(...args).first();
    const { results } = await env.DB.prepare(
      `SELECT slug,title,excerpt,cover,category,author_name,published_at,read_minutes FROM posts WHERE ${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`
    ).bind(...args, per, (page - 1) * per).all();
    return cacheJson({ items: results, total: total.c, page, pages: Math.ceil(total.c / per) });
  });

  r.get('/api/public/posts/:slug', async (req, env, { slug }) => {
    const p = await env.DB.prepare(`SELECT slug,title,excerpt,body,cover,category,tags,author_name,published_at,updated_at,read_minutes,seo_title,seo_description
      FROM posts WHERE slug=? AND status='published'`).bind(slug).first();
    if (!p) fail(404, 'Post not found');
    return cacheJson(p);
  });

  r.get('/api/public/testimonials', async (req, env) => {
    const { results } = await env.DB.prepare(
      `SELECT t.id,t.name,t.role,t.location,t.photo,t.quote,t.rating,t.video_url,t.evidence,t.system,t.savings,t.verified,t.featured,
              p.slug AS project_slug, p.title AS project_title
       FROM testimonials t LEFT JOIN projects p ON p.id=t.project_id
       WHERE t.published=1 AND t.consent=1 ORDER BY t.featured DESC, t.sort, t.id DESC`
    ).all();
    return cacheJson(results.map((t) => ({ ...t, evidence: parseJSON(t.evidence, []) })));
  });

  r.get('/api/public/faqs', async (req, env) => {
    const { results } = await env.DB.prepare('SELECT question,answer,category FROM faqs WHERE published=1 ORDER BY sort, id').all();
    return cacheJson(results, 300);
  });

  r.get('/api/public/products', async (req, env) => {
    const settings = await getSettings(env);
    if (!settings.shop.enabled) return cacheJson({ enabled: false, items: [] });
    const u = new URL(req.url);
    const cat = u.searchParams.get('category');
    const q = str(u.searchParams.get('q'), 80);
    let sql = 'SELECT id,slug,name,category,brand,description,specs,price,compare_price,stock,images,featured,warranty_months FROM products WHERE in_shop=1 AND active=1';
    const args = [];
    if (cat) { sql += ' AND category=?'; args.push(cat); }
    if (q) { sql += ' AND (name LIKE ? OR brand LIKE ?)'; args.push(`%${q}%`, `%${q}%`); }
    sql += ' ORDER BY featured DESC, name LIMIT 200';
    const { results } = await env.DB.prepare(sql).bind(...args).all();
    return cacheJson({
      enabled: true,
      items: results.map((p) => ({ ...p, specs: parseJSON(p.specs, {}), images: parseJSON(p.images, []), in_stock: p.stock > 0, stock: undefined })),
    }, 30);
  });

  r.get('/api/public/products/:slug', async (req, env, { slug }) => {
    const settings = await getSettings(env);
    if (!settings.shop.enabled) fail(404, 'Shop is closed');
    const p = await env.DB.prepare('SELECT id,slug,name,category,brand,description,specs,price,compare_price,stock,images,warranty_months FROM products WHERE slug=? AND in_shop=1 AND active=1').bind(slug).first();
    if (!p) fail(404, 'Product not found');
    return cacheJson({ ...p, specs: parseJSON(p.specs, {}), images: parseJSON(p.images, []), in_stock: p.stock > 0, stock: undefined });
  });

  // Contact / quote / package / promo / callback forms → CRM lead
  r.post('/api/public/lead', async (req, env) => {
    const ip = clientIp(req);
    await rateLimit(env, `lead:${ip}`, 8, 600);
    const b = await readJson(req, 32 * 1024);
    honeypot(b);
    await verifyTurnstile(env, b.turnstile, ip);
    const name = str(b.name, 120);
    const phone = str(b.phone, 30);
    const email = str(b.email, 160);
    if (!name) fail(400, 'Please tell us your name');
    if (!phone && !email) fail(400, 'Please give us a phone number or email so we can reach you');
    if (email && !isEmail(email)) fail(400, 'That email address does not look right');
    const kind = str(b.kind, 40) || 'enquiry';
    const details = [
      `Website ${kind}`,
      b.package && `Package: ${str(b.package, 80)}`,
      b.battery && `Battery preference: ${str(b.battery, 40)}`,
      b.interest && `Interested in: ${str(b.interest, 120)}`,
      b.budget && `Budget: ${str(b.budget, 60)}`,
      b.load && `Load calculator: ${str(typeof b.load === 'string' ? b.load : JSON.stringify(b.load), 600)}`,
      b.message && `Message: ${str(b.message, 2000)}`,
      b.contact_pref && `Prefers: ${str(b.contact_pref, 30)}`,
      b.place && `Location: ${str(b.place, 200)}${Number.isFinite(+b.lat) && Number.isFinite(+b.lng) && b.lat !== '' ? ` (${(+b.lat).toFixed(5)}, ${(+b.lng).toFixed(5)})` : ''}`,
      b.page && `Page: ${str(b.page, 200)}`,
    ].filter(Boolean).join('\n');
    const { id, isNew } = await upsertLead(env, {
      name, phone, email, city: str(b.city, 80), state: str(b.state, 80), address: str(b.place, 200),
      lat: b.lat === '' || b.lat == null ? NaN : Number(b.lat), lng: b.lng === '' || b.lng == null ? NaN : Number(b.lng),
      segment: ['residential', 'commercial', 'industrial', 'government'].includes(b.segment) ? b.segment : 'residential',
      interest: str(b.package || b.interest, 120), source: kind === 'chat' ? 'chatbot' : `website_${kind}`, note: details,
    });
    await notify(env, {
      module: 'crm', type: 'success',
      title: `${isNew ? 'New lead' : 'Returning contact'}: ${name}`,
      body: `${kind}${b.package ? ' — ' + b.package : ''} · ${phone || email}`,
      link: `/admin/#/customers/${id}`,
    });
    await env.DB.prepare('INSERT INTO events (name, path, meta) VALUES (?,?,?)').bind('lead_' + kind, str(b.page, 200), JSON.stringify({ customer_id: id })).run();
    return ok({ message: 'Thank you — our team will contact you within 24 hours.' });
  });

  r.post('/api/public/ticket', async (req, env) => {
    const ip = clientIp(req);
    await rateLimit(env, `ticket:${ip}`, 5, 600);
    const b = await readJson(req, 32 * 1024);
    honeypot(b);
    await verifyTurnstile(env, b.turnstile, ip);
    const name = str(b.name, 120), phone = str(b.phone, 30), email = str(b.email, 160);
    const subject = str(b.subject, 160), message = str(b.message, 4000);
    if (!name || !subject || !message) fail(400, 'Please fill in your name, the subject and a description');
    if (!phone && !email) fail(400, 'Please give us a phone number or email');
    const number = await nextNumber(env, 'TKT', 'tickets');
    const { id: customerId } = await upsertLead(env, { name, phone, email, source: 'support', note: `Opened support ticket ${number}: ${subject}` });
    const cat = ['general', 'fault', 'billing', 'warranty', 'installation'].includes(b.category) ? b.category : 'general';
    const priority = cat === 'fault' ? 'high' : 'normal';
    await env.DB.prepare(`INSERT INTO tickets (number, customer_id, name, email, phone, subject, message, category, priority) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(number, customerId, name, email, normPhone(phone), subject, message, cat, priority).run();
    await notify(env, { module: 'support', type: priority === 'high' ? 'warning' : 'info', title: `Support ticket ${number}`, body: `${name}: ${subject}`, link: '/admin/#/support' });
    return ok({ number, message: `Ticket ${number} received. Our support team will respond shortly.` });
  });

  r.post('/api/public/subscribe', async (req, env) => {
    await rateLimit(env, `sub:${clientIp(req)}`, 5, 600);
    const b = await readJson(req, 4096);
    honeypot(b);
    if (!isEmail(b.email)) fail(400, 'Please enter a valid email');
    await env.DB.prepare('INSERT OR IGNORE INTO subscribers (email, source) VALUES (?,?)').bind(str(b.email, 160), str(b.source, 60) || 'footer').run();
    return ok({ message: 'You are subscribed. Expect useful solar tips, no spam.' });
  });

  // ── Shop checkout ──
  r.post('/api/public/order', async (req, env) => {
    const ip = clientIp(req);
    await rateLimit(env, `order:${ip}`, 6, 600);
    const settings = await getSettings(env);
    if (!settings.shop.enabled) fail(403, 'The online shop is currently closed');
    const b = await readJson(req, 64 * 1024);
    honeypot(b);
    await verifyTurnstile(env, b.turnstile, ip);
    const name = str(b.name, 120), phone = str(b.phone, 30), email = str(b.email, 160);
    if (!name || !phone) fail(400, 'Name and phone number are required');
    if (email && !isEmail(email)) fail(400, 'Invalid email');
    const wanted = Array.isArray(b.items) ? b.items.slice(0, 50) : [];
    if (!wanted.length) fail(400, 'Your cart is empty');
    const items = [];
    let subtotal = 0;
    for (const w of wanted) {
      const qty = clamp(Math.floor(num(w.qty, 1)), 1, 500);
      const p = await env.DB.prepare('SELECT id,name,price,stock FROM products WHERE id=? AND in_shop=1 AND active=1').bind(num(w.id, 0)).first();
      if (!p) continue;
      items.push({ product_id: p.id, name: p.name, qty, unit_price: p.price, total: p.price * qty, backorder: p.stock < qty });
      subtotal += p.price * qty;
    }
    if (!items.length) fail(400, 'Those products are no longer available');
    const delivery = num(settings.shop.delivery_fee, 0) || 0;
    const number = await nextNumber(env, 'ORD', 'orders');
    const { id: customerId } = await upsertLead(env, {
      name, phone, email, city: str(b.city, 80), state: str(b.state, 80), source: 'shop',
      note: `Placed shop order ${number} (${items.length} item${items.length > 1 ? 's' : ''})`, value: subtotal,
    });
    await env.DB.prepare(`INSERT INTO orders (number, customer_id, name, email, phone, address, city, state, items, subtotal, delivery, total, payment_method, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(number, customerId, name, email, normPhone(phone), str(b.address, 300), str(b.city, 80), str(b.state, 80),
      JSON.stringify(items), subtotal, delivery, subtotal + delivery, b.payment_method === 'paystack' ? 'paystack' : 'transfer', str(b.notes, 1000)).run();
    await notify(env, { module: 'shop', type: 'success', title: `New order ${number}`, body: `${name} · ₦${(subtotal + delivery).toLocaleString()}`, link: '/admin/#/orders' });
    return ok({ number, total: subtotal + delivery, email: email || null });
  });

  r.post('/api/public/order/verify', async (req, env) => {
    await rateLimit(env, `orderv:${clientIp(req)}`, 10, 600);
    const b = await readJson(req, 4096);
    const order = await env.DB.prepare('SELECT id,number,total,status FROM orders WHERE number=?').bind(str(b.number, 40)).first();
    if (!order) fail(404, 'Order not found');
    if (!env.PAYSTACK_SECRET_KEY) return ok({ status: order.status, verified: false });
    const ref = str(b.reference, 120);
    const r2 = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`, {
      headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
    });
    const data = await r2.json();
    const paid = data?.data?.status === 'success' && Math.round(data.data.amount) >= Math.round(order.total * 100);
    if (paid) {
      await env.DB.prepare(`UPDATE orders SET status='paid', payment_ref=?, paid_at=?, updated_at=? WHERE id=?`).bind(ref, now(), now(), order.id).run();
      await notify(env, { module: 'shop', type: 'success', title: `Order ${order.number} paid online`, body: `Paystack ref ${ref}`, link: '/admin/#/orders' });
    }
    return ok({ status: paid ? 'paid' : order.status, verified: paid });
  });

  // ── Public quote link ──
  r.get('/api/public/quote/:token', async (req, env, { token }) => {
    const q = await env.DB.prepare(`SELECT q.*, c.name AS customer_name, c.company AS customer_company, c.email AS customer_email, c.phone AS customer_phone, c.address AS customer_address, c.city AS customer_city
      FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id WHERE q.token=?`).bind(token).first();
    const viewer = new URL(req.url).searchParams.get('preview') === '1' && !!(await getSessionUser(env, req));
    if (!q || (q.status === 'draft' && !viewer)) fail(404, 'Quote not found');
    if (!viewer) {
      await env.DB.prepare(`UPDATE quotes SET view_count=view_count+1, viewed_at=COALESCE(viewed_at, ?), status=CASE WHEN status='sent' THEN 'viewed' ELSE status END WHERE id=?`)
        .bind(now(), q.id).run();
      if (!q.viewed_at) await notify(env, { module: 'quotes', type: 'info', title: `Quote ${q.number} opened`, body: `${q.customer_name || 'Customer'} viewed the quote`, link: `/admin/#/quotes/${q.id}` });
    }
    const settings = await getSettings(env);
    const { created_by, token: _t, ...safe } = q;
    return json({ quote: { ...safe, items: parseJSON(q.items, []), system: parseJSON(q.system, {}) }, company: settings.company, bank: settings.shop.bank_details });
  });

  r.post('/api/public/quote/:token/respond', async (req, env, { token }) => {
    await rateLimit(env, `qresp:${clientIp(req)}`, 10, 600);
    const b = await readJson(req, 8192);
    const q = await env.DB.prepare('SELECT id, number, customer_id, status, valid_until FROM quotes WHERE token=?').bind(token).first();
    if (!q || q.status === 'draft') fail(404, 'Quote not found');
    if (['accepted', 'declined'].includes(q.status)) fail(409, 'This quote has already been responded to');
    const action = b.action === 'accept' ? 'accepted' : 'declined';
    const name = str(b.name, 120);
    if (action === 'accepted' && !name) fail(400, 'Please type your full name to accept');
    await env.DB.prepare('UPDATE quotes SET status=?, responded_at=?, accepted_name=?, response_note=?, updated_at=? WHERE id=?')
      .bind(action, now(), name, str(b.note, 1000), now(), q.id).run();
    if (q.customer_id) {
      await env.DB.prepare(`INSERT INTO activities (customer_id, type, body) VALUES (?, 'system', ?)`).bind(q.customer_id, `Quote ${q.number} ${action} online${name ? ' by ' + name : ''}`).run();
      if (action === 'accepted') await env.DB.prepare(`UPDATE customers SET stage='won', status='customer', updated_at=? WHERE id=?`).bind(now(), q.customer_id).run();
      // The customer has answered, so the "chase this quote" reminder is no longer needed.
      await env.DB.prepare(`UPDATE followups SET status='done', completed_at=?, outcome=? WHERE customer_id=? AND title=? AND status='pending'`)
        .bind(now(), `Customer ${action} the quote online`, q.customer_id, `Chase quote ${q.number}`).run();
    }
    await notify(env, { module: 'quotes', type: action === 'accepted' ? 'success' : 'warning', title: `Quote ${q.number} ${action}`, body: name || '', link: `/admin/#/quotes/${q.id}` });
    return ok({ status: action });
  });

  r.post('/api/public/popup/:id/stat', async (req, env, { id }) => {
    const b = await readJson(req, 1024);
    const col = b.kind === 'click' ? 'clicks' : 'views';
    await env.DB.prepare(`UPDATE popups SET ${col} = ${col} + 1 WHERE id=?`).bind(num(id, 0)).run();
    return ok();
  });

  // ── Visitor analytics + heatmaps ──
  r.post('/api/public/track', async (req, env) => {
    const ip = clientIp(req);
    await rateLimit(env, `trk:${ip}`, 240, 600);
    const ua = parseUA(req.headers.get('user-agent') || '');
    if (ua.bot) return new Response(null, { status: 204 });
    let b;
    try { b = JSON.parse(await req.text()); } catch { return new Response(null, { status: 204 }); }
    const cf = req.cf || {};
    const path = (str(b.path, 200) || '/').split('?')[0];
    if (path.startsWith('/admin')) return new Response(null, { status: 204 });

    if (b.type === 'pv') {
      await env.DB.prepare(`INSERT OR IGNORE INTO pageviews (pv_id, visitor_id, session_id, path, title, referrer, utm_source, utm_campaign, country, region, city, lat, lng, timezone, device, browser, os, lang, screen_w, is_new)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        str(b.pv_id, 40), str(b.visitor_id, 40), str(b.session_id, 40), path, str(b.title, 200), str(b.referrer, 300),
        str(b.utm_source, 80), str(b.utm_campaign, 80), cf.country || null, cf.region || null, cf.city || null,
        cf.latitude ? Number(cf.latitude) : null, cf.longitude ? Number(cf.longitude) : null, cf.timezone || null,
        ua.device, ua.browser, ua.os, str(b.lang, 10), num(b.screen_w, null), b.is_new ? 1 : 0).run();
    } else if (b.type === 'end') {
      await env.DB.prepare('UPDATE pageviews SET duration_s=MAX(duration_s, ?), max_scroll=MAX(max_scroll, ?) WHERE pv_id=?')
        .bind(clamp(num(b.duration, 0), 0, 7200), clamp(num(b.max_scroll, 0), 0, 100), str(b.pv_id, 40)).run();
    } else if (b.type === 'heat' && Array.isArray(b.events)) {
      const device = ['mobile', 'tablet', 'desktop'].includes(b.device) ? b.device : ua.device;
      const evs = b.events.slice(0, 60);
      const stmt = env.DB.prepare('INSERT INTO heat_events (path, device, type, x, y, doc_h, target) VALUES (?,?,?,?,?,?,?)');
      const batch = evs.filter((e) => typeof e.x === 'number' && typeof e.y === 'number').map((e) =>
        stmt.bind(path, device, ['click', 'move', 'rage'].includes(e.t) ? e.t : 'click', clamp(e.x, 0, 1), clamp(Math.round(e.y), 0, 100000), num(e.h, null), str(e.s, 120)));
      if (batch.length) await env.DB.batch(batch);
    } else if (b.type === 'event') {
      await env.DB.prepare('INSERT INTO events (name, path, visitor_id, meta) VALUES (?,?,?,?)')
        .bind(str(b.name, 60), path, str(b.visitor_id, 40), b.meta ? JSON.stringify(b.meta).slice(0, 1000) : null).run();
    }
    return new Response(null, { status: 204 });
  });

  // ── Media from R2 ──
  r.get('/media/*', async (req, env) => {
    const key = decodeURIComponent(new URL(req.url).pathname.replace(/^\/media\//, ''));
    if (!key || key.includes('..')) fail(404, 'Not found');
    const obj = await env.MEDIA.get(key, { onlyIf: req.headers });
    if (!obj) fail(404, 'Not found');
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('etag', obj.httpEtag);
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    headers.set('x-content-type-options', 'nosniff');
    if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers });
    return new Response(obj.body, { headers });
  });
}
