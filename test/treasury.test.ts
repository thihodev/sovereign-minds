// The treasury (§4.13): taxes, duties and public works fill it; officials, materials, hands and scholars empty it. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, Ledger, step, type NationSpec } from "../src/engine.ts";
import { TREASURY } from "../src/rules.ts";
import { importDuty, treasuryOf } from "../src/treasury.ts";
import { buildObservation } from "../src/ai/prompt.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function founded(seed: string): World {
  const w = createWorld(seed, bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Văn Lang", capital: "Phong Châu", people: "người Lạc", flag: flag("#c0392b") }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Âu Việt", capital: "Cổ Loa", people: "người Âu", flag: flag("#3355ff") }] } } });
  for (const n of w.nations) { n.stock.food = 500; n.population = 100; n.stability = 70; }
  return w;
}
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? { actions: [{ type: "research", invention: "P2" }] } };
  const out = step(w, inputs); assert.deepEqual(out.audit, [], "ledger audit"); return out;
}

test("the treasury opens with a purse and fills with the production tax; a heavy tax costs stability", () => {
  const w = founded("treasury-tax"), [a, b] = w.nations;
  turn(w);
  assert.ok((a.stock.coin || 0) >= TREASURY.start, `${a.stock.coin}`);
  turn(w);
  assert.ok(treasuryOf(a).last!.in.tax > 0, JSON.stringify(treasuryOf(a).last));
  assert.ok(buildObservation(w, a).treasury!.coin > 0);
  // a heavy tax
  turn(w, { 0: { actions: [{ type: "tax", rate: 0.3 }] }, 1: { actions: [{ type: "tax", rate: 0.1 }] } });
  assert.deepEqual(a.lastRejected, []);
  a.stability = 70; b.stability = 70;
  turn(w);
  assert.ok(a.stability < b.stability, `${a.stability} vs ${b.stability}`);
  assert.equal(treasuryOf(a).tax, 0.3); assert.ok(treasuryOf(a).last!.in.tax > 0);
  turn(w, { 0: { actions: [{ type: "tax", rate: 0.9 }] } });
  assert.ok(a.lastRejected.some(r => r.action === "tax"));
});

test("the treasury buys the common materials a work lacks, and hires hands for it", () => {
  const w = founded("treasury-build"), [a] = w.nations;
  turn(w);
  a.inventions.push("P8", "P5"); a.stock.wood = 0; a.stock.hide = 4; a.stock.rope = 2; a.stock.coin = 100;
  turn(w, { 0: { actions: [{ type: "build", building: "tent" }] } });
  assert.deepEqual(a.lastRejected, []);
  const tent = a.buildings.find(b => b.type === "tent")!;
  assert.ok(tent, "built with bought wood");
  assert.ok(treasuryOf(a).last!.out.buy > 0);
  // hands for the work
  tent.progress = 0; tent.done = false; a.labor.build = 0;
  const before = a.stock.coin!;
  turn(w, { 0: { actions: [{ type: "invest", in: "building", building: tent.id, amount: 100 }] } });
  assert.deepEqual(a.lastRejected, []);
  assert.ok(tent.progress >= TREASURY.hireMin - 1e-9 || tent.done, `${tent.progress}`);
  assert.ok(a.stock.coin! < before);
  // locked materials are not for sale
  a.stock.stone = 0; a.stock.coin = 500;
  turn(w, { 0: { actions: [{ type: "build", building: "altar" }] } });
  assert.ok(a.buildings.some(b => b.type === "altar"), "stone is common: bought");
});

test("foreign goods pay the importer's duty in coin; none between allies", () => {
  const w = founded("treasury-duty"), [a, b] = w.nations;
  turn(w);
  a.stock.coin = 50; b.stock.coin = 0; treasuryOf(b).tariff = 0.5;
  const L = new Ledger(w);
  const paid = importDuty(w, L, a, b, { wood: 20 });
  assert.ok(paid > 0 && b.stock.coin === paid && a.stock.coin === 50 - paid, `${paid}`);
  assert.equal(treasuryOf(b).now.in.tariff, paid);
  w.treaties.push({ id: 9, type: "alliance", a: a.id, b: b.id, start: w.tick, end: null, active: true, tribute: {}, cede: [] } as never);
  assert.equal(importDuty(w, L, a, b, { wood: 20 }), 0);
  assert.deepEqual(L.audit(w), []);
});

test("a market earns coin each turn; a hoard leaks", () => {
  const w = founded("treasury-market"), [a, b] = w.nations;
  turn(w);
  a.buildings.push({ id: w.nextBuildingId++, type: "market", tile: a.capital, progress: 6, done: true, hp: 100 });
  turn(w);
  assert.ok(treasuryOf(a).last!.in.works >= 2 + a.population * TREASURY.marketPerPerson - 1, JSON.stringify(treasuryOf(a).last));
  b.stock.coin = 1000;
  turn(w);
  assert.ok(treasuryOf(b).last!.out.leak > 0);
  // officials are paid in coin first
  assert.ok(!treasuryOf(b).last!.out.officials || (b.officials ?? []).length > 0);
});
