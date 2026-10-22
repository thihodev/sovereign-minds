// §4.13 The treasury. A nation's coin ("coin", a good in its stock like any other, always worth 1 food) comes from
// the taxes its people pay on what they make and sell, the duties foreign merchants pay at its border and on its
// roads, and the public works that earn while they stand: markets, piers, harbours, roads. The treasury pays the
// officials, buys the common materials the builders lack, and hires hands for a work or scholars for a study.

import { TRADE, TREASURY } from "./rules.ts";
import { buildingOf } from "./catalog.ts";
import { buildingWorks, researchPoints, roadNet, type Ledger } from "./engine.ts";
import { price } from "./market.ts";
import { inLaws } from "./royals.ts";
import { urbanCoin } from "./urban.ts";
import { striking } from "./classes.ts";
import { homeMarket } from "./compact.ts";
import type { Nation, World } from "./types.ts";

type Say = (nation: number | null, kind: string, text: string) => void;
export type Book = Record<string, number>;
export interface Treasury { tax: number; tariff: number; now: { in: Book; out: Book }; last?: { in: Book; out: Book; coin: number }; /** the founding purse was given */ started?: boolean;
  /** what invest bought this turn (capped) */ used?: { tick: number; rp: number; work: number } }

/** The words for each line of the treasury's books. */
export const LINE_VI: Record<string, string> = {
  tax: "thuế sản xuất", market: "thuế chợ biên giới", tariff: "thuế quan hàng nhập", toll: "phí qua đất", works: "công trình công cộng", roads: "phí đường",
  cities: "thuế thị trấn, thành phố", trade: "nhận qua buôn bán, quà", officials: "lương quan lại", buy: "mua vật liệu", hire: "thuê nhân công", study: "nuôi học giả", duty: "thuế quan nộp nước khác", grant: "ban ơn các tầng lớp", tribute: "cống nạp (theo hiệp ước)", power: "vận hành nhà máy điện", air: "vận hành sân bay", start: "vốn lập quốc", leak: "thất thoát (kho đầy, quan lại tham ô)",
};

export const coin = (n: Nation) => n.stock.coin || 0;
export function treasuryOf(n: Nation): Treasury {
  return (n.treasury ??= { tax: TREASURY.tax, tariff: TRADE.toll, now: { in: {}, out: {} } }) as Treasury;
}
/** Note a line in this turn's books (does not move the coin: the Ledger does). */
export function book(n: Nation, side: "in" | "out", line: string, amount: number): void {
  if (amount <= 0) return;
  const b = treasuryOf(n).now[side];
  b[line] = Math.round(((b[line] || 0) + amount) * 100) / 100;
}
/** Coin from one nation's treasury to another's, as much as there is; returns what was paid. */
export function payCoin(L: Ledger, from: Nation, to: Nation, amount: number, line: string, toLine = line): number {
  const paid = Math.floor(Math.min(amount, coin(from)) * 10) / 10;
  if (paid <= 0) return 0;
  L.stock(from, "coin", -paid, "tariff"); L.stock(to, "coin", paid, "tariff");
  book(from, "out", line, paid); book(to, "in", toLine, paid);
  return paid;
}
/** Coin the treasury spends at home; false if it has not enough. */
export function spend(L: Ledger, n: Nation, amount: number, line: string): boolean {
  if (amount <= 0) return true;
  if (coin(n) < amount - 1e-9) return false;
  L.stock(n, "coin", -amount, "treasury"); book(n, "out", line, amount);
  return true;
}
const earn = (L: Ledger, n: Nation, amount: number, line: string) => {
  const x = Math.round(amount * 100) / 100;
  if (x <= 0) return;
  L.stock(n, "coin", x, "tax"); book(n, "in", line, x);
};

/** §4.13 The border market: the treasury takes its share of what its merchants sold. */
export function marketTax(L: Ledger, n: Nation, sold: number): void { earn(L, n, sold * TREASURY.marketTax, "market"); }
/** No duties between allies, nor between an overlord and its vassal. */
function freeTrade(world: World, a: number, b: number): boolean {
  return inLaws(world, a, b) || world.treaties.some(t => t.active && TREASURY.freeTrade.includes(t.type) && ((t.a === a && t.b === b) || (t.a === b && t.b === a))); // §4.14 in-laws too
}
const value = (world: World, g: Record<string, number>) => Object.entries(g).reduce((s, [k, q]) => s + (k === "coin" ? 0 : q * price(world, k)), 0);

/** §4.13 Goods from `from` reach `to`: the merchants of `from` pay `to`'s import duty in coin, as much as they have. */
export function importDuty(world: World, L: Ledger, from: Nation, to: Nation, goods: Record<string, number>): number {
  if (from.id === to.id || !to.alive || freeTrade(world, from.id, to.id)) return 0;
  const rate = treasuryOf(to).tariff, due = value(world, goods) * rate;
  return due >= 0.1 ? payCoin(L, from, to, due, "duty", "tariff") : 0;
}
/** §4.13 A caravan crosses a third nation's land: the toll it asks, as a share of the goods (its tariff). */
export function tollRate(n: Nation): number { return treasuryOf(n).tariff; }
/** The toll in coin instead of goods, when the sender's treasury has it; returns true if paid so. */
export function tollInCoin(world: World, L: Ledger, from: Nation, toller: Nation, goods: Record<string, number>, rate = tollRate(toller)): number {
  const due = Math.round(value(world, goods) * rate * 10) / 10;
  if (due < 0.1 || coin(from) < due) return 0;
  return payCoin(L, from, toller, due, "duty", "toll");
}

/** What a market (§4.13) brings in a turn: its base, a share of the people, and each trading partner. */
function workIncome(world: World, n: Nation): number {
  let sum = 0;
  const partners = Object.values(n.trades).filter(k => k > 0).length;
  for (const b of n.buildings) {
    if (!buildingWorks(world, b)) continue;
    const e = buildingOf(world, b.type)?.effect; if (!e?.income) continue;
    sum += e.income + (e.market ? n.population * TREASURY.marketPerPerson + partners * TREASURY.marketPerPartner : 0);
  }
  return sum;
}
/** The common materials the treasury can buy for a work, and what they cost now. */
export function buyCost(world: World, n: Nation, cost: Record<string, number>): { short: Record<string, number>; coin: number; locked: string[] } {
  const short: Record<string, number> = {}, locked: string[] = [];
  let c = 0;
  for (const [k, q] of Object.entries(cost)) {
    const lack = q - (n.stock[k] || 0);
    if (lack <= 1e-9) continue;
    if (!TREASURY.buyable.includes(k)) { locked.push(k); continue; }
    short[k] = lack; c += lack * price(world, k) * TREASURY.markup;
  }
  return { short, coin: Math.ceil(c * 10) / 10, locked };
}
/** Buy the shortfall of common materials with the treasury's coin; the goods come in and are used at once. */
export function buyShortfall(world: World, L: Ledger, n: Nation, cost: Record<string, number>): string | null {
  const b = buyCost(world, n, cost);
  if (b.locked.length || !Object.keys(b.short).length) return null;
  if (!spend(L, n, b.coin, "buy")) return null;
  for (const [k, q] of Object.entries(b.short)) L.stock(n, k, q, "bought");
  n.lastEvents.push(`Ngân khố bỏ ${b.coin} tiền mua ${Object.entries(b.short).map(([k, q]) => `${Math.round(q * 10) / 10} ${k}`).join(", ")} cho công trình.`);
  return null;
}

/** The order "tax": the share of what the people make that they pay, and the duty on what comes from abroad. */
export function setTax(n: Nation, a: Record<string, unknown>): string | null {
  const t = treasuryOf(n);
  const rate = a.rate ?? a.tax, duty = a.tariff;
  if (rate === undefined && duty === undefined) return "Cần rate (thuế sản xuất 0–0.4) và/hoặc tariff (thuế quan 0–0.5)";
  const r = rate === undefined ? t.tax : Number(rate), d = duty === undefined ? t.tariff : Number(duty);
  if (!(r >= 0 && r <= TREASURY.taxMax)) return `rate phải từ 0 tới ${TREASURY.taxMax}`;
  if (!(d >= 0 && d <= TREASURY.tariffMax)) return `tariff phải từ 0 tới ${TREASURY.tariffMax}`;
  t.tax = Math.round(r * 100) / 100; t.tariff = Math.round(d * 100) / 100;
  n.lastEvents.push(`Định lại thuế: thuế sản xuất ${Math.round(t.tax * 100)}%, thuế quan ${Math.round(t.tariff * 100)}%.`);
  return null;
}

/** The order "invest": the treasury hires hands for a work in progress, or keeps scholars for the current study. */
export function invest(world: World, L: Ledger, n: Nation, a: Record<string, unknown>, rpCost: () => number | null, say: Say): string | null {
  const what = String(a.in ?? a.target ?? "building"), amount = Math.floor(Number(a.amount ?? a.coin ?? 0));
  if (!(amount >= 1)) return "Cần amount: số tiền bỏ ra (≥ 1)";
  if (coin(n) < amount) return `Ngân khố chỉ có ${Math.floor(coin(n))} tiền`;
  const t = treasuryOf(n), used = t.used?.tick === world.tick ? t.used : (t.used = { tick: world.tick, rp: 0, work: 0 });
  if (what === "research") {
    if (!n.research) return "Chưa nghiên cứu gì";
    const left = rpCost(); if (left === null) return "Nghiên cứu này không còn";
    const cap = Math.max(TREASURY.studyMin, researchPoints(n.labor.research) * TREASURY.studyShare) - used.rp;
    if (cap <= 0.05) return `Lượt này ngân khố đã nuôi đủ học giả (tối đa ${Math.round(Math.max(TREASURY.studyMin, researchPoints(n.labor.research) * TREASURY.studyShare))} RP: ${TREASURY.studyShare * 100}% RP của người nghiên cứu)`;
    const room = Math.max(0, left - n.research.progress), rp = Math.min(room, cap, amount / TREASURY.coinPerRP);
    if (rp <= 0) return "Nghiên cứu này đã đủ điểm";
    used.rp += rp;
    const pay = Math.ceil(rp * TREASURY.coinPerRP);
    spend(L, n, pay, "study"); n.research.progress += rp;
    n.lastEvents.push(`Ngân khố bỏ ${pay} tiền nuôi học giả: +${Math.round(rp * 10) / 10} RP cho ${n.research.id}.`);
    return null;
  }
  if (what !== "building") return 'in phải là "building" hoặc "research"';
  const id = a.building === undefined ? null : Math.floor(Number(a.building));
  const b = n.buildings.find(x => !x.done && (id === null || x.id === id));
  if (!b) return id === null ? "Không có công trình nào đang xây" : `Không có công trình #${id} đang xây`;
  const cap = Math.max(TREASURY.hireMin, n.labor.build * TREASURY.hireShare) - used.work;
  if (cap <= 0.05) return `Lượt này đã thuê đủ thợ (tối đa ${Math.round(Math.max(TREASURY.hireMin, n.labor.build * TREASURY.hireShare))} công: thêm ${TREASURY.hireShare * 100}% sức thợ xây của nước)`;
  const def = buildingOf(world, b.type)!, left = def.work - b.progress, work = Math.min(left, cap, amount / TREASURY.coinPerWork);
  used.work += work;
  const pay = Math.ceil(work * TREASURY.coinPerWork * 10) / 10;
  spend(L, n, pay, "hire"); b.progress += work;
  n.lastEvents.push(`Ngân khố bỏ ${pay} tiền thuê thợ cho ${def.name}: +${Math.round(work * 10) / 10} công.`);
  if (b.progress >= def.work - 1e-9) { b.done = true; n.lastEvents.push(`Hoàn thành ${def.name}.`); say(n.id, "build", `${n.name} xây xong ${def.name} bằng tiền ngân khố.`); }
  return null;
}

/** End of the turn: taxes on what was made, the earnings of public works and roads; the books close. */
export function treasuryPhase(world: World, L: Ledger): void {
  for (const n of world.nations) {
    if (!n.alive || !n.founded) continue;
    const t = treasuryOf(n);
    if (!t.started) { t.started = true; earn(L, n, TREASURY.start, "start"); }
    // what the people made this turn, at world prices
    const made = L.byNation.get(n.id) ?? {};
    let base = 0;
    for (const [g, [m]] of Object.entries(made)) if (g !== "coin" && m > 0) base += m * price(world, g);
    earn(L, n, base * t.tax * (striking(world, n, "officials") ? 0.5 : 1) * (1 + homeMarket(world, n)), "tax"); // §4.15 striking officials collect half; §2.3b one home market
    earn(L, n, workIncome(world, n), "works");
    earn(L, n, urbanCoin(n), "cities"); // §2.13 towns and cities pay their dues
    if ((n.roadWorks?.length ?? 0) || world.tiles.some(x => x.owner === n.id && (x.road || 0) > 0)) {
      const net = roadNet(world, n).tiles;
      earn(L, n, net * TREASURY.roadToll, "roads");
    }
    // a full treasury tempts the clerks: a share of what lies above the safe sum goes missing each turn
    const idle = coin(n) - TREASURY.safe;
    if (idle > 0) { const lost = Math.round(idle * TREASURY.leak * 100) / 100; if (lost > 0) { L.stock(n, "coin", -lost, "treasury"); book(n, "out", "leak", lost); } }
    // a heavy tax wears on the people; a light one is welcome
    if (t.tax > TREASURY.fair + 1e-9) {
      const k = Math.ceil((t.tax - TREASURY.fair) / TREASURY.step - 1e-9);
      n.stability = Math.max(0, n.stability - k);
      n.discontent = Math.min(100, (n.discontent ?? 0) + k * TREASURY.discontent);
      n.lastEvents.push(`Thuế sản xuất ${Math.round(t.tax * 100)}% nặng hơn mức dân chịu được (${Math.round(TREASURY.fair * 100)}%): −${k} ổn định.`);
    } else if (t.tax <= TREASURY.light + 1e-9) n.stability = Math.min(100, n.stability + 1);
    t.last = { in: t.now.in, out: t.now.out, coin: Math.round(coin(n) * 10) / 10 };
    t.now = { in: {}, out: {} };
  }
}

/** The treasury as the nations see it. */
export function treasuryView(world: World, n: Nation) {
  const t = treasuryOf(n), sum = (b: Book) => Math.round(Object.values(b).reduce((s, v) => s + v, 0) * 10) / 10;
  const known = n.met.map(id => world.nations[id]).filter(o => o?.alive && o.founded);
  return {
    coin: Math.round(coin(n) * 10) / 10, tax_rate: t.tax, tariff: t.tariff,
    last_turn: t.last ? { income: t.last.in, spending: t.last.out, net: Math.round((sum(t.last.in) - sum(t.last.out)) * 10) / 10 } : undefined,
    others_tariffs: known.length ? Object.fromEntries(known.map(o => [o.name, freeTrade(world, n.id, o.id) ? 0 : treasuryOf(o).tariff])) : undefined,
    public_works_income: Math.round(workIncome(world, n) * 10) / 10,
  };
}
