// Trait balance harness (§2.4): bot-only worlds where every nation has a
// trait, rotated over the spawns so each trait plays from every start.
// Reports each trait's average rank and score; no AI is called.
//
//   node --disable-warning=ExperimentalWarning tools/traits.ts [--seeds a,b] [--ticks 300] [--set hunters.rp=-0.05]

import { createWorld, ownedTiles, step, type NationSpec } from "../src/engine.ts";
import { botTurn } from "../src/ai/bot.ts";
import { ranking } from "../src/ranking.ts";
import { rngFor } from "../src/rng.ts";
import { START, TRAITS, TRAIT_BY_ID } from "../src/rules.ts";
import type { TurnInput } from "../src/types.ts";

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}
const SEEDS = arg("seeds", "nguyen-dia-1,nguyen-dia-2").split(",").map(s => s.trim()).filter(Boolean);
const TICKS = Math.max(1, Number(arg("ticks", "300")));
// --set hunters.rp=-0.05,farmers.role.farm=0.2 : try a value in this process only
for (const kv of arg("set", "").split(",").map(s => s.trim()).filter(Boolean)) {
  const [path, v] = kv.split("="), [id, ...keys] = path.split(".");
  let o: Record<string, unknown> = TRAIT_BY_ID[id]?.effects as Record<string, unknown>;
  if (!o) { console.error(`Không có đặc thù "${id}"`); process.exit(1); }
  if (keys[0] === "diffusion") { (TRAIT_BY_ID[id] as unknown as Record<string, number>).diffusion = Number(v); continue; }
  for (const k of keys.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>;
  o[keys[keys.length - 1]] = Number(v);
}

type Acc = { games: number; rank: number; score: number; pop: number; inv: number; tiles: number; dead: number };
const acc: Record<string, Acc> = Object.fromEntries(TRAITS.map(t => [t.id, { games: 0, rank: 0, score: 0, pop: 0, inv: 0, tiles: 0, dead: 0 }]));
const K = TRAITS.length;

for (const seed of SEEDS) {
  for (let r = 0; r < K; r++) {
    const specs: NationSpec[] = TRAITS.map((_, k) => ({ controller: "bot", provider: "bot", model: "bot", trait: TRAITS[(k + r) % K].id }));
    const w = createWorld(seed, specs);
    for (let t = 0; t < TICKS; t++) {
      const inputs: Record<number, TurnInput> = {};
      for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: botTurn(w, n, rngFor(w.seed, w.tick, "bot", n.id)) };
      step(w, inputs);
    }
    const ranks = ranking(w);
    for (const n of w.nations) {
      const a = acc[n.trait!], k = ranks.findIndex(x => x.nation === n.id);
      a.games++; a.rank += k < 0 ? ranks.length + 1 : k + 1; a.score += k < 0 ? 0 : ranks[k].score;
      a.pop += n.population; a.inv += n.inventions.length - START.inventions.length; a.tiles += ownedTiles(w, n.id).length; a.dead += n.alive ? 0 : 1;
    }
    process.stderr.write(".");
  }
}
process.stderr.write("\n");
const rows = TRAITS.map(t => ({ t, a: acc[t.id] })).sort((x, y) => x.a.rank / x.a.games - y.a.rank / y.a.games);
const meanScore = rows.reduce((s, r) => s + r.a.score / r.a.games, 0) / rows.length;
console.log(`${SEEDS.length} seed × ${K} vòng xoay × ${TICKS} lượt (hạng 1 = tốt nhất; điểm so với trung bình ${meanScore.toFixed(0)})\n`);
console.log("| Đặc thù | Hạng TB | Điểm | ±% | Dân | Phát minh | Ô | Diệt vong |\n|---|---|---|---|---|---|---|---|");
for (const { t, a } of rows) {
  const g = a.games, sc = a.score / g;
  console.log(`| ${t.icon} ${t.name} | ${(a.rank / g).toFixed(2)} | ${sc.toFixed(0)} | ${((sc / meanScore - 1) * 100).toFixed(0)} | ${(a.pop / g).toFixed(0)} | ${(a.inv / g).toFixed(1)} | ${(a.tiles / g).toFixed(1)} | ${a.dead}/${g} |`);
}
