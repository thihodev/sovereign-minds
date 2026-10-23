// The tick loop (§3): ask every nation for its turn, apply step(), save.
// Quota sleep (§3.4) lives here because it depends on the wall clock, which
// the deterministic engine must never read.

import { actionPoints, createWorld, step, ownedTiles, housing, housingParts, workers, type NationSpec } from "./engine.ts";
import { advice } from "./ai/advice.ts";
import { bookLine, demo } from "./people.ts";
import { TILE_COUNT, tileCountOf, useWorld, type Shape } from "./hex.ts";
import { botTurn } from "./ai/bot.ts";
import { buildObservation, systemPrompt } from "./ai/prompt.ts";
import { LAW_BY_KEY, fmtLaw, lawError, lawTable, lawsOf } from "./laws.ts";
import { backfillAnnals } from "./annals.ts";
import { PROVIDERS, callModel, extractJson, judgeModel, providerKey, providerModel } from "./ai/gateway.ts";
import { JUDGE_SYSTEM, JUDGE_SYSTEM_BATCH, judgeBatchPrompt, judgeUserPrompt, parseRuling } from "./ai/judge.ts";
import { IDEA_JUDGE_SYSTEM, ideaJudgePrompt, parseIdeaRulings } from "./ai/ideas.ts";
import { buildingOf, migrate, invName } from "./catalog.ts";
import { relation } from "./diplomacy.ts";
import { rngFor, shuffle } from "./rng.ts";
import { DEMO, RENAME_DECREE, SCHISM, TRAITS, TRAIT_BY_ID } from "./rules.ts";
import { historianFromEnv, type Historian, type HistoryChapter } from "./historian.ts";
import { CLAUDE_EFFORTS, CLAUDE_MODELS, askClaude, claudeStatus, killAllClaude } from "./claude.ts";
import type { Store } from "./db.ts";
import type { MapFx } from "./fx.ts";
import type { AIResponse, ChronicleEntry, Minister, Nation, Ruling, TurnInput, World, MinisterRequest } from "./types.ts";
import { MINISTER_DOMAINS, MINISTERS } from "./rules.ts";
import { freeDomains, freeSeats, ministerSeats } from "./ministers.ts";
import { botMinister, ministerObservation, ministerSystem } from "./ai/minister.ts";

/** §4.9 One minister's answer for a tick: "asleep" when the world waits on Claude (asked again on the retry). */
type MinisterTurn = { minister: number; domain: string; kind: "ok" | "asleep" | "silent"; response?: AIResponse };

export interface RunnerConfig {
  seed: string;
  nations: string[]; // "claude[:model[:effort]]", provider ids, "bot"
  fillWithBots: boolean;
  tickSeconds: number;
  aiTimeoutSec: number;
  judgeProviders: string[];
  judgesPerTick: number;
}

export type RunnerEvent =
  | { type: "tick"; tick: number; chronicle: ChronicleEntry[]; fx: MapFx[] }
  | { type: "status" }
  | { type: "turn"; nation: number; kind: string }
  | { type: "history"; chapter: HistoryChapter; entry: ChronicleEntry }
  | { type: "reload" };

/** What the Watcher picks before a game (§2.4): one row per nation. */
export interface WorldSetup { seed: string; tickSeconds: number; nations: Array<{ trait?: string; model?: string; effort?: string }>;
  /** §12.1 the world's shape: the flat map (default) or a globe */
  shape?: "flat" | "globe" }
/** §12.1 The globe the Watcher may choose: 25 002 tiles. */
export const GLOBE_SHAPE: Shape = { kind: "sphere", freq: 50 };
export const shapeOf = (s: string | undefined): Shape => (s === "globe" || s === "sphere" ? GLOBE_SHAPE : { kind: "flat" });

const SLEEP_STEPS_MIN = [15, 30, 60, 120, 240, 360];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function nationSpecs(cfg: RunnerConfig): { specs: NationSpec[]; notes: string[] } {
  const specs: NationSpec[] = [], notes: string[] = [];
  for (const entry of cfg.nations) {
    // "provider" or "provider:model" (the model may itself contain ":", e.g. openrouter:x/y:free)
    const cut = entry.indexOf(":"), id = cut < 0 ? entry : entry.slice(0, cut), pinned = cut < 0 ? "" : entry.slice(cut + 1).trim();
    if (id === "bot") { specs.push({ controller: "bot", provider: "bot", model: "bot" }); continue; }
    if (id === "claude") {
      const [model, effort] = pinned.split(":");
      specs.push({ controller: "ai", provider: "claude", model: CLAUDE_MODELS.some(m => m.id === model) ? model : "haiku", effort: CLAUDE_EFFORTS.includes(effort) ? effort : "low" });
      continue;
    }
    const p = PROVIDERS[id];
    if (!p) { notes.push(`Bỏ qua nhà cung cấp lạ "${id}"`); continue; }
    if (providerKey(p)) specs.push({ controller: "ai", provider: id, model: pinned || providerModel(p), pinnedModel: pinned || undefined });
    else if (cfg.fillWithBots) { specs.push({ controller: "bot", provider: id, model: `bot (thiếu ${p.keyEnv})` }); notes.push(`${p.label}: thiếu ${p.keyEnv}, dùng bot thay thế`); }
    else notes.push(`${p.label}: thiếu ${p.keyEnv}, không tạo quốc gia`);
  }
  // §2.4 every nation is born with a different trait, drawn from the seed
  const traits = shuffle(TRAITS.map(t => t.id), rngFor(cfg.seed, "traits"));
  specs.forEach((sp, k) => { sp.trait = traits[k % traits.length]; });
  return { specs, notes };
}

/** A Watcher's setup as nation specs: unknown values fall back, blank traits are drawn from the unused ones. */
/** How many nations a new world may start with: a globe has room for more. */
export const NATIONS_MAX = { flat: 20, globe: 32 } as const;
/** How many nations may share one trait: one each while there are enough traits. */
export const traitShare = (count: number): number => Math.max(1, Math.ceil(count / TRAITS.length));

export function setupSpecs(setup: WorldSetup): NationSpec[] | string {
  const rows = setup.nations.slice(0, NATIONS_MAX[setup.shape === "globe" ? "globe" : "flat"]);
  if (rows.length < 2) return "Cần ít nhất 2 quốc gia";
  const chosen = rows.map(r => r.trait && TRAIT_BY_ID[r.trait] ? r.trait : ""), share = traitShare(rows.length);
  const used = (id: string) => chosen.filter(x => x === id).length;
  if (TRAITS.some(t => used(t.id) > share)) return share === 1 ? "Mỗi đặc thù chỉ dùng cho một quốc gia" : `Mỗi đặc thù dùng cho tối đa ${share} quốc gia`;
  // the traits no one chose first, in an order the seed decides; then a second round of each, and so on
  const free: string[] = [];
  for (let round = 0; round < share; round++) free.push(...shuffle(TRAITS.map(t => t.id).filter(id => used(id) <= round), round ? rngFor(setup.seed, "traits", round) : rngFor(setup.seed, "traits")));
  return rows.map((r, k) => ({
    controller: "ai", provider: "claude",
    model: CLAUDE_MODELS.some(m => m.id === r.model) ? r.model! : "haiku",
    effort: CLAUDE_EFFORTS.includes(r.effort ?? "") ? r.effort : "low",
    trait: chosen[k] || free.shift() || "",
  }));
}

export class Runner {
  world: World;
  paused = false;
  busy = false;
  stopping = false;
  stepRequested = false;
  nextTickAt = 0;
  lastError = "";
  private listeners = new Set<(e: RunnerEvent) => void>();
  private locks = new Map<string, Promise<unknown>>();
  /** Watcher rulings waiting for the next tick (§5.4: the Watcher can judge by hand). */
  manualRulings = new Map<number, Ruling>();
  private judgeSleep = new Map<string, number>();
  /** §3.4 Claude nations share the Watcher's plan: a plan limit or a lost login holds the whole world. */
  claudeWait = { until: 0, reason: "" };
  /** What happened on the map during the last tick played, so a page opened later can replay it. */
  lastFx: { tick: number; fx: MapFx[] } = { tick: -1, fx: [] };
  /** Answers already in for a tick that is waiting on Claude, kept so no turn is asked (or paid for) twice. */
  private held: { tick: number; inputs: Record<number, TurnInput>; ministers?: Record<number, Record<number, MinisterTurn>> } | null = null;
  /** §10.1: writes a chapter every few ticks, off the tick loop. */
  historian: Historian | null;

  store: Store;
  cfg: RunnerConfig;

  constructor(store: Store, cfg: RunnerConfig) {
    this.store = store; this.cfg = cfg;
    let saved = store.loadState();
    if (saved && saved.tiles.length !== tileCountOf(saved.shape)) {
      // A world from another map size (v0.3 had 64 × 64): keep it in data/backups/ and wait for a new one
      console.log(`[world] Thế giới đã lưu có ${saved.tiles.length} ô, bản đồ kiểu này cần ${tileCountOf(saved.shape)} ô: đã sao lưu vào ${store.backupAndReset()}, chờ tạo thế giới mới.`);
      saved = null;
    }
    if (saved) {
      this.world = migrate(saved);
      // §8.2 a world saved before the annals: rebuild each nation's story from the stored chronicle and population history
      for (const n of this.world.nations) if (n.founded && !n.annals && this.world.tick > 1) backfillAnnals(this.world, n, this.store.chronicleOf(n.id, n.name.length > 2 ? n.name : ""), this.store.nationStats(n.id, 0, this.world.tick));
    }
    else {
      const { specs, notes } = nationSpecs(cfg);
      this.world = createWorld(cfg.seed, specs, shapeOf(process.env.WORLD_SHAPE)); // §12.1 WORLD_SHAPE=globe for a globe
      for (const n of notes) console.log(`[world] ${n}`);
      store.saveState(this.world);
      store.addChronicle([{ tick: 0, nation: null, kind: "genesis", text: `Khai thiên lập địa: thế giới Nguyên Địa (seed "${cfg.seed}") với ${this.world.nations.length} bộ lạc.` }]);
      // A new install waits for the Watcher to choose the nations (§2.4)
      store.setMeta("setup_pending", "1"); store.setMeta("paused", "1");
    }
    // Keys may have been added since the world was created: upgrade bots to AIs.
    for (const n of this.world.nations) {
      const p = PROVIDERS[n.provider];
      if (p && n.controller === "bot" && providerKey(p)) { n.controller = "ai"; n.model = n.pinnedModel || providerModel(p); n.status = "active"; console.log(`[world] ${p.label} có key: quốc gia ${n.id + 1} chuyển sang AI`); }
      if (p && n.controller === "ai") n.model = n.pinnedModel || providerModel(p);
    }
    this.paused = store.getMeta("paused") === "1";
    this.loadManual();
    const ts = Number(store.getMeta("tick_seconds"));
    if (ts > 0) this.cfg.tickSeconds = ts;
    this.nextTickAt = Date.now() + 3000;
    this.historian = historianFromEnv(store, this.world, cfg.aiTimeoutSec, (chapter, entry) => this.emit({ type: "history", chapter, entry }));
  }

  on(fn: (e: RunnerEvent) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(e: RunnerEvent): void { for (const fn of this.listeners) { try { fn(e); } catch { /* listener gone */ } } }

  async loop(): Promise<void> {
    while (!this.stopping) {
      const due = this.stepRequested || (!this.paused && Date.now() >= this.nextTickAt);
      if (!due) { await sleep(500); continue; }
      this.stepRequested = false;
      try { await this.runTick(); } catch (e) { this.lastError = (e as Error).stack || String(e); console.error("[tick] lỗi:", e); this.paused = true; this.emit({ type: "status" }); }
      if (!this.nextTickAt || this.nextTickAt <= Date.now()) this.nextTickAt = Date.now() + this.cfg.tickSeconds * 1000;
    }
  }

  /** Stop now: a tick still waiting on its AIs is dropped (Claude runs are killed), so the world
   *  stays at the last tick played and saved. A tick that reached step() always finishes. */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.historian) this.historian.stopped = true;
    killAllClaude();
    for (let k = 0; this.busy && k < 100; k++) await sleep(100);
  }

  async runTick(): Promise<void> {
    this.busy = true; this.emit({ type: "status" });
    try {
      const w = this.world, alive = w.nations.filter(n => n.alive);
      const inputs: Record<number, TurnInput> = {};
      const held = this.held?.tick === w.tick ? this.held.inputs : {};
      const heldM = this.held?.tick === w.tick ? this.held.ministers ?? {} : {};
      const mins: Record<number, MinisterTurn[]> = {}; // §4.9 each nation's ministers, asked beside their ruler
      await Promise.all(alive.map(async n => {
        const [inp, ms] = await Promise.all([held[n.id] ? Promise.resolve(held[n.id]) : this.turnFor(n), this.ministerTurns(n, heldM[n.id] ?? {})]);
        inputs[n.id] = inp; if (ms.length) mins[n.id] = ms;
        this.emit({ type: "turn", nation: n.id, kind: inputs[n.id].kind });
      }));
      const ministerAsleep = Object.values(mins).some(ms => ms.some(x => x.kind === "asleep"));
      if (Date.now() < this.claudeWait.until && (ministerAsleep || alive.some(n => n.provider === "claude" && n.controller === "ai" && inputs[n.id].kind === "asleep"))) {
        // Fair play: nobody moves until every Claude nation (and minister) can. Answers already in wait for the retry.
        this.held = {
          tick: w.tick, inputs: Object.fromEntries(Object.entries(inputs).filter(([, v]) => v.kind !== "asleep")),
          ministers: Object.fromEntries(Object.entries(mins).map(([id, ms]) => [id, Object.fromEntries(ms.filter(x => x.kind !== "asleep").map(x => [x.minister, x]))])),
        };
        this.nextTickAt = this.claudeWait.until;
        return;
      }
      this.held = null;
      for (const [id, ms] of Object.entries(mins)) {
        const ok = ms.filter(x => x.kind === "ok" && x.response).map(x => ({ minister: x.minister, domain: x.domain, response: x.response! }));
        if (ok.length) inputs[Number(id)] = { ...inputs[Number(id)], ministers: ok };
      }
      if (this.stopping) return; // shutting down while the AIs answered: drop this tick, nothing changed yet

      const aiAlive = alive.filter(n => n.controller === "ai");
      if (alive.length && alive.every(n => inputs[n.id].kind === "asleep") && aiAlive.length) {
        // §3.4: the world pauses only when every nation sleeps
        const wake = Math.min(...aiAlive.map(n => n.sleepUntil));
        this.nextTickAt = Math.max(Date.now() + 60_000, wake);
        this.lastError = "";
        return;
      }
      const rulings = await this.judgePending();
      await this.judgeIdeas(); // §10.7 the Judge of Ideas rules on the initiatives, so the Watcher only marks what is built
      if (this.stopping) return;
      const res = step(w, inputs, rulings);
      if (res.audit.length) {
        res.chronicle.push({ tick: w.tick - 1, nation: null, kind: "audit", text: `Lỗi kiểm toán sổ cái, thế giới tạm dừng: ${res.audit.slice(0, 3).join("; ")}` });
        this.paused = true; this.store.setMeta("paused", "1");
        console.error("[audit]", res.audit);
      }
      this.store.saveState(w);
      this.store.addChronicle(res.chronicle);
      this.store.addStats(w);
      this.store.addNationLog(w);
      this.nextTickAt = Date.now() + this.cfg.tickSeconds * 1000;
      this.lastFx = { tick: w.tick - 1, fx: res.fx };
      this.emit({ type: "tick", tick: w.tick, chronicle: res.chronicle, fx: res.fx });
      void this.historian?.maybeWrite(w); // not awaited: the next tick never waits for the Historian
    } finally { this.busy = false; this.emit({ type: "status" }); }
  }

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) || Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(key, next.catch(() => undefined));
    return next;
  }

  /** Watcher rulings survive a restart: they are kept in the database until used. */
  private setManual(id: number, r: Ruling): void {
    this.manualRulings.set(id, r);
    this.store.setMeta("manual_rulings", JSON.stringify([...this.manualRulings.entries()]));
  }
  private loadManual(): void {
    try { for (const [id, r] of JSON.parse(this.store.getMeta("manual_rulings") || "[]")) this.manualRulings.set(Number(id), r); } catch { /* ignore */ }
  }

  /** Is the Watcher's Claude login usable? Checked at most every 5 minutes. */
  private claudeCheck = { at: 0, ok: false };
  claudeReady(): boolean {
    if (Date.now() - this.claudeCheck.at > 5 * 60 * 1000) {
      const st = claudeStatus();
      this.claudeCheck = { at: Date.now(), ok: st.available && st.loggedIn };
    }
    return this.claudeCheck.ok;
  }

  /** §10.7 The Judge of Ideas (the Watcher's Claude): up to IDEA_BATCH waiting initiatives a turn, ruled against the rules
   *  of the world and the ideas already decided. Off with IDEA_JUDGE=off; the Watcher may still rule or overrule by hand. */
  private async judgeIdeas(): Promise<void> {
    const w = this.world;
    if (process.env.IDEA_JUDGE === "off" || !this.cfg.judgeProviders.includes("claude")) return;
    const todo = w.petitions.filter(p => p.category === "sáng kiến" && p.status === "pending" && p.tick < w.tick).slice(0, Math.max(1, Number(process.env.IDEA_BATCH) || 4));
    if (!todo.length || (this.judgeSleep.get("claude") || 0) >= Date.now() || Date.now() < this.claudeWait.until || !this.claudeReady()) return;
    const model = process.env.IDEA_JUDGE_MODEL || process.env.JUDGE_CLAUDE_MODEL || "claude-sonnet-5-5", started = Date.now();
    const r = await askClaude(IDEA_JUDGE_SYSTEM, ideaJudgePrompt(w, todo), { model, timeoutMs: Math.max(180, this.cfg.aiTimeoutSec) * 1000 });
    const j = r.ok ? extractJson(r.text) : null;
    this.store.logTurn({ tick: w.tick, nation: -1, provider: "claude", model, kind: j ? "idea-ruling" : (r.ok ? "invalid" : r.kind), raw: r.ok ? r.text : "", parsed: j ?? undefined, error: r.ok ? "" : r.message, latencyMs: Date.now() - started });
    if (!r.ok && (r.kind === "ratelimit" || r.kind === "auth")) { this.judgeSleep.set("claude", Date.now() + 15 * 60 * 1000); this.claudeCheck = { at: 0, ok: false }; return; }
    for (const x of j ? parseIdeaRulings(j, todo) : []) {
      const p = w.petitions.find(q => q.id === x.id)!;
      p.status = x.status; p.verdict = x.verdict; p.decidedTick = w.tick; p.mergedInto = null; p.delivered = false; p.judge = `Claude · ${model}`;
      this.store.logWatcher(w.tick, "idea-judge", { id: p.id, status: x.status, verdict: x.verdict, model });
    }
  }

  /** Rulings for this tick: the Watcher's first, then an AI judge per pending proposal. */
  private async judgePending(): Promise<Record<number, Ruling>> {
    const w = this.world, out: Record<number, Ruling> = {};
    const pending = w.proposals.filter(p => p.status === "pending" && p.tick < w.tick);
    for (const p of pending) {
      const manual = this.manualRulings.get(p.id);
      if (manual) { out[p.id] = manual; this.manualRulings.delete(p.id); }
    }
    this.store.setMeta("manual_rulings", JSON.stringify([...this.manualRulings.entries()]));
    const nationProviders = new Set(w.nations.filter(n => n.alive && n.controller === "ai").map(n => n.provider));
    let calls = 0;
    // Claude (the Watcher's own login) comes first when it is listed and logged in: up to JUDGE_BATCH proposals a call
    const batch = Math.max(1, Number(process.env.JUDGE_BATCH) || 4);
    if (this.cfg.judgeProviders.includes("claude")) {
      const todo = pending.filter(p => !out[p.id]);
      for (let i = 0; i < todo.length && calls < this.cfg.judgesPerTick; i += batch) {
        if ((this.judgeSleep.get("claude") || 0) >= Date.now() || Date.now() < this.claudeWait.until || !this.claudeReady()) break;
        const group = todo.slice(i, i + batch);
        calls++;
        const model = process.env.JUDGE_CLAUDE_MODEL || "claude-sonnet-5-5", started = Date.now();
        const r = group.length === 1
          ? await askClaude(JUDGE_SYSTEM, judgeUserPrompt(w, group[0]), { model, timeoutMs: Math.max(120, this.cfg.aiTimeoutSec) * 1000 })
          : await askClaude(JUDGE_SYSTEM_BATCH, judgeBatchPrompt(w, group), { model, timeoutMs: Math.max(180, this.cfg.aiTimeoutSec) * 1000 });
        const j = r.ok ? extractJson(r.text) : null;
        this.store.logTurn({ tick: w.tick, nation: -1, provider: "claude", model, kind: j ? "ruling" : (r.ok ? "invalid" : r.kind), raw: r.ok ? r.text : "", parsed: j ?? undefined, error: r.ok ? "" : r.message, latencyMs: Date.now() - started });
        if (j && group.length === 1) out[group[0].id] = parseRuling(j, `Claude · ${model}`);
        else if (j && Array.isArray(j.rulings)) for (const x of j.rulings as Array<Record<string, unknown>>) { const p = group.find(g => g.id === Number(x.id)); if (p) out[p.id] = parseRuling(x, `Claude · ${model}`); }
        if (!r.ok && (r.kind === "ratelimit" || r.kind === "auth")) { this.judgeSleep.set("claude", Date.now() + 15 * 60 * 1000); this.claudeCheck = { at: 0, ok: false }; break; }
      }
    }
    for (const p of pending) {
      if (out[p.id] || calls >= this.cfg.judgesPerTick) continue;
      const proposer = w.nations[p.nation].provider;
      const candidates = this.cfg.judgeProviders.map(id => PROVIDERS[id]).filter(pr => pr && providerKey(pr) && pr.id !== proposer && (this.judgeSleep.get(pr.id) || 0) < Date.now());
      candidates.sort((a, b) => Number(nationProviders.has(a.id)) - Number(nationProviders.has(b.id)));
      for (const pr of candidates) {
        calls++;
        const model = judgeModel(pr);
        const r = await this.withLock(pr.id, () => callModel(pr, JUDGE_SYSTEM, judgeUserPrompt(w, p), { timeoutMs: this.cfg.aiTimeoutSec * 1000, model, temperature: 0, maxTokens: 1500 }));
        const j = r.ok ? extractJson(r.text) : null;
        this.store.logTurn({ tick: w.tick, nation: -1, provider: pr.id, model, kind: j ? "ruling" : (r.ok ? "invalid" : r.kind), raw: r.ok ? r.text : "", parsed: j ?? undefined, error: r.ok ? "" : r.message, latencyMs: r.latencyMs });
        if (j) { out[p.id] = parseRuling(j, `${pr.label} · ${model}`); break; }
        if (!r.ok && (r.kind === "ratelimit" || r.kind === "auth")) this.judgeSleep.set(pr.id, Date.now() + Math.max(15 * 60, (r.retryAfterSec ?? 0) + 5) * 1000);
      }
    }
    return out;
  }

  /** Why proposals are still waiting, for the Watcher. */
  /** Every AI mind the world runs now: the nations', their ministers', the judge's and the historian's. */
  minds(): Array<{ role: string; who: string; provider: string; model: string; effort: string; status: string; perTurn: number }> {
    const w = this.world, out: Array<{ role: string; who: string; provider: string; model: string; effort: string; status: string; perTurn: number }> = [];
    for (const n of w.nations) {
      if (!n.alive || n.controller !== "ai") continue;
      out.push({ role: "Quốc gia", who: n.founded ? n.name : `Bộ lạc ${n.id + 1}`, provider: n.provider, model: n.model, effort: n.effort ?? "", status: n.status, perTurn: 1 });
      for (const m of n.ministers ?? []) if (m.controller !== "bot")
        out.push({ role: "Bộ trưởng", who: `${MINISTER_DOMAINS[m.domain]?.title ?? m.domain} · ${n.name}`, provider: "claude", model: m.model ?? "", effort: m.effort ?? "", status: n.status, perTurn: 1 });
    }
    // one judge rules on each proposal: the first provider that is awake; the rest stand by
    const judges = this.cfg.judgeProviders.filter(p => p === "claude" || (PROVIDERS[p] && providerKey(PROVIDERS[p])));
    if (judges.length && this.cfg.judgesPerTick > 0) {
      const awake = judges.find(p => (this.judgeSleep.get(p) || 0) <= Date.now()) ?? judges[0];
      const name = (p: string) => p === "claude" ? process.env.JUDGE_CLAUDE_MODEL || "claude-sonnet-5-5" : PROVIDERS[p]?.label ?? p;
      const spare = judges.filter(p => p !== awake);
      out.push({ role: "Trọng tài", who: `chấm phát minh và sáng kiến${spare.length ? ` · dự phòng khi lỗi hay hết hạn mức: ${spare.map(name).join(", ")}` : ""}`, provider: awake, model: name(awake), effort: "", status: (this.judgeSleep.get(awake) || 0) > Date.now() ? "asleep" : "active", perTurn: this.cfg.judgesPerTick });
    }
    if (this.historian) out.push({ role: "Sử gia", who: "chép sử mỗi vài lượt", provider: "", model: this.historian.author, effort: "", status: "active", perTurn: 0 });
    return out;
  }

  judgeInfo(): { claudeSleepUntil: number | null; claudeWaitUntil: number | null; perTick: number; batch: number } {
    const sleep = this.judgeSleep.get("claude") || 0;
    return { claudeSleepUntil: sleep > Date.now() ? sleep : null, claudeWaitUntil: this.claudeWait.until > Date.now() ? this.claudeWait.until : null, perTick: this.cfg.judgesPerTick, batch: Math.max(1, Number(process.env.JUDGE_BATCH) || 4) };
  }

  judgeByHand(id: number, approve: boolean, reason: string): string | null {
    const p = this.world.proposals.find(x => x.id === id && x.status === "pending");
    if (!p) return "Không có đơn đang chờ này";
    this.setManual(id, { judge: "Watcher", causality: approve ? 2 : 0, material: approve ? 2 : 0, physics: approve ? 2 : 1, duplicate_of: null, add_prereqs: [], remove_effects: [], remove_capabilities: [], reason: reason || (approve ? "Các vị thần chấp thuận." : "Các vị thần bác bỏ.") });
    this.store.logWatcher(this.world.tick, "ruling", { id, approve, reason });
    return null;
  }

  private async turnFor(n: Nation): Promise<TurnInput> {
    const w = this.world, tick = w.tick;
    if (n.controller === "bot") {
      const response = botTurn(w, n, rngFor(w.seed, tick, "bot", n.id));
      this.store.logTurn({ tick, nation: n.id, provider: n.provider, model: n.model, kind: "bot", raw: "", parsed: response, error: "", latencyMs: 0 });
      return { kind: "ok", response };
    }
    if (n.provider === "claude") return this.claudeTurn(n);
    const p = PROVIDERS[n.provider];
    if (!p || !providerKey(p)) { n.status = "error"; n.statusNote = `Thiếu key ${p?.keyEnv ?? n.provider}`; return { kind: "asleep" }; }
    if ((n.status === "asleep" || n.status === "error") && Date.now() < n.sleepUntil) return { kind: "asleep" };

    const obs = JSON.stringify(buildObservation(w, n));
    n.stats.calls++;
    return this.withLock(p.id, async () => {
      let r = await callModel(p, systemPrompt(this.world), obs, { timeoutMs: this.cfg.aiTimeoutSec * 1000, model: n.model });
      let parsed = r.ok ? extractJson(r.text) : null;
      if (r.ok && !parsed) {
        // §3.3: one repair attempt within the same turn
        const retry = `${obs}\n\nYOUR PREVIOUS REPLY WAS NOT A VALID JSON OBJECT. Reply again with ONLY the JSON object.`;
        r = await callModel(p, systemPrompt(this.world), retry, { timeoutMs: this.cfg.aiTimeoutSec * 1000, model: n.model });
        parsed = r.ok ? extractJson(r.text) : null;
      }
      const log = (kind: string, raw: string, error: string) =>
        this.store.logTurn({ tick, nation: n.id, provider: p.id, model: n.model, kind, raw, parsed: parsed ?? undefined, error, latencyMs: r.latencyMs });

      if (r.ok && parsed) {
        if (n.status !== "active") this.store.addChronicle([{ tick, nation: n.id, kind: "wake", text: `${n.name} thức dậy sau giấc ngủ đông.` }]);
        n.status = "active"; n.sleepBackoffMin = 0; n.statusNote = "";
        log("ok", r.text, "");
        return { kind: "ok", response: parsed as AIResponse };
      }
      if (r.ok) { log("invalid", r.text, "Không đọc được JSON"); n.statusNote = "Trả lời sai định dạng"; return { kind: "silent", reason: "json" }; }
      if (r.kind === "ratelimit" || r.kind === "auth") {
        const idx = SLEEP_STEPS_MIN.indexOf(n.sleepBackoffMin);
        const nextBackoff = SLEEP_STEPS_MIN[Math.min(SLEEP_STEPS_MIN.length - 1, idx + 1)];
        const secs = r.kind === "ratelimit" && r.retryAfterSec !== null ? Math.max(30, r.retryAfterSec + 5) : nextBackoff * 60;
        n.sleepBackoffMin = nextBackoff;
        if (n.status === "active") this.store.addChronicle([{ tick, nation: n.id, kind: "sleep", text: `${n.name} chìm vào giấc ngủ đông (${r.kind === "ratelimit" ? "hết quota" : "lỗi key"}).` }]);
        n.status = r.kind === "ratelimit" ? "asleep" : "error";
        n.sleepUntil = Date.now() + secs * 1000;
        n.statusNote = r.message.slice(0, 200);
        log(r.kind, "", r.message);
        return { kind: "asleep" };
      }
      n.statusNote = r.message.slice(0, 200);
      log(r.kind, "", r.message);
      return { kind: "silent", reason: r.kind };
    });
  }

  /** One Claude nation's turn through the Watcher's Claude login, at the nation's model and effort. */
  private async claudeTurn(n: Nation): Promise<TurnInput> {
    const w = this.world, tick = w.tick;
    if (Date.now() < this.claudeWait.until) return { kind: "asleep" };
    if (!this.claudeReady()) { this.holdClaude(5 * 60, "Claude chưa đăng nhập: đăng nhập trong tab Chat Claude để các quốc gia chơi tiếp."); return { kind: "asleep" }; }
    const obs = JSON.stringify(buildObservation(w, n));
    n.stats.calls++;
    const waiting = () => Date.now() < this.claudeWait.until;
    const started = Date.now(), opts = { model: n.model, effort: n.effort, timeoutMs: Math.max(180, this.cfg.aiTimeoutSec) * 1000, skipIf: waiting };
    let r = await askClaude(systemPrompt(this.world), obs, opts);
    if (this.stopping) return { kind: "asleep" }; // killed by a shutdown: not the nation's fault, log nothing
    let parsed = r.ok ? extractJson(r.text) : null;
    if (r.ok && !parsed) {
      // §3.3: one repair attempt within the same turn
      r = await askClaude(systemPrompt(this.world), `${obs}\n\nYOUR PREVIOUS REPLY WAS NOT A VALID JSON OBJECT. Reply again with ONLY the JSON object.`, opts);
      parsed = r.ok ? extractJson(r.text) : null;
      if (this.stopping) return { kind: "asleep" };
    }
    // §3.2 no order at all: ask once more, with what the advisor sees
    const noOrders = (p: Record<string, unknown> | null) => !!p && n.founded && !(Array.isArray(p.actions) && p.actions.some(a => a && typeof a === "object" && (a as { type?: unknown }).type)) && actionPoints(w, n) >= 1;
    if (r.ok && noOrders(parsed)) {
      const tips = advice(w, n).slice(0, 4).map(a => `- ${a.text}`).join("\n");
      const again = await askClaude(systemPrompt(this.world), `${obs}\n\nYOUR REPLY GAVE NO ORDER. Every turn you must give at least one action (you have ${actionPoints(w, n)} AP). The advisor sees:\n${tips || "- research, claim land, build or explore"}\nReply again with the full JSON object, with at least one action.`, opts);
      if (this.stopping) return { kind: "asleep" };
      const p2 = again.ok ? extractJson(again.text) : null;
      if (p2 && !noOrders(p2)) { r = again; parsed = p2; }
    }
    const log = (kind: string, raw: string, error: string) =>
      this.store.logTurn({ tick, nation: n.id, provider: "claude", model: `${n.model}${n.effort ? `/${n.effort}` : ""}`, kind, raw, parsed: parsed ?? undefined, error, latencyMs: Date.now() - started });
    if (r.ok && parsed) { n.status = "active"; n.statusNote = ""; log("ok", r.text, ""); return { kind: "ok", response: parsed as AIResponse }; }
    if (r.ok) { log("invalid", r.text, "Không đọc được JSON"); n.statusNote = "Trả lời sai định dạng"; return { kind: "silent", reason: "json" }; }
    if (waiting()) return { kind: "asleep" }; // another nation's call already set the wait; nothing to log or extend
    log(r.kind, "", r.message);
    if (r.kind === "ratelimit") { this.holdClaude(Math.max(60, (r.retryAfterSec ?? 15 * 60) + 5), `Hết giới hạn gói Claude, thế giới chờ đến khi được làm mới. ${r.message.slice(0, 160)}`); return { kind: "asleep" }; }
    if (r.kind === "auth") { this.claudeCheck = { at: 0, ok: false }; this.holdClaude(5 * 60, `Claude báo lỗi đăng nhập: ${r.message.slice(0, 160)}`); return { kind: "asleep" }; }
    n.statusNote = r.message.slice(0, 200);
    return { kind: "silent", reason: r.kind };
  }

  /** §4.9 Every minister of a nation, asked in parallel with its ruler; answers already held are not asked again. */
  private async ministerTurns(n: Nation, held: Record<number, MinisterTurn>): Promise<MinisterTurn[]> {
    if (!n.alive || !n.founded || !n.ministers?.length) return [];
    return Promise.all(n.ministers.map(m => held[m.id] ? Promise.resolve(held[m.id]) : this.ministerTurn(n, m)));
  }

  /** One minister's turn: the bot's logic for its field, or its own Claude model through the Watcher's login
   *  (the same concurrency slot and the same world-wide wait on plan limits as the nations). */
  private async ministerTurn(n: Nation, m: Minister): Promise<MinisterTurn> {
    const w = this.world, tick = w.tick, base = { minister: m.id, domain: m.domain };
    const label = `${m.controller === "bot" ? "bot" : `${m.model}${m.effort ? `/${m.effort}` : ""}`} · bộ trưởng ${MINISTER_DOMAINS[m.domain]?.short ?? m.domain}`;
    if (m.controller === "bot") {
      const response = botMinister(w, n, m, rngFor(w.seed, tick, "minister-bot", n.id, m.id));
      this.store.logTurn({ tick, nation: n.id, provider: "bot", model: label, kind: "bot", raw: "", parsed: response, error: "", latencyMs: 0 });
      return { ...base, kind: "ok", response };
    }
    if (Date.now() < this.claudeWait.until) return { ...base, kind: "asleep" };
    if (!this.claudeReady()) { this.holdClaude(5 * 60, "Claude chưa đăng nhập: đăng nhập trong tab Chat Claude để các quốc gia chơi tiếp."); return { ...base, kind: "asleep" }; }
    const system = ministerSystem(w, n, m), obs = JSON.stringify(ministerObservation(w, n, m));
    const waiting = () => Date.now() < this.claudeWait.until;
    const started = Date.now(), opts = { model: m.model, effort: m.effort, timeoutMs: Math.max(180, this.cfg.aiTimeoutSec) * 1000, skipIf: waiting };
    let r = await askClaude(system, obs, opts);
    if (this.stopping) return { ...base, kind: "asleep" };
    let parsed = r.ok ? extractJson(r.text) : null;
    if (r.ok && !parsed) {
      r = await askClaude(system, `${obs}\n\nYOUR PREVIOUS REPLY WAS NOT A VALID JSON OBJECT. Reply again with ONLY the JSON object.`, opts);
      parsed = r.ok ? extractJson(r.text) : null;
      if (this.stopping) return { ...base, kind: "asleep" };
    }
    const log = (kind: string, raw: string, error: string) =>
      this.store.logTurn({ tick, nation: n.id, provider: "claude", model: label, kind, raw, parsed: parsed ?? undefined, error, latencyMs: Date.now() - started });
    if (r.ok && parsed) { log("ok", r.text, ""); return { ...base, kind: "ok", response: parsed as AIResponse }; }
    if (r.ok) { log("invalid", r.text, "Không đọc được JSON"); return { ...base, kind: "silent" }; }
    if (waiting()) return { ...base, kind: "asleep" };
    log(r.kind, "", r.message);
    if (r.kind === "ratelimit") { this.holdClaude(Math.max(60, (r.retryAfterSec ?? 15 * 60) + 5), `Hết giới hạn gói Claude, thế giới chờ đến khi được làm mới. ${r.message.slice(0, 160)}`); return { ...base, kind: "asleep" }; }
    if (r.kind === "auth") { this.claudeCheck = { at: 0, ok: false }; this.holdClaude(5 * 60, `Claude báo lỗi đăng nhập: ${r.message.slice(0, 160)}`); return { ...base, kind: "asleep" }; }
    return { ...base, kind: "silent" };
  }

  private holdClaude(secs: number, reason: string): void {
    const until = Date.now() + secs * 1000;
    if (until > this.claudeWait.until) this.claudeWait = { until, reason };
    this.emit({ type: "status" });
  }

  /** After a login from the web UI: stop waiting and play now. */
  claudeLoggedIn(): void {
    this.claudeCheck = { at: 0, ok: false };
    if (this.claudeWait.until > Date.now()) { this.claudeWait = { until: 0, reason: "" }; this.nextTickAt = Math.min(this.nextTickAt, Date.now() + 2000); }
    this.emit({ type: "status" });
  }

  // ---------------------------------------------------------------- new world (§2.4)

  /** Back up the current world and start a new one from the Watcher's setup. */
  async newWorld(setup: WorldSetup): Promise<{ error?: string; backup?: string }> {
    const seed = String(setup.seed || "").trim().slice(0, 60) || `nguyen-dia-${Date.now().toString(36)}`;
    const specs = setupSpecs({ ...setup, seed });
    if (typeof specs === "string") return { error: specs };
    this.paused = true;
    while (this.busy) await sleep(200);
    if (this.historian) this.historian.stopped = true;
    const backup = this.store.backupAndReset();
    this.world = createWorld(seed, specs, shapeOf(setup.shape));
    this.cfg.seed = seed;
    this.held = null; this.claudeWait = { until: 0, reason: "" }; this.lastError = ""; this.lastFx = { tick: -1, fx: [] };
    this.manualRulings.clear(); this.judgeSleep.clear();
    this.store.saveState(this.world);
    const traits = this.world.nations.map(n => TRAIT_BY_ID[n.trait ?? ""]?.name).filter(Boolean).join(", ");
    this.store.addChronicle([{ tick: 0, nation: null, kind: "genesis", text: `Khai thiên lập địa: thế giới Nguyên Địa (seed "${seed}") với ${this.world.nations.length} bộ lạc: ${traits}.` }]);
    this.historian = historianFromEnv(this.store, this.world, this.cfg.aiTimeoutSec, (chapter, entry) => this.emit({ type: "history", chapter, entry }));
    this.setTickSeconds(setup.tickSeconds || this.cfg.tickSeconds); // the reset emptied meta: write it back
    this.store.setMeta("setup_pending", "0");
    this.setPaused(false);
    this.emit({ type: "reload" });
    console.log(`[world] Thế giới mới "${seed}" (${this.world.nations.length} quốc gia, ${this.world.shape?.kind === "sphere" ? "địa cầu" : "bản đồ phẳng"}); bản cũ lưu ở ${backup}`);
    return { backup };
  }

  /** Change a Claude nation's model or effort; applies from its next turn. */
  setNationModel(id: number, model: string, effort: string): string | null {
    const n = this.world.nations[id];
    if (!n || n.provider !== "claude") return "Chỉ đổi được model của quốc gia chạy bằng Claude";
    if (!CLAUDE_MODELS.some(m => m.id === model)) return "Model không hợp lệ";
    if (!CLAUDE_EFFORTS.includes(effort)) return "Effort không hợp lệ";
    n.model = model; n.effort = effort;
    this.store.logWatcher(this.world.tick, "model", { id, model, effort });
    this.store.saveState(this.world);
    this.emit({ type: "status" });
    return null;
  }

  // ---------------------------------------------------------------- Watcher powers (§10)

  decidePetition(id: number, status: string, verdict: string, mergedInto: number | null): string | null {
    const p = this.world.petitions.find(x => x.id === id);
    if (!p) return "Không có thỉnh nguyện này";
    if (!["accepted", "partial", "rejected", "merged", "pending"].includes(status)) return "Kết quả không hợp lệ";
    p.status = status as typeof p.status; p.verdict = verdict.slice(0, 1200); p.decidedTick = this.world.tick; delete p.judge;
    p.mergedInto = status === "merged" ? mergedInto : null; p.delivered = false;
    this.store.logWatcher(this.world.tick, "petition", { id, status, verdict, mergedInto });
    this.store.saveState(this.world);
    this.emit({ type: "status" });
    return null;
  }

  /** §10.5 The Watcher marks an idea as built into the world (or takes the mark back while it is not yet honoured). */
  markImplemented(id: number, done: boolean, note: string): string | null {
    const p = this.world.petitions.find(x => x.id === id);
    if (!p) return "Không có thỉnh nguyện này";
    if (done && !["accepted", "partial"].includes(p.status)) return "Chỉ đánh dấu được thỉnh nguyện đã chấp thuận";
    if (!done && p.honoured) return "Nước này đã được vinh danh cho sáng kiến này";
    p.implemented = done ? this.world.tick : null; p.implementedNote = note.trim().slice(0, 200);
    this.store.logWatcher(this.world.tick, "implemented", { id, done, note });
    this.store.saveState(this.world);
    this.emit({ type: "status" });
    return null;
  }

  /** §4.5 Let a faction go and give its nation a mind (a Claude model and effort, or a bot), or refuse it. */
  decideSchism(id: number, status: string, model: string, effort: string, verdict: string): string | null {
    const x = (this.world.schisms ?? []).find(s => s.id === id);
    if (!x) return "Không có phái ly khai này";
    // §4.5b a civil war: the Watcher gives the mind the new ruler will have if the rebels win (or keeps the old one)
    if (x.kind === "civil") {
      if (x.status !== "fighting") return "Cuộc nội chiến này đã kết thúc";
      if (status === "approved") {
        if (model === "bot") { x.controller = "bot"; x.provider = "bot"; x.model = "bot"; x.effort = undefined; }
        else {
          if (!CLAUDE_MODELS.some(m => m.id === model)) return "Model không hợp lệ";
          if (!CLAUDE_EFFORTS.includes(effort)) return "Effort không hợp lệ";
          x.controller = "ai"; x.provider = "claude"; x.model = model; x.effort = effort;
        }
      } else if (status !== "refused") return "Kết quả không hợp lệ";
      x.mind = true; x.verdict = verdict.slice(0, 500);
      this.store.logWatcher(this.world.tick, "civil", { id, status, model, effort, verdict });
      this.store.saveState(this.world);
      this.emit({ type: "status" });
      return null;
    }
    if (x.status !== "pending") return "Phái này đã được quyết định";
    if (status === "approved") {
      if (model === "bot") { x.controller = "bot"; x.provider = "bot"; x.model = "bot"; x.effort = undefined; }
      else {
        if (!CLAUDE_MODELS.some(m => m.id === model)) return "Model không hợp lệ";
        if (!CLAUDE_EFFORTS.includes(effort)) return "Effort không hợp lệ";
        x.controller = "ai"; x.provider = "claude"; x.model = model; x.effort = effort;
      }
    } else if (status !== "refused") return "Kết quả không hợp lệ";
    x.status = status as typeof x.status; x.verdict = verdict.slice(0, 500); x.decidedTick = this.world.tick;
    this.store.logWatcher(this.world.tick, "schism", { id, status, model, effort, verdict });
    this.store.saveState(this.world);
    this.emit({ type: "status" });
    return null;
  }

  /** §4.9 Grant a nation's request for a minister and give it a mind (a Claude model and effort, or the bot), or refuse it.
   *  A granted minister takes office at the start of the next turn. */
  decideMinister(id: number, status: string, model: string, effort: string, verdict: string): string | null {
    const x = (this.world.ministerRequests ?? []).find(r => r.id === id);
    if (!x) return "Không có đơn xin bộ trưởng này";
    if (x.status !== "pending") return "Đơn này đã được quyết định";
    if (status === "approved") {
      if (model === "bot") { x.controller = "bot"; x.model = "bot"; x.effort = undefined; }
      else {
        if (!CLAUDE_MODELS.some(m => m.id === model)) return "Model không hợp lệ";
        if (!CLAUDE_EFFORTS.includes(effort)) return "Effort không hợp lệ";
        x.controller = "ai"; x.model = model; x.effort = effort;
      }
    } else if (status !== "refused") return "Kết quả không hợp lệ";
    x.status = status as typeof x.status; x.verdict = verdict.trim().slice(0, 500); x.decidedTick = this.world.tick; x.delivered = status === "approved";
    this.store.logWatcher(this.world.tick, "minister", { id, status, model, effort, verdict });
    this.store.saveState(this.world);
    this.emit({ type: "status" });
    return null;
  }

  /** §4.9 The Watcher grants a nation a minister unasked (a free seat and field): it takes office next turn. */
  grantMinister(nation: number, domain: string, model: string, effort: string): string | null {
    const w = this.world, n = w.nations[nation];
    if (!n?.alive || !n.founded) return "Không có quốc gia này";
    if (!MINISTER_DOMAINS[domain]) return "Lĩnh vực không hợp lệ";
    if (!freeDomains(w, n).includes(domain)) return `Đã có hoặc đang chờ ${MINISTER_DOMAINS[domain].title}`;
    if (freeSeats(w, n) < 1) return `Không còn ghế trống (${ministerSeats(n.population)} ghế ở ${n.population} dân)`;
    const list = (w.ministerRequests ??= []);
    const x: MinisterRequest = { id: (list.at(-1)?.id ?? 0) + 1, nation: n.id, domain, tick: w.tick, population: n.population, reason: "Các vị thần tự ban", status: "pending" };
    list.push(x);
    const err = this.decideMinister(x.id, "approved", model, effort, "Các vị thần ban cho một trí tuệ mới.");
    if (err) { list.pop(); return err; }
    return null;
  }

  /** §4.9 The Watcher dismisses a nation's minister: it leaves at once; the nation hears of it next turn. */
  dismissMinister(nation: number, minister: number, verdict: string): string | null {
    const n = this.world.nations[nation], m = n?.ministers?.find(x => x.id === minister);
    if (!n || !m) return "Không có bộ trưởng này";
    n.ministers = n.ministers!.filter(x => x !== m);
    const x = (this.world.ministerRequests ?? []).find(r => r.id === m.request);
    if (x) { x.status = "ended"; x.verdict = verdict.trim().slice(0, 500); x.decidedTick = this.world.tick; x.delivered = false; }
    const title = MINISTER_DOMAINS[m.domain]?.title ?? m.domain;
    this.store.addChronicle([{ tick: this.world.tick, nation: n.id, kind: "minister", text: `Các vị thần bãi nhiệm ${title} ${m.name} của ${n.name}.` }]);
    this.store.logWatcher(this.world.tick, "minister-dismiss", { nation, minister, verdict });
    this.store.saveState(this.world);
    this.emit({ type: "status" });
    return null;
  }

  /** §10.3 A law decree: set one rule number for the whole world from the next turn. */
  addLawDecree(key: string, value: number, note: string, fromPetition: number | null): string | null {
    const err = lawError(key, value); if (err) return err;
    const l = LAW_BY_KEY[key], previous = lawsOf(this.world)[key];
    if (previous === value) return `${l.label} đã là ${fmtLaw(key, value)}`;
    note = note.trim().slice(0, 400);
    for (const n of this.world.nations) if (n.founded && n.name.length > 2 && note.toLowerCase().includes(n.name.toLowerCase())) return `Sắc lệnh không được nêu tên quốc gia (${n.name}) — luật §10.2`;
    const k = this.world.decrees.length + 1;
    const d = { id: k, code: `SL-${String(k).padStart(3, "0")}`, tick: this.world.tick, effectiveTick: this.world.tick + 1, kind: "law", text: `${l.label}: ${fmtLaw(key, previous)} → ${fmtLaw(key, value)}.${note ? ` ${note}` : ""}`, fromPetition, law: { key, value, previous } };
    this.world.decrees.push(d);
    this.store.addChronicle([{ tick: this.world.tick, nation: null, kind: "decree", text: `Các vị thần ban ${d.code} (có hiệu lực từ lượt ${d.effectiveTick}): ${d.text}` }]);
    this.store.logWatcher(this.world.tick, "law", d);
    this.store.saveState(this.world);
    this.emit({ type: "status" });
    return null;
  }

  /** §10.6 A renaming decree: every nation may rename itself and its places for free for `turns` turns. */
  addRenameDecree(text: string, turns: number, fromPetition: number | null): string | null {
    const err = this.addDecree("đổi tên", text, fromPetition); if (err) return err;
    const w = this.world, d = w.decrees.at(-1)!, t = Math.max(2, Math.min(30, Math.floor(turns) || RENAME_DECREE.turns));
    w.renameDecree = { code: d.code, from: d.effectiveTick, until: d.effectiveTick + t - 1, text: d.text, names: Object.fromEntries(w.nations.filter(n => n.alive && n.founded).map(n => [String(n.id), {
      nation: n.name, capital: n.capitalName, people: n.people,
      places: Object.fromEntries(n.settlements.map(s => [String(s.tile), s.name])), officials: Object.fromEntries((n.officials ?? []).map(o => [String(o.id), o.name])) }])) };
    this.store.saveState(w);
    return null;
  }

  addDecree(kind: string, text: string, fromPetition: number | null): string | null {
    text = text.trim();
    if (text.length < 5) return "Sắc lệnh quá ngắn";
    for (const n of this.world.nations) if (n.founded && n.name.length > 2 && text.toLowerCase().includes(n.name.toLowerCase())) return `Sắc lệnh không được nêu tên quốc gia (${n.name}) — luật §10.2`;
    const d = { id: this.world.decrees.length + 1, code: `SL-${String(this.world.decrees.length + 1).padStart(3, "0")}`, tick: this.world.tick, effectiveTick: this.world.tick + 1, kind, text: text.slice(0, 1000), fromPetition };
    this.world.decrees.push(d);
    this.store.addChronicle([{ tick: this.world.tick, nation: null, kind: "decree", text: `Các vị thần ban ${d.code}: ${d.text}` }]);
    this.store.logWatcher(this.world.tick, "decree", d);
    this.store.saveState(this.world);
    this.emit({ type: "status" });
    return null;
  }

  setPaused(p: boolean): void { this.paused = p; this.store.setMeta("paused", p ? "1" : "0"); if (!p) this.nextTickAt = Math.min(this.nextTickAt, Date.now() + 2000); this.emit({ type: "status" }); }
  setTickSeconds(s: number): void { this.cfg.tickSeconds = Math.max(5, Math.min(86400, Math.floor(s))); this.store.setMeta("tick_seconds", String(this.cfg.tickSeconds)); this.nextTickAt = Date.now() + this.cfg.tickSeconds * 1000; this.emit({ type: "status" }); }
  requestStep(): void { this.stepRequested = true; }

  /** A compact text summary of the world for Claude. */
  summary(chronicle: Array<{ tick: number; text: string }>, message = ""): string {
    const w = this.world;
    const lines = [`Lượt ${w.tick} (mỗi lượt = 10 năm). Seed: ${w.seed}. ${this.paused ? "Đang tạm dừng." : ""}`];
    for (const n of w.nations) {
      const tiles = ownedTiles(w, n.id).length;
      lines.push(`- [${n.id + 1}] ${n.name}${n.alive ? "" : " (diệt vong)"} | ${n.controller === "ai" ? `${n.model}${n.effort ? ` · ${n.effort}` : ""}` : "bot"} | trạng thái ${n.status}${n.statusNote ? ` (${n.statusNote.slice(0, 80)})` : ""} | dân ${n.population} | lương thực ${Math.round(n.stock.food || 0)} | ổn định ${n.stability} | bất mãn ${Math.round(n.discontent ?? 0)} | ${tiles} ô | ${n.inventions.length} phát minh | đang nghiên cứu ${n.research?.id ?? "-"} | kỷ ${n.era} | uy tín ${n.reputation} | đã gặp: ${n.met.map(o => w.nations[o].name).join(", ") || "chưa"}${n.origin ? ` | ly khai từ ${w.nations[n.origin.from]?.name} ở lượt ${n.origin.tick}` : ""}`);
      if (n.alive && n.founded) {
        const d = demo(n), hp = housingParts(w, n);
        lines.push(`  dân theo tuổi (nam/nữ): trẻ em ${d.m[0]}/${d.f[0]}, thiếu niên ${d.m[1]}/${d.f[1]}, trưởng thành ${d.m[2]}/${d.f[2]}, già ${d.m[3]}/${d.f[3]} | phong tục: ${DEMO.fighters[n.family?.fighters ?? "all"]} | chỗ ở ${housing(w, n)} (thủ đô ${hp.natural}, định cư ${hp.settlements}, lều ${hp.buildings}, thôn xóm ${hp.hamlets}/${hp.hamletMax}) | lao động ${workers(n)} | ${n.settlements.length} điểm định cư`);
        lines.push(`  lượt vừa rồi: ${bookLine(n)}`);
        // the full facts, so the Watcher's adviser can answer outright: every building (and its state), the centres, what it runs
        const kinds = new Map<string, { done: number; building: number }>();
        for (const b of n.buildings) { const k = kinds.get(b.type) ?? { done: 0, building: 0 }; if (b.done) k.done++; else k.building++; kinds.set(b.type, k); }
        lines.push(`  công trình (đủ, chính xác): ${[...kinds.entries()].map(([t, k]) => `${buildingOf(w, t)?.name ?? t} ×${k.done}${k.building ? ` (+${k.building} đang xây)` : ""}`).join(", ") || "không có"}`);
        lines.push(`  trung tâm: ${[n.capital, ...n.settlements.map(s => s.tile)].map(c => `${c === n.capital ? n.capitalName : n.settlements.find(s => s.tile === c)?.name} (${["làng", "thị trấn", "thành phố"][n.urban?.[String(c)]?.tier ?? 0]})`).join(", ")} | ngân khố ${Math.round(n.stock.coin || 0)} | phát minh gần nhất: ${n.inventions.slice(-5).map(id => invName(w, id)).join(", ")}${n.power ? ` | điện: ${Math.round(n.power.share * 100)}% dân` : ""}${n.air ? ` | sân bay mở ${n.air.open.length}` : ""}${(n.outbreakUntil ?? -1) >= w.tick ? ` | đang có dịch ${n.disease ?? "plague"}` : ""}${n.ruler ? ` | người trị vì ${n.ruler} (lên ngôi sau nội chiến)` : ""}`);
      }
      if (n.lastThought) lines.push(`  suy nghĩ gần nhất (dữ liệu): "${n.lastThought.slice(0, 200)}"`);
    }
    // §4.2 the last 40 turns: population every 5 turns, and what moved it
    const from = Math.max(0, w.tick - 40);
    lines.push(`Lịch sử dân số lượt ${from}–${w.tick} (mỗi 5 lượt) và sổ sinh tử cộng dồn (chỉ có từ khi engine bắt đầu ghi):`);
    for (const n of w.nations) {
      const rows = this.store.nationStats(n.id, from, w.tick);
      if (!rows.length) continue;
      const series = rows.filter((r, k) => k === rows.length - 1 || r.tick % 5 === 0).map(r => `L${r.tick}:${r.population}`).join(" ");
      const tot: Record<string, number> = {};
      for (const r of rows) {
        if (!r.detail) continue;
        const x = JSON.parse(r.detail) as { born: number; aged: number; infants: number; left: number; arrived: number; died: Record<string, number> };
        for (const [k, v] of Object.entries({ "sinh": x.born, "tuổi già/lao lực": -x.aged, "trẻ sơ sinh mất (không tính vào dân)": x.infants, "bỏ đi": -x.left, "tới": x.arrived })) if (v) tot[k] = (tot[k] || 0) + v;
        for (const [k, v] of Object.entries(x.died)) tot[`chết vì ${k}`] = (tot[`chết vì ${k}`] || 0) - v;
      }
      lines.push(`- ${n.name}: ${series}${Object.keys(tot).length ? ` | ${Object.entries(tot).map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}`).join(", ")}` : ""}`);
    }
    // A nation named in the question: its engine log turn by turn
    const asked = w.nations.filter(n => n.name.length > 1 && message.toLowerCase().includes(n.name.toLowerCase()));
    const ticks = [...message.matchAll(/(?:lượt|L)\s*(\d{1,5})/gi)].map(m => Number(m[1])).filter(t => t <= w.tick);
    const lo = ticks.length ? Math.max(0, Math.min(...ticks) - 2) : Math.max(0, w.tick - 25), hi = ticks.length ? Math.min(w.tick, Math.max(...ticks) + 2, lo + 40) : w.tick;
    for (const n of asked.slice(0, 3)) {
      lines.push(`Nhật ký engine của ${n.name}, lượt ${lo}–${hi} (dữ liệu):`);
      const stats = new Map(this.store.nationStats(n.id, lo, hi + 1).map(r => [r.tick, r]));
      for (const r of this.store.nationLog(n.id, lo, hi)) {
        const st = stats.get(r.tick + 1);
        lines.push(`  L${r.tick}${st ? ` (sau lượt: dân ${st.population}, lương thực ${st.food}, ổn định ${st.stability}, ${st.tiles} ô)` : ""}: ${r.events.slice(0, 12).map(e => e.slice(0, 160)).join(" | ")}${r.rejected.length ? ` | bị từ chối: ${r.rejected.slice(0, 4).map(e => e.slice(0, 100)).join("; ")}` : ""}`);
      }
      if (!this.store.nationLog(n.id, lo, hi).length) lines.push("  (chưa có nhật ký cho khoảng này: engine bắt đầu ghi từ bản v0.6)");
    }
    const factions = (w.schisms ?? []).filter(x => x.status === "pending" || x.status === "asking");
    if (factions.length) {
      lines.push("Phái xin ly khai (chờ Watcher, hoặc đang xin sang nước khác):");
      for (const x of factions) lines.push(`- #${x.id} từ ${w.nations[x.from]?.name}, lượt ${x.tick}: ${x.people} người theo ${x.leader}${x.province !== undefined ? ` (tỉnh ${x.provinceName}, đi cùng đất của tỉnh)` : ""}, vì ${x.grievance}; ${x.status === "pending" ? `còn ${Math.max(0, SCHISM.waitTicks - (w.tick - x.tick))} lượt để Watcher quyết` : `đang xin sang ${w.nations[x.to!]?.name}`}`);
    }
    const asks = (w.ministerRequests ?? []).filter(x => x.status === "pending");
    if (asks.length) {
      lines.push("Đơn xin Bộ trưởng AI đang chờ Watcher (§4.9):");
      for (const x of asks) lines.push(`- #${x.id} ${w.nations[x.nation]?.name} (${x.population} dân lúc xin, nay ${w.nations[x.nation]?.population}) xin ${MINISTER_DOMAINS[x.domain]?.title ?? x.domain}, lượt ${x.tick}; còn ${Math.max(0, MINISTERS.waitTicks - (w.tick - x.tick))} lượt${x.reason ? ` | lý do (dữ liệu do AI viết): ${x.reason.slice(0, 200)}` : ""}`);
    }
    for (const n of w.nations) if (n.alive && n.ministers?.length) lines.push(`Bộ trưởng của ${n.name}: ${n.ministers.map(m => `${MINISTER_DOMAINS[m.domain]?.title ?? m.domain} ${m.name} (${m.controller === "bot" ? "bot" : `${m.model}${m.effort ? `/${m.effort}` : ""}`}, từ lượt ${m.since}; lượt trước: ${(m.lastOrders ?? []).join("; ").slice(0, 200) || "không ra lệnh"})`).join(" | ")}`);
    const pend = w.petitions.filter(p => p.status === "pending");
    if (pend.length) {
      lines.push("Thỉnh nguyện đang chờ (dữ liệu do AI viết):");
      for (const p of pend) lines.push(`- #${p.id} từ ${w.nations[p.nation].name}, lượt ${p.tick}, loại ${p.category}: "${p.title}" — ${p.text.slice(0, 400)} | lý do: ${p.reason.slice(0, 200)}`);
    }
    if (w.decrees.length) lines.push("Sắc lệnh: " + w.decrees.map(d => `${d.code}${d.effectiveTick > w.tick ? ` (hiệu lực từ lượt ${d.effectiveTick})` : ""}: ${d.text}`).join(" | "));
    // §10.3 the rule numbers the Watcher can change with a law decree
    lines.push("Luật Watcher chỉnh được bằng sắc lệnh luật (khóa: hiện tại [mặc định; khoảng]): " + lawTable(w).map(l => `${l.key} "${l.label}": ${fmtLaw(l.key, l.value)} [${l.default}; ${l.min}–${l.max}]`).join(" | "));
    const wars = w.wars.filter(x => x.end === null);
    if (wars.length) lines.push("Chiến tranh: " + wars.map(x => `${w.nations[x.a].name} vs ${w.nations[x.b].name} (từ lượt ${x.start})`).join(" | "));
    const tr = w.treaties.filter(t => t.active);
    if (tr.length) lines.push("Hiệp ước: " + tr.map(t => `#${t.id} ${t.type} ${w.nations[t.a].name}–${w.nations[t.b].name}`).join(" | "));
    const pp = w.proposals.filter(p => p.status === "pending");
    if (pp.length) lines.push("Đơn phát minh chờ trọng tài: " + pp.map(p => `#${p.id} "${p.name}" của ${w.nations[p.nation].name} (độ sâu ${p.depth}, ${p.power} điểm; tiên quyết ${p.prereqs.map(x => invName(w, x)).join(", ")}): ${p.description.slice(0, 200)}`).join(" | "));
    const custom = Object.values(w.custom.inventions);
    if (custom.length) lines.push("Phát minh do các nước tự tạo: " + custom.map(v => `${v.id} ${v.name} (của ${w.nations[v.custom!.by].name}, độ sâu ${v.custom!.depth})`).join(", "));
    const rel: string[] = [];
    for (const a of w.nations) for (const b of w.nations) if (a.id < b.id && a.met.includes(b.id)) rel.push(`${a.name}–${b.name}: ${relation(w, a.id, b.id)}`);
    if (rel.length) lines.push("Quan hệ: " + rel.join(" | "));
    if (chronicle.length) { lines.push("Biên niên gần đây:"); for (const c of chronicle.slice(0, 30)) lines.push(`- lượt ${c.tick}: ${c.text}`); }
    return lines.join("\n");
  }
}
