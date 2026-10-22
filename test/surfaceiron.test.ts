// §2.11 Surface iron (Việt Phú's idea #30, taken up in part): iron gravel on some hills, mined like any iron, regrowing
// slowly. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { SURFACE_IRON } from "../src/rules.ts";
import { seedSurfaceIron } from "../src/worldgen.ts";
import type { World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));

test("some hills with no iron of their own hold 2–6 iron on the surface; no other terrain does", () => {
  const w = createWorld("surface-iron", bots(1));
  const hills = w.tiles.filter(t => t.terrain === "hill"), surf = w.tiles.filter(t => t.surfaceIron);
  assert.ok(surf.length > 0 && surf.every(t => t.terrain === "hill"));
  assert.ok(surf.every(t => (t.res.iron ?? 0) >= SURFACE_IRON.min && (t.res.iron ?? 0) <= SURFACE_IRON.max && t.vein !== "iron"));
  const share = surf.length / hills.length;
  assert.ok(share > 0.03 && share < 0.2, `${share}`);
  // a hill that holds iron is never seeded again
  const before = new Map(surf.map(t => [t.i, t.res.iron]));
  seedSurfaceIron(w.seed, w.tiles);
  assert.ok(surf.every(t => t.res.iron === before.get(t.i)), "never twice on the same hill");
  assert.equal(w.riches, 6, "a new world is born with it (an old one gets it once, on load)");
});

test("surface iron is mined like any iron and regrows slowly", () => {
  const w: World = createWorld("surface-mine", bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Việt Phú", capital: "Phú Đô", people: "người Phú", flag: { layout: "h2", colors: ["#c0392b", "#ffffff"], symbol: "sun" } }] } } });
  const n = w.nations[0];
  n.population = 60; n.stock.food = 500; n.inventions.push("P1", "P10", "P12", "K2");
  for (const t of w.tiles) if (t.owner === n.id) { delete t.res.iron; delete t.cap.iron; delete t.surfaceIron; }
  const hill = w.tiles.find(t => t.owner === n.id && t.land && t.i !== n.capital)!;
  hill.terrain = "hill"; hill.res.iron = 6; hill.cap.iron = 6; hill.surfaceIron = true;
  const labor = { gather: 20, hunt: 0, fish: 0, farm: 0, wood: 0, stone: 0, flint: 0, clay: 0, mine: 4, craft: 0, build: 0, research: 0, warrior: 0 };
  step(w, { 0: { kind: "ok", response: { labor, mine_target: "iron" } } });
  assert.ok((n.stock.iron ?? 0) > 0, `iron mined: ${n.stock.iron}`);
  const left = hill.res.iron ?? 0;
  assert.ok(left < 6);
  step(w, { 0: { kind: "ok", response: { labor: { ...labor, mine: 0 } } } });
  assert.ok((hill.res.iron ?? 0) > left, "it regrows");
});
