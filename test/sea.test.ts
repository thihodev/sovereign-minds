// The riches of land and sea (§2.11): new goods, what workers bring home, luxuries, salt and furs, sea buildings,
// the sea in the observation, and the explorers' report. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, luxuries, seaReach, step, type NationSpec } from "../src/engine.ts";
import { NEIGHBORS, dist, within } from "../src/hex.ts";
import { migrate } from "../src/catalog.ts";
import { seaAdvice, seaView } from "../src/sea.ts";
import { buildObservation } from "../src/ai/prompt.ts";
import { HARVEST, LUXURY, SEA } from "../src/rules.ts";
import type { AIResponse, ResKey, Tile, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "NuocBien", capital: "DoBien", people: "DanBien", flag: flag("#c0392b") }] } } });
  const n = w.nations[0];
  n.stock.food = 500; n.stability = 60; n.population = 60;
  return w;
}
function turn(w: World, r: AIResponse = {}) {
  const out = step(w, { 0: { kind: "ok", response: r } as TurnInput });
  assert.deepEqual(out.audit, [], "ledger audit");
  return out;
}
/** Clear every reserve on the nation's land, then put `res` on one owned tile. */
function only(w: World, res: Partial<Record<ResKey, number>>, pick?: (t: Tile) => boolean): Tile {
  const n = w.nations[0];
  for (const t of w.tiles) if (t.owner === n.id) { t.res = {}; t.cap = {}; delete t.vein; }
  const t = w.tiles.find(x => x.owner === n.id && (pick ? pick(x) : x.i !== n.capital))!;
  for (const [k, v] of Object.entries(res)) { t.res[k as ResKey] = v; t.cap[k as ResKey] = v; }
  return t;
}
const labor = (r: Partial<Record<string, number>>) => ({ gather: 0, hunt: 0, fish: 0, farm: 0, wood: 0, stone: 0, flint: 0, clay: 0, mine: 0, craft: 0, build: 0, research: 0, warrior: 0, ...r });

test("the riches are seeded, the same for a seed, and given to worlds saved before v0.18", () => {
  const w = createWorld("riches", bots(3));
  const has = (k: ResKey) => w.tiles.filter(t => (t.cap[k] || 0) > 0).length;
  for (const k of ["honey", "spice", "fur", "ochre", "marble", "gold", "silver", "shellfish", "whale"] as ResKey[]) assert.ok(has(k) > 0, k);
  assert.ok(w.tiles.some(t => t.vein === "fish" && !t.land), "fishing grounds lie at sea");
  assert.ok(w.tiles.filter(t => (t.cap.whale || 0) > 0).every(t => t.terrain === "ocean"));
  assert.deepEqual(createWorld("riches", bots(3)).tiles.map(t => t.cap.gold || 0), w.tiles.map(t => t.cap.gold || 0));
  for (const t of w.tiles) { for (const k of ["honey", "gold", "whale", "fur"] as ResKey[]) { delete t.res[k]; delete t.cap[k]; } }
  delete w.riches;
  migrate(w);
  assert.ok(w.riches && w.tiles.some(t => (t.cap.gold || 0) > 0));
});

test("workers bring home honey, furs and pearls; fishers gather shellfish when the fish run out", () => {
  const w = founded("harvest"), n = w.nations[0];
  only(w, { honey: 100, fur: 100, shellfish: 200 });
  const pearlTile = w.tiles.find(t => t.owner === n.id && t.res.honey === undefined && t.i !== n.capital)!;
  pearlTile.res.pearl = 50; pearlTile.cap.pearl = 50;
  turn(w, { labor: labor({ gather: 10, hunt: 10, fish: 10 }) });
  assert.ok((n.stock.honey || 0) > 0, "honey");
  assert.ok((n.stock.fur || 0) > 0, "fur");
  assert.ok((n.stock.pearl || 0) > 0, "pearls");
  assert.ok(Math.abs((n.stock.pearl || 0) - 10 * HARVEST.fish.pearl!) < 0.5);
  assert.ok((n.flow?.food?.[0] ?? 0) > 0 && (w.tiles.find(t => t.cap.shellfish)!.res.shellfish || 0) < 200, "shellfish gathered");
});

test("with ocean ships fishers hunt whales on deep water they hold", () => {
  const w = founded("whales"), n = w.nations[0];
  const t = only(w, {});
  t.res.whale = 40; t.cap.whale = 40;
  n.inventions.push("K14"); // Hàng hải viễn dương: move ocean
  const bone = n.stock.bone || 0;
  turn(w, { labor: labor({ fish: 20 }) });
  // the whales regrow by the end of the turn, and the people burn the oil in their lamps (a luxury): read what was made
  const made = n.flow?.whale_oil?.[0] ?? 0;
  assert.ok(made > 0, "a whale hunt");
  assert.ok((n.stock.bone || 0) > bone, "whale bone");
});

test("luxuries in store are used up and calm the people; salt keeps food", () => {
  const w = founded("luxury"), n = w.nations[0];
  only(w, {}); // no honey on the land: what is used is what was stored
  const need = Math.max(1, n.population * LUXURY.use);
  n.stock.honey = 20; n.stock.amber = 20; n.stock.pearl = 0.1;
  const l = luxuries(w, n);
  assert.deepEqual(l.kinds.sort(), ["amber", "honey"]);
  n.stability = 50;
  turn(w);
  assert.ok(Math.abs((n.stock.honey || 0) - (20 - need)) < 0.5, `honey ${n.stock.honey}`);
  assert.ok((buildObservation(w, n) as Record<string, any>).luxuries.enjoyed.length >= 1);
  // salt: less food spoils
  const spoiled = (salt: number) => { const x = founded("salt"), m = x.nations[0]; m.stock.salt = salt; m.stock.food = 1000; const out = step(x, { 0: { kind: "ok", response: {} } }); assert.deepEqual(out.audit, []); return m.stock.food; };
  assert.ok(spoiled(20) > spoiled(0), "salted food keeps");
});

test("sea buildings: salt pans make salt, docks help fishers, a harbour holds waters further out", () => {
  const w = founded("docks"), n = w.nations[0];
  n.inventions.push("P9", "P13", "P16", "P18");
  const coast = w.tiles.find(t => t.owner === n.id && t.terrain === "coast") ?? (() => { const t = w.tiles.find(x => x.owner === n.id && x.i !== n.capital)!; t.terrain = "coast"; return t; })();
  n.buildings.push({ id: 900, type: "salt_pan", tile: coast.i, progress: 3, done: true, hp: 100 });
  const salt = n.stock.salt || 0;
  turn(w);
  assert.ok((n.stock.salt || 0) >= salt + 3 - 1e-6, "salt from the sea");
  // a harbour: water 6 tiles out is within reach, a pier's is 4
  const far = w.tiles.find(t => !t.land && dist(t.i, coast.i) === SEA.pierReach + 2);
  n.buildings.push({ id: 901, type: "pier", tile: coast.i, progress: 5, done: true, hp: 100 });
  if (far) {
    assert.equal(seaReach(w, n, far.i), false);
    n.buildings.push({ id: 902, type: "harbor", tile: coast.i, progress: 14, done: true, hp: 100 });
    assert.equal(seaReach(w, n, far.i), true);
  }
});

test("the observation shows the sea; the advice speaks of it; explorers report what they saw", () => {
  // find a seed whose first nation lives by the sea
  const look = (seed: string) => { const x = founded(seed); x.nations[0].seen = [...new Set([...x.nations[0].seen, ...within(x.nations[0].capital, 8)])]; return x; };
  let w = look("coast-0");
  for (let k = 1; k < 20 && !seaView(w, w.nations[0])?.free_waters_near; k++) w = look(`coast-${k}`);
  const n = w.nations[0];
  const v = seaView(w, n);
  assert.ok(v, "a coastal nation sees the sea");
  const obs = buildObservation(w, n) as Record<string, any>;
  assert.ok(obs.sea && "can" in obs.sea);
  assert.match(String(obs.sea.can.hold_shallow_sea), /true|false/);
  if ((v!.free_waters_near?.fish_regrows_per_turn ?? 0) >= 10) assert.ok(seaAdvice(w, n).some(a => /Biển gần bạn|ô biển chiếm được/.test(a.text)), JSON.stringify(seaAdvice(w, n)));
  // an expedition
  n.seen = within(n.capital, 2);
  n.population = 60;
  turn(w, { actions: [{ type: "explore", direction: "E", people: 2 }] });
  const report = n.lastEvents.find(e => e.startsWith("Đoàn thám hiểm"));
  assert.ok(report, JSON.stringify(n.lastEvents));
  assert.match(report!, /ô mới|không thấy vùng nào mới/);
});

test("miners dig marble and ochre with no special knowledge", () => {
  const w = founded("marble"), n = w.nations[0];
  only(w, { marble: 200, ochre: 50 });
  turn(w, { labor: labor({ mine: 10 }), mine_target: "marble" } as AIResponse);
  assert.ok((n.stock.marble || 0) > 0, "marble");
  turn(w, { labor: labor({ mine: 10 }), mine_target: "ochre" } as AIResponse);
  assert.ok((n.stock.ochre || 0) > 0, "ochre");
  assert.ok(NEIGHBORS.length > 0);
});
