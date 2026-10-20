// §9.5 Contagion and quarantine. A plague does not stay home: for two turns a sick people can pass it to the
// peoples whose land touches its own, and along the ways goods travel, by caravan and at the border market.
// Medicine shields the receiver; a quarantine shuts the borders both ways, at a price: no border market, no
// trade, no caravans in or out, uneasy neighbours and an uneasy people. Rolls are seeded per pair and turn.

import { rngFor } from "./rng.ts";
import { fx, fxDeath } from "./fx.ts";
import { BORDER, CONTAGION, EVENTS, HERBS } from "./rules.ts";
import { borderLength, borderOf, pairKey } from "./border.ts";
import { take as takePeople } from "./people.ts";
import { mods, type Ledger } from "./engine.ts";
import type { Nation, World } from "./types.ts";

type Say = (nation: number | null, kind: string, text: string) => void;
export type Way = "border" | "caravan" | "market";
export const WAY_NAME: Record<Way, string> = { border: "qua biên giới", caravan: "theo đoàn buôn", market: "qua chợ biên giới" };

/** Can this people pass on the plague this turn? */
export const contagious = (n: Nation, tick: number): boolean => (n.outbreakUntil ?? -1) >= tick;
/** Sick or just recovered: the plague does not strike it again this turn. */
export const immune = (n: Nation, tick: number): boolean => (n.immuneUntil ?? -1) >= tick;
export const quarantined = (n: Nation, tick: number): boolean => (n.quarantineUntil ?? -1) >= tick;

/** A plague strikes a nation (§9.2, §9.4 herbs): `roll` in [0, 1) sets the share that dies between min and max,
 *  cut by medicine; one herb per HERBS.perPeople people halves it. The people is contagious for
 *  CONTAGION.sickTurns turns, then immune a few more. `from`: whom it caught it from, and how. Returns the dead. */
export function plagueStrike(world: World, n: Nation, L: Ledger, say: Say, roll: number, medicine: number, from?: { src: Nation; via: Way }): number {
  const tick = world.tick;
  let dead = Math.floor(n.population * (EVENTS.plague.min + roll * (EVENTS.plague.max - EVENTS.plague.min)) * (1 - medicine));
  const herbsNeed = Math.ceil(n.population / HERBS.perPeople), healed = (n.stock.herbs || 0) >= herbsNeed;
  if (healed) { dead = Math.floor(dead * HERBS.plagueCut); L.stock(n, "herbs", -herbsNeed, "plague"); }
  takePeople(n, dead, "plague"); fx({ kind: "plague", tile: n.capital, nation: n.id }); fxDeath(n.capital, n.id, dead, "plague");
  n.outbreakUntil = tick + CONTAGION.sickTurns - 1;
  n.immuneUntil = n.outbreakUntil + CONTAGION.immuneTurns;
  const herbs = healed ? ` (thảo dược cứu được một nửa, dùng ${herbsNeed})` : "";
  if (!from) {
    n.lastEvents.push(`Dịch bệnh: ${dead} người chết${herbs}.`);
    say(n.id, "event", `Dịch bệnh ở ${n.name}: ${dead} người chết.`);
  } else {
    n.lastEvents.push(`Dịch bệnh lây từ ${from.src.name} ${WAY_NAME[from.via]}: ${dead} người chết${herbs}.`);
    from.src.lastEvents.push(`Dịch của nước mình đã lây sang ${n.name} ${WAY_NAME[from.via]}.`);
    say(n.id, "event", `Dịch bệnh từ ${from.src.name} lan sang ${n.name} ${WAY_NAME[from.via]}: ${dead} người chết.`);
  }
  return dead;
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
    for (const dst of alive) {
      if (dst === src || !dst.alive || immune(dst, tick) || quarantined(dst, tick)) continue;
      const k = pairKey(src.id, dst.id), ways: Array<[Way, number]> = [];
      if (borderLength(world, src.id, dst.id) > 0) ways.push(["border", CONTAGION.border]);
      if (caravans.has(k)) ways.push(["caravan", CONTAGION.trade]);
      if (markets.has(k)) ways.push(["market", CONTAGION.trade]);
      if (!ways.length) continue;
      const medicine = mods(world, dst).medicine, r = rngFor(world.seed, tick, "contagion", src.id, dst.id);
      const hit = ways.find(([, p]) => r() < p * (1 - medicine));
      if (!hit) continue;
      fx({ kind: "contagion", tile: dst.capital, nation: dst.id, from: src.capital, text: src.name, cause: hit[0] });
      plagueStrike(world, dst, L, say, r(), medicine, { src, via: hit[0] });
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

/** Known peoples with a plague they can still pass on, and the ways it could reach `n` (for the AI and the advisor). */
export function plagueNearby(world: World, n: Nation): Array<{ o: Nation; until: number; ways: Way[]; quarantined: boolean }> {
  const tick = world.tick, out: Array<{ o: Nation; until: number; ways: Way[]; quarantined: boolean }> = [];
  for (const id of n.met) {
    const o = world.nations[id];
    if (!o?.alive || !o.founded || !contagious(o, tick)) continue;
    const ways: Way[] = [], border = borderLength(world, n.id, o.id) > 0;
    if (border) ways.push("border");
    if (world.caravans.some(c => (c.from === n.id && c.to === o.id) || (c.from === o.id && c.to === n.id))) ways.push("caravan");
    if (border && borderOf(world, n.id, o.id).tension < BORDER.marketBelow) ways.push("market");
    out.push({ o, until: o.outbreakUntil!, ways, quarantined: quarantined(o, tick) });
  }
  return out;
}
