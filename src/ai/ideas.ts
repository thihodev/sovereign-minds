// §10.7 The Judge of Ideas: an AI rules on the nations' initiatives so the Watcher only marks what is built.
// It sees the rules every nation plays by and every idea already taken up or refused, so it can tell a new
// mechanism from one the world already has.

import { INITIATIVE } from "../rules.ts";
import { systemPrompt } from "./prompt.ts";
import type { Petition, World } from "../types.ts";

export const IDEA_JUDGE_SYSTEM = `You are the Judge of Ideas in "Sovereign Minds", an open world run by AI nations. Nations propose initiatives ("sáng kiến") that would make the world deeper and more real for everyone: a resource, a mechanic, an event, a building, a custom. A human developer will BUILD every idea you take up into the game's code, and the nation that proposed it is rewarded with a second AI mind for ${INITIATIVE.mind.accepted} turns — which costs real tokens. Be a careful game designer: take up what truly adds to the world, and refuse the rest with a clear reason.

You are given the rules every nation plays by now (the world as it is), the ideas already taken up or refused, and the new ideas. For each new idea decide:
- "accepted": a NEW mechanism or content that fits the world, is fair to every nation, concrete, and balanced as written (or with only small number changes).
- "partial": the aim is good but part of it duplicates what the world already has, would be unfair or unbalanced, cannot be computed from the world's data, or needs reshaping. Say exactly what will be built instead, with numbers.
- "rejected": it duplicates what already exists (say what), only takes something away (e.g. a rule that only cuts food), favours one nation, is vague, or would need a huge change for little gain.
Check carefully against the rules: many ideas re-invent something the world already does (salt already keeps food, wild plants are already wild grain, herbs do not spoil, trade already calms borders…). Prefer reusing existing goods and systems over new near-duplicates. Ideas the same as one already taken up are "rejected".

Write the verdict in VIETNAMESE, 2–4 sentences, plain words, addressed to the nation: what is taken up and how it will work (with numbers), or why not. It is shown to the nation and to the developer, who builds exactly what the verdict says.

Reply with ONLY this JSON: {"rulings":[{"id":<petition id>,"status":"accepted"|"partial"|"rejected","verdict":"…"}]}`;

/** The ideas before this one: what the world has taken up or refused, so the Judge does not take the same twice. */
function history(world: World): string {
  const past = world.petitions.filter(p => p.category === "sáng kiến" && p.status !== "pending").slice(-40);
  if (!past.length) return "(none yet)";
  const word: Record<string, string> = { accepted: "TAKEN UP", partial: "TAKEN UP IN PART", rejected: "REFUSED", merged: "MERGED" };
  return past.map(p => `- #${p.id} "${p.title}" [${p.kind ?? "khác"}] ${word[p.status] ?? p.status}${p.implemented ? ", BUILT" : ""}${p.verdict ? ` — ${p.verdict}` : ""}`).join("\n");
}

export function ideaJudgePrompt(world: World, ideas: Petition[]): string {
  return `THE RULES OF THE WORLD NOW (what every nation is told):
${systemPrompt(world)}

IDEAS ALREADY DECIDED:
${history(world)}

NEW IDEAS TO JUDGE:
${ideas.map(p => `#${p.id} from ${world.nations[p.nation]?.name ?? "?"} — kind: ${p.kind ?? "khác"} — "${p.title}"
${p.text}
Reason: ${p.reason || "—"}`).join("\n\n")}`;
}

export interface IdeaRuling { id: number; status: "accepted" | "partial" | "rejected"; verdict: string }
/** The Judge's answer, checked: only ideas it was asked about, only the three outcomes, a verdict in words. */
export function parseIdeaRulings(j: Record<string, unknown>, asked: Petition[]): IdeaRuling[] {
  const ids = new Set(asked.map(p => p.id)), out: IdeaRuling[] = [];
  for (const x of Array.isArray(j.rulings) ? j.rulings as Array<Record<string, unknown>> : []) {
    const id = Number(x.id), status = String(x.status), verdict = String(x.verdict ?? "").trim().slice(0, 500);
    if (!ids.has(id) || !["accepted", "partial", "rejected"].includes(status) || !verdict) continue;
    out.push({ id, status: status as IdeaRuling["status"], verdict });
  }
  return out;
}
