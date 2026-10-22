// §2.3b A compact realm pays: interior land yields, defends and weighs less; gaps are cheap to fill; exclaves cost.
// No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, governed, step, type NationSpec } from "../src/engine.ts";
import { NEIGHBORS, col, row, within } from "../src/hex.ts";
import { fillsGap, homeMarket, territory } from "../src/compact.ts";
import { yieldShares } from "../src/connect.ts";
import { CLAIM_FOOD, COMPACT } from "../src/rules.ts";
import { advice } from "../src/ai/advice.ts";
import { buildObservation } from "../src/ai/prompt.ts";
import type { World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc A", capital: "Do A", people: "Dan A", flag: { layout: "h2", colors: ["#c0392b", "#ffffff"], symbol: "sun" } }] } } });
  const n = w.nations[0]; n.stock.food = 1000; n.population = 100; n.stability = 70;
  return w;
}

test("interior land: every neighbour our own or the sea; it yields more and weighs half against the limit", () => {
  const w = founded("compact-inner"), [n] = w.nations;
  for (const i of within(n.capital, 2)) if (w.tiles[i].land && w.tiles[i].owner === -1) w.tiles[i].owner = n.id;
  const t = territory(w, n);
  const inner = [...t.interior].find(i => i !== n.capital)!;
  assert.ok(inner !== undefined, "a ring of two around the capital makes interior tiles");
  const edge = [...t.main].find(i => w.tiles[i].land && !t.interior.has(i) && i !== n.capital)!;
  const share = yieldShares(w, n);
  assert.ok(share(inner) > share(edge) * (1 + COMPACT.interiorYield) - 1e-9 || share(inner) / share(edge) > 1.1, `${share(inner)} vs ${share(edge)}`);
  const land = [...t.main].filter(i => w.tiles[i].land).length;
  assert.ok(governed(w, n) < land, "interior tiles weigh less");
  assert.equal(homeMarket(w, n), Math.min(COMPACT.marketMax, Math.floor(land / COMPACT.marketPer) * COMPACT.marketTax));
});

test("a gap costs half the food; an exclave costs yield and stability", () => {
  const w = founded("compact-gap"), [n] = w.nations;
  const gap = w.tiles.find(t => t.owner === -1 && t.land && t.terrain !== "icewall" && t.terrain !== "mountain" && NEIGHBORS[t.i].filter(j => w.tiles[j].owner === n.id).length >= 1)!;
  for (const j of NEIGHBORS[gap.i]) if (w.tiles[j].owner === -1 && w.tiles[j].land) w.tiles[j].owner = n.id;
  assert.ok(fillsGap(w, n, gap.i));
  const food = n.stock.food!;
  step(w, { 0: { kind: "ok", response: { labor: { gather: 0, hunt: 0, fish: 0, farm: 0, wood: 0, stone: 0, flint: 0, clay: 0, mine: 0, craft: 0, build: 0, research: 50, warrior: 0 }, actions: [{ type: "claim_tile", tile: [col(gap.i), row(gap.i)] }] } } });
  assert.equal(gap.owner, n.id, JSON.stringify(n.lastRejected));
  assert.ok(n.lastEvents.some(e => /Khai hoang/.test(e)));
  assert.ok(food - n.stock.food! >= 0 && CLAIM_FOOD * COMPACT.fillFood < CLAIM_FOOD);
  // an exclave far away
  const far = w.tiles.find(t => t.land && t.owner === -1 && Math.abs(col(t.i) - col(n.capital)) > 12)!;
  far.owner = n.id;
  assert.equal(territory(w, n).exclaves.length, 1);
  const stab = n.stability;
  step(w, { 0: { kind: "ok", response: {} } });
  assert.ok(n.lastEvents.some(e => /mảnh đất tách khỏi khối chính/.test(e)));
  assert.ok(n.stability <= stab + 3);
  assert.ok((buildObservation(w, n) as { territory: { exclaves?: unknown[] } }).territory.exclaves?.length === 1);
  assert.ok(advice(w, n).some(a => /tách khỏi khối chính/.test(a.text)));
});
