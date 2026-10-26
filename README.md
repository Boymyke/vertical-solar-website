# Vertical Solar — website, CRM & field app

The public website for **Vertical Solar (Vertical Energy & Networks Ltd)** and the CRM behind it, running as one Cloudflare Worker.

- **Website**: 27 pages, day/night hero (night switches the house lights on), homepage cost estimator, packages and detailed load calculator, projects, shop (switchable), blog, solar care guide, FAQ, three-step quote request with address search, support tickets, English / Igbo / Hausa / Yoruba, accessibility panel, AI assistant "Vola" (expandable, speaks and understands English, Pidgin, Yoruba, Igbo and Hausa).
- **CRM** at `/staff`: one administrator (the owner), everyone else is staff. Dashboard, customers & pipeline, follow-ups, quotation engine (link + PDF + online acceptance), installations with address search and clock-in zones, staff schedules with "starting soon" / "running late" reminders, staff profiles collected on first sign-in, on-site issue reports, attendance with geofenced clock-in, field app for technicians, inventory, shop orders, support tickets, maintenance & warranties, visitor analytics & heatmaps, chat inbox, AI sales assistant, email, website CMS (pop-up builder, policies, certificates, socials, testimonials, FAQs, packages, branches), blog, staff logins, settings, phone push alerts.

## Stack

| Piece | Used for |
| --- | --- |
| Cloudflare Workers + static assets | Website, API, server-rendered blog/project/product pages |
| D1 (`vertical-solar-db`) | All data |
| R2 (`vertical-solar-media`) | Uploaded images (blog, projects, testimonials, staff work photos) |
| Workers AI | Chatbot, speech-to-text, CRM sales assistant |
| Cron triggers | Schedule reminders and late alerts, geofence "lost contact" checks (every 10 min), daily follow-ups / warranty / stock digest |
| Web Push (VAPID) | Reminders and urgent alerts on staff phones, even with the app closed (keys are created automatically) |
| Photon (OpenStreetMap) | Address search for forms, limited to Nigeria and cached at the edge |

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
5. Open `/staff` and complete first-time setup with the one-time setup code you were given. The code is deleted once the owner account exists.

### Optional secrets

Worker → **Settings → Variables and Secrets** → add as *Secret*:

| Secret | Turns on |
| --- | --- |
| `RESEND_API_KEY` | Sending email from the CRM and the daily digest ([resend.com](https://resend.com)) |
| `PAYSTACK_SECRET_KEY` | Verifying online card payments in the shop ([paystack.com](https://paystack.com)) |
| `TURNSTILE_SECRET` | Spam protection on forms (pair with the site key in CRM → Settings → Integrations) |
| `SPITCH_API_KEY` | Natural Nigerian voices (English, Yoruba, Igbo, Hausa) and Nigerian-language voice input for Vola ([spitch.app](https://spitch.app)). Without it the browser's own voices are used |
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
node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8').split('\n').map(l=>l.replace(/\s\/\/.*$/,'')).filter(l=>!l.trim().startsWith('//')).join('\n'));delete c.ai;c.vars.SITE_URL='http://127.0.0.1:8787';fs.writeFileSync('wrangler.dev.json',JSON.stringify(c,null,2))"
```

## Project layout

```
site/pages/        page sources (front-matter + body) → built into public/
site/partials/     header and footer
public/            built website, assets, admin app (served as static assets)
public/staff/      CRM single-page app (views in assets/views/)
src/index.js       Worker entry, routing, security headers
src/routes/        public, auth, admin, field, analytics, ai, seo
src/lib/           http, auth/permissions, settings, generic CRUD, utilities
src/cron.js        scheduled jobs
migrations/        D1 schema (0001), starter content (0002), translation cache (0003), staff schedules/profiles/issues/push/policies (0004)
scripts/           page builder, seed generator, logo builder
```

Edit pages in `site/pages`, not `public/`, then run `npm run build`.

## Security notes

- Passwords: PBKDF2-SHA256 (100k iterations); sessions are random tokens stored hashed; HttpOnly SameSite cookies.
- Login lockout after repeated failures, per-IP rate limits on public forms and the chatbot, honeypot fields, optional Turnstile.
- Same-origin check on every private API call; per-module permissions enforced on the server; audit log.
- Strict Content-Security-Policy (no inline scripts), HSTS, frame and MIME protections in `public/_headers` and the Worker.
- Uploads are checked by file signature (JPEG/PNG/WebP/GIF/PDF only), rich text is sanitised.
- Visitor analytics always run but store no IP addresses, set no cookies and cannot identify a person. Google Analytics (optional) only loads after the visitor agrees.
- Push subscriptions are accepted only for real browser push services; pushes carry no data.
- Policy pages edited in the CRM are sanitised before they are served.

Manuals: [`docs/Vertical-Solar-Admin-Manual.pdf`](docs/Vertical-Solar-Admin-Manual.pdf) for the administrator and [`docs/Vertical-Solar-Staff-Manual.pdf`](docs/Vertical-Solar-Staff-Manual.pdf) for staff. The sales playbook for pitching the platform is in [`docs/Vertical-Solar-Sales-Playbook.pdf`](docs/Vertical-Solar-Sales-Playbook.pdf).
