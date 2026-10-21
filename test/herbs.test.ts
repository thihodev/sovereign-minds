// §2.11 Meadow herbs and §6.6 herb gardens (two nations' ideas): medicine for the steppe, grown round the centres. No AI is called.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { MEADOW_HERBS } from "../src/rules.ts";
import { migrate } from "../src/catalog.ts";
import { systemPrompt } from "../src/ai/prompt.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const flag = (c: string) => ({ layout: "h2", colors: [c, "#ffffff"], symbol: "sun" });
function founded(seed: string): World {
  const w = createWorld(seed, bots(1));
  step(w, { 0: { kind: "ok", response: { actions: [{ type: "found_nation", name: "Thảo Nguyên", capital: "Đồng Xanh", people: "người Thảo", flag: flag("#2e7d32") }] } } });
  const n = w.nations[0]; n.population = 80; n.stability = 70; n.stock.food = 800; n.inventions.push("P14");
  return w;
}
function turn(w: World, acts: Record<number, AIResponse> = {}) {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: acts[n.id] ?? { actions: [{ type: "research", invention: "P2" }] } };
  const out = step(w, inputs); assert.deepEqual(out.audit, [], "ledger audit"); return out;
}

test("every grass and hill tile holds a few herbs that regrow slowly; old worlds gain them on load", () => {
  const w = createWorld("meadow", bots(1));
  const meadows = w.tiles.filter(t => MEADOW_HERBS.terrains.includes(t.terrain));
  assert.ok(meadows.length > 50);
  assert.ok(meadows.every(t => (t.cap.herbs || 0) >= MEADOW_HERBS.min && (t.cap.herbs || 0) <= MEADOW_HERBS.max + 40), "10–20 each (more by a river)");
  // an old save without them
  const old = JSON.parse(JSON.stringify(w)) as World;
  for (const t of old.tiles) if (MEADOW_HERBS.terrains.includes(t.terrain)) { delete t.res.herbs; delete t.cap.herbs; }
  old.riches = 3;
  migrate(old);
  assert.ok(old.riches >= 4);
  assert.ok(old.tiles.filter(t => MEADOW_HERBS.terrains.includes(t.terrain)).every(t => (t.cap.herbs || 0) >= MEADOW_HERBS.min));
  assert.match(systemPrompt(w), /herb_garden/);
});

test("a herb garden grows on warm land near a centre, two to a centre, and gives herbs with no hands", () => {
  const w = founded("herb-garden"), [n] = w.nations;
  n.stock.fiber = 50;
  const own = w.tiles.filter(t => t.owner === n.id && t.i !== n.capital && ["grass", "hill", "forest", "jungle", "swamp", "coast"].includes(t.terrain) && ["temp", "trop"].includes(t.zone));
  assert.ok(own.length >= 3, "warm land of its own");
  const xy = (i: number) => [i % 128, Math.floor(i / 128)];
  turn(w, { 0: { actions: own.slice(0, 3).map(t => ({ type: "build", building: "herb_garden", tile: xy(t.i) })) } });
  assert.equal(n.buildings.filter(b => b.type === "herb_garden").length, 2);
  assert.ok(n.lastRejected.some(r => /tối đa 2/.test(r.reason)), JSON.stringify(n.lastRejected));
  for (const b of n.buildings) if (b.type === "herb_garden") { b.done = true; b.progress = 6; }
  n.labor = { gather: 0, hunt: 0, fish: 0, farm: 10, wood: 0, stone: 0, flint: 0, clay: 0, mine: 0, craft: 0, build: 0, research: 0, warrior: 0 } as never;
  const before = n.stock.herbs || 0;
  turn(w, { 0: { labor: n.labor, actions: [{ type: "research", invention: "P2" }] } });
  assert.ok((n.stock.herbs || 0) - before >= 0.9, `${before} → ${n.stock.herbs}`);
});

test("rock salt: seams in some hills and deserts, regrowing slowly; old worlds gain them on load", async () => {
  const { ROCK_SALT } = await import("../src/rules.ts");
  const w = createWorld("rock-salt", bots(1));
  const inland = w.tiles.filter(t => t.terrain in ROCK_SALT.chance);
  const salty = inland.filter(t => (t.cap.salt || 0) >= ROCK_SALT.min);
  assert.ok(salty.length > 10 && salty.length < inland.length * 0.5, `${salty.length}/${inland.length}`);
  // it regrows a little each turn
  const t = salty[0]; t.res.salt = 0;
  step(w, {});
  assert.ok((t.res.salt || 0) > 0 && (t.res.salt || 0) <= (t.cap.salt || 0) * ROCK_SALT.regen + 1e-9, `${t.res.salt}`);
  // an old save without them
  const old = JSON.parse(JSON.stringify(w)) as World;
  for (const x of old.tiles) if (x.terrain in ROCK_SALT.chance) { delete x.res.salt; delete x.cap.salt; }
  old.riches = 4;
  migrate(old);
  assert.equal(old.riches, 5);
  assert.ok(old.tiles.some(x => x.terrain in ROCK_SALT.chance && (x.cap.salt || 0) >= ROCK_SALT.min));
});
