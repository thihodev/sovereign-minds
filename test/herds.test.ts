// Animals and herds (§6.4): taming, breeding within room, the goods of tended herds, dogs, oxen, riders, the cull. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { dogBonus, herdRoom, herdView, ploughBonus } from "../src/herds.ts";
import { ANIMALS, HERDS, WAR } from "../src/rules.ts";
import { migrate } from "../src/catalog.ts";
import type { AIResponse, ResKey, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc Dan", capital: "Do Dan", people: "Dan Dan", flag: { layout: "h2", colors: ["#c0392b", "#ffffff"], symbol: "sun" } }] } } });
  const n = w.nations[0];
  n.stock.food = 500; n.stability = 70; n.population = 60;
  return w;
}
const labor = (r: Partial<Record<string, number>>) => ({ gather: 0, hunt: 0, fish: 0, farm: 0, wood: 0, stone: 0, flint: 0, clay: 0, mine: 0, craft: 0, build: 0, research: 0, warrior: 0, ...r });
function turn(w: World, r: AIResponse = {}) { const out = step(w, { 0: { kind: "ok", response: r } as TurnInput }); assert.deepEqual(out.audit, [], "ledger audit"); return out; }

test("wild herds are seeded, and given to worlds from before", () => {
  const w = createWorld("herds-seed", bots(2));
  for (const k of ["wolf", "wild_goat", "aurochs", "boar", "junglefowl"] as ResKey[]) assert.ok(w.tiles.some(t => (t.cap[k] || 0) > 0), k);
  for (const t of w.tiles) for (const k of ["wolf", "wild_goat", "aurochs", "boar", "junglefowl"] as ResKey[]) { delete t.res[k]; delete t.cap[k]; }
  w.riches = 1; migrate(w);
  assert.ok((w.riches ?? 0) >= 2);
  assert.ok(w.tiles.some(t => (t.cap.aurochs || 0) > 0));
});

test("hunters tame the wild herds on their land only with Thuần dưỡng", () => {
  const w = founded("herds-tame"), n = w.nations[0];
  const t = w.tiles.find(x => x.owner === n.id && x.i !== n.capital)!;
  t.res.wild_goat = 40; t.cap.wild_goat = 40;
  turn(w, { labor: labor({ hunt: 10 }) });
  assert.equal(Math.floor(n.stock.goat || 0), 0, "no taming without the capability");
  n.inventions.push("P15");
  turn(w, { labor: labor({ hunt: 10 }) });
  assert.ok((n.flow?.goat?.[0] ?? 0) > 0, "goats brought home alive");
  assert.ok(herdView(w, n)!.wild_on_my_land.some(x => x.animal === "goat" && x.can_tame));
});

test("herds breed within their room, the excess goes to the knife, tended herds feed the people", () => {
  const w = founded("herds-breed"), n = w.nations[0];
  n.stock.pig = 4;
  const room = herdRoom(w, n);
  turn(w, { labor: labor({ farm: 5 }) });
  assert.ok((n.stock.pig || 0) > 4, `pigs bred: ${n.stock.pig}`);
  n.stock.pig = room.others * 3; // far too many
  const before = n.stock.pig;
  turn(w, { labor: labor({ farm: 5 }) });
  assert.ok(n.stock.pig < before, "the excess slaughtered");
  assert.ok((n.flow?.food?.[0] ?? 0) > 0);
});

test("dogs help the hunt, oxen the plough, horses ride to war; the cull gives meat at once", () => {
  const w = founded("herds-use"), n = w.nations[0];
  n.stock.dog = 5; n.stock.cattle = 2;
  assert.ok(Math.abs(dogBonus(n, 10) - HERDS.dogHunt) < 1e-9, "a dog for two hunters: the full bonus");
  assert.ok(Math.abs(ploughBonus(n, 12) - HERDS.plough * 0.5) < 1e-9, "an ox for three farmers");
  assert.ok(WAR.weapon.horse > 0, "a horse counts like a weapon");
  const food = n.stock.food!;
  turn(w, { actions: [{ type: "cull", animal: "cattle", count: 1 }] });
  assert.deepEqual(n.lastRejected, []);
  assert.ok(n.lastEvents.some(e => e.includes(`+${ANIMALS.cattle.meat} lương thực`)), JSON.stringify(n.lastEvents));
  assert.ok(n.stock.food! > 0 && food > 0);
});
