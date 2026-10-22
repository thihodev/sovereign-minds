// §6.8 Electric power: plants burn coal (or none, by a river in the hills), the grid follows the nation's roads to its
// centres; power lifts craft and research and lights the homes. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, mods, step, type NationSpec } from "../src/engine.ts";
import { NEIGHBORS, col, row } from "../src/hex.ts";
import { POWER } from "../src/rules.ts";
import { needs } from "../src/living.ts";
import { powerView } from "../src/power.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Điện Quốc", capital: "Đèn Châu", people: "người Đèn", flag: { layout: "h2", colors: ["#c0392b", "#ffffff"], symbol: "sun" } }] } } });
  const n = w.nations[0]; n.population = 200; n.stability = 70; n.inventions.push("K18");
  return w;
}
function turn(w: World, r: AIResponse = { actions: [{ type: "research", invention: "P2" }] }) {
  const out = step(w, { 0: { kind: "ok", response: r } as TurnInput });
  assert.deepEqual(out.audit, [], "ledger audit");
  return out;
}
const at = (i: number) => [col(i), row(i)];

test("a thermal plant burns coal, is paid from the treasury and lights the centres its roads join", () => {
  const w = founded("power"), [n] = w.nations;
  const base = mods(w, n).role.craft || 0;
  n.buildings.push({ id: w.nextBuildingId++, type: "power_plant", tile: n.capital, progress: 20, done: true, hp: 100 });
  // a settlement not joined by road stays dark
  const far = w.tiles.find(t => t.land && t.owner === -1 && Math.abs(col(t.i) - col(n.capital)) > 4 && !NEIGHBORS[t.i].some(j => (w.tiles[j].road || 0) > 0))!;
  far.owner = n.id; n.settlements.push({ tile: far.i, name: "Xóm Tối", tick: w.tick });
  n.stock.coal = 10; n.stock.coin = 50;
  const coal = n.stock.coal;
  turn(w);
  const p = n.power!;
  assert.ok(p, "the plant ran");
  assert.equal(p.made, 20);
  assert.ok(p.centres.includes(n.capital) && !p.centres.includes(far.i), JSON.stringify(p.centres));
  assert.ok(p.share > 0 && p.share < 1, `share ${p.share}`);
  assert.ok((n.stock.coal || 0) <= coal - 2 + 1e-9, "coal burnt");
  assert.equal(n.treasury!.last?.out.power, POWER.upkeep, "upkeep paid from the treasury");
  assert.ok((mods(w, n).role.craft || 0) > base, "craft lifted");
  const v = powerView(w, n)!;
  assert.deepEqual(v.off_grid, ["Xóm Tối"]);
  // no coal, no oil: the plant stands idle
  n.stock.coal = 0; n.stock.oil = 0;
  turn(w);
  assert.equal(n.power!.made, 0); assert.equal(n.power!.idle, 1); assert.equal(n.power!.share, 0);
  // oil when the coal is gone
  n.stock.oil = 5;
  turn(w);
  assert.equal(n.power!.made, 20); assert.ok((n.stock.oil || 0) <= 3 + 1e-9);
});

test("power lights the homes: the era-7 need is met by the grid", () => {
  const w = founded("light"), [n] = w.nations;
  n.population = 100;
  n.buildings.push({ id: w.nextBuildingId++, type: "hydro_dam", tile: n.capital, progress: 30, done: true, hp: 100 });
  n.stock.coin = 50; n.stock.coal = 0; n.stock.oil = 0; n.stock.whale_oil = 0;
  turn(w);
  assert.ok((n.power?.share ?? 0) >= POWER.light, `share ${n.power?.share}`);
  assert.equal(needs(w, n).find(x => x.id === "power")!.met, true);
  n.buildings = n.buildings.filter(b => b.type !== "hydro_dam");
  turn(w);
  assert.equal(n.power, undefined);
  assert.equal(needs(w, n).find(x => x.id === "power")!.met, false);
});

test("a dam must stand on a river falling from the hills", () => {
  const w = founded("dam"), [n] = w.nations;
  n.stock.stone = 100; n.stock.iron = 50; n.stock.copper = 50;
  const flat = w.tiles.find(t => t.owner === n.id && t.land && !(t.river && (t.terrain === "hill" || NEIGHBORS[t.i].some(j => ["hill", "mountain"].includes(w.tiles[j].terrain)))))!;
  turn(w, { actions: [{ type: "build", building: "hydro_dam", tile: at(flat.i) }] });
  assert.ok(n.lastRejected.some(r => /cần ô có sông/.test(r.reason)), JSON.stringify(n.lastRejected));
  // a thermal plant needs the invention
  const w2 = createWorld("dam2", bots(1));
  step(w2, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Tối Quốc", capital: "Tối", people: "người Tối", flag: { layout: "h2", colors: ["#000000", "#ffffff"], symbol: "sun" } }] } } });
  step(w2, { 0: { kind: "ok", response: { actions: [{ type: "build", building: "power_plant" }] } } });
  assert.ok(w2.nations[0].lastRejected.some(r => /Cần phát minh/.test(r.reason)));
});
