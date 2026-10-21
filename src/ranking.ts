// The world's ranking (§9.3). No single winner: one score that rewards deep
// inventions (first in the world counts most), people, land, honour, prosperity and age.

import { depthOf, inv } from "./catalog.ts";
import { ownedTiles } from "./engine.ts";
import { prosperityAverage } from "./prosperity.ts";
import { EXODUS, PROSPERITY } from "./rules.ts";
import { exodusOf } from "./exodus.ts";
import type { World } from "./types.ts";

export interface Rank { nation: number; name: string; score: number; alive: boolean; parts: Record<string, number> }

export function ranking(world: World): Rank[] {
  return world.nations.filter(n => n.founded).map(n => {
    const known = n.inventions.reduce((s, id) => s + 4 * (depthOf(world, id) + 1), 0);
    const first = Object.entries(world.registry).filter(([, r]) => r.by.includes(n.id)).reduce((s, [id]) => s + 10 * (depthOf(world, id) + 1), 0);
    const invented = Object.values(world.custom.inventions).filter(v => v.custom?.by === n.id).reduce((s, v) => s + 6 * ((v.custom?.depth ?? 1) + 1), 0);
    const parts = {
      people: n.alive ? n.population : 0,
      land: n.alive ? ownedTiles(world, n.id).length * 3 : 0,
      knowledge: known,
      firsts: first,
      inventor: invented,
      honour: n.reputation,
      prosperity: n.alive ? Math.round(prosperityAverage(n) * PROSPERITY.rankWeight) : 0, // §4.7 how well the people lives
      exodus: -Math.round(exodusOf(n, world.tick).recent * EXODUS.rankPerPerson), // §4.8 the people it could not keep
      age: Math.floor((n.alive ? world.tick : (n.peakPopulation ? world.tick : 0)) / 10),
    };
    return { nation: n.id, name: n.name, alive: n.alive, score: Object.values(parts).reduce((a, b) => a + b, 0), parts };
  }).sort((a, b) => b.score - a.score || a.nation - b.nation);
}
export { inv };
