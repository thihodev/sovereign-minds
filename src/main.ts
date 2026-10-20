// Entry point: load config, open the database, start the Watcher server and
// the tick loop. Normally started by supervisor.ts, which restarts it when the
// code changes (after letting the current tick finish).

import { existsSync, readFileSync } from "node:fs";
import { Store } from "./db.ts";
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
const store = new Store(env.DB_PATH || "data/world.db");
const runner = new Runner(store, {
  seed: env.WORLD_SEED || "nguyen-dia-1",
  nations: (env.NATIONS || "openrouter,cohere,cloudflare,groq,gemini,zai").split(",").map(s => s.trim()).filter(Boolean),
  fillWithBots: (env.FILL_WITH_BOTS || "true") !== "false",
  tickSeconds: Number(env.TICK_SECONDS) || 600,
  aiTimeoutSec: Number(env.AI_TIMEOUT_SEC) || 90,
  judgeProviders: (env.JUDGE_PROVIDERS || "claude,groq,cohere,cloudflare,sambanova,gemini,zai,openrouter").split(",").map(s => s.trim()).filter(Boolean),
  judgesPerTick: Number(env.JUDGES_PER_TICK) || 3,
});
const ver = version();
if (runner.cfg.judgeProviders[0] === "claude") {
  console.log(runner.claudeReady()
    ? `[judge] Trọng tài: Claude ${env.JUDGE_CLAUDE_MODEL || "claude-sonnet-5-5"} (tài khoản Claude đã đăng nhập)`
    : "[judge] Claude chưa đăng nhập: trọng tài tạm dùng các nhà cung cấp miễn phí. Đăng nhập trong tab Chat Claude hoặc: docker compose exec -it sovereign-minds claude auth login");
}
console.log(`[boot] Sovereign Minds ${ver} · lượt ${runner.world.tick} · ${runner.world.nations.length} quốc gia`);
startServer(runner, { host: env.HOST || "127.0.0.1", port: Number(env.PORT) || 3000, version: ver });
runner.loop();

let shuttingDown = false;
async function shutdown(reason: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[boot] ${reason}: chờ lượt hiện tại xong rồi dừng…`);
  await runner.stop();
  store.close();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("message", (m: { type?: string }) => {
  if (m?.type === "update") shutdown("Có code mới");
  if (m?.type === "web") runner.emit({ type: "reload" });
});
