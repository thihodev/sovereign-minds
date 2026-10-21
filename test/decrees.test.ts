// Renaming decrees of the gods (§10.4): free renames while it lasts, a penalty for nations that ignore it. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorld, step, unrenamed, type NationSpec } from "../src/engine.ts";
import { advice } from "../src/ai/advice.ts";
import { buildObservation } from "../src/ai/prompt.ts";
import { RENAME_DECREE } from "../src/rules.ts";
import { Store } from "../src/db.ts";
import { Runner } from "../src/runner.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function founded(seed: string): World {
  const w = createWorld(seed, bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Aldoria", capital: "Aldor", people: "Aldori", flag: flag("#c0392b") }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Bremen", capital: "Brem", people: "Bremi", flag: flag("#3355ff") }] } } });
  for (const n of w.nations) { n.stock.food = 500; n.stability = 70; }
  return w;
}
/** A renaming decree from the next turn for `turns` turns, as the runner gives it. */
function decree(w: World, turns: number) {
  w.decrees.push({ id: 1, code: "SL-001", tick: w.tick, effectiveTick: w.tick + 1, kind: "đổi tên", text: "Mọi nước đổi tên sang tiếng Việt", fromPetition: null });
  w.renameDecree = { code: "SL-001", from: w.tick + 1, until: w.tick + turns, text: "Mọi nước đổi tên sang tiếng Việt", names: Object.fromEntries(w.nations.map(n => [String(n.id), {
    nation: n.name, capital: n.capitalName, people: n.people, places: Object.fromEntries(n.settlements.map(s => [String(s.tile), s.name])), officials: Object.fromEntries((n.officials ?? []).map(o => [String(o.id), o.name])) }])) };
}
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? {} };
  const out = step(w, inputs);
  assert.deepEqual(out.audit, [], "ledger audit");
  return out;
}

test("under a renaming decree a nation renames itself, its people and its capital for free", () => {
  const w = founded("rename-free"), [a] = w.nations;
  decree(w, 5);
  turn(w); // the decree's turn begins
  const stab = a.stability;
  assert.ok(advice(w, a).some(x => x.level === 3 && /SL-001/.test(x.text) && /thủ đô Aldor/.test(x.text)), "the advice names what is still to change");
  assert.equal(buildObservation(w, a).gods_rename_order?.obeyed, false);
  turn(w, { 0: { actions: [{ type: "rename_nation", name: "Đại Việt", people: "Người Việt", capital: "Thăng Long" }] } });
  assert.deepEqual(a.lastRejected, []);
  assert.equal(a.name, "Đại Việt"); assert.equal(a.people, "Người Việt"); assert.equal(a.capitalName, "Thăng Long");
  assert.ok(a.formerNames.includes("Aldoria"));
  assert.ok(a.stability >= stab - 2, `no renaming cost (${stab} → ${a.stability})`);
  // a second time is allowed too while the decree lasts
  turn(w, { 0: { actions: [{ type: "rename_nation", flag: flag("#ffcc00") }] } });
  assert.deepEqual(a.lastRejected, []);
});

test("the rename order: capital, settlement, official; names others hold are refused", () => {
  const w = founded("rename-order"), [a, b] = w.nations;
  a.settlements.push({ tile: a.capital + 6, name: "Westhold", tick: 0 });
  turn(w, { 0: { actions: [{ type: "rename", what: "settlement", old: "Westhold", name: "Bến Tây" }, { type: "rename", what: "capital", name: "Brem" }] } });
  assert.equal(a.settlements[0].name, "Bến Tây");
  assert.ok(a.lastRejected.some(r => /đã bị dùng/.test(r.reason)), JSON.stringify(a.lastRejected));
  assert.equal(b.capitalName, "Brem");
});

test("at the end of the decree a nation that changed nothing loses reputation and stability", () => {
  const w = founded("rename-deadline"), [a, b] = w.nations;
  decree(w, 3);
  turn(w, { 0: { actions: [{ type: "rename", what: "capital", name: "Thăng Long" }] } });
  for (const n of w.nations) { n.reputation = 50; n.stability = 70; }
  for (let k = 0; k < 3; k++) turn(w);
  assert.ok(w.renameDecree!.done);
  assert.equal(unrenamed(w, a).changed, true);
  assert.equal(a.reputation, 50, "the obedient nation keeps its reputation");
  assert.ok(b.reputation <= 50 - RENAME_DECREE.reputation, `${b.reputation}`);
  assert.ok(b.lastEvents.some(e => /trái lệnh|Không đổi tên/.test(e)), JSON.stringify(b.lastEvents));
  // after the decree, renaming the nation is closed again
  turn(w, { 1: { actions: [{ type: "rename_nation", name: "Muộn Màng" }] } });
  assert.ok(b.lastRejected.some(r => r.action === "rename_nation"));
});

test("runner: a text decree that orders new names becomes a renaming decree, and bots obey it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sm-dec-"));
  const prev = { ...process.env };
  try {
    process.env.HISTORIAN_PROVIDER = "off";
    const r = new Runner(new Store(join(dir, "world.db")), { seed: "decree-test", nations: ["bot", "bot"], fillWithBots: true, tickSeconds: 600, aiTimeoutSec: 30, judgeProviders: [], judgesPerTick: 0 });
    for (let k = 0; k < 3; k++) await r.runTick();
    assert.equal(r.addRenameDecree("Mọi nước đổi tên sang tiếng Việt", 4, null), null);
    const d = r.world.renameDecree!;
    assert.equal(d.until - d.from + 1, 4);
    const founded = r.world.nations.filter(n => n.founded);
    assert.ok(founded.length > 0);
    for (let k = 0; k < 5; k++) await r.runTick();
    assert.ok(r.world.renameDecree!.done);
    for (const n of founded) assert.ok(n.capitalName.startsWith("Tân "), `${n.name}: ${n.capitalName}`);
    r.store.close?.();
  } finally { process.env = prev; rmSync(dir, { recursive: true, force: true }); }
});
