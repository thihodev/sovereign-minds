// §7.4b A war keeps the talks between the two (offers with their terms, letters, the signing) and the treaty's dues paid. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function founded(seed: string): World {
  const w = createWorld(seed, bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Lạc Việt", capital: "Phong Châu", people: "người Lạc", flag: flag("#c0392b") }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Đông Hưng", capital: "Cổ Loa", people: "người Hưng", flag: flag("#3355ff") }] } } });
  for (const n of w.nations) { n.stock.food = 800; n.population = 80; n.stability = 70; n.stock.coin = 200; }
  w.nations[0].met.push(1); w.nations[1].met.push(0);
  return w;
}
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? { actions: [{ type: "research", invention: "P2" }] } };
  const out = step(w, inputs); assert.deepEqual(out.audit, [], "ledger audit"); return out;
}

test("the talks of a war and the terms of its peace are kept with the war", () => {
  const w = founded("talks"), [a, b] = w.nations;
  turn(w, { 0: { actions: [{ type: "declare_war", target: "Đông Hưng" }] } });
  turn(w, { 1: { actions: [{ type: "message", to: "Lạc Việt", gesture: "muốn hòa bình" }] } });
  turn(w, { 1: { actions: [{ type: "treaty", to: "Lạc Việt", kind: "peace", tribute: { coin: 5 }, duration: 10, payer: "me" }] } });
  assert.deepEqual(b.lastRejected, []);
  const offer = w.treatyOffers.at(-1)!;
  turn(w, { 0: { actions: [{ type: "accept_treaty", offer: offer.id }] } });
  const war = w.wars.find(x => x.a === a.id && x.b === b.id)!;
  assert.ok(war.end !== null, "the war is over");
  const kinds = (war.talks ?? []).map(t => t.kind);
  assert.deepEqual(kinds, ["message", "offer", "signed"], JSON.stringify(war.talks));
  assert.match(war.talks![1].text, /Đông Hưng nộp 5 tiền mỗi lượt, thời hạn 10 lượt/);
  const t = w.treaties.find(x => x.id === war.treaty)!;
  assert.equal(t.by, b.id); assert.equal(t.a, b.id, "the payer");
  turn(w); turn(w);
  assert.ok((t.paid ?? 0) >= 1, `${t.paid}`);
});
