// A simple rule-based player. It stands in for a nation whose API key is
// missing, and it drives the engine tests. It sends the same JSON an AI sends.

import { BUILDING_BY_TYPE, CLAIM_FOOD, FLAG_LAYOUTS, FLAG_SYMBOLS, INVENTION_BY_ID } from "../rules.ts";
import { col, row, NEIGHBORS } from "../hex.ts";
import { housing, inventionCost, mods, ownedTiles, researchOptions, tileLimit, workers } from "../engine.ts";
import { pickOne, type Rand } from "../rng.ts";
import { tileValue } from "../worldgen.ts";
import type { AIResponse, Nation, World } from "../types.ts";

const SYL = ["ar", "ve", "lo", "mi", "ta", "ru", "en", "so", "ka", "di", "on", "ha", "li", "mu", "re", "za"];

function hueColor(h: number): string {
  const s = 0.65, l = 0.45, a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return "#" + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

export function botTurn(world: World, n: Nation, rand: Rand): AIResponse {
  const actions: Array<Record<string, unknown>> = [];
  if (!n.founded) {
    const word = () => { let s = ""; for (let i = 0; i < 2 + Math.floor(rand() * 2); i++) s += pickOne(SYL, rand); return s[0].toUpperCase() + s.slice(1); };
    const name = word();
    actions.push({
      type: "found_nation", name, capital: word(), people: `người ${name}`,
      flag: { layout: pickOne(FLAG_LAYOUTS, rand), colors: [hueColor((n.id * 137) % 360), "#f2efe6"], symbol: pickOne(FLAG_SYMBOLS, rand) },
      manifesto: "Lửa của chúng ta sẽ không bao giờ tắt.",
    });
    return { thought: "Lập quốc.", actions, labor: n.labor };
  }

  const m = mods(world, n), w = workers(n), need = n.population * m.foodPerPerson;
  const owned = ownedTiles(world, n.id);
  const sum = (k: "game" | "plants" | "fish") => owned.reduce((s, t) => s + (t.res[k] || 0), 0);
  const stockFood = n.stock.food || 0;
  // Aim for a 50% buffer: droughts and winters halve harvests without warning.
  const target = need * 1.5 - stockFood * 0.2;
  let foodWorkers = Math.min(w, Math.max(2, Math.ceil(target / 2.0)));
  const fishers = sum("fish") > 20 ? Math.min(Math.floor(foodWorkers / 3), Math.floor(sum("fish") / 2.2 / 2)) : 0;
  // Hunters only pay off with tools (one tool serves four); the rest forage.
  const tools = ["bow", "spear", "blade", "stone_tool"].reduce((s, k) => s + (n.stock[k] || 0), 0);
  const huntCap = Math.min(sum("game") > 5 ? Math.floor(sum("game") / 2.5) + 1 : 0, Math.floor(tools) * 4 + (sum("plants") > 10 ? 0 : 99));
  let hunters = Math.min(foodWorkers - fishers, huntCap);
  let gatherers = Math.max(0, foodWorkers - fishers - hunters);
  if (gatherers > 0 && sum("plants") < gatherers * 2) { hunters += gatherers; gatherers = 0; }
  let left = w - fishers - hunters - gatherers;
  const pending = n.buildings.filter(b => !b.done);
  const builders = pending.length ? Math.min(left, 2) : 0; left -= builders;
  const hasShop = n.buildings.some(b => b.type === "workshop");
  const crafters = hasShop ? Math.min(left, 2) : 0; left -= crafters;
  const toolsWanted = Math.ceil(hunters / 4) + 2;
  const wood = Math.min(left, 1); left -= wood;
  const stone = Math.min(left, tools < toolsWanted || (n.stock.stone || 0) < 6 ? 2 : 1); left -= stone;
  let research = left;
  if (research === 0 && gatherers + hunters > 3) { research = 1; if (gatherers) gatherers--; else hunters--; }
  const labor = { gather: gatherers, hunt: hunters, fish: fishers, farm: 0, wood, stone, flint: 0, clay: 0, craft: crafters, build: builders, research, warrior: 0 };
  const fields = n.buildings.filter(b => b.done && b.type === "field").length;
  if (fields && labor.gather >= 2) { const k = Math.min(labor.gather, fields * 6); labor.gather -= k; labor.farm += k; }

  const crafts: Record<string, number> = {};
  if (tools < toolsWanted) crafts.stone_tool = 3;
  if (n.inventions.includes("P3") && (n.stock.rope || 0) < 4) crafts.rope = 2;
  if (n.inventions.includes("P1") && (n.stock.blade || 0) < 2) crafts.blade = 1;
  if (n.inventions.includes("P7") && (n.stock.hide_coat || 0) < n.population / 2) crafts.hide_coat = 1;

  if (!n.research) {
    const opts = researchOptions(world, n).sort((a, b) => inventionCost(world, n, a) - inventionCost(world, n, b) || a.localeCompare(b));
    if (opts.length) actions.push({ type: "research", invention: opts[0] });
  }
  const want = (type: string) => !n.buildings.some(b => b.type === type);
  const affordable = (type: string) => Object.entries(BUILDING_BY_TYPE[type].cost).every(([k, q]) => (n.stock[k] || 0) >= q);
  if (want("workshop") && affordable("workshop")) actions.push({ type: "build", building: "workshop" });
  else if (n.inventions.includes("P8") && n.population > housing(world, n) - 4 && affordable("tent") && pending.length === 0) actions.push({ type: "build", building: "tent" });
  else if (n.inventions.includes("P5") && want("altar") && affordable("altar")) actions.push({ type: "build", building: "altar" });
  else if (n.inventions.includes("P14") && fields < 2) {
    const t = owned.find(x => x.land && (x.terrain === "grass" || x.terrain === "coast" || x.river) && !n.buildings.some(b => b.tile === x.i));
    if (t) actions.push({ type: "build", building: "field", tile: [col(t.i), row(t.i)] });
  } else if (want("pit") && affordable("pit")) actions.push({ type: "build", building: "pit" });

  if (owned.length < tileLimit(world, n) && stockFood > need * 0.6 + CLAIM_FOOD) {
    const frontier = new Map<number, number>();
    for (const t of owned) for (const j of NEIGHBORS[t.i]) { const u = world.tiles[j]; if (u.owner === -1 && u.terrain !== "ocean") frontier.set(j, tileValue(u)); }
    const best = [...frontier.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    if (best) actions.push({ type: "claim_tile", tile: [col(best[0]), row(best[0])] });
  }
  if (world.tick % 12 === 5) actions.push({ type: "explore", direction: pickOne(["E", "NE", "NW", "W", "SW", "SE"], rand), people: 2 });
  const projectName = n.research ? INVENTION_BY_ID[n.research.id]?.name : "chưa chọn";
  return { thought: `Giữ đủ ăn, nghiên cứu ${projectName}.`, labor, crafts, actions, memory: n.memory };
}
