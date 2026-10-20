// npm run check-providers
// Calls every provider that has a key with a tiny prompt and prints the model,
// latency and the rate-limit headers it returns, so you can see your real free
// quota before starting a world.

import { existsSync, readFileSync } from "node:fs";
import { PROVIDERS, callModel, providerKey, providerModel } from "../src/ai/gateway.ts";

if (existsSync(".env")) for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
}

for (const p of Object.values(PROVIDERS)) {
  if (!providerKey(p)) { console.log(`– ${p.label.padEnd(22)} chưa có ${p.keyEnv}`); continue; }
  const r = await callModel(p, "Reply with JSON only.", 'Return {"ok": true}', { timeoutMs: 90000, maxTokens: 1500 });
  if (r.ok) console.log(`✓ ${p.label.padEnd(22)} ${providerModel(p)} · ${r.latencyMs}ms · ${r.text.slice(0, 60).replace(/\s+/g, " ")}`);
  else {
    console.log(`✗ ${p.label.padEnd(22)} ${providerModel(p)} · ${r.kind}: ${r.message.slice(0, 160)}${r.retryAfterSec !== null ? ` · thử lại sau ${Math.round(r.retryAfterSec)}s` : ""}`);
    const key = providerKey(p), hints: string[] = [];
    if (p.id === "zai" && !key.includes(".")) hints.push("Key Z.ai phải có dạng {API Key ID}.{secret} (có dấu chấm). Bạn đang dùng mỗi API Key ID; tạo key mới và copy cả chuỗi.");
    if (p.id === "gemini" && /prepay|billing|credits/i.test(r.message)) hints.push("Key này thuộc project có gắn thanh toán. Tạo key trong project MỚI không gắn thanh toán ở aistudio.google.com/apikey (Create API key → Create project).");
    if (/Cần thanh toán/.test(r.message)) hints.push(`Model ${providerModel(p)} đòi thanh toán. Thử model khác bằng ${p.modelEnv} trong .env.`);
    if (r.kind === "timeout") hints.push(`Model ${providerModel(p)} không trả lời kịp. Thử model khác bằng ${p.modelEnv}.`);
    for (const h of hints) console.log(`    → ${h}`);
  }
  for (const [k, v] of Object.entries(r.headers)) console.log(`    ${k}: ${v}`);
}
