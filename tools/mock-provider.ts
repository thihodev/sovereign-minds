// A fake OpenAI-compatible provider for development and demos, no keys needed.
// It reads the observation the engine sends and answers like a (simple) AI
// nation, the judge or the Historian. It also misbehaves on purpose: ~5% of calls get
// HTTP 429 with retry-after, ~5% get prose instead of JSON.
//
//   node tools/mock-provider.ts            # listens on :4010
//   CUSTOM_BASE_URL=http://127.0.0.1:4010/v1 NATIONS=custom,custom,custom npm start

import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT) || 4010;
const FAIL = Number(process.env.MOCK_FAIL_RATE ?? 0.05);
let calls = 0;

const SYL = ["ka", "lu", "mi", "to", "ra", "en", "vo", "si", "ha", "nu", "ro", "el", "ta", "mo", "ku", "di"];
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const pick = <T>(a: T[], h: number) => a[(h >>> 0) % a.length];

function nationTurn(obs: any, seed: number): Record<string, unknown> {
  const h = hash(JSON.stringify(obs.nation?.capital_tile ?? "") + seed);
  if (obs.nation?.founded === false) {
    const name = pick(SYL, h).toUpperCase()[0] + pick(SYL, h >> 3) + pick(SYL, h >> 7) + pick(SYL, h >> 11);
    const color = "#" + ((h * 2654435761) >>> 8 & 0xffffff).toString(16).padStart(6, "0");
    return {
      thought: "Chúng ta dựng lửa và đặt tên cho dân tộc mình.",
      actions: [{ type: "found_nation", name, capital: name + " Thượng", people: "người " + name, flag: { layout: pick(["h2", "v3", "cross", "border"], h), colors: [color, "#f5f0e1"], symbol: pick(["sun", "wolf", "fish", "fire", "mountain"], h >> 5) }, manifesto: `Người ${name} sống cùng sông núi và không quên tổ tiên.` }],
      labor: { hunt: 7, gather: 4, research: 2, craft: 1 },
      memory: "Lượt 0: lập quốc.",
    };
  }
  const w = obs.population.workers, need = obs.population.food_need;
  const food = Math.min(w, Math.ceil(need * 1.5 / 2.1));
  const research = Math.max(1, Math.floor(Math.max(0, w - food) * 0.5));
  const rest = Math.max(0, w - food - research);
  const labor = { hunt: Math.ceil(food * 0.6), gather: Math.floor(food * 0.4), research, craft: Math.min(2, rest), stone: Math.min(1, Math.max(0, rest - 2)), build: Math.max(0, rest - 3) };
  const actions: any[] = [];
  const crafts: Record<string, number> = { stone_tool: 2 };
  if (!obs.research && obs.research_options?.length) actions.push({ type: "research", invention: obs.research_options.sort((a: any, b: any) => a.rp - b.rp)[0].id });
  const pending = (obs.my_proposals || []).some((p: any) => p.status === "pending");
  if (!pending && obs.tick % 9 === h % 9 && obs.inventions.length >= 6) {
    const pre = obs.inventions.slice(-2).map((i: any) => i.id);
    actions.push({ type: "propose_invention", name: `Kỹ thuật ${pick(["đan", "nung", "mài", "buộc", "phơi"], h + obs.tick)} ${obs.tick}`, description: "Cải tiến nhỏ từ những gì đã biết, làm bằng vật liệu sẵn có.", prereqs: pre, effects: [{ kind: "role_bonus", role: pick(["gather", "hunt", "fish", "stone"], h + obs.tick), percent: 10 }] });
  }
  if (obs.tick % 6 === h % 6 && obs.claimable?.length && obs.territory.length < obs.tile_limit) actions.push({ type: "claim_tile", tile: obs.claimable[0].tile });
  if (obs.tick % 7 === h % 7) actions.push({ type: "explore", direction: pick(["E", "NE", "NW", "W", "SW", "SE"], h + obs.tick), people: 2, from: obs.territory[(h + obs.tick) % obs.territory.length].tile });
  if (!obs.buildings.some((b: any) => b.type === "workshop") && (obs.stock.stone ?? 0) >= 5) actions.push({ type: "build", building: "workshop" });
  for (const o of obs.trade_offers_to_me || []) { actions.push({ type: "accept_trade", offer: o.offer }); break; }
  for (const o of obs.treaty_offers_to_me || []) { if (!o.tribute || !Object.keys(o.tribute).length) { actions.push({ type: "accept_treaty", offer: o.offer }); break; } }
  const k = obs.known_nations || [];
  if (k.length && obs.tick % 5 === h % 5) {
    const o = k[(h + obs.tick) % k.length];
    actions.push(o.shared_language ? { type: "message", to: o.name, text: "Chúng tôi muốn sống hòa bình và trao đổi da thú." } : { type: "message", to: o.name, gesture: "muốn hòa bình" });
    if ((obs.stock.hide ?? 0) > 8) actions.push({ type: "trade_offer", to: o.name, give: { hide: 4 }, get: { flint: 2 } });
    if (o.relation === "đã gặp") actions.push({ type: "treaty", to: o.name, kind: "non_aggression", duration: 40 });
  }
  if (obs.tick === 30 + (h % 10)) actions.push({ type: "petition", category: "tài nguyên", title: "Xin thêm đá lửa", text: "Vùng chúng tôi thiếu đá lửa; xin các vị thần cho đá lửa xuất hiện ở các đồi gần sông.", reason: "Không có đá lửa thì không làm được lưỡi đá." });
  return { thought: `Lượt ${obs.tick}: giữ đủ ăn (${need}), nghiên cứu ${obs.research?.name ?? "mới"}.`, labor, crafts, actions, memory: `${obs.memory ? obs.memory.slice(-1500) + "\n" : ""}Lượt ${obs.tick}: dân ${obs.population.total}.` };
}

function judgeTurn(text: string): Record<string, unknown> {
  const h = hash(text);
  const ok = h % 5 !== 0;
  return { causality: ok ? 2 : 1, material: ok ? 2 : 1, physics: ok ? 1 : 1, duplicate_of: null, add_prereqs: [], remove_effects: [], remove_capabilities: [], reason: ok ? "Bước tiến nhỏ, có nền tảng." : "Chưa đủ nền tảng cho bước này." };
}

/** A plausible chapter built only from the facts in the Historian's prompt. */
function historianTurn(text: string): Record<string, unknown> {
  const range = text.match(/các lượt (\d+)–(\d+)/), from = Number(range?.[1] ?? 0), to = Number(range?.[2] ?? 0);
  const nations = [...text.matchAll(/^- (.+?) \((.+?), thủ đô (.+?)\)( — đã diệt vong)? \| dân (\d+) \| (\S+) ô \| (\d+) phát minh/gm)]
    .map(m => ({ name: m[1], people: m[2], capital: m[3], dead: !!m[4], pop: Number(m[5]), inv: Number(m[7]) }));
  const events = [...text.matchAll(/^- lượt (\d+)(?: \[(.+?)\])?: (.+)$/gm)].map(m => ({ tick: Number(m[1]), nation: m[2], text: m[3] }));
  const h = hash(text);
  const top = nations.slice().sort((a, b) => b.pop - a.pop)[0];
  const paras: string[] = [];
  paras.push(`Trong ${(to - from + 1) * 10} năm từ năm ${from * 10} đến năm ${(to + 1) * 10}, đất Nguyên Địa vẫn là cõi của lửa trại, đá mài và những cánh rừng chưa ai đặt tên. ${nations.length ? `Có ${nations.length} dân tộc cùng sống dưới một bầu trời: ${nations.map(n => `${n.people} ở ${n.capital}`).join(", ")}.` : "Các bộ lạc còn chưa kịp đặt tên cho mình."}`);
  const picked = events.filter(e => /phát minh|lập quốc|chiến|hiệp ước|định cư|đói|kỷ/i.test(e.text)).slice(0, 4);
  if (picked.length) paras.push(`Sử sách ghi lại rằng ${picked.map(e => `vào lượt ${e.tick}, ${e.text.replace(/\.$/, "").replace(/^./, c => c.toLowerCase())}`).join("; rồi ")}. Mỗi việc ấy đều nhỏ, nhưng người đời sau sẽ thấy đó là những viên đá đầu tiên của một con đường dài.`);
  else paras.push("Không có biến cố lớn nào được chép lại. Người ta săn, hái, giữ lửa và chờ mùa sau, và chính sự lặng lẽ ấy cũng là một phần của lịch sử.");
  if (top) paras.push(`Đến cuối giai đoạn, ${top.name} là nước đông người nhất với ${top.pop} dân và ${top.inv} phát minh, ${pick(["nhưng chưa ai dám nói vận nước sẽ bền lâu", "và tiếng trống của họ vang xa nhất bên bờ sông", "song cái đói vẫn rình rập ngoài bìa rừng"], h)}. ${nations.filter(n => n !== top && !n.dead).map(n => `${n.name} có ${n.pop} người`).join(", ") || "Các nước khác còn nhỏ bé"}. ${nations.some(n => n.dead) ? `Có nước đã tắt lửa vĩnh viễn: ${nations.filter(n => n.dead).map(n => n.name).join(", ")}.` : "Chưa nước nào tắt lửa."} Bánh xe thời gian vẫn quay, và chương sau còn chờ được viết.`);
  return { title: `${pick(["Lửa trại", "Đá và sông", "Những mùa săn", "Tiếng trống đầu tiên", "Bước chân trên đồng cỏ"], h)} (năm ${from * 10}–${(to + 1) * 10})`, text: paras.join("\n\n") };
}

createServer((req, res) => {
  let body = "";
  req.on("data", c => { body += c; });
  req.on("end", () => {
    calls++;
    const reply = (status: number, obj: unknown, headers: Record<string, string> = {}) => { res.writeHead(status, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(obj)); };
    let j: any = {};
    try { j = JSON.parse(body); } catch { return reply(400, { error: "bad json" }); }
    const r = Math.random();
    if (r < FAIL) return reply(429, { error: { message: "Rate limit reached (mock)" } }, { "retry-after": "20" });
    const system = j.messages?.[0]?.content ?? "", user = j.messages?.[1]?.content ?? "";
    let content: string;
    if (/Judge of Inventions/.test(system)) content = JSON.stringify(judgeTurn(user));
    else if (/You are the Historian of/.test(system)) content = JSON.stringify(historianTurn(user));
    else {
      if (r < FAIL * 2) content = "Tôi nghĩ chúng ta nên đi săn nhiều hơn.";
      else {
        let obs: any;
        try { obs = JSON.parse(user.split("\n\nYOUR PREVIOUS REPLY")[0]); } catch { return reply(400, { error: "observation not json" }); }
        content = "```json\n" + JSON.stringify(nationTurn(obs, calls)) + "\n```";
      }
    }
    reply(200, { id: `mock-${calls}`, choices: [{ index: 0, message: { role: "assistant", content } }], model: j.model }, { "x-ratelimit-remaining-requests": String(1000 - calls) });
  });
}).listen(PORT, "127.0.0.1", () => console.log(`[mock] OpenAI-compatible mock on http://127.0.0.1:${PORT}/v1`));
