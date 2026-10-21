// §4.10 Faith: missions and festivals. A people that has its rites (capability tín-ngưỡng) can send priests among
// its own restless folk — they calm them, quiet the most restless province and bless the families — or to a
// nation it knows, where some will follow the faith home; and it can hold a festival, a season of weddings.

import { col, row } from "./hex.ts";
import { FESTIVAL, LUXURY, MISSION, PROVINCE } from "./rules.ts";
import { activeWar, hostile, landGap } from "./diplomacy.ts";
import { mods, workers, type Ledger } from "./engine.ts";
import { add as addPeople, mouths, take as takePeople } from "./people.ts";
import { noteExodus } from "./exodus.ts";
import { quarantined } from "./contagion.ts";
import { provinces } from "./provinces.ts";
import { fx } from "./fx.ts";
import { rngFor } from "./rng.ts";
import type { Nation, World } from "./types.ts";

type Say = (nation: number | null, kind: string, text: string) => void;
const active = (n: Nation, tick: number) => (n.missions ?? []).filter(m => m.until >= tick);

/** Priests away on missions this turn: they do not work at home. */
export function priestsAway(n: Nation, tick: number): number { return active(n, tick).reduce((s, m) => s + m.priests, 0); }

/** Births ×this while a mission at home or a festival blesses the families. */
export function blessing(n: Nation, tick: number): number {
  return (active(n, tick).some(m => m.where < 0) ? MISSION.births : 1) * (n.festival && n.festival.until >= tick ? FESTIVAL.births : 1);
}

/** The order "mission": priests go out, at home or to a nation the people knows. */
export function startMission(world: World, n: Nation, a: Record<string, unknown>, L: Ledger, busy: number, find: (to: unknown) => Nation | string): string | null {
  if (!mods(world, n).caps.has(MISSION.cap)) return `Cần năng lực ${MISSION.cap} (từ Nghi lễ) để truyền giáo`;
  const k = Math.max(MISSION.priests[0], Math.min(MISSION.priests[1], Math.floor(Number(a.priests ?? 3)) || 3));
  const spare = n.labor.gather + Math.max(0, workers(n) - Object.values(n.labor).reduce((s, v) => s + v, 0)) - busy - priestsAway(n, world.tick);
  if (k > spare) return `Nhà truyền giáo lấy từ nhóm hái lượm và người rảnh, nhưng chỉ còn ${Math.max(0, spare)} người`;
  const food = k * MISSION.food;
  if ((n.stock.food || 0) < food) return `Cần ${food} lương thực cho ${k} nhà truyền giáo`;
  const home = a.where === undefined || a.where === "home" || a.where === null;
  let where = -1;
  if (home) {
    if (active(n, world.tick).some(m => m.where < 0)) return "Đã có một đoàn truyền giáo trong nước";
  } else {
    const o = find(a.where); if (typeof o === "string") return o;
    if (o.id === n.id) return `Truyền giáo trong nước: where "home"`;
    if (activeWar(world, n.id, o.id)) return `Đang chiến tranh với ${o.name}`;
    if (quarantined(o, world.tick)) return `${o.name} đang cách ly: không cho người lạ vào`;
    if (landGap(world, n.id, o.id) > MISSION.reach) return `${o.name} ở quá xa (quá ${MISSION.reach} ô)`;
    if (active(n, world.tick).filter(m => m.where >= 0).length >= MISSION.abroad) return `Đã có ${MISSION.abroad} đoàn truyền giáo ở nước ngoài`;
    if (active(n, world.tick).some(m => m.where === o.id)) return `Đã có đoàn truyền giáo ở ${o.name}`;
    where = o.id;
  }
  L.stock(n, "food", -food, "reward");
  (n.missions ??= []).push({ where, priests: k, tick: world.tick, until: world.tick + MISSION.turns - 1, converts: 0 });
  n.lastEvents.push(where < 0
    ? `${k} nhà truyền giáo đi khắp nước trong ${MISSION.turns} lượt: dân bớt bất mãn, yên lòng và sinh nhiều con hơn.`
    : `${k} nhà truyền giáo lên đường sang ${world.nations[where].name} giảng đạo trong ${MISSION.turns} lượt.`);
  if (where >= 0) world.nations[where].lastEvents.push(`Nhà truyền giáo của ${n.name} tới giảng đạo ở nước ta: có thể có người theo họ bỏ đi. Muốn đuổi họ: cách ly (quarantine).`);
  return null;
}

/** The order "festival": a season of feasts and weddings. */
export function holdFestival(world: World, n: Nation, a: Record<string, unknown>, L: Ledger): string | null {
  if (n.festival && world.tick - n.festival.tick < FESTIVAL.every) return `Mỗi ${FESTIVAL.every} lượt chỉ một lễ hội (lần trước: lượt ${n.festival.tick})`;
  const eat = mouths(n) * mods(world, n).foodPerPerson;
  if ((n.stock.food || 0) < eat * FESTIVAL.minFoodTurns) return `Kho chỉ đủ ${((n.stock.food || 0) / Math.max(1, eat)).toFixed(1)} lượt ăn: mở lễ hội lúc thiếu ăn là bỏ đói dân (cần ít nhất ${FESTIVAL.minFoodTurns} lượt). Lo lương thực trước`;
  const food = Math.ceil(n.population * FESTIVAL.food);
  if ((n.stock.food || 0) < food) return `Lễ hội cần ${food} lương thực`;
  const lux = a.luxury === undefined ? null : String(a.luxury), luxQ = Math.ceil(n.population * FESTIVAL.luxury);
  if (lux !== null && (!(LUXURY.goods as string[]).includes(lux) || (n.stock[lux] || 0) < luxQ)) return `luxury phải là xa xỉ phẩm có ít nhất ${luxQ} trong kho (${LUXURY.goods.join(", ")})`;
  L.stock(n, "food", -food, "reward");
  if (lux) L.stock(n, lux, -luxQ, "luxury");
  const stab = FESTIVAL.stability + (lux ? FESTIVAL.luxuryStability : 0);
  n.stability = Math.min(100, n.stability + stab);
  n.discontent = Math.max(0, (n.discontent ?? 0) - FESTIVAL.calm);
  n.festival = { tick: world.tick, until: world.tick + FESTIVAL.turns };
  n.lastEvents.push(`Lễ hội lớn: +${stab} ổn định, −${FESTIVAL.calm} bất mãn; mùa cưới: sinh nở ×${FESTIVAL.births} trong ${FESTIVAL.turns} lượt.`);
  return null;
}

/** Each turn: missions at work, and those that end. */
export function missionPhase(world: World, say: Say): void {
  const tick = world.tick;
  for (const n of world.nations) {
    if (!n.alive || !n.missions?.length) continue;
    for (const m of active(n, tick)) {
      if (m.where < 0) {
        n.discontent = Math.max(0, (n.discontent ?? 0) - MISSION.calm);
        n.stability = Math.min(100, n.stability + MISSION.stability);
        const worst = provinces(world, n).filter(p => p.mood > 0).sort((a, b) => b.mood - a.mood || a.centre - b.centre)[0];
        if (worst) (n.provinceUnrest ??= {})[String(worst.centre)] = Math.max(0, worst.mood - MISSION.unrest);
        continue;
      }
      const o = world.nations[m.where];
      if (!o?.alive || activeWar(world, n.id, o.id) || quarantined(o, tick)) {
        m.until = tick - 1;
        n.lastEvents.push(`Đoàn truyền giáo ở ${o?.name ?? "nước kia"} phải trở về (chiến tranh hoặc cách ly).`);
        continue;
      }
      const r = rngFor(world.seed, tick, "mission", n.id, o.id);
      if (hostile(world, n, o) && r() < MISSION.danger) {
        m.until = tick - 1;
        n.casusBelli[String(o.id)] = Math.max(n.casusBelli[String(o.id)] ?? -1, tick + 10);
        n.lastEvents.push(`${o.name} giết các nhà truyền giáo của ta: ta có chính nghĩa để báo thù.`);
        say(n.id, "faith", `${o.name} giết các nhà truyền giáo của ${n.name}.`);
        continue;
      }
      o.stability = Math.max(0, o.stability - MISSION.foreignStability);
      // the restless and the poor listen most
      const chance = MISSION.convert * (o.stability < PROVINCE.restless ? 1.5 : 1);
      if (r() < chance && o.population > 15) {
        const k = Math.min(1 + Math.floor(r() * MISSION.converts), o.population - 15);
        if (k > 0) {
          addPeople(n, takePeople(o, k, "migrate"));
          noteExodus(o, tick, k, n.id, "faith");
          m.converts += k;
          fx({ kind: "migrate", tile: o.capital, nation: o.id, n: k, to: n.capital });
          n.lastEvents.push(`${k} người ${o.name} theo đạo của ta, về sống ở nước ta.`);
          o.lastEvents.push(`${k} người theo đạo của nhà truyền giáo ${n.name}, bỏ sang nước họ.`);
        }
      }
    }
    for (const m of n.missions) if (m.until === tick) {
      n.lastEvents.push(m.where < 0 ? "Đoàn truyền giáo trong nước trở về." : `Đoàn truyền giáo ở ${world.nations[m.where]?.name} trở về${m.converts ? `, đưa ${m.converts} người theo đạo về nước` : ""}.`);
      if (m.converts) say(n.id, "faith", `Nhà truyền giáo của ${n.name} đưa ${m.converts} người ${world.nations[m.where]?.name} theo đạo về nước.`);
    }
    n.missions = n.missions.filter(m => m.until >= tick - 10); // keep a little history
  }
}

export const missionPlace = (world: World, m: { where: number }) => m.where < 0 ? "trong nước" : world.nations[m.where]?.name ?? "?";
export const xyOf = (i: number) => [col(i), row(i)];
