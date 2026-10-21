#!/usr/bin/env node
// A stand-in for the Claude CLI in tests: no network, no tokens.
// FAKE_CLAUDE_LOG: file that gets one JSON line of argv per call.
// FAKE_CLAUDE_MODE: "ok" (default), "limit" (plan limit reached), "logout",
//   "limit-after-N" (the first N turns answer, then the plan limit).
import { appendFileSync, readFileSync } from "node:fs";

const args = process.argv.slice(2), mode = process.env.FAKE_CLAUDE_MODE || "ok";
if (process.env.FAKE_CLAUDE_LOG) appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify(args) + "\n");
if (args[0] === "--version") { console.log("9.9.9 (Claude Code)"); process.exit(0); }
if (args[0] === "auth" && args[1] === "status") { console.log(JSON.stringify({ loggedIn: mode !== "logout", email: "watcher@example.com", subscriptionType: "pro" })); process.exit(0); }
if (args[0] === "-p") {
  readFileSync(0, "utf8"); // the observation
  const after = mode.match(/^limit-after-(\d+)$/);
  const turns = process.env.FAKE_CLAUDE_LOG ? readFileSync(process.env.FAKE_CLAUDE_LOG, "utf8").split("\n").filter(l => l.startsWith('["-p"')).length : 0;
  if (mode === "limit" || (after && turns > Number(after[1]))) { console.log(JSON.stringify({ is_error: true, result: `Claude AI usage limit reached|${Math.floor(Date.now() / 1000) + 3600}` })); process.exit(1); }
  const minister = (args[args.indexOf("--system-prompt") + 1] || "").startsWith("You are a MINISTER"); // §4.9
  console.log(JSON.stringify({ is_error: false, result: JSON.stringify(minister ? { thought: "Thần xin tuân lệnh.", actions: [] } : { thought: "Giữ lửa và đi săn.", actions: [] }) }));
  process.exit(0);
}
process.exit(2);
