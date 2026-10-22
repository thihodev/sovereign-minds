// What threatens a nation and what it can draw on (§9.4): one report, read by
// the nation's AI in its observation (only what that nation can know) and by
// the Watcher (everything). Pure reads; never changes the World.

import { col, row, dist } from "./hex.ts";
import { buildingOf } from "./catalog.ts";
import { mouths } from "./people.ts";
import { canSeeRes, freshWater, governed, homeDefence, housing, mods, ownedTiles, tileLimit, workers } from "./engine.ts";
import { DISEASE, LAND, SCHISM, UNREST } from "./rules.ts";
import { BEASTS, EVENTS, FLOOD, HERBS, HIDDEN_ORES, HORDES, HUNT_TOOLS, ICE_WIND, QUAKE, REGEN, RES_NAME, RIVER, ROLE_RESOURCE, SPOILAGE, TERRAIN } from "./rules.ts";
import { beastRisk, floodChance, iceWind, landDistance, liveHordes, raidChance, raidParty, tileDanger, winterChance, winterDeathShare } from "./wild.ts";
import type { Nation, ResKey, Role, Tile, World } from "./types.ts";
import { RESOURCE_KEYS } from "./worldgen.ts";
import { diseaseChances, vaccinated } from "./contagion.ts";

/** 0 = noted, 1 = watch, 2 = serious, 3 = urgent. */
export interface Threat { kind: string; level: number; title: string; detail: string }

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
const r1 = (x: number) => Math.round(x * 10) / 10;
const xy = (i: number): [number, number] => [col(i), row(i)];

/** Every threat a nation faces now, most urgent first. forAI: only what the nation itself can see. */
export function nationThreats(world: World, n: Nation, forAI = false): Threat[] {
  if (!n.alive) return [];
  const out: Threat[] = [], m = mods(world, n), owned = ownedTiles(world, n.id);
  const add = (kind: string, level: number, title: string, detail: string) => out.push({ kind, level, title, detail });

  // Hunger
  const need = mouths(n) * m.foodPerPerson, food = n.stock.food || 0, turns = need > 0 ? food / need : 99;
  if (turns < 2.5) add("famine", turns < 1 ? 3 : turns < 1.5 ? 2 : 1, "Thiếu ăn", `Kho ${r1(food)} lương thực, mỗi lượt ăn ${r1(need)} (đủ ${r1(turns)} lượt); lương thực hư ${pct(Math.max(SPOILAGE.min, m.spoilage - m.spoilageCut))} mỗi lượt.`);

  // Winter and the ice wall's wind
  const icy = iceWind(world, n), winter = winterChance(world, n);
  if (winter > 0) {
    const roofed = n.buildings.some(b => b.done && (buildingOf(world, b.type)?.effect.housing || 0) > 0), coats = (n.stock.hide_coat || 0) >= n.population / 2;
    const deaths = Math.floor(n.population * winterDeathShare(world, n, m.winter, roofed, coats));
    const lacks = [!roofed && "chưa có lều", !coats && `áo da chưa đủ cho nửa dân (có ${Math.floor(n.stock.hide_coat || 0)}/${Math.ceil(n.population / 2)})`].filter(Boolean).join(", ");
    add("winter", winter >= 0.08 && deaths >= 3 ? 2 : winter >= 0.04 && deaths >= 1 ? 1 : 0, icy ? "Mùa đông và gió băng" : "Mùa đông khắc nghiệt",
      `${pct(winter)} mỗi lượt; nếu tới: mất ${pct(EVENTS.winter.foodLoss)} lương thực làm ra và khoảng ${deaths} người chết rét${lacks ? ` (${lacks})` : ""}.${icy ? ` Đất trong vòng ${ICE_WIND.reach} ô của Tường Băng: mùa đông ×${ICE_WIND.winterMult}, chết rét ×${ICE_WIND.deathMult}.` : ""}`);
  }

  // Plague and herbs
  // §9.6 each disease by its own odds
  const herbsNeed = Math.ceil(n.population / HERBS.perPeople), herbs = Math.floor(n.stock.herbs || 0);
  const odds = diseaseChances(world, n, m, !freshWater(world, n), false).filter(x => x.p > 0.0005), plague = odds.reduce((s, x) => s + x.p, 0);
  add("plague", plague >= 0.03 && herbs < herbsNeed ? 2 : herbs < herbsNeed ? 1 : 0, "Dịch bệnh",
    `${pct(plague)} mỗi lượt: ${odds.map(x => `${x.d.name} ${pct(x.p)}${vaccinated(x.d, m) ? " (đã có thuốc)" : ""}`).join(", ")}${n.population > EVENTS.plague.bigPop ? ` (dịch hạch, đậu mùa, cúm ×2 vì trên ${EVENTS.plague.bigPop} dân)` : ""}. Thảo dược ${herbs}/${herbsNeed} cần để giảm một nửa số chết${herbs >= herbsNeed ? " (đủ)" : ""}.`);

  // Fresh water (§2.1)
  if (!freshWater(world, n)) add("water", 1, "Thiếu nước ngọt", `Thủ đô không có sông, đầm, suối hay giếng trong vòng ${RIVER.waterReach} ô: dân tăng chậm hơn (×${RIVER.dryGrowth}) và dịch tả ×${DISEASE.dry}. Xây Giếng (well) gần thủ đô.`);

  // Drought
  if ((n.eventTimers.drought || 0) > 0) add("drought", 2, "Hạn hán", `Còn ${n.eventTimers.drought} lượt: hái lượm và ruộng −50%.`);

  // Floods
  const wet = owned.filter(t => t.river || t.terrain === "swamp");
  if (wet.length) {
    const wetSet = new Set(wet.map(t => t.i)), atRisk = n.buildings.filter(b => wetSet.has(b.tile));
    const chance = floodChance(wet);
    add("flood", atRisk.length ? 1 : 0, "Lũ lụt", `${pct(chance)} mỗi lượt trên ${wet.length} ô sông/đầm${wet.some(t => t.delta) ? " (có châu thổ: ×2)" : ""}; nước cuốn ${pct(FLOOD.foodLoss)} lương thực${atRisk.length ? ` và một trong ${atRisk.length} công trình ven nước` : ""}, nhưng ruộng +${FLOOD.fertile * 100}% sau đó.`);
  }

  // Earthquakes
  const rocky = owned.filter(t => t.terrain === "hill" || t.terrain === "mountain");
  if (rocky.length) {
    const near = n.buildings.filter(b => rocky.some(t => dist(t.i, b.tile) <= QUAKE.radius)).length;
    add("quake", 0, "Động đất", `${pct(QUAKE.chance)} mỗi lượt (có ${rocky.length} ô đồi núi); phá công trình trong ${QUAKE.radius} ô quanh tâm chấn (${near} công trình trong vùng có thể bị ảnh hưởng), ${pct(QUAKE.deaths)} dân chết; đôi khi lộ quặng.`);
  }

  // Beasts
  // The same odds the engine rolls (one hunting tool serves four hunters, §4.1); idle hands forage, so count them as gatherers
  const idle = Math.max(0, workers(n) - Object.values(n.labor).reduce((s, v) => s + v, 0));
  const armed = HUNT_TOOLS.reduce((s, k) => s + Math.floor(n.stock[k] || 0), 0) * 4 >= n.labor.hunt;
  const beasts = beastRisk(world, owned, n.labor.hunt, n.labor.gather + idle, armed);
  if (beasts) {
    const { chance, dead, lair, avg } = beasts;
    add("beasts", chance >= 0.15 ? 2 : chance >= 0.07 ? 1 : 0, "Thú dữ",
      `${pct(chance)} mỗi lượt (độ nguy hiểm trung bình ${r1(avg)}/5 trên đất săn hái; nặng nhất: ${BEASTS.name[lair.terrain] ?? "thú hoang"} ở ${TERRAIN[lair.terrain].name.toLowerCase()} (${xy(lair.i).join(", ")})). Một trận tấn công giết khoảng ${dead} người${armed ? " (thợ săn đủ vũ khí: giảm một nửa)" : "; trang bị đủ công cụ cho thợ săn sẽ giảm một nửa"}. Đất quanh trung tâm và ô có công trình chỉ nguy hiểm một nửa.`);
  }

  // Barbarian hordes
  const def = homeDefence(world, n);
  for (const h of liveHordes(world)) {
    if (forAI && !n.seen.includes(h.tile)) continue;
    const d = landDistance(world, n, h.tile);
    if (d > HORDES.range + 6) continue;
    const party = raidParty(h, n), rich = n.population >= HORDES.minPop, inRange = d <= HORDES.range && world.tick >= HORDES.grace && rich;
    const ratio = party / Math.max(1, def);
    const level = !inRange ? 1 : ratio > 1.2 ? 3 : ratio > 0.8 ? 2 : 1;
    const raid = inRange ? `toán cướp khoảng ${Math.round(party)} người, ${pct(raidChance(h))} mỗi lượt nếu nước bạn là nước gần nhất`
      : !rich ? `chúng chưa nhòm ngó nước dưới ${HORDES.minPop} dân, nhưng sẽ tới khi bạn lớn lên (toán cướp khoảng ${Math.round(raidParty(h, { ...n, population: HORDES.minPop }))} người)` : `chưa tới tầm cướp (${HORDES.range} ô)`;
    add("horde", level, `Man di: ${h.name}`,
      `Bộ lạc man di #${h.id} sống ở (${xy(h.tile).join(", ")}), cách đất bạn ${d} ô, sức mạnh ${Math.round(h.strength)} và đang lớn dần; ${raid}. Sức thủ tại nhà của bạn khoảng ${Math.round(def)} (chiến binh, vũ khí, ${pct(HORDES.militia)} người lao động, hàng rào). Có thể đánh tan chúng bằng clear_wild khi đất bạn cách chỗ chúng ≤ ${HORDES.clearReach} ô.`);
  }

  // War
  for (const w of world.wars.filter(x => x.end === null && (x.a === n.id || x.b === n.id))) {
    const o = world.nations[w.a === n.id ? w.b : w.a];
    if (!o?.alive) continue;
    const known = forAI ? n.intel[String(o.id)]?.report as Record<string, unknown> | undefined : undefined;
    const theirs = forAI ? (typeof known?.warriors_est === "number" ? known.warriors_est : null) : o.labor.warrior;
    add("war", theirs !== null && theirs > n.labor.warrior * 1.5 ? 3 : 2, `Chiến tranh với ${o.name}`, `Từ lượt ${w.start}. Chiến binh của bạn ${n.labor.warrior}${theirs !== null ? `, của họ khoảng ${Math.round(theirs as number)}` : ""}.`);
  }
  // Governance
  const limit = tileLimit(world, n), held = governed(world, n);
  // §4.5 a faction may leave
  const faction = (world.schisms ?? []).find(x => x.from === n.id && (x.status === "pending" || x.status === "approved" || x.status === "asking"));
  if (faction) add("schism", 3, "Ly khai", faction.province !== undefined
    ? `Tỉnh ${faction.provinceName} (${faction.people} người) theo ${faction.leader} muốn tách ra lập quốc riêng vì ${faction.grievance}; nếu các vị thần cho phép, tỉnh mang theo đất đai, công trình trên đó, người sống ở đó và phần kho tương ứng.`
    : `${faction.people} người theo ${faction.leader} muốn bỏ đi lập quốc riêng vì ${faction.grievance}; nếu các vị thần cho phép, họ mang theo ~${Math.round(faction.share * 100)}% dân và kho.`);
  else if ((n.discontent ?? 0) >= 40) add("discontent", (n.discontent ?? 0) >= 75 ? 3 : 2, "Bất mãn", `Bất mãn ${Math.round(n.discontent ?? 0)}/100: tới 100 (với ${SCHISM.minPop}+ dân) một phái sẽ đòi bỏ đi lập quốc riêng. Giữ ổn định ≥ ${SCHISM.calm} để nó nguội đi; tránh nạn đói, nội loạn và đất quá rộng.`);
  if (n.stability < 30) add("unrest", n.stability < UNREST.below ? 3 : 2, "Bất ổn", `Ổn định ${n.stability}: dưới 30 sản xuất −25%, dưới ${UNREST.below} mỗi lượt ${UNREST.share * 100}% dân bỏ đi (truyền giáo trong nước giữ lại một nửa), về 0 thì nội loạn.`);
  const roof = housing(world, n);
  if (n.population >= roof) add("housing", 1, "Hết chỗ ở", `Dân ${n.population}/${roof} chỗ ở: dân không tăng nữa cho đến khi có thêm lều, điểm định cư, hay đất mới cho thôn xóm.`);
  const volcano = world.wonders.find(w => w.key === "volcano");
  if (volcano && n.buildings.some(b => dist(b.tile, volcano.i) <= 2)) add("volcano", 1, "Núi lửa", `${pct(EVENTS.eruption.chance)} mỗi lượt Núi lửa Tro Đen phun trào, phá mọi công trình trong 2 ô.`);
  return out.sort((a, b) => b.level - a.level);
}

/** What threatens one tile, for the Watcher's inspector. */
export function tileThreats(world: World, i: number): Threat[] {
  const t = world.tiles[i], out: Threat[] = [];
  if (t.terrain === "icewall") return [{ kind: "icewall", level: 3, title: "Tường Băng", detail: "Vách băng cao vút bao quanh thế giới. Không ai đi qua, đứng trên hay khai hoang được." }];
  const d = tileDanger(world, t);
  if (d > 0) out.push({ kind: "beasts", level: d >= 3 ? 2 : d >= 1.5 ? 1 : 0, title: "Thú dữ", detail: `Độ nguy hiểm ${d}/5: ${BEASTS.name[t.terrain] ?? "thú hoang"}.` });
  for (const h of liveHordes(world)) {
    const k = dist(h.tile, i);
    if (k <= HORDES.range) out.push({ kind: "horde", level: k <= BEASTS.wildRadius ? 2 : 1, title: `Man di: ${h.name}`, detail: `Cách nơi ở của chúng ${k} ô (sức mạnh ${Math.round(h.strength)}).` });
  }
  if (t.river || t.terrain === "swamp") out.push({ kind: "flood", level: t.delta ? 2 : 1, title: "Vùng ngập", detail: `Lũ lụt ${pct(FLOOD.chance * (t.delta ? FLOOD.deltaMult : 1))} mỗi lượt cho nước sở hữu.` });
  if (t.terrain === "hill" || t.terrain === "mountain") out.push({ kind: "quake", level: 0, title: "Đứt gãy", detail: `Động đất ${pct(QUAKE.chance)} mỗi lượt.` });
  if (t.wall !== undefined && t.wall <= ICE_WIND.reach) out.push({ kind: "cold", level: 1, title: "Gió băng", detail: `Cách Tường Băng ${t.wall} ô: mùa đông ×${ICE_WIND.winterMult}, kể cả ở nhiệt đới.` });
  const volcano = world.wonders.find(w => w.key === "volcano");
  if (volcano && dist(volcano.i, i) <= 2) out.push({ kind: "volcano", level: 1, title: "Núi lửa", detail: "Trong vùng phun trào của Núi lửa Tro Đen." });
  return out.sort((a, b) => b.level - a.level);
}

export interface ResourceLine { key: string; name: string; left: number; max: number; regrows: boolean; hidden?: boolean }

/** A nation's natural resources: what its land holds, and the nearest unclaimed tile it has seen for each. */
export function nationResources(world: World, n: Nation, forAI = false) {
  const owned = ownedTiles(world, n.id), lines: ResourceLine[] = [];
  const visible = (k: string) => !forAI || canSeeRes(world, n, k);
  for (const k of RESOURCE_KEYS) {
    if (!visible(k)) continue;
    const left = owned.reduce((s, t) => s + (t.res[k] || 0), 0), max = owned.reduce((s, t) => s + (t.cap[k] || 0), 0);
    if (max <= 0 && left <= 0) continue;
    lines.push({ key: k, name: RES_NAME[k] ?? k, left: Math.round(left), max: Math.round(max), regrows: !!REGEN[k], ...(HIDDEN_ORES.includes(k) && !canSeeRes(world, n, k) ? { hidden: true } : {}) });
  }
  const nearest: Record<string, { tile: [number, number]; dist: number; amount: number }> = {};
  for (const i of n.seen) {
    const t = world.tiles[i];
    if (t.owner !== -1 || (!t.land && t.terrain !== "shallow")) continue;
    const d = dist(n.capital, i);
    for (const [k, v] of Object.entries(t.res) as Array<[ResKey, number]>) {
      if (!v || v < 1 || !visible(k)) continue;
      if (!nearest[k] || d < nearest[k].dist || (d === nearest[k].dist && v > nearest[k].amount)) nearest[k] = { tile: xy(i), dist: d, amount: Math.round(v) };
    }
  }
  const have = new Set(lines.filter(l => l.left > 0).map(l => l.key));
  const missing = RESOURCE_KEYS.filter(k => visible(k) && !have.has(k)).map(k => RES_NAME[k] ?? k);
  return { territory: lines, nearest, missing };
}

/** One number per tile for the Watcher's map layers. */
export function layer(world: World, kind: string): number[] {
  const hordes = liveHordes(world);
  const hordeHeat = (t: Tile) => hordes.reduce((s, h) => { const d = dist(h.tile, t.i); return d <= HORDES.range ? Math.max(s, (HORDES.range + 1 - d) / (HORDES.range + 1) * 5) : s; }, 0);
  const flood = (t: Tile) => (t.river || t.terrain === "swamp") ? (t.delta ? 4 : 2.5) : 0;
  const cold = (t: Tile) => t.terrain === "icewall" ? 5 : t.wall !== undefined && t.wall <= ICE_WIND.reach ? (ICE_WIND.reach + 1 - t.wall) : t.zone === "cold" ? 1 : 0;
  if (kind === "beasts") return world.tiles.map(t => tileDanger(world, t));
  if (kind === "hordes") return world.tiles.map(t => t.land ? hordeHeat(t) : 0);
  if (kind === "flood") return world.tiles.map(flood);
  if (kind === "cold") return world.tiles.map(cold);
  if (kind === "danger") return world.tiles.map(t => t.terrain === "icewall" ? 0 : Math.min(5, tileDanger(world, t) * 0.6 + hordeHeat(t) * 0.6 + flood(t) * 0.4 + (t.land ? cold(t) * 0.3 : 0)));
  if ((RESOURCE_KEYS as string[]).includes(kind)) return world.tiles.map(t => Math.round(t.res[kind as ResKey] || 0));
  return [];
}

/** Where each trade works this tick, for the map's walking figures: the richest tiles first, as economy() takes them. */
export function workSites(world: World, n: Nation): Array<{ role: Role; tile: number; n: number }> {
  const owned = ownedTiles(world, n.id), out: Array<{ role: Role; tile: number; n: number }> = [];
  const spread = (role: Role, tiles: number[], people: number) => {
    if (people <= 0) return;
    const use = tiles.slice(0, Math.max(1, Math.min(3, Math.ceil(people / 3))));
    if (!use.length) use.push(n.capital);
    use.forEach((tile, k) => { const share = Math.floor(people / use.length) + (k < people % use.length ? 1 : 0); if (share > 0) out.push({ role, tile, n: share }); });
  };
  const richest = (key: ResKey) => owned.filter(t => (t.res[key] || 0) >= 1).sort((a, b) => (b.res[key]! - a.res[key]!) || a.i - b.i).map(t => t.i);
  for (const role of ["gather", "hunt", "fish", "wood", "stone", "flint", "clay"] as Role[]) spread(role, richest(ROLE_RESOURCE[role]!), n.labor[role]);
  const ores = (["copper", "tin", "iron", "salt", "reeds"] as ResKey[]).filter(k => canSeeRes(world, n, k)).flatMap(richest);
  spread("mine", ores, n.labor.mine);
  const doneWith = (key: "farmSlots" | "craftSlots") => n.buildings.filter(b => b.done && (buildingOf(world, b.type)?.effect[key] || 0) > 0).map(b => b.tile);
  spread("farm", doneWith("farmSlots"), n.labor.farm);
  spread("build", [...n.buildings.filter(b => !b.done).map(b => b.tile), ...(n.roadWorks ?? []).map(w => w.tile)], n.labor.build);
  spread("craft", doneWith("craftSlots"), n.labor.craft);
  spread("research", [n.capital], n.labor.research);
  // Warriors stand on the border nearest a war or a horde, else at home
  const foes = world.wars.filter(w => w.end === null && (w.a === n.id || w.b === n.id)).flatMap(w => ownedTiles(world, w.a === n.id ? w.b : w.a).map(t => t.i));
  const threats = [...foes, ...liveHordes(world).map(h => h.tile)];
  const posts = threats.length ? owned.map(t => ({ i: t.i, d: Math.min(...threats.map(f => dist(f, t.i))) })).sort((a, b) => a.d - b.d || a.i - b.i).map(x => x.i) : [n.capital];
  spread("warrior", posts, n.labor.warrior);
  return out;
}
