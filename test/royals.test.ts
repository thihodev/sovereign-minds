// The royal house and marriages (§4.14): offer, accept, in-laws calm their border and pay no duties; war on in-laws shames. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, Ledger, step, type NationSpec } from "../src/engine.ts";
import { ROYALS } from "../src/rules.ts";
import { inLaws } from "../src/royals.ts";
import { importDuty, treasuryOf } from "../src/treasury.ts";
import { borderOf } from "../src/border.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function founded(seed: string): World {
  const w = createWorld(seed, bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Văn Lang", capital: "Phong Châu", people: "người Lạc", flag: flag("#c0392b") }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Âu Việt", capital: "Cổ Loa", people: "người Âu", flag: flag("#3355ff") }] } } });
  for (const n of w.nations) { n.stock.food = 500; n.population = 100; n.stability = 70; n.reputation = 50; }
  w.nations[0].met.push(1); w.nations[1].met.push(0);
  return w;
}
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? { actions: [{ type: "research", invention: "P2" }] } };
  const out = step(w, inputs); assert.deepEqual(out.audit, [], "ledger audit"); return out;
}

test("a royal marriage: offer with a dowry, accept, and the courts become in-laws", () => {
  const w = founded("royals"), [a, b] = w.nations;
  assert.ok(a.house && (a.royals ?? []).length >= 1, "every house has a royal from the start");
  const royal = a.royals![0];
  a.stock.coin = 50;
  turn(w, { 0: { actions: [{ type: "royal_marriage", to: "Âu Việt", royal: royal.id, dowry: { coin: 30 } }] } });
  assert.deepEqual(a.lastRejected, []);
  const off = w.marriageOffers!.at(-1)!;
  const coinB = b.stock.coin || 0;
  turn(w, { 1: { actions: [{ type: "accept_marriage", offer: off.id }] } });
  assert.deepEqual(b.lastRejected, []);
  assert.ok(inLaws(w, a.id, b.id));
  assert.ok(b.royals!.some(r => r.id === royal.id && r.from === a.id), "the royal went to the other court");
  assert.ok(!a.royals!.some(r => r.id === royal.id));
  assert.ok((b.stock.coin || 0) >= coinB + 30 - 1, "the dowry was paid");
  assert.ok(a.reputation > 50 && b.reputation > 50);
  // in-laws pay no duties, and their border calms
  treasuryOf(b).tariff = 0.5; a.stock.coin = 20;
  assert.equal(importDuty(w, new Ledger(w), a, b, { wood: 20 }), 0);
  borderOf(w, a.id, b.id).tension = 30;
  turn(w);
  assert.ok(borderOf(w, a.id, b.id).tension <= 30 - ROYALS.calm + 1, `${borderOf(w, a.id, b.id).tension}`);
  // a second offer between in-laws is refused
  turn(w, { 0: { actions: [{ type: "royal_marriage", to: "Âu Việt" }] } });
  assert.ok(a.lastRejected.some(r => r.action === "royal_marriage"));
});

test("war on in-laws breaks the bond and shames the one who declared it", () => {
  const w = founded("royals-war"), [a, b] = w.nations;
  turn(w, { 0: { actions: [{ type: "royal_marriage", to: "Âu Việt" }] } });
  turn(w, { 1: { actions: [{ type: "accept_marriage", offer: w.marriageOffers!.at(-1)!.id }] } });
  assert.ok(inLaws(w, a.id, b.id));
  const rep = b.reputation;
  turn(w, { 1: { actions: [{ type: "declare_war", target: "Văn Lang" }] } });
  assert.ok(!inLaws(w, a.id, b.id), "the bond is broken");
  assert.ok(b.reputation <= rep - ROYALS.breach.reputation + 1, `${rep} → ${b.reputation}`);
  assert.ok(b.lastEvents.some(e => /thông gia/.test(e)), JSON.stringify(b.lastEvents));
});
