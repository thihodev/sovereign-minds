// §6.4 Animals: wild herds on the map, tamed by hunters into the nation's herds, which breed while there is room,
// give milk, meat, wool and hides to the herders who tend them, help hunters (dogs), pull ploughs (oxen) and carry
// riders to war (horses, §7.4). Herds are goods in the stores: raided, looted and traded like any other.

import { ANIMALS, HERDS, HORSES } from "./rules.ts";
import { buildingOf } from "./catalog.ts";
import { buildingWorks, mods, ownedTiles, type Ledger } from "./engine.ts";
import type { Nation, ResKey, World } from "./types.ts";

export const KINDS = Object.keys(ANIMALS);
const GRASS = new Set(["grass", "hill", "tundra", "coast"]);

/** How many animals the nation can keep: pens, pasture for the grazers, yards by the homes for the rest. */
export function herdRoom(world: World, n: Nation): { grazers: number; others: number; pens: number } {
  const pens = n.buildings.filter(b => buildingWorks(world, b)).reduce((s, b) => s + (buildingOf(world, b.type)?.effect.herd || 0), 0);
  const pasture = ownedTiles(world, n.id).filter(t => t.land && GRASS.has(t.terrain)).length * HERDS.pasture;
  const yards = (1 + n.settlements.length) * HERDS.yard;
  return { grazers: pasture + pens, others: yards + pens, pens };
}
const count = (n: Nation, k: string) => Math.floor(n.stock[k] || 0);

/** A herd's turn, inside the economy: taming, breeding, the goods of the tended animals, the excess slaughtered.
 *  `hunters` and `herders` are this turn's; `take` draws from the nation's land as the hunters do. Returns food made. */
export function herdTurn(world: World, n: Nation, L: Ledger, hunters: number, herders: number, take: (key: ResKey, want: number, reason: string) => number, huntMult: number): number {
  const m = mods(world, n);
  let food = 0;
  // taming: hunters bring some home alive (horses are caught as before, §2.1)
  for (const [k, a] of Object.entries(ANIMALS)) {
    if (k === "horse" || !hunters || !m.caps.has(a.cap)) continue;
    const got = take(a.wild, hunters * HERDS.tame * huntMult, "hunt");
    if (got > 0) L.stock(n, k, got, "hunt");
  }
  const room = herdRoom(world, n), graze = KINDS.filter(k => ANIMALS[k].graze), other = KINDS.filter(k => !ANIMALS[k].graze);
  const total = (ks: string[]) => ks.reduce((s, k) => s + count(n, k), 0);
  // breeding, up to the room there is
  for (const ks of [graze, other]) {
    const cap = ks === graze ? room.grazers : room.others, have = total(ks);
    for (const k of ks) {
      const c = count(n, k); if (c < 2 || !cap) continue;
      const born = c * ANIMALS[k].breed * Math.max(0, 1 - have / cap);
      if (born > 0) L.stock(n, k, born, "growth");
    }
    // too many for the room: some go to the knife
    const over = total(ks) - cap;
    if (over > 0) for (const k of ks) {
      const cut = Math.floor(count(n, k) * over / Math.max(1, total(ks)) * HERDS.cull); if (cut <= 0) continue;
      L.stock(n, k, -cut, "eat"); L.stock(n, "food", cut * ANIMALS[k].meat, "growth"); food += cut * ANIMALS[k].meat;
    }
  }
  // what the tended herds give
  const all = total(KINDS), tended = all ? Math.min(1, herders * HERDS.herder / all) : 0, rate = tended + (1 - tended) * HERDS.untended;
  for (const k of KINDS) {
    const c = count(n, k), a = ANIMALS[k]; if (!c) continue;
    if (a.food) { L.stock(n, "food", c * a.food * rate, "growth"); food += c * a.food * rate; }
    if (a.fiber) L.stock(n, "fiber", c * a.fiber * rate, "growth");
    if (a.hide) L.stock(n, "hide", c * a.hide * rate, "growth");
  }
  return food;
}

/** Hunting with dogs: up to +HERDS.dogHunt, a dog for two hunters. */
export function dogBonus(n: Nation, hunters: number): number { return hunters ? HERDS.dogHunt * Math.min(1, count(n, "dog") * 2 / hunters) : 0; }
/** Ploughing with oxen: up to +HERDS.plough, an ox for three farmers. */
export function ploughBonus(n: Nation, farmers: number): number { return farmers ? HERDS.plough * Math.min(1, count(n, "cattle") * 3 / farmers) : 0; }

/** The order "cull": slaughter animals for their meat now. */
export function cull(n: Nation, a: Record<string, unknown>, L: Ledger): string | null {
  const k = String(a.animal ?? ""), def = ANIMALS[k];
  if (!def) return `animal phải là một trong: ${KINDS.join(", ")}`;
  const q = Math.min(count(n, k), Math.max(1, Math.floor(Number(a.count ?? 1)) || 1));
  if (q <= 0) return `Không có ${def.name} nào`;
  L.stock(n, k, -q, "eat"); L.stock(n, "food", q * def.meat, "growth");
  n.lastEvents.push(`Giết thịt ${q} ${def.name}: +${q * def.meat} lương thực.`);
  return null;
}

/** The herds as a nation sees them. */
export function herdView(world: World, n: Nation) {
  const m = mods(world, n), room = herdRoom(world, n), animals = Object.fromEntries(KINDS.filter(k => count(n, k) > 0).map(k => [k, count(n, k)]));
  const wild: Array<{ animal: string; wild: string; on_my_land: number; can_tame: boolean }> = [];
  for (const [k, a] of Object.entries(ANIMALS)) {
    const amount = ownedTiles(world, n.id).reduce((s, t) => s + (t.res[a.wild] || 0), 0);
    if (amount >= 1) wild.push({ animal: k, wild: a.wild, on_my_land: Math.round(amount), can_tame: m.caps.has(a.cap) && (k !== "horse" || m.caps.has(HORSES.cap)) });
  }
  if (!Object.keys(animals).length && !wild.length) return undefined;
  return { animals, room_grazers: room.grazers, room_others: room.others, pens: room.pens / HERDS.pen, wild_on_my_land: wild };
}
