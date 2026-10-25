// Generic, permission-checked CRUD endpoints for admin resources.
import { ok, json, fail, readJson } from './http.js';
import { requirePerm, audit } from './auth.js';
import { str, num, bool, parseJSON, sanitizeHtml, now, clamp } from './util.js';

// Field spec: 'str' | 'str:N' | 'text' | 'html' | 'num' | 'int' | 'bool' | 'json' | 'date'
export function coerce(type, v) {
  const [t, n] = String(type).split(':');
  if (v === undefined) return undefined;
  switch (t) {
    case 'str': return str(v, Number(n) || 255);
    case 'text': return str(v, Number(n) || 20000);
    case 'html': return v == null ? null : sanitizeHtml(String(v).slice(0, 200000));
    case 'num': return num(v, null);
    case 'int': return v === '' || v == null ? null : Math.round(num(v, 0));
    case 'bool': return bool(v);
    case 'json': return v == null ? null : JSON.stringify(typeof v === 'string' ? parseJSON(v, v) : v);
    case 'date': return v ? String(v).replace('T', ' ').slice(0, 19) : null;
    default: return v;
  }
}

export function pickFields(fields, body) {
  const out = {};
  for (const [k, type] of Object.entries(fields)) {
    if (k in body) out[k] = coerce(type, body[k]);
  }
  return out;
}

export function inflate(row, jsonFields = []) {
  if (!row) return row;
  for (const f of jsonFields) if (f in row) row[f] = parseJSON(row[f], f.endsWith('s') || f === 'items' || f === 'evidence' ? [] : {});
  return row;
}

export function crud(r, cfg) {
  const {
    name, table, perm, fields, json: jsonFields = [], search = [], filters = [], order = 'id DESC',
    select = '*', from = table, readPerm = perm, required = [], beforeSave, afterSave, beforeDelete, hasUpdatedAt = true,
    canDelete = true, listHook, getExtra,
  } = cfg;
  const perms = Array.isArray(perm) ? perm : [perm];
  const rperms = Array.isArray(readPerm) ? readPerm : [readPerm];
  const base = `/api/admin/${name}`;

  r.get(base, async (req, env, _p, ctx) => {
    requirePerm(ctx.user, ...rperms);
    const u = new URL(req.url);
    const page = clamp(num(u.searchParams.get('page'), 1), 1, 10000);
    const per = clamp(num(u.searchParams.get('per'), 25), 1, 500);
    const where = [];
    const args = [];
    const q = str(u.searchParams.get('q'), 100);
    if (q && search.length) {
      where.push('(' + search.map((s) => `${s} LIKE ?`).join(' OR ') + ')');
      search.forEach(() => args.push(`%${q}%`));
    }
    for (const f of filters) {
      const v = u.searchParams.get(f.split('.').pop());
      if (v !== null && v !== '') { where.push(`${f} = ?`); args.push(v); }
    }
    if (listHook) listHook(u, where, args, ctx);
    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const sort = u.searchParams.get('sort');
    const orderBy = sort && /^[a-z_.]+( (asc|desc))?$/i.test(sort) ? sort : order;
    const total = await env.DB.prepare(`SELECT COUNT(*) AS c FROM ${from} ${w}`).bind(...args).first();
    const { results } = await env.DB.prepare(`SELECT ${select} FROM ${from} ${w} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .bind(...args, per, (page - 1) * per).all();
    return json({ items: results.map((x) => inflate(x, jsonFields)), total: total.c, page, pages: Math.max(1, Math.ceil(total.c / per)) });
  });

  r.get(`${base}/:id`, async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, ...rperms);
    const row = await env.DB.prepare(`SELECT ${table}.*${getExtra ? ', ' + getExtra : ''} FROM ${from} WHERE ${table}.id = ?`).bind(id).first();
    if (!row) fail(404, 'Not found');
    return json(inflate(row, jsonFields));
  });

  r.post(base, async (req, env, _p, ctx) => {
    requirePerm(ctx.user, ...perms);
    const body = await readJson(req);
    let data = pickFields(fields, body);
    for (const k of required) if (data[k] == null || data[k] === '') fail(400, `${k.replace(/_/g, ' ')} is required`);
    if (beforeSave) data = (await beforeSave(data, { env, req, ctx, body, existing: null })) || data;
    const keys = Object.keys(data);
    if (!keys.length) fail(400, 'Nothing to save');
    const row = await env.DB.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')}) RETURNING *`)
      .bind(...keys.map((k) => data[k])).first();
    if (afterSave) await afterSave(row, { env, req, ctx, body, created: true });
    await audit(env, req, ctx.user, 'create', table, row.id);
    return ok({ item: inflate(row, jsonFields) });
  });

  r.put(`${base}/:id`, async (req, env, { id }, ctx) => {
    requirePerm(ctx.user, ...perms);
    const existing = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
    if (!existing) fail(404, 'Not found');
    const body = await readJson(req);
    let data = pickFields(fields, body);
    if (beforeSave) data = (await beforeSave(data, { env, req, ctx, body, existing })) || data;
    if (hasUpdatedAt) data.updated_at = now();
    const keys = Object.keys(data);
    if (!keys.length) return ok({ item: inflate(existing, jsonFields) });
    const row = await env.DB.prepare(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? RETURNING *`)
      .bind(...keys.map((k) => data[k]), id).first();
    if (afterSave) await afterSave(row, { env, req, ctx, body, created: false, existing });
    await audit(env, req, ctx.user, 'update', table, id, { fields: keys });
    return ok({ item: inflate(row, jsonFields) });
  });

  if (canDelete) {
    r.delete(`${base}/:id`, async (req, env, { id }, ctx) => {
      requirePerm(ctx.user, ...perms);
      const existing = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
      if (!existing) fail(404, 'Not found');
      if (beforeDelete) await beforeDelete(existing, { env, req, ctx });
      await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
      await audit(env, req, ctx.user, 'delete', table, id, { name: existing.name || existing.title || existing.number || null });
      return ok();
    });
  }
}
