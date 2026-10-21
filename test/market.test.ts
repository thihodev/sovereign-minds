// Rich veins (§2.10), prices (§6.3) and what each nation is rich in (§7.10). No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { dist, NEIGHBORS } from "../src/hex.ts";
import { migrate } from "../src/catalog.ts";
import { localPrice, price, shortages, specialtiesOf, surpluses, techEdge, veinsNear, worth } from "../src/market.ts";
import { buildObservation } from "../src/ai/prompt.ts";
import { advice } from "../src/ai/advice.ts";
import { GOOD_VALUE, MARKET, VEIN } from "../src/rules.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function founded(seed: string, k = 2): World {
  const w = createWorld(seed, bots(k));
  const acts: Record<number, TurnInput> = {};
  for (const n of w.nations) acts[n.id] = { kind: "ok", response: { actions: [{ type: "found_nation", name: `Nuoc${n.id}x`, capital: `Do${n.id}x`, people: `Dan${n.id}x`, flag: flag(["#c0392b", "#3355ff", "#22aa44"][n.id]) }] } };
  step(w, acts);
  for (const n of w.nations) { n.stock.food = 400; n.stability = 80; }
  return w;
}
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? {} };
  const out = step(w, inputs);
  assert.deepEqual(out.audit, [], "ledger audit");
  return out;
}

test("rich veins: a few of each good, spread apart, with far larger reserves; old worlds get them too", () => {
  const w = createWorld("veins", bots(4));
  const veins = w.tiles.filter(t => t.vein);
  for (const [g, count] of Object.entries(VEIN.count)) {
    const mine = veins.filter(t => t.vein === g);
    assert.ok(mine.length > 0 && mine.length <= count, `${g}: ${mine.length}`);
    for (const a of mine) for (const b of mine) if (a !== b) assert.ok(dist(a.i, b.i) >= VEIN.apart);
    for (const t of mine) assert.ok((t.cap[t.vein!] || 0) >= 2 * VEIN.mult, `${g} vein holds more`);
  }
  // the same seed, the same veins
  assert.deepEqual(createWorld("veins", bots(4)).tiles.filter(t => t.vein).map(t => t.i), veins.map(t => t.i));
  // a world saved before v0.17
  for (const t of w.tiles) delete t.vein;
  migrate(w);
  assert.ok(w.tiles.some(t => t.vein));
});

test("a rich vein yields half as much again for the same work", () => {
  const w = founded("vein-yield", 1), n = w.nations[0];
  const t = w.tiles.find(x => x.owner === n.id && x.i !== n.capital && x.land)!;
  for (const x of w.tiles) if (x.owner === n.id) { delete x.res.flint; delete x.cap.flint; delete x.vein; }
  t.res.flint = 500; t.cap.flint = 500; t.vein = "flint";
  n.labor = { ...n.labor, flint: 4 };
  const before = n.stock.flint || 0, left = t.res.flint;
  turn(w);
  const dug = left - (t.res.flint || 0), got = (n.stock.flint || 0) - before;
  assert.ok(dug > 0, "worked the vein");
  assert.ok(Math.abs(got - dug * (1 + VEIN.yield)) < 1e-6, `${dug} dug, ${got} reached the stores`);
});

test("prices: a good everyone wants and nobody holds grows dear; a heap nobody uses grows cheap", () => {
  const w = founded("prices", 2), [a, b] = w.nations;
  for (const n of w.nations) { n.stock.bone = 2000; n.stock.flint = 0; n.inventions.push("P1"); } // blades need flint
  for (const x of w.tiles) if (x.owner >= 0) { delete x.res.flint; delete x.cap.flint; }
  for (let k = 0; k < 8; k++) turn(w);
  assert.ok(price(w, "flint") > GOOD_VALUE.flint * 1.2, `flint ${price(w, "flint")}`);
  assert.ok(price(w, "bone") < GOOD_VALUE.bone * 0.7, `bone ${price(w, "bone")}`);
  assert.ok(price(w, "flint") <= GOOD_VALUE.flint * MARKET.max && price(w, "bone") >= GOOD_VALUE.bone * MARKET.min);
  assert.ok(localPrice(w, a, "flint") > GOOD_VALUE.flint * MARKET.dear);
  assert.ok(shortages(w, a).some(s => s.good === "flint"), JSON.stringify(shortages(w, a)));
  assert.ok(surpluses(w, b).some(s => s.good === "bone"), JSON.stringify(surpluses(w, b)));
  assert.equal(worth(w, { flint: 2, bone: 10 }), Math.round((2 * price(w, "flint") + 10 * price(w, "bone")) * 10) / 10);
});

test("specialties, edge, veins near: what the AI sees and the advice it gets", () => {
  const w = founded("riches", 2), [a, b] = w.nations;
  a.met.push(b.id); b.met.push(a.id);
  // a salt vein on A's land; B's land has none; a free clay vein next to B
  for (const x of w.tiles) { if (x.vein) delete x.vein; if (x.owner >= 0) { delete x.res.salt; delete x.cap.salt; } }
  const v = w.tiles.find(x => x.owner === a.id && x.land && x.i !== a.capital)!;
  v.res.salt = 300; v.cap.salt = 300; v.vein = "salt";
  const free = w.tiles.find(x => x.owner < 0 && x.land && NEIGHBORS[x.i].some(j => w.tiles[j].owner === b.id))!;
  free.res.clay = 400; free.cap.clay = 400; free.vein = "clay";
  a.inventions.push("K99_fake"); // an invention nobody else has
  turn(w);
  const sa = specialtiesOf(w, a);
  assert.ok(sa.some(s => s.good === "salt" && s.veins.includes(v.i)), JSON.stringify(sa));
  assert.ok(!specialtiesOf(w, b).some(s => s.good === "salt"));
  assert.ok(techEdge(w, a).inventions.includes("K99_fake"));
  assert.ok(veinsNear(w, b).some(x => x.tile === free.i && x.owner < 0));
  const obs = buildObservation(w, b) as Record<string, any>;
  assert.ok(obs.market.veins_near.some((x: any) => x.good === "clay" && x.owner === "free"));
  assert.ok(obs.market.nations.some((x: any) => x.nation === a.name && x.rich_in.includes("salt")));
  assert.ok("prices" in obs.market && "my_shortages" in obs.market);
  // a shortage the advice names, with the neighbour rich in it
  b.inventions.push("P13"); b.stock.clay = 0; // pottery wants clay
  for (const x of w.tiles) if (x.owner === b.id) { delete x.res.clay; delete x.cap.clay; }
  for (const x of w.tiles) if (x.owner === a.id && x.land) { x.res.clay = 400; x.cap.clay = 400; }
  for (let k = 0; k < 3; k++) turn(w);
  const adv = advice(w, b).map(x => x.text).join("\n");
  assert.match(adv, /Thiếu đất sét/);
  assert.match(adv, new RegExp(a.name));
  assert.match(adv, /mạch đất sét tự do/);
});

test("trade offers to a nation show their worth at world prices", () => {
  const w = founded("worth", 2), [a, b] = w.nations;
  a.stock.hide = 50; a.met.push(b.id); b.met.push(a.id);
  turn(w, { 0: { actions: [{ type: "trade_offer", to: b.name, give: { hide: 5 }, get: { food: 10 } }] } });
  const obs = buildObservation(w, b) as Record<string, any>;
  const off = obs.trade_offers_to_me.find((o: any) => o.from === a.name);
  assert.ok(off, JSON.stringify(a.lastRejected));
  assert.equal(off.worth.they_give, worth(w, { hide: 5 }));
});
