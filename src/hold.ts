// §2.3c Holding the land. There is no limit on how much land a nation may claim, but land is held by the people who
// live on it and by the warriors who can reach it. The militia of a tile is the people living on it and around it; the
// warriors stand at the centres and reach a tile in time only near a centre or along a road joined to one. Land with
// no one living on it, no building, far from every centre and off the roads is UNHELD: a neighbour may take it, in
// peace by encroaching (claim_tile, an act of hostility) or in war at no cost.

import { HOLD, WAR, WORKER_SHARE } from "./rules.ts";
import { NEIGHBORS, dist } from "./hex.ts";
import { buildingOf } from "./catalog.ts";
import { farmland, hamletRoom, housing, housingParts, roadToCapital } from "./engine.ts";
import type { Nation, World } from "./types.ts";

const centresOf = (n: Nation) => [n.capital, ...n.settlements.map(s => s.tile)];

/** The people living on each of the nation's tiles: the centres hold their own share, the hamlets the rest by room. */
export function tilePeople(world: World, n: Nation): (i: number) => number {
  const parts = housingParts(world, n), roof = Math.max(1, housing(world, n)), fill = Math.min(1, n.population / roof);
  const hubs = new Set(centresOf(n)), worked = farmland(world, n);
  let raw = 0;
  for (const t of world.tiles) if (t.owner === n.id && t.land && !hubs.has(t.i)) raw += hamletRoom(t) * (worked.has(t.i) ? 0.5 : 1);
  const perRoom = raw > 0 ? parts.hamlets / raw : 0, perCentre = (roof - parts.hamlets) / Math.max(1, hubs.size);
  return (i: number) => {
    const t = world.tiles[i];
    if (t.owner !== n.id || !t.land) return 0;
    if (hubs.has(i)) return perCentre * fill;
    return hamletRoom(t) * (worked.has(i) ? 0.5 : 1) * perRoom * fill;
  };
}
/** How much of the nation's warriors reach a tile in time: all near a centre or on a road joined to the capital,
 *  fewer the farther it lies. */
export function reachAt(world: World, n: Nation, i: number): number {
  const d = Math.min(...centresOf(n).map(c => dist(c, i)));
  if (d <= HOLD.near || ((world.tiles[i].road || 0) > 0 && roadToCapital(world, n).has(i))) return 1;
  return Math.max(HOLD.minReach, 1 / (1 + (d - HOLD.near) * HOLD.falloff));
}
/** The militia that stands on a tile: the people of the tile and its neighbours, as many as may fight. */
export function militiaAt(world: World, n: Nation, i: number, people = tilePeople(world, n)): number {
  const near = people(i) + NEIGHBORS[i].reduce((s, j) => s + people(j), 0);
  return near * WORKER_SHARE * WAR.militiaShare;
}
/** Is a tile of the nation unheld: no one living on or beside it, no building, beyond HOLD.near of every centre and off
 *  the roads joined to its capital? */
export function unheld(world: World, n: Nation, i: number, people = tilePeople(world, n)): boolean {
  const t = world.tiles[i];
  if (t.owner !== n.id || !t.land || centresOf(n).includes(i)) return false;
  if (n.buildings.some(b => b.tile === i && buildingOf(world, b.type))) return false;
  if (reachAt(world, n, i) >= 1) return false;
  return people(i) + NEIGHBORS[i].reduce((s, j) => s + people(j), 0) < HOLD.unheldPeople;
}
/** The nation's unheld tiles. */
export function unheldTiles(world: World, n: Nation): number[] {
  const people = tilePeople(world, n), out: number[] = [];
  for (const t of world.tiles) if (t.owner === n.id && unheld(world, n, t.i, people)) out.push(t.i);
  return out;
}
