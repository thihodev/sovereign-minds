// Trade roads (§7.3). Goods travel a real way across the map: overland, at
// the pace of the terrain, with porters; or by water (rivers and shallow sea)
// with boats, from one of the sender's piers. Roads never cross the land of a
// nation at war with the sender; they cross a third nation's land only when
// they must (and pay it a toll unless a passage or alliance treaty stands).
// Pure reads of the World: deterministic, so the same trade takes the same road.

import { NEIGHBORS } from "./hex.ts";
import { buildingOf } from "./catalog.ts";
import { activeWar, landGap, treatiesBetween } from "./diplomacy.ts";
import { buildingWorks, mods, workers } from "./engine.ts";
import type { Nation, World } from "./types.ts";
import { TERRAIN, TRADE } from "./rules.ts";

export interface Route {
  mode: "near" | "land" | "water";
  /** Tiles from the sender to the receiver (empty for "near"). */
  path: number[];
  ticks: number;
  /** Third nations whose land the road crosses without a passage or alliance treaty: each takes a toll. */
  tolls: number[];
  porters: number;
  boats: number;
}

/** A small binary heap of [cost, tile]. */
class Heap {
  private a: Array<[number, number]> = [];
  get size(): number { return this.a.length; }
  push(x: [number, number]): void {
    const a = this.a; a.push(x);
    for (let i = a.length - 1; i > 0;) { const p = (i - 1) >> 1; if (a[p][0] < a[i][0] || (a[p][0] === a[i][0] && a[p][1] <= a[i][1])) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop(): [number, number] {
    const a = this.a, top = a[0], last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        const less = (x: number, y: number) => a[x][0] < a[y][0] || (a[x][0] === a[y][0] && a[x][1] < a[y][1]);
        if (l < a.length && less(l, m)) m = l;
        if (r < a.length && less(r, m)) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

/** Cheapest path from any source to any target tile; null when none. */
function search(world: World, sources: number[], isTarget: (i: number) => boolean, step: (from: number, to: number) => number): { path: number[]; cost: number } | null {
  const cost = new Map<number, number>(), prev = new Map<number, number>(), heap = new Heap();
  for (const s of sources) { cost.set(s, 0); heap.push([0, s]); }
  while (heap.size) {
    const [c, i] = heap.pop();
    if (c > (cost.get(i) ?? Infinity)) continue;
    if (isTarget(i)) {
      const path = [i];
      for (let k = i; prev.has(k);) { k = prev.get(k)!; path.push(k); }
      return { path: path.reverse(), cost: c };
    }
    for (const j of NEIGHBORS[i]) {
      const w = step(i, j);
      if (!(w < Infinity)) continue;
      const nc = c + w;
      if (nc < (cost.get(j) ?? Infinity)) { cost.set(j, nc); prev.set(j, i); heap.push([nc, j]); }
    }
  }
  return null;
}

/** Who may a road from `from` cross freely, and whose land is shut to it. */
function access(world: World, from: Nation, to: Nation) {
  const free = (owner: number) => owner === -1 || owner === from.id || owner === to.id || treatiesBetween(world, from.id, owner, ["passage", "alliance"]).length > 0;
  const shut = (owner: number) => owner >= 0 && owner !== from.id && !!activeWar(world, from.id, owner);
  return { free, shut };
}

const sum = (g: Record<string, number>) => Object.values(g).reduce((s, q) => s + q, 0);
const tollsOn = (world: World, path: number[], free: (o: number) => boolean) => [...new Set(path.map(i => world.tiles[i].owner).filter(o => o >= 0 && !free(o)))].sort((a, b) => a - b);

export function landRoute(world: World, from: Nation, to: Nation): { path: number[]; cost: number; tolls: number[] } | null {
  const { free, shut } = access(world, from, to), canClimb = mods(world, from).move.has("mountain");
  const sources = world.tiles.filter(t => t.owner === from.id && t.land).map(t => t.i);
  const found = search(world, sources, i => world.tiles[i].owner === to.id, (_, j) => {
    const t = world.tiles[j];
    if (!t.land || shut(t.owner) || (t.terrain === "mountain" && !canClimb)) return Infinity;
    return TERRAIN[t.terrain].move + (free(t.owner) ? 0 : 3); // go round foreign land when there is a way
  });
  return found ? { ...found, tolls: tollsOn(world, found.path, free) } : null;
}

/** The sender's finished piers: boats leave only from there. */
export function piers(world: World, n: Nation): number[] {
  return n.buildings.filter(b => buildingWorks(world, b) && (buildingOf(world, b.type)?.effect.port || 0) > 0 && world.tiles[b.tile].owner === n.id).map(b => b.tile);
}

export function waterRoute(world: World, from: Nation, to: Nation): { path: number[]; cost: number; tolls: number[] } | null {
  const starts = piers(world, from);
  if (!starts.length) return null;
  const { free, shut } = access(world, from, to);
  const ocean = mods(world, from).move.has("ocean"); // §5.3 ocean-going ships also sail deep water
  const water = (i: number) => { const t = world.tiles[i]; return t.terrain === "shallow" || t.river || (ocean && t.terrain === "ocean"); };
  const landing = (i: number) => { const t = world.tiles[i]; return t.owner === to.id && t.land && (t.river || NEIGHBORS[i].some(j => world.tiles[j].terrain === "shallow")); };
  const found = search(world, starts, landing, (i, j) => {
    const t = world.tiles[j];
    if (shut(t.owner)) return Infinity;
    if (landing(j)) return 1;
    if (!water(j) || !(water(i) || starts.includes(i))) return Infinity;
    return 1 + (free(t.owner) ? 0 : 3);
  });
  return found ? { ...found, tolls: tollsOn(world, found.path, free) } : null;
}

/** Boats and porters already away with caravans. */
export function busy(world: World, n: Nation): { boats: number; porters: number } {
  let boats = 0, porters = 0;
  for (const c of world.caravans) if (c.from === n.id) { boats += c.boats || 0; porters += c.porters || 0; }
  return { boats, porters };
}

/** How `goods` would go from one nation to another now, or why they cannot. */
export function planRoute(world: World, from: Nation, to: Nation, goods: Record<string, number>): Route | string {
  if (landGap(world, from.id, to.id) <= TRADE.nearDistance) return { mode: "near", path: [], ticks: 0, tolls: [], porters: 0, boats: 0 };
  const land = landRoute(world, from, to);
  const units = Math.max(1, sum(goods)), away = busy(world, from);
  const lift = 1 + mods(world, from).transport; // §5.3 wheels, roads and sails carry more and go faster
  const boatsNeed = Math.ceil(units / (TRADE.boatLoad * lift)), boatsFree = Math.floor(from.stock.boat || 0) - away.boats;
  const water = boatsFree >= boatsNeed ? waterRoute(world, from, to) : null;
  const portersNeed = Math.ceil(units / (TRADE.porterLoad * lift));
  const portersFree = Math.floor(workers(from) * TRADE.porterShare) - away.porters; // anyone may carry; the economy takes them from the gatherers first
  const byLand = land ? Math.max(1, Math.ceil(land.cost / (TRADE.landSpeed * lift))) : Infinity;
  const byWater = water ? Math.max(1, Math.ceil(water.cost / (TRADE.waterSpeed * lift))) : Infinity;
  if (water && byWater <= byLand) return { mode: "water", path: water.path, ticks: byWater, tolls: water.tolls, porters: 0, boats: boatsNeed };
  if (land && portersFree >= portersNeed) return { mode: "land", path: land.path, ticks: byLand, tolls: land.tolls, porters: portersNeed, boats: 0 };
  if (water) return { mode: "water", path: water.path, ticks: byWater, tolls: water.tolls, porters: 0, boats: boatsNeed };
  if (land) return `Cần ${portersNeed} người khuân vác (5 đơn vị mỗi người) nhưng chỉ rảnh ${Math.max(0, portersFree)}; hoặc dùng thuyền từ một Bến thuyền`;
  return boatsFree < boatsNeed && piers(world, from).length ? `Không có đường bộ, và cần ${boatsNeed} thuyền rảnh (có ${Math.max(0, boatsFree)})` : "Không có đường nào tới đó: đường bộ bị chặn (núi, biển, nước đang chiến tranh) và chưa có Bến thuyền với thuyền";
}
