// Law decrees (§10.3): the Watcher changes a rule number; the engine applies it from the next turn. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { applyLaws, lawError, lawTable, lawsOf } from "../src/laws.ts";
import { systemPrompt } from "../src/ai/prompt.ts";
import { SETTLEMENT } from "../src/rules.ts";
import type { TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "NuocA", capital: "DoA", people: "DanA", flag: { layout: "h2", colors: ["#c0392b", "#ffffff"], symbol: "sun" } }] } } });
  return w;
}
const law = (w: World, key: string, value: number) => {
  const previous = lawsOf(w)[key];
  w.decrees.push({ id: w.decrees.length + 1, code: "SL", tick: w.tick, effectiveTick: w.tick + 1, kind: "law", text: "", fromPetition: null, law: { key, value, previous } });
};
const turn = (w: World, r: TurnInput = { kind: "ok", response: {} }) => { const out = step(w, { 0: r }); assert.deepEqual(out.audit, []); return out; };

test("a law decree takes effect from the next turn, for the engine and in the nations' rules", () => {
  const w = founded("laws");
  const n = w.nations[0];
  n.inventions.push("P4"); n.population = 45; n.stock.wood = 40; n.stock.food = 500;
  law(w, "settlement.minPopulation", 40);
  assert.equal(lawTable(w).find(l => l.key === "settlement.minPopulation")!.pending, 40, "pending until its turn");
  const far = w.tiles.find(t => t.land && t.terrain !== "mountain" && t.owner === -1 && Math.abs((t.i % 128) - (n.capital % 128)) === 7 && Math.floor(t.i / 128) === Math.floor(n.capital / 128))!;
  turn(w); // the decree's turn begins now: the nations are told before they answer
  assert.match(systemPrompt(w), /40\+ people/);
  assert.equal(SETTLEMENT.minPopulation, 40);
  n.population = 45;
  turn(w, { kind: "ok", response: { actions: [{ type: "found_settlement", tile: [far.i % 128, Math.floor(far.i / 128)], name: "Bến Mới" }] } });
  assert.ok(!n.lastRejected.some(r => /50 dân/.test(r.reason)), JSON.stringify(n.lastRejected));
  // another world without the decree is back to the default
  const other = founded("laws-2");
  applyLaws(other);
  assert.equal(SETTLEMENT.minPopulation, 50);
});

test("law values are checked", () => {
  assert.match(lawError("settlement.minPopulation", 5)!, /khoảng/);
  assert.match(lawError("nope", 1)!, /Không có/);
  assert.equal(lawError("growth.rate", 0.1), null);
});
