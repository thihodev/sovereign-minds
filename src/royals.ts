// §4.14 The royal house and marriages. The ruler is the AI that governs the nation; its house is the court's kin:
// princes and princesses born now and then, given in marriage to another court with a dowry. A marriage binds two
// nations for a generation: their border calms, they pay no duties to each other, and the side that makes war on
// its in-laws is shamed before the world.

import { ROYALS } from "./rules.ts";
import { pickOne, rngFor } from "./rng.ts";
import { borderOf } from "./border.ts";
import type { Ledger } from "./engine.ts";
import type { Nation, World } from "./types.ts";

type Say = (nation: number | null, kind: string, text: string) => void;
export interface Royal { id: number; name: string; sex: "m" | "f"; born: number; dies: number; /** the nation they came from, when married in */ from?: number }
export interface Marriage { id: number; a: number; b: number; tick: number; until: number; /** who went to which court */ bride: string; from: number; to: number; broken?: number }
export interface MarriageOffer { id: number; from: number; to: number; royal: number; dowry: Record<string, number>; tick: number; status: "open" | "done" | "expired" }

const title = (r: Royal) => (r.sex === "m" ? "Hoàng tử" : "Công chúa");
export const royalName = (r: Royal) => `${title(r)} ${r.name}`;
const unwed = (n: Nation, tick: number) => (n.royals ?? []).filter(r => r.dies > tick && r.from === undefined);

/** The marriage that binds two nations now, if any. */
export function bond(world: World, a: number, b: number): Marriage | undefined {
  return (world.marriages ?? []).find(m => !m.broken && m.until > world.tick && ((m.a === a && m.b === b) || (m.a === b && m.b === a)));
}
export const inLaws = (world: World, a: number, b: number) => !!bond(world, a, b);

/** Each turn: royals born and passing; bonds calm their borders; a war on in-laws shames its maker. */
export function royalPhase(world: World, say: Say): void {
  const tick = world.tick;
  for (const n of world.nations) {
    if (!n.alive || !n.founded) continue;
    const r = rngFor(world.seed, tick, "royal", n.id);
    n.house ??= pickOne(ROYALS.houses, r);
    n.royals = (n.royals ?? []).filter(x => x.dies > tick);
    if (unwed(n, tick).length < ROYALS.maxUnwed && (n.royals.length === 0 || r() < ROYALS.birth * (n.stability >= 40 ? 1 : 0.5))) {
      const sex = r() < 0.5 ? "m" : "f";
      const x: Royal = { id: world.nextId++, name: `${n.house} ${pickOne(sex === "m" ? ROYALS.sons : ROYALS.daughters, r)}`, sex, born: tick, dies: tick + ROYALS.life[0] + Math.floor(r() * (ROYALS.life[1] - ROYALS.life[0] + 1)) };
      n.royals.push(x);
      if (tick > 0) n.lastEvents.push(`Hoàng tộc ${n.house} có thêm ${royalName(x)}: có thể gả sang nước khác để kết thông gia (royal_marriage).`);
    }
  }
  for (const m of world.marriages ?? []) {
    if (m.broken || m.until <= tick) continue;
    const A = world.nations[m.a], B = world.nations[m.b];
    if (!A?.alive || !B?.alive) { m.broken = tick; continue; }
    const st = borderOf(world, m.a, m.b); st.tension = Math.max(0, st.tension - ROYALS.calm);
    // a war between in-laws: the one who declared it breaks the bond and is shamed
    const w = world.wars.find(x => x.declared >= m.tick && x.declared >= tick - 1 && ((x.a === m.a && x.b === m.b) || (x.a === m.b && x.b === m.a)));
    if (w) {
      const maker = world.nations[w.a], other = world.nations[w.b];
      m.broken = tick;
      maker.reputation = Math.max(0, maker.reputation - ROYALS.breach.reputation);
      maker.stability = Math.max(0, maker.stability - ROYALS.breach.stability);
      maker.lastEvents.push(`Ta tuyên chiến với thông gia ${other.name}: mối hôn nhân tan vỡ, thiên hạ chê trách (−${ROYALS.breach.reputation} uy tín, −${ROYALS.breach.stability} ổn định).`);
      other.lastEvents.push(`${maker.name} trở mặt với thông gia, tuyên chiến với ta: mối hôn nhân hoàng tộc tan vỡ.`);
      say(maker.id, "royal", `${maker.name} phản bội thông gia ${other.name}; mối lương duyên ${m.bride} tan vỡ.`);
    } else if (m.until === tick + 1) {
      for (const x of [A, B]) x.lastEvents.push(`Mối thông gia với ${(x === A ? B : A).name} (${m.bride}) đã qua một thế hệ: hết hiệu lực từ lượt sau. Kết thông gia lần nữa để giữ tình thân.`);
    }
  }
  for (const o of world.marriageOffers ?? []) if (o.status === "open" && tick - o.tick > ROYALS.offerTicks) o.status = "expired";
  world.marriageOffers = (world.marriageOffers ?? []).filter(o => tick - o.tick <= 20);
  world.marriages = (world.marriages ?? []).filter(m => tick - Math.max(m.until, m.broken ?? 0) <= 60);
}

/** The order "royal_marriage": offer a prince or princess, with a dowry, to the court of a nation you know. */
export function offerMarriage(world: World, n: Nation, a: Record<string, unknown>, find: (to: unknown) => Nation | string, atWar: (x: number, y: number) => boolean): string | null {
  const o = find(a.to ?? a.target); if (typeof o === "string") return o;
  if (atWar(n.id, o.id)) return `Đang chiến tranh với ${o.name}: hãy giảng hòa trước`;
  if (bond(world, n.id, o.id)) return `Đã là thông gia với ${o.name} tới lượt ${bond(world, n.id, o.id)!.until}`;
  const free = unwed(n, world.tick);
  const id = a.royal === undefined ? free[0]?.id : Math.floor(Number(a.royal));
  const x = free.find(r => r.id === id);
  if (!x) return free.length ? `Không có hoàng thân #${id}; còn: ${free.map(r => `#${r.id} ${royalName(r)}`).join(", ")}` : "Hoàng tộc chưa có ai đến tuổi gả cưới";
  const dowry: Record<string, number> = {};
  for (const [k, q] of Object.entries((a.dowry ?? {}) as Record<string, unknown>)) { const v = Math.floor(Number(q)); if (v > 0) dowry[k] = v; }
  if (!Object.entries(dowry).every(([k, q]) => (n.stock[k] || 0) >= q)) return "Kho không đủ của hồi môn";
  if ((world.marriageOffers ?? []).some(m => m.status === "open" && m.royal === x.id)) return `${royalName(x)} đã được hứa gả`;
  const off: MarriageOffer = { id: world.nextId++, from: n.id, to: o.id, royal: x.id, dowry, tick: world.tick, status: "open" };
  (world.marriageOffers ??= []).push(off);
  const gift = Object.entries(dowry).map(([k, q]) => `${q} ${k}`).join(", ");
  o.lastEvents.push(`${n.name} cầu hôn: gả ${royalName(x)} sang triều ta${gift ? `, hồi môn ${gift}` : ""} (#${off.id}). Nhận lời bằng accept_marriage trong ${ROYALS.offerTicks} lượt.`);
  n.lastEvents.push(`Đã ngỏ ý gả ${royalName(x)} sang ${o.name} (#${off.id}).`);
  return null;
}

/** The order "accept_marriage": take the prince or princess in; the two courts become in-laws. */
export function acceptMarriage(world: World, n: Nation, a: Record<string, unknown>, L: Ledger, atWar: (x: number, y: number) => boolean, say: Say): string | null {
  const id = Math.floor(Number(a.offer ?? a.id));
  const off = (world.marriageOffers ?? []).find(x => x.id === id);
  if (!off || off.to !== n.id) return `Không có lời cầu hôn #${id} gửi cho bạn`;
  if (off.status !== "open" || world.tick - off.tick > ROYALS.offerTicks) return "Lời cầu hôn đã hết hạn";
  const from = world.nations[off.from];
  if (!from.alive) { off.status = "expired"; return "Nước cầu hôn không còn"; }
  if (atWar(n.id, from.id)) return `Đang chiến tranh với ${from.name}`;
  if (bond(world, n.id, from.id)) return `Đã là thông gia với ${from.name}`;
  const x = unwed(from, world.tick).find(r => r.id === off.royal);
  if (!x) { off.status = "expired"; return "Người được hứa gả không còn"; }
  const short = Object.entries(off.dowry).find(([k, q]) => (from.stock[k] || 0) < q);
  for (const [k, q] of Object.entries(off.dowry)) { const v = Math.min(q, from.stock[k] || 0); if (v > 0) { L.stock(from, k, -v, "trade"); L.stock(n, k, v, "trade"); } }
  off.status = "done";
  from.royals = (from.royals ?? []).filter(r => r !== x);
  (n.royals ??= []).push({ ...x, from: from.id });
  const m: Marriage = { id: world.nextId++, a: from.id, b: n.id, tick: world.tick, until: world.tick + ROYALS.bond, bride: royalName(x), from: from.id, to: n.id };
  (world.marriages ??= []).push(m);
  for (const y of [from, n]) { y.reputation = Math.min(100, y.reputation + ROYALS.reputation); y.stability = Math.min(100, y.stability + ROYALS.stability); }
  const line = `${royalName(x)} của ${from.name} về làm ${x.sex === "m" ? "rể" : "dâu"} triều ${n.name}: hai nước thành thông gia tới lượt ${m.until}${short ? " (hồi môn không đủ như đã hứa)" : ""}.`;
  from.lastEvents.push(line); n.lastEvents.push(line);
  say(n.id, "royal", `Lương duyên hoàng tộc: ${royalName(x)} của ${from.name} kết duyên với triều ${n.name}.`);
  return null;
}

/** The royal house as a nation sees it. */
export function royalsView(world: World, n: Nation) {
  const tick = world.tick;
  const inl = (world.marriages ?? []).filter(m => !m.broken && m.until > tick && (m.a === n.id || m.b === n.id));
  const offers = (world.marriageOffers ?? []).filter(o => o.status === "open" && o.to === n.id);
  return {
    house: n.house,
    unwed: unwed(n, tick).map(r => ({ id: r.id, name: royalName(r), born: r.born })),
    married_in: (n.royals ?? []).filter(r => r.dies > tick && r.from !== undefined).map(r => ({ name: royalName(r), from: world.nations[r.from!]?.name })),
    in_laws: inl.length ? inl.map(m => ({ nation: world.nations[m.a === n.id ? m.b : m.a].name, bride: m.bride, until: m.until })) : undefined,
    marriage_offers_to_you: offers.length ? offers.map(o => ({ offer: o.id, from: world.nations[o.from].name, royal: royalName(world.nations[o.from].royals!.find(r => r.id === o.royal) ?? { id: 0, name: "?", sex: "m", born: 0, dies: 0 }), dowry: o.dowry })) : undefined,
  };
}
