// §7.3b Airports. Flight is no use without a field to land on: a centre with an open airport is joined by air to
// every other centre of the nation that has one (a settlement over the sea or the mountains is no longer cut off),
// and a caravan flies between two nations' open airports in one turn, safe from robbers, storms and tolls, but
// carrying little. An airport pays its crews from the treasury and burns oil each turn; with neither it stays shut.

import { AIR } from "./rules.ts";
import { buildingWorks, type Ledger } from "./engine.ts";
import { activeWar } from "./diplomacy.ts";
import { spend } from "./treasury.ts";
import type { Nation, World } from "./types.ts";

export interface AirState { open: number[]; shut: number }

const airports = (world: World, n: Nation) => n.buildings.filter(b => b.type === "airport" && buildingWorks(world, b) && world.tiles[b.tile].owner === n.id);

/** End of the turn: each airport is paid and fuelled for the next turn, or shuts. */
export function airPhase(world: World, L: Ledger): void {
  for (const n of world.nations) {
    if (!n.alive || !n.founded) continue;
    const all = airports(world, n);
    if (!all.length) { if (n.air) delete n.air; continue; }
    const open: number[] = [];
    let shut = 0;
    for (const b of all) {
      if ((n.stock.oil || 0) < AIR.fuel || !spend(L, n, AIR.upkeep, "air")) { shut++; continue; }
      L.stock(n, "oil", -AIR.fuel, "air");
      open.push(b.tile);
    }
    n.air = { open, shut };
    if (shut) n.lastEvents.push(`${shut} sân bay đóng cửa lượt này: thiếu ${AIR.fuel} dầu hay ${AIR.upkeep} tiền mỗi sân bay.`);
  }
}

/** The nation's open airports (tiles), still its own. */
export function openAirports(world: World, n: Nation): number[] {
  return (n.air?.open ?? []).filter(i => world.tiles[i]?.owner === n.id && n.buildings.some(b => b.type === "airport" && b.tile === i && buildingWorks(world, b)));
}

/** Can goods fly from one nation to the other this turn: an open airport on each side, and no war between them. */
export function airLink(world: World, from: Nation, to: Nation): { a: number; b: number } | null {
  const a = openAirports(world, from), b = openAirports(world, to);
  if (!a.length || !b.length || activeWar(world, from.id, to.id)) return null;
  return { a: a[0], b: b[0] };
}
/** What one flight carries: AIR.load for each open airport of the sender. */
export const airLoad = (world: World, n: Nation): number => AIR.load * openAirports(world, n).length;

/** The airports as the nation sees them. */
export function airView(world: World, n: Nation) {
  const all = n.buildings.filter(b => b.type === "airport");
  if (!all.length) return undefined;
  const open = new Set(openAirports(world, n));
  const name = (c: number) => (c === n.capital ? n.capitalName : n.settlements.find(s => s.tile === c)?.name ?? "?");
  const partners = world.nations.filter(o => o.id !== n.id && o.alive && n.met.includes(o.id) && openAirports(world, o).length).map(o => o.name);
  return {
    airports: all.map(b => ({ at: name(b.tile), state: !b.done ? "building" : open.has(b.tile) ? "open" : "shut" })),
    flight_load: airLoad(world, n) || undefined, can_fly_to: open.size && partners.length ? partners : undefined,
  };
}
