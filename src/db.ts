// SQLite storage (§11.3) through Node's built-in node:sqlite. One file,
// data/world.db. API keys never go in here.

import { DatabaseSync } from "node:sqlite";
import { gzipSync, gunzipSync } from "node:zlib";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ChronicleEntry, World } from "./types.ts";
import type { HistoryChapter } from "./historian.ts";

export class Store {
  db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK (id = 1), tick INTEGER, data BLOB, saved_at TEXT);
      CREATE TABLE IF NOT EXISTS snapshots (tick INTEGER PRIMARY KEY, data BLOB, saved_at TEXT);
      CREATE TABLE IF NOT EXISTS turns (
        id INTEGER PRIMARY KEY AUTOINCREMENT, tick INTEGER, nation INTEGER, provider TEXT, model TEXT,
        kind TEXT, raw TEXT, parsed TEXT, error TEXT, latency_ms INTEGER, created_at TEXT);
      CREATE INDEX IF NOT EXISTS turns_nation ON turns (nation, tick);
      CREATE TABLE IF NOT EXISTS chronicle (id INTEGER PRIMARY KEY AUTOINCREMENT, tick INTEGER, nation INTEGER, kind TEXT, text TEXT);
      CREATE TABLE IF NOT EXISTS nation_stats (tick INTEGER, nation INTEGER, population INTEGER, food REAL, stability INTEGER, tiles INTEGER, inventions INTEGER, status TEXT, PRIMARY KEY (tick, nation));
      CREATE TABLE IF NOT EXISTS watcher_log (id INTEGER PRIMARY KEY AUTOINCREMENT, tick INTEGER, kind TEXT, payload TEXT, created_at TEXT);
      CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT, text TEXT, tick INTEGER, created_at TEXT);
      CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, from_tick INTEGER, to_tick INTEGER, title TEXT, text TEXT, author TEXT, created_at TEXT);
    `);
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }
  setMeta(key: string, value: string): void {
    this.db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }

  saveState(world: World): void {
    const data = gzipSync(JSON.stringify(world));
    this.db.prepare("INSERT INTO state (id, tick, data, saved_at) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET tick = excluded.tick, data = excluded.data, saved_at = excluded.saved_at")
      .run(world.tick, data, new Date().toISOString());
    if (world.tick % 10 === 0) {
      this.db.prepare("INSERT OR REPLACE INTO snapshots (tick, data, saved_at) VALUES (?, ?, ?)").run(world.tick, data, new Date().toISOString());
    }
  }
  loadState(): World | null {
    const row = this.db.prepare("SELECT data FROM state WHERE id = 1").get() as { data: Uint8Array } | undefined;
    return row ? JSON.parse(gunzipSync(row.data).toString("utf8")) as World : null;
  }

  logTurn(t: { tick: number; nation: number; provider: string; model: string; kind: string; raw: string; parsed: unknown; error: string; latencyMs: number }): void {
    this.db.prepare("INSERT INTO turns (tick, nation, provider, model, kind, raw, parsed, error, latency_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(t.tick, t.nation, t.provider, t.model, t.kind, t.raw, t.parsed === undefined ? null : JSON.stringify(t.parsed), t.error, t.latencyMs, new Date().toISOString());
  }
  turns(nation: number, limit: number): unknown[] {
    return this.db.prepare("SELECT tick, provider, model, kind, raw, error, latency_ms, created_at FROM turns WHERE nation = ? ORDER BY id DESC LIMIT ?").all(nation, limit);
  }

  addChronicle(entries: ChronicleEntry[]): void {
    const ins = this.db.prepare("INSERT INTO chronicle (tick, nation, kind, text) VALUES (?, ?, ?, ?)");
    for (const e of entries) ins.run(e.tick, e.nation, e.kind, e.text);
  }
  chronicle(limit: number, beforeId?: number): unknown[] {
    return beforeId
      ? this.db.prepare("SELECT * FROM chronicle WHERE id < ? ORDER BY id DESC LIMIT ?").all(beforeId, limit)
      : this.db.prepare("SELECT * FROM chronicle ORDER BY id DESC LIMIT ?").all(limit);
  }

  chronicleRange(fromTick: number, toTick: number): ChronicleEntry[] {
    return this.db.prepare("SELECT tick, nation, kind, text FROM chronicle WHERE tick BETWEEN ? AND ? ORDER BY id").all(fromTick, toTick) as unknown as ChronicleEntry[];
  }

  // The Historian's chapters (§10.1), newest first.
  addHistory(c: Omit<HistoryChapter, "id" | "created_at">): HistoryChapter {
    const created_at = new Date().toISOString();
    const r = this.db.prepare("INSERT INTO history (from_tick, to_tick, title, text, author, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(c.from_tick, c.to_tick, c.title, c.text, c.author, created_at);
    return { id: Number(r.lastInsertRowid), ...c, created_at };
  }
  history(limit: number): HistoryChapter[] {
    return this.db.prepare("SELECT * FROM history ORDER BY to_tick DESC, id DESC LIMIT ?").all(limit) as unknown as HistoryChapter[];
  }
  lastHistoryTick(): number {
    const row = this.db.prepare("SELECT MAX(to_tick) AS t FROM history").get() as { t: number | null };
    return row.t ?? -1;
  }

  addStats(world: World): void {
    const ins = this.db.prepare("INSERT OR REPLACE INTO nation_stats (tick, nation, population, food, stability, tiles, inventions, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    const tiles = new Map<number, number>();
    for (const t of world.tiles) if (t.owner >= 0) tiles.set(t.owner, (tiles.get(t.owner) || 0) + 1);
    for (const n of world.nations) ins.run(world.tick, n.id, n.population, Math.round((n.stock.food || 0) * 10) / 10, n.stability, tiles.get(n.id) || 0, n.inventions.length, n.status);
  }
  statsAt(tick: number): unknown[] {
    return this.db.prepare("SELECT nation, population, inventions, tiles FROM nation_stats WHERE tick = ?").all(tick);
  }
  stats(): unknown[] {
    return this.db.prepare("SELECT tick, nation, population, food, stability, tiles, inventions FROM nation_stats ORDER BY tick").all();
  }

  logWatcher(tick: number, kind: string, payload: unknown): void {
    this.db.prepare("INSERT INTO watcher_log (tick, kind, payload, created_at) VALUES (?, ?, ?, ?)").run(tick, kind, JSON.stringify(payload), new Date().toISOString());
  }

  addChat(role: string, text: string, tick: number): number {
    const r = this.db.prepare("INSERT INTO chat (role, text, tick, created_at) VALUES (?, ?, ?, ?)").run(role, text, tick, new Date().toISOString());
    return Number(r.lastInsertRowid);
  }
  chatHistory(limit: number): unknown[] {
    return (this.db.prepare("SELECT id, role, text, tick, created_at FROM chat ORDER BY id DESC LIMIT ?").all(limit) as unknown[]).reverse();
  }
  clearChat(): void { this.db.exec("DELETE FROM chat"); }

  close(): void { this.db.close(); }
}
