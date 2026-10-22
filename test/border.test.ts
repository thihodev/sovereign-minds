// Living borders (§7.9): tension, incidents, the border market. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { borderLength, borderOf } from "../src/border.ts";
import { NEIGHBORS } from "../src/hex.ts";
import { BORDER } from "../src/rules.ts";
import { advice } from "../src/ai/advice.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
/** Two nations; B's land is moved right next to A's. */
function touching(seed: string): World {
  const w = createWorld(seed, bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc A", capital: "Do A", people: "Dan A", flag: flag("#c0392b") }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc Bình", capital: "Do Bình", people: "Dan Bình", flag: flag("#3355ff") }] } } });
  const [a, b] = w.nations;
  for (const t of w.tiles) if (t.owner === b.id) t.owner = -1;
  // a strip of B's land along A's edge
  const edge = w.tiles.filter(t => t.owner === -1 && t.land && t.terrain !== "mountain" && NEIGHBORS[t.i].some(j => w.tiles[j].owner === a.id));
  for (const t of edge) t.owner = b.id;
  b.capital = edge[0].i;
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

test("a long border grows tension; neighbours know each other; a treaty calms it", () => {
  const w = touching("tension");
  const [a, b] = w.nations;
  a.met = []; b.met = [];
  assert.ok(borderLength(w, a.id, b.id) >= 4);
  const market = BORDER.marketBelow;
  BORDER.marketBelow = 0; // no market: the bare friction of a long border
  try { for (let k = 0; k < 6; k++) turn(w); } finally { BORDER.marketBelow = market; }
  const st = borderOf(w, a.id, b.id);
  assert.ok(st.tension > 6, `tension ${st.tension}`);
  assert.ok(a.met.includes(b.id) && b.met.includes(a.id), "neighbours always know each other");
  const before = st.tension;
  w.treaties.push({ id: 90, type: "alliance", a: a.id, b: b.id, start: w.tick, end: null, active: true, tribute: {} } as never);
  for (let k = 0; k < 3; k++) turn(w);
  assert.ok(st.tension < before, `${before} → ${st.tension}`);
});

test("the border market swaps what one has to spare for what the other lacks", () => {
  const w = touching("market");
  const [a, b] = w.nations;
  a.stock.wood = 200; b.stock.wood = 0; b.stock.hide = 200; a.stock.hide = 0;
  turn(w);
  assert.ok((b.stock.wood || 0) > 0 && (a.stock.hide || 0) > 0, `${b.stock.wood} wood, ${a.stock.hide} hide`);
  assert.equal(borderOf(w, a.id, b.id).market, 1);
  assert.ok((a.trades[String(b.id)] || 0) >= 1, "it counts as a trade");
  assert.ok(a.lastEvents.some(e => /Chợ biên giới/.test(e)));
});

test("high tension: incidents, and a dispute gives both sides a just cause", () => {
  const w = touching("dispute");
  const [a, b] = w.nations;
  borderOf(w, a.id, b.id).tension = 95;
  const [div, max] = [BORDER.incidentDiv, BORDER.incidentMax];
  BORDER.incidentDiv = 1; BORDER.incidentMax = 1; // an incident for sure
  try { turn(w); } finally { BORDER.incidentDiv = div; BORDER.incidentMax = max; }
  const st = borderOf(w, a.id, b.id);
  assert.equal(st.incidents.length, 1, "an incident");
  assert.ok((a.casusBelli[String(b.id)] ?? -1) >= w.tick - 1 && (b.casusBelli[String(a.id)] ?? -1) >= w.tick - 1, "both have a just cause");
  // A just cause: war without the reputation loss
  const rep = a.reputation;
  turn(w, { 0: { actions: [{ type: "declare_war", target: b.name }] } });
  assert.ok(w.wars.some(x => x.a === a.id && x.b === b.id), JSON.stringify(a.lastRejected));
  assert.equal(a.reputation, rep, "no reputation lost");
});

test("a long dispute tears up a non-aggression pact; a just cause breaks a treaty for free", () => {
  const w = touching("pact");
  const [a, b] = w.nations;
  w.treaties.push({ id: 91, type: "non_aggression", a: a.id, b: b.id, start: w.tick, end: null, active: true, tribute: {} } as never);
  const st = borderOf(w, a.id, b.id);
  const [div, max] = [BORDER.incidentDiv, BORDER.incidentMax];
  BORDER.incidentMax = 0; // no incidents: only the dispute
  try { for (let k = 0; k < BORDER.treatyBreakAfter + 1; k++) { st.tension = 95; turn(w); } } finally { BORDER.incidentDiv = div; BORDER.incidentMax = max; }
  assert.equal(w.treaties.find(t => t.id === 91)!.active, false, "the pact fell apart");
  const rep = a.reputation;
  turn(w, { 0: { actions: [{ type: "declare_war", target: b.name }] } });
  assert.ok(w.wars.some(x => x.a === a.id && x.b === b.id), JSON.stringify(a.lastRejected));
  assert.equal(a.reputation, rep, "a just war");
});

test("blood for blood: brawl after brawl and the border goes to war, taken up by the stronger side", () => {
  const w = touching("brawls");
  const [a, b] = w.nations;
  const st = borderOf(w, a.id, b.id);
  st.brawls = [{ tick: w.tick - 2, dead: { [a.id]: 2, [b.id]: 1 } }, { tick: w.tick - 1, dead: { [a.id]: 1, [b.id]: 0 } }];
  assert.ok(advice(w, b).some(x => /thêm một vụ nữa là chiến tranh/.test(x.text)));
  st.brawls.push({ tick: w.tick, dead: { [a.id]: 1, [b.id]: 1 } });
  b.labor.warrior = 20; a.labor.warrior = 2; // b is the stronger, though a buried more
  const max = BORDER.incidentMax;
  BORDER.incidentMax = 0;
  try { turn(w); } finally { BORDER.incidentMax = max; }
  const war = w.wars.find(x => (x.a === a.id && x.b === b.id) || (x.a === b.id && x.b === a.id));
  assert.ok(war, "a war broke out");
  assert.equal(war!.a, b.id, "the stronger side takes up the quarrel");
  assert.match(war!.reason ?? "", /xô xát/);
  assert.deepEqual(war!.brawlDead, { [a.id]: 4, [b.id]: 2 }, "the brawl dead are kept with the war");
  assert.ok((a.casusBelli[String(b.id)] ?? -1) >= w.tick - 1, "the weaker keeps its just cause");
});

test("a border gate market: on our land at the neighbour's edge, joined by road; it keeps the market open longer and calming more", async () => {
  const { hasGate } = await import("../src/border.ts");
  const { GATE } = await import("../src/rules.ts");
  const w = touching("gate"), [a, b] = w.nations;
  a.inventions.push("P12"); a.stock.wood = 50; a.stock.stone = 50;
  const xy = (i: number) => [i % 128, Math.floor(i / 128)];
  // our tile touching B, next to our capital
  const spot = NEIGHBORS[a.capital].find(j => w.tiles[j].owner === a.id && NEIGHBORS[j].some(k => w.tiles[k].owner === b.id))
    ?? w.tiles.find(t => t.owner === a.id && NEIGHBORS[t.i].some(k => w.tiles[k].owner === b.id) && NEIGHBORS[t.i].includes(a.capital))?.i;
  assert.ok(spot !== undefined, "a border tile beside the capital");
  turn(w, { 0: { actions: [{ type: "build", building: "border_gate", tile: xy(spot!) }] } });
  assert.ok(a.lastRejected.some(r => /đường/.test(r.reason)), JSON.stringify(a.lastRejected)); // no road yet
  w.tiles[spot!].road = 1;
  turn(w, { 0: { actions: [{ type: "build", building: "border_gate", tile: xy(spot!) }] } });
  assert.deepEqual(a.lastRejected, []);
  const g = a.buildings.find(x => x.type === "border_gate")!; g.done = true; g.progress = 10;
  assert.ok(hasGate(w, a, b.id));
  // a second for the same neighbour is refused
  turn(w, { 0: { actions: [{ type: "build", building: "border_gate", tile: xy(spot!) }] } });
  assert.ok(a.lastRejected.some(r => /Đã có Chợ cửa khẩu/.test(r.reason)));
  // at tension 65 the market still opens, and it calms more
  const st = borderOf(w, a.id, b.id);
  a.stock.wood = 200; b.stock.wood = 0; b.stock.hide = 200; a.stock.hide = 0;
  st.tension = 65;
  const market = st.market;
  turn(w);
  assert.equal(st.market, market + 1, "open beyond the usual 60");
  assert.ok(GATE.below > 0);
});

test("a peace after a long dispute is not torn up by the dispute before it; the border starts afresh", () => {
  const w = touching("peace-afresh"), [a, b] = w.nations;
  a.met.push(b.id); b.met.push(a.id);
  for (const n of w.nations) n.stock.coin = 200;
  turn(w, { 0: { actions: [{ type: "declare_war", target: "Nuoc Bình" }] } });
  const st = borderOf(w, a.id, b.id);
  st.dispute = 189; st.tension = 100;
  turn(w, { 1: { actions: [{ type: "treaty", to: "Nuoc A", kind: "peace", tribute: { coin: 6 }, duration: 10, payer: "me" }] } });
  const offer = w.treatyOffers.at(-1)!;
  turn(w, { 0: { actions: [{ type: "accept_treaty", offer: offer.id }] } });
  const t = w.treaties.find(x => x.id === offer.id)!;
  assert.ok(t.active, `the new peace holds (${t.endedBy ?? ""})`);
  assert.equal(t.term, 10);
  assert.ok(st.tension <= BORDER.afterPeace + 10 && (st.dispute ?? 0) < BORDER.treatyBreakAfter, `${st.tension} / ${st.dispute}`);
  const coinB = b.stock.coin || 0, coinA = a.stock.coin || 0;
  turn(w); turn(w);
  assert.ok(t.active && (t.paid ?? 0) >= 1, `paid ${t.paid}`);
  // the coin really moved, and both treasuries' books and events say so
  assert.ok((a.stock.coin || 0) >= coinA + 6 * (t.paid ?? 0) - 30 && (b.stock.coin || 0) < coinB, `${coinA}→${a.stock.coin}, ${coinB}→${b.stock.coin}`);
  assert.equal(b.treasury?.last?.out.tribute, 6); assert.equal(a.treasury?.last?.in.tribute, 6);
  assert.ok(b.lastEvents.some(e => /Nộp cống cho Nuoc A/.test(e)) && a.lastEvents.some(e => /nộp cống theo hiệp ước/.test(e)));
  // a treaty falls only to a dispute it has lived through itself
  st.tension = 100; st.dispute = 0;
  for (let k = 0; k < BORDER.treatyBreakAfter + 1 && t.active; k++) { st.tension = 100; turn(w); }
  assert.equal(t.active, false);
  assert.match(t.endedBy ?? "", /tranh chấp biên giới/);
});
