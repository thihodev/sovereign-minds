// §4.9 AI ministers: a nation big enough asks the gods (the Watcher) for one more mind, an AI model of its own,
// to run one field of the nation every turn beside the ruler, from its own action points. Milestones of people
// open the seats (MINISTERS.at): growing is how a nation earns more minds. Everything here is deterministic:
// the Watcher's answer is written into the world, and the engine acts on it at the start of the next step().

import { AP_COST, INJECTION, MINISTERS, MINISTER_DOMAINS } from "./rules.ts";
import { rngFor, pickOne } from "./rng.ts";
import { recipeOf } from "./catalog.ts";
import { fx } from "./fx.ts";
import { fighters, workForce } from "./people.ts";
import { ROLES, type AIResponse, type Minister, type MinisterRequest, type Nation, type Role, type TurnInput, type World } from "./types.ts";

type Say = (nation: number | null, kind: string, text: string) => void;

/** Seats a people of this size opens (one per milestone reached). */
export function ministerSeats(pop: number): number { return MINISTERS.at.filter(x => pop >= x).length; }
/** Seats a people of this size keeps: a seated minister stays while the people is ≥ keep × its milestone. */
export function keptSeats(pop: number): number { return MINISTERS.at.filter(x => pop >= x * MINISTERS.keep).length; }
/** The next milestone above this people (null: all reached). */
export function nextMilestone(pop: number): number | null { return MINISTERS.at.filter(x => x > pop).sort((a, b) => a - b)[0] ?? null; }
/** A minister's own action points a turn. */
export function ministerAp(n: Nation): number { return Math.min(MINISTERS.ap.max, MINISTERS.ap.base + Math.floor(n.population / MINISTERS.ap.perPop)); }

const requests = (world: World): MinisterRequest[] => (world.ministerRequests ??= []);
/** Requests still waiting for the Watcher, or granted and about to take office. */
export function openRequests(world: World, n: Nation): MinisterRequest[] {
  return (world.ministerRequests ?? []).filter(x => x.nation === n.id && (x.status === "pending" || x.status === "approved"));
}
/** Fields with no minister and no open request. */
export function freeDomains(world: World, n: Nation): string[] {
  const taken = new Set([...(n.ministers ?? []).map(m => m.domain), ...openRequests(world, n).map(x => x.domain)]);
  return Object.keys(MINISTER_DOMAINS).filter(d => !taken.has(d));
}
/** Seats still free to ask for (seats − ministers − open requests). */
export function freeSeats(world: World, n: Nation): number {
  return Math.max(0, ministerSeats(n.population) - (n.ministers ?? []).length - openRequests(world, n).length);
}

// ---------------------------------------------------------------- asking (action request_minister)

export function requestMinister(world: World, n: Nation, a: Record<string, unknown>, say: Say): string | null {
  const domain = String(a.domain ?? ""), def = MINISTER_DOMAINS[domain];
  if (!def) return `Lĩnh vực phải là một trong: ${Object.keys(MINISTER_DOMAINS).join(", ")}`;
  const reason = String(a.reason ?? "").trim();
  if (reason.length > 300) return "Lý do tối đa 300 ký tự";
  if (INJECTION.test(reason)) { n.reputation = Math.max(0, n.reputation - 15); return "Lý do chứa câu giống mệnh lệnh hệ thống nên bị chặn; uy tín bị trừ"; }
  if ((n.ministers ?? []).some(m => m.domain === domain)) return `Đã có ${def.title}`;
  if (openRequests(world, n).some(x => x.domain === domain)) return `Đơn xin ${def.title} đang chờ các vị thần`;
  const refused = (world.ministerRequests ?? []).filter(x => x.nation === n.id && x.domain === domain && x.status === "refused").at(-1);
  if (refused && world.tick - (refused.decidedTick ?? refused.tick) < MINISTERS.retryTicks) return `Các vị thần vừa từ chối ${def.title}; xin lại từ lượt ${(refused.decidedTick ?? refused.tick) + MINISTERS.retryTicks}`;
  const seats = ministerSeats(n.population);
  if (freeSeats(world, n) < 1) {
    const next = nextMilestone(n.population);
    return seats ? `Đã dùng hết ${seats} ghế bộ trưởng${next ? `; ghế tiếp theo từ ${next} dân` : ""}` : `Cần ${MINISTERS.at[0]} dân để xin bộ trưởng đầu tiên (đang có ${n.population})`;
  }
  const list = requests(world);
  const x: MinisterRequest = { id: (list.at(-1)?.id ?? 0) + 1, nation: n.id, domain, tick: world.tick, population: n.population, reason, status: "pending" };
  list.push(x);
  n.lastEvents.push(`Đã dâng đơn xin ${def.title} lên các vị thần (#${x.id}); chờ trong ${MINISTERS.waitTicks} lượt.`);
  say(n.id, "minister", `${n.name} (${n.population} dân) xin các vị thần một ${def.title}: một trí tuệ riêng lo ${def.desc}. Chờ quyết trong mục Thỉnh nguyện.`);
  return null;
}

// ---------------------------------------------------------------- the Watcher's answers, and seats lost (start of step)

const SYL = ["ka", "ru", "mi", "to", "la", "an", "ve", "so", "ha", "ni", "ra", "el", "ta", "mo", "ku", "shi", "or", "ba", "di", "yu"];

export function ministerPhase(world: World, say: Say): void {
  const tick = world.tick;
  for (const x of world.ministerRequests ?? []) {
    const n = world.nations[x.nation], def = MINISTER_DOMAINS[x.domain];
    if (!n?.alive || !def) { if (x.status === "pending" || x.status === "approved") { x.status = "expired"; x.decidedTick = tick; } continue; }
    if (x.status === "approved") {
      const court = (n.ministers ??= []);
      if (court.some(m => m.domain === x.domain)) { x.status = "refused"; x.verdict = `${x.verdict ? `${x.verdict} ` : ""}(đã có ${def.title})`; x.delivered = false; continue; }
      const r = rngFor(world.seed, tick, "minister", n.id, x.id);
      const name = `${pickOne(SYL, r).toUpperCase()[0]}${pickOne(SYL, r)}${pickOne(SYL, r)}`;
      const m: Minister = { id: world.nextId++, domain: x.domain, name, controller: x.controller ?? "bot", model: x.model ?? "bot", effort: x.effort, since: tick, request: x.id, lastOrders: [] };
      court.push(m);
      x.status = "done"; x.minister = m.id; x.delivered = true;
      n.lastEvents.push(`Các vị thần ban cho ${n.name} ${def.title} ${name}: từ lượt sau một trí tuệ riêng lo ${def.desc}, với ${ministerAp(n)} AP riêng mỗi lượt.${x.verdict ? ` Lời các vị thần: ${x.verdict}` : ""}`);
      say(n.id, "minister", `${n.name} có ${def.title} ${name} (${m.controller === "bot" ? "bot" : `Claude ${m.model}${m.effort ? ` · ${m.effort}` : ""}`}), một trí tuệ lo ${def.desc}.`);
      fx({ kind: "minister", tile: n.capital, nation: n.id, text: def.title });
    } else if (x.status === "pending" && tick - x.tick >= MINISTERS.waitTicks) {
      x.status = "expired"; x.decidedTick = tick; x.delivered = true;
      n.lastEvents.push(`Các vị thần không đáp đơn xin ${def.title} trong ${MINISTERS.waitTicks} lượt; có thể xin lại.`);
    } else if ((x.status === "refused" || x.status === "ended") && x.delivered === false) {
      x.delivered = true;
      n.lastEvents.push(x.status === "refused" ? `Các vị thần không ban ${def.title}${x.verdict ? `: ${x.verdict}` : ""}. Xin lại được từ lượt ${(x.decidedTick ?? tick) + MINISTERS.retryTicks}.` : `Các vị thần đã bãi nhiệm ${def.title}${x.verdict ? `: ${x.verdict}` : ""}.`);
    }
  }
  // A people that shrank below its milestones loses its newest ministers
  for (const n of world.nations) {
    if (!n.alive || !n.founded || !n.ministers?.length) continue;
    while (n.ministers.length > keptSeats(n.population)) {
      const m = n.ministers.pop()!, def = MINISTER_DOMAINS[m.domain];
      const x = (world.ministerRequests ?? []).find(r => r.id === m.request);
      if (x) { x.status = "ended"; x.decidedTick = tick; x.verdict = "dân giảm dưới mốc"; x.delivered = true; }
      n.lastEvents.push(`Dân chỉ còn ${n.population}, dưới mốc giữ ghế: ${def?.title ?? m.domain} ${m.name} từ nhiệm. Lớn lại tới mốc thì có thể xin lại.`);
      say(n.id, "minister", `${def?.title ?? m.domain} ${m.name} của ${n.name} từ nhiệm vì dân giảm dưới mốc.`);
    }
  }
}

// ---------------------------------------------------------------- the ministers at work (after the ruler's orders)

export interface MinisterHooks {
  /** Run one order as the nation (the engine's own action handlers); an error message, or null when done. */
  run: (type: string, a: Record<string, unknown>) => string | null;
  /** Apply a labour plan (the engine's own normalisation). */
  labor: (wanted: Partial<Record<Role, number>>) => void;
  /** An order in a few words, for the record of turns. */
  label: (a: Record<string, unknown>) => string;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/** Why a minister may not give this order (null: it may). Beyond its field, the ruler's word comes first. */
function forbidden(world: World, m: Minister, type: string, a: Record<string, unknown>, rulerTypes: Set<string>): string | null {
  const def = MINISTER_DOMAINS[m.domain];
  if (type === "request_minister") return "Chỉ người trị vì mới xin được bộ trưởng";
  if (!def.actions.includes(type)) return `Ngoài lĩnh vực của ${def.title}: chỉ được ${def.actions.join(", ")}`;
  if (MINISTERS.rulerFirst.includes(type) && rulerTypes.has(type)) return `Người trị vì đã ra lệnh ${type} lượt này; bộ trưởng không làm trái`;
  if (type === "treaty" && String(a.kind ?? a.type_ ?? "") === "peace") return "Giảng hòa là việc của người trị vì";
  if (type === "accept_treaty" && world.treatyOffers.find(o => o.id === num(a.offer))?.type === "peace") return "Giảng hòa là việc của người trị vì";
  return null;
}

/** §4.9 After the ruler's orders, each minister acts in its own field, from its own AP. An economy minister's labour,
 *  crafts and mine target replace the ruler's only on a turn the ruler sent none of that; a war minister's
 *  "warriors" sets the number of warriors only on a turn the ruler sent no labour. */
export function ministersAct(world: World, n: Nation, inp: TurnInput | undefined, h: MinisterHooks): void {
  const court = n.ministers ?? [];
  if (!court.length) return;
  const given = new Map((inp?.ministers ?? []).filter(x => x && isObj(x.response)).map(x => [x.minister, x]));
  const ruler = inp?.kind === "ok" && isObj(inp.response) ? inp.response as AIResponse & Record<string, unknown> : undefined;
  const rulerTypes = new Set((Array.isArray(ruler?.actions) ? ruler.actions : []).map(a => String(a?.type ?? "")));
  const rulerLabor = isObj(ruler?.labor), rulerCrafts = isObj(ruler?.crafts), rulerMine = typeof ruler?.mine_target === "string";
  n.turnOrders ??= [];
  for (const m of court) {
    const x = given.get(m.id), def = MINISTER_DOMAINS[m.domain];
    if (!x || x.domain !== m.domain || !def) { m.lastOrders = []; continue; }
    const r = x.response as AIResponse & Record<string, unknown>, orders: string[] = [];
    if (r.thought !== undefined) m.lastThought = String(r.thought).slice(0, 300);
    m.lastTick = world.tick;
    if (m.domain === "economy") {
      if (isObj(r.labor)) { if (rulerLabor) orders.push("labor ✗ người trị vì đã phân công lượt này"); else { h.labor(r.labor as Partial<Record<Role, number>>); orders.push("labor ✓"); } }
      if (isObj(r.crafts)) {
        if (rulerCrafts) orders.push("crafts ✗ người trị vì đã giao chế tác lượt này");
        else { n.crafts = {}; for (const [k, v] of Object.entries(r.crafts)) if (recipeOf(world, k) && num(v) > 0) n.crafts[k] = Math.min(50, Math.floor(num(v))); orders.push("crafts ✓"); }
      }
      if (typeof r.mine_target === "string" && !rulerMine) n.mineTarget = r.mine_target;
    }
    if (m.domain === "war" && r.warriors !== undefined) {
      if (rulerLabor) orders.push("warriors ✗ người trị vì đã phân công lượt này");
      else { setWarriors(n, Math.floor(num(r.warriors))); orders.push(`warriors ${n.labor.warrior} ✓`); }
    }
    let ap = ministerAp(n);
    const acts = Array.isArray(r.actions) ? r.actions.slice(0, MINISTERS.maxOrders) : [];
    for (const a of acts) {
      if (!isObj(a)) continue;
      const type = String(a.type ?? "");
      const reject = (reason: string) => { n.lastRejected.push({ action: `[${def.short}] ${type || "?"}`, reason }); orders.push(`${h.label(a)} ✗ ${reason.slice(0, 90)}`); };
      const no = forbidden(world, m, type, a, rulerTypes);
      if (no) { reject(no); continue; }
      const cost = AP_COST[type] ?? 1;
      if (cost > ap) { reject(`Không đủ AP của bộ trưởng (cần ${cost}, còn ${ap})`); continue; }
      const err = h.run(type, a);
      if (err) { reject(err); ap -= Math.min(cost, ap); continue; } // §1 rule 2: AP is spent anyway
      ap -= cost;
      orders.push(`${h.label(a)} ✓`);
    }
    m.lastOrders = orders;
    for (const o of orders) n.turnOrders.push(`[${def.short}] ${o}`);
  }
}

/** The war minister's word on how many warriors: from idle hands and foragers first, back to foraging when fewer. */
function setWarriors(n: Nation, want: number): void {
  const target = Math.max(0, Math.min(want, fighters(n)));
  let delta = target - n.labor.warrior;
  if (delta < 0) { n.labor.gather += -delta; n.labor.warrior = target; return; }
  const idle = Math.max(0, workForce(n) - ROLES.reduce((s, r) => s + n.labor[r], 0));
  let got = Math.min(idle, delta); delta -= got;
  for (const r of ["gather", ...ROLES.filter(x => x !== "gather" && x !== "warrior")] as Role[]) { if (delta <= 0) break; const k = Math.min(n.labor[r], delta); n.labor[r] -= k; got += k; delta -= k; }
  n.labor.warrior += got;
}

// ---------------------------------------------------------------- what the ruler reads

/** For the nations' rules text (English). */
export function ministersRules(): string {
  const at = MINISTERS.at, ap = MINISTERS.ap;
  return `AI MINISTERS: a great people may ask the gods for more minds. A founded nation may hold 1 minister from ${at[0]} people, 2 from ${at[1]}, 3 from ${at[2]}, 4 from ${at[3]}. A minister is another AI model that runs one field of your nation every turn beside you, with its OWN action points (${ap.base} + 1 per ${ap.perPop} people, max ${ap.max}) on top of yours and its own attention for its field. Fields (one minister each): ${Object.entries(MINISTER_DOMAINS).map(([k, d]) => `${k} (${d.en})`).join("; ")}. Each minister reads your thought and memory as its directives (write them for your ministers too), acts after you each turn and only in its field; your orders come first: an economy minister's labor, crafts or mine_target apply only on a turn you send none, a war minister's warriors only on a turn you send no labor, and a minister may not order ${MINISTERS.rulerFirst.join(", ")} on a turn you did. "ministers" in the observation shows your seats, your ministers and what each did last turn; their orders appear in recent_turns as "[field] …". request_minister (${AP_COST.request_minister}): {"type":"request_minister","domain":"economy|war|diplomacy|learning|interior","reason":"≤300"} when you have a free seat; the gods decide within ${MINISTERS.waitTicks} turns (a refused field may be asked again after ${MINISTERS.retryTicks}). A seat is kept while your people stay at or above ${MINISTERS.keep * 100}% of its milestone; below that the newest minister steps down. Every milestone of people is one more mind serving your nation: grow.`;
}

/** The ruler's view of its seats and ministers (absent while it is far from the first milestone). */
export function ministersObs(world: World, n: Nation): Record<string, unknown> | undefined {
  const court = n.ministers ?? [], open = openRequests(world, n);
  if (!n.founded || (!court.length && !open.length && n.population < MINISTERS.at[0] / 2)) return undefined;
  const free = freeSeats(world, n), next = nextMilestone(n.population);
  return {
    seats: ministerSeats(n.population), next_seat_at_people: next ?? undefined, minister_ap: ministerAp(n),
    serving: court.length ? court.map(m => ({ field: m.domain, name: m.name, since: m.since, last_turn_orders: m.lastOrders?.length ? m.lastOrders : undefined, last_thought: m.lastThought || undefined })) : undefined,
    requests: open.length ? open.map(x => ({ field: x.domain, asked: x.tick, status: x.status === "approved" ? "granted: takes office next turn" : "waiting for the gods" })) : undefined,
    can_request_now: free ? freeDomains(world, n) : undefined,
  };
}

/** The engine's advice on ministers (Vietnamese), for advice(). */
export function ministerAdvice(world: World, n: Nation): Array<{ level: number; text: string }> {
  if (!n.founded || !n.alive) return [];
  const free = freeSeats(world, n), next = nextMilestone(n.population), out: Array<{ level: number; text: string }> = [];
  const doms = freeDomains(world, n);
  if (free && doms.length) out.push({ level: 2, text: `Dân ${n.population} đã đủ mốc: được xin ${free} Bộ trưởng AI nữa (request_minister, domain: ${doms.join("/")}). Mỗi bộ trưởng là một trí tuệ riêng lo một lĩnh vực, với ${ministerAp(n)} AP riêng mỗi lượt ngoài AP của bạn.` });
  else if (next !== null && n.population >= next * 0.6) out.push({ level: 1, text: `Còn ${next - n.population} dân nữa tới mốc ${next}: được xin thêm một Bộ trưởng AI, một trí tuệ riêng với ${MINISTERS.ap.base}+ AP mỗi lượt cho một lĩnh vực.` });
  return out;
}
