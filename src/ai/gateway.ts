// AI Gateway: one adapter for every free provider that speaks the
// OpenAI-compatible chat API. Keys are read from the environment only and
// never enter a prompt or the database (§8.5).

export interface ProviderDef {
  id: string;
  label: string;
  base: string;
  keyEnv: string;
  modelEnv: string;
  defaultModel: string;
  json: boolean; // supports response_format: json_object
  extraHeaders?: Record<string, string>;
  /** Local servers (Ollama) need no key; they are on when their URL is set. */
  keyless?: boolean;
}

const cfAccount = () => process.env.CLOUDFLARE_ACCOUNT_ID || "ACCOUNT_ID";

/** Free tiers only (§3.4). Model ids change often: override with *_MODEL. */
export const PROVIDERS: Record<string, ProviderDef> = {
  gemini: { id: "gemini", label: "Google Gemini", base: "https://generativelanguage.googleapis.com/v1beta/openai", keyEnv: "GEMINI_API_KEY", modelEnv: "GEMINI_MODEL", defaultModel: "gemini-3.8-flash", json: true },
  mistral: { id: "mistral", label: "Mistral", base: "https://api.mistral.ai/v1", keyEnv: "MISTRAL_API_KEY", modelEnv: "MISTRAL_MODEL", defaultModel: "mistral-medium-latest", json: true },
  nvidia: { id: "nvidia", label: "NVIDIA NIM", base: "https://integrate.api.nvidia.com/v1", keyEnv: "NVIDIA_API_KEY", modelEnv: "NVIDIA_MODEL", defaultModel: "deepseek-ai/deepseek-v4.1-flash", json: false },
  zai: { id: "zai", label: "Z.ai", base: "https://api.z.ai/api/paas/v4", keyEnv: "ZAI_API_KEY", modelEnv: "ZAI_MODEL", defaultModel: "glm-4.7-flash", json: true },
  openrouter: { id: "openrouter", label: "OpenRouter", base: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY", modelEnv: "OPENROUTER_MODEL", defaultModel: "nvidia/nemotron-3-super-120b-a12b:free", json: true, extraHeaders: { "HTTP-Referer": "https://github.com/thihodev/sovereign-minds", "X-Title": "Sovereign Minds" } },
  groq: { id: "groq", label: "Groq", base: "https://api.groq.com/openai/v1", keyEnv: "GROQ_API_KEY", modelEnv: "GROQ_MODEL", defaultModel: "qwen/qwen3.8-27b", json: true },
  // Without a payment method only MiniMax-M3 (a Chinese model) answers on the free tier (checked 2026-10-20).
  sambanova: { id: "sambanova", label: "SambaNova", base: "https://api.sambanova.ai/v1", keyEnv: "SAMBANOVA_API_KEY", modelEnv: "SAMBANOVA_MODEL", defaultModel: "MiniMax-M3", json: false },
  cohere: { id: "cohere", label: "Cohere", base: "https://api.cohere.ai/compatibility/v1", keyEnv: "COHERE_API_KEY", modelEnv: "COHERE_MODEL", defaultModel: "command-a-03-2025", json: true },
  // Local models on your own machine: free and without quota (§3.4).
  get ollama(): ProviderDef {
    return { id: "ollama", label: "Ollama (máy bạn)", base: (process.env.OLLAMA_BASE_URL || "").replace(/\/$/, ""), keyEnv: "OLLAMA_BASE_URL", modelEnv: "OLLAMA_MODEL", defaultModel: "qwen3:8b", json: true, keyless: true };
  },
  // Any other OpenAI-compatible endpoint.
  get custom(): ProviderDef {
    return { id: "custom", label: process.env.CUSTOM_LABEL || "Custom", base: (process.env.CUSTOM_BASE_URL || "").replace(/\/$/, ""), keyEnv: "CUSTOM_API_KEY", modelEnv: "CUSTOM_MODEL", defaultModel: "default", json: (process.env.CUSTOM_JSON_MODE || "true") !== "false", keyless: !process.env.CUSTOM_API_KEY && !!process.env.CUSTOM_BASE_URL };
  },
  get cloudflare(): ProviderDef {
    return { id: "cloudflare", label: "Cloudflare Workers AI", base: `https://api.cloudflare.com/client/v4/accounts/${cfAccount()}/ai/v1`, keyEnv: "CLOUDFLARE_API_TOKEN", modelEnv: "CLOUDFLARE_MODEL", defaultModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", json: false };
  },
};

export function providerKey(p: ProviderDef): string {
  if (p.keyless) return p.base ? "local" : "";
  return (process.env[p.keyEnv] || "").trim();
}
/** The judge may use a different model than the nation on the same provider. */
export const JUDGE_DEFAULT_MODEL: Record<string, string> = { groq: "openai/gpt-oss-120b" };
export function judgeModel(p: ProviderDef): string { return (process.env[`JUDGE_MODEL_${p.id.toUpperCase()}`] || JUDGE_DEFAULT_MODEL[p.id] || providerModel(p)).trim(); }
export function providerModel(p: ProviderDef): string { return (process.env[p.modelEnv] || p.defaultModel).trim(); }

export type CallResult =
  | { ok: true; text: string; latencyMs: number; headers: Record<string, string> }
  | { ok: false; kind: "ratelimit" | "auth" | "timeout" | "error"; message: string; retryAfterSec: number | null; latencyMs: number; headers: Record<string, string> };

/** Parse every reset hint providers use: seconds, HTTP dates, "2m59.5s", epochs, Gemini's retryDelay. */
export function parseRetryAfter(headers: Record<string, string>, body: string, now = Date.now()): number | null {
  const dur = (s: string): number | null => {
    s = s.trim();
    if (/^\d+(\.\d+)?$/.test(s)) {
      const v = Number(s);
      if (v > 1e12) return Math.max(0, (v - now) / 1000); // epoch ms
      if (v > 1e9) return Math.max(0, v - now / 1000); // epoch s
      return v;
    }
    const m = s.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?$/);
    if (m && m[0]) return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0) + Number(m[4] || 0) / 1000;
    const d = Date.parse(s);
    return Number.isNaN(d) ? null : Math.max(0, (d - now) / 1000);
  };
  const hints: number[] = [];
  for (const h of ["retry-after", "x-ratelimit-reset-requests", "x-ratelimit-reset-tokens", "x-ratelimit-reset", "ratelimit-reset"]) {
    if (headers[h]) { const v = dur(headers[h]); if (v !== null) hints.push(v); }
  }
  const g = body.match(/"retryDelay"\s*:\s*"([\d.]+)s"/);
  if (g) hints.push(Number(g[1]));
  return hints.length ? Math.max(...hints) : null;
}

const BILLING_WORDS = /payment.?method|billing|prepay|credits? (are )?depleted|insufficient.?(balance|credit)|add (a )?card/i;
const QUOTA_WORDS = /quota|rate.?limit|too many requests|resource_exhausted|exceeded|insufficient_quota|limit reached|tokens per (day|minute)|requests per (day|minute)/i;

export async function callModel(p: ProviderDef, system: string, user: string, opts: { timeoutMs: number; maxTokens?: number; model?: string; temperature?: number }): Promise<CallResult> {
  const key = providerKey(p), started = Date.now();
  if (!key) return { ok: false, kind: "auth", message: `Thiếu ${p.keyEnv}`, retryAfterSec: null, latencyMs: 0, headers: {} };
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  const body: Record<string, unknown> = {
    model: opts.model || providerModel(p),
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 4000, // reasoning models think before they answer
  };
  if (p.json) body.response_format = { type: "json_object" };
  try {
    const res = await fetch(`${p.base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(p.keyless ? {} : { authorization: `Bearer ${key}` }), ...(p.extraHeaders || {}) },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { if (/ratelimit|retry-after|x-request-id/i.test(k)) headers[k] = v; });
    const text = await res.text();
    const latencyMs = Date.now() - started;
    // A key that needs a card or prepaid credit is not free: report it, don't treat it as quota.
    if ((res.status === 402 || res.status === 403) && BILLING_WORDS.test(text)) {
      return { ok: false, kind: "auth", message: `Cần thanh toán (không phải gói miễn phí): HTTP ${res.status}: ${text.slice(0, 220)}`, retryAfterSec: null, latencyMs, headers };
    }
    if (res.status === 429 || ((res.status === 403 || res.status === 402 || res.status === 400) && QUOTA_WORDS.test(text))) {
      return { ok: false, kind: "ratelimit", message: `HTTP ${res.status}: ${text.slice(0, 300)}`, retryAfterSec: parseRetryAfter(headers, text), latencyMs, headers };
    }
    if (res.status === 401 || res.status === 403) return { ok: false, kind: "auth", message: `HTTP ${res.status}: ${text.slice(0, 300)}`, retryAfterSec: null, latencyMs, headers };
    if (!res.ok) return { ok: false, kind: "error", message: `HTTP ${res.status}: ${text.slice(0, 300)}`, retryAfterSec: null, latencyMs, headers };
    let content = "";
    try {
      const j = JSON.parse(text);
      content = j.choices?.[0]?.message?.content ?? "";
      if (Array.isArray(content)) content = content.map((c: { text?: string }) => c.text ?? "").join("");
    } catch { return { ok: false, kind: "error", message: `Phản hồi không phải JSON: ${text.slice(0, 200)}`, retryAfterSec: null, latencyMs, headers }; }
    if (!content) return { ok: false, kind: "error", message: "Phản hồi rỗng", retryAfterSec: null, latencyMs, headers };
    return { ok: true, text: String(content), latencyMs, headers };
  } catch (e) {
    const err = e as Error;
    const kind = err.name === "AbortError" ? "timeout" : "error";
    return { ok: false, kind, message: kind === "timeout" ? `Quá hạn ${opts.timeoutMs / 1000}s` : err.message, retryAfterSec: null, latencyMs: Date.now() - started, headers: {} };
  } finally { clearTimeout(timer); }
}

/** Pull the first JSON object out of a reply that may carry fences or thinking. */
export function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "");
  for (let start = cleaned.indexOf("{"); start >= 0; start = cleaned.indexOf("{", start + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        try { const v = JSON.parse(cleaned.slice(start, i + 1)); if (v && typeof v === "object" && !Array.isArray(v)) return v; } catch { /* try next */ }
        break;
      }
    }
  }
  return null;
}
