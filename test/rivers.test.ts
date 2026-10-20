// Rivers and trade roads (§2.1, §7.3): no AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, freshWater, step, ownedTiles, type NationSpec } from "../src/engine.ts";
import { NEIGHBORS, col, row, dist, within } from "../src/hex.ts";
import { RIVER, TRADE } from "../src/rules.ts";
import { generateWorld } from "../src/worldgen.ts";
import { landRoute, planRoute, waterRoute } from "../src/routes.ts";
import { crossesWater } from "../src/diplomacy.ts";
import type { AIResponse, Nation, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function founded(nations: number, seed: string): World {
  const w = createWorld(seed, bots(nations));
  const inputs: Record<number, TurnInput> = {};
  w.nations.forEach((n, k) => { inputs[n.id] = { kind: "ok", response: { actions: [{ type: "found_nation", name: `Nuoc${"ABC"[k]}`, capital: `Do${k}`, people: `Dan${k}`, flag: flag(["#c0392b", "#2471a3", "#1e8449"][k]) }] } }; });
  step(w, inputs);
  for (const n of w.nations) { n.stock.food = 300; n.population = 80; n.met = w.nations.filter(o => o !== n).map(o => o.id); }
  return w;
}
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? {} };
  const r = step(w, inputs);
  assert.deepEqual(r.audit, [], "ledger audit");
  return r;
}
const xy = (i: number) => [col(i), row(i)];
const done = (n: Nation, type: string, tile: number) => n.buildings.push({ id: 900 + n.buildings.length, type, tile, progress: 99, done: true, hp: 100 });
/** Move a nation onto a fresh piece of land: these tiles only. */
function settle(w: World, n: Nation, tiles: number[]) {
  for (const t of w.tiles) if (t.owner === n.id) t.owner = -1;
  for (const i of tiles) w.tiles[i].owner = n.id;
  n.capital = tiles[0]; n.settlements = []; n.buildings = [];
}

test("river banks hold reeds and floodplain plants; flint gravel only in the upper course", () => {
  const g = generateWorld("rivers", 6);
  const banks = g.tiles.filter(t => t.river && t.land);
  assert.ok(banks.length > 50);
  assert.ok(banks.every(t => (t.res.reeds || 0) > 0 && (t.res.plants || 0) > 0 && (t.res.clay || 0) > 0 && (t.res.fish || 0) > 0));
  const nearHills = (i: number) => within(i, RIVER.flintNear).some(j => ["hill", "mountain"].includes(g.tiles[j].terrain));
  assert.ok(banks.filter(t => !nearHills(t.i) && !["hill", "coast", "grass"].includes(t.terrain)).every(t => !t.res.flint), "no gravel on the lowland river");
  assert.ok(banks.some(t => nearHills(t.i) && (t.res.flint || 0) > 0));
});

test("fresh water: a capital far from rivers needs a well", () => {
  const w = founded(1, "water");
  const n = w.nations[0];
  const dry = w.tiles.find(t => t.land && !t.river && t.terrain !== "mountain" && t.terrain !== "swamp" && within(t.i, RIVER.waterReach).every(j => !w.tiles[j].river && w.tiles[j].terrain !== "swamp" && !w.tiles[j].wonder))!;
  settle(w, n, within(dry.i, 1).filter(i => w.tiles[i].land));
  assert.equal(freshWater(w, n), false);
  done(n, "well", NEIGHBORS[n.capital].find(i => w.tiles[i].owner === n.id)!);
  assert.equal(freshWater(w, n), true);
  const wet = w.tiles.find(t => t.river && t.land && t.owner === -1)!;
  settle(w, n, within(wet.i, 1).filter(i => w.tiles[i].land && w.tiles[i].owner === -1));
  assert.equal(freshWater(w, n), true, "a river is enough");
});

test("land road: porters by the load, tolls to a third nation, shut by a war", () => {
  const w = founded(3, "roads");
  const [a, b, c] = w.nations;
  const road = planRoute(w, a, b, { stone: 12 });
  if (typeof road === "string") assert.fail(road);
  assert.ok(road.mode === "land" || road.mode === "water");
  if (road.mode === "land") {
    assert.equal(road.porters, Math.ceil(12 / TRADE.porterLoad));
    assert.equal(w.tiles[road.path[0]].owner, a.id);
    assert.equal(w.tiles[road.path[road.path.length - 1]].owner, b.id);
  }
  // Every free tile now belongs to C: the road must cross it and pay
  for (const t of w.tiles) if (t.owner === -1 && t.land) t.owner = c.id;
  const crossing = landRoute(w, a, b);
  assert.ok(crossing && crossing.tolls.includes(c.id), "C takes a toll");
  // At war with C, its land is shut: no road overland
  w.wars.push({ id: 99, a: a.id, b: c.id, declared: w.tick, start: w.tick, end: null, reason: "" });
  assert.equal(landRoute(w, a, b), null);
});

test("by water: a pier and boats sail a river faster than porters walk", () => {
  const w = founded(2, "boats");
  const [a, b] = w.nations;
  const river = w.rivers.find(p => p.length >= 14 && p.slice(0, 12).every(i => w.tiles[i].land && w.tiles[i].terrain !== "mountain"))!;
  assert.ok(river, "a long river");
  settle(w, a, [river[1], river[0]]);
  settle(w, b, [river[11]]);
  a.inventions.push("P10", "P16");
  assert.equal(waterRoute(w, a, b), null, "no pier, no boats");
  done(a, "pier", river[1]);
  a.stock.boat = 2;
  const road = planRoute(w, a, b, { food: 20 });
  if (typeof road === "string") assert.fail(road);
  assert.equal(road.mode, "water");
  assert.equal(road.boats, Math.ceil(20 / TRADE.boatLoad));
  assert.ok(road.path.every((i, k) => k === 0 || w.tiles[i].river || w.tiles[i].terrain === "shallow"), "on the water all the way");
  assert.ok(crossesWater(w, a, river[4]), "boats from the pier reach a river tile nearby");
});

test("a caravan walks its road; one caught on the land of a new enemy is seized", () => {
  const w = founded(3, "caravan");
  const [a, b, c] = w.nations;
  a.stock.stone = 50; b.stock.wood = 50;
  turn(w, { 0: { actions: [{ type: "trade_offer", to: b.name, give: { stone: 10 }, get: { wood: 10 } }] } });
  const offer = w.tradeOffers.at(-1)!;
  turn(w, { 1: { actions: [{ type: "accept_trade", offer: offer.id }] } });
  assert.equal(offer.status, "done", JSON.stringify([a.lastEvents, b.lastEvents, a.lastRejected, b.lastRejected]));
  const cv = w.caravans.find(x => x.from === a.id)!;
  assert.ok(cv, "far apart: a caravan");
  assert.ok(cv.path && cv.path.length > 1 && (cv.porters || cv.boats));
  // C owns the road ahead and goes to war with A: the goods are seized on its land
  const ahead = cv.path!.slice(1, -1);
  for (const i of ahead) w.tiles[i].owner = c.id;
  w.wars.push({ id: 98, a: c.id, b: a.id, declared: w.tick, start: w.tick, end: null, reason: "" });
  const before = c.stock.stone || 0;
  for (let k = 0; k < 6 && w.caravans.includes(cv); k++) turn(w);
  assert.ok(!w.caravans.includes(cv), "the caravan is gone");
  assert.ok((c.stock.stone || 0) > before, "C took the stone");
  assert.ok(a.lastEvents.some(e => /tịch thu/.test(e)), "A is told");
});
