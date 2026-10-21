// §4.15 The orders of society. A people is not one mass: farmers, craftsmen, merchants, priests and scholars,
// officials and soldiers each want their own things, and each grows content or restless with what the ruler does.
// A contented order works a little better; a restless one wears on the nation's stability; a bitter one strikes.
// The ruler may win an order back with a grant from the treasury.

import { CLASSES, LIVING, TREASURY } from "./rules.ts";
import { activeWar, warLead } from "./diplomacy.ts";
import { buildingOf } from "./catalog.ts";
import { mods, type Ledger, type Mods } from "./engine.ts";
import { spend } from "./treasury.ts";
import type { Nation, World } from "./types.ts";

type Say = (nation: number | null, kind: string, text: string) => void;
export type Order = "farmers" | "artisans" | "merchants" | "clergy" | "officials" | "soldiers";
export const ORDERS: Order[] = ["farmers", "artisans", "merchants", "clergy", "officials", "soldiers"];
export const ORDER_VI: Record<Order, string> = { farmers: "nông dân", artisans: "thợ thủ công", merchants: "thương nhân", clergy: "tăng lữ, học giả", officials: "quan lại", soldiers: "binh lính" };
const FARM = ["gather", "hunt", "fish", "farm"], CRAFT = ["wood", "stone", "flint", "clay", "mine", "craft", "build"];

/** How many of the people belong to each order now. */
export function orderSizes(world: World, n: Nation): Record<Order, number> {
  const l = n.labor as unknown as Record<string, number>, sum = (ks: string[]) => ks.reduce((s, k) => s + (l[k] || 0), 0);
  const partners = Object.values(n.trades).filter(k => k > 0).length, markets = n.buildings.filter(b => b.done && buildingOf(world, b.type)?.effect.market).length;
  const shrines = n.buildings.filter(b => b.done && ["altar", "temple"].includes(b.type)).length;
  return {
    farmers: sum(FARM), artisans: sum(CRAFT),
    merchants: partners || markets ? partners * 2 + markets * 3 : 0,
    clergy: (l.research || 0) + shrines * 2, officials: (n.officials ?? []).length, soldiers: l.warrior || 0,
  };
}

/** What each order wants this turn, as a target mood and the reasons, from the state of the nation. */
export function orderWants(world: World, n: Nation): Record<Order, { target: number; why: string[] }> {
  const m = mods(world, n), need = Math.max(1, n.population * m.foodPerPerson), food = n.stock.food || 0;
  const tax = n.treasury?.tax ?? TREASURY.tax, heavy = Math.max(0, Math.ceil((tax - TREASURY.fair) / TREASURY.step - 1e-9));
  const wars = world.wars.filter(w => w.end === null && (w.a === n.id || w.b === n.id) && activeWar(world, w.a, w.b));
  const lead = wars.reduce((s, w) => s + warLead(w, n.id), 0);
  const partners = Object.values(n.trades).filter(k => k > 0).length, living = n.living ?? 50;
  const works = n.buildings.some(b => !b.done) || (n.roadWorks?.length ?? 0) > 0;
  const paid = (n.treasury?.last?.out.officials ?? 0) > 0, purse = n.stock.coin || 0;
  const out = {} as Record<Order, { target: number; why: string[] }>;
  const add = (o: Order, base: number, parts: Array<[boolean, number, string]>) => {
    let t = base; const why: string[] = [];
    for (const [on, d, w] of parts) if (on) { t += d; why.push(`${d > 0 ? "+" : "−"}${Math.abs(d)} ${w}`); }
    out[o] = { target: Math.max(0, Math.min(100, t)), why };
  };
  add("farmers", 50, [[food >= need * 1.5, 20, "đủ ăn"], [food < need, -30, "đói"], [heavy > 0, -10 * heavy, "thuế nặng"], [tax <= TREASURY.light, 10, "thuế nhẹ"],
    [n.labor.warrior > Math.max(4, n.population * 0.25), -10, "bị bắt lính nhiều"], [living >= 60, 10, "mức sống cao"]]);
  add("artisans", 50, [[works, 15, "có việc xây dựng"], [living >= LIVING.content - 25, 15, "mức sống khá"], [food < need, -20, "đói"], [heavy > 0, -10, "thuế nặng"]]);
  add("merchants", 40, [[partners > 0, Math.min(30, partners * 10), `${partners} bạn hàng`], [n.buildings.some(b => b.done && buildingOf(world, b.type)?.effect.market), 10, "có chợ"],
    [wars.length > 0, -20, "chiến tranh làm tắc đường buôn"], [(world.marriages ?? []).some(x => !x.broken && x.until > world.tick && (x.a === n.id || x.b === n.id)), 10, "thông gia, buôn không thuế quan"]]);
  add("clergy", 45, [[n.buildings.some(b => b.done && ["altar", "temple"].includes(b.type)), 20, "có đền thờ"], [!!n.festival && world.tick - n.festival.tick < 10, 10, "lễ hội gần đây"],
    [!!n.research, 15, "đang nghiên cứu"], [n.stability < 40, -15, "xã hội bất ổn"]]);
  add("officials", 50, [[paid, 20, "được trả lương bằng tiền"], [(n.officials ?? []).length > 0 && !paid && purse < 1, -25, "ngân khố cạn, không có lương"], [n.stability >= 60, 10, "triều chính yên ổn"]]);
  add("soldiers", 50, [[food >= need * 1.5, 15, "đủ ăn"], [food < need, -20, "đói"], [wars.length > 0 && lead >= 4, 15, "đang thắng trận"], [wars.length > 0 && lead <= -4, -20, "đang thua trận"],
    [purse >= CLASSES.soldierPurse, 10, "ngân khố đủ trả lương"]]);
  return out;
}

const moods = (n: Nation) => (n.classes ??= Object.fromEntries(ORDERS.map(o => [o, CLASSES.start])) as Record<Order, number>);
export const moodOf = (n: Nation, o: Order) => n.classes?.[o] ?? CLASSES.start;
/** An order that is there and bitter enough to down tools. */
export const striking = (world: World, n: Nation, o: Order, size = orderSizes(world, n)[o]) => size > 0 && moodOf(n, o) < CLASSES.strike;

/** End of the turn: each order's mood moves toward what it wants; the restless wear on the nation, the bitter strike. */
export function classPhase(world: World, say: Say): void {
  for (const n of world.nations) {
    if (!n.alive || !n.founded) continue;
    const md = moods(n), sizes = orderSizes(world, n), wants = orderWants(world, n);
    const restless: string[] = [];
    for (const o of ORDERS) {
      const was = md[o], now = Math.round((was + (wants[o].target - was) * CLASSES.pace) * 10) / 10;
      md[o] = now;
      if (!sizes[o]) continue;
      if (now < CLASSES.restless) restless.push(ORDER_VI[o]);
      if (now < CLASSES.strike && was >= CLASSES.strike) {
        n.lastEvents.push(`${ORDER_VI[o][0].toUpperCase()}${ORDER_VI[o].slice(1)} đình công (hài lòng ${Math.round(now)}/100: ${wants[o].why.filter(w => w.startsWith("−")).join(", ") || "bị bỏ mặc"}).`);
        say(n.id, "class", `${ORDER_VI[o][0].toUpperCase()}${ORDER_VI[o].slice(1)} của ${n.name} đình công.`);
      } else if (now >= CLASSES.strike && was < CLASSES.strike) n.lastEvents.push(`${ORDER_VI[o][0].toUpperCase()}${ORDER_VI[o].slice(1)} trở lại làm việc.`);
    }
    if (restless.length) {
      const k = Math.min(CLASSES.maxStability, restless.length);
      n.stability = Math.max(0, n.stability - k);
      n.discontent = Math.min(100, (n.discontent ?? 0) + k);
      n.lastEvents.push(`Các tầng lớp bất bình (${restless.join(", ")}): −${k} ổn định, +${k} bất mãn.`);
    }
  }
}

/** What contented and striking orders add to the nation's powers (called from mods). */
export function classMods(world: World, n: Nation, m: Mods): void {
  if (!n.classes) return;
  const sizes = orderSizes(world, n);
  const level = (o: Order) => (!sizes[o] ? 0 : moodOf(n, o) >= CLASSES.content ? CLASSES.bonus : moodOf(n, o) < CLASSES.strike ? -CLASSES.strikeCut : 0);
  const role = (rs: string[], d: number) => { if (d) for (const r of rs) m.role[r] = (m.role[r] || 0) + d; };
  role(FARM, level("farmers")); role(CRAFT, level("artisans"));
  m.rp += level("clergy"); m.combat += level("soldiers"); m.transport += level("merchants") * 2;
}

/** The order "grant": coin from the treasury to win an order back. */
export function grant(world: World, n: Nation, a: Record<string, unknown>, L: Ledger): string | null {
  const o = String(a.class ?? a.order ?? "") as Order;
  if (!ORDERS.includes(o)) return `class phải là: ${ORDERS.join(", ")}`;
  const coin = Math.floor(Number(a.coin ?? a.amount ?? 0));
  if (!(coin >= 1)) return "Cần coin: số tiền ban (≥ 1)";
  const size = Math.max(CLASSES.grantMinSize, orderSizes(world, n)[o]);
  const md = moods(n), room = 100 - md[o];
  if (room < 1) return `${ORDER_VI[o]} đã rất hài lòng`;
  const pay = Math.min(coin, Math.ceil(room / CLASSES.grantPer * size));
  if (!spend(L, n, pay, "grant")) return `Ngân khố chỉ có ${Math.floor(n.stock.coin || 0)} tiền`;
  const up = Math.min(room, CLASSES.grantMax, pay / size * CLASSES.grantPer);
  md[o] = Math.round((md[o] + up) * 10) / 10;
  n.lastEvents.push(`Ban ${pay} tiền cho ${ORDER_VI[o]}: hài lòng +${Math.round(up)} (${Math.round(md[o])}/100).`);
  return null;
}

/** The orders as the nation sees them. */
export function classView(world: World, n: Nation) {
  const sizes = orderSizes(world, n), wants = orderWants(world, n);
  return ORDERS.filter(o => sizes[o] > 0).map(o => ({ class: o, name: ORDER_VI[o], size: sizes[o], mood: Math.round(moodOf(n, o)), heading_to: wants[o].target, because: wants[o].why, strike: moodOf(n, o) < CLASSES.strike || undefined }));
}
