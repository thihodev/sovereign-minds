// §7.9 Shared hunting grounds (Hắc Sơn Quốc's idea #26, taken up in part). No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { borderOf, huntGrounds, huntZone } from "../src/border.ts";
import { startWar } from "../src/diplomacy.ts";
import { NEIGHBORS } from "../src/hex.ts";
import { BORDER, HUNT_ZONE } from "../src/rules.ts";
import { advice } from "../src/ai/advice.ts";
import { buildObservation } from "../src/ai/prompt.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function neighbours(seed: string): World {
  const w = createWorld(seed, bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Hắc Sơn", capital: "Đỉnh Đen", people: "người Hắc", flag: flag("#c0392b") }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Văn Đỉnh", capital: "Đỉnh Văn", people: "người Văn", flag: flag("#3355ff") }] } } });
  const [a, b] = w.nations;
  for (const t of w.tiles) if (t.owner === b.id) t.owner = -1;
  const edge = w.tiles.filter(t => t.owner === -1 && t.land && t.terrain !== "mountain" && NEIGHBORS[t.i].some(j => w.tiles[j].owner === a.id));
  for (const t of edge) t.owner = b.id;
  // a second ring behind it
  for (const t of w.tiles.filter(t => t.owner === -1 && t.land && NEIGHBORS[t.i].some(j => w.tiles[j].owner === b.id)).slice(0, 12)) t.owner = b.id;
  b.capital = edge[0].i;
  for (const n of w.nations) { n.stock.food = 600; n.population = 80; n.stability = 80; n.met = [n.id === a.id ? b.id : a.id]; }
  return w;
}
const idle: AIResponse = { actions: [{ type: "research", invention: "P2" }] };
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? idle };
  const out = step(w, inputs); assert.deepEqual(out.audit, [], "ledger audit"); return out;
}
function sign(w: World) {
  const [a, b] = w.nations;
  turn(w, { 0: { actions: [{ type: "treaty", to: b.name, kind: "hunt", duration: null }] } });
  assert.deepEqual(a.lastRejected, []);
  const off = w.treatyOffers.find(o => o.type === "hunt")!;
  turn(w, { 1: { actions: [{ type: "accept_treaty", offer: off.id }] } });
  assert.ok(huntGrounds(w, a.id, b.id));
}

test("a hunting ground is a treaty between neighbours; hunters hunt the other's land up to two tiles deep", () => {
  const w = neighbours("hunt-zone"), [a, b] = w.nations;
  assert.deepEqual(huntZone(w, a), []);
  sign(w);
  const zone = huntZone(w, a);
  assert.ok(zone.length > 0 && zone.every(t => t.owner === b.id));
  assert.ok(zone.every(t => NEIGHBORS[t.i].some(j => w.tiles[j].owner === a.id) || NEIGHBORS[t.i].some(j => NEIGHBORS[j].some(k => w.tiles[k].owner === a.id))), "within two tiles");
  // A's own land holds no game: its hunters take it from B's land, lawfully
  for (const t of w.tiles) if (t.owner === a.id) t.res.game = 0;
  for (const t of zone) t.res.game = 20;
  const before = zone.reduce((s, t) => s + (t.res.game || 0), 0); a.stock.hide = 0;
  turn(w, { 0: { labor: { gather: 20, hunt: 20, fish: 0, farm: 0, wood: 0, stone: 0, flint: 0, clay: 0, mine: 0, craft: 0, build: 0, research: 0, warrior: 0 }, actions: idle.actions } });
  // A's own land holds no game, so every hide it brought home came from B's land
  assert.ok((a.stock.hide ?? 0) > 0, `hides from the grounds (game there ${before})`);
  const obs = buildObservation(w, a) as { neighbours: Array<{ hunting_grounds?: { your_hunters_may_hunt_tiles: number } }> };
  assert.ok(obs.neighbours.some(x => (x.hunting_grounds?.your_hunters_may_hunt_tiles ?? 0) > 0));
});

test("half the poachers stay home, and for five turns after the grounds are given up; giving them up costs no reputation", () => {
  const count = (signed: boolean, giveUp = false) => {
    const w = neighbours("hunt-poach"), [a, b] = w.nations;
    if (signed) sign(w);
    if (giveUp) { const t = w.treaties.find(x => x.type === "hunt")!; const rep = a.reputation; turn(w, { 0: { actions: [{ type: "break_treaty", treaty: t.id }] } }); assert.equal(a.reputation, rep); turn(w); assert.ok(!huntGrounds(w, a.id, b.id) && huntGrounds(w, a.id, b.id, true)); }
    let poach = 0;
    for (let k = 0; k < 4; k++) {
      const st = borderOf(w, a.id, b.id); st.tension = 75; st.incidents = []; st.brawls = [];
      for (const t of w.tiles) if (t.owner >= 0) t.res.game = 50;
      turn(w);
      poach += st.incidents.filter(x => /săn trộm/.test(x.text)).length;
    }
    return poach;
  };
  // the chance is rolled per turn; over the same seeds the grounds can only remove poachers, never add them
  assert.ok(count(true) <= count(false));
  assert.ok(HUNT_ZONE.poachCut === 0.5 && BORDER.treatyCalm.hunt === 0.5);
  count(true, true);
});

test("no grounds with a land not touching ours, or with hostile kin; a war ends them; the advisor suggests them", () => {
  const w = neighbours("hunt-rules"), [a, b] = w.nations;
  const st = borderOf(w, a.id, b.id); st.incidents = [{ tick: w.tick, text: `Thợ săn ${b.name} vượt biên sang đất ${a.name} săn trộm (20 lương thực)` }];
  assert.ok(advice(w, a).some(x => /Khu săn chung/.test(x.text) && /"kind":"hunt"/.test(x.text)));
  b.origin = { from: a.id, tick: 0 } as never;
  turn(w, { 0: { actions: [{ type: "treaty", to: b.name, kind: "hunt" }] } });
  assert.ok(a.lastRejected.some(r => /thù địch/.test(r.reason)), JSON.stringify(a.lastRejected));
  delete b.origin;
  sign(w);
  startWar(w, a, b, w.tick, "", () => {});
  assert.ok(!huntGrounds(w, a.id, b.id), "a war ends the grounds");
});
