// §2.3c Holding the land: no limit on claims; land is held by the people on it and the warriors that reach it; land
// left unheld may be taken by a neighbour. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { NEIGHBORS, col, dist, row } from "../src/hex.ts";
import { borderOf } from "../src/border.ts";
import { militiaAt, reachAt, unheld, unheldTiles } from "../src/hold.ts";
import { HOLD } from "../src/rules.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function two(seed: string): World {
  const w = createWorld(seed, bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc A", capital: "Do A", people: "Dan A", flag: flag("#c0392b") }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc B", capital: "Do B", people: "Dan B", flag: flag("#3355ff") }] } } });
  for (const n of w.nations) { n.stock.food = 500; n.population = 60; n.stability = 70; }
  return w;
}
const turn = (w: World, acts: Record<number, AIResponse> = {}) => {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? { actions: [{ type: "research", invention: "P2" }] } };
  const out = step(w, inputs); assert.deepEqual(out.audit, []); return out;
};

test("warriors reach land near a centre in full, far land hardly; the militia is the people who live there", () => {
  const w = two("hold-reach"), [a] = w.nations;
  assert.equal(reachAt(w, a, a.capital), 1);
  const far = w.tiles.find(t => t.land && dist(t.i, a.capital) === HOLD.near + 6)!;
  assert.ok(reachAt(w, a, far.i) < 0.3, `${reachAt(w, a, far.i)}`);
  assert.ok(militiaAt(w, a, a.capital) > 0, "people live at the capital");
});

test("land far from every centre with no one on it is unheld, and a neighbour may encroach on it", () => {
  const w = two("hold-encroach"), [a, b] = w.nations;
  // B holds a strip of empty desert far from its capital, touching A's land
  const near = w.tiles.filter(t => t.land && t.owner === -1 && t.terrain !== "icewall" && t.terrain !== "mountain" && dist(t.i, b.capital) > HOLD.near + 3 && NEIGHBORS[t.i].some(j => w.tiles[j].owner === a.id));
  const tile = near[0]; assert.ok(tile, "a tile at A's edge");
  tile.owner = b.id; tile.terrain = "desert"; delete tile.road;
  for (const j of NEIGHBORS[tile.i]) if (w.tiles[j].owner === b.id) w.tiles[j].terrain = "desert";
  a.met.push(b.id); b.met.push(a.id);
  // a family or two on a desert tile, far from every centre, cannot hold it
  assert.ok(unheld(w, b, tile.i) && unheldTiles(w, b).includes(tile.i));
  const rep = a.reputation, tension = borderOf(w, a.id, b.id).tension;
  turn(w, { 0: { actions: [{ type: "claim_tile", tile: [col(tile.i), row(tile.i)] }] } });
  {
    assert.equal(tile.owner, a.id, JSON.stringify(a.lastRejected));
    assert.ok(a.reputation < rep, "an act of hostility");
    assert.ok((b.casusBelli[String(a.id)] ?? -1) > w.tick - 1, "a just cause for the loser");
    assert.ok(borderOf(w, a.id, b.id).tension >= tension, "the border grows tense");
    assert.ok(b.lastEvents.some(e => /lấn chiếm/.test(e)));
  }
  // a treaty of non-aggression forbids it
  const t2 = w.tiles.find(t => t.owner === b.id && t.i !== b.capital && NEIGHBORS[t.i].some(j => w.tiles[j].owner === a.id));
  if (t2) {
    w.treaties.push({ id: 999, type: "non_aggression", a: a.id, b: b.id, tribute: {}, cede: [], start: w.tick, end: null, active: true, brokenBy: null, by: a.id, term: null });
    turn(w, { 0: { actions: [{ type: "claim_tile", tile: [col(t2.i), row(t2.i)] }] } });
    assert.notEqual(t2.owner, a.id);
  }
});

test("a lived-in tile near a centre is held: no encroaching on it", () => {
  const w = two("hold-held"), [a, b] = w.nations;
  const tile = w.tiles.find(t => t.owner === b.id && t.i !== b.capital)!;
  a.met.push(b.id); b.met.push(a.id);
  assert.equal(unheld(w, b, tile.i), false);
  for (const j of NEIGHBORS[tile.i]) if (w.tiles[j].owner === -1 && w.tiles[j].land) w.tiles[j].owner = a.id;
  turn(w, { 0: { actions: [{ type: "claim_tile", tile: [col(tile.i), row(tile.i)] }] } });
  assert.equal(tile.owner, b.id);
  assert.ok(a.lastRejected.some(r => /có người giữ/.test(r.reason)), JSON.stringify(a.lastRejected));
});
