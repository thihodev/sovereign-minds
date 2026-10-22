// §7.3b Airports: centres with open airports are joined by air; goods fly between nations' airports in one turn.
// No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { col, row } from "../src/hex.ts";
import { isolated, links } from "../src/connect.ts";
import { planRoute } from "../src/routes.ts";
import { AIR } from "../src/rules.ts";
import type { AIResponse, Nation, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function world(seed: string, k = 1): World {
  const w = createWorld(seed, bots(k));
  const acts: Record<number, TurnInput> = {};
  for (let i = 0; i < k; i++) acts[i] = { kind: "ok", response: { actions: [{ type: "found_nation", name: `Nuoc ${"ABCD"[i]}`, capital: `Do ${"ABCD"[i]}`, people: `Dan ${"ABCD"[i]}`, flag: flag(["#c0392b", "#3355ff"][i]) }] } };
  step(w, acts);
  for (const n of w.nations) { n.population = 150; n.stability = 80; n.stock.food = 2000; n.inventions.push("K23"); n.stock.oil = 50; n.stock.coin = 200; }
  return w;
}
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? { actions: [{ type: "research", invention: "P2" }] } };
  const out = step(w, inputs); assert.deepEqual(out.audit, [], "ledger audit"); return out;
}
const airport = (w: World, n: Nation, tile: number) => n.buildings.push({ id: w.nextBuildingId++, type: "airport", tile, progress: 25, done: true, hp: 100 });

test("an airport stands on a centre, is paid and fuelled each turn, and shuts without oil", () => {
  const w = world("air-build"), [n] = w.nations;
  n.stock.iron = 50; n.stock.stone = 50;
  const off = w.tiles.find(t => t.owner === n.id && t.i !== n.capital)!;
  turn(w, { 0: { actions: [{ type: "build", building: "airport", tile: [col(off.i), row(off.i)] }] } });
  assert.ok(n.lastRejected.some(r => /trung tâm/.test(r.reason)), JSON.stringify(n.lastRejected));
  turn(w, { 0: { actions: [{ type: "build", building: "airport" }] } });
  assert.equal(n.buildings.filter(b => b.type === "airport").length, 1);
  const b = n.buildings.find(x => x.type === "airport")!; b.done = true; b.progress = 25;
  const oil = n.stock.oil!;
  turn(w);
  assert.deepEqual(n.air!.open, [n.capital]);
  assert.equal(n.stock.oil, oil - AIR.fuel);
  assert.equal(n.treasury!.last!.out.air, AIR.upkeep);
  n.stock.oil = 0;
  turn(w);
  assert.deepEqual(n.air!.open, []); assert.equal(n.air!.shut, 1);
});

test("two centres with open airports are joined by air: a far settlement is no longer cut off", () => {
  const w = world("air-link"), [n] = w.nations;
  const far = w.tiles.filter(t => t.land && t.owner === -1 && t.terrain !== "mountain").sort((a, b) => Math.abs(col(b.i) - col(n.capital)) - Math.abs(col(a.i) - col(n.capital)))[0];
  far.owner = n.id; n.settlements.push({ tile: far.i, name: "Đảo Xa", tick: -100 });
  assert.equal(links(w, n).get(far.i), null, "cut off at first");
  airport(w, n, n.capital); airport(w, n, far.i);
  turn(w);
  assert.equal(links(w, n).get(far.i), "air");
  assert.ok(!isolated(w, n).includes(far.i));
});

test("goods fly between two nations' open airports in one turn, if the load fits", () => {
  const w = world("air-trade", 2), [a, b] = w.nations;
  const plain = planRoute(w, a, b, { wood: 20 });
  airport(w, a, a.capital); airport(w, b, b.capital);
  turn(w);
  const r = planRoute(w, a, b, { wood: 20 });
  assert.ok(typeof plain === "object" && plain.ticks > 1, "far apart by land");
  assert.ok(typeof r === "object");
  assert.equal(r.mode, "air"); assert.equal(r.ticks, 1); assert.deepEqual(r.tolls, []); assert.equal(r.porters, 0);
  const big = planRoute(w, a, b, { wood: AIR.load + 10 });
  assert.ok(typeof big !== "object" || big.mode !== "air", "too much for one plane");
});
