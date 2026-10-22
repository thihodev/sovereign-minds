// §10.8 New rules. The rules each ruler reads are rebuilt from the code every turn, so a change holds from the first
// turn after it is deployed; but a long rulebook hides what changed, and a ruler's memory still holds the old ways.
// For a few turns after the rules change, each ruler is told what is new, from the changelog.

import { readFileSync } from "node:fs";
import type { World } from "./types.ts";

/** How many turns the rulers are told. */
export const RULE_NEWS = { turns: 5, sections: 4, chars: 2400 };

let cache: Array<{ version: string; text: string }> | null = null;
/** The changelog's sections, newest first ("## v0.57" → its lines, without Markdown emphasis). */
function sections(): Array<{ version: string; text: string }> {
  if (cache) return cache;
  let md = "";
  try { md = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8"); } catch { md = ""; }
  cache = md.split(/\n## v/).slice(1).map(s => {
    const [head, ...rest] = s.split("\n");
    // the patch notes ("- 0.57.1, …") are fixes and the Watcher's screens, not rules: left out
    const kept: string[] = [];
    let skip = false;
    for (const l of rest) { if (/^- \*{0,2}\d+\.\d+\.\d+,/.test(l)) { skip = true; continue; } if (skip && /^\s+\S/.test(l)) continue; skip = false; kept.push(l); }
    return { version: head.trim(), text: kept.join("\n").replace(/\*\*/g, "").replace(/`/g, "").trim() };
  });
  return cache;
}
const newer = (a: string, b: string | null) => {
  if (!b) return true;
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  return x[0] > y[0] || (x[0] === y[0] && (x[1] ?? 0) > (y[1] ?? 0));
};

/** What the rulers are told this turn, if the rules changed lately. */
export function ruleNews(world: World): { since_turn: number; version: string; what_changed: string } | undefined {
  const c = world.rulesChange;
  if (!c || world.tick - c.tick >= RULE_NEWS.turns) return undefined;
  const fresh = sections().filter(s => newer(s.version, c.from)).slice(0, RULE_NEWS.sections);
  if (!fresh.length) return undefined;
  return { since_turn: c.tick, version: c.to, what_changed: fresh.map(s => `v${s.version}:\n${s.text}`).join("\n").slice(0, RULE_NEWS.chars) };
}
