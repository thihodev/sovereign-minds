// Watcher HTTP server: the web UI, a JSON API, a live event stream (SSE),
// Claude login and the Claude chat. Meant for a local machine.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { N } from "./hex.ts";
import { RULES_VERSION, TRAITS, TRAIT_BY_ID, traitLines } from "./rules.ts";
import { allInventions, buildingOf, depthOf, inv, invName, describeEffects } from "./catalog.ts";
import { relation } from "./diplomacy.ts";
import { ranking } from "./ranking.ts";
import { governed, housing, housingParts, inventionCost, maxOfficials, nextEraNeeds, ownedTiles, roadLevelMax, roadNet, tileLimit, workers } from "./engine.ts";
import { DEMO, OFFICIAL_DOMAINS, ROADS, SCHISM } from "./rules.ts";
import { demo, fighters, households, mouths } from "./people.ts";
import { CLAUDE_EFFORTS, CLAUDE_MODELS, chat, claudeStatus, login, logout } from "./claude.ts";
import { layer, nationResources, nationThreats, tileThreats, workSites } from "./threats.ts";
import { systemPrompt } from "./ai/prompt.ts";
import { advice } from "./ai/advice.ts";
import { applyLaws, lawTable } from "./laws.ts";
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

/** Starts the Watcher server; close() frees the port at once (open streams are ended). */
export function startServer(runner: Runner, opts: { host: string; port: number; version: string; onListen?: (port: number) => void }): { close(): void } {
  const sseClients = new Set<ServerResponse>();
  const push = (event: string, data: unknown) => { const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for (const c of sseClients) c.write(msg); };
  runner.on(e => {
    if (e.type === "tick") push("tick", { tick: e.tick, chronicle: e.chronicle, fx: e.fx });
    else if (e.type === "turn") push("turn", { nation: e.nation, kind: e.kind });
    else if (e.type === "history") push("history", { chapter: e.chapter, entry: e.entry });
    else if (e.type === "reload") push("reload", {});
    else push("status", statusPayload());
  });
  setInterval(() => { for (const c of sseClients) c.write(": ping\n\n"); }, 25000).unref();

  const token = process.env.WATCHER_TOKEN || "";
  const authorized = (req: IncomingMessage, url: URL) => !token || req.headers["x-watcher-token"] === token || url.searchParams.get("token") === token;

  function statusPayload() {
    return { tick: runner.world.tick, paused: runner.paused, busy: runner.busy, nextTickAt: runner.nextTickAt, tickSeconds: runner.cfg.tickSeconds, lastError: runner.lastError.slice(0, 500), version: opts.version, rules: RULES_VERSION,
      setupPending: runner.store.getMeta("setup_pending") === "1", claudeWait: runner.claudeWait.until > Date.now() ? runner.claudeWait : null };
  }

  function statePayload() {
    const w = runner.world;
    applyLaws(w); // the numbers below follow the laws in force
    return {
      ...statusPayload(),
      owners: w.tiles.map(t => t.owner),
      roads: w.tiles.map(t => t.road || 0),
      roadLevels: ROADS.levels.map(l => ({ name: l.name, lane: l.lane })),
      nations: w.nations.map(n => ({
        id: n.id, name: n.name, capitalName: n.capitalName, people: n.people, flag: n.flag, manifesto: n.manifesto, founded: n.founded,
        controller: n.controller, provider: n.provider, model: n.model, effort: n.effort ?? "", alive: n.alive, capital: n.capital,
        trait: TRAIT_BY_ID[n.trait ?? ""] ? { id: n.trait, name: TRAIT_BY_ID[n.trait!].name, icon: TRAIT_BY_ID[n.trait!].icon, desc: TRAIT_BY_ID[n.trait!].desc, lines: traitLines(TRAIT_BY_ID[n.trait!]) } : null,
        status: n.status, statusNote: n.statusNote, sleepUntil: n.sleepUntil,
        discontent: Math.round(n.discontent ?? 0), advice: n.alive && n.founded ? advice(w, n) : [], idleStreak: n.idleStreak ?? 0, origin: n.origin ? { ...n.origin, fromName: w.nations[n.origin.from]?.name } : null,
        population: n.population, workers: workers(n),
        demo: n.alive ? (() => { const d = demo(n); return { m: d.m, f: d.f, born: d.born ?? 0, infants: d.infants ?? 0, aged: d.aged ?? 0, households: households(n), fighters: fighters(n), mouths: mouths(n) }; })() : null,
        family: { births: n.family?.births ?? "neutral", fighters: n.family?.fighters ?? "all", birthsName: DEMO.births[n.family?.births ?? "neutral"]?.name, fightersName: DEMO.fighters[n.family?.fighters ?? "all"] }, housing: housing(w, n), housingParts: n.alive ? housingParts(w, n) : null, stability: n.stability, reputation: n.reputation, era: n.era,
        tiles: ownedTiles(w, n.id).length, tileLimit: tileLimit(w, n), governed: governed(w, n),
        waters: w.tiles.filter(t => t.owner === n.id && !t.land).length,
        roadNet: n.alive && n.founded ? { ...roadNet(w, n), level: roadLevelMax(n), works: (n.roadWorks ?? []).length } : null,
        stock: Object.fromEntries(Object.entries(n.stock).filter(([, v]) => v >= 0.1).map(([k, v]) => [k, Math.round(v * 10) / 10])),
        labor: n.labor, crafts: n.crafts,
        inventions: n.inventions.map(id => ({ id, name: invName(w, id), custom: !!inv(w, id)?.custom })),
        research: n.research ? { id: n.research.id, name: invName(w, n.research.id), progress: Math.round(n.research.progress * 10) / 10, cost: inventionCost(w, n, n.research.id) } : null,
        buildings: n.buildings.map(b => ({ type: b.type, name: buildingOf(w, b.type)?.name ?? b.type, tile: b.tile, done: b.done })),
        settlements: n.settlements, trades: n.trades, inbox: n.inbox.map(m => ({ ...m, fromName: w.nations[m.from]?.name })),
        relations: Object.fromEntries(w.nations.filter(o => o.id !== n.id).map(o => [o.id, relation(w, n.id, o.id)])),
        thought: n.lastThought, memory: n.memory, events: n.lastEvents, rejected: n.lastRejected,
        met: n.met, intel: n.intel, stats: n.stats,
        formerNames: n.formerNames,
        threats: nationThreats(w, n), resources: n.alive ? nationResources(w, n) : null,
        nextEra: n.alive ? nextEraNeeds(w, n) : null, courtSlots: n.alive ? maxOfficials(w, n) : 0,
        officials: (n.officials ?? []).map(o => ({ ...o, title: OFFICIAL_DOMAINS[o.domain]?.title ?? o.domain })), work: n.alive && n.founded ? workSites(w, n) : [],
      })),
      hordes: (w.hordes ?? []).map(h => ({ ...h, strength: Math.round(h.strength) })),
      lastFx: runner.lastFx,
      spies: w.spies,
      petitions: w.petitions,
      schisms: (w.schisms ?? []).map(x => ({ ...x, fromName: w.nations[x.from]?.name, nationName: x.nation !== undefined ? w.nations[x.nation]?.name : undefined, toName: x.to !== undefined ? w.nations[x.to]?.name : undefined, waitLeft: x.status === "pending" ? Math.max(0, SCHISM.waitTicks - (w.tick - x.tick)) : 0 })),
      claudeModels: CLAUDE_MODELS, claudeEfforts: CLAUDE_EFFORTS,
      decrees: w.decrees,
      laws: lawTable(w),
      registry: w.registry,
      proposals: w.proposals.slice(-60).map(p => ({ ...p, inventionName: p.inventionId ? invName(w, p.inventionId) : undefined })),
      judge: runner.judgeInfo(),
      customInventions: Object.values(w.custom.inventions).map(v => ({ id: v.id, name: v.name, prereqs: v.prereqs.map(p => ({ id: p, name: invName(w, p) })), rp: v.rp, caps: v.caps, desc: v.desc, by: v.custom?.by, tick: v.custom?.tick, depth: v.custom?.depth, description: v.custom?.description, effects: describeEffects(w, v.effects) })),
      treaties: w.treaties.filter(t => t.active).map(t => ({ ...t, aName: w.nations[t.a]?.name, bName: w.nations[t.b]?.name })),
      wars: w.wars.filter(x => x.end === null).map(x => ({ ...x, aName: w.nations[x.a]?.name, bName: w.nations[x.b]?.name })),
      battles: w.battles.slice(-20),
      caravans: w.caravans,
      eraGates: w.eraGates,
      ranking: ranking(w),
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
      if (path === "/api/inventions") {
        const w = runner.world;
        const all = allInventions(w), giving = (cap: string) => all.filter(x => x.caps.includes(cap)).map(x => x.id);
        return send(res, 200, all.map(v => ({
          id: v.id, name: v.name, prereqs: v.prereqs, depth: depthOf(w, v.id), caps: v.caps, custom: !!v.custom, by: v.custom?.by ?? null,
          rp: v.rp, desc: v.custom?.description || v.desc,
          // §5.6 a frame invention needs capabilities, from whichever invention gives them
          frame: v.frameDepth !== undefined, needsCaps: v.needsCaps ?? [], links: [...new Set((v.needsCaps ?? []).flatMap(giving))].filter(id => id !== v.id),
        })));
      }
      if (path === "/api/tile") {
        const i = Number(url.searchParams.get("i")), t = runner.world.tiles[i];
        return t ? send(res, 200, { ...t, threats: tileThreats(runner.world, i) }) : send(res, 404, { error: "no tile" });
      }
      if (path === "/api/layer") {
        const values = layer(runner.world, String(url.searchParams.get("kind") || ""));
        return values.length ? send(res, 200, { tick: runner.world.tick, values }) : send(res, 400, { error: "kind?" });
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
      // ---- new world (§2.4) and each nation's model
      if (path === "/api/setup" && method === "GET") {
        return send(res, 200, {
          traits: TRAITS.map(t => ({ id: t.id, name: t.name, icon: t.icon, desc: t.desc, lines: traitLines(t) })),
          models: CLAUDE_MODELS, efforts: CLAUDE_EFFORTS, seed: runner.world.seed, tickSeconds: runner.cfg.tickSeconds,
          nations: runner.world.nations.length, claude: { loggedIn: runner.claudeReady() },
        });
      }
      if (path === "/api/world/new" && method === "POST") {
        const b = await readBody(req);
        const r = await runner.newWorld({ seed: String(b.seed ?? ""), tickSeconds: Number(b.tickSeconds) || 0, nations: Array.isArray(b.nations) ? (b.nations as Array<Record<string, unknown> | null>).map(x => ({ trait: String(x?.trait ?? ""), model: String(x?.model ?? ""), effort: String(x?.effort ?? "") })) : [] });
        if (r.error) return send(res, 400, { error: r.error });
        runner.store.logWatcher(0, "new_world", { ...b, backup: r.backup });
        return send(res, 200, { ok: true, backup: r.backup });
      }
      const modelM = path.match(/^\/api\/nation\/(\d+)\/model$/);
      if (modelM && method === "POST") {
        const b = await readBody(req);
        const err = runner.setNationModel(Number(modelM[1]), String(b.model ?? ""), String(b.effort ?? ""));
        return err ? send(res, 400, { error: err }) : send(res, 200, { ok: true });
      }
      const petM = path.match(/^\/api\/petitions\/(\d+)$/);
      if (petM && method === "POST") {
        const b = await readBody(req);
        const err = runner.decidePetition(Number(petM[1]), String(b.status), String(b.verdict ?? ""), b.mergedInto ? Number(b.mergedInto) : null);
        return err ? send(res, 400, { error: err }) : send(res, 200, { ok: true });
      }
      const schM = path.match(/^\/api\/schisms\/(\d+)$/);
      if (schM && method === "POST") {
        const b = await readBody(req);
        const err = runner.decideSchism(Number(schM[1]), String(b.status), String(b.model ?? ""), String(b.effort ?? ""), String(b.verdict ?? ""));
        return err ? send(res, 400, { error: err }) : send(res, 200, { ok: true });
      }
      const propM = path.match(/^\/api\/proposals\/(\d+)$/);
      if (propM && method === "POST") {
        const b = await readBody(req);
        const err = runner.judgeByHand(Number(propM[1]), b.approve === true, String(b.reason ?? ""));
        return err ? send(res, 400, { error: err }) : send(res, 200, { ok: true });
      }
      if (path === "/api/laws" && method === "POST") {
        const b = await readBody(req);
        const err = runner.addLawDecree(String(b.key ?? ""), Number(b.value), String(b.note ?? ""), b.fromPetition ? Number(b.fromPetition) : null);
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
      if (path === "/api/claude/login/code" && method === "POST") {
        const b = await readBody(req), r = await login.submitCode(String(b.code ?? ""));
        if (r.state === "done") runner.claudeLoggedIn();
        return send(res, 200, r);
      }
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
        const context = runner.summary(runner.store.chronicle(60) as Array<{ tick: number; text: string }>, message);
        const session = runner.store.getMeta("claude_session") || null;
        chat(message, context, session, {
          onDelta: t => ev("delta", { text: t }),
          onDone: (full, sid) => { runner.store.addChat("claude", full, tick); if (sid) runner.store.setMeta("claude_session", sid); ev("done", {}); res.end(); },
          onError: msg => { ev("error", { error: msg }); res.end(); },
        }, systemPrompt(runner.world));
        return;
      }
      return send(res, 404, { error: "not found" });
    } catch (e) {
      console.error("[http]", e);
      if (!res.headersSent) send(res, 500, { error: (e as Error).message });
    }
  });
  // If the port is taken (another app, or an old run), try the next ones instead of crash-looping.
  let port = opts.port;
  const shown = () => `http://${opts.host === "0.0.0.0" ? "localhost" : opts.host}:${port}`;
  server.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE" && port < opts.port + 20) {
      console.warn(`[http] Cổng ${port} đang bị chương trình khác dùng; thử cổng ${port + 1}…`);
      port++;
      setTimeout(() => server.listen(port, opts.host), 100);
      return;
    }
    console.error(`[http] Không mở được cổng ${port}: ${e.message}. Đặt PORT khác trong .env.`);
    process.exit(1);
  });
  server.listen(port, opts.host, () => {
    opts.onListen?.(port);
    console.log(`[http] Watcher UI: ${shown()}`);
    if (port !== opts.port) console.log(`[http] (cổng ${opts.port} bận nên dùng cổng ${port}; muốn cố định thì đặt PORT trong .env)`);
  });
  return {
    close() {
      for (const c of sseClients) { try { c.end(); } catch { /* gone */ } }
      sseClients.clear();
      server.close();
      server.closeAllConnections();
    },
  };
}
