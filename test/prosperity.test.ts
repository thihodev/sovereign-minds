// Prosperity and national pride (§4.7): how well a people lives, and how it feels against the nations it knows. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { estimateProsperity, measure, prosperityPhase, scoreOf } from "../src/prosperity.ts";
import { demo, mouths } from "../src/people.ts";
import { ranking } from "../src/ranking.ts";
import { NEIGHBORS } from "../src/hex.ts";
import { PROSPERITY } from "../src/rules.ts";
import { LAW_BY_KEY } from "../src/laws.ts";
import { buildObservation, systemPrompt } from "../src/ai/prompt.ts";
import { advice } from "../src/ai/advice.ts";
import type { Nation, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
/** Two founded nations; B's land is moved right next to A's. */
function touching(seed: string): World {
  const w = createWorld(seed, bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc A", capital: "Do A", people: "Dan A", flag: flag("#c0392b") }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc Bình", capital: "Do Bình", people: "Dan Bình", flag: flag("#3355ff") }] } } });
  const [a, b] = w.nations;
  for (const t of w.tiles) if (t.owner === b.id) t.owner = -1;
  const edge = w.tiles.filter(t => t.owner === -1 && t.land && t.terrain !== "mountain" && NEIGHBORS[t.i].some(j => w.tiles[j].owner === a.id));
  for (const t of edge) t.owner = b.id;
  b.capital = edge[0].i;
  for (const n of w.nations) { n.stability = 60; n.met = [w.nations[1 - n.id].id]; }
  return w;
}
const RICH = { food: 3000, hide_coat: 200, pottery: 200, cloth: 200, rope: 200, bow: 200, spear: 200, salt: 200 };
/** A people with a little food and no goods, crowded. */
function poor(n: Nation, pop = 60): void { n.population = pop; n.stock = { food: Math.ceil(mouths(n) * 1.1) }; }
function rich(n: Nation, pop = 20): void { n.population = pop; n.stock = { ...RICH }; }
function turn(w: World) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: { actions: [{ type: "research", invention: "P2" }] } };
  const out = step(w, inputs);
  assert.deepEqual(out.audit, [], "ledger audit");
  return out;
}

test("the score follows the people's food and goods; many kinds of goods count, one heap does not", () => {
  const w = touching("prosp-score");
  const a = w.nations[0];
  a.population = 40; a.stock = { food: 0 };
  const bare = measure(w, a, 0);
  assert.equal(bare.food, 0); assert.equal(bare.goods, 0);
  assert.equal(bare.health, 25, "no woe, full health");
  a.stock.food = mouths(a) * PROSPERITY.foodTurns; // two turns of eating
  assert.equal(measure(w, a, 0).food, 25);
  a.stock.food = mouths(a) * PROSPERITY.foodTurns / 2;
  assert.equal(measure(w, a, 0).food, 12.5);
  // one heap of bone: one kind, capped at goodCap a person
  a.stock.bone = 100000;
  const heap = measure(w, a, 0).goods;
  assert.equal(heap, Math.round(25 * PROSPERITY.goodCap / PROSPERITY.goodsPerHead * 10) / 10);
  Object.assign(a.stock, { hide_coat: 200, pottery: 200, cloth: 200, rope: 200, bow: 200, spear: 200 });
  assert.equal(measure(w, a, 0).goods, 25, "many kinds of goods: full");
  // woe from famine and war lowers health
  assert.ok(measure(w, a, 0.5).health < measure(w, a, 0).health);
  assert.ok(scoreOf(measure(w, a, 0)) > scoreOf(bare));
});

test("a richer people acclaims its rulers: stability up, discontent down, against the nations it knows", () => {
  const w = touching("prosp-acclaim");
  const [a, b] = w.nations;
  rich(a); poor(b);
  a.stability = 50; a.discontent = 20; b.discontent = 0;
  const said: string[] = [];
  prosperityPhase(w, (_n, kind, text) => { if (kind === "pride") said.push(text); });
  assert.equal(a.prosperity!.mood, "acclaim");
  assert.equal(a.stability, 50 + PROSPERITY.acclaimStability);
  assert.equal(a.discontent, 20 - PROSPERITY.acclaimCalm);
  assert.equal(b.prosperity!.mood, "envy");
  assert.ok(b.discontent! > 0, "the poorer people grumbles");
  assert.ok(said.some(t => /tung hô/.test(t)) && said.some(t => /ganh tị/.test(t)), said.join(" | "));
  // a people that knows nobody has nothing to compare: no mood
  const lone = touching("prosp-lone");
  rich(lone.nations[0]); poor(lone.nations[1]);
  lone.nations[0].met = []; lone.nations[0].stability = 50;
  prosperityPhase(lone, () => {});
  assert.equal(lone.nations[0].prosperity!.mood, null);
  assert.equal(lone.nations[0].stability, 50);
  // through the real turn too, with the ledger whole
  const w2 = touching("prosp-acclaim-step");
  rich(w2.nations[0]); poor(w2.nations[1]);
  turn(w2);
  assert.equal(w2.nations[0].prosperity!.mood, "acclaim");
  assert.ok(ranking(w2).find(r => r.nation === 0)!.parts.prosperity > 0, "it counts in the world ranking");
});

test("envy sends families to the richer neighbour, through the people's book; the ledger stays whole", () => {
  const w = touching("prosp-envy");
  const [a, b] = w.nations;
  let gone = 0, came = 0;
  for (let k = 0; k < 25; k++) {
    poor(a, 60); rich(b, 20); a.stability = b.stability = 80;
    turn(w);
    assert.equal(a.prosperity!.mood, "envy");
    const left = a.prosperity!.left;
    if (left) { assert.equal(left.to, b.id); gone += left.k; came += demo(b).arrived ?? 0; assert.ok((demo(a).left ?? 0) >= left.k); }
  }
  assert.ok(gone >= 2, `families left (${gone})`);
  assert.ok(came >= gone, "and arrived at the richer neighbour");
  // nobody leaves for a nation at war with them, nor when the law sets it to nothing
  const w2 = touching("prosp-war");
  w2.wars.push({ id: 1, a: 0, b: 1, declared: 0, start: w2.tick + 100, end: null, reason: "" });
  const was = PROSPERITY.emigrate;
  for (let k = 0; k < 15; k++) { poor(w2.nations[0], 60); rich(w2.nations[1], 20); turn(w2); assert.equal(w2.nations[0].prosperity!.left, undefined); }
  PROSPERITY.emigrate = 0;
  const w3 = touching("prosp-envy");
  for (let k = 0; k < 15; k++) { poor(w3.nations[0], 60); rich(w3.nations[1], 20); turn(w3); assert.equal(w3.nations[0].prosperity!.left, undefined); }
  PROSPERITY.emigrate = was;
});

test("the nations' AI sees its prosperity, the others' as far as it knows them, and advice on what to raise", () => {
  const w = touching("prosp-obs");
  const [a, b] = w.nations;
  poor(a); rich(b);
  turn(w);
  const obs = buildObservation(w, a) as Record<string, any>;
  assert.equal(obs.prosperity.score, a.prosperity!.score);
  assert.deepEqual(Object.keys(obs.prosperity.parts), ["food", "goods", "room", "health"]);
  assert.equal(obs.prosperity.rank_among_known, "2 of 2");
  assert.equal(obs.prosperity.known_nations[0].name, b.name);
  assert.match(systemPrompt(w), /PROSPERITY AND NATIONAL PRIDE/);
  assert.ok(advice(w, a).some(x => /ganh tị|Thịnh vượng/.test(x.text)), JSON.stringify(advice(w, a)));
  // what A can tell of B: exact with a spy, a word from rumour
  a.intel[String(b.id)] = { level: 4, lastContact: w.tick, asOf: w.tick, report: {} };
  assert.equal(estimateProsperity(a, b), b.prosperity!.score);
  a.intel[String(b.id)] = { level: 1, lastContact: w.tick, asOf: w.tick, report: {} };
  assert.equal(estimateProsperity(a, b), "richer");
  // the Watcher's laws
  for (const k of ["prosperity.margin", "prosperity.acclaimStability", "prosperity.emigrate"]) assert.ok(LAW_BY_KEY[k], k);
});
