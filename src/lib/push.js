// Web Push (VAPID) without payloads: the phone is woken up, and the service worker fetches the newest
// notification for the signed-in person. Nothing personal travels through the push service.
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));

export async function vapidKeys(env) {
  const row = await env.DB.prepare("SELECT value FROM secrets WHERE key='vapid'").first();
  if (row) return JSON.parse(row.value);
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const value = { publicKey: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), privateJwk: await crypto.subtle.exportKey('jwk', kp.privateKey) };
  await env.DB.prepare("INSERT OR IGNORE INTO secrets (key, value) VALUES ('vapid', ?)").bind(JSON.stringify(value)).run();
  const again = await env.DB.prepare("SELECT value FROM secrets WHERE key='vapid'").first();
  return JSON.parse(again.value);
}

async function vapidHeader(env, endpoint, keys) {
  const aud = new URL(endpoint).origin;
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: `mailto:${env.PUSH_CONTACT || 'noreply@verticalsolar.com.ng'}` })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  return `vapid t=${unsigned}.${b64u(sig)}, k=${keys.publicKey}`;
}

// Wake every device of the given users. Expired subscriptions are removed.
export async function pushToUsers(env, userIds, { urgent = false } = {}) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return;
  const { results } = await env.DB.prepare(`SELECT id, endpoint FROM push_subscriptions WHERE user_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
  if (!results.length) return;
  const keys = await vapidKeys(env);
  await Promise.all(results.map(async (s) => {
    try {
      const r = await fetch(s.endpoint, { method: 'POST', headers: { authorization: await vapidHeader(env, s.endpoint, keys), ttl: '86400', urgency: urgent ? 'high' : 'normal', 'content-length': '0' } });
      if (r.status === 404 || r.status === 410) await env.DB.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(s.id).run();
    } catch (e) { console.error('push failed', e?.message); }
  }));
}

// Who should hear about a notification: one person, or everyone with access to the module.
export async function recipients(env, { userId, module }) {
  if (userId) return [userId];
  const { results } = await env.DB.prepare("SELECT id, role, permissions FROM users WHERE active=1").all();
  return results.filter((u) => u.role === 'owner' || !module || (JSON.parse(u.permissions || '[]')).includes(module)).map((u) => u.id);
}
