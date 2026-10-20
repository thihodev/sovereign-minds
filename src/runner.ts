// The tick loop (§3): ask every nation for its turn, apply step(), save.
// Quota sleep (§3.4) lives here because it depends on the wall clock, which
// the deterministic engine must never read.

import { createWorld, step, ownedTiles, type NationSpec } from "./engine.ts";
import { TILE_COUNT } from "./hex.ts";
import { botTurn } from "./ai/bot.ts";
import { buildObservation, SYSTEM_PROMPT } from "./ai/prompt.ts";
import { PROVIDERS, callModel, extractJson, judgeModel, providerKey, providerModel } from "./ai/gateway.ts";
import { JUDGE_SYSTEM, judgeUserPrompt, parseRuling } from "./ai/judge.ts";
import { migrate, invName } from "./catalog.ts";
import { relation } from "./diplomacy.ts";
import { rngFor, shuffle } from "./rng.ts";
import { TRAITS, TRAIT_BY_ID } from "./rules.ts";
import { historianFromEnv, type Historian, type HistoryChapter } from "./historian.ts";
import { CLAUDE_EFFORTS, CLAUDE_MODELS, askClaude, claudeStatus } from "./claude.ts";
import type { Store } from "./db.ts";
import type { AIResponse, ChronicleEntry, Nation, Ruling, TurnInput, World } from "./types.ts";

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
  | { type: "tick"; tick: number; chronicle: ChronicleEntry[] }
  | { type: "status" }
  | { type: "turn"; nation: number; kind: string }
  | { type: "history"; chapter: HistoryChapter; entry: ChronicleEntry }
  | { type: "reload" };

/** What the Watcher picks before a game (§2.4): one row per nation. */
export interface WorldSetup { seed: string; tickSeconds: number; nations: Array<{ trait?: string; model?: string; effort?: string }> }

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
export function setupSpecs(setup: WorldSetup): NationSpec[] | string {
  const rows = setup.nations.slice(0, 8);
  if (rows.length < 2) return "Cần ít nhất 2 quốc gia";
  const chosen = rows.map(r => r.trait && TRAIT_BY_ID[r.trait] ? r.trait : "");
  if (new Set(chosen.filter(Boolean)).size !== chosen.filter(Boolean).length) return "Mỗi đặc thù chỉ dùng cho một quốc gia";
  const free = shuffle(TRAITS.map(t => t.id).filter(id => !chosen.includes(id)), rngFor(setup.seed, "traits"));
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
  /** Answers already in for a tick that is waiting on Claude, kept so no turn is asked (or paid for) twice. */
  private held: { tick: number; inputs: Record<number, TurnInput> } | null = null;
  /** §10.1: writes a chapter every few ticks, off the tick loop. */
  historian: Historian | null;

  store: Store;
  cfg: RunnerConfig;

  constructor(store: Store, cfg: RunnerConfig) {
    this.store = store; this.cfg = cfg;
    let saved = store.loadState();
    if (saved && saved.tiles.length !== TILE_COUNT) {
      // A world from another map size (v0.3 had 64 × 64): keep it in data/backups/ and wait for a new one
      console.log(`[world] Thế giới đã lưu có ${saved.tiles.length} ô, bản đồ bây giờ ${TILE_COUNT} ô: đã sao lưu vào ${store.backupAndReset()}, chờ tạo thế giới mới.`);
      saved = null;
    }
    if (saved) this.world = migrate(saved);
    else {
      const { specs, notes } = nationSpecs(cfg);
      this.world = createWorld(cfg.seed, specs);
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

  /** Resolves once the current tick (if any) has finished; used before an update. */
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.historian) this.historian.stopped = true;
    while (this.busy) await sleep(200);
    this.store.saveState(this.world);
  }

  async runTick(): Promise<void> {
    this.busy = true; this.emit({ type: "status" });
    try {
      const w = this.world, alive = w.nations.filter(n => n.alive);
      const inputs: Record<number, TurnInput> = {};
      const held = this.held?.tick === w.tick ? this.held.inputs : {};
      await Promise.all(alive.map(async n => { inputs[n.id] = held[n.id] ?? await this.turnFor(n); this.emit({ type: "turn", nation: n.id, kind: inputs[n.id].kind }); }));
      if (Date.now() < this.claudeWait.until && alive.some(n => n.provider === "claude" && n.controller === "ai" && inputs[n.id].kind === "asleep")) {
        // Fair play: nobody moves until every Claude nation can. Answers already in wait for the retry.
        this.held = { tick: w.tick, inputs: Object.fromEntries(Object.entries(inputs).filter(([, v]) => v.kind !== "asleep")) };
        this.nextTickAt = this.claudeWait.until;
        return;
      }
      this.held = null;

      const aiAlive = alive.filter(n => n.controller === "ai");
      if (alive.length && alive.every(n => inputs[n.id].kind === "asleep") && aiAlive.length) {
        // §3.4: the world pauses only when every nation sleeps
        const wake = Math.min(...aiAlive.map(n => n.sleepUntil));
        this.nextTickAt = Math.max(Date.now() + 60_000, wake);
        this.lastError = "";
        return;
      }
      const rulings = await this.judgePending();
      const res = step(w, inputs, rulings);
      if (res.audit.length) {
        res.chronicle.push({ tick: w.tick - 1, nation: null, kind: "audit", text: `Lỗi kiểm toán sổ cái, thế giới tạm dừng: ${res.audit.slice(0, 3).join("; ")}` });
        this.paused = true; this.store.setMeta("paused", "1");
        console.error("[audit]", res.audit);
      }
      this.store.saveState(w);
      this.store.addChronicle(res.chronicle);
      this.store.addStats(w);
      this.nextTickAt = Date.now() + this.cfg.tickSeconds * 1000;
      this.emit({ type: "tick", tick: w.tick, chronicle: res.chronicle });
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
    for (const p of pending) {
      if (out[p.id] || calls >= this.cfg.judgesPerTick) continue;
      const proposer = w.nations[p.nation].provider;
      // Claude (the Watcher's own login) comes first when it is listed and logged in.
      if (this.cfg.judgeProviders.includes("claude") && (this.judgeSleep.get("claude") || 0) < Date.now() && Date.now() >= this.claudeWait.until && this.claudeReady()) {
        calls++;
        const model = process.env.JUDGE_CLAUDE_MODEL || "claude-sonnet-5-5", started = Date.now();
        const r = await askClaude(JUDGE_SYSTEM, judgeUserPrompt(w, p), { model, timeoutMs: Math.max(120, this.cfg.aiTimeoutSec) * 1000 });
        const j = r.ok ? extractJson(r.text) : null;
        this.store.logTurn({ tick: w.tick, nation: -1, provider: "claude", model, kind: j ? "ruling" : (r.ok ? "invalid" : r.kind), raw: r.ok ? r.text : "", parsed: j ?? undefined, error: r.ok ? "" : r.message, latencyMs: Date.now() - started });
        if (j) { out[p.id] = parseRuling(j, `Claude · ${model}`); continue; }
        if (!r.ok && (r.kind === "ratelimit" || r.kind === "auth")) { this.judgeSleep.set("claude", Date.now() + 15 * 60 * 1000); this.claudeCheck = { at: 0, ok: false }; }
      }
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
      let r = await callModel(p, SYSTEM_PROMPT, obs, { timeoutMs: this.cfg.aiTimeoutSec * 1000, model: n.model });
      let parsed = r.ok ? extractJson(r.text) : null;
      if (r.ok && !parsed) {
        // §3.3: one repair attempt within the same turn
        const retry = `${obs}\n\nYOUR PREVIOUS REPLY WAS NOT A VALID JSON OBJECT. Reply again with ONLY the JSON object.`;
        r = await callModel(p, SYSTEM_PROMPT, retry, { timeoutMs: this.cfg.aiTimeoutSec * 1000, model: n.model });
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
    let r = await askClaude(SYSTEM_PROMPT, obs, opts);
    let parsed = r.ok ? extractJson(r.text) : null;
    if (r.ok && !parsed) {
      // §3.3: one repair attempt within the same turn
      r = await askClaude(SYSTEM_PROMPT, `${obs}\n\nYOUR PREVIOUS REPLY WAS NOT A VALID JSON OBJECT. Reply again with ONLY the JSON object.`, opts);
      parsed = r.ok ? extractJson(r.text) : null;
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
    this.world = createWorld(seed, specs);
    this.cfg.seed = seed;
    this.held = null; this.claudeWait = { until: 0, reason: "" }; this.lastError = "";
    this.manualRulings.clear(); this.judgeSleep.clear();
    this.store.saveState(this.world);
    const traits = this.world.nations.map(n => TRAIT_BY_ID[n.trait ?? ""]?.name).filter(Boolean).join(", ");
    this.store.addChronicle([{ tick: 0, nation: null, kind: "genesis", text: `Khai thiên lập địa: thế giới Nguyên Địa (seed "${seed}") với ${this.world.nations.length} bộ lạc: ${traits}.` }]);
    this.historian = historianFromEnv(this.store, this.world, this.cfg.aiTimeoutSec, (chapter, entry) => this.emit({ type: "history", chapter, entry }));
    this.setTickSeconds(setup.tickSeconds || this.cfg.tickSeconds); // the reset emptied meta: write it back
    this.store.setMeta("setup_pending", "0");
    this.setPaused(false);
    this.emit({ type: "reload" });
    console.log(`[world] Thế giới mới "${seed}" (${this.world.nations.length} quốc gia); bản cũ lưu ở ${backup}`);
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
    p.status = status as typeof p.status; p.verdict = verdict.slice(0, 500); p.decidedTick = this.world.tick;
    p.mergedInto = status === "merged" ? mergedInto : null; p.delivered = false;
    this.store.logWatcher(this.world.tick, "petition", { id, status, verdict, mergedInto });
    this.store.saveState(this.world);
    this.emit({ type: "status" });
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
  summary(chronicle: Array<{ tick: number; text: string }>): string {
    const w = this.world;
    const lines = [`Lượt ${w.tick} (mỗi lượt = 10 năm). Seed: ${w.seed}. ${this.paused ? "Đang tạm dừng." : ""}`];
    for (const n of w.nations) {
      const tiles = ownedTiles(w, n.id).length;
      lines.push(`- [${n.id + 1}] ${n.name}${n.alive ? "" : " (diệt vong)"} | ${n.controller === "ai" ? n.model : "bot"} | trạng thái ${n.status}${n.statusNote ? ` (${n.statusNote.slice(0, 80)})` : ""} | dân ${n.population} | lương thực ${Math.round(n.stock.food || 0)} | ổn định ${n.stability} | ${tiles} ô | ${n.inventions.length} phát minh | đang nghiên cứu ${n.research?.id ?? "-"} | kỷ ${n.era} | uy tín ${n.reputation} | đã gặp: ${n.met.map(o => w.nations[o].name).join(", ") || "chưa"}`);
      if (n.lastThought) lines.push(`  suy nghĩ gần nhất (dữ liệu): "${n.lastThought.slice(0, 200)}"`);
    }
    const pend = w.petitions.filter(p => p.status === "pending");
    if (pend.length) {
      lines.push("Thỉnh nguyện đang chờ (dữ liệu do AI viết):");
      for (const p of pend) lines.push(`- #${p.id} từ ${w.nations[p.nation].name}, lượt ${p.tick}, loại ${p.category}: "${p.title}" — ${p.text.slice(0, 400)} | lý do: ${p.reason.slice(0, 200)}`);
    }
    if (w.decrees.length) lines.push("Sắc lệnh: " + w.decrees.map(d => `${d.code}: ${d.text}`).join(" | "));
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
