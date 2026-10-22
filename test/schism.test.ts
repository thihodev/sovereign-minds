// Discontent and schism (§4.5): a badly governed people splits; the Watcher lets the faction go. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, ownedTiles, step, type NationSpec } from "../src/engine.ts";
import { PROSPERITY, SCHISM } from "../src/rules.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

// these tests follow factions that leave; a faction that rises for the throne (§4.5b) is test/civil.test.ts
import { CIVIL } from "../src/rules.ts";
Object.assign(CIVIL, { chance: 0, noLand: 0, weak: 0 });

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc A", capital: "Do A", people: "Dan A", flag: { layout: "h2", colors: ["#c0392b", "#ffffff"], symbol: "sun" } }] } } });
  const n = w.nations[0]; n.stock.food = 3000; n.stock.wood = 100; n.population = 100;
  return w;
}
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? {} };
  const out = step(w, inputs);
  assert.deepEqual(out.audit, [], "ledger audit");
  return out;
}

test("discontent grows under bad government and fades under good", () => {
  const w = founded("discontent");
  const n = w.nations[0];
  n.stability = 10; turn(w);
  assert.ok((n.discontent ?? 0) > 5, `rises: ${n.discontent}`);
  const high = n.discontent!;
  n.stability = 90; turn(w);
  assert.ok(n.discontent! < high, "fades");
});

test("a faction forms at 100, waits for the Watcher, and gives up if nobody answers", () => {
  const w = founded("faction");
  const n = w.nations[0];
  n.discontent = 100; n.stability = 20;
  turn(w);
  const x = w.schisms!.at(-1)!;
  assert.equal(x.status, "pending");
  assert.equal(x.from, n.id);
  assert.ok(x.people >= 20 && w.tiles[x.site].owner === -1, JSON.stringify(x));
  assert.ok(ownedTiles(w, n.id).every(t => Math.abs(t.i - x.site) > 0));
  assert.ok(n.lastEvents.some(e => /muốn bỏ đi lập quốc riêng/.test(e)));
  const stab = () => n.stability;
  for (let k = 0; k < SCHISM.waitTicks; k++) turn(w);
  assert.equal(x.status, "returned", "no answer, and no nation they know to go to: they go home");
  assert.ok(n.lastEvents.some(e => /quay về/.test(e)), String(stab()));
});

test("refused: they ask a nation they know to take them in; it accepts, or they go home", t => {
  const margin = PROSPERITY.margin; PROSPERITY.margin = Infinity; t.after(() => { PROSPERITY.margin = margin; }); // §4.7 envy of the rich host aside
  const w = createWorld("refuge", bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc A", capital: "Do A", people: "Dan A", flag: { layout: "h2", colors: ["#c0392b", "#ffffff"], symbol: "sun" } }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc Bình", capital: "Do Bình", people: "Dan Bình", flag: { layout: "h2", colors: ["#3355ff", "#ffffff"], symbol: "moon" } }] } } });
  const [a, b] = w.nations;
  a.stock.food = 3000; a.population = 100; b.stock.food = 3000; b.population = 10; b.stability = 80;
  a.met = [b.id]; b.met = [a.id];
  a.discontent = 100; a.stability = 20;
  turn(w);
  const x = w.schisms!.at(-1)!;
  x.status = "refused"; // the Watcher says no
  turn(w);
  assert.equal(x.status, "asking");
  assert.equal(x.to, b.id);
  assert.ok(b.lastEvents.some(e => /xin sang định cư/.test(e)));
  const popA = a.population, popB = b.population;
  turn(w, { [b.id]: { actions: [{ type: "accept_migrants", faction: x.id }] } });
  assert.equal(x.status, "emigrated", JSON.stringify(b.lastRejected));
  assert.ok(a.population < popA && b.population > popB, `${popA}→${a.population}, ${popB}→${b.population}`);
  assert.ok((a.discontent ?? 0) < 5, "the discontented are gone");
});

test("let go: a new nation with the faction's families, its share of the stores and all the knowledge", () => {
  const w = founded("secede");
  const n = w.nations[0];
  n.discontent = 100; n.stability = 20; n.inventions.push("P1", "P2");
  turn(w);
  const x = w.schisms!.at(-1)!;
  Object.assign(x, { status: "approved", controller: "bot", provider: "bot", model: "bot" });
  const pop = n.population, food = n.stock.food!, stab = n.stability;
  turn(w);
  assert.equal(x.status, "done");
  const c = w.nations[x.nation!];
  assert.ok(c && c.alive && !c.founded, "a new nation, to be founded on its first turn");
  assert.equal(c.origin?.from, n.id);
  assert.ok(c.population >= 10 && n.population < pop, `${c.population} left ${pop}`);
  assert.equal(c.population + n.population <= pop, true, "nobody appears from nothing");
  assert.ok((c.stock.food || 0) > 0 && (c.stock.food || 0) < food, "its share of the food");
  assert.deepEqual(c.inventions.filter(i => !n.inventions.includes(i)), [], "the same knowledge");
  assert.ok(c.inventions.includes("P1") && c.inventions.includes("P2"));
  assert.equal(w.tiles[c.capital].owner, c.id);
  assert.ok(c.met.includes(n.id) && n.met.includes(c.id), "they know each other");
  assert.ok(n.stability > stab, "the ones who stay are relieved");
  assert.equal(n.discontent, 0);
  // Its first turn: it founds its own nation
  turn(w, { [c.id]: { actions: [{ type: "found_nation", name: "Tân Quốc", capital: "Đô Mới", people: "người Tân", flag: { layout: "v3", colors: ["#7d3c98", "#ffffff"], symbol: "wolf" } }] } });
  assert.equal(c.founded, true, JSON.stringify(c.lastRejected));
  assert.equal(c.name, "Tân Quốc");
});
