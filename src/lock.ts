// One engine per world database. SQLite's own file locks do not work across
// a Docker bind mount (the container and the Mac each think they are alone),
// so two engines on one data/world.db would both write it and corrupt it.
// The engine that owns the database keeps a heartbeat in <db>.lock; another
// one that finds a fresh heartbeat refuses to start.

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";

const BEAT_MS = 5000;
/** A heartbeat older than this means its engine is gone (crashed, killed, machine asleep). */
const STALE_MS = 30000;

interface Owner { pid: number; host: string; docker: boolean; port?: number; started: number; beat: number }

const me = (): Pick<Owner, "pid" | "host" | "docker"> => ({ pid: process.pid, host: hostname(), docker: existsSync("/.dockerenv") });
const read = (file: string): Owner | null => { try { return JSON.parse(readFileSync(file, "utf8")) as Owner; } catch { return null; } };
const isMe = (o: Owner | null) => !!o && o.pid === process.pid && o.host === hostname();

/** Who holds the lock, in words, or null when it is free (or stale). */
export function lockHolder(file: string, now = Date.now()): string | null {
  const o = read(file);
  if (!o || isMe(o) || now - o.beat > STALE_MS) return null;
  // Docker Compose runs one container per service: a lock left by an earlier container of ours is stale
  if (o.docker && me().docker) return null;
  const where = o.docker ? "trong Docker" : o.host === hostname() ? "trên máy này" : `trên máy ${o.host}`;
  return `một engine khác ${where} (pid ${o.pid}${o.port ? `, cổng ${o.port}` : ""}, nhịp tim ${Math.round((now - o.beat) / 1000)} giây trước)`;
}

export class DbLock {
  file: string;
  private started = Date.now();
  private timer: NodeJS.Timeout | null = null;
  port: number | undefined;
  /** Called when another engine took the lock from under us: stop writing at once. */
  onLost: () => void = () => undefined;

  constructor(dbPath: string) { this.file = `${dbPath}.lock`; }

  /** Take the lock, or say who has it. */
  acquire(): string | null {
    const holder = lockHolder(this.file);
    if (holder) return holder;
    this.beat();
    this.timer = setInterval(() => {
      const o = read(this.file);
      if (o && !isMe(o)) { this.stop(); this.onLost(); return; }
      this.beat();
    }, BEAT_MS);
    this.timer.unref();
    return null;
  }

  private beat(): void {
    const o: Owner = { ...me(), port: this.port, started: this.started, beat: Date.now() };
    writeFileSync(this.file, JSON.stringify(o));
  }

  private stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  release(): void {
    this.stop();
    try { if (isMe(read(this.file))) unlinkSync(this.file); } catch { /* already gone */ }
  }
}
