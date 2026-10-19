// A rule-based player. It stands in for a nation whose API key is missing,
// drives the engine tests and the balance harness (tools/simulate.ts). It sends
// the same JSON an AI sends. About other nations it mostly uses what an AI could
// know: intel estimates, offers made to it, public treaties and wars, land in sight.
// Deterministic: the same (world, nation, rand) always gives the same answer.
//
// Plan each turn: feed everyone with a margin, grow housing (three tents per
// centre, then a settlement) as far as the land can feed, push research down the
// Neolithic path, keep tools, pots and materials stocked, expand onto good land,
// meet the neighbours, trade surplus, sign non-aggression, and now and then widen
// a front against a clearly weaker neighbour, fight where the odds are good, and
// take tribute or make peace.

import { AP_COST, CLAIM_FOOD, FLAG_LAYOUTS, FLAG_MIN_DELTA_E, FLAG_SYMBOLS, GOOD_VALUE, HUNT_TOOLS, MAX_ROLE_BONUS, REGEN, SETTLEMENT, TERRAIN, WAR, YIELD } from "../rules.ts";
import { allInventions, buildingOf, invName, recipeOf } from "../catalog.ts";
import { NEIGHBORS, col, row, dist, inBounds, idx, within } from "../hex.ts";
import { actionPoints, canSeeRes, deltaE, housing, housingSlots, inventionCost, isHousing, mods, ownedTiles, researchOptions, settlementPayment, tileLimit, workers, type Mods } from "../engine.ts";
import { centreFallNeed, frontCap, pendingOrActiveWar, treatiesBetween } from "../diplomacy.ts";
import { pickOne, type Rand } from "../rng.ts";
import { ROLES, type AIResponse, type Nation, type ResKey, type Role, type Tile, type War, type World } from "../types.ts";

// ---------------------------------------------------------------- founding

const SYL = ["ar", "ve", "lo", "mi", "ta", "ru", "en", "so", "ka", "di", "on", "ha", "li", "mu", "re", "za"];
/** Primary colours far apart from each other (ΔE ≥ 25), so bots never clash. */
const PALETTE = ["#c0392b", "#2471a3", "#1e8449", "#7d3c98", "#d68910", "#00c2d1", "#f4d03f", "#6e2c00", "#f5a3c7", "#1b2631", "#85c1e9", "#a9dfbf"];

function founding(world: World, n: Nation, rand: Rand): Record<string, unknown> {
  const word = () => { let s = ""; for (let i = 0; i < 2 + Math.floor(rand() * 2); i++) s += pickOne(SYL, rand); return s[0].toUpperCase() + s.slice(1); };
  const name = word();
  const taken = world.nations.filter(o => o.founded && o.id !== n.id).map(o => o.flag.colors[0]);
  let color = PALETTE[n.id % PALETTE.length];
  for (let k = 0; k < PALETTE.length; k++) {
    const c = PALETTE[(n.id + k) % PALETTE.length];
    if (taken.every(t => deltaE(c, t) >= FLAG_MIN_DELTA_E)) { color = c; break; }
  }
  return {
    type: "found_nation", name, capital: word(), people: `người ${name}`,
    flag: { layout: pickOne(FLAG_LAYOUTS, rand), colors: [color, "#f2efe6"], symbol: pickOne(FLAG_SYMBOLS, rand) },
    manifesto: "Lửa của chúng ta sẽ không bao giờ tắt.",
  };
}

// ---------------------------------------------------------------- what the bot knows

/** The seed-tree order a sensible stone-age people would follow. */
const RESEARCH_ORDER = ["P2", "P1", "P3", "P7", "P8", "P4", "P6", "P10", "P14", "P15", "P9", "P11", "P5", "P12", "P13", "P18", "P17", "P16"];

/** Small, grounded ideas a bot may put before the judge (§5): +10% to one role from two owned prerequisites. */
const IDEAS: Array<{ prereqs: [string, string]; role: string; name: string; description: string }> = [
  { prereqs: ["P3", "foraging"], role: "gather", name: "Giỏ đan sợi", description: "Đan sợi cây thành giỏ đeo lưng, người hái lượm mang được nhiều quả hạt hơn mỗi chuyến." },
  { prereqs: ["P1", "stone_tools"], role: "stone", name: "Nêm đá tách phiến", description: "Đóng nêm đá cứng vào khe đá để tách phiến lớn, khai đá nhanh hơn." },
  { prereqs: ["P6", "P9"], role: "hunt", name: "Săn vây bằng lưới", description: "Căng lưới sợi ở chỗ hẹp rồi dùng giáo dồn thú vào lưới, mỗi thợ săn bắt được nhiều hơn." },
  { prereqs: ["P9", "P3"], role: "fish", name: "Lờ đan bắt cá", description: "Đan lờ bằng sợi đặt ở chỗ nước chảy, cá vào không ra được." },
  { prereqs: ["P10", "P1"], role: "wood", name: "Nêm gỗ chẻ thân cây", description: "Dùng rìu đá mài và nêm gỗ cứng để chẻ thân cây, đốn gỗ nhanh hơn." },
  { prereqs: ["P14", "P2"], role: "farm", name: "Bón tro bếp", description: "Rải tro bếp và phân mục lên ruộng trước mùa gieo, đất tốt hơn." },
  { prereqs: ["P1", "P3"], role: "craft", name: "Bàn ghè kẹp dây", description: "Buộc phôi đá vào khúc gỗ bằng dây khi ghè, thợ chế tác làm nhanh và ít hỏng hơn." },
  { prereqs: ["P4", "P5"], role: "research", name: "Hội kể chuyện bên lửa", description: "Người già kể lại cách làm của tổ tiên quanh đống lửa mỗi tối, người trẻ học nhanh hơn." },
];

const DIRS = ["E", "NE", "NW", "W", "SW", "SE"] as const;
const DIR_STEPS: Record<string, [number[], number[]]> = {
  E: [[1, 0], [1, 0]], NE: [[0, -1], [1, -1]], NW: [[-1, -1], [0, -1]], W: [[-1, 0], [-1, 0]], SW: [[-1, 1], [0, 1]], SE: [[0, 1], [1, 1]],
};
function stepDir(i: number, d: string): number {
  const c = col(i), r = row(i), [dc, dr] = DIR_STEPS[d][r & 1];
  return inBounds(c + dc, r + dr) ? idx(c + dc, r + dr) : -1;
}
const xy = (i: number) => [col(i), row(i)];

interface View {
  world: World; n: Nation; m: Mods; owned: Tile[]; mine: Set<number>; centres: number[];
  pop: number; workers: number; need: number; food: number; house: number; limit: number;
  has: (id: string) => boolean; stock: (k: string) => number;
  /** Sustainable food per turn from wild reserves on owned land, by role. */
  wild: { hunt: number; gather: number; fish: number };
  farmSlots: number; farmPerWorker: number;
  stabMult: number; drought: number;
  wars: War[]; activeWars: War[];
  /** Distance from our land to every tile within 10 steps (breadth-first over the hex grid). */
  near: Map<number, number>;
  /** Shortest distance between our land and another nation's (Infinity beyond 10). */
  gap: (id: number) => number;
}

function bonus(m: Mods, r: string): number {
  const extract = ["wood", "stone", "flint", "clay", "mine"].includes(r) ? (m.role.extract || 0) : 0;
  return Math.min(MAX_ROLE_BONUS, (m.role[r] || 0) + extract);
}
/** What a tile yields each turn without being worn down, plus a little of what is stored. */
function sustain(world: World, n: Nation, tiles: Tile[], key: ResKey): number {
  let s = 0;
  if (!canSeeRes(world, n, key)) return 0;
  for (const t of tiles) {
    const cap = t.cap[key] || 0, cur = t.res[key] || 0, regen = cap * (REGEN[key] || 0);
    s += Math.min(cur, regen + Math.max(0, cur - regen) * 0.25);
  }
  return s;
}
function tileWorth(v: View, t: Tile): number {
  const R = t.res, see = (k: ResKey) => v.m.reveal.has(k);
  let food = (t.cap.game || 0) * (REGEN.game || 0) + (t.cap.plants || 0) * (REGEN.plants || 0) + (t.cap.fish || 0) * (REGEN.fish || 0);
  if (!t.land) food *= 0.7;
  return food + Math.min(5, (R.wood || 0) / 40) + Math.min(3, (R.stone || 0) / 100) + Math.min(4, (R.flint || 0) / 10) + Math.min(3, (R.clay || 0) / 50)
    + (see("copper") && R.copper ? 6 : 0) + (t.river ? 4 : 0) + (t.terrain === "grass" || t.terrain === "coast" ? 2 : 0);
}

function look(world: World, n: Nation): View {
  const m = mods(world, n), owned = ownedTiles(world, n.id);
  const stabMult = n.stability < 30 ? 0.75 : 1, drought = (n.eventTimers.drought || 0) > 0 ? 0.5 : 1;
  let farmSlots = 0, farmFood = 0;
  const volcano = world.wonders.find(w => w.key === "volcano");
  for (const b of n.buildings) {
    const e = buildingOf(world, b.type)?.effect; if (!b.done || !e?.farmSlots) continue;
    const fertile = volcano && b.type === "field" && dist(volcano.i, b.tile) <= 1 ? 2 : 1;
    farmSlots += e.farmSlots; farmFood += e.farmSlots * (e.farmFood || 0) * fertile * (b.type === "field" ? drought : 1);
  }
  const wars = world.wars.filter(w => w.end === null && (w.a === n.id || w.b === n.id));
  const near = new Map<number, number>(owned.map(t => [t.i, 0]));
  const gaps = new Map<number, number>();
  let ring = owned.map(t => t.i);
  for (let d = 1; d <= 10 && ring.length; d++) {
    const next: number[] = [];
    for (const i of ring) for (const j of NEIGHBORS[i]) {
      if (near.has(j)) continue;
      near.set(j, d); next.push(j);
      const o = world.tiles[j].owner;
      if (o >= 0 && o !== n.id && !gaps.has(o)) gaps.set(o, d);
    }
    ring = next;
  }
  return {
    world, n, m, owned, mine: new Set(owned.map(t => t.i)), centres: [n.capital, ...n.settlements.map(s => s.tile)],
    pop: n.population, workers: workers(n), need: n.population * m.foodPerPerson, food: n.stock.food || 0, house: housing(world, n), limit: tileLimit(world, n),
    has: id => n.inventions.includes(id), stock: k => n.stock[k] || 0,
    wild: { hunt: sustain(world, n, owned, "game"), gather: sustain(world, n, owned, "plants") * drought, fish: sustain(world, n, owned, "fish") },
    farmSlots, farmPerWorker: farmSlots ? farmFood / farmSlots * stabMult : 0, stabMult, drought,
    wars, activeWars: wars.filter(w => w.start <= world.tick),
    near, gap: id => gaps.get(id) ?? Infinity,
  };
}

/** Food per turn the land could give if everyone needed worked it (wild regrowth + farms). */
function foodCapacity(v: View): number {
  const hunt = v.wild.hunt, fish = v.wild.fish, gather = v.wild.gather;
  return hunt + fish + gather + v.farmSlots * v.farmPerWorker;
}

// ---------------------------------------------------------------- the turn

export function botTurn(world: World, n: Nation, rand: Rand): AIResponse {
  const v = look(world, n);
  const actions: Array<Record<string, unknown>> = [];
  let ap = n.founded ? actionPoints(world, n) : 0;
  const spend = (type: string, a: Record<string, unknown>): boolean => {
    const cost = AP_COST[type] ?? 1;
    if (cost > ap) return false;
    ap -= cost; actions.push({ type, ...a }); return true;
  };
  const tick = world.tick;
  const reserved: Record<string, number> = {}; // materials promised to buildings this turn
  const avail = (k: string) => v.stock(k) - (reserved[k] || 0);
  const affordable = (type: string) => Object.entries(buildingOf(world, type)?.cost ?? {}).every(([k, q]) => avail(k) >= q);
  const pay = (type: string) => { for (const [k, q] of Object.entries(buildingOf(world, type)?.cost ?? {})) reserved[k] = (reserved[k] || 0) + q; };
  const count = (type: string, done = false) => n.buildings.filter(b => b.type === type && (!done || b.done)).length;
  const pending = n.buildings.filter(b => !b.done);
  const others = n.met.map(id => world.nations[id]).filter(o => o?.alive && o.founded);
  const capFood = foodCapacity(v);
  const atWar = v.wars.length > 0;

  // A new settlement is the best way to more housing and land (§2.3). It brings its
  // own ring of tiles, so make room under the limit it raises before founding it.
  const lastSettled = Math.max(-99, ...n.settlements.map(s => s.tick));
  // Tents first: a settlement only once the centres we have are full of them
  const roofsFull = !v.has("P8") || n.buildings.filter(b => isHousing(world, b.type)).length >= housingSlots(n);
  const wantSettle = n.founded && v.m.caps.has(SETTLEMENT.cap) && v.pop >= SETTLEMENT.minPopulation && v.house - v.pop <= Math.max(6, v.house * 0.12) && roofsFull && !atWar && tick - lastSettled >= 5
    && (n.settlements.length < SETTLEMENT.freeCentres || n.stability >= 50); // each centre beyond the free ones wears on stability
  const sett = wantSettle ? settlementSite(v) : null;
  const ring = sett === null ? 0 : [sett, ...NEIGHBORS[sett]].filter(j => world.tiles[j].owner === -1 && world.tiles[j].terrain !== "ocean").length;
  const payment = sett !== null ? settlementPayment(n) : null;
  const settleNow = payment !== null && ap >= (AP_COST.found_settlement ?? 3) + 1
    && capFood > (v.pop + SETTLEMENT.housing * 0.5) * v.m.foodPerPerson;
  if (settleNow) for (const [k, q] of Object.entries(payment)) reserved[k] = (reserved[k] || 0) + q;

  // A much weaker neighbour close by that nothing protects: a possible war of conquest (§7.4)
  const canWage = n.founded && !atWar && tick >= 60 && v.pop >= 30 && n.stability >= 60 && v.food >= v.need * 0.5
    && !world.wars.some(w => w.a === n.id && tick - w.declared < 80);
  const prey = canWage ? others.filter(o => weakNeighbour(v, o)).sort((a, b) => a.id - b.id)[0] : undefined;

  // 0. Too much land: give up the poorest, far from any centre (free)
  const extra = Math.max(v.owned.length - v.limit, settleNow ? v.owned.length + ring - (v.limit + 3) : 0);
  if (n.founded && extra > 0) {
    const centreSet = new Set(v.centres);
    const far = (t: Tile) => Math.min(...v.centres.map(c => dist(c, t.i)));
    // Never give up ground that faces an enemy we fight, or the one we mean to fight
    const foes = new Set([...v.wars.map(w => w.a === n.id ? w.b : w.a), ...(prey ? [prey.id] : [])]);
    const poor = v.owned.filter(t => !centreSet.has(t.i) && !n.buildings.some(b => b.tile === t.i) && !NEIGHBORS[t.i].some(j => foes.has(world.tiles[j].owner)) && (!foes.size || !atWarFront(v, t.i, foes)))
      .sort((a, b) => tileWorth(v, a) - far(a) * 2 - (tileWorth(v, b) - far(b) * 2) || a.i - b.i).slice(0, extra);
    for (const t of poor) spend("abandon_tile", { tile: xy(t.i) });
  }

  // 1. Research
  if (n.founded && !n.research) {
    const opts = researchOptions(world, n);
    // Alone on land with nothing left to explore on foot: boats right after tents
    const stranded = others.length === 0 && tick >= 30 && !exploreTarget(v, () => 0);
    const order = stranded ? [...RESEARCH_ORDER.slice(0, RESEARCH_ORDER.indexOf("P8") + 1), "P10", "P16", ...RESEARCH_ORDER] : RESEARCH_ORDER;
    const pick = order.find(id => opts.includes(id))
      ?? opts.slice().sort((a, b) => inventionCost(world, n, a) - inventionCost(world, n, b) || a.localeCompare(b))[0];
    if (pick) spend("research", { invention: pick });
  }

  // 2. War: fight, then make peace (§7.4)
  const war = n.founded ? warPlan(v) : null;
  if (war) {
    for (const off of world.treatyOffers.filter(o => o.to === n.id && o.type === "peace" && (!Object.keys(o.tribute).length || o.payer === o.from) && tick - o.tick <= 2)) {
      const w = v.wars.find(x => x.a === off.from || x.b === off.from);
      const mineWar = w && w.a === n.id && !w.reason.startsWith("bảo vệ");
      // The aggressor takes a peace that pays at once, a plain one only after a few turns of fighting
      const pays = Object.keys(off.tribute).length > 0;
      if (!w || !mineWar || tick - w.start >= (pays ? 1 : 4)) spend("accept_treaty", { offer: off.id });
    }
    for (const w of v.wars) {
      const enemy = world.nations[w.a === n.id ? w.b : w.a];
      const aggressor = w.a === n.id && !w.reason.startsWith("bảo vệ");
      const age = tick - w.start;
      const lost = world.battles.filter(b => b.tick >= w.start && b.attacker === n.id && b.defender === enemy.id && !b.won).length;
      const tilesLost = world.battles.filter(b => b.tick >= w.start && b.attacker === enemy.id && b.defender === n.id && b.won && b.note.startsWith("chiếm")).length;
      const wantPeace = aggressor ? age >= 8 || lost >= 3 : age >= 0;
      if (wantPeace && (tick + n.id) % 2 === 0 && !world.treatyOffers.some(o => o.from === n.id && o.to === enemy.id && o.type === "peace")) {
        // A defender that is losing land buys peace with tribute (§7.2)
        const tribute = !aggressor && tilesLost >= 1 ? { food: Math.min(50, Math.round(v.need * 0.2), Math.max(5, Math.round(v.need * 0.05 * tilesLost))) } : undefined;
        spend("treaty", { to: enemy.name, kind: "peace", ...(tribute ? { duration: 20, tribute, payer: "me" } : { duration: 40 }) });
      }
    }
    for (const s of war.strikes) spend("attack", { tile: xy(s.tile), warriors: s.warriors });
    if (war.bridge !== undefined && v.food >= CLAIM_FOOD) spend("claim_tile", { tile: xy(war.bridge) });
  }

  // 3. Rarely, a war of conquest against that neighbour: first build a front at least 3 tiles wide
  // (a narrow front lets them mass every warrior on it, §7.4), then declare
  let preparing = false;
  if (prey) {
    const border = ownedTiles(world, prey.id).filter(t => NEIGHBORS[t.i].some(j => v.mine.has(j))).length;
    if (border < 3) {
      const step = frontStep(v, prey.id);
      if (step !== undefined && v.food >= CLAIM_FOOD + v.need * 0.4) preparing = spend("claim_tile", { tile: xy(step) });
    } else if (rand() < 0.1) spend("declare_war", { target: prey.name });
  }

  // 4. The settlement itself
  let settling = false;
  if (settleNow && sett !== null) {
    const names = ["Bến", "Đồi", "Suối", "Bãi", "Gò", "Làng", "Trại", "Rừng"];
    settling = spend("found_settlement", { tile: xy(sett), name: `${names[n.settlements.length % names.length]} ${pickOne(SYL, rand).toUpperCase()[0]}${pickOne(SYL, rand)}${n.settlements.length + 1}` });
  }

  // 5. Buildings
  const builds: Array<{ type: string; tile?: number }> = [];
  if (n.founded) {
    const built = (t: string) => count(t) > 0;
    const pendingType = (t: string) => pending.some(b => b.type === t) || builds.some(b => b.type === t);
    const can = (t: string) => { const d = buildingOf(world, t); return !!d && (n.inventions.includes(d.needs) || v.m.unlocked.has(t)); };
    const queue = (type: string, tile?: number) => { if (builds.length < 2 && affordable(type)) { pay(type); builds.push({ type, tile }); return true; } return false; };
    // A second workshop once there are many hunters to keep in tools
    if (count("workshop") < 1 + Math.floor(n.labor.hunt / 48) && !pendingType("workshop")) queue("workshop");
    // Housing: a tent when the people are close to the roof and the land can feed ten more
    const roomy = v.house - v.pop > 3;
    const roofSlot = n.buildings.filter(b => isHousing(world, b.type)).length < housingSlots(n);
    if (can("tent") && roofSlot && !roomy && !pendingType("tent") && !settling && capFood >= (v.house + 10) * v.m.foodPerPerson * 1.1) queue("tent");
    // Farms: more slots when the wild runs short of what the people need
    if (can("field") && !pendingType("field")) {
      const wanted = (v.house + 10) * v.m.foodPerPerson * 1.25 > capFood || count("field") < 1;
      const spot = wanted ? fieldTile(v) : -1;
      if (spot >= 0) queue("field", spot);
    }
    if (can("pen") && !pendingType("pen") && count("pen") < 1 + Math.floor(count("field") / 3) && avail("rope") >= 6) {
      const spot = v.owned.find(t => t.land && t.terrain !== "mountain" && !n.buildings.some(b => b.tile === t.i && buildingOf(world, b.type)?.perTile));
      if (spot) queue("pen", spot.i);
    }
    const pitMax = buildingOf(world, "pit")?.max ?? 2;
    if (can("pit") && count("pit") < pitMax && !pendingType("pit") && avail("stone") >= 9) queue("pit");
    if (can("altar") && !built("altar") && avail("stone") >= 14) queue("altar");
    if (can("kiln") && !built("kiln") && avail("clay") >= 10) {
      const spot = v.owned.find(t => t.land && t.terrain !== "mountain" && !n.buildings.some(b => b.tile === t.i && buildingOf(world, b.type)?.perTile));
      if (spot) queue("kiln", spot.i);
    }
    if (can("palisade") && !built("palisade") && (atWar || hostileBorder(v)) && avail("wood") >= 20) queue("palisade");
    for (const b of builds) spend("build", { building: b.type, ...(b.tile !== undefined ? { tile: xy(b.tile) } : {}) });
  }

  // 6. Land: claim the best free tile next to ours while under the limit
  if (n.founded && !settling && !preparing && war?.bridge === undefined && sett === null && extra <= 0 && v.food >= CLAIM_FOOD + v.need * 0.4) {
    const best = claimTile(v);
    if (best.tile >= 0 && v.owned.length < v.limit) spend("claim_tile", { tile: xy(best.tile) });
    else if (best.tile >= 0 && best.fills && ap >= (AP_COST.claim_tile ?? 2)) {
      // At the limit but missing stone, wood, flint or farmland: swap our poorest tile for it
      const centreSet = new Set(v.centres);
      const poor = v.owned.filter(t => !centreSet.has(t.i) && !n.buildings.some(b => b.tile === t.i) && !NEIGHBORS[best.tile].includes(t.i))
        .sort((a, b) => tileWorth(v, a) - tileWorth(v, b) || a.i - b.i)[0];
      if (poor) { spend("abandon_tile", { tile: xy(poor.i) }); spend("claim_tile", { tile: xy(best.tile) }); }
    }
  }

  // 7. Answer offers: fair trades, non-aggression
  if (n.founded) {
    for (const off of world.tradeOffers.filter(o => o.to === n.id && o.status === "open" && tick - o.tick <= 2)) {
      if (fairTrade(v, off.give, off.get)) { spend("accept_trade", { offer: off.id }); break; }
    }
    for (const off of world.treatyOffers.filter(o => o.to === n.id && (o.type === "non_aggression" || o.type === "passage") && !Object.keys(o.tribute).length && !o.cede.length && tick - o.tick <= 2)) {
      const from = world.nations[off.from];
      if (keepOptionsOpen(v, from, rand)) continue;
      if (spend("accept_treaty", { offer: off.id })) break;
    }
  }

  // 8. Explore from the border towards the least known side
  let explorers = 0;
  if (n.founded && tick > 0 && (others.length < 2 ? tick % 4 === n.id % 4 : tick % 15 === n.id % 15) && v.pop >= 15) {
    const ex = exploreTarget(v, rand);
    if (ex && spend("explore", { direction: ex.dir, people: 2, from: xy(ex.from) })) explorers = 2;
  }

  // 9. Reach out: non-aggression with neighbours, trade surplus for shortages, a greeting
  if (n.founded && others.length) {
    const near = others.filter(o => !pendingOrActiveWar(world, n.id, o.id) && v.gap(o.id) <= 8);
    const unsigned = near.filter(o => !treatiesBetween(world, n.id, o.id, ["non_aggression", "alliance", "peace"]).length
      && !world.treatyOffers.some(x => (x.from === n.id && x.to === o.id) || (x.from === o.id && x.to === n.id)) && !weakNeighbour(v, o));
    if (unsigned.length && tick % 3 === n.id % 3) spend("treaty", { to: pickOne(unsigned, rand).name, kind: "non_aggression", duration: 60 });
    // Goods travel by caravan, so any partner at peace will do: first those whose land we have seen holds
    // what we lack, then neighbours
    const deal = tradeIdea(v);
    const source = deal ? SOURCE[Object.keys(deal.get)[0]] : undefined;
    const rich = new Set<number>();
    if (source !== undefined && tick % 3 === n.id % 3) for (const i of n.seen) { const t = world.tiles[i]; if (t.owner >= 0 && (t.res[source] || 0) > 30) rich.add(t.owner); }
    const holds = (o: Nation) => rich.has(o.id) ? 0 : 1;
    const partners = others.filter(o => !pendingOrActiveWar(world, n.id, o.id)).sort((a, b) => holds(a) - holds(b) || v.gap(a.id) - v.gap(b.id) || a.id - b.id);
    if (deal && partners.length && tick % 3 === n.id % 3) spend("trade_offer", { to: partners[Math.floor(rand() * Math.min(3, partners.length))].name, give: deal.give, get: deal.get });
    if (tick % 10 === n.id % 10 && ap >= 1) {
      const o = pickOne(others, rand);
      spend("message", { to: o.name, gesture: pickOne(["chào hỏi", "muốn trao đổi", "muốn hòa bình", "cùng đi săn"], rand) });
    }
  }

  // 10. Once in a while, put a small grounded idea before the judge
  if (n.founded && tick >= 40 && ap >= (AP_COST.propose_invention ?? 2) && !world.proposals.some(p => p.nation === n.id && p.status === "pending") && rand() < 0.04) {
    const used = new Set([...allInventions(world).map(x => x.name), ...world.proposals.filter(p => p.nation === n.id).map(p => p.name)]);
    const ideas = IDEAS.filter(x => x.prereqs.every(p => v.has(p)) && !used.has(x.name));
    if (ideas.length) {
      const idea = pickOne(ideas, rand);
      spend("propose_invention", { name: idea.name, description: idea.description, prereqs: idea.prereqs, effects: [{ kind: "role_bonus", role: idea.role, percent: 10 }] });
    }
  }

  // Labour and crafts
  const pendingWork = pending.reduce((s, b) => s + Math.max(0, (buildingOf(world, b.type)?.work ?? 0) - b.progress), 0)
    + builds.reduce((s, b) => s + (buildingOf(world, b.type)?.work ?? 0), 0);
  const researching = !!n.research || actions.some(a => a.type === "research");
  const { labor, crafts, mineTarget } = planLabor(v, { explorers, pendingWork, war, reserved, save: sett !== null && !settling ? { wood: SETTLEMENT.materials * 0.6, stone: SETTLEMENT.materials * 0.4 } : {}, researching });
  // Strikes can only use the warriors the labour plan could spare
  let free = labor.warrior;
  for (const a of actions) if (a.type === "attack") { a.warriors = Math.min(Number(a.warriors), free); free -= Number(a.warriors); }
  const sent = actions.filter(a => a.type !== "attack" || Number(a.warriors) >= 1);
  actions.length = 0; actions.push(...sent);

  const projectName = n.research ? invName(world, n.research.id) : actions.find(a => a.type === "research") ? invName(world, String(actions.find(a => a.type === "research")!.invention)) : "chưa chọn";
  const thought = !n.founded ? "Lập quốc." : war?.strikes.length ? `Chiến tranh: tấn công ${war.strikes.length} ô.` : `Giữ đủ ăn, mở chỗ ở, nghiên cứu ${projectName}.`;
  const out: AIResponse & { mine_target?: string } = { thought, labor, crafts, actions: n.founded ? actions : [founding(world, n, rand)], memory: n.memory };
  if (mineTarget) out.mine_target = mineTarget;
  return out;
}

// ---------------------------------------------------------------- land

/** The free tile next to ours closest to another nation's land: one step toward (or along) a front. */
function frontStep(v: View, enemy: number): number | undefined {
  const enemyLand = ownedTiles(v.world, enemy).map(t => t.i);
  if (!enemyLand.length) return undefined;
  let best = Infinity, pick: number | undefined;
  for (const t of v.owned) for (const j of NEIGHBORS[t.i]) {
    const u = v.world.tiles[j];
    if (u.owner !== -1 || !u.land || u.terrain === "mountain") continue;
    const d = Math.min(...enemyLand.map(k => dist(j, k)));
    if (d < best || (d === best && pick !== undefined && j < pick)) { best = d; pick = j; }
  }
  return pick;
}
/** A tile of ours within 3 steps of a foe's land: the way to the front. */
function atWarFront(v: View, i: number, foes: Set<number>): boolean {
  return within(i, 3).some(j => foes.has(v.world.tiles[j].owner));
}
function freeTile(v: View, t: Tile): boolean {
  return t.land && t.terrain !== "mountain" && !v.n.buildings.some(b => b.tile === t.i && buildingOf(v.world, b.type)?.perTile);
}
function fieldTile(v: View): number {
  const def = buildingOf(v.world, "field");
  const ok = (t: Tile) => freeTile(v, t) && (!def?.terrains || def.terrains.includes(t.terrain) || (def.river && t.river));
  const spots = v.owned.filter(ok).sort((a, b) => (b.river ? 1 : 0) - (a.river ? 1 : 0) || (a.res.plants || 0) - (b.res.plants || 0) || a.i - b.i);
  return spots.length ? spots[0].i : -1;
}

/** The best free tile next to ours, and whether it brings something our land lacks. */
function claimTile(v: View): { tile: number; fills: boolean } {
  const { world, n } = v;
  const lacks = (key: ResKey) => !v.owned.some(t => (t.res[key] || 0) > 5);
  const wantStone = lacks("stone"), wantWood = lacks("wood"), wantFlint = v.has("P1") && lacks("flint"), wantClay = lacks("clay") && !v.has("P13");
  const wantField = !v.owned.some(t => t.terrain === "grass" || t.terrain === "coast" || t.river);
  let best = -1, bestScore = -Infinity, bestFills = false;
  const seen = new Set<number>();
  for (const t of v.owned) for (const j of NEIGHBORS[t.i]) {
    if (seen.has(j)) continue; seen.add(j);
    const u = world.tiles[j];
    if (u.owner !== -1 || u.terrain === "ocean") continue;
    let s = tileWorth(v, u), fills = false;
    if (wantStone && (u.res.stone || 0) > 20) { s += 12; fills = true; }
    if (wantWood && (u.res.wood || 0) > 20) { s += 8; fills = true; }
    if (wantFlint && (u.res.flint || 0) > 5) { s += 10; fills = true; }
    if (wantClay && (u.res.clay || 0) > 20) s += 8;
    if (wantField && (u.terrain === "grass" || u.terrain === "coast" || u.river)) { s += 10; fills = true; }
    // Stay compact: tiles touching more of our land are easier to hold
    s += NEIGHBORS[j].filter(k => v.mine.has(k)).length;
    if (s > bestScore || (s === bestScore && j < best)) { best = j; bestScore = s; bestFills = fills; }
  }
  return bestScore > 3 ? { tile: best, fills: bestFills } : { tile: -1, fills: false };
}

function settlementSite(v: View): number | null {
  const { world, n } = v;
  const reach = Math.min(SETTLEMENT.maxDist, 7);
  const seen = new Set(n.seen);
  let best: number | null = null, bestScore = -Infinity;
  for (const [i, d] of v.near) {
    const t = world.tiles[i];
    if (d === 0 || d > reach || !seen.has(i) || t.owner !== -1 || !t.land || t.terrain === "mountain") continue;
    if (v.centres.some(c => dist(c, i) < SETTLEMENT.minDist)) continue;
    // Keep clear of other peoples' land
    if (within(i, 2).some(j => world.tiles[j].owner >= 0 && world.tiles[j].owner !== n.id)) continue;
    let s = tileWorth(v, t);
    for (const j of NEIGHBORS[i]) { const u = world.tiles[j]; if (u.owner === -1 && u.terrain !== "ocean") s += tileWorth(v, u); }
    s -= d * 3;
    if (s > bestScore || (s === bestScore && best !== null && i < best)) { best = i; bestScore = s; }
  }
  return best;
}

function exploreTarget(v: View, rand: Rand): { dir: string; from: number } | null {
  const seen = new Set(v.n.seen), canSail = v.m.move.has("shallow");
  const passable = (i: number) => {
    if (i < 0) return false;
    const t = v.world.tiles[i];
    if (!t.land && !(canSail && t.terrain === "shallow")) return false;
    return t.terrain !== "mountain" || v.m.move.has("mountain");
  };
  const options: Array<{ dir: string; from: number; unknown: number }> = [];
  for (let k = 0; k < 6; k++) {
    const d = DIRS[k];
    // Walk to the edge of our land, then follow the path an expedition would take
    // (straight on, skirting water and mountains) and count what is still unknown
    let from = v.n.capital;
    for (let s = 0; s < 12; s++) { const nx = stepDir(from, d); if (nx < 0 || !v.mine.has(nx)) break; from = nx; }
    const fresh = new Set<number>();
    let cur = from;
    for (let s = 0; s < 16; s++) {
      const nx = [0, 1, -1].map(o => stepDir(cur, DIRS[(k + o + 6) % 6])).find(passable);
      if (nx === undefined) break;
      cur = nx;
      for (const j of within(cur, canSail ? 3 : 2)) if (!seen.has(j)) fresh.add(j);
    }
    if (fresh.size > 4) options.push({ dir: d, from, unknown: fresh.size });
  }
  if (!options.length) return null;
  // Mostly the richest direction, sometimes another, so no side stays dark forever
  options.sort((a, b) => b.unknown - a.unknown || DIRS.indexOf(a.dir as typeof DIRS[number]) - DIRS.indexOf(b.dir as typeof DIRS[number]));
  const pick = rand() < 0.7 ? options[0] : options[Math.floor(rand() * options.length)];
  return { dir: pick.dir, from: pick.from };
}

// ---------------------------------------------------------------- neighbours

function estPop(v: View, o: Nation): number | null {
  const intel = v.n.intel[String(o.id)];
  if (!intel || intel.level < 2) return null;
  const p = intel.report.population_est;
  return typeof p === "number" ? p : null;
}
/** Borders us (or nearly), is clearly smaller, and nothing binds us to leave it alone. */
function weakNeighbour(v: View, o: Nation): boolean {
  if (!o.alive || treatiesBetween(v.world, v.n.id, o.id).length) return false;
  const p = estPop(v, o);
  if (p === null || p > v.pop * 0.7) return false;
  return v.gap(o.id) <= 4;
}
/** A strong people does not always tie its own hands with a weak neighbour. */
function keepOptionsOpen(v: View, o: Nation, rand: Rand): boolean {
  return weakNeighbour(v, o) && rand() < 0.85;
}
function hostileBorder(v: View): boolean {
  return v.n.met.some(id => { const o = v.world.nations[id]; return o.alive && !treatiesBetween(v.world, v.n.id, id).length && v.gap(id) <= 2 && (estPop(v, o) ?? 0) > v.pop; });
}

interface WarPlan { warriors: number; strikes: Array<{ tile: number; warriors: number }>; bridge?: number }
function warPlan(v: View): WarPlan | null {
  const { world, n } = v;
  if (!v.wars.length) return null;
  const aggressor = v.wars.some(w => w.a === n.id && !w.reason.startsWith("bảo vệ"));
  const warriors = Math.max(2, Math.round(v.workers * (aggressor ? 0.3 : 0.25)));
  const strikes: WarPlan["strikes"] = [];
  let bridge: number | undefined;
  if (!aggressor) return { warriors, strikes };
  for (const w of v.activeWars) {
    if (w.a !== n.id) continue;
    const enemy = world.nations[w.b];
    const report = v.n.intel[String(enemy.id)]?.report;
    const theirPop = typeof report?.population_est === "number" ? report.population_est : estPop(v, enemy) ?? v.pop * 0.5;
    const theirWarriors = typeof report?.warriors_est === "number" ? report.warriors_est : theirPop * 0.7 * 0.25;
    // What stands on each tile of their front (every tile of theirs touching ours, or at least each attack):
    // warriors and half-strength militia spread evenly (§7.4)
    const border = ownedTiles(world, enemy.id).filter(t => NEIGHBORS[t.i].some(j => v.mine.has(j))).length;
    const guard = (k: number) => (theirWarriors + 0.5 * theirPop * 0.7 * WAR.militiaShare) / Math.max(k, border);
    const centres = new Set([enemy.capital, ...enemy.settlements.map(s => s.tile)]);
    const held = (c: number) => NEIGHBORS[c].filter(j => world.tiles[j].land && world.tiles[j].owner === n.id).length;
    // Only tiles that touch our land: what we take stays joined, and the front is wider (§7.4)
    const targets = ownedTiles(world, enemy.id).filter(t => {
      if (t.terrain === "mountain" && !v.m.move.has("mountain")) return false;
      if (!NEIGHBORS[t.i].some(j => v.mine.has(j))) return false;
      return !centres.has(t.i) || held(t.i) >= centreFallNeed(world, t.i);
    });
    const defence = (t: Tile) => TERRAIN[t.terrain].defense + (t.river ? 0.25 : 0) + (enemy.buildings.some(b => b.done && dist(b.tile, t.i) <= 1 && (buildingOf(world, b.type)?.effect.defense || 0) > 0) ? 0.4 : 0);
    // A centre we can take first, then the ring around their capital, then the weakest ground
    const score = (t: Tile) => (centres.has(t.i) ? 100 : 0) + (NEIGHBORS[t.i].includes(enemy.capital) ? 3 : 0) - defence(t) * 4 + frontCap(world, n.id, t.i) / 5;
    targets.sort((a, b) => score(b) - score(a) || a.i - b.i);
    // Spread the army over the most fronts that each look winnable: more fronts thin their guard,
    // but each front holds only so many of ours
    for (let f = Math.min(3, targets.length); f >= 1 && !strikes.length; f--) {
      const plan = targets.slice(0, f).map(t => ({ tile: t.i, warriors: Math.min(Math.floor(warriors / f), frontCap(world, n.id, t.i)) }));
      const winnable = plan.every((p, k) => p.warriors >= 3 && p.warriors > 1.15 * guard(f) * (1 + WAR.home + defence(targets[k])));
      if (winnable) strikes.push(...plan);
    }
    // Front too narrow (or none yet): claim a free tile next to ours toward their land to widen it
    if (!strikes.length) bridge = frontStep(v, enemy.id);
    break; // one enemy at a time
  }
  return { warriors, strikes, bridge };
}

// ---------------------------------------------------------------- trade

function valueOf(world: World, g: Record<string, number>): number {
  return Object.entries(g).reduce((s, [k, q]) => s + q * (GOOD_VALUE[k] ?? world.custom.goods[k]?.value ?? 1), 0);
}
/** How much of each good we want to keep for our own plans. */
function keep(v: View): Record<string, number> {
  return {
    food: v.need * 1.2, stone: 15, wood: 20, flint: v.has("P1") ? 8 : 0, hide: v.has("P8") ? 12 : 4, bone: 4, fiber: v.has("P3") ? 9 : 0,
    rope: v.has("P8") ? 6 : 0, clay: v.has("P13") ? 15 : 0, stone_tool: 4, blade: 2,
  };
}
/** Where a good comes from on our own land, if anywhere. */
const SOURCE: Record<string, ResKey> = { hide: "game", bone: "game", fiber: "plants", wood: "wood", stone: "stone", flint: "flint", clay: "clay" };
/** Ask for what we need most and cannot make, paying with what we have most of. */
function tradeIdea(v: View): { give: Record<string, number>; get: Record<string, number> } | null {
  const k = keep(v);
  const canMake = (g: string) => SOURCE[g] !== undefined && v.owned.some(t => (t.cap[SOURCE[g]] || 0) > 10);
  const wants = [...(v.has("P8") ? ["hide", "wood"] : []), "stone", "flint", "wood", "hide", "clay", "fiber"];
  const short = wants.find(g => (k[g] || 0) > 0 && v.stock(g) < (k[g] || 0) * (canMake(g) ? 0.3 : 1));
  if (!short) return null;
  const val = (g: string) => GOOD_VALUE[g] ?? 1;
  const surplus = ["food", "stone", "wood", "bone", "hide", "flint", "clay", "salt", "fiber", "stone_tool", "hide_coat"]
    .filter(g => g !== short && v.stock(g) > (k[g] || 0) * 1.5 + 5).sort((a, b) => (v.stock(b) - (k[b] || 0)) * val(b) - (v.stock(a) - (k[a] || 0)) * val(a) || a.localeCompare(b))[0];
  if (!surplus) return null;
  // Small asks: a partner only parts with what it holds beyond its own reserve
  const getQ = Math.max(2, Math.min(8, Math.round((k[short] || 6) - v.stock(short))));
  const giveQ = Math.min(Math.floor(v.stock(surplus) - (k[surplus] || 0)), Math.ceil(getQ * val(short) * 1.2 / val(surplus)));
  if (giveQ < 1) return null;
  return { give: { [surplus]: giveQ }, get: { [short]: getQ } };
}
/** We give `get` (their ask) and receive `give` (their offer). */
function fairTrade(v: View, give: Record<string, number>, get: Record<string, number>): boolean {
  const k = keep(v);
  if (!Object.entries(get).every(([g, q]) => v.stock(g) - q >= (k[g] || 0))) return false;
  const useful = Object.keys(give).some(g => v.stock(g) < (k[g] || 0) * 1.5);
  return valueOf(v.world, give) >= valueOf(v.world, get) * (useful ? 0.8 : 1.05);
}

// ---------------------------------------------------------------- labour

interface LaborCtx { explorers: number; pendingWork: number; war: WarPlan | null; reserved: Record<string, number>; save: Record<string, number>; researching: boolean }

function planLabor(v: View, c: LaborCtx): { labor: Record<Role, number>; crafts: Record<string, number>; mineTarget: string } {
  const { world, n, m } = v;
  const L = Object.fromEntries(ROLES.map(r => [r, 0])) as Record<Role, number>;
  let left = v.workers;
  const give = (r: Role, k: number) => { k = Math.max(0, Math.min(left, Math.floor(k))); L[r] += k; left -= k; return k; };
  const mult = (r: string) => (1 + bonus(m, r)) * v.stabMult;
  const stock = (k: string) => v.stock(k) - (c.reserved[k] || 0);

  // Food: aim for 20% over need, more when the store is thin
  let target = v.need * 1.2 + 0.5 * (v.need * 0.7 - v.food);
  target = Math.max(v.need * 0.85, Math.min(v.need * 1.9, target));
  const tools = HUNT_TOOLS.reduce((s, k) => s + v.stock(k), 0);
  // Gatherers make the fibre that becomes rope; explorers are taken from them
  const fibreWanted = v.has("P3") && stock("fiber") < 9 && stock("rope") < 10;
  const minGather = Math.min(left, c.explorers + (fibreWanted ? 3 : 0));
  give("gather", minGather);
  const gatherYield = YIELD.gather * mult("gather") * v.drought;
  let gameLeft = v.wild.hunt, plantsLeft = Math.max(0, v.wild.gather - (minGather - c.explorers) * gatherYield);
  let fishLeft = v.wild.fish;
  target -= (minGather - c.explorers) * gatherYield;
  const sources: Array<{ role: Role; per: number; max: () => number; take: (f: number) => void }> = [
    { role: "hunt", per: YIELD.hunt * mult("hunt"), max: () => Math.max(0, Math.floor(tools) * 4 - L.hunt), take: f => { gameLeft -= f; } },
    { role: "fish", per: YIELD.fish * mult("fish"), max: () => Infinity, take: f => { fishLeft -= f; } },
    { role: "farm", per: v.farmPerWorker, max: () => v.farmSlots - L.farm, take: () => {} },
    { role: "gather", per: gatherYield, max: () => Infinity, take: f => { plantsLeft -= f; } },
    { role: "hunt", per: YIELD.hunt * 0.5 * mult("hunt"), max: () => Infinity, take: f => { gameLeft -= f; } },
  ];
  const room = (s: typeof sources[number]) => s.role === "hunt" ? gameLeft : s.role === "fish" ? fishLeft : s.role === "gather" ? plantsLeft : Infinity;
  const order = sources.map((s, k) => ({ s, k })).sort((a, b) => b.s.per - a.s.per || a.k - b.k).map(x => x.s);
  for (const s of order) {
    if (target <= 0 || left <= 0 || s.per <= 0) continue;
    const byRoom = Math.floor(room(s) / s.per + 0.5);
    const k = Math.min(Math.ceil(target / s.per), s.max(), byRoom);
    if (k <= 0) continue;
    give(s.role, k); s.take(k * s.per); target -= k * s.per;
  }
  // Short of food and the land is worn: everyone still free forages rather than starve
  if (target > v.need * 0.15) give("gather", Math.min(left, Math.ceil(target / Math.max(0.5, gatherYield))));
  const famine = target > 0;

  // Warriors (only when at war)
  if (c.war) give("warrior", Math.min(c.war.warriors, Math.floor(left * 0.8)));

  // Builders
  if (c.pendingWork > 0) give("build", Math.min(4, Math.max(1, Math.ceil(c.pendingWork / 3))));

  // Crafts: tools first, then rope for tents and pens, coats against winter, weapons in war
  const crafts: Record<string, number> = {};
  const can = (id: string) => { const r = recipeOf(world, id); return !!r && (n.inventions.includes(r.needs) || m.unlocked.has(id)) && n.buildings.some(b => b.done && b.type === r.building); };
  // One tool serves four hunters and doubles their catch: worth far more than the stone it costs
  const toolsWanted = Math.ceil(L.hunt / 4) + 2, toolGap = Math.max(0, toolsWanted - Math.floor(tools));
  if (can("stone_tool") && toolGap > 0 && stock("stone") >= 2) crafts.stone_tool = Math.min(8, toolGap, Math.floor(stock("stone") / 2));
  if (can("rope") && stock("rope") < (v.has("P15") ? 10 : 6) && stock("fiber") >= 3) crafts.rope = Math.min(3, Math.floor(stock("fiber") / 3));
  if (can("spear") && c.war && v.stock("spear") < L.warrior) crafts.spear = 2;
  if (can("blade") && stock("flint") >= 2 && (v.stock("blade") < 2 || (c.war && v.stock("blade") < 4))) crafts.blade = 1;
  if (can("hide_coat") && world.tiles[n.capital].zone !== "trop" && v.stock("hide_coat") < v.pop / 2 && stock("hide") >= 3 + (v.has("P8") ? 4 : 0) && stock("bone") >= 1) crafts.hide_coat = 1;
  if (can("axe") && v.stock("axe") < 2 && stock("rope") >= 3 && stock("stone") >= 6) crafts.axe = 1;
  // Sealed pots keep food longer, up to ten of them (§4.1)
  if (can("pottery") && v.stock("pottery") < 10 && stock("clay") >= 3 && stock("wood") >= 1) crafts.pottery = 1;
  const craftWork = Object.entries(crafts).reduce((s, [id, q]) => s + (recipeOf(world, id)?.work ?? 1) * q, 0);
  const slots = n.buildings.filter(b => b.done).reduce((s, b) => s + (buildingOf(world, b.type)?.effect.craftSlots || 0), 0);
  if (craftWork > 0 && slots > 0) give("craft", Math.min(slots, craftWork));

  // Raw materials, when the land has them and stocks are low
  const k = keep(v);
  const owns = (key: ResKey) => v.owned.some(t => (t.res[key] || 0) >= 1);
  const tentSoon = v.has("P8") || v.has("P7");
  // Stone for tools: replace wear (a tool lasts ~10 turns) and close the gap within a few turns
  // Saving for a settlement: wood and stone on top of the usual reserve
  const saveStone = c.save.stone || 0, saveWood = c.save.wood || 0;
  const stoneNeed = 2 * (toolsWanted / 10 + toolGap / 4) + (stock("stone") < k.stone ? 1 : 0) + (stock("stone") < k.stone + saveStone ? saveStone / 8 : 0);
  if (owns("stone") && (stock("stone") < k.stone + 6 + saveStone || toolGap > 0)) give("stone", Math.min(10, Math.max(1, Math.ceil(stoneNeed / (YIELD.extract * mult("stone"))))));
  if (owns("wood") && stock("wood") < k.wood + (tentSoon ? 8 : 0) + saveWood) give("wood", stock("wood") < 8 ? 2 : saveWood ? 3 : 1);
  if (v.has("P1") && owns("flint") && stock("flint") < k.flint + (c.war ? 6 : 0)) give("flint", 1);
  if ((v.has("P13") || v.has("P2")) && owns("clay") && stock("clay") < (v.has("P13") ? 25 : 0)) give("clay", 1);
  // Miners dig ore when they can see it, else salt (worth trading)
  let mineTarget = "";
  const ores = (["copper", "tin", "iron"] as ResKey[]).filter(o => m.reveal.has(o) && owns(o));
  if (ores.length) { mineTarget = ores.sort((a, b) => v.stock(a) - v.stock(b) || a.localeCompare(b))[0]; give("mine", Math.min(2, Math.max(1, Math.floor(v.workers / 15)))); }
  else if (owns("salt") && v.stock("salt") < 10 && v.workers >= 25) give("mine", 1);

  // Everyone else thinks, if there is anything left to think about; otherwise they forage
  if (!c.researching) { L.gather += left; left = 0; }
  else if (!famine) give("research", left);
  else { give("research", Math.min(left, 1)); L.gather += left; left = 0; }
  if (c.researching && L.research === 0 && !famine) {
    const from = (["gather", "hunt", "fish"] as Role[]).find(r => L[r] > (r === "gather" ? c.explorers + 1 : 1));
    if (from) { L[from]--; L.research++; }
  }
  return { labor: L, crafts, mineTarget };
}

