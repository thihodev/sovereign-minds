// §4.9 AI ministers: milestones of people open seats; a nation asks, the Watcher grants a mind, the minister
// acts in its own field from its own AP. The Claude CLI is test/fake-claude.mjs: no model is ever called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { MINISTERS } from "../src/rules.ts";
import { keptSeats, ministerAdvice, ministerAp, ministerSeats } from "../src/ministers.ts";
import { buildObservation, systemPrompt } from "../src/ai/prompt.ts";
import { advice } from "../src/ai/advice.ts";
import { ministerObservation, ministerSystem } from "../src/ai/minister.ts";
import { Store } from "../src/db.ts";
import { Runner } from "../src/runner.ts";
import type { AIResponse, ChronicleEntry, Minister, MinisterInput, Nation, TurnInput, World } from "../src/types.ts";

const FAKE = resolve("test/fake-claude.mjs");
chmodSync(FAKE, 0o755);

const bots = (k: number): NationSpec[] => Array.from({ length: k }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const FLAGS = [["#c0392b", "sun"], ["#3355ff", "moon"]];
function founded(seed: string, pop: number): World {
  const w = createWorld(seed, bots(2));
  step(w, Object.fromEntries(w.nations.map((n, k) => [n.id, { kind: "ok", response: { actions: [{ type: "found_nation", name: `Nuoc${"AB"[k]}`, capital: `Do${"AB"[k]}`, people: `Dan${"AB"[k]}`, flag: { layout: "h2", colors: [FLAGS[k][0], "#ffffff"], symbol: FLAGS[k][1] } }] } }])));
  for (const n of w.nations) { n.stock.food = 50000; n.stability = 80; }
  w.nations[0].population = pop;
  return w;
}
function turn(w: World, acts: Record<number, AIResponse> = {}, ministers: Record<number, MinisterInput[]> = {}): ChronicleEntry[] {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? {}, ...(ministers[n.id] ? { ministers: ministers[n.id] } : {}) };
  const out = step(w, inputs);
  assert.deepEqual(out.audit, [], "ledger audit");
  return out.chronicle;
}
const orders = (n: Nation) => n.recent!.at(-1)!.orders;
/** Seat a minister directly (the request flow has its own test). */
function seat(w: World, n: Nation, domain: string): Minister {
  const m: Minister = { id: w.nextId++, domain, name: "Kalu", controller: "ai", model: "haiku", effort: "low", since: w.tick, request: 0, lastOrders: [] };
  (n.ministers ??= []).push(m);
  return m;
}
const claimable = (w: World, n: Nation) => (buildObservation(w, n).claimable as Array<{ tile: number[] }>).map(c => c.tile);

test("milestones: no seat below 500 people, one from 500, then 1000, 2000, 4000; seats kept down to 90%", () => {
  assert.deepEqual([0, 499, 500, 999, 1000, 2000, 4000, 9000].map(ministerSeats), [0, 0, 1, 1, 2, 3, 4, 4]);
  assert.equal(keptSeats(450), 1); assert.equal(keptSeats(449), 0);
  const w = founded("min-eligible", 499), n = w.nations[0];
  const obs = buildObservation(w, n).ministers as Record<string, unknown>;
  assert.equal(obs.seats, 0); assert.equal(obs.next_seat_at_people, 500); assert.equal(obs.can_request_now, undefined);
  assert.match(ministerAdvice(w, n)[0].text, /Còn 1 dân nữa tới mốc 500/);
  assert.equal(buildObservation(w, w.nations[1]).ministers, undefined, "a small people does not see it yet");
  assert.match(systemPrompt(w), /AI MINISTERS: .*1 minister from 500 people, 2 from 1000/);
  turn(w, { 0: { actions: [{ type: "request_minister", domain: "economy" }] } });
  assert.ok(orders(n).some(o => /request_minister economy ✗ Cần 500 dân/.test(o)), orders(n).join(" | "));
  n.population = 520;
  const o2 = buildObservation(w, n).ministers as Record<string, unknown>;
  assert.equal(o2.seats, 1); assert.deepEqual(o2.can_request_now, ["economy", "war", "diplomacy", "learning", "interior"]);
  assert.ok(advice(w, n).some(a => a.level === 2 && /request_minister/.test(a.text)), "the advisor says it may ask now");
});

test("request → the Watcher grants → the minister takes office next turn; seats are counted", () => {
  const w = founded("min-request", 1200), n = w.nations[0];
  const chron = turn(w, { 0: { actions: [{ type: "request_minister", domain: "economy", reason: "Kho và đất đai đã quá lớn." }, { type: "request_minister", domain: "economy" }, { type: "request_minister", domain: "war" }, { type: "request_minister", domain: "learning" }] } });
  const reqs = w.ministerRequests!;
  assert.deepEqual(reqs.map(x => [x.domain, x.status]), [["economy", "pending"], ["war", "pending"]]);
  assert.ok(chron.some(c => c.kind === "minister" && /xin các vị thần một Bộ trưởng Kinh tế/.test(c.text)));
  const o = orders(n).join(" | ");
  assert.match(o, /request_minister economy ✗ Đơn xin Bộ trưởng Kinh tế đang chờ/);
  assert.match(o, /request_minister learning ✗ Đã dùng hết 2 ghế/);
  // The Watcher's answer (what Runner.decideMinister writes)
  Object.assign(reqs[0], { status: "approved", controller: "ai", model: "haiku", effort: "low", decidedTick: w.tick });
  Object.assign(reqs[1], { status: "refused", verdict: "Chưa cần.", decidedTick: w.tick, delivered: false });
  const chron2 = turn(w);
  assert.equal(n.ministers!.length, 1);
  const m = n.ministers![0];
  assert.deepEqual([m.domain, m.controller, m.model, m.since], ["economy", "ai", "haiku", w.tick - 1]);
  assert.equal(reqs[0].status, "done"); assert.equal(reqs[0].minister, m.id);
  assert.ok(chron2.some(c => c.kind === "minister" && /có Bộ trưởng Kinh tế/.test(c.text)));
  assert.ok(n.lastEvents.some(e => /Các vị thần ban cho .* Bộ trưởng Kinh tế/.test(e)));
  assert.ok(n.lastEvents.some(e => /không ban Bộ trưởng Chiến tranh: Chưa cần/.test(e)));
  // a refused field waits before it is asked again
  turn(w, { 0: { actions: [{ type: "request_minister", domain: "war" }] } });
  assert.match(orders(n).join(" | "), /request_minister war ✗ Các vị thần vừa từ chối/);
  const seen = buildObservation(w, n).ministers as { serving: Array<{ field: string }> };
  assert.equal(seen.serving[0].field, "economy");
});

test("a minister acts only in its field, from its own AP, after the ruler; its orders are in the record", () => {
  const v = founded("min-ap", 1200), n = v.nations[0];
  const m = seat(v, n, "economy");
  assert.equal(ministerAp(n), MINISTERS.ap.base + 1);
  const [a, b, c, d] = claimable(v, n);
  turn(v, { 0: { actions: [{ type: "claim_tile", tile: d }] } }, { 0: [{ minister: m.id, domain: "economy", response: { thought: "Mở đất.", actions: [{ type: "research", invention: "P1" }, { type: "claim_tile", tile: a }, { type: "claim_tile", tile: b }, { type: "claim_tile", tile: c }] } }] });
  const o = orders(n);
  assert.ok(o.some(x => /^claim_tile .* ✓$/.test(x)), "the ruler's own order, from its own AP");
  assert.ok(o.some(x => /^\[kinh tế\] research P1 ✗ Ngoài lĩnh vực của Bộ trưởng Kinh tế/.test(x)), o.join(" | "));
  assert.equal(o.filter(x => /^\[kinh tế\] claim_tile .* ✓$/.test(x)).length, 2, o.join(" | "));
  assert.ok(o.some(x => /^\[kinh tế\] claim_tile .* ✗ Không đủ AP của bộ trưởng \(cần 2, còn 0\)/.test(x)), o.join(" | "));
  assert.equal(m.lastThought, "Mở đất."); assert.equal(m.lastOrders!.length, 4); assert.equal(m.lastTick, v.tick - 1);
  for (const t of [a, b, d]) assert.equal(v.tiles[t[0] + t[1] * 128].owner, n.id, `tile ${t} taken`);
  assert.ok(n.lastRejected.some(r => r.action === "[kinh tế] research"));
  const ruler = buildObservation(v, n).ministers as { serving: Array<{ last_turn_orders: string[]; last_thought: string }> };
  assert.equal(ruler.serving[0].last_turn_orders.length, 4); assert.equal(ruler.serving[0].last_thought, "Mở đất.");
  // a minister of a nation that answered nothing still acts; one the nation does not have does nothing
  turn(v, {}, { 0: [{ minister: 999, domain: "war", response: { actions: [{ type: "raid", target: "NuocB", warriors: 1 }] } }] });
  assert.ok(!orders(n).some(x => x.startsWith("[chiến tranh]")));
});

test("economy labour applies only when the ruler sends none; the ruler's research and peace stay the ruler's", () => {
  const w = founded("min-labor", 6000), n = w.nations[0];
  // the people shrinks fast here (no housing for so many): the newest seats go first, so the war minister is seated first
  const war = seat(w, n, "war"), eco = seat(w, n, "economy"), learn = seat(w, n, "learning"), dip = seat(w, n, "diplomacy");
  turn(w, { 0: { actions: [{ type: "family_policy", births: "neutral" }] } }, { 0: [{ minister: eco.id, domain: "economy", response: { labor: { research: 7, gather: 100 } } }] });
  assert.equal(n.labor.research, 7, "the minister's labour, the ruler sent none");
  assert.ok(orders(n).includes("[kinh tế] labor ✓"));
  turn(w, { 0: { labor: { research: 3, gather: 100 }, actions: [{ type: "research", invention: "P1" }] } }, {
    0: [
      { minister: eco.id, domain: "economy", response: { labor: { research: 9 } } },
      { minister: learn.id, domain: "learning", response: { actions: [{ type: "research", invention: "P2" }] } },
      { minister: dip.id, domain: "diplomacy", response: { actions: [{ type: "treaty", to: "NuocB", kind: "peace", duration: 10 }, { type: "declare_war", target: "NuocB" }] } },
      { minister: war.id, domain: "war", response: { warriors: 20, actions: [{ type: "declare_war", target: "NuocB" }] } },
    ],
  });
  const o = orders(n).join(" | ");
  assert.equal(n.labor.research, 3, "the ruler's labour stands");
  assert.match(o, /\[kinh tế\] labor ✗ người trị vì đã phân công/);
  assert.match(o, /\[học thuật\] research P2 ✗ Người trị vì đã ra lệnh research/);
  assert.match(o, /\[ngoại giao\] treaty NuocB ✗ Giảng hòa là việc của người trị vì/);
  assert.match(o, /\[ngoại giao\] declare_war NuocB ✗ Ngoài lĩnh vực/);
  assert.match(o, /\[chiến tranh\] warriors ✗/);
  assert.match(o, /\[chiến tranh\] declare_war NuocB ✗ Ngoài lĩnh vực/);
  assert.equal(w.wars.length, 0);
  // no labour from the ruler: the war minister sets the warriors
  turn(w, {}, { 0: [{ minister: war.id, domain: "war", response: { warriors: 20 } }] });
  assert.equal(n.labor.warrior, 20);
  assert.ok(orders(n).includes("[chiến tranh] warriors 20 ✓"));
});

test("a minister's prompt holds only its field's rules; its observation carries the ruler's directives", () => {
  const w = founded("min-prompt", 1200), n = w.nations[0];
  n.lastThought = "Mở rộng về phía sông."; n.memory = "Kế hoạch: khai hoang ven sông, làm đường.";
  const m = seat(w, n, "learning");
  const sys = ministerSystem(w, n, m);
  assert.match(sys, /^You are a MINISTER/);
  assert.match(sys, /You serve the ruler of NuocA/);
  assert.match(sys, /- research \(1\)/); assert.match(sys, /- propose_invention \(2\)/);
  assert.doesNotMatch(sys, /- declare_war \(/); assert.doesNotMatch(sys, /- build \(1\)/); assert.doesNotMatch(sys, /found_nation \(0/);
  assert.match(sys, /AN OPEN WORLD/);
  assert.ok(sys.length < systemPrompt(w).length / 2, "short");
  const eco = ministerSystem(w, n, seat(w, n, "economy"));
  assert.match(eco, /- build \(1\)/); assert.match(eco, /- claim_tile \(2\)/); assert.match(eco, /"labor"/);
  const obs = ministerObservation(w, n, m);
  assert.deepEqual(obs.ruler_directives, { ruler_last_thought: "Mở rộng về phía sông.", ruler_memory: "Kế hoạch: khai hoang ven sông, làm đường." });
  assert.equal(obs.ap, ministerAp(n));
  assert.ok(obs.research_options && !obs.territory, "its field's parts only");
});

test("a people that shrinks below 90% of a milestone loses its newest minister", () => {
  const w = founded("min-shrink", 1200), n = w.nations[0];
  seat(w, n, "economy"); seat(w, n, "war");
  n.population = 880; // keeps one seat (≥ 450), not two (< 900)
  const chron = turn(w);
  assert.deepEqual(n.ministers!.map(m => m.domain), ["economy"]);
  assert.ok(chron.some(c => c.kind === "minister" && /từ nhiệm/.test(c.text)));
});

function runnerWithFake(dir: string): Runner {
  process.env.CLAUDE_CLI = FAKE;
  process.env.FAKE_CLAUDE_LOG = join(dir, "calls.log");
  process.env.FAKE_CLAUDE_MODE = "ok";
  process.env.HISTORIAN_PROVIDER = "off";
  return new Runner(new Store(join(dir, "world.db")), { seed: "minister-test", nations: ["claude", "claude"], fillWithBots: true, tickSeconds: 600, aiTimeoutSec: 30, judgeProviders: [], judgesPerTick: 0 });
}
const minCalls = (list: string[][]) => list.filter(a => a[a.indexOf("--system-prompt") + 1].startsWith("You are a MINISTER"));
const calls = (dir: string) => readFileSync(join(dir, "calls.log"), "utf8").trim().split("\n").map(l => JSON.parse(l) as string[]).filter(a => a[0] === "-p");

test("runner: the Watcher grants a Claude minister, it is asked beside its ruler, and can be dismissed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sm-min-"));
  const prev = { ...process.env };
  try {
    const r = runnerWithFake(dir);
    await r.runTick(); await r.runTick(); // tick 0, then founding by the gods
    const n = r.world.nations[0];
    assert.ok(n.founded);
    n.population = 1200; n.stock.food = 50000;
    r.world.ministerRequests = [
      { id: 1, nation: 0, domain: "learning", tick: r.world.tick, population: 1200, reason: "", status: "pending" },
      { id: 2, nation: 0, domain: "economy", tick: r.world.tick, population: 1200, reason: "", status: "pending" },
    ];
    assert.equal(r.decideMinister(1, "approved", "gpt", "low", ""), "Model không hợp lệ");
    assert.equal(r.decideMinister(1, "approved", "haiku", "medium", "Hãy giúp vua."), null);
    assert.equal(r.decideMinister(1, "refused", "", "", ""), "Đơn này đã được quyết định");
    assert.equal(r.decideMinister(2, "approved", "bot", "", ""), null);
    let before = calls(dir).length;
    await r.runTick(); // they take office
    assert.equal(minCalls(calls(dir).slice(before)).length, 0, "only the rulers this turn");
    assert.deepEqual(n.ministers!.map(m => [m.domain, m.controller, m.model, m.effort]), [["learning", "ai", "haiku", "medium"], ["economy", "bot", "bot", undefined]]);
    before = calls(dir).length;
    await r.runTick();
    const now = calls(dir).slice(before);
    const asked = minCalls(now);
    assert.equal(asked.length, 1, "the Claude minister; the bot minister costs no call");
    assert.ok(now.length > asked.length, "beside the rulers");
    assert.deepEqual([asked[0][asked[0].indexOf("--model") + 1], asked[0][asked[0].indexOf("--effort") + 1]], ["haiku", "medium"]);
    const learn = n.ministers![0];
    assert.equal(learn.lastThought, "Thần xin tuân lệnh."); assert.equal(learn.lastTick, r.world.tick - 1);
    assert.equal(n.lastThought, "Giữ lửa và đi săn.", "the ruler's own answer");
    // The Watcher dismisses the learning minister
    assert.equal(r.dismissMinister(0, learn.id, "Đã đủ."), null);
    assert.deepEqual(n.ministers!.map(m => m.domain), ["economy"]);
    assert.equal(r.world.ministerRequests[0].status, "ended");
    assert.ok(r.dismissMinister(0, learn.id, ""), "already gone");
    before = calls(dir).length;
    await r.runTick();
    assert.equal(minCalls(calls(dir).slice(before)).length, 0, "no minister call any more");
    assert.ok(n.lastEvents.some(e => /bãi nhiệm Bộ trưởng Học thuật: Đã đủ/.test(e)));
    r.store.close();
  } finally { process.env = prev; rmSync(dir, { recursive: true, force: true }); }
});
