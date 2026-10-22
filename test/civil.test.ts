// §4.5b Civil war: a people at the end of its patience may rise to kill its ruler and take the throne. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { civilChance, createWorld, renameOpen, step, type NationSpec } from "../src/engine.ts";
import { CIVIL, SCHISM } from "../src/rules.ts";
import { advice } from "../src/ai/advice.ts";
import { buildObservation } from "../src/ai/prompt.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc A", capital: "Do A", people: "Dan A", flag: { layout: "h2", colors: ["#c0392b", "#ffffff"], symbol: "sun" } }] } } });
  const n = w.nations[0]; n.stock.food = 3000; n.stock.wood = 100; n.population = 100; n.house = "Hùng";
  return w;
}
function turn(w: World, r: AIResponse = {}) {
  const out = step(w, { 0: { kind: "ok", response: r } as TurnInput });
  assert.deepEqual(out.audit, [], "ledger audit");
  return out;
}
/** Every faction at 100 rises for the throne in these tests. */
function rising<T>(f: () => T, rise = CIVIL.rise): T {
  const was = { ...CIVIL };
  Object.assign(CIVIL, { chance: 1, max: 1, rise });
  try { return f(); } finally { Object.assign(CIVIL, was); }
}
const army = (warrior: number) => ({ gather: 40, hunt: 0, fish: 0, farm: 0, wood: 0, stone: 0, flint: 0, clay: 0, mine: 0, craft: 0, build: 0, research: 0, warrior });

test("the chance to rise for the throne: higher with no land to go to and a weak court", () => {
  const n = { stability: 50 } as never;
  assert.equal(civilChance(n, 10), CIVIL.chance);
  assert.equal(civilChance(n, -1), CIVIL.chance + CIVIL.noLand);
  assert.equal(civilChance({ stability: 5 } as never, -1), CIVIL.max);
});

test("a strong crown crushes the rising; the leader dies and discontent falls", () => rising(() => {
  const w = founded("civil-crushed"), [n] = w.nations;
  n.discontent = 100; n.stability = 20;
  turn(w);
  const x = w.schisms!.at(-1)!;
  assert.equal(x.kind, "civil"); assert.equal(x.status, "fighting");
  assert.ok(n.lastEvents.some(e => /NỘI CHIẾN/.test(e)));
  const obs = buildObservation(w, n) as { nation: { throne?: Record<string, unknown> } };
  assert.ok(obs.nation.throne?.CIVIL_WAR, "the ruler sees the civil war");
  assert.ok(advice(w, n).some(a => a.level === 3 && /GIẾT BẠN/.test(a.text)));
  const pop = n.population;
  for (let k = 0; k < 4 && x.status === "fighting"; k++) { n.stability = 90; turn(w, { labor: army(60) }); }
  assert.equal(x.status, "crushed");
  assert.ok(n.population < pop, "lives are lost");
  assert.ok((n.discontent ?? 0) <= CIVIL.crushedDiscontent);
  assert.equal(n.house, "Hùng", "the house holds");
}, 0.05));

test("the rebels win: the ruler is killed; a new house, a new character, a new mind, a new name allowed", () => rising(() => {
  const w = founded("civil-won"), [n] = w.nations;
  n.discontent = 100; n.stability = 5; n.memory = "kế hoạch cũ của vua";
  const trait = n.trait;
  turn(w);
  const x = w.schisms!.at(-1)!;
  x.mind = true; x.controller = "ai"; x.provider = "claude"; x.model = "claude-sonnet-5-5"; x.effort = "low";
  for (let k = 0; k < 4 && x.status === "fighting"; k++) { n.stability = 5; turn(w, { labor: army(0) }); }
  assert.equal(x.status, "won");
  assert.equal(n.ruler, x.leader);
  assert.equal(n.house, x.leader.split(" ")[0]);
  assert.notEqual(n.trait, trait, "a new character");
  assert.equal(n.model, "claude-sonnet-5-5"); assert.equal(n.provider, "claude");
  assert.match(n.memory, new RegExp(x.leader)); assert.doesNotMatch(n.memory, /kế hoạch cũ/);
  assert.equal(n.discontent, 0); assert.ok(n.stability >= CIVIL.wonStability);
  assert.equal(n.dynasties?.length, 1);
  assert.ok(renameOpen(w, n), "the new house may rename the nation");
  turn(w, { actions: [{ type: "rename_nation", name: "Tân Quốc", manifesto: "Một triều mới vì dân." }] });
  assert.equal(n.name, "Tân Quốc"); assert.equal(n.manifesto, "Một triều mới vì dân.");
}, 5));

test("the ruler is warned long before: the throne in danger shows from discontent " + CIVIL.warn, () => {
  const w = founded("civil-warn"), [n] = w.nations;
  n.discontent = 80;
  const obs = buildObservation(w, n) as { nation: { throne?: { danger: string } } };
  assert.equal(obs.nation.throne?.danger, "HIGH");
  assert.ok(advice(w, n).some(a => /GIẾT BẠN/.test(a.text)));
  n.discontent = SCHISM.threshold;
  assert.equal((buildObservation(w, n) as { nation: { throne?: unknown } }).nation.throne, undefined);
});
