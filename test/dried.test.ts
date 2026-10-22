// §6.7b Dried fish and meat (Văn Phong's idea #31, taken up in part). No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, mods, step, type NationSpec } from "../src/engine.ts";
import { DRIED, RECIPE_BY_ID } from "../src/rules.ts";
import type { World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Văn Phong", capital: "Phong Đô", people: "người Phong", flag: { layout: "h2", colors: ["#c0392b", "#ffffff"], symbol: "sun" } }] } } });
  const n = w.nations[0]; n.population = 60; n.stability = 70; n.inventions.push("stone_tools", "K1");
  n.buildings.push({ id: w.nextBuildingId++, type: "workshop", tile: n.capital, progress: 4, done: true, hp: 100 });
  return w;
}
const labor = { gather: 30, hunt: 0, fish: 0, farm: 0, wood: 0, stone: 0, flint: 0, clay: 0, mine: 0, craft: 4, build: 0, research: 0, warrior: 0 };

test("3 food and 1 salt make 2 dried food, with the capability nhiệt-cao", () => {
  const w = founded("dried-make"), [n] = w.nations;
  assert.deepEqual(RECIPE_BY_ID.dried_food.input, { food: 3, salt: 1 });
  assert.deepEqual(RECIPE_BY_ID.dried_food.output, { dried_food: 2 });
  assert.ok(mods(w, n).unlocked.has("dried_food"));
  n.stock.food = 1000; n.stock.salt = 10;
  step(w, { 0: { kind: "ok", response: { labor, crafts: { dried_food: 3 } } } });
  assert.ok((n.stock.dried_food ?? 0) > 0, `${n.stock.dried_food}`);
  assert.ok((n.stock.salt ?? 0) < 10);
});

test("dried food spoils slowly and is eaten when the food runs short", () => {
  const w = founded("dried-eat"), [n] = w.nations;
  n.stock.food = 1000; n.stock.dried_food = 100;
  step(w, { 0: { kind: "ok", response: { labor } } });
  assert.ok(Math.abs((n.stock.dried_food ?? 0) - 100 * (1 - DRIED.spoil)) < 1e-6, `spoils ${DRIED.spoil * 100}%: ${n.stock.dried_food}`);
  n.stock.food = 0; n.stock.dried_food = 200; n.stock.flour = 0;
  const pop = n.population;
  step(w, { 0: { kind: "ok", response: { labor: { ...labor, gather: 0, craft: 0, research: 30 } } } });
  assert.ok((n.stock.dried_food ?? 0) < 200 * (1 - DRIED.spoil), "eaten in need");
  assert.ok(!n.lastEvents.some(e => /chết đói/.test(e)), "no one starves while it lasts");
  assert.ok(n.population >= pop - 30);
});
