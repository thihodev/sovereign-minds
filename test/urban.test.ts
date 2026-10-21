// Towns and cities (§2.13): a centre grows with its province; tiers pay coin and lift research; a focus doubles one field. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, mods, step, type NationSpec } from "../src/engine.ts";
import { URBAN } from "../src/rules.ts";
import { tierAt, urbanCoin } from "../src/urban.ts";
import { treasuryOf } from "../src/treasury.ts";
import { buildObservation } from "../src/ai/prompt.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Văn Lang", capital: "Phong Châu", people: "người Lạc", flag: flag("#c0392b") }] } } });
  const n = w.nations[0];
  n.stock.food = 2000; n.population = 120; n.stability = 70;
  return w;
}
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? { actions: [{ type: "research", invention: "P2" }] } };
  const out = step(w, inputs); assert.deepEqual(out.audit, [], "ledger audit"); return out;
}
const put = (w: World, type: string, k: number) => { const n = w.nations[0]; for (let i = 0; i < k; i++) n.buildings.push({ id: w.nextBuildingId++, type, tile: n.capital, progress: 99, done: true, hp: 100 }); };

test("a village with people, works and a way home grows into a town, then a city", () => {
  const w = founded("urban"), [n] = w.nations;
  turn(w);
  assert.equal(tierAt(n, n.capital), 0, "a bare capital is a village");
  put(w, "workshop", 3);
  n.population = 120; n.stock.food = 2000;
  turn(w);
  assert.equal(tierAt(n, n.capital), 1, JSON.stringify(n.urban));
  assert.ok(n.lastEvents.some(e => /thị trấn/.test(e)));
  assert.ok(buildObservation(w, n).towns!.some(t => t.tier === "Thị trấn" && /Thành phố cần/.test(t.next ?? "")));
  // a town pays and thinks
  const rp = mods(w, n).rp;
  turn(w);
  assert.ok((treasuryOf(n).last!.in.cities ?? 0) >= URBAN.town.gives.coin, JSON.stringify(treasuryOf(n).last));
  // a city: market, more works, the Bronze Age, more people
  put(w, "market", 1); put(w, "workshop", 2);
  n.era = "Đồ Đồng"; n.population = 220; n.stock.food = 3000;
  turn(w);
  assert.equal(tierAt(n, n.capital), 2, JSON.stringify(n.urban));
  assert.ok(mods(w, n).rp > rp);
});

test("city_focus doubles one field; only a town or city takes one", () => {
  const w = founded("urban-focus"), [n] = w.nations;
  turn(w, { 0: { actions: [{ type: "city_focus", centre: "Phong Châu", focus: "trade" }] } });
  assert.ok(n.lastRejected.some(r => /làng/.test(r.reason)), JSON.stringify(n.lastRejected));
  put(w, "workshop", 3); n.population = 120;
  turn(w);
  const plain = urbanCoin(n);
  n.population = 120;
  turn(w, { 0: { actions: [{ type: "city_focus", centre: "Phong Châu", focus: "trade" }] } });
  assert.deepEqual(n.lastRejected, []);
  assert.equal(urbanCoin(n), plain * URBAN.focus.trade.mult);
  n.population = 120; // a people beyond its roof dwindles; keep the town a town
  turn(w, { 0: { actions: [{ type: "city_focus", centre: "Phong Châu", focus: "faith" }] } });
  assert.equal(urbanCoin(n), plain, JSON.stringify({ u: n.urban, pop: n.population, food: n.stock.food }));
  assert.ok(mods(w, n).stabilityPerTick >= URBAN.focus.faith.town);
});
