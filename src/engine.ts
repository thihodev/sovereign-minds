// The World Engine: the only thing that changes the world (§1, rule 1).
// step(world, inputs, rulings) applies one tick. It is deterministic: the same
// world, inputs, judge rulings and seed always give the same result.

import { NEIGHBORS, TILE_COUNT, col, row, dist, within, inBounds, idx } from "./hex.ts";
import { rngFor, shuffle, pickOne, type Rand } from "./rng.ts";
import {
  AP_COST, BRONZE_CAPS, CLAIM_FOOD, ERAS, EVENTS, FLAG_LAYOUTS, FLAG_MIN_DELTA_E, FLAG_SYMBOLS, FOOD_PER_PERSON,
  FORBIDDEN_NAME_WORDS, GROWTH_RATE, GROWTH_SURPLUS, HIDDEN_ORES, HUNT_TOOLS, INTEL_DECAY_TICKS, MAX_ROLE_BONUS, NOT_YET,
  ORE_SENSE_CAP, PETITION, REGEN, ROLE_RESOURCE, SETTLEMENT, SPOILAGE, SPY, START, TILE_LIMIT_BASE, TOOL_LIFE, WORKER_SHARE,
  YIELD, apFor,
} from "./rules.ts";
import { allBuildings, allInventions, applyRuling, buildingOf, checkProposal, depthOf, goodName, inv, invName, recipeOf } from "./catalog.ts";
import { activeWar, doDiplomacy, resolveBattles, resolveRelations, treatiesBetween, type DiploCtx } from "./diplomacy.ts";
import { generateWorld } from "./worldgen.ts";
import { ROLES, type ChronicleEntry, type Nation, type ResKey, type Role, type Ruling, type Tile, type TurnInput, type World } from "./types.ts";

// ---------------------------------------------------------------- ledger

/** Every change to a tile reserve, a stock or a caravan goes through here, so
 *  the end-of-tick audit proves nothing appeared or vanished unrecorded. */
export class Ledger {
  before: Record<string, number>;
  flows: Record<string, number> = {};
  reasons: Record<string, number> = {};
  constructor(world: World) { this.before = totals(world); }
  tile(t: Tile, key: ResKey, delta: number, reason: string): void {
    if (!delta) return;
    t.res[key] = (t.res[key] || 0) + delta;
    this.note(key, delta, reason);
  }
  stock(n: Nation, key: string, delta: number, reason: string): void {
    if (!delta) return;
    n.stock[key] = (n.stock[key] || 0) + delta;
    if (Math.abs(n.stock[key]) < 1e-9) n.stock[key] = 0;
    this.note(key, delta, reason);
  }
  /** Goods taken from a stock now ride in a caravan. */
  toCaravan(g: Record<string, number>): void { for (const [k, q] of Object.entries(g)) this.note(k, q, "caravan"); }
  /** Goods leave a caravan (delivered or spoiled). */
  caravanLoss(key: string, q: number): void { this.note(key, -q, "caravan"); }
  private note(key: string, delta: number, reason: string): void {
    this.flows[key] = (this.flows[key] || 0) + delta;
    this.reasons[`${key}:${reason}`] = (this.reasons[`${key}:${reason}`] || 0) + delta;
  }
  audit(world: World): string[] {
    const after = totals(world), errors: string[] = [];
    const keys = new Set([...Object.keys(after), ...Object.keys(this.before), ...Object.keys(this.flows)]);
    for (const k of keys) {
      const expect = (this.before[k] || 0) + (this.flows[k] || 0), got = after[k] || 0;
      if (Math.abs(expect - got) > 1e-6 * Math.max(1, Math.abs(expect))) errors.push(`${k}: expected ${expect.toFixed(4)} got ${got.toFixed(4)}`);
      if (got < -1e-6) errors.push(`${k}: negative total ${got}`);
    }
    return errors;
  }
}

export function totals(world: World): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (k: string, v: number) => { out[k] = (out[k] || 0) + (v || 0); };
  for (const t of world.tiles) for (const [k, v] of Object.entries(t.res)) add(k, v || 0);
  for (const n of world.nations) for (const [k, v] of Object.entries(n.stock)) add(k, v);
  for (const c of world.caravans || []) for (const [k, v] of Object.entries(c.goods)) add(k, v);
  return out;
}

// ---------------------------------------------------------------- creation

export interface NationSpec { controller: "ai" | "bot"; provider: string; model: string }

export function createWorld(seed: string, specs: NationSpec[]): World {
  const gen = generateWorld(seed, specs.length);
  const nations: Nation[] = specs.slice(0, gen.spawns.length).map((spec, k) => newNation(k, spec, gen.spawns[k]));
  const world: World = {
    version: 1, seed, tick: 0, tiles: gen.tiles, nations, wonders: gen.wonders, rivers: gen.rivers, herd: gen.herd,
    wild: gen.wild, registry: {}, nextBuildingId: 1, spies: [], nextSpyId: 1, petitions: [], decrees: [],
    custom: { inventions: {}, recipes: {}, buildings: {}, goods: {}, next: 1 }, proposals: [],
    treaties: [], treatyOffers: [], tradeOffers: [], caravans: [], wars: [], battles: [], nextId: 1, cutoff: {}, eraGates: {},
  };
  for (const n of nations) {
    for (const j of within(n.capital, 1)) world.tiles[j].owner = n.id;
    n.seen = within(n.capital, START.sightRadius);
  }
  return world;
}

function newNation(id: number, spec: NationSpec, capital: number): Nation {
  const labor = Object.fromEntries(ROLES.map(r => [r, 0])) as Record<Role, number>;
  labor.hunt = 7; labor.gather = 4; labor.research = 2; labor.craft = 1;
  return {
    id, controller: spec.controller, provider: spec.provider, model: spec.model,
    founded: false, name: `Bộ lạc ${id + 1}`, capitalName: "", people: "", flag: { layout: "plain", colors: ["#888888", "#ffffff"], symbol: "circle" }, manifesto: "",
    capital, alive: true, population: START.population, labor, crafts: {}, stock: { ...START.stock },
    stability: START.stability, reputation: START.reputation, inventions: [...START.inventions], research: null,
    buildings: [], seen: [], met: [], memory: "", lastThought: "", toolWear: 0, silentStreak: 0, riot: false, era: ERAS.paleo,
    status: "active", sleepUntil: 0, sleepBackoffMin: 0, statusNote: "",
    stats: { calls: 0, ok: 0, invalid: 0, asleepTicks: 0, silentTicks: 0 },
    lastRejected: [], lastEvents: [], eventTimers: {}, intel: {}, casusBelli: {},
    settlements: [], trades: {}, mineTarget: "", peakPopulation: START.population, inbox: [],
  };
}

// ---------------------------------------------------------------- derived values

export interface Mods {
  role: Record<string, number>;
  foodPerPerson: number;
  ap: number;
  tiles: number;
  rp: number;
  spoilage: number;
  spoilageCut: number;
  stabilityPerTick: number;
  combat: number;
  winter: number;
  caps: Set<string>;
  unlocked: Set<string>;
  move: Set<string>;
  reveal: Set<string>;
}

export function mods(world: World, n: Nation): Mods {
  const m: Mods = { role: {}, foodPerPerson: FOOD_PER_PERSON, ap: 0, tiles: 0, rp: 0, spoilage: SPOILAGE.food, spoilageCut: 0, stabilityPerTick: 0, combat: 0, winter: 1, caps: new Set(), unlocked: new Set(), move: new Set(), reveal: new Set() };
  for (const id of n.inventions) {
    const v = inv(world, id); if (!v) continue;
    for (const c of v.caps) m.caps.add(c);
    const e = v.effects;
    for (const [r, x] of Object.entries(e.role || {})) m.role[r] = (m.role[r] || 0) + (x || 0);
    if (e.foodPerPerson) m.foodPerPerson = Math.min(m.foodPerPerson, e.foodPerPerson);
    m.ap += e.ap || 0; m.tiles += e.tiles || 0; m.rp += e.rp || 0;
    m.spoilageCut += e.spoilageCut || 0; m.stabilityPerTick += e.stabilityPerTick || 0; m.combat += e.combat || 0;
    if (e.spoilage !== undefined) m.spoilage = Math.min(m.spoilage, e.spoilage);
    if (e.winter !== undefined) m.winter *= e.winter;
    for (const u of e.unlocks || []) m.unlocked.add(u);
    for (const t of e.move || []) m.move.add(t);
    for (const r of e.reveal || []) m.reveal.add(r);
  }
  if (m.caps.has(ORE_SENSE_CAP)) for (const r of HIDDEN_ORES) m.reveal.add(r);
  if (m.caps.has("đi-nước")) m.move.add("shallow");
  if (ownsWonder(world, n, "falls")) m.rp += 0.2;
  return m;
}

function roleBonus(m: Mods, r: Role): number {
  const extract = ["wood", "stone", "flint", "clay", "mine"].includes(r) ? (m.role.extract || 0) : 0;
  return (m.role[r] || 0) + extract;
}

export function ownedTiles(world: World, nid: number): Tile[] {
  return world.tiles.filter(t => t.owner === nid);
}
function ownsWonder(world: World, n: Nation, key: string): boolean {
  const w = world.wonders.find(x => x.key === key);
  return !!w && world.tiles[w.i].owner === n.id;
}
function doneEffect(world: World, n: Nation, key: "housing" | "stability" | "spoilage" | "craftSlots"): number {
  let sum = 0;
  for (const b of n.buildings) if (b.done) sum += buildingOf(world, b.type)?.effect[key] || 0;
  return sum;
}
export function workers(n: Nation): number { return Math.floor(n.population * WORKER_SHARE); }
export function housing(world: World, n: Nation): number {
  return START.naturalHousing + n.settlements.length * SETTLEMENT.housing + doneEffect(world, n, "housing") + (ownsWonder(world, n, "cave") ? 50 : 0);
}
export function tileLimit(world: World, n: Nation): number {
  return TILE_LIMIT_BASE + Math.floor(n.population / 10) + mods(world, n).tiles + n.settlements.length * 3;
}
export function actionPoints(world: World, n: Nation): number { return apFor(n.population, mods(world, n).ap); }
export function canSeeRes(world: World, n: Nation, key: string): boolean {
  return !(HIDDEN_ORES as string[]).includes(key) || mods(world, n).reveal.has(key);
}

/** §7.5 diffusion: knowing someone who has it makes it cheaper (best discount only). */
export function inventionCost(world: World, n: Nation, id: string): number {
  const v = inv(world, id); if (!v) return Infinity;
  let discount = 0;
  for (const o of n.met) {
    const other = world.nations[o];
    if (!other?.inventions.includes(id)) continue;
    let d = 0.2;
    if ((n.trades[String(o)] || 0) >= 5) d = 0.4;
    if (treatiesBetween(world, n.id, o, ["alliance"]).length) d = 0.6;
    discount = Math.max(discount, d);
  }
  if (v.custom?.by === n.id) discount = Math.max(discount, 0.2);
  return Math.ceil(v.rp * (1 - discount));
}

export function envOk(world: World, n: Nation, id: string): boolean {
  const env = inv(world, id)?.env; if (!env) return true;
  const owned = ownedTiles(world, n.id);
  if (env.res && !owned.some(t => (t.cap[env.res!] || 0) > 0)) return false;
  if (env.terrains && !owned.some(t => env.terrains!.includes(t.terrain) || (env.river && t.river))) return false;
  return true;
}

export function researchOptions(world: World, n: Nation): string[] {
  return allInventions(world).filter(v => !n.inventions.includes(v.id) && v.prereqs.every(p => n.inventions.includes(p)) && envOk(world, n, v.id)).map(v => v.id);
}

// ---------------------------------------------------------------- flags & names

function hexToLab(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const r = lin((v >> 16) & 255), g = lin((v >> 8) & 255), b = lin(v & 255);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, y = r * 0.2126 + g * 0.7152 + b * 0.0722, z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
export function deltaE(a: string, b: string): number {
  const p = hexToLab(a), q = hexToLab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
export function normName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]/g, "");
}
const HEX = /^#[0-9a-fA-F]{6}$/;

function validateFounding(world: World, n: Nation, a: Record<string, unknown>): string | null {
  const name = String(a.name ?? "").trim(), cap = String(a.capital ?? "").trim(), people = String(a.people ?? "").trim();
  const flag = (a.flag ?? {}) as Record<string, unknown>;
  for (const [label, v] of [["Tên quốc gia", name], ["Tên thủ đô", cap], ["Tên dân tộc", people]] as const) {
    if (v.length < 2 || v.length > 30) return `${label} phải dài 2–30 ký tự`;
    const nv = normName(v);
    if (FORBIDDEN_NAME_WORDS.some(w => nv.includes(w))) return `${label} không được dùng tên model hay nhà cung cấp`;
  }
  for (const o of world.nations) {
    if (o.id === n.id || !o.founded) continue;
    if (normName(o.name) === normName(name)) return `Tên "${name}" đã có quốc gia khác dùng`;
    if (normName(o.capitalName) === normName(cap)) return `Tên thủ đô "${cap}" đã bị dùng`;
    if (normName(o.people) === normName(people)) return `Tên dân tộc "${people}" đã bị dùng`;
  }
  const colors = Array.isArray(flag.colors) ? flag.colors.map(String) : [];
  if (!FLAG_LAYOUTS.includes(String(flag.layout))) return `Bố cục cờ phải là một trong: ${FLAG_LAYOUTS.join(", ")}`;
  if (colors.length < 2 || colors.length > 3 || !colors.every(c => HEX.test(c))) return "Cờ cần 2–3 màu dạng #rrggbb";
  if (!FLAG_SYMBOLS.includes(String(flag.symbol))) return `Biểu tượng phải là một trong: ${FLAG_SYMBOLS.join(", ")}`;
  for (const o of world.nations) {
    if (o.id === n.id || !o.founded) continue;
    if (deltaE(colors[0], o.flag.colors[0]) < FLAG_MIN_DELTA_E) return `Màu chủ đạo ${colors[0]} quá giống màu cờ của ${o.name}`;
  }
  return null;
}

const SYL = ["ka", "ru", "mi", "to", "la", "an", "ve", "so", "ha", "ni", "ra", "el", "ta", "mo", "ku", "shi", "or", "ba", "di", "yu"];
function autoFound(world: World, n: Nation, rand: Rand): void {
  const make = () => { const k = 2 + Math.floor(rand() * 2); let s = ""; for (let i = 0; i < k; i++) s += pickOne(SYL, rand); return s[0].toUpperCase() + s.slice(1); };
  for (let attempt = 0; attempt < 200; attempt++) {
    const base = make();
    const color = "#" + Math.floor(rand() * 0xffffff).toString(16).padStart(6, "0");
    const a = { name: base, capital: make(), people: `người ${base}`, flag: { layout: pickOne(FLAG_LAYOUTS, rand), colors: [color, "#f4f1e8"], symbol: pickOne(FLAG_SYMBOLS, rand) } };
    if (!validateFounding(world, n, a)) { applyFounding(n, a, ""); return; }
  }
}
function applyFounding(n: Nation, a: Record<string, unknown>, manifesto: string): void {
  const flag = a.flag as Record<string, unknown>;
  n.name = String(a.name).trim(); n.capitalName = String(a.capital).trim(); n.people = String(a.people).trim();
  n.flag = { layout: String(flag.layout), colors: (flag.colors as unknown[]).map(c => String(c).toLowerCase()), symbol: String(flag.symbol) };
  n.manifesto = manifesto.slice(0, 280);
  n.founded = true;
}

// ---------------------------------------------------------------- helpers

const DIR_STEPS: Record<string, [number[], number[]]> = {
  E: [[1, 0], [1, 0]], NE: [[0, -1], [1, -1]], NW: [[-1, -1], [0, -1]], W: [[-1, 0], [-1, 0]], SW: [[-1, 1], [0, 1]], SE: [[0, 1], [1, 1]],
};
function stepDir(i: number, d: string): number {
  const c = col(i), r = row(i), [dc, dr] = DIR_STEPS[d][r & 1];
  return inBounds(c + dc, r + dr) ? idx(c + dc, r + dr) : -1;
}
export function parseTile(v: unknown): number {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < TILE_COUNT) return v;
  if (Array.isArray(v) && v.length === 2) { const [c, r] = v.map(Number); if (inBounds(c, r)) return idx(c, r); }
  if (v && typeof v === "object") { const o = v as Record<string, unknown>; const c = Number(o.col ?? o.c), r = Number(o.row ?? o.r); if (inBounds(c, r)) return idx(c, r); }
  return -1;
}
function findNation(world: World, v: unknown): Nation | undefined {
  if (typeof v === "number") return world.nations[v];
  const s = normName(String(v ?? ""));
  return world.nations.find(o => o.founded && normName(o.name) === s);
}
const num = (v: unknown, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };
const fmt = (x: number) => Math.round(x * 10) / 10;

function normalizeLabor(n: Nation, wanted: Partial<Record<Role, number>> | undefined): void {
  if (!wanted || typeof wanted !== "object") return;
  const out = Object.fromEntries(ROLES.map(r => [r, Math.max(0, Math.floor(num(wanted[r])))])) as Record<Role, number>;
  const total = ROLES.reduce((s, r) => s + out[r], 0), w = workers(n);
  if (total > w) {
    const scaled = Object.fromEntries(ROLES.map(r => [r, Math.floor(out[r] * w / total)])) as Record<Role, number>;
    let left = w - ROLES.reduce((s, r) => s + scaled[r], 0);
    for (const r of ROLES) if (left > 0 && out[r] > scaled[r]) { scaled[r]++; left--; }
    n.lastRejected.push({ action: "labor", reason: `Phân công ${total} người nhưng chỉ có ${w} người lao động; đã thu nhỏ theo tỷ lệ` });
    n.labor = scaled;
  } else n.labor = out;
}

/** Centres a tile must stay connected to (§2.3). */
function centres(n: Nation): number[] { return [n.capital, ...n.settlements.map(s => s.tile)]; }

// ---------------------------------------------------------------- step

export interface StepResult { chronicle: ChronicleEntry[]; audit: string[] }

export function step(world: World, inputs: Record<number, TurnInput>, rulings: Record<number, Ruling> = {}): StepResult {
  const tick = world.tick, L = new Ledger(world), chronicle: ChronicleEntry[] = [];
  const say = (nation: number | null, kind: string, text: string) => chronicle.push({ tick, nation, kind, text });
  const alive = world.nations.filter(n => n.alive);
  const popStart = new Map(alive.map(n => [n.id, n.population]));

  // 1. Read inputs
  for (const n of alive) {
    n.lastRejected = []; n.lastEvents = []; n.inbox = [];
    const inp = inputs[n.id] ?? { kind: "silent", reason: "không có câu trả lời" };
    if (inp.kind === "asleep") { n.stats.asleepTicks++; continue; }
    if (inp.kind === "silent") { n.stats.silentTicks++; n.silentStreak++; continue; }
    n.silentStreak = 0;
    const r = inp.response as Record<string, unknown>;
    if (r.thought !== undefined) n.lastThought = String(r.thought).slice(0, 300);
    if (r.memory !== undefined) n.memory = String(r.memory).slice(0, 2000);
    if (typeof r.mine_target === "string") n.mineTarget = r.mine_target;
  }

  // 1b. The judge's rulings on pending inventions (§5.4)
  for (const p of world.proposals) {
    if (p.status !== "pending" || !rulings[p.id]) continue;
    const n = world.nations[p.nation];
    const id = applyRuling(world, p, rulings[p.id]);
    const r = p.ruling!;
    if (id) {
      const v = inv(world, id)!;
      say(n.id, "invention", `Trọng tài công nhận phát minh "${v.name}" của ${n.name} (độ sâu ${v.custom!.depth}, ${v.rp} RP). ${r.reason}`);
      n.lastEvents.push(`Đơn phát minh "${p.name}" được duyệt thành ${id}${v.prereqs.length > p.prereqs.length ? " (trọng tài thêm tiên quyết)" : ""}. ${n.research ? "Chọn research để bắt đầu." : "Bắt đầu nghiên cứu ngay, được giảm 20% RP."}`);
      if (!n.research && v.prereqs.every(x => n.inventions.includes(x))) n.research = { id, progress: 0 };
    } else if (p.status === "duplicate") {
      n.lastEvents.push(`Đơn "${p.name}" trùng với ${invName(world, p.inventionId!)} (${p.inventionId}) đã có trong Sổ: hãy nghiên cứu nó.`);
    } else {
      n.lastEvents.push(`Trọng tài bác đơn "${p.name}" (${r.causality + r.material + r.physics}/6): ${r.reason}`);
      say(n.id, "proposal", `Trọng tài bác đơn phát minh "${p.name}" của ${n.name}.`);
    }
  }

  // Deliver the gods' answers to petitions (§10.5)
  for (const p of world.petitions) {
    if (p.status === "pending" || p.delivered) continue;
    const n = world.nations[p.nation]; p.delivered = true;
    if (!n?.alive) continue;
    const word = { accepted: "chấp thuận", partial: "chấp thuận một phần", rejected: "bác bỏ", merged: "gộp vào thỉnh nguyện khác" }[p.status];
    n.lastEvents.push(`Các vị thần đã ${word} thỉnh nguyện "${p.title}"${p.verdict ? `: ${p.verdict}` : ""}`);
  }

  // 2. Founding (tick 0). Priority order comes from the seed.
  const order = shuffle(alive.slice(), rngFor(world.seed, tick, "order"));
  for (const n of order) {
    if (n.founded) continue;
    const inp = inputs[n.id];
    const a = inp?.kind === "ok" ? (inp.response.actions || []).find(x => x && x.type === "found_nation") : undefined;
    if (a) {
      const err = validateFounding(world, n, a);
      if (!err) { applyFounding(n, a, String(a.manifesto ?? "")); say(n.id, "found", `Lập quốc ${n.name}, thủ đô ${n.capitalName}, dân tộc ${n.people}.${n.manifesto ? ` Tuyên ngôn: "${n.manifesto}"` : ""}`); continue; }
      n.lastRejected.push({ action: "found_nation", reason: err });
    }
    if (tick >= 1) {
      autoFound(world, n, rngFor(world.seed, tick, "autofound", n.id));
      say(n.id, "found", `Không tự lập quốc kịp; các vị thần đặt tên ${n.name}, thủ đô ${n.capitalName}.`);
    }
  }

  // 3. Labour, craft orders and actions
  const claims: Array<{ n: Nation; tile: number }> = [];
  const explorers = new Map<number, number>();
  const ctx: DiploCtx = { world, tick, L, say, strikes: [], sent: new Set(), accepts: [], treatyAccepts: [] };
  for (const n of alive) {
    const inp = inputs[n.id];
    if (n.riot) { n.riot = false; n.lastEvents.push("Nội loạn: lượt này các thủ lĩnh không ra được lệnh nào."); continue; }
    if (inp?.kind !== "ok") continue;
    normalizeLabor(n, inp.response.labor);
    if (inp.response.crafts && typeof inp.response.crafts === "object") {
      n.crafts = {};
      for (const [k, v] of Object.entries(inp.response.crafts)) if (recipeOf(world, k) && num(v) > 0) n.crafts[k] = Math.min(50, Math.floor(num(v)));
    }
    if (tick === 0) continue; // tick 0 is for founding only
    let ap = actionPoints(world, n);
    const acts = Array.isArray(inp.response.actions) ? inp.response.actions.slice(0, 12) : [];
    for (const a of acts) {
      const type = String(a?.type ?? "");
      if (type === "found_nation") continue;
      const reject = (reason: string) => { n.lastRejected.push({ action: type || "?", reason }); n.stats.invalid++; };
      if (NOT_YET[type]) { reject(`Chưa có trong phiên bản engine này (luật ${NOT_YET[type]})`); continue; }
      const cost = AP_COST[type];
      if (cost === undefined) { reject("Không có hành động này"); continue; }
      if (cost > ap) { reject(`Không đủ AP (cần ${cost}, còn ${ap})`); continue; }
      const err = ENGINE_ACTIONS.has(type) ? doAction(world, n, type, a, L, claims, explorers, say) : doDiplomacy(ctx, n, type, a);
      if (err) { reject(err); ap -= Math.min(cost, ap); continue; } // §1 rule 2: AP is spent anyway
      ap -= cost;
    }
  }

  // 4. Claims resolve together; ties broken by the seed (§7.6)
  const byTile = new Map<number, Nation[]>();
  for (const c of claims) byTile.set(c.tile, [...(byTile.get(c.tile) || []), c.n]);
  const crand = rngFor(world.seed, tick, "claims");
  for (const [tile, ns] of [...byTile.entries()].sort((a, b) => a[0] - b[0])) {
    const winner = ns.length === 1 ? ns[0] : ns[Math.floor(crand() * ns.length)];
    if (world.tiles[tile].owner !== -1) { winner.lastRejected.push({ action: "claim_tile", reason: "Ô đã có chủ trước khi khai hoang xong" }); continue; }
    if ((winner.stock.food || 0) < CLAIM_FOOD) { winner.lastRejected.push({ action: "claim_tile", reason: "Hết lương thực để khai hoang" }); continue; }
    L.stock(winner, "food", -CLAIM_FOOD, "claim");
    world.tiles[tile].owner = winner.id;
    for (const o of ns) if (o !== winner) o.lastRejected.push({ action: "claim_tile", reason: `${winner.name} giành được ô này cùng lượt` });
    winner.lastEvents.push(`Khai hoang thêm ô (${col(tile)}, ${row(tile)}).`);
  }

  // 5. Treaties, trade, caravans, then battles (§3.1 order)
  resolveRelations(ctx);
  resolveBattles(ctx);

  // 6. Economy
  for (const n of alive) {
    if (!n.alive) continue;
    economy(world, n, L, say, explorers.get(n.id) || 0);
  }

  // 7. Sight, meetings, intel. Allies share sight (§7.8 level 4).
  for (const n of alive) {
    if (!n.alive) continue;
    const sight = new Set(n.seen);
    for (const t of ownedTiles(world, n.id)) for (const j of within(t.i, 3)) sight.add(j);
    n.seen = [...sight].sort((a, b) => a - b);
  }
  updateMeetings(world, say);
  updateIntel(world, tick);

  // 8. Tiles cut off from every centre go wild after 5 ticks (§2.3)
  for (const n of alive) {
    if (!n.alive) continue;
    const reach = new Set<number>(), stack = centres(n).filter(i => world.tiles[i].owner === n.id);
    for (const s of stack) reach.add(s);
    while (stack.length) { const k = stack.pop()!; for (const j of NEIGHBORS[k]) if (!reach.has(j) && world.tiles[j].owner === n.id) { reach.add(j); stack.push(j); } }
    for (const t of ownedTiles(world, n.id)) {
      const key = String(t.i);
      if (reach.has(t.i)) { delete world.cutoff[key]; continue; }
      world.cutoff[key] = (world.cutoff[key] || 0) + 1;
      if (world.cutoff[key] >= SETTLEMENT.cutoffTicks) { t.owner = -1; delete world.cutoff[key]; n.lastEvents.push(`Ô (${col(t.i)}, ${row(t.i)}) bị cắt rời quá lâu nên bỏ hoang.`); }
    }
  }

  // 9. Regrowth of renewable reserves
  for (const t of world.tiles) {
    for (const [k, share] of Object.entries(REGEN) as Array<[ResKey, number]>) {
      const cap = t.cap[k] || 0, cur = t.res[k] || 0;
      if (cap > 0 && cur < cap) L.tile(t, k, Math.min(cap - cur, cap * share), "regen");
    }
  }

  // 10. Death, lost knowledge, eras
  for (const n of alive) {
    if (!n.alive) continue;
    if (n.population <= 0) {
      n.population = 0; n.alive = false; n.status = "dead";
      for (const t of world.tiles) if (t.owner === n.id) t.owner = -1;
      say(n.id, "fall", `${n.name} diệt vong.`);
      continue;
    }
    const caps = mods(world, n).caps;
    // §5.5 Lost knowledge: a population halved in one tick, with no writing, forgets its newest idea
    if (n.population < (popStart.get(n.id) || 0) * 0.5 && !caps.has("ghi-chép")) {
      const lost = [...n.inventions].reverse().find(id => !START.inventions.includes(id) && !n.inventions.some(o => inv(world, o)?.prereqs.includes(id)));
      if (lost) { n.inventions = n.inventions.filter(x => x !== lost); say(n.id, "lost", `${n.name} mất quá nửa dân số và thất truyền ${invName(world, lost)}.`); }
    }
    n.peakPopulation = Math.max(n.peakPopulation, n.population);
    const owned = ownedTiles(world, n.id);
    let era = ERAS.paleo;
    if (caps.has("mài") && (caps.has("trồng-trọt") || caps.has("thuần-dưỡng")) && n.population >= 50) era = ERAS.neo;
    if (BRONZE_CAPS.every(c => caps.has(c)) && owned.some(t => (t.cap.copper || 0) > 0)) era = ERAS.bronze;
    if (era !== n.era) {
      n.era = era;
      say(n.id, "era", `${n.name} bước vào thời ${era}.`);
      if (world.eraGates[era] === undefined) {
        world.eraGates[era] = tick;
        if (era === ERAS.bronze) say(null, "gate", `${n.name} là quốc gia đầu tiên chạm Cổng Đồ Đồng. Theo luật §5.6, Watcher sẽ ban luật cho kỷ nguyên mới.`);
      }
    }
  }

  world.tick++;
  return { chronicle, audit: L.audit(world) };
}

// ---------------------------------------------------------------- economy (§4, §6)

function economy(world: World, n: Nation, L: Ledger, say: (nation: number | null, kind: string, text: string) => void, away: number): void {
  const tick = world.tick, m = mods(world, n), erand = rngFor(world.seed, tick, "nation", n.id);
  const owned = ownedTiles(world, n.id);
  const stabMult = n.stability < 30 ? 0.75 : 1;
  const labor = { ...n.labor };
  labor.gather = Math.max(0, labor.gather - away);
  const assigned = ROLES.reduce((s, r) => s + labor[r], 0);
  labor.gather += Math.max(0, workers(n) - away - assigned); // idle hands forage (§4.2)

  // Tools invented by the nations themselves (§5.3 recipe.tool)
  const toolBonus: Record<string, number> = {};
  for (const [good, q] of Object.entries(n.stock)) {
    const use = recipeOf(world, good)?.use; if (!use || q < 1 || !labor[use.role as Role]) continue;
    const equipped = Math.min(labor[use.role as Role], Math.floor(q) * use.per);
    toolBonus[use.role] = (toolBonus[use.role] || 0) + use.bonus * equipped / labor[use.role as Role];
    L.stock(n, good, -Math.min(q, equipped / use.per / TOOL_LIFE), "wear");
  }
  const mult = (r: Role) => (1 + Math.min(MAX_ROLE_BONUS, roleBonus(m, r) + (toolBonus[r] || 0))) * stabMult;

  const take = (key: ResKey, want: number, reason: string): number => {
    let got = 0;
    const src = owned.filter(t => (t.res[key] || 0) > 0).sort((a, b) => (b.res[key]! - a.res[key]!) || a.i - b.i);
    for (const t of src) { if (got >= want) break; const x = Math.min(want - got, t.res[key]!); L.tile(t, key, -x, reason); got += x; }
    return got;
  };
  const drought = (n.eventTimers.drought || 0) > 0 ? 0.5 : 1;
  let foodMade = 0;
  const g = take("plants", labor.gather * YIELD.gather * mult("gather") * drought, "gather");
  L.stock(n, "food", g, "gather"); L.stock(n, "fiber", g * YIELD.gatherFiber, "gather"); foodMade += g;
  // Hunting: one tool serves four hunters; hunters without tools work at half strength
  const tools = HUNT_TOOLS.reduce((s, k) => s + (n.stock[k] || 0), 0);
  const equipped = Math.min(labor.hunt, Math.floor(tools) * 4);
  const h = take("game", (equipped + (labor.hunt - equipped) * 0.5) * YIELD.hunt * mult("hunt"), "hunt");
  L.stock(n, "food", h, "hunt"); L.stock(n, "hide", h * YIELD.huntHide, "hunt"); L.stock(n, "bone", h * YIELD.huntBone, "hunt"); foodMade += h;
  n.toolWear += Math.ceil(equipped / 4) / TOOL_LIFE;
  while (n.toolWear >= 1) {
    n.toolWear -= 1;
    const k = HUNT_TOOLS.slice().reverse().find(t => (n.stock[t] || 0) >= 1);
    if (k) L.stock(n, k, -1, "wear");
  }
  const f = take("fish", labor.fish * YIELD.fish * mult("fish"), "fish");
  L.stock(n, "food", f, "fish"); foodMade += f;
  for (const r of ["wood", "stone", "flint", "clay"] as Role[]) {
    if (!labor[r]) continue;
    let effort = labor[r];
    if (r === "wood") effort += Math.min(labor.wood, (n.stock.axe || 0) * 2) * 0.3;
    const got = take(ROLE_RESOURCE[r]!, effort * YIELD.extract * mult(r), "extract");
    L.stock(n, r, got, "extract");
  }
  // Mining: visible ores first (the nation's choice), then salt and reeds
  if (labor.mine) {
    const visible = ["copper", "tin", "iron"].filter(k => m.reveal.has(k));
    const order = [n.mineTarget, ...visible, "salt", "reeds"].filter((k, i, a) => k && a.indexOf(k) === i && (["salt", "reeds"].includes(k) || m.reveal.has(k))) as ResKey[];
    let want = labor.mine * YIELD.extract * mult("mine");
    for (const k of order) { if (want <= 0) break; const got = take(k, want, "mine"); L.stock(n, k, got, "mine"); want -= got; }
  }
  // Farming buildings grow food from soil and labour
  let farmers = labor.farm;
  const volcano = world.wonders.find(w => w.key === "volcano");
  for (const b of n.buildings) {
    const e = buildingOf(world, b.type)?.effect; if (!b.done || !e?.farmSlots || farmers <= 0) continue;
    const k = Math.min(farmers, e.farmSlots); farmers -= k;
    const fertile = volcano && b.type === "field" && dist(volcano.i, b.tile) <= 1 ? 2 : 1;
    const x = k * (e.farmFood || 0) * fertile * (b.type === "field" ? drought : 1) * stabMult;
    L.stock(n, "food", x, "growth"); foodMade += x;
  }

  // Crafting: workshop-like buildings give slots; a recipe needs its building
  let craftWork = Math.min(labor.craft, doneEffect(world, n, "craftSlots")) * stabMult;
  const doneTypes = new Set(n.buildings.filter(b => b.done).map(b => b.type));
  for (const [rid, want] of Object.entries(n.crafts)) {
    const rec = recipeOf(world, rid); if (!rec) continue;
    if (!n.inventions.includes(rec.needs) && !m.unlocked.has(rid)) continue;
    if (!doneTypes.has(rec.building)) continue;
    for (let k = 0; k < want; k++) {
      if (craftWork < rec.work) break;
      if (!Object.entries(rec.input).every(([key, q]) => (n.stock[key] || 0) >= q)) break;
      for (const [key, q] of Object.entries(rec.input)) L.stock(n, key, -q, "craft");
      for (const [key, q] of Object.entries(rec.output)) L.stock(n, key, q, "craft");
      craftWork -= rec.work;
    }
  }

  // Building
  let buildWork = labor.build * stabMult;
  for (const b of n.buildings) {
    if (b.done || buildWork <= 0) continue;
    const def = buildingOf(world, b.type); if (!def) continue;
    const x = Math.min(def.work - b.progress, buildWork);
    b.progress += x; buildWork -= x;
    if (b.progress >= def.work - 1e-9) { b.done = true; n.lastEvents.push(`Hoàn thành ${def.name}.`); say(n.id, "build", `${n.name} xây xong ${def.name}.`); }
  }

  // World events (§9.2)
  for (const k of Object.keys(n.eventTimers)) if (n.eventTimers[k] > 0) n.eventTimers[k]--;
  const capZone = world.tiles[n.capital].zone;
  const winterChance = capZone === "trop" ? 0 : EVENTS.winter.chance * (capZone === "cold" ? EVENTS.winter.coldMult : 1);
  if (erand() < winterChance) {
    const lost = Math.min(n.stock.food || 0, foodMade * EVENTS.winter.foodLoss); L.stock(n, "food", -lost, "winter");
    let wm = m.winter;
    if (doneEffect(world, n, "housing") > 0) wm *= 0.5;
    if ((n.stock.hide_coat || 0) >= n.population / 2) wm *= 0.5;
    const dead = Math.floor(n.population * EVENTS.winter.deaths * wm);
    n.population -= dead;
    n.lastEvents.push(`Mùa đông khắc nghiệt: mất ${fmt(lost)} lương thực, ${dead} người chết rét.`);
    say(n.id, "event", `Mùa đông khắc nghiệt ở ${n.name}: ${dead} người chết rét.`);
  }
  if (capZone !== "cold" && erand() < EVENTS.drought.chance) { n.eventTimers.drought = EVENTS.drought.ticks; n.lastEvents.push("Hạn hán: cây dại và ruộng giảm một nửa trong 2 lượt."); }
  const plagueChance = EVENTS.plague.chance * (n.population > EVENTS.plague.bigPop ? 2 : 1) * (ownsWonder(world, n, "spring") ? 0.7 : 1);
  if (erand() < plagueChance) {
    const dead = Math.floor(n.population * (EVENTS.plague.min + erand() * (EVENTS.plague.max - EVENTS.plague.min)));
    n.population -= dead; n.lastEvents.push(`Dịch bệnh: ${dead} người chết.`); say(n.id, "event", `Dịch bệnh ở ${n.name}: ${dead} người chết.`);
  }
  if (erand() < EVENTS.bounty.chance) { const x = foodMade * EVENTS.bounty.gain; L.stock(n, "food", x, "bounty"); n.lastEvents.push(`Mùa bội thu: thêm ${fmt(x)} lương thực.`); }
  const grassTile = owned.find(t => t.terrain === "grass");
  if (grassTile && erand() < EVENTS.herd.chance) { L.tile(grassTile, "game", EVENTS.herd.game, "herd"); n.lastEvents.push("Đàn bò rừng di cư qua lãnh thổ: thêm 100 thú săn."); }
  const forestTile = owned.find(t => t.terrain === "forest" && (t.res.wood || 0) > 0);
  if (forestTile && erand() < EVENTS.wildfire.chance) { L.tile(forestTile, "wood", -(forestTile.res.wood || 0) * 0.5, "fire"); n.lastEvents.push("Cháy rừng: một khu rừng mất nửa số gỗ."); }
  const landTile = owned.find(t => t.land);
  if (landTile && erand() < EVENTS.meteor.chance) { L.tile(landTile, "iron", EVENTS.meteor.iron, "meteor"); say(n.id, "event", `Một thiên thạch rơi xuống lãnh thổ ${n.name}.`); }
  if (volcano && n.buildings.some(b => dist(b.tile, volcano.i) <= 2) && erand() < EVENTS.eruption.chance) {
    const lostB = n.buildings.filter(b => dist(b.tile, volcano.i) <= 2);
    n.buildings = n.buildings.filter(b => dist(b.tile, volcano.i) > 2);
    say(n.id, "event", `Núi lửa Tro Đen phun trào, ${n.name} mất ${lostB.length} công trình.`);
  }

  // Eating, starvation, growth, spoilage (§4.2)
  const need = n.population * m.foodPerPerson;
  const eaten = Math.min(n.stock.food || 0, need); L.stock(n, "food", -eaten, "eat");
  const shortage = need - eaten;
  if (shortage > 1e-9) {
    const dead = Math.min(n.population, Math.ceil(shortage / 2));
    n.population -= dead; n.stability -= 5;
    n.lastEvents.push(`Thiếu ${fmt(shortage)} lương thực: ${dead} người chết đói.`);
    say(n.id, "famine", `Nạn đói ở ${n.name}: ${dead} người chết.`);
  } else {
    const surplus = (n.stock.food || 0) / Math.max(1, need);
    if (surplus > 0) n.stability += 1;
    if (surplus >= GROWTH_SURPLUS && n.population < housing(world, n)) {
      n.population += Math.min(housing(world, n) - n.population, Math.max(1, Math.floor(n.population * GROWTH_RATE)));
    }
  }
  let spoil = m.spoilage - m.spoilageCut - Math.min(0.1, doneEffect(world, n, "spoilage"));
  if (n.inventions.includes("P18")) spoil -= 0.05;
  if (ownsWonder(world, n, "salt")) spoil *= 0.5;
  spoil = Math.max(SPOILAGE.min, spoil);
  L.stock(n, "food", -(n.stock.food || 0) * spoil, "spoil");
  L.stock(n, "hide", -(n.stock.hide || 0) * SPOILAGE.hide, "spoil");

  // Research (§5.5)
  const rp = labor.research * YIELD.research * (1 + m.rp) * stabMult;
  if (n.research) {
    if (!inv(world, n.research.id) || n.inventions.includes(n.research.id)) n.research = null;
    else {
      n.research.progress += rp;
      const cost = inventionCost(world, n, n.research.id);
      if (n.research.progress >= cost) {
        const v = inv(world, n.research.id)!;
        n.inventions.push(v.id); n.research = null;
        n.stability += 2 + (v.effects.stabilityOnce || 0);
        const reg = world.registry[v.id];
        if (!reg) { world.registry[v.id] = { by: [n.id], tick }; say(n.id, "invention", `${n.name} làm chủ ${v.name}, lần đầu tiên trên thế giới.`); }
        else if (reg.tick === tick) { reg.by.push(n.id); say(n.id, "invention", `${n.name} cùng làm chủ ${v.name}.`); }
        else say(n.id, "invention", `${n.name} làm chủ ${v.name}.`);
        n.lastEvents.push(`Hoàn thành nghiên cứu ${v.name}.`);
      }
    }
  }

  // Stability (§4.4)
  n.stability += Math.min(1, doneEffect(world, n, "stability")) + m.stabilityPerTick;
  if (ownsWonder(world, n, "spring")) n.stability += 2;
  const over = owned.length - tileLimit(world, n);
  if (over > 0) { const pen = Math.min(OVER_LIMIT_MAX, 2 * over); n.stability -= pen; n.lastEvents.push(`Vượt giới hạn quản lý ${over} ô: −${pen} ổn định (bỏ bớt ô bằng abandon_tile).`); }
  if (n.silentStreak >= 3) n.stability -= 5;
  n.stability = Math.max(0, Math.min(100, Math.round(n.stability)));
  if (n.stability < 15 && n.population > 0) {
    const leave = Math.max(1, Math.floor(n.population * 0.05));
    n.population -= leave;
    const dest = n.met.map(o => world.nations[o]).filter(o => o?.alive).sort((a, b) => b.stability - a.stability || a.id - b.id)[0];
    if (dest) dest.population += leave;
    n.lastEvents.push(`${leave} người bỏ đi${dest ? ` sang ${dest.name}` : ""} vì bất ổn.`);
  }
  if (n.stability === 0) { n.riot = true; n.stability = 20; say(n.id, "riot", `Nội loạn ở ${n.name}.`); }
}

// ---------------------------------------------------------------- actions

type Say = (nation: number | null, kind: string, text: string) => void;
const ENGINE_ACTIONS = new Set(["research", "build", "claim_tile", "abandon_tile", "explore", "plant_spy", "petition", "propose_invention", "found_settlement"]);
/** §2.3: the penalty for land beyond the tile limit is capped so a shrinking people can recover. */
const OVER_LIMIT_MAX = 10;
/** §7.6: an expedition walks up to 16 tiles out and back within one turn (10 years). */
const EXPLORE_RANGE = 16;

function doAction(world: World, n: Nation, type: string, a: Record<string, unknown>, L: Ledger,
  claims: Array<{ n: Nation; tile: number }>, explorers: Map<number, number>, say: Say): string | null {
  const m = mods(world, n);
  switch (type) {
    case "research": {
      const id = String(a.invention ?? a.id ?? "");
      const v = inv(world, id);
      if (!v) return `Không có phát minh "${id}" trong Sổ`;
      if (n.inventions.includes(id)) return `Đã có ${v.name}`;
      const missing = v.prereqs.filter(p => !n.inventions.includes(p));
      if (missing.length) return `Thiếu tiên quyết: ${missing.map(p => invName(world, p)).join(", ")}`;
      if (!envOk(world, n, id)) return `Lãnh thổ chưa có điều kiện vật chất cho ${v.name}`;
      if (n.research?.id === id) return null;
      const kept = n.research ? n.research.progress * 0.5 : 0; // switching loses half (§5.5)
      if (n.research) n.lastEvents.push(`Đổi dự án nghiên cứu: giữ lại ${fmt(kept)} RP, mất một nửa.`);
      n.research = { id, progress: kept };
      return null;
    }
    case "propose_invention": {
      const check = checkProposal(world, n, a);
      if (!check.ok) {
        if (check.duplicateOf) {
          const v = inv(world, check.duplicateOf)!;
          if (!n.inventions.includes(v.id) && v.prereqs.every(p => n.inventions.includes(p)) && !n.research) { n.research = { id: v.id, progress: 0 }; n.lastEvents.push(`${v.name} đã có trong Sổ; chuyển thành dự án nghiên cứu ${v.id}.`); return null; }
        }
        return check.error;
      }
      const id = world.proposals.length + 1;
      world.proposals.push({ id, tick: world.tick, status: "pending", ruling: null, inventionId: null, ...check.proposal });
      say(n.id, "proposal", `${n.name} nộp đơn phát minh "${check.proposal.name}" (độ sâu ${check.proposal.depth}, ${check.proposal.power} điểm sức mạnh). Đơn chờ trọng tài.`);
      return null;
    }
    case "build": {
      const def = buildingOf(world, String(a.building ?? ""));
      if (!def) return `Không có công trình "${String(a.building)}". Có: ${allBuildings(world).map(b => b.type).join(", ")}`;
      if (!n.inventions.includes(def.needs) && !m.unlocked.has(def.type)) return `Cần phát minh ${invName(world, def.needs)}`;
      if (def.max && n.buildings.filter(b => b.type === def.type).length >= def.max) return `Tối đa ${def.max} ${def.name}`;
      const tile = a.tile === undefined ? n.capital : parseTile(a.tile);
      if (tile < 0 || world.tiles[tile].owner !== n.id) return "Ô xây dựng phải thuộc lãnh thổ của bạn";
      const t = world.tiles[tile];
      if (!t.land) return "Không xây được trên biển";
      if (def.perTile) {
        if (n.buildings.some(b => b.tile === tile && buildingOf(world, b.type)?.perTile)) return "Ô này đã có công trình sản xuất";
        if (def.terrains && !(def.terrains.includes(t.terrain) || (def.river && t.river))) return `${def.name} cần ô ${def.terrains.join("/")}${def.river ? " hoặc ô có sông" : ""}`;
      }
      for (const [k, q] of Object.entries(def.cost)) if ((n.stock[k] || 0) < q) return `Thiếu ${fmt(q - (n.stock[k] || 0))} ${goodName(world, k)}`;
      for (const [k, q] of Object.entries(def.cost)) L.stock(n, k, -q, "build");
      n.buildings.push({ id: world.nextBuildingId++, type: def.type, tile, progress: 0, done: false, hp: 100 });
      return null;
    }
    case "claim_tile": {
      const tile = parseTile(a.tile);
      if (tile < 0) return "Ô không hợp lệ; dùng [cột, hàng]";
      const t = world.tiles[tile];
      if (t.owner !== -1) return "Ô đã có chủ";
      if (t.terrain === "ocean") return "Không khai hoang được biển sâu";
      if (!NEIGHBORS[tile].some(j => world.tiles[j].owner === n.id)) return "Ô phải kề lãnh thổ";
      if ((n.stock.food || 0) < CLAIM_FOOD) return `Cần ${CLAIM_FOOD} lương thực`;
      if (claims.some(c => c.n === n && c.tile === tile)) return "Đã khai hoang ô này trong lượt";
      claims.push({ n, tile });
      return null;
    }
    case "abandon_tile": {
      const tile = parseTile(a.tile);
      if (tile < 0 || world.tiles[tile].owner !== n.id) return "Ô không thuộc lãnh thổ của bạn";
      if (centres(n).includes(tile)) return "Không bỏ được thủ đô hay điểm định cư";
      world.tiles[tile].owner = -1;
      n.buildings = n.buildings.filter(b => b.tile !== tile);
      n.lastEvents.push(`Bỏ ô (${col(tile)}, ${row(tile)}).`);
      return null;
    }
    case "found_settlement": {
      if (!m.caps.has(SETTLEMENT.cap)) return "Cần năng lực tổ-chức (Hội đồng bộ lạc)";
      const tile = parseTile(a.tile);
      if (tile < 0) return "Cần tile [cột, hàng]";
      const t = world.tiles[tile], name = String(a.name ?? "").trim().slice(0, 30);
      if (name.length < 2) return "Đặt tên cho điểm định cư (2–30 ký tự)";
      if (t.owner !== -1 || !t.land || t.terrain === "mountain") return "Phải là ô đất liền vô chủ, không phải núi";
      if (centres(n).some(c => dist(c, tile) < SETTLEMENT.minDist)) return `Phải cách thủ đô và các điểm định cư khác ít nhất ${SETTLEMENT.minDist} ô`;
      if (!ownedTiles(world, n.id).some(o => dist(o.i, tile) <= SETTLEMENT.maxDist)) return `Phải trong vòng ${SETTLEMENT.maxDist} ô từ lãnh thổ`;
      if (n.population < SETTLEMENT.minPopulation) return `Cần ít nhất ${SETTLEMENT.minPopulation} dân`;
      if ((n.stock.food || 0) < SETTLEMENT.food) return `Cần ${SETTLEMENT.food} lương thực`;
      L.stock(n, "food", -SETTLEMENT.food, "settle");
      for (const j of [tile, ...NEIGHBORS[tile]]) if (world.tiles[j].owner === -1 && world.tiles[j].terrain !== "ocean") world.tiles[j].owner = n.id;
      n.settlements.push({ tile, name, tick: world.tick });
      say(n.id, "settle", `${n.name} lập điểm định cư ${name} tại (${col(tile)}, ${row(tile)}).`);
      return null;
    }
    case "explore": {
      const dir = String(a.direction ?? "").toUpperCase();
      if (!DIR_STEPS[dir]) return "Hướng phải là E, NE, NW, W, SW hoặc SE";
      const people = Math.max(1, Math.min(5, Math.floor(num(a.people, 2))));
      const spare = n.labor.gather + Math.max(0, workers(n) - ROLES.reduce((s, r) => s + n.labor[r], 0));
      if ((explorers.get(n.id) || 0) + people > spare) return "Người thám hiểm được lấy từ nhóm hái lượm và người rảnh, nhưng không đủ người";
      explorers.set(n.id, (explorers.get(n.id) || 0) + people);
      const rand = rngFor(world.seed, world.tick, "explore", n.id, dir);
      const seen = new Set(n.seen), canSail = m.move.has("shallow");
      let cur = parseTile(a.from) >= 0 && world.tiles[parseTile(a.from)].owner === n.id ? parseTile(a.from) : n.capital, danger = false;
      const passable = (i: number) => {
        if (i < 0) return false;
        const t = world.tiles[i];
        if (!t.land && !(canSail && t.terrain === "shallow")) return false;
        return !(t.terrain === "mountain" && !m.move.has("mountain"));
      };
      const DIRS = ["E", "NE", "NW", "W", "SW", "SE"], k0 = DIRS.indexOf(dir);
      for (let s = 0; s < EXPLORE_RANGE; s++) {
        // Walk the chosen way; skirt around water and mountains to either side
        const tries = [0, 1, -1].map(o => stepDir(cur, DIRS[(k0 + o + 6) % 6])).filter(passable);
        if (!tries.length) break;
        const nx = tries[0];
        const t = world.tiles[nx];
        cur = nx;
        if (t.terrain === "jungle" || t.terrain === "mountain") danger = true;
        for (const j of within(cur, canSail ? 3 : 2)) seen.add(j);
        if (t.owner !== -1 && t.owner !== n.id) {
          const o = world.nations[t.owner];
          const passage = treatiesBetween(world, n.id, o.id, ["passage", "alliance"]).length > 0;
          if (o.alive && !passage && rand() < 0.3) { o.lastEvents.push(`Phát hiện người lạ của ${n.name} trong lãnh thổ (vi phạm biên giới).`); if (!o.met.includes(n.id)) o.met.push(n.id); }
        }
      }
      n.seen = [...seen].sort((x, y) => x - y);
      let dead = 0; for (let k = 0; k < people; k++) if (rand() < (danger ? 0.08 : 0.03)) dead++;
      if (dead) { n.population -= dead; n.lastEvents.push(`${dead} người thám hiểm không trở về.`); }
      n.lastEvents.push(`Đoàn thám hiểm đi hướng ${dir} và trở về.`);
      return null;
    }
    case "plant_spy": {
      if (!m.caps.has(SPY.needsCap)) return "Cần năng lực tổ-chức (phát minh Hội đồng bộ lạc)";
      const target = findNation(world, a.target);
      if (!target || target.id === n.id || !target.alive) return "Không tìm thấy quốc gia mục tiêu";
      if (!n.met.includes(target.id)) return "Chưa gặp quốc gia này";
      if (dist(n.capital, target.capital) > SPY.maxDistance) return `Quá xa (tối đa ${SPY.maxDistance} ô)`;
      if (world.spies.some(s => s.active && s.owner === n.id && s.target === target.id)) return "Đã có gián điệp ở đó";
      if (n.population < 10) return "Dân số quá ít để cử người đi";
      n.population -= 1;
      if (rngFor(world.seed, world.tick, "spy", n.id, target.id)() < SPY.successChance) {
        world.spies.push({ id: world.nextSpyId++, owner: n.id, target: target.id, since: world.tick, active: true });
        n.lastEvents.push(`Gián điệp đã trà trộn vào ${target.name}.`);
      } else n.lastEvents.push(`Người được cử đến ${target.name} đã mất tích.`);
      return null;
    }
    case "petition": {
      const cat = String(a.category ?? "khác");
      const title = String(a.title ?? "").trim(), text = String(a.text ?? "").trim(), reason = String(a.reason ?? "").trim();
      if (!PETITION.categories.includes(cat)) return `Loại thỉnh nguyện phải là: ${PETITION.categories.join(", ")}`;
      if (!title || title.length > PETITION.titleMax) return `Tiêu đề 1–${PETITION.titleMax} ký tự`;
      if (!text || text.length > PETITION.textMax) return `Nội dung 1–${PETITION.textMax} ký tự`;
      if (reason.length > PETITION.reasonMax) return `Lý do tối đa ${PETITION.reasonMax} ký tự`;
      const mine = world.petitions.filter(p => p.nation === n.id);
      if (mine.filter(p => p.status === "pending").length >= PETITION.maxPending) return `Đã có ${PETITION.maxPending} thỉnh nguyện đang chờ`;
      const last = mine.at(-1);
      if (last && world.tick - last.tick < PETITION.everyTicks) return `Mỗi ${PETITION.everyTicks} lượt chỉ được gửi 1 thỉnh nguyện`;
      world.petitions.push({
        id: world.petitions.length + 1, nation: n.id, tick: world.tick, category: cat, title, text, reason,
        context: { population: n.population, stability: n.stability, food: Math.round(n.stock.food || 0), tiles: ownedTiles(world, n.id).length, era: n.era },
        status: "pending", verdict: "", decidedTick: null, mergedInto: null, delivered: false,
      });
      say(n.id, "petition", `${n.name} dâng thỉnh nguyện lên các vị thần: "${title}".`);
      return null;
    }
  }
  return "Không có hành động này";
}

// ---------------------------------------------------------------- meetings & intel (§7.8)

function updateMeetings(world: World, say: Say): void {
  for (const n of world.nations) {
    if (!n.alive) continue;
    for (const j of n.seen) {
      const o = world.tiles[j].owner;
      if (o >= 0 && o !== n.id && !n.met.includes(o) && world.nations[o].alive) {
        n.met.push(o);
        say(n.id, "contact", `${n.name} lần đầu thấy lãnh thổ của ${world.nations[o].name}.`);
      }
    }
  }
}

function sizeWord(pop: number): string { return pop < 30 ? "nhỏ" : pop < 80 ? "vừa" : "lớn"; }

function updateIntel(world: World, tick: number): void {
  for (const s of world.spies) {
    if (!s.active) continue;
    const owner = world.nations[s.owner], target = world.nations[s.target];
    if (!owner.alive || !target.alive) { s.active = false; continue; }
    const r = rngFor(world.seed, tick, "spycatch", s.id);
    const chance = Math.min(SPY.maxDetect, SPY.baseDetect + SPY.perFiveWarriors * Math.floor(target.labor.warrior / 5));
    if (r() < chance) {
      s.active = false;
      if (r() < 0.5) {
        owner.reputation = Math.max(0, owner.reputation - SPY.reputationLoss);
        target.casusBelli[String(owner.id)] = tick + SPY.casusBelliTicks;
        target.lastEvents.push(`Bắt được gián điệp của ${owner.name}. Có thể tuyên chiến với họ có chính nghĩa trong ${SPY.casusBelliTicks} lượt.`);
        owner.lastEvents.push(`Gián điệp ở ${target.name} bị bắt và khai ra nguồn gốc. Uy tín −${SPY.reputationLoss}.`);
      } else {
        target.lastEvents.push("Bắt được một gián điệp, không rõ của nước nào.");
        owner.lastEvents.push(`Mất liên lạc với gián điệp ở ${target.name}.`);
      }
    }
  }
  for (const a of world.nations) {
    if (!a.alive) continue;
    const caps = mods(world, a).caps, noise = caps.has("đếm") ? 0.5 : 1, sight = new Set(a.seen);
    for (const b of world.nations) {
      if (b.id === a.id || !b.alive || !a.met.includes(b.id)) continue;
      const key = String(b.id), prev = a.intel[key];
      const bTiles = ownedTiles(world, b.id), visible = bTiles.filter(t => sight.has(t.i));
      const spy = world.spies.some(s => s.active && s.owner === a.id && s.target === b.id);
      const allied = treatiesBetween(world, a.id, b.id, ["alliance"]).length > 0;
      const friendly = treatiesBetween(world, a.id, b.id).length > 0 || (a.trades[key] || 0) >= 5;
      let level = 1;
      if (visible.length || (a.trades[key] || 0) >= 1) level = 2;
      if (friendly) level = 3;
      if (spy || allied) level = 4;
      const contact = level >= 2;
      if (!contact && prev && prev.level > 1) {
        const fade = caps.has("ghi-chép") ? Infinity : INTEL_DECAY_TICKS;
        a.intel[key] = { ...prev, level: Math.max(1, prev.level - Math.floor((tick - prev.lastContact) / fade)) };
        continue;
      }
      const r = rngFor(world.seed, tick, "intel", a.id, b.id);
      const est = (x: number, e: number) => Math.max(0, Math.round(x * (1 + (r() * 2 - 1) * e * noise)));
      const report: Record<string, unknown> = { name: b.name, flag: b.flag, people: b.people, capital: b.capitalName, size: sizeWord(b.population), tiles_seen: visible.map(t => [col(t.i), row(t.i)]) };
      if (level >= 2) {
        report.population_est = est(b.population, level >= 3 ? 0.1 : 0.3);
        report.tiles_count = bTiles.length;
        report.era = b.era;
        report.buildings_seen = b.buildings.filter(x => x.done && sight.has(x.tile)).map(x => buildingOf(world, x.type)?.name ?? x.type);
        report.warriors_est = est(b.labor.warrior, level >= 3 ? 0.2 : 0.4);
      }
      if (level >= 3) {
        report.visible_inventions = b.inventions.filter(id => { const v = inv(world, id); return v && ((v.effects.unlocks?.length ?? 0) > 0 || (v.effects.combat ?? 0) > 0); }).map(id => invName(world, id));
      }
      if (level >= 4) {
        report.population = b.population;
        report.warriors = b.labor.warrior;
        report.stock = Object.fromEntries(Object.entries(b.stock).filter(([, v]) => v >= 1).map(([k, v]) => [k, Math.floor(v)]));
        report.inventions = b.inventions.map(id => invName(world, id));
        report.researching = b.research ? invName(world, b.research.id) : null;
        report.stability = b.stability;
        report.pending_proposal = world.proposals.find(p => p.nation === b.id && p.status === "pending")?.name ?? null;
      }
      a.intel[key] = { level, lastContact: contact ? tick : (prev?.lastContact ?? tick), asOf: tick, report };
    }
  }
}

export { depthOf, activeWar };
