// Provinces (§2.8): land by nearest centre, people by housing, a mood of their own, and a province that leaves
// with its land. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, housing, ownedTiles, step, type NationSpec } from "../src/engine.ts";
import { dist, within } from "../src/hex.ts";
import { links, nearestCentre, yieldShares } from "../src/connect.ts";
import { provinces, restlessProvince } from "../src/provinces.ts";
import { buildObservation } from "../src/ai/prompt.ts";
import { advice } from "../src/ai/advice.ts";
import { PROVINCE } from "../src/rules.ts";
import type { AIResponse, Nation, TurnInput, World } from "../src/types.ts";

const bots = (k: number): NationSpec[] => Array.from({ length: k }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "NuocA", capital: "DoA", people: "DanA", flag: { layout: "h2", colors: ["#c0392b", "#ffffff"], symbol: "sun" } }] } } });
  const n = w.nations[0]; n.stock.food = 3000; n.stock.wood = 100; n.population = 100;
  return w;
}
/** A settlement `d` tiles from the capital with its ring of land, no road and no water: cut off, past its grace. */
function farSettlement(w: World, n: Nation, d = 9, name = "Xa Xôi"): number {
  const t = w.tiles.find(t => t.land && t.owner === -1 && !["mountain", "icewall", "glacier"].includes(t.terrain) && dist(t.i, n.capital) === d
    && within(t.i, 1).every(j => w.tiles[j].land && w.tiles[j].owner === -1 && w.tiles[j].terrain !== "icewall"))!;
  for (const j of within(t.i, 1)) w.tiles[j].owner = n.id;
  n.settlements.push({ tile: t.i, name, tick: w.tick - 50 });
  return t.i;
}
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? {} };
  const out = step(w, inputs);
  assert.deepEqual(out.audit, [], "ledger audit");
  return out;
}

test("every tile in the province of its nearest centre; the people shared by housing, summing to the population", () => {
  const w = founded("prov-split");
  const n = w.nations[0];
  const st = farSettlement(w, n);
  n.population = Math.floor(housing(w, n)); // room for everyone: no province is crowded
  const ps = provinces(w, n);
  assert.equal(ps.length, 2);
  assert.equal(ps[0].capital, true); assert.equal(ps[0].centre, n.capital); assert.equal(ps[0].name, "DoA");
  assert.equal(ps[1].centre, st); assert.equal(ps[1].name, "Xa Xôi");
  const all = ps.flatMap(p => p.tiles).sort((a, b) => a - b);
  assert.deepEqual(all, ownedTiles(w, n.id).map(t => t.i), "each tile in exactly one province");
  const cs = [...links(w, n).keys()];
  for (const p of ps) for (const i of p.tiles) assert.equal(nearestCentre(cs, i).c, p.centre);
  assert.equal(ps.reduce((s, p) => s + p.people, 0), n.population);
  assert.ok(ps[0].people > ps[1].people && ps[1].people > 0, `${ps[0].people}/${ps[1].people}`);
  // the split follows housing, the same answer every time
  const ratio = ps[1].people / n.population, share = ps[1].housing / (ps[0].housing + ps[1].housing);
  assert.ok(Math.abs(ratio - share) < 0.02, `${ratio} vs ${share}`);
  assert.deepEqual(provinces(w, n).map(p => p.people), ps.map(p => p.people));
  assert.equal(ps[1].way, null);
  assert.deepEqual(ps[1].causes, ["cut_off", "ungoverned"]);
  // the nation's AI sees them, and is told what to do about the far one
  const obs = buildObservation(w, n) as { provinces: Array<Record<string, unknown>> };
  assert.equal(obs.provinces.length, 2);
  assert.equal(obs.provinces[1].way_to_capital, "CUT OFF");
  turn(w);
  assert.ok(advice(w, n).some(a => /Tỉnh Xa Xôi/.test(a.text) && /bá tước/.test(a.text)), JSON.stringify(advice(w, n)));
});

test("a cut-off, ungoverned province grows restless; a loyal governor calms it and its land yields more", () => {
  const w = founded("prov-governor");
  const n = w.nations[0];
  const st = farSettlement(w, n);
  n.stability = 70; n.population = Math.floor(housing(w, n)) - 5;
  const unrest = () => n.provinceUnrest?.[String(st)] ?? 0;
  turn(w);
  assert.equal(unrest(), PROVINCE.cutOff + PROVINCE.ungoverned - PROVINCE.fade);
  for (let k = 0; k < 8; k++) turn(w);
  const high = unrest();
  assert.ok(high >= 40, String(high));
  const land = provinces(w, n).find(p => p.centre === st)!.tiles[1];
  const before = yieldShares(w, n)(land);
  n.officials = [{ id: 900, name: "Bá", domain: "governor", seat: st, skill: 5, loyalty: 90, since: w.tick - 60, lastAct: "" }];
  assert.ok(Math.abs(yieldShares(w, n)(land) - before * (1 + PROVINCE.yield * 5)) < 1e-9, "more from the governed land");
  assert.deepEqual(provinces(w, n).find(p => p.centre === st)!.causes, ["cut_off"], "no longer ungoverned");
  turn(w);
  assert.equal(unrest(), Math.round((high + PROVINCE.cutOff - PROVINCE.fade - PROVINCE.calm * 5) * 10) / 10, "calmer every turn");
  assert.ok(unrest() < high);
  // a disloyal governor does nothing
  n.officials[0].loyalty = 10;
  assert.equal(provinces(w, n).find(p => p.centre === st)!.loyal, false);
  assert.equal(yieldShares(w, n)(land), before);
});

test("a restless province presses on the nation, and the Watcher lets it go with its land", () => {
  const w = founded("prov-secede");
  const n = w.nations[0];
  const st = farSettlement(w, n);
  n.buildings.push({ id: w.nextBuildingId++, type: "tent", tile: st, progress: 999, done: true, hp: 100 });
  n.provinceUnrest = { [String(st)]: 80 };
  n.discontent = 100; n.stability = 20;
  const prov = provinces(w, n).find(p => p.centre === st)!;
  assert.ok(prov.people >= PROVINCE.minPeople, String(prov.people));
  assert.equal(restlessProvince(w, n)?.centre, st);
  turn(w);
  const x = w.schisms!.at(-1)!;
  assert.equal(x.status, "pending");
  assert.equal(x.province, st); assert.equal(x.provinceName, "Xa Xôi"); assert.equal(x.site, st);
  assert.match(x.grievance, /tỉnh Xa Xôi bị cô lập/);
  assert.ok(n.lastEvents.some(e => /Tỉnh Xa Xôi .* muốn tách khỏi/.test(e)), JSON.stringify(n.lastEvents));
  Object.assign(x, { status: "approved", controller: "bot", provider: "bot", model: "bot" });
  const pop = n.population, land = provinces(w, n).find(p => p.centre === st)!;
  turn(w);
  assert.equal(x.status, "done");
  const c = w.nations[x.nation!];
  assert.equal(c.capital, st, "the settlement is the new nation's capital");
  assert.ok(land.tiles.every(i => w.tiles[i].owner === c.id), "it keeps the province's land");
  assert.ok(!n.settlements.some(s => s.tile === st), "the parent no longer holds the settlement");
  assert.ok(c.buildings.some(b => b.type === "tent" && b.tile === st) && !n.buildings.some(b => b.tile === st), "the buildings on it go too");
  // the people living there when they go (the turn's births and deaths came first)
  assert.ok(c.population <= land.people + 2 && c.population >= land.people * 0.7 && c.population + n.population <= pop, `${c.population} of ${pop}, province ${land.people}`);
  assert.ok((c.stock.food || 0) > 0);
  assert.ok(n.lastEvents.some(e => /Tỉnh Xa Xôi .* tách ra/.test(e)));
  turn(w, { [c.id]: { actions: [{ type: "found_nation", name: "Tân Quốc", capital: "Xa Xôi", people: "người Tân", flag: { layout: "v3", colors: ["#7d3c98", "#ffffff"], symbol: "wolf" } }] } });
  assert.equal(c.founded, true, JSON.stringify(c.lastRejected));
  assert.equal(w.tiles[c.capital].owner, c.id);
});

test("no province fits: the faction still seeks new land", () => {
  const w = founded("prov-fallback");
  const n = w.nations[0];
  const st = farSettlement(w, n);
  n.officials = [{ id: 900, name: "Bá", domain: "governor", seat: st, skill: 3, loyalty: 90, since: w.tick - 40, lastAct: "" }];
  n.discontent = 100; n.stability = 20;
  turn(w);
  const x = w.schisms!.at(-1)!;
  assert.equal(x.province, undefined);
  assert.equal(w.tiles[x.site].owner, -1);
});
