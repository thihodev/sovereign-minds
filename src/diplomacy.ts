// §7 Relations between nations: messages, treaties, trade, war, vassals.
// Called by engine.step(); everything here is deterministic.

import { book, importDuty, tollInCoin, tollRate } from "./treasury.ts";
import { NEIGHBORS, col, row, dist, within } from "./hex.ts";
import { rngFor } from "./rng.ts";
import { fx, fxDeath } from "./fx.ts";
import {
  TRUCE,
  BORDER,
  COMPACT, GESTURES, HAMLET, INJECTION, KIN, LAND, ROADS, MESSAGE_MAX, OFFICIALS, RIVER, SEA, SHARED_LANGUAGE_TRADES, TERRAIN, TRADE, TREATY, TREATY_NAME, TREATY_TYPES, WAR,
} from "./rules.ts";
import { busy, piers, planRoute, roadOf } from "./routes.ts";
import { liveHordes } from "./wild.ts";
import { borderLength, borderOf } from "./border.ts";
import { aidCivilWar, civilShare } from "./civil.ts";
import { isInterior } from "./compact.ts";
import { militiaAt, reachAt } from "./hold.ts";
import { quarantined } from "./contagion.ts";
import { add, part, take, add as addPeople, take as takePeople } from "./people.ts";
import { noteExodus } from "./exodus.ts";
import { buildingOf, goodName, knownGood, recipeOf } from "./catalog.ts";
import type { Ledger } from "./engine.ts";
import { buildingWorks, mods, ownedTiles, parseTile, roadToCapital, workers } from "./engine.ts";
import { worth } from "./market.ts";
import type { Battle, Caravan, Nation, Treaty, TreatyType, War, WarSide, WarTalk, World } from "./types.ts";
import type { Route } from "./routes.ts";

export type Say = (nation: number | null, kind: string, text: string) => void;
/** kind "wild" (§9.4 clear_wild) only reserves the men for the turn; it is never fought here. */
export interface Strike { n: Nation; target: Nation; tile: number; warriors: number; kind: "attack" | "raid" | "wild" }
export interface DiploCtx { world: World; tick: number; L: Ledger; say: Say; strikes: Strike[]; sent: Set<string>; accepts: Array<{ n: Nation; offer: number }>; treatyAccepts: Array<{ n: Nation; offer: number }> }

// ---------------------------------------------------------------- relations

export function activeWar(world: World, a: number, b: number): War | undefined {
  return world.wars.find(w => w.end === null && w.start <= world.tick && ((w.a === a && w.b === b) || (w.a === b && w.b === a)));
}
export function pendingOrActiveWar(world: World, a: number, b: number): War | undefined {
  return world.wars.find(w => w.end === null && ((w.a === a && w.b === b) || (w.a === b && w.b === a)));
}
export function treatiesBetween(world: World, a: number, b: number, types?: TreatyType[]): Treaty[] {
  return world.treaties.filter(t => t.active && ((t.a === a && t.b === b) || (t.a === b && t.b === a)) && (!types || types.includes(t.type)));
}
export function overlordOf(world: World, n: number): number | null {
  const t = world.treaties.find(x => x.active && x.type === "vassal" && x.a === n);
  return t ? t.b : null;
}
export function relation(world: World, a: number, b: number): string {
  if (activeWar(world, a, b)) return "chiến tranh";
  if (pendingOrActiveWar(world, a, b)) return "sắp chiến tranh";
  const t = treatiesBetween(world, a, b);
  if (t.some(x => x.type === "vassal")) return overlordOf(world, a) === b ? "chư hầu của họ" : "tông chủ của họ";
  if (t.some(x => x.type === "alliance")) return "liên minh";
  if (t.some(x => x.type === "peace")) return "hòa bình";
  if (kin(world.nations[a], world.nations[b])) return "thù địch"; // §4.5 one betrayed the other
  if (t.some(x => x.type === "non_aggression")) return "bất tương xâm";
  return world.nations[a].met.includes(b) ? "đã gặp" : "chưa biết";
}
/** An offer, treaty or faction number as the AI wrote it: 3216, "3216", "#3216", "đề nghị #3216". */
export function idOf(v: unknown): number { const m = String(v ?? "").match(/\d+/); return m ? Number(m[0]) : NaN; }
export function sharedLanguage(world: World, a: Nation, b: Nation): boolean {
  if (kin(a, b)) return true; // §4.5 they were one people: they speak one tongue
  return (mods(world, a).caps.has("ghi-chép") && mods(world, b).caps.has("ghi-chép")) || (a.trades[String(b.id)] || 0) >= SHARED_LANGUAGE_TRADES;
}
/** Shortest distance between two nations' lands. */
export function landGap(world: World, a: number, b: number): number {
  const A = ownedTiles(world, a), B = ownedTiles(world, b);
  let best = Infinity;
  for (const x of A) for (const y of B) { const d = dist(x.i, y.i); if (d < best) best = d; }
  return best;
}
function allies(world: World, n: number): number[] {
  const out = new Set<number>();
  for (const t of world.treaties) {
    if (!t.active) continue;
    if (t.type === "alliance") { if (t.a === n) out.add(t.b); if (t.b === n) out.add(t.a); }
    if (t.type === "vassal" && t.a === n) out.add(t.b); // the overlord defends its vassal
  }
  return [...out];
}

function goods(world: World, raw: unknown, max: number): Record<string, number> | string {
  if (!raw || typeof raw !== "object") return "Thiếu danh sách hàng";
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const q = Math.floor(Number(v));
    if (!knownGood(world, k)) return `Không có loại hàng "${k}"`;
    if (!(q >= 1 && q <= max)) return `Số lượng ${k} phải 1–${max}`;
    out[k] = q;
  }
  return Object.keys(out).length ? out : "Danh sách hàng trống";
}
const has = (n: Nation, g: Record<string, number>) => Object.entries(g).every(([k, q]) => (n.stock[k] || 0) >= q - 1e-9);
export function findTarget(world: World, n: Nation, v: unknown): Nation | string {
  const o = typeof v === "number" ? world.nations[v] : world.nations.find(x => x.founded && x.name.toLowerCase() === String(v ?? "").trim().toLowerCase());
  if (!o || o.id === n.id) return "Không tìm thấy quốc gia đó";
  if (!o.alive) return `${o.name} đã diệt vong`;
  if (!n.met.includes(o.id)) return `Chưa gặp ${o.name}`;
  return o;
}

/** §9.5 Why no goods may pass between two peoples while one of them is in quarantine, or null. */
/** §7.9 Truce-market trades the two hostile kin have left in this window (they may trade that many times without peace). */
export function truceLeft(world: World, a: number, b: number): number {
  const st = borderOf(world, a, b);
  return Math.max(0, TRUCE.max - (st.truce ?? []).filter(t => world.tick - t < TRUCE.window).length);
}
function closedFor(world: World, n: Nation, o: Nation): string | null {
  if (hostile(world, n, o) && truceLeft(world, n.id, o.id) <= 0) return `${o.name} ${o.origin?.from === n.id ? "là kẻ phản bội đã tách khỏi nước bạn" : "coi nước bạn là kẻ phản bội"}: hai nước thù địch. Đã hết ${TRUCE.max} phiên chợ đình chiến trong ${TRUCE.window} lượt; muốn buôn bán thêm thì ký hòa bình (peace) hoặc một bên làm chư hầu`;
  if (quarantined(n, world.tick)) return "Đang cách ly: không buôn bán với nước ngoài (quarantine turns 0 để dỡ)";
  if (quarantined(o, world.tick)) return `${o.name} đang cách ly: không nhận buôn bán`;
  return null;
}

// ---------------------------------------------------------------- actions

export function doDiplomacy(ctx: DiploCtx, n: Nation, type: string, a: Record<string, unknown>): string | null {
  const { world, tick, say } = ctx;
  switch (type) {
    case "message": {
      const o = findTarget(world, n, a.to); if (typeof o === "string") return o;
      if (ctx.sent.has(`${n.id}>${o.id}`)) return "Mỗi lượt chỉ một tin cho mỗi quốc gia";
      ctx.sent.add(`${n.id}>${o.id}`);
      if (a.gesture !== undefined || !sharedLanguage(world, n, o)) {
        const g = String(a.gesture ?? a.text ?? "").trim();
        if (!GESTURES.includes(g)) return sharedLanguage(world, n, o) ? `Cử chỉ phải nằm trong danh sách: ${GESTURES.join(", ")}` : `Chưa có ngôn ngữ chung với ${o.name}: chỉ gửi được cử chỉ (gesture) trong danh sách: ${GESTURES.join(", ")}`;
        o.inbox.push({ from: n.id, tick, text: g, gesture: true });
        talk(world, n.id, o.id, "message", `(cử chỉ) ${g}`);
        return null;
      }
      const text = String(a.text ?? "").trim().slice(0, MESSAGE_MAX);
      if (!text) return "Tin nhắn trống";
      if (INJECTION.test(text)) {
        n.reputation = Math.max(0, n.reputation - TREATY.injectionPenalty);
        say(n.id, "deceit", `${n.name} gửi tới ${o.name} một thông điệp giả mạo mệnh lệnh của thần linh; thông điệp bị chặn. Uy tín −${TREATY.injectionPenalty}.`);
        return "Tin nhắn trông như mệnh lệnh hệ thống nên bị chặn; uy tín bị trừ";
      }
      o.inbox.push({ from: n.id, tick, text, gesture: false });
      talk(world, n.id, o.id, "message", text);
      return null;
    }
    case "aid_civil_war": return aidCivilWar(world, n, a, ctx.L); // §4.5b
    case "trade_offer": {
      const o = findTarget(world, n, a.to); if (typeof o === "string") return o;
      if (pendingOrActiveWar(world, n.id, o.id)) return `Đang chiến tranh với ${o.name}`;
      const shut = closedFor(world, n, o); if (shut) return shut;
      const give = goods(world, a.give, TRADE.maxQty); if (typeof give === "string") return `give: ${give}`;
      const get = goods(world, a.get, TRADE.maxQty); if (typeof get === "string") return `get: ${get}`;
      if (!has(n, give)) return "Kho không đủ hàng để đưa";
      const road = planRoute(world, n, o, give);
      if (typeof road === "string") return `Hàng không tới được ${o.name}: ${road}`;
      const id = world.nextId++;
      world.tradeOffers.push({ id, from: n.id, to: o.id, give, get, tick, status: "open" });
      o.lastEvents.push(`${n.name} đề nghị trao đổi #${id}: đưa ${fmtGoods(world, give)} để lấy ${fmtGoods(world, get)}.`);
      return null;
    }
    case "accept_trade": {
      const id = idOf(a.offer ?? a.id);
      const off = world.tradeOffers.find(x => x.id === id);
      if (!off || off.to !== n.id) return `Không có đề nghị trao đổi #${id} gửi cho bạn`;
      if (off.status !== "open" || tick - off.tick > TRADE.offerTicks) return "Đề nghị đã hết hạn";
      const shut = closedFor(world, n, world.nations[off.from]); if (shut) return shut;
      const back = planRoute(world, n, world.nations[off.from], off.get);
      if (typeof back === "string") return `Hàng của bạn không tới được ${world.nations[off.from].name}: ${back}`;
      ctx.accepts.push({ n, offer: id });
      return null;
    }
    case "treaty": {
      const o = findTarget(world, n, a.to); if (typeof o === "string") return o;
      const t = String(a.kind ?? a.treaty ?? "") as TreatyType;
      if (!TREATY_TYPES.includes(t)) return `Loại hiệp ước phải là: ${TREATY_TYPES.join(", ")}`;
      if (t !== "peace" && pendingOrActiveWar(world, n.id, o.id)) return "Đang chiến tranh: chỉ đề nghị được hiệp ước hòa bình (peace)";
      if (t === "peace" && !pendingOrActiveWar(world, n.id, o.id)) return "Hai nước không có chiến tranh";
      if (kin(n, o) && KIN.noTreaty.includes(t)) return `${n.origin?.from === o.id ? `${o.name} là nước bạn đã tách ra` : `${o.name} đã tách ra từ nước bạn`}: hai nước không thể ${TREATY_NAME[t]} — nước gốc còn mong thâu tóm lại (chỉ hòa bình hoặc chư hầu)`;
      const dur = a.duration === null || a.duration === undefined ? null : Math.floor(Number(a.duration));
      if (dur !== null && !(dur >= TREATY.minDuration && dur <= TREATY.maxDuration)) return `Thời hạn ${TREATY.minDuration}–${TREATY.maxDuration} lượt, hoặc bỏ trống là vĩnh viễn`;
      let tribute: Record<string, number> = {};
      if (a.tribute) { const g = goods(world, a.tribute, TREATY.maxTributePerGood); if (typeof g === "string") return `tribute: ${g}`; tribute = g; }
      if ((t === "tribute" || t === "vassal") && !Object.keys(tribute).length) return "Hiệp ước cống nạp/chư hầu cần tribute";
      if (t === "hunt") { // §7.9 shared hunting grounds: neighbours at peace with each other, no terms
        if (!borderLength(world, n.id, o.id)) return `Khu săn chung chỉ lập được với láng giềng giáp đất: ${o.name} không giáp bạn`;
        if (hostile(world, n, o)) return `${o.name} và nước bạn còn thù địch (nước gốc và nước ly khai): chưa lập được khu săn chung`;
        if (treatiesBetween(world, n.id, o.id, ["hunt"]).length) return `Đã có khu săn chung với ${o.name}`;
      }
      const cede: number[] = [];
      for (const c of Array.isArray(a.cede) ? a.cede.slice(0, TREATY.maxCede) : []) { const i = parseTile(c); if (i >= 0) cede.push(i); }
      // payer: who pays tribute and cedes tiles. Default: the proposer.
      const payerIsMe = String(a.payer ?? "me") !== "them";
      const from = payerIsMe ? n.id : o.id;
      if (cede.some(i => world.tiles[i].owner !== from)) return "Chỉ nhượng được ô thuộc bên trả";
      if (t === "hunt" && (Object.keys(tribute).length || cede.length)) return "Khu săn chung không kèm cống nạp hay nhượng đất";
      if (t === "peace") { const early = peaceTooEarly(world, n.id, o.id, tribute, dur, cede); if (early) return early; }
      if (t === "peace" && from === o.id && (Object.keys(tribute).length || cede.length)) { // §7.4b the beaten cannot dictate terms
        const w = pendingOrActiveWar(world, n.id, o.id), out = w ? peaceOutlook(w, n.id) : null;
        if (w && out?.winner === o.id) return `Đang thua ${Math.round(warSide(w, n.id).score * 10) / 10} – ${Math.round(warSide(w, o.id).score * 10) / 10} (bị dẫn ${Math.round(-out.lead * 10) / 10} điểm, từ ${WAR.decisive} là thua rõ): không thể đòi ${o.name} nộp cống hay nhượng đất. Chỉ đề nghị được hòa trắng hoặc hòa mà mình là bên trả (payer "me")`;
      }
      const id = world.nextId++;
      world.treatyOffers.push({ id, from: n.id, to: o.id, type: t, duration: dur, tribute, cede, payer: from, tick });
      if (t === "peace") talk(world, n.id, o.id, "offer", `Đề nghị hòa #${id}: ${Object.keys(tribute).length || cede.length ? `${world.nations[from].name}${Object.keys(tribute).length ? ` nộp ${fmtGoods(world, tribute)} mỗi lượt` : ""}${cede.length ? `${Object.keys(tribute).length ? "," : ""} nhượng ${cede.length} ô` : ""}` : "hòa trắng, không điều khoản"}${dur ? `, thời hạn ${dur} lượt` : ", vĩnh viễn"}.`);
      o.lastEvents.push(`${n.name} đề nghị hiệp ước ${TREATY_NAME[t]} #${id}${Object.keys(tribute).length ? `, ${world.nations[from].name} nộp ${fmtGoods(world, tribute)} mỗi lượt` : ""}${cede.length ? `, nhượng ${cede.length} ô` : ""}${dur ? `, ${dur} lượt` : ""}. Trả lời bằng accept_treaty.`);
      return null;
    }
    case "accept_treaty": {
      const id = idOf(a.offer ?? a.id);
      const off = world.treatyOffers.find(x => x.id === id);
      if (!off || off.to !== n.id) return `Không có đề nghị hiệp ước #${id} gửi cho bạn`;
      if (tick - off.tick > TREATY.offerTicks) return "Đề nghị đã hết hạn";
      ctx.treatyAccepts.push({ n, offer: id });
      return null;
    }
    case "break_treaty": {
      const id = idOf(a.treaty ?? a.id);
      const t = world.treaties.find(x => x.id === id && x.active && (x.a === n.id || x.b === n.id));
      if (!t) return `Không có hiệp ước #${id} của bạn`;
      if (t.type === "vassal" && t.a === n.id) return "Chư hầu không phá ước được; dùng declare_independence";
      t.end = tick + 1; t.brokenBy = n.id;
      const o = world.nations[t.a === n.id ? t.b : t.a];
      // §7.9 a just cause (a border dispute, an incident, a caught spy) excuses breaking the treaty
      const just = (n.casusBelli[String(o.id)] ?? -1) >= tick || t.type === "hunt"; // §7.9 either side may give up the hunting grounds
      if (!just) n.reputation = Math.max(0, n.reputation - TREATY.breakPenalty);
      say(n.id, "treaty", t.type === "hunt" ? `${n.name} rút khỏi khu săn chung với ${o.name}; khu tan từ lượt sau.` : `${n.name} xé hiệp ước ${TREATY_NAME[t.type]} với ${o.name}.${just ? " Có chính nghĩa, không mất uy tín." : ` Uy tín −${TREATY.breakPenalty}.`}`);
      o.lastEvents.push(`${n.name} xé hiệp ước ${TREATY_NAME[t.type]} #${t.id}; hết hiệu lực từ lượt sau.`);
      return null;
    }
    case "declare_war":
    case "declare_independence": {
      const o = findTarget(world, n, a.target ?? a.to); if (typeof o === "string") return o;
      if (pendingOrActiveWar(world, n.id, o.id)) return "Đã có chiến tranh";
      const lord = overlordOf(world, n.id);
      if (type === "declare_independence") {
        const vt = world.treaties.find(x => x.active && x.type === "vassal" && x.a === n.id && x.b === o.id);
        if (!vt) return `Bạn không phải chư hầu của ${o.name}`;
        if (tick - vt.start < WAR.independenceAfter) return `Phải làm chư hầu ít nhất ${WAR.independenceAfter} lượt`;
        vt.active = false; vt.end = tick;
      } else {
        if (lord !== null && lord !== o.id) return "Chư hầu không được tuyên chiến với ai ngoài tông chủ";
        if (lord === o.id) return "Muốn đánh tông chủ thì dùng declare_independence";
        const blocking = treatiesBetween(world, n.id, o.id, ["non_aggression", "alliance", "peace", "vassal"]).filter(t => t.end === null || t.end > tick);
        if (blocking.length) return `Đang có hiệp ước ${blocking.map(t => `${TREATY_NAME[t.type]} #${t.id}`).join(", ")}; phải phá ước trước`;
      }
      const free = (n.casusBelli[String(o.id)] ?? -1) >= tick || type === "declare_independence" || o.origin?.from === n.id; // §4.5 the old nation may always seek its lost land
      if (!free) n.reputation = Math.max(0, n.reputation - WAR.unprovokedPenalty);
      startWar(world, n, o, tick, free ? "có chính nghĩa" : "", say);
      return null;
    }
    case "attack":
    case "raid": {
      const kind = type as "attack" | "raid";
      let target: Nation | undefined, tile = -1;
      if (kind === "attack") {
        tile = parseTile(a.tile);
        if (tile < 0) return "Cần tile [cột, hàng] của ô địch";
        const owner = world.tiles[tile].owner;
        if (owner < 0 || owner === n.id) return "Ô này không thuộc quốc gia địch";
        target = world.nations[owner];
      } else {
        const o = findTarget(world, n, a.target); if (typeof o === "string") return o; target = o;
        tile = target.capital;
      }
      if (!activeWar(world, n.id, target.id)) return `Chưa có chiến tranh đang diễn ra với ${target.name} (tuyên chiến có hiệu lực từ lượt sau)`;
      const warriors = Math.floor(Number(a.warriors ?? n.labor.warrior));
      const committed = ctx.strikes.filter(s => s.n === n).reduce((s, x) => s + x.warriors, 0);
      if (!(warriors >= 1) || warriors + committed > n.labor.warrior) return `Chỉ có ${n.labor.warrior - committed} chiến binh rảnh`;
      const reach = (mods(world, n).caps.has("đi-nước") ? WAR.reachSail : WAR.reach) + mods(world, n).range; // §5.3 range effects
      // §2.1 boats from a pier carry the attack one tile further, to a target on a river or the shore
      const byWater = kind === "attack" && crossesWater(world, n, tile);
      const near = ownedTiles(world, n.id).some(t => dist(t.i, tile) <= reach + (byWater ? 1 : 0));
      if (kind === "attack" && !near) return `Ô mục tiêu cách lãnh thổ bạn quá ${reach} ô${byWater ? " (kể cả thêm 1 ô nhờ thuyền)" : ""}`;
      if (kind === "attack") { const block = marchBlocked(world, n, tile, reach + (byWater ? 1 : 0)); if (block) return block; } // §7.3b no march through a third nation
      if (kind === "raid" && landGap(world, n.id, target.id) > reach + 3) return "Quá xa để đột kích";
      if (kind === "attack" && world.tiles[tile].terrain === "mountain" && !mods(world, n).move.has("mountain") && !roadOf(world.tiles[tile])) return "Không vượt núi được";
      if (kind === "attack" && !world.tiles[tile].land) {
        // §2.6 a fight for the sea is fought from boats
        if (!mods(world, n).move.has("shallow")) return "Đánh ô biển cần năng lực đi-nước (thuyền)";
        const atSea = ctx.strikes.filter(s => s.n === n && !world.tiles[s.tile].land).reduce((s, x) => s + x.warriors, 0) + warriors;
        const need = Math.ceil(atSea / SEA.warriorsPerBoat), free = Math.floor(n.stock.boat || 0) - busy(world, n).boats;
        if (free < need) return `Đánh ô biển cần ${need} thuyền rảnh (mỗi thuyền chở ${SEA.warriorsPerBoat} chiến binh), có ${Math.max(0, free)}`;
      }
      if (kind === "attack") {
        const cap = frontCap(world, n.id, tile), sent = ctx.strikes.filter(s => s.n === n && s.tile === tile).reduce((s, x) => s + x.warriors, 0);
        if (warriors + sent > cap) return `Mặt trận ở ô này chỉ chứa ${cap} chiến binh của bạn (${WAR.frontBase} + ${WAR.frontPerTile} × số ô của bạn kề ô đó)${sent ? `, đã gửi ${sent}` : ""}`;
      }
      ctx.strikes.push({ n, target, tile, warriors, kind });
      return null;
    }
  }
  return "Không có hành động này";
}

/** §7.4 Front: the most warriors one nation can send at one tile in a tick. */
export function frontCap(world: World, nid: number, tile: number): number {
  return WAR.frontBase + WAR.frontPerTile * NEIGHBORS[tile].filter(j => world.tiles[j].owner === nid).length;
}
/** §7.4 The defender's front: its tiles that touch land of a nation it is fighting. */
export function borderTiles(world: World, nid: number): number {
  const foes = new Set(world.wars.filter(w => w.end === null && w.start <= world.tick && (w.a === nid || w.b === nid)).map(w => w.a === nid ? w.b : w.a));
  if (!foes.size) return 0;
  let k = 0;
  for (const t of world.tiles) if (t.owner === nid && NEIGHBORS[t.i].some(j => foes.has(world.tiles[j].owner))) k++;
  return k;
}
/** §7.4 How many of a centre's land neighbours the attacker must hold before it falls. */
export function centreFallNeed(world: World, tile: number): number {
  return Math.min(WAR.centreFallsAt, NEIGHBORS[tile].filter(j => world.tiles[j].land).length);
}

export function fmtGoods(world: World, g: Record<string, number>): string {
  return Object.entries(g).map(([k, q]) => `${Math.round(q * 10) / 10} ${goodName(world, k)}`).join(", ");
}

export function startWar(world: World, n: Nation, o: Nation, tick: number, reason: string, say: Say): void {
  world.wars.push({ id: world.nextId++, a: n.id, b: o.id, declared: tick, start: tick + 1, end: null, reason, tally: {} });
  for (const t of treatiesBetween(world, n.id, o.id, ["hunt"])) { t.active = false; t.end = tick; t.endedBy = "tan vì chiến tranh"; } // §7.9
  say(n.id, "war", `${n.name} tuyên chiến với ${o.name}${reason ? ` (${reason})` : ""}. Chiến sự bắt đầu từ lượt sau.`);
  o.lastEvents.push(`${n.name} tuyên chiến với chúng ta! Chiến sự bắt đầu từ lượt sau.`);
  // Allies and the overlord of the defender join (§7.4, §7.7)
  for (const ally of allies(world, o.id)) {
    const A = world.nations[ally];
    if (!A.alive || ally === n.id || pendingOrActiveWar(world, ally, n.id)) continue;
    world.wars.push({ id: world.nextId++, a: ally, b: n.id, declared: tick, start: tick + 1, end: null, reason: `bảo vệ ${o.name}`, tally: {} });
    if (!A.met.includes(n.id)) A.met.push(n.id);
    say(ally, "war", `${A.name} tham chiến để bảo vệ ${o.name}, chống lại ${n.name}.`);
  }
}

/** §7.9 A trade completed over a disputed border is a truce market: it clears the latest deadly brawl from the
 *  blood-for-blood count; between hostile kin it uses one of their truce-market turns. */
function truceMarket(world: World, A: Nation, B: Nation): void {
  const st = borderOf(world, A.id, B.id), foes = hostile(world, A, B);
  if (foes) (st.truce ??= []).push(world.tick);
  if (st.tension < BORDER.dispute && !foes) return;
  const cleared = (st.brawls ?? []).pop();
  const note = `Phiên chợ đình chiến với ${"%"}: ${cleared ? "một vụ xô xát được bỏ qua, máu đòi máu chậm lại" : "biên giới dịu đi"}${foes ? `; còn ${truceLeft(world, A.id, B.id)} phiên trong ${TRUCE.window} lượt khi chưa có hòa bình` : ""}.`;
  A.lastEvents.push(note.replace("%", B.name)); B.lastEvents.push(note.replace("%", A.name));
}
/** §7.4b A word between two nations at war goes into that war's record of talks (the latest 40). */
function talk(world: World, from: number, to: number, kind: WarTalk["kind"], text: string): void {
  const w = world.wars.find(x => x.end === null && ((x.a === from && x.b === to) || (x.a === to && x.b === from)));
  if (!w) return;
  (w.talks ??= []).push({ tick: world.tick, from, kind, text: text.slice(0, 300) });
  if (w.talks.length > 40) w.talks.splice(0, w.talks.length - 40);
}
function endWar(world: World, a: number, b: number, tick: number): void {
  for (const w of world.wars) if (w.end === null && ((w.a === a && w.b === b) || (w.a === b && w.b === a))) w.end = tick;
}

// ---------------------------------------------------------------- resolution

/** Treaties, trades and caravans; runs after every nation has acted. */
export function resolveRelations(ctx: DiploCtx): void {
  const { world, tick, L, say } = ctx;
  // Treaty acceptances
  for (const { n, offer } of ctx.treatyAccepts) {
    const off = world.treatyOffers.find(x => x.id === offer); if (!off) continue;
    const from = world.nations[off.from];
    const payer = off.payer;
    const receiver = payer === off.from ? off.to : off.from;
    if (!from.alive) continue;
    const cede = off.cede.filter(i => world.tiles[i].owner === payer);
    const t: Treaty = { id: off.id, type: off.type, a: payer, b: receiver, tribute: off.tribute, cede, start: tick, end: off.duration ? tick + off.duration : null, active: true, brokenBy: null, by: off.from, term: off.duration ?? null };
    if (off.type !== "tribute" && off.type !== "vassal" && !Object.keys(off.tribute).length) { t.a = off.from; t.b = off.to; }
    world.treaties.push(t);
    world.treatyOffers = world.treatyOffers.filter(x => x.id !== offer);
    for (const i of cede) { world.tiles[i].owner = receiver; moveBuildings(world.nations[payer], world.nations[receiver], i); }
    say(n.id, "treaty", `${from.name} và ${n.name} ký hiệp ước ${TREATY_NAME[off.type]}${cede.length ? `, nhượng ${cede.length} ô` : ""}${Object.keys(off.tribute).length ? `, ${world.nations[payer].name} nộp ${fmtGoods(world, off.tribute)} mỗi lượt` : ""}.`);
    if (off.type === "peace") {
      talk(world, n.id, off.from, "signed", `Chấp nhận đề nghị hòa #${off.id} của ${from.name}${cede.length ? ` (nhượng ${cede.length} ô)` : ""}.`);
      for (const w of world.wars) if (w.end === null && ((w.a === off.from && w.b === off.to) || (w.a === off.to && w.b === off.from))) w.treaty = t.id;
      settlePeace(world, t, payer, L, say); endWar(world, off.from, off.to, tick);
      // the war vented the anger: the border starts afresh, so the new peace is not torn up by the dispute before it
      const st = borderOf(world, off.from, off.to); st.tension = Math.min(st.tension, BORDER.afterPeace); st.dispute = 0;
    }
  }
  world.treatyOffers = world.treatyOffers.filter(x => tick - x.tick <= TREATY.offerTicks);

  // Treaty upkeep: tribute, expiry
  for (const t of world.treaties) {
    if (!t.active) continue;
    const A = world.nations[t.a], B = world.nations[t.b];
    if (!A.alive || !B.alive) { t.active = false; t.endedBy = "một bên không còn"; continue; }
    if (t.end !== null && tick >= t.end) {
      t.active = false;
      if (t.brokenBy === null) { A.reputation = Math.min(100, A.reputation + TREATY.keepBonus); B.reputation = Math.min(100, B.reputation + TREATY.keepBonus); }
      continue;
    }
    if (Object.keys(t.tribute).length && tick > t.start) {
      if (has(A, t.tribute)) {
        for (const [k, q] of Object.entries(t.tribute)) { L.stock(A, k, -q, "tribute"); L.stock(B, k, q, "tribute"); }
        t.paid = (t.paid ?? 0) + 1;
        // §4.13 coin in the books of both treasuries, and a line for each side every turn it is paid
        if (t.tribute.coin) { book(A, "out", "tribute", t.tribute.coin); book(B, "in", "tribute", t.tribute.coin); }
        const what = fmtGoods(world, t.tribute), of = t.term ? `/${t.term}` : "";
        A.lastEvents.push(`Nộp cống cho ${B.name} theo hiệp ước #${t.id}: ${what} (lượt ${t.paid}${of}).`);
        B.lastEvents.push(`${A.name} nộp cống theo hiệp ước #${t.id}: ${what} (lượt ${t.paid}${of}).`);
      }
      else { t.missed = (t.missed ?? 0) + 1; A.reputation = Math.max(0, A.reputation - TREATY.violationPenalty); B.lastEvents.push(`${A.name} không nộp đủ cống phẩm.`); A.lastEvents.push(`Không đủ hàng để nộp cống cho ${B.name}: uy tín −${TREATY.violationPenalty}.`); }
    }
  }

  // Trades
  for (const { n, offer } of ctx.accepts) {
    const off = world.tradeOffers.find(x => x.id === offer); if (!off || off.status !== "open") continue;
    const A = world.nations[off.from], B = n;
    if (!A.alive || pendingOrActiveWar(world, A.id, B.id)) { off.status = "failed"; continue; }
    const shut = closedFor(world, A, B);
    if (shut) { off.status = "failed"; A.lastEvents.push(`Trao đổi #${off.id} thất bại: ${shut}.`); B.lastEvents.push(`Trao đổi #${off.id} thất bại: ${shut}.`); continue; }
    if (!has(A, off.give) || !has(B, off.get)) { off.status = "failed"; A.lastEvents.push(`Trao đổi #${off.id} thất bại: một bên không đủ hàng.`); B.lastEvents.push(`Trao đổi #${off.id} thất bại: một bên không đủ hàng.`); continue; }
    // §7.3 both ways need a road now (piers, boats and porters may have changed since the offer)
    const legs = ([[A, B, off.give], [B, A, off.get]] as Array<[Nation, Nation, Record<string, number>]>).map(([from, to, g]) => ({ from, to, g, road: planRoute(world, from, to, g) }));
    const blocked = legs.find(l => typeof l.road === "string");
    if (blocked) {
      off.status = "failed";
      const why = `Trao đổi #${off.id} thất bại: hàng của ${blocked.from.name} không tới được ${blocked.to.name} (${blocked.road}).`;
      A.lastEvents.push(why); B.lastEvents.push(why);
      continue;
    }
    off.status = "done";
    const eta: string[] = [];
    for (const { from, to, g, road: r } of legs) {
      const road = r as Route;
      for (const [k, q] of Object.entries(g)) L.stock(from, k, -q, "trade");
      if (road.mode === "near") { for (const [k, q] of Object.entries(g)) L.stock(to, k, q, "trade"); importDuty(world, L, from, to, g); continue; } // §4.13 duty at the border
      const load = { ...g };
      // Tolls to every third nation crossed without a passage or alliance treaty
      for (const o of road.tolls) {
        const toller = world.nations[o], cut: Record<string, number> = {};
        // the sender already gave the whole load (−q above); the toller gets its cut and the caravan carries the rest
        const rate = tollRate(toller) * ((from.officials ?? []).some(x => x.domain === "merchant" && x.loyalty >= OFFICIALS.idle) ? 0.5 : 1); // §4.13 the toller's tariff; §4.6 a merchant halves tolls
        // §4.13 a sender with coin pays the toll from its treasury and the goods ride on whole
        const paid = tollInCoin(world, L, from, toller, load, rate);
        if (paid) {
          toller.lastEvents.push(`Đoàn buôn của ${from.name} đi qua đất mình nộp ${paid} tiền phí.`);
          from.lastEvents.push(`Đoàn buôn tới ${to.name} nộp ${paid} tiền phí qua đất ${toller.name}.`);
          fx({ kind: "toll", tile: road.path.find(i => world.tiles[i].owner === o) ?? road.path[0], nation: o, from: from.id });
          continue;
        }
        for (const [k, q] of Object.entries(load)) { const x = Math.floor(q * rate * 10) / 10; if (x > 0) { cut[k] = x; load[k] = q - x; L.stock(toller, k, x, "toll"); } }
        if (Object.keys(cut).length) {
          toller.lastEvents.push(`Đoàn buôn của ${from.name} đi qua đất mình nộp phí: ${fmtGoods(world, cut)}.`);
          from.lastEvents.push(`Đoàn buôn tới ${to.name} nộp phí qua đất ${toller.name}: ${fmtGoods(world, cut)}.`);
          fx({ kind: "toll", tile: road.path.find(i => world.tiles[i].owner === o) ?? road.path[0], nation: o, from: from.id });
        }
      }
      world.caravans.push({ id: world.nextId++, from: from.id, to: to.id, goods: load, arrive: tick + road.ticks, offer: off.id, mode: road.mode, path: road.path, depart: tick, porters: road.porters, boats: road.boats });
      L.toCaravan(load);
      fx({ kind: "caravan", tile: road.path[0], nation: from.id, to: road.path[road.path.length - 1], path: road.path, text: road.mode, n: road.ticks });
      eta.push(`${from.name} → ${to.name} ${road.mode === "air" ? "bằng máy bay" : road.mode === "water" ? `bằng ${road.boats} thuyền` : `với ${road.porters} người khuân vác`}, ${road.ticks} lượt`);
    }
    A.trades[String(B.id)] = (A.trades[String(B.id)] || 0) + 1; B.trades[String(A.id)] = (B.trades[String(A.id)] || 0) + 1;
    truceMarket(world, A, B);
    say(B.id, "trade", `${A.name} và ${B.name} trao đổi: ${fmtGoods(world, off.give)} ⇄ ${fmtGoods(world, off.get)}${eta.length ? ` (đoàn buôn: ${eta.join("; ")})` : ""}.`);
  }
  for (const o of world.tradeOffers) if (o.status === "open" && tick - o.tick > TRADE.offerTicks) o.status = "expired";
  world.tradeOffers = world.tradeOffers.filter(o => tick - o.tick <= 20);

  // Caravans on the road (§7.3): seizure by an enemy, barbarians, storms at sea, food spoiling; then arrival
  for (const c of world.caravans) {
    const to = world.nations[c.to], from = world.nations[c.from];
    if (c.arrive > tick) { onTheRoad(ctx, c, from); continue; }
    // §9.5 a people in quarantine lets no caravan in: it waits at the border until the quarantine ends
    if (to.alive && quarantined(to, tick)) {
      c.arrive = tick + 1;
      to.lastEvents.push(`Đoàn buôn từ ${from.name} phải chờ ngoài biên giới vì đang cách ly.`);
      from.lastEvents.push(`Đoàn buôn tới ${to.name} phải chờ ngoài biên giới: ${to.name} đang cách ly.`);
      continue;
    }
    for (const [k, q] of Object.entries(c.goods)) { L.caravanLoss(k, q); if (to.alive) L.stock(to, k, q, "caravan"); }
    if (to.alive && from.alive) importDuty(world, L, from, to, c.goods); // §4.13 duty paid where the goods come in
    if (to.alive) to.lastEvents.push(`Đoàn buôn từ ${world.nations[c.from].name} tới nơi: ${fmtGoods(world, c.goods)}.`);
  }
  world.caravans = world.caravans.filter(c => c.arrive > tick);
}

/** §2.1 Can this nation bring boats to a tile: a pier within RIVER.pierReach, and the tile on a river or by shallow water? */
export function crossesWater(world: World, n: Nation, tile: number): boolean {
  const t = world.tiles[tile];
  if (!t.river && !NEIGHBORS[tile].some(j => world.tiles[j].terrain === "shallow")) return false;
  return piers(world, n).some(p => dist(p, tile) <= RIVER.pierReach);
}

/** Where a caravan is this tick on its road. */
export function caravanAt(c: Caravan, tick: number): number {
  if (!c.path?.length) return -1;
  const span = Math.max(1, c.arrive - (c.depart ?? c.arrive - 1));
  return c.path[Math.min(c.path.length - 1, Math.floor(Math.max(0, tick - (c.depart ?? tick)) / span * (c.path.length - 1)))];
}

/** One turn of a caravan still travelling (§7.3). */
function onTheRoad(ctx: DiploCtx, c: Caravan, from: Nation): void {
  const { world, tick, L } = ctx, at = caravanAt(c, tick), r = rngFor(world.seed, tick, "caravan", c.id);
  const share = (part: number, reason: string, to?: Nation) => {
    const out: Record<string, number> = {};
    for (const [k, q] of Object.entries(c.goods)) { const x = q * part; if (x <= 0) continue; c.goods[k] = q - x; out[k] = x; L.caravanLoss(k, x); if (to) L.stock(to, k, x, reason); }
    return out;
  };
  if (at >= 0 && c.mode !== "air") { // §7.3b a flight is out of reach
    // On the land of a nation now at war with the sender: everything is seized
    const owner = world.tiles[at].owner, enemy = owner >= 0 && owner !== from.id ? world.nations[owner] : null;
    if (enemy && activeWar(world, from.id, enemy.id)) {
      const got = share(1, "seized", enemy);
      c.arrive = tick; // the road ends here; nothing is delivered
      fx({ kind: "seized", tile: at, nation: enemy.id, from: from.id });
      enemy.lastEvents.push(`Bắt được đoàn buôn của ${from.name}: ${fmtGoods(world, got)}.`);
      from.lastEvents.push(`Đoàn buôn tới ${world.nations[c.to].name} bị ${enemy.name} tịch thu.`);
      return;
    }
    // Barbarians near the road
    const horde = liveHordes(world).filter(h => dist(h.tile, at) <= TRADE.hordeReach).sort((a, b) => b.strength - a.strength)[0];
    const safety = 1 - (roadOf(world.tiles[at])?.safety ?? 0); // §2.5 a kept road or lane is safer
    if (horde && r() < Math.min(0.5, TRADE.hordeChance * horde.strength / 40) * safety) {
      const lost = share(TRADE.hordeLoss, "barbarians");
      const dead = Math.min(from.population, c.porters ? 1 : 0); take(from, dead, "porter");
      fx({ kind: "robbed", tile: at, nation: from.id, from: horde.tile, text: horde.name }); fxDeath(at, from.id, dead, "raid");
      from.lastEvents.push(`${horde.name} chặn cướp đoàn buôn tới ${world.nations[c.to].name}: mất ${fmtGoods(world, lost)}${dead ? `, ${dead} người khuân vác chết` : ""}.`);
    }
    // A storm at sea
    const sea = world.tiles[at].terrain;
    if (c.mode === "water" && (sea === "shallow" || sea === "ocean") && r() < TRADE.stormChance * (sea === "ocean" ? SEA.oceanStorm : 1) * safety) {
      const lost = share(TRADE.stormLoss, "storm");
      if ((c.boats || 0) > 0 && (from.stock.boat || 0) >= 1) { L.stock(from, "boat", -1, "storm"); c.boats! -= 1; }
      fx({ kind: "storm", tile: at, nation: from.id });
      from.lastEvents.push(`Bão biển: đoàn thuyền tới ${world.nations[c.to].name} mất một thuyền và ${fmtGoods(world, lost)}.`);
    }
  }
  if (c.goods.food) { const lost = c.goods.food * (c.mode === "water" ? TRADE.waterSpoil : TRADE.landSpoil); c.goods.food -= lost; L.caravanLoss("food", lost); }
}

/** §7.3b May an army march from its land to this tile within `reach` steps, over land it may cross: its own, the
 *  wilds, the lands of nations it is at war with, or of those it has a passage or alliance treaty with? The reason if not. */
export function marchBlocked(world: World, n: Nation, tile: number, reach: number): string | null {
  const ok = (owner: number) => owner === -1 || owner === n.id || !!activeWar(world, n.id, owner) || treatiesBetween(world, n.id, owner, ["passage", "alliance"]).length > 0;
  const dist0 = new Map<number, number>(), queue: number[] = [];
  for (const t of world.tiles) if (t.owner === n.id) { dist0.set(t.i, 0); queue.push(t.i); }
  const blockers = new Set<number>();
  while (queue.length) {
    const k = queue.shift()!, d = dist0.get(k)!;
    if (k === tile) return null;
    if (d >= reach) continue;
    for (const j of NEIGHBORS[k]) {
      if (dist0.has(j)) continue;
      const owner = world.tiles[j].owner;
      if (j !== tile && !ok(owner)) { blockers.add(owner); continue; }
      dist0.set(j, d + 1); queue.push(j);
    }
  }
  const names = [...blockers].map(o => world.nations[o]?.name).filter(Boolean);
  return names.length ? `Quân phải đi qua đất ${names.join(", ")}: cần hiệp ước thông hành (passage) hay liên minh với họ, hoặc đánh từ hướng khác` : null;
}

/** Battles (§7.4). Defenders split their warriors over all attacks they face this tick. */
export function resolveBattles(ctx: DiploCtx): void {
  const { world, tick, L, say } = ctx;
  const facing = new Map<number, number>();
  for (const s of ctx.strikes) if (s.kind !== "wild") facing.set(s.target.id, (facing.get(s.target.id) || 0) + 1);
  const frontMemo = new Map<number, number>();
  const frontOf = (D: Nation): number => {
    if (!frontMemo.has(D.id)) frontMemo.set(D.id, Math.max(facing.get(D.id) || 1, borderTiles(world, D.id)));
    return frontMemo.get(D.id)!;
  };
  for (const s of ctx.strikes) {
    const A = s.n, D = s.target;
    if (s.kind === "wild" || !A.alive || !D.alive || !activeWar(world, A.id, D.id)) continue;
    const r = rngFor(world.seed, tick, "battle", A.id, D.id, s.tile);
    const luck = () => WAR.luck[0] + r() * (WAR.luck[1] - WAR.luck[0]);
    /** (armed men + militia at half strength) × bonuses × morale × luck; defenders also get home, terrain, walls and river. */
    const strength = (n: Nation, men: number, militiaMen: number, defending: boolean) => {
      if (men + militiaMen <= 0) return 0;
      let v = armyStrength(world, n, men, militiaMen) * luck();
      if (defending) {
        const t = world.tiles[s.tile];
        const wall = n.buildings.filter(b => buildingWorks(world, b) && (b.tile === s.tile || dist(b.tile, s.tile) <= 1)).reduce((x, b) => Math.max(x, buildingOf(world, b.type)?.effect.defense || 0), 0);
        const lived = n.buildings.some(b => b.tile === s.tile) || (HAMLET.people[t.terrain] || 0) >= 2; // §2.9 people guard their homes
        const help = (t.road || 0) > 0 && roadToCapital(world, n).has(s.tile) ? ROADS.reinforce : 0; // §2.5 help comes by road
        v *= 1 + WAR.home + TERRAIN[t.terrain].defense + wall + (t.river && !crossesWater(world, A, s.tile) ? 0.25 : 0) + (lived ? LAND.homeGuard : 0) + help + (isInterior(world, n, s.tile) ? COMPACT.interiorDefense : 0); // a river guards, unless they come with boats; §2.3b the heartland holds
      }
      return v;
    };
    // Defenders spread their warriors and militia over the whole front: every tile of theirs that touches
    // an enemy at war with them, or at least every attack they face this tick
    const fronts = frontOf(D);
    // §2.3c (v0.60) the land is held where it is lived on: the militia is the people of the tile and around it, and
    // only the warriors that can reach it in time stand there (all near a centre or along a road joined to the capital)
    const dMen = Math.floor(D.labor.warrior * reachAt(world, D, s.tile) / fronts);
    const militia = Math.floor(militiaAt(world, D, s.tile));
    // §4.5 the old nation fights the traitors harder
    const aStr = strength(A, s.warriors, 0, false) * (D.origin?.from === A.id ? 1 + KIN.vengeance : 1), dStr = strength(D, dMen, militia, true) * (A.origin?.from === D.id ? 1 + KIN.vengeance : 1) * (1 - civilShare(world, D)); // §4.5b a land torn by civil war defends worse
    const won = aStr > dStr;
    const lossRate = (win: boolean) => { const [lo, hi] = win ? WAR.winLoss : WAR.loseLoss; return lo + r() * (hi - lo); };
    const lossA = Math.min(s.warriors, Math.round(s.warriors * lossRate(won)));
    const rateD = lossRate(!won), lossDW = Math.min(dMen, Math.round(dMen * rateD)), lossDM = Math.min(militia, Math.round(militia * rateD));
    const lossD = Math.min(D.population, lossDW + lossDM);
    take(A, lossA, "war"); A.labor.warrior = Math.max(0, A.labor.warrior - lossA);
    // The fallen lose their weapons (bows first, then spears)
    loseWeapons(L, A, lossA); loseWeapons(L, D, lossDW);
    // §4.2 warriors fall by the defender's custom; the militia is the whole village
    const fallenD = take(D, Math.min(lossDW, lossD), "war"), fallenM = take(D, lossD - Math.min(lossDW, lossD), "raid");
    D.labor.warrior = Math.max(0, D.labor.warrior - lossDW);
    const taken = won ? part({ m: fallenD.m.map((x, i) => x + fallenM.m[i]), f: fallenD.f.map((x, i) => x + fallenM.f[i]) }, WAR.prisoners) : null;
    const prisoners = taken ? taken.m.reduce((a, b) => a + b, 0) + taken.f.reduce((a, b) => a + b, 0) : 0;
    if (taken && prisoners) { add(A, taken); A.stability -= Math.floor(prisoners / 5); }
    // The attackers march from their nearest land to the tile; the dead fall there
    const home = ownedTiles(world, A.id).reduce((b, t) => dist(t.i, s.tile) < dist(b, s.tile) ? t.i : b, A.capital);
    fx({ kind: "battle", tile: s.tile, nation: A.id, from: home, n: s.warriors, text: `${won ? "won" : "lost"}:${s.kind}:${D.name}` });
    fxDeath(s.tile, A.id, lossA, "battle"); fxDeath(s.tile, D.id, lossD, "battle");
    let note = "";
    if (won && s.kind === "raid") {
      let carry = s.warriors * WAR.carryPerWarrior;
      const loot: Record<string, number> = {};
      for (const k of ["food", ...Object.keys(D.stock).filter(k => k !== "food").sort()]) {
        if (carry <= 0) break;
        const q = Math.min(carry, (D.stock[k] || 0) * WAR.raidShare);
        if (q < 0.5) continue;
        L.stock(D, k, -q, "raid"); L.stock(A, k, q, "raid"); loot[k] = q; carry -= q;
      }
      note = Object.keys(loot).length ? `cướp ${fmtGoods(world, loot)}` : "không cướp được gì";
    } else if (won && s.kind === "attack") {
      const centre = s.tile === D.capital || D.settlements.some(x => x.tile === s.tile);
      note = captureTile(world, A, D, s.tile, say, L);
      // Spoils (§7.4): a taken tile yields a share of the loser's stores, a fallen centre half of them
      if (world.tiles[s.tile].owner === A.id) { // taken (a centre that did not fall stays theirs)
        let carry = centre ? Infinity : s.warriors * WAR.carryPerWarrior;
        const loot: Record<string, number> = {};
        for (const k of ["food", ...Object.keys(D.stock).filter(k => k !== "food").sort()]) {
          if (carry <= 0) break;
          const q = Math.min(carry, (D.stock[k] || 0) * (centre ? WAR.centreLoot : WAR.lootShare));
          if (q < 0.5) continue;
          L.stock(D, k, -q, "loot"); L.stock(A, k, q, "loot"); loot[k] = q; carry -= q;
        }
        if (Object.keys(loot).length) note += `, thu ${fmtGoods(world, loot)}`;
      }
    }
    world.battles.push({ tick, attacker: A.id, defender: D.id, tile: s.tile, kind: s.kind, a: Math.round(aStr * 10) / 10, d: Math.round(dStr * 10) / 10, won, lossA, lossD, note } as Battle);
    // §7.4b the war score
    const war = activeWar(world, A.id, D.id);
    if (war) {
      const sa = bumpSide(war, A.id), sd = bumpSide(war, D.id), sw = won ? sa : sd;
      war.lastTile = s.tile;
      sw.battles++; sw.score += WAR.score.battle;
      sa.dead += lossA; sd.dead += lossD; sa.score += lossD * WAR.score.perDead; sd.score += lossA * WAR.score.perDead;
      if (won && s.kind === "raid") sa.raids++;
      if (won && s.kind === "attack" && world.tiles[s.tile].owner === A.id) {
        if (/trung tâm/.test(note)) { sa.centres++; sa.score += WAR.score.centre; } else { sa.tiles++; sa.score += WAR.score.tile; }
      }
    }
    const where = `(${col(s.tile)}, ${row(s.tile)})`;
    say(A.id, "battle", `${A.name} ${s.kind === "raid" ? "đột kích" : "tấn công"} ${D.name} tại ${where}: ${won ? "thắng" : "thua"}. Thương vong ${lossA} / ${lossD}${dMen <= 0 ? " (dân quân)" : ""}${prisoners ? `, bắt ${prisoners} tù binh` : ""}${note ? `; ${note}` : ""}.`);
    D.lastEvents.push(`Bị ${A.name} ${s.kind === "raid" ? "đột kích" : "tấn công"} tại ${where}: ta ${won ? "thua" : "thắng"}, mất ${lossD} người.`);
    A.stability += won ? 1 : -2; D.stability += won ? -3 : 1;
  }
  world.battles = world.battles.slice(-300);

  // §7.4b Border clashes: wherever the two lands touch, the armies fight every turn on their own
  borderClashes(world, tick, L, say);

  // War weariness (§7.4, §7.4b): the side that is losing feels it from the first turn
  for (const w of world.wars) {
    if (w.end !== null || w.start > tick) continue;
    const A = world.nations[w.a], B = world.nations[w.b];
    if (!A.alive || !B.alive) { w.end = tick; continue; }
    const lead = warLead(w, A.id);
    if (Math.abs(lead) >= WAR.losingBy) {
      const loser = lead > 0 ? B : A;
      loser.stability -= 1; loser.discontent = Math.min(100, (loser.discontent ?? 0) + 1);
      loser.lastEvents.push(`Đang thua cuộc chiến với ${(loser === A ? B : A).name} (kém ${Math.abs(lead)} điểm chiến tranh): dân mỏi mệt, −1 ổn định, +1 bất mãn.`);
    }
    if (tick - w.start >= WAR.weariAfter) { A.stability -= 1; B.stability -= 1; }
  }
}

/** Armed men + weapons + militia at half strength, × warrior bonuses × morale (stability); no luck, no home ground. */
export function armyStrength(world: World, n: Nation, men: number, militiaMen: number): number {
  if (men + militiaMen <= 0) return 0;
  const m = mods(world, n);
  let weapons = 0, left = men;
  for (const [k, bonus] of Object.entries(WAR.weapon)) { const k2 = Math.min(left, Math.floor(n.stock[k] || 0)); weapons += k2 * bonus; left -= k2; }
  // Weapons a nation invented itself (recipe tools for warriors)
  for (const [k, q] of Object.entries(n.stock)) { const use = recipeOf(world, k)?.use; if (use?.role !== "warrior" || left <= 0) continue; const k2 = Math.min(left, Math.floor(q) * use.per); weapons += k2 * use.bonus * 2; left -= k2; }
  return (men + weapons + militiaMen * WAR.militiaStrength) * (1 + (m.role.warrior || 0) + (m.combat || 0)) * (n.stability / 100 + 0.5);
}
/** The fallen lose their weapons (horses, bows, then spears). */
function loseWeapons(L: Ledger, n: Nation, k: number): void {
  for (const w of Object.keys(WAR.weapon)) { if (k <= 0) break; const q = Math.min(k, Math.floor(n.stock[w] || 0)); if (q) { L.stock(n, w, -q, "battle"); k -= q; } }
}

// ---------------------------------------------------------------- §7.4b real war: clashes, score, the price of peace

const NO_SIDE: WarSide = { score: 0, dead: 0, clashes: 0, battles: 0, tiles: 0, centres: 0, raids: 0 };
/** One side's tally in a war (read only: zeros for a side with none yet). */
export function warSide(w: War, id: number): WarSide { return w.tally?.[String(id)] ?? NO_SIDE; }
function bumpSide(w: War, id: number): WarSide { return ((w.tally ??= {})[String(id)] ??= { ...NO_SIDE }); }
/** The war score lead of `id` over its enemy in this war (negative: behind). */
export function warLead(w: War, id: number): number {
  const foe = w.a === id ? w.b : w.a;
  return Math.round((warSide(w, id).score - warSide(w, foe).score) * 10) / 10;
}
/** Tiles of `a` that touch land or water of `b`. */
export function touching(world: World, a: number, b: number): number[] {
  const out: number[] = [];
  for (const t of world.tiles) if (t.owner === a && NEIGHBORS[t.i].some(j => world.tiles[j].owner === b)) out.push(t.i);
  return out;
}
/** §7.4b Why a peace offered now is too early, or null: a white peace waits WAR.peaceAfter turns of fighting. */
export function peaceTooEarly(world: World, a: number, b: number, tribute: Record<string, number>, duration: number | null, cede: number[]): string | null {
  const w = pendingOrActiveWar(world, a, b);
  if (!w) return null;
  const from = w.start + WAR.peaceAfter;
  if (world.tick >= from || cede.length) return null;
  if (worth(world, tribute) >= WAR.earlyTribute && (duration === null || duration >= WAR.earlyTurns)) return null;
  return `Chiến tranh mới bắt đầu: hòa trắng chỉ ký được từ lượt ${from}. Muốn dừng sớm hơn, hòa ước phải có điều khoản: cống nạp đáng ≥ ${WAR.earlyTribute} (giá thế giới) mỗi lượt trong ≥ ${WAR.earlyTurns} lượt (tribute, duration), hoặc nhượng ít nhất 1 ô (cede)`;
}
/** §7.4b What a peace signed now would bring, seen from `id`: the winner by the score, the share of stores and the tiles the loser pays. */
export function peaceOutlook(w: War, id: number): { lead: number; winner: number | null; share: number; tiles: number; whiteFrom: number } {
  const lead = warLead(w, id), foe = w.a === id ? w.b : w.a, k = Math.abs(lead), R = WAR.reparation;
  const winner = lead >= WAR.decisive ? id : lead <= -WAR.decisive ? foe : null;
  return { lead, winner, share: winner === null ? 0 : Math.min(R.maxShare, k * R.perPoint), tiles: winner === null ? 0 : Math.min(R.maxTiles, Math.floor(k / R.tileEvery)), whiteFrom: w.start + WAR.peaceAfter };
}
/** §7.4b A peace is signed: the war score decides who won; the loser pays reparations at once (stores and border tiles);
 *  a peace with no winner and no terms costs the side that declared. */
function settlePeace(world: World, t: Treaty, payer: number, L: Ledger, say: Say): void {
  const w = pendingOrActiveWar(world, t.a, t.b);
  if (!w) return;
  const A = world.nations[w.a], B = world.nations[w.b], o = peaceOutlook(w, A.id);
  const P = world.nations[payer];
  const terms = [Object.keys(t.tribute).length ? `${P.name} nộp ${fmtGoods(world, t.tribute)} mỗi lượt${t.end !== null ? ` trong ${t.end - t.start} lượt` : ""}` : "", t.cede.length ? `${P.name} nhượng ${t.cede.length} ô` : ""].filter(Boolean).join("; ");
  const reparations: Record<string, number> = {};
  let tiles = 0;
  const score = (id: number) => Math.round(warSide(w, id).score);
  if (o.winner !== null) {
    const W = world.nations[o.winner], Lo = o.winner === A.id ? B : A;
    for (const k of Object.keys(Lo.stock).sort()) {
      const q = Math.floor((Lo.stock[k] || 0) * o.share * 10) / 10;
      if (q < 0.5) continue;
      L.stock(Lo, k, -q, "reparation"); L.stock(W, k, q, "reparation"); reparations[k] = q;
    }
    // border tiles (never a centre), less any the treaty itself already ceded to the winner
    const centres = new Set([Lo.capital, ...Lo.settlements.map(x => x.tile)]);
    const owe = Math.max(0, o.tiles - (payer === Lo.id ? t.cede.length : 0));
    const near = (i: number) => NEIGHBORS[i].filter(j => world.tiles[j].owner === W.id).length;
    const edge = touching(world, Lo.id, W.id).filter(i => !centres.has(i) && world.tiles[i].land).sort((x, y) => near(y) - near(x) || x - y);
    for (const i of edge.slice(0, owe)) { world.tiles[i].owner = W.id; moveBuildings(Lo, W, i); tiles++; }
    const what = `${Object.keys(reparations).length ? `${Math.round(o.share * 100)}% kho (${fmtGoods(world, reparations)})` : "kho trống, không có gì để bồi thường"}${tiles ? ` và ${tiles} ô biên giới` : ""}`;
    say(W.id, "treaty", `Hòa ước kết thúc chiến tranh ${A.name} – ${B.name}: ${W.name} thắng (điểm chiến tranh ${score(W.id)} – ${score(Lo.id)}). ${Lo.name} bồi thường ${what}.`);
    W.lastEvents.push(`Thắng cuộc chiến với ${Lo.name}: họ bồi thường ${what}.`);
    Lo.lastEvents.push(`Thua cuộc chiến với ${W.name}: ta bồi thường ${what}.`);
  } else if (!terms) {
    // blood for nothing: the side that declared answers to its people
    A.stability = Math.max(0, A.stability - WAR.whiteStability);
    A.lastEvents.push(`Hòa trắng với ${B.name}: máu đã đổ mà không được gì, dân oán (−${WAR.whiteStability} ổn định).`);
    say(A.id, "treaty", `Chiến tranh ${A.name} – ${B.name} kết thúc bằng hòa trắng: không bên nào thắng (điểm ${score(A.id)} – ${score(B.id)}).`);
  }
  w.peace = { tick: world.tick, winner: o.winner, lead: Math.abs(o.lead), reparations, tiles, white: o.winner === null && !terms, ...(terms ? { terms } : {}) };
}

/** §7.4b Every turn of a war, wherever the two lands touch, their armies clash on their own: each sends WAR.clash.engage of
 *  its warriors and of its militia, in the share of its front that faces this enemy. The weaker side bleeds more; a side
 *  WAR.clash.push× as strong takes a border tile. Nobody has to give an order for men to die at a front. */
function borderClashes(world: World, tick: number, L: Ledger, say: Say): void {
  for (const w of world.wars) {
    if (w.end !== null || w.start > tick) continue;
    const A = world.nations[w.a], B = world.nations[w.b];
    if (!A.alive || !B.alive) continue;
    const edgeA = touching(world, A.id, B.id), edgeB = touching(world, B.id, A.id);
    if (!edgeA.length || !edgeB.length) continue;
    const r = rngFor(world.seed, tick, "clash", w.id);
    const side = (x: Nation, len: number, foe: Nation) => {
      const share = Math.min(1, len / Math.max(1, borderTiles(world, x.id)));
      const men = Math.floor(x.labor.warrior * share * WAR.clash.engage);
      const militia = Math.max(1, Math.floor(workers(x) * WAR.militiaShare * share * WAR.clash.engage));
      // §4.5 the old nation fights the traitors harder
      const str = armyStrength(world, x, men, militia) * (foe.origin?.from === x.id ? 1 + KIN.vengeance : 1) * (WAR.luck[0] + r() * (WAR.luck[1] - WAR.luck[0]));
      return { x, men, militia, str };
    };
    const sa = side(A, edgeA.length, B), sb = side(B, edgeB.length, A);
    const [win, lose] = sa.str >= sb.str ? [sa, sb] : [sb, sa];
    const kill = (s: typeof sa, [lo, hi]: number[], min: number) => {
      const engaged = s.men + s.militia;
      const k = Math.min(engaged, Math.max(0, s.x.population - 5), Math.max(min, Math.round(engaged * (lo + r() * (hi - lo)))));
      const gone = take(s.x, k, "war"), dead = gone.m.reduce((a, b) => a + b, 0) + gone.f.reduce((a, b) => a + b, 0);
      const kw = Math.min(s.men, dead, Math.round(dead * s.men / Math.max(1, engaged)));
      s.x.labor.warrior = Math.max(0, s.x.labor.warrior - kw); loseWeapons(L, s.x, kw);
      return dead;
    };
    const dl = kill(lose, WAR.clash.lose, 1), dw = kill(win, WAR.clash.win, 0);
    const sw = bumpSide(w, win.x.id), sl = bumpSide(w, lose.x.id);
    sw.clashes++; sw.score += WAR.score.clash + dl * WAR.score.perDead; sw.dead += dw;
    sl.score += dw * WAR.score.perDead; sl.dead += dl;
    // where: a tile of the loser on the line
    const edge = win === sa ? edgeB : edgeA, at = edge[Math.floor(r() * edge.length)];
    const from = NEIGHBORS[at].find(j => world.tiles[j].owner === win.x.id) ?? win.x.capital;
    fx({ kind: "battle", tile: at, nation: win.x.id, from, n: win.men + win.militia, text: `won:clash:${lose.x.name}` });
    w.lastTile = at;
    fxDeath(at, lose.x.id, dl, "battle"); fxDeath(at, win.x.id, dw, "battle");
    // twice as strong: the line moves, a border tile changes hands (never a centre)
    let took = "";
    if (win.str >= WAR.clash.push * lose.str) {
      const centres = new Set([lose.x.capital, ...lose.x.settlements.map(x => x.tile)]);
      const near = (i: number) => NEIGHBORS[i].filter(j => world.tiles[j].owner === win.x.id).length;
      const tile = edge.filter(i => !centres.has(i) && world.tiles[i].land).sort((x, y) => near(y) - near(x) || x - y)[0];
      if (tile !== undefined) { captureTile(world, win.x, lose.x, tile, say, L); sw.tiles++; sw.score += WAR.score.tile; took = ` và đẩy lùi biên giới, chiếm ô (${col(tile)}, ${row(tile)})`; }
    }
    const S = (x: number) => Math.round(x * 10) / 10;
    say(win.x.id, "battle", `Giao tranh biên giới ${win.x.name} – ${lose.x.name}: ${win.x.name} thắng (${S(win.str)} vs ${S(lose.str)}), thương vong ${dw} / ${dl}${took}.`);
    win.x.lastEvents.push(`Giao tranh biên giới với ${lose.x.name}: ta thắng (${win.men} chiến binh + ${win.militia} dân quân, sức ${S(win.str)} vs ${S(lose.str)}), ta mất ${dw} người, họ mất ${dl}${took}.`);
    lose.x.lastEvents.push(`Giao tranh biên giới với ${win.x.name}: ta thua (${lose.men} chiến binh + ${lose.militia} dân quân, sức ${S(lose.str)} vs ${S(win.str)}), ta mất ${dl} người, họ mất ${dw}${took ? "; họ đẩy lùi biên giới, chiếm một ô của ta" : ""}. Cần thêm chiến binh ở biên giới, hoặc cầu hòa.`);
  }
}

/** Take a tile. A capital or settlement falls only when the attacker holds WAR.centreFallsAt of its land neighbours. */
function captureTile(world: World, A: Nation, D: Nation, tile: number, say: Say, L: Ledger): string {
  let fallen: Record<string, number> | null = null; // §7.4 the whole of a fallen nation's stores
  const centres = [D.capital, ...D.settlements.map(s => s.tile)];
  loseLand(world, A, D, tile);
  if (centres.includes(tile)) {
    const held = NEIGHBORS[tile].filter(j => world.tiles[j].land && world.tiles[j].owner === A.id).length, need = centreFallNeed(world, tile);
    if (held < need) return `trung tâm chưa bị vây đủ (${held}/${need} ô kề) nên không thất thủ`;
    world.tiles[tile].owner = A.id;
    if (tile === D.capital) {
      if (D.settlements.length) {
        const next = D.settlements.shift()!;
        D.capital = next.tile;
        say(D.id, "fall", `Thủ đô ${D.capitalName} thất thủ; ${D.name} dời đô về ${next.name}.`);
        D.capitalName = next.name;
      } else if (D.origin?.from === A.id) {
        // §4.5 the old nation takes back what split from it: land, people and stores
        for (const t of world.tiles) if (t.owner === D.id) { t.owner = A.id; moveBuildings(D, A, t.i); }
        addPeople(A, takePeople(D, D.population, "migrate"));
        for (const [g, q] of Object.entries(D.stock)) if (q > 0) { L.stock(D, g, -q, "reunite"); L.stock(A, g, q, "reunite"); }
        D.alive = false; D.status = "dead"; D.population = 0; D.fate = { tick: world.tick, cause: "reunited", by: A.id };
        say(D.id, "fall", `Thủ đô ${D.capitalName} thất thủ. ${D.name} trở về với ${A.name}: đất, dân và kho nhập lại như xưa.`);
      } else {
        fallen = fallTo(world, A, D, L, say);
      }
    } else {
      D.settlements = D.settlements.filter(s => s.tile !== tile);
      say(D.id, "fall", `${A.name} chiếm điểm định cư của ${D.name}.`);
    }
    moveBuildings(D, A, tile);
    return fallen && Object.keys(fallen).length ? `chiếm được trung tâm, thu ${fmtGoods(world, fallen)}` : "chiếm được trung tâm";
  }
  world.tiles[tile].owner = A.id;
  moveBuildings(D, A, tile);
  return "chiếm được ô";
}
/** §2.9 A tile lost to an enemy: its hamlet's families stay under the new ruler, the loser's people are shaken and
 *  may win it back with a just cause. */
function loseLand(world: World, A: Nation, D: Nation, tile: number): void {
  const t = world.tiles[tile], k = Math.min(Math.max(0, D.population - 5), t.land ? (HAMLET.people[t.terrain] || 0) + (t.river && HAMLET.people[t.terrain] ? HAMLET.river : 0) : 0);
  if (k > 0) { addPeople(A, takePeople(D, k, "migrate")); noteExodus(D, world.tick, k, A.id, "conquest"); }
  D.stability = Math.max(0, D.stability - LAND.lostStability);
  D.discontent = Math.min(100, (D.discontent ?? 0) + LAND.lostDiscontent);
  D.casusBelli[String(A.id)] = Math.max(D.casusBelli[String(A.id)] ?? -1, world.tick + LAND.reclaimTicks);
  D.lastEvents.push(`Mất ô (${col(tile)}, ${row(tile)}) vào tay ${A.name}${k ? `, cùng ${k} người sống ở đó` : ""}: −${LAND.lostStability} ổn định. Có chính nghĩa đòi lại đất tới lượt ${world.tick + LAND.reclaimTicks}.`);
  // §4.5 land between the old nation and the traitors stirs both peoples
  if (D.origin?.from === A.id) { A.stability = Math.min(100, A.stability + KIN.retake); A.lastEvents.push(`Lấy lại ô (${col(tile)}, ${row(tile)}) từ kẻ phản bội ${D.name}: dân hả hê (+${KIN.retake} ổn định).`); }
  if (A.origin?.from === D.id) { D.stability = Math.max(0, D.stability - KIN.retake); D.lastEvents.push(`Kẻ phản bội ${A.name} chiếm đất của ta: nỗi nhục (−${KIN.retake} ổn định nữa).`); }
}
/** §4.5 Two nations, one of which split from the other. */
export function kin(a: Nation, b: Nation): boolean { return a.origin?.from === b.id || b.origin?.from === a.id; }
/** §4.5 A nation and the faction that betrayed it are hostile until a peace or vassalage is signed. */
export function hostile(world: World, a: Nation, b: Nation): boolean {
  return kin(a, b) && !treatiesBetween(world, a.id, b.id, KIN.makePeace as never).length;
}
/** §4.5 Each turn: the old nation and the traitors always know each other, every treaty of friendship between them
 *  falls, and no trade offer stands between them while they are hostile. Worlds from before keep this too. */
export function betrayalPhase(world: World, say: Say): void {
  for (const c of world.nations) {
    const p = c.origin ? world.nations[c.origin.from] : undefined;
    if (!p || !c.alive || !p.alive || !c.founded || !p.founded) continue;
    if (!c.met.includes(p.id)) c.met.push(p.id);
    if (!p.met.includes(c.id)) p.met.push(c.id);
    for (const tr of treatiesBetween(world, p.id, c.id, KIN.noTreaty as never)) {
      tr.active = false; tr.end = world.tick; tr.endedBy = "bị hủy: nước gốc và kẻ ly khai không thể là bạn";
      for (const x of [p, c]) x.lastEvents.push(`Hiệp ước ${TREATY_NAME[tr.type]} #${tr.id} với ${(x === p ? c : p).name} bị hủy: ${x === p ? "kẻ phản bội" : "nước cũ coi bạn là kẻ phản bội"} không thể là bạn.`);
      say(p.id, "treaty", `${p.name} và ${c.name} — nước gốc và kẻ ly khai — không thể là bạn: hiệp ước ${TREATY_NAME[tr.type]} bị hủy.`);
    }
    // §7.9 hostile kin trade only through their truce markets: offers beyond them lapse
    if (hostile(world, p, c) && truceLeft(world, p.id, c.id) <= 0) for (const o of world.tradeOffers) if (o.status === "open" && ((o.from === p.id && o.to === c.id) || (o.from === c.id && o.to === p.id))) o.status = "expired";
  }
}

/** §7.4 A nation falls to another: its people live on (a fifth flee), its land, buildings and stores pass to the victor. */
export function fallTo(world: World, A: Nation, D: Nation, L: Ledger, say: Say): Record<string, number> {
  const flee = Math.floor(D.population * WAR.fallFlee);
  const refuge = D.met.map(id => world.nations[id]).filter(o => o?.alive && o.founded && o.id !== A.id && o.id !== D.id).sort((a, b) => b.stability - a.stability || a.id - b.id)[0];
  let fled = 0;
  if (refuge && flee > 0) { fled = flee; addPeople(refuge, takePeople(D, flee, "migrate")); noteExodus(D, world.tick, flee, refuge.id, "conquest"); refuge.lastEvents.push(`${flee} người ${D.name} chạy nạn sang nước ta khi nước họ sụp đổ.`); }
  const stay = D.population;
  if (stay > 0) addPeople(A, takePeople(D, stay, "migrate"));
  let land = 0;
  for (const t of world.tiles) if (t.owner === D.id) { t.owner = A.id; moveBuildings(D, A, t.i); land++; }
  const got: Record<string, number> = {};
  for (const [g, q] of Object.entries(D.stock)) if (q > 0) { L.stock(D, g, -q, "loot"); L.stock(A, g, q, "loot"); got[g] = q; }
  D.alive = false; D.status = "dead"; D.population = 0; D.fate = { tick: world.tick, cause: "conquest", by: A.id };
  A.stability = Math.max(0, A.stability - WAR.fallStability);
  A.lastEvents.push(`${D.name} sụp đổ: ${stay} người của họ trở thành dân ta, ${land} ô đất và kho của họ về tay ta. Dân mới chưa phục (−${WAR.fallStability} ổn định).`);
  say(D.id, "fall", `Thủ đô ${D.capitalName} thất thủ. ${D.name} diệt vong dưới tay ${A.name}: ${stay} người sống dưới quyền ${A.name}${fled ? `, ${fled} người chạy sang ${refuge!.name}` : ""}.`);
  return got;
}
function moveBuildings(from: Nation, to: Nation, tile: number): void {
  const taken = from.buildings.filter(b => b.tile === tile);
  from.buildings = from.buildings.filter(b => b.tile !== tile);
  to.buildings.push(...taken);
}

/** §7.4b A nation's wars as it sees them: the score, the dead, the front, what a peace now would bring, and targets. */
export function warSummary(world: World, n: Nation): Array<Record<string, unknown>> {
  return world.wars.filter(w => w.end === null && (w.a === n.id || w.b === n.id)).map(w => {
    const foe = world.nations[w.a === n.id ? w.b : w.a], us = warSide(w, n.id), them = warSide(w, foe.id), o = peaceOutlook(w, n.id);
    const front = touching(world, n.id, foe.id).length;
    const centres = new Set([foe.capital, ...foe.settlements.map(s => s.tile)]);
    const targets = touching(world, foe.id, n.id).filter(i => world.tiles[i].land).map(i => ({ i, ours: NEIGHBORS[i].filter(j => world.tiles[j].owner === n.id).length }))
      .sort((a, b) => b.ours - a.ours || a.i - b.i).slice(0, 4)
      .map(({ i, ours }) => ({ tile: [col(i), row(i)], terrain: world.tiles[i].terrain, centre: centres.has(i), front_cap: frontCap(world, n.id, i), our_tiles_touching: ours }));
    const r1 = (x: number) => Math.round(x * 10) / 10;
    const peace = o.winner === null
      ? world.tick < o.whiteFrom ? `no white peace before turn ${o.whiteFrom}: until then a peace needs terms (tribute worth ≥ ${WAR.earlyTribute}/turn for ≥ ${WAR.earlyTurns} turns, or ≥ 1 ceded tile)` : `a peace now would be a white peace (no winner)${w.a === n.id ? `: you declared, so you would lose ${WAR.whiteStability} stability` : ""}`
      : `a peace now: ${o.winner === n.id ? `you WIN and ${foe.name} pays` : `you LOSE and pay ${foe.name}`} reparations of ${Math.round(o.share * 100)}% of every good in store${o.tiles ? ` and ${o.tiles} border tile(s)` : ""}`;
    return {
      id: w.id, enemy: foe.name, started: w.start, active: w.start <= world.tick, we_declared: w.a === n.id, reason: w.reason || undefined,
      turns: Math.max(0, world.tick - w.start), score: { us: r1(us.score), them: r1(them.score), lead: o.lead },
      dead: { us: us.dead, them: them.dead }, clashes_won: { us: us.clashes, them: them.clashes }, battles_won: { us: us.battles, them: them.battles }, tiles_taken: { us: us.tiles + us.centres, them: them.tiles + them.centres },
      front_tiles: front, peace_if_signed_now: peace, white_peace_from: o.whiteFrom,
      losing: o.lead <= -WAR.losingBy ? `behind by ${-o.lead}: −1 stability and +1 discontent every turn` : undefined,
      targets: targets.length ? targets : undefined,
    };
  });
}
export { within };
