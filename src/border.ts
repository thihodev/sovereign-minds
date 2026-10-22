// §7.9 Living borders. Two peoples whose lands touch do not live side by side in silence: their herders,
// hunters and woodcutters meet, quarrel and barter. Each pair of neighbours carries a tension (0–100) that
// grows with the length of their border and falls with treaties, trade and a shared language; it brings
// border incidents, and past a point a just cause for war. Below that, a small border market swaps
// what each has too much of for what the other lacks, every turn, on its own.

import { NEIGHBORS, dist } from "./hex.ts";
import { rngFor } from "./rng.ts";
import { fx } from "./fx.ts";
import { BORDER, GATE, GOOD_VALUE, KIN, ROADS, TOWER, WAR } from "./rules.ts";
import { activeWar, hostile, kin, pendingOrActiveWar, sharedLanguage, startWar, treatiesBetween } from "./diplomacy.ts";
import { buildingOf, goodName } from "./catalog.ts";
import { add as addPeople, mouths, take as takePeople } from "./people.ts";
import { buildingWorks, mods, workers, type Ledger } from "./engine.ts";
import { noteExodus } from "./exodus.ts";
import { quarantined } from "./contagion.ts";
import { price } from "./market.ts";
import { importDuty, marketTax } from "./treasury.ts";
import { hasGreat } from "./greats.ts";
import type { Nation, World } from "./types.ts";

export interface BorderState { tension: number; incidents: Array<{ tick: number; text: string }>; market: number; /** turns in a row at dispute */ dispute?: number;
  /** deadly brawls lately: who lost how many */
  brawls?: Array<{ tick: number; dead: Record<string, number> }>;
  /** §7.9 the turns of truce-market trades between two hostile kin */
  truce?: number[] }
export const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
export function borderOf(world: World, a: number, b: number): BorderState {
  const all = (world.borders ??= {}), k = pairKey(a, b);
  return (all[k] ??= { tension: 0, incidents: [], market: 0 });
}

/** Tiles of `a` that touch the land or water of `b`. */
export function borderLength(world: World, a: number, b: number): number {
  let k = 0;
  for (const t of world.tiles) if (t.owner === a && NEIGHBORS[t.i].some(j => world.tiles[j].owner === b)) k++;
  return k;
}
/** Every other nation whose land lies within BORDER.near tiles: the ones a people truly lives beside. */
export function neighbours(world: World, n: Nation): Array<{ o: Nation; border: number; gap: number }> {
  const mine = world.tiles.filter(t => t.owner === n.id);
  const out: Array<{ o: Nation; border: number; gap: number }> = [];
  for (const o of world.nations) {
    if (o.id === n.id || !o.alive || !o.founded) continue;
    let gap = Infinity;
    for (const t of world.tiles) {
      if (t.owner !== o.id) continue;
      for (const m of mine) { const d = dist(m.i, t.i); if (d < gap) gap = d; if (gap <= 1) break; }
      if (gap <= 1) break;
    }
    if (gap <= BORDER.near) out.push({ o, border: gap <= 1 ? borderLength(world, n.id, o.id) : 0, gap });
  }
  return out;
}

/** What a nation has to spare (beyond what it needs) and what it lacks, for the border market. */
function spare(world: World, n: Nation): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (const [g, q] of Object.entries(n.stock)) {
    if (!GOOD_VALUE[g] || g === "coin") continue;
    const keep = g === "food" ? mouths(n) * mods(world, n).foodPerPerson * 2 : BORDER.marketKeep;
    if (q - keep >= 3) out.push([g, q - keep]);
  }
  return out.sort((a, b) => b[1] * price(world, b[0]) - a[1] * price(world, a[0]) || a[0].localeCompare(b[0]));
}
const lacks = (n: Nation, g: string) => (n.stock[g] || 0) < BORDER.marketLack;
/** §2.1 How many rivers both nations hold land on. */
export function sharedRivers(world: World, a: number, b: number): number {
  let k = 0;
  for (const r of world.rivers) {
    let ha = false, hb = false;
    for (const i of r) { const o = world.tiles[i]?.owner; if (o === a) ha = true; else if (o === b) hb = true; if (ha && hb) break; }
    if (ha && hb) k++;
  }
  return k;
}
/** §7.9 Does nation `n` keep a working building with this border effect (gate, tower) on a tile touching the land of `other`? */
function atBorder(world: World, n: Nation, other: number, key: "gate" | "tower"): boolean {
  return n.buildings.some(b => buildingWorks(world, b) && world.tiles[b.tile].owner === n.id && buildingOf(world, b.type)?.effect[key] && NEIGHBORS[b.tile].some(j => world.tiles[j].owner === other));
}
export const hasGate = (world: World, n: Nation, other: number) => atBorder(world, n, other, "gate");
export const hasTower = (world: World, n: Nation, other: number) => atBorder(world, n, other, "tower");
/** §2.5 Does a road of either side reach the border between them? */
export function roadAtBorder(world: World, a: number, b: number): boolean {
  for (const t of world.tiles) {
    if ((t.road || 0) <= 0 || !t.land || (t.owner !== a && t.owner !== b)) continue;
    const other = t.owner === a ? b : a;
    if (NEIGHBORS[t.i].some(j => world.tiles[j].owner === other)) return true;
  }
  return false;
}

/** One turn of every border (§7.9). `traded` holds the pairs that completed a trade this turn. */
export function borderPhase(world: World, L: Ledger, say: (nation: number | null, kind: string, text: string) => void, traded: Set<string>): void {
  const tick = world.tick, alive = world.nations.filter(n => n.alive && n.founded);
  for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
    const a = alive[i], b = alive[j], len = borderLength(world, a.id, b.id);
    if (!len) { const old = world.borders?.[pairKey(a.id, b.id)]; if (old) old.tension = Math.max(0, old.tension - BORDER.fade * 2); continue; }
    const st = borderOf(world, a.id, b.id);
    // Neighbours always know each other
    if (!a.met.includes(b.id)) a.met.push(b.id);
    if (!b.met.includes(a.id)) b.met.push(a.id);
    if (activeWar(world, a.id, b.id)) { st.tension = 100; continue; }
    let t = st.tension + Math.min(BORDER.frictionMax, len * BORDER.friction) * (kin(a, b) ? KIN.friction : 1) - BORDER.fade; // §4.5 old wounds
    for (const tr of treatiesBetween(world, a.id, b.id)) t -= BORDER.treatyCalm[tr.type] ?? 0;
    if (traded.has(pairKey(a.id, b.id))) t -= BORDER.tradeCalm;
    t += sharedRivers(world, a.id, b.id) * BORDER.riverFriction; // §2.1 one river, two thirsts
    const foes = hostile(world, a, b); // §4.5 the old nation and the traitors
    if (foes) t = Math.max(t, KIN.tensionFloor);
    if (sharedLanguage(world, a, b)) t -= BORDER.languageCalm;
    const r = rngFor(world.seed, tick, "border", a.id, b.id);
    // §7.9 a border gate market of either side keeps the market open longer, trading more and calming more;
    // a watchtower's guards calm the border and keep poachers and brawlers off it
    const ga = hasGate(world, a, b.id), gb = hasGate(world, b, a.id), gate = ga || gb;
    const ta = hasTower(world, a, b.id), tb = hasTower(world, b, a.id);
    t -= (ta ? TOWER.calm : 0) + (tb ? TOWER.calm : 0);
    // A small market at the border, while the peoples are not too wary of each other (and neither is in quarantine, §9.5)
    if (t < BORDER.marketBelow + (gate ? GATE.below : 0) && !foes && !quarantined(a, tick) && !quarantined(b, tick)) {
      const sa = spare(world, a).find(([g]) => lacks(b, g)), sb = spare(world, b).find(([g]) => lacks(a, g));
      if (sa && sb) {
        // §6.3 at world prices
        const pa = price(world, sa[0]), pb = price(world, sb[0]);
        const value = Math.min(BORDER.marketValue * (roadAtBorder(world, a.id, b.id) ? 1 + ROADS.market : 1) * (hasGreat(a, "merchant", tick) || hasGreat(b, "merchant", tick) ? 1.5 : 1) * (gate ? GATE.value : 1), sa[1] * pa, sb[1] * pb); // §2.5 a market on the highway, §4.12 a merchant at it, §7.9 a gate
        const qa = Math.floor(value / pa), qb = Math.floor(value / pb);
        if (qa >= 1 && qb >= 1) {
          L.stock(a, sa[0], -qa, "market"); L.stock(b, sa[0], qa, "market");
          L.stock(b, sb[0], -qb, "market"); L.stock(a, sb[0], qb, "market");
          a.trades[String(b.id)] = (a.trades[String(b.id)] || 0) + 1; b.trades[String(a.id)] = (b.trades[String(a.id)] || 0) + 1;
          st.market++; t -= BORDER.marketCalm + (ga ? GATE.calm : 0) + (gb ? GATE.calm : 0);
          // §4.13 each side's treasury taxes what its merchants sold, and the other side's duty is paid on it
          marketTax(L, a, qa * pa); marketTax(L, b, qb * pb);
          importDuty(world, L, a, b, { [sa[0]]: qa }); importDuty(world, L, b, a, { [sb[0]]: qb });
          const line = (x: Nation, give: [string, number], gq: number, get: [string, number], tq: number, o: Nation) => x.lastEvents.push(`Chợ biên giới với ${o.name}: đổi ${gq} ${goodName(world, give[0])} lấy ${tq} ${goodName(world, get[0])}.`);
          line(a, sa, qa, sb, qb, b); line(b, sb, qb, sa, qa, a);
          if (st.market === 1 || st.market % 20 === 0) say(a.id, "trade", `Chợ biên giới giữa ${a.name} và ${b.name} họp lần thứ ${st.market}.`);
        }
      }
    }
    // Incidents: the more tension, the more often
    if (r() < Math.min(BORDER.incidentMax, t / BORDER.incidentDiv) * (ta || tb ? 1 - TOWER.incidents : 1)) t += incident(world, a, b, st, r, L, say);
    st.tension = Math.max(0, Math.min(100, Math.round(t * 10) / 10));
    // Blood for blood: brawl after brawl and the border goes to war
    const recent = (st.brawls ?? []).filter(x => tick - x.tick < BORDER.brawlWindow);
    if (recent.length >= BORDER.brawlsToWar && !pendingOrActiveWar(world, a.id, b.id) && !treatiesBetween(world, a.id, b.id, ["peace", "alliance", "vassal"]).length) {
      const lost = (x: Nation) => recent.reduce((s, y) => s + (y.dead[String(x.id)] ?? 0), 0);
      // the stronger side takes up the quarrel (the weaker keeps its just cause, and is not driven to war it cannot win)
      const might = (x: Nation) => x.labor.warrior + workers(x) * WAR.militiaShare * WAR.militiaStrength;
      const [avenger, foe] = might(a) > might(b) || (might(a) === might(b) && lost(a) >= lost(b)) ? [a, b] : [b, a];
      foe.casusBelli[String(avenger.id)] = Math.max(foe.casusBelli[String(avenger.id)] ?? -1, tick + BORDER.causeTicks);
      for (const tr of treatiesBetween(world, a.id, b.id, ["non_aggression", "passage"])) { tr.active = false; tr.end = tick; tr.endedBy = "tan vỡ vì xô xát biên giới dẫn tới chiến tranh"; }
      avenger.casusBelli[String(foe.id)] = Math.max(avenger.casusBelli[String(foe.id)] ?? -1, tick + BORDER.causeTicks);
      startWar(world, avenger, foe, tick, `${recent.length} vụ xô xát biên giới trong ${BORDER.brawlWindow} lượt (${lost(a)} người ${a.name}, ${lost(b)} người ${b.name} đã chết)`, say);
      const war = pendingOrActiveWar(world, a.id, b.id)!; war.brawlDead = { [a.id]: lost(a), [b.id]: lost(b) }; // not an ally's war that joined after it
      const terms = `Từ lượt sau quân hai bên giao tranh ở biên giới mỗi lượt, kể cả khi không ai ra lệnh tấn công; hòa trắng chỉ ký được từ lượt ${tick + 1 + WAR.peaceAfter}, và khi ký hòa bên kém điểm chiến tranh ${WAR.decisive}+ phải bồi thường.`;
      avenger.lastEvents.push(`Máu đổ ở biên giới quá nhiều lần (${recent.length} vụ xô xát, ${lost(avenger)} người ta chết): ta mạnh hơn, dân đòi ra tay, ${avenger.name} tuyên chiến với ${foe.name} (có chính nghĩa). ${terms}`);
      foe.lastEvents.push(`${avenger.name} mạnh hơn và đòi nợ máu sau ${recent.length} vụ xô xát biên giới. ${terms}`);
      st.brawls = [];
    }
    // A dispute: both sides may fight with a just cause, and both peoples are uneasy
    if (st.tension >= BORDER.dispute) {
      st.dispute = (st.dispute ?? 0) + 1;
      for (const [x, o] of [[a, b], [b, a]] as const) {
        x.casusBelli[String(o.id)] = Math.max(x.casusBelli[String(o.id)] ?? -1, tick + 1);
        x.stability = Math.max(0, x.stability - BORDER.disputeStability);
      }
      if (tick % 5 === 0) say(a.id, "border", `Biên giới ${a.name} – ${b.name} căng thẳng (${Math.round(st.tension)}/100): hai bên đều có chính nghĩa để tuyên chiến.`);
      // A long dispute tears up the treaties that kept the peace (alliances and vassalage hold)
      if (st.dispute >= BORDER.treatyBreakAfter) {
        // a treaty falls only to a dispute it has itself lived through: the turns of dispute since it was signed
        for (const tr of treatiesBetween(world, a.id, b.id, ["non_aggression", "peace", "passage"]).filter(x => Math.min(st.dispute!, tick - x.start) >= BORDER.treatyBreakAfter)) {
          const turns = Math.min(st.dispute, tick - tr.start);
          tr.active = false; tr.end = tick; tr.endedBy = `tan vỡ sau ${turns} lượt tranh chấp biên giới`;
          for (const x of [a, b]) x.lastEvents.push(`Hiệp ước ${tr.type === "peace" ? "hòa bình" : tr.type === "passage" ? "thông hành" : "bất tương xâm"} #${tr.id} với ${(x === a ? b : a).name} tan vỡ sau ${turns} lượt tranh chấp biên giới. Hai bên có chính nghĩa: tuyên chiến không mất uy tín.`);
          say(a.id, "treaty", `Tranh chấp biên giới kéo dài: hiệp ước giữa ${a.name} và ${b.name} tan vỡ.`);
        }
      }
    } else st.dispute = 0;
  }
}

/** A border incident between two neighbours; returns how much it raised the tension. */
function incident(world: World, a: Nation, b: Nation, st: BorderState, r: () => number, L: Ledger, say: (nation: number | null, kind: string, text: string) => void): number {
  const tick = world.tick, [culprit, victim] = r() < 0.5 ? [a, b] : [b, a];
  const edge = world.tiles.filter(t => t.owner === victim.id && NEIGHBORS[t.i].some(j => world.tiles[j].owner === culprit.id));
  const at = edge[Math.floor(r() * edge.length)] ?? world.tiles[victim.capital];
  const roll = r();
  let text = "", rise = 0;
  if (roll < 0.4) {
    // Poaching or felling on the other side
    const key = (at.res.game || 0) >= (at.res.wood || 0) ? "game" : "wood";
    const q = Math.min(at.res[key] || 0, BORDER.poach);
    if (q > 0) { L.tile(at, key, -q, "poach"); L.stock(culprit, key === "game" ? "food" : "wood", q, "poach"); }
    text = `${key === "game" ? "Thợ săn" : "Tiều phu"} ${culprit.name} vượt biên sang đất ${victim.name} ${key === "game" ? "săn trộm" : "đốn gỗ"} (${Math.round(q)} ${key === "game" ? "lương thực" : "gỗ"})`;
    rise = BORDER.rise.poach;
    victim.casusBelli[String(culprit.id)] = Math.max(victim.casusBelli[String(culprit.id)] ?? -1, tick + BORDER.causeTicks);
  } else if (roll < 0.7) {
    // A brawl between herders: a few dead on each side
    const da = Math.min(2, Math.max(1, Math.floor(r() * 3))), db = Math.min(2, Math.max(0, Math.floor(r() * 3)));
    takePeople(victim, Math.min(da, Math.max(0, victim.population - 5)), "brawl");
    takePeople(culprit, Math.min(db, Math.max(0, culprit.population - 5)), "brawl");
    text = `Xô xát ở biên giới giữa người ${culprit.name} và ${victim.name}: ${da} người ${victim.name} và ${db} người ${culprit.name} chết`;
    st.brawls = [...(st.brawls ?? []).filter(x => tick - x.tick < BORDER.brawlWindow), { tick, dead: { [victim.id]: da, [culprit.id]: db } }];
    rise = BORDER.rise.brawl;
    victim.casusBelli[String(culprit.id)] = Math.max(victim.casusBelli[String(culprit.id)] ?? -1, tick + BORDER.causeTicks);
    // a brawl, not a battle: no war, no winner (the Watcher's strip says so)
    fx({ kind: "brawl", tile: at.i, nation: culprit.id, n: da + db, text: victim.name });
  } else {
    // Families cross from the restless side to the calmer one
    const [from, to] = a.stability < b.stability ? [a, b] : [b, a];
    const k = Math.min(BORDER.crossers, Math.max(0, from.population - 10));
    if (k > 0) { const who = takePeople(from, k, "migrate"); addPeople(to, who); noteExodus(from, world.tick, k, to.id, "border"); fx({ kind: "migrate", tile: from.capital, nation: from.id, n: k, to: to.capital }); }
    text = `${k} người ${from.name} vượt biên sang sống ở ${to.name}`;
    rise = BORDER.rise.crossing;
  }
  st.incidents = [...st.incidents, { tick, text }].slice(-5);
  for (const x of [a, b]) x.lastEvents.push(`Sự cố biên giới: ${text}. Căng thẳng với ${(x === a ? b : a).name} tăng.`);
  say(victim.id, "border", `${text}.`);
  return rise;
}
