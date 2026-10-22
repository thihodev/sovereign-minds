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
  const input = readFileSync(0, "utf8"); // the observation
  const after = mode.match(/^limit-after-(\d+)$/);
  const turns = process.env.FAKE_CLAUDE_LOG ? readFileSync(process.env.FAKE_CLAUDE_LOG, "utf8").split("\n").filter(l => l.startsWith('["-p"')).length : 0;
  if (mode === "limit" || (after && turns > Number(after[1]))) { console.log(JSON.stringify({ is_error: true, result: `Claude AI usage limit reached|${Math.floor(Date.now() / 1000) + 3600}` })); process.exit(1); }
  const system = args[args.indexOf("--system-prompt") + 1] || "";
  if (system.startsWith("You are the Judge of Ideas")) { // §10.7: take up the first idea, refuse the rest
    const ids = [...input.matchAll(/^#(\d+) from /gm)].map(m => Number(m[1]));
    const rulings = ids.map((id, k) => k === 0 ? { id, status: "partial", verdict: "Thần linh nhận một phần: làm đúng phần mới, bỏ phần trùng." } : { id, status: "rejected", verdict: "Trùng với điều thế giới đã có." });
    console.log(JSON.stringify({ is_error: false, result: JSON.stringify({ rulings }) }));
    process.exit(0);
  }
  if (system.startsWith("Bạn là người trị vì")) { // §10.9 a ruler talks with the gods: plain words, from its nation's data
    const pop = input.match(/"population":\{"total":(\d+)/)?.[1] ?? input.match(/"total":(\d+)/)?.[1] ?? "?";
    console.log(JSON.stringify({ type: "result", is_error: false, result: `Thưa Ngài, dân của trẫm có **${pop}** người.` }));
    process.exit(0);
  }
  const minister = system.startsWith("You are a MINISTER"); // §4.9
  console.log(JSON.stringify({ is_error: false, result: JSON.stringify(minister ? { thought: "Thần xin tuân lệnh.", actions: [] } : { thought: "Giữ lửa và đi săn.", actions: [] }) }));
  process.exit(0);
}
process.exit(2);
