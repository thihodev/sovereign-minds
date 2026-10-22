// §2.13 Towns and cities. Each centre (the capital, each settlement) is a village until its province holds enough
// people, working buildings and a way home: then it grows into a town, and later, with a market, a road to the
// capital and the Bronze Age, into a city. Towns and cities pay the treasury, think and craft more; the ruler may
// set each one a focus (trade, learning, craft, faith, garrison) that doubles what it gives in that field.

import { DEMOGRAPHY, URBAN } from "./rules.ts";
import { buildingOf, eraIndex } from "./catalog.ts";
import { buildingWorks, landRoom, type Mods } from "./engine.ts";
import type { Province } from "./provinces.ts";
import type { Nation, World } from "./types.ts";

type Say = (nation: number | null, kind: string, text: string) => void;
export type Focus = "trade" | "learning" | "craft" | "faith" | "garrison";
export interface Urban { tier: number; focus?: Focus; since: number }
export const TIER_VI = ["Làng", "Thị trấn", "Thành phố"];
export const FOCUS_VI: Record<Focus, string> = { trade: "thương mại", learning: "học thuật", craft: "thủ công", faith: "tín ngưỡng", garrison: "đồn trú" };

const urban = (n: Nation) => (n.urban ??= {});
/** The tier of a centre now (0 village, 1 town, 2 city). */
export const tierAt = (n: Nation, centre: number) => n.urban?.[String(centre)]?.tier ?? 0;

/** What a province has toward the next tier, and what it lacks. */
export function urbanNeeds(world: World, n: Nation, p: Province): { tier: number; missing: string[]; works: number; market: boolean } {
  const tiles = new Set(p.tiles);
  const works = n.buildings.filter(b => tiles.has(b.tile) && buildingWorks(world, b));
  const market = works.some(b => !!buildingOf(world, b.type)?.effect.market);
  const cur = tierAt(n, p.centre), keep = (k: number) => (cur >= k ? URBAN.keep : 1); // a grown place holds its tier a little below the bar
  const town = URBAN.town, city = URBAN.city, big = Math.max(1, landRoom(eraIndex(n)) * DEMOGRAPHY.tierScale); // v0.56 a town of the modern age is bigger
  const people = (k: 1 | 2) => Math.ceil((k === 1 ? town : city).people * big * keep(k));
  const townMiss = [
    p.people < people(1) ? `${people(1)} dân (có ${p.people})` : "",
    works.length < town.buildings ? `${town.buildings} công trình đang hoạt động (có ${works.length})` : "",
    p.way === null ? "lối về thủ đô" : "",
  ].filter(Boolean);
  const cityMiss = [
    p.people < people(2) ? `${people(2)} dân (có ${p.people})` : "",
    works.length < city.buildings ? `${city.buildings} công trình đang hoạt động (có ${works.length})` : "",
    market ? "" : "một Chợ",
    p.capital || p.way === "road" ? "" : "đường bộ nối về thủ đô",
    eraIndex(n) >= city.era ? "" : "thời Đồ Đồng",
  ].filter(Boolean);
  const tier = townMiss.length ? 0 : cityMiss.length ? 1 : 2;
  return { tier, missing: tier === 0 ? townMiss : tier === 1 ? cityMiss : [], works: works.length, market };
}

/** Once a turn (with the provinces' moods): each centre grows or shrinks to the tier its province supports. */
export function urbanTurn(world: World, n: Nation, provs: Province[], say: Say): void {
  const u = urban(n), seen = new Set<string>();
  for (const p of provs) {
    const k = String(p.centre); seen.add(k);
    const was = u[k]?.tier ?? 0, now = urbanNeeds(world, n, p).tier;
    if (now === was) continue;
    u[k] = { ...(u[k] ?? { since: world.tick }), tier: now, since: world.tick };
    if (now > was) {
      n.lastEvents.push(`${p.name} lớn lên thành ${TIER_VI[now].toLowerCase()} (${p.people} dân).${u[k].focus ? "" : " Có thể đặt trọng tâm cho nó (city_focus)."}`);
      say(n.id, "city", `${p.name} của ${n.name} trở thành ${TIER_VI[now].toLowerCase()}.`);
    } else n.lastEvents.push(`${p.name} sa sút, chỉ còn là ${TIER_VI[now].toLowerCase()}.`);
  }
  for (const k of Object.keys(u)) if (!seen.has(k)) delete u[k]; // a centre lost or moved
}

/** The share a centre's tier and focus give in one field. */
function gift(x: Urban, field: "coin" | "rp" | "craft" | "stability" | "calm"): number {
  if (!x.tier) return 0;
  const base = (x.tier === 2 ? URBAN.city : URBAN.town).gives[field] ?? 0;
  const f = x.focus && URBAN.focus[x.focus];
  return f && f.field === field ? (base || (x.tier === 2 ? f.city : f.town)) * (base ? f.mult : 1) : base;
}
const each = (n: Nation) => Object.values(n.urban ?? {});

/** What the nation's towns and cities add to its powers (called from mods). */
export function urbanMods(n: Nation, m: Mods): void {
  for (const x of each(n)) {
    m.rp += gift(x, "rp");
    m.role.craft = (m.role.craft || 0) + gift(x, "craft");
    m.stabilityPerTick += gift(x, "stability");
  }
}
/** Coin the towns and cities pay the treasury a turn. */
export const urbanCoin = (n: Nation) => each(n).reduce((s, x) => s + gift(x, "coin"), 0);
/** How much a garrisoned town or city calms its province a turn. */
export const urbanCalm = (n: Nation, centre: number) => { const x = n.urban?.[String(centre)]; return x ? gift(x, "calm") : 0; };

/** The order "city_focus": what a town or city works at most. */
export function setFocus(n: Nation, a: Record<string, unknown>, parseTile: (v: unknown) => number): string | null {
  const raw = a.centre ?? a.settlement ?? a.city ?? a.tile, name = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const c = name ? (n.capitalName.toLowerCase() === name ? n.capital : n.settlements.find(s => s.name.toLowerCase() === name)?.tile ?? -1) : parseTile(raw);
  if (c < 0) return `Cần centre: tên thủ đô hay điểm định cư (${[n.capitalName, ...n.settlements.map(s => s.name)].join(", ")}), hoặc tile [cột, hàng]`;
  const place = c === n.capital ? n.capitalName : n.settlements.find(s => s.tile === c)?.name ?? "nơi ấy";
  const x = n.urban?.[String(c)];
  if (!x?.tier) return "Chỉ thị trấn hay thành phố mới đặt trọng tâm được; nơi này còn là làng";
  const f = String(a.focus ?? "") as Focus;
  if (!(f in URBAN.focus)) return `focus phải là: ${Object.keys(URBAN.focus).join(", ")}`;
  if (x.focus === f) return "Trọng tâm không đổi";
  x.focus = f;
  n.lastEvents.push(`${TIER_VI[x.tier]} ${place} nay lấy ${FOCUS_VI[f]} làm trọng tâm.`);
  return null;
}

/** The towns and cities as the nation sees them. */
export function urbanView(world: World, n: Nation, provs: Province[]) {
  return provs.map(p => {
    const x = n.urban?.[String(p.centre)], need = urbanNeeds(world, n, p), tier = x?.tier ?? 0;
    const next = tier >= 2 ? undefined : need.tier > tier ? `đủ điều kiện lên ${TIER_VI[tier + 1].toLowerCase()} ở lượt tới` : `${TIER_VI[tier + 1]} cần: ${need.missing.join(", ")}`;
    return { centre: p.name, tile: p.centre, tier: TIER_VI[tier], focus: x?.focus, people: p.people, works: need.works, next };
  });
}
