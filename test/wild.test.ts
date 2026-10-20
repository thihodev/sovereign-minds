// The world's edge and the threats of the wild (§12.1, §9.4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, ownedTiles, type NationSpec } from "../src/engine.ts";
import { N, TILE_COUNT, NEIGHBORS, col, row, dist, within } from "../src/hex.ts";
import { EVENTS, HORDES } from "../src/rules.ts";
import { generateWorld, WALL } from "../src/worldgen.ts";
import { layer, nationResources, nationThreats, tileThreats } from "../src/threats.ts";
import { buildObservation } from "../src/ai/prompt.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";
import type { MapFx } from "../src/fx.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });

function founded(nations = 2, seed = "wild"): World {
  const w = createWorld(seed, bots(nations));
  const inputs: Record<number, TurnInput> = {};
  w.nations.forEach((n, k) => { inputs[n.id] = { kind: "ok", response: { actions: [{ type: "found_nation", name: `Nuoc${"ABCDE"[k]}`, capital: `Do${k}`, people: `Dan${k}`, flag: flag(["#c0392b", "#3355ff", "#00e676"][k]) }] } }; });
  step(w, inputs);
  for (const n of w.nations) { n.stock.food = 300; n.population = 60; }
  return w;
}
function turn(w: World, acts: Record<number, AIResponse> = {}): string[] {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? {} };
  const r = step(w, inputs);
  assert.deepEqual(r.audit, [], "ledger audit");
  return r.chronicle.map(c => c.text);
}
const xy = (i: number) => [col(i), row(i)];
/** Run fn with some rule numbers changed, then put them back. */
function withRules<T>(obj: Record<string, unknown>, patch: Record<string, unknown>, fn: () => T): T {
  const old = Object.fromEntries(Object.keys(patch).map(k => [k, obj[k]]));
  Object.assign(obj, patch);
  try { return fn(); } finally { Object.assign(obj, old); }
}

test("the map is 128 × 128 and ringed by an unbroken ice wall, with glacier at its foot", () => {
  assert.equal(N, 128);
  const g = generateWorld("ice", 6);
  assert.equal(g.tiles.length, TILE_COUNT);
  for (let k = 0; k < N; k++) for (const i of [k, (N - 1) * N + k, k * N, k * N + N - 1]) assert.equal(g.tiles[i].terrain, "icewall", `edge tile ${xy(i)}`);
  const wall = g.tiles.filter(t => t.terrain === "icewall");
  assert.ok(wall.every(t => !t.land && Object.keys(t.res).length === 0), "the wall is no land and holds nothing");
  assert.ok(wall.length > 4 * N * WALL.min * 0.9, "at least WALL.min thick");
  const glacier = g.tiles.filter(t => t.terrain === "glacier");
  assert.ok(glacier.length > 0 && glacier.every(t => t.land && (t.wall ?? 99) <= WALL.glacier), "glacier only at the foot of the wall");
  assert.ok(g.spawns.every(s => g.tiles[s].wall === undefined), "nobody is born in the ice wind");
  assert.ok(g.wild.length >= 4, "wilderness for the hordes");
  assert.ok(g.tiles.some(t => (t.res.herbs || 0) > 0), "herbs grow somewhere");
});

test("nobody can claim the ice wall, and explorers stop at it", () => {
  const w = founded(1, "edge");
  const n = w.nations[0];
  const ice = w.tiles.find(t => t.terrain === "icewall" && NEIGHBORS[t.i].some(j => w.tiles[j].land))!;
  const foot = NEIGHBORS[ice.i].find(j => w.tiles[j].land)!;
  w.tiles[foot].owner = n.id;
  turn(w, { 0: { actions: [{ type: "claim_tile", tile: xy(ice.i) }] } });
  assert.equal(w.tiles[ice.i].owner, -1);
  assert.ok(n.lastRejected.length > 0, "the claim is refused");
  n.inventions.push("P16"); // boats: shallow water can be held, the ice still cannot
  turn(w, { 0: { actions: [{ type: "claim_tile", tile: xy(ice.i) }] } });
  assert.equal(w.tiles[ice.i].owner, -1);
  assert.match(n.lastRejected[0].reason, /Tường Băng/);
  const tilesSeenBefore = new Set(n.seen);
  for (const dir of ["E", "NE", "NW", "W", "SW", "SE"]) turn(w, { 0: { actions: [{ type: "explore", direction: dir, people: 1, from: xy(foot) }] } });
  assert.ok(n.seen.length >= tilesSeenBefore.size);
  assert.ok(ownedTiles(w, n.id).every(t => t.terrain !== "icewall"));
});

test("a horde raids a rich neighbour; a guarded one beats it off", () => {
  const raid = (warriors: number) => {
    const w = founded(1, "horde");
    const n = w.nations[0], h = w.hordes![0];
    h.tile = within(n.capital, 6).find(i => dist(i, n.capital) === 6 && w.tiles[i].land)!;
    for (const o of w.hordes!) if (o !== h) o.alive = false; // one horde, so the outcome is about it alone
    h.strength = 60; w.tick = HORDES.grace;
    n.population = 80; n.stability = 20; n.labor.warrior = warriors; n.stock.spear = warriors;
    const food = n.stock.food, pop = n.population;
    return withRules(HORDES as unknown as Record<string, unknown>, { raidChance: 1, raidMax: 1 }, () => { turn(w); return { w, n, h, food, pop }; });
  };
  const open = raid(0);
  assert.equal(open.h.lastRaid?.won, true, "an unguarded village is robbed");
  assert.ok(open.n.population < open.pop);
  assert.ok(open.n.lastEvents.some(e => /cướp phá/.test(e)));
  const guarded = raid(40);
  assert.equal(guarded.h.lastRaid?.won, false, "40 armed warriors beat the raiders off");
  assert.ok(guarded.h.strength < 60, "and the horde is weakened");
});

test("small peoples are not worth a raid", () => {
  const w = founded(1, "horde");
  const n = w.nations[0], h = w.hordes![0];
  h.tile = within(n.capital, 5).find(i => dist(i, n.capital) === 5 && w.tiles[i].land)!;
  h.strength = 60; w.tick = HORDES.grace; n.population = HORDES.minPop - 1;
  withRules(HORDES as unknown as Record<string, unknown>, { raidChance: 1, raidMax: 1 }, () => turn(w));
  assert.equal(h.lastRaid, null);
});

test("clear_wild drives a horde away for a while", () => {
  const w = founded(1, "clear");
  const n = w.nations[0], h = w.hordes![0];
  h.tile = within(n.capital, 5).find(i => dist(i, n.capital) === 5 && w.tiles[i].land)!;
  h.strength = 15;
  n.labor.warrior = 30; n.stock.spear = 30;
  turn(w, { 0: { actions: [{ type: "clear_wild", horde: h.id, warriors: 30 }] } });
  assert.ok(n.lastRejected.some(r => /Chưa nhìn thấy/.test(r.reason)), "first you must see their camp");
  n.seen.push(h.tile);
  const rep = n.reputation;
  // one sortie per turn, and the men it uses are not free for anything else
  turn(w, { 0: { labor: { warrior: 30 }, actions: [{ type: "clear_wild", horde: h.id, warriors: 20 }, { type: "clear_wild", horde: h.id, warriors: 10 }] } });
  assert.ok(n.lastRejected.some(r => /chỉ một cuộc/.test(r.reason)), "a second sortie the same turn is refused");
  if (h.alive) turn(w, { 0: { labor: { warrior: 30 }, actions: [{ type: "clear_wild", horde: h.id, warriors: 30 }] } });
  assert.equal(h.alive, false);
  assert.equal(h.returns, w.tick - 1 + HORDES.returnTicks);
  assert.ok(n.reputation > rep);
  w.tick = h.returns!;
  turn(w);
  assert.equal(h.alive, true, "it comes back in time");
});

test("herbs halve plague deaths", () => {
  const deaths = (herbs: number) => {
    const w = founded(1, "herbs");
    const n = w.nations[0];
    n.population = 100; n.stock.herbs = herbs;
    const before = n.population;
    return withRules(EVENTS.plague as unknown as Record<string, unknown>, { chance: 1, min: 0.2, max: 0.2 }, () => { turn(w); return { lost: before - n.population, n }; });
  };
  const sick = deaths(0), healed = deaths(20);
  assert.ok(healed.lost < sick.lost, `${healed.lost} < ${sick.lost}`);
  assert.ok(healed.n.lastEvents.some(e => /dùng 10\)/.test(e)), "one herb per 10 people is used up");
});

test("threat and resource reports: the AI sees what it can see, the Watcher sees everything", () => {
  const w = founded(1, "report");
  const n = w.nations[0], h = w.hordes![0];
  h.tile = within(n.capital, 9).find(i => dist(i, n.capital) === 9 && w.tiles[i].land)!;
  w.tick = HORDES.grace;
  n.stock.food = 5;
  n.seen = n.seen.filter(i => i !== h.tile);
  const forAI = nationThreats(w, n, true), watcher = nationThreats(w, n);
  assert.equal(forAI[0].kind, "famine", "the most urgent comes first");
  assert.equal(forAI[0].level, 3);
  assert.ok(!forAI.some(t => t.kind === "horde"), "a camp the nation has not seen is not in its report");
  assert.ok(watcher.some(t => t.kind === "horde"), "the Watcher sees it");
  n.seen.push(h.tile);
  assert.ok(nationThreats(w, n, true).some(t => t.kind === "horde"));
  const obs = buildObservation(w, n) as Record<string, unknown>;
  assert.ok(Array.isArray(obs.threats) && Array.isArray(obs.hordes));
  const res = nationResources(w, n, true);
  assert.ok(res.territory.length > 0);
  assert.ok(!res.territory.some(l => ["copper", "tin", "iron"].includes(l.key)), "hidden ores stay hidden from the AI");
  for (const v of Object.values(res.nearest)) assert.equal(w.tiles[v.tile[1] * N + v.tile[0]].owner, -1);
  const ice = w.tiles.find(t => t.terrain === "icewall")!;
  assert.equal(tileThreats(w, ice.i)[0].kind, "icewall");
  for (const kind of ["danger", "beasts", "hordes", "flood", "cold", "wood", "herbs"]) assert.equal(layer(w, kind).length, TILE_COUNT, kind);
  assert.deepEqual(layer(w, "nonsense"), []);
});

test("step() reports where things happened, for the map's animations, without changing the world", () => {
  const w = founded(1, "fx");
  const n = w.nations[0], h = w.hordes![0];
  for (const o of w.hordes!) if (o !== h) o.alive = false;
  h.tile = within(n.capital, 6).find(i => dist(i, n.capital) === 6 && w.tiles[i].land)!;
  h.strength = 60; w.tick = HORDES.grace; n.population = 80; n.stability = 20;
  const inputs: Record<number, TurnInput> = { 0: { kind: "ok", response: { actions: [{ type: "explore", direction: "E", people: 2 }] } } };
  const fx: MapFx[] = withRules(HORDES as unknown as Record<string, unknown>, { raidChance: 1, raidMax: 1 }, () => step(w, inputs).fx);
  const raid = fx.find(f => f.kind === "raid");
  assert.ok(raid && raid.from === h.tile && raid.tile === n.capital, "the raid comes from the horde's camp to the capital");
  assert.ok(fx.some(f => f.kind === "death" && f.cause === "raid" && (f.n ?? 0) > 0), "with its dead");
  const ex = fx.find(f => f.kind === "explore");
  assert.ok(ex?.path && ex.path.length > 1 && ex.path[0] === n.capital, "an expedition's road starts at home");
  // Recording only: the same inputs on a copy of the world give the same world
  const a = founded(1, "fx2"), b = founded(1, "fx2");
  step(a, { 0: { kind: "ok", response: {} } }); step(b, { 0: { kind: "ok", response: {} } });
  assert.deepEqual(JSON.stringify(a), JSON.stringify(b));
});

test("a flag's main colour must not vanish into the land on the map", () => {
  const w = createWorld("colours", bots(1));
  const found = (c: string) => step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Lam Son", capital: "Do", people: "Dan", flag: { layout: "h2", colors: [c, "#ffffff"], symbol: "sun" } }] } } });
  w.tick = 0;
  found("#4e7f46"); // forest green
  assert.equal(w.nations[0].founded, false);
  assert.match(w.nations[0].lastRejected[0].reason, /quá giống màu rừng/);
  w.tick = 0;
  found("#c0392b");
  assert.equal(w.nations[0].founded, true);
});
