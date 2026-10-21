// Faith (§4.10): missions at home and abroad, and festivals. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { NEIGHBORS } from "../src/hex.ts";
import { blessing, priestsAway } from "../src/faith.ts";
import { exodusOf } from "../src/exodus.ts";
import { FESTIVAL, MISSION } from "../src/rules.ts";
import { buildObservation } from "../src/ai/prompt.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function founded(seed: string, k = 2): World {
  const w = createWorld(seed, bots(k));
  const acts: Record<number, TurnInput> = {};
  for (const n of w.nations) acts[n.id] = { kind: "ok", response: { actions: [{ type: "found_nation", name: `Dao${n.id}x`, capital: `Do${n.id}x`, people: `Dan${n.id}x`, flag: flag(["#c0392b", "#3355ff"][n.id]) }] } };
  step(w, acts);
  for (const n of w.nations) { n.stock.food = 600; n.population = 60; n.stability = 50; n.inventions.push("P5"); }
  return w;
}
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? { actions: [{ type: "research", invention: "P2" }] } };
  const out = step(w, inputs);
  assert.deepEqual(out.audit, [], "ledger audit");
  return out;
}

test("a mission at home calms the people, blesses the families and keeps its priests from work", () => {
  const w = founded("faith-home", 1), n = w.nations[0];
  n.discontent = 60;
  turn(w, { 0: { actions: [{ type: "mission", where: "home", priests: 3 }] } });
  assert.deepEqual(n.lastRejected, []);
  assert.equal(priestsAway(n, w.tick - 1), 3);
  assert.equal(blessing(n, w.tick - 1), MISSION.births);
  assert.ok((n.discontent ?? 0) <= 60 - MISSION.calm, `discontent ${n.discontent}`);
  // a second one at home is refused; and without the rites there is none
  turn(w, { 0: { actions: [{ type: "mission", where: "home", priests: 2 }] } });
  assert.ok(n.lastRejected.some(r => /Đã có một đoàn/.test(r.reason)));
  const v = founded("faith-none", 1), m = v.nations[0];
  m.inventions = m.inventions.filter(x => x !== "P5");
  turn(v, { 0: { actions: [{ type: "mission", where: "home" }] } });
  assert.ok(m.lastRejected.some(r => /tín-ngưỡng/.test(r.reason)));
});

test("a mission abroad brings converts home; the hosts are told and may quarantine", () => {
  const w = founded("faith-abroad"), [a, b] = w.nations;
  a.met.push(b.id); b.met.push(a.id);
  // B's land moved next to A's
  for (const t of w.tiles) if (t.owner === b.id) t.owner = -1;
  const edge = w.tiles.filter(t => t.owner === -1 && t.land && t.terrain !== "mountain" && NEIGHBORS[t.i].some(j => w.tiles[j].owner === a.id));
  for (const t of edge) t.owner = b.id;
  b.capital = edge[0].i;
  b.stability = 20; // restless hosts listen
  turn(w, { 0: { actions: [{ type: "mission", where: b.name, priests: 4 }] } });
  assert.deepEqual(a.lastRejected, []);
  assert.ok(b.lastEvents.some(e => /Nhà truyền giáo của/.test(e)));
  const before = a.population;
  let converts = 0;
  for (let k = 0; k < MISSION.turns; k++) { b.stability = 20; turn(w); converts = a.missions![0].converts; }
  assert.ok(converts > 0, "some followed the faith");
  assert.ok((exodusOf(b, w.tick).why.faith ?? 0) > 0, "the hosts' exodus counts the converts");
  assert.ok(a.population > 0 && before > 0);
  assert.ok((buildObservation(w, b) as Record<string, any>).faith);
});

test("a festival: stability, less discontent, a season of weddings, once in a while", () => {
  const w = founded("feast", 1), n = w.nations[0];
  n.stability = 30; n.discontent = 40; n.stock.honey = 10;
  const food = n.stock.food!;
  turn(w, { 0: { actions: [{ type: "festival", luxury: "honey" }] } });
  assert.deepEqual(n.lastRejected, []);
  assert.ok(n.stock.food! < food - 60 * FESTIVAL.food + 1);
  assert.ok((n.discontent ?? 0) <= 40 - FESTIVAL.calm);
  assert.equal(blessing(n, w.tick - 1), FESTIVAL.births);
  turn(w, { 0: { actions: [{ type: "festival" }] } });
  assert.ok(n.lastRejected.some(r => /chỉ một lễ hội/.test(r.reason)));
});
