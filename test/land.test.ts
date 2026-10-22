// Land is the people's life (§2.9); a nation that split from another (§4.5). No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { NEIGHBORS } from "../src/hex.ts";
import { LAND } from "../src/rules.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function two(seed: string): World {
  const w = createWorld(seed, bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc A", capital: "Do A", people: "Dan A", flag: flag("#c0392b") }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc Bình", capital: "Do Bình", people: "Dan Bình", flag: flag("#3355ff") }] } } });
  for (const n of w.nations) { n.stock.food = 500; n.population = 80; n.stability = 80; n.met = w.nations.filter(o => o !== n).map(o => o.id); }
  return w;
}
const turn = (w: World, acts: Record<number, AIResponse> = {}) => {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? { actions: [{ type: "research", invention: "P2" }] } };
  const out = step(w, inputs); assert.deepEqual(out.audit, []); return out;
};
const xy = (i: number) => [i % 128, Math.floor(i / 128)];

test("abandoning land shakes the people", () => {
  const w = two("abandon");
  const a = w.nations[0];
  const tile = w.tiles.find(t => t.owner === a.id && t.i !== a.capital)!;
  turn(w);
  const stab = a.stability;
  turn(w, { 0: { actions: [{ type: "abandon_tile", tile: xy(tile.i) }] } });
  assert.ok(a.stability <= stab - LAND.abandonStability + 1, `${stab} → ${a.stability}`);
  assert.ok(a.lastEvents.some(e => /không muốn rời đất/.test(e)));
});

test("a split nation: no pact with its old nation, a just war for the old one, and it returns whole when its capital falls", () => {
  const w = two("kin");
  const [a, b] = w.nations;
  b.origin = { from: a.id, tick: 0, leader: "X" };
  turn(w, { 1: { actions: [{ type: "treaty", to: a.name, kind: "non_aggression", duration: 30 }] } });
  assert.match(b.lastRejected[0].reason, /không thể/);
  const rep = a.reputation;
  turn(w, { 0: { actions: [{ type: "declare_war", target: b.name }] } });
  assert.ok(w.wars.some(x => x.a === a.id && x.b === b.id));
  assert.equal(a.reputation, rep, "seeking its lost land is a just war");
  // B's capital ringed by A's land: it falls, and B comes back to A
  for (const j of NEIGHBORS[b.capital]) if (w.tiles[j].land) w.tiles[j].owner = a.id;
  b.labor = { ...b.labor, warrior: 0 }; b.population = 30; b.stock.wood = 40;
  const popA = a.population, tilesB = w.tiles.filter(t => t.owner === b.id).length;
  a.population = 120; a.labor = { gather: 0, hunt: 0, fish: 0, farm: 0, wood: 0, stone: 0, flint: 0, clay: 0, mine: 0, craft: 0, build: 0, research: 0, warrior: 40 };
  for (let k = 0; k < 4 && b.alive; k++) turn(w, { 0: { labor: a.labor, actions: [{ type: "attack", tile: xy(b.capital), warriors: 20 }] }, 1: { actions: [] } });
  assert.equal(b.alive, false, JSON.stringify(a.lastRejected));
  assert.ok(w.tiles.filter(t => t.owner === a.id).length >= tilesB, "its land is A's again");
  assert.ok(a.population > popA - 10, "and its people");
});

test("land beyond the limit stays the nation's; the limit only stops new claims (v0.57)", () => {
  const w = createWorld("over-limit", [{ controller: "bot", provider: "bot", model: "bot" }]);
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc Rong", capital: "Do Rong", people: "Dan Rong", flag: { layout: "h2", colors: ["#c0392b", "#ffffff"], symbol: "sun" } }] } } });
  const n = w.nations[0];
  n.stock.food = 500; n.stability = 60; n.discontent = 0;
  // far more land than the limit
  const extra = w.tiles.filter(t => t.owner === -1 && t.land && t.terrain !== "icewall" && t.terrain !== "mountain" && NEIGHBORS[t.i].some(j => w.tiles[j].owner === n.id)).slice(0, 8);
  for (const t of extra) t.owner = n.id;
  const before = w.tiles.filter(t => t.owner === n.id).length;
  const free = w.tiles.find(t => t.owner === -1 && t.land && t.terrain !== "icewall" && t.terrain !== "mountain" && NEIGHBORS[t.i].some(j => w.tiles[j].owner === n.id))!;
  const out = step(w, { 0: { kind: "ok", response: { actions: [{ type: "claim_tile", tile: [free.i % 128, Math.floor(free.i / 128)] }] } } });
  assert.deepEqual(out.audit, []);
  assert.equal(w.tiles.filter(t => t.owner === n.id).length, before, "no land goes wild, and no new claim beyond the limit");
  assert.ok(n.lastRejected.some(r => /giới hạn khai hoang/.test(r.reason)), JSON.stringify(n.lastRejected));
  assert.equal(n.discontent ?? 0, 0, "land is no grievance");
  // land cut off from every centre stays the nation's too
  const island = extra.at(-1)!;
  for (const j of NEIGHBORS[island.i]) if (w.tiles[j].owner === n.id && j !== n.capital) w.tiles[j].owner = -1;
  for (let k = 0; k < 6; k++) step(w, { 0: { kind: "ok", response: {} } });
  assert.equal(island.owner, n.id, "cut-off land stays");
});
