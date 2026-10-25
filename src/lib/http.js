// Small HTTP helpers + router for the Worker.

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

export const ok = (data = {}) => json({ ok: true, ...data });

export const fail = (status, message, extra) => {
  throw new HttpError(status, message, extra);
};

export async function readJson(req, maxBytes = 512 * 1024) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > maxBytes) fail(413, 'Request too large');
  const text = await req.text();
  if (text.length > maxBytes) fail(413, 'Request too large');
  if (!text) return {};
  try {
    const data = JSON.parse(text);
    if (data === null || typeof data !== 'object') fail(400, 'Invalid JSON body');
    return data;
  } catch {
    fail(400, 'Invalid JSON body');
  }
}

export function clientIp(req) {
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '0.0.0.0';
}

export class Router {
  constructor() { this.routes = []; }
  on(method, pattern, handler) {
    const keys = [];
    const re = new RegExp(
      '^' + pattern.replace(/\/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }).replace(/\*$/, '.*') + '/?$'
    );
    this.routes.push({ method, re, keys, handler });
    return this;
  }
  get(p, h) { return this.on('GET', p, h); }
  post(p, h) { return this.on('POST', p, h); }
  put(p, h) { return this.on('PUT', p, h); }
  patch(p, h) { return this.on('PATCH', p, h); }
  delete(p, h) { return this.on('DELETE', p, h); }
  match(method, path) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = path.match(r.re);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { handler: r.handler, params };
    }
    return pathMatched ? { methodNotAllowed: true } : null;
  }
}

// Security headers applied to every dynamic response (static files get the same via public/_headers).
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://js.paystack.co https://challenges.cloudflare.com https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com",
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https://api.paystack.co https://www.google-analytics.com https://region1.google-analytics.com",
  "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://checkout.paystack.com https://challenges.cloudflare.com https://www.google.com https://www.tiktok.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

export function withSecurityHeaders(res, { html = false } = {}) {
  const r = new Response(res.body, res);
  const h = r.headers;
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-Frame-Options', 'SAMEORIGIN');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  h.set('Permissions-Policy', 'geolocation=(self), microphone=(self), camera=(self), payment=(self), interest-cohort=()');
  h.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (html || (h.get('content-type') || '').includes('text/html')) h.set('Content-Security-Policy', CSP);
  return r;
}
