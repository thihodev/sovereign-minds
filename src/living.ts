// §4.11 The standard of living. Each era the people expect more: food, a roof and water at first; then clothes, tools,
// pots and salt; then fine things, a temple, medicine; roads and metal; writing and trade; many goods; light and power;
// doctors. A people that has what its age expects has leisure to think and invent; one that lacks it grows restless.
// From the Iron Age on, a nation crosses into the next era only with the life its people expect.

import { LIVING, LUXURY } from "./rules.ts";
import { allRecipes, eraIndex } from "./catalog.ts";
import { freshWater, housing, mods, ownedTiles, workers } from "./engine.ts";
import { NEIGHBORS } from "./hex.ts";
import type { Nation, World } from "./types.ts";

export interface Need { id: string; name: string; era: number; met: boolean; have: string; want: string; how: string }

const sum = (n: Nation, goods: string[]) => goods.reduce((s, g) => s + (n.stock[g] || 0), 0);
const METAL = new Set(["copper", "tin", "iron"]);
/** Goods made from metal: the outputs of every recipe that takes copper, tin, iron or another metal good. */
function metalGoods(world: World): string[] {
  const out = new Set<string>();
  for (let pass = 0; pass < 3; pass++) for (const r of allRecipes(world)) if (Object.keys(r.input).some(g => METAL.has(g) || out.has(g))) for (const g of Object.keys(r.output)) out.add(g);
  return [...out];
}

/** Every need of the standard of living, met or not, with what it takes. */
export function needs(world: World, n: Nation): Need[] {
  const m = mods(world, n), pop = Math.max(1, n.population), eat = pop * m.foodPerPerson, owned = ownedTiles(world, n.id);
  const land = owned.filter(t => t.land), roaded = land.filter(t => (t.road || 0) > 0 || NEIGHBORS[t.i].some(j => world.tiles[j].owner === n.id && (world.tiles[j].road || 0) > 0)).length;
  const lux = LUXURY.goods.filter(g => (n.stock[g] || 0) >= 1).length, metal = metalGoods(world), kinds = Object.entries(n.stock).filter(([g, q]) => q >= 1 && g !== "coin" && g !== "food_reserve").length;
  const r = (x: number) => Math.round(x * 10) / 10;
  const list: Need[] = [
    { id: "food", name: "Đủ ăn", era: 0, met: (n.stock.food || 0) >= eat, have: `${r(n.stock.food || 0)}`, want: `${r(eat)} (một lượt ăn)`, how: "hái lượm, săn, đánh cá, ruộng, gia súc" },
    { id: "roof", name: "Chỗ ở", era: 0, met: housing(world, n) >= n.population, have: `${housing(world, n)} chỗ`, want: `${n.population}`, how: "lều, thôn xóm trên đất, điểm định cư" },
    { id: "water", name: "Nước ngọt", era: 0, met: freshWater(world, n), have: freshWater(world, n) ? "có" : "không", want: "sông, đầm hay giếng gần thủ đô", how: "Giếng, chiếm đất tới sông, dời đô bên sông" },
    { id: "clothes", name: "Quần áo", era: 1, met: sum(n, ["hide_coat", "cloth", "fur"]) >= pop / LIVING.perClothes, have: `${r(sum(n, ["hide_coat", "cloth", "fur"]))}`, want: `${r(pop / LIVING.perClothes)} (áo da, vải, lông thú)`, how: "chế tác Áo da, Vải (Dệt), săn lông thú" },
    { id: "tools", name: "Công cụ", era: 1, met: sum(n, ["stone_tool", "axe", "blade", "spear", "bow"]) >= workers(n) / LIVING.perTools, have: `${r(sum(n, ["stone_tool", "axe", "blade", "spear", "bow"]))}`, want: `${r(workers(n) / LIVING.perTools)}`, how: "chế tác công cụ đá, rìu, lưỡi đá" },
    { id: "pots", name: "Đồ đựng", era: 1, met: (n.stock.pottery || 0) >= pop / LIVING.perPots, have: `${r(n.stock.pottery || 0)} gốm`, want: `${r(pop / LIVING.perPots)}`, how: "Gốm (P13) và Lò gốm" },
    { id: "salt", name: "Muối, gia vị", era: 1, met: sum(n, ["salt", "spice"]) >= pop / LIVING.perSalt, have: `${r(sum(n, ["salt", "spice"]))}`, want: `${r(pop / LIVING.perSalt)}`, how: "khai muối, Ruộng muối, hái gia vị, mua" },
    { id: "luxury", name: "Xa xỉ phẩm", era: 2, met: lux >= 2, have: `${lux} loại`, want: "2 loại", how: "mật ong, hổ phách, ngọc trai, vàng… hoặc phát minh đồ trang sức" },
    { id: "faith", name: "Đền thờ, nghi lễ", era: 2, met: m.caps.has("tín-ngưỡng") && n.buildings.some(b => b.done && ["altar", "temple"].includes(b.type)), have: n.buildings.some(b => b.done && ["altar", "temple"].includes(b.type)) ? "có" : "không", want: "Nghi lễ và Bàn thờ hay Đền", how: "Nghi lễ (P5), Bàn thờ, Đền cẩm thạch" },
    { id: "medicine", name: "Thuốc men", era: 2, met: (n.stock.herbs || 0) >= pop / LIVING.perHerbs || m.medicine > 0, have: `${r(n.stock.herbs || 0)} thảo dược${m.medicine ? `, y thuật ${Math.round(m.medicine * 100)}%` : ""}`, want: `${r(pop / LIVING.perHerbs)} thảo dược hoặc một phát minh y thuật`, how: "hái thảo dược, phát minh hiệu ứng medicine" },
    { id: "roads", name: "Đường sá", era: 3, met: land.length > 0 && roaded / land.length >= LIVING.roadShare, have: `${roaded}/${land.length} ô có đường`, want: `${Math.round(LIVING.roadShare * 100)}%`, how: "build_road qua vùng đất giàu nhất" },
    { id: "metal", name: "Đồ kim loại", era: 3, met: metal.length > 0 && sum(n, metal) >= pop / LIVING.perMetal, have: metal.length ? `${r(sum(n, metal))}` : "chưa có công thức nào từ kim loại", want: `${r(pop / LIVING.perMetal)}`, how: "phát minh công thức từ đồng, thiếc, sắt (công cụ, vũ khí, nồi đồng…) và làm ra chúng" },
    { id: "learning", name: "Chữ viết, học hành", era: 4, met: (m.caps.has("ghi-chép") || m.caps.has("chữ-viết")) && n.labor.research >= workers(n) * LIVING.researchShare, have: `${n.labor.research} người nghiên cứu`, want: `chữ viết và ${Math.ceil(workers(n) * LIVING.researchShare)} người nghiên cứu`, how: "Ký hiệu (P12), chữ viết, nuôi người học" },
    { id: "trade", name: "Buôn bán", era: 4, met: Object.values(n.trades).filter(k => k > 0).length >= 2, have: `${Object.values(n.trades).filter(k => k > 0).length} bạn hàng`, want: "2 bạn hàng", how: "trade_offer, chợ biên giới" },
    { id: "variety", name: "Hàng hóa đa dạng", era: 5, met: kinds >= LIVING.kinds, have: `${kinds} loại`, want: `${LIVING.kinds} loại hàng trong kho`, how: "khai thác, chế tác, buôn bán nhiều loại hàng" },
    { id: "power", name: "Ánh sáng, năng lượng", era: 7, met: sum(n, ["coal", "oil", "whale_oil"]) >= pop / LIVING.perFuel, have: `${r(sum(n, ["coal", "oil", "whale_oil"]))}`, want: `${r(pop / LIVING.perFuel)} than, dầu hay dầu cá voi`, how: "khai than, dầu; săn cá voi" },
    { id: "doctors", name: "Y tế", era: 8, met: m.medicine >= LIVING.medicine, have: `${Math.round(m.medicine * 100)}%`, want: `${Math.round(LIVING.medicine * 100)}% y thuật`, how: "phát minh y học" },
  ];
  return list;
}

/** The standard of living: the share of what the people expect (its era's needs and the next era's) that it has. */
export function livingStandard(world: World, n: Nation): { score: number; expected: Need[]; missing: Need[] } {
  const era = eraIndex(n), expected = needs(world, n).filter(x => x.era <= era + 1);
  const met = expected.filter(x => x.met).length;
  return { score: expected.length ? Math.round(met / expected.length * 100) : 100, expected, missing: expected.filter(x => !x.met) };
}
/** Research ×(1 + this): a people with the life it expects has the leisure to think and invent. */
export function leisure(score: number): number { return LIVING.rp * score / 100; }
/** The standard of living an era's gate asks for (none before the Iron Age). */
export function eraLivingNeed(k: number): number { return LIVING.gate[k] ?? 0; }
