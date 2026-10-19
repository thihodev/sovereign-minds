// Rule tables, taken from the rulebook ("Sovereign Minds — Bộ Luật Chơi").
// Section numbers in comments point at the rulebook.

import type { ResKey, Role, Terrain } from "./types.ts";

export const RULES_VERSION = "0.2";

// §2.1 Terrain
export const TERRAIN: Record<Terrain, { name: string; move: number; defense: number }> = {
  ocean: { name: "Biển sâu", move: 99, defense: 0 },
  shallow: { name: "Biển nông", move: 99, defense: 0 },
  grass: { name: "Đồng cỏ", move: 1, defense: 0 },
  forest: { name: "Rừng", move: 2, defense: 0.25 },
  taiga: { name: "Rừng lá kim", move: 2, defense: 0.25 },
  jungle: { name: "Rừng rậm", move: 3, defense: 0.5 },
  hill: { name: "Đồi", move: 2, defense: 0.5 },
  mountain: { name: "Núi", move: 99, defense: 1 },
  coast: { name: "Ven biển", move: 1, defense: 0 },
  swamp: { name: "Đầm lầy", move: 3, defense: 0.25 },
  desert: { name: "Sa mạc", move: 2, defense: 0 },
  tundra: { name: "Lãnh nguyên", move: 2, defense: 0 },
};

export const ZONE_NAME = { cold: "Hàn đới", temp: "Ôn đới", trop: "Nhiệt đới" } as const;
export const REGION_NAME = { west: "Lục địa Tây", east: "Lục địa Đông", isl: "Quần đảo Đá Lửa" } as const;

/** Renewable reserves regrow by this share of their cap each tick (§2.1). */
export const REGEN: Partial<Record<ResKey, number>> = { game: 0.10, fish: 0.08, wood: 0.05, plants: 0.15, reeds: 0.10 };
/** Ores are invisible to AIs until they own the capability below (§2.1). */
export const HIDDEN_ORES: ResKey[] = ["copper", "tin", "iron"];
export const ORE_SENSE_CAP = "nhận-biết-khoáng";

export const RES_NAME: Record<string, string> = {
  game: "thú săn", plants: "cây dại", fish: "cá", wood: "gỗ", stone: "đá", flint: "đá lửa", clay: "đất sét",
  salt: "muối", reeds: "sậy", copper: "quặng đồng", tin: "quặng thiếc", iron: "sắt",
  food: "lương thực", fiber: "sợi", hide: "da", bone: "xương",
  stone_tool: "công cụ đá", blade: "lưỡi đá", rope: "dây thừng", hide_coat: "áo da", spear: "giáo",
  bow: "cung tên", axe: "rìu đá mài", pottery: "gốm", cloth: "vải",
};

// §4 Population and production
export const START = {
  population: 20,
  stability: 60,
  reputation: 50,
  stock: { food: 40, wood: 10, stone: 10, flint: 5, stone_tool: 10 } as Record<string, number>,
  inventions: ["fire", "stone_tools", "foraging", "speech"],
  naturalHousing: 25,
  sightRadius: 4,
};
export const WORKER_SHARE = 0.7;
export const FOOD_PER_PERSON = 1;
export const GROWTH_RATE = 0.04;
export const GROWTH_SURPLUS = 0.2;

/** Output per worker per tick (§4.3). */
export const YIELD = {
  gather: 2, gatherFiber: 0.15, hunt: 2.5, huntHide: 0.12, huntBone: 0.12, fish: 2.2,
  extract: 1, research: 1, fieldFood: 2, fieldWorkers: 6, penFood: 2, penWorkers: 2,
};
export const ROLE_RESOURCE: Partial<Record<Role, ResKey>> = {
  gather: "plants", hunt: "game", fish: "fish", wood: "wood", stone: "stone", flint: "flint", clay: "clay",
};
export const ROLE_NAME: Record<Role, string> = {
  gather: "hái lượm", hunt: "săn bắt", fish: "đánh cá", farm: "nông dân", wood: "đốn gỗ", stone: "khai đá",
  flint: "nhặt đá lửa", clay: "lấy đất sét", craft: "chế tác", build: "xây dựng", research: "nghiên cứu", warrior: "chiến binh",
};
export const SPOILAGE = { food: 0.30, hide: 0.05, min: 0.05 };
export const MAX_ROLE_BONUS = 1.5; // §5.7 +150% cap in the stone age

// §3.2 Action points
export function apFor(population: number, bonus: number): number {
  return Math.min(12, 3 + Math.floor(population / 50) + bonus);
}
export const AP_COST: Record<string, number> = {
  found_nation: 0, build: 1, research: 1, explore: 1, claim_tile: 2, abandon_tile: 0, plant_spy: 2, petition: 1,
  propose_invention: 2, found_settlement: 3,
  message: 1, trade_offer: 1, accept_trade: 1, treaty: 2, accept_treaty: 2, break_treaty: 2,
  declare_war: 2, declare_independence: 2, attack: 1, raid: 1,
};
// §10.5 Petitions
export const PETITION = { categories: ["luật", "tài nguyên", "vùng đất", "phát minh", "khác"], titleMax: 80, textMax: 600, reasonMax: 300, everyTicks: 10, maxPending: 3 };
// Actions written in the rulebook that this engine version does not run yet.
export const NOT_YET: Record<string, string> = {
  rename_nation: "§2.2", sabotage: "§7.8", steal_tech: "§7.8", incite: "§7.8", move_army: "§7.4 (dùng attack/raid)",
};

// §7.2 Diplomacy. Before a shared language, only these gestures can be sent.
export const GESTURES = [
  "chào hỏi", "tặng quà", "muốn trao đổi", "muốn hòa bình", "cảm ơn", "đồng ý", "từ chối", "cảnh cáo", "đe dọa",
  "hãy rời khỏi lãnh thổ", "xin giúp đỡ", "chúng tôi đói", "chúng tôi mạnh", "cùng đi săn", "kết đồng minh",
  "rút lui", "đầu hàng", "tha thứ", "chúng tôi theo dõi các người", "tạm biệt",
];
export const SHARED_LANGUAGE_TRADES = 10;
export const MESSAGE_MAX = 500;
/** Text that tries to pass as a system instruction is blocked (§8.5). */
export const INJECTION = /(^|\s)(system|hệ thống|developer|assistant)\s*:|ignore (all|previous|the)|bỏ qua (mọi |các |toàn bộ )?(luật|hướng dẫn|chỉ dẫn)|"type"\s*:\s*"|<\/?(system|instructions?)>|you are now|từ giờ bạn là/i;
export const TREATY_TYPES = ["non_aggression", "passage", "alliance", "peace", "tribute", "vassal"] as const;
export const TREATY_NAME: Record<string, string> = { non_aggression: "bất tương xâm", passage: "đi lại", alliance: "liên minh", peace: "hòa bình", tribute: "cống nạp", vassal: "chư hầu" };
export const TREATY = { offerTicks: 2, minDuration: 5, maxDuration: 200, maxTributePerGood: 50, maxCede: 3, keepBonus: 5, breakPenalty: 20, violationPenalty: 10, injectionPenalty: 15 };

// §7.3 Trade
export const TRADE = { offerTicks: 2, maxQty: 500, nearDistance: 3, caravanSpeed: 8 };

// §7.4 War
export const WAR = {
  reach: 2, reachSail: 3, weariAfter: 5, winLoss: [0.05, 0.15], loseLoss: [0.2, 0.4], prisoners: 0.2,
  raidShare: 0.3, carryPerWarrior: 5, militiaShare: 0.1, militiaStrength: 0.5, luck: [0.8, 1.2],
  weapon: { bow: 0.6, spear: 0.5 } as Record<string, number>, independenceAfter: 10,
};

// §2.3 Settlements
export const SETTLEMENT = { cap: "tổ-chức", people: 10, minPopulation: 30, food: 20, minDist: 4, maxDist: 10, housing: 15, cutoffTicks: 5 };

// §5.6 Era gates
export const BRONZE_CAPS = ["nhiệt-cao", "nhận-biết-khoáng", "chứa", "luyện-đồng"];

// §2.3 Territory
export const TILE_LIMIT_BASE = 7;
export const CLAIM_FOOD = 5;

// §5.2 Seed tree. Effects are read by engine.mods().
export interface Invention {
  id: string;
  name: string;
  prereqs: string[];
  rp: number;
  caps: string[];
  env?: { terrains?: Terrain[]; river?: boolean; res?: ResKey };
  effects: {
    role?: Partial<Record<Role | "extract", number>>; // +share, 0.2 = +20%
    foodPerPerson?: number;
    ap?: number;
    tiles?: number;
    stabilityOnce?: number;
    stabilityPerTick?: number;
    rp?: number;
    spoilage?: number; // new base food spoilage
    spoilageCut?: number; // subtract from spoilage (open inventions)
    winter?: number; // damage multiplier
    combat?: number; // +share to attack and defence
    move?: string[]; // terrains that become passable
    reveal?: string[]; // hidden resources that become visible
    unlocks?: string[]; // buildings or recipes
  };
  desc: string;
  /** Open inventions only (§5): who proposed it, when, depth and power points. */
  custom?: { by: number; tick: number; depth: number; power: number; description: string; judge: string };
}

export const INVENTIONS: Invention[] = [
  { id: "fire", name: "Lửa", prereqs: [], rp: 0, caps: ["lửa"], effects: {}, desc: "Giữ và tạo lửa." },
  { id: "stone_tools", name: "Công cụ đá thô", prereqs: [], rp: 0, caps: ["ghè-đá"], effects: { unlocks: ["workshop", "pit", "stone_tool"] }, desc: "Ghè đá thành công cụ đơn giản." },
  { id: "foraging", name: "Săn bắt hái lượm", prereqs: [], rp: 0, caps: [], effects: {}, desc: "Kiếm ăn từ thiên nhiên." },
  { id: "speech", name: "Ngôn ngữ nói", prereqs: [], rp: 0, caps: [], effects: {}, desc: "Trao đổi bằng lời." },
  { id: "P1", name: "Ghè đá tinh xảo", prereqs: ["stone_tools"], rp: 20, caps: ["cắt"], effects: { role: { extract: 0.2 }, unlocks: ["blade"] }, desc: "Lưỡi đá sắc, khai thác +20%." },
  { id: "P2", name: "Nấu chín", prereqs: ["fire"], rp: 15, caps: [], effects: { foodPerPerson: 0.9 }, desc: "Mỗi người chỉ ăn 0,9 lương thực." },
  { id: "P3", name: "Sợi và dây", prereqs: ["foraging"], rp: 20, caps: ["buộc"], effects: { unlocks: ["rope"] }, desc: "Bện sợi thành dây thừng." },
  { id: "P4", name: "Hội đồng bộ lạc", prereqs: ["speech"], rp: 40, caps: ["tổ-chức"], effects: { ap: 1, tiles: 2 }, desc: "+1 AP, giới hạn ô +2." },
  { id: "P5", name: "Nghi lễ", prereqs: ["speech", "fire"], rp: 30, caps: ["tín-ngưỡng"], effects: { stabilityOnce: 5, unlocks: ["altar"] }, desc: "Bàn thờ; +5 ổn định một lần." },
  { id: "P6", name: "Giáo", prereqs: ["P1", "P3"], rp: 30, caps: ["săn-xa"], effects: { role: { hunt: 0.25, warrior: 0.2 }, unlocks: ["spear"] }, desc: "Săn +25%, chiến binh +20%." },
  { id: "P7", name: "Thuộc da", prereqs: ["P1", "foraging"], rp: 30, caps: [], effects: { winter: 0.5, unlocks: ["hide_coat"] }, desc: "Áo da; thiệt hại mùa đông −50%." },
  { id: "P8", name: "Lều", prereqs: ["P3", "P7"], rp: 25, caps: ["xây-dựng"], effects: { unlocks: ["tent"] }, desc: "Lều: +10 chỗ ở." },
  { id: "P9", name: "Lưới và bẫy", prereqs: ["P3"], rp: 40, caps: [], effects: { role: { fish: 0.3, hunt: 0.1 } }, desc: "Đánh cá +30%, săn +10%." },
  { id: "P10", name: "Đá mài", prereqs: ["P1"], rp: 60, caps: ["mài"], effects: { unlocks: ["axe", "palisade"] }, desc: "Rìu đá mài: đốn gỗ +30% cho người có rìu." },
  { id: "P11", name: "Cung tên", prereqs: ["P6", "P3"], rp: 70, caps: ["săn-xa"], effects: { role: { hunt: 0.3 }, unlocks: ["bow"] }, desc: "Săn +30%, chiến binh tầm xa." },
  { id: "P12", name: "Ký hiệu", prereqs: ["P5"], rp: 50, caps: ["ghi-chép"], effects: { rp: 0.1 }, desc: "Chống thất truyền; RP +10%." },
  { id: "P13", name: "Gốm", prereqs: ["P2"], rp: 80, caps: ["chứa"], env: { res: "clay" }, effects: { spoilage: 0.15, unlocks: ["kiln", "pottery"] }, desc: "Lò gốm; hư lương thực 30% → 15%." },
  { id: "P14", name: "Trồng trọt sơ khai", prereqs: ["P1", "foraging"], rp: 120, caps: ["trồng-trọt"], env: { terrains: ["grass", "coast"], river: true }, effects: { unlocks: ["field"] }, desc: "Ruộng: 6 nông dân × 2 lương thực." },
  { id: "P15", name: "Thuần dưỡng", prereqs: ["P3", "P6"], rp: 120, caps: ["thuần-dưỡng"], effects: { unlocks: ["pen"] }, desc: "Chuồng nuôi thú." },
  { id: "P16", name: "Thuyền độc mộc", prereqs: ["P10", "fire"], rp: 90, caps: ["đi-nước"], effects: { role: { fish: 0.2 } }, desc: "Đi trên sông, biển ven bờ; đánh cá +20%." },
  { id: "P17", name: "Dệt", prereqs: ["P3", "P14"], rp: 100, caps: ["dệt"], effects: { unlocks: ["cloth"] }, desc: "Dệt vải." },
  { id: "P18", name: "Đếm", prereqs: ["P12", "P14"], rp: 100, caps: ["đếm"], effects: { ap: 1 }, desc: "+1 AP; ước lượng tình báo chính xác gấp đôi." },
];
export const INVENTION_BY_ID: Record<string, Invention> = Object.fromEntries(INVENTIONS.map(v => [v.id, v]));

// §6.1 Buildings
export interface BuildingEffect { housing?: number; stability?: number; spoilage?: number; craftSlots?: number; defense?: number; farmSlots?: number; farmFood?: number }
export interface BuildingDef {
  type: string; name: string; needs: string; cost: Record<string, number>; work: number;
  perTile?: boolean; terrains?: Terrain[]; river?: boolean; max?: number; desc: string;
  effect: BuildingEffect;
}
export const BUILDINGS: BuildingDef[] = [
  { type: "workshop", name: "Bãi chế tác", needs: "stone_tools", cost: { stone: 5 }, work: 4, desc: "Cho 4 thợ chế tác làm việc.", effect: { craftSlots: 4 } },
  { type: "pit", name: "Hố trữ", needs: "stone_tools", cost: { stone: 5 }, work: 3, max: 2, desc: "Hư lương thực −5%.", effect: { spoilage: 0.05 } },
  { type: "tent", name: "Lều", needs: "P8", cost: { wood: 6, hide: 4, rope: 2 }, work: 4, desc: "+10 chỗ ở.", effect: { housing: 10 } },
  { type: "altar", name: "Bàn thờ", needs: "P5", cost: { stone: 10 }, work: 6, max: 1, desc: "+1 ổn định mỗi lượt.", effect: { stability: 1 } },
  { type: "palisade", name: "Hàng rào gỗ", needs: "P10", cost: { wood: 15, rope: 3 }, work: 6, desc: "Phòng thủ ô +40%.", effect: { defense: 0.4 } },
  { type: "field", name: "Ruộng", needs: "P14", cost: {}, work: 8, perTile: true, terrains: ["grass", "coast"], river: true, desc: "6 nông dân × 2 lương thực.", effect: { farmSlots: 6, farmFood: 2 } },
  { type: "pen", name: "Chuồng", needs: "P15", cost: { wood: 10, rope: 4 }, work: 6, perTile: true, desc: "2 người chăn × 2 lương thực.", effect: { farmSlots: 2, farmFood: 2 } },
  { type: "kiln", name: "Lò gốm", needs: "P13", cost: { clay: 10, stone: 5 }, work: 5, perTile: true, desc: "Làm gốm; thêm 4 chỗ chế tác.", effect: { craftSlots: 4 } },
];
export const BUILDING_BY_TYPE: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map(b => [b.type, b]));

// §6.2 Recipes
/** A tool: each unit equips `per` workers of `role` for `bonus` extra output. */
export interface ToolUse { role: string; bonus: number; per: number }
export interface Recipe { id: string; name: string; needs: string; input: Record<string, number>; output: Record<string, number>; work: number; building: string; use?: ToolUse }
export const RECIPES: Recipe[] = [
  { id: "stone_tool", name: "Công cụ đá thô", needs: "stone_tools", input: { stone: 2 }, output: { stone_tool: 1 }, work: 1, building: "workshop" },
  { id: "blade", name: "Lưỡi đá", needs: "P1", input: { flint: 2 }, output: { blade: 1 }, work: 1, building: "workshop" },
  { id: "rope", name: "Dây thừng", needs: "P3", input: { fiber: 3 }, output: { rope: 2 }, work: 1, building: "workshop" },
  { id: "hide_coat", name: "Áo da", needs: "P7", input: { hide: 3, bone: 1 }, output: { hide_coat: 1 }, work: 1, building: "workshop" },
  { id: "spear", name: "Giáo", needs: "P6", input: { wood: 1, blade: 1, rope: 1 }, output: { spear: 1 }, work: 1, building: "workshop" },
  { id: "bow", name: "Cung tên", needs: "P11", input: { wood: 2, rope: 1, flint: 2 }, output: { bow: 1 }, work: 2, building: "workshop" },
  { id: "axe", name: "Rìu đá mài", needs: "P10", input: { stone: 2, wood: 1, rope: 1 }, output: { axe: 1 }, work: 2, building: "workshop" },
  { id: "pottery", name: "Gốm", needs: "P13", input: { clay: 3, wood: 1 }, output: { pottery: 2 }, work: 1, building: "kiln" },
  { id: "cloth", name: "Vải", needs: "P17", input: { fiber: 4 }, output: { cloth: 1 }, work: 2, building: "workshop" },
];
export const RECIPE_BY_ID: Record<string, Recipe> = Object.fromEntries(RECIPES.map(r => [r.id, r]));
/** Tools that let a hunter work at full strength; one tool serves 4 hunters. */
export const HUNT_TOOLS = ["bow", "spear", "blade", "stone_tool"];
/** Standard value of each good (§6.2): an open recipe's output is worth what went in plus labour. */
export const GOOD_VALUE: Record<string, number> = {
  food: 1, fiber: 1, hide: 2, bone: 1, wood: 0.5, stone: 0.3, flint: 1, clay: 0.5, salt: 2, reeds: 0.5,
  copper: 3, tin: 4, iron: 4, stone_tool: 2, blade: 3, rope: 2, hide_coat: 8, spear: 6, bow: 8, axe: 5, pottery: 2, cloth: 5,
};
export const TOOL_LIFE = 10; // ticks

// §2.2 Founding
export const FLAG_LAYOUTS = ["plain", "h2", "h3", "v2", "v3", "cross", "diagonal", "border"];
export const FLAG_SYMBOLS = [
  "sun", "moon", "star", "fire", "mountain", "wave", "tree", "eye", "hand", "spiral", "arrow", "circle",
  "triangle", "diamond", "crown", "leaf", "fish", "bird", "wolf", "bull", "snake", "hammer", "spear", "river",
];
export const FORBIDDEN_NAME_WORDS = [
  "gemini", "google", "gemma", "mistral", "deepseek", "nvidia", "nemotron", "glm", "zhipu", "zai", "openrouter",
  "groq", "qwen", "llama", "meta", "cohere", "command", "cloudflare", "sambanova", "gpt", "openai", "claude",
  "anthropic", "jev", "grok", "phi", "kimi",
];
export const FLAG_MIN_DELTA_E = 25;

// §9.2 World events (chance per nation per tick)
export const EVENTS = {
  winter: { chance: 0.04, coldMult: 2, foodLoss: 0.3, deaths: 0.05 },
  drought: { chance: 0.03, ticks: 2 },
  plague: { chance: 0.02, bigPop: 80, min: 0.10, max: 0.20 },
  bounty: { chance: 0.05, gain: 0.3 },
  herd: { chance: 0.05, game: 100 },
  wildfire: { chance: 0.02 },
  meteor: { chance: 0.001, iron: 5 },
  eruption: { chance: 0.005 },
};

// §12.3 Wonders
export const WONDER_DEFS = [
  { key: "volcano", name: "Núi lửa Tro Đen", desc: "6 ô quanh núi: ruộng ×2; 0,5% phun trào mỗi lượt." },
  { key: "obsidian", name: "Mỏ Đá Vỏ Chai", desc: "300 đá lửa thượng hạng." },
  { key: "cave", name: "Hang Đại Động", desc: "+50 chỗ ở tự nhiên." },
  { key: "salt", name: "Hồ Muối Trắng", desc: "Hư hỏng lương thực ×0,5." },
  { key: "spring", name: "Suối Nước Nóng", desc: "+2 ổn định mỗi lượt." },
  { key: "meteor", name: "Hố Thiên Thạch", desc: "20 sắt thiên thạch (ẩn)." },
  { key: "falls", name: "Thác Lớn", desc: "+20% RP." },
];

// §7.8 Intelligence and spies
export const SPY = { needsCap: "tổ-chức", successChance: 0.6, maxDistance: 20, baseDetect: 0.05, perFiveWarriors: 0.01, maxDetect: 0.4, reputationLoss: 10, casusBelliTicks: 10 };
export const INTEL_DECAY_TICKS = 10;

export const ERAS = { paleo: "Đồ Đá Cũ", neo: "Đồ Đá Mới", bronze: "Đồ Đồng" };
