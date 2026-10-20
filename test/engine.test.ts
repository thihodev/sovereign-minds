import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { workers, createWorld, step, deltaE, ownedTiles, type NationSpec } from "../src/engine.ts";
import { generateWorld } from "../src/worldgen.ts";
import { botTurn } from "../src/ai/bot.ts";
import { rngFor } from "../src/rng.ts";
import { extractJson, parseRetryAfter } from "../src/ai/gateway.ts";
import { buildObservation } from "../src/ai/prompt.ts";
import type { TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
function run(world: World, ticks: number): string[] {
  const audits: string[] = [];
  for (let t = 0; t < ticks; t++) {
    const inputs: Record<number, TurnInput> = {};
    for (const n of world.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: botTurn(world, n, rngFor(world.seed, world.tick, "bot", n.id)) };
    audits.push(...step(world, inputs).audit);
  }
  return audits;
}
const hash = (w: World) => createHash("sha256").update(JSON.stringify(w)).digest("hex");

test("world generation is deterministic and ~55% land", () => {
  const a = generateWorld("seed-x", 5), b = generateWorld("seed-x", 5);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const land = a.tiles.filter(t => t.land).length / a.tiles.length;
  assert.ok(land > 0.5 && land < 0.6, `land ${land}`);
  assert.equal(a.spawns.length, 5);
  assert.ok(a.spread <= 0.1, `spawn spread ${a.spread}`);
  assert.equal(a.wonders.length, 7);
});

test("the ledger audit passes and bots survive 300 ticks", () => {
  const w = createWorld("nguyen-dia-1", bots(5));
  assert.deepEqual(run(w, 300), []);
  assert.ok(w.nations.filter(n => n.alive).length >= 4, "at least 4 of 5 bot nations alive");
  assert.ok(w.nations.some(n => n.inventions.length > 10), "some progress");
});

test("same seed and same inputs give the same world (replay)", () => {
  const a = createWorld("replay", bots(4)), b = createWorld("replay", bots(4));
  run(a, 80); run(b, 80);
  assert.equal(hash(a), hash(b));
});

test("founding rules: names, model names, flag colours", () => {
  const w = createWorld("found", bots(2));
  const flag = { layout: "h2", colors: ["#aa2222", "#ffffff"], symbol: "sun" };
  const inputs: Record<number, TurnInput> = {
    0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Arun", capital: "Lò Đá", people: "người Arun", flag }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "ARÙN", capital: "Suối", people: "người Suối", flag: { ...flag, colors: ["#ab2323", "#000000"] } }] } },
  };
  step(w, inputs);
  const founded = w.nations.filter(n => n.founded);
  assert.equal(founded.length, 1, "duplicate name (ignoring case/accents) is rejected");
  const loser = w.nations.find(n => !n.founded)!;
  assert.match(loser.lastRejected[0].reason, /đã có quốc gia khác dùng/);
  // A model name is never a nation name
  const w2 = createWorld("found2", bots(1));
  step(w2, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Gemini Land", capital: "Ka", people: "Ka", flag }] } } });
  assert.equal(w2.nations[0].founded, false);
  assert.ok(deltaE("#aa2222", "#ab2323") < 25);
});

test("illegal actions are rejected and still cost AP", () => {
  const w = createWorld("illegal", bots(1));
  run(w, 1);
  const n = w.nations[0];
  step(w, { 0: { kind: "ok", response: { actions: [
    { type: "research", invention: "P14" }, // missing prerequisite P1
    { type: "declare_war", target: "x" },   // not in this engine version
    { type: "build", building: "tent" },    // needs P8
    { type: "claim_tile", tile: [0, 0] },   // not adjacent
  ] } } });
  assert.equal(n.lastRejected.length, 4);
  assert.match(n.lastRejected[0].reason, /Thiếu tiên quyết/);
});

test("asleep nations are not punished; silent ones are after 3 turns", () => {
  const w = createWorld("sleep", bots(2));
  run(w, 2);
  const s0 = w.nations[0].stability, s1 = w.nations[1].stability;
  for (let k = 0; k < 4; k++) step(w, { 0: { kind: "asleep" }, 1: { kind: "silent", reason: "timeout" } });
  assert.ok(w.nations[1].silentStreak >= 3);
  assert.ok(w.nations[1].stability - s1 < w.nations[0].stability - s0, "silent nation loses more stability");
});

test("petitions queue with limits", () => {
  const w = createWorld("petition", bots(1));
  run(w, 1);
  const pet = { type: "petition", category: "tài nguyên", title: "Thêm cá", text: "Xin tăng cá ven biển", reason: "Đói" };
  step(w, { 0: { kind: "ok", response: { actions: [pet] } } });
  step(w, { 0: { kind: "ok", response: { actions: [pet] } } });
  assert.equal(w.petitions.length, 1, "one petition per 10 ticks");
  assert.equal(w.petitions[0].status, "pending");
});

test("observation hides ores and other nations' secrets", () => {
  const w = createWorld("obs", bots(3));
  run(w, 3);
  const o = JSON.stringify(buildObservation(w, w.nations[0]));
  assert.ok(!/"copper"|"tin"|"iron"/.test(o), "ores hidden without nhận-biết-khoáng");
  for (const other of w.nations.slice(1)) if (other.memory) assert.ok(!o.includes(other.memory));
  assert.ok(ownedTiles(w, 0).length >= 7);
});

test("gateway helpers: JSON extraction and retry hints", () => {
  assert.deepEqual(extractJson('<think>{"no"}</think>```json\n{"a": {"b": "}"}}\n```'), { a: { b: "}" } });
  assert.equal(extractJson("no json here"), null);
  assert.equal(parseRetryAfter({ "retry-after": "30" }, ""), 30);
  assert.equal(parseRetryAfter({ "x-ratelimit-reset-requests": "2m30s" }, ""), 150);
  assert.equal(parseRetryAfter({}, '{"error":{"details":[{"retryDelay":"41s"}]}}'), 41);
});

test("over-assigned labour scales down without wiping small roles", () => {
  const w = createWorld("labor", bots(1));
  run(w, 1);
  const n = w.nations[0];
  n.population = 19;
  const hands = workers(n); // about 13: work is weighted by age (§4.2)
  assert.ok(hands < 14);
  step(w, { 0: { kind: "ok", response: { labor: { hunt: 8, gather: 5, research: 1 } } } });
  assert.equal(n.labor.research, 1);
  assert.equal(Object.values(n.labor).reduce((a, b) => a + b, 0), hands);
});
