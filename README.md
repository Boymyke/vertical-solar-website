# Vertical Solar — website, CRM & field app

The public website for **Vertical Solar (Vertical Energy & Networks Ltd)** and the CRM behind it, running as one Cloudflare Worker.

- **Website**: 27 pages, live day/night sky hero, packages and load calculator, projects, shop (switchable), blog, solar care guide, FAQ, quote request, support tickets, English / Igbo / Hausa / Yoruba, accessibility panel, AI assistant "Sola" with voice.
- **CRM** at `/admin`: dashboard, customers & pipeline, follow-ups, quotation engine (link + PDF), installations, attendance with geofenced clock-in, field app for technicians, inventory, shop orders, support tickets, maintenance & warranties, analytics & heatmaps, chat inbox, AI sales assistant, email, website CMS (popups, certificates, socials, testimonials, FAQs, packages, branches), blog, users & permissions, settings.

## Stack

| Piece | Used for |
| --- | --- |
| Cloudflare Workers + static assets | Website, API, server-rendered blog/project/product pages |
| D1 (`vertical-solar-db`) | All data |
| R2 (`vertical-solar-media`) | Uploaded images (blog, projects, testimonials, staff work photos) |
| Workers AI | Chatbot, speech-to-text, CRM sales assistant |
| Cron triggers | Geofence "lost contact" checks (every 10 min), daily follow-ups / warranty / stock digest |

No front-end framework: plain HTML, CSS and ES modules, so there is nothing to compile except the page builder.

## Deploying (Cloudflare dashboard, no terminal needed)

The D1 database and R2 bucket already exist in the Cloudflare account and the database is migrated and seeded.

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository** → choose `Boymyke/vertical-solar-website`.
2. Settings:
   - Project name: `vertical-solar` (must match `name` in `wrangler.jsonc`)
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Root directory: `/`
3. Deploy. Every push to `main` redeploys automatically.
4. Worker → **Settings → Domains & Routes** → add `verticalsolar.com.ng` and `www.verticalsolar.com.ng` (the domain's DNS must be on Cloudflare).
5. Open `/admin` and complete first-time setup with the one-time setup code you were given. The code is deleted once the owner account exists.

### Optional secrets

Worker → **Settings → Variables and Secrets** → add as *Secret*:

| Secret | Turns on |
| --- | --- |
| `RESEND_API_KEY` | Sending email from the CRM and the daily digest ([resend.com](https://resend.com)) |
| `PAYSTACK_SECRET_KEY` | Verifying online card payments in the shop ([paystack.com](https://paystack.com)) |
| `TURNSTILE_SECRET` | Spam protection on forms (pair with the site key in CRM → Settings → Integrations) |
| `SETUP_KEY` | Alternative setup code, only needed if the one-time code is lost before setup |

Never paste secret keys into the CRM — only public keys (Paystack `pk_…`, Turnstile site key) go there.

## Local development

```bash
npm install
node scripts/build.mjs                      # builds public/ from site/pages + partials
npx wrangler d1 migrations apply vertical-solar-db --local
npx wrangler dev -c wrangler.dev.json       # local config without the remote AI binding
```

`wrangler.dev.json` is generated from `wrangler.jsonc` with the `ai` binding removed (the chatbot answers with a polite fallback locally). Create it with:

```bash
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8').split('\n').filter(l=>!l.trim().startsWith('//')).join('\n'));delete c.ai;c.vars.SITE_URL='http://127.0.0.1:8787';fs.writeFileSync('wrangler.dev.json',JSON.stringify(c,null,2))"
```

## Project layout

```
site/pages/        page sources (front-matter + body) → built into public/
site/partials/     header and footer
public/            built website, assets, admin app (served as static assets)
public/admin/      CRM single-page app (views in assets/views/)
src/index.js       Worker entry, routing, security headers
src/routes/        public, auth, admin, field, analytics, ai, seo
src/lib/           http, auth/permissions, settings, generic CRUD, utilities
src/cron.js        scheduled jobs
migrations/        D1 schema (0001) and starter content (0002)
scripts/           page builder, seed generator, logo builder
```

Edit pages in `site/pages`, not `public/`, then run `npm run build`.

## Security notes

- Passwords: PBKDF2-SHA256 (100k iterations); sessions are random tokens stored hashed; HttpOnly SameSite cookies.
- Login lockout after repeated failures, per-IP rate limits on public forms and the chatbot, honeypot fields, optional Turnstile.
- Same-origin check on every private API call; per-module permissions enforced on the server; audit log.
- Strict Content-Security-Policy (no inline scripts), HSTS, frame and MIME protections in `public/_headers` and the Worker.
- Uploads are checked by file signature (JPEG/PNG/WebP/GIF/PDF only), rich text is sanitised.
- Visitor analytics store no IP addresses and set no cookies; visitors can opt out on the privacy page.
