// §4.5b A civil war is a bloody war. While the rebels fight for the throne they work for no one: the nation makes
// less, and defends worse against a foreign enemy, by their share. Every turn the armies burn, plunder and eat the
// stores, a building may burn, roads are cut, and families flee to calmer lands. Other nations may aid a side with
// warriors and goods; arming the rebels is a just cause for the crown. When it ends the wound stays for years.

import { CIVIL } from "./rules.ts";
import { findTarget } from "./diplomacy.ts";
import { buildingOf } from "./catalog.ts";
import { add as addPeople, take as takePeople } from "./people.ts";
import { noteExodus } from "./exodus.ts";
import { price } from "./market.ts";
import { mods, type Ledger } from "./engine.ts";
import type { Nation, Schism, World } from "./types.ts";

/** The civil war a nation is fighting, if any. */
export function civilWarOf(world: World, n: Nation): Schism | undefined {
  return (world.schisms ?? []).find(x => x.from === n.id && x.kind === "civil" && x.status === "fighting");
}
/** The share of the people that has risen (and works and defends for no one): 0 at peace. */
export function civilShare(world: World, n: Nation): number {
  const x = civilWarOf(world, n);
  return x ? Math.min(0.9, x.people / Math.max(1, n.population)) : 0;
}

/** The order "aid_civil_war": {"type":"aid_civil_war","to":"nation","side":"crown"|"rebels","warriors":n?,"goods":{good:qty}?}. */
export function aidCivilWar(world: World, n: Nation, a: Record<string, unknown>, L: Ledger): string | null {
  const o = findTarget(world, n, a.to); if (typeof o === "string") return o;
  if (o.id === n.id) return "Không thể tự giúp mình trong nội chiến của chính mình";
  const x = civilWarOf(world, o);
  if (!x) return `${o.name} không có nội chiến`;
  const side = String(a.side ?? "");
  if (side !== "crown" && side !== "rebels") return `side phải là "crown" (triều đình ${o.name}) hoặc "rebels" (phe ${x.leader})`;
  if ((x.aid ?? []).some(y => y.nation === n.id && y.tick === world.tick)) return "Mỗi lượt chỉ giúp một lần";
  const warriors = Math.max(0, Math.min(Math.floor(Number(a.warriors) || 0), n.labor.warrior));
  const goods: Record<string, number> = {};
  for (const [g, q] of Object.entries((a.goods && typeof a.goods === "object" ? a.goods : {}) as Record<string, unknown>)) {
    const k = Math.max(0, Math.floor(Number(q) || 0));
    if (k > 0) { if ((n.stock[g] || 0) < k) return `Không đủ ${g}: có ${Math.floor(n.stock[g] || 0)}`; goods[g] = k; }
  }
  if (!warriors && !Object.keys(goods).length) return "Cần warriors (chiến binh của bạn) hoặc goods (hàng gửi giúp)";
  let worth = 0;
  for (const [g, k] of Object.entries(goods)) { L.stock(n, g, -k, "civil"); worth += k * price(world, g); } // spent on the war: weapons, food for the fighters
  (x.aid ??= []).push({ nation: n.id, side, tick: world.tick, warriors, worth: Math.round(worth * 10) / 10 });
  if (side === "rebels") {
    o.casusBelli[String(n.id)] = Math.max(o.casusBelli[String(n.id)] ?? -1, world.tick + CIVIL.helpCause);
    o.lastEvents.push(`${n.name} giúp phe nổi dậy của ${x.leader}${warriors ? ` với ${warriors} chiến binh` : ""}${worth ? ` và hàng đáng ${Math.round(worth)}` : ""}: ta có chính nghĩa để đánh họ trong ${CIVIL.helpCause} lượt.`);
  } else o.lastEvents.push(`${n.name} giúp triều đình dẹp loạn${warriors ? ` với ${warriors} chiến binh` : ""}${worth ? ` và hàng đáng ${Math.round(worth)}` : ""}.`);
  n.lastEvents.push(`Giúp ${side === "crown" ? `triều đình ${o.name}` : `phe nổi dậy của ${x.leader} ở ${o.name}`}${warriors ? `: ${warriors} chiến binh ra trận` : ""}${worth ? `, hàng đáng ${Math.round(worth)}` : ""}.`);
  return null;
}
/** The strength the nations aiding each side lend it this turn. */
export function aidStrength(world: World, x: Schism): { crown: number; rebels: number } {
  const out = { crown: 0, rebels: 0 };
  for (const y of (x.aid ?? []).filter(y => y.tick === world.tick)) {
    const helper = world.nations[y.nation], m = helper ? mods(world, helper) : null;
    out[y.side] += y.warriors * (1 + (m?.role.warrior || 0) + (m?.combat || 0)) + y.worth / CIVIL.aidPer;
  }
  return out;
}
/** The helpers' warriors share the losses of the side they fought for. */
export function aidLosses(world: World, x: Schism, side: "crown" | "rebels", rate: number): void {
  for (const y of (x.aid ?? []).filter(y => y.tick === world.tick && y.side === side && y.warriors > 0)) {
    const helper = world.nations[y.nation]; if (!helper?.alive) continue;
    const k = Math.min(Math.ceil(y.warriors * rate), helper.labor.warrior, Math.max(0, helper.population - 5));
    if (k <= 0) continue;
    takePeople(helper, k, "war"); helper.labor.warrior -= k;
    helper.lastEvents.push(`${k} chiến binh ta gửi sang nội chiến ở ${world.nations[x.from].name} đã chết.`);
  }
}

/** One turn of the war's ruin: the stores burnt and plundered, a building burnt, roads cut, families fleeing. */
export function ravage(world: World, n: Nation, x: Schism, L: Ledger, r: () => number): string[] {
  const toll = (x.toll ??= { dead: 0, fled: 0, burned: 0, ruined: 0 }), out: string[] = [];
  let ruined = 0;
  for (const [g, q] of Object.entries(n.stock)) {
    const k = Math.floor(q * CIVIL.ruin * 10) / 10;
    if (k > 0) { L.stock(n, g, -k, "civil"); ruined += k * price(world, g); }
  }
  toll.ruined += Math.round(ruined);
  if (ruined >= 1) out.push(`kho bị đốt, cướp, quân hai bên ăn mất (đáng ${Math.round(ruined)})`);
  const standing = n.buildings.filter(b => b.done);
  if (standing.length && r() < CIVIL.burn) {
    const b = standing[Math.floor(r() * standing.length)];
    n.buildings = n.buildings.filter(y => y !== b); toll.burned++;
    out.push(`${buildingOf(world, b.type)?.name ?? b.type} bị đốt`);
  }
  const roads = world.tiles.filter(t => t.owner === n.id && (t.road || 0) > 0);
  let cut = 0;
  for (let k = 0; k < CIVIL.roads && roads.length; k++) {
    const t = roads.splice(Math.floor(r() * roads.length), 1)[0];
    t.road = (t.road || 0) - 1; if (t.road <= 0) delete t.road; cut++;
  }
  if (cut) out.push(`${cut} đoạn đường bị phá`);
  const k = Math.floor(n.population * CIVIL.flee);
  const dest = n.met.map(o => world.nations[o]).filter(o => o?.alive && o.founded && !civilWarOf(world, o)).sort((a, b) => b.stability - a.stability || a.id - b.id)[0];
  if (k > 0 && dest) {
    const gone = takePeople(n, k, "migrate"); addPeople(dest, gone); noteExodus(n, world.tick, k, dest.id, "civil"); toll.fled += k;
    dest.lastEvents.push(`${k} người ${n.name} chạy nạn nội chiến sang nước ta.`);
    out.push(`${k} người chạy nạn sang ${dest.name}`);
  }
  return out;
}

/** The civil wars of the nations `n` knows, for its observation. */
export function civilWarsAbroad(world: World, n: Nation) {
  const xs = (world.schisms ?? []).filter(x => x.kind === "civil" && x.status === "fighting" && x.from !== n.id && n.met.includes(x.from));
  return xs.length ? xs.map(x => ({ nation: world.nations[x.from].name, rebels: x.people, leader: x.leader, score: `rebels ${x.score?.rebels ?? 0} – crown ${x.score?.crown ?? 0}`, rebels_odds: x.odds })) : undefined;
}
