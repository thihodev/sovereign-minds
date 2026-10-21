// §4.2 People by age and sex. `population` stays the total every rule reads;
// the groups behind it decide who works, who eats how much, who bears children
// and who dies of what. A rule that only changes the total is reconciled here.

import { DEMO } from "./rules.ts";
import type { Demography, Nation } from "./types.ts";

export type Cause = "famine" | "winter" | "plague" | "disaster" | "beasts" | "raid" | "war" | "brawl" | "explore" | "porter" | "migrate" | "any";

/** Who a cause strikes first, by age group (children, youths, adults, elders). */
const AGE_WEIGHT: Record<Cause, number[]> = {
  famine: [3, 1, 0.7, 3], winter: [2, 0.7, 0.5, 3], plague: [1.5, 0.6, 0.6, 3], disaster: [1, 1, 1, 1],
  beasts: [0.1, 0.8, 1, 0.3], raid: [1, 1, 1, 1], war: [0, 0.6, 1, 0], brawl: [0, 0.8, 1, 0.2], explore: [0, 0.5, 1, 0], porter: [0, 0.5, 1, 0],
  migrate: [0.6, 1, 1, 0.3], any: [1, 1, 1, 1],
};

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
export const total = (d: Demography) => sum(d.m) + sum(d.f);

/** Share k people over cells in proportion to weight × what each holds, never more than a cell holds.
 *  Largest remainder, ties to the earlier cell: deterministic. */
function spread(k: number, have: number[], weight: number[]): number[] {
  const out = have.map(() => 0);
  for (let pass = 0; pass < 3 && k > 0; pass++) {
    const w = have.map((h, i) => (h - out[i]) * (pass < 2 ? weight[i] : 1));
    const W = sum(w);
    if (W <= 0) continue;
    const exact = w.map(x => Math.min(k * x / W, 1e9));
    const base = exact.map((x, i) => Math.min(have[i] - out[i], Math.floor(x)));
    let left = k - sum(base);
    const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
    for (const { i } of order) { if (left <= 0) break; if (have[i] - out[i] - base[i] > 0 && w[i] > 0) { base[i]++; left--; } }
    base.forEach((x, i) => { out[i] += x; });
    k -= sum(base);
  }
  return out;
}
const cells = (d: Demography) => [...d.m, ...d.f];
const split = (c: number[]): Demography => ({ m: c.slice(0, 4), f: c.slice(4, 8) });

/** k people in a settled people's shape. */
export function shape(k: number): Demography {
  const share = [...DEMO.start, ...DEMO.start].map(x => x / 2);
  return split(spread(k, share.map(() => k), share));
}

/** The nation's groups, made to match its population (a rule that only changed the total). */
export function demo(n: Nation): Demography {
  const pop = Math.max(0, Math.floor(n.population));
  if (!n.demo) n.demo = shape(pop);
  const d = n.demo, have = total(d);
  if (have > pop) { const gone = spread(have - pop, cells(d), [...AGE_WEIGHT.any, ...AGE_WEIGHT.any]); const c = cells(d).map((x, i) => x - gone[i]); d.m = c.slice(0, 4); d.f = c.slice(4); }
  else if (have < pop) { const more = shape(pop - have); d.m = d.m.map((x, i) => x + more.m[i]); d.f = d.f.map((x, i) => x + more.f[i]); }
  return d;
}

/** Remove up to k people, the ones `cause` strikes; returns who. Warriors fall by the nation's fighting custom. */
export function take(n: Nation, k: number, cause: Cause): Demography {
  const d = demo(n), age = AGE_WEIGHT[cause];
  const women = cause === "war" && (n.family?.fighters ?? "all") === "men" ? 0 : 1;
  const gone = spread(Math.max(0, Math.min(Math.floor(k), total(d))), cells(d), [...age, ...age.map(x => x * women)]);
  const c = cells(d).map((x, i) => x - gone[i]);
  d.m = c.slice(0, 4); d.f = c.slice(4);
  n.population = total(d);
  const k2 = sum(gone);
  if (cause === "migrate") d.left = (d.left ?? 0) + k2;
  else if (k2) (d.died ??= {})[cause] = (d.died[cause] ?? 0) + k2;
  return split(gone);
}
/** A new turn's account of births, deaths and moves (§4.2). */
export function openBook(n: Nation): void {
  const d = demo(n);
  d.died = {}; d.left = 0; d.arrived = 0; d.start = n.population; d.born = 0; d.infants = 0; d.aged = 0;
}
/** The turn's account in words, for the nation, the Watcher and the chat. */
export function bookLine(n: Nation): string {
  const d = demo(n), parts: string[] = [];
  if (d.born) parts.push(`+${d.born} trẻ ra đời`);
  if (d.arrived) parts.push(`+${d.arrived} người tới`);
  if (d.aged) parts.push(`−${d.aged} qua đời vì tuổi già hay lao lực`);
  const NAME: Record<string, string> = { famine: "đói", winter: "rét", plague: "dịch", disaster: "thiên tai", beasts: "thú dữ", raid: "man di", war: "trận mạc", brawl: "xô xát biên giới", explore: "thám hiểm", porter: "khuân vác", any: "khác" };
  for (const [k, v] of Object.entries(d.died ?? {})) if (v) parts.push(`−${v} chết vì ${NAME[k] ?? k}`);
  if (d.left) parts.push(`−${d.left} bỏ đi`);
  if (d.infants) parts.push(`(${d.infants} trẻ sơ sinh không qua khỏi)`);
  return `Dân số ${d.start ?? n.population} → ${n.population}${parts.length ? `: ${parts.join(", ")}` : ""}.`;
}

/** Add people who arrive (captured, taken in). */
export function add(n: Nation, who: Demography, arrived = true): void {
  const d = demo(n);
  d.m = d.m.map((x, i) => x + (who.m[i] || 0)); d.f = d.f.map((x, i) => x + (who.f[i] || 0));
  n.population = total(d);
  if (arrived) d.arrived = (d.arrived ?? 0) + total(who);
}
/** Part of a group of people (largest remainder). */
export function part(who: Demography, share: number): Demography {
  const c = cells(who), k = Math.floor(sum(c) * share);
  return split(spread(k, c, c.map(() => 1)));
}
export const count = (who: Demography) => total(who);

/** Workers: each group's share of a full day's work (§4.2); mothers work less when births are encouraged. */
export function workForce(n: Nation): number {
  const d = demo(n), w = DEMO.births[n.family?.births ?? "neutral"]?.womenWork ?? 1;
  let x = 0;
  for (let a = 0; a < 4; a++) x += d.m[a] * DEMO.work[a] + d.f[a] * DEMO.work[a] * (a === 2 ? w : 1);
  return Math.floor(x);
}
/** Mouths to feed, in full rations (children eat half). */
export function mouths(n: Nation): number {
  const d = demo(n);
  let x = 0;
  for (let a = 0; a < 4; a++) x += (d.m[a] + d.f[a]) * DEMO.eat[a];
  return Math.round(x * 10) / 10;
}
/** People who may be warriors: youths and adults, of the sexes the nation sends to war. */
export function fighters(n: Nation): number {
  const d = demo(n);
  return d.m[1] + d.m[2] + ((n.family?.fighters ?? "all") === "men" ? 0 : d.f[1] + d.f[2]);
}
export function elders(n: Nation): number { const d = demo(n); return d.m[3] + d.f[3]; }
/** Households: one per adult woman or man, whichever is fewer, plus the lone adults in twos. */
export function households(n: Nation): number { const d = demo(n), pairs = Math.min(d.m[2], d.f[2]); return pairs + Math.ceil((d.m[2] + d.f[2] - 2 * pairs) / 2); }

/** One turn of age: groups move up, the old and the worn die. Returns the natural deaths. */
export function grow(n: Nation, rand: () => number): number {
  const d = demo(n), round = (x: number) => Math.floor(x + rand());
  let died = 0;
  for (const s of [d.m, d.f]) {
    const old = Math.min(s[3], round(s[3] * DEMO.oldDeath)), worn = Math.min(s[2], round(s[2] * DEMO.adultDeath));
    s[3] -= old; s[2] -= worn; died += old + worn;
    const ageing = Math.min(s[2], round(s[2] * DEMO.ageOut));
    s[3] += ageing; s[2] = s[2] - ageing + s[1]; s[1] = s[0]; s[0] = 0;
  }
  n.population = total(d);
  return died;
}

/** How able the people is to bear children against a settled people of its size: adult women and partners.
 *  A people short of women or partners bears fewer; more women than usual does not make it bear more. */
export function breeding(n: Nation): number {
  const d = demo(n), pop = Math.max(1, total(d));
  const women = d.f[2] / (pop * DEMO.start[2] / 2);
  const pair = d.f[2] ? Math.min(1, d.m[2] / (d.f[2] * DEMO.pairing)) : 0;
  return Math.min(1, women * pair);
}
/** How fertile the people is now for growth: breeding × the birth custom × marriage. */
export function fertility(n: Nation, marriage: boolean, blessing = 1): number {
  return breeding(n) * (DEMO.births[n.family?.births ?? "neutral"]?.fert ?? 1) * (marriage ? DEMO.marriage : 1) * blessing;
}
/** Newborns: half boys, half girls; the odd one by the seed. */
export function babies(n: Nation, k: number, rand: () => number): void {
  const boys = Math.floor(k / 2) + (k % 2 && rand() < 0.5 ? 1 : 0);
  add(n, { m: [boys, 0, 0, 0], f: [k - boys, 0, 0, 0] }, false);
}
