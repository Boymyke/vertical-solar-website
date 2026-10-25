// Visitor analytics, geography and heatmaps for the CRM.
import { json } from '../lib/http.js';
import { requirePerm } from '../lib/auth.js';
import { num, clamp, str } from '../lib/util.js';

export function registerAnalytics(r) {
  r.get('/api/admin/analytics/overview', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'analytics');
    const days = clamp(num(new URL(req.url).searchParams.get('days'), 30), 1, 365);
    const since = `-${days} days`;
    const all = (sql) => env.DB.prepare(sql).bind(since).all().then((x) => x.results);
    const one = (sql) => env.DB.prepare(sql).bind(since).first();
    const W = "WHERE created_at >= datetime('now', ?)";
    const [totals, sessions, series, pages, referrers, countries, cities, devices, browsers, os, langs, leads, hours, utm] = await Promise.all([
      one(`SELECT COUNT(*) pageviews, COUNT(DISTINCT visitor_id) visitors, COUNT(DISTINCT session_id) sessions,
            ROUND(AVG(NULLIF(duration_s,0))) avg_duration, ROUND(AVG(max_scroll)) avg_scroll, SUM(is_new) new_visitors FROM pageviews ${W}`),
      one(`SELECT COUNT(*) total, SUM(CASE WHEN n=1 THEN 1 ELSE 0 END) single FROM (SELECT session_id, COUNT(*) n FROM pageviews ${W} GROUP BY session_id)`),
      all(`SELECT date(created_at) d, COUNT(*) views, COUNT(DISTINCT visitor_id) visitors FROM pageviews ${W} GROUP BY d ORDER BY d`),
      all(`SELECT path, COUNT(*) views, COUNT(DISTINCT visitor_id) visitors, ROUND(AVG(NULLIF(duration_s,0))) avg_time, ROUND(AVG(max_scroll)) avg_scroll FROM pageviews ${W} GROUP BY path ORDER BY views DESC LIMIT 25`),
      all(`SELECT CASE WHEN referrer IS NULL OR referrer='' THEN 'Direct' ELSE referrer END ref, COUNT(*) n FROM pageviews ${W} GROUP BY ref ORDER BY n DESC LIMIT 15`),
      all(`SELECT COALESCE(country,'??') country, COUNT(DISTINCT visitor_id) visitors, COUNT(*) views FROM pageviews ${W} GROUP BY country ORDER BY visitors DESC LIMIT 25`),
      all(`SELECT city, region, country, COUNT(DISTINCT visitor_id) visitors, ROUND(AVG(lat),3) lat, ROUND(AVG(lng),3) lng FROM pageviews ${W} AND city IS NOT NULL GROUP BY city, country ORDER BY visitors DESC LIMIT 200`),
      all(`SELECT device k, COUNT(DISTINCT visitor_id) n FROM pageviews ${W} GROUP BY device ORDER BY n DESC`),
      all(`SELECT browser k, COUNT(DISTINCT visitor_id) n FROM pageviews ${W} GROUP BY browser ORDER BY n DESC`),
      all(`SELECT os k, COUNT(DISTINCT visitor_id) n FROM pageviews ${W} GROUP BY os ORDER BY n DESC`),
      all(`SELECT COALESCE(lang,'en') k, COUNT(DISTINCT visitor_id) n FROM pageviews ${W} GROUP BY k ORDER BY n DESC`),
      all(`SELECT name k, COUNT(*) n FROM events ${W} AND name LIKE 'lead_%' GROUP BY name ORDER BY n DESC`),
      all(`SELECT CAST(strftime('%H', created_at, '+1 hour') AS INTEGER) h, COUNT(*) n FROM pageviews ${W} GROUP BY h ORDER BY h`),
      all(`SELECT COALESCE(utm_source,'(none)') k, COUNT(*) n FROM pageviews ${W} AND utm_source IS NOT NULL GROUP BY k ORDER BY n DESC LIMIT 10`),
    ]);
    const bounce = sessions.total ? Math.round((sessions.single / sessions.total) * 1000) / 10 : 0;
    const totalLeads = leads.reduce((s, x) => s + x.n, 0);
    return json({
      days, totals: { ...totals, bounce_rate: bounce, leads: totalLeads, conversion: totals.visitors ? Math.round((totalLeads / totals.visitors) * 1000) / 10 : 0 },
      series, pages, referrers, countries, cities, devices, browsers, os, langs, leads, hours, utm,
    });
  });

  r.get('/api/admin/analytics/live', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'analytics');
    const { results } = await env.DB.prepare(`SELECT path, city, country, device, created_at FROM pageviews WHERE created_at >= datetime('now','-5 minutes') ORDER BY id DESC LIMIT 50`).all();
    const v = await env.DB.prepare(`SELECT COUNT(DISTINCT visitor_id) n FROM pageviews WHERE created_at >= datetime('now','-5 minutes')`).first();
    return json({ active: v.n, items: results });
  });

  r.get('/api/admin/analytics/heatmap', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'analytics');
    const u = new URL(req.url);
    const path = str(u.searchParams.get('path'), 200) || '/';
    const device = ['mobile', 'tablet', 'desktop'].includes(u.searchParams.get('device')) ? u.searchParams.get('device') : 'desktop';
    const type = ['click', 'move', 'rage'].includes(u.searchParams.get('type')) ? u.searchParams.get('type') : 'click';
    const days = clamp(num(u.searchParams.get('days'), 30), 1, 365);
    const { results } = await env.DB.prepare(`SELECT x, y, doc_h, target FROM heat_events WHERE path=? AND device=? AND type=? AND created_at >= datetime('now', ?) ORDER BY id DESC LIMIT 20000`)
      .bind(path, device, type, `-${days} days`).all();
    const scroll = (await env.DB.prepare(`SELECT (max_scroll/10)*10 bucket, COUNT(*) n FROM pageviews WHERE path=? AND device=? AND created_at >= datetime('now', ?) GROUP BY bucket ORDER BY bucket`)
      .bind(path, device, `-${days} days`).all()).results;
    const targets = {};
    for (const e of results) if (e.target) targets[e.target] = (targets[e.target] || 0) + 1;
    const topTargets = Object.entries(targets).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([t, n]) => ({ target: t, n }));
    return json({ path, device, type, points: results.map((e) => [e.x, e.y]), count: results.length, scroll, topTargets });
  });

  r.get('/api/admin/analytics/heat-pages', async (req, env, _p, ctx) => {
    requirePerm(ctx.user, 'analytics');
    const { results } = await env.DB.prepare(`SELECT path, COUNT(*) n FROM heat_events WHERE created_at >= datetime('now','-90 days') GROUP BY path ORDER BY n DESC LIMIT 100`).all();
    return json({ items: results });
  });
}
