// §10.5 The gift of a mind: an idea the gods take up gives the nation a minister for a while, outside the seats. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { INITIATIVE } from "../src/rules.ts";
import { buildObservation } from "../src/ai/prompt.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Văn Lang", capital: "Phong Châu", people: "người Lạc", flag: flag("#c0392b") }] } } });
  const n = w.nations[0]; n.stock.food = 2000; n.population = 60; n.stability = 70;
  return w;
}
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? { actions: [{ type: "research", invention: "P2" }] } };
  const out = step(w, inputs); assert.deepEqual(out.audit, [], "ledger audit"); return out;
}
const idea = { type: "petition", category: "sáng kiến", kind: "cơ chế", mind: "diplomacy", title: "Mùa lũ mang phù sa", text: "Mỗi lần lũ sông để lại lớp phù sa: ruộng trên các ô ven sông bị lũ cho thêm 20% lương thực trong hai lượt sau lũ.", reason: "Thế giới thật hơn cho mọi nước" };

test("an idea costs no AP; taken up, it brings a mind of the chosen field for a while, outside the seats", () => {
  const w = founded("gift-mind"), [n] = w.nations;
  assert.equal(buildObservation(w, n).gods_reward_for_ideas!.can_propose_now, true);
  // the idea is free: it costs no action points
  turn(w, { 0: { actions: [idea] } });
  assert.deepEqual(n.lastRejected, []);
  const p = w.petitions.at(-1)!;
  assert.equal(p.mind, "diplomacy");
  p.status = "accepted"; p.delivered = false;
  turn(w);
  const m = (n.ministers ?? []).find(x => x.until !== undefined)!;
  assert.ok(m, "a mind was given");
  assert.equal(m.domain, "diplomacy");
  assert.equal(m.until, w.tick - 1 + 1 + INITIATIVE.mind.accepted);
  assert.equal(m.controller, "bot", "a bot nation gets a bot mind");
  assert.ok(n.population < 500, "a small nation, no seat of its own");
  // built into the world: the same mind serves longer
  p.implemented = w.tick;
  turn(w);
  assert.equal((n.ministers ?? []).filter(x => x.until !== undefined).length, 1);
  assert.ok(m.until! >= w.tick + INITIATIVE.mind.accepted, `${m.until}`);
  // and when its turns are done, it leaves
  m.until = w.tick;
  turn(w);
  assert.ok(!(n.ministers ?? []).some(x => x.until !== undefined));
  assert.ok(n.lastEvents.some(e => /hết hạn phụng sự/.test(e)), JSON.stringify(n.lastEvents));
});
