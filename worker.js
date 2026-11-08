// RoadPulse API — Cloudflare Worker + D1. Stale data is never presented as live.
const FARE_TTL = { minibus: 14*864e2, bus: 864e2, air: 36e2 }; // seconds until a fare expires
const now = () => Math.floor(Date.now()/1000);
const CONNECTORS = {
  // id -> async (env) => void. Add one only once access/licensing is confirmed. Example shape:
  // sanral: async (env) => { /* fetch licensed feed, upsert into incidents with source+timestamps */ },
};
const cors = (env, req) => {
  const o = req.headers.get("Origin");
  return { "Access-Control-Allow-Origin": o && o === env.ALLOWED_ORIGIN ? o : "null",
    "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Vary": "Origin" };
};
const json = (d, s, h) => new Response(JSON.stringify(d), { status: s||200, headers: { "Content-Type": "application/json", ...h } });
async function isAdmin(req, env) {
  const t = (req.headers.get("Authorization")||"").replace(/^Bearer /,"");
  if (!env.ADMIN_TOKEN || !t) return false;
  const enc = new TextEncoder(), a = enc.encode(t), b = enc.encode(env.ADMIN_TOKEN);
  return a.length === b.length && crypto.subtle.timingSafeEqual(a, b);
}
// Effective status: expiry is applied on read, so nothing silently stays VERIFIED.
const effective = f => (f.expires_at < now() && f.status !== "UNAVAILABLE") ? { ...f, status: "STALE" } : f;
function withConflicts(rows) {
  const by = {};
  rows.forEach(r => (by[r.operator.toLowerCase()] ||= []).push(r));
  return Object.values(by).flatMap(g => {
    const prices = new Set(g.map(r => r.price_zar));
    return prices.size > 1 ? g.map(r => ({ ...r, status: "DISPUTED" })) : g;
  });
}
export default {
  async fetch(req, env) {
    const h = cors(env, req), u = new URL(req.url), p = u.pathname;
    if (req.method === "OPTIONS") return new Response(null, { headers: h });
    try {
      if (p === "/api/health") return json({ ok: true, time: now() }, 200, h);
      if (p === "/api/fares" && req.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM fares WHERE origin=?1 AND destination=?2 ORDER BY collected_at DESC").bind(u.searchParams.get("from"), u.searchParams.get("to")).all();
        return json({ fares: withConflicts(results.map(effective)), as_of: now() }, 200, h);
      }
      if (p === "/api/sources" && req.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM sources").all();
        return json({ sources: results.map(s => ({ ...s, age_s: s.last_success ? now()-s.last_success : null })), as_of: now() }, 200, h);
      }
      if (p === "/api/incidents" && req.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM incidents WHERE status!='CLEARED' ORDER BY reported_at DESC LIMIT 200").all();
        return json({ incidents: results, as_of: now(), note: results.length ? "" : "No incident feed connected or none reported; absence is not proof the road is clear." }, 200, h);
      }
      // ---- admin only ----
      if (req.method === "POST" && p.startsWith("/api/")) {
        if (!(await isAdmin(req, env))) return json({ error: "unauthorised" }, 401, h);
        if (p === "/api/fares") {
          const b = await req.json();
          if (!b.mode || !b.origin || !b.destination || !b.operator || !(b.price_zar > 0) || !b.source) return json({ error: "missing or invalid fields" }, 400, h);
          const id = crypto.randomUUID(), t = now();
          await env.DB.batch([
            env.DB.prepare("INSERT INTO fares(id,mode,origin,destination,operator,price_zar,source,collected_at,expires_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)").bind(id,b.mode,b.origin,b.destination,b.operator,b.price_zar,b.source,t,t+(FARE_TTL[b.mode]||864e2)),
            env.DB.prepare("INSERT INTO fare_history VALUES(?1,?2,?3)").bind(id,b.price_zar,t)]);
          return json({ id }, 201, h);
        }
        let m;
        if ((m = p.match(/^\/api\/fares\/([\w-]+)\/verify$/))) {
          const t = now(); await env.DB.prepare("UPDATE fares SET status='VERIFIED', verified_at=?2, expires_at=?3 WHERE id=?1").bind(m[1], t, t+864e2*7).run();
          return json({ ok: true }, 200, h);
        }
        if ((m = p.match(/^\/api\/sources\/(\w+)\/toggle$/))) {
          await env.DB.prepare("UPDATE sources SET enabled=1-enabled WHERE id=?1").bind(m[1]).run();
          return json({ ok: true }, 200, h);
        }
      }
      return json({ error: "not found" }, 404, h);
    } catch (e) { return json({ error: "server error" }, 500, h); }
  },
  // Cron: run due connectors with failure tracking. Last good data is kept with its original timestamp.
  async scheduled(_e, env) {
    const { results } = await env.DB.prepare("SELECT * FROM sources WHERE enabled=1 AND interval_s>0").all();
    for (const s of results) {
      const fn = CONNECTORS[s.id];
      if (!fn || (s.last_success && now()-s.last_success < s.interval_s)) continue;
      try { await fn(env); await env.DB.prepare("UPDATE sources SET last_success=?2,last_error=NULL WHERE id=?1").bind(s.id, now()).run(); }
      catch (e) { await env.DB.prepare("UPDATE sources SET last_failure=?2,last_error=?3 WHERE id=?1").bind(s.id, now(), String(e).slice(0,200)).run(); }
    }
  }
};
