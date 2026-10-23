// §2.6b Inviolable waters: a foreign fleet poaching in a nation's waters is an act of war. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { NEIGHBORS } from "../src/hex.ts";
import { borderOf } from "../src/border.ts";
import { SEA_RIGHTS } from "../src/rules.ts";
import { advice } from "../src/ai/advice.ts";
import type { World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });

test("a foreign fleet in our waters takes our fish, and we have a just cause of war", () => {
  const w: World = createWorld("sea-rights", bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc A", capital: "Do A", people: "Dan A", flag: flag("#c0392b") }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc B", capital: "Do B", people: "Dan B", flag: flag("#3355ff") }] } } });
  const [a, b] = w.nations;
  // B's only tile touching A is a stretch of water, full of fish, with no harbour of B's near it
  const sea = w.tiles.find(t => t.terrain === "shallow" && t.owner === -1 && NEIGHBORS[t.i].some(j => w.tiles[j].land && w.tiles[j].owner === -1 && w.tiles[j].terrain !== "icewall"))!;
  assert.ok(sea, "a stretch of shallow sea by a free shore");
  const shore = w.tiles[NEIGHBORS[sea.i].find(j => w.tiles[j].land && w.tiles[j].owner === -1 && w.tiles[j].terrain !== "icewall")!];
  shore.owner = a.id; // A's fishermen live on that shore
  sea.owner = b.id; sea.res.fish = 100; sea.cap.fish = 100;
  for (const t of w.tiles) if (t.owner === b.id && t.i !== sea.i && NEIGHBORS[t.i].some(j => w.tiles[j].owner === a.id)) t.owner = -1;
  b.buildings = b.buildings.filter(x => x.type !== "pier" && x.type !== "harbor");
  for (const n of w.nations) { n.stock.food = 600; n.population = 60; n.stability = 70; }
  a.met.push(b.id); b.met.push(a.id);
  let hit = false;
  for (let k = 0; k < 60 && !hit; k++) {
    borderOf(w, a.id, b.id).tension = 99; borderOf(w, a.id, b.id).brawls = [];
    step(w, { 0: { kind: "ok", response: {} }, 1: { kind: "ok", response: {} } });
    hit = borderOf(w, a.id, b.id).incidents.some(x => x.text.includes(`xâm phạm lãnh hải ${b.name}`));
  }
  assert.ok(hit, `a fleet poached in B waters: ${JSON.stringify(borderOf(w, a.id, b.id).incidents)} wars ${w.wars.length} owner ${sea.owner}`);
  assert.ok((sea.res.fish ?? 0) < 100 + 1e-9, "the catch is taken from B's water");
  assert.ok((b.casusBelli[String(a.id)] ?? -1) >= w.tick - 1 + SEA_RIGHTS.cause - 1, "an act of war: B has a just cause");
  assert.ok(b.lastEvents.some(e => /hành động gây chiến/.test(e)) || advice(w, b).some(x => /xâm phạm lãnh hải/.test(x.text)));
});
