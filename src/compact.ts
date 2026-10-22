// §2.3b A compact realm. A nation need not hold one block of land, but one block pays: the land deep inside it
// (an interior tile: every neighbour is the nation's own or the sea) is worked fully and safely, yields more, is
// held more firmly and weighs less against the tile limit; filling a gap in one's own land is cheap; the main block
// is one home market for the treasury. Land cut off from the main block with no centre of its own yields less and
// unsettles the people.

import { COMPACT } from "./rules.ts";
import { NEIGHBORS, col, row } from "./hex.ts";
import { unheldTiles } from "./hold.ts";
import { treatiesBetween } from "./diplomacy.ts";
import type { Nation, World } from "./types.ts";

/** §2.3c the land it leaves unheld, and the neighbours' unheld land it could take. */
function holdView(world: World, n: Nation) {
  const mine = unheldTiles(world, n), next: Array<{ nation: string; tile: number[] }> = [];
  for (const o of world.nations) {
    if (o.id === n.id || !o.alive || !o.founded || !n.met.includes(o.id)) continue;
    if (treatiesBetween(world, n.id, o.id, ["non_aggression", "alliance", "peace", "vassal"]).length) continue;
    for (const i of unheldTiles(world, o)) if (NEIGHBORS[i].some(j => world.tiles[j].owner === n.id)) next.push({ nation: o.name, tile: [col(i), row(i)] });
  }
  return {
    unheld: mine.length ? { count: mine.length, sample: mine.slice(0, 6).map(i => [col(i), row(i)]) } : undefined,
    unheld_next_door: next.length ? next.slice(0, 6) : undefined,
  };
}

export interface Territory {
  /** Tiles joined to the capital over the nation's own tiles (land and water). */
  main: Set<number>;
  /** Land tiles whose every neighbour is the nation's own or the sea. */
  interior: Set<number>;
  /** Pieces cut off from the main block with no centre of their own (tiles of each). */
  exclaves: number[][];
}

const memo = new WeakMap<Nation, { key: string; t: Territory }>();
/** The nation's land as blocks (memo per turn and holding). */
export function territory(world: World, n: Nation): Territory {
  const owned: number[] = [];
  for (const t of world.tiles) if (t.owner === n.id) owned.push(t.i);
  const key = `${world.tick}:${owned.length}:${owned[0] ?? -1}:${owned.at(-1) ?? -1}`;
  const hit = memo.get(n);
  if (hit && hit.key === key) return hit.t;
  const mine = new Set(owned), seen = new Set<number>(), centres = new Set([n.capital, ...n.settlements.map(s => s.tile)]);
  const block = (start: number): number[] => {
    const out = [start], stack = [start]; seen.add(start);
    while (stack.length) { const k = stack.pop()!; for (const j of NEIGHBORS[k]) if (mine.has(j) && !seen.has(j)) { seen.add(j); out.push(j); stack.push(j); } }
    return out;
  };
  const main = new Set(mine.has(n.capital) ? block(n.capital) : []), exclaves: number[][] = [];
  for (const i of owned) if (!seen.has(i)) { const b = block(i); if (!b.some(x => centres.has(x))) exclaves.push(b); }
  const interior = new Set<number>();
  for (const i of owned) {
    if (!world.tiles[i].land) continue;
    if (NEIGHBORS[i].length === 6 && NEIGHBORS[i].every(j => mine.has(j) || !world.tiles[j].land)) interior.add(i);
  }
  const t = { main, interior, exclaves };
  memo.set(n, { key, t });
  return t;
}
/** Is this tile deep inside the nation's land? */
export const isInterior = (world: World, n: Nation, i: number): boolean => territory(world, n).interior.has(i);
/** Is this free tile a gap in the nation's land (COMPACT.fill or more of its neighbours are the nation's)? */
export const fillsGap = (world: World, n: Nation, i: number): boolean => NEIGHBORS[i].filter(j => world.tiles[j].owner === n.id).length >= COMPACT.fill;
/** The share of what a tile yields that its place in the realm adds or takes. */
export function compactYield(world: World, n: Nation): (i: number) => number {
  const t = territory(world, n), cut = new Set(t.exclaves.flat());
  return (i: number) => (t.interior.has(i) ? 1 + COMPACT.interiorYield : 1) * (cut.has(i) ? 1 - COMPACT.exclaveYield : 1);
}
/** The home market: the treasury's taxes × (1 + this) for the main block's land. */
export function homeMarket(world: World, n: Nation): number {
  let land = 0;
  for (const i of territory(world, n).main) if (world.tiles[i].land) land++;
  return Math.min(COMPACT.marketMax, Math.floor(land / COMPACT.marketPer) * COMPACT.marketTax);
}

/** The realm's shape as the nation sees it. */
export function territoryView(world: World, n: Nation) {
  const t = territory(world, n);
  const gaps = new Set<number>();
  for (const i of t.main) for (const j of NEIGHBORS[i]) if (world.tiles[j].owner === -1 && world.tiles[j].land && world.tiles[j].terrain !== "icewall" && fillsGap(world, n, j)) gaps.add(j);
  return {
    main_block_tiles: t.main.size, interior_tiles: t.interior.size, home_market_tax_bonus: homeMarket(world, n),
    exclaves: t.exclaves.length ? t.exclaves.map(b => ({ tiles: b.length, at: [col(b[0]), row(b[0])] })) : undefined,
    gaps_to_fill: gaps.size ? [...gaps].sort((a, b) => a - b).slice(0, 6).map(i => [col(i), row(i)]) : undefined,
    ...holdView(world, n),
  };
}
