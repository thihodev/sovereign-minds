// The open world (§5.6 eras, §5.3 era effects, §2.1 deep resources) and the court (§4.6). No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canSeeRes, createWorld, housingSlots, maxOfficials, mods, nextEraNeeds, ownedTiles, step, type NationSpec } from "../src/engine.ts";
import { costFor, migrate, parseEffects } from "../src/catalog.ts";
import { col, row } from "../src/hex.ts";
import { ERA_TABLE, OFFICIALS } from "../src/rules.ts";
import { generateWorld } from "../src/worldgen.ts";
import type { AIResponse, Nation, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "NuocA", capital: "DoA", people: "DanA", flag: { layout: "h2", colors: ["#c0392b", "#ffffff"], symbol: "sun" } }] } } });
  const n = w.nations[0]; n.stock.food = 500; n.population = 130;
  return w;
}
function turn(w: World, r: AIResponse = {}) {
  const inputs: Record<number, TurnInput> = { 0: { kind: "ok", response: r } };
  const out = step(w, inputs);
  assert.deepEqual(out.audit, [], "ledger audit");
  return out;
}
/** Give a nation capabilities through a ready-made open invention. */
function grant(w: World, n: Nation, caps: string[]) {
  const id = `X${w.custom.next++}`;
  w.custom.inventions[id] = { id, name: `Test ${id}`, prereqs: ["fire"], rp: 10, caps, effects: {}, desc: "", custom: { by: n.id, tick: 0, depth: 1, power: 3, description: "", judge: "test" } };
  n.inventions.push(id);
}

test("eras: gates open with capabilities, people and resource; each era brings perks", () => {
  const w = founded("eras");
  const n = w.nations[0];
  const tiles0 = mods(w, n).tiles, slots0 = housingSlots(n, w), cap0 = mods(w, n).roleCap;
  grant(w, n, ["mài", "trồng-trọt", "nhiệt-cao", "nhận-biết-khoáng", "chứa", "luyện-đồng", "luyện-sắt"]);
  ownedTiles(w, n.id)[1].cap.copper = 50; ownedTiles(w, n.id)[2].cap.iron = 50;
  assert.equal(nextEraNeeds(w, n)?.era, "Đồ Đá Mới");
  turn(w);
  assert.equal(n.era, "Đồ Sắt", "three gates in one turn when all are met");
  assert.equal(n.eraTick, w.tick - 1);
  assert.equal(mods(w, n).tiles, tiles0 + 6, "+2 tiles to govern an era");
  assert.equal(mods(w, n).roleCap, cap0 + 1.5, "+50 points of ceiling an era");
  assert.equal(housingSlots(n, w), slots0 + 1, "+1 housing building per centre every 2 eras");
  // Cổ Đại also needs a settlement
  grant(w, n, ["chữ-viết", "tiền-tệ", "luật-pháp"]); n.population = 160;
  turn(w);
  assert.equal(n.era, "Đồ Sắt");
  assert.ok(nextEraNeeds(w, n)!.missing.some(m => /điểm định cư/.test(m)));
});

test("effect kinds open with the eras; deep inventions stay reachable", () => {
  const w = founded("effects");
  const range = [{ kind: "range", tiles: 1 }];
  assert.match(parseEffects(w, range, () => true, 0).errors[0], /Cổ Đại/);
  assert.deepEqual(parseEffects(w, range, () => true, ERA_TABLE.findIndex(e => e.id === "classical")).errors, []);
  assert.match(parseEffects(w, [{ kind: "move", terrain: "ocean" }], () => true, 4).errors[0], /Cận Đại/);
  assert.equal(parseEffects(w, [{ kind: "housing_slots", amount: 1 }], () => true, 5).effects.housingSlots, 1);
  // the cost curve: unchanged to depth 8, then linear
  assert.equal(costFor(8, 4), Math.ceil(15 * Math.pow(1.4, 8) * 1.4 / 5) * 5);
  assert.ok(costFor(30, 10) < 15 * Math.pow(1.4, 30), "no longer exponential");
  assert.ok(costFor(30, 10) > costFor(20, 10));
});

test("coal, oil and sulfur are hidden until revealed; old worlds get them too", () => {
  const g = generateWorld("deep", 6);
  for (const k of ["coal", "oil", "sulfur", "horse"] as const) assert.ok(g.tiles.some(t => (t.cap[k] || 0) > 0), `${k} somewhere`);
  const w = founded("deep");
  const n = w.nations[0];
  assert.equal(canSeeRes(w, n, "coal"), false);
  assert.equal(canSeeRes(w, n, "horse"), true);
  // a world saved before v0.5: no deep resources, no court
  for (const t of w.tiles) { delete t.cap.coal; delete t.res.coal; delete t.cap.oil; delete t.res.oil; delete t.cap.sulfur; delete t.res.sulfur; delete t.cap.horse; delete t.res.horse; }
  delete n.officials;
  migrate(w);
  assert.ok(w.tiles.some(t => (t.cap.coal || 0) > 0));
  assert.deepEqual(n.officials, []);
});

test("the court: appoint, the work they do on their own, slots, rewards, dismissal", () => {
  const w = founded("court");
  const n = w.nations[0];
  n.population = 130; n.research = null;
  const slots = maxOfficials(w, n);
  assert.equal(slots, 1 + Math.floor(130 / OFFICIALS.perPop));
  turn(w, { actions: [{ type: "appoint_official", domain: "scholar", name: "Lão Tri" }, { type: "appoint_official", domain: "governor", seat: [col(n.capital), row(n.capital)] }] });
  assert.equal(n.officials!.length, 2, JSON.stringify(n.lastRejected));
  turn(w, { actions: [{ type: "appoint_official", domain: "scholar" }] });
  assert.match(n.lastRejected.at(-1)!.reason, /Đã có|Đã đủ/);
  const tiles = ownedTiles(w, n.id).length;
  turn(w);
  const sch = n.officials!.find(o => o.domain === "scholar")!, gov = n.officials!.find(o => o.domain === "governor")!;
  assert.ok(n.research, "the scholar picks a research");
  assert.match(sch.lastAct, /nghiên cứu/);
  assert.ok(ownedTiles(w, n.id).length > tiles, `the governor claims land: ${gov.lastAct}`);
  assert.ok(mods(w, n).rp >= 0.05, "the scholar's bonus");
  // a gift buys loyalty
  gov.loyalty = 40;
  turn(w, { actions: [{ type: "reward_official", official: gov.id, goods: { food: 20 } }] });
  assert.ok(gov.loyalty >= 49);
  // an official with no loyalty left deserts
  sch.loyalty = 0; const stab = n.stability;
  n.stability = 30; // too low for loyalty to recover this turn
  turn(w);
  assert.ok(!n.officials!.includes(sch), "the scholar left");
  assert.ok(n.stability < 30 + 3 && stab >= 0);
  turn(w, { actions: [{ type: "dismiss_official", official: gov.id }] });
  assert.equal(n.officials!.length, 0);
});
