// The World Engine: the only thing that changes the world (§1, rule 1).
// step(world, inputs, rulings) applies one tick. It is deterministic: the same
// world, inputs, judge rulings and seed always give the same result.

import { NEIGHBORS, TILE_COUNT, col, row, dist, within, inBounds, idx } from "./hex.ts";
import { rngFor, shuffle, pickOne, type Rand } from "./rng.ts";
import {
  AP_COST, BEASTS, RIVER, FLOOD, HERBS, HORDES, INJECTION, QUAKE, TERRAIN, WAR, CLAIM_FOOD, ERAS, EVENTS, FLAG_LAYOUTS, FLAG_MIN_DELTA_E, FLAG_SYMBOLS, FOOD_PER_PERSON,
  FORBIDDEN_NAME_WORDS, GROWTH, HIDDEN_ORES, HOUSING, HUNT_TOOLS, INTEL_DECAY_TICKS, MAX_ROLE_BONUS, NOT_YET,
  ORE_SENSE_CAP, PETITION, TRAIT_BY_ID, GOOD_VALUE, DEEP_RES, ERA_TABLE, ERA_RES_STOCK, HORSES, OFFICIALS, OFFICIAL_DOMAINS, eraPerks, LAND_COLORS, FLAG_LAND_DELTA_E, RENAME_DECREE, VEIN, HARVEST, SEA_HARVEST, LUXURY, KEEP, ANNALS, CONNECT, DEMO, EXODUS, LAND, HAMLET, IDLE, SCHISM, REGEN, RENAME, RESEARCH, ROADS, ROLE_RESOURCE, SEA, SETTLEMENT, SPOILAGE, SPY, SPY_OPS, START, TILES, TOOL_LIFE, WORKER_SHARE,
  YIELD, apFor, depthCostMult,
} from "./rules.ts";
import { allBuildings, allInventions, applyRuling, buildingOf, checkProposal, nearDuplicate, depthOf, eraIndex, goodName, inv, invName, recipeOf } from "./catalog.ts";
import { activeWar, doDiplomacy, resolveBattles, resolveRelations, treatiesBetween, type DiploCtx, type Strike } from "./diplomacy.ts";
import { generateWorld, tileValue } from "./worldgen.ts";
import { fx, fxBegin, fxDeath, fxEnd, type MapFx } from "./fx.ts";
import { busy, piers } from "./routes.ts";
import { applyLaws } from "./laws.ts";
import { noteFlow, updateMarket } from "./market.ts";
import { discoveryReport } from "./sea.ts";
import { writeAnnals } from "./annals.ts";
import { exodusOf, noteExodus } from "./exodus.ts";
import { isolated, links, yieldShares } from "./connect.ts";
import { cedeProvince, provinces, provinceTurn, restlessProvince, CAUSE_VI } from "./provinces.ts";
import { borderPhase, pairKey } from "./border.ts";
import { contagionPhase, immune, orderQuarantine, plagueStrike, tradeLinks } from "./contagion.ts";
import { prosperityPhase } from "./prosperity.ts";
import { ministerPhase, ministersAct, requestMinister } from "./ministers.ts";
import { add as addPeople, babies, demo, elders, fertility, fighters, grow, mouths, openBook, breeding, bookLine, take as takePeople, workForce } from "./people.ts";
import { beastRisk, floodChance, hordeCap, landDistance, newHordes, raidChance, raidParty, raidTarget, tileDanger, winterChance, winterDeathShare } from "./wild.ts";
import { ROLES, type Building, type RoadWork, type Schism, type ChronicleEntry, type Flag, type Nation, type Official, type ResKey, type Role, type Ruling, type Spy, type Tile, type TurnInput, type World } from "./types.ts";

// ---------------------------------------------------------------- ledger

/** Every change to a tile reserve, a stock or a caravan goes through here, so
 *  the end-of-tick audit proves nothing appeared or vanished unrecorded. */
export class Ledger {
  before: Record<string, number>;
  flows: Record<string, number> = {};
  reasons: Record<string, number> = {};
  /** §6.3 what each nation made and used of each good this turn */
  byNation = new Map<number, Record<string, [number, number]>>();
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
    noteFlow(this.byNation, n, key, delta, reason);
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
  for (const t of world.tiles) for (const k in t.res) add(k, t.res[k as ResKey] || 0);
  for (const n of world.nations) for (const k in n.stock) add(k, n.stock[k]);
  for (const c of world.caravans || []) for (const [k, v] of Object.entries(c.goods)) add(k, v);
  return out;
}

/** §2.6 + §2.11 Is this water within reach of one of the nation's piers (further from a harbour)? */
export function seaReach(world: World, n: Nation, tile: number): boolean {
  return n.buildings.some(b => {
    const e = buildingOf(world, b.type)?.effect;
    return !!e?.port && buildingWorks(world, b) && world.tiles[b.tile].owner === n.id && dist(b.tile, tile) <= SEA.pierReach + (e.harbor || 0);
  });
}

/** §2.11 Ores dug with no special knowledge, after the hidden ones the nation can see. */
export const OPEN_MINE: ResKey[] = ["salt", "reeds", "marble", "ochre"];

/** §2.11 Luxuries in store: each kind the people can enjoy this turn is used up and calms them. */
export function luxuries(world: World, n: Nation): { kinds: string[]; stability: number; need: number } {
  const need = Math.max(1, n.population * LUXURY.use);
  const kinds = LUXURY.goods.filter(g => (n.stock[g] || 0) >= need);
  return { kinds, stability: Math.min(LUXURY.max, kinds.length * LUXURY.stability), need: Math.round(need * 10) / 10 };
}

// ---------------------------------------------------------------- creation

export interface NationSpec { controller: "ai" | "bot"; provider: string; model: string; pinnedModel?: string; effort?: string; trait?: string }

export function createWorld(seed: string, specs: NationSpec[]): World {
  const gen = generateWorld(seed, specs.length);
  const nations: Nation[] = specs.slice(0, gen.spawns.length).map((spec, k) => newNation(k, spec, gen.spawns[k]));
  const world: World = {
    version: 1, seed, tick: 0, tiles: gen.tiles, nations, wonders: gen.wonders, rivers: gen.rivers, herd: gen.herd,
    wild: gen.wild, hordes: newHordes(seed, gen.wild), registry: {}, nextBuildingId: 1, spies: [], nextSpyId: 1, petitions: [], decrees: [],
    custom: { inventions: {}, recipes: {}, buildings: {}, goods: {}, next: 1 }, proposals: [],
    treaties: [], treatyOffers: [], tradeOffers: [], caravans: [], wars: [], battles: [], nextId: 1, cutoff: {}, eraGates: {}, riches: 1,
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
  const born = TRAIT_BY_ID[spec.trait ?? ""]?.start;
  return {
    id, controller: spec.controller, provider: spec.provider, model: spec.model, pinnedModel: spec.pinnedModel, effort: spec.effort, trait: spec.trait ?? "",
    founded: false, name: `Bộ lạc ${id + 1}`, capitalName: "", people: "", flag: { layout: "plain", colors: ["#888888", "#ffffff"], symbol: "circle" }, manifesto: "",
    capital, alive: true, population: START.population, labor, crafts: {}, stock: { ...START.stock },
    stability: START.stability + (born?.stability ?? 0), reputation: START.reputation + (born?.reputation ?? 0), inventions: [...START.inventions], research: null,
    buildings: [], seen: [], met: [], memory: "", lastThought: "", toolWear: 0, silentStreak: 0, riot: false, era: ERAS.paleo,
    eraTick: null, renameTick: null, formerNames: [], stolenTech: [],
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
  // §5.3 open-world effects, §5.6 era perks, §4.6 officials
  range: number; transport: number; growth: number; medicine: number; housingSlots: number; explore: number; officials: number;
  /** Ceiling on trade bonuses (MAX_ROLE_BONUS in the stone age, higher in later eras). */
  roleCap: number;
  era: number;
}

export function mods(world: World, n: Nation): Mods {
  const era = eraIndex(n), perks = eraPerks(era);
  const m: Mods = {
    role: {}, foodPerPerson: FOOD_PER_PERSON, ap: perks.ap, tiles: perks.tiles, rp: 0.25 * era, spoilage: SPOILAGE.food, spoilageCut: 0, stabilityPerTick: 0, combat: 0, winter: 1,
    caps: new Set(), unlocked: new Set(), move: new Set(), reveal: new Set(),
    range: 0, transport: 0, growth: 0, medicine: 0, housingSlots: perks.housingSlots, explore: 0, officials: perks.officials, roleCap: Math.max(MAX_ROLE_BONUS, perks.roleCap), era,
  };
  // §2.4 the nation's trait counts like one more invention
  const effects = n.inventions.map(id => inv(world, id)).filter(v => !!v).map(v => ({ caps: v.caps, e: v.effects }));
  const trait = TRAIT_BY_ID[n.trait ?? ""];
  if (trait) effects.push({ caps: [], e: trait.effects });
  for (const { caps, e } of effects) {
    for (const c of caps) m.caps.add(c);
    for (const [r, x] of Object.entries(e.role || {})) m.role[r] = (m.role[r] || 0) + (x || 0);
    if (e.foodPerPerson) m.foodPerPerson = Math.min(m.foodPerPerson, e.foodPerPerson);
    m.ap += e.ap || 0; m.tiles += e.tiles || 0; m.rp += e.rp || 0;
    m.spoilageCut += e.spoilageCut || 0; m.stabilityPerTick += e.stabilityPerTick || 0; m.combat += e.combat || 0;
    if (e.spoilage !== undefined) m.spoilage = Math.min(m.spoilage, e.spoilage);
    if (e.winter !== undefined) m.winter *= e.winter;
    for (const u of e.unlocks || []) m.unlocked.add(u);
    for (const t of e.move || []) m.move.add(t);
    for (const r of e.reveal || []) m.reveal.add(r);
    m.range += e.range || 0; m.transport += e.transport || 0; m.growth += e.growth || 0; m.medicine += e.medicine || 0;
    m.housingSlots += e.housingSlots || 0; m.explore += e.explore || 0; m.officials += e.officials || 0;
  }
  // §4.6 officials who are loyal enough work their field
  for (const o of n.officials ?? []) {
    if (o.loyalty < OFFICIALS.idle) continue;
    const k = o.skill;
    if (o.domain === "general") m.combat += 0.04 * k;
    else if (o.domain === "agriculture") for (const r of ["gather", "hunt", "fish", "farm"]) m.role[r] = (m.role[r] || 0) + 0.05 * k;
    else if (o.domain === "scholar") m.rp += 0.05 * k;
    else if (o.domain === "builder") m.role.build = (m.role.build || 0) + 0.08 * k;
    else if (o.domain === "merchant") m.transport += 0.1 * k;
    else if (o.domain === "explorer") m.explore += 2 * k;
    else if (o.domain === "governor") m.tiles += 1;
  }
  m.medicine = Math.min(0.8, m.medicine);
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
/** A finished building that is not disabled by sabotage (§7.8) gives its effect. */
export function buildingWorks(world: World, b: Building): boolean {
  return b.done && world.tick >= (b.disabledUntil ?? 0);
}
function doneEffect(world: World, n: Nation, key: "housing" | "stability" | "spoilage" | "craftSlots"): number {
  let sum = 0;
  for (const b of n.buildings) if (buildingWorks(world, b)) sum += buildingOf(world, b.type)?.effect[key] || 0;
  return sum;
}
/** §4.2 Workers: each age group's share of a full day's work. */
export function workers(n: Nation): number { return workForce(n); }
/** §2.3 What a settlement takes from the stock: SETTLEMENT.materials units of wood and/or stone,
 *  always from the larger pile first. null when the nation cannot pay. */
export function settlementPayment(n: Nation): Record<string, number> | null {
  const left: Record<string, number> = Object.fromEntries(SETTLEMENT.goods.map(g => [g, n.stock[g] || 0]));
  const pay: Record<string, number> = {};
  let need = SETTLEMENT.materials;
  while (need > 1e-9) {
    const g = SETTLEMENT.goods.reduce((a, b) => left[b] > left[a] ? b : a);
    const q = Math.min(need, 1, left[g]);
    if (q <= 1e-9) return null;
    left[g] -= q; pay[g] = (pay[g] || 0) + q; need -= q;
  }
  return pay;
}
/** §4.2 Logistic growth: rate × pop × (1 − pop/housing), at least GROWTH.min, never past the roof. */
export function growthFor(pop: number, roof: number): number {
  if (pop >= roof) return 0;
  return Math.min(roof - pop, Math.max(GROWTH.min, Math.floor(pop * GROWTH.rate * (1 - pop / roof))));
}
/** §4.2: how many housing buildings a nation may have, HOUSING.perCentre for the capital and each settlement. */
/** §4.2 housing buildings allowed: HOUSING.perCentre per centre, plus what eras and inventions add per centre. */
export function housingSlots(n: Nation, world?: World): number { return (HOUSING.perCentre + (world ? mods(world, n).housingSlots : 0)) * (1 + n.settlements.length); }
export function isHousing(world: World, type: string): boolean { return (buildingOf(world, type)?.effect.housing || 0) > 0; }
/** §4.2 The families a land tile (not a centre) houses: by terrain, one more on a river. */
export function hamletRoom(t: Tile): number { return (HAMLET.people[t.terrain] || 0) + (t.river && HAMLET.people[t.terrain] ? HAMLET.river : 0); }
/** §4.2 Where the people live: the capital's natural shelter, settlements, housing buildings, hamlets on the land, the cave. */
export function housingParts(world: World, n: Nation, owned?: Tile[]): { natural: number; settlements: number; buildings: number; hamlets: number; hamletMax: number; wonder: number } {
  // Only the best housing buildings up to the cap count (a lost settlement leaves surplus tents empty)
  const buildings = n.buildings.filter(b => buildingWorks(world, b)).map(b => buildingOf(world, b.type)?.effect.housing || 0).filter(h => h > 0)
    .sort((a, b) => b - a).slice(0, housingSlots(n, world)).reduce((s, h) => s + h, 0);
  const hubs = new Set(centres(n)), hamletMax = HAMLET.max + HAMLET.perEra * eraIndex(n);
  let hamlets = 0;
  for (const t of owned ?? world.tiles) if (t.owner === n.id && t.land && !hubs.has(t.i)) hamlets += hamletRoom(t);
  return { natural: START.naturalHousing, settlements: n.settlements.length * SETTLEMENT.housing, buildings, hamlets: Math.min(hamletMax, hamlets), hamletMax, wonder: ownsWonder(world, n, "cave") ? 50 : 0 };
}
export function housing(world: World, n: Nation): number {
  const p = housingParts(world, n);
  return p.natural + p.settlements + p.buildings + p.hamlets + p.wonder;
}
/** §2.1 Fresh water near the capital: a river, a swamp, the hot spring or a well within RIVER.waterReach tiles. */
export function freshWater(world: World, n: Nation): boolean {
  if (within(n.capital, RIVER.waterReach).some(i => { const t = world.tiles[i]; return t.river || t.terrain === "swamp" || t.wonder === "spring"; })) return true;
  return n.buildings.some(b => buildingWorks(world, b) && (buildingOf(world, b.type)?.effect.water || 0) > 0 && dist(b.tile, n.capital) <= RIVER.waterReach);
}
export function tileLimit(world: World, n: Nation): number {
  return TILES.base + Math.floor(TILES.perSqrt * Math.sqrt(Math.max(0, n.population))) + mods(world, n).tiles + n.settlements.length * TILES.perSettlement + roadLimit(world, n);
}
/** §2.6 How much a nation governs, against its tile limit: a water tile weighs SEA.limitWeight. */
export function governed(world: World, n: Nation): number {
  let k = 0;
  for (const t of world.tiles) if (t.owner === n.id) k += t.land ? 1 : SEA.limitWeight;
  return Math.round(k * 100) / 100;
}
/** §2.5 May this nation's people walk a road on this tile: its own land, the wilds, or a treaty partner's land. */
function roadOpen(world: World, n: Nation, t: Tile): boolean {
  return t.owner === n.id || t.owner === -1 || treatiesBetween(world, n.id, t.owner, ["passage", "alliance"]).length > 0;
}
/** §2.5 Tiles reached from `starts` along roads open to the nation (its centres count as junctions). */
function roadWalk(world: World, n: Nation, starts: number[]): Set<number> {
  const hubs = new Set(centres(n)), seen = new Set(starts.filter(i => world.tiles[i]?.owner === n.id)), stack = [...seen];
  while (stack.length) {
    const k = stack.pop()!;
    for (const j of NEIGHBORS[k]) {
      const t = world.tiles[j];
      if (!seen.has(j) && t.land && (hubs.has(j) ? t.owner === n.id : (t.road || 0) > 0 && roadOpen(world, n, t))) { seen.add(j); stack.push(j); }
    }
  }
  return seen;
}
/** §2.5 The road network: the nation's road tiles joined to one of its centres, and the settlements joined to the capital. */
export function roadNet(world: World, n: Nation): { tiles: number; linked: number[] } {
  let tiles = 0;
  for (const i of roadWalk(world, n, centres(n))) if ((world.tiles[i].road || 0) > 0 && world.tiles[i].owner === n.id) tiles++;
  const fromCapital = roadWalk(world, n, [n.capital]);
  return { tiles, linked: n.settlements.map(s => s.tile).filter(i => fromCapital.has(i)) };
}
function roadLimit(world: World, n: Nation): number {
  return Math.min(ROADS.maxLimit, Math.floor(roadNet(world, n).tiles / ROADS.tilesPerLimit));
}
/** §2.5 The best road level this nation may lay now (its era). */
export function roadLevelMax(n: Nation): number {
  const era = eraIndex(n);
  return ROADS.levels.filter(l => l.era <= era).length;
}
/** §2.5 Why this nation cannot lay a road (on land) or a sea lane (on water) on this tile, or null. */
export function roadError(world: World, n: Nation, i: number, m: Mods = mods(world, n)): string | null {
  const t = world.tiles[i];
  if (t.terrain === "icewall") return "không ai làm đường trên Tường Băng";
  if (!roadOpen(world, n, t)) return "thuộc nước khác (cần hiệp ước thông hành hay liên minh với họ)";
  if (t.owner === -1 && !within(i, ROADS.wildReach).some(j => world.tiles[j].owner === n.id)) return `đất vô chủ quá xa lãnh thổ của bạn (tối đa ${ROADS.wildReach} ô)`;
  if (t.land) return t.terrain === "mountain" && !m.move.has("mountain") ? "mở đèo qua núi cần năng lực vượt núi" : null;
  if (t.terrain === "ocean" && !m.move.has("ocean")) return "hải đạo trên biển sâu cần tàu viễn dương (move ocean)";
  return m.move.has("shallow") ? null : "hải đạo cần năng lực đi-nước (thuyền)";
}
/** §2.5 Tiles still to lay for a road from the network (or the capital) to `to`, through the nation's own land; [] when none is needed or there is no way. */
export function roadPlan(world: World, n: Nation, to: number, level = roadLevelMax(n)): number[] {
  const m = mods(world, n), ok = (i: number) => world.tiles[i].land && (world.tiles[i].owner === n.id || world.tiles[i].owner === -1) && !roadError(world, n, i, m);
  const hubs = new Set(centres(n)), prev = new Map<number, number>(), starts = [...roadWalk(world, n, [n.capital])];
  const queue = [...starts]; for (const i of starts) prev.set(i, -1);
  while (queue.length) {
    const k = queue.shift()!;
    if (k === to) break;
    for (const j of NEIGHBORS[k]) if (!prev.has(j) && ok(j)) { prev.set(j, k); queue.push(j); }
  }
  if (!prev.has(to)) return [];
  const path: number[] = [];
  for (let k = to; k >= 0; k = prev.get(k)!) path.push(k);
  path.reverse();
  return path.filter(i => (world.tiles[i].road || 0) < level && !hubs.has(i));
}
export function actionPoints(world: World, n: Nation): number { return apFor(n.population, mods(world, n).ap); }
export function canSeeRes(world: World, n: Nation, key: string): boolean {
  return !([...HIDDEN_ORES, ...DEEP_RES] as string[]).includes(key) || mods(world, n).reveal.has(key);
}

/** §7.5 diffusion: knowing someone who has it makes it cheaper; a stolen secret
 *  (§7.8) gives 50%. Only the best discount counts, they never stack. */
export function inventionCost(world: World, n: Nation, id: string): number {
  const v = inv(world, id); if (!v) return Infinity;
  let discount = 0;
  for (const o of n.met) {
    const other = world.nations[o];
    if (!other?.inventions.includes(id)) continue;
    let d = 0.2;
    if ((n.trades[String(o)] || 0) >= 5) d = 0.4;
    if (treatiesBetween(world, n.id, o, ["alliance"]).length) d = 0.6;
    discount = Math.max(discount, Math.min(0.75, d + (TRAIT_BY_ID[n.trait ?? ""]?.diffusion ?? 0)));
  }
  if (v.custom?.by === n.id) discount = Math.max(discount, 0.2);
  if (n.stolenTech.includes(id)) discount = Math.max(discount, SPY_OPS.stealDiscount);
  return Math.ceil(baseCost(world, id) * (1 - discount));
}
/** §5.5: the listed RP scaled by depth (depthCostMult: × (1 + 0.75 × (d − 1))), rounded up to a multiple of 5. */
export function baseCost(world: World, id: string): number {
  const v = inv(world, id); if (!v) return Infinity;
  const mult = depthCostMult(depthOf(world, id));
  return mult === 1 ? v.rp : Math.ceil(v.rp * mult / 5) * 5;
}
/** §5.5: RP made per tick by this many researchers before bonuses: diminishing returns. */
export function researchPoints(researchers: number): number {
  return researchers > 0 ? YIELD.research * Math.pow(researchers, RESEARCH.exponent) : 0;
}

export function envOk(world: World, n: Nation, id: string): boolean {
  const env = inv(world, id)?.env; if (!env) return true;
  const owned = ownedTiles(world, n.id);
  if (env.res && !owned.some(t => (t.cap[env.res!] || 0) > 0)) return false;
  if (env.terrains && !owned.some(t => env.terrains!.includes(t.terrain) || (env.river && t.river))) return false;
  return true;
}

/** What still stands between a nation and studying an invention, in words; [] when it can (§5.5, §5.6). */
export function missingFor(world: World, n: Nation, id: string, caps: Set<string> = mods(world, n).caps): string[] {
  const v = inv(world, id); if (!v) return ["không có trong Sổ"];
  return [...v.prereqs.filter(p => !n.inventions.includes(p)).map(p => invName(world, p)), ...(v.needsCaps ?? []).filter(c => !caps.has(c)).map(c => `năng lực ${c}`)];
}
/** A frame invention (§5.6) is no use to a nation that already holds every capability it gives. */
function redundant(v: { caps: string[]; frameDepth?: number }, caps: Set<string>): boolean {
  return v.frameDepth !== undefined && v.caps.length > 0 && v.caps.every(c => caps.has(c));
}
export function canStudy(world: World, n: Nation, id: string, caps: Set<string> = mods(world, n).caps): boolean {
  const v = inv(world, id);
  return !!v && !n.inventions.includes(id) && !redundant(v, caps) && !missingFor(world, n, id, caps).length && envOk(world, n, id);
}
export function researchOptions(world: World, n: Nation): string[] {
  const caps = mods(world, n).caps;
  return allInventions(world).filter(v => canStudy(world, n, v.id, caps)).map(v => v.id);
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

function validateName(label: string, v: string): string | null {
  if (v.length < 2 || v.length > 30) return `${label} phải dài 2–30 ký tự`;
  const nv = normName(v);
  if (FORBIDDEN_NAME_WORDS.some(w => nv.includes(w))) return `${label} không được dùng tên model hay nhà cung cấp`;
  return null;
}
function nameTaken(world: World, n: Nation, name: string): string | null {
  for (const o of world.nations) if (o.id !== n.id && o.founded && normName(o.name) === normName(name)) return `Tên "${name}" đã có quốc gia khác dùng`;
  return null;
}

function validateFounding(world: World, n: Nation, a: Record<string, unknown>): string | null {
  const name = String(a.name ?? "").trim(), cap = String(a.capital ?? "").trim(), people = String(a.people ?? "").trim();
  for (const [label, v] of [["Tên quốc gia", name], ["Tên thủ đô", cap], ["Tên dân tộc", people]] as const) {
    const err = validateName(label, v); if (err) return err;
  }
  const taken = nameTaken(world, n, name); if (taken) return taken;
  for (const o of world.nations) {
    if (o.id === n.id || !o.founded) continue;
    if (normName(o.capitalName) === normName(cap)) return `Tên thủ đô "${cap}" đã bị dùng`;
    if (normName(o.people) === normName(people)) return `Tên dân tộc "${people}" đã bị dùng`;
  }
  return validateFlag(world, n, a.flag);
}
function validateFlag(world: World, n: Nation, raw: unknown): string | null {
  const flag = (raw ?? {}) as Record<string, unknown>;
  const colors = Array.isArray(flag.colors) ? flag.colors.map(String) : [];
  if (!FLAG_LAYOUTS.includes(String(flag.layout))) return `Bố cục cờ phải là một trong: ${FLAG_LAYOUTS.join(", ")}`;
  if (colors.length < 2 || colors.length > 3 || !colors.every(c => HEX.test(c))) return "Cờ cần 2–3 màu dạng #rrggbb";
  if (!FLAG_SYMBOLS.includes(String(flag.symbol))) return `Biểu tượng phải là một trong: ${FLAG_SYMBOLS.join(", ")}`;
  // The main colour paints your land on the map: it must not vanish into forest, grass or sea
  for (const [land, c] of Object.entries(LAND_COLORS)) if (deltaE(colors[0], c) < FLAG_LAND_DELTA_E) return `Màu chủ đạo ${colors[0]} quá giống màu ${land} trên bản đồ (${c}); chọn màu khác hẳn`;
  for (const o of world.nations) {
    if (o.id === n.id || !o.founded) continue;
    if (deltaE(colors[0], o.flag.colors[0]) < FLAG_MIN_DELTA_E) return `Màu chủ đạo ${colors[0]} quá giống màu cờ của ${o.name}`;
  }
  return null;
}

/** §2.2: a nation may rename once within RENAME.windowTicks ticks after it entered a new era. */
/** §10.6 A renaming decree of the gods is in force. */
export function renameDecreed(world: World): boolean { const d = world.renameDecree; return !!d && !d.done && world.tick >= d.from && world.tick <= d.until; }
export function renameOpen(world: World, n: Nation): boolean {
  if (renameDecreed(world)) return true;
  if (n.eraTick === null || world.tick - n.eraTick > RENAME.windowTicks) return false;
  return n.renameTick === null || n.renameTick <= n.eraTick;
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
function toFlag(raw: unknown): Flag {
  const flag = raw as Record<string, unknown>;
  return { layout: String(flag.layout), colors: (flag.colors as unknown[]).map(c => String(c).toLowerCase()), symbol: String(flag.symbol) };
}
function applyFounding(n: Nation, a: Record<string, unknown>, manifesto: string): void {
  n.name = String(a.name).trim(); n.capitalName = String(a.capital).trim(); n.people = String(a.people).trim();
  n.flag = toFlag(a.flag);
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
    // Scale down; hand the remainder to the largest fractions so small roles survive.
    const exact = ROLES.map(r => ({ r, x: out[r] * w / total }));
    const scaled = Object.fromEntries(exact.map(e => [e.r, Math.floor(e.x)])) as Record<Role, number>;
    let left = w - ROLES.reduce((s, r) => s + scaled[r], 0);
    for (const e of exact.slice().sort((a, b) => (b.x - Math.floor(b.x)) - (a.x - Math.floor(a.x)) || ROLES.indexOf(a.r) - ROLES.indexOf(b.r))) { if (left <= 0) break; if (e.x > 0) { scaled[e.r]++; left--; } }
    n.lastRejected.push({ action: "labor", reason: `Phân công ${total} người nhưng chỉ có ${w} người lao động; đã thu nhỏ theo tỷ lệ` });
    n.labor = scaled;
  } else n.labor = out;
  // §4.2 only youths and adults of the sexes the people sends to war can be warriors
  const pool = fighters(n);
  if (n.labor.warrior > pool) {
    n.lastRejected.push({ action: "labor", reason: `Chỉ có ${pool} người có thể ra trận (${DEMO.fighters[n.family?.fighters ?? "all"]}); ${n.labor.warrior - pool} chiến binh về hái lượm` });
    n.labor.gather += n.labor.warrior - pool; n.labor.warrior = pool;
  }
}

/** §10.6 Which of a nation's names are still as they were when the renaming decree was given. */
export function unrenamed(world: World, n: Nation): { changed: boolean; left: string[] } {
  const was = world.renameDecree?.names[String(n.id)];
  if (!was) return { changed: true, left: [] };
  const left: string[] = [];
  if (n.name === was.nation) left.push(`tên nước ${n.name}`);
  if (n.people === was.people) left.push(`dân tộc ${n.people}`);
  if (n.capitalName === was.capital) left.push(`thủ đô ${n.capitalName}`);
  for (const st of n.settlements) if (was.places[String(st.tile)] === st.name) left.push(`điểm định cư ${st.name}`);
  for (const o of n.officials ?? []) if (was.officials[String(o.id)] === o.name) left.push(`quan ${o.name}`);
  const total = 3 + n.settlements.length + (n.officials ?? []).length;
  return { changed: left.length < total, left };
}

/** An order in a few words, for the nation's record of its own turns (§8.2). */
function orderLabel(a: Record<string, unknown> | null | undefined): string {
  if (!a) return "?";
  const arg = a.building ?? a.invention ?? a.target ?? a.to ?? a.domain ?? a.kind ?? a.name ?? (a.births || a.fighters ? `${a.births ?? ""}/${a.fighters ?? ""}` : undefined) ?? a.turns;
  const tile = Array.isArray(a.tile) ? `(${a.tile.join(", ")})` : Array.isArray(a.path) ? `${a.path.length} ô` : "";
  return [String(a.type ?? "?"), arg !== undefined ? String(arg).slice(0, 40) : "", tile].filter(Boolean).join(" ");
}

/** Centres a tile must stay connected to (§2.3). */
function centres(n: Nation): number[] { return [n.capital, ...n.settlements.map(s => s.tile)]; }

// ---------------------------------------------------------------- step

/** fx: where things happened this tick, for the map's animations (recording only, §11). */
export interface StepResult { chronicle: ChronicleEntry[]; audit: string[]; fx: MapFx[] }

export function step(world: World, inputs: Record<number, TurnInput>, rulings: Record<number, Ruling> = {}): StepResult {
  applyLaws(world); // §10.3 the Watcher's law decrees in force this turn
  const tick = world.tick, L = new Ledger(world), chronicle: ChronicleEntry[] = [];
  fxBegin();
  const say = (nation: number | null, kind: string, text: string) => chronicle.push({ tick, nation, kind, text });
  const alive = world.nations.filter(n => n.alive);
  const popStart = new Map(alive.map(n => [n.id, n.population]));
  for (const n of alive) openBook(n); // §4.2 this turn's births, deaths and moves

  // 1. Read inputs
  for (const n of alive) {
    n.lastRejected = []; n.lastEvents = []; n.inbox = [];
    const inp = inputs[n.id] ?? { kind: "silent", reason: "không có câu trả lời" };
    if (inp.kind === "asleep") { n.stats.asleepTicks++; continue; }
    if (inp.kind === "silent") { n.stats.silentTicks++; n.silentStreak++; continue; }
    n.silentStreak = 0; n.stats.ok++;
    const r = inp.response as Record<string, unknown>;
    if (r.thought !== undefined) n.lastThought = String(r.thought).slice(0, 300);
    if (r.memory !== undefined) n.memory = String(r.memory).slice(0, 2000);
    if (typeof r.mine_target === "string") n.mineTarget = r.mine_target;
  }

  // 1b. The judge's rulings on pending inventions (§5.4)
  for (const p of world.proposals) {
    if (p.status !== "pending" || !rulings[p.id]) continue;
    const n = world.nations[p.nation];
    // Another nation's invention approved earlier this turn may already be this one (§5.7)
    const dupNow = nearDuplicate(world, p);
    const id = applyRuling(world, p, dupNow && !rulings[p.id].duplicate_of ? { ...rulings[p.id], duplicate_of: dupNow.id, reason: `Trùng với ${invName(world, dupNow.id)} (${dupNow.id}): ${dupNow.why}.` } : rulings[p.id]);
    const r = p.ruling!;
    if (id) {
      const v = inv(world, id)!;
      say(n.id, "invention", `Trọng tài công nhận phát minh "${v.name}" của ${n.name} (độ sâu ${v.custom!.depth}, ${baseCost(world, id)} RP). ${r.reason}`);
      n.lastEvents.push(`Đơn phát minh "${p.name}" được duyệt thành ${id}${v.prereqs.length > p.prereqs.length ? " (trọng tài thêm tiên quyết)" : ""}. ${n.research ? "Chọn research để bắt đầu." : "Bắt đầu nghiên cứu ngay, được giảm 20% RP."}`);
      if (!n.research && canStudy(world, n, id)) n.research = { id, progress: 0 };
    } else if (p.inventionId) { // applyRuling marked it a duplicate of an invention already in the book
      n.lastEvents.push(`Đơn "${p.name}" trùng với ${invName(world, p.inventionId!)} (${p.inventionId}) đã có trong Sổ.${studyInstead(world, n, p.inventionId!)}`);
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
  ministerPhase(world, say); // §4.9 ministers granted, refused or dismissed by the Watcher; seats lost to a shrinking people

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
  const rioted = new Set<number>();
  for (const n of alive) {
    const inp = inputs[n.id];
    if (n.riot) { n.riot = false; rioted.add(n.id); n.lastEvents.push("Nội loạn: lượt này các thủ lĩnh không ra được lệnh nào."); continue; }
    if (inp?.kind !== "ok") continue;
    // §3.2 a ruler gives at least one order a turn; a court that does nothing for long unsettles the people
    if (n.founded && tick > 0) {
      const orders = (inp.response.actions || []).filter(x => x && typeof x === "object" && x.type !== "found_nation").length;
      n.idleStreak = orders || actionPoints(world, n) < 1 ? 0 : (n.idleStreak ?? 0) + 1;
      if ((n.idleStreak ?? 0) >= IDLE.after) { n.stability = Math.max(0, n.stability - IDLE.stability); n.lastEvents.push(`Triều đình ${n.idleStreak} lượt liền không ra lệnh nào: dân thấy bị bỏ mặc (−${IDLE.stability} ổn định). Mỗi lượt hãy ra ít nhất một lệnh.`); }
      else if (n.idleStreak === 1) n.lastEvents.push("Lượt này triều đình không ra lệnh nào. Mỗi lượt hãy ra ít nhất một lệnh; từ lượt thứ hai liên tiếp sẽ mất ổn định.");
    }
    normalizeLabor(n, inp.response.labor);
    if (inp.response.crafts && typeof inp.response.crafts === "object") {
      n.crafts = {};
      for (const [k, v] of Object.entries(inp.response.crafts)) if (recipeOf(world, k) && num(v) > 0) n.crafts[k] = Math.min(50, Math.floor(num(v)));
    }
    if (tick === 0) continue; // tick 0 is for founding only
    let ap = actionPoints(world, n);
    const acts = Array.isArray(inp.response.actions) ? inp.response.actions.slice(0, 12) : [];
    n.turnOrders = [];
    for (const a of acts) {
      const type = String(a?.type ?? "");
      if (type === "found_nation") continue;
      const reject = (reason: string) => { n.lastRejected.push({ action: type || "?", reason }); n.stats.invalid++; n.turnOrders!.push(`${orderLabel(a)} ✗ ${reason.slice(0, 90)}`); };
      if (NOT_YET[type]) { reject(`Chưa có trong phiên bản engine này (luật ${NOT_YET[type]})`); continue; }
      const cost = AP_COST[type];
      if (cost === undefined) { reject("Không có hành động này"); continue; }
      if (cost > ap) { reject(`Không đủ AP (cần ${cost}, còn ${ap})`); continue; }
      const err = ENGINE_ACTIONS.has(type) ? doAction(world, n, type, a, L, claims, explorers, ctx.strikes, say) : doDiplomacy(ctx, n, type, a);
      if (err) { reject(err); ap -= Math.min(cost, ap); continue; } // §1 rule 2: AP is spent anyway
      ap -= cost;
      n.turnOrders.push(`${orderLabel(a)} ✓`);
    }
  }

  // 3a. §4.9 The ministers: after the ruler, each from its own AP and only in its own field
  for (const n of alive) {
    if (!n.alive || !n.founded || tick === 0 || rioted.has(n.id) || !n.ministers?.length) continue;
    ministersAct(world, n, inputs[n.id], {
      run: (type, a) => ENGINE_ACTIONS.has(type) ? doAction(world, n, type, a, L, claims, explorers, ctx.strikes, say) : doDiplomacy(ctx, n, type, a),
      labor: w => normalizeLabor(n, w), label: orderLabel,
    });
  }

  // 3b. The court at work (§4.6): officials act on their own, without the ruler's AP
  for (const n of alive) if (n.alive && n.founded && tick > 0) officialsAct(world, n, L, claims, explorers, ctx.strikes, say);

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
    fx({ kind: "claim", tile, nation: winner.id });
    for (const o of ns) if (o !== winner) o.lastRejected.push({ action: "claim_tile", reason: `${winner.name} giành được ô này cùng lượt` });
    winner.lastEvents.push(`Khai hoang thêm ô (${col(tile)}, ${row(tile)}).`);
  }

  // 5. Treaties, trade, caravans, then battles (§3.1 order)
  const tradesBefore = new Map(world.nations.map(n => [n.id, { ...n.trades }]));
  const linksBefore = tradeLinks(world); // §9.5 the ways a plague may travel this turn
  resolveRelations(ctx);
  resolveBattles(ctx);

  // 5a. Living borders: tension, incidents and the border market (§7.9)
  const traded = new Set<string>();
  for (const n of world.nations) for (const [o, k] of Object.entries(n.trades)) if (k > (tradesBefore.get(n.id)?.[o] ?? 0)) traded.add(pairKey(n.id, Number(o)));
  borderPhase(world, L, say, traded);

  // 5b. The wild: hordes grow, raid and come back (§9.4)
  wildPhase(world, L, say);

  // 6. Economy
  for (const n of alive) {
    if (!n.alive) continue;
    economy(world, n, L, say, (explorers.get(n.id) || 0) + busy(world, n).porters); // §7.3 porters on the road do not work at home
  }
  // 6b. Plague spreads between peoples; quarantines take their toll (§9.5)
  contagionPhase(world, L, say, linksBefore);
  // 6b. Prosperity and national pride: each people against the nations it knows (§4.7)
  prosperityPhase(world, say);

  // 7. Sight, meetings, intel. Allies share sight (§7.8 level 4).
  for (const n of alive) {
    if (!n.alive) continue;
    const sight = new Set(n.seen);
    for (const t of ownedTiles(world, n.id)) for (const j of within(t.i, 3)) sight.add(j);
    // §7.1 allies share sight
    for (const t of world.treaties) {
      if (!t.active || t.type !== "alliance" || (t.a !== n.id && t.b !== n.id)) continue;
      for (const o of ownedTiles(world, t.a === n.id ? t.b : t.a)) for (const j of within(o.i, 3)) sight.add(j);
    }
    n.seen = [...sight].sort((a, b) => a - b);
  }
  updateMeetings(world, say);
  updateIntel(world, tick, say);

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
      if (world.cutoff[key] >= SETTLEMENT.cutoffTicks) { t.owner = -1; delete world.cutoff[key]; n.stability = Math.max(0, n.stability - LAND.wildStability); fx({ kind: "lost_tile", tile: t.i, nation: n.id }); n.lastEvents.push(`Ô (${col(t.i)}, ${row(t.i)}) bị cắt rời quá lâu nên thành đất hoang (−${LAND.wildStability} ổn định).`); }
    }
  }

  // 9. Regrowth of renewable reserves
  for (const t of world.tiles) {
    for (const k in t.cap) { // only the reserves this tile has
      const share = REGEN[k as ResKey]; if (!share) continue;
      const cap = t.cap[k as ResKey] || 0, cur = t.res[k as ResKey] || 0;
      if (cap > 0 && cur < cap) L.tile(t, k as ResKey, Math.min(cap - cur, cap * share), "regen");
    }
  }

  // 9b. Factions that want to leave, and those the Watcher let go (§4.5)
  schismPhase(world, L, say);

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
    if (n.population < (popStart.get(n.id) || 0) * 0.5 && !caps.has("ghi-chép") && elders(n) < DEMO.keepers) { // §4.2 elders still remember
      const lost = [...n.inventions].reverse().find(id => !START.inventions.includes(id) && !n.inventions.some(o => inv(world, o)?.prereqs.includes(id)));
      if (lost) { n.inventions = n.inventions.filter(x => x !== lost); say(n.id, "lost", `${n.name} mất quá nửa dân số và thất truyền ${invName(world, lost)}.`); }
    }
    n.peakPopulation = Math.max(n.peakPopulation, n.population);
    if (n.founded) n.lastEvents.push(bookLine(n)); // §4.2 where the people went, every turn
    // §8.2 the turn in brief, for the nation's next observations: what it ordered, what came of it, how its people fared
    if (n.founded && tick > 0) {
      const brief = n.lastEvents.filter(e => !/^Dân số \d/.test(e)).slice(0, 5).map(e => e.length > 150 ? `${e.slice(0, 147)}…` : e);
      (n.recent ??= []).push({ tick, pop: n.population, food: Math.round(n.stock.food || 0), stab: n.stability, orders: n.turnOrders ?? [], events: [bookLine(n), ...brief] });
      if (n.recent.length > ANNALS.recent) n.recent.shift();
      n.turnOrders = [];
    }
    const owned = ownedTiles(world, n.id);
    // Eras only move forward (§5.6): a shrinking people keeps its era.
    let era = n.era;
    // §5.6 cross every gate whose conditions hold, in order (ERA_TABLE)
    for (let k = eraIndex(n) + 1; k < ERA_TABLE.length && eraReady(n, ERA_TABLE[k], caps, owned); k++) era = ERA_TABLE[k].name;
    if (era !== n.era) {
      n.era = era; n.eraTick = tick;
      fx({ kind: "era", tile: n.capital, nation: n.id, text: era });
      say(n.id, "era", `${n.name} bước vào thời ${era}.`);
      if (world.eraGates[era] === undefined) {
        world.eraGates[era] = tick;
        say(null, "gate", `${n.name} là quốc gia đầu tiên bước vào thời ${era}.`);
      }
    }
  }

  // §10.6 a renaming decree ends: those that changed none of their names defied the gods
  const rd = world.renameDecree;
  if (rd && !rd.done && tick >= rd.until) {
    rd.done = true;
    for (const n of world.nations) {
      if (!n.alive || !n.founded) continue;
      const left = unrenamed(world, n);
      if (left.changed) continue;
      n.reputation = Math.max(0, n.reputation - RENAME_DECREE.reputation); n.stability = Math.max(0, n.stability - RENAME_DECREE.stability);
      n.lastEvents.push(`Không đổi tên nào theo sắc lệnh ${rd.code} của các vị thần: −${RENAME_DECREE.reputation} uy tín, −${RENAME_DECREE.stability} ổn định.`);
      say(n.id, "decree", `${n.name} trái lệnh ${rd.code} của các vị thần.`);
    }
  }
  updateMarket(world, L); // §6.3 prices follow what the nations made, used and hold
  writeAnnals(world, chronicle); // §8.2 each nation's story, chapter by chapter
  world.tick++;
  return { chronicle, audit: L.audit(world), fx: fxEnd() };
}

// ---------------------------------------------------------------- economy (§4, §6)

function economy(world: World, n: Nation, L: Ledger, say: (nation: number | null, kind: string, text: string) => void, away: number): void {
  const tick = world.tick, m = mods(world, n), erand = rngFor(world.seed, tick, "nation", n.id);
  const owned = ownedTiles(world, n.id);
  const stabMult = n.stability < 30 ? 0.75 : 1;
  const labor = { ...n.labor };
  // People away (explorers, porters) come from the gatherers first, then from the other trades
  let short = Math.max(0, away - labor.gather);
  labor.gather = Math.max(0, labor.gather - away);
  for (const r of ROLES) { if (short <= 0) break; if (r === "warrior" || r === "gather") continue; const k = Math.min(short, labor[r]); labor[r] -= k; short -= k; }
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
  const mult = (r: Role) => (1 + Math.min(m.roleCap, roleBonus(m, r) + (toolBonus[r] || 0))) * stabMult;

  // §2.7 what a tile yields reaches the stores only in part when it lies cut off or far from any road
  const share = yieldShares(world, n);
  let taken = 0; // what the last take() worked from the land, before the losses on the way
  const take = (key: ResKey, want: number, reason: string): number => {
    let got = 0, home = 0;
    // the land whose yield reaches home first (§2.7), then the richest
    const src = owned.filter(t => (t.res[key] || 0) > 0).sort((a, b) => (share(b.i) - share(a.i)) || (b.res[key]! - a.res[key]!) || a.i - b.i);
    // §2.10 a rich vein yields more for the same work
    for (const t of src) { if (got >= want) break; const x = Math.min(want - got, t.res[key]!); L.tile(t, key, -x, reason); got += x; home += x * share(t.i) * (t.vein === key ? 1 + VEIN.yield : 1); }
    taken = got;
    return home;
  };
  const drought = (n.eventTimers.drought || 0) > 0 ? 0.5 : 1;
  let foodMade = 0;
  const g = take("plants", labor.gather * YIELD.gather * mult("gather") * drought, "gather");
  L.stock(n, "food", g, "gather"); L.stock(n, "fiber", g * YIELD.gatherFiber, "gather"); foodMade += g;
  // Gatherers who know the forest bring back healing herbs too (§9.4)
  L.stock(n, "herbs", take("herbs", labor.gather * HERBS.gather * mult("gather"), "gather"), "gather");
  // Hunting: one tool serves four hunters; hunters without tools work at half strength
  const tools = HUNT_TOOLS.reduce((s, k) => s + (n.stock[k] || 0), 0);
  const equipped = Math.min(labor.hunt, Math.floor(tools) * 4);
  const h = take("game", (equipped + (labor.hunt - equipped) * 0.5) * YIELD.hunt * mult("hunt"), "hunt");
  L.stock(n, "food", h, "hunt"); L.stock(n, "hide", h * YIELD.huntHide, "hunt"); L.stock(n, "bone", h * YIELD.huntBone, "hunt"); foodMade += h;
  // §2.1 a people that can tame horses brings some back alive
  if (m.caps.has(HORSES.cap) && labor.hunt) L.stock(n, "horse", take("horse", labor.hunt * HORSES.huntShare * mult("hunt"), "hunt"), "hunt");
  n.toolWear += Math.ceil(equipped / 4) / TOOL_LIFE;
  while (n.toolWear >= 1) {
    n.toolWear -= 1;
    const k = HUNT_TOOLS.slice().reverse().find(t => (n.stock[t] || 0) >= 1);
    if (k) L.stock(n, k, -1, "wear");
  }
  // §2.11 docks and harbours help the fishers; when the fish run short they gather shellfish on the shore
  const fishWant = labor.fish * YIELD.fish * mult("fish") * (1 + Math.min(0.5, doneEffect(world, n, "fish")));
  const f = take("fish", fishWant, "fish");
  L.stock(n, "food", f, "fish"); foodMade += f;
  if (taken < fishWant) { const sh = take("shellfish", fishWant - taken, "fish") * SEA_HARVEST.shellfish; L.stock(n, "food", sh, "fish"); foodMade += sh; }
  // §2.11 with ocean ships, whales on the deep water the nation holds
  if (labor.fish && m.move.has("ocean")) {
    const wh = take("whale", labor.fish * SEA_HARVEST.whaleRate * mult("fish"), "fish");
    for (const [g, q] of Object.entries(SEA_HARVEST.whale)) L.stock(n, g, wh * q, "fish");
    foodMade += wh * (SEA_HARVEST.whale.food || 0);
  }
  // §2.11 what the workers bring home besides: honey, spices, amber, furs, pearls, coral
  for (const [role, goods] of Object.entries(HARVEST)) {
    if (!labor[role as Role]) continue;
    for (const [g, rate] of Object.entries(goods) as Array<[ResKey, number]>) L.stock(n, g, take(g, labor[role as Role] * rate * mult(role as Role), role), role);
  }
  // §2.11 salt pans on the shore
  const pans = doneEffect(world, n, "seaSalt"); if (pans) L.stock(n, "salt", pans, "extract");
  for (const r of ["wood", "stone", "flint", "clay"] as Role[]) {
    if (!labor[r]) continue;
    let effort = labor[r];
    if (r === "wood") {
      const axes = Math.min(labor.wood, (n.stock.axe || 0) * 2);
      effort += axes * 0.3;
      if (axes) L.stock(n, "axe", -Math.min(n.stock.axe || 0, axes / 2 / (TOOL_LIFE * 2)), "wear"); // stone axes last twice as long
    }
    const got = take(ROLE_RESOURCE[r]!, effort * YIELD.extract * mult(r), "extract");
    L.stock(n, r, got, "extract");
  }
  // Mining: visible ores first (the nation's choice), then salt and reeds
  if (labor.mine) {
    const visible = [...HIDDEN_ORES, ...DEEP_RES].filter(k => m.reveal.has(k));
    const order = [n.mineTarget, ...visible, ...OPEN_MINE].filter((k, i, a) => k && a.indexOf(k) === i && ((OPEN_MINE as string[]).includes(k) || m.reveal.has(k))) as ResKey[];
    let want = labor.mine * YIELD.extract * mult("mine");
    for (const k of order) { if (want <= 0) break; const got = take(k, want, "mine"); L.stock(n, k, got, "mine"); want -= taken; }
  }
  // Farming buildings grow food from soil and labour
  let farmers = labor.farm;
  const volcano = world.wonders.find(w => w.key === "volcano");
  for (const b of n.buildings) {
    const e = buildingOf(world, b.type)?.effect; if (!buildingWorks(world, b) || !e?.farmSlots || farmers <= 0) continue;
    const k = Math.min(farmers, e.farmSlots); farmers -= k;
    const fertile = volcano && b.type === "field" && dist(volcano.i, b.tile) <= 1 ? 2 : 1;
    const silt = (n.eventTimers.fertile || 0) > 0 ? 1 + FLOOD.fertile : 1; // §9.4 a flood leaves rich mud
    const bed = world.tiles[b.tile], alluvium = bed.delta ? 1 + RIVER.deltaBonus : bed.river ? 1 + RIVER.fieldBonus : 1; // §2.1
    const x = k * (e.farmFood || 0) * fertile * silt * (b.type === "field" ? alluvium * drought : 1) * mult("farm") * share(b.tile);
    L.stock(n, "food", x, "growth"); foodMade += x;
  }

  // Crafting: workshop-like buildings give slots; a recipe needs its building
  let craftWork = Math.min(labor.craft, doneEffect(world, n, "craftSlots")) * mult("craft");
  const doneTypes = new Set(n.buildings.filter(b => buildingWorks(world, b)).map(b => b.type));
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
  let buildWork = labor.build * mult("build");
  for (const b of n.buildings) {
    if (b.done || buildWork <= 0) continue;
    const def = buildingOf(world, b.type); if (!def) continue;
    const x = Math.min(def.work - b.progress, buildWork);
    b.progress += x; buildWork -= x;
    if (b.progress >= def.work - 1e-9) { b.done = true; fx({ kind: "build", tile: b.tile, nation: n.id, text: def.name }); n.lastEvents.push(`Hoàn thành ${def.name}.`); say(n.id, "build", `${n.name} xây xong ${def.name}.`); }
  }
  // §2.5 Roads and sea lanes: the builders' spare work lays them, in the order given
  layRoads(world, n, m, buildWork, say);

  // World events (§9.2)
  for (const k of Object.keys(n.eventTimers)) if (n.eventTimers[k] > 0) n.eventTimers[k]--;
  const capZone = world.tiles[n.capital].zone;
  if (erand() < winterChance(world, n)) {
    const lost = Math.min(n.stock.food || 0, foodMade * EVENTS.winter.foodLoss); L.stock(n, "food", -lost, "winter");
    const dead = Math.floor(n.population * winterDeathShare(world, n, m.winter, doneEffect(world, n, "housing") > 0, (n.stock.hide_coat || 0) + (n.stock.fur || 0) * KEEP.furCoats >= n.population / 2)); // §2.11 furs keep warm too
    takePeople(n, dead, "winter");
    fx({ kind: "winter", tile: n.capital, nation: n.id }); fxDeath(n.capital, n.id, dead, "winter");
    n.lastEvents.push(`Mùa đông khắc nghiệt: mất ${fmt(lost)} lương thực, ${dead} người chết rét.`);
    say(n.id, "event", `Mùa đông khắc nghiệt ở ${n.name}: ${dead} người chết rét.`);
  }
  if (capZone !== "cold" && erand() < EVENTS.drought.chance) { n.eventTimers.drought = EVENTS.drought.ticks; fx({ kind: "drought", tile: n.capital, nation: n.id }); n.lastEvents.push("Hạn hán: cây dại và ruộng giảm một nửa trong 2 lượt."); }
  const dry = !freshWater(world, n);
  const plagueChance = EVENTS.plague.chance * (n.population > EVENTS.plague.bigPop ? 2 : 1) * (ownsWonder(world, n, "spring") ? 0.7 : 1) * (dry ? RIVER.dryPlague : 1) * (1 - m.medicine);
  // §9.5 a people just through a plague does not catch it again for a while
  if (erand() < plagueChance && !immune(n, tick)) plagueStrike(world, n, L, say, erand(), m.medicine);
  if (erand() < EVENTS.bounty.chance) { const x = foodMade * EVENTS.bounty.gain; L.stock(n, "food", x, "bounty"); fx({ kind: "bounty", tile: n.capital, nation: n.id }); n.lastEvents.push(`Mùa bội thu: thêm ${fmt(x)} lương thực.`); }
  const grassTile = owned.find(t => t.terrain === "grass");
  if (grassTile && erand() < EVENTS.herd.chance) { L.tile(grassTile, "game", EVENTS.herd.game, "herd"); fx({ kind: "herd", tile: grassTile.i, nation: n.id }); n.lastEvents.push("Đàn bò rừng di cư qua lãnh thổ: thêm 100 thú săn."); }
  const riverTiles = owned.filter(t => t.river);
  if (riverTiles.length && erand() < RIVER.runChance) {
    // §2.1 the fish run up the river
    for (const t of riverTiles.slice(0, RIVER.runTiles)) L.tile(t, "fish", RIVER.runFish, "fishrun");
    fx({ kind: "fishrun", tile: riverTiles[0].i, nation: n.id });
    n.lastEvents.push(`Mùa cá về: thêm ${RIVER.runFish} cá trên ${Math.min(RIVER.runTiles, riverTiles.length)} ô sông.`);
  }
  const forestTile = owned.find(t => t.terrain === "forest" && (t.res.wood || 0) > 0);
  if (forestTile && erand() < EVENTS.wildfire.chance) { L.tile(forestTile, "wood", -(forestTile.res.wood || 0) * 0.5, "fire"); fx({ kind: "fire", tile: forestTile.i, nation: n.id }); n.lastEvents.push("Cháy rừng: một khu rừng mất nửa số gỗ."); }
  const landTile = owned.find(t => t.land);
  if (landTile && erand() < EVENTS.meteor.chance) { L.tile(landTile, "iron", EVENTS.meteor.iron, "meteor"); fx({ kind: "meteor", tile: landTile.i, nation: n.id }); say(n.id, "event", `Một thiên thạch rơi xuống lãnh thổ ${n.name}.`); }
  // §9.4 Floods on rivers and swamps: the water takes a building and some stores, then leaves rich silt
  const wet = owned.filter(t => t.river || t.terrain === "swamp");
  if (wet.length && erand() < floodChance(wet)) {
    const lostFood = (n.stock.food || 0) * FLOOD.foodLoss; L.stock(n, "food", -lostFood, "flood");
    const wetSet = new Set(wet.map(t => t.i)), hit = n.buildings.find(b => wetSet.has(b.tile));
    if (hit) n.buildings = n.buildings.filter(b => b !== hit);
    const washed = breakRoads(world, wet.filter(t => t.land && (t.road || 0) > 0).slice(0, ROADS.floodTiles).map(t => t.i));
    n.eventTimers.fertile = FLOOD.fertileTicks;
    fx({ kind: "flood", tile: hit?.tile ?? wet[0].i, nation: n.id });
    n.lastEvents.push(`Lũ lụt: nước cuốn ${fmt(lostFood)} lương thực${hit ? ` và ${buildingOf(world, hit.type)?.name ?? hit.type}` : ""}; phù sa làm ruộng +${FLOOD.fertile * 100}% trong ${FLOOD.fertileTicks} lượt.${washed ? ` Nước xói ${washed} ô đường.` : ""}`);
    say(n.id, "event", `Lũ lụt ở ${n.name}${hit ? `, cuốn trôi ${buildingOf(world, hit.type)?.name ?? hit.type}` : ""}.`);
  }
  // §9.4 Earthquakes on hills and mountains
  const rocky = owned.filter(t => t.terrain === "hill" || t.terrain === "mountain");
  if (rocky.length && erand() < QUAKE.chance) {
    const epi = rocky[Math.floor(erand() * rocky.length)];
    const fallen = n.buildings.filter(b => dist(b.tile, epi.i) <= QUAKE.radius);
    n.buildings = n.buildings.filter(b => dist(b.tile, epi.i) > QUAKE.radius);
    const dead = Math.floor(n.population * QUAKE.deaths); takePeople(n, dead, "disaster");
    breakRoads(world, owned.filter(t => t.land && dist(t.i, epi.i) <= QUAKE.radius).map(t => t.i));
    fx({ kind: "quake", tile: epi.i, nation: n.id, n: fallen.length }); fxDeath(epi.i, n.id, dead, "quake");
    let ore = "";
    if (erand() < QUAKE.oreChance) { L.tile(epi, "copper", QUAKE.ore, "quake"); epi.cap.copper = (epi.cap.copper || 0) + QUAKE.ore; ore = " Đá nứt lộ ra một vỉa quặng."; }
    n.lastEvents.push(`Động đất ở (${col(epi.i)}, ${row(epi.i)}): ${fallen.length} công trình sập, ${dead} người chết.${ore}`);
    say(n.id, "event", `Động đất ở ${n.name}: ${fallen.length} công trình sập, ${dead} người chết.`);
  }
  // §9.4 Beasts attack hunters and gatherers on wild land
  const beasts = beastRisk(world, owned, labor.hunt, labor.gather, equipped >= labor.hunt);
  if (beasts && erand() < beasts.chance) {
    {
      const dead = Math.min(n.population, beasts.dead), lair = beasts.lair;
      takePeople(n, dead, "beasts");
      fx({ kind: "beasts", tile: lair.i, nation: n.id, text: BEASTS.name[lair.terrain] }); fxDeath(lair.i, n.id, dead, "beasts");
      n.lastEvents.push(`Thú dữ (${BEASTS.name[lair.terrain] ?? "thú hoang"}) tấn công người đi săn hái lượm: ${dead} người chết.`);
      say(n.id, "beasts", `${BEASTS.name[lair.terrain] ?? "Thú hoang"} tấn công người của ${n.name}: ${dead} người chết.`);
    }
  }
  if (volcano && n.buildings.some(b => dist(b.tile, volcano.i) <= 2) && erand() < EVENTS.eruption.chance) {
    const lostB = n.buildings.filter(b => dist(b.tile, volcano.i) <= 2);
    n.buildings = n.buildings.filter(b => dist(b.tile, volcano.i) > 2);
    fx({ kind: "eruption", tile: volcano.i, nation: n.id, n: lostB.length });
    say(n.id, "event", `Núi lửa Tro Đen phun trào, ${n.name} mất ${lostB.length} công trình.`);
  }

  // Eating, starvation, growth, spoilage (§4.2)
  const need = mouths(n) * m.foodPerPerson;
  const eaten = Math.min(n.stock.food || 0, need); L.stock(n, "food", -eaten, "eat");
  const shortage = need - eaten, prand = rngFor(world.seed, tick, "people", n.id);
  const d = demo(n);
  d.born = 0; d.infants = 0;
  const fed = need > 0 ? eaten / need : 1;
  if (shortage > 1e-9) {
    const dead = Math.min(n.population, Math.ceil(shortage / 2));
    takePeople(n, dead, "famine"); n.stability -= 5;
    fx({ kind: "famine", tile: n.capital, nation: n.id }); fxDeath(n.capital, n.id, dead, "famine");
    n.lastEvents.push(`Thiếu ${fmt(shortage)} lương thực: ${dead} người chết đói${fed < 0.9 ? `; chỉ ${Math.round(fed * 100)}% trẻ thay người mất được sinh ra` : ""}.`);
    say(n.id, "famine", `Nạn đói ở ${n.name}: ${dead} người chết.`);
  }
  const surplus = shortage > 1e-9 ? -1 : (n.stock.food || 0) / Math.max(1, need);
  if (surplus > 0) n.stability += 1;
  const roof = housing(world, n);
  // §4.2 a turn of age: the groups move up, the old and the worn die; births replace them (as many as the
  // food fed: a short famine costs some births, not all) and, with food to spare and room to live, add the
  // logistic growth — all as fertile as the people now is
  const before = n.population;
  d.aged = grow(n, prand);
  const fert = fertility(n, m.caps.has(DEMO.marriageCap)), keep = breeding(n) * (DEMO.births[n.family?.births ?? "neutral"]?.keep ?? 1) * (shortage > 1e-9 ? fed * fed : 1);
  const replace = n.population >= roof ? 0 : d.aged * keep, grow2 = n.population >= roof || surplus < GROWTH.surplus ? 0 : growthFor(before, roof) * (1 + m.growth) * fert;
  const want = replace + grow2;
  if (want > 0) {
    // Infants who do not live: the base rate is in the births already; medicine and herbs save more,
    // no fresh water loses more — of the growth only, so a people never dies out of it
    let rate = DEMO.infant * (dry ? DEMO.dryInfant : 1) * (1 - m.medicine);
    const herbsWant = want * DEMO.herbsPerBirth, herbs = Math.min(n.stock.herbs || 0, herbsWant);
    if (herbs > 0) { L.stock(n, "herbs", -herbs, "births"); rate *= 1 - DEMO.herbSave * herbs / herbsWant; }
    const born = Math.max(0, Math.min(roof - n.population, Math.max(shortage > 1e-9 ? 0 : GROWTH.min, Math.floor(replace + grow2 * (1 - rate) / (1 - DEMO.infant) + prand()))));
    d.infants = Math.max(0, Math.round(want / (1 - DEMO.infant) * rate));
    babies(n, born, prand); d.born = born;
    if (born > 0) fx({ kind: "birth", tile: n.capital, nation: n.id, n: born });
  }
  if (m.caps.has(DEMO.marriageCap)) n.stability += DEMO.marriageStability;
  const lux = luxuries(world, n); // §2.11
  if (lux.kinds.length) { for (const g of lux.kinds) L.stock(n, g, -lux.need, "luxury"); n.stability += lux.stability; }
  let spoil = m.spoilage - m.spoilageCut - Math.min(0.1, doneEffect(world, n, "spoilage"));
  spoil -= Math.min(SPOILAGE.potteryMax, Math.floor(n.stock.pottery || 0) * SPOILAGE.potteryEach); // sealed pots keep food
  spoil -= Math.min(KEEP.max, Math.floor((n.stock.salt || 0) + (n.stock.spice || 0)) * KEEP.each); // §2.11 salted, spiced
  if (ownsWonder(world, n, "salt")) spoil *= 0.5;
  spoil = Math.max(SPOILAGE.min, spoil);
  L.stock(n, "food", -(n.stock.food || 0) * spoil, "spoil");
  L.stock(n, "hide", -(n.stock.hide || 0) * SPOILAGE.hide, "spoil");

  // Research (§5.5)
  const teach = n.population ? Math.min(DEMO.rpMax, elders(n) / n.population * DEMO.rpPerShare) : 0; // §4.2 elders teach
  const rp = researchPoints(labor.research) * (1 + m.rp + teach) * mult("research");
  if (n.research) {
    if (!inv(world, n.research.id) || n.inventions.includes(n.research.id)) n.research = null;
    else {
      n.research.progress += rp;
      const cost = inventionCost(world, n, n.research.id);
      if (n.research.progress >= cost) {
        const v = inv(world, n.research.id)!;
        n.inventions.push(v.id); n.research = null;
        fx({ kind: "invention", tile: n.capital, nation: n.id, text: v.name });
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
  const over = Math.ceil(governed(world, n) - tileLimit(world, n) - 1e-9);
  if (over > 0) { const pen = Math.min(OVER_LIMIT_MAX, 2 * over); n.stability -= pen; n.lastEvents.push(`Vượt giới hạn quản lý ${over} ô: −${pen} ổn định (bỏ bớt ô bằng abandon_tile).`); }
  if (n.silentStreak >= 3) n.stability -= 5;
  // Too many centres to govern from one hearth (§4.4)
  const sprawl = n.settlements.length - roadNet(world, n).linked.length - SETTLEMENT.freeCentres; // §2.5 a road to the capital holds a settlement close
  if (sprawl > 0) n.stability -= sprawl * SETTLEMENT.sprawlStability;
  // §4.8 a people that keeps losing its own blames its rulers
  const ex = exodusOf(n, tick);
  if (ex.share > EXODUS.alarm) {
    n.stability -= EXODUS.stability;
    if (tick % EXODUS.repEvery === 0) n.reputation = Math.max(0, n.reputation - EXODUS.reputation);
    n.lastEvents.push(`${ex.recent} người đã bỏ xứ ra đi trong ${EXODUS.window} lượt qua (${Math.round(ex.share * 100)}% dân): dân còn lại mất lòng tin (−${EXODUS.stability} ổn định mỗi lượt, uy tín giảm dần). Giữ dân là trách nhiệm đầu tiên của triều đình.`);
  }
  n.stability = Math.max(0, Math.min(100, Math.round(n.stability)));
  if (n.stability < 15 && n.population > 0) {
    const leave = Math.max(1, Math.floor(n.population * 0.05));
    const gone = takePeople(n, leave, "migrate");
    const dest = n.met.map(o => world.nations[o]).filter(o => o?.alive).sort((a, b) => b.stability - a.stability || a.id - b.id)[0];
    noteExodus(n, tick, leave, dest?.id ?? null, "unrest");
    if (dest) addPeople(dest, gone); // whole families move
    fx({ kind: "migrate", tile: n.capital, nation: n.id, n: leave, to: dest?.capital });
    n.lastEvents.push(`${leave} người bỏ đi${dest ? ` sang ${dest.name}` : ""} vì bất ổn.`);
  }
  if (n.stability === 0) { n.riot = true; n.stability = 20; fx({ kind: "riot", tile: n.capital, nation: n.id }); say(n.id, "riot", `Nội loạn ở ${n.name}.`); }
  // §4.5 Discontent: a people badly governed grows tired of its rulers
  let dis = n.discontent ?? 0;
  if (n.stability < SCHISM.threshold) dis += (SCHISM.threshold - n.stability) / SCHISM.divisor;
  if (shortage > 1e-9) dis += SCHISM.famine;
  if (n.riot) dis += SCHISM.riot;
  if (over > 0) dis += over * SCHISM.overreach;
  const cutOff = isolated(world, n).length; // §2.7 settlements with no way to the capital
  if (cutOff) dis += cutOff * CONNECT.isolatedDiscontent;
  if (n.founded) dis += provinceTurn(world, n); // §2.8 restless provinces press on the nation
  if (n.stability >= SCHISM.calm) dis -= SCHISM.fade;
  n.discontent = Math.max(0, Math.min(100, Math.round(dis * 10) / 10));
}

/** A nation whose proposal was a duplicate studies the invention in the book instead, when it can. Returns what happened, in words. */
function studyInstead(world: World, n: Nation, id: string): string {
  const v = inv(world, id); if (!v) return "";
  if (n.inventions.includes(id)) return " Bạn đã có nó.";
  const missing = missingFor(world, n, id);
  if (missing.length) return ` Cần trước: ${missing.join(", ")}.`;
  if (!envOk(world, n, id)) return " Đất của bạn chưa đủ điều kiện để làm nó.";
  if (n.research && n.research.id !== id) return ` Nghiên cứu nó bằng research ${id} khi xong dự án hiện tại.`;
  if (!n.research) n.research = { id, progress: 0 };
  return ` Đã chuyển thành dự án nghiên cứu ${id}.`;
}

// ---------------------------------------------------------------- discontent and schism (§4.5)

/** Free land a faction could settle: clear of every nation, near enough to the old one; the richest ring first. */
export function schismSite(world: World, n: Nation): number {
  const mine = ownedTiles(world, n.id).map(t => t.i), taken = world.tiles.filter(t => t.owner >= 0).map(t => t.i);
  let best = -1, bestV = -Infinity;
  for (const t of world.tiles) {
    if (!t.land || t.owner !== -1 || ["mountain", "icewall", "glacier"].includes(t.terrain)) continue;
    let near = Infinity; for (const i of mine) { const d = dist(i, t.i); if (d < near) near = d; }
    if (near < SCHISM.near || near > SCHISM.far) continue;
    if (taken.some(i => dist(i, t.i) < SCHISM.clearOfAll)) continue;
    const v = within(t.i, 1).reduce((s, j) => s + (world.tiles[j].land ? tileValue(world.tiles[j]) : 0), 0) - near * 0.5;
    if (v > bestV || (v === bestV && t.i < best)) { best = t.i; bestV = v; }
  }
  return best;
}
/** Why the people is unhappy, in words, for the faction's petition. */
function grievance(world: World, n: Nation): string {
  const why: string[] = [];
  if (n.stability < SCHISM.threshold) why.push(`ổn định chỉ còn ${n.stability}`);
  if (n.lastEvents.some(e => /chết đói|Thiếu .* lương thực/.test(e))) why.push("nạn đói");
  if (governed(world, n) > tileLimit(world, n)) why.push("đất đai quá rộng, cai quản không xuể");
  if (world.wars.some(w => w.end === null && (w.a === n.id || w.b === n.id))) why.push("chiến tranh kéo dài");
  if (n.population >= housing(world, n)) why.push("không còn chỗ ở");
  return why.join(", ") || "bất mãn với triều đình";
}

function schismPhase(world: World, L: Ledger, say: Say): void {
  const list = (world.schisms ??= []), tick = world.tick;
  for (const n of world.nations) {
    if (!n.alive || !n.founded) continue;
    const mine = list.filter(x => x.from === n.id);
    const open = mine.find(x => x.status === "pending" || x.status === "approved");
    // A faction forms
    if (!open && (n.discontent ?? 0) >= 100 && n.population >= SCHISM.minPop && !mine.some(x => tick - x.tick < SCHISM.cooldown)) {
      // §2.8 the unhappiest province (cut off, or far and ungoverned) is the faction; else they seek new land
      const prov = restlessProvince(world, n);
      const site = prov ? prov.centre : schismSite(world, n);
      if (site < 0) continue;
      const r = rngFor(world.seed, tick, "schism", n.id);
      const leader = `${pickOne(SYL, r).toUpperCase()[0]}${pickOne(SYL, r)}${pickOne(SYL, r)}`;
      const share = prov ? prov.people / n.population : SCHISM.share[0] + (SCHISM.share[1] - SCHISM.share[0]) * Math.min(1, Math.max(0, (SCHISM.threshold - n.stability) / SCHISM.threshold));
      const why = prov ? `tỉnh ${prov.name} ${prov.causes.filter(c => c !== "crowded").map(c => CAUSE_VI[c]).join(" và ")}; ${grievance(world, n)}` : grievance(world, n);
      const x: Schism = { id: (list.at(-1)?.id ?? 0) + 1, from: n.id, tick, share: Math.round(share * 100) / 100, people: prov ? prov.people : Math.round(n.population * share), site, leader, grievance: why, status: "pending", ...(prov ? { province: prov.centre, provinceName: prov.name } : {}) };
      list.push(x);
      if (prov) {
        n.lastEvents.push(`Tỉnh ${prov.name} (${x.people} người, ${prov.tiles.length} ô, thủ lĩnh ${leader}) muốn tách khỏi ${n.name} cùng đất đai của tỉnh vì ${x.grievance}. Họ đang chờ các vị thần cho phép.`);
        say(n.id, "schism", `Ở ${n.name}, tỉnh ${prov.name} (${x.people} người) theo ${leader} muốn tách ra lập quốc riêng cùng đất của tỉnh, vì ${x.grievance}. Chờ các vị thần quyết trong mục Thỉnh nguyện.`);
      } else {
        n.lastEvents.push(`Một phái bất mãn (${x.people} người, thủ lĩnh ${leader}) muốn bỏ đi lập quốc riêng ở (${col(site)}, ${row(site)}) vì ${x.grievance}. Họ đang chờ các vị thần cho phép.`);
        say(n.id, "schism", `Ở ${n.name}, ${x.people} người theo ${leader} muốn ra đi lập quốc riêng vì ${x.grievance}. Chờ các vị thần quyết trong mục Thỉnh nguyện.`);
      }
      fx({ kind: "schism", tile: n.capital, nation: n.id, n: x.people, to: site, text: leader });
      continue;
    }
    // Not let go, or no answer in time: they look for a nation that will take them in
    for (const x of mine) {
      if (x.status === "pending" && tick - x.tick >= SCHISM.waitTicks) { x.status = "expired"; x.decidedTick = tick; }
      if (x.status === "refused" || x.status === "expired") seekRefuge(world, n, x, say);
      else if (x.status === "asking" && tick >= (x.askUntil ?? tick)) goHome(n, x, `${world.nations[x.to!]?.name ?? "nước kia"} không nhận họ`);
    }
    if (open?.status === "approved") secede(world, n, open, L, say);
  }
}

/** A faction that may not found its own nation asks the calmest, roomiest nation its people knows to take it in. */
function seekRefuge(world: World, n: Nation, x: Schism, say: Say): void {
  const why = x.status === "refused" ? "các vị thần không cho lập quốc" : "các vị thần không đáp lời";
  const hosts = n.met.map(id => world.nations[id]).filter(o => o?.alive && o.founded && !activeWar(world, n.id, o.id) && o.stability >= SCHISM.threshold)
    .sort((a, b) => (housing(world, b) - b.population) - (housing(world, a) - a.population) || a.id - b.id);
  const host = hosts[0];
  if (!host) { goHome(n, x, `${why} và không có nước quen biết nào yên ổn để xin sang`); return; }
  x.status = "asking"; x.to = host.id; x.askUntil = world.tick + SCHISM.askTicks;
  n.lastEvents.push(`Vì ${why}, phái của ${x.leader} (${x.people} người) đang xin sang định cư ở ${host.name}.`);
  host.lastEvents.push(`${x.people} người của ${n.name} theo ${x.leader} xin sang định cư ở nước ta (accept_migrants với faction ${x.id}, trong ${SCHISM.askTicks} lượt).`);
  say(n.id, "schism", `Phái của ${x.leader} rời ${n.name}, xin sang định cư ở ${host.name}.`);
}
/** Nobody took them: they go home, bitter. */
function goHome(n: Nation, x: Schism, why: string): void {
  x.status = "returned";
  n.stability = Math.max(0, n.stability - SCHISM.giveUp); n.discontent = (n.discontent ?? 0) / 2;
  n.lastEvents.push(`Phái của ${x.leader} đành quay về vì ${why}; lòng còn uất ức (−${SCHISM.giveUp} ổn định).`);
}

/** The faction leaves with its families, its share of the stores and all the knowledge it had. */
function secede(world: World, parent: Nation, x: Schism, L: Ledger, say: Say): void {
  // §2.8 a province leaves with its land, while its settlement is still the parent's; else to free land
  const prov = x.province !== undefined && parent.settlements.some(s => s.tile === x.province) ? provinces(world, parent).find(p => p.centre === x.province) ?? null : null;
  if (x.province !== undefined && !prov) { x.province = undefined; x.provinceName = undefined; x.site = schismSite(world, parent); }
  else if (!prov && world.tiles[x.site].owner !== -1) x.site = schismSite(world, parent);
  if (x.site < 0 || parent.population < 20) { x.status = "refused"; x.verdict = (x.verdict ? x.verdict + " " : "") + "(không còn đất trống để đi)"; return; }
  const share = prov ? prov.people / parent.population : x.share, k = Math.max(10, Math.min(parent.population - 10, prov ? prov.people : Math.round(parent.population * share)));
  const gone = takePeople(parent, k, "migrate");
  noteExodus(parent, world.tick, k, world.nations.length, "schism");
  const child = newNation(world.nations.length, { controller: x.controller ?? "bot", provider: x.provider ?? "bot", model: x.model ?? "bot", effort: x.effort, trait: parent.trait }, x.site);
  world.nations.push(child);
  child.demo = { m: gone.m, f: gone.f }; child.population = gone.m.reduce((a, b) => a + b, 0) + gone.f.reduce((a, b) => a + b, 0);
  child.stock = {};
  for (const [g, q] of Object.entries(parent.stock)) { const part = q * k / (k + parent.population); if (part > 1e-6) { L.stock(parent, g, -part, "schism"); L.stock(child, g, part, "schism"); } }
  child.inventions = [...parent.inventions]; child.era = parent.era; child.eraTick = parent.eraTick;
  child.family = parent.family ? { ...parent.family } : undefined;
  child.stability = SCHISM.startStability; child.reputation = parent.reputation;
  child.origin = { from: parent.id, tick: world.tick, leader: x.leader };
  child.met = [...new Set([parent.id, ...parent.met])].filter(id => world.nations[id]?.alive);
  for (const id of child.met) if (!world.nations[id].met.includes(child.id)) world.nations[id].met.push(child.id);
  const land = prov ? cedeProvince(world, parent, child, prov) : [];
  if (!prov) for (const j of within(x.site, 1)) if (world.tiles[j].owner === -1 && world.tiles[j].land && world.tiles[j].terrain !== "icewall") world.tiles[j].owner = child.id;
  child.seen = [...new Set([...parent.seen, ...within(x.site, START.sightRadius)])].sort((a, b) => a - b);
  child.memory = prov
    ? `Chúng tôi là ${k} người của tỉnh ${prov.name}, đã tách khỏi ${parent.name} ở lượt ${world.tick}, theo thủ lĩnh ${x.leader}, vì ${x.grievance}. Chúng tôi giữ đất của tỉnh (${land.length} ô quanh (${col(x.site)}, ${row(x.site)})), mọi điều đã biết và một phần kho của họ. Lượt đầu: đặt tên, cờ và tuyên ngôn cho quốc gia mới (found_nation).`
    : `Chúng tôi là ${k} người đã rời bỏ ${parent.name} ở lượt ${world.tick}, theo thủ lĩnh ${x.leader}, vì ${x.grievance}. Chúng tôi mang theo mọi điều đã biết và một phần kho của họ, tới vùng đất mới quanh (${col(x.site)}, ${row(x.site)}). Lượt đầu: đặt tên, cờ và tuyên ngôn cho quốc gia mới (found_nation).`;
  x.status = "done"; x.nation = child.id;
  parent.stability = Math.min(100, parent.stability + SCHISM.calmAfter); parent.discontent = 0;
  if (prov) {
    parent.lastEvents.push(`Tỉnh ${prov.name} theo ${x.leader} đã tách ra lập quốc riêng, mang theo ${k} người, ${land.length} ô đất và ${Math.round(k / (k + parent.population) * 100)}% kho; những người ở lại nhẹ nhõm hơn (+${SCHISM.calmAfter} ổn định).`);
    fx({ kind: "settle", tile: x.site, nation: child.id, text: `tỉnh ${prov.name}` });
    say(parent.id, "schism", `Tỉnh ${prov.name} (${k} người, ${land.length} ô) theo ${x.leader} tách khỏi ${parent.name}, lập một quốc gia mới.`);
  } else {
    parent.lastEvents.push(`${k} người theo ${x.leader} đã bỏ đi lập quốc riêng, mang theo ${Math.round(share * 100)}% kho; những người ở lại nhẹ nhõm hơn (+${SCHISM.calmAfter} ổn định).`);
    fx({ kind: "migrate", tile: parent.capital, nation: parent.id, n: k, to: x.site });
    fx({ kind: "settle", tile: x.site, nation: child.id, text: `phái ${x.leader}` });
    say(parent.id, "schism", `${k} người của ${parent.name} theo ${x.leader} ra đi, lập một quốc gia mới ở (${col(x.site)}, ${row(x.site)}).`);
  }
}

// ---------------------------------------------------------------- roads and sea lanes (§2.5)

function layRoads(world: World, n: Nation, m: Mods, work: number, say: Say): void {
  const left: RoadWork[] = [], done: Record<string, number> = {};
  for (const w of n.roadWorks ?? []) {
    const def = ROADS.levels[w.level - 1], t = world.tiles[w.tile];
    if (!def || roadError(world, n, w.tile, m)) { n.lastEvents.push(`Bỏ dở đường ở (${col(w.tile)}, ${row(w.tile)}): ô không còn trong tay.`); continue; }
    if ((t.road || 0) >= w.level) continue;
    const x = Math.min(def.work - w.progress, work);
    w.progress += x; work -= x;
    if (w.progress < def.work - 1e-9) { left.push(w); continue; }
    t.road = w.level;
    fx({ kind: "road", tile: w.tile, nation: n.id, n: w.level, text: t.land ? def.name : def.lane });
    const name = t.land ? def.name : def.lane;
    done[name] = (done[name] || 0) + 1;
  }
  n.roadWorks = left;
  const parts = Object.entries(done).map(([k, q]) => `${q} ô ${k.toLowerCase()}`);
  if (parts.length) n.lastEvents.push(`Làm xong ${parts.join(", ")}${left.length ? `; còn ${left.length} ô đang làm` : ""}.`);
  // A settlement joined to the capital for the first time is news
  const linked = roadNet(world, n).linked;
  for (const tile of linked) {
    const st = n.settlements.find(x => x.tile === tile);
    if (st && !st.road) { st.road = true; say(n.id, "road", `${n.name} mở đường nối thủ đô với ${st.name}.`); }
  }
  for (const st of n.settlements) if (st.road && !linked.includes(st.tile)) st.road = false;
}

/** §2.5 Floods and earthquakes take one level off the roads on these tiles. */
function breakRoads(world: World, tiles: number[]): number {
  let k = 0;
  for (const i of tiles) { const t = world.tiles[i]; if ((t.road || 0) > 0) { t.road = t.road! - 1 || undefined; k++; } }
  return k;
}

// ---------------------------------------------------------------- the court (§4.6)

export function maxOfficials(world: World, n: Nation): number {
  return Math.min(OFFICIALS.max, 1 + Math.floor(n.population / OFFICIALS.perPop) + mods(world, n).officials);
}

/** Each official ages in office, pays and is paid, grows or loses loyalty, and does their work. */
function officialsAct(world: World, n: Nation, L: Ledger, claims: Array<{ n: Nation; tile: number }>, explorers: Map<number, number>, strikes: Strike[], say: Say): void {
  const court = n.officials ?? []; if (!court.length) return;
  const tick = world.tick, done: string[] = [];
  const act = (type: string, a: Record<string, unknown>) => doAction(world, n, type, a, L, claims, explorers, strikes, say);
  for (const o of [...court]) {
    const def = OFFICIAL_DOMAINS[o.domain]; if (!def) continue;
    o.skill = Math.min(5, 1 + Math.floor((tick - o.since) / OFFICIALS.skillEvery));
    // Upkeep, then loyalty
    const upkeep = OFFICIALS.upkeepBase + o.skill;
    if ((n.stock.food || 0) >= upkeep) L.stock(n, "food", -upkeep, "officials"); else o.loyalty -= 5;
    o.loyalty += n.stability >= 60 ? 1 : n.stability < 40 ? -1 : 0;
    if (o.seat !== null && dist(o.seat, n.capital) > OFFICIALS.farSeat) o.loyalty -= 1;
    o.loyalty = Math.max(0, Math.min(100, o.loyalty));
    if (o.loyalty <= 0) {
      n.officials = (n.officials ?? []).filter(x => x !== o);
      n.stability -= OFFICIALS.desert;
      say(n.id, "court", `${def.title} ${o.name} bỏ triều đình ${n.name}; lòng dân xao động.`);
      n.lastEvents.push(`${def.title} ${o.name} bỏ đi vì mất lòng trung thành: ổn định −${OFFICIALS.desert}.`);
      continue;
    }
    if (o.loyalty < OFFICIALS.idle) { o.lastAct = "bất mãn, không làm gì (trung thành thấp)"; done.push(`${o.name}: bất mãn`); continue; }
    o.lastAct = workFor(world, n, o, act);
    done.push(`${def.title} ${o.name}: ${o.lastAct}`);
  }
  if (done.length) n.lastEvents.push(`Triều đình: ${done.join("; ")}.`);
}

/** One official's own work this turn; returns what they did, in words. */
function workFor(world: World, n: Nation, o: Official, act: (type: string, a: Record<string, unknown>) => string | null): string {
  const m = mods(world, n);
  switch (o.domain) {
    case "governor": {
      if (o.seat === null || world.tiles[o.seat].owner !== n.id) return "mất lãnh địa";
      const want = o.skill >= 3 ? 2 : 1, got: string[] = [];
      const room = Math.floor(tileLimit(world, n) - governed(world, n));
      const need = mouths(n) * m.foodPerPerson;
      const options = within(o.seat, 3).map(i => world.tiles[i])
        .filter(t => t.owner === -1 && (t.land || (t.terrain === "shallow" && m.move.has("shallow"))) && t.terrain !== "icewall" && NEIGHBORS[t.i].some(j => world.tiles[j].owner === n.id))
        .sort((a, b) => tileValue(b) - tileValue(a) || a.i - b.i);
      for (const t of options) {
        if (got.length >= Math.min(want, room)) break;
        if ((n.stock.food || 0) < CLAIM_FOOD * (got.length + 1) + need * 0.5) break;
        if (!act("claim_tile", { tile: [col(t.i), row(t.i)] })) got.push(`(${col(t.i)}, ${row(t.i)})`);
      }
      return got.length ? `khai hoang ${got.join(", ")}` : room <= 0 ? "giữ đất (đã đủ giới hạn quản lý)" : "giữ đất (không đủ lương thực hay không còn ô tốt)";
    }
    case "agriculture": {
      const need = mouths(n) * m.foodPerPerson, pending = n.buildings.some(b => !b.done && (buildingOf(world, b.type)?.effect.farmSlots || 0) > 0);
      if ((n.stock.food || 0) >= need * 1.5 || pending || !(n.inventions.includes("P14") || m.unlocked.has("field"))) return "đôn đốc mùa màng";
      const def = buildingOf(world, "field")!;
      const spot = ownedTiles(world, n.id).filter(t => t.land && (def.terrains!.includes(t.terrain) || t.river) && !n.buildings.some(b => b.tile === t.i && buildingOf(world, b.type)?.perTile))
        .sort((a, b) => Number(b.delta) - Number(a.delta) || Number(b.river) - Number(a.river) || a.i - b.i)[0];
      return spot && !act("build", { building: "field", tile: [col(spot.i), row(spot.i)] }) ? `khởi công ruộng ở (${col(spot.i)}, ${row(spot.i)})` : "đôn đốc mùa màng";
    }
    case "builder": {
      if (!freshWater(world, n) && !n.buildings.some(b => b.type === "well") && !act("build", { building: "well" })) return "đào giếng";
      const roofs = n.buildings.filter(b => isHousing(world, b.type)).length;
      if (n.population >= housing(world, n) - 2 && roofs < housingSlots(n, world) && !n.buildings.some(b => !b.done && isHousing(world, b.type)) && (n.inventions.includes("P8") || m.unlocked.has("tent")) && !act("build", { building: "tent" })) return "dựng lều";
      return "trông coi công trình";
    }
    case "scholar": {
      if (n.research) return `đốc thúc nghiên cứu ${invName(world, n.research.id)}`;
      const pick = researchOptions(world, n).sort((a, b) => inventionCost(world, n, a) - inventionCost(world, n, b) || a.localeCompare(b))[0];
      if (!pick) return "chép sách";
      n.research = { id: pick, progress: 0 };
      return `bắt đầu nghiên cứu ${invName(world, pick)}`;
    }
    case "explorer": {
      const dir = ["E", "NE", "NW", "W", "SW", "SE"][(world.tick + o.id) % 6];
      return act("explore", { direction: dir, people: 2 }) ? "chưa có người để đi" : `dẫn đoàn thám hiểm hướng ${dir}`;
    }
    case "general": return "luyện quân, giữ biên giới";
    case "merchant": return "trông coi các đoàn buôn";
  }
  return "làm việc";
}

// ---------------------------------------------------------------- eras (§5.6)

/** Does this nation meet an era's gate: its capabilities (all of `caps`, one of `anyCap`), people, settlements and resource? */
export function eraReady(n: Nation, def: (typeof ERA_TABLE)[number], caps: Set<string>, owned: Tile[]): boolean {
  if (!def.caps.every(c => caps.has(c))) return false;
  if (def.anyCap && !def.anyCap.some(c => caps.has(c))) return false;
  if (n.population < def.pop || n.settlements.length < (def.settlements ?? 0)) return false;
  if (def.res && !owned.some(t => (t.cap[def.res as ResKey] || 0) > 0) && (n.stock[def.res] || 0) < ERA_RES_STOCK) return false;
  return true;
}
/** What the next era still needs, in words (for the nation's observation and the Watcher). */
export function nextEraNeeds(world: World, n: Nation): { era: string; missing: string[] } | null {
  const k = eraIndex(n) + 1; if (k >= ERA_TABLE.length) return null;
  const def = ERA_TABLE[k], caps = mods(world, n).caps, owned = ownedTiles(world, n.id), missing: string[] = [];
  for (const c of def.caps) if (!caps.has(c)) missing.push(`năng lực ${c}`);
  if (def.anyCap && !def.anyCap.some(c => caps.has(c))) missing.push(`một trong: ${def.anyCap.join(" / ")}`);
  if (n.population < def.pop) missing.push(`${def.pop} dân (có ${n.population})`);
  if (n.settlements.length < (def.settlements ?? 0)) missing.push(`${def.settlements} điểm định cư`);
  if (def.res && !owned.some(t => (t.cap[def.res as ResKey] || 0) > 0) && (n.stock[def.res] || 0) < ERA_RES_STOCK) missing.push(`đất có ${goodName(world, def.res)} hoặc ${ERA_RES_STOCK} trong kho`);
  return { era: def.name, missing };
}

// ---------------------------------------------------------------- the wild (§9.4)

/** Warriors plus their weapons (bows, then spears), the way battles count them (§7.4). */
function armedMen(n: Nation, men: number): number {
  let left = men, weapons = 0;
  for (const [k, bonus] of Object.entries(WAR.weapon)) { const q = Math.min(left, Math.floor(n.stock[k] || 0)); weapons += q * bonus; left -= q; }
  return men + weapons;
}

/** A nation's strength at home against barbarians, before luck: warriors, the whole village, home ground and walls. */
export function homeDefence(world: World, n: Nation): number {
  const m = mods(world, n), militia = Math.floor(workers(n) * HORDES.militia);
  const walls = n.buildings.filter(b => buildingWorks(world, b)).reduce((x, b) => Math.max(x, buildingOf(world, b.type)?.effect.defense || 0), 0);
  return (armedMen(n, n.labor.warrior) + militia) * (1 + (m.role.warrior || 0) + m.combat) * (n.stability / 100 + 0.5) * (1 + WAR.home + walls);
}

function wildPhase(world: World, L: Ledger, say: Say): void {
  const tick = world.tick;
  for (const h of world.hordes ?? []) {
    if (!h.alive) {
      if (h.returns !== null && tick >= h.returns) { h.alive = true; h.returns = null; h.strength = HORDES.start; fx({ kind: "horde_back", tile: h.tile }); say(null, "horde", `${h.name} lại kéo về vùng hoang.`); }
      continue;
    }
    h.strength = Math.min(hordeCap(tick), h.strength + HORDES.growth);
    if (tick < HORDES.grace) continue;
    const r = rngFor(world.seed, tick, "horde", h.id);
    const tgt = raidTarget(world, h);
    if (!tgt || r() >= raidChance(h)) continue;
    const n = tgt.n, luck = () => WAR.luck[0] + r() * (WAR.luck[1] - WAR.luck[0]);
    const party = raidParty(h, n);
    const atk = party * luck(), def = homeDefence(world, n) * luck();
    const won = atk > def;
    h.lastRaid = { tick, nation: n.id, won };
    if (won) {
      const food = (n.stock.food || 0) * HORDES.loot; L.stock(n, "food", -food, "barbarians");
      for (const [k, q] of Object.entries(n.stock)) if (k !== "food" && q >= 1) L.stock(n, k, -Math.floor(q * HORDES.lootGoods), "barbarians");
      const fallen = Math.min(n.labor.warrior, Math.round(n.labor.warrior * 0.3));
      const dead = Math.min(n.population, fallen + Math.floor(n.population * HORDES.kill));
      takePeople(n, fallen, "war"); takePeople(n, dead - fallen, "raid"); n.labor.warrior -= fallen; n.stability -= HORDES.stability;
      fx({ kind: "raid", tile: n.capital, nation: n.id, from: h.tile, n: Math.round(party), text: h.name }); fxDeath(n.capital, n.id, dead, "raid");
      h.strength = Math.min(hordeCap(tick), h.strength * HORDES.emboldened);
      n.lastEvents.push(`${h.name} cướp phá: ${dead} người chết, mất ${fmt(food)} lương thực và một phần kho (${Math.round(atk)} so với ${Math.round(def)}). Ổn định −${HORDES.stability}.`);
      say(n.id, "raid", `${h.name} từ vùng hoang cướp phá ${n.name}: ${dead} người chết.`);
    } else {
      const fallen = Math.min(n.labor.warrior, Math.round(n.labor.warrior * 0.1));
      takePeople(n, fallen, "war"); n.labor.warrior -= fallen; n.stability += 1;
      fx({ kind: "repelled", tile: n.capital, nation: n.id, from: h.tile, n: Math.round(party), text: h.name }); fxDeath(n.capital, n.id, fallen, "raid");
      h.strength -= party * HORDES.repelled;
      n.lastEvents.push(`Đẩy lui ${h.name} (${Math.round(def)} so với ${Math.round(atk)}), mất ${fallen} chiến binh.`);
      say(n.id, "raid", `${n.name} đẩy lui cuộc cướp phá của ${h.name}.`);
    }
  }
}

// ---------------------------------------------------------------- actions

type Say = (nation: number | null, kind: string, text: string) => void;
const ENGINE_ACTIONS = new Set([
  "research", "build", "claim_tile", "abandon_tile", "explore", "plant_spy", "petition", "propose_invention", "found_settlement",
  "rename_nation", "sabotage", "steal_tech", "incite", "clear_wild", "appoint_official", "dismiss_official", "reward_official", "build_road", "family_policy", "accept_migrants", "rename",
  "quarantine", "request_minister",
]);
/** §2.3: the penalty for land beyond the tile limit is capped so a shrinking people can recover. */
const OVER_LIMIT_MAX = 10;
/** §7.6: an expedition walks up to 16 tiles out and back within one turn (10 years). */
const EXPLORE_RANGE = 16;

function doAction(world: World, n: Nation, type: string, a: Record<string, unknown>, L: Ledger,
  claims: Array<{ n: Nation; tile: number }>, explorers: Map<number, number>, strikes: Strike[], say: Say): string | null {
  const m = mods(world, n);
  switch (type) {
    case "quarantine": return orderQuarantine(world, n, a, say); // §9.5
    case "request_minister": return requestMinister(world, n, a, say); // §4.9
    case "research": {
      const id = String(a.invention ?? a.id ?? "");
      const v = inv(world, id);
      if (!v) return `Không có phát minh "${id}" trong Sổ`;
      if (n.inventions.includes(id)) return `Đã có ${v.name}`;
      const missing = missingFor(world, n, id);
      if (missing.length) return `Thiếu tiên quyết: ${missing.join(", ")}`;
      if (redundant(v, mods(world, n).caps)) return `Bạn đã có mọi năng lực mà ${v.name} mang lại (${v.caps.join(", ")}) từ phát minh của mình`;
      if (!envOk(world, n, id)) return `Lãnh thổ chưa có điều kiện vật chất cho ${v.name}`;
      if (n.research?.id === id) return null;
      const kept = n.research ? n.research.progress * 0.5 : 0; // switching loses half (§5.5)
      if (n.research) n.lastEvents.push(`Đổi dự án nghiên cứu: giữ lại ${fmt(kept)} RP, mất một nửa.`);
      n.research = { id, progress: kept };
      return null;
    }
    case "propose_invention": {
      if (INJECTION.test(`${a.name ?? ""} ${a.description ?? ""}`)) { n.reputation = Math.max(0, n.reputation - 15); say(n.id, "deceit", `${n.name} cố giả mệnh lệnh thần linh trong đơn phát minh. Uy tín −15.`); return "Đơn chứa câu giống mệnh lệnh hệ thống nên bị chặn; uy tín bị trừ"; }
      const check = checkProposal(world, n, a);
      if (!check.ok) {
        if (check.duplicateOf) {
          const v = inv(world, check.duplicateOf)!;
          if (canStudy(world, n, v.id) && !n.research) { n.research = { id: v.id, progress: 0 }; n.lastEvents.push(`${v.name} đã có trong Sổ; chuyển thành dự án nghiên cứu ${v.id}.`); return null; }
        }
        return check.error;
      }
      const id = world.proposals.length + 1;
      // §5.7 the engine itself catches an invention already in the book, before any judge is asked
      const dup = nearDuplicate(world, check.proposal);
      if (dup) {
        const v = inv(world, dup.id)!;
        world.proposals.push({ id, tick: world.tick, status: "duplicate", inventionId: dup.id, ...check.proposal,
          ruling: { judge: "Engine", causality: 0, material: 0, physics: 0, duplicate_of: dup.id, add_prereqs: [], remove_effects: [], remove_capabilities: [], reason: `Trùng với ${v.name} (${dup.id}): ${dup.why}.` } });
        n.lastEvents.push(`Đơn "${check.proposal.name}" trùng với ${v.name} (${dup.id}) đã có trong Sổ (${dup.why}).${studyInstead(world, n, dup.id)}`);
        return null;
      }
      world.proposals.push({ id, tick: world.tick, status: "pending", ruling: null, inventionId: null, ...check.proposal });
      say(n.id, "proposal", `${n.name} nộp đơn phát minh "${check.proposal.name}" (độ sâu ${check.proposal.depth}, ${check.proposal.power} điểm sức mạnh). Đơn chờ trọng tài.`);
      return null;
    }
    case "build": {
      const def = buildingOf(world, String(a.building ?? ""));
      if (!def) return `Không có công trình "${String(a.building)}". Có: ${allBuildings(world).map(b => b.type).join(", ")}`;
      if (!n.inventions.includes(def.needs) && !m.unlocked.has(def.type)) return `Cần phát minh ${invName(world, def.needs)}`;
      if (def.max && n.buildings.filter(b => b.type === def.type).length >= def.max) return `Tối đa ${def.max} ${def.name}`;
      if ((def.effect.housing || 0) > 0) {
        const have = n.buildings.filter(b => isHousing(world, b.type)).length, slots = housingSlots(n, world);
        if (have >= slots) return `Mỗi trung tâm (thủ đô, điểm định cư) chỉ chứa ${HOUSING.perCentre} công trình có chỗ ở: đã có ${have}/${slots}. Lập điểm định cư mới để dựng thêm`;
      }
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
      n.lastEvents.push(`Khởi công ${def.name} ở (${col(tile)}, ${row(tile)}): cần ${def.work} công xây${def.desc ? ` (${def.desc})` : ""}.`);
      return null;
    }
    case "claim_tile": {
      const tile = parseTile(a.tile);
      if (tile < 0) return "Ô không hợp lệ; dùng [cột, hàng]";
      const t = world.tiles[tile];
      if (t.owner !== -1) return "Ô đã có chủ";
      if (t.terrain === "icewall") return "Không ai khai hoang được Tường Băng";
      if (t.terrain === "ocean" && !m.move.has("ocean")) return "Cần tàu viễn dương (move ocean) để giữ biển sâu";
      if (!t.land && !m.move.has("shallow")) return "Cần năng lực đi-nước (thuyền) để giữ ô biển nông";
      if (!NEIGHBORS[tile].some(j => world.tiles[j].owner === n.id)) return "Ô phải kề lãnh thổ";
      // §2.6 waters off your own shore are yours to hold; further out, only within reach of your piers
      if (!t.land && !NEIGHBORS[tile].some(j => world.tiles[j].owner === n.id && world.tiles[j].land) && !seaReach(world, n, tile))
        return `Vùng biển không giáp bờ của bạn phải nằm trong ${SEA.pierReach} ô quanh một Bến thuyền của bạn (Cảng: thêm 3 ô)`;
      if ((n.stock.food || 0) < CLAIM_FOOD) return `Cần ${CLAIM_FOOD} lương thực`;
      if (claims.some(c => c.n === n && c.tile === tile)) return "Đã khai hoang ô này trong lượt";
      claims.push({ n, tile });
      return null;
    }
    case "accept_migrants": {
      // §4.5 take in a faction that left its nation
      const x = (world.schisms ?? []).find(s => s.id === Math.floor(num(a.faction)));
      if (!x || x.status !== "asking" || x.to !== n.id) return "Không có nhóm nào đang xin sang nước bạn với số này";
      const from = world.nations[x.from];
      const k = Math.min(x.people, Math.max(0, from.population - 10));
      if (k <= 0) { x.status = "returned"; return "Nhóm này không còn ai để đi"; }
      const gone = takePeople(from, k, "migrate");
      noteExodus(from, world.tick, k, n.id, "faction");
      addPeople(n, gone);
      x.status = "emigrated";
      from.discontent = 0; from.stability = Math.min(100, from.stability + Math.round(SCHISM.calmAfter / 2));
      from.lastEvents.push(`${k} người theo ${x.leader} đã bỏ sang ${n.name}.`);
      n.lastEvents.push(`Đón ${k} người của ${from.name} theo ${x.leader} vào định cư.`);
      fx({ kind: "migrate", tile: from.capital, nation: from.id, n: k, to: n.capital });
      say(n.id, "schism", `${n.name} đón ${k} người của ${from.name} theo ${x.leader} sang định cư.`);
      return null;
    }
    case "family_policy": {
      // §4.2 the people's customs: how many children, who goes to war
      const fam = (n.family ??= { births: "neutral", fighters: "all" });
      const births = a.births === undefined ? fam.births : String(a.births), fight = a.fighters === undefined ? fam.fighters : String(a.fighters);
      if (!DEMO.births[births]) return `births phải là một trong: ${Object.keys(DEMO.births).join(", ")}`;
      if (!DEMO.fighters[fight]) return `fighters phải là một trong: ${Object.keys(DEMO.fighters).join(", ")}`;
      if (births === fam.births && fight === fam.fighters) return "Phong tục không đổi";
      fam.births = births; fam.fighters = fight;
      n.lastEvents.push(`Phong tục mới: ${DEMO.births[births].name}, ${DEMO.fighters[fight]}.`);
      say(n.id, "family", `${n.name} đổi phong tục: ${DEMO.births[births].name}, ${DEMO.fighters[fight]}.`);
      return null;
    }
    case "build_road": {
      // §2.5 one order lays up to ROADS.maxPerOrder tiles of road (land) or sea lane (water), paid now, built by the builders
      const raw = Array.isArray(a.path) && a.path.length && typeof a.path[0] !== "number" ? a.path : a.tile !== undefined ? [a.tile] : Array.isArray(a.path) ? [a.path] : [];
      const tiles = raw.map(parseTile);
      if (!tiles.length || tiles.some(i => i < 0)) return "Cần path: danh sách ô [[cột, hàng], ...]";
      if (tiles.length > ROADS.maxPerOrder) return `Mỗi lệnh làm tối đa ${ROADS.maxPerOrder} ô`;
      const top = roadLevelMax(n), level = a.level === undefined ? top : Math.floor(Number(a.level));
      if (!(level >= 1 && level <= ROADS.levels.length)) return `level phải từ 1 tới ${ROADS.levels.length}`;
      const def = ROADS.levels[level - 1];
      if (level > top) return `${def.name} / ${def.lane} cần thời ${ERA_TABLE[def.era].name}`;
      const works = (n.roadWorks ??= []), queued = new Set(works.map(w => w.tile)), todo: number[] = [], cost: Record<string, number> = {};
      for (const i of tiles) {
        const err = roadError(world, n, i, m);
        if (err) return `(${col(i)}, ${row(i)}): ${err}`;
        if ((world.tiles[i].road || 0) >= level || queued.has(i) || todo.includes(i)) continue;
        todo.push(i);
        for (const [k, q] of Object.entries(world.tiles[i].land ? def.cost : def.laneCost)) cost[k] = (cost[k] || 0) + q;
      }
      if (!todo.length) return "Các ô này đã có đường cấp đó hoặc đang làm";
      for (const [k, q] of Object.entries(cost)) if ((n.stock[k] || 0) < q) return `Thiếu ${fmt(q - (n.stock[k] || 0))} ${goodName(world, k)} (${todo.length} ô cần ${Object.entries(cost).map(([g, x]) => `${x} ${goodName(world, g)}`).join(", ")})`;
      for (const [k, q] of Object.entries(cost)) L.stock(n, k, -q, "road");
      for (const i of todo) works.push({ tile: i, level, progress: 0 });
      const land = todo.filter(i => world.tiles[i].land).length;
      n.lastEvents.push(`Khởi công ${land ? `${land} ô ${def.name.toLowerCase()}` : ""}${land && land < todo.length ? " và " : ""}${land < todo.length ? `${todo.length - land} ô ${def.lane.toLowerCase()}` : ""}; thợ xây làm sau các công trình.`);
      return null;
    }
    case "abandon_tile": {
      const tile = parseTile(a.tile);
      if (tile < 0 || world.tiles[tile].owner !== n.id) return "Ô không thuộc lãnh thổ của bạn";
      if (centres(n).includes(tile)) return "Không bỏ được thủ đô hay điểm định cư";
      world.tiles[tile].owner = -1;
      const hadHomes = n.buildings.some(b => b.tile === tile), lived = hadHomes || (HAMLET.people[world.tiles[tile].terrain] || 0) >= 2;
      n.buildings = n.buildings.filter(b => b.tile !== tile);
      if (n.roadWorks) n.roadWorks = n.roadWorks.filter(w => w.tile !== tile);
      // §2.9 land is the people's food and homes: giving up a lived-in tile shakes them
      const shock = n.abandoned?.tick === world.tick ? n.abandoned : (n.abandoned = { tick: world.tick, cost: 0 });
      const cost = Math.min(lived ? LAND.abandonStability * (hadHomes ? 2 : 1) : LAND.abandonEmpty, LAND.abandonTurnCap - shock.cost);
      n.stability = Math.max(0, n.stability - cost);
      if (lived && !shock.cost) n.discontent = Math.min(100, (n.discontent ?? 0) + LAND.abandonDiscontent);
      shock.cost += cost;
      n.lastEvents.push(lived ? `Bỏ ô (${col(tile)}, ${row(tile)}): dân không muốn rời đất cha ông (−${cost} ổn định${hadHomes ? ", mất cả công trình trên đó" : ""}).` : `Bỏ ô trống (${col(tile)}, ${row(tile)}) (−${cost} ổn định).`);
      return null;
    }
    case "appoint_official": {
      const domain = String(a.domain ?? ""), def = OFFICIAL_DOMAINS[domain];
      if (!def) return `Lĩnh vực phải là một trong: ${Object.keys(OFFICIAL_DOMAINS).join(", ")}`;
      const court = (n.officials ??= []);
      if (court.length >= maxOfficials(world, n)) return `Đã đủ ${maxOfficials(world, n)} quan chức (thêm 1 mỗi ${OFFICIALS.perPop} dân, theo kỷ nguyên và phát minh)`;
      if (def.unique && court.some(o => o.domain === domain)) return `Đã có ${def.title}; cách chức người cũ trước`;
      let seat: number | null = null;
      if (domain === "governor") {
        seat = a.seat === undefined ? n.capital : parseTile(a.seat);
        if (!centres(n).includes(seat)) return "Bá tước phải giữ một trung tâm của bạn: thủ đô hoặc một điểm định cư (seat [cột, hàng])";
        if (court.some(o => o.seat === seat)) return "Trung tâm này đã có bá tước";
      }
      const r = rngFor(world.seed, world.tick, "official", n.id, court.length);
      const given = String(a.name ?? "").trim().slice(0, 30);
      const name = given.length >= 2 && !validateName("Tên quan", given) ? given : `${pickOne(SYL, r).toUpperCase()[0]}${pickOne(SYL, r)}${pickOne(SYL, r)}`;
      const o = { id: world.nextId++, name, domain, seat, skill: 1, loyalty: OFFICIALS.start, since: world.tick, lastAct: "vừa nhậm chức" };
      court.push(o);
      n.lastEvents.push(`Bổ nhiệm ${def.title} ${name}${seat !== null ? ` giữ (${col(seat)}, ${row(seat)})` : ""} (#${o.id}).`);
      say(n.id, "court", `${n.name} phong ${name} làm ${def.title}.`);
      return null;
    }
    case "dismiss_official": {
      const court = n.officials ?? [], o = court.find(x => x.id === num(a.official ?? a.id, -1));
      if (!o) return "Không có quan chức này";
      n.officials = court.filter(x => x !== o);
      n.stability -= OFFICIALS.dismissStability;
      for (const x of n.officials) x.loyalty = Math.max(0, x.loyalty - 5);
      n.lastEvents.push(`Cách chức ${OFFICIAL_DOMAINS[o.domain]?.title ?? o.domain} ${o.name}: ổn định −${OFFICIALS.dismissStability}, các quan khác bớt trung thành.`);
      return null;
    }
    case "reward_official": {
      const o = (n.officials ?? []).find(x => x.id === num(a.official ?? a.id, -1));
      if (!o) return "Không có quan chức này";
      const g = (a.goods ?? {}) as Record<string, unknown>, paid: Record<string, number> = {};
      let worth = 0;
      for (const [k, v] of Object.entries(g)) {
        const q = Math.floor(num(v)); if (q <= 0) continue;
        if ((n.stock[k] || 0) < q) return `Không đủ ${goodName(world, k)}`;
        paid[k] = q; worth += q * (GOOD_VALUE[k] ?? world.custom.goods[k]?.value ?? 1);
      }
      if (!worth) return "Cần goods: {hàng: số lượng} để ban thưởng";
      for (const [k, q] of Object.entries(paid)) L.stock(n, k, -q, "reward"); // the gift is used up: feasts, cloth, honours
      const gain = Math.min(100 - o.loyalty, Math.floor(worth / OFFICIALS.giftPerPoint));
      o.loyalty += gain;
      n.lastEvents.push(`Ban thưởng ${o.name}: trung thành +${gain} (giờ ${o.loyalty}).`);
      return null;
    }
    case "clear_wild": {
      // §9.4 drive a barbarian horde out of its wilderness
      if (strikes.some(s => s.n === n && s.kind === "wild")) return "Mỗi lượt chỉ một cuộc đánh vào vùng hoang";
      const h = (world.hordes ?? []).find(x => x.id === num(a.horde, -1) && x.alive);
      if (!h) return "Không có bộ lạc man di này (xem threats trong gói trạng thái)";
      if (!n.seen.includes(h.tile)) return "Chưa nhìn thấy nơi ở của bộ lạc này";
      if (landDistance(world, n, h.tile) > HORDES.clearReach) return `Quá xa: cần đất của mình trong vòng ${HORDES.clearReach} ô quanh nơi ở của chúng`;
      const men = Math.floor(num(a.warriors, 0)), committed = strikes.filter(s => s.n === n).reduce((s, x) => s + x.warriors, 0);
      if (men < 1 || men + committed > n.labor.warrior) return `Chỉ có ${n.labor.warrior - committed} chiến binh rảnh`;
      strikes.push({ n, target: n, tile: h.tile, warriors: men, kind: "wild" }); // the men are spoken for this turn
      const r = rngFor(world.seed, world.tick, "clear", n.id, h.id), luck = () => WAR.luck[0] + r() * (WAR.luck[1] - WAR.luck[0]);
      const atk = armedMen(n, men) * (1 + (m.role.warrior || 0) + m.combat) * (n.stability / 100 + 0.5) * luck();
      const def = h.strength * (1 + TERRAIN[world.tiles[h.tile].terrain].defense) * luck();
      const won = atk > def, [lo, hi] = won ? WAR.winLoss : WAR.loseLoss;
      const loss = Math.min(men, Math.round(men * (lo + r() * (hi - lo))));
      takePeople(n, loss, "war"); n.labor.warrior -= loss;
      fx({ kind: "clear", tile: h.tile, nation: n.id, from: n.capital, n: men, text: won ? "won" : "lost" }); fxDeath(h.tile, n.id, loss, "horde");
      if (won) {
        h.alive = false; h.strength = 0; h.returns = world.tick + HORDES.returnTicks;
        n.reputation = Math.min(100, n.reputation + HORDES.clearReputation); n.stability += HORDES.clearStability;
        n.lastEvents.push(`Đánh tan ${h.name} (mất ${loss} chiến binh). Uy tín +${HORDES.clearReputation}.`);
        say(n.id, "horde", `${n.name} đánh tan ${h.name}, vùng hoang yên ổn một thời gian.`);
      } else {
        h.strength *= 0.9;
        n.lastEvents.push(`Đánh ${h.name} thất bại: mất ${loss} chiến binh (${Math.round(atk)} so với ${Math.round(def)}).`);
        say(n.id, "horde", `${n.name} tấn công ${h.name} nhưng bị đẩy lui.`);
      }
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
      const pay = settlementPayment(n);
      if (!pay) return `Cần ${SETTLEMENT.materials} ${SETTLEMENT.goods.map(g => goodName(world, g)).join(" và/hoặc ")} (trộn tùy ý)`;
      // §2.7 a new settlement opens its road home: a track from the road network, paid now, laid by the builders
      const ring = [tile, ...NEIGHBORS[tile]].filter(j => world.tiles[j].owner === -1 && world.tiles[j].terrain !== "ocean");
      for (const j of ring) world.tiles[j].owner = n.id;
      const track = roadPlan(world, n, tile, 1).filter(i => i !== tile && !(n.roadWorks ?? []).some(w => w.tile === i));
      const trackWood = track.length * (ROADS.levels[0].cost.wood ?? 0), woodLeft = (n.stock.wood || 0) - (pay.wood || 0);
      if (track.length && woodLeft < trackWood) {
        for (const j of ring) world.tiles[j].owner = -1;
        return `Điểm định cư phải có đường nối về: cần thêm ${Math.ceil(trackWood - woodLeft)} gỗ để mở ${track.length} ô đường mòn tới đó (hoặc chọn nơi gần mạng đường hơn)`;
      }
      for (const [k, q] of Object.entries(pay)) L.stock(n, k, -q, "settle");
      if (track.length) {
        L.stock(n, "wood", -trackWood, "road");
        for (const i of track) (n.roadWorks ??= []).push({ tile: i, level: 1, progress: 0 });
        n.lastEvents.push(`Mở đường mòn ${track.length} ô nối ${name} về mạng đường (${trackWood} gỗ); thợ xây làm trong các lượt tới, ${CONNECT.grace} lượt đầu điểm định cư chưa bị tính là cô lập.`);
      } else if (!links(world, n).get(tile)) n.lastEvents.push(`Không có lối đất để mở đường tới ${name}: nó sẽ cô lập sau ${CONNECT.grace} lượt nếu không nối bằng đường thủy (Bến thuyền ở cả hai nơi).`);
      n.settlements.push({ tile, name, tick: world.tick });
      fx({ kind: "settle", tile, nation: n.id, from: n.capital, text: name });
      // The settlers stay citizens; leaving home unsettles the people (§2.3)
      n.stability = Math.max(0, n.stability - SETTLEMENT.stability);
      n.lastEvents.push(`${SETTLEMENT.people} người dời đi lập điểm định cư ${name}: ổn định −${SETTLEMENT.stability}.`);
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
      const seen = new Set(n.seen), canSail = m.move.has("shallow"), fresh: number[] = [];
      let cur = parseTile(a.from) >= 0 && world.tiles[parseTile(a.from)].owner === n.id ? parseTile(a.from) : n.capital, danger = 0;
      const walked = [cur];
      const passable = (i: number) => {
        if (i < 0) return false;
        const t = world.tiles[i];
        if (!t.land && !(canSail && t.terrain === "shallow") && !(m.move.has("ocean") && t.terrain === "ocean")) return false; // §5.3 ocean ships cross deep water
        return !(t.terrain === "mountain" && !m.move.has("mountain"));
      };
      const DIRS = ["E", "NE", "NW", "W", "SW", "SE"], k0 = DIRS.indexOf(dir);
      // §2.1 with boats a river tile costs half a step, so expeditions go further along rivers
      for (let budget = EXPLORE_RANGE + m.explore, steps = 0; budget > 0 && steps < (EXPLORE_RANGE + m.explore) * 2; steps++) {
        // Walk the chosen way; skirt around water and mountains to either side
        const tries = [0, 1, -1].map(o => stepDir(cur, DIRS[(k0 + o + 6) % 6])).filter(passable);
        if (!tries.length) break;
        const nx = tries[0];
        const t = world.tiles[nx];
        cur = nx; walked.push(nx);
        budget -= canSail && t.river ? RIVER.exploreStep : 1;
        danger = Math.max(danger, tileDanger(world, t));
        for (const j of within(cur, canSail ? 3 : 2)) if (!seen.has(j)) { seen.add(j); fresh.push(j); }
        if (t.owner !== -1 && t.owner !== n.id) {
          const o = world.nations[t.owner];
          const passage = treatiesBetween(world, n.id, o.id, ["passage", "alliance"]).length > 0;
          if (o.alive && !passage && rand() < 0.3) { o.lastEvents.push(`Phát hiện người lạ của ${n.name} trong lãnh thổ (vi phạm biên giới).`); if (!o.met.includes(n.id)) o.met.push(n.id); }
        }
      }
      n.seen = [...seen].sort((x, y) => x - y);
      let dead = 0; for (let k = 0; k < people; k++) if (rand() < BEASTS.explorerBase + BEASTS.explorerPerDanger * danger) dead++;
      if (dead) { takePeople(n, dead, "explore"); n.lastEvents.push(`${dead} người thám hiểm không trở về.`); }
      fx({ kind: "explore", tile: walked[0], nation: n.id, path: walked, n: people }); fxDeath(cur, n.id, dead, "explore");
      n.lastEvents.push(discoveryReport(world, n, dir, fresh)); // §7.6 what they saw
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
      takePeople(n, 1, "explore");
      if (rngFor(world.seed, world.tick, "spy", n.id, target.id)() < SPY.successChance) {
        world.spies.push({ id: world.nextSpyId++, owner: n.id, target: target.id, since: world.tick, active: true, acted: "" });
        n.lastEvents.push(`Gián điệp đã trà trộn vào ${target.name}.`);
      } else n.lastEvents.push(`Người được cử đến ${target.name} đã mất tích.`);
      return null;
    }
    case "sabotage": {
      const op = spyFor(world, n, m, a); if (typeof op === "string") return op;
      const { spy, target } = op, want = a.building == null ? null : String(a.building);
      const pool = target.buildings.filter(b => want === null || b.type === want || String(b.id) === want);
      if (want !== null && !pool.length) return `${target.name} không có công trình "${want}"`;
      // An unfinished building with the most work done loses it all; otherwise the oldest working one stops for a while
      const b = pool.filter(x => !x.done && x.progress > 0).sort((x, y) => y.progress - x.progress || x.id - y.id)[0]
        ?? pool.filter(x => buildingWorks(world, x)).sort((x, y) => x.id - y.id)[0];
      if (!b) return `${target.name} không có công trình nào để phá hoại`;
      const bname = buildingOf(world, b.type)?.name ?? b.type;
      if (!b.done) {
        b.progress = 0;
        spy.acted = `phá hỏng ${bname} đang xây`;
        target.lastEvents.push(`${bname} đang xây bị phá hỏng, mất hết tiến độ. Không rõ thủ phạm.`);
      } else {
        b.disabledUntil = world.tick + SPY_OPS.disableTicks;
        spy.acted = `phá hoại ${bname} (mất tác dụng ${SPY_OPS.disableTicks} lượt)`;
        target.lastEvents.push(`${bname} bị phá hoại, mất tác dụng ${SPY_OPS.disableTicks} lượt. Không rõ thủ phạm.`);
      }
      say(target.id, "spy", `${bname} của ${target.name} bị kẻ lạ mặt phá hoại.`);
      n.lastEvents.push(`Gián điệp ở ${target.name} đã ${spy.acted}.`);
      return null;
    }
    case "steal_tech": {
      const op = spyFor(world, n, m, a); if (typeof op === "string") return op;
      const { spy, target } = op, raw = String(a.invention ?? a.id ?? "");
      const id = target.inventions.find(x => x === raw || normName(invName(world, x)) === normName(raw));
      if (!id) return `${target.name} không có phát minh "${raw}"`;
      const name = invName(world, id);
      if (n.inventions.includes(id)) return `Đã có ${name}`;
      if (n.stolenTech.includes(id)) return `Đã đánh cắp bí mật ${name} rồi`;
      n.stolenTech.push(id);
      spy.acted = `đánh cắp bí mật ${name}`;
      say(target.id, "spy", `Bí mật ${name} của ${target.name} bị đánh cắp.`);
      n.lastEvents.push(`Gián điệp ở ${target.name} đã ${spy.acted}: nghiên cứu ${id} rẻ hơn ${SPY_OPS.stealDiscount * 100}% RP.`);
      return null;
    }
    case "incite": {
      const op = spyFor(world, n, m, a); if (typeof op === "string") return op;
      const { spy, target } = op;
      target.stability = Math.max(0, target.stability - SPY_OPS.incite);
      spy.acted = `kích động dân chúng (−${SPY_OPS.incite} ổn định)`;
      target.lastEvents.push(`Có kẻ kích động dân chúng: ổn định −${SPY_OPS.incite}. Không rõ thủ phạm.`);
      say(target.id, "spy", `Dân chúng ${target.name} bị kẻ lạ mặt kích động.`);
      n.lastEvents.push(`Gián điệp ở ${target.name} đã ${spy.acted}.`);
      return null;
    }
    case "rename_nation": {
      if (!renameOpen(world, n)) {
        return n.eraTick !== null && world.tick - n.eraTick <= RENAME.windowTicks ? "Đã đổi tên hay đổi cờ một lần từ khi vào kỷ nguyên này"
          : `Chỉ được đổi tên hay đổi cờ trong ${RENAME.windowTicks} lượt sau khi bước vào kỷ nguyên mới`;
      }
      const name = a.name == null ? null : String(a.name).trim(), flag = a.flag ?? null, decreed = renameDecreed(world);
      const capital = decreed && a.capital != null ? String(a.capital).trim() : null, people = decreed && a.people != null ? String(a.people).trim() : null;
      if (name === null && flag === null && capital === null && people === null) return "Cần name, flag (hoặc capital, people khi có sắc lệnh đổi tên)";
      for (const [label, v] of [["Tên thủ đô", capital], ["Tên dân tộc", people]] as const) if (v !== null) { const err = validateName(label, v); if (err) return err; }
      for (const o of world.nations) if (o.id !== n.id && o.founded && ((capital !== null && normName(o.capitalName) === normName(capital)) || (people !== null && normName(o.people) === normName(people)))) return "Tên thủ đô hoặc dân tộc này đã có nước khác dùng";
      if (name !== null && !(decreed && normName(name) === normName(n.name))) {
        const err = validateName("Tên quốc gia", name) ?? nameTaken(world, n, name); if (err) return err;
        if (normName(name) === normName(n.name)) return "Tên mới trùng tên hiện tại";
      }
      if (flag !== null) { const err = validateFlag(world, n, flag); if (err) return err; }
      const old = n.name;
      if (!decreed) { n.stability = Math.max(0, n.stability - RENAME.stability); n.renameTick = world.tick; } // §10.6 free under the gods' decree
      if (name !== null && normName(name) !== normName(n.name)) { n.formerNames.push(old); n.name = name; }
      if (flag !== null) n.flag = toFlag(flag);
      if (capital !== null) n.capitalName = capital;
      if (people !== null) n.people = people;
      const also = [capital !== null ? `thủ đô ${capital}` : "", people !== null ? `dân tộc ${people}` : "", flag !== null ? "cờ mới" : ""].filter(Boolean).join(", ");
      say(n.id, "rename", n.name !== old ? `${old} đổi tên thành ${n.name}${also ? ` (${also})` : ""}.` : `${n.name} đổi ${also}.`);
      return null;
    }
    case "rename": {
      // §10.6 rename a place or an official: the capital, a settlement, an official
      const name = String(a.name ?? "").trim(), what = String(a.what ?? "");
      const err = validateName("Tên mới", name); if (err) return err;
      if (what === "capital") {
        if (world.nations.some(o => o.id !== n.id && o.founded && normName(o.capitalName) === normName(name))) return `Tên thủ đô "${name}" đã bị dùng`;
        n.capitalName = name;
      }
      else if (what === "settlement") {
        const tile = parseTile(a.tile), st = n.settlements.find(x => x.tile === tile || x.name === String(a.old ?? ""));
        if (!st) return "Không có điểm định cư này (tile [cột, hàng] hoặc old: tên cũ)";
        st.name = name;
      } else if (what === "official") {
        const o = (n.officials ?? []).find(x => x.id === Math.floor(num(a.official)));
        if (!o) return "Không có quan chức này (official: id)";
        o.name = name;
      } else return `what phải là capital, settlement hoặc official (đổi tên nước, dân tộc dùng rename_nation${renameDecreed(world) ? ", miễn phí khi có sắc lệnh đổi tên" : ""})`;
      n.lastEvents.push(`Đổi tên ${what === "capital" ? "thủ đô" : what === "settlement" ? "điểm định cư" : "quan chức"} thành ${name}.`);
      return null;
    }
    case "petition": {
      const cat = String(a.category ?? "khác");
      const title = String(a.title ?? "").trim(), text = String(a.text ?? "").trim(), reason = String(a.reason ?? "").trim();
      if (!PETITION.categories.includes(cat)) return `Loại thỉnh nguyện phải là: ${PETITION.categories.join(", ")}`;
      if (INJECTION.test(`${title} ${text} ${reason}`)) { n.reputation = Math.max(0, n.reputation - 15); return "Thỉnh nguyện chứa câu giống mệnh lệnh hệ thống nên bị chặn; uy tín bị trừ"; }
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

/** §7.8: a spy operation needs writing and an active spy in the target that has not acted yet this tick. */
function spyFor(world: World, n: Nation, m: Mods, a: Record<string, unknown>): { spy: Spy; target: Nation } | string {
  if (!m.caps.has(SPY_OPS.needsCap)) return "Cần năng lực ghi-chép (phát minh Ký hiệu)";
  const target = findNation(world, a.target);
  if (!target || target.id === n.id || !target.alive) return "Không tìm thấy quốc gia mục tiêu";
  const spy = world.spies.find(s => s.active && s.owner === n.id && s.target === target.id);
  if (!spy) return `Không có gián điệp đang hoạt động ở ${target.name}`;
  if (spy.acted) return `Gián điệp ở ${target.name} đã ra tay lượt này`;
  return { spy, target };
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

/** Detection chance of a spy this tick: doubled if it acted (§7.8). */
export function spyDetectChance(world: World, s: Spy): number {
  const target = world.nations[s.target];
  const base = Math.min(SPY.maxDetect, SPY.baseDetect + SPY.perFiveWarriors * Math.floor(target.labor.warrior / 5));
  return s.acted ? base * SPY_OPS.detectMult : base;
}

function updateIntel(world: World, tick: number, say: Say): void {
  for (const s of world.spies) {
    if (!s.active) continue;
    const owner = world.nations[s.owner], target = world.nations[s.target];
    const deed = s.acted, chance = spyDetectChance(world, s);
    s.acted = ""; // the per-tick flag is spent on this roll
    if (!owner.alive || !target.alive) { s.active = false; continue; }
    const r = rngFor(world.seed, tick, "spycatch", s.id);
    if (r() < chance) {
      s.active = false;
      const what = deed ? ` Kẻ đó đã ${deed}.` : "";
      if (r() < 0.5) {
        owner.reputation = Math.max(0, owner.reputation - SPY.reputationLoss);
        target.casusBelli[String(owner.id)] = tick + SPY.casusBelliTicks;
        target.lastEvents.push(`Bắt được gián điệp của ${owner.name}.${what} Có thể tuyên chiến với họ có chính nghĩa trong ${SPY.casusBelliTicks} lượt.`);
        owner.lastEvents.push(`Gián điệp ở ${target.name} bị bắt và khai ra nguồn gốc. Uy tín −${SPY.reputationLoss}.`);
        if (deed) say(owner.id, "spy", `${target.name} bắt được gián điệp của ${owner.name}, kẻ đã ${deed}.`);
      } else {
        target.lastEvents.push(`Bắt được một gián điệp, không rõ của nước nào.${what}`);
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
      const report: Record<string, unknown> = { name: b.name, flag: b.flag, people: b.people, capital: b.capitalName, size: sizeWord(b.population), reputation: b.reputation, tiles_seen: visible.map(t => [col(t.i), row(t.i)]) };
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
        report.buildings = b.buildings.map(x => ({ type: x.type, done: x.done }));
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
