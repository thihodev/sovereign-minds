// Claude nations and national traits (§2.4, §3.4). The Claude CLI is
// test/fake-claude.mjs: nothing here reaches a model or spends tokens.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createWorld, inventionCost, mods, type NationSpec } from "../src/engine.ts";
import { Store } from "../src/db.ts";
import { Runner, nationSpecs, setupSpecs, type RunnerConfig } from "../src/runner.ts";
import { limitResetSec } from "../src/claude.ts";
import { START, TRAITS, TRAIT_BY_ID } from "../src/rules.ts";
import { buildObservation } from "../src/ai/prompt.ts";

const FAKE = resolve("test/fake-claude.mjs");
chmodSync(FAKE, 0o755);

function withTraits(...traits: string[]): NationSpec[] {
  return traits.map(trait => ({ controller: "bot", provider: "bot", model: "bot", trait }));
}

test("a trait counts in mods() like an invention, and its start values apply", () => {
  const w = createWorld("traits", withTraits("sages", "warriors", "nomads", ""));
  const [sage, warrior, nomad, plain] = w.nations;
  assert.equal(mods(w, sage).rp, mods(w, plain).rp + TRAIT_BY_ID.sages.effects.rp!);
  assert.equal(mods(w, warrior).combat, TRAIT_BY_ID.warriors.effects.combat);
  assert.equal(mods(w, nomad).tiles, mods(w, plain).tiles + 2);
  assert.equal(mods(w, nomad).winter, 0.75);
  assert.equal(warrior.reputation, START.reputation - 10);
  assert.equal(plain.reputation, START.reputation);
  assert.equal(buildObservation(w, plain).identity, undefined, "worlds without traits are unchanged");
  const id = buildObservation(w, sage).identity as { trait: string; effects: string[] };
  assert.equal(id.trait, TRAIT_BY_ID.sages.name);
  assert.ok(id.effects.some(e => e.startsWith("nghiên cứu +")));
});

test("traders learn cheaper from nations they have met", () => {
  const w = createWorld("diffusion", withTraits("traders", "sages", ""));
  const [trader, teacher, plain] = w.nations;
  const target = "P10";
  teacher.inventions.push(target);
  trader.met.push(teacher.id); plain.met.push(teacher.id);
  assert.ok(inventionCost(w, trader, target) < inventionCost(w, plain, target), "trader pays less than a plain nation");
});

test("setup: blank traits are drawn from the unused ones, duplicates refused, bad values fall back", () => {
  const specs = setupSpecs({ seed: "s", tickSeconds: 600, nations: [{ trait: "sages", model: "sonnet", effort: "high" }, { trait: "" }, { model: "gpt", effort: "turbo" }] });
  assert.ok(Array.isArray(specs));
  const list = specs as NationSpec[];
  assert.equal(list[0].trait, "sages"); assert.equal(list[0].model, "sonnet"); assert.equal(list[0].effort, "high");
  assert.equal(new Set(list.map(s => s.trait)).size, 3, "all different");
  assert.equal(list[2].model, "haiku"); assert.equal(list[2].effort, "low");
  assert.ok(list.every(s => s.provider === "claude" && s.controller === "ai"));
  assert.equal(typeof setupSpecs({ seed: "s", tickSeconds: 0, nations: [{ trait: "sages" }, { trait: "sages" }] }), "string");
  assert.equal(typeof setupSpecs({ seed: "s", tickSeconds: 0, nations: [{}] }), "string");
});

test("NATIONS=claude:model:effort, and every nation gets a different trait from the seed", () => {
  const cfg = { seed: "x", nations: ["claude:sonnet:medium", "claude", "bot"], fillWithBots: true } as RunnerConfig;
  const { specs } = nationSpecs(cfg);
  assert.deepEqual(specs.slice(0, 2).map(s => [s.provider, s.model, s.effort]), [["claude", "sonnet", "medium"], ["claude", "haiku", "low"]]);
  assert.equal(new Set(specs.map(s => s.trait)).size, 3);
  assert.deepEqual(nationSpecs(cfg).specs.map(s => s.trait), specs.map(s => s.trait), "same seed, same traits");
  assert.ok(specs.every(s => TRAITS.some(t => t.id === s.trait)));
});

test("plan limit messages give the reset time", () => {
  const now = Date.UTC(2026, 9, 20, 10, 0, 0);
  assert.equal(limitResetSec(`Claude AI usage limit reached|${now / 1000 + 600}`, now), 600);
  assert.equal(limitResetSec("nothing here", now), null);
  const pm = limitResetSec("You've hit your limit · resets 3pm", now)!;
  assert.ok(pm > 0 && pm <= 24 * 3600);
});

function runnerWithFake(dir: string): Runner {
  process.env.CLAUDE_CLI = FAKE;
  process.env.FAKE_CLAUDE_LOG = join(dir, "calls.log");
  process.env.HISTORIAN_PROVIDER = "off";
  const store = new Store(join(dir, "world.db"));
  return new Runner(store, { seed: "claude-test", nations: ["claude:sonnet:high", "claude", "claude"], fillWithBots: true, tickSeconds: 600, aiTimeoutSec: 30, judgeProviders: ["claude"], judgesPerTick: 1 });
}
const turnCalls = (dir: string) => readFileSync(join(dir, "calls.log"), "utf8").trim().split("\n").map(l => JSON.parse(l) as string[]).filter(a => a[0] === "-p");

test("Claude nations play through the CLI with their own model and effort", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sm-claude-"));
  const prev = { ...process.env };
  try {
    process.env.FAKE_CLAUDE_MODE = "ok";
    const r = runnerWithFake(dir);
    assert.equal(r.store.getMeta("setup_pending"), "1", "a new install waits for the Watcher's setup");
    await r.runTick();
    assert.equal(r.world.tick, 1);
    const calls = turnCalls(dir);
    assert.equal(calls.length, 3);
    const flags = calls.map(a => `${a[a.indexOf("--model") + 1]}/${a[a.indexOf("--effort") + 1]}`).sort();
    assert.deepEqual(flags, ["haiku/low", "haiku/low", "sonnet/high"]);
    assert.ok(r.world.nations.every(n => n.status === "active" && n.lastThought === "Giữ lửa và đi săn."));
    assert.equal(r.setNationModel(1, "sonnet", "medium"), null);
    assert.equal(r.world.nations[1].effort, "medium");
    assert.ok(r.setNationModel(1, "opus", "low"));
    r.store.close();
  } finally { process.env = prev; rmSync(dir, { recursive: true, force: true }); }
});

test("a plan limit holds the whole world; answers already in are kept and not asked again", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sm-claude-"));
  const prev = { ...process.env };
  try {
    process.env.FAKE_CLAUDE_MODE = "limit-after-1";
    process.env.CLAUDE_CONCURRENCY = "1"; // one at a time, so "the first turn answers" is well defined
    const r = runnerWithFake(dir);
    await r.runTick();
    assert.equal(r.world.tick, 0, "nobody moved, not even the nation that answered");
    assert.equal(r.world.nations.filter(n => n.lastThought).length, 0);
    assert.ok(r.claudeWait.until > Date.now() + 30 * 60_000, "waits until the limit resets");
    assert.ok(r.nextTickAt >= r.claudeWait.until);
    // The limit is over: only the nations without an answer are asked
    process.env.FAKE_CLAUDE_MODE = "ok";
    r.claudeWait = { until: 0, reason: "" };
    const before = turnCalls(dir).length;
    await r.runTick();
    assert.equal(r.world.tick, 1);
    assert.equal(turnCalls(dir).length - before, 2, "only the 2 that hit the limit are asked again");
    assert.equal(r.world.nations.filter(n => n.lastThought).length, 3, "all three moved together");
    r.store.close();
  } finally { process.env = prev; rmSync(dir, { recursive: true, force: true }); }
});

test("logged out: the world waits for the Watcher's login instead of spending turns", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sm-claude-"));
  const prev = { ...process.env };
  try {
    process.env.FAKE_CLAUDE_MODE = "logout";
    const r = runnerWithFake(dir);
    await r.runTick();
    assert.equal(r.world.tick, 0);
    assert.match(r.claudeWait.reason, /đăng nhập/);
    assert.equal(turnCalls(dir).length, 0, "no turn was sent");
    process.env.FAKE_CLAUDE_MODE = "ok";
    r.claudeLoggedIn();
    assert.equal(r.claudeWait.until, 0);
    await r.runTick();
    assert.equal(r.world.tick, 1);
    r.store.close();
  } finally { process.env = prev; rmSync(dir, { recursive: true, force: true }); }
});

test("new world: backs up the old one and starts from the setup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sm-claude-"));
  const prev = { ...process.env };
  try {
    process.env.FAKE_CLAUDE_MODE = "ok";
    const r = runnerWithFake(dir);
    await r.runTick();
    const res = await r.newWorld({ seed: "the-second", tickSeconds: 900, nations: [{ trait: "mystics", model: "sonnet", effort: "medium" }, { trait: "hunters" }] });
    assert.equal(res.error, undefined);
    assert.ok(res.backup && existsSync(res.backup), "old world saved");
    assert.equal(r.world.seed, "the-second"); assert.equal(r.world.tick, 0);
    assert.deepEqual(r.world.nations.map(n => n.trait), ["mystics", "hunters"]);
    assert.equal(r.cfg.tickSeconds, 900);
    assert.equal(r.store.getMeta("setup_pending"), "0");
    assert.equal(r.paused, false);
    assert.equal((r.store.chronicle(10) as unknown[]).length, 1, "a fresh chronicle");
    const old = new Store(res.backup!);
    assert.equal(old.loadState()?.tick, 1, "the backup holds the old world");
    old.close(); r.store.close();
  } finally { process.env = prev; rmSync(dir, { recursive: true, force: true }); }
});

test("the Judge of Ideas (Claude) rules on the nations' initiatives; the Watcher only marks what is built", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sm-ideas-"));
  const prev = { ...process.env };
  try {
    process.env.FAKE_CLAUDE_MODE = "ok";
    const r = runnerWithFake(dir);
    await r.runTick();
    const w = r.world, [a, b] = w.nations;
    const idea = (n: number, title: string) => w.petitions.push({ id: w.petitions.length + 1, nation: n, tick: w.tick - 1, category: "sáng kiến", kind: "cơ chế", title, text: "Một cơ chế cụ thể có con số, đủ dài để được xét: mỗi làng có giếng thì dịch bệnh lây chậm hơn 20%.", reason: "Cho mọi nước", context: { population: 50, stability: 60, food: 100, tiles: 20, era: "Đồ Đá Cũ" }, status: "pending", verdict: "", decidedTick: null, mergedInto: null, delivered: false } as never);
    idea(a.id, "Giếng chống dịch"); idea(b.id, "Lúa hoang");
    await r.runTick();
    const [p1, p2] = w.petitions.slice(-2);
    assert.equal(p1.status, "partial"); assert.equal(p2.status, "rejected");
    assert.match(p1.judge ?? "", /Claude/);
    assert.ok(p1.verdict.length > 10 && p2.verdict.length > 10);
    // the Watcher's own ruling still wins, and the judge is then forgotten
    assert.equal(r.decidePetition(p2.id, "accepted", "Thần linh đổi ý.", null), null);
    assert.equal(p2.status, "accepted"); assert.equal(p2.judge, undefined);
    // off by switch
    process.env.IDEA_JUDGE = "off";
    idea(a.id, "Ý mới");
    await r.runTick();
    assert.equal(w.petitions.at(-1)!.status, "pending");
    r.store.close?.();
  } finally { process.env = prev; rmSync(dir, { recursive: true, force: true }); }
});

test("the Watcher's chat sees every nation's buildings, centres and treasury, to answer outright", () => {
  const dir = mkdtempSync(join(tmpdir(), "sm-chat-"));
  try {
    const r = runnerWithFake(dir), n = r.world.nations[0];
    Object.assign(n, { founded: true, name: "Văn Hà", capitalName: "Kinh Thiên" });
    n.buildings.push({ id: 900, type: "airport", tile: n.capital, progress: 3, done: false, hp: 100 }, { id: 901, type: "field", tile: n.capital, progress: 8, done: true, hp: 100 });
    const ctx = r.summary([], "đã có sân bay nào chưa?");
    assert.match(ctx, /công trình \(đủ, chính xác\): .*Ruộng ×1/);
    assert.match(ctx, /Sân bay ×0 \(\+1 đang xây\)/);
    assert.match(ctx, /trung tâm: Kinh Thiên \(làng\)/);
    r.store.close?.();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
