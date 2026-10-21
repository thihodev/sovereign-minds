// The orders of society (§4.15): moods follow what each order wants; the bitter strike; a grant wins them back. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, mods, step, type NationSpec } from "../src/engine.ts";
import { CLASSES } from "../src/rules.ts";
import { moodOf, orderWants } from "../src/classes.ts";
import { treasuryOf } from "../src/treasury.ts";
import { buildObservation } from "../src/ai/prompt.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Văn Lang", capital: "Phong Châu", people: "người Lạc", flag: flag("#c0392b") }] } } });
  const n = w.nations[0];
  n.stock.food = 2000; n.population = 80; n.stability = 70;
  return w;
}
const work = { gather: 10, hunt: 0, fish: 0, farm: 0, wood: 5, stone: 0, flint: 0, clay: 0, mine: 0, craft: 0, build: 0, research: 5, warrior: 2 };
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: { labor: work, ...(acts[n.id] ?? { actions: [{ type: "research", invention: "P2" }] }) } };
  const out = step(w, inputs); assert.deepEqual(out.audit, [], "ledger audit"); return out;
}

test("a heavy tax and hunger turn the farmers; bitter farmers strike and gather less", () => {
  const w = founded("orders"), [n] = w.nations;
  turn(w);
  assert.ok(buildObservation(w, n).classes!.some(c => c.class === "farmers" && c.size >= 10));
  turn(w, { 0: { actions: [{ type: "tax", rate: 0.4 }] } });
  n.stock.food = 1; // hunger
  const want = orderWants(w, n).farmers;
  assert.ok(want.target < CLASSES.strike && want.why.some(x => /thuế nặng/.test(x)) && want.why.some(x => /đói/.test(x)), JSON.stringify(want));
  n.classes!.farmers = CLASSES.strike + 1;
  const gather = mods(w, n).role.gather || 0;
  n.stock.food = 1; turn(w);
  assert.ok(moodOf(n, "farmers") < CLASSES.strike, `${moodOf(n, "farmers")}`);
  assert.ok(n.lastEvents.some(e => /đình công/.test(e)), JSON.stringify(n.lastEvents));
  assert.ok((mods(w, n).role.gather || 0) <= gather - CLASSES.strikeCut + 1e-9, "a strike cuts their work");
});

test("a grant from the treasury wins an order back", () => {
  const w = founded("orders-grant"), [n] = w.nations;
  turn(w);
  n.classes!.clergy = 10; n.stock.coin = 200;
  const coin = n.stock.coin;
  turn(w, { 0: { actions: [{ type: "grant", class: "clergy", coin: 60 }] } });
  assert.deepEqual(n.lastRejected, []);
  assert.ok(moodOf(n, "clergy") > 10 + 20, `${moodOf(n, "clergy")}`);
  assert.ok((treasuryOf(n).last!.out.grant ?? 0) > 0 && n.stock.coin! < coin);
  turn(w, { 0: { actions: [{ type: "grant", class: "kings", coin: 5 }] } });
  assert.ok(n.lastRejected.some(r => r.action === "grant"));
});
