// A nation's annals (§8.2): chapters since its founding, merged when there are too many. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { annalsFor, backfillAnnals } from "../src/annals.ts";
import { botTurn } from "../src/ai/bot.ts";
import { buildObservation } from "../src/ai/prompt.ts";
import { rngFor } from "../src/rng.ts";
import { ANNALS } from "../src/rules.ts";
import type { TurnInput } from "../src/types.ts";

test("annals: a chapter every ten turns, with the founding in the first; old chapters merge", () => {
  const w = createWorld("annals", Array.from({ length: 2 }, () => ({ controller: "bot", provider: "bot", model: "bot" }) as NationSpec));
  const [max, fine] = [ANNALS.maxChapters, ANNALS.keepFine];
  ANNALS.maxChapters = 4; ANNALS.keepFine = 1;
  try {
    for (let k = 0; k < 75; k++) {
      const inputs: Record<number, TurnInput> = {};
      for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: botTurn(w, n, rngFor(w.seed, w.tick, "bot", n.id)) };
      step(w, inputs);
    }
  } finally { ANNALS.maxChapters = max; ANNALS.keepFine = fine; }
  const n = w.nations[0], a = annalsFor(n);
  assert.equal(n.annals!.length, 4, "merged down to the cap");
  assert.equal(a.length, 5, "plus the chapter being written");
  assert.match(a[0].turns, /^L0–L/, "the story starts at the founding");
  assert.ok(a[0].notable.some(x => /Lập quốc/.test(x)), JSON.stringify(a[0].notable));
  assert.ok(n.annals!.some(c => c.to - c.from + 1 > ANNALS.chapter), "older chapters span more turns");
  const obs = buildObservation(w, n) as { annals: string[]; recent_turns: string[] };
  assert.equal(obs.annals.length, 5);
  assert.match(obs.annals[0], /^L0–L\d+ \| dân /, "one line a chapter");
  assert.equal(obs.recent_turns.length, ANNALS.recent);
});

test("annals rebuilt from a saved world's chronicle and population history", () => {
  const w = createWorld("backfill", [{ controller: "bot", provider: "bot", model: "bot" }]);
  const n = w.nations[0]; n.founded = true; n.name = "Nuoc";
  const stats = Array.from({ length: 25 }, (_, k) => ({ tick: k + 1, population: 20 + k, food: 50, stability: 70, tiles: 7 }));
  backfillAnnals(w, n, [{ tick: 0, nation: 0, kind: "found", text: "Lập quốc Nuoc." }, { tick: 12, nation: 0, kind: "war", text: "Nuoc tuyên chiến." }], stats);
  const a = annalsFor(n);
  assert.equal(a.length, 3);
  assert.equal(a[0].people, "20→29");
  assert.ok(a[1].notable.some(x => /tuyên chiến/.test(x)));
});
