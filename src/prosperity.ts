// §4.7 Prosperity and national pride. A nation's wealth is its people's: food in their stores, goods in their
// hands, room to live, health and peace. Each turn the engine scores how well each people lives (0–100) and the
// people compares it with the nations it knows: richer than them, it acclaims its rulers (stability, calm,
// renown); poorer, it envies its neighbours, grumbles, and families leave for the richer land next door.
// People are not in the ledger; goods are, and nothing here touches a stock.

import { rngFor } from "./rng.ts";
import { fx } from "./fx.ts";
import { PROSPERITY } from "./rules.ts";
import { goodValue } from "./catalog.ts";
import { housing, mods } from "./engine.ts";
import { pendingOrActiveWar } from "./diplomacy.ts";
import { borderLength } from "./border.ts";
import { add as addPeople, demo, mouths, take as takePeople } from "./people.ts";
import type { Nation, Prosperity, World } from "./types.ts";

type Say = (nation: number | null, kind: string, text: string) => void;
export type Parts = Prosperity["parts"];

const r1 = (x: number) => Math.round(x * 10) / 10;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Deaths that scar a people (not old age, not the explorers and porters lost on the road). */
const HARM = ["famine", "winter", "plague", "disaster", "beasts", "raid", "war"];

/** The four parts (0–25 each) of how well a people lives now, with the woe it carries (§4.7). */
export function measure(world: World, n: Nation, woe = n.prosperity?.woe ?? 0): Parts {
  const need = mouths(n) * mods(world, n).foodPerPerson, roof = housing(world, n), pop = Math.max(1, n.population);
  let goods = 0;
  // many kinds of goods make a people rich, not one heap: each kind counts up to goodCap of value a person
  for (const [k, q] of Object.entries(n.stock)) if (k !== "food" && q > 0) goods += Math.min(q * goodValue(world, k), PROSPERITY.goodCap * pop);
  return {
    food: r1(25 * (need > 0 ? clamp01((n.stock.food || 0) / need / PROSPERITY.foodTurns) : 1)),
    goods: r1(25 * clamp01(goods / pop / PROSPERITY.goodsPerHead)),
    room: r1(25 * (roof > 0 ? clamp01((roof - n.population) / roof / PROSPERITY.roomFull) : 0)),
    health: r1(25 * (1 - clamp01(woe))),
  };
}
export const scoreOf = (p: Parts) => Math.round(p.food + p.goods + p.room + p.health);

/** The living nations this one knows, with their prosperity (true values: the engine's own reading). */
export function knownProsperity(world: World, n: Nation): Array<{ o: Nation; score: number }> {
  return n.met.map(id => world.nations[id]).filter(o => o?.alive && o.founded && o.prosperity).map(o => ({ o, score: o.prosperity!.score }));
}
/** Where a nation stands among the nations it knows: 1 = the most prosperous. */
export function prosperityRank(world: World, n: Nation): { rank: number; of: number } {
  const all = [n.prosperity?.score ?? 0, ...knownProsperity(world, n).map(x => x.score)];
  return { rank: 1 + all.filter(s => s > all[0]).length, of: all.length };
}
/** The average over the turns kept, for the world ranking (§9.3). */
export function prosperityAverage(n: Nation): number {
  const h = n.prosperity?.history ?? [];
  return h.length ? h.reduce((a, b) => a + b, 0) / h.length : 0;
}

/** One turn of prosperity and pride for every nation (§4.7). Runs after the economy, before the turn's sight. */
export function prosperityPhase(world: World, say: Say): void {
  const tick = world.tick, live = world.nations.filter(n => n.alive && n.founded && n.population > 0);
  const before = new Map(live.map(n => [n.id, n.prosperity?.mood ?? null]));
  // 1. Every score first, so the comparisons below see the same turn
  for (const n of live) {
    const d = demo(n), was = n.prosperity;
    const died = HARM.reduce((s, k) => s + (d.died?.[k] ?? 0), 0);
    const atWar = world.wars.some(w => w.end === null && w.start <= tick && (w.a === n.id || w.b === n.id));
    const woe = Math.min(1, (was?.woe ?? 0) * PROSPERITY.woeFade + died / Math.max(1, d.start ?? n.population) * PROSPERITY.woePerDeath
      + ((d.died?.famine ?? 0) > 0 ? PROSPERITY.woeFamine : 0) + (atWar ? PROSPERITY.woeWar : 0));
    const parts = measure(world, n, woe), score = scoreOf(parts);
    n.prosperity = { score, parts, woe: Math.round(woe * 1000) / 1000, history: [...(was?.history ?? []), score].slice(-PROSPERITY.history), known: null, mood: null, said: was?.said };
  }
  // 2. Pride and envy against the nations each people knows
  for (const n of live) {
    const p = n.prosperity!, prev = before.get(n.id);
    const known = knownProsperity(world, n);
    if (!known.length) continue;
    const avg = known.reduce((s, x) => s + x.score, 0) / known.length, lead = p.score - avg;
    p.known = Math.round(avg);
    const canSay = tick - (p.said ?? -Infinity) >= PROSPERITY.sayEvery;
    if (lead >= PROSPERITY.margin) {
      // Acclaim: the people cheers a court under which it lives better than its neighbours
      p.mood = "acclaim";
      n.stability = Math.min(100, n.stability + PROSPERITY.acclaimStability);
      n.discontent = Math.max(0, (n.discontent ?? 0) - PROSPERITY.acclaimCalm);
      if (tick % PROSPERITY.reputationEvery === 0) n.reputation = Math.min(100, n.reputation + 1);
      if (prev !== "acclaim") {
        n.lastEvents.push(`Dân tung hô triều đình: thịnh vượng ${p.score}, hơn trung bình ${p.known} của các nước quen biết (+${PROSPERITY.acclaimStability} ổn định, −${PROSPERITY.acclaimCalm} bất mãn mỗi lượt).`);
        if (canSay) { p.said = tick; say(n.id, "pride", `Dân ${n.name} tung hô triều đình: họ sống sung túc hơn các nước láng giềng.`); }
      }
    } else if (-lead >= PROSPERITY.margin) {
      // Envy: the people grumbles, and families go where life is better
      p.mood = "envy";
      const rise = Math.min(PROSPERITY.envyMax, -lead / PROSPERITY.envyDivisor);
      n.discontent = Math.min(100, Math.round(((n.discontent ?? 0) + rise) * 10) / 10);
      const richest = known.slice().sort((a, b) => b.score - a.score || a.o.id - b.o.id)[0];
      if (prev !== "envy") n.lastEvents.push(`Dân ganh tị với các nước giàu hơn: thịnh vượng ${p.score}, kém trung bình ${p.known} của các nước quen biết (bất mãn +${r1(rise)} mỗi lượt; có nhà có thể bỏ sang nước giàu hơn như ${richest.o.name}).`);
      const left = emigrate(world, n, known);
      if (canSay && (prev !== "envy" || left)) {
        p.said = tick;
        say(n.id, "pride", `Dân ${n.name} ganh tị với sự sung túc của ${(left ? world.nations[left.to] : richest.o).name}${left ? `: ${left.k} người bỏ sang đó` : ""}.`);
      }
    }
  }
}

/** Families leave an envious people for the richest nation it knows (a neighbour sharing a border first). */
function emigrate(world: World, n: Nation, known: Array<{ o: Nation; score: number }>): { k: number; to: number } | null {
  const p = n.prosperity!;
  if (n.population < PROSPERITY.envyMinPop) return null;
  const hosts = known.filter(x => x.score - p.score >= PROSPERITY.margin && !pendingOrActiveWar(world, n.id, x.o.id) && x.o.population < housing(world, x.o));
  if (!hosts.length) return null;
  const best = hosts.reduce((a, b) => (b.score > a.score ? b : a));
  const r = rngFor(world.seed, world.tick, "envy", n.id);
  if (r() >= Math.min(PROSPERITY.emigrateMax, (best.score - p.score - PROSPERITY.margin) / 100 * PROSPERITY.emigrate)) return null;
  // the border is where people see how the others live
  const near = hosts.map(x => ({ ...x, border: borderLength(world, n.id, x.o.id) > 0 })).sort((a, b) => Number(b.border) - Number(a.border) || b.score - a.score || a.o.id - b.o.id)[0];
  const to = near.o, k = Math.max(2, Math.min(PROSPERITY.envyPeople, Math.round(n.population * PROSPERITY.envyShare)));
  const who = takePeople(n, k, "migrate");
  addPeople(to, who);
  fx({ kind: "migrate", tile: n.capital, nation: n.id, n: k, to: to.capital });
  n.lastEvents.push(`${k} người bỏ sang ${to.name}, nơi dân sống sung túc hơn (thịnh vượng ${near.score} so với ${p.score} của ta).`);
  to.lastEvents.push(`${k} người ${n.name} dọn sang sống với ta vì ở đây sung túc hơn.`);
  p.left = { k, to: to.id };
  return p.left;
}

/** What a nation can tell of another's prosperity (§7.8): exact with a spy or an ally, rounded with friendly
 *  contact, coarser with mere sight, and only "richer / poorer" from rumour. */
export function estimateProsperity(n: Nation, o: Nation): number | string {
  const score = o.prosperity?.score ?? 0, level = n.intel[String(o.id)]?.level ?? 1;
  if (level >= 4) return score;
  if (level >= 2) { const step = level >= 3 ? 5 : 10; return Math.round(score / step) * step; }
  const mine = n.prosperity?.score ?? 0;
  return score >= mine + PROSPERITY.margin ? "richer" : score <= mine - PROSPERITY.margin ? "poorer" : "about the same";
}
