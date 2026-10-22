// §6.5 Village granaries (Văn Phong's idea): spare food set aside unspoiled, opened before anyone starves. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { GRANARY } from "../src/rules.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Văn Phong", capital: "Phong Châu", people: "người Phong", flag: flag("#c0392b") }] } } });
  const n = w.nations[0]; n.population = 60; n.stability = 70; n.inventions.push("stone_tools");
  return w;
}
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? { actions: [{ type: "research", invention: "P2" }] } };
  const out = step(w, inputs); assert.deepEqual(out.audit, [], "ledger audit"); return out;
}

test("a granary goes on a centre, one each; it sets spare food aside and opens it in famine", () => {
  const w = founded("granary"), [n] = w.nations;
  n.stock.wood = 50; n.stock.stone = 50; n.stock.food = 800;
  const off = n.capital + 3;
  turn(w, { 0: { actions: [{ type: "build", building: "granary", tile: [off % 128, Math.floor(off / 128)] }] } });
  assert.ok(n.lastRejected.some(r => /trung tâm|lãnh thổ/.test(r.reason)), JSON.stringify(n.lastRejected));
  turn(w, { 0: { actions: [{ type: "build", building: "granary" }, { type: "build", building: "granary" }] } });
  assert.equal(n.buildings.filter(b => b.type === "granary").length, 1, "one on the capital");
  assert.ok(n.lastRejected.some(r => /đã có Kho làng/.test(r.reason)));
  const g = n.buildings.find(b => b.type === "granary")!; g.done = true; g.progress = 5;
  n.stock.food = 800;
  turn(w);
  const kept = n.stock.food_reserve || 0;
  assert.ok(kept > 0 && kept <= 100, `${kept}`);
  // it fills up to its room and no further
  for (let k = 0; k < 15; k++) { n.stock.food = 2000; turn(w); }
  assert.ok((n.stock.food_reserve || 0) <= 100 + 1e-6 && (n.stock.food_reserve || 0) > 90, `${n.stock.food_reserve}`);
  // famine: the granary feeds the people before anyone starves
  n.stock.food = 0; n.population = 60;
  const before = n.population;
  turn(w);
  assert.ok((n.stock.food_reserve || 0) < 100, "the reserve was opened");
  assert.ok(n.lastEvents.some(e => /Kho làng mở cứu đói/.test(e)), JSON.stringify(n.lastEvents));
  assert.ok(!n.lastEvents.some(e => /chết đói/.test(e)) || n.population >= before - 2, "no one (or almost no one) starved");
  assert.ok(GRANARY.share > 0);
});

test("a grinding stone (Sơn Thạch Quốc's idea): on a centre, one each; spare food becomes flour that keeps, and is eaten in need", async () => {
  const { FLOUR, SPOILAGE } = await import("../src/rules.ts");
  const w = founded("grinder"), [n] = w.nations;
  n.inventions.push("P10"); n.stock.stone = 50; n.stock.wood = 50; n.stock.food = 800;
  turn(w, { 0: { actions: [{ type: "build", building: "grinder" }, { type: "build", building: "grinder" }] } });
  assert.equal(n.buildings.filter(b => b.type === "grinder").length, 1, "one on the capital");
  assert.ok(n.lastRejected.some(r => /đã có Cối đá/.test(r.reason)));
  const g = n.buildings.find(b => b.type === "grinder")!; g.done = true; g.progress = 6;
  n.stock.food = 800; n.stock.flour = 0;
  turn(w);
  assert.ok((n.stock.flour || 0) >= FLOUR.flour * (1 - FLOUR.spoil) - 1e-9, `flour ${n.stock.flour}`);
  // with too little food in store, the stone stands idle
  n.stock.food = 1; const flour = n.stock.flour || 0;
  turn(w);
  assert.ok((n.stock.flour || 0) <= flour, "no grinding when the store is thin");
  // flour keeps better than food, and the people eat it when the food runs out
  assert.ok(FLOUR.spoil < SPOILAGE.food);
  n.stock.food = 0; n.stock.flour = 500; n.population = 60;
  turn(w);
  assert.ok((n.stock.flour || 0) < 500, "flour eaten");
  assert.ok(!n.lastEvents.some(e => /chết đói/.test(e)), JSON.stringify(n.lastEvents));
});
