// §6.1b Building sites. A building needs room and a hand to tend it: a land tile holds HOUSING.tileSlots buildings and
// a centre more (a village, a town, a city), and a building stands near a centre (farther from a town or city) or on a
// road joined to the capital. Buildings that stood before these rules stay where they are.

import { HOUSING } from "./rules.ts";
import { dist, within } from "./hex.ts";
import { roadToCapital } from "./engine.ts";
import { eraIndex } from "./catalog.ts";
import type { Nation, World } from "./types.ts";

const centres = (n: Nation) => [n.capital, ...n.settlements.map(s => s.tile)];
const tierAt = (n: Nation, c: number) => n.urban?.[String(c)]?.tier ?? 0;

/** How many buildings a tile of the nation holds: by its terrain (mountains none), more on a centre by its tier,
 *  and more with the ages (denser towns, taller buildings). */
export function tileSlots(world: World, n: Nation, i: number): number {
  const more = Math.floor(eraIndex(n) / HOUSING.eraStep);
  if (centres(n).includes(i)) return (HOUSING.centreSlots[tierAt(n, i)] ?? HOUSING.centreSlots[0]) + 2 * more;
  const base = HOUSING.terrainSlots[world.tiles[i].terrain] ?? HOUSING.tileSlots;
  return base ? base + more : 0;
}
/** Buildings standing or going up on a tile. */
export const buildingsOn = (n: Nation, i: number): number => n.buildings.filter(b => b.tile === i).length;
/** Is a tile within reach of a centre (by its tier) or on a road joined to the capital? */
export function inReach(world: World, n: Nation, i: number): boolean {
  if (centres(n).some(c => dist(c, i) <= (HOUSING.reach[tierAt(n, c)] ?? HOUSING.reach[0]))) return true;
  return (world.tiles[i].road || 0) > 0 && roadToCapital(world, n).has(i);
}
/** The nearest land tile of the nation with a free slot and in reach (the capital first), for a building given no tile. */
export function freeSite(world: World, n: Nation): number | null {
  let best: number | null = null, bd = Infinity;
  const used = new Map<number, number>();
  for (const b of n.buildings) used.set(b.tile, (used.get(b.tile) || 0) + 1);
  for (const c of centres(n)) for (const i of within(c, HOUSING.reach[tierAt(n, c)] ?? HOUSING.reach[0])) { // only what lies near a centre
    const t = world.tiles[i];
    if (t.owner !== n.id || !t.land || (used.get(i) || 0) >= tileSlots(world, n, i)) continue;
    const d = dist(i, n.capital);
    if (d < bd || (d === bd && best !== null && i < best)) { best = i; bd = d; }
  }
  return best;
}
