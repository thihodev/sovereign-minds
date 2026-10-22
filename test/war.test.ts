// §7.4b War is real: border clashes every turn, a war score, a price for peace, weariness. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { activeWar, peaceOutlook, startWar, touching, warLead, warSide, warSummary } from "../src/diplomacy.ts";
import { NEIGHBORS, col, row } from "../src/hex.ts";
import { WAR } from "../src/rules.ts";
import { advice } from "../src/ai/advice.ts";
import type { AIResponse, TurnInput, War, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
const xy = (i: number) => [col(i), row(i)];
/** Nuoc An and Văn Lang; Văn Lang's land is moved into a strip along Nuoc An's edge. */
function neighbours(seed: string): World {
  const w = createWorld(seed, bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc An", capital: "Do An", people: "Dan An", flag: flag("#c0392b") }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Văn Lang", capital: "Phong Châu", people: "Dan Lạc", flag: flag("#3355ff") }] } } });
  const [a, b] = w.nations;
  for (const t of w.tiles) if (t.owner === b.id) t.owner = -1;
  const edge = w.tiles.filter(t => t.owner === -1 && t.land && t.terrain !== "mountain" && NEIGHBORS[t.i].some(j => w.tiles[j].owner === a.id));
  for (const t of edge) t.owner = b.id;
  b.capital = edge[0].i;
  b.buildings = [];
  for (const n of w.nations) { n.stock.food = 600; n.population = 80; n.stability = 80; n.met = [n.id === a.id ? b.id : a.id]; }
  return w;
}
const idle: AIResponse = { actions: [{ type: "research", invention: "P2" }] };
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? idle };
  const out = step(w, inputs);
  assert.deepEqual(out.audit, [], "ledger audit");
  return out;
}
/** Declare a war of Nuoc An on Văn Lang and step to its first turn of fighting. */
function atWar(w: World): War {
  const [a, b] = w.nations;
  startWar(w, a, b, w.tick, "", () => {});
  const war = activeWarOrPending(w);
  while (w.tick < war.start) turn(w);
  return war;
}
const activeWarOrPending = (w: World) => w.wars.find(x => x.end === null)!;
const army = (n: World["nations"][number], warriors: number) => ({ ...n.labor, gather: 10, hunt: 0, fish: 0, farm: 0, wood: 0, stone: 0, flint: 0, clay: 0, mine: 0, craft: 0, build: 0, research: 0, warrior: warriors });

test("border clashes: armies that touch fight every turn on their own, the weaker bleeds, twice as strong takes a tile", () => {
  const w = neighbours("clash");
  const [a, b] = w.nations;
  const war = atWar(w);
  const tilesB = w.tiles.filter(t => t.owner === b.id).length, popB = b.population;
  // nobody orders an attack: Nuoc An keeps an army at the front, Văn Lang has only its militia
  for (let k = 0; k < 3; k++) turn(w, { 0: { labor: army(a, 30), actions: idle.actions }, 1: { labor: army(b, 0), actions: idle.actions } });
  assert.equal(w.battles.length, 0, "no attack was ordered");
  const sa = warSide(war, a.id), sb = warSide(war, b.id);
  assert.equal(sa.clashes, 3, "the stronger side won every clash");
  assert.ok(sb.dead >= 3, `the militia died in the army's place (${sb.dead})`);
  assert.ok(b.population < popB);
  assert.ok(sa.tiles >= 1 && w.tiles.filter(t => t.owner === b.id).length < tilesB, "a side twice as strong pushes the line");
  assert.ok(w.tiles[b.capital].owner === b.id, "a clash never takes a centre");
  assert.ok(warLead(war, a.id) >= 3 * WAR.score.clash + WAR.score.tile, `the score counts clashes and land (${warLead(war, a.id)})`);
  assert.ok(war.lastTile !== undefined);
});

test("peace has a price: no white peace in the first turns, unless the treaty carries terms", () => {
  const w = neighbours("early-peace");
  const [a, b] = w.nations;
  const war = atWar(w);
  turn(w, { 1: { actions: [{ type: "treaty", to: a.name, kind: "peace", duration: 20 }] } });
  assert.match(b.lastRejected[0].reason, /hòa trắng chỉ ký được từ lượt/);
  // a token tribute is not terms either
  turn(w, { 1: { actions: [{ type: "treaty", to: a.name, kind: "peace", duration: 20, tribute: { food: 1 }, payer: "me" }] } });
  assert.match(b.lastRejected[0].reason, /hòa trắng chỉ ký được từ lượt/);
  // a ceded tile is a surrender: it may end the war at once
  const give = touching(w, b.id, a.id).find(i => i !== b.capital)!;
  turn(w, { 1: { actions: [{ type: "treaty", to: a.name, kind: "peace", duration: 20, cede: [xy(give)], payer: "me" }] } });
  assert.deepEqual(b.lastRejected, []);
  turn(w, { 0: { actions: [{ type: "accept_treaty", offer: w.treatyOffers.find(o => o.type === "peace")!.id }] } });
  assert.equal(activeWar(w, a.id, b.id), undefined);
  assert.equal(w.tiles[give].owner, a.id);
  assert.match(war.peace?.terms ?? "", /nhượng 1 ô/);
  assert.equal(war.peace?.white, false);
});

test("a decisive score: the loser pays reparations through the ledger and gives up border tiles", () => {
  const w = neighbours("reparations");
  const [a, b] = w.nations;
  const war = atWar(w);
  b.stock.hide = 100; b.stock.coin = 50;
  // the war went badly for Văn Lang
  war.tally![String(a.id)] = { score: 30, dead: 4, clashes: 6, battles: 3, tiles: 2, centres: 0, raids: 0 };
  war.tally![String(b.id)] = { score: 2, dead: 30, clashes: 0, battles: 0, tiles: 0, centres: 0, raids: 0 };
  const o = peaceOutlook(war, b.id);
  assert.equal(o.winner, a.id);
  assert.equal(o.share, Math.min(WAR.reparation.maxShare, 28 * WAR.reparation.perPoint));
  assert.equal(o.tiles, Math.floor(28 / WAR.reparation.tileEvery));
  assert.match(String(warSummary(w, b)[0].peace_if_signed_now), /you LOSE and pay/);
  assert.ok(advice(w, b).some(x => /Ta đang thua nặng/.test(x.text)), "the advice says what peace would cost");
  const hideA = a.stock.hide || 0, coinA = a.stock.coin || 0, tilesA = w.tiles.filter(t => t.owner === a.id).length;
  // even a plain peace (allowed from turn start + peaceAfter): the score decides
  while (w.tick < war.start + WAR.peaceAfter) turn(w, { 0: { labor: army(a, 0), actions: idle.actions }, 1: { labor: army(b, 0), actions: idle.actions } });
  turn(w, { 1: { actions: [{ type: "treaty", to: a.name, kind: "peace", duration: 20 }] } });
  assert.deepEqual(b.lastRejected, []);
  turn(w, { 0: { actions: [{ type: "accept_treaty", offer: w.treatyOffers.find(o => o.type === "peace")!.id }] } });
  assert.equal(activeWar(w, a.id, b.id), undefined);
  assert.equal(war.peace?.winner, a.id);
  assert.ok((a.stock.hide || 0) > hideA, "hides paid as reparations");
  assert.ok((a.stock.coin || 0) > coinA, "coin paid as reparations");
  assert.ok(war.peace!.tiles >= 1 && w.tiles.filter(t => t.owner === a.id).length >= tilesA + 1, "border tiles change hands");
});

test("a white peace costs the side that declared; the losing side wearies every turn", () => {
  const w = neighbours("white");
  const [a, b] = w.nations;
  const war = atWar(w);
  war.tally![String(b.id)] = { score: WAR.losingBy + 4, dead: 0, clashes: 0, battles: 0, tiles: 0, centres: 0, raids: 0 };
  const push = WAR.clash.push; WAR.clash.push = Infinity;
  try {
    // equal armies: the score moves little; Nuoc An is behind and frets
    turn(w, { 0: { labor: army(a, 10), actions: idle.actions }, 1: { labor: army(b, 10), actions: idle.actions } });
    assert.ok(warLead(war, a.id) <= -WAR.losingBy);
    assert.ok(a.lastEvents.some(e => /Đang thua cuộc chiến với Văn Lang/.test(e)), "the losing side wearies");
    assert.ok(!b.lastEvents.some(e => /Đang thua cuộc chiến/.test(e)));
    war.tally![String(a.id)] = { score: 1, dead: 0, clashes: 0, battles: 0, tiles: 0, centres: 0, raids: 0 };
    war.tally![String(b.id)] = { score: 1, dead: 0, clashes: 0, battles: 0, tiles: 0, centres: 0, raids: 0 };
    while (w.tick < war.start + WAR.peaceAfter) turn(w, { 0: { labor: army(a, 0), actions: idle.actions }, 1: { labor: army(b, 0), actions: idle.actions } });
    // keep the score even right before the peace
    for (const id of [a.id, b.id]) war.tally![String(id)].score = 5;
    turn(w, { 0: { actions: [{ type: "treaty", to: b.name, kind: "peace", duration: 20 }] } });
    a.stability = 70;
    turn(w, { 1: { actions: [{ type: "accept_treaty", offer: w.treatyOffers.find(o => o.type === "peace")!.id }] } });
    assert.equal(war.peace?.white, true);
    assert.equal(war.peace?.winner, null);
    assert.ok(a.lastEvents.some(e => /Hòa trắng/.test(e)), "the declarer's people resent a war for nothing");
  } finally { WAR.clash.push = push; }
});

test("an unprovoked war costs reputation (a number, not NaN); the observation shows the war", () => {
  const w = neighbours("unprovoked");
  const [a, b] = w.nations;
  a.casusBelli = {}; a.reputation = 50;
  turn(w, { 0: { actions: [{ type: "declare_war", target: b.name }] } });
  assert.equal(a.reputation, 50 - WAR.unprovokedPenalty);
  assert.ok(Number.isFinite(WAR.independenceAfter));
  turn(w);
  const s = warSummary(w, b)[0];
  assert.equal(s.enemy, a.name);
  assert.ok(s.score && s.dead && s.peace_if_signed_now && s.white_peace_from, "score, dead and the price of peace");
  assert.ok(advice(w, b).some(x => /Đang chiến tranh với Nuoc An/.test(x.text)));
});

test("the beaten cannot dictate terms; a peace offer shows what signing it brings", async () => {
  const { buildObservation } = await import("../src/ai/prompt.ts");
  const w = neighbours("beaten-terms");
  const [a, b] = w.nations;
  const war = atWar(w);
  war.tally![String(a.id)] = { score: 11, dead: 10, clashes: 2, battles: 1, tiles: 1, centres: 0, raids: 0 };
  war.tally![String(b.id)] = { score: 2.5, dead: 16, clashes: 0, battles: 0, tiles: 0, centres: 0, raids: 0 };
  while (w.tick < war.start + WAR.peaceAfter) turn(w, { 0: { labor: army(a, 0), actions: idle.actions }, 1: { labor: army(b, 0), actions: idle.actions } });
  // Văn Lang, beaten, asks the winner to pay: refused
  turn(w, { 1: { actions: [{ type: "treaty", to: a.name, kind: "peace", duration: 10, tribute: { coin: 6 }, payer: "them" }] } });
  assert.ok(b.lastRejected.some(r => /Đang thua/.test(r.reason) && /payer "me"/.test(r.reason)), JSON.stringify(b.lastRejected));
  assert.ok(!w.treatyOffers.some(o => o.from === b.id));
  // terms it pays itself are fine, and the winner sees what signing brings
  turn(w, { 1: { actions: [{ type: "treaty", to: a.name, kind: "peace", duration: 10, tribute: { coin: 6 }, payer: "me" }] } });
  assert.deepEqual(b.lastRejected, []);
  const off = (buildObservation(w, a) as { treaty_offers_to_me: Array<{ if_signed?: Record<string, string> }> }).treaty_offers_to_me[0];
  assert.equal(off.if_signed?.winner, a.name);
  assert.match(String(off.if_signed?.reparations_at_once), /Văn Lang gives \d+% of every good/);
  assert.equal(off.if_signed?.you_pay, undefined);
});

test("an offer number written as \"#3216\" is understood; the ruler is told of a peace offer waiting", () => {
  const w = neighbours("peace-id");
  const [a, b] = w.nations;
  const war = atWar(w);
  war.tally![String(a.id)] = { score: 20, dead: 4, clashes: 2, battles: 1, tiles: 1, centres: 0, raids: 0 };
  war.tally![String(b.id)] = { score: 3, dead: 16, clashes: 0, battles: 0, tiles: 0, centres: 0, raids: 0 };
  while (w.tick < war.start + WAR.peaceAfter) turn(w, { 0: { labor: army(a, 0), actions: idle.actions }, 1: { labor: army(b, 0), actions: idle.actions } });
  turn(w, { 0: { actions: [{ type: "treaty", to: b.name, kind: "peace" }] } });
  const off = w.treatyOffers.find(o => o.from === a.id)!;
  assert.ok(advice(w, b).some(x => x.text.includes(`đề nghị hòa #${off.id}`) && /accept_treaty/.test(x.text)), "the advice names the offer");
  turn(w, { 1: { actions: [{ type: "accept_treaty", offer: `#${off.id}` }] } });
  assert.deepEqual(b.lastRejected, []);
  assert.equal(activeWar(w, a.id, b.id), undefined, "peace signed");
});
