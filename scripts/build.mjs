// Static page builder: composes site/pages/*.html with shared head/header/footer into public/.
// Also copies self-hosted fonts, icons and libraries. Run: npm run build
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE = 'https://verticalsolar.com.ng';
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const write = (p, s) => { const f = path.join(ROOT, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const copy = (from, to) => { const t = path.join(ROOT, to); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.copyFileSync(path.join(ROOT, from), t); };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// ── Vendor assets ──
const nm = 'node_modules';
copy(`${nm}/@fontsource-variable/lexend/files/lexend-latin-wght-normal.woff2`, 'public/assets/fonts/lexend-latin-wght-normal.woff2');
copy(`${nm}/@fontsource-variable/lexend/files/lexend-latin-ext-wght-normal.woff2`, 'public/assets/fonts/lexend-latin-ext-wght-normal.woff2');
copy(`${nm}/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2`, 'public/assets/fonts/inter-latin-wght-normal.woff2');
for (const w of [400, 700]) copy(`${nm}/@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-${w}-normal.woff2`, `public/assets/fonts/atkinson-hyperlegible-latin-${w}-normal.woff2`);
const ri = read(`${nm}/remixicon/fonts/remixicon.css`).replace(/src: url\("remixicon\.eot[\s\S]*?;\n/, 'src: url("remixicon.woff2") format("woff2");\n').replace(/^\s*src:.*remixicon\.eot\?#iefix.*$/m, '');
write('public/assets/vendor/remixicon/remixicon.css', ri.replace(/@font-face\s*{[^}]*}/, `@font-face{font-family:"remixicon";src:url("remixicon.woff2") format("woff2");font-display:block}`));
copy(`${nm}/remixicon/fonts/remixicon.woff2`, 'public/assets/vendor/remixicon/remixicon.woff2');
copy(`${nm}/leaflet/dist/leaflet.js`, 'public/assets/vendor/leaflet/leaflet.js');
copy(`${nm}/leaflet/dist/leaflet.css`, 'public/assets/vendor/leaflet/leaflet.css');
for (const img of ['marker-icon.png', 'marker-icon-2x.png', 'marker-shadow.png', 'layers.png', 'layers-2x.png']) copy(`${nm}/leaflet/dist/images/${img}`, `public/assets/vendor/leaflet/images/${img}`);
copy(`${nm}/chart.js/dist/chart.umd.min.js`, 'public/assets/vendor/chart.umd.min.js');
copy(`${nm}/html2pdf.js/dist/html2pdf.bundle.min.js`, 'public/assets/vendor/html2pdf.bundle.min.js');

// ── Pages ──
const logo = read('scripts/logo-inline.txt');
const header = read('site/partials/header.html').replace(/{{LOGO}}/g, logo);
const footer = read('site/partials/footer.html').replace(/{{LOGO}}/g, logo);

const ORG = {
  '@type': 'Organization', '@id': `${SITE}/#org`, name: 'Vertical Solar', legalName: 'Vertical Energy & Networks Ltd', url: SITE,
  logo: `${SITE}/assets/img/logo-mark.png`, foundingDate: '2017', email: 'Verticalenergy.ng@gmail.com',
  sameAs: ['https://www.facebook.com/share/1PF9JWuVoi/', 'https://www.instagram.com/verticalsolarnigeria/', 'https://www.linkedin.com/company/vertical-solar/', 'https://www.tiktok.com/@verticalsolar'],
  contactPoint: [{ '@type': 'ContactPoint', telephone: '+234-818-631-1330', contactType: 'sales', areaServed: 'NG', availableLanguage: ['English', 'Igbo', 'Hausa', 'Yoruba'] }],
};
const BRANCHES = [
  ['Vertical Solar — Lagos Head Office', '5 Agbonyin Street, Off Nnobi Street, By Adelabu, Surulere', 'Lagos', 'Lagos', '+2348186311330', 6.4969, 3.354],
  ['Vertical Solar — Abuja', 'Suite 65, Nandu Plaza, Ndola Crescent, Wuse Zone 5', 'Abuja', 'FCT', '+2348051523585', 9.0632, 7.4673],
  ['Vertical Solar — Port Harcourt', 'Gatehouse 2, Shop 5, BlueSteel Boulevard, Aba Road', 'Port Harcourt', 'Rivers', '+2347036234843', 4.8243, 7.0336],
  ['Vertical Solar — Kano', 'No. 1 Nassarawa Hospital Road, Off Audu Bako Way', 'Kano', 'Kano', '+2349164023564', 11.9888, 8.5311],
  ['Vertical Solar — Benin City', '28 Country Home Road, Oredo, Sapele Road by Ikpopan Junction', 'Benin City', 'Edo', '+2349035587024', 6.3176, 5.6145],
];
const LOCAL = BRANCHES.map(([name, street, city, region, tel, lat, lng], i) => ({
  '@type': ['LocalBusiness', 'HomeAndConstructionBusiness'], '@id': `${SITE}/#branch-${i + 1}`, name, parentOrganization: { '@id': `${SITE}/#org` },
  image: `${SITE}/images/site/team-installing-panels.webp`, telephone: tel, priceRange: '₦₦–₦₦₦₦', url: `${SITE}/contact`,
  address: { '@type': 'PostalAddress', streetAddress: street, addressLocality: city, addressRegion: region, addressCountry: 'NG' },
  geo: { '@type': 'GeoCoordinates', latitude: lat, longitude: lng },
  openingHoursSpecification: [
    { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], opens: '08:00', closes: '18:00' },
    { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: '09:00', closes: '15:00' }],
  areaServed: 'Nigeria', knowsAbout: ['Solar panel installation', 'Hybrid inverters', 'Lithium battery storage', 'Solar maintenance'],
}));

function page(file) {
  const raw = read(file);
  const m = raw.match(/^<!--\s*(\{[\s\S]*?\})\s*-->/);
  if (!m) throw new Error(`Missing front matter in ${file}`);
  const fm = JSON.parse(m[1]);
  let body = raw.slice(m[0].length).trim();
  // Optional photo beside the page title: "photo": ["/images/gen/name", "Alt text", "object-position"]
  if (fm.photo) {
    const [src, alt, pos] = fm.photo;
    body = body.replace(/<section class="page-hero">\s*<div class="wrap">([\s\S]*?)<\/div>\s*<\/section>/, (_, inner) =>
      `<section class="page-hero with-photo"><div class="wrap"><div class="page-hero-text">${inner}</div>` +
      `<figure class="page-hero-photo"><picture><source type="image/webp" srcset="${src}-768.webp 768w, ${src}-1536.webp 1536w" sizes="(max-width: 860px) 100vw, 46vw">` +
      `<img src="${src}-1536.webp" alt="${esc(alt)}" width="1536" height="1024" fetchpriority="high" decoding="async"${pos ? ` style="object-position:${pos}"` : ''}></picture></figure></div></section>`);
    if (!fm.image) fm.image = `${src}-1536.webp`;
  }
  const url = SITE + (fm.path === '/' ? '/' : fm.path);
  const og = fm.image ? (fm.image.startsWith('http') ? fm.image : SITE + fm.image) : `${SITE}/images/og-image.jpg`;
  const graph = [ORG, ...(fm.local ? LOCAL : []), ...(fm.ld || [])];
  if (fm.crumbs) graph.push({ '@type': 'BreadcrumbList', itemListElement: fm.crumbs.map(([n, p], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: SITE + p })) });
  const ld = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
  const html = `<!doctype html>
<html lang="en" data-theme="day" data-theme-mode="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fm.title)}</title>
<meta name="description" content="${esc(fm.description)}">
<meta name="robots" content="${fm.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="en-NG" href="${url}"><link rel="alternate" hreflang="x-default" href="${url}">
<meta name="theme-color" content="#144211" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#12102E" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="${fm.ogType || 'website'}"><meta property="og:site_name" content="Vertical Solar Nigeria"><meta property="og:locale" content="en_NG">
<meta property="og:title" content="${esc(fm.title)}"><meta property="og:description" content="${esc(fm.description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${og}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(fm.title)}"><meta name="twitter:description" content="${esc(fm.description)}"><meta name="twitter:image" content="${og}">
<meta name="geo.region" content="NG-LA"><meta name="geo.placename" content="Lagos">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/assets/img/favicon-32.png" sizes="32x32"><link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preload" href="/assets/fonts/lexend-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/vendor/remixicon/remixicon.css">
<link rel="stylesheet" href="/assets/css/site.css?v=${Date.now().toString(36)}">
${(fm.css || []).map((c) => `<link rel="stylesheet" href="${c}">`).join('\n')}
<script src="/assets/js/theme-init.js"></script>
<script type="application/ld+json">${ld}</script>
<script type="application/ld+json" id="page-ld">{}</script>
</head>
<body${fm.page ? ` data-page="${fm.page}"` : ''}${fm.hero ? ' class="has-hero"' : ''}>
${header}
<main id="main" tabindex="-1">
${body}
</main>
${footer}
${(fm.scripts || []).map((s) => `<script src="${s}" defer></script>`).join('\n')}
<script type="module" src="/assets/js/app.js?v=${Date.now().toString(36)}"></script>
</body>
</html>
`;
  const out = fm.out || (fm.path === '/' ? 'index.html' : fm.path.slice(1) + '.html');
  write('public/' + out, html);
  return { out, path: fm.path };
}

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) {
    const p = `${dir}/${f}`;
    if (fs.statSync(path.join(ROOT, p)).isDirectory()) walk(p);
    else if (f.endsWith('.html')) files.push(p);
  }
})('site/pages');
const built = files.map(page);
console.log(`Built ${built.length} pages:`, built.map((b) => b.out).join(', '));
