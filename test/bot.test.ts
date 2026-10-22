// The rule-based bot: deterministic, grows past the natural roof, reaches the
// Neolithic, proposes grounded inventions, and wages short wars that end in peace.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createWorld, housing, ownedTiles, step, type NationSpec } from "../src/engine.ts";
import { activeWar } from "../src/diplomacy.ts";
import { NEIGHBORS, dist, within } from "../src/hex.ts";
import { botTurn } from "../src/ai/bot.ts";
import { rngFor } from "../src/rng.ts";
import { ERAS, START } from "../src/rules.ts";
import type { AIResponse, TurnInput, World } from "../src/types.ts";

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const hash = (w: World) => createHash("sha256").update(JSON.stringify(w)).digest("hex");
function tick(w: World, override: Record<number, AIResponse> = {}): string[] {
  const inputs: Record<number, TurnInput> = {};
  for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: override[n.id] ?? botTurn(w, n, rngFor(w.seed, w.tick, "bot", n.id)) };
  return step(w, inputs).audit;
}

test("bot answers are deterministic and never touch the world", () => {
  const w = createWorld("bot-det", bots(3));
  for (let t = 0; t < 40; t++) tick(w);
  const before = hash(w);
  const a = botTurn(w, w.nations[1], rngFor(w.seed, w.tick, "bot", 1));
  const b = botTurn(w, w.nations[1], rngFor(w.seed, w.tick, "bot", 1));
  assert.deepEqual(a, b);
  assert.equal(hash(w), before, "botTurn must not mutate the world");
});

test("bots grow past natural housing and reach the Neolithic", () => {
  const w = createWorld("bot-growth", bots(7));
  const audits: string[] = [];
  let rejected = 0, turns = 0;
  for (let t = 0; t < 130; t++) {
    audits.push(...tick(w));
    for (const n of w.nations) { rejected += n.lastRejected.filter(r => r.action !== "labor").length; turns++; }
  }
  assert.deepEqual(audits, []);
  assert.ok(w.nations.every(n => n.alive));
  const roomy = w.nations.filter(n => housing(w, n) > START.naturalHousing).length;
  assert.ok(roomy >= 6, `housing ${w.nations.map(n => housing(w, n))}`);
  assert.ok(w.nations.some(n => n.era !== ERAS.paleo), `eras ${w.nations.map(n => n.era)}`);
  assert.ok(w.nations.some(n => n.settlements.length > 0), "someone founds a settlement");
  assert.ok(rejected < turns * 0.1, `bots should rarely send illegal actions (${rejected} rejections in ${turns} turns)`);
});

test("a bot puts a small grounded invention before the judge", () => {
  const w = createWorld("bot-idea", bots(1));
  tick(w);
  const n = w.nations[0];
  w.tick = 60;
  n.inventions.push("P3"); n.population = 160; n.stock.food = 400;
  n.research = { id: "P2", progress: 0 };
  const r = botTurn(w, n, () => 0.01);
  const p = r.actions?.find(a => a.type === "propose_invention");
  assert.ok(p, "proposes when the dice allow");
  tick(w, { 0: r });
  const prop = w.proposals.find(x => x.nation === 0);
  assert.ok(prop && prop.status === "pending", `proposal accepted by the hard checks: ${JSON.stringify(n.lastRejected)}`);
  assert.equal(prop.power, 2);
});

test("a strong bot attacks a much weaker neighbour, takes land, and the war ends (peace or conquest)", () => {
  // A seed where B has room to hold on: on some maps its capital falls before it can sue for peace
  const w = createWorld("bot-war-3", bots(2));
  tick(w); // founding
  const [A, B] = w.nations;
  // Move B right next to A: its new capital 3 tiles from A's, with a ring of its own
  const c = within(A.capital, 3).find(i => dist(i, A.capital) === 3 && within(i, 1).every(j => w.tiles[j].land && w.tiles[j].terrain !== "mountain" && w.tiles[j].owner === -1))!;
  assert.ok(c !== undefined, "room for B next to A");
  for (const t of ownedTiles(w, B.id)) t.owner = -1;
  B.capital = c;
  for (const j of within(c, 1)) w.tiles[j].owner = B.id;
  A.population = 120; B.population = 30; A.stock.food = 300; B.stock.food = 60;
  A.met.push(B.id); B.met.push(A.id);
  w.tick = 60;
  tick(w); // sight and intel catch up
  // A first widens the front to 3 tiles (§7.4: a narrow front lets them mass on it), then declares
  const audits: string[] = [];
  let declared = false;
  for (let t = 0; t < 15 && !declared; t++) {
    const r = botTurn(w, A, () => 0.01);
    declared = !!r.actions?.some(a => a.type === "declare_war" && a.target === B.name);
    audits.push(...tick(w, { [A.id]: r }));
  }
  assert.ok(declared, "declares war once the front is wide enough");
  assert.ok(ownedTiles(w, B.id).filter(t => NEIGHBORS[t.i].some(j => w.tiles[j].owner === A.id)).length >= 3, "a front of 3 tiles");
  const war = w.wars.find(x => x.a === A.id && x.b === B.id);
  assert.ok(war, "war declared");
  const tilesB = ownedTiles(w, B.id).length;
  for (let t = 0; t < 20 && war.end === null; t++) audits.push(...tick(w));
  assert.deepEqual(audits, []);
  const fought = w.battles.filter(b => b.attacker === A.id && b.defender === B.id);
  assert.ok(fought.length > 0, "A attacks");
  assert.ok(fought.some(b => b.won) && ownedTiles(w, B.id).length < tilesB, "A takes land");
  assert.notEqual(war.end, null, "the war ends");
  assert.equal(activeWar(w, A.id, B.id), undefined);
  // a nation four times the other's size: the war ends in a peace, or its capital falls (§7.4)
  const peace = w.treaties.some(t => t.type === "peace" && [t.a, t.b].includes(A.id) && [t.a, t.b].includes(B.id));
  assert.ok(peace ? B.alive : B.fate?.cause === "conquest" && B.fate.by === A.id, "with a peace treaty, or by conquest");
});
