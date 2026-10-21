// Great people (§4.12): born of a people that lives well, serving a few turns, lured away by a richer neighbour. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, mods, step, type NationSpec } from "../src/engine.ts";
import { GREATS } from "../src/rules.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function founded(seed: string): World {
  const w = createWorld(seed, bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Văn Lang", capital: "Phong Châu", people: "người Lạc", flag: flag("#c0392b") }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Âu Việt", capital: "Cổ Loa", people: "người Âu", flag: flag("#3355ff") }] } } });
  for (const n of w.nations) { n.stock.food = 500; n.population = 200; n.stability = 70; }
  return w;
}
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? { actions: [{ type: "research", invention: "P2" }] } };
  const out = step(w, inputs); assert.deepEqual(out.audit, []); return out;
}

test("great people are born to a people that lives well, serve their gift, and pass away", () => {
  const w = founded("greats"), [a] = w.nations;
  const base = GREATS.base; GREATS.base = 50; // certain
  a.living = 100;
  try { turn(w); } finally { GREATS.base = base; }
  assert.equal(a.greats?.length, 1, "one is born");
  const g = a.greats![0];
  assert.ok(g.name.split(" ").length >= 2 && g.dies > g.born);
  // the gift works through mods
  a.greats = [{ id: 99, name: "Lê An", kind: "scholar", born: w.tick, dies: w.tick + 5 }];
  const rp = mods(w, a).rp; a.greats = [];
  assert.ok(rp - mods(w, a).rp > 0.14, "a scholar: research +15%");
  // passing
  a.greats = [{ id: 98, name: "Trần Bình", kind: "general", born: 0, dies: w.tick }];
  turn(w);
  assert.ok(a.lastEvents.some(e => /qua đời/.test(e)), JSON.stringify(a.lastEvents));
});

test("invite_great: the gift goes to the hosts; a better life draws the great one over", () => {
  const w = founded("invite"), [a, b] = w.nations;
  a.met.push(b.id); b.met.push(a.id);
  b.greats = [{ id: 77, name: "Ngô Quân", kind: "artisan", born: w.tick, dies: w.tick + 6 }];
  a.living = 100; b.living = 0; a.stock.pearl = 10;
  const max = GREATS.inviteMax; GREATS.inviteMax = 1; GREATS.inviteBase = 1;
  try { turn(w, { 0: { actions: [{ type: "invite_great", great: 77, gift: { pearl: 5 } }] } }); } finally { GREATS.inviteMax = max; GREATS.inviteBase = 0.3; }
  assert.deepEqual(a.lastRejected, []);
  assert.ok(a.greats?.some(g => g.id === 77 && g.from === b.id), "the artisan moved");
  assert.ok((b.stock.pearl || 0) >= 3, "the gift went to the hosts (some worn as finery since)");
  turn(w, { 0: { actions: [{ type: "invite_great", great: 77, gift: { pearl: 5 } }] } });
  assert.ok(a.lastRejected.some(r => /Mỗi/.test(r.reason) || /Không có/.test(r.reason)));
});
