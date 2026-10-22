// §6.8 Electric power. Plants make power: a thermal plant burns coal (or oil) each turn, a dam on a river falling from
// the hills needs no fuel. Power runs along the nation's own roads and railways (the grid follows the roads) to the
// centres they join; each centre asks for power by its people. A centre on the grid gets its share of what the plants
// made; power lifts craft and research, and lights the homes (the people's need for light and power).

import { POWER } from "./rules.ts";
import { buildingOf } from "./catalog.ts";
import { buildingWorks, roadWalk, type Ledger, type Mods } from "./engine.ts";
import { provinces } from "./provinces.ts";
import { spend } from "./treasury.ts";
import type { Nation, World } from "./types.ts";

export interface PowerState { made: number; need: number; share: number; centres: number[]; idle: number }

/** End of the turn: plants burn their fuel and are paid from the treasury; the grid shares what they made. */
export function powerPhase(world: World, L: Ledger): void {
  for (const n of world.nations) {
    if (!n.alive || !n.founded) continue;
    const plants = n.buildings.filter(b => buildingWorks(world, b) && buildingOf(world, b.type)?.effect.power);
    if (!plants.length) { if (n.power) delete n.power; continue; }
    let made = 0, idle = 0;
    const running: number[] = [];
    for (const b of plants) {
      const e = buildingOf(world, b.type)!.effect, fuel = e.fuel || 0;
      if (!spend(L, n, POWER.upkeep, "power")) { idle++; continue; } // §4.13 no coin, no crew
      if (fuel) {
        const kind = (n.stock.coal || 0) >= fuel ? "coal" : (n.stock.oil || 0) >= fuel ? "oil" : null;
        if (!kind) { idle++; continue; }
        L.stock(n, kind, -fuel, "power");
      }
      made += e.power || 0; running.push(b.tile);
    }
    // the grid: the centres the nation's roads join to a running plant
    const grid = running.length ? roadWalk(world, n, running) : new Set<number>();
    const provs = provinces(world, n), centres = provs.filter(p => grid.has(p.centre));
    const need = centres.reduce((s, p) => s + p.people * POWER.perPerson, 0);
    const served = need > 0 ? Math.min(1, made / need) : 0;
    const share = n.population > 0 ? centres.reduce((s, p) => s + p.people, 0) * served / n.population : 0;
    n.power = { made: Math.round(made * 10) / 10, need: Math.round(need * 10) / 10, share: Math.round(share * 100) / 100, centres: centres.map(p => p.centre), idle };
  }
}

/** What power adds to the nation's powers (called from mods): craft and research, by the share of the people it reaches. */
export function powerMods(n: Nation, m: Mods): void {
  const s = n.power?.share ?? 0; if (!s) return;
  m.role.craft = (m.role.craft || 0) + POWER.craft * s;
  m.rp += POWER.rp * s;
}

/** The power as the nation sees it. */
export function powerView(world: World, n: Nation) {
  const p = n.power, plants = n.buildings.filter(b => buildingOf(world, b.type)?.effect.power);
  if (!p && !plants.length) return undefined;
  const name = (c: number) => (c === n.capital ? n.capitalName : n.settlements.find(s => s.tile === c)?.name ?? "?");
  const all = [n.capital, ...n.settlements.map(s => s.tile)];
  return {
    plants: plants.length, made: p?.made ?? 0, need: p?.need ?? 0, people_reached: p?.share ?? 0, idle_plants: p?.idle || undefined,
    on_grid: (p?.centres ?? []).map(name), off_grid: all.filter(c => !(p?.centres ?? []).includes(c)).map(name),
  };
}
