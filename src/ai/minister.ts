// §4.9 What an AI minister sees: a short system prompt for its field, cut from the nation's own rules (only the
// parts the field needs), and the parts of the nation's observation its field needs, with the ruler's last
// thought and memory as its directives. A minister given the bot's mind plays the bot's logic for its field.

import { MINISTER_DOMAINS, MINISTERS } from "../rules.ts";
import { applyLaws, lawsKey } from "../laws.ts";
import { ministerAp } from "../ministers.ts";
import { buildObservation, systemPrompt } from "./prompt.ts";
import { botTurn } from "./bot.ts";
import type { Rand } from "../rng.ts";
import type { AIResponse, Minister, Nation, World } from "../types.ts";

/** Paragraphs of the nation's rules each field reads (by their first words), besides its own actions. */
const RULE_PARTS: Record<string, string[]> = {
  economy: ["ECONOMY:", "THE WORLD'S EDGE", "RIVERS:", "A CONNECTED REALM", "PROVINCES:", "ROADS AND SEA LANES", "TERRITORIAL WATERS"],
  war: ["THE WORLD'S EDGE", "NEIGHBOURS AND BORDERS", "TERRITORIAL WATERS"],
  diplomacy: ["TRADE ROADS", "NEIGHBOURS AND BORDERS", "PLAGUE SPREADS", "DISCONTENT AND SCHISM", "PROSPERITY AND NATIONAL PRIDE"],
  learning: ["AN OPEN WORLD", "YOUR PEOPLE'S NATURE"],
  interior: ["YOUR COURT", "PEOPLE AND FAMILIES", "DISCONTENT AND SCHISM", "PROVINCES:", "PROSPERITY AND NATIONAL PRIDE"],
};
/** Parts of the nation's observation each field reads. */
const OBS_PARTS: Record<string, string[]> = {
  economy: ["population", "labor", "crafts", "stock", "goods_names", "tile_limit", "governed", "territory", "claimable", "nearest_river", "buildings", "can_build", "recipes", "resources", "roads", "fresh_water", "provinces", "prosperity", "threats"],
  war: ["population", "labor", "stock", "neighbours", "known_nations", "wars", "recent_battles", "treaties", "hordes", "threats", "territory"],
  diplomacy: ["stock", "goods_names", "neighbours", "known_nations", "inbox", "trade_offers_to_me", "treaty_offers_to_me", "treaties", "wars", "caravans", "migrants_asking", "health", "plague_nearby", "prosperity"],
  learning: ["inventions", "capabilities", "research", "research_options", "invention_budget", "my_proposals", "stolen_tech", "labor", "resources"],
  interior: ["population", "labor", "stock", "court", "provinces", "prosperity", "people_leaving", "threats"],
};

/** The domain's own lines of the nation's rules: chosen paragraphs, and the ACTIONS lines of its order types. */
function domainRules(world: World, domain: string): string {
  const def = MINISTER_DOMAINS[domain], allowed = new Set(def.actions);
  const blocks = systemPrompt(world).split("\n\n"), out: string[] = [];
  for (const b of blocks) {
    if (RULE_PARTS[domain].some(p => b.split("\n").some(line => line.startsWith(p)))) { out.push(b); continue; }
    if (b.startsWith("ACTIONS")) {
      const keep: string[] = ["ACTIONS (AP cost, paid from YOUR OWN AP):"];
      let on = false;
      for (const line of b.split("\n").slice(1)) {
        if (line.startsWith("- ")) on = [...line.matchAll(/(?:^- |[;/] )([a-z_]+) \(/g)].some(m => allowed.has(m[1])) || allowed.has(line.slice(2).split(/[ (]/)[0]);
        if (on) keep.push(line);
      }
      out.push(keep.join("\n"));
    }
    if (b.startsWith("SECURITY:")) out.push(b);
  }
  return out.join("\n\n");
}

let cached = new Map<string, string>();
let cachedKey = "";
/** The minister's system prompt (English): who it serves, its field, its reply, and its part of the rules. */
export function ministerSystem(world: World, n: Nation, m: Minister): string {
  applyLaws(world);
  const key = lawsKey(world);
  if (key !== cachedKey) { cached = new Map(); cachedKey = key; }
  const ck = `${m.domain}|${n.name}`;
  if (cached.has(ck)) return cached.get(ck)!;
  const def = MINISTER_DOMAINS[m.domain], first = MINISTERS.rulerFirst.filter(t => def.actions.includes(t));
  const extra =m.domain === "economy"
    ? `\n  "labor": {"gather":0,…} (optional; applies only on a turn the ruler sends no labor), "crafts": {"recipe_id": count} (optional; only if the ruler sends none), "mine_target": "…" (optional; only if the ruler sends none),`
    : m.domain === "war" ? `\n  "warriors": n (optional: how many of your workers are warriors; applies only on a turn the ruler sends no labor),` : "";
  const text = `You are a MINISTER in "Sovereign Minds", a shared world where every nation is led by its own AI and a neutral World Engine enforces every rule in code. You serve the ruler of ${n.name || "your nation"}: it is another AI and it governs; follow its directives ("ruler_directives": its last thought and its memory), and never work against them. Your field is ${m.domain.toUpperCase()}: ${def.en}. You act ONLY in your field: you may order ${def.actions.join(", ")}; any other order is refused. You have your OWN action points each turn ("ap" in the observation; ${MINISTERS.ap.base} + 1 per ${MINISTERS.ap.perPop} people, max ${MINISTERS.ap.max}), separate from the ruler's; refused orders still cost their AP. You act after the ruler, in the same turn, without seeing its new orders: do not undo them${first.length ? ` — the engine refuses ${first.join(", ")} from you on a turn the ruler gave the same order` : ""}${m.domain === "diplomacy" ? "; peace is the ruler's alone (no peace treaty, no accepting one)" : m.domain === "war" ? "; declaring war and making peace are the ruler's alone" : ""}. Give each turn the orders your field needs; if the ruler's directives say to wait, you may give none. Read "advice" (the engine's reading of the nation, ! useful … !!! urgent) and "your_last_orders" (✓ done, ✗ refused and why): do not repeat a refused order without fixing its cause.

EACH TURN (1 turn = 10 years) you receive a JSON observation and must reply with ONE JSON object and nothing else:
{
  "thought": "≤300 chars, Vietnamese. Only the human Watcher reads it.",${extra}
  "actions": [ {"type": "...", ...} ]
}${m.domain === "economy" || m.domain === "war" ? "\nLabor must not exceed population.workers; unassigned workers forage; warriors produce nothing but defend and fight." : ""}

THE PARTS OF THE NATION'S RULES YOUR FIELD NEEDS:

${domainRules(world, m.domain)}

Write free text in Vietnamese. Reply with JSON only.`;
  cached.set(ck, text);
  return text;
}

/** The minister's observation: its field's parts of the nation's observation, the ruler's directives, its own last turn. */
export function ministerObservation(world: World, n: Nation, m: Minister): Record<string, unknown> {
  const full = buildObservation(world, n), def = MINISTER_DOMAINS[m.domain];
  const out: Record<string, unknown> = {
    tick: world.tick,
    you_are: { title: def.title, field: m.domain, name: m.name, nation: n.name, in_office_since: m.since },
    ap: ministerAp(n),
    ruler_directives: { ruler_last_thought: n.lastThought || undefined, ruler_memory: n.memory || undefined },
    your_last_thought: m.lastThought || undefined,
    your_last_orders: m.lastOrders?.length ? m.lastOrders : undefined,
    era: full.era, identity: full.identity, nation: full.nation, advice: full.advice,
    events: full.events,
  };
  for (const k of OBS_PARTS[m.domain] ?? []) if (full[k] !== undefined) out[k] = full[k];
  return out;
}

/** A minister with the bot's mind: the bot's plan for the nation, only the orders of the minister's field. */
export function botMinister(world: World, n: Nation, m: Minister, rand: Rand): AIResponse {
  const plan = botTurn(world, n, rand), def = MINISTER_DOMAINS[m.domain];
  // a bot minister keeps to deeds: it sends no letters or gestures in the nation's name (words are for minds)
  const out: AIResponse & Record<string, unknown> = { thought: `Theo lệ thường của bot cho ${def.title}.`, actions: (plan.actions ?? []).filter(a => def.actions.includes(String(a?.type ?? "")) && a?.type !== "message") };
  if (m.domain === "economy") { out.labor = plan.labor; out.crafts = plan.crafts; }
  if (m.domain === "war" && plan.labor?.warrior !== undefined) out.warriors = plan.labor.warrior;
  return out;
}
