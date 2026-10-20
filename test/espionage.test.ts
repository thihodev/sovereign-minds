// Scenario tests for spy operations (§7.8) and renaming a nation (§2.2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, baseCost, buildingWorks, housing, inventionCost, spyDetectChance, type NationSpec } from "../src/engine.ts";
import { migrate } from "../src/catalog.ts";
import { rngFor } from "../src/rng.ts";
import { SPY_OPS } from "../src/rules.ts";
import { buildObservation } from "../src/ai/prompt.ts";
import type { AIResponse, Nation, Spy, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
const COLORS = ["#c0392b", "#3355ff", "#00e676"];

function founded(nations = 2, seed = "spy"): World {
  const w = createWorld(seed, bots(nations));
  const inputs: Record<number, TurnInput> = {};
  w.nations.forEach((n, k) => { inputs[n.id] = { kind: "ok", response: { actions: [{ type: "found_nation", name: `Nuoc${"ABC"[k]}`, capital: `Do${k}`, people: `Dan${k}`, flag: flag(COLORS[k]) }] } }; });
  step(w, inputs);
  for (const n of w.nations) { n.stock.food = 400; n.population = 40; }
  for (const a of w.nations) for (const b of w.nations) if (a !== b && !a.met.includes(b.id)) a.met.push(b.id);
  return w;
}
function turn(w: World, acts: Record<number, AIResponse> = {}): string[] {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? {} };
  const r = step(w, inputs);
  assert.deepEqual(r.audit, [], "ledger audit");
  return r.chronicle.map(c => c.text);
}
const act = (...actions: Array<Record<string, unknown>>): AIResponse => ({ actions });
/** Plant a spy directly (plant_spy itself is random). */
function addSpy(w: World, owner: Nation, target: Nation): Spy {
  const s: Spy = { id: w.nextSpyId++, owner: owner.id, target: target.id, since: w.tick, active: true, acted: "" };
  w.spies.push(s);
  return s;
}
const writing = (n: Nation) => n.inventions.push("P5", "P12"); // P12 Ký hiệu gives ghi-chép

test("spy operations need ghi-chép and an active spy in the target", () => {
  const w = founded();
  const [a, b] = w.nations;
  const ops = [{ type: "incite", target: b.name }, { type: "sabotage", target: b.name }, { type: "steal_tech", target: b.name, invention: "fire" }];
  addSpy(w, a, b);
  for (const op of ops) {
    turn(w, { 0: act(op) });
    assert.match(a.lastRejected[0].reason, /ghi-chép/, `${op.type} without writing`);
  }
  writing(a);
  w.spies = [];
  for (const op of ops) {
    turn(w, { 0: act(op) });
    assert.match(a.lastRejected[0].reason, /Không có gián điệp/, `${op.type} without a spy`);
  }
  // A caught spy no longer counts
  addSpy(w, a, b).active = false;
  turn(w, { 0: act(ops[0]) });
  assert.match(a.lastRejected[0].reason, /Không có gián điệp/);
});

test("incite: −5 stability, one operation per spy per tick, culprit hidden", () => {
  const w = founded();
  const [a, b] = w.nations;
  writing(a); a.inventions.push("P4"); // +1 AP: room for two operations
  const spy = addSpy(w, a, b);
  const idle = structuredClone(w);
  const lines = turn(w, { 0: act({ type: "incite", target: b.name }, { type: "incite", target: b.name }) });
  turn(idle);
  assert.equal(idle.nations[1].stability - b.stability, SPY_OPS.incite);
  assert.match(a.lastRejected[0].reason, /đã ra tay lượt này/);
  assert.ok(b.lastEvents.some(e => /kích động/.test(e)), "the victim notices the unrest");
  const line = lines.find(l => /bị kẻ lạ mặt kích động/.test(l));
  assert.ok(line && !line.includes(a.name), "the chronicle does not name the culprit");
  assert.equal(spy.acted, "", "the per-tick flag is cleared after the detection roll");
});

test("sabotage: unfinished work is lost, then a finished building stops for 3 ticks", () => {
  const w = founded();
  const [a, b] = w.nations;
  writing(a);
  b.buildings.push({ id: 900, type: "palisade", tile: b.capital, progress: 4, done: false, hp: 100 });
  b.buildings.push({ id: 901, type: "tent", tile: b.capital, progress: 4, done: true, hp: 100 });
  let spy = addSpy(w, a, b);
  turn(w, { 0: act({ type: "sabotage", target: b.name, building: "workshop" }) });
  assert.match(a.lastRejected[0].reason, /không có công trình/);
  if (!spy.active) spy = addSpy(w, a, b);
  turn(w, { 0: act({ type: "sabotage", target: b.name }) });
  assert.equal(b.buildings[0].progress, 0, "the palisade under construction loses its progress");
  if (!spy.active) spy = addSpy(w, a, b);
  const house = housing(w, b), tent = b.buildings[1];
  turn(w, { 0: act({ type: "sabotage", target: b.name }) });
  assert.equal(tent.disabledUntil, w.tick - 1 + SPY_OPS.disableTicks);
  assert.equal(housing(w, b), house - 10, "a disabled tent gives no housing");
  assert.ok(!buildingWorks(w, tent));
  turn(w);
  assert.ok(!buildingWorks(w, tent));
  turn(w);
  assert.ok(buildingWorks(w, tent), "works again after 3 ticks");
  assert.equal(housing(w, b), house);
});

test("steal_tech: 50% off, never stacked with other discounts", () => {
  const w = founded();
  const [a, b] = w.nations;
  writing(a); b.inventions.push("P3", "P9");
  let spy = addSpy(w, a, b);
  const p9 = baseCost(w, "P9");
  assert.equal(p9, 70, "P9 lists 40 RP; depth 2 costs × 1.75");
  assert.equal(inventionCost(w, a, "P9"), Math.ceil(p9 * 0.8), "diffusion: 20% off from a known nation");
  turn(w, { 0: act({ type: "steal_tech", target: b.name, invention: "P7" }) });
  assert.match(a.lastRejected[0].reason, /không có phát minh/);
  if (!spy.active) spy = addSpy(w, a, b);
  turn(w, { 0: act({ type: "steal_tech", target: b.name, invention: "fire" }) });
  assert.match(a.lastRejected[0].reason, /Đã có/);
  if (!spy.active) spy = addSpy(w, a, b);
  const lines = turn(w, { 0: act({ type: "steal_tech", target: b.name, invention: "Lưới và bẫy" }) }); // by name
  assert.deepEqual(a.stolenTech, ["P9"]);
  assert.equal(inventionCost(w, a, "P9"), Math.ceil(p9 * 0.5));
  assert.ok(!lines.some(l => /đánh cắp/.test(l) && l.includes(a.name)));
  w.treaties.push({ id: 99, type: "alliance", a: a.id, b: b.id, tribute: {}, cede: [], start: w.tick, end: null, active: true, brokenBy: null });
  assert.equal(inventionCost(w, a, "P9"), Math.ceil(p9 * 0.4), "the alliance's 60% wins; no stacking");
  const obs = buildObservation(w, a) as { stolen_tech?: Array<{ id: string }> };
  assert.equal(obs.stolen_tech?.[0].id, "P9");
});

test("acting doubles the detection chance; a caught saboteur is reported", () => {
  const w = founded(2, "spy-detect");
  const [a, b] = w.nations;
  writing(a);
  let spy = addSpy(w, a, b);
  assert.equal(spyDetectChance(w, { ...spy, acted: "x" }), 2 * spyDetectChance(w, spy));
  // Find a tick whose catch roll can land between the idle and the doubled chance
  let roll = 1;
  for (let k = 0; k < 100; k++) {
    roll = rngFor(w.seed, w.tick, "spycatch", spy.id)();
    if (roll >= 0.05 && roll < 0.8) break;
    turn(w);
    if (!spy.active) spy = addSpy(w, a, b);
  }
  const steps = Math.min(35, Math.max(0, Math.floor((roll - 0.05) / 0.01 + 1e-9)));
  b.population = 300; b.stock.food = 2000; b.labor.warrior = steps * 5;
  const chance = spyDetectChance(w, spy);
  assert.ok(chance <= roll && roll < 2 * chance, `roll ${roll} between ${chance} and ${2 * chance}`);
  const idle = structuredClone(w);
  turn(idle);
  assert.ok(idle.spies.find(s => s.id === spy.id)!.active, "an idle spy stays hidden");
  turn(w, { 0: act({ type: "incite", target: b.name }) });
  assert.equal(spy.active, false, "the same roll catches a spy that acted");
  assert.ok(b.lastEvents.some(e => /gián điệp.*Kẻ đó đã kích động dân chúng/.test(e)), "the victim learns what the spy did");
});

test("rename_nation: only in the window after a new era, once, with founding rules", () => {
  const w = founded(2, "rename");
  const [a, b] = w.nations;
  turn(w, { 0: act({ type: "rename_nation", name: "Tân Quốc" }) });
  assert.match(a.lastRejected[0].reason, /kỷ nguyên mới/);
  // Enter the Neolithic: mài + thuần-dưỡng + 50 people
  a.inventions.push("P1", "P10", "P3", "P6", "P15"); a.population = 60; a.stock.food = 1500;
  turn(w);
  assert.equal(a.era, "Đồ Đá Mới");
  assert.equal(a.eraTick, w.tick - 1);
  turn(w, { 0: act({ type: "rename_nation", name: b.name.toUpperCase() }) });
  assert.match(a.lastRejected[0].reason, /đã có quốc gia khác dùng/);
  turn(w, { 0: act({ type: "rename_nation", name: "Llama Land" }) });
  assert.match(a.lastRejected[0].reason, /tên model/);
  turn(w, { 0: act({ type: "rename_nation", flag: flag("#3456fe") }) });
  assert.match(a.lastRejected[0].reason, /quá giống màu cờ/);
  const old = a.name, idle = structuredClone(w);
  turn(idle);
  const lines = turn(w, { 0: act({ type: "rename_nation", name: "Tân Quốc", flag: { layout: "v3", colors: ["#e67e22", "#000000"], symbol: "wolf" } }) });
  assert.equal(a.name, "Tân Quốc");
  assert.equal(a.flag.colors[0], "#e67e22");
  assert.deepEqual(a.formerNames, [old]);
  assert.equal(idle.nations[0].stability - a.stability, 10, "renaming costs 10 stability");
  assert.ok(lines.some(l => l.includes(old) && l.includes("Tân Quốc")));
  const obs = buildObservation(w, a) as { nation: { former_names?: string[]; rename_until?: number } };
  assert.deepEqual(obs.nation.former_names, [old]);
  assert.equal(obs.nation.rename_until, undefined, "the window is used up");
  turn(w, { 0: act({ type: "rename_nation", name: "Quốc Khác" }) });
  assert.match(a.lastRejected[0].reason, /một lần/);
  // Another nation whose era changed too long ago
  b.eraTick = w.tick - 6;
  turn(w, { 1: act({ type: "rename_nation", name: "Quốc Muộn" }) });
  assert.match(b.lastRejected[0].reason, /kỷ nguyên mới/);
});

test("migrate gives old saves the new fields", () => {
  const w = founded(2, "migrate");
  const s = addSpy(w, w.nations[0], w.nations[1]) as Partial<Spy>;
  delete s.acted;
  for (const n of w.nations as Array<Partial<Nation>>) { delete n.eraTick; delete n.renameTick; delete n.formerNames; delete n.stolenTech; }
  migrate(w);
  assert.equal(w.spies[0].acted, "");
  for (const n of w.nations) assert.deepEqual([n.eraTick, n.renameTick, n.formerNames, n.stolenTech], [null, null, [], []]);
  turn(w);
});
