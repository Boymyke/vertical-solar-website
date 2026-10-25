// Company settings & public site data shared by the website, SEO renderer and AI assistant.
import { parseJSON } from './util.js';

export const DEFAULT_SETTINGS = {
  company: {
    name: 'Vertical Solar',
    legal_name: 'Vertical Energy & Networks Ltd',
    tagline: 'Clean, reliable solar power for Nigerian homes and businesses',
    founded: 2017,
    email: 'Verticalenergy.ng@gmail.com',
    phones: ['08186311330', '07036234843', '08162310111'],
    whatsapp: '2348186311330',
    address: '5 Agbonyin Street, Off Nnobi Street, By Adelabu, Surulere, Lagos',
    hours: 'Mon–Fri 8:00am–6:00pm · Sat 9:00am–3:00pm',
    rc_number: '',
  },
  stats: [
    { value: 10, suffix: '+', label: 'Years of experience' },
    { value: 500, suffix: '+', label: 'Installations completed' },
    { value: 98, suffix: '%', label: 'Client satisfaction' },
    { value: 24, suffix: '/7', label: 'Support & monitoring' },
  ],
  hero: {
    eyebrow: 'Solar · Inverters · Lithium storage',
    headline: 'Power that rises with the sun and stays on after it sets.',
    subheadline: 'Solar, inverter and lithium battery systems for Nigerian homes, businesses and industry. Sized from a real load audit, installed by our own engineers, and looked after for years.',
    video_url: '',
    poster: '/images/site/team-installing-panels.webp',
  },
  shop: {
    enabled: true,
    currency: 'NGN',
    delivery_note: 'Delivery fee is confirmed after checkout based on your location. Free installation applies to complete systems only.',
    delivery_fee: 0,
    paystack_public_key: '',
    bank_details: '',
    checkout_mode: 'request', // request | paystack
  },
  features: {
    chat_enabled: true,
    voice_enabled: true,
    testimonials_enabled: true,
    blog_enabled: true,
    languages: ['en', 'ig', 'ha', 'yo'],
  },
  seo: {
    title: 'Vertical Solar Nigeria | Solar Installation, Inverters & Lithium Batteries',
    description: 'Solar panel installation, hybrid inverters and lithium battery backup for homes and businesses in Lagos, Abuja, Port Harcourt, Kano and Benin. Free load audit and flexible solar financing.',
    keywords: 'solar installation Nigeria, solar company Lagos, inverter installation Lagos, lithium battery Nigeria, solar panels Abuja, solar Port Harcourt, solar Kano, solar Benin City, solar financing Nigeria',
    og_image: '/images/og-image.jpg',
    google_site_verification: '',
    ga4_id: '',
  },
  ai: {
    assistant_name: 'Sola',
    greeting: "Hi, I'm Sola, Vertical Solar's assistant. Ask me about solar packages, pricing, financing or caring for your system.",
    extra_knowledge: '',
  },
  integrations: {
    turnstile_site_key: '',
    email_from_name: 'Vertical Solar',
    email_from: '',
    notify_emails: '',
  },
  videos: [],
  financing: {
    headline: 'Power-as-a-Product (PaaP)',
    summary: 'Spread the cost of your solar system into manageable monthly payments. Pay in full and enjoy a discount, or start with a deposit and pay over time.',
  },
};

export async function getSettings(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all();
  const s = structuredClone(DEFAULT_SETTINGS);
  for (const r of results || []) {
    const v = parseJSON(r.value, null);
    if (v == null) continue;
    if (s[r.key] && typeof s[r.key] === 'object' && !Array.isArray(s[r.key]) && typeof v === 'object' && !Array.isArray(v)) {
      s[r.key] = { ...s[r.key], ...v };
    } else s[r.key] = v;
  }
  return s;
}

export async function getPublicSite(env) {
  const [settings, branches, socials, certificates, popups, packages] = await Promise.all([
    getSettings(env),
    env.DB.prepare('SELECT id,name,state,address,phones,email,hours,lat,lng,is_hq FROM branches ORDER BY is_hq DESC, sort, id').all(),
    env.DB.prepare('SELECT platform,icon,url FROM socials WHERE active=1 ORDER BY sort, id').all(),
    env.DB.prepare('SELECT id,title,issuer,image,link,issued_at FROM certificates WHERE published=1 ORDER BY sort, id').all(),
    env.DB.prepare(`SELECT id,title,body,image,cta_text,cta_url,style,pages,trigger,delay_seconds,frequency FROM popups
       WHERE active=1 AND (starts_at IS NULL OR starts_at='' OR starts_at <= datetime('now'))
       AND (ends_at IS NULL OR ends_at='' OR ends_at >= datetime('now')) ORDER BY id DESC`).all(),
    env.DB.prepare('SELECT * FROM packages WHERE published=1 ORDER BY sort, id').all(),
  ]);
  const { integrations, ...rest } = settings;
  return {
    ...rest,
    integrations: { turnstile_site_key: integrations.turnstile_site_key },
    shop: { ...settings.shop, bank_details: settings.shop.bank_details },
    branches: (branches.results || []).map((b) => ({ ...b, phones: parseJSON(b.phones, []) })),
    socials: socials.results || [],
    certificates: certificates.results || [],
    popups: popups.results || [],
    packages: packages.results || [],
  };
}

// Pages the AI assistant may link to.
export const SITE_PAGES = [
  ['/', 'Home'],
  ['/about', 'About Vertical Solar'],
  ['/solutions/residential', 'Home (residential) solar'],
  ['/solutions/commercial', 'Commercial solar for offices, shops, hotels, schools, hospitals'],
  ['/solutions/industrial', 'Industrial & large-scale hybrid power'],
  ['/packages', 'Solar packages & prices + load calculator'],
  ['/financing', 'Solar financing — Power-as-a-Product (pay monthly)'],
  ['/projects', 'Completed projects / case studies'],
  ['/shop', 'Online shop for panels, inverters, batteries'],
  ['/solar-care', 'How to care for your solar system'],
  ['/blog', 'Solar guides & news'],
  ['/testimonials', 'Customer reviews'],
  ['/faq', 'Frequently asked questions'],
  ['/get-quote', 'Request a free quote / site survey'],
  ['/support', 'Report a fault / open a support ticket'],
  ['/contact', 'Contact us & branch locations'],
];
