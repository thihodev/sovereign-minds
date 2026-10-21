// Pace targets: bot-only worlds through the real engine, checked against the pace the rules aim for.
// Run it after every rule change; a red line means the change moved the world off its pace.
//
//   node --disable-warning=ExperimentalWarning tools/pace.ts [--seeds a,b,c] [--ticks 500] [--nations 6] [--set GROWTH.rate=0.07,...]
//
// The Watcher here lets every faction found its nation (the hardest case for the world's order).

import { performance } from "node:perf_hooks";
import { createWorld, step, type NationSpec } from "../src/engine.ts";
import { botTurn } from "../src/ai/bot.ts";
import { rngFor } from "../src/rng.ts";
import * as RULES from "../src/rules.ts";
import { ERA_TABLE } from "../src/rules.ts";
import type { TurnInput, World } from "../src/types.ts";

const arg = (name: string, def: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def; };
const seeds = arg("seeds", "pace-a,pace-b,pace-c").split(","), ticks = Number(arg("ticks", "500")), nations = Number(arg("nations", "6"));
// --set TABLE.field=value (e.g. HAMLET.max=30) to try a change before writing it
for (const kv of arg("set", "").split(",").filter(Boolean)) {
  const [path, v] = kv.split("="), [table, ...field] = path.split(".");
  let obj = (RULES as Record<string, unknown>)[table] as Record<string, unknown>;
  for (const f of field.slice(0, -1)) obj = obj[f] as Record<string, unknown>;
  obj[field.at(-1)!] = Number(v);
}

interface Run { seed: string; neo: number | null; bronze: number | null; iron: number | null; pop300: number[]; settl300: number[]; dead: number; nations: number; schisms: number; msPerTick: number; audits: number }

function run(seed: string): Run {
  const w: World = createWorld(seed, Array.from({ length: nations }, () => ({ controller: "bot", provider: "bot", model: "bot" }) as NationSpec));
  let audits = 0, pop300: number[] = [], settl300: number[] = [];
  const t0 = performance.now();
  for (let k = 0; k < ticks; k++) {
    const inputs: Record<number, TurnInput> = {};
    for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: botTurn(w, n, rngFor(w.seed, w.tick, "bot", n.id)) };
    audits += step(w, inputs).audit.length;
    for (const x of w.schisms ?? []) if (x.status === "pending") Object.assign(x, { status: "approved", controller: "bot", provider: "bot", model: "bot" });
    if (w.tick === 300) { const first = w.nations.slice(0, nations).filter(n => n.alive); pop300 = first.map(n => n.population); settl300 = first.map(n => n.settlements.length); }
  }
  const gate = (k: number) => w.eraGates[ERA_TABLE[k].name] ?? null;
  return { seed, neo: gate(1), bronze: gate(2), iron: gate(3), pop300, settl300, dead: w.nations.filter(n => !n.alive).length, nations: w.nations.length, schisms: (w.schisms ?? []).filter(x => x.status === "done").length, msPerTick: (performance.now() - t0) / ticks, audits };
}

const median = (a: number[]) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const runs = seeds.map(run);
// What the rules aim for (§5.6 eras, §4.2 people, §2.3 land, §4.5 order)
const targets: Array<{ name: string; value: (r: Run) => number | null; lo: number; hi: number }> = [
  { name: "lượt đầu tiên vào Đồ Đá Mới", value: r => r.neo, lo: 50, hi: 160 },
  { name: "lượt đầu tiên vào Đồ Đồng", value: r => r.bronze, lo: 140, hi: 420 }, // copper on the land is luck of the seed
  { name: "dân trung vị ở lượt 300", value: r => median(r.pop300), lo: 100, hi: 300 },
  { name: "điểm định cư trung vị ở lượt 300", value: r => median(r.settl300), lo: 1, hi: 5 },
  { name: "nước diệt vong (cả nước ly khai)", value: r => r.dead, lo: 0, hi: 1 },
  { name: "nước ly khai được lập", value: r => r.schisms, lo: 0, hi: 4 },
  { name: "ms mỗi lượt", value: r => Math.round(r.msPerTick), lo: 0, hi: 90 },
  { name: "lỗi sổ cái", value: r => r.audits, lo: 0, hi: 0 },
];
let bad = 0;
console.log(`${seeds.length} thế giới × ${ticks} lượt × ${nations} nước (bot; Watcher cho mọi phái ly khai lập quốc)\n`);
console.log(["chỉ tiêu".padEnd(36), "mục tiêu".padEnd(12), ...seeds.map(s => s.padEnd(10))].join(""));
for (const t of targets) {
  const cells = runs.map(r => { const v = t.value(r); const ok = v !== null && v >= t.lo && v <= t.hi; if (!ok) bad++; return `${ok ? "✓" : "✗"} ${v ?? "—"}`.padEnd(10); });
  console.log([t.name.padEnd(36), `${t.lo}–${t.hi}`.padEnd(12), ...cells].join(""));
}
console.log(`\n${bad ? `${bad} ô lệch chỉ tiêu` : "Mọi chỉ tiêu đạt"}.`);
process.exitCode = bad ? 1 : 0;
