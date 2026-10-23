// §2.4b Every ruler its own character, kept for its reign; §4.2c the homes of each age; §6.1b sites by terrain and age.
// No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, dealCharacters, step, type NationSpec } from "../src/engine.ts";
import { col, row } from "../src/hex.ts";
import { HOUSING, RULER_CHARACTERS, RULER_CHARACTER_BY_ID } from "../src/rules.ts";
import { tileSlots } from "../src/sites.ts";
import { buildObservation, systemPrompt } from "../src/ai/prompt.ts";
import { rulerChatSystem } from "../src/ai/rulerchat.ts";
import type { World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));

test("every ruler gets its own character at the start, different from the others, and keeps it", () => {
  const w = createWorld("characters", bots(8));
  const cs = w.nations.map(n => n.character!);
  assert.ok(cs.every(c => RULER_CHARACTER_BY_ID[c]));
  assert.equal(new Set(cs).size, cs.length, "all different while there are enough");
  for (let k = 0; k < 3; k++) step(w, {});
  assert.deepEqual(w.nations.map(n => n.character), cs, "kept from turn to turn");
  const id = buildObservation(w, w.nations[0]).identity as { your_character: string };
  assert.ok(id.your_character.startsWith(RULER_CHARACTER_BY_ID[cs[0]].name));
  assert.match(systemPrompt(w), /YOUR CHARACTER/);
  assert.match(rulerChatSystem(w, w.nations[0]), new RegExp(RULER_CHARACTER_BY_ID[cs[0]].name));
  // a world from before gets them on load, one each
  for (const n of w.nations) delete n.character;
  dealCharacters(w);
  assert.equal(new Set(w.nations.map(n => n.character)).size, Math.min(w.nations.length, RULER_CHARACTERS.length));
});

function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc A", capital: "Do A", people: "Dan A", flag: { layout: "h2", colors: ["#c0392b", "#ffffff"], symbol: "sun" } }] } } });
  const n = w.nations[0]; n.population = 100; n.stock.food = 1000;
  Object.assign(n.stock, { wood: 300, stone: 300, rope: 50, hide: 50, clay: 200 });
  return w;
}

test("the homes of each age open with its capability; a better home takes the weakest's place when the homes are full", () => {
  const w = founded("homes"), [n] = w.nations;
  n.inventions.push("stone_tools", "P1", "P3", "P7", "P8");
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "build", building: "house_wood" }] } } });
  assert.ok(n.lastRejected.some(r => /Cần phát minh/.test(r.reason)), "no wooden house before metal tools");
  n.inventions.push("K1", "K2", "K3"); // copper smelting: luyện-đồng
  // the homes are full of tents
  for (let k = 0; k < 6; k++) n.buildings.push({ id: w.nextBuildingId++, type: "tent", tile: n.capital, progress: 4, done: true, hp: 100 });
  const tents = n.buildings.filter(b => b.type === "tent").length;
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "build", building: "house_wood" }] } } });
  assert.deepEqual(n.lastRejected, []);
  assert.equal(n.buildings.filter(b => b.type === "house_wood").length, 1);
  assert.ok(n.buildings.filter(b => b.type === "tent").length <= tents);
});

test("rough land holds fewer buildings (mountains none), and every few ages a tile holds more", () => {
  const w = founded("sites-terrain"), [n] = w.nations;
  const t = w.tiles.find(x => x.owner === n.id && x.land && x.i !== n.capital)!;
  t.terrain = "mountain"; assert.equal(tileSlots(w, n, t.i), 0);
  t.terrain = "desert"; assert.equal(tileSlots(w, n, t.i), 1);
  t.terrain = "grass"; assert.equal(tileSlots(w, n, t.i), HOUSING.tileSlots);
  n.era = "Công Nghiệp"; // era 7: two steps of three
  assert.equal(tileSlots(w, n, t.i), HOUSING.tileSlots + 2);
  assert.equal(tileSlots(w, n, n.capital), HOUSING.centreSlots[0] + 4);
  t.terrain = "mountain";
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "build", building: "workshop", tile: [col(t.i), row(t.i)] }] } } });
  assert.ok(n.lastRejected.some(r => /đã đủ 0 công trình/.test(r.reason)), JSON.stringify(n.lastRejected));
});
