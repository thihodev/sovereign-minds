// §4.8 People who leave. A ruler's first duty is to keep the people: every family that walks away (to a
// richer neighbour, across the border, with a faction, away from unrest) is counted, with where it went and
// why, and a people that keeps losing its own costs its rulers stability and good name.

import { EXODUS } from "./rules.ts";
import type { Nation } from "./types.ts";

export type Why = "unrest" | "envy" | "border" | "faction" | "schism" | "conquest" | "faith";
export const WHY_VI: Record<Why, string> = { unrest: "bất ổn", envy: "ganh tị với nước giàu hơn", border: "vượt biên sang nơi yên ổn hơn", faction: "phái bất mãn xin sang nước khác", schism: "ly khai lập quốc riêng", conquest: "đất bị chiếm, dân ở lại dưới quyền kẻ chiếm", faith: "theo đạo của nhà truyền giáo nước khác" };

/** Write down who left this turn. */
export function noteExodus(n: Nation, tick: number, k: number, to: number | null, why: Why): void {
  if (k <= 0) return;
  const log = (n.exodus ??= []);
  log.push({ tick, k, to, why });
  while (log.length && log[0].tick < tick - EXODUS.keep) log.shift();
}

/** Departures the rulers answer for with the alarm (§4.8): a schism and a conquest have their own price already. */
const BLAMED = new Set<string>(["unrest", "envy", "border", "faction", "faith"]);

/** The people who left in the last `turns` turns: how many, what share (of those the rulers answer for), where to, why. */
export function exodusOf(n: Nation, tick: number, turns = EXODUS.window): { lastTurn: number; recent: number; share: number; to: Record<string, number>; why: Partial<Record<Why, number>> } {
  const recent = (n.exodus ?? []).filter(x => x.tick > tick - turns - 1);
  const to: Record<string, number> = {}, why: Partial<Record<Why, number>> = {};
  for (const x of recent) { if (x.to !== null) to[x.to] = (to[x.to] || 0) + x.k; why[x.why as Why] = (why[x.why as Why] || 0) + x.k; }
  const total = recent.reduce((s, x) => s + x.k, 0), blamed = recent.filter(x => BLAMED.has(x.why)).reduce((s, x) => s + x.k, 0);
  return { lastTurn: recent.filter(x => x.tick === tick - 1 || x.tick === tick).reduce((s, x) => s + x.k, 0), recent: total, share: blamed / Math.max(1, n.population + blamed), to, why };
}
