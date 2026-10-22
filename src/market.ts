// §6.3 Prices and §7.10 what each nation is rich in. A good is dear where many use or want it and few make
// or hold it, cheap where it piles up unused. Each nation's land holds its own riches (§2.10 rich veins),
// its people know their own crafts, and what one lacks another has: trade for it, or take the land it lies on.
// Prices are computed at the end of each turn from what the nations made, used and hold; the rest are pure reads.

import { dist } from "./hex.ts";
import { GOOD_VALUE, LUXURY, MARKET, RES_NAME } from "./rules.ts";
import { allRecipes, depthOf, goodValue, invName } from "./catalog.ts";
import { canSeeRes, mods, type Ledger } from "./engine.ts";
import type { Nation, ResKey, World } from "./types.ts";

/** Goods of the land a nation can be rich in (§7.10). */
export const LAND_GOODS: ResKey[] = ["copper", "tin", "iron", "gold", "silver", "gems", "marble", "salt", "flint", "clay", "ochre", "stone", "wood", "reeds", "herbs", "honey", "spice", "fur", "amber", "horse", "coal", "oil", "sulfur", "fish", "pearl", "coral", "whale", "game"];
/** Ledger reasons that are making or using a good, not moving it between nations or losing it. */
const MADE = new Set(["gather", "hunt", "fish", "extract", "mine", "craft", "growth", "bounty"]);
const USED = new Set(["eat", "craft", "wear", "build", "road", "settle", "claim", "officials", "reward", "births", "luxury", "power", "air"]);

/** The Ledger's note of a stock change, by nation: what was made and what was used this turn. */
export function noteFlow(flows: Map<number, Record<string, [number, number]>>, n: Nation, key: string, delta: number, reason: string): void {
  if (delta > 0 ? !MADE.has(reason) : !USED.has(reason)) return;
  let f = flows.get(n.id); if (!f) { f = {}; flows.set(n.id, f); }
  const x = f[key] ??= [0, 0];
  if (delta > 0) x[0] += delta; else x[1] -= delta;
}

const goods = (world: World) => [...Object.keys(GOOD_VALUE), ...Object.keys(world.custom.goods)].filter(g => g !== "coin"); // §4.13 coin is the measure, not a good to price
const live = (world: World) => world.nations.filter(n => n.alive && n.founded);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** What a nation wants of each good for the recipes it knows (§6.3). */
export function wants(world: World, n: Nation): Record<string, number> {
  const m = mods(world, n), out: Record<string, number> = {};
  for (const rec of allRecipes(world)) {
    if (!n.inventions.includes(rec.needs) && !m.unlocked.has(rec.id)) continue;
    for (const [g, q] of Object.entries(rec.input)) out[g] = (out[g] || 0) + q * MARKET.recipeWant;
  }
  for (const g of LUXURY.goods) out[g] = (out[g] || 0) + n.population * LUXURY.want; // §2.11 every people likes fine things
  return out;
}
/** A nation's need for a good per turn: what it used, or what its recipes want if more. */
export function needOf(world: World, n: Nation, g: string, w = wants(world, n)): number { return Math.max(n.flow?.[g]?.[1] ?? 0, w[g] ?? 0); }
/** What a nation has of a good per turn: what it made, and its stores spread over a few turns. */
export function haveOf(n: Nation, g: string): number { return (n.flow?.[g]?.[0] ?? 0) + (n.stock[g] || 0) / MARKET.stockTurns; }

const ratio = (need: number, have: number) => Math.max(MARKET.min, Math.min(MARKET.max, Math.sqrt((need + MARKET.k) / (have + MARKET.k))));

/** End of a turn: remember what each nation made and used, then move the world prices toward supply and demand. */
export function updateMarket(world: World, L: Ledger): void {
  for (const n of live(world)) {
    const now = L.byNation.get(n.id) ?? {}, f = n.flow ??= {};
    for (const g of new Set([...Object.keys(f), ...Object.keys(now)])) {
      const [m, u] = f[g] ?? [0, 0], [dm, du] = now[g] ?? [0, 0];
      const x: [number, number] = [r3(m + (dm - m) * MARKET.flow), r3(u + (du - u) * MARKET.flow)];
      if (x[0] < 0.01 && x[1] < 0.01) delete f[g]; else f[g] = x;
    }
  }
  const mk = world.market ??= { prices: {}, prev: {} };
  mk.prev = { ...mk.prices };
  const nations = live(world), w = new Map(nations.map(n => [n.id, wants(world, n)]));
  for (const g of goods(world)) {
    let need = 0, have = 0;
    for (const n of nations) { need += needOf(world, n, g, w.get(n.id)); have += haveOf(n, g); }
    const base = goodValue(world, g), target = base * ratio(need, have), p = mk.prices[g] ?? base;
    mk.prices[g] = Math.round((p + (target - p) * MARKET.pace) * 100) / 100;
  }
}

/** A good's world price, in food. */
export function price(world: World, g: string): number { return g === "coin" ? 1 : world.market?.prices[g] ?? goodValue(world, g); }
/** What a bundle of goods is worth at world prices. */
export function worth(world: World, g: Record<string, number>): number {
  return Math.round(Object.entries(g).reduce((s, [k, q]) => s + q * price(world, k), 0) * 10) / 10;
}
/** What a good is worth to this nation: dear where it lacks it, cheap where it piles up. */
export function localPrice(world: World, n: Nation, g: string, w?: Record<string, number>): number {
  return Math.round(goodValue(world, g) * ratio(needOf(world, n, g, w), haveOf(n, g)) * 100) / 100;
}
export function trend(world: World, g: string): "↑" | "↓" | "=" {
  const p = world.market?.prices[g], q = world.market?.prev[g];
  if (p === undefined || q === undefined || Math.abs(p - q) < 0.01) return "=";
  return p > q ? "↑" : "↓";
}

// ---------------------------------------------------------------- §7.10 riches of the land

interface Reserve { amount: number; veins: number[] }
const reserveMemo = new WeakMap<World, { tick: number; by: Map<number, Record<string, Reserve>> }>();
/** Each nation's reserves of the land goods, and its rich veins. */
export function landReserves(world: World): Map<number, Record<string, Reserve>> {
  const hit = reserveMemo.get(world); if (hit && hit.tick === world.tick) return hit.by;
  const by = new Map<number, Record<string, Reserve>>();
  for (const t of world.tiles) {
    if (t.owner < 0) continue;
    let r = by.get(t.owner); if (!r) { r = {}; by.set(t.owner, r); }
    for (const g of LAND_GOODS) {
      const a = t.res[g] || 0; if (a <= 0) continue;
      const x = r[g] ??= { amount: 0, veins: [] };
      x.amount += a; if (t.vein === g) x.veins.push(t.i);
    }
  }
  reserveMemo.set(world, { tick: world.tick, by });
  return by;
}

export interface Specialty { good: string; share: number; amount: number; veins: number[] }
/** What a nation's land is rich in (as far as `viewer` can tell): its veins, and goods it holds a large share of. */
/** `viewer` null: the Watcher, who sees every hidden ore. */
export function specialtiesOf(world: World, n: Nation, viewer: Nation | null = n): Specialty[] {
  const by = landReserves(world), mine = by.get(n.id) ?? {}, out: Specialty[] = [];
  for (const g of LAND_GOODS) {
    const x = mine[g]; if (!x || (viewer && !canSeeRes(world, viewer, g))) continue;
    let all = 0; for (const o of live(world)) all += by.get(o.id)?.[g]?.amount ?? 0;
    const share = all > 0 ? x.amount / all : 0;
    // a vein, or far more than a fair share of what the nations' lands hold
    if (x.veins.length || (share * live(world).length >= MARKET.specialtyShare && x.amount >= MARKET.specialtyMin && live(world).length > 1))
      out.push({ good: g, share: Math.round(share * 100) / 100, amount: Math.round(x.amount), veins: x.veins });
  }
  return out.sort((a, b) => b.veins.length - a.veins.length || b.share * price(world, b.good) - a.share * price(world, a.good) || a.good.localeCompare(b.good)).slice(0, 4);
}

/** §7.10 a nation's edge in knowledge: inventions few others have, and the goods only it (or few) can make. */
export function techEdge(world: World, n: Nation): { inventions: string[]; products: string[] } {
  const others = live(world).filter(o => o.id !== n.id);
  if (!others.length) return { inventions: [], products: [] };
  const few = (k: number) => k <= Math.floor(others.length / 3);
  const inventions = n.inventions.filter(id => few(others.filter(o => o.inventions.includes(id)).length))
    .sort((a, b) => depthOf(world, b) - depthOf(world, a) || a.localeCompare(b)).slice(0, 4);
  const knows = (x: Nation, rid: string, needs: string) => x.inventions.includes(needs) || mods(world, x).unlocked.has(rid);
  const products = allRecipes(world).filter(r => knows(n, r.id, r.needs) && few(others.filter(o => knows(o, r.id, r.needs)).length))
    .flatMap(r => Object.keys(r.output)).filter((g, i, a) => a.indexOf(g) === i).slice(0, 4);
  return { inventions, products };
}

export interface Shortage { good: string; local: number; world: number; need: number; have: number }
/** Goods a nation lacks: it needs them and they are dear to it. */
export function shortages(world: World, n: Nation): Shortage[] {
  const w = wants(world, n), out: Shortage[] = [];
  for (const g of goods(world)) {
    if ((LUXURY.goods as string[]).includes(g)) continue; // fine things are wanted, not needed (§2.11)
    const need = needOf(world, n, g, w); if (need < 0.3 || !canSeeRes(world, n, g)) continue;
    const local = localPrice(world, n, g, w);
    if (local >= goodValue(world, g) * MARKET.dear) out.push({ good: g, local, world: price(world, g), need: Math.round(need * 10) / 10, have: Math.round(haveOf(n, g) * 10) / 10 });
  }
  return out.sort((a, b) => b.local / goodValue(world, b.good) - a.local / goodValue(world, a.good) || a.good.localeCompare(b.good)).slice(0, 5);
}
/** Goods a nation holds far more of than it uses: what it can sell. */
export function surpluses(world: World, n: Nation): Array<{ good: string; spare: number; world: number }> {
  const w = wants(world, n), out: Array<{ good: string; spare: number; world: number }> = [];
  for (const [g, q] of Object.entries(n.stock)) {
    if (q < 10 || !(g in GOOD_VALUE || g in world.custom.goods)) continue;
    const spare = Math.floor(q - needOf(world, n, g, w) * MARKET.stockTurns);
    if (spare >= 10 && localPrice(world, n, g, w) <= goodValue(world, g) * MARKET.cheap) out.push({ good: g, spare, world: price(world, g) });
  }
  return out.sort((a, b) => b.spare * b.world - a.spare * a.world || a.good.localeCompare(b.good)).slice(0, 5);
}

/** Rich veins a nation could reach: free ones near its land, and others' within `reach` of its border. */
export function veinsNear(world: World, n: Nation, reach = 3, freeReach = 8): Array<{ tile: number; good: string; owner: number; distance: number }> {
  const mine = world.tiles.filter(t => t.owner === n.id).map(t => t.i);
  if (!mine.length) return [];
  const out: Array<{ tile: number; good: string; owner: number; distance: number }> = [];
  for (const t of world.tiles) {
    if (!t.vein || t.owner === n.id || (t.res[t.vein] || 0) <= 0 || !canSeeRes(world, n, t.vein)) continue;
    const limit = t.owner < 0 ? freeReach : reach;
    let d = Infinity; for (const i of mine) { const k = dist(i, t.i); if (k < d) d = k; if (d <= 1) break; }
    if (d <= limit) out.push({ tile: t.i, good: t.vein, owner: t.owner, distance: d });
  }
  return out.sort((a, b) => a.distance - b.distance || b.good.localeCompare(a.good) || a.tile - b.tile).slice(0, 8);
}

/** Short Vietnamese names for the UI and advice. */
export const goodVi = (world: World, g: string) => RES_NAME[g] ?? world.custom.goods[g]?.name ?? g;
export const inventionsVi = (world: World, ids: string[]) => ids.map(id => invName(world, id));
