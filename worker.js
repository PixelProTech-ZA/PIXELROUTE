// RoadPulse API — Cloudflare Worker + D1. Stale data is never presented as live.
const PLACES = ["Pretoria","Johannesburg","Durban","Cape Town","Bloemfontein","Polokwane","Mbombela","Gqeberha","East London","Pietermaritzburg","Kimberley"];
const MODES = ["minibus", "bus", "air"];
const FARE_TTL = { minibus: 14 * 86400, bus: 86400, air: 3600 }; // seconds until a fare expires
const now = () => Math.floor(Date.now() / 1000);
const CONNECTORS = {
  // id -> async (env) => void. Register a connector ONLY once access/licensing is confirmed.
};
const cors = (env, req) => {
  const o = req.headers.get("Origin");
  return { "Access-Control-Allow-Origin": o && o === env.ALLOWED_ORIGIN ? o : "null",
    "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" };
};
const json = (d, s, h) => new Response(JSON.stringify(d), { status: s || 200, headers: { "Content-Type": "application/json", ...h } });
// best-effort per-isolate limiter (add a Cloudflare Rate Limiting rule for real protection)
const hits = new Map();
function limited(key, max, windowMs) {
  const t = Date.now(), a = (hits.get(key) || []).filter(x => t - x < windowMs); a.push(t); hits.set(key, a);
  if (hits.size > 5000) for (const k of hits.keys()) { if (hits.size <= 2500) break; hits.delete(k); }
  return a.length > max;
}
function safeEqual(a, b) { // constant-time, no platform-specific API
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}
async function readJson(req) { try { const b = await req.json(); return b && typeof b === "object" ? b : null; } catch { return null; } }
const effective = f => (f.expires_at < now() && f.status !== "UNAVAILABLE") ? { ...f, status: "STALE" } : f;
function withConflicts(rows) {
  const by = {}; rows.forEach(r => (by[r.operator.toLowerCase()] ||= []).push(r));
  return Object.values(by).flatMap(g => new Set(g.map(r => r.price_zar)).size > 1 ? g.map(r => ({ ...r, status: "DISPUTED" })) : g);
}
// enabled ≠ connected. A source is only OPERATIONAL after a real successful update inside its window.
function stateOf(s) {
  if (!CONNECTORS[s.id]) return s.id === "contrib" && s.enabled ? "CONFIGURED" : "NOT CONNECTED";
  if (!s.enabled) return "CONFIGURED";
  if (s.last_failure && (!s.last_success || s.last_failure > s.last_success)) return "FAILED";
  if (!s.last_success) return "CONNECTED";
  return now() - s.last_success <= 2 * s.interval_s ? "OPERATIONAL" : "STALE";
}
function validateFare(b) {
  const op = String(b.operator ?? "").trim(), src = String(b.source ?? "").trim(), price = Number(b.price_zar);
  if (!MODES.includes(b.mode)) return "Invalid transport mode.";
  if (!PLACES.includes(b.origin) || !PLACES.includes(b.destination)) return "Unknown place.";
  if (b.origin === b.destination) return "Origin and destination must differ.";
  if (op.length < 2 || op.length > 80) return "Operator is required (2–80 characters).";
  if (src.length < 3 || src.length > 200) return "Source is required (3–200 characters).";
  if (typeof b.price_zar === "boolean" || !Number.isFinite(price) || price <= 0 || price > 100000) return "Fare must be a number above 0 and up to R100 000.";
  return null;
}
export default {
  async fetch(req, env) {
    const h = cors(env, req), u = new URL(req.url), p = u.pathname;
    const ip = req.headers.get("CF-Connecting-IP") || "unknown";
    if (req.method === "OPTIONS") return new Response(null, { headers: h });
    try {
      if (p === "/api/health") {
        try { await env.DB.prepare("SELECT 1 AS ok").first(); return json({ ok: true, db: "connected", time: now() }, 200, h); }
        catch { return json({ ok: false, db: "error", time: now() }, 503, h); }
      }
      if (p === "/api/fares" && req.method === "GET") {
        const from = u.searchParams.get("from"), to = u.searchParams.get("to");
        if (!PLACES.includes(from) || !PLACES.includes(to) || from === to) return json({ error: "from and to must be two different known places" }, 400, h);
        const { results } = await env.DB.prepare("SELECT * FROM fares WHERE origin=?1 AND destination=?2 ORDER BY collected_at DESC LIMIT 200").bind(from, to).all();
        return json({ fares: withConflicts(results.map(effective)), as_of: now() }, 200, h);
      }
      if (p === "/api/sources" && req.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM sources").all();
        return json({ sources: results.map(s => ({ ...s, state: stateOf(s), age_s: s.last_success ? now() - s.last_success : null })), as_of: now() }, 200, h);
      }
      if (p === "/api/incidents" && req.method === "GET") {
        const { results } = await env.DB.prepare("SELECT * FROM incidents WHERE status!='CLEARED' ORDER BY reported_at DESC LIMIT 200").all();
        return json({ incidents: results, as_of: now(), note: results.length ? "" : "No incident feed is connected or none reported; absence is not proof the road is clear." }, 200, h);
      }
      if (req.method === "POST" && p.startsWith("/api/")) {
        if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN.length < 24) return json({ error: "admin API disabled: ADMIN_TOKEN is not set or too short" }, 503, h);
        if (limited("w:" + ip, 60, 60000)) return json({ error: "rate limited" }, 429, h);
        const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
        if (!bearer || !safeEqual(bearer, env.ADMIN_TOKEN)) {
          if (limited("a:" + ip, 10, 600000)) return json({ error: "too many failed attempts" }, 429, h);
          return json({ error: "unauthorised" }, 401, h);
        }
        if (p === "/api/fares") {
          const b = await readJson(req); if (!b) return json({ error: "invalid JSON body" }, 400, h);
          const err = validateFare(b); if (err) return json({ error: err }, 400, h);
          const op = b.operator.trim(), src = b.source.trim(), price = Number(b.price_zar);
          const dup = await env.DB.prepare("SELECT id FROM fares WHERE mode=?1 AND origin=?2 AND destination=?3 AND lower(operator)=lower(?4) AND price_zar=?5 AND lower(source)=lower(?6) AND expires_at>?7")
            .bind(b.mode, b.origin, b.destination, op, price, src, now()).first();
          if (dup) return json({ error: "Duplicate: this exact report already exists.", id: dup.id }, 409, h);
          const id = crypto.randomUUID(), t = now();
          await env.DB.batch([
            env.DB.prepare("INSERT INTO fares(id,mode,origin,destination,operator,price_zar,source,collected_at,expires_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)").bind(id, b.mode, b.origin, b.destination, op, price, src, t, t + FARE_TTL[b.mode]),
            env.DB.prepare("INSERT INTO fare_history VALUES(?1,?2,?3)").bind(id, price, t)]);
          return json({ id }, 201, h);
        }
        let m;
        if ((m = p.match(/^\/api\/fares\/([\w-]+)\/verify$/))) {
          const row = await env.DB.prepare("SELECT mode FROM fares WHERE id=?1").bind(m[1]).first();
          if (!row) return json({ error: "fare not found" }, 404, h);
          const t = now(); await env.DB.prepare("UPDATE fares SET status='VERIFIED', verified_at=?2, expires_at=?3 WHERE id=?1").bind(m[1], t, t + FARE_TTL[row.mode]).run();
          return json({ ok: true }, 200, h);
        }
        if ((m = p.match(/^\/api\/sources\/(\w+)\/toggle$/))) {
          const r = await env.DB.prepare("UPDATE sources SET enabled=1-enabled WHERE id=?1").bind(m[1]).run();
          if (!r.meta || !r.meta.changes) return json({ error: "source not found" }, 404, h);
          return json({ ok: true }, 200, h);
        }
      }
      return json({ error: "not found" }, 404, h);
    } catch (e) { return json({ error: "server error" }, 500, h); }
  },
  async scheduled(_e, env) {
    const { results } = await env.DB.prepare("SELECT * FROM sources WHERE enabled=1 AND interval_s>0").all();
    for (const s of results) {
      const fn = CONNECTORS[s.id];
      if (!fn || (s.last_success && now() - s.last_success < s.interval_s)) continue;
      try { await fn(env); await env.DB.prepare("UPDATE sources SET last_success=?2,last_error=NULL WHERE id=?1").bind(s.id, now()).run(); }
      catch (e) { await env.DB.prepare("UPDATE sources SET last_failure=?2,last_error=?3 WHERE id=?1").bind(s.id, now(), String(e).slice(0, 200)).run(); }
    }
  }
};
