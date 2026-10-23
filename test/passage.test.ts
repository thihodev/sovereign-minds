// §7.3b Passage of people: explorers pay to cross a land with no treaty, or trespass; no army marches through a third
// nation. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { NEIGHBORS, col, dist, row } from "../src/hex.ts";
import { marchBlocked, startWar } from "../src/diplomacy.ts";
import { PASSAGE } from "../src/rules.ts";
import type { World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function three(seed: string): World {
  const w = createWorld(seed, bots(3));
  step(w, Object.fromEntries([0, 1, 2].map(k => [k, { kind: "ok", response: { actions: [{ type: "found_nation", name: `Nuoc ${"ABC"[k]}`, capital: `Do ${"ABC"[k]}`, people: `Dan ${"ABC"[k]}`, flag: flag(["#c0392b", "#3355ff", "#27ae60"][k]) }] } }])) as never);
  for (const n of w.nations) { n.stock.food = 600; n.population = 80; n.stability = 70; }
  return w;
}

test("explorers crossing a land with no treaty pay its owner, or trespass", () => {
  const w = three("passage-explore"), [a, b] = w.nations;
  // the whole band east of A's capital is B's
  for (let k = 1; k <= 8; k++) { let i = a.capital; for (let s = 0; s < k; s++) i = NEIGHBORS[i][0] ?? i; if (w.tiles[i].owner === -1) w.tiles[i].owner = b.id; }
  const paid = (coin: number) => {
    a.stock.coin = coin; const bCoin = b.stock.coin ?? 0;
    step(w, { 0: { kind: "ok", response: { actions: [{ type: "explore", direction: "E", people: 2 }] } }, 1: { kind: "ok", response: {} }, 2: { kind: "ok", response: {} } });
    return { got: (b.stock.coin ?? 0) - bCoin, events: a.lastEvents.join(" | ") };
  };
  const r = paid(50);
  assert.match(r.events, /đi qua đất/, "the expedition crossed B's land");
  {
    assert.ok(/nộp .* tiền phí/.test(r.events), r.events);
    const r2 = paid(0);
    assert.ok(/vi phạm biên giới|không đủ tiền/.test(r2.events), r2.events);
    assert.ok((b.casusBelli[String(a.id)] ?? -1) >= w.tick - 1, "trespass is a just cause");
  }
  assert.ok(PASSAGE.explorerFee > 0);
});

test("no army marches through a third nation without a passage or alliance", () => {
  const w = three("passage-march"), [a, b, c] = w.nations;
  // A — B — C in a row: a tile of A, then B's, then C's, nothing else nearby
  const t0 = w.tiles.find(t => t.owner === a.id && t.land)!;
  const t1 = NEIGHBORS[t0.i].map(j => w.tiles[j]).find(t => t.land && t.owner === -1 && t.terrain !== "mountain")!;
  const t2 = NEIGHBORS[t1.i].map(j => w.tiles[j]).find(t => t.land && t.owner === -1 && t.terrain !== "mountain" && dist(t.i, t0.i) === 2 && !NEIGHBORS[t.i].some(x => w.tiles[x].owner === a.id))!;
  t1.owner = b.id; t2.owner = c.id;
  for (const j of NEIGHBORS[t2.i]) if (j !== t1.i && w.tiles[j].owner === -1) w.tiles[j].owner = b.id; // only B's land around C's tile
  startWar(w, a, c, w.tick - 1, "", () => {});
  w.wars.at(-1)!.start = w.tick;
  const why = marchBlocked(w, a, t2.i, 2);
  assert.ok(String(why).includes(`Quân phải đi qua đất ${b.name}`), String(why));
  w.treaties.push({ id: 900, type: "passage", a: a.id, b: b.id, tribute: {}, cede: [], start: w.tick, end: null, active: true, brokenBy: null, by: a.id, term: null });
  assert.equal(marchBlocked(w, a, t2.i, 2), null, "a passage treaty opens the way");
});
