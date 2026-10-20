// Keeps the world running across code updates. After `git pull`:
// - web/ changed  -> open browsers reload, the world keeps running;
// - src/ or .env changed -> the current tick finishes, the state is saved, and the
//   engine restarts on the new code within a few seconds. Nothing to do by hand.
// It polls file mtimes, which works on Docker bind mounts on every OS.

import { fork, type ChildProcess } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const POLL_MS = Number(process.env.WATCH_POLL_MS) || 3000;
/** main.ts exits with this when another engine owns the world database: do not restart it. */
const EXIT_LOCKED = 3;
const ENGINE_PATHS = ["src", "tools", "package.json", ".env"];
const WEB_PATHS = ["web"];

function signature(paths: string[]): string {
  const parts: string[] = [];
  const walk = (p: string) => {
    let st; try { st = statSync(p); } catch { return; }
    if (st.isDirectory()) { for (const f of readdirSync(p).sort()) walk(join(p, f)); }
    else parts.push(`${p}:${st.size}:${st.mtimeMs}`);
  };
  for (const p of paths) walk(p);
  return parts.join("|");
}

let child: ChildProcess | null = null;
let engineSig = signature(ENGINE_PATHS), webSig = signature(WEB_PATHS);
let restarting = false, crashes = 0, startedAt = 0;

function start(): void {
  startedAt = Date.now();
  child = fork("src/main.ts", [], { execArgv: ["--disable-warning=ExperimentalWarning"], stdio: "inherit" });
  child.on("exit", code => {
    child = null;
    if (code === EXIT_LOCKED) { console.error("[supervisor] Engine khác đang giữ thế giới này; supervisor dừng."); process.exit(1); }
    if (restarting) { restarting = false; console.log("[supervisor] Khởi động lại với code mới."); start(); return; }
    if (stopping) process.exit(0);
    crashes = Date.now() - startedAt < 15000 ? crashes + 1 : 0;
    const wait = crashes >= 5 ? 60000 : 3000;
    console.log(`[supervisor] Engine dừng (mã ${code}); chạy lại sau ${wait / 1000}s.`);
    setTimeout(start, wait);
  });
}

let stopping = false;
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    if (stopping) { child?.kill("SIGKILL"); process.exit(1); } // second Ctrl+C: now
    stopping = true;
    if (!child) process.exit(0);
    child.kill(sig);
    // The engine frees its port at once and stops within seconds; never leave it running behind us
    setTimeout(() => { if (child) { console.error("[supervisor] Engine chưa dừng sau 20 giây: dừng cưỡng bức."); child.kill("SIGKILL"); } process.exit(0); }, 20000).unref();
  });
}

setInterval(() => {
  const e = signature(ENGINE_PATHS), w = signature(WEB_PATHS);
  if (w !== webSig) { webSig = w; console.log("[supervisor] Giao diện thay đổi: tải lại trình duyệt."); child?.send({ type: "web" }); }
  if (e !== engineSig && !restarting) {
    engineSig = e;
    console.log("[supervisor] Phát hiện code mới: chờ lượt hiện tại xong rồi cập nhật…");
    if (child) { restarting = true; child.send({ type: "update" }); } else start();
  }
}, POLL_MS);

start();
