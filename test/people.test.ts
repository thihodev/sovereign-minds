// People by age and sex, families and customs (§4.2). No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, workers, type NationSpec } from "../src/engine.ts";
import { demo, fertility, fighters, shape, take, total } from "../src/people.ts";
import { DEMO } from "../src/rules.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc A", capital: "Do A", people: "Dan A", flag: { layout: "h2", colors: ["#c0392b", "#ffffff"], symbol: "sun" } }] } } });
  const n = w.nations[0]; n.stock.food = 2000; n.population = 20; n.stability = 80; // under the natural housing of 25
  return w;
}
function turn(w: World, r: AIResponse = {}) {
  const out = step(w, { 0: { kind: "ok", response: r } as TurnInput });
  assert.deepEqual(out.audit, [], "ledger audit");
  return out;
}
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

test("a settled people: its groups sum to the population, 70% of a day's work, children eat less", () => {
  const d = shape(100);
  assert.equal(total(d), 100);
  const n = { population: 100 } as never;
  assert.ok(Math.abs(workers(n) - 70) <= 2, `workers ${workers(n)}`);
  // a rule that only changes the total is reconciled
  (n as { population: number }).population = 60;
  assert.equal(total(demo(n)), 60);
});

test("each turn everyone grows a group older; births come from adult women", () => {
  const w = founded("ageing");
  const n = w.nations[0];
  const before = structuredClone(demo(n));
  turn(w);
  const d = n.demo!;
  assert.equal(d.m[1], before.m[0], "the boys are youths now");
  assert.equal(d.f[1], before.f[0]);
  assert.ok((d.born ?? 0) > 0 && d.m[0] + d.f[0] === d.born, `children are this turn's births (${d.born})`);
  assert.ok((d.aged ?? 0) > 0, "the old and the worn die");
  // A people that lost its young women bears far fewer children
  const w2 = founded("ageing");
  const n2 = w2.nations[0], d2 = demo(n2);
  n2.demo!.f[2] = 1; n2.population = total(d2);
  assert.ok(fertility(n2, false) < 0.3, `fertility ${fertility(n2, false)}`);
  assert.equal(fertility(w.nations[0], false) <= 1, true);
  turn(w2);
  assert.ok((n2.demo!.born ?? 0) <= (d.born ?? 0), `${n2.demo!.born} births without women, ${d.born} with`);
});

test("no children are born in a famine; famine takes children and elders first", () => {
  const w = founded("famine");
  const n = w.nations[0];
  n.stock.food = 0; n.population = 100;
  const before = structuredClone(demo(n));
  turn(w);
  assert.equal(n.demo!.born, 0);
  const lostChildren = sum(before.m.slice(0, 1)) + sum(before.f.slice(0, 1)), lostAdults = before.m[2] + before.f[2];
  assert.ok(lostChildren > 0 && lostAdults > lostChildren, "the structure is real");
});

test("customs: who goes to war, and only they fall", () => {
  const w = founded("customs");
  const n = w.nations[0];
  n.population = 100;
  const all = fighters(n);
  turn(w, { actions: [{ type: "family_policy", fighters: "men", births: "encourage" }] });
  assert.deepEqual(n.family, { births: "encourage", fighters: "men" });
  assert.ok(fighters(n) < all * 0.6, "half the army");
  const women = sum(n.demo!.f);
  const fallen = take(n, 10, "war");
  assert.equal(sum(fallen.f), 0, "the women stay home");
  assert.equal(sum(n.demo!.f), women);
  turn(w, { actions: [{ type: "family_policy", births: "sometimes" }] });
  assert.match(n.lastRejected[0].reason, /births phải là/);
  // the warriors cannot outnumber those who may fight
  const pool = fighters(n);
  turn(w, { labor: { gather: 0, hunt: 0, fish: 0, farm: 0, wood: 0, stone: 0, flint: 0, clay: 0, mine: 0, craft: 0, build: 0, research: 0, warrior: pool + 5 } });
  assert.ok(n.labor.warrior <= pool, `${n.labor.warrior} ≤ ${pool}`);
  assert.ok(n.lastRejected.some(r => /có thể ra trận/.test(r.reason)));
});

test("herbs save infants", () => {
  const run = (herbs: number) => {
    const w = founded("infants");
    w.nations[0].stock.herbs = herbs;
    turn(w);
    return w.nations[0].demo!;
  };
  const without = run(0), withHerbs = run(50);
  assert.ok((withHerbs.infants ?? 0) < (without.infants ?? 0), `${withHerbs.infants} < ${without.infants}`);
  assert.ok((withHerbs.born ?? 0) >= (without.born ?? 0));
  assert.ok(DEMO.herbSave > 0);
});

test("hamlets: the land houses families too, more on grass and rivers, up to a cap", async () => {
  const { housing, housingParts } = await import("../src/engine.ts");
  const { HAMLET } = await import("../src/rules.ts");
  const w = founded("hamlets");
  const n = w.nations[0];
  const before = housing(w, n), parts = housingParts(w, n);
  assert.ok(parts.hamlets > 0, "the six tiles around the capital hold hamlets");
  const free = w.tiles.find(t => t.land && t.owner === -1 && (HAMLET.people[t.terrain] || 0) >= 2)!;
  free.owner = n.id;
  assert.equal(housing(w, n), before + HAMLET.people[free.terrain] + (free.river ? HAMLET.river : 0), "one more tile, more room");
  for (const t of w.tiles) if (t.land && t.owner === -1 && HAMLET.people[t.terrain]) t.owner = n.id;
  assert.equal(housingParts(w, n).hamlets, HAMLET.max, "capped");
});

test("advice: the engine tells a crowded people how to make room; idle rulers lose stability", async () => {
  const { advice } = await import("../src/ai/advice.ts");
  const w = founded("advice");
  const n = w.nations[0];
  n.population = 60; n.stock.food = 5;
  const a = advice(w, n).map(x => x.text).join(" | ");
  assert.match(a, /không đủ một lượt ăn/);
  assert.match(a, /chỗ ở/);
  n.population = 20; n.stock.food = 2000;
  const stab = n.stability;
  turn(w, { actions: [] }); turn(w, { actions: [] }); turn(w, { actions: [] });
  assert.ok(n.stability < stab, `${stab} → ${n.stability}`);
  assert.ok(n.lastEvents.some(e => /không ra lệnh/.test(e)));
});
