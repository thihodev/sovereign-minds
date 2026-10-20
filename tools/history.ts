// What happened to one nation, turn by turn: population, food, stability, land, the births and deaths
// by cause (from v0.6), everything the engine told it, and its chronicle lines. Reads the world database
// only; safe to run next to a running engine.
//
//   node --disable-warning=ExperimentalWarning tools/history.ts "Thạch Sơn" [from] [to]
//   docker compose exec sovereign-minds node --disable-warning=ExperimentalWarning tools/history.ts "Thạch Sơn" 140 180

import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const [who = "", fromArg, toArg] = process.argv.slice(2);
const path = process.env.DB_PATH || "data/world.db";
if (!who || !existsSync(path)) {
  console.error(`Cách dùng: tools/history.ts "<tên quốc gia hoặc số>" [từ lượt] [tới lượt]   (DB: ${path}${existsSync(path) ? "" : ", không thấy"})`);
  process.exit(1);
}
const db = new DatabaseSync(path, { readOnly: true });
type SnapNation = { id: number; name: string; formerNames?: string[]; population: number; stability: number; lastEvents: string[]; demo?: { m: number[]; f: number[] }; family?: { births: string; fighters: string }; discontent?: number; stock: Record<string, number> };
const unpack = (data: Uint8Array) => JSON.parse(gunzipSync(data).toString("utf8")) as { tick: number; nations: SnapNation[] };
const state = db.prepare("SELECT data FROM state WHERE id = 1").get() as { data: Uint8Array } | undefined;
if (!state) { console.error("DB chưa có thế giới."); process.exit(1); }
const world = unpack(state.data);
const key = who.toLowerCase();
const n = world.nations.find(x => String(x.id + 1) === who || x.name.toLowerCase() === key || (x.formerNames ?? []).some(f => f.toLowerCase() === key))
  ?? world.nations.find(x => x.name.toLowerCase().includes(key));
if (!n) { console.error(`Không thấy quốc gia "${who}". Có: ${world.nations.map(x => `${x.id + 1}. ${x.name}`).join(", ")}`); process.exit(1); }
const to = toArg ? Number(toArg) : world.tick, from = fromArg ? Number(fromArg) : Math.max(0, to - 40);

const has = (table: string) => !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
const cols = (db.prepare("PRAGMA table_info(nation_stats)").all() as Array<{ name: string }>).map(c => c.name);
const stats = db.prepare(`SELECT tick, population, food, stability, tiles${cols.includes("detail") ? ", detail" : ""} FROM nation_stats WHERE nation = ? AND tick BETWEEN ? AND ? ORDER BY tick`).all(n.id, from, to + 1) as Array<{ tick: number; population: number; food: number; stability: number; tiles: number; detail?: string | null }>;
const logs = has("nation_log") ? new Map((db.prepare("SELECT tick, events FROM nation_log WHERE nation = ? AND tick BETWEEN ? AND ?").all(n.id, from, to) as Array<{ tick: number; events: string }>).map(r => [r.tick, JSON.parse(r.events) as { events: string[]; rejected: string[] }])) : new Map();
const chron = db.prepare("SELECT tick, text FROM chronicle WHERE nation = ? AND tick BETWEEN ? AND ? ORDER BY id").all(n.id, from, to) as Array<{ tick: number; text: string }>;
// Snapshots every 10 turns: the whole nation as it was, and what the engine told it that turn
const snaps = new Map((db.prepare("SELECT tick, data FROM snapshots WHERE tick BETWEEN ? AND ? ORDER BY tick").all(from, to + 1) as Array<{ tick: number; data: Uint8Array }>)
  .map(r => [r.tick - 1, unpack(r.data).nations[n.id]] as const));
// What its AI answered each turn: the actions it sent
const turns = new Map((db.prepare("SELECT tick, parsed FROM turns WHERE nation = ? AND tick BETWEEN ? AND ? ORDER BY id").all(n.id, from, to) as Array<{ tick: number; parsed: string | null }>)
  .map(r => { let acts = ""; try { const p = JSON.parse(r.parsed ?? "{}") as { actions?: Array<Record<string, unknown>> }; acts = (p.actions ?? []).map(a => a.type === "family_policy" ? `family_policy(${a.births ?? ""}${a.fighters ? `/${a.fighters}` : ""})` : String(a.type)).join(", "); } catch { /* not JSON */ } return [r.tick, acts] as const; }));
const byTick = new Map<number, string[]>();
for (const c of chron) byTick.set(c.tick, [...(byTick.get(c.tick) ?? []), c.text]);

console.log(`${n.name} (quốc gia ${n.id + 1}), lượt ${from}–${to}. Số dân ghi ở đầu mỗi lượt.`);
const CAUSE: Record<string, string> = { famine: "đói", winter: "rét", plague: "dịch", disaster: "thiên tai", beasts: "thú dữ", raid: "man di", war: "trận mạc", explore: "thám hiểm", porter: "khuân vác", any: "khác" };
let prev: number | null = null;
for (const s of stats) {
  const t = s.tick - 1; // stats are written after the turn, at the new tick
  const delta = prev === null ? "" : ` (${s.population - prev >= 0 ? "+" : ""}${s.population - prev})`;
  prev = s.population;
  let line = `L${t}: dân ${s.population}${delta} · lương thực ${s.food} · ổn định ${s.stability} · ${s.tiles} ô`;
  if (s.detail) {
    const d = JSON.parse(s.detail) as { born: number; infants: number; aged: number; died: Record<string, number>; left: number; arrived: number; discontent: number; births: string; fighters: string };
    const parts = [d.born && `+${d.born} sinh`, d.arrived && `+${d.arrived} tới`, d.aged && `−${d.aged} già/lao lực`, ...Object.entries(d.died).map(([k, v]) => v && `−${v} ${CAUSE[k] ?? k}`), d.left && `−${d.left} bỏ đi`, d.infants && `${d.infants} sơ sinh mất`].filter(Boolean);
    line += ` · ${parts.join(", ") || "không sinh không tử"} · bất mãn ${d.discontent} · ${d.births}/${d.fighters}`;
  }
  console.log(line);
  const log = logs.get(t), snap = snaps.get(t), acts = turns.get(t);
  if (acts) console.log(`     AI gửi: ${acts}`);
  if (snap && !s.detail) {
    const d = snap.demo;
    console.log(`     [bản chụp] ${d ? `trẻ em ${d.m[0] + d.f[0]}, thiếu niên ${d.m[1] + d.f[1]}, trưởng thành ${d.m[2]}♂/${d.f[2]}♀, già ${d.m[3] + d.f[3]} · ` : ""}${snap.family ? `phong tục ${snap.family.births}/${snap.family.fighters} · ` : ""}bất mãn ${Math.round(snap.discontent ?? 0)}`);
    if (!log) for (const e of snap.lastEvents) console.log(`     ${e}`);
  }
  for (const e of log?.events ?? []) console.log(`     ${e}`);
  for (const r of log?.rejected ?? []) console.log(`     ✗ ${r}`);
  for (const c of byTick.get(t) ?? []) if (!log) console.log(`     • ${c}`);
}
if (!stats.some(s => s.detail)) console.log("\n(Chưa có sổ sinh tử và nhật ký engine cho khoảng này: engine ghi chúng từ bản v0.6 trở đi. Ở trên là số dân và biên niên.)");
