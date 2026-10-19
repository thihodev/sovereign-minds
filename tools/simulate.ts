// Balance harness: runs bot-only worlds through the real engine and reports
// what happened, so rule changes can be measured instead of guessed.
//
//   node --disable-warning=ExperimentalWarning tools/simulate.ts \
//     --seeds a,b,c --ticks 500 --nations 7 [--out docs/BALANCE.md] [--json out.json]
//     [--every 50] [--variant base|tent-max4|settle-hard|...] [--brief] [--quiet]
//
// With --out, the report replaces the text between the markers
// <!-- simulate:begin --> and <!-- simulate:end --> (or, with a variant,
// <!-- simulate:<variant>:begin --> ...) if the file has them, so hand-written
// analysis around the numbers survives a re-run.
//
// --variant changes rule tables in this process only (never the files), to
// estimate what a proposed rule change would do before anyone writes it.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createWorld, housing, ownedTiles, step, type NationSpec } from "../src/engine.ts";
import { botTurn } from "../src/ai/bot.ts";
import { rngFor } from "../src/rng.ts";
import { BUILDING_BY_TYPE, ERAS, EVENTS, INVENTIONS, SETTLEMENT, START } from "../src/rules.ts";
import type { TurnInput, World } from "../src/types.ts";

// ---------------------------------------------------------------- options

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}
const SEEDS = arg("seeds", "nguyen-dia-1,nguyen-dia-2,nguyen-dia-3").split(",").map(s => s.trim()).filter(Boolean);
const TICKS = Math.max(1, Number(arg("ticks", "500")));
const NATIONS = Math.max(1, Number(arg("nations", "7")));
const EVERY = Math.max(1, Number(arg("every", "50")));
const OUT = arg("out", "");
const JSON_OUT = arg("json", "");
const VARIANT = arg("variant", "base");
const QUIET = process.argv.includes("--quiet");
const BRIEF = process.argv.includes("--brief"); // aggregate only, no per-seed tables

/** Rule experiments, applied to the in-memory tables only. */
const VARIANTS: Record<string, { desc: string; apply: () => void }> = {
  base: { desc: "luật hiện tại, không đổi gì", apply: () => {} },
  "tent-max4": { desc: "mỗi quốc gia tối đa 4 lều", apply: () => { if (BUILDING_BY_TYPE.tent) BUILDING_BY_TYPE.tent.max = 4; } },
  "settle-hard": {
    desc: "định cư cần 60 dân, 60 lương thực, cách các trung tâm ≥ 6 ô, chỉ +10 chỗ ở",
    apply: () => { SETTLEMENT.minPopulation = 60; SETTLEMENT.food = 60; SETTLEMENT.minDist = 6; SETTLEMENT.housing = 10; },
  },
  "housing-capped": {
    desc: "tối đa 4 lều và định cư khó (gộp tent-max4 + settle-hard)",
    apply: () => { VARIANTS["tent-max4"].apply(); VARIANTS["settle-hard"].apply(); },
  },
  "plague-x2": { desc: "dịch bệnh gấp đôi (4%/lượt, 8% khi > 80 dân)", apply: () => { EVENTS.plague.chance *= 2; } },
  "rp-x3": { desc: "RP của 18 phát minh cây gốc ×3", apply: () => { for (const v of INVENTIONS) v.rp *= 3; } },
  "rp-depth": {
    desc: "RP cây gốc × (1 + độ sâu): P1 40, P8 100, P14 360, P18 400",
    apply: () => {
      const depth = (id: string): number => { const v = INVENTIONS.find(x => x.id === id); return v && v.prereqs.length ? 1 + Math.max(...v.prereqs.map(depth)) : 0; };
      const d = new Map(INVENTIONS.map(v => [v.id, depth(v.id)]));
      for (const v of INVENTIONS) v.rp *= 1 + (d.get(v.id) ?? 0);
    },
  },
  season: {
    desc: "gộp housing-capped + RP cây gốc × (1 + độ sâu)",
    apply: () => { VARIANTS["housing-capped"].apply(); VARIANTS["rp-depth"].apply(); },
  },
};
if (!VARIANTS[VARIANT]) { console.error(`Không có biến thể "${VARIANT}". Có: ${Object.keys(VARIANTS).join(", ")}`); process.exit(1); }
VARIANTS[VARIANT].apply();

// ---------------------------------------------------------------- data shapes

interface NationRun {
  id: number; name: string; alive: boolean; diedAt: number | null;
  pop: number; peakPop: number; housing: number; peakHousing: number; tiles: number; inventions: number; custom: number;
  era: string; neoAt: number | null; housingOver25At: number | null; settlements: number; stability: number; food: number;
  minStability: number; famineDeaths: number; famineTicks: number; winterDeaths: number; plagueDeaths: number; migrants: number;
  explorersLost: number; riots: number; buildings: Record<string, number>; proposals: number;
  battlesWon: number; battlesLost: number; tilesTaken: number; tilesLost: number; rejected: number;
  tentAt: number | null; settleAt: number | null; pop50At: number | null; pop100At: number | null; pop500At: number | null; treeAt: number | null;
}
interface WarRun {
  id: number; a: number; b: number; declared: number; end: number | null; ally: boolean;
  popA: number; popB: number; battles: number; won: number; tiles: number; lossA: number; lossD: number;
}
interface Sample { tick: number; alive: number; pop: number; maxPop: number; housing: number; tiles: number; inventions: number; stability: number; food: number; neo: number }
interface SeedRun {
  seed: string; ticks: number; nations: NationRun[]; series: Sample[]; wars: WarRun[];
  firstContact: number | null; contacts: number; treaties: Record<string, number>; trades: number;
  battles: number; settlements: number; proposals: number; inventionsFirst: number;
  audit: number; auditSample: string[]; msStep: number; msBot: number; eraGates: Record<string, number>;
  rejections: Record<string, number>;
}

// ---------------------------------------------------------------- one world

const bots = (n: number): NationSpec[] => Array.from({ length: n }, () => ({ controller: "bot", provider: "bot", model: "bot" }));
const num = (re: RegExp, s: string) => { const m = re.exec(s); return m ? Number(m[1]) : 0; };
const SEED_TREE = INVENTIONS.map(v => v.id).filter(id => !START.inventions.includes(id));
const TENT_NAME = BUILDING_BY_TYPE.tent?.name ?? "Lều";

function runSeed(seed: string): SeedRun {
  const w: World = createWorld(seed, bots(NATIONS));
  const runs: NationRun[] = w.nations.map(n => ({
    id: n.id, name: n.name, alive: true, diedAt: null, pop: n.population, peakPop: n.population, housing: housing(w, n), peakHousing: housing(w, n),
    tiles: 0, inventions: 0, custom: 0, era: n.era, neoAt: null, housingOver25At: null, settlements: 0, stability: n.stability, food: 0,
    minStability: n.stability, famineDeaths: 0, famineTicks: 0, winterDeaths: 0, plagueDeaths: 0, migrants: 0, explorersLost: 0, riots: 0,
    buildings: {}, proposals: 0, battlesWon: 0, battlesLost: 0, tilesTaken: 0, tilesLost: 0, rejected: 0,
    tentAt: null, settleAt: null, pop50At: null, pop100At: null, pop500At: null, treeAt: null,
  }));
  const out: SeedRun = {
    seed, ticks: TICKS, nations: runs, series: [], wars: [], firstContact: null, contacts: 0, treaties: {}, trades: 0,
    battles: 0, settlements: 0, proposals: 0, inventionsFirst: 0, audit: 0, auditSample: [], msStep: 0, msBot: 0, eraGates: {}, rejections: {},
  };
  const wars = new Map<number, WarRun>();
  const sample = (): Sample => {
    const alive = w.nations.filter(n => n.alive), k = Math.max(1, alive.length);
    const avg = (f: (n: typeof alive[number]) => number) => alive.reduce((s, n) => s + f(n), 0) / k;
    return {
      tick: w.tick, alive: alive.length, pop: avg(n => n.population), maxPop: Math.max(0, ...alive.map(n => n.population)), housing: avg(n => housing(w, n)),
      tiles: avg(n => ownedTiles(w, n.id).length), inventions: avg(n => n.inventions.length - START.inventions.length), stability: avg(n => n.stability),
      food: avg(n => n.stock.food || 0), neo: alive.filter(n => n.era !== ERAS.paleo).length,
    };
  };
  out.series.push(sample());

  for (let t = 0; t < TICKS; t++) {
    const inputs: Record<number, TurnInput> = {};
    const b0 = performance.now();
    for (const n of w.nations) if (n.alive) inputs[n.id] = { kind: "ok", response: botTurn(w, n, rngFor(w.seed, w.tick, "bot", n.id)) };
    const b1 = performance.now();
    const res = step(w, inputs);
    out.msBot += b1 - b0; out.msStep += performance.now() - b1;
    if (res.audit.length) { out.audit += res.audit.length; if (out.auditSample.length < 5) out.auditSample.push(`tick ${t}: ${res.audit[0]}`); }

    for (const c of res.chronicle) {
      const r = c.nation !== null ? runs[c.nation] : null;
      switch (c.kind) {
        case "famine": if (r) { r.famineDeaths += num(/: (\d+) người chết/, c.text); r.famineTicks++; } break;
        case "event":
          if (r && c.text.startsWith("Mùa đông")) r.winterDeaths += num(/: (\d+) người chết rét/, c.text);
          if (r && c.text.startsWith("Dịch bệnh")) r.plagueDeaths += num(/: (\d+) người chết/, c.text);
          break;
        case "riot": if (r) r.riots++; break;
        case "contact": out.contacts++; if (out.firstContact === null) out.firstContact = c.tick; break;
        case "trade": out.trades++; break;
        case "settle": out.settlements++; if (r && r.settleAt === null) r.settleAt = c.tick; break;
        case "build": if (r && r.tentAt === null && c.text.endsWith(`${TENT_NAME}.`)) r.tentAt = c.tick; break;
        case "proposal": if (c.text.includes("nộp đơn")) { out.proposals++; if (r) r.proposals++; } break;
        case "invention": if (c.text.includes("lần đầu tiên")) out.inventionsFirst++; break;
        case "battle": out.battles++; break;
      }
    }
    // Wars: who started them, how big each side was, what the fighting gained
    for (const x of w.wars) {
      if (wars.has(x.id)) { wars.get(x.id)!.end = x.end; continue; }
      wars.set(x.id, { id: x.id, a: x.a, b: x.b, declared: x.declared, end: x.end, ally: x.reason.startsWith("bảo vệ"), popA: w.nations[x.a].population, popB: w.nations[x.b].population, battles: 0, won: 0, tiles: 0, lossA: 0, lossD: 0 });
    }
    for (const bt of w.battles) {
      if (bt.tick !== t) continue;
      const A = runs[bt.attacker], D = runs[bt.defender];
      const took = bt.won && bt.note.startsWith("chiếm");
      if (bt.won) { A.battlesWon++; D.battlesLost++; } else { A.battlesLost++; D.battlesWon++; }
      if (took) { A.tilesTaken++; D.tilesLost++; }
      const wr = [...wars.values()].reverse().find(x => ((x.a === bt.attacker && x.b === bt.defender) || (x.a === bt.defender && x.b === bt.attacker)));
      if (wr) { wr.battles++; if (bt.won) wr.won++; if (took) wr.tiles++; wr.lossA += bt.lossA; wr.lossD += bt.lossD; }
    }
    for (const n of w.nations) {
      const r = runs[n.id];
      for (const e of n.lastEvents) {
        r.migrants += num(/^(\d+) người bỏ đi/, e);
        r.explorersLost += num(/^(\d+) người thám hiểm không trở về/, e);
      }
      for (const x of n.lastRejected) {
        if (x.action === "labor") continue;
        r.rejected++;
        const key = `${x.action}: ${x.reason.replace(/\d+(\.\d+)?/g, "#").slice(0, 90)}`;
        out.rejections[key] = (out.rejections[key] || 0) + 1;
      }
      if (!n.alive) { if (r.alive) { r.alive = false; r.diedAt = w.tick; } continue; }
      const h = housing(w, n);
      r.peakPop = Math.max(r.peakPop, n.population); r.peakHousing = Math.max(r.peakHousing, h);
      r.minStability = Math.min(r.minStability, n.stability);
      if (r.housingOver25At === null && h > START.naturalHousing) r.housingOver25At = w.tick;
      if (r.neoAt === null && n.era !== ERAS.paleo) r.neoAt = w.tick;
      if (r.pop50At === null && n.population >= 50) r.pop50At = w.tick;
      if (r.pop100At === null && n.population >= 100) r.pop100At = w.tick;
      if (r.pop500At === null && n.population >= 500) r.pop500At = w.tick;
      if (r.treeAt === null && SEED_TREE.every(id => n.inventions.includes(id))) r.treeAt = w.tick;
    }
    if (w.tick % EVERY === 0 || w.tick === TICKS) out.series.push(sample());
  }

  for (const n of w.nations) {
    const r = runs[n.id];
    r.name = n.name; r.pop = n.population; r.housing = n.alive ? housing(w, n) : 0; r.tiles = ownedTiles(w, n.id).length;
    r.inventions = n.inventions.length - START.inventions.length; r.custom = n.inventions.filter(id => id.startsWith("X")).length;
    r.era = n.era; r.settlements = n.settlements.length; r.stability = n.stability; r.food = Math.round(n.stock.food || 0);
    for (const b of n.buildings) if (b.done) r.buildings[b.type] = (r.buildings[b.type] || 0) + 1;
  }
  for (const t of w.treaties) out.treaties[t.type] = (out.treaties[t.type] || 0) + 1;
  out.wars = [...wars.values()];
  out.eraGates = { ...w.eraGates };
  return out;
}

// ---------------------------------------------------------------- report

const f1 = (x: number) => Number.isFinite(x) ? (Math.round(x * 10) / 10).toLocaleString("en-US") : "—";
const f0 = (x: number) => Number.isFinite(x) ? Math.round(x).toLocaleString("en-US") : "—";
const pct = (a: number, b: number) => b ? `${Math.round(100 * a / b)}%` : "—";
const or = (x: number | null | undefined) => x === null || x === undefined || !Number.isFinite(x) ? "—" : String(x);
const median = (xs: number[]) => { if (!xs.length) return NaN; const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const reached = (xs: Array<number | null>) => xs.filter((x): x is number => x !== null);
/** "k/n, median tick m" for a milestone. */
const milestone = (xs: Array<number | null>) => { const r = reached(xs); return `${r.length}/${xs.length}${r.length ? `, trung vị lượt ${median(r)}` : ""}`; };
const BUILD_SHORT: Record<string, string> = { workshop: "xưởng", pit: "hố", tent: "lều", altar: "bàn thờ", palisade: "rào", field: "ruộng", pen: "chuồng", kiln: "lò" };

function table(head: string[], rows: Array<Array<string | number>>): string {
  return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map(r => `| ${r.join(" | ")} |`)].join("\n");
}

function warTable(runs: SeedRun[]): string {
  const rows = runs.flatMap(s => s.wars.map(x => {
    const A = s.nations[x.a], B = s.nations[x.b];
    return [`\`${s.seed}\``, `${A.name} → ${B.name}${x.ally ? " (đồng minh tham chiến)" : ""}`, `${x.declared}–${or(x.end)}`, `${x.popA} : ${x.popB}`, `${x.won}/${x.battles}`, x.tiles, `${x.lossA} / ${x.lossD}`];
  }));
  if (!rows.length) return "Không có cuộc chiến nào.";
  return table(["Seed", "Bên tuyên chiến → bên bị đánh", "Lượt", "Dân lúc tuyên chiến", "Trận thắng/tổng", "Ô chiếm", "Thương vong công / thủ"], rows);
}

function seedSection(s: SeedRun): string {
  const L: string[] = [];
  const alive = s.nations.filter(n => n.alive);
  L.push(`### Seed \`${s.seed}\``, "");
  L.push(`${s.nations.length} quốc gia, ${s.ticks} lượt. Còn sống: ${alive.length}. Thời gian: ${f1(s.msStep / s.ticks)} ms/lượt engine + ${f1(s.msBot / s.ticks)} ms/lượt bot. Lỗi kiểm toán: ${s.audit}.`, "");
  L.push(table(
    ["Quốc gia", "Dân (đỉnh)", "Chỗ ở", "Ô", "Phát minh", "Đồ Đá Mới từ lượt", "Lều đầu / định cư đầu", "Định cư", "Công trình", "Ổn định (thấp nhất)", "Chết đói / rét / dịch", "Trận thắng/thua"],
    s.nations.map(n => [
      n.alive ? n.name : `~~${n.name}~~ (mất lượt ${n.diedAt})`, `${n.pop} (${n.peakPop})`, n.housing, n.tiles, n.inventions + (n.custom ? ` (+${n.custom} mở)` : ""),
      or(n.neoAt), `${or(n.tentAt)} / ${or(n.settleAt)}`, n.settlements,
      Object.entries(n.buildings).map(([k, q]) => `${q} ${BUILD_SHORT[k] ?? k}`).join(", ") || "—",
      `${n.stability} (${n.minStability})`, `${n.famineDeaths} / ${n.winterDeaths} / ${n.plagueDeaths}`, `${n.battlesWon}/${n.battlesLost}`,
    ]),
  ), "");
  L.push(table(
    ["Lượt", "Sống", "Dân TB", "Dân max", "Chỗ ở TB", "Ô TB", "Phát minh TB", "Ổn định TB", "Lương thực TB", "Đồ Đá Mới"],
    s.series.map(x => [x.tick, x.alive, f1(x.pop), x.maxPop, f1(x.housing), f1(x.tiles), f1(x.inventions), f1(x.stability), f0(x.food), x.neo]),
  ), "");
  const tr = Object.entries(s.treaties).map(([k, q]) => `${q} ${k}`).join(", ") || "0";
  L.push(`- Gặp gỡ: lần đầu ở lượt ${or(s.firstContact)}, tổng ${s.contacts} lần "thấy nhau" (một chiều).`);
  L.push(`- Hiệp ước đã ký: ${tr}. Giao dịch: ${s.trades}. Chiến tranh: ${s.wars.filter(x => !x.ally).length} (+${s.wars.filter(x => x.ally).length} đồng minh tham chiến). Trận: ${s.battles}.`);
  L.push(`- Định cư mới: ${s.settlements}. Đơn phát minh mở: ${s.proposals}. Phát minh "lần đầu tiên trên thế giới": ${s.inventionsFirst}.`);
  L.push(`- Cổng kỷ nguyên (world.eraGates): ${Object.entries(s.eraGates).map(([k, t]) => `${k} ở lượt ${t}`).join(", ") || "chưa ai qua"}.`);
  if (s.auditSample.length) L.push(`- Mẫu lỗi kiểm toán: ${s.auditSample.join("; ")}`);
  const rej = Object.entries(s.rejections).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (rej.length) L.push(`- Hành động bị từ chối nhiều nhất: ${rej.map(([k, q]) => `${q}× \`${k}\``).join("; ")}.`);
  L.push("");
  return L.join("\n");
}

function aggregate(runs: SeedRun[]): string {
  const all = runs.flatMap(r => r.nations), alive = all.filter(n => n.alive);
  const at = (tick: number, f: (x: Sample) => number) => mean(runs.map(r => r.series.find(x => x.tick === tick)).filter((x): x is Sample => !!x).map(f));
  const ticks = [...new Set(runs.flatMap(r => r.series.map(x => x.tick)))].sort((a, b) => a - b);
  const wars = runs.flatMap(r => r.wars.filter(x => !x.ally));
  const L: string[] = [];
  L.push(`## Tổng hợp (${runs.length} seed × ${TICKS} lượt × ${NATIONS} quốc gia)`, "");
  L.push(table(["Chỉ số", "Giá trị"], [
    ["Quốc gia còn sống cuối ván", `${alive.length}/${all.length}`],
    ["Dân số cuối ván: trung bình / trung vị / thấp nhất / cao nhất", `${f1(mean(alive.map(n => n.pop)))} / ${median(alive.map(n => n.pop))} / ${Math.min(...alive.map(n => n.pop))} / ${Math.max(0, ...alive.map(n => n.pop))}`],
    ["Chỗ ở cuối ván: trung bình / cao nhất", `${f1(mean(alive.map(n => n.housing)))} / ${Math.max(0, ...alive.map(n => n.housing))}`],
    ["Vượt chỗ ở tự nhiên 25", milestone(all.map(n => n.housingOver25At))],
    ["Lều đầu tiên xây xong", milestone(all.map(n => n.tentAt))],
    ["Điểm định cư đầu tiên", milestone(all.map(n => n.settleAt))],
    ["Dân ≥ 50 / ≥ 100 / ≥ 500", `${milestone(all.map(n => n.pop50At))} · ${milestone(all.map(n => n.pop100At))} · ${milestone(all.map(n => n.pop500At))}`],
    ["Vào Đồ Đá Mới", milestone(all.map(n => n.neoAt))],
    ["Seed có ít nhất một nước Đồ Đá Mới", `${runs.filter(r => r.nations.some(n => n.neoAt !== null)).length}/${runs.length}`],
    [`Xong cả cây gốc (${SEED_TREE.length} phát minh)`, milestone(all.map(n => n.treeAt))],
    ["Phát minh cây gốc trung bình cuối ván", f1(mean(alive.map(n => n.inventions)))],
    ["Định cư mới trung bình mỗi nước", f1(mean(all.map(n => n.settlements)))],
    ["Ô trung bình cuối ván", f1(mean(alive.map(n => n.tiles)))],
    ["Chết đói / chết rét / chết dịch mỗi nước (tổng cả ván, TB)", `${f1(mean(all.map(n => n.famineDeaths)))} / ${f1(mean(all.map(n => n.winterDeaths)))} / ${f1(mean(all.map(n => n.plagueDeaths)))}`],
    ["Số lượt có nạn đói mỗi nước (TB)", f1(mean(all.map(n => n.famineTicks)))],
    ["Nội loạn mỗi nước (TB)", f1(mean(all.map(n => n.riots)))],
    ["Lượt gặp gỡ đầu tiên (trung vị theo seed)", or(median(reached(runs.map(r => r.firstContact))))],
    ["Hiệp ước / giao dịch / trận mỗi seed (TB)", `${f1(mean(runs.map(r => Object.values(r.treaties).reduce((a, b) => a + b, 0))))} / ${f1(mean(runs.map(r => r.trades)))} / ${f1(mean(runs.map(r => r.battles)))}`],
    ["Chiến tranh tự phát (tổng) · trận bên công thắng · ô chiếm được", `${wars.length} · ${wars.reduce((s, x) => s + x.won, 0)}/${wars.reduce((s, x) => s + x.battles, 0)} · ${wars.reduce((s, x) => s + x.tiles, 0)}`],
    ["Đơn phát minh mở mỗi seed (TB)", f1(mean(runs.map(r => r.proposals)))],
    ["Thời gian: engine / bot (ms mỗi lượt, TB)", `${f1(mean(runs.map(r => r.msStep / r.ticks)))} / ${f1(mean(runs.map(r => r.msBot / r.ticks)))}`],
    ["Lỗi kiểm toán sổ cái", String(runs.reduce((s, r) => s + r.audit, 0))],
  ]), "");
  L.push(table(["Lượt", "Dân TB", "Chỗ ở TB", "Ô TB", "Phát minh TB", "Ổn định TB", "Lương thực TB", "Số nước Đồ Đá Mới (TB/seed)"],
    ticks.map(t => [t, f1(at(t, x => x.pop)), f1(at(t, x => x.housing)), f1(at(t, x => x.tiles)), f1(at(t, x => x.inventions)), f1(at(t, x => x.stability)), f0(at(t, x => x.food)), f1(at(t, x => x.neo))])), "");
  L.push("### Các cuộc chiến", "", warTable(runs), "");
  return L.join("\n");
}

// ---------------------------------------------------------------- main

const runs: SeedRun[] = [];
for (const seed of SEEDS) {
  const t0 = performance.now();
  const r = runSeed(seed);
  runs.push(r);
  if (!QUIET) {
    const alive = r.nations.filter(n => n.alive);
    console.log(`[${VARIANT} ${seed}] ${Math.round(performance.now() - t0)} ms · sống ${alive.length}/${r.nations.length} · dân ${alive.map(n => n.pop).join(",")} · phát minh ${alive.map(n => n.inventions).join(",")} · Đồ Đá Mới ${r.nations.filter(n => n.neoAt !== null).length} · định cư ${r.settlements} · hiệp ước ${Object.values(r.treaties).reduce((a, b) => a + b, 0)} · giao dịch ${r.trades} · chiến tranh ${r.wars.filter(x => !x.ally).length} · trận ${r.battles} · chết đói ${r.nations.reduce((s, n) => s + n.famineDeaths, 0)} · kiểm toán ${r.audit}`);
  }
}

const report = [
  `_Sinh bởi \`tools/simulate.ts\` — biến thể \`${VARIANT}\` (${VARIANTS[VARIANT].desc}); seeds: ${SEEDS.map(s => `\`${s}\``).join(", ")}; ${TICKS} lượt; ${NATIONS} quốc gia bot._`, "",
  aggregate(runs),
  ...(BRIEF ? [] : [`## Chi tiết từng seed`, "", ...runs.map(seedSection)]),
].join("\n");

if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ variant: VARIANT, runs }, null, 1));
if (OUT) {
  const tag = VARIANT === "base" ? "simulate" : `simulate:${VARIANT}`;
  const BEGIN = `<!-- ${tag}:begin -->`, END = `<!-- ${tag}:end -->`;
  const old = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  const a = old.indexOf(BEGIN), b = old.indexOf(END);
  const body = `${BEGIN}\n${report}\n${END}`;
  writeFileSync(OUT, a >= 0 && b > a ? old.slice(0, a) + body + old.slice(b + END.length) : `# Báo cáo cân bằng\n\n${body}\n`);
  if (!QUIET) console.log(`Đã ghi ${OUT}`);
} else if (!QUIET) console.log("\n" + report);
