// §2.8 Provinces. A nation's land falls into provinces, one per centre: the capital's and each settlement's,
// each holding the nation's tiles nearest to that centre (the same rule as the yield, §2.7). The people live
// where the housing is, so each province holds a share of them. Each has its way to the capital, maybe a
// governor, and a mood of its own: cut off, far and ungoverned, or crowded, it grows restless; a loyal governor
// calms it and gets a little more from its land. When a faction forms (§4.5), the unhappiest such province is
// the faction, and it leaves with its land. Reads of the World, except provinceTurn() and cedeProvince().

import { dist } from "./hex.ts";
import { CONNECT, HOUSING, OFFICIALS, PROVINCE, SETTLEMENT } from "./rules.ts";
import { buildingWorks, hamletRoom, housingParts, mods } from "./engine.ts";
import { buildingOf } from "./catalog.ts";
import { links, nearestCentre, type Link } from "./connect.ts";
import type { Nation, Official, Tile, World } from "./types.ts";

export type Cause = "cut_off" | "ungoverned" | "crowded";
/** Why a province grows restless, in the Watcher's and the nations' advice language. */
export const CAUSE_VI: Record<Cause, string> = { cut_off: "bị cô lập, không lối về thủ đô", ungoverned: "xa thủ đô mà không có bá tước", crowded: "chật chỗ ở" };

export interface Province {
  centre: number; name: string; capital: boolean;
  /** Its land, the centre first. */
  tiles: number[];
  /** Its share of the nation's housing, and of the people (integers summing to the population). */
  housing: number; people: number;
  way: Link; distance: number;
  /** The governor seated there, if any; `loyal` when they work (§4.6). */
  governor: Official | null; loyal: boolean;
  /** Unrest 0–100, and what raises it this turn. */
  mood: number; causes: Cause[];
}

const loyal = (o: Official) => o.loyalty >= OFFICIALS.idle;

/** Each centre with a loyal governor: its land's yield multiplier, 1 + PROVINCE.yield × skill. */
export function governorYield(n: Nation): Map<number, number> {
  const out = new Map<number, number>();
  for (const o of n.officials ?? []) if (o.domain === "governor" && o.seat !== null && loyal(o)) out.set(o.seat, 1 + PROVINCE.yield * o.skill);
  return out;
}

/** Share k over weights by largest remainder, ties to the earlier one: deterministic integers summing to k. */
function apportion(k: number, w: number[]): number[] {
  const W = w.reduce((a, b) => a + b, 0);
  if (W <= 0) return w.map((_, i) => (i === 0 ? k : 0));
  const exact = w.map(x => k * x / W), out = exact.map(Math.floor);
  let left = k - out.reduce((a, b) => a + b, 0);
  for (const { i } of exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i)) { if (left <= 0) break; out[i]++; left--; }
  return out;
}

/** The nation's provinces, the capital's first. */
export function provinces(world: World, n: Nation, ls: Map<number, Link> = links(world, n)): Province[] {
  const cs = [...ls.keys()], at = new Map<number, number[]>(cs.map(c => [c, [c]])), hubs = new Set(cs), owned: Tile[] = [];
  for (const t of world.tiles) if (t.owner === n.id) { owned.push(t); if (!hubs.has(t.i)) at.get(nearestCentre(cs, t.i).c)!.push(t.i); }
  // housing: the centre's own shelter, the best housing buildings on its land (HOUSING.perCentre and the era's
  // slots each), hamlets on its land, the cave; buildings and hamlets scaled so the provinces sum to the nation's
  const parts = housingParts(world, n, owned), slots = HOUSING.perCentre + mods(world, n).housingSlots;
  const homes = new Map<number, number[]>();
  for (const b of n.buildings) { const h = buildingWorks(world, b) ? buildingOf(world, b.type)?.effect.housing || 0 : 0; if (h > 0) homes.set(b.tile, [...(homes.get(b.tile) ?? []), h]); }
  const cave = world.wonders.find(w => w.key === "cave")?.i;
  const raw = cs.map(c => {
    const tiles = at.get(c)!;
    const roofs = tiles.flatMap(i => homes.get(i) ?? []).sort((a, b) => b - a).slice(0, slots).reduce((a, b) => a + b, 0);
    const ham = tiles.reduce((s, i) => s + (i !== c && world.tiles[i].land ? hamletRoom(world.tiles[i]) : 0), 0);
    return { roofs, ham, cave: cave !== undefined && tiles.includes(cave) ? parts.wonder : 0 };
  });
  const sum = (k: "roofs" | "ham") => raw.reduce((s, r) => s + r[k], 0);
  const fb = sum("roofs") ? parts.buildings / sum("roofs") : 0, fh = sum("ham") ? parts.hamlets / sum("ham") : 0;
  const housing = cs.map((c, k) => (c === n.capital ? parts.natural : SETTLEMENT.housing) + raw[k].roofs * fb + raw[k].ham * fh + raw[k].cave);
  const people = apportion(Math.max(0, Math.floor(n.population)), housing);
  const young = new Set(n.settlements.filter(s => world.tick - s.tick < CONNECT.grace).map(s => s.tile));
  return cs.map((c, k) => {
    const capital = c === n.capital, governor = (n.officials ?? []).find(o => o.domain === "governor" && o.seat === c) ?? null;
    const p: Province = {
      centre: c, name: capital ? n.capitalName || n.name : n.settlements.find(s => s.tile === c)?.name ?? "?", capital,
      tiles: at.get(c)!, housing: Math.round(housing[k] * 10) / 10, people: people[k], way: ls.get(c) ?? null, distance: dist(c, n.capital),
      governor, loyal: !!governor && loyal(governor), mood: n.provinceUnrest?.[String(c)] ?? 0, causes: [],
    };
    if (!capital && p.way === null && !young.has(c)) p.causes.push("cut_off");
    if (!capital && !p.loyal && p.distance > PROVINCE.far) p.causes.push("ungoverned");
    if (p.people > Math.ceil(housing[k])) p.causes.push("crowded");
    return p;
  });
}

/** One turn of the provinces' moods; returns what the restless ones add to the nation's discontent (§2.8). */
export function provinceTurn(world: World, n: Nation): number {
  const next: Record<string, number> = {};
  let pressure = 0;
  for (const p of provinces(world, n)) {
    let u = p.mood - PROVINCE.fade - (p.loyal ? PROVINCE.calm * p.governor!.skill : 0);
    for (const c of p.causes) u += { cut_off: PROVINCE.cutOff, ungoverned: PROVINCE.ungoverned, crowded: PROVINCE.crowded }[c];
    u = Math.max(0, Math.min(100, Math.round(u * 10) / 10));
    if (u > 0) next[String(p.centre)] = u;
    if (u >= PROVINCE.restless) pressure += PROVINCE.pressure;
  }
  n.provinceUnrest = next;
  return pressure;
}

/** The settlement province a faction would be (§4.5): the unhappiest at PROVINCE.secede+, cut off or far and
 *  ungoverned, with PROVINCE.minPeople+ people and enough left behind; null when none fits (they seek new land). */
export function restlessProvince(world: World, n: Nation): Province | null {
  return provinces(world, n).filter(p => !p.capital && p.mood >= PROVINCE.secede && p.causes.some(c => c !== "crowded")
    && p.people >= PROVINCE.minPeople && n.population - p.people >= 10)
    .sort((a, b) => b.mood - a.mood || a.centre - b.centre)[0] ?? null;
}

/** A province leaves with its land: its tiles, the buildings on them and its settlement pass to `child`;
 *  its governor leaves the court. The people and stores are moved by the caller. Returns the tiles. */
export function cedeProvince(world: World, parent: Nation, child: Nation, p: Province): number[] {
  const land = new Set(p.tiles);
  for (const i of p.tiles) { world.tiles[i].owner = child.id; delete world.cutoff[String(i)]; }
  child.buildings = parent.buildings.filter(b => land.has(b.tile));
  parent.buildings = parent.buildings.filter(b => !land.has(b.tile));
  if (parent.roadWorks) parent.roadWorks = parent.roadWorks.filter(w => !land.has(w.tile));
  parent.settlements = parent.settlements.filter(s => s.tile !== p.centre);
  if (parent.officials) parent.officials = parent.officials.filter(o => o.seat === null || !land.has(o.seat));
  if (parent.provinceUnrest) delete parent.provinceUnrest[String(p.centre)];
  return p.tiles;
}
