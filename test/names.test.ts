// Names in Vietnamese (§2.2): every person and place. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { vietError, vietPerson, vietPlace, vietSyllable } from "../src/names.ts";
import { rngFor } from "../src/rng.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = { layout: "h2", colors: ["#aa2222", "#ffffff"], symbol: "sun" };

test("Vietnamese syllables pass, foreign words and digits do not", () => {
  for (const w of ["Nguyễn", "Thường", "Quốc", "Gió", "Đỉnh", "Nghiêng", "Hươu", "Khuya", "gì", "Văn", "Lang"]) assert.ok(vietSyllable(w), w);
  for (const w of ["Lahayu", "Mulo", "Bremen", "Oon1", "Land", "B", "Westhold"]) assert.ok(!vietSyllable(w), w);
  assert.equal(vietError("Tên", "Phong Châu"), null);
  assert.match(vietError("Tên", "Bến Oon1")!, /tên tiếng Việt/);
});

test("a nation, its capital, its people and its settlements must have Vietnamese names", () => {
  const w = createWorld("viet", bots(2));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Lahayu", capital: "Lò Đá", people: "người Lò", flag }] } },
    1: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Văn Lang", capital: "Phong Châu", people: "người Lạc", flag: { ...flag, colors: ["#2233aa", "#ffffff"] } }] } } });
  assert.equal(w.nations[0].founded, false);
  assert.match(w.nations[0].lastRejected[0].reason, /tên tiếng Việt/);
  assert.equal(w.nations[1].founded, true);
});

test("the engine's own names are Vietnamese", () => {
  const r = rngFor("names", 1);
  for (let k = 0; k < 50; k++) { assert.equal(vietError("x", vietPlace(r)), null); assert.equal(vietError("x", vietPerson(r)), null); }
});

test("the capital moves to a settlement: the old one becomes a settlement; it costs and waits", async () => {
  const { CAPITAL_MOVE } = await import("../src/rules.ts");
  const w = createWorld("move-capital", bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Văn Lang", capital: "Phong Châu", people: "người Lạc", flag }] } } });
  const n = w.nations[0];
  const far = w.tiles.find(t => t.land && t.owner === -1 && t.terrain !== "mountain" && t.terrain !== "icewall" && Math.abs(t.i - n.capital) > 600)!;
  far.owner = n.id;
  n.settlements.push({ tile: far.i, name: "Cổ Loa", tick: 0 });
  n.stock.wood = 40; n.stability = 60;
  const old = n.capital;
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "move_capital", settlement: "Cổ Loa" }] } } });
  assert.deepEqual(n.lastRejected, []);
  assert.equal(n.capital, far.i);
  assert.equal(n.capitalName, "Cổ Loa");
  assert.ok(n.settlements.some(s => s.tile === old && s.name === "Phong Châu"), "the old capital is a settlement");
  assert.ok((n.stock.wood || 0) <= 40 - CAPITAL_MOVE.materials + 1e-9);
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "move_capital", settlement: "Phong Châu" }] } } });
  assert.ok(n.lastRejected.some(r => /Vừa dời đô/.test(r.reason)), "once every few turns");
});
