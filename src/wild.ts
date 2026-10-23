// The wild (§9.4): beasts on every tile, barbarian hordes in the wilderness,
// and the ice wall's wind. Pure reads of the World, shared by the engine, the
// observation sent to each nation, and the Watcher's map.

import { dist, pointOf, within } from "./hex.ts";
import { rngFor, shuffle } from "./rng.ts";
import { BEASTS, EVENTS, FLOOD, HORDES, ICE_WIND } from "./rules.ts";
import type { Horde, Nation, Tile, World } from "./types.ts";

export function liveHordes(world: World): Horde[] { return (world.hordes ?? []).filter(h => h.alive); }

/** How strong a horde can grow by this tick. */
export function hordeCap(tick: number): number { return Math.min(HORDES.capMax, HORDES.capBase + tick * HORDES.capPerTick); }

/** One horde per wilderness, named from the seed. */
export function newHordes(seed: string, wild: number[]): Horde[] {
  const names = shuffle(HORDES.names.slice(), rngFor(seed, "hordes"));
  return wild.map((tile, k) => ({ id: k + 1, name: names[k % names.length], tile, strength: HORDES.start, alive: true, returns: null, lastRaid: null }));
}

/** A tile next to a centre of its owner, or with a building on it, is settled land: the beasts keep away. */
function tamed(world: World, t: Tile): boolean {
  if (t.owner < 0) return false;
  const n = world.nations[t.owner];
  if (!n) return false;
  if (dist(n.capital, t.i) <= 1 || n.settlements.some(s => dist(s.tile, t.i) <= 1)) return true;
  return n.buildings.some(b => b.tile === t.i);
}

/** 0–5: how dangerous the beasts on this tile are. */
export function tileDanger(world: World, t: Tile): number {
  if (!t.land) return 0;
  let d = BEASTS.danger[t.terrain] ?? 0;
  if (liveHordes(world).some(h => dist(h.tile, t.i) <= BEASTS.wildRadius)) d += BEASTS.wildBonus;
  if (tamed(world, t)) d /= 2;
  return d;
}

/** Tiles from a nation's land to a tile (Infinity when it owns none, or none within `max` when given). */
export function landDistance(world: World, n: Nation, tile: number, max?: number): number {
  let best = Infinity;
  // a bound looks only around the tile (on a globe the rings run a little wider than the steps: a margin)
  const near = max === undefined ? null : within(tile, pointOf(tile) ? Math.ceil(max * 1.2) + 2 : max);
  if (near) { for (const i of near) if (world.tiles[i].owner === n.id) { const d = dist(i, tile); if (d < best) best = d; } return best <= max! ? best : Infinity; }
  for (const t of world.tiles) if (t.owner === n.id) { const d = dist(t.i, tile); if (d < best) best = d; }
  return best;
}

/** Does the ice wall's wind reach this nation's land? */
export function iceWind(world: World, n: Nation): boolean {
  return windy(world).some(t => t.owner === n.id);
}
/** The tiles the wind reaches (the ice wall never moves: kept per map). */
const windMemo = new WeakMap<Tile[], Tile[]>();
function windy(world: World): Tile[] {
  let out = windMemo.get(world.tiles);
  if (!out) { out = world.tiles.filter(t => t.wall !== undefined && t.wall <= ICE_WIND.reach); windMemo.set(world.tiles, out); }
  return out;
}

/** §9.2 + §12.1 Chance of a harsh winter this tick, from the capital's climate and the ice wall's wind. */
export function winterChance(world: World, n: Nation): number {
  const zone = world.tiles[n.capital].zone;
  let chance = zone === "trop" ? 0 : EVENTS.winter.chance * (zone === "cold" ? EVENTS.winter.coldMult : 1);
  if (iceWind(world, n)) chance = Math.max(chance, ICE_WIND.tropicChance) * ICE_WIND.winterMult;
  return chance;
}
/** Winter deaths as a share of the people, given the nation's shelter. */
export function winterDeathShare(world: World, n: Nation, winterMod: number, roofed: boolean, coats: boolean): number {
  return EVENTS.winter.deaths * winterMod * (roofed ? 0.5 : 1) * (coats ? 0.5 : 1) * (iceWind(world, n) ? ICE_WIND.deathMult : 1);
}

/** §9.4 Flood chance on this land: only with river or swamp tiles, doubled by a delta. */
export function floodChance(wet: Tile[]): number {
  return wet.length ? FLOOD.chance * (wet.some(t => t.delta) ? FLOOD.deltaMult : 1) : 0;
}

/** §9.4 The beasts' threat to this tick's hunters and gatherers: chance, deaths if they strike, and the worst lair. */
export function beastRisk(world: World, owned: Tile[], hunt: number, gather: number, armed: boolean): { chance: number; dead: number; lair: Tile; avg: number } | null {
  const worked = owned.filter(t => t.land && ((t.res.game || 0) > 0 || (t.res.plants || 0) > 0));
  if (!worked.length || hunt + gather <= 0) return null;
  const dangers = worked.map(t => tileDanger(world, t)), avg = dangers.reduce((s, d) => s + d, 0) / worked.length;
  const dead = Math.max(1, Math.round((hunt + gather / 4) * BEASTS.share * (armed ? BEASTS.armed : 1)));
  return { chance: BEASTS.chance * avg, dead, lair: worked[dangers.indexOf(Math.max(...dangers))], avg };
}

/** The nation a horde would raid this tick: the nearest one with land in range (ties: lowest id). */
export function raidTarget(world: World, h: Horde): { n: Nation; d: number } | null {
  let out: { n: Nation; d: number } | null = null;
  for (const n of world.nations) {
    if (!n.alive || !n.founded || n.population < HORDES.minPop) continue;
    const d = landDistance(world, n, h.tile, HORDES.range);
    if (d <= HORDES.range && (!out || d < out.d)) out = { n, d };
  }
  return out;
}

export function raidChance(h: Horde): number { return Math.min(HORDES.raidMax, HORDES.raidChance * h.strength / 40); }

/** The raiders a horde sends against a nation: sized to the village, never more than the horde. */
export function raidParty(h: Horde, n: Nation): number { return Math.min(h.strength, HORDES.partyBase + HORDES.partyPerPop * n.population); }
