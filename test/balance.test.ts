// The v0.3 balance rules: housing per centre, logistic growth, square-root tile limit,
// research pace by depth and by researcher, pottery, sprawl, and decisive but costly war.
import { test } from "node:test";
import assert from "node:assert/strict";
import { baseCost, createWorld, growthFor, housing, housingParts, researchPoints, step, tileLimit, type NationSpec } from "../src/engine.ts";
import { col, row, NEIGHBORS } from "../src/hex.ts";
import { ROLE_NAME } from "../src/rules.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
const COLORS = ["#c0392b", "#3355ff", "#00e676"];
const xy = (i: number) => [col(i), row(i)];

function founded(nations = 1, seed = "balance"): World {
  const w = createWorld(seed, bots(nations));
  const inputs: Record<number, TurnInput> = {};
  w.nations.forEach((n, k) => { inputs[n.id] = { kind: "ok", response: { actions: [{ type: "found_nation", name: `Nuoc${"ABC"[k]}`, capital: `Do${k}`, people: `Dan${k}`, flag: flag(COLORS[k]) }] } }; });
  step(w, inputs);
  for (const n of w.nations) { n.stock.food = 200; n.population = 40; }
  return w;
}
function turn(w: World, acts: Record<number, AIResponse>): string[] {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? {} };
  const r = step(w, inputs);
  assert.deepEqual(r.audit, [], "ledger audit");
  return r.chronicle.map(c => c.text);
}
/** Unclaimed land tiles far from everyone, to stand in for settlements. */
const freeTiles = (w: World, k: number) => w.tiles.filter(t => t.land && t.owner === -1 && w.nations.every(n => Math.abs(col(t.i) - col(n.capital)) + Math.abs(row(t.i) - row(n.capital)) > 12)).slice(0, k).map(t => t.i);
const meet = (w: World) => { for (const a of w.nations) for (const b of w.nations) if (a !== b && !a.met.includes(b.id)) a.met.push(b.id); };

test("housing: three tents per centre; only that many count", () => {
  const w = founded();
  const n = w.nations[0];
  n.inventions.push("P1", "P3", "P7", "P8");
  Object.assign(n.stock, { wood: 100, hide: 100, rope: 100 });
  n.population = 100; // 5 AP
  const tent = { type: "build", building: "tent" };
  turn(w, { 0: { actions: [tent, tent, tent, tent] } });
  assert.equal(n.buildings.filter(b => b.type === "tent").length, 3);
  assert.match(n.lastRejected.at(-1)!.reason, /chỉ chứa 3 công trình có chỗ ở: đã có 3\/3/);
  n.settlements.push({ tile: freeTiles(w, 1)[0], name: "Trại", tick: w.tick });
  turn(w, { 0: { actions: [tent] } });
  assert.equal(n.buildings.filter(b => b.type === "tent").length, 4, "a settlement opens three more slots");
  for (const b of n.buildings) if (b.type === "tent") { b.done = true; b.progress = 4; }
  assert.equal(housing(w, n), 25 + 10 + 4 * 10 + housingParts(w, n).hamlets, "plus the hamlets on the land");
  n.settlements = []; // the settlement is lost: the fourth tent stands empty
  assert.equal(housing(w, n), 25 + 3 * 10 + housingParts(w, n).hamlets);
});

test("growth is logistic toward housing; the tile limit grows with √population", () => {
  assert.equal(growthFor(20, 25), 1, "at least one");
  assert.equal(growthFor(100, 200), 4, "8% × 100 × (1 − 100/200)");
  assert.equal(growthFor(199, 200), 1);
  assert.equal(growthFor(200, 200), 0, "never past the roof");
  const w = founded();
  const n = w.nations[0];
  n.population = 100;
  assert.equal(tileLimit(w, n), 7 + 10);
  n.population = 400;
  n.settlements.push({ tile: -1, name: "A", tick: 0 }, { tile: -2, name: "B", tick: 0 });
  assert.equal(tileLimit(w, n), 7 + 20 + 2 * 3);
});

test("research: deeper inventions cost more, more researchers give less each", () => {
  const w = founded();
  assert.equal(baseCost(w, "P1"), 20, "depth 1 keeps its listed price");
  assert.equal(baseCost(w, "P7"), 55, "depth 2: 30 × 1.75, rounded up to 5");
  assert.equal(baseCost(w, "P8"), 65, "depth 3: 25 × 2.5");
  assert.equal(baseCost(w, "P18"), 250);
  assert.equal(researchPoints(0), 0);
  assert.equal(researchPoints(1), 1);
  const rp32 = researchPoints(32);
  assert.ok(rp32 > 18 && rp32 < 20, `32 researchers make ${rp32} RP (32^0.85)`);
  assert.equal(ROLE_NAME.mine, "khai mỏ");
});

test("pottery in stock keeps food a little longer, up to 5 points", () => {
  const food = (pots: number) => {
    const w = founded(1, "pots");
    const n = w.nations[0];
    n.stock.food = 1000; n.stock.pottery = pots;
    turn(w, {});
    return n.stock.food;
  };
  const plain = food(0), ten = food(10), forty = food(40);
  const before = plain / 0.7; // the plain stock lost 30%
  assert.ok(Math.abs((ten - plain) / before - 0.05) < 1e-6, "10 pots: −5 points");
  assert.equal(forty, ten, "capped at 5 points");
});

test("settlements beyond three wear on stability", () => {
  const w = founded();
  const n = w.nations[0];
  n.stability = 50;
  freeTiles(w, 5).forEach((tile, k) => n.settlements.push({ tile, name: `S${k}`, tick: 0 }));
  turn(w, {});
  assert.equal(n.stability, 50 + 1 - 2, "+1 for food, −1 for each of the two settlements beyond three");
});

/** Two nations at war, with a tile of B's next to A's land. */
function atWar(seed: string) {
  const w = founded(2, seed); meet(w);
  const [a, b] = w.nations;
  turn(w, { 0: { actions: [{ type: "declare_war", target: b.name }] } });
  for (const n of [a, b]) { n.population = 100; n.stock.food = 300; n.stability = 100; }
  return { w, a, b };
}
const army = (warriors: number) => ({ gather: 0, hunt: 0, fish: 0, farm: 0, wood: 0, stone: 0, flint: 0, clay: 0, mine: 0, craft: 0, build: 0, research: 0, warrior: warriors });

test("war: the defender's home advantage, and spoils for the victor", () => {
  const { w, a, b } = atWar("home");
  const target = w.tiles.find(t => t.owner === b.id && t.i !== b.capital && t.terrain !== "mountain" && t.land && !t.river && (t.terrain === "grass" || t.terrain === "coast" || t.terrain === "desert" || t.terrain === "tundra"))
    ?? w.tiles.find(t => t.owner === b.id && t.i !== b.capital && t.terrain !== "mountain")!;
  // A bridge that touches only the target, so the defender's front is that one tile (§7.4 spreads defenders over the front)
  const touches = (j: number) => NEIGHBORS[j].filter(k => w.tiles[k].owner === b.id).length;
  const bridge = NEIGHBORS[target.i].filter(j => w.tiles[j].owner === -1 && w.tiles[j].land).sort((x, y) => touches(x) - touches(y))[0];
  w.tiles[bridge].owner = a.id;
  // Even numbers: ten against ten on their own ground, the defender holds
  b.labor = army(10);
  turn(w, { 0: { labor: army(10), actions: [{ type: "attack", tile: xy(target.i), warriors: 10 }] }, 1: { labor: army(10) } });
  const first = w.battles.at(-1)!;
  assert.equal(first.won, false, `10 vs 10 at home: ${first.a} vs ${first.d}`);
  assert.equal(w.tiles[target.i].owner, b.id);
  // With no warriors left at home, the attack takes the tile and part of the stores
  b.labor = army(0); b.stock.food = 100; a.labor.warrior = 10;
  for (const n of [a, b]) n.population = 100;
  const lines = turn(w, { 0: { labor: army(10), actions: [{ type: "attack", tile: xy(target.i), warriors: 10 }] }, 1: { labor: army(0) } });
  const second = w.battles.at(-1)!;
  assert.equal(second.won, true);
  assert.equal(w.tiles[target.i].owner, a.id);
  assert.match(second.note, /chiếm được ô, thu 15 lương thực/, "15% of their food, within what 10 warriors carry");
  assert.ok(lines.some(l => /thu 15 lương thực/.test(l)));
});

test("war: a capital falls once the attacker holds 4 of its land neighbours", () => {
  const { w, a, b } = atWar("capital");
  const ring = NEIGHBORS[b.capital].filter(j => w.tiles[j].land);
  assert.ok(ring.length >= 4, "a capital with at least four land neighbours");
  for (const j of ring.slice(0, 3)) w.tiles[j].owner = a.id;
  b.labor = army(0); b.stock.food = 200;
  const hit = { 0: { labor: army(20), actions: [{ type: "attack", tile: xy(b.capital), warriors: 20 }] }, 1: { labor: army(0) } };
  turn(w, hit);
  assert.match(w.battles.at(-1)!.note, /chưa bị vây đủ \(3\/4/);
  assert.ok(b.alive);
  w.tiles[ring[3]].owner = a.id;
  a.population = 100; a.stock.food = 300;
  const lines = turn(w, hit);
  assert.match(w.battles.at(-1)!.note, /chiếm được trung tâm, thu .*lương thực/);
  assert.equal(b.alive, false, "no settlement to fall back on");
  assert.ok(lines.some(l => /thất thủ/.test(l)));
});
