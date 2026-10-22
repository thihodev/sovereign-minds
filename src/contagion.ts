// §9.5 Contagion and quarantine, §9.6 diseases. A sickness does not stay home: while a people is sick it can pass its
// disease to the peoples whose land touches its own, along the ways goods travel (caravans, the border market) and down
// the rivers they share — each disease by its own ways and odds. Medicine and the disease's own cure or vaccine shield
// the receiver; a quarantine shuts the borders both ways, at a price: no border market, no trade, no caravans in or out,
// uneasy neighbours and an uneasy people. Rolls are seeded per pair and turn.

import { rngFor } from "./rng.ts";
import { fx, fxDeath } from "./fx.ts";
import { BORDER, CONTAGION, DISEASE, DISEASES, DISEASE_BY_ID, EVENTS, HERBS, type DiseaseDef } from "./rules.ts";
import { borderLength, borderOf, pairKey, sharedRivers } from "./border.ts";
import { take as takePeople } from "./people.ts";
import { mods, type Ledger } from "./engine.ts";
import type { Nation, World } from "./types.ts";

type Say = (nation: number | null, kind: string, text: string) => void;
export type Way = "border" | "caravan" | "market" | "river";
export const WAY_NAME: Record<Way, string> = { border: "qua biên giới", caravan: "theo đoàn buôn", market: "qua chợ biên giới", river: "theo dòng sông chung" };
type Shield = { medicine: number; caps: Set<string> };

/** The disease a people has (or last had); dịch hạch for peoples struck before there were many. */
export const diseaseOf = (n: Nation): DiseaseDef => DISEASE_BY_ID[n.disease ?? ""] ?? DISEASE_BY_ID.plague;
/** Dịch hạch keeps the world's old knobs (EVENTS.plague, CONTAGION); the others their own. */
const deathsOf = (d: DiseaseDef): [number, number] => d.id === "plague" ? [EVENTS.plague.min, EVENTS.plague.max] : d.deaths;
const sickOf = (d: DiseaseDef) => d.id === "plague" ? CONTAGION.sickTurns : d.sick;
const immuneOf = (d: DiseaseDef) => d.id === "plague" ? CONTAGION.immuneTurns : d.immune;
export function spreadOf(d: DiseaseDef, way: Way): number {
  if (way === "river") return d.river;
  if (d.id === "plague") return way === "border" ? CONTAGION.border : CONTAGION.trade;
  return way === "border" ? d.border : d.trade;
}
/** What shields a people from this disease: × this on the chance it catches it, and on its dead. */
export function shield(d: DiseaseDef, m: Shield): number {
  let k = 1 - m.medicine;
  if (m.caps.has(d.vaccine)) k *= 1 - d.protect;
  if (d.water && m.caps.has(DISEASE.sanitation)) k *= DISEASE.sanitationCut;
  return k;
}
export const vaccinated = (d: DiseaseDef, m: Shield): boolean => m.caps.has(d.vaccine);

/** Can this people pass on its disease this turn? */
export const contagious = (n: Nation, tick: number): boolean => (n.outbreakUntil ?? -1) >= tick;
/** Sick or just recovered from its last disease. */
export const immune = (n: Nation, tick: number): boolean => (n.immuneUntil ?? -1) >= tick;
/** Sick with anything (one sickness at a time), or immune to this disease from living through it. */
export const immuneTo = (n: Nation, d: DiseaseDef, tick: number): boolean =>
  contagious(n, tick) || (n.immunity?.[d.id] ?? -1) >= tick || (diseaseOf(n) === d && immune(n, tick));
export const quarantined = (n: Nation, tick: number): boolean => (n.quarantineUntil ?? -1) >= tick;

/** A disease strikes a nation (§9.2, §9.4 herbs, §9.6): `roll` in [0, 1) sets the share that dies between its min and
 *  max, cut by medicine and its cure; one herb per HERBS.perPeople people halves it. The people is contagious for the
 *  disease's sick turns, then immune to it a while. `from`: whom it caught it from, and how. Returns the dead. */
export function diseaseStrike(world: World, n: Nation, L: Ledger, say: Say, d: DiseaseDef, roll: number, m: Shield, from?: { src: Nation; via: Way }): number {
  const tick = world.tick, [lo, hi] = deathsOf(d);
  let dead = Math.floor(n.population * (lo + roll * (hi - lo)) * shield(d, m));
  const herbsNeed = Math.ceil(n.population / HERBS.perPeople), healed = (n.stock.herbs || 0) >= herbsNeed;
  if (healed) { dead = Math.floor(dead * HERBS.plagueCut); L.stock(n, "herbs", -herbsNeed, "plague"); }
  takePeople(n, dead, "plague"); fx({ kind: "plague", tile: n.capital, nation: n.id, text: d.name }); fxDeath(n.capital, n.id, dead, "plague");
  n.disease = d.id;
  n.outbreakUntil = tick + sickOf(d) - 1;
  n.immuneUntil = n.outbreakUntil + immuneOf(d);
  (n.immunity ??= {})[d.id] = n.immuneUntil;
  // a people that suffered it unprotected studies its cure the harder (§9.6)
  if (!vaccinated(d, m)) (n.diseaseLore ??= {})[d.id] = Math.min(DISEASE.loreMax, (n.diseaseLore?.[d.id] ?? 0) + 1);
  const notes = [healed && `thảo dược cứu được một nửa, dùng ${herbsNeed}`, vaccinated(d, m) && "nhờ thuốc chủng, ít người chết"].filter(Boolean).join("; ");
  const herbs = notes ? ` (${notes})` : "";
  if (!from) {
    n.lastEvents.push(`Dịch bệnh (${d.name}): ${dead} người chết${herbs}.`);
    say(n.id, "event", `${d.name} ở ${n.name}: ${dead} người chết.`);
  } else {
    n.lastEvents.push(`Dịch bệnh (${d.name}) lây từ ${from.src.name} ${WAY_NAME[from.via]}: ${dead} người chết${herbs}.`);
    from.src.lastEvents.push(`${d.name} của nước mình đã lây sang ${n.name} ${WAY_NAME[from.via]}.`);
    say(n.id, "event", `${d.name} từ ${from.src.name} lan sang ${n.name} ${WAY_NAME[from.via]}: ${dead} người chết.`);
  }
  return dead;
}
/** The old plague strike (dịch hạch), kept for callers that know only medicine. */
export function plagueStrike(world: World, n: Nation, L: Ledger, say: Say, roll: number, medicine: number, from?: { src: Nation; via: Way }): number {
  return diseaseStrike(world, n, L, say, DISEASE_BY_ID.plague, roll, { medicine, caps: new Set() }, from);
}

/** The chance a turn that this people catches each disease by itself (§9.6). `dry`: no fresh water; `spring`: it
 *  holds the hot springs. */
export function diseaseChances(world: World, n: Nation, m: Shield, dry: boolean, spring: boolean): Array<{ d: DiseaseDef; p: number }> {
  const big = n.population > EVENTS.plague.bigPop;
  let wet = 0;
  for (const t of world.tiles) if (t.owner === n.id && (t.terrain === "swamp" || t.terrain === "jungle") && t.zone !== "cold") wet++;
  return DISEASES.map(d => {
    let p = EVENTS.plague.chance * d.weight * (spring ? 0.7 : 1) * shield(d, m);
    if (d.id === "malaria") p *= Math.min(DISEASE.wetMax, wet);
    if (d.crowd && big) p *= 2;
    if (d.water && dry) p *= DISEASE.dry;
    return { d, p };
  });
}
/** One turn's own outbreak, if any: at most one disease, picked by its chance (rolls seeded per nation and turn). */
export function outbreakTurn(world: World, n: Nation, L: Ledger, say: Say, m: Shield, dry: boolean, spring: boolean): void {
  const tick = world.tick;
  if (contagious(n, tick)) return;
  const xs = diseaseChances(world, n, m, dry, spring).filter(x => x.p > 0 && !immuneTo(n, x.d, tick));
  const total = xs.reduce((s, x) => s + x.p, 0);
  if (!total) return;
  const r = rngFor(world.seed, tick, "disease", n.id);
  if (r() >= Math.min(1, total)) return;
  let pick = r() * total, d = xs[xs.length - 1].d;
  for (const x of xs) { if (pick < x.p) { d = x.d; break; } pick -= x.p; }
  diseaseStrike(world, n, L, say, d, r(), m);
}

/** The ways goods travelled before this turn's trade and border markets: caravans on the road and how many
 *  times each border market had met. Taken before resolveRelations; contagionPhase compares. */
export interface TradeLinks { caravans: Set<string>; markets: Record<string, number> }
export function tradeLinks(world: World): TradeLinks {
  return {
    caravans: new Set(world.caravans.map(c => pairKey(c.from, c.to))),
    markets: Object.fromEntries(Object.entries(world.borders ?? {}).map(([k, st]) => [k, st.market])),
  };
}

/** One turn of contagion and quarantine (§9.5), after every nation's own events. */
export function contagionPhase(world: World, L: Ledger, say: Say, before: TradeLinks): void {
  const tick = world.tick, alive = world.nations.filter(n => n.alive && n.founded);
  // This turn's ways: a caravan on the road (or arriving) between the two, a border market that met
  const caravans = new Set(before.caravans);
  for (const c of world.caravans) caravans.add(pairKey(c.from, c.to));
  const markets = new Set(Object.entries(world.borders ?? {}).filter(([k, st]) => st.market > (before.markets[k] ?? 0)).map(([k]) => k));
  // Only the peoples sick at the start of the phase pass it on; the ones they infect start next turn
  for (const src of alive.filter(n => contagious(n, tick))) {
    if (quarantined(src, tick)) continue;
    const d = diseaseOf(src);
    for (const dst of alive) {
      if (dst === src || !dst.alive || immuneTo(dst, d, tick) || quarantined(dst, tick)) continue;
      const k = pairKey(src.id, dst.id), ways: Array<[Way, number]> = [];
      if (spreadOf(d, "border") && borderLength(world, src.id, dst.id) > 0) ways.push(["border", spreadOf(d, "border")]);
      if (spreadOf(d, "caravan") && caravans.has(k)) ways.push(["caravan", spreadOf(d, "caravan")]);
      if (spreadOf(d, "market") && markets.has(k)) ways.push(["market", spreadOf(d, "market")]);
      if (spreadOf(d, "river") && sharedRivers(world, src.id, dst.id) > 0) ways.push(["river", spreadOf(d, "river")]);
      if (!ways.length) continue;
      const m = mods(world, dst), k2 = shield(d, m), r = rngFor(world.seed, tick, "contagion", src.id, dst.id);
      const hit = ways.find(([, p]) => r() < p * k2);
      if (!hit) continue;
      fx({ kind: "contagion", tile: dst.capital, nation: dst.id, from: src.capital, text: src.name, cause: hit[0] });
      diseaseStrike(world, dst, L, say, d, r(), m, { src, via: hit[0] });
    }
  }
  // The price of a quarantine
  for (const n of alive) {
    if (!quarantined(n, tick)) continue;
    n.stability = Math.max(0, n.stability - CONTAGION.quarantineStability);
    const uneasy: string[] = [];
    for (const o of alive) {
      if (o === n || !borderLength(world, n.id, o.id)) continue;
      const st = borderOf(world, n.id, o.id);
      st.tension = Math.min(100, Math.round((st.tension + CONTAGION.quarantineTension) * 10) / 10);
      uneasy.push(o.name);
    }
    const sick = contagious(n, tick);
    if (sick) n.reputation = Math.min(100, n.reputation + CONTAGION.selfQuarantineRep);
    n.lastEvents.push(`Đang cách ly tới hết lượt ${n.quarantineUntil}: không buôn bán, không chợ biên giới, dịch không vào ra được; ổn định −${CONTAGION.quarantineStability}${uneasy.length ? `, căng thẳng với ${uneasy.join(", ")} +${CONTAGION.quarantineTension}` : ""}${sick ? `, uy tín +${CONTAGION.selfQuarantineRep} vì giữ dịch trong nhà` : ""}.`);
  }
}

/** The quarantine order (§9.5): {"type":"quarantine","turns":1–5}, or turns 0 to end it now. */
export function orderQuarantine(world: World, n: Nation, a: Record<string, unknown>, say: Say): string | null {
  const tick = world.tick, k = a.turns === undefined ? 2 : Math.floor(Number(a.turns));
  if (!(k >= 0 && k <= CONTAGION.quarantineMax)) return `turns phải từ 0 tới ${CONTAGION.quarantineMax} (0 = dỡ cách ly)`;
  if (k === 0) {
    if (!quarantined(n, tick)) return "Không đang cách ly";
    n.quarantineUntil = tick - 1;
    n.lastEvents.push("Dỡ bỏ cách ly: biên giới và chợ mở lại.");
    say(n.id, "quarantine", `${n.name} dỡ bỏ cách ly.`);
    return null;
  }
  const was = quarantined(n, tick);
  n.quarantineUntil = tick + k - 1;
  if (!was) say(n.id, "quarantine", `${n.name} đóng cửa biên giới, cách ly ${k} lượt${contagious(n, tick) ? " để giữ dịch trong nhà" : " để tránh dịch"}.`);
  return null;
}

/** Known peoples with a disease they can still pass on, and the ways it could reach `n` (for the AI and the advisor). */
export function plagueNearby(world: World, n: Nation): Array<{ o: Nation; d: DiseaseDef; until: number; ways: Way[]; quarantined: boolean }> {
  const tick = world.tick, out: Array<{ o: Nation; d: DiseaseDef; until: number; ways: Way[]; quarantined: boolean }> = [];
  for (const id of n.met) {
    const o = world.nations[id];
    if (!o?.alive || !o.founded || !contagious(o, tick)) continue;
    const d = diseaseOf(o), ways: Way[] = [], border = borderLength(world, n.id, o.id) > 0;
    if (spreadOf(d, "border") && border) ways.push("border");
    if (spreadOf(d, "caravan") && world.caravans.some(c => (c.from === n.id && c.to === o.id) || (c.from === o.id && c.to === n.id))) ways.push("caravan");
    if (spreadOf(d, "market") && border && borderOf(world, n.id, o.id).tension < BORDER.marketBelow) ways.push("market");
    if (spreadOf(d, "river") && sharedRivers(world, n.id, o.id) > 0) ways.push("river");
    out.push({ o, d, until: o.outbreakUntil!, ways: immuneTo(n, d, tick) ? [] : ways, quarantined: quarantined(o, tick) });
  }
  return out;
}

/** §9.6 How fast a people studies a cure: −DISEASE.lore of the cost per outbreak it lived through of a disease the
 *  invention's capabilities guard against (the most such disease counts). */
export function cureDiscount(n: Nation, caps: string[]): number {
  let k = 0;
  for (const d of DISEASES) if (caps.includes(d.vaccine)) k = Math.max(k, Math.min(DISEASE.loreMax, n.diseaseLore?.[d.id] ?? 0));
  return k * DISEASE.lore;
}

/** The diseases as this people knows them: protected or not, immune until, how much faster it studies the cure. */
export function diseaseView(world: World, n: Nation, m: Shield) {
  const tick = world.tick;
  return DISEASES.map(d => ({
    disease: d.name, spreads: d.how, cure: d.vaccine, have_cure: vaccinated(d, m) || undefined,
    immune_until: (n.immunity?.[d.id] ?? -1) >= tick ? n.immunity![d.id] : undefined,
    outbreaks_lived: n.diseaseLore?.[d.id] || undefined,
  }));
}
