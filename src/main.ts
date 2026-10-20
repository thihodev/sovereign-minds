// Entry point: take the database lock, open the database, start the Watcher
// server and the tick loop. Normally started by supervisor.ts, which restarts
// it when the code changes.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { Store } from "./db.ts";
import { DbLock } from "./lock.ts";
import { Runner } from "./runner.ts";
import { startServer } from "./server.ts";

// .env is re-read on every (re)start so new keys apply without recreating the
// container. Server/container settings already in the environment win.
const KEEP_FROM_ENV = ["HOST", "PORT", "DB_PATH", "CLAUDE_CONFIG_DIR"];
function loadDotEnv(path = ".env"): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    const v = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (KEEP_FROM_ENV.includes(m[1]) && process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = v;
  }
}

export function version(): string {
  let v = JSON.parse(readFileSync("package.json", "utf8")).version as string;
  try {
    const head = readFileSync(".git/HEAD", "utf8").trim();
    const sha = head.startsWith("ref: ") ? readFileSync(`.git/${head.slice(5)}`, "utf8").trim() : head;
    v += `+${sha.slice(0, 7)}`;
  } catch { /* not a git checkout */ }
  return v;
}

loadDotEnv();
const env = process.env;
const dbPath = env.DB_PATH || "data/world.db";
/** Exit code that tells the supervisor not to try again: another engine owns this world. */
const EXIT_LOCKED = 3;
mkdirSync(dirname(dbPath), { recursive: true });
const lock = new DbLock(dbPath);
const holder = lock.acquire();
if (holder) {
  console.error(`[boot] ${dbPath} đang được ${holder} dùng. Hai engine cùng ghi một thế giới sẽ làm hỏng nó, nên engine này không chạy.`);
  console.error("[boot] Tắt engine kia trước (Docker: docker compose down; chạy thẳng: Ctrl+C ở terminal của nó), hoặc đặt DB_PATH khác trong .env.");
  process.exit(EXIT_LOCKED);
}
lock.onLost = () => { console.error(`[boot] Một engine khác đã lấy ${dbPath}: dừng ngay, không ghi gì thêm.`); process.exit(EXIT_LOCKED); };
const store = new Store(dbPath);
const runner = new Runner(store, {
  seed: env.WORLD_SEED || "nguyen-dia-1",
  nations: (env.NATIONS || "claude,claude,claude,claude,claude,claude").split(",").map(s => s.trim()).filter(Boolean),
  fillWithBots: (env.FILL_WITH_BOTS || "true") !== "false",
  tickSeconds: Number(env.TICK_SECONDS) || 1200,
  aiTimeoutSec: Number(env.AI_TIMEOUT_SEC) || 90,
  judgeProviders: (env.JUDGE_PROVIDERS || "claude").split(",").map(s => s.trim()).filter(Boolean),
  judgesPerTick: Number(env.JUDGES_PER_TICK) || 3,
});
const ver = version();
if (runner.cfg.judgeProviders[0] === "claude") {
  console.log(runner.claudeReady()
    ? `[judge] Trọng tài: Claude ${env.JUDGE_CLAUDE_MODEL || "claude-sonnet-5-5"} (tài khoản Claude đã đăng nhập)`
    : "[judge] Claude chưa đăng nhập: trọng tài tạm dùng các nhà cung cấp miễn phí. Đăng nhập trong tab Chat Claude hoặc: docker compose exec -it sovereign-minds claude auth login");
}
console.log(`[boot] Sovereign Minds ${ver} · lượt ${runner.world.tick} · ${runner.world.nations.length} quốc gia`);
const http = startServer(runner, { host: env.HOST || "127.0.0.1", port: Number(env.PORT) || 3000, version: ver, onListen: port => { lock.port = port; } });
runner.loop();

let shuttingDown = false;
/** Ctrl+C / docker stop: free the port and stop now. A code update (graceful) lets the current tick finish first. */
async function shutdown(reason: string, graceful = false): Promise<void> {
  if (shuttingDown) { console.log("[boot] Dừng ngay."); lock.release(); process.exit(1); } // a second Ctrl+C
  shuttingDown = true;
  if (graceful) {
    console.log(`[boot] ${reason}: chờ lượt hiện tại xong rồi khởi động lại…`);
    runner.stopping = true;
    while (runner.busy) await new Promise(r => setTimeout(r, 200));
  } else console.log(`[boot] ${reason}: dừng (thế giới giữ ở lượt đã lưu cuối cùng)…`);
  http.close(); // free the port first
  setTimeout(() => { console.error("[boot] Quá 15 giây, dừng cưỡng bức."); lock.release(); process.exit(1); }, 15000).unref();
  await runner.stop();
  store.close();
  lock.release();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("message", (m: { type?: string }) => {
  if (m?.type === "update") shutdown("Có code mới", true);
  if (m?.type === "web") runner.emit({ type: "reload" });
});
