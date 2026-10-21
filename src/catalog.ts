// One place to look up inventions, recipes, buildings and goods, whether they
// come from the seed tree or were invented by the nations themselves (§5).
// Also: the open-invention rules — effect catalogue, power budget, depth, cost.

import {
  BUILDINGS, BUILDING_BY_TYPE, DEEP_RES, EFFECT_ERA, ERA_INDEX, ERA_TABLE, GOOD_VALUE, INVENTIONS, INVENTION_BY_ID, RECIPES, RECIPE_BY_ID, RES_NAME, TERRAIN,
  type BuildingDef, type Invention, type Recipe,
} from "./rules.ts";
import { ROLES, type Nation, type Proposal, type Ruling, type World } from "./types.ts";
import { seedAnimals, seedDeepResources, seedRiches, seedRiverPlenty, seedVeins } from "./worldgen.ts";

// ---------------------------------------------------------------- lookups

export function inv(world: World, id: string): Invention | undefined { return INVENTION_BY_ID[id] ?? world.custom.inventions[id]; }
export function allInventions(world: World): Invention[] { return [...INVENTIONS, ...Object.values(world.custom.inventions)]; }
export function recipeOf(world: World, id: string): Recipe | undefined { return RECIPE_BY_ID[id] ?? world.custom.recipes[id]; }
export function allRecipes(world: World): Recipe[] { return [...RECIPES, ...Object.values(world.custom.recipes)]; }
export function buildingOf(world: World, type: string): BuildingDef | undefined { return BUILDING_BY_TYPE[type] ?? world.custom.buildings[type]; }
export function allBuildings(world: World): BuildingDef[] { return [...BUILDINGS, ...Object.values(world.custom.buildings)]; }
export function invName(world: World, id: string): string { return inv(world, id)?.name ?? id; }
export function goodValue(world: World, key: string): number { return GOOD_VALUE[key] ?? world.custom.goods[key]?.value ?? 1; }
export function goodName(world: World, key: string): string { return RES_NAME[key] ?? world.custom.goods[key]?.name ?? key; }
export function knownGood(world: World, key: string): boolean { return key in GOOD_VALUE || key in world.custom.goods; }

/** Old saves gain the fields added after v0.1. */
export function migrate(world: World): World {
  world.custom ??= { inventions: {}, recipes: {}, buildings: {}, goods: {}, next: 1 };
  world.proposals ??= [];
  world.petitions ??= [];
  world.decrees ??= [];
  world.spies ??= [];
  world.nextSpyId ??= 1;
  world.treaties ??= []; world.treatyOffers ??= []; world.tradeOffers ??= []; world.caravans ??= [];
  world.wars ??= []; world.battles ??= []; world.nextId ??= 1; world.cutoff ??= {}; world.eraGates ??= {};
  if (!world.tiles.some(t => DEEP_RES.some(k => (t.cap[k] || 0) > 0) || (t.cap.horse || 0) > 0)) seedDeepResources(world.seed, world.tiles); // v0.5 resources
  if (!world.tiles.some(t => t.vein)) seedVeins(world.seed, world.tiles); // v0.17 rich veins
  if (!world.riches) { // v0.18 the riches of land and sea, and their veins
    seedRiches(world.seed, world.tiles);
    seedVeins(world.seed, world.tiles, ["gold", "silver", "gems", "marble", "amber", "spice", "fur", "fish", "pearl", "whale"]);
    world.riches = 1;
  }
  if ((world.riches ?? 0) < 2) { seedAnimals(world.seed, world.tiles); world.riches = 2; } // v0.23 wild herds
  if ((world.riches ?? 0) < 3) { seedRiverPlenty(world.seed, world.tiles); world.riches = 3; } // v0.25 the river's plenty
  for (const n of world.nations) {
    n.officials ??= [];
    n.settlements ??= []; n.trades ??= {}; n.mineTarget ??= ""; n.peakPopulation ??= n.population; n.inbox ??= [];
    n.labor.mine ??= 0;
    n.eraTick ??= null; n.renameTick ??= null; n.formerNames ??= []; n.stolenTech ??= [];
    if (typeof n.reputation !== "number" || !Number.isFinite(n.reputation)) n.reputation = 30; // v0.31 a lost war constant left NaN (saved as null) after unprovoked wars
  }
  for (const s of world.spies) s.acted ??= "";
  return world;
}

const depthMemo = new WeakMap<World, Map<string, number>>();
export function depthOf(world: World, id: string): number {
  let memo = depthMemo.get(world); if (!memo) { memo = new Map(); depthMemo.set(world, memo); }
  if (memo.has(id)) return memo.get(id)!;
  const v = inv(world, id); if (!v) return 0;
  if (v.custom) { memo.set(id, v.custom.depth); return v.custom.depth; }
  if (v.frameDepth !== undefined) { memo.set(id, v.frameDepth); return v.frameDepth; }
  const d = v.prereqs.length ? 1 + Math.max(...v.prereqs.map(p => depthOf(world, p))) : 0;
  memo.set(id, d); return d;
}

/** §5.3: RP = 15 × g(d) × (1 + power/10), rounded up to a multiple of 5, where g(d) = 1.4^d up to depth 8
 *  and then grows by 15% of 1.4^8 per level: an open world stays reachable, deep ideas stay dear. */
export function costFor(depth: number, power: number): number {
  const g = depth <= 8 ? Math.pow(1.4, depth) : Math.pow(1.4, 8) * (1 + 0.15 * (depth - 8));
  return Math.ceil(15 * g * (1 + power / 10) / 5) * 5;
}
export const budgetFor = (depth: number) => 4 + 2 * depth;

// ---------------------------------------------------------------- effect catalogue (§5.3)

export const EFFECT_KINDS: Record<string, string> = {
  role_bonus: '{"kind":"role_bonus","role":"hunt|gather|fish|farm|wood|stone|flint|clay|mine|craft|build|research|warrior|extract","percent":10|20|30} — 2 points per 10%',
  spoilage: '{"kind":"spoilage","percent":10|20|30} — food spoils that much less; 1 point per 10%',
  recipe: '{"kind":"recipe","id":"slug","name":"…","input":{"good":qty},"output_qty":1-3,"work":1-3,"at":"workshop|kiln|<your building id>","tool":{"role":"…","percent":10-30,"per":1-4}?} — a NEW good made from goods that exist; 3 points (+2 per 10% if it is a tool)',
  building: '{"kind":"building","id":"slug","name":"…","cost":{"good":qty},"work":3-12,"effect":{"housing":0-15,"stability":0-1,"spoilage":0-10,"craft_slots":0-4,"defense":0-40,"farm_slots":0-6,"farm_food":0-2,"income":0-2}} (caps grow with your era: housing +5, craft_slots +1, defense +10, farm_slots +1, income +1 per era, farm_food +1 every 3 eras; income = coin a public work earns the treasury a turn) — 3 points + housing 2/5, stability 4, spoilage 1/10%, defense 3/10%, farming 3, craft slots 1/2, income 2 per coin',
  stability: '{"kind":"stability","per_tick":1|2} — 4 points each',
  ap: '{"kind":"ap","amount":1} — 5 points',
  combat: '{"kind":"combat","percent":10|20|30} — 3 points per 10%',
  move: '{"kind":"move","terrain":"shallow|mountain"} — explorers and armies can cross it; shallow also lets you hold sea tiles; 4 points',
  reveal: '{"kind":"reveal","resource":"copper|tin|iron"} — that hidden ore becomes visible; 4 points',
  research: '{"kind":"research","percent":10|20} — RP +; 3 points per 10%',
  growth: '{"kind":"growth","percent":10|20|30} — population grows that much faster; 2 points per 10% (from Đồ Đá Mới)',
  transport: '{"kind":"transport","percent":20|40} — caravans carry that much more and go that much faster (wheels, roads, sails); 2 points per 20% (from Đồ Đồng)',
  explore: '{"kind":"explore","tiles":4|8} — expeditions walk that much further; 2 points per 4 tiles (from Đồ Đồng)',
  range: '{"kind":"range","tiles":1} — attacks reach 1 tile further (bows of range, siege engines, artillery); 5 points (from Cổ Đại)',
  medicine: '{"kind":"medicine","percent":20|40} — plague strikes and kills that much less; 2 points per 20% (from Cổ Đại)',
  officials: '{"kind":"officials","amount":1} — one more official (administration, bureaucracy); 4 points (from Cổ Đại)',
  housing_slots: '{"kind":"housing_slots","amount":1} — one more housing building per centre (cities, apartments); 6 points (from Trung Đại)',
  tile_limit: '{"kind":"tile_limit","amount":1|2} — 2 points each',
};
const SLUG = /^[a-z][a-z0-9_]{1,23}$/;
const CAP = /^[\p{Ll}0-9][\p{Ll}0-9-]{1,23}$/u;
const pct = (v: unknown, allowed: number[]) => { const x = Math.round(Number(v)); return allowed.includes(x) ? x : NaN; };

export interface ParsedEffects { effects: Invention["effects"]; recipes: Recipe[]; buildings: BuildingDef[]; goods: Record<string, { name: string; value: number }>; power: number; errors: string[] }

/** Turn the AI's effect list into engine effects, pricing each one. */
export function parseEffects(world: World, raw: Array<Record<string, unknown>>, ownedRecipesAt: (at: string) => boolean, era = ERA_TABLE.length - 1): ParsedEffects {
  const out: ParsedEffects = { effects: {}, recipes: [], buildings: [], goods: {}, power: 0, errors: [] };
  /** §5.3 effect kinds open with the eras: false (and an error) when the proposer's era is too early */
  const opened = (key: string, at: string) => {
    const need = EFFECT_ERA[key];
    if (need === undefined || era >= need) return true;
    out.errors.push(`${at}: cần tới kỷ nguyên ${ERA_TABLE[need].name} (hiện ở ${ERA_TABLE[era].name})`);
    return false;
  };
  const E = out.effects, err = (s: string) => out.errors.push(s);
  const newBuildingIds = new Set<string>();
  for (const e of raw) if (e?.kind === "building" && typeof e.id === "string") newBuildingIds.add(e.id);
  for (const [i, e] of raw.entries()) {
    const kind = String(e?.kind ?? "");
    const at = `hiệu ứng ${i + 1} (${kind || "?"})`;
    switch (kind) {
      case "role_bonus": {
        const role = String(e.role), p = pct(e.percent, [10, 20, 30]);
        if (![...ROLES, "extract", "mine"].includes(role)) { err(`${at}: vai "${role}" không tồn tại`); break; }
        if (Number.isNaN(p)) { err(`${at}: percent phải là 10, 20 hoặc 30`); break; }
        E.role = { ...(E.role || {}), [role]: ((E.role as Record<string, number> | undefined)?.[role] || 0) + p / 100 };
        out.power += 2 * p / 10; break;
      }
      case "spoilage": {
        const p = pct(e.percent, [10, 20, 30]); if (Number.isNaN(p)) { err(`${at}: percent phải là 10, 20 hoặc 30`); break; }
        E.spoilageCut = (E.spoilageCut || 0) + p / 100 * 0.3; out.power += p / 10; break;
      }
      case "recipe": {
        const id = String(e.id ?? ""), name = String(e.name ?? "").trim().slice(0, 40);
        if (!SLUG.test(id)) { err(`${at}: id phải là slug chữ thường, ví dụ "charcoal"`); break; }
        if (knownGood(world, id) || recipeOf(world, id) || out.goods[id]) { err(`${at}: "${id}" đã tồn tại; đặt id khác`); break; }
        if (!name) { err(`${at}: thiếu tên`); break; }
        const input: Record<string, number> = {};
        for (const [k, q] of Object.entries((e.input ?? {}) as Record<string, unknown>)) {
          const qty = Math.round(Number(q));
          if (!knownGood(world, k) && !out.goods[k]) { err(`${at}: nguyên liệu "${k}" không tồn tại`); continue; }
          if (!(qty >= 1 && qty <= 10)) { err(`${at}: số lượng "${k}" phải 1–10`); continue; }
          input[k] = qty;
        }
        if (!Object.keys(input).length) { err(`${at}: cần ít nhất một nguyên liệu có thật (không có gì sinh ra từ hư không)`); break; }
        const qty = Math.max(1, Math.min(3, Math.round(Number(e.output_qty ?? 1)))), work = Math.max(1, Math.min(3, Math.round(Number(e.work ?? 1))));
        const where = String(e.at ?? "workshop");
        if (!["workshop", "kiln"].includes(where) && !newBuildingIds.has(where) && !buildingOf(world, where) && !ownedRecipesAt(where)) { err(`${at}: nơi làm "${where}" không tồn tại`); break; }
        // §6.2: the output is worth exactly what went in plus labour
        const value = Math.round((Object.entries(input).reduce((s, [k, q]) => s + goodValue(world, k) * q, 0) + work) / qty * 100) / 100;
        const r: Recipe = { id, name, needs: "", input, output: { [id]: qty }, work, building: where };
        out.power += 3;
        if (e.tool && typeof e.tool === "object") {
          const t = e.tool as Record<string, unknown>, role = String(t.role), p = pct(t.percent, [10, 20, 30]), per = Math.max(1, Math.min(4, Math.round(Number(t.per ?? 1))));
          if (![...ROLES, "mine"].includes(role) || Number.isNaN(p)) err(`${at}: tool cần role hợp lệ và percent 10/20/30`);
          else { r.use = { role, bonus: p / 100, per }; out.power += 2 * p / 10; }
        }
        out.recipes.push(r); out.goods[id] = { name, value }; break;
      }
      case "building": {
        const id = String(e.id ?? ""), name = String(e.name ?? "").trim().slice(0, 40);
        if (!SLUG.test(id)) { err(`${at}: id phải là slug chữ thường`); break; }
        if (buildingOf(world, id)) { err(`${at}: công trình "${id}" đã tồn tại`); break; }
        if (!name) { err(`${at}: thiếu tên`); break; }
        const cost: Record<string, number> = {};
        for (const [k, q] of Object.entries((e.cost ?? {}) as Record<string, unknown>)) {
          const qty = Math.round(Number(q));
          if (!knownGood(world, k) && !out.goods[k]) { err(`${at}: vật liệu "${k}" không tồn tại`); continue; }
          if (qty >= 1 && qty <= 40) cost[k] = qty;
        }
        const work = Math.max(3, Math.min(12, Math.round(Number(e.work ?? 6))));
        const f = (e.effect ?? {}) as Record<string, unknown>, n = (k: string, max: number) => Math.max(0, Math.min(max, Math.round(Number(f[k] ?? 0))));
        // §5.3 later eras build bigger: homes, workshops, farms and walls grow with the era
        const effect = { housing: n("housing", 15 + 5 * era), stability: n("stability", 1), spoilage: n("spoilage", 10) / 100, craftSlots: n("craft_slots", 4 + era), defense: n("defense", 40 + 10 * era) / 100, farmSlots: n("farm_slots", 6 + era), farmFood: n("farm_food", 2 + Math.floor(era / 3)), income: n("income", 2 + era) }; // §4.13 a public work that earns coin
        if (effect.farmSlots && !effect.farmFood) effect.farmSlots = 0;
        out.power += 3 + Math.ceil(effect.housing / 5) * 2 + effect.stability * 4 + Math.round(effect.spoilage * 10) + Math.round(effect.defense * 10) * 3 + (effect.farmSlots ? 3 : 0) + Math.ceil(effect.craftSlots / 2) + effect.income * 2;
        if (!Object.keys(cost).length && !effect.farmSlots) { err(`${at}: công trình phải tốn ít nhất một vật liệu`); break; }
        out.buildings.push({ type: id, name, needs: "", cost, work, desc: describeBuilding(effect), effect }); break;
      }
      case "stability": { const k = pct(e.per_tick, [1, 2]); if (Number.isNaN(k)) { err(`${at}: per_tick 1 hoặc 2`); break; } E.stabilityPerTick = (E.stabilityPerTick || 0) + k; out.power += 4 * k; break; }
      case "ap": { E.ap = 1; out.power += 5; break; }
      case "combat": { const p = pct(e.percent, [10, 20, 30]); if (Number.isNaN(p)) { err(`${at}: percent 10/20/30`); break; } E.combat = (E.combat || 0) + p / 100; out.power += 3 * p / 10; break; }
      case "move": {
        const t = String(e.terrain);
        if (!["shallow", "mountain", "ocean"].includes(t)) { err(`${at}: terrain phải là shallow, mountain hoặc ocean (đầm lầy và rừng rậm vốn đi được)`); break; }
        if (!opened(`move:${t}`, at)) break;
        E.move = [...(E.move || []), t]; out.power += t === "ocean" ? 6 : 4; break;
      }
      case "reveal": {
        const r = String(e.resource);
        if (!["copper", "tin", "iron", ...DEEP_RES].includes(r)) { err(`${at}: resource phải là copper, tin, iron, coal, sulfur hoặc oil`); break; }
        if (!opened(`reveal:${r}`, at)) break;
        E.reveal = [...(E.reveal || []), r]; out.power += 4; break;
      }
      case "growth": { if (!opened(kind, at)) break; const p = pct(e.percent, [10, 20, 30]); if (Number.isNaN(p)) { err(`${at}: percent 10/20/30`); break; } E.growth = (E.growth || 0) + p / 100; out.power += 2 * p / 10; break; }
      case "transport": { if (!opened(kind, at)) break; const p = pct(e.percent, [20, 40]); if (Number.isNaN(p)) { err(`${at}: percent 20 hoặc 40`); break; } E.transport = (E.transport || 0) + p / 100; out.power += p / 10; break; }
      case "explore": { if (!opened(kind, at)) break; const k = pct(e.tiles, [4, 8]); if (Number.isNaN(k)) { err(`${at}: tiles 4 hoặc 8`); break; } E.explore = (E.explore || 0) + k; out.power += k / 2; break; }
      case "range": { if (!opened(kind, at)) break; E.range = (E.range || 0) + 1; out.power += 5; break; }
      case "medicine": { if (!opened(kind, at)) break; const p = pct(e.percent, [20, 40]); if (Number.isNaN(p)) { err(`${at}: percent 20 hoặc 40`); break; } E.medicine = (E.medicine || 0) + p / 100; out.power += p / 10; break; }
      case "officials": { if (!opened(kind, at)) break; E.officials = (E.officials || 0) + 1; out.power += 4; break; }
      case "housing_slots": { if (!opened(kind, at)) break; E.housingSlots = (E.housingSlots || 0) + 1; out.power += 6; break; }
      case "research": { const p = pct(e.percent, [10, 20]); if (Number.isNaN(p)) { err(`${at}: percent 10 hoặc 20`); break; } E.rp = (E.rp || 0) + p / 100; out.power += 3 * p / 10; break; }
      case "tile_limit": { const k = pct(e.amount, [1, 2]); if (Number.isNaN(k)) { err(`${at}: amount 1 hoặc 2`); break; } E.tiles = (E.tiles || 0) + k; out.power += 2 * k; break; }
      default: err(`${at}: loại hiệu ứng không có. Có: ${Object.keys(EFFECT_KINDS).join(", ")}`);
    }
  }
  const unlocks = [...out.recipes.map(r => r.id), ...out.buildings.map(b => b.type)];
  if (unlocks.length) E.unlocks = unlocks;
  return out;
}

export function describeBuilding(e: BuildingDef["effect"]): string {
  const p: string[] = [];
  if (e.housing) p.push(`+${e.housing} chỗ ở`);
  if (e.stability) p.push(`+${e.stability} ổn định/lượt`);
  if (e.spoilage) p.push(`hư hỏng −${Math.round(e.spoilage * 100)}%`);
  if (e.craftSlots) p.push(`${e.craftSlots} chỗ chế tác`);
  if (e.defense) p.push(`phòng thủ +${Math.round(e.defense * 100)}%`);
  if (e.farmSlots) p.push(`${e.farmSlots} người × ${e.farmFood} lương thực`);
  if (e.income) p.push(`công trình công cộng: thu ${e.income} tiền/lượt`);
  return p.join(", ") || "không có tác dụng";
}

/** A nation's era as an index into ERA_TABLE (0 for unknown names). */
export function eraIndex(n: Nation | undefined): number { return n ? ERA_INDEX[n.era] ?? 0 : 0; }

/** What a building does, in a few Vietnamese words. */
export function buildingEffectText(e: BuildingDef["effect"]): string {
  const p: string[] = [];
  if (e.housing) p.push(`+${e.housing} chỗ ở`);
  if (e.farmSlots) p.push(`${e.farmSlots} chỗ nông dân × ${e.farmFood ?? 0} lương thực`);
  if (e.craftSlots) p.push(`${e.craftSlots} chỗ chế tác`);
  if (e.defense) p.push(`phòng thủ +${Math.round(e.defense * 100)}%`);
  if (e.stability) p.push(`+${e.stability} ổn định/lượt`);
  if (e.spoilage) p.push(`hư lương thực −${Math.round(e.spoilage * 100)}%`);
  if (e.water) p.push("nước ngọt");
  if (e.port) p.push("bến thuyền");
  if (e.fish) p.push(`đánh cá +${Math.round(e.fish * 100)}%`);
  if (e.seaSalt) p.push(`+${e.seaSalt} muối/lượt`);
  if (e.harbor) p.push(`lãnh hải xa thêm ${e.harbor} ô`);
  if (e.income) p.push(`thu ${e.income} tiền/lượt${e.market ? " + theo dân và bạn hàng" : ""}`);
  return p.join(", ");
}
export function describeEffects(world: World, e: Invention["effects"]): string {
  const p: string[] = [];
  for (const [r, v] of Object.entries(e.role || {})) p.push(`${r} +${Math.round((v || 0) * 100)}%`);
  if (e.spoilageCut) p.push(`hư hỏng −${Math.round(e.spoilageCut * 100)} điểm %`);
  if (e.stabilityPerTick) p.push(`+${e.stabilityPerTick} ổn định/lượt`);
  if (e.ap) p.push(`+${e.ap} AP`);
  if (e.combat) p.push(`chiến đấu +${Math.round(e.combat * 100)}%`);
  if (e.move?.length) p.push(`đi được: ${e.move.map(t => TERRAIN[t as keyof typeof TERRAIN]?.name ?? t).join(", ")}`);
  if (e.reveal?.length) p.push(`thấy: ${e.reveal.map(r => RES_NAME[r] ?? r).join(", ")}`);
  if (e.rp) p.push(`RP +${Math.round(e.rp * 100)}%`);
  if (e.tiles) p.push(`+${e.tiles} ô quản lý`);
  if (e.growth) p.push(`tăng dân +${Math.round(e.growth * 100)}%`);
  if (e.transport) p.push(`vận tải +${Math.round(e.transport * 100)}%`);
  if (e.explore) p.push(`thám hiểm xa thêm ${e.explore} ô`);
  if (e.range) p.push(`tầm đánh +${e.range} ô`);
  if (e.medicine) p.push(`dịch bệnh −${Math.round(e.medicine * 100)}%`);
  if (e.officials) p.push(`+${e.officials} quan chức`);
  if (e.housingSlots) p.push(`+${e.housingSlots} công trình nhà ở mỗi trung tâm`);
  const g = (x: Record<string, number>) => Object.entries(x).map(([k, q]) => `${q} ${goodName(world, k)}`).join(" + ") || "không gì";
  for (const u of e.unlocks || []) {
    const r = recipeOf(world, u), b = buildingOf(world, u);
    if (r) p.push(`công thức ${r.name}: ${g(r.input)} → ${g(r.output)} (${r.work} công, tại ${buildingOf(world, r.building)?.name ?? r.building})`);
    if (b) p.push(`công trình ${b.name} (tốn ${g(b.cost)}, ${b.work} công${buildingEffectText(b.effect) ? `; ${buildingEffectText(b.effect)}` : ""})`);
  }
  return p.join("; ");
}

// ---------------------------------------------------------------- proposals

export function normInv(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function tokens(s: string): Set<string> { return new Set(normInv(s).split(" ").filter(w => w.length > 1)); }
/** Existing inventions whose name or description looks like this one. */
export function similarInventions(world: World, name: string, description: string, limit = 6): Invention[] {
  const a = tokens(`${name} ${description}`);
  return allInventions(world).map(v => {
    const b = tokens(`${v.name} ${v.desc} ${v.custom?.description ?? ""}`);
    const inter = [...a].filter(x => b.has(x)).length;
    return { v, score: inter / Math.max(1, Math.min(a.size, b.size)) };
  }).filter(x => x.score > 0.2).sort((x, y) => y.score - x.score || x.v.id.localeCompare(y.v.id)).slice(0, limit).map(x => x.v);
}

/** What an invention does, as a set of effect keys ("role:hunt", "tiles", "unlock:boat"…), for duplicate checks. */
function effectKeys(e: Record<string, unknown> | undefined): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(e ?? {})) {
    if (v === undefined || v === null || v === 0 || v === false) continue;
    if (Array.isArray(v)) for (const x of v) out.add(`${k}:${typeof x === "object" ? JSON.stringify(x) : String(x)}`);
    else if (typeof v === "object") for (const [s, x] of Object.entries(v as Record<string, unknown>)) { if (x) out.add(`${k}:${s}`); }
    else out.add(k);
  }
  return out;
}
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(x => b.has(x));

/** §5.7 Is this proposal, in substance, an invention already in the book? Deterministic: no AI. It is a duplicate only
 *  when it claims no capability the other lacks, and either its name is the other's (in other words) or it does the
 *  same things with a matching description. */
export function nearDuplicate(world: World, p: { name: string; description: string; caps: string[]; effects: Array<Record<string, unknown>> }): { id: string; why: string } | null {
  const mine = parseEffects(world, p.effects, () => true).effects as unknown as Record<string, unknown>;
  const sig = effectKeys(mine), nameT = tokens(p.name), textT = tokens(`${p.name} ${p.description}`);
  let best: { id: string; why: string; score: number } | null = null;
  for (const v of allInventions(world)) {
    if (!p.caps.every(c => v.caps.includes(c))) continue; // it claims something new: not a duplicate
    const vName = tokens(v.name), vText = tokens(`${v.name} ${v.desc} ${v.custom?.description ?? ""}`);
    const shared = [...nameT].filter(x => vName.has(x)).length;
    const nameMatch = shared >= 2 && shared >= Math.min(nameT.size, vName.size); // one name holds the other: "Lều da" / "Lều da thú"
    const textSim = [...textT].filter(x => vText.has(x)).length / Math.max(1, Math.min(textT.size, vText.size));
    const vSig = effectKeys(v.effects as unknown as Record<string, unknown>), sameDoing = sig.size > 0 && sameSet(sig, vSig);
    const capsDoing = p.caps.length > 0 && sameSet(new Set(p.caps), new Set(v.caps)) && sameDoing;
    let why = "", score = 0;
    const frame = /^K\d+$/.test(v.id); // a frame invention (§5.6) is only matched by name: a nation's own way to its capability is welcome
    if (nameMatch && (sameDoing || sig.size === 0 || textSim >= 0.4)) { why = `cùng tên gọi "${v.name}"`; score = 2 + textSim; }
    else if (frame) continue;
    else if (capsDoing) { why = "cùng năng lực và cùng hiệu ứng"; score = 1.5 + textSim; }
    else if (sameDoing && textSim >= 0.6) { why = `cùng hiệu ứng, mô tả giống ${Math.round(textSim * 100)}%`; score = 1 + textSim; }
    if (score && (!best || score > best.score || (score === best.score && v.id < best.id))) best = { id: v.id, why, score };
  }
  return best ? { id: best.id, why: best.why } : null;
}

export type ProposalCheck = { ok: true; proposal: Omit<Proposal, "id" | "tick" | "status" | "ruling" | "inventionId"> } | { ok: false; error: string; duplicateOf?: string };

export function checkProposal(world: World, n: Nation, a: Record<string, unknown>): ProposalCheck {
  const name = String(a.name ?? "").trim(), description = String(a.description ?? "").trim();
  if (name.length < 3 || name.length > 40) return { ok: false, error: "Tên phát minh 3–40 ký tự" };
  if (!description || description.length > 300) return { ok: false, error: "Mô tả 1–300 ký tự: nó là gì, làm ra sao" };
  const same = allInventions(world).find(v => normInv(v.name) === normInv(name));
  if (same) return { ok: false, error: `"${name}" đã có trong Sổ (${same.id})`, duplicateOf: same.id };
  if (world.proposals.some(p => p.nation === n.id && p.status === "pending")) return { ok: false, error: "Đã có một đơn đang chờ trọng tài" };
  const lastRejected = world.proposals.filter(p => p.nation === n.id && p.status === "rejected" && normInv(p.name) === normInv(name)).at(-1);
  if (lastRejected && world.tick - lastRejected.tick < 3) return { ok: false, error: "Đơn cùng ý tưởng chỉ được nộp lại sau 3 lượt" };
  const prereqs = Array.isArray(a.prereqs) ? [...new Set(a.prereqs.map(String))] : [];
  if (prereqs.length < 1 || prereqs.length > 4) return { ok: false, error: "Cần 1–4 tiên quyết (id phát minh bạn đã có)" };
  const missing = prereqs.filter(p => !n.inventions.includes(p));
  if (missing.length) return { ok: false, error: `Bạn chưa có tiên quyết: ${missing.join(", ")}` };
  const caps = Array.isArray(a.capabilities) ? [...new Set(a.capabilities.map(c => String(c).trim().toLowerCase()))] : [];
  if (caps.length > 2) return { ok: false, error: "Tối đa 2 năng lực mới" };
  for (const c of caps) if (!CAP.test(c)) return { ok: false, error: `Năng lực "${c}" phải là chữ thường nối bằng gạch ngang, ví dụ "nhiệt-cao"` };
  let requires: Proposal["requires"] = null;
  if (a.requires && typeof a.requires === "object") {
    const r = a.requires as Record<string, unknown>;
    if (r.resource) { if (!(String(r.resource) in RES_NAME)) return { ok: false, error: `Tài nguyên "${r.resource}" không tồn tại` }; requires = { res: String(r.resource) }; }
    else if (r.terrain) { if (!(String(r.terrain) in TERRAIN)) return { ok: false, error: `Địa hình "${r.terrain}" không tồn tại` }; requires = { terrain: String(r.terrain) }; }
  }
  const effects = Array.isArray(a.effects) ? a.effects.filter(e => e && typeof e === "object").slice(0, 6) as Array<Record<string, unknown>> : [];
  const ownBuildings = new Set(n.buildings.map(b => b.type));
  const parsed = parseEffects(world, effects, at => ownBuildings.has(at), eraIndex(n));
  if (parsed.errors.length) return { ok: false, error: parsed.errors.slice(0, 3).join("; ") };
  const power = parsed.power + caps.length * 3;
  if (power <= 0) return { ok: false, error: "Phát minh phải có ít nhất một hiệu ứng hoặc một năng lực mới" };
  const depth = 1 + Math.max(...prereqs.map(p => depthOf(world, p)));
  if (power > budgetFor(depth)) return { ok: false, error: `Tổng điểm sức mạnh ${power} vượt ngân sách ${budgetFor(depth)} của độ sâu ${depth} (4 + 2d)` };
  return { ok: true, proposal: { nation: n.id, name, description, prereqs, requires, caps, effects, depth, power } };
}

/** Apply the judge's ruling (§5.4). Returns the new invention id, or null. */
export function applyRuling(world: World, p: Proposal, r: Ruling): string | null {
  p.ruling = r;
  if (r.duplicate_of && inv(world, r.duplicate_of)) { p.status = "duplicate"; p.inventionId = r.duplicate_of; return null; }
  // Two nations invented the same thing in the same tick: the second joins the first (§5.7)
  const same = allInventions(world).find(v => normInv(v.name) === normInv(p.name));
  if (same) { p.status = "duplicate"; p.inventionId = same.id; return null; }
  // Amendments: extra prerequisites, fewer effects, fewer capabilities
  const extra = (r.add_prereqs || []).filter(x => inv(world, x) && !p.prereqs.includes(x)).slice(0, 2);
  const effects = p.effects.filter((_, i) => !(r.remove_effects || []).includes(i));
  const caps = p.caps.filter(c => !(r.remove_capabilities || []).includes(c));
  const score = r.causality + r.material + r.physics;
  if (score < 4 || r.physics === 0) { p.status = "rejected"; return null; }
  const parsed = parseEffects(world, effects, () => true, eraIndex(world.nations[p.nation]));
  if (parsed.errors.length) { p.status = "rejected"; p.ruling = { ...r, reason: `${r.reason} (sau sửa đổi không hợp lệ: ${parsed.errors[0]})` }; return null; }
  const prereqs = [...p.prereqs, ...extra];
  const depth = 1 + Math.max(...prereqs.map(x => depthOf(world, x)));
  const power = parsed.power + caps.length * 3;
  const id = `X${world.custom.next++}`;
  for (const rc of parsed.recipes) { rc.needs = id; world.custom.recipes[rc.id] = rc; }
  for (const b of parsed.buildings) { b.needs = id; world.custom.buildings[b.type] = b; }
  for (const [k, g] of Object.entries(parsed.goods)) world.custom.goods[k] = { ...g, by: p.nation };
  const env: Invention["env"] = p.requires?.res ? { res: p.requires.res as never } : p.requires?.terrain ? { terrains: [p.requires.terrain as never] } : undefined;
  world.custom.inventions[id] = {
    id, name: p.name, prereqs, rp: costFor(depth, power), caps, env, effects: parsed.effects,
    desc: describeEffects(world, parsed.effects) || p.description.slice(0, 120),
    custom: { by: p.nation, tick: world.tick, depth, power, description: p.description, judge: r.judge },
  };
  p.status = "approved"; p.inventionId = id; p.depth = depth; p.power = power;
  return id;
}
