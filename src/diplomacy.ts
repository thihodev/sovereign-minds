// §7 Relations between nations: messages, treaties, trade, war, vassals.
// Called by engine.step(); everything here is deterministic.

import { NEIGHBORS, col, row, dist, within } from "./hex.ts";
import { rngFor } from "./rng.ts";
import {
  GESTURES, INJECTION, MESSAGE_MAX, SHARED_LANGUAGE_TRADES, TERRAIN, TRADE, TREATY, TREATY_NAME, TREATY_TYPES, WAR,
} from "./rules.ts";
import { buildingOf, goodName, knownGood } from "./catalog.ts";
import type { Ledger } from "./engine.ts";
import { mods, ownedTiles, parseTile } from "./engine.ts";
import type { Battle, Nation, Treaty, TreatyType, War, World } from "./types.ts";

export type Say = (nation: number | null, kind: string, text: string) => void;
export interface Strike { n: Nation; target: Nation; tile: number; warriors: number; kind: "attack" | "raid" }
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
  if (t.some(x => x.type === "non_aggression")) return "bất tương xâm";
  return world.nations[a].met.includes(b) ? "đã gặp" : "chưa biết";
}
export function sharedLanguage(world: World, a: Nation, b: Nation): boolean {
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
function findTarget(world: World, n: Nation, v: unknown): Nation | string {
  const o = typeof v === "number" ? world.nations[v] : world.nations.find(x => x.founded && x.name.toLowerCase() === String(v ?? "").trim().toLowerCase());
  if (!o || o.id === n.id) return "Không tìm thấy quốc gia đó";
  if (!o.alive) return `${o.name} đã diệt vong`;
  if (!n.met.includes(o.id)) return `Chưa gặp ${o.name}`;
  return o;
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
      return null;
    }
    case "trade_offer": {
      const o = findTarget(world, n, a.to); if (typeof o === "string") return o;
      if (pendingOrActiveWar(world, n.id, o.id)) return `Đang chiến tranh với ${o.name}`;
      const give = goods(world, a.give, TRADE.maxQty); if (typeof give === "string") return `give: ${give}`;
      const get = goods(world, a.get, TRADE.maxQty); if (typeof get === "string") return `get: ${get}`;
      if (!has(n, give)) return "Kho không đủ hàng để đưa";
      const id = world.nextId++;
      world.tradeOffers.push({ id, from: n.id, to: o.id, give, get, tick, status: "open" });
      o.lastEvents.push(`${n.name} đề nghị trao đổi #${id}: đưa ${fmtGoods(world, give)} để lấy ${fmtGoods(world, get)}.`);
      return null;
    }
    case "accept_trade": {
      const id = Math.floor(Number(a.offer ?? a.id));
      const off = world.tradeOffers.find(x => x.id === id);
      if (!off || off.to !== n.id) return `Không có đề nghị trao đổi #${id} gửi cho bạn`;
      if (off.status !== "open" || tick - off.tick > TRADE.offerTicks) return "Đề nghị đã hết hạn";
      ctx.accepts.push({ n, offer: id });
      return null;
    }
    case "treaty": {
      const o = findTarget(world, n, a.to); if (typeof o === "string") return o;
      const t = String(a.kind ?? a.treaty ?? "") as TreatyType;
      if (!TREATY_TYPES.includes(t)) return `Loại hiệp ước phải là: ${TREATY_TYPES.join(", ")}`;
      if (t !== "peace" && pendingOrActiveWar(world, n.id, o.id)) return "Đang chiến tranh: chỉ đề nghị được hiệp ước hòa bình (peace)";
      if (t === "peace" && !pendingOrActiveWar(world, n.id, o.id)) return "Hai nước không có chiến tranh";
      const dur = a.duration === null || a.duration === undefined ? null : Math.floor(Number(a.duration));
      if (dur !== null && !(dur >= TREATY.minDuration && dur <= TREATY.maxDuration)) return `Thời hạn ${TREATY.minDuration}–${TREATY.maxDuration} lượt, hoặc bỏ trống là vĩnh viễn`;
      let tribute: Record<string, number> = {};
      if (a.tribute) { const g = goods(world, a.tribute, TREATY.maxTributePerGood); if (typeof g === "string") return `tribute: ${g}`; tribute = g; }
      if ((t === "tribute" || t === "vassal") && !Object.keys(tribute).length) return "Hiệp ước cống nạp/chư hầu cần tribute";
      const cede: number[] = [];
      for (const c of Array.isArray(a.cede) ? a.cede.slice(0, TREATY.maxCede) : []) { const i = parseTile(c); if (i >= 0) cede.push(i); }
      // payer: who pays tribute and cedes tiles. Default: the proposer.
      const payerIsMe = String(a.payer ?? "me") !== "them";
      const from = payerIsMe ? n.id : o.id;
      if (cede.some(i => world.tiles[i].owner !== from)) return "Chỉ nhượng được ô thuộc bên trả";
      const id = world.nextId++;
      world.treatyOffers.push({ id, from: n.id, to: o.id, type: t, duration: dur, tribute, cede, payer: from, tick });
      o.lastEvents.push(`${n.name} đề nghị hiệp ước ${TREATY_NAME[t]} #${id}${Object.keys(tribute).length ? `, ${world.nations[from].name} nộp ${fmtGoods(world, tribute)} mỗi lượt` : ""}${cede.length ? `, nhượng ${cede.length} ô` : ""}${dur ? `, ${dur} lượt` : ""}. Trả lời bằng accept_treaty.`);
      return null;
    }
    case "accept_treaty": {
      const id = Math.floor(Number(a.offer ?? a.id));
      const off = world.treatyOffers.find(x => x.id === id);
      if (!off || off.to !== n.id) return `Không có đề nghị hiệp ước #${id} gửi cho bạn`;
      if (tick - off.tick > TREATY.offerTicks) return "Đề nghị đã hết hạn";
      ctx.treatyAccepts.push({ n, offer: id });
      return null;
    }
    case "break_treaty": {
      const id = Math.floor(Number(a.treaty ?? a.id));
      const t = world.treaties.find(x => x.id === id && x.active && (x.a === n.id || x.b === n.id));
      if (!t) return `Không có hiệp ước #${id} của bạn`;
      if (t.type === "vassal" && t.a === n.id) return "Chư hầu không phá ước được; dùng declare_independence";
      t.end = tick + 1; t.brokenBy = n.id;
      n.reputation = Math.max(0, n.reputation - TREATY.breakPenalty);
      const o = world.nations[t.a === n.id ? t.b : t.a];
      say(n.id, "treaty", `${n.name} xé hiệp ước ${TREATY_NAME[t.type]} với ${o.name}. Uy tín −${TREATY.breakPenalty}.`);
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
      const free = (n.casusBelli[String(o.id)] ?? -1) >= tick || type === "declare_independence";
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
      const reach = mods(world, n).caps.has("đi-nước") ? WAR.reachSail : WAR.reach;
      const near = ownedTiles(world, n.id).some(t => dist(t.i, tile) <= reach);
      if (kind === "attack" && !near) return `Ô mục tiêu cách lãnh thổ bạn quá ${reach} ô`;
      if (kind === "raid" && landGap(world, n.id, target.id) > reach + 3) return "Quá xa để đột kích";
      if (kind === "attack" && world.tiles[tile].terrain === "mountain" && !mods(world, n).move.has("mountain")) return "Không vượt núi được";
      ctx.strikes.push({ n, target, tile, warriors, kind });
      return null;
    }
  }
  return "Không có hành động này";
}

export function fmtGoods(world: World, g: Record<string, number>): string {
  return Object.entries(g).map(([k, q]) => `${Math.round(q * 10) / 10} ${goodName(world, k)}`).join(", ");
}

function startWar(world: World, n: Nation, o: Nation, tick: number, reason: string, say: Say): void {
  world.wars.push({ id: world.nextId++, a: n.id, b: o.id, declared: tick, start: tick + 1, end: null, reason });
  say(n.id, "war", `${n.name} tuyên chiến với ${o.name}${reason ? ` (${reason})` : ""}. Chiến sự bắt đầu từ lượt sau.`);
  o.lastEvents.push(`${n.name} tuyên chiến với chúng ta! Chiến sự bắt đầu từ lượt sau.`);
  // Allies and the overlord of the defender join (§7.4, §7.7)
  for (const ally of allies(world, o.id)) {
    const A = world.nations[ally];
    if (!A.alive || ally === n.id || pendingOrActiveWar(world, ally, n.id)) continue;
    world.wars.push({ id: world.nextId++, a: ally, b: n.id, declared: tick, start: tick + 1, end: null, reason: `bảo vệ ${o.name}` });
    if (!A.met.includes(n.id)) A.met.push(n.id);
    say(ally, "war", `${A.name} tham chiến để bảo vệ ${o.name}, chống lại ${n.name}.`);
  }
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
    const t: Treaty = { id: off.id, type: off.type, a: payer, b: receiver, tribute: off.tribute, cede, start: tick, end: off.duration ? tick + off.duration : null, active: true, brokenBy: null };
    if (off.type !== "tribute" && off.type !== "vassal" && !Object.keys(off.tribute).length) { t.a = off.from; t.b = off.to; }
    world.treaties.push(t);
    world.treatyOffers = world.treatyOffers.filter(x => x.id !== offer);
    for (const i of cede) world.tiles[i].owner = receiver;
    if (off.type === "peace") endWar(world, off.from, off.to, tick);
    say(n.id, "treaty", `${from.name} và ${n.name} ký hiệp ước ${TREATY_NAME[off.type]}${cede.length ? `, nhượng ${cede.length} ô` : ""}${Object.keys(off.tribute).length ? `, ${world.nations[payer].name} nộp ${fmtGoods(world, off.tribute)} mỗi lượt` : ""}.`);
  }
  world.treatyOffers = world.treatyOffers.filter(x => tick - x.tick <= TREATY.offerTicks);

  // Treaty upkeep: tribute, expiry
  for (const t of world.treaties) {
    if (!t.active) continue;
    const A = world.nations[t.a], B = world.nations[t.b];
    if (!A.alive || !B.alive) { t.active = false; continue; }
    if (t.end !== null && tick >= t.end) {
      t.active = false;
      if (t.brokenBy === null) { A.reputation = Math.min(100, A.reputation + TREATY.keepBonus); B.reputation = Math.min(100, B.reputation + TREATY.keepBonus); }
      continue;
    }
    if (Object.keys(t.tribute).length && tick > t.start) {
      if (has(A, t.tribute)) for (const [k, q] of Object.entries(t.tribute)) { L.stock(A, k, -q, "tribute"); L.stock(B, k, q, "tribute"); }
      else { A.reputation = Math.max(0, A.reputation - TREATY.violationPenalty); B.lastEvents.push(`${A.name} không nộp đủ cống phẩm.`); A.lastEvents.push(`Không đủ hàng để nộp cống cho ${B.name}: uy tín −${TREATY.violationPenalty}.`); }
    }
  }

  // Trades
  for (const { n, offer } of ctx.accepts) {
    const off = world.tradeOffers.find(x => x.id === offer); if (!off || off.status !== "open") continue;
    const A = world.nations[off.from], B = n;
    if (!A.alive || pendingOrActiveWar(world, A.id, B.id)) { off.status = "failed"; continue; }
    if (!has(A, off.give) || !has(B, off.get)) { off.status = "failed"; A.lastEvents.push(`Trao đổi #${off.id} thất bại: một bên không đủ hàng.`); B.lastEvents.push(`Trao đổi #${off.id} thất bại: một bên không đủ hàng.`); continue; }
    off.status = "done";
    const gap = landGap(world, A.id, B.id), arrive = gap <= TRADE.nearDistance ? tick : tick + Math.ceil(gap / TRADE.caravanSpeed);
    for (const [from, to, g] of [[A, B, off.give], [B, A, off.get]] as Array<[Nation, Nation, Record<string, number>]>) {
      for (const [k, q] of Object.entries(g)) L.stock(from, k, -q, "trade");
      if (arrive === tick) for (const [k, q] of Object.entries(g)) L.stock(to, k, q, "trade");
      else { world.caravans.push({ id: world.nextId++, from: from.id, to: to.id, goods: { ...g }, arrive, offer: off.id }); L.toCaravan(g); }
    }
    A.trades[String(B.id)] = (A.trades[String(B.id)] || 0) + 1; B.trades[String(A.id)] = (B.trades[String(A.id)] || 0) + 1;
    say(B.id, "trade", `${A.name} và ${B.name} trao đổi: ${fmtGoods(world, off.give)} ⇄ ${fmtGoods(world, off.get)}${arrive > tick ? ` (đoàn buôn tới sau ${arrive - tick} lượt)` : ""}.`);
  }
  for (const o of world.tradeOffers) if (o.status === "open" && tick - o.tick > TRADE.offerTicks) o.status = "expired";
  world.tradeOffers = world.tradeOffers.filter(o => tick - o.tick <= 20);

  // Caravans arrive; food spoils on the road
  for (const c of world.caravans) {
    const to = world.nations[c.to];
    if (c.arrive > tick) { if (c.goods.food) { const lost = c.goods.food * 0.3; c.goods.food -= lost; L.caravanLoss("food", lost); } continue; }
    for (const [k, q] of Object.entries(c.goods)) { L.caravanLoss(k, q); if (to.alive) L.stock(to, k, q, "caravan"); }
    if (to.alive) to.lastEvents.push(`Đoàn buôn từ ${world.nations[c.from].name} tới nơi: ${fmtGoods(world, c.goods)}.`);
  }
  world.caravans = world.caravans.filter(c => c.arrive > tick);
}

/** Battles (§7.4). Defenders split their warriors over all attacks they face this tick. */
export function resolveBattles(ctx: DiploCtx): void {
  const { world, tick, L, say } = ctx;
  const facing = new Map<number, number>();
  for (const s of ctx.strikes) facing.set(s.target.id, (facing.get(s.target.id) || 0) + 1);
  for (const s of ctx.strikes) {
    const A = s.n, D = s.target;
    if (!A.alive || !D.alive || !activeWar(world, A.id, D.id)) continue;
    const r = rngFor(world.seed, tick, "battle", A.id, D.id, s.tile);
    const luck = () => WAR.luck[0] + r() * (WAR.luck[1] - WAR.luck[0]);
    const strength = (n: Nation, men: number, defending: boolean) => {
      if (men <= 0) return 0;
      const m = mods(world, n);
      let weapons = 0, left = men;
      for (const [k, bonus] of Object.entries(WAR.weapon)) { const k2 = Math.min(left, Math.floor(n.stock[k] || 0)); weapons += k2 * bonus; left -= k2; }
      let v = (men + weapons) * (1 + (m.role.warrior || 0) + (m.combat || 0)) * (n.stability / 100 + 0.5) * luck();
      if (defending) {
        const t = world.tiles[s.tile];
        const wall = n.buildings.filter(b => b.done && (b.tile === s.tile || dist(b.tile, s.tile) <= 1)).reduce((x, b) => Math.max(x, buildingOf(world, b.type)?.effect.defense || 0), 0);
        v *= 1 + TERRAIN[t.terrain].defense + wall + (t.river ? 0.25 : 0);
      }
      return v;
    };
    let dMen = Math.floor(D.labor.warrior / (facing.get(D.id) || 1)), militia = false;
    if (dMen <= 0) { dMen = Math.max(1, Math.floor(D.population * 0.7 * WAR.militiaShare)); militia = true; }
    const aStr = strength(A, s.warriors, false), dStr = strength(D, dMen, true) * (militia ? WAR.militiaStrength : 1);
    const won = aStr > dStr;
    const lossRate = (win: boolean) => { const [lo, hi] = win ? WAR.winLoss : WAR.loseLoss; return lo + r() * (hi - lo); };
    const lossA = Math.min(s.warriors, Math.round(s.warriors * lossRate(won))), lossD = Math.min(dMen, Math.round(dMen * lossRate(!won)));
    A.population -= lossA; A.labor.warrior = Math.max(0, A.labor.warrior - lossA);
    D.population -= lossD; if (!militia) D.labor.warrior = Math.max(0, D.labor.warrior - lossD);
    const prisoners = won ? Math.floor(lossD * WAR.prisoners) : 0;
    if (prisoners) { A.population += prisoners; A.stability -= Math.floor(prisoners / 5); }
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
    } else if (won && s.kind === "attack") note = captureTile(world, A, D, s.tile, say);
    world.battles.push({ tick, attacker: A.id, defender: D.id, tile: s.tile, kind: s.kind, a: Math.round(aStr * 10) / 10, d: Math.round(dStr * 10) / 10, won, lossA, lossD, note } as Battle);
    const where = `(${col(s.tile)}, ${row(s.tile)})`;
    say(A.id, "battle", `${A.name} ${s.kind === "raid" ? "đột kích" : "tấn công"} ${D.name} tại ${where}: ${won ? "thắng" : "thua"}. Thương vong ${lossA} / ${lossD}${militia ? " (dân quân)" : ""}${prisoners ? `, bắt ${prisoners} tù binh` : ""}${note ? `; ${note}` : ""}.`);
    D.lastEvents.push(`Bị ${A.name} ${s.kind === "raid" ? "đột kích" : "tấn công"} tại ${where}: ta ${won ? "thua" : "thắng"}, mất ${lossD} người.`);
    A.stability += won ? 1 : -2; D.stability += won ? -3 : 1;
  }
  world.battles = world.battles.slice(-300);

  // War weariness (§7.4)
  for (const w of world.wars) {
    if (w.end !== null || w.start > tick) continue;
    const A = world.nations[w.a], B = world.nations[w.b];
    if (!A.alive || !B.alive) { w.end = tick; continue; }
    if (tick - w.start >= WAR.weariAfter) { A.stability -= 1; B.stability -= 1; }
  }
}

/** Take a tile. A capital or settlement falls only when surrounded. */
function captureTile(world: World, A: Nation, D: Nation, tile: number, say: Say): string {
  const centres = [D.capital, ...D.settlements.map(s => s.tile)];
  if (centres.includes(tile)) {
    const surrounded = NEIGHBORS[tile].every(j => !world.tiles[j].land || world.tiles[j].owner === A.id);
    if (!surrounded) return "trung tâm chưa bị bao vây nên không thất thủ";
    world.tiles[tile].owner = A.id;
    if (tile === D.capital) {
      if (D.settlements.length) {
        const next = D.settlements.shift()!;
        D.capital = next.tile;
        say(D.id, "fall", `Thủ đô ${D.capitalName} thất thủ; ${D.name} dời đô về ${next.name}.`);
        D.capitalName = next.name;
      } else {
        D.alive = false; D.status = "dead"; D.population = 0;
        say(D.id, "fall", `Thủ đô ${D.capitalName} thất thủ. ${D.name} diệt vong dưới tay ${A.name}.`);
        for (const t of world.tiles) if (t.owner === D.id) t.owner = -1;
      }
    } else {
      D.settlements = D.settlements.filter(s => s.tile !== tile);
      say(D.id, "fall", `${A.name} chiếm điểm định cư của ${D.name}.`);
    }
    moveBuildings(D, A, tile);
    return "chiếm được trung tâm";
  }
  world.tiles[tile].owner = A.id;
  moveBuildings(D, A, tile);
  return "chiếm được ô";
}
function moveBuildings(from: Nation, to: Nation, tile: number): void {
  const taken = from.buildings.filter(b => b.tile === tile);
  from.buildings = from.buildings.filter(b => b.tile !== tile);
  to.buildings.push(...taken);
}

export function warSummary(world: World, n: Nation): Array<Record<string, unknown>> {
  return world.wars.filter(w => w.end === null && (w.a === n.id || w.b === n.id)).map(w => ({ id: w.id, enemy: world.nations[w.a === n.id ? w.b : w.a].name, started: w.start, active: w.start <= world.tick, we_declared: w.a === n.id }));
}
export { within };
