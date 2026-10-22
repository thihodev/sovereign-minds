// §2.11b Jewellery (Hà Dương's idea, taken up in part): gold or silver set with a pearl, amber or a gem, by any nation
// with the capability nhiệt-cao; a luxury of its own. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, luxuries, mods, recipeInput, step, type NationSpec } from "../src/engine.ts";
import { RECIPE_BY_ID } from "../src/rules.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Hà Dương", capital: "Dương Châu", people: "người Dương", flag: { layout: "h2", colors: ["#c0392b", "#ffffff"], symbol: "sun" } }] } } });
  const n = w.nations[0]; n.population = 100; n.stability = 70; n.stock.food = 2000; n.inventions.push("stone_tools");
  for (let k = 0; k < 2; k++) n.buildings.push({ id: w.nextBuildingId++, type: "workshop", tile: n.capital, progress: 4, done: true, hp: 100 });
  return w;
}
const turn = (w: World, r: AIResponse) => { const out = step(w, { 0: { kind: "ok", response: r } as TurnInput }); assert.deepEqual(out.audit, [], "ledger audit"); };
const craft = { labor: { gather: 20, hunt: 0, fish: 0, farm: 0, wood: 0, stone: 0, flint: 0, clay: 0, mine: 0, craft: 8, build: 0, research: 0, warrior: 0 }, crafts: { jewelry: 2 } };

test("jewellery opens with the capability nhiệt-cao, whichever invention gave it", () => {
  const w = founded("jewel-cap"), [n] = w.nations;
  assert.ok(!mods(w, n).unlocked.has("jewelry"));
  n.stock.gold = 10; n.stock.pearl = 5;
  turn(w, craft);
  assert.equal(n.stock.jewelry ?? 0, 0, "no furnace, no jewellery");
  n.inventions.push("K1");
  assert.ok(mods(w, n).unlocked.has("jewelry"));
});

test("gold or silver, with a pearl, amber or a gem: the one most in store is used", () => {
  const w = founded("jewel-make"), [n] = w.nations;
  n.inventions.push("K1");
  const rec = RECIPE_BY_ID.jewelry;
  n.stock.gold = 0; n.stock.silver = 3; n.stock.pearl = 0; n.stock.amber = 1; n.stock.gems = 2;
  assert.deepEqual(recipeInput(n, rec), { silver: 2, gems: 1 });
  n.stock.silver = 1;
  assert.equal(recipeInput(n, rec), null, "not enough metal");
  // (the people also enjoys a little of each fine thing in store every turn, before the crafters work)
  n.stock.gold = 6; n.stock.silver = 0; n.stock.pearl = 0; n.stock.amber = 3; n.stock.gems = 0;
  turn(w, craft);
  // two pieces made (4 gold, 2 amber, after a unit of each enjoyed); the people enjoys one piece at once
  assert.equal(n.stock.gold, 1); assert.equal(n.stock.amber || 0, 0);
  assert.ok((n.stock.jewelry || 0) >= 1, `${n.stock.jewelry}`);
});

test("jewellery is a luxury of its own", () => {
  const w = founded("jewel-lux"), [n] = w.nations;
  for (const g of ["honey", "spice", "fur", "amber", "ochre", "gold", "silver", "gems", "pearl", "coral", "whale_oil"]) n.stock[g] = 0;
  n.stock.jewelry = 5;
  const l = luxuries(w, n);
  assert.deepEqual(l.kinds, ["jewelry"]);
  assert.ok(l.stability > 0);
});
