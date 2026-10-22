// §4.2b People as in the real world: each era the land houses and feeds more, and a people grows faster with each era
// and with medicine, never more than a fifth in a turn, nor more children than its food feeds. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, growthRate, housing, landRoom, step, type NationSpec } from "../src/engine.ts";
import { DEMOGRAPHY, INVENTIONS } from "../src/rules.ts";
import { within } from "../src/hex.ts";
import type { World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Văn Hà", capital: "Hà Đô", people: "người Hà", flag: { layout: "h2", colors: ["#c0392b", "#ffffff"], symbol: "sun" } }] } } });
  const n = w.nations[0];
  for (const i of within(n.capital, 4)) { const t = w.tiles[i]; if (t.land && t.owner === -1) t.owner = n.id; }
  return w;
}
const idle = { actions: [{ type: "research", invention: "P2" }] };

test("each era the land houses more, and a people grows faster (more with medicine)", () => {
  const w = founded("demo-era"), [n] = w.nations;
  const stone = housing(w, n);
  n.era = "Hiện Đại";
  assert.ok(housing(w, n) > stone * 10, `${stone} → ${housing(w, n)}`);
  for (let e = 1; e < DEMOGRAPHY.land.length; e++) assert.ok(landRoom(e) >= landRoom(e - 1));
  assert.ok(growthRate(8, 0) > growthRate(0, 0));
  assert.ok(growthRate(8, 0.4) > growthRate(8, 0));
});

test("a modern people grows by at most a fifth a turn, and only as its food allows", () => {
  const w = founded("demo-max"), [n] = w.nations;
  n.inventions = INVENTIONS.map(v => v.id); n.era = "Hiện Đại"; n.stability = 80;
  n.population = 1000; delete n.demo; n.stock.food = 50000;
  const before = n.population;
  step(w, { 0: { kind: "ok", response: idle } });
  const born = n.demo!.born ?? 0, aged = n.demo!.aged ?? 0;
  assert.ok(born - aged > 0, "it grows");
  assert.ok(born - aged <= before * DEMOGRAPHY.max + 1, `${born - aged} ≤ ${before * DEMOGRAPHY.max}`);
  // no food beyond a turn of eating: only the dead are replaced
  const w2 = founded("demo-max"), [m] = w2.nations;
  m.inventions = INVENTIONS.map(v => v.id); m.era = "Hiện Đại"; m.stability = 80;
  m.population = 1000; delete m.demo; m.stock.food = 1600; // after eating, less than another turn of food is left
  step(w2, { 0: { kind: "ok", response: { ...idle, labor: { gather: 0, hunt: 0, fish: 0, farm: 0, wood: 0, stone: 0, flint: 0, clay: 0, mine: 0, craft: 0, build: 0, research: 600, warrior: 0 } } } });
  assert.ok((m.demo!.born ?? 0) - (m.demo!.aged ?? 0) < born - aged, `less food, fewer children: ${m.demo!.born}-${m.demo!.aged} vs ${born}-${aged}, food ${m.stock.food}, pop ${m.population}`);
});

test("the provinces' housing sums to the nation's in every era (no province crowded by the era's factor)", async () => {
  const { provinces } = await import("../src/provinces.ts");
  const w = founded("demo-prov"), [n] = w.nations;
  const far = w.tiles.find(t => t.land && t.owner === -1 && Math.abs((t.i % 128) - (n.capital % 128)) > 8)!;
  far.owner = n.id; n.settlements.push({ tile: far.i, name: "Xóm Mới", tick: -50 });
  for (const era of ["Đồ Đá Cũ", "Công Nghiệp", "Hiện Đại"]) {
    n.era = era; n.population = housing(w, n);
    const ps = provinces(w, n), sum = ps.reduce((s, p) => s + p.housing, 0);
    assert.ok(Math.abs(sum - housing(w, n)) <= ps.length, `${era}: ${sum} vs ${housing(w, n)}`);
    assert.ok(!ps.some(p => p.causes.includes("crowded")), `${era}: no province crowded at the roof`);
  }
});
