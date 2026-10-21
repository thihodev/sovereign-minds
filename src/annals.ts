// §8.2 A nation's annals: its whole story since its founding, kept by the engine (no AI writes it) and given
// to its own AI every turn. Each chapter covers ANNALS.chapter turns: people at its start and end, the mean
// food and stability, its land, and the few events that mattered most. When there are too many chapters the
// shortest two older neighbours merge, so recent times stay detailed and the further back, the briefer.

import { ANNALS } from "./rules.ts";
import type { ChronicleEntry, Nation, World } from "./types.ts";

export interface Chapter { from: number; to: number; pop: [number, number]; food: number; stab: number; land: [number, number]; notes: Array<{ tick: number; p: number; text: string }> }

/** How much an event of each kind matters to a nation's story. */
const WEIGHT: Record<string, number> = {
  found: 10, fall: 10, schism: 9, era: 9, gate: 9, settle: 8, war: 8, riot: 7, treaty: 6, battle: 6, famine: 6, decree: 5,
  invention: 5, court: 4, plague: 5, raid: 5, horde: 4, border: 4, contagion: 4, event: 3, family: 3, road: 3, sleep: 3,
  proposal: 2, trade: 2, contact: 3, build: 1, spy: 4, deceit: 5, lost: 6,
};
const weigh = (e: ChronicleEntry) => (WEIGHT[e.kind] ?? 2) + (/đầu tiên|lần đầu/.test(e.text) ? 3 : 0);
const clip = (s: string) => (s.length > ANNALS.noteLength ? `${s.slice(0, ANNALS.noteLength - 1)}…` : s);

function landOf(world: World, n: Nation): number { let k = 0; for (const t of world.tiles) if (t.owner === n.id) k++; return k; }

/** The best few notes, in the order they happened. */
function best(notes: Chapter["notes"], k: number): Chapter["notes"] {
  return notes.slice().sort((a, b) => b.p - a.p || a.tick - b.tick).slice(0, k).sort((a, b) => a.tick - b.tick);
}

/** One turn into the open chapter of each founded nation; closes the chapter when it is full (§8.2). */
export function writeAnnals(world: World, chronicle: ChronicleEntry[]): void {
  const tick = world.tick;
  for (const n of world.nations) {
    if (!n.founded) continue;
    const mine = chronicle.filter(e => e.nation === n.id || (e.nation !== null && n.name.length > 2 && e.text.includes(n.name)));
    const open = (n.annalDraft ??= { from: tick, to: tick, pop: [n.population, n.population], food: 0, stab: 0, land: [landOf(world, n), 0], notes: [], turns: 0 });
    open.to = tick; open.pop[1] = n.population; open.food += n.stock.food || 0; open.stab += n.stability; open.land[1] = landOf(world, n); open.turns++;
    for (const e of mine) open.notes.push({ tick, p: weigh(e), text: clip(e.text) });
    open.notes = best(open.notes, ANNALS.notes * 2);
    if (open.turns >= ANNALS.chapter || !n.alive) closeChapter(n);
  }
}
function closeChapter(n: Nation): void {
  const d = n.annalDraft; if (!d || !d.turns) return;
  (n.annals ??= []).push({ from: d.from, to: d.to, pop: d.pop, food: Math.round(d.food / d.turns), stab: Math.round(d.stab / d.turns), land: d.land, notes: best(d.notes, ANNALS.notes) });
  n.annalDraft = undefined;
  // too many chapters: the shortest two neighbours among the older ones become one
  const span = (c: Chapter) => c.to - c.from + 1;
  while (n.annals.length > ANNALS.maxChapters) {
    let i = 0;
    for (let k = 1; k < n.annals.length - 1 - ANNALS.keepFine; k++) if (span(n.annals[k]) + span(n.annals[k + 1]) < span(n.annals[i]) + span(n.annals[i + 1])) i = k;
    const a = n.annals[i], b = n.annals[i + 1];
    n.annals.splice(i, 2, { from: a.from, to: b.to, pop: [a.pop[0], b.pop[1]], food: Math.round((a.food * span(a) + b.food * span(b)) / (span(a) + span(b))), stab: Math.round((a.stab * span(a) + b.stab * span(b)) / (span(a) + span(b))), land: [a.land[0], b.land[1]], notes: best([...a.notes, ...b.notes], ANNALS.notes) });
  }
}

/** Rebuild a nation's annals from the stored chronicle and population history (a world saved before the annals). */
export function backfillAnnals(world: World, n: Nation, entries: ChronicleEntry[], stats: Array<{ tick: number; population: number; food: number; stability: number; tiles: number }>): void {
  const byTick = new Map<number, ChronicleEntry[]>();
  for (const e of entries) { if (!byTick.has(e.tick)) byTick.set(e.tick, []); byTick.get(e.tick)!.push(e); }
  n.annals = []; n.annalDraft = undefined;
  for (const s of stats) {
    const t = s.tick - 1; // stats are written after the turn
    const d = (n.annalDraft ??= { from: t, to: t, pop: [s.population, s.population], food: 0, stab: 0, land: [s.tiles, s.tiles], notes: [], turns: 0 });
    d.to = t; d.pop[1] = s.population; d.food += s.food; d.stab += s.stability; d.land[1] = s.tiles; d.turns++;
    for (const e of byTick.get(t) ?? []) d.notes.push({ tick: t, p: weigh(e), text: clip(e.text) });
    d.notes = best(d.notes, ANNALS.notes * 2);
    if (d.turns >= ANNALS.chapter) closeChapter(n);
  }
  void world;
}

/** The annals in one line a chapter, oldest first, as the nation's AI reads them (compact: it is sent every turn). */
export function annalsLines(n: Nation): string[] {
  return annalsFor(n).map(c => `${c.turns} | dân ${c.people} | lương thực TB ${c.food_avg} | ổn định TB ${c.stability_avg} | ô ${c.tiles}${c.notable.length ? ` | ${c.notable.join(" ; ")}` : ""}`);
}

/** The annals as the Watcher's profile shows them, oldest first, with the chapter still being written. */
export function annalsFor(n: Nation): Array<{ turns: string; people: string; food_avg: number; stability_avg: number; tiles: string; notable: string[] }> {
  const all: Chapter[] = [...(n.annals ?? [])];
  const d = n.annalDraft;
  if (d && d.turns) all.push({ from: d.from, to: d.to, pop: d.pop, food: Math.round(d.food / d.turns), stab: Math.round(d.stab / d.turns), land: d.land, notes: best(d.notes, ANNALS.notes) });
  return all.map(c => ({ turns: c.from === c.to ? `L${c.from}` : `L${c.from}–L${c.to}`, people: `${c.pop[0]}→${c.pop[1]}`, food_avg: c.food, stability_avg: c.stab, tiles: `${c.land[0]}→${c.land[1]}`, notable: c.notes.map(x => `L${x.tick}: ${x.text}`) }));
}
