// A split is a betrayal (§4.5): the old nation and the traitors are hostile until peace or vassalage. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { borderOf } from "../src/border.ts";
import { hostile, relation, sharedLanguage } from "../src/diplomacy.ts";
import { NEIGHBORS } from "../src/hex.ts";
import { KIN } from "../src/rules.ts";
import { buildObservation } from "../src/ai/prompt.ts";
import { advice } from "../src/ai/advice.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
/** A and B side by side; B split from A long ago (a world from before the rule). */
function split(seed: string): World {
  const w = createWorld(seed, bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "NuocGoc", capital: "DoGoc", people: "DanGoc", flag: flag("#c0392b") }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "NuocTach", capital: "DoTach", people: "DanTach", flag: flag("#3355ff") }] } } });
  const [a, b] = w.nations;
  for (const t of w.tiles) if (t.owner === b.id) t.owner = -1;
  const edge = w.tiles.filter(t => t.owner === -1 && t.land && t.terrain !== "mountain" && NEIGHBORS[t.i].some(j => w.tiles[j].owner === a.id));
  for (const t of edge) t.owner = b.id;
  b.capital = edge[0].i;
  for (const n of w.nations) { n.stock.food = 400; n.population = 60; n.stability = 80; n.met = []; }
  b.origin = { from: a.id, tick: 0, leader: "Kẻ Cầm Đầu" };
  // a pact signed before the rule
  w.treaties.push({ id: 77, type: "non_aggression", a: a.id, b: b.id, start: 0, end: null, active: true, tribute: {} } as never);
  return w;
}
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? { actions: [{ type: "research", invention: "P2" }] } };
  const out = step(w, inputs);
  assert.deepEqual(out.audit, [], "ledger audit");
  return out;
}

test("the old nation and the traitors: hostile, no trade, no old pacts, a tense border, one tongue", () => {
  const w = split("betray"), [a, b] = w.nations;
  turn(w); // the turn after the update: they know each other, the old pact falls
  a.stock.hide = 50;
  turn(w, { 0: { actions: [{ type: "trade_offer", to: b.name, give: { hide: 5 }, get: { food: 5 } }] } });
  assert.ok(a.met.includes(b.id) && b.met.includes(a.id), "they always know each other");
  assert.equal(w.treaties.find(t => t.id === 77)!.active, false, "the old pact falls");
  assert.equal(relation(w, a.id, b.id), "thù địch");
  assert.ok(hostile(w, a, b) && sharedLanguage(w, a, b));
  assert.ok(a.lastRejected.some(r => r.action === "trade_offer" && /kẻ phản bội/.test(r.reason)), JSON.stringify(a.lastRejected));
  assert.ok(borderOf(w, a.id, b.id).tension >= KIN.tensionFloor, `tension ${borderOf(w, a.id, b.id).tension}`);
  assert.equal(borderOf(w, a.id, b.id).market, 0, "no border market");
  // what each AI is told
  const oa = buildObservation(w, a) as Record<string, any>, ob = buildObservation(w, b) as Record<string, any>;
  assert.match(oa.known_nations.find((x: any) => x.id === b.id).split, /TRAITORS/);
  assert.match(ob.known_nations.find((x: any) => x.id === a.id).split, /traitors/);
  assert.ok(advice(w, b).some(x => /coi ta là kẻ phản bội/.test(x.text)));
});

test("a peace treaty ends the hostility: trade opens again", () => {
  const w = split("betray-peace"), [a, b] = w.nations;
  w.treaties.push({ id: 78, type: "peace", a: a.id, b: b.id, start: 0, end: null, active: true, tribute: {} } as never);
  turn(w);
  a.stock.hide = 50;
  turn(w, { 0: { actions: [{ type: "trade_offer", to: b.name, give: { hide: 5 }, get: { food: 5 } }] } });
  assert.equal(hostile(w, a, b), false);
  assert.equal(relation(w, a.id, b.id), "hòa bình");
  assert.ok(!a.lastRejected.some(r => r.action === "trade_offer"), JSON.stringify(a.lastRejected));
});
