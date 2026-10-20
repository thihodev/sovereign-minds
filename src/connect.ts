// §2.7 A connected realm. The stores are the nation's, but goods reach them only along a way: a short walk
// over its own land, a road, or water between its piers. A centre with no such way to the capital is cut off:
// what its land yields reaches the stores only in part, and its people grow restless. Land far from any centre
// with no road nearby yields less too. Pure reads of the World.

import { NEIGHBORS, dist } from "./hex.ts";
import { CONNECT, RIVER } from "./rules.ts";
import { mods, roadNet } from "./engine.ts";
import { activeWar } from "./diplomacy.ts";
import { piers } from "./routes.ts";
import type { Nation, World } from "./types.ts";

export type Link = "capital" | "road" | "water" | "walk" | null;

const centresOf = (n: Nation) => [n.capital, ...n.settlements.map(s => s.tile)];

/** Can one walk from centre a to centre b over the nation's own land in at most CONNECT.walk steps? */
function walk(world: World, n: Nation, a: number, b: number, climb: boolean): boolean {
  if (dist(a, b) > CONNECT.walk) return false;
  const seen = new Map<number, number>([[a, 0]]), queue = [a];
  while (queue.length) {
    const k = queue.shift()!, d = seen.get(k)!;
    if (k === b) return true;
    if (d >= CONNECT.walk) continue;
    for (const j of NEIGHBORS[k]) {
      const t = world.tiles[j];
      if (seen.has(j) || t.owner !== n.id || !t.land || (t.terrain === "mountain" && !climb && !t.road)) continue;
      seen.set(j, d + 1); queue.push(j);
    }
  }
  return false;
}
/** Is there water from a pier near centre a to a pier near centre b, not through an enemy's waters? */
function sail(world: World, n: Nation, a: number, b: number, ocean: boolean, ports: number[]): boolean {
  const near = (c: number) => ports.filter(p => dist(p, c) <= RIVER.pierReach);
  const from = near(a), to = new Set(near(b));
  if (!from.length || !to.size) return false;
  const water = (i: number) => { const t = world.tiles[i]; return t.terrain === "shallow" || t.river || (ocean && t.terrain === "ocean"); };
  const seen = new Set(from), queue = [...from];
  while (queue.length) {
    const k = queue.shift()!;
    if (to.has(k)) return true;
    for (const j of NEIGHBORS[k]) {
      const t = world.tiles[j];
      if (seen.has(j) || !(water(j) || to.has(j)) || (t.owner >= 0 && t.owner !== n.id && activeWar(world, n.id, t.owner))) continue;
      seen.add(j); queue.push(j);
    }
  }
  return false;
}

/** How each centre reaches the capital (its first link on the way), or null when it is cut off. */
export function links(world: World, n: Nation): Map<number, Link> {
  const out = new Map<number, Link>([[n.capital, "capital"]]);
  const all = centresOf(n).filter(c => world.tiles[c]?.owner === n.id), m = mods(world, n);
  const ocean = m.move.has("ocean"), climb = m.move.has("mountain"), ports = piers(world, n);
  const roads = new Set(roadNet(world, n).linked);
  const linkBetween = (a: number, b: number): Link => {
    if (walk(world, n, a, b, climb)) return "walk";
    if ((a === n.capital && roads.has(b)) || (b === n.capital && roads.has(a)) || (roads.has(a) && roads.has(b))) return "road";
    if (sail(world, n, a, b, ocean, ports)) return "water";
    return null;
  };
  // grow the capital's region one link at a time
  const queue = [n.capital];
  while (queue.length) {
    const c = queue.shift()!;
    for (const o of all) {
      if (out.has(o)) continue;
      const how = linkBetween(c, o);
      if (how) { out.set(o, how); queue.push(o); }
    }
  }
  for (const c of all) if (!out.has(c)) out.set(c, null);
  return out;
}

/** The share of what a tile yields that reaches the nation's stores (§2.7). */
export function yieldShares(world: World, n: Nation): (tile: number) => number {
  const ls = links(world, n), cs = [...ls.keys()], young = new Set(n.settlements.filter(s => world.tick - s.tick < CONNECT.grace).map(s => s.tile));
  const roadNear = (i: number) => (world.tiles[i].road || 0) > 0 || NEIGHBORS[i].some(j => (world.tiles[j].road || 0) > 0 && world.tiles[j].land);
  const memo = new Map<number, number>();
  return (i: number) => {
    const hit = memo.get(i); if (hit !== undefined) return hit;
    let best = cs[0], d = Infinity;
    for (const c of cs) { const x = dist(c, i); if (x < d || (x === d && c < best)) { d = x; best = c; } }
    let share = ls.get(best) || young.has(best) ? 1 : CONNECT.isolatedYield;
    if (d > CONNECT.reach && !roadNear(i)) share *= CONNECT.farYield;
    memo.set(i, share);
    return share;
  };
}

/** The settlements cut off from the capital (past their first CONNECT.grace turns). */
export function isolated(world: World, n: Nation): number[] {
  const young = new Set(n.settlements.filter(s => world.tick - s.tick < CONNECT.grace).map(s => s.tile));
  return [...links(world, n).entries()].filter(([c, l]) => l === null && !young.has(c)).map(([c]) => c);
}
