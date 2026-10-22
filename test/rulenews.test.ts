// §10.8 New rules: the rulers are told what changed for a few turns after the rules change. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { RULES_VERSION } from "../src/rules.ts";
import { RULE_NEWS } from "../src/rulenews.ts";
import { buildObservation, systemPrompt } from "../src/ai/prompt.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const idle = { 0: { kind: "ok" as const, response: { actions: [{ type: "research", invention: "P2" }] } } };

test("a new world starts under the rules; a running world is told what changed, for a few turns", () => {
  const w = createWorld("rule-news", bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Nuoc A", capital: "Do A", people: "Dan A", flag: { layout: "h2", colors: ["#c0392b", "#ffffff"], symbol: "sun" } }] } } });
  assert.equal(w.rulesVersion, RULES_VERSION);
  assert.equal(w.rulesChange, undefined, "nothing to tell a new world");
  assert.equal((buildObservation(w, w.nations[0]) as { new_rules?: unknown }).new_rules, undefined);
  // the world was saved under older rules
  w.rulesVersion = "0.50";
  step(w, idle);
  assert.deepEqual(w.rulesChange, { from: "0.50", to: RULES_VERSION, tick: w.tick - 1 });
  const news = (buildObservation(w, w.nations[0]) as { new_rules?: { what_changed: string } }).new_rules;
  assert.ok(news && /v0\.5[1-9]/.test(news.what_changed), "the changelog since 0.50");
  assert.doesNotMatch(news!.what_changed, /^- \d+\.\d+\.\d+,/m, "patch notes are left out");
  assert.match(systemPrompt(w), /NEW RULES/);
  for (let k = 0; k < RULE_NEWS.turns; k++) step(w, idle);
  assert.equal((buildObservation(w, w.nations[0]) as { new_rules?: unknown }).new_rules, undefined, "told for a few turns only");
});
