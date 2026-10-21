// §4.12 Great people. A people that lives well and works hard brings forth the odd great one: a scholar, a general,
// a merchant, a master craftsman, a prophet, an explorer. They serve a few generations, then pass into the annals;
// a richer, calmer nation may lure one away from its neighbours.

import { GREATS } from "./rules.ts";
import { rngFor } from "./rng.ts";
import { vietPerson } from "./names.ts";
import { mods, type Mods } from "./engine.ts";
import { worth } from "./market.ts";
import type { Great, Nation, World } from "./types.ts";

type Say = (nation: number | null, kind: string, text: string) => void;
const live = (n: Nation, tick: number) => (n.greats ?? []).filter(g => g.dies > tick);

/** What the nation's great people add to its powers (called from mods). */
export function greatMods(n: Nation, m: Mods, tick: number): void {
  for (const g of live(n, tick)) {
    if (g.kind === "scholar") m.rp += 0.15;
    else if (g.kind === "general") m.combat += 0.12;
    else if (g.kind === "merchant") m.transport += 0.3;
    else if (g.kind === "artisan") { m.role.craft = (m.role.craft || 0) + 0.25; m.role.build = (m.role.build || 0) + 0.15; }
    else if (g.kind === "prophet") m.stabilityPerTick += 1;
    else if (g.kind === "explorer") m.explore += 3;
  }
}
export const hasGreat = (n: Nation, kind: string, tick: number) => live(n, tick).some(g => g.kind === kind);

/** Each turn: the great people who pass away, and the ones born. */
export function greatPhase(world: World, say: Say): void {
  const tick = world.tick;
  for (const n of world.nations) {
    if (!n.alive || !n.founded) continue;
    for (const g of n.greats ?? []) if (g.dies === tick) {
      n.lastEvents.push(`${GREATS.kinds[g.kind].name} ${g.name} qua đời sau ${tick - g.born} lượt phụng sự.`);
      say(n.id, "great", `${GREATS.kinds[g.kind].name[0].toUpperCase()}${GREATS.kinds[g.kind].name.slice(1)} ${g.name} của ${n.name} qua đời.`);
    }
    n.greats = (n.greats ?? []).filter(g => g.dies > tick - 30); // the dead are remembered a while
    if (live(n, tick).length >= GREATS.max) continue;
    const r = rngFor(world.seed, tick, "great", n.id);
    const chance = GREATS.base * ((n.living ?? 50) / 100) * Math.sqrt(Math.max(0, n.population) / 100);
    if (r() >= chance) continue;
    // the kind follows what the people does
    const m = mods(world, n), trades = Object.values(n.trades).filter(k => k > 0).length;
    const weights: Record<string, number> = {
      scholar: 1 + n.labor.research, general: 1 + n.labor.warrior + (world.wars.some(w => w.end === null && (w.a === n.id || w.b === n.id)) ? 10 : 0),
      merchant: 1 + trades * 3, artisan: 1 + n.labor.craft + n.labor.build, prophet: m.caps.has("tín-ngưỡng") ? 4 : 0.5, explorer: 1 + (m.move.has("shallow") ? 3 : 0),
    };
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let pick = r() * total, kind = "scholar";
    for (const [k, w] of Object.entries(weights)) { pick -= w; if (pick <= 0) { kind = k; break; } }
    const g: Great = { id: world.nextId++, name: vietPerson(r), kind, born: tick, dies: tick + GREATS.life[0] + Math.floor(r() * (GREATS.life[1] - GREATS.life[0] + 1)) };
    (n.greats ??= []).push(g);
    n.lastEvents.push(`Một ${GREATS.kinds[kind].name} ra đời: ${g.name} (${GREATS.kinds[kind].desc}), phụng sự tới lượt ${g.dies}.`);
    say(n.id, "great", `${n.name} có ${GREATS.kinds[kind].name} ${g.name}.`);
  }
}

/** The order "invite_great": lure a great person from a nation we know, with a gift to them. */
export function inviteGreat(world: World, n: Nation, a: Record<string, unknown>, find: (to: unknown) => Nation | string, pay: (from: Nation, to: Nation, goods: Record<string, number>) => void): string | null {
  const tick = world.tick;
  if (n.invited !== undefined && tick - n.invited < GREATS.inviteEvery) return `Mỗi ${GREATS.inviteEvery} lượt chỉ mời được một lần (lần trước lượt ${n.invited})`;
  const id = Math.floor(Number(a.great ?? a.id));
  const o = world.nations.find(x => x.alive && x.id !== n.id && live(x, tick).some(g => g.id === id));
  if (!o) return `Không có danh nhân #${id} ở nước nào bạn biết`;
  const same = find(o.name); if (typeof same === "string") return same;
  const gift: Record<string, number> = {};
  for (const [k, q] of Object.entries((a.gift ?? {}) as Record<string, unknown>)) { const v = Math.floor(Number(q)); if (v > 0) gift[k] = v; }
  if (worth(world, gift) < GREATS.giftWorth) return `Lễ vật phải đáng ít nhất ${GREATS.giftWorth} (theo giá thế giới); đang ${worth(world, gift)}`;
  if (!Object.entries(gift).every(([k, q]) => (n.stock[k] || 0) >= q)) return "Kho không đủ lễ vật";
  n.invited = tick;
  pay(n, o, gift);
  const g = live(o, tick).find(x => x.id === id)!;
  const chance = Math.max(GREATS.inviteMin, Math.min(GREATS.inviteMax, GREATS.inviteBase + GREATS.inviteLife * ((n.living ?? 50) - (o.living ?? 50)) / 100));
  if (rngFor(world.seed, tick, "invite", n.id, id)() < chance) {
    o.greats = (o.greats ?? []).filter(x => x !== g);
    (n.greats ??= []).push({ ...g, from: o.id });
    n.lastEvents.push(`${GREATS.kinds[g.kind].name} ${g.name} nhận lời, rời ${o.name} sang phụng sự nước ta.`);
    o.lastEvents.push(`${GREATS.kinds[g.kind].name} ${g.name} bỏ nước ta sang ${n.name} (họ dâng lễ vật mời).`);
  } else {
    n.lastEvents.push(`${GREATS.kinds[g.kind].name} ${g.name} từ chối lời mời; lễ vật đã trao cho ${o.name}.`);
    o.lastEvents.push(`${n.name} mời ${GREATS.kinds[g.kind].name} ${g.name} của ta, nhưng người ấy ở lại.`);
  }
  return null;
}

/** The great people as the nations see them. */
export function greatsView(world: World, n: Nation) {
  const tick = world.tick, mine = live(n, tick).map(g => ({ id: g.id, name: g.name, kind: g.kind, title: GREATS.kinds[g.kind].name, gift: GREATS.kinds[g.kind].desc, serves_until: g.dies }));
  const others = n.met.map(id => world.nations[id]).filter(o => o?.alive).flatMap(o => live(o, tick).map(g => ({ id: g.id, name: g.name, kind: g.kind, nation: o.name, serves_until: g.dies })));
  return mine.length || others.length ? { mine, others: others.length ? others : undefined } : undefined;
}
