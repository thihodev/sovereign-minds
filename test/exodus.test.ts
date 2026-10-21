// People who leave (§4.8) and a nation's record of its own turns (§8.2). No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { exodusOf } from "../src/exodus.ts";
import { buildObservation } from "../src/ai/prompt.ts";
import { EXODUS } from "../src/rules.ts";
import type { TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function two(seed: string): World {
  const w = createWorld(seed, bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "NuocA", capital: "DoA", people: "DanA", flag: flag("#c0392b") }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "NuocB", capital: "DoB", people: "DanB", flag: flag("#3355ff") }] } } });
  for (const n of w.nations) { n.stock.food = 500; n.population = 80; n.met = w.nations.filter(o => o !== n).map(o => o.id); }
  return w;
}
const turn = (w: World, acts: Record<number, Record<string, unknown>[]> = {}) => {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) inputs[n.id] = { kind: "ok", response: { actions: acts[n.id] ?? [{ type: "research", invention: "P2" }] } as never };
  const out = step(w, inputs); assert.deepEqual(out.audit, []); return out;
};

test("people who leave are counted, where to and why; past the alarm the rulers pay", () => {
  const w = two("exodus");
  const [a, b] = w.nations;
  b.stability = 90;
  for (let k = 0; k < 3; k++) { a.stability = 5; turn(w); } // unrest drives families away
  const ex = exodusOf(a, w.tick);
  assert.ok(ex.recent > 0, "some left");
  assert.ok((ex.why.unrest ?? 0) > 0);
  assert.ok(ex.to[b.id] > 0, "to the calmer neighbour");
  if (ex.share > EXODUS.alarm) assert.ok(a.lastEvents.some(e => /bỏ xứ ra đi/.test(e)), "the alarm is told");
  const obs = buildObservation(w, a) as { people_leaving?: { last_10_turns: number } };
  assert.equal(obs.people_leaving?.last_10_turns, ex.recent);
});

test("a nation sees its last turns: its orders, what came of them, its people", () => {
  const w = two("recent");
  const a = w.nations[0];
  turn(w, { 0: [{ type: "research", invention: "P2" }, { type: "claim_tile", tile: [0, 0] }] });
  turn(w);
  const obs = buildObservation(w, a) as { recent_turns: Array<{ orders: string[]; happened: string[] }> };
  assert.equal(obs.recent_turns.length, 2);
  assert.ok(obs.recent_turns[0].orders.some(o => /^research P2 ✓/.test(o)), JSON.stringify(obs.recent_turns[0].orders));
  assert.ok(obs.recent_turns[0].orders.some(o => /^claim_tile .*✗/.test(o)), "a refused order and why");
  assert.match(obs.recent_turns[0].happened[0], /Dân số/);
});
