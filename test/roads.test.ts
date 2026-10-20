// Roads, sea lanes (§2.5) and territorial waters (§2.6). No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, governed, roadNet, roadPlan, step, tileLimit, type NationSpec } from "../src/engine.ts";
import { NEIGHBORS, col, row, dist, within } from "../src/hex.ts";
import { ROADS, SEA, SETTLEMENT } from "../src/rules.ts";
import { landRoute } from "../src/routes.ts";
import type { AIResponse, Nation, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function founded(nations: number, seed: string): World {
  const w = createWorld(seed, bots(nations));
  const inputs: Record<number, TurnInput> = {};
  w.nations.forEach((n, k) => { inputs[n.id] = { kind: "ok", response: { actions: [{ type: "found_nation", name: `Nuoc${"ABC"[k]}`, capital: `Do${k}`, people: `Dan${k}`, flag: flag(["#c0392b", "#3355ff", "#00e676"][k]) }] } }; });
  step(w, inputs);
  for (const n of w.nations) { n.stock.food = 400; n.population = 80; n.stability = 80; n.met = w.nations.filter(o => o !== n).map(o => o.id); }
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
const builders = (k: number) => ({ gather: 0, hunt: 0, fish: 0, farm: 0, wood: 0, stone: 0, flint: 0, clay: 0, mine: 0, craft: 0, build: k, research: 0, warrior: 0 });
/** Give a nation capabilities and effects through a ready-made open invention. */
function grant(w: World, n: Nation, caps: string[], effects = {}) {
  const id = `X${w.custom.next++}`;
  w.custom.inventions[id] = { id, name: `Test ${id}`, prereqs: ["fire"], rp: 10, caps, effects, desc: "", custom: { by: n.id, tick: 0, depth: 1, power: 3, description: "", judge: "test" } };
  n.inventions.push(id);
}
const flat = (w: World, i: number) => w.tiles[i].land && !["mountain", "icewall"].includes(w.tiles[i].terrain);

test("roads: paid when ordered, laid by the builders, and caravans walk them faster", () => {
  const w = founded(2, "roads");
  const [a, b] = w.nations;
  const near = NEIGHBORS[a.capital].filter(i => w.tiles[i].owner === a.id && flat(w, i)).slice(0, 2);
  a.stock.wood = 20;
  turn(w, { 0: { labor: builders(10), actions: [{ type: "build_road", path: near.map(xy) }] } });
  assert.deepEqual(a.lastRejected, []);
  assert.equal(a.stock.wood, 20 - near.length * ROADS.levels[0].cost.wood, "materials paid at once");
  for (let k = 0; k < 3 && near.some(i => !w.tiles[i].road); k++) turn(w, { 0: { labor: builders(10) } });
  assert.ok(near.every(i => w.tiles[i].road === 1), "laid");
  assert.equal(a.roadWorks!.length, 0);
  // Ordering the same road again is refused: it is there already
  turn(w, { 0: { actions: [{ type: "build_road", path: near.map(xy), level: 1 }] } });
  assert.match(a.lastRejected[0].reason, /đã có đường/);
  // Paved all the way, the road between A and B costs far less to walk
  const before = landRoute(w, a, b);
  assert.ok(before, "a road overland");
  for (const i of before.path) w.tiles[i].road = 3;
  const after = landRoute(w, a, b)!;
  assert.ok(after.cost < before.cost * 0.5, `${after.cost} < ${before.cost} / 2`);
});

test("road levels open with the eras; roads through the wilds stay near home", () => {
  const w = founded(1, "levels");
  const n = w.nations[0];
  const near = NEIGHBORS[n.capital].find(i => w.tiles[i].owner === n.id && flat(w, i))!;
  n.stock.wood = 50; n.stock.stone = 50;
  turn(w, { 0: { actions: [{ type: "build_road", path: [xy(near)], level: 2 }] } });
  assert.match(n.lastRejected[0].reason, /Đồ Đồng/);
  const far = w.tiles.find(t => t.land && t.owner === -1 && within(t.i, ROADS.wildReach).every(j => w.tiles[j].owner !== n.id))!;
  turn(w, { 0: { actions: [{ type: "build_road", path: [xy(far.i)] }] } });
  assert.match(n.lastRejected[0].reason, /quá xa/);
  const wild = w.tiles.find(t => flat(w, t.i) && t.owner === -1 && NEIGHBORS[t.i].some(j => w.tiles[j].owner === n.id))!;
  turn(w, { 0: { actions: [{ type: "build_road", path: [xy(wild.i)] }] } });
  assert.deepEqual(n.lastRejected, [], "a track into the wilds next door");
});

test("a road to the capital: the settlement is no sprawl, and roads raise the tile limit", () => {
  const w = founded(1, "network");
  const n = w.nations[0];
  // Four settlements: one beyond the free ones, each on its own patch of land four tiles out
  const spots: number[] = [];
  for (const t of w.tiles) {
    if (spots.length === SETTLEMENT.freeCentres + 1) break;
    if (!flat(w, t.i) || t.owner !== -1 || dist(t.i, n.capital) !== 4 || spots.some(s => dist(s, t.i) < 3)) continue;
    if (!roadPlanFree(w, n.capital, t.i)) continue;
    spots.push(t.i);
  }
  assert.equal(spots.length, SETTLEMENT.freeCentres + 1, "room for the settlements");
  spots.forEach((tile, k) => { w.tiles[tile].owner = n.id; n.settlements.push({ tile, name: `S${k}`, tick: 0 }); });
  const limit0 = tileLimit(w, n);
  const path = roadPlan(w, n, spots[0]);
  assert.ok(path.length >= 2, "a way through the wilds");
  for (const i of path) w.tiles[i].road = 1;
  assert.deepEqual(roadNet(w, n).linked, [spots[0]]);
  // Road tiles of our own add to the limit; claim them and the network grows
  for (const i of path) w.tiles[i].owner = n.id;
  assert.equal(roadNet(w, n).tiles, path.length);
  assert.equal(tileLimit(w, n), limit0 + Math.floor(path.length / ROADS.tilesPerLimit));
  // With one settlement linked, none is beyond the free ones
  const stab = n.stability;
  turn(w);
  assert.ok(n.stability >= stab, `no sprawl: ${stab} → ${n.stability}`);
  assert.ok(n.settlements[0].road, "the settlement is marked as joined");
});
/** Is there a way over free flat land between two tiles (for picking a test site)? */
function roadPlanFree(w: World, from: number, to: number): boolean {
  const seen = new Set([from]), queue = [from];
  while (queue.length) { const k = queue.shift()!; if (k === to) return true; for (const j of NEIGHBORS[k]) if (!seen.has(j) && flat(w, j) && dist(j, from) <= 5) { seen.add(j); queue.push(j); } }
  return false;
}

test("territorial waters: held like land, a third of a tile, far water only near a pier", () => {
  const w = founded(1, "waters");
  const n = w.nations[0];
  const shore = w.tiles.find(t => t.land && t.terrain === "coast" && t.owner === -1 && NEIGHBORS[t.i].filter(j => w.tiles[j].terrain === "shallow").length >= 2
    && within(t.i, 3).every(j => w.tiles[j].owner === -1 || w.tiles[j].owner === n.id && false))!;
  assert.ok(shore, "a free shore");
  for (const t of w.tiles) if (t.owner === n.id) t.owner = -1;
  shore.owner = n.id; n.capital = shore.i;
  const sea = NEIGHBORS[shore.i].find(j => w.tiles[j].terrain === "shallow")!;
  turn(w, { 0: { actions: [{ type: "claim_tile", tile: xy(sea) }] } });
  assert.match(n.lastRejected[0].reason, /đi-nước/, "no boats, no sea");
  grant(w, n, ["đi-nước"]);
  turn(w, { 0: { actions: [{ type: "claim_tile", tile: xy(sea) }] } });
  assert.equal(w.tiles[sea].owner, n.id, JSON.stringify(n.lastRejected));
  assert.equal(governed(w, n), Math.round((1 + SEA.limitWeight) * 100) / 100);
  // Water off that water, not touching our land: only within reach of a pier
  const out = NEIGHBORS[sea].find(j => w.tiles[j].owner === -1 && !w.tiles[j].land && w.tiles[j].terrain === "shallow" && !NEIGHBORS[j].some(k => w.tiles[k].owner === n.id && w.tiles[k].land));
  if (out !== undefined) {
    turn(w, { 0: { actions: [{ type: "claim_tile", tile: xy(out) }] } });
    assert.match(n.lastRejected[0].reason, /Bến thuyền/);
    n.buildings.push({ id: 900, type: "pier", tile: shore.i, progress: 99, done: true, hp: 100 });
    turn(w, { 0: { actions: [{ type: "claim_tile", tile: xy(out) }] } });
    assert.equal(w.tiles[out].owner, n.id, JSON.stringify(n.lastRejected));
  }
  // Deep sea needs ocean ships
  const deep = w.tiles.find(t => t.terrain === "ocean" && t.owner === -1 && NEIGHBORS[t.i].some(j => w.tiles[j].owner === n.id));
  if (deep) {
    turn(w, { 0: { actions: [{ type: "claim_tile", tile: xy(deep.i) }] } });
    assert.match(n.lastRejected[0].reason, /viễn dương/);
  }
  // A sea lane in our own waters
  n.stock.wood = 10;
  turn(w, { 0: { labor: builders(10), actions: [{ type: "build_road", path: [xy(sea)] }] } });
  assert.deepEqual(n.lastRejected, []);
  for (let k = 0; k < 3 && !w.tiles[sea].road; k++) turn(w, { 0: { labor: builders(10) } });
  assert.equal(w.tiles[sea].road, 1, "a marked channel");
});

test("an attack on a water tile is fought from boats", () => {
  const w = founded(2, "naval");
  const [a, b] = w.nations;
  grant(w, a, ["đi-nước"]);
  const water = w.tiles.find(t => t.terrain === "shallow" && t.owner === -1 && NEIGHBORS[t.i].some(j => w.tiles[j].land && w.tiles[j].owner === -1))!;
  water.owner = b.id;
  const bridge = NEIGHBORS[water.i].find(j => w.tiles[j].land && w.tiles[j].owner === -1)!;
  w.tiles[bridge].owner = a.id;
  w.wars.push({ id: 77, a: a.id, b: b.id, declared: w.tick - 1, start: w.tick, end: null, reason: "" });
  a.labor = { ...builders(0), gather: 0, warrior: 10 };
  turn(w, { 0: { labor: a.labor, actions: [{ type: "attack", tile: xy(water.i), warriors: 10 }] } });
  assert.match(a.lastRejected[0].reason, /2 thuyền/);
});
