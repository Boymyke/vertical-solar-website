// Vertical Solar — Cloudflare Worker entry point.
import { Router, HttpError, json, withSecurityHeaders } from './lib/http.js';
import { getSessionUser } from './lib/auth.js';
import { registerPublic } from './routes/public.js';
import { registerAI } from './routes/ai.js';
import { registerAuth } from './routes/auth.js';
import { registerAdmin } from './routes/admin.js';
import { registerField } from './routes/field.js';
import { registerAnalytics } from './routes/analytics.js';
import { registerSeo } from './routes/seo.js';
import { registerStaff } from './routes/staff.js';
import { everyTenMinutes, daily } from './cron.js';

const router = new Router();
registerPublic(router);
registerAI(router);
registerAuth(router);
registerAdmin(router);
registerField(router);
registerAnalytics(router);
registerSeo(router);
registerStaff(router);

const PRIVATE_API = /^\/api\/(admin|field|auth)\//;

function sameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return req.headers.get('sec-fetch-site') !== 'cross-site';
  return new URL(origin).host === new URL(req.url).host;
}

async function serveAdminShell(req, env) {
  const res = await env.ASSETS.fetch(new Request(new URL('/admin/app', req.url)));
  const out = new Response(res.body, res);
  out.headers.set('x-robots-tag', 'noindex, nofollow');
  out.headers.set('cache-control', 'no-cache');
  return out;
}

async function handle(req, env, ctx) {
  const url = new URL(req.url);
  const path = url.pathname;

  // Canonical host: redirect www → apex when served on the custom domain.
  if (url.hostname.startsWith('www.') && env.SITE_URL && new URL(env.SITE_URL).hostname === url.hostname.slice(4)) {
    return Response.redirect(env.SITE_URL + path + url.search, 301);
  }

  if (path === '/admin' || (path.startsWith('/admin/') && !path.startsWith('/admin/assets/'))) {
    if (path === '/admin/app' || path === '/admin/app.html') return serveAdminShell(req, env);
    if (/\.[a-z0-9]{2,5}$/i.test(path)) return env.ASSETS.fetch(req);
    return serveAdminShell(req, env);
  }

  const c = { user: null };
  if (PRIVATE_API.test(path)) {
    if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) throw new HttpError(403, 'Cross-site request blocked');
    c.user = await getSessionUser(env, req);
    if (c.user?.must_change_password && !['/api/auth/me', '/api/auth/password', '/api/auth/logout'].includes(path) && path.startsWith('/api/admin')) {
      throw new HttpError(428, 'Please set a new password before continuing');
    }
  }

  const m = router.match(req.method, path);
  if (!m) {
    if (path.startsWith('/api/')) throw new HttpError(404, 'Endpoint not found');
    return env.ASSETS.fetch(req);
  }
  if (m.methodNotAllowed) throw new HttpError(405, 'Method not allowed');
  env.ctx = ctx;
  return m.handler(req, env, m.params, c, router);
}

export default {
  async fetch(req, env, ctx) {
    let res;
    try {
      res = await handle(req, env, ctx);
    } catch (e) {
      if (e instanceof HttpError) res = json({ ok: false, error: e.message, ...(e.extra || {}) }, e.status);
      else {
        console.error('Unhandled error', e?.stack || e);
        res = json({ ok: false, error: 'Something went wrong on our side. Please try again.' }, 500);
      }
    }
    return withSecurityHeaders(res);
  },

  async scheduled(event, env, ctx) {
    if (event.cron === '0 6 * * *') ctx.waitUntil(daily(env));
    else ctx.waitUntil(everyTenMinutes(env));
  },
};
