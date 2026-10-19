// Watcher HTTP server: the web UI, a JSON API, a live event stream (SSE),
// Claude login and the Claude chat. Meant for a local machine.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { N } from "./hex.ts";
import { RULES_VERSION } from "./rules.ts";
import { buildingOf, inv, invName, describeEffects } from "./catalog.ts";
import { relation } from "./diplomacy.ts";
import { housing, inventionCost, ownedTiles, tileLimit, workers } from "./engine.ts";
import { chat, claudeStatus, login, logout } from "./claude.ts";
import type { Runner } from "./runner.ts";

const WEB = resolve("web");
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

function send(res: ServerResponse, code: number, body: unknown): void {
  const data = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(code, { "content-type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(data);
}
async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let s = "";
  for await (const chunk of req) { s += chunk; if (s.length > 1e6) throw new Error("body too large"); }
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
}

export function startServer(runner: Runner, opts: { host: string; port: number; version: string }): void {
  const sseClients = new Set<ServerResponse>();
  const push = (event: string, data: unknown) => { const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for (const c of sseClients) c.write(msg); };
  runner.on(e => {
    if (e.type === "tick") push("tick", { tick: e.tick, chronicle: e.chronicle });
    else if (e.type === "turn") push("turn", { nation: e.nation, kind: e.kind });
    else if (e.type === "history") push("history", { chapter: e.chapter, entry: e.entry });
    else if (e.type === "reload") push("reload", {});
    else push("status", statusPayload());
  });
  setInterval(() => { for (const c of sseClients) c.write(": ping\n\n"); }, 25000).unref();

  const token = process.env.WATCHER_TOKEN || "";
  const authorized = (req: IncomingMessage, url: URL) => !token || req.headers["x-watcher-token"] === token || url.searchParams.get("token") === token;

  function statusPayload() {
    return { tick: runner.world.tick, paused: runner.paused, busy: runner.busy, nextTickAt: runner.nextTickAt, tickSeconds: runner.cfg.tickSeconds, lastError: runner.lastError.slice(0, 500), version: opts.version, rules: RULES_VERSION };
  }

  function statePayload() {
    const w = runner.world;
    return {
      ...statusPayload(),
      owners: w.tiles.map(t => t.owner),
      nations: w.nations.map(n => ({
        id: n.id, name: n.name, capitalName: n.capitalName, people: n.people, flag: n.flag, manifesto: n.manifesto, founded: n.founded,
        controller: n.controller, provider: n.provider, model: n.model, alive: n.alive, capital: n.capital,
        status: n.status, statusNote: n.statusNote, sleepUntil: n.sleepUntil,
        population: n.population, workers: workers(n), housing: housing(w, n), stability: n.stability, reputation: n.reputation, era: n.era,
        tiles: ownedTiles(w, n.id).length, tileLimit: tileLimit(w, n),
        stock: Object.fromEntries(Object.entries(n.stock).filter(([, v]) => v >= 0.1).map(([k, v]) => [k, Math.round(v * 10) / 10])),
        labor: n.labor, crafts: n.crafts,
        inventions: n.inventions.map(id => ({ id, name: invName(w, id), custom: !!inv(w, id)?.custom })),
        research: n.research ? { id: n.research.id, name: invName(w, n.research.id), progress: Math.round(n.research.progress * 10) / 10, cost: inventionCost(w, n, n.research.id) } : null,
        buildings: n.buildings.map(b => ({ type: b.type, name: buildingOf(w, b.type)?.name ?? b.type, tile: b.tile, done: b.done })),
        settlements: n.settlements, trades: n.trades, inbox: n.inbox.map(m => ({ ...m, fromName: w.nations[m.from]?.name })),
        relations: Object.fromEntries(w.nations.filter(o => o.id !== n.id).map(o => [o.id, relation(w, n.id, o.id)])),
        thought: n.lastThought, memory: n.memory, events: n.lastEvents, rejected: n.lastRejected,
        met: n.met, intel: n.intel, stats: n.stats,
      })),
      spies: w.spies,
      petitions: w.petitions,
      decrees: w.decrees,
      registry: w.registry,
      proposals: w.proposals.slice(-60),
      customInventions: Object.values(w.custom.inventions).map(v => ({ id: v.id, name: v.name, prereqs: v.prereqs.map(p => ({ id: p, name: invName(w, p) })), rp: v.rp, caps: v.caps, desc: v.desc, by: v.custom?.by, tick: v.custom?.tick, depth: v.custom?.depth, description: v.custom?.description, effects: describeEffects(w, v.effects) })),
      treaties: w.treaties.filter(t => t.active).map(t => ({ ...t, aName: w.nations[t.a]?.name, bName: w.nations[t.b]?.name })),
      wars: w.wars.filter(x => x.end === null).map(x => ({ ...x, aName: w.nations[x.a]?.name, bName: w.nations[x.b]?.name })),
      battles: w.battles.slice(-20),
      caravans: w.caravans,
      eraGates: w.eraGates,
    };
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://local");
    const path = url.pathname, method = req.method || "GET";
    try {
      // ---- static
      if (method === "GET" && !path.startsWith("/api/")) {
        const file = path === "/" ? "index.html" : path.slice(1);
        const full = resolve(join(WEB, file));
        if (!full.startsWith(WEB)) return send(res, 403, "forbidden");
        try { const data = await readFile(full); res.writeHead(200, { "content-type": TYPES[extname(full)] || "application/octet-stream", "cache-control": "no-cache" }); return res.end(data); }
        catch { return send(res, 404, "not found"); }
      }
      if (method !== "GET" && !authorized(req, url)) return send(res, 401, { error: "Cần WATCHER_TOKEN" });

      // ---- world
      if (path === "/api/static") {
        const w = runner.world;
        return send(res, 200, {
          seed: w.seed, n: N,
          terrain: w.tiles.map(t => t.terrain), zone: w.tiles.map(t => t.zone), region: w.tiles.map(t => t.region),
          river: w.tiles.map(t => t.river ? 1 : 0), delta: w.tiles.map(t => t.delta ? 1 : 0),
          wonders: w.wonders, rivers: w.rivers, wild: w.wild, herd: w.herd,
        });
      }
      if (path === "/api/state") return send(res, 200, statePayload());
      if (path === "/api/tile") {
        const i = Number(url.searchParams.get("i")), t = runner.world.tiles[i];
        return t ? send(res, 200, t) : send(res, 404, { error: "no tile" });
      }
      if (path === "/api/chronicle") return send(res, 200, runner.store.chronicle(Math.min(500, Number(url.searchParams.get("limit")) || 100), Number(url.searchParams.get("before")) || undefined));
      if (path === "/api/history") return send(res, 200, runner.store.history(Math.min(500, Number(url.searchParams.get("limit")) || 100)));
      if (path === "/api/stats") return send(res, 200, runner.store.stats());
      const turnsM = path.match(/^\/api\/nation\/(\d+)\/turns$/);
      if (turnsM) return send(res, 200, runner.store.turns(Number(turnsM[1]), Math.min(50, Number(url.searchParams.get("limit")) || 10)));
      if (path === "/api/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        res.write(`event: status\ndata: ${JSON.stringify(statusPayload())}\n\n`);
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return;
      }

      // ---- Watcher powers
      if (path === "/api/control" && method === "POST") {
        const b = await readBody(req);
        if (b.action === "pause") runner.setPaused(true);
        else if (b.action === "resume") runner.setPaused(false);
        else if (b.action === "step") runner.requestStep();
        else if (b.action === "tick_seconds") runner.setTickSeconds(Number(b.value));
        else return send(res, 400, { error: "action?" });
        runner.store.logWatcher(runner.world.tick, "control", b);
        return send(res, 200, statusPayload());
      }
      const petM = path.match(/^\/api\/petitions\/(\d+)$/);
      if (petM && method === "POST") {
        const b = await readBody(req);
        const err = runner.decidePetition(Number(petM[1]), String(b.status), String(b.verdict ?? ""), b.mergedInto ? Number(b.mergedInto) : null);
        return err ? send(res, 400, { error: err }) : send(res, 200, { ok: true });
      }
      const propM = path.match(/^\/api\/proposals\/(\d+)$/);
      if (propM && method === "POST") {
        const b = await readBody(req);
        const err = runner.judgeByHand(Number(propM[1]), b.approve === true, String(b.reason ?? ""));
        return err ? send(res, 400, { error: err }) : send(res, 200, { ok: true });
      }
      if (path === "/api/decrees" && method === "POST") {
        const b = await readBody(req);
        const err = runner.addDecree(String(b.kind ?? "luật"), String(b.text ?? ""), b.fromPetition ? Number(b.fromPetition) : null);
        return err ? send(res, 400, { error: err }) : send(res, 200, { ok: true });
      }

      // ---- Claude
      if (path === "/api/claude" && method === "GET") return send(res, 200, { ...claudeStatus(), login: login.info() });
      if (path === "/api/claude/login/start" && method === "POST") return send(res, 200, await login.start());
      if (path === "/api/claude/login/code" && method === "POST") { const b = await readBody(req); return send(res, 200, await login.submitCode(String(b.code ?? ""))); }
      if (path === "/api/claude/login/cancel" && method === "POST") { login.cancel(); return send(res, 200, login.info()); }
      if (path === "/api/claude/logout" && method === "POST") { logout(); runner.store.setMeta("claude_session", ""); return send(res, 200, { ok: true }); }
      if (path === "/api/chat" && method === "GET") return send(res, 200, runner.store.chatHistory(100));
      if (path === "/api/chat" && method === "DELETE") { runner.store.clearChat(); runner.store.setMeta("claude_session", ""); return send(res, 200, { ok: true }); }
      if (path === "/api/chat" && method === "POST") {
        const b = await readBody(req), message = String(b.message ?? "").trim().slice(0, 4000);
        if (!message) return send(res, 400, { error: "Tin nhắn trống" });
        const tick = runner.world.tick;
        runner.store.addChat("user", message, tick);
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
        const ev = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        const context = runner.summary(runner.store.chronicle(30) as Array<{ tick: number; text: string }>);
        const session = runner.store.getMeta("claude_session") || null;
        chat(message, context, session, {
          onDelta: t => ev("delta", { text: t }),
          onDone: (full, sid) => { runner.store.addChat("claude", full, tick); if (sid) runner.store.setMeta("claude_session", sid); ev("done", {}); res.end(); },
          onError: msg => { ev("error", { error: msg }); res.end(); },
        });
        return;
      }
      return send(res, 404, { error: "not found" });
    } catch (e) {
      console.error("[http]", e);
      if (!res.headersSent) send(res, 500, { error: (e as Error).message });
    }
  });
  server.listen(opts.port, opts.host, () => console.log(`[http] Watcher UI: http://${opts.host === "0.0.0.0" ? "localhost" : opts.host}:${opts.port}`));
}
