// §6.1b Building sites: two buildings a tile, more on a centre; a building stands near a centre or on a road to the
// capital. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { col, dist, row } from "../src/hex.ts";
import { HOUSING } from "../src/rules.ts";
import { freeSite, inReach, tileSlots } from "../src/sites.ts";
import type { World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc A", capital: "Do A", people: "Dan A", flag: { layout: "h2", colors: ["#c0392b", "#ffffff"], symbol: "sun" } }] } } });
  const n = w.nations[0]; n.population = 100; n.stock.food = 1000; n.stock.stone = 500; n.stock.wood = 500; n.inventions.push("stone_tools", "P1", "P5");
  return w;
}
const build = (w: World, b: Record<string, unknown>) => step(w, { 0: { kind: "ok", response: { actions: [{ type: "build", ...b }] } } });

test("a tile holds two buildings, a village centre four; with no tile given the next goes to the nearest free site", () => {
  const w = founded("sites-slots"), [n] = w.nations;
  assert.equal(tileSlots(n, n.capital), HOUSING.centreSlots[0]);
  const other = w.tiles.find(t => t.owner === n.id && t.land && t.i !== n.capital)!;
  assert.equal(tileSlots(n, other.i), HOUSING.tileSlots);
  for (let k = 0; k < HOUSING.centreSlots[0]; k++) n.buildings.push({ id: w.nextBuildingId++, type: "workshop", tile: n.capital, progress: 4, done: true, hp: 100 });
  build(w, { building: "workshop" });
  const last = n.buildings.at(-1)!;
  assert.notEqual(last.tile, n.capital, "the capital is full: the nearest free site");
  assert.ok(dist(last.tile, n.capital) <= HOUSING.reach[0]);
  assert.equal(freeSite(w, n) !== null, true);
  // a tile full: the order is refused
  for (let k = 0; k < HOUSING.tileSlots; k++) n.buildings.push({ id: w.nextBuildingId++, type: "workshop", tile: other.i, progress: 4, done: true, hp: 100 });
  build(w, { building: "workshop", tile: [col(other.i), row(other.i)] });
  assert.ok(n.lastRejected.some(r => /đã đủ/.test(r.reason)), JSON.stringify(n.lastRejected));
});

test("a building far from every centre and off the roads is refused", () => {
  const w = founded("sites-reach"), [n] = w.nations;
  const far = w.tiles.find(t => t.land && t.owner === -1 && t.terrain !== "mountain" && dist(t.i, n.capital) === HOUSING.reach[0] + 3)!;
  far.owner = n.id; delete far.road;
  assert.equal(inReach(w, n, far.i), false);
  build(w, { building: "workshop", tile: [col(far.i), row(far.i)] });
  assert.ok(n.lastRejected.some(r => /quá xa/.test(r.reason)), JSON.stringify(n.lastRejected));
});
