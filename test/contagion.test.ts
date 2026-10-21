// Contagion and quarantine (§9.5): a plague crosses borders and trade routes; a quarantine shuts them. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { borderLength, borderOf } from "../src/border.ts";
import { contagious, immune, plagueNearby, quarantined } from "../src/contagion.ts";
import { botTurn } from "../src/ai/bot.ts";
import { buildObservation } from "../src/ai/prompt.ts";
import { advice } from "../src/ai/advice.ts";
import { rngFor } from "../src/rng.ts";
import { NEIGHBORS } from "../src/hex.ts";
import { BORDER, CONTAGION, EVENTS } from "../src/rules.ts";
import type { AIResponse, Nation, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
/** Two nations; B's land is moved right next to A's. */
function touching(seed: string): World {
  const w = createWorld(seed, bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc A", capital: "Do A", people: "Dan A", flag: flag("#c0392b") }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc Bình", capital: "Do Bình", people: "Dan Bình", flag: flag("#3355ff") }] } } });
  const [a, b] = w.nations;
  for (const t of w.tiles) if (t.owner === b.id) t.owner = -1;
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
const struck = (n: Nation) => n.lastEvents.some(e => /^Dịch bệnh/.test(e));
/** A's people falls sick this turn (as if the plague had struck it just now). */
const sicken = (w: World, n: Nation) => { n.outbreakUntil = w.tick + CONTAGION.sickTurns - 1; n.immuneUntil = n.outbreakUntil + CONTAGION.immuneTurns; };
/** Only contagion strikes in these tests, never the plague a people catches by itself. */
function withRules<T>(f: () => T, border = 1): T {
  const own = EVENTS.plague.chance, b = CONTAGION.border, mb = BORDER.marketBelow;
  EVENTS.plague.chance = 0; CONTAGION.border = border;
  try { return f(); } finally { EVENTS.plague.chance = own; CONTAGION.border = b; BORDER.marketBelow = mb; }
}
function giveMedicine(w: World, n: Nation, share: number) {
  w.custom.inventions.XMED = { id: "XMED", name: "Thuốc thử", prereqs: [], rp: 10, caps: [], effects: { medicine: share }, desc: "test" } as never;
  n.inventions.push("XMED");
}

test("a plague crosses the border to a neighbour, who is then contagious and immune", () => withRules(() => {
  const w = touching("contagion-border");
  const [a, b] = w.nations;
  assert.ok(borderLength(w, a.id, b.id) > 0);
  sicken(w, a);
  const pop = b.population, out = turn(w);
  assert.ok(b.population < pop, `B lost people: ${pop} → ${b.population}`);
  assert.ok(contagious(b, w.tick) && immune(b, w.tick), "B is now sick and immune");
  assert.ok(b.lastEvents.some(e => /lây từ Nuoc A qua biên giới/.test(e)), b.lastEvents.join(" | "));
  const f = out.fx.find(x => x.kind === "contagion");
  assert.ok(f && f.nation === b.id && f.from === a.capital && f.text === "Nuoc A", "a contagion effect from A's capital to B's");
  assert.ok(out.chronicle.some(c => /lan sang Nuoc Bình/.test(c.text)));
  // Already sick: B is not struck again while A is still contagious
  turn(w);
  assert.ok(contagious(a, w.tick - 1) && !struck(b), "no second plague while immune");
}));

test("quarantine blocks the plague, suspends the market and trade, raises tension and costs stability", () => withRules(() => {
  const w = touching("contagion-quarantine");
  const [a, b] = w.nations;
  a.stock.wood = 200; b.stock.wood = 0; b.stock.hide = 200; a.stock.hide = 0; // a market would meet
  sicken(w, a);
  const stab = b.stability, tension = borderOf(w, a.id, b.id).tension;
  turn(w, { [b.id]: { actions: [{ type: "quarantine", turns: 2 }] } });
  assert.ok(quarantined(b, w.tick - 1) && quarantined(b, w.tick) && !quarantined(b, w.tick + 1), `until ${b.quarantineUntil}`);
  assert.ok(!contagious(b, w.tick), "B did not catch it");
  assert.ok(!struck(b), b.lastEvents.join(" | "));
  assert.equal(borderOf(w, a.id, b.id).market, 0, "no border market");
  assert.equal(b.stock.wood || 0, 0);
  assert.ok(b.lastEvents.some(e => e.startsWith("Đang cách ly") && e.includes(`ổn định −${CONTAGION.quarantineStability}`) && e.includes("Nuoc A")), b.lastEvents.join(" | "));
  // the same turn without a quarantine, for comparison
  const w2 = touching("contagion-quarantine"); w2.nations[0].stock.wood = 200; w2.nations[1].stock.hide = 200; w2.nations[0].stock.hide = 0; w2.nations[1].stock.wood = 0;
  turn(w2);
  assert.equal(b.stability, Math.max(0, w2.nations[1].stability - CONTAGION.quarantineStability), `stability ${stab} → ${b.stability}`);
  assert.ok(borderOf(w, a.id, b.id).tension >= tension + CONTAGION.quarantineTension - BORDER.fade, `tension ${tension} → ${borderOf(w, a.id, b.id).tension}`);
  // Trade offers to or from it are refused
  turn(w, { [a.id]: { actions: [{ type: "trade_offer", to: "Nuoc Bình", give: { wood: 5 }, get: { hide: 5 } }] } });
  assert.ok(a.lastRejected.some(r => r.action === "trade_offer" && /cách ly/.test(r.reason)), JSON.stringify(a.lastRejected));
  // It can be ended early, and the market meets again
  turn(w, { [b.id]: { actions: [{ type: "quarantine", turns: 5 }] } });
  assert.ok(quarantined(b, w.tick));
  a.stock.hide = 0; b.stock.wood = 0; // still something to swap
  turn(w, { [b.id]: { actions: [{ type: "quarantine", turns: 0 }] } });
  assert.ok(!quarantined(b, w.tick - 1), "ended this turn");
  assert.ok(borderOf(w, a.id, b.id).market >= 1, `the market met once the quarantine ended: tension ${borderOf(w, a.id, b.id).tension}, A ${JSON.stringify(a.stock)}, B ${JSON.stringify(b.stock)}`);
  turn(w, { [b.id]: { actions: [{ type: "quarantine", turns: 9 }] } });
  assert.ok(b.lastRejected.some(r => r.action === "quarantine"), "turns beyond the maximum are refused");
}));

test("a sick people in quarantine keeps the plague home and earns reputation", () => withRules(() => {
  const w = touching("contagion-self");
  const [a, b] = w.nations;
  sicken(w, a);
  const rep = a.reputation;
  turn(w, { [a.id]: { actions: [{ type: "quarantine", turns: 1 }] } });
  assert.ok(!contagious(b, w.tick) && !struck(b), "B stayed well");
  assert.equal(a.reputation, Math.min(100, rep + CONTAGION.selfQuarantineRep));
}));

test("medicine cuts the chance of catching it", () => withRules(() => {
  const count = (med: number) => {
    const w = touching("contagion-medicine");
    const [a, b] = w.nations;
    BORDER.marketBelow = 0; // the border alone
    if (med) giveMedicine(w, b, med);
    let hits = 0;
    for (let k = 0; k < 16; k++) {
      sicken(w, a); b.immuneUntil = -1; b.outbreakUntil = -1; b.population = 60; b.stock.food = 400;
      turn(w);
      if (contagious(b, w.tick - 1)) hits++;
    }
    return hits;
  };
  const plain = count(0), shielded = count(0.8);
  assert.equal(plain, 16, "with no medicine and certain contagion, every turn");
  assert.ok(shielded < 10, `medicine 80%: ${shielded}/16`);
}));

test("a caravan carries the plague; the AI sees it coming and the advisor speaks", () => withRules(() => {
  const w = createWorld("contagion-caravan", bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc A", capital: "Do A", people: "Dan A", flag: flag("#c0392b") }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc Bình", capital: "Do Bình", people: "Dan Bình", flag: flag("#3355ff") }] } } });
  const [a, b] = w.nations;
  assert.equal(borderLength(w, a.id, b.id), 0, "far apart");
  a.met.push(b.id); b.met.push(a.id);
  w.caravans.push({ id: 900, from: a.id, to: b.id, goods: {}, arrive: w.tick + 3, offer: 0, mode: "land", path: [a.capital, b.capital], depart: w.tick, porters: 0, boats: 0 } as never);
  sicken(w, a);
  const near = plagueNearby(w, b);
  assert.deepEqual(near.map(x => [x.o.name, x.ways]), [["Nuoc A", ["caravan"]]]);
  const obs = buildObservation(w, b) as Record<string, unknown>;
  assert.ok(Array.isArray(obs.plague_nearby) && JSON.stringify(obs.plague_nearby).includes("caravan"), JSON.stringify(obs.plague_nearby));
  assert.ok(advice(w, b).some(x => /Nuoc A.*dịch/.test(x.text) && /quarantine/.test(x.text)));
  assert.ok(advice(w, a).some(x => /quarantine/.test(x.text)), "the sick one is told it can shut its borders");
  // A bot with no medicine shuts its borders for a turn or two, never for good
  const r = botTurn(w, b, rngFor("t", 1));
  const q = (r.actions || []).find(x => x.type === "quarantine");
  assert.ok(q && Number(q.turns) >= 1 && Number(q.turns) <= 2, JSON.stringify(r.actions));
  const saved = CONTAGION.trade; CONTAGION.trade = 1;
  try { turn(w); } finally { CONTAGION.trade = saved; }
  assert.ok(contagious(b, w.tick), "carried by the caravan");
  assert.ok(b.lastEvents.some(e => /theo đoàn buôn/.test(e)));
}));

test("a quarantined people lets no caravan in: it waits at the border", () => {
  const w = createWorld("contagion-wait", bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc A", capital: "Do A", people: "Dan A", flag: flag("#c0392b") }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc Bình", capital: "Do Bình", people: "Dan Bình", flag: flag("#3355ff") }] } } });
  const [a, b] = w.nations;
  w.caravans.push({ id: 901, from: a.id, to: b.id, goods: { wood: 10 }, arrive: w.tick, offer: 0, mode: "land", path: [a.capital, b.capital], depart: w.tick - 2, porters: 0, boats: 0 } as never);
  b.quarantineUntil = w.tick + 1;
  const inputs: Record<number, TurnInput> = { 0: { kind: "ok", response: { actions: [] } }, 1: { kind: "ok", response: { actions: [] } } };
  assert.deepEqual(step(w, inputs).audit, []);
  assert.ok(w.caravans.some(c => c.id === 901), "still waiting");
  assert.ok(b.lastEvents.some(e => /chờ ngoài biên giới/.test(e)));
  step(w, inputs);
  assert.ok(w.caravans.some(c => c.id === 901), "the quarantine still holds");
  assert.deepEqual(step(w, inputs).audit, []);
  assert.ok(!w.caravans.some(c => c.id === 901), "delivered once the quarantine ended");
  assert.ok(b.lastEvents.some(e => /Đoàn buôn từ Nuoc A tới nơi/.test(e)), b.lastEvents.join(" | "));
});
