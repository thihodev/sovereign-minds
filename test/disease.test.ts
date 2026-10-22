// §9.6 Diseases: each spreads and kills its own way; cures keep them out; a people that suffered one studies its
// cure faster. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, inventionCost, mods, step, type NationSpec } from "../src/engine.ts";
import { NEIGHBORS } from "../src/hex.ts";
import { sharedRivers } from "../src/border.ts";
import { contagious, diseaseChances, diseaseStrike, immuneTo } from "../src/contagion.ts";
import { DISEASE, DISEASE_BY_ID, EVENTS } from "../src/rules.ts";
import type { AIResponse, Nation, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function two(seed: string, touch = true): World {
  const w = createWorld(seed, bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc A", capital: "Do A", people: "Dan A", flag: flag("#c0392b") }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc Bình", capital: "Do Bình", people: "Dan Bình", flag: flag("#3355ff") }] } } });
  const [a, b] = w.nations;
  if (touch) {
    for (const t of w.tiles) if (t.owner === b.id) t.owner = -1;
    const edge = w.tiles.filter(t => t.owner === -1 && t.land && t.terrain !== "mountain" && NEIGHBORS[t.i].some(j => w.tiles[j].owner === a.id));
    for (const t of edge) t.owner = b.id;
    b.capital = edge[0].i;
  }
  for (const n of w.nations) { n.stock.food = 400; n.population = 60; n.stability = 80; }
  return w;
}
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? { actions: [{ type: "research", invention: "P2" }] } };
  const out = step(w, inputs);
  assert.deepEqual(out.audit, [], "ledger audit");
  return out;
}
/** Only contagion in these tests (no disease a people catches by itself); `set` changes a disease for the test. */
function quiet<T>(f: () => T, id?: string, set: Partial<Record<"border" | "trade" | "river", number>> = {}): T {
  const own = EVENTS.plague.chance, d = id ? DISEASE_BY_ID[id] : undefined, was = d ? { border: d.border, trade: d.trade, river: d.river } : undefined;
  EVENTS.plague.chance = 0; if (d) Object.assign(d, set);
  try { return f(); } finally { EVENTS.plague.chance = own; if (d) Object.assign(d, was); }
}
const say = () => {};
function sick(w: World, n: Nation, id: string) { n.disease = id; n.outbreakUntil = w.tick + DISEASE_BY_ID[id].sick - 1; n.immuneUntil = n.outbreakUntil + DISEASE_BY_ID[id].immune; }

test("smallpox spreads hard and leaves its survivors immune for long; flu kills few", () => quiet(() => {
  const w = two("smallpox"), [a, b] = w.nations;
  sick(w, a, "smallpox");
  turn(w);
  assert.ok(contagious(b, w.tick), "B caught it over the border");
  assert.equal(b.disease, "smallpox");
  assert.ok(b.lastEvents.some(e => /Đậu mùa/.test(e)), b.lastEvents.join(" | "));
  assert.ok(immuneTo(b, DISEASE_BY_ID.smallpox, w.tick + 30), "immune for long");
  assert.ok(!immuneTo(b, DISEASE_BY_ID.flu, w.tick + 5), "but not to the flu");
  // the flu kills a few in a hundred at most
  const w2 = two("flu"), n = w2.nations[0]; n.population = 200; n.stock.herbs = 0;
  const dead = diseaseStrike(w2, n, null as never, say, DISEASE_BY_ID.flu, 0.99, { medicine: 0, caps: new Set() });
  assert.ok(dead <= 200 * 0.06 && dead > 0, `${dead}`);
}, "smallpox", { border: 1 }));

test("cholera goes down a shared river, not over a border without one", () => quiet(() => {
  const w = two("cholera", false), [a, b] = w.nations;
  // give both peoples land on the same river
  const r = w.rivers.find(x => x.length >= 6)!;
  w.tiles[r[0]].owner = a.id; w.tiles[r[r.length - 1]].owner = b.id;
  assert.ok(sharedRivers(w, a.id, b.id) > 0);
  sick(w, a, "cholera");
  turn(w);
  assert.equal(b.disease, "cholera");
  assert.ok(b.lastEvents.some(e => /theo dòng sông chung/.test(e)), b.lastEvents.join(" | "));
}, "cholera", { river: 1, border: 0, trade: 0 }));

test("a cure keeps a disease out, and spares the dead", () => quiet(() => {
  const count = (cure: boolean) => {
    const w = two("cure"), [a, b] = w.nations;
    if (cure) b.inventions.push("K25");
    let hits = 0;
    for (let k = 0; k < 16; k++) { sick(w, a, "smallpox"); delete b.immunity; b.outbreakUntil = -1; b.immuneUntil = -1; b.disease = undefined; b.population = 60; turn(w); if (contagious(b, w.tick - 1) || b.disease === "smallpox") hits++; }
    return hits;
  };
  assert.equal(count(false), 16);
  assert.ok(count(true) <= 3, "chủng đậu stops 95%");
  const w = two("cure-dead"), n = w.nations[0]; n.population = 200;
  const plain = diseaseStrike(w, n, null as never, say, DISEASE_BY_ID.smallpox, 0.5, { medicine: 0, caps: new Set() });
  n.population = 200;
  const cured = diseaseStrike(w, n, null as never, say, DISEASE_BY_ID.smallpox, 0.5, { medicine: 0, caps: new Set(["chủng-đậu"]) });
  assert.ok(cured < plain / 5, `${cured} vs ${plain}`);
}, "smallpox", { border: 1 }));

test("a people that suffered a disease studies its cure cheaper; the cures are in the book", () => {
  const w = two("lore"), [a] = w.nations;
  a.inventions.push("P14", "P12");
  const full = inventionCost(w, a, "K25");
  assert.ok(Number.isFinite(full));
  for (let k = 0; k < 5; k++) { a.population = 100; diseaseStrike(w, a, null as never, say, DISEASE_BY_ID.smallpox, 0, { medicine: 0, caps: new Set() }); }
  assert.equal(a.diseaseLore?.smallpox, DISEASE.loreMax, "capped");
  assert.equal(inventionCost(w, a, "K25"), Math.ceil(full * (1 - DISEASE.lore * DISEASE.loreMax)), "cheaper by the outbreaks lived");
  // a people protected does not learn from the disease
  a.diseaseLore = {};
  a.population = 100; diseaseStrike(w, a, null as never, say, DISEASE_BY_ID.smallpox, 0, { medicine: 0, caps: new Set(["chủng-đậu"]) });
  assert.equal(a.diseaseLore.smallpox, undefined);
});

test("malaria lives in swamps and jungles and passes to no one", () => {
  const w = two("malaria"), [a] = w.nations, m = mods(w, a);
  for (const t of w.tiles) if (t.owner === a.id && (t.terrain === "swamp" || t.terrain === "jungle")) t.terrain = "grass";
  const p0 = diseaseChances(w, a, m, false, false).find(x => x.d.id === "malaria")!.p;
  assert.equal(p0, 0, "no wet land, no malaria");
  const own = w.tiles.filter(t => t.owner === a.id && t.zone !== "cold").slice(0, 3);
  assert.ok(own.length > 0);
  for (const t of own) t.terrain = "swamp";
  const p1 = diseaseChances(w, a, m, false, false).find(x => x.d.id === "malaria")!.p;
  assert.ok(Math.abs(p1 - EVENTS.plague.chance * DISEASE_BY_ID.malaria.weight * own.length * (1 - m.medicine)) < 1e-9, `${p1}, medicine ${m.medicine}`);
  quiet(() => {
    const [x, y] = w.nations; sick(w, x, "malaria");
    turn(w);
    assert.ok(!contagious(y, w.tick), "not contagious");
  });
});
