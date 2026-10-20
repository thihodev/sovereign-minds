// Rule tables, taken from the rulebook ("Sovereign Minds — Bộ Luật Chơi").
// Section numbers in comments point at the rulebook.

import type { ResKey, Role, Terrain } from "./types.ts";

export const RULES_VERSION = "0.7";

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
  icewall: { name: "Tường Băng", move: 99, defense: 0 },
  glacier: { name: "Băng hà", move: 3, defense: 0.25 },
};

export const ZONE_NAME = { cold: "Hàn đới", temp: "Ôn đới", trop: "Nhiệt đới" } as const;
export const REGION_NAME = { west: "Lục địa Tây", east: "Lục địa Đông", isl: "Quần đảo Đá Lửa" } as const;

/** Renewable reserves regrow by this share of their cap each tick (§2.1). */
export const REGEN: Partial<Record<ResKey, number>> = { game: 0.10, fish: 0.08, wood: 0.05, plants: 0.15, reeds: 0.10, herbs: 0.08, horse: 0.06 };
/** Ores are invisible to AIs until they own the capability below (§2.1). */
export const HIDDEN_ORES: ResKey[] = ["copper", "tin", "iron"];
export const ORE_SENSE_CAP = "nhận-biết-khoáng";

export const RES_NAME: Record<string, string> = {
  game: "thú săn", plants: "cây dại", fish: "cá", wood: "gỗ", stone: "đá", flint: "đá lửa", clay: "đất sét",
  salt: "muối", reeds: "sậy", copper: "quặng đồng", tin: "quặng thiếc", iron: "sắt", herbs: "thảo dược", boat: "thuyền",
  coal: "than đá", oil: "dầu mỏ", sulfur: "lưu huỳnh", horse: "ngựa",
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
/** §4.2 Growth is logistic toward housing: +floor(pop × rate × (1 − pop/housing)), at least `min`,
 *  when the food left after eating is ≥ `surplus` of need. Mutable so tools/simulate.ts --variant can tune it. */
export const GROWTH = { rate: 0.08, surplus: 0.2, min: 1 };
/** §4.2 People by age and sex. A turn is ten years, so the groups move up one step a turn:
 *  children (0–9), youths (10–19), adults (20–49, a 30-year group: a third grows old each turn), elders (50+). */
export const DEMO = {
  ages: ["trẻ em", "thiếu niên", "trưởng thành", "người già"],
  /** Share of each group in a settled people (men and women alike); births are scaled to this structure. */
  start: [0.19, 0.19, 0.44, 0.18],
  /** Food eaten and work done per person, by group. */
  eat: [0.6, 1, 1.15, 1],
  work: [0.1, 0.8, 1, 0.5],
  /** Each turn: a third of the adults grow old; elders die of age; adults die of hardship. */
  ageOut: 1 / 3, oldDeath: 0.8, adultDeath: 0.1,
  /** Births need partners: full rate while adult men are at least `pairing` × adult women. */
  pairing: 0.5,
  /** Children who die before they grow (already in the base rate); medicine and herbs cut it, no fresh water raises it. */
  infant: 0.3, dryInfant: 1.5,
  /** Herbs used per birth to save `herbSave` of the infants who would die. */
  herbsPerBirth: 0.2, herbSave: 0.3,
  /** Elders keep the old knowledge (§5.5 lost knowledge needs fewer than `keepers`) and teach: +research up to `rpMax`. */
  keepers: 3, rpPerShare: 0.5, rpMax: 0.1,
  /** The family customs a nation's AI chooses (action family_policy): `fert` scales the growth,
   *  `keep` the births that replace the dead (below 1 the people slowly shrinks). */
  births: {
    encourage: { name: "khuyến khích sinh", fert: 1.3, keep: 1, womenWork: 0.85 },
    neutral: { name: "tự nhiên", fert: 1, keep: 1, womenWork: 0.95 },
    limit: { name: "hạn chế sinh", fert: 0.4, keep: 0.9, womenWork: 1 },
  } as Record<string, { name: string; fert: number; keep: number; womenWork: number }>,
  fighters: { men: "chỉ đàn ông ra trận", all: "mọi người lớn ra trận" } as Record<string, string>,
  /** Capability of a marriage custom: births ×marriage, stability +marriageStability a turn. */
  marriageCap: "hôn-nhân", marriage: 1.1, marriageStability: 0.5,
};

/** §4.5 Discontent and schism: bad government breeds a faction that leaves to found its own nation,
 *  once the Watcher grants it a mind (an AI model) of its own. */
export const SCHISM = {
  /** Discontent (0–100) grows each turn by (threshold − stability) / divisor while stability is below threshold,
   *  and by `famine` in a famine, `riot` in a riot, `overreach` per tile over the limit; it fades by `fade` at stability ≥ calm. */
  threshold: 35, divisor: 3, famine: 10, riot: 25, overreach: 2, calm: 60, fade: 10,
  /** A faction forms at 100, in a people of at least `minPop`, `cooldown` turns after the last one. */
  minPop: 60, cooldown: 30,
  /** The share of the people that goes: from share[0] to share[1] as discontent ran higher. */
  share: [0.2, 0.35] as [number, number],
  /** The Watcher answers within `waitTicks` turns, or the faction gives up (stability −giveUp, discontent halved). */
  waitTicks: 10, giveUp: 5,
  /** Where they go: free land at least `clearOfAll` tiles from every nation, `near`–`far` tiles from the old land. */
  clearOfAll: 3, near: 5, far: 16,
  /** Not let go (or no answer): they ask a nation the old one knows, with room, to take them in; it has
   *  `askTicks` turns to accept (accept_migrants), or they go home bitter. */
  askTicks: 2,
  /** The old nation once they are gone: stability +calmAfter; the new one starts at `startStability`. */
  calmAfter: 15, startStability: 70,
};
/** §2.7 A connected realm: goods reach the stores along a way (a walk of at most `walk` tiles over one's own land,
 *  a road, or water between piers). A centre cut off from the capital yields `isolatedYield` and adds
 *  `isolatedDiscontent` a turn, once `grace` turns have passed since it was founded (time to build its road);
 *  land more than `reach` tiles from any centre with no road on or beside it yields `farYield`. */
export const CONNECT = { walk: 6, reach: 4, isolatedYield: 0.7, farYield: 0.9, isolatedDiscontent: 2, grace: 10 };
/** §7.9 Living borders between nations whose lands touch (or lie within `near` tiles). */
export const BORDER = {
  near: 3,
  /** Tension (0–100) a turn: + friction per border tile (at most frictionMax), − fade, − calm for each treaty,
   *  each trade (tradeCalm; the border market only marketCalm) and a shared language. */
  friction: 0.5, frictionMax: 5, fade: 1,
  treatyCalm: { non_aggression: 3, peace: 4, passage: 1.5, alliance: 6, vassal: 5 } as Record<string, number>,
  tradeCalm: 3, marketCalm: 1, languageCalm: 1,
  /** Incidents: chance a turn = tension / incidentDiv (at most incidentMax); each raises the tension and may give the victim a just cause for `causeTicks` turns. */
  incidentDiv: 250, incidentMax: 0.3, causeTicks: 6, poach: 30, crossers: 4,
  rise: { poach: 8, brawl: 15, crossing: 5 } as Record<string, number>,
  /** At `dispute` both sides have a just cause for war and lose `disputeStability` a turn. */
  dispute: 70, disputeStability: 1,
  /** The border market: while tension < marketBelow, up to `marketValue` worth of goods a side, from a good one has
   *  beyond what it keeps (food: two turns of eating; others: marketKeep) to a nation holding less than marketLack of it. */
  marketBelow: 60, marketValue: 12, marketKeep: 20, marketLack: 5,
};
/** §3.2 Every turn a ruler gives at least one order: from the `after`-th idle turn in a row, stability −`stability` a turn. */
export const IDLE = { after: 2, stability: 2 };
/** §4.2 Hamlets: families also live out on the land. Each land tile of the nation (not a centre) houses
 *  this many people by terrain; at most `max` + `perEra` × era in all. Water houses no one. */
export const HAMLET = {
  people: { grass: 3, coast: 3, forest: 2, taiga: 2, jungle: 2, hill: 2, swamp: 1, desert: 1, tundra: 1, glacier: 1, mountain: 0, icewall: 0, ocean: 0, shallow: 0 } as Record<string, number>,
  /** A river tile houses this many more. */
  river: 1,
  max: 40, perEra: 20,
};
/** §4.2 Buildings that give housing (tents, open-invention housing): at most `perCentre` per centre (capital + each settlement). */
export const HOUSING = { perCentre: 3 };

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
  flint: "nhặt đá lửa", clay: "lấy đất sét", mine: "khai mỏ", craft: "chế tác", build: "xây dựng", research: "nghiên cứu", warrior: "chiến binh",
};
/** §4.1 Food spoilage; each pottery in stock cuts it by `potteryEach` (at most `potteryMax` in all). */
export const SPOILAGE = { food: 0.30, hide: 0.05, min: 0.05, potteryEach: 0.005, potteryMax: 0.05 };
export const MAX_ROLE_BONUS = 1.5; // §5.7 +150% cap in the stone age

// §3.2 Action points
export function apFor(population: number, bonus: number): number {
  return Math.min(12, 3 + Math.floor(population / 50) + bonus);
}
export const AP_COST: Record<string, number> = {
  appoint_official: 1, dismiss_official: 0, reward_official: 0,
  found_nation: 0, accept_migrants: 1, build: 1, research: 1, explore: 1, claim_tile: 2, abandon_tile: 0, build_road: 1, family_policy: 1, plant_spy: 2, petition: 1,
  propose_invention: 2, found_settlement: 3, rename_nation: 3, sabotage: 2, steal_tech: 2, incite: 2,
  message: 1, trade_offer: 1, accept_trade: 1, treaty: 2, accept_treaty: 2, break_treaty: 2,
  declare_war: 2, declare_independence: 2, attack: 1, raid: 1, clear_wild: 2,
  quarantine: 1,
};
// §10.5 Petitions
export const PETITION = { categories: ["luật", "tài nguyên", "vùng đất", "phát minh", "khác"], titleMax: 80, textMax: 600, reasonMax: 300, everyTicks: 10, maxPending: 3 };
// Actions written in the rulebook that this engine version does not run yet.
export const NOT_YET: Record<string, string> = {
  move_army: "§7.4 (dùng attack/raid)",
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
/** §7.3 Trade travels a real road: overland with porters, or by water with boats (rivers and shallow sea). */
export const TRADE = {
  offerTicks: 2, maxQty: 500,
  /** Lands this close trade over the border at once. */
  nearDistance: 3,
  /** Road cost per turn (terrain move cost: grass 1, forest 2, jungle 3…), and water tiles per turn. */
  landSpeed: 6, waterSpeed: 14,
  /** What one porter or one boat carries; porters come from the workers, at most `porterShare` of them. */
  porterLoad: 5, boatLoad: 15, porterShare: 0.25,
  /** Food lost per turn on the way. */
  landSpoil: 0.3, waterSpoil: 0.15,
  /** Crossing a third nation's land without a passage or alliance treaty: it takes this share of every good. */
  toll: 0.1,
  /** A caravan within `hordeReach` of a barbarian camp: hordeChance × strength/40 (at most 0.5) a turn to lose `hordeLoss`. */
  hordeReach: 8, hordeChance: 0.12, hordeLoss: 0.5,
  /** Boats at sea (shallow water): a storm sinks one boat and `stormLoss` of the goods. */
  stormChance: 0.04, stormLoss: 0.3,
};
/** §2.1 Rivers: reserves on their banks, silt, fresh water, salmon runs; and with boats, a road. */
export const RIVER = {
  /** Extra reserves on river tiles; flint gravel only within `flintNear` tiles of hills or mountains (the upper course). */
  reeds: 40, plants: 20, flint: 25, flintNear: 3,
  /** Fields on a river tile give +25%, on a delta +50%. */
  fieldBonus: 0.25, deltaBonus: 0.5,
  /** A capital with no river, swamp, spring or well within `waterReach` tiles grows ×dryGrowth and catches plague ×dryPlague. */
  waterReach: 2, dryGrowth: 0.75, dryPlague: 1.5,
  /** Fish run: chance a turn with river land; up to `runTiles` river tiles get `runFish` fish. */
  runChance: 0.05, runFish: 80, runTiles: 3,
  /** Explorers with boats spend half a step on a river tile. */
  exploreStep: 0.5,
  /** A pier within this many tiles lets your attacks cross the river (the defender loses the river bonus) and reach one tile further over water. */
  pierReach: 3,
};

// §7.4 War
// §2.5 Roads on land, sea lanes on water. A level opens with its era; the materials are paid when the
// road is ordered and the builders' spare work lays it, tile by tile. A road belongs to its tile:
// it stays when the tile changes hands, and anyone's caravans may use it.
export interface RoadLevel {
  name: string; lane: string;
  /** Index into ERA_TABLE. */
  era: number;
  /** Builder work per tile. */
  work: number;
  cost: Record<string, number>; laneCost: Record<string, number>;
  /** What a step on it costs, as a share of the terrain's own cost. */
  move: number;
  /** Robbers and storms strike this much less often on it. */
  safety: number;
}
export const ROADS = {
  levels: [
    { name: "Đường mòn", lane: "Luồng lạch cắm sào", era: 0, work: 2, cost: { wood: 1 }, laneCost: { wood: 2 }, move: 0.6, safety: 0.15 },
    { name: "Đường đất nện", lane: "Hải đạo có phao tiêu", era: 2, work: 4, cost: { wood: 1, stone: 2 }, laneCost: { wood: 3, rope: 1 }, move: 0.4, safety: 0.3 },
    { name: "Đường lát đá", lane: "Hải đạo có hải đăng", era: 4, work: 8, cost: { stone: 5 }, laneCost: { stone: 6, wood: 2 }, move: 0.25, safety: 0.5 },
  ] as RoadLevel[],
  /** Tiles one build_road order may lay. */
  maxPerOrder: 12,
  /** A road through the wilds (unclaimed land or sea) must stay within this many tiles of your territory. */
  wildReach: 4,
  /** A road over a mountain is a pass: walking it costs this, before the level's share. */
  passMove: 4,
  /** Every `tilesPerLimit` road tiles joined to a centre add one tile to govern (at most `maxLimit`);
   *  a settlement joined to the capital by road (through your land, the wilds or a treaty partner's) is not sprawl (§4.4). */
  tilesPerLimit: 4, maxLimit: 10,
  /** A flood takes one level off at most `floodTiles` roads on the wet tiles; an earthquake off every road within its radius. */
  floodTiles: 3,
};

// §2.6 Territorial waters: shallow and deep sea are held like land.
export const SEA = {
  /** A water tile counts this much against the tile limit (§2.3). */
  limitWeight: 1 / 3,
  /** Water that does not touch your land must lie within this many tiles of one of your piers. */
  pierReach: 4,
  /** Storms on deep water are this much more likely than on shallow water. */
  oceanStorm: 2,
  /** An attack on a water tile needs one boat per this many warriors. */
  warriorsPerBoat: 5,
};

export const WAR = {
  reach: 2, reachSail: 3, weariAfter: 5, winLoss: [0.05, 0.15], loseLoss: [0.2, 0.4], prisoners: 0.5,
  raidShare: 0.3, carryPerWarrior: 5, militiaShare: 0.1, militiaStrength: 0.5, luck: [0.8, 1.2],
  weapon: { bow: 0.6, spear: 0.5 } as Record<string, number>, independenceAfter: 10, unprovokedPenalty: 5,
  /** Defenders fight at home: strength × (1 + home + terrain + walls + river). */
  home: 0.5,
  /** Front: one attacker sends at most frontBase + frontPerTile × (its tiles next to the target) warriors at one tile per tick. */
  frontBase: 5, frontPerTile: 5,
  /** Taking a tile carries off lootShare of each good in the loser's stock (at most carryPerWarrior per warrior); a centre gives centreLoot, uncapped. */
  lootShare: 0.15, centreLoot: 0.5,
  /** A capital or settlement falls once the attacker holds this many of its land neighbours (all of them if it has fewer). */
  centreFallsAt: 4,
};

// §2.3 Settlements
/** `people` settlers move to the new centre: the nation keeps them, the move costs `stability`.
 *  Paid with `materials` units of goods that do not spoil, any mix of `goods` (the engine takes from the larger stock first).
 *  Every settlement beyond `freeCentres` costs `sprawlStability` stability per tick (§4.4). */
export const SETTLEMENT = {
  cap: "tổ-chức", people: 10, minPopulation: 50, materials: 25, goods: ["wood", "stone"], stability: 5, minDist: 6, maxDist: 10, housing: 10, cutoffTicks: 5,
  freeCentres: 3, sprawlStability: 1,
};

// §5.6 Era gates
export const BRONZE_CAPS = ["nhiệt-cao", "nhận-biết-khoáng", "chứa", "luyện-đồng"];

// §2.3 Territory. Tile limit = base + floor(perSqrt × √population) + invention bonuses + perSettlement × settlements.
export const TILES = { base: 7, perSqrt: 1, perSettlement: 3 };
export const CLAIM_FOOD = 5;

/** §5.5 Research pace. RP per tick = researchers^exponent (more hands, less from each);
 *  each level of depth beyond `depthFree` adds `depthStep` to the cost, seed tree and open inventions alike. */
export const RESEARCH = { exponent: 0.85, depthFree: 1, depthStep: 0.75 };
export function depthCostMult(depth: number): number {
  return 1 + RESEARCH.depthStep * Math.max(0, depth - RESEARCH.depthFree);
}

// §5.2 Seed tree. Effects are read by engine.mods().
export interface Invention {
  id: string;
  name: string;
  prereqs: string[];
  /** §5.6 Capabilities the nation must hold, from any invention (the frame's prerequisites), and the depth they stand for. */
  needsCaps?: string[];
  frameDepth?: number;
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
    // §5.3 open with the eras (EFFECT_ERA)
    range?: number; // attack reach +tiles
    transport?: number; // caravans carry and travel +share
    growth?: number; // population growth +share
    medicine?: number; // plague chance and deaths −share
    housingSlots?: number; // housing buildings per centre +n
    explore?: number; // expedition range +tiles
    officials?: number; // official slots +n
  };
  desc: string;
  /** Open inventions only (§5): who proposed it, when, depth and power points. */
  custom?: { by: number; tick: number; depth: number; power: number; description: string; judge: string };
}

/** The cost of a frame invention at its depth: 1.5 × a nation's own invention of that depth with 6 power points (catalog.costFor). */
function frameRp(depth: number): number {
  const g = depth <= 8 ? Math.pow(1.4, depth) : Math.pow(1.4, 8) * (1 + 0.15 * (depth - 8));
  return Math.ceil(1.5 * 15 * g * 1.6 / 5) * 5;
}
// [id, name, prerequisite inventions (always in the book), capabilities needed (from any invention: a nation's
//  own way there counts), depth, capabilities given, effects, description]
const FRAME: Array<[string, string, string[], string[], number, string[], Invention["effects"], string]> = [
  ["K1", "Lò nung nhiệt cao", ["P13", "P2"], [], 3, ["nhiệt-cao"], { role: { craft: 0.05 } }, "Lò đất có ống thổi đạt nhiệt đủ nung chảy quặng."],
  ["K2", "Nhận biết quặng", ["P10", "P12"], [], 3, ["nhận-biết-khoáng"], {}, "Biết màu, vân và sức nặng của đá chứa kim loại; thấy được quặng đồng, thiếc, sắt."],
  ["K3", "Nấu đồng từ quặng", [], ["nhiệt-cao", "nhận-biết-khoáng"], 4, ["luyện-đồng"], { role: { mine: 0.1 } }, "Nấu quặng đồng trong lò nhiệt cao, đúc công cụ đồng."],
  ["K4", "Rèn sắt từ quặng", [], ["luyện-đồng"], 5, ["luyện-sắt"], { combat: 0.05 }, "Lò rèn đủ nóng để khử quặng sắt, rèn thành công cụ và vũ khí."],
  ["K5", "Chữ viết", ["P12", "P18"], [], 4, ["chữ-viết"], { rp: 0.05 }, "Ký hiệu thành chữ ghi được lời nói, sổ sách và luật."],
  ["K6", "Tiền tệ", ["P18"], ["luyện-đồng"], 5, ["tiền-tệ"], { transport: 0.05 }, "Thỏi kim loại có dấu làm vật ngang giá cho mọi cuộc trao đổi."],
  ["K7", "Luật pháp", ["P4"], ["chữ-viết"], 5, ["luật-pháp"], { stabilityPerTick: 0.5 }, "Luật thành văn và người phân xử chung."],
  ["K8", "Thép", [], ["luyện-sắt", "nhiệt-cao"], 6, ["thép"], { combat: 0.05 }, "Sắt nung với than và tôi trong nước, cứng và dẻo hơn."],
  ["K9", "Cối xay nước", ["P14"], ["luyện-sắt"], 6, ["cối-xay"], { role: { farm: 0.1 } }, "Bánh xe nước quay cối đá xay hạt."],
  ["K10", "Thành lũy đá", [], ["luật-pháp", "luyện-sắt"], 6, ["thành-lũy"], { combat: 0.05 }, "Tường đá dày có tháp canh quanh các trung tâm."],
  ["K11", "Khoáng học", [], ["nhận-biết-khoáng", "chữ-viết"], 5, ["khoáng-học"], { reveal: ["sulfur", "coal"] }, "Ghi chép các loại đá và mỏ; thấy được lưu huỳnh và than đá."],
  ["K12", "In ấn", [], ["chữ-viết", "thép"], 7, ["in-ấn"], { rp: 0.1 }, "Khuôn chữ kim loại in sách hàng loạt."],
  ["K13", "Thuốc súng", [], ["thép", "khoáng-học"], 7, ["thuốc-súng"], { combat: 0.1 }, "Lưu huỳnh, than và diêm tiêu trộn thành chất nổ."],
  ["K14", "Hàng hải viễn dương", ["P16"], ["thép", "chữ-viết"], 7, ["hàng-hải-viễn-dương"], { move: ["ocean"] }, "Tàu thân gỗ khung thép, la bàn và hải đồ vượt biển sâu."],
  ["K15", "Luyện cốc", [], ["khoáng-học", "thép"], 7, ["luyện-cốc"], { role: { mine: 0.05 } }, "Nung than đá thành than cốc cho lò cao."],
  ["K16", "Máy hơi nước", [], ["luyện-cốc", "in-ấn"], 8, ["máy-hơi-nước"], { role: { craft: 0.1 } }, "Nồi hơi thép đốt than đẩy piston."],
  ["K17", "Đường sắt", [], ["máy-hơi-nước", "thép"], 9, ["đường-sắt"], { transport: 0.2 }, "Đầu máy hơi nước chạy trên ray thép."],
  ["K18", "Điện", [], ["máy-hơi-nước", "luyện-đồng"], 9, ["điện"], { rp: 0.1 }, "Máy phát quay bằng hơi nước, dây đồng dẫn điện."],
  ["K19", "Thăm dò dầu mỏ", [], ["máy-hơi-nước", "khoáng-học"], 9, ["thăm-dò-dầu"], { reveal: ["oil"] }, "Khoan sâu tìm dầu dưới đất; thấy được dầu mỏ."],
  ["K20", "Lọc dầu", [], ["thăm-dò-dầu", "luyện-cốc"], 10, ["lọc-dầu"], {}, "Chưng cất dầu thô thành nhiên liệu."],
  ["K21", "Động cơ đốt trong", [], ["lọc-dầu", "thép"], 11, ["động-cơ-đốt-trong"], { transport: 0.1 }, "Nhiên liệu cháy trong xi lanh, nhỏ và mạnh hơn máy hơi nước."],
  ["K22", "Vô tuyến", [], ["điện", "in-ấn"], 10, ["vô-tuyến"], { explore: 4 }, "Sóng điện từ truyền tin không cần dây."],
  ["K23", "Hàng không", [], ["động-cơ-đốt-trong", "điện"], 12, ["hàng-không"], { explore: 6, transport: 0.1 }, "Khung nhẹ, cánh và động cơ đưa người lên trời."],
  ["K24", "Tên lửa", [], ["hàng-không", "thuốc-súng"], 13, ["tên-lửa"], { range: 2 }, "Nhiên liệu đẩy phản lực ra khỏi khí quyển."],
];

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
  { id: "P13", name: "Gốm", prereqs: ["P2"], rp: 80, caps: ["chứa"], env: { res: "clay" }, effects: { spoilage: 0.15, unlocks: ["kiln", "pottery"] }, desc: "Lò gốm; hư lương thực 30% → 15%; mỗi món gốm trong kho −0,5 điểm % (tối đa −5)." },
  { id: "P14", name: "Trồng trọt sơ khai", prereqs: ["P1", "foraging"], rp: 120, caps: ["trồng-trọt"], env: { terrains: ["grass", "coast"], river: true }, effects: { unlocks: ["field"] }, desc: "Ruộng: 6 nông dân × 2 lương thực." },
  { id: "P15", name: "Thuần dưỡng", prereqs: ["P3", "P6"], rp: 120, caps: ["thuần-dưỡng"], effects: { unlocks: ["pen"] }, desc: "Chuồng nuôi thú." },
  { id: "P16", name: "Thuyền độc mộc", prereqs: ["P10", "fire"], rp: 90, caps: ["đi-nước"], effects: { role: { fish: 0.2 } }, desc: "Đi trên sông, biển ven bờ; đánh cá +20%." },
  { id: "P17", name: "Dệt", prereqs: ["P3", "P14"], rp: 100, caps: ["dệt"], effects: { unlocks: ["cloth"] }, desc: "Dệt vải." },
  { id: "P18", name: "Đếm", prereqs: ["P12", "P14"], rp: 100, caps: ["đếm"], effects: { ap: 1 }, desc: "+1 AP; sai số ước lượng tình báo giảm một nửa." },
  // §5.6 The frame of the open world: one plain invention for each capability an era gate asks for, so the
  // world can always go on. They cost half again what a nation's own invention of that depth would, and do
  // little besides the capability: an invention of one's own is cheaper and stronger.
  ...FRAME.map(([id, name, prereqs, needsCaps, depth, caps, effects, desc]) => ({ id, name, prereqs, needsCaps, frameDepth: depth, rp: frameRp(depth), caps, effects, desc })),
];
export const INVENTION_BY_ID: Record<string, Invention> = Object.fromEntries(INVENTIONS.map(v => [v.id, v]));

// §6.1 Buildings
export interface BuildingEffect { housing?: number; stability?: number; spoilage?: number; craftSlots?: number; defense?: number; farmSlots?: number; farmFood?: number; water?: number; port?: number }
export interface BuildingDef {
  type: string; name: string; needs: string; cost: Record<string, number>; work: number;
  perTile?: boolean; terrains?: Terrain[]; river?: boolean; max?: number; desc: string;
  effect: BuildingEffect;
}
export const BUILDINGS: BuildingDef[] = [
  { type: "workshop", name: "Bãi chế tác", needs: "stone_tools", cost: { stone: 5 }, work: 4, desc: "Cho 4 thợ chế tác làm việc.", effect: { craftSlots: 4 } },
  { type: "pit", name: "Hố trữ", needs: "stone_tools", cost: { stone: 5 }, work: 3, max: 2, desc: "Hư lương thực −5%.", effect: { spoilage: 0.05 } },
  { type: "tent", name: "Lều", needs: "P8", cost: { wood: 6, hide: 4, rope: 2 }, work: 4, desc: "+10 chỗ ở; mỗi trung tâm tối đa 3 công trình có chỗ ở.", effect: { housing: 10 } },
  { type: "altar", name: "Bàn thờ", needs: "P5", cost: { stone: 10 }, work: 6, max: 1, desc: "+1 ổn định mỗi lượt.", effect: { stability: 1 } },
  { type: "palisade", name: "Hàng rào gỗ", needs: "P10", cost: { wood: 15, rope: 3 }, work: 6, desc: "Phòng thủ ô +40%.", effect: { defense: 0.4 } },
  { type: "field", name: "Ruộng", needs: "P14", cost: {}, work: 8, perTile: true, terrains: ["grass", "coast"], river: true, desc: "6 nông dân × 2 lương thực.", effect: { farmSlots: 6, farmFood: 2 } },
  { type: "pen", name: "Chuồng", needs: "P15", cost: { wood: 10, rope: 4 }, work: 6, perTile: true, desc: "2 người chăn × 2 lương thực.", effect: { farmSlots: 2, farmFood: 2 } },
  { type: "well", name: "Giếng", needs: "stone_tools", cost: { stone: 10, wood: 4 }, work: 5, desc: "Nước ngọt cho thủ đô xa sông (trong vòng 2 ô).", effect: { water: 1 } },
  { type: "pier", name: "Bến thuyền", needs: "P16", cost: { wood: 12, rope: 2 }, work: 5, perTile: true, terrains: ["coast"], river: true, desc: "Thuyền ra vào: buôn bằng đường thủy; quân có thuyền vượt sông.", effect: { port: 1 } },
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
  { id: "boat", name: "Thuyền độc mộc", needs: "P16", input: { wood: 6, rope: 1 }, output: { boat: 1 }, work: 3, building: "workshop" },
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
  food: 1, fiber: 1, hide: 2, bone: 1, wood: 0.5, stone: 0.3, flint: 1, clay: 0.5, salt: 2, reeds: 0.5, herbs: 2,
  copper: 3, tin: 4, iron: 4, boat: 8, coal: 2, oil: 4, sulfur: 3, horse: 6, stone_tool: 2, blade: 3, rope: 2, hide_coat: 8, spear: 6, bow: 8, axe: 5, pottery: 2, cloth: 5,
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
/** The land the map is painted with (web/app.js TERRAIN): a flag's main colour must stand apart from it to be seen. */
export const LAND_COLORS: Record<string, string> = {
  "biển sâu": "#1d4a66", "biển nông": "#2d6c8c", "đồng cỏ": "#9dbb68", "rừng": "#4e7d45", "rừng lá kim": "#3d6450", "rừng rậm": "#2c6a3a",
  "đồi": "#b39a63", "núi": "#8b8179", "ven biển": "#d3cb9b", "sa mạc": "#dcc48a", "lãnh nguyên": "#b7c2b4", "băng": "#eef7fc",
};
export const FLAG_LAND_DELTA_E = 15;
/** §2.2 Renaming: only in the first ticks after entering a new era, once per era change. */
export const RENAME = { windowTicks: 5, stability: 10 };

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

// §9.4 Threats of the wild
/** Beasts: danger 0–5 per tile from its terrain, more near a horde's wilderness, half on settled land. */
export const BEASTS = {
  danger: { jungle: 3, forest: 2, taiga: 2, mountain: 2, glacier: 2, swamp: 2, hill: 1, grass: 1, tundra: 1 } as Partial<Record<Terrain, number>>,
  name: { jungle: "hổ", forest: "sói và gấu", taiga: "sói", mountain: "báo tuyết", glacier: "gấu trắng", swamp: "cá sấu", hill: "linh cẩu", grass: "sói đồng", tundra: "sói tuyết" } as Partial<Record<Terrain, string>>,
  wildBonus: 2, wildRadius: 6,
  /** Chance per tick of an attack = chance × average danger of the land the hunters and gatherers work. */
  chance: 0.05,
  /** Share of hunters (and a quarter of gatherers) killed in an attack; halved when every hunter is armed. */
  share: 0.08, armed: 0.5,
  /** Explorers: chance to be lost per person, + per point of the worst danger on their path. */
  explorerBase: 0.02, explorerPerDanger: 0.015,
};
/** Barbarian hordes live in the wilderness (§12.4): they grow, raid nearby nations, and can be driven out. */
export const HORDES = {
  start: 10, growth: 0.4, capBase: 20, capPerTick: 0.12, capMax: 70,
  /** Raids begin after `grace` ticks, on nations of at least `minPop` people (worth robbing) with land within `range` tiles. */
  grace: 20, range: 16, minPop: 40,
  /** Chance per tick = raidChance × strength / 40 (at most raidMax), against the nearest nation in range. */
  raidChance: 0.04, raidMax: 0.35,
  /** A raiding party: at most partyBase + partyPerPop × the target's people, never more than the horde. */
  partyBase: 8, partyPerPop: 0.4,
  /** Raided at home, the whole village fights: `militia` of the workers join the warriors at full strength. */
  militia: 0.3,
  /** A raid that wins carries off `loot` of food and `lootGoods` of other goods, kills `kill` of the people. */
  loot: 0.25, lootGoods: 0.1, kill: 0.04, stability: 5, emboldened: 1.1,
  /** A raid beaten off costs the horde `repelled` of its strength. */
  repelled: 0.5,
  /** clear_wild (AP in AP_COST): reach in tiles from the nation's land, and how long until a beaten horde comes back. */
  clearReach: 8, returnTicks: 40, clearReputation: 5, clearStability: 3,
  names: ["Man Tro Xám", "Rợ Nanh Sói", "Bộ Mặt Sơn", "Rợ Lửa Đen", "Bầy Đầu Lâu", "Man Sừng Hươu", "Rợ Gió Bấc", "Bộ Răng Đá", "Man Đầm Lầy", "Rợ Lông Quạ", "Bộ Xương Trắng", "Man Hang Tối"],
};
/** Floods on rivers and swamps; a delta floods twice as often. The silt makes fields richer for a while. */
export const FLOOD = { chance: 0.03, deltaMult: 2, foodLoss: 0.1, fertileTicks: 2, fertile: 0.2 };
/** Earthquakes on hills and mountains: buildings within `radius` of the epicentre fall; ore may be laid bare. */
export const QUAKE = { chance: 0.006, radius: 3, deaths: 0.02, oreChance: 0.3, ore: 40 };
/** The ice wall's wind (§12.1): land within `reach` tiles of it has harsher, more frequent winters, even in the tropics. */
export const ICE_WIND = { reach: 4, winterMult: 1.5, deathMult: 1.5, tropicChance: 0.03 };
/** Herbs: gatherers bring in `gather` herbs per unit of plants where herbs grow; one herb per `perPeople` people halves plague deaths. */
export const HERBS = { gather: 0.08, perPeople: 10, plagueCut: 0.5 };
/** §9.5 Contagion and quarantine. An outbreak leaves a people contagious for `sickTurns` turns (the turn it
 *  strikes and the next), then immune `immuneTurns` more. Each contagious turn it may pass the plague to each
 *  nation whose land touches its own (`border`), and to each it has a caravan with on the road or a border market
 *  with this turn (`trade` each); × (1 − the receiver's medicine), and never through a quarantine. A quarantine
 *  (action, 1–`quarantineMax` turns) shuts the borders: no plague in or out, no border market, no trade or caravans;
 *  tension +`quarantineTension` a turn with every bordering neighbour, stability −`quarantineStability` a turn;
 *  a sick people in quarantine earns +`selfQuarantineRep` reputation a contagious turn. */
export const CONTAGION = { sickTurns: 2, immuneTurns: 3, border: 0.25, trade: 0.15, quarantineMax: 5, quarantineTension: 2, quarantineStability: 1, selfQuarantineRep: 1 };

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
/** §7.8 Spy operations: need writing and an active spy; one per spy per tick; acting doubles that tick's detection chance. */
export const SPY_OPS = { needsCap: "ghi-chép", detectMult: 2, disableTicks: 3, stealDiscount: 0.5, incite: 5 };

export const ERAS = { paleo: "Đồ Đá Cũ", neo: "Đồ Đá Mới", bronze: "Đồ Đồng" };

// §5.6 An open world: ten eras. A nation crosses a gate (one per turn, never back) when it holds the
// capabilities (from inventions, mostly its own open ones), the people, and the resource (owned land
// that holds it, or that much in store). Capabilities named here are the shared words of the world:
// a nation proposing an invention may claim one (the judge decides whether its prerequisites justify it).
export interface EraDef { id: string; name: string; caps: string[]; anyCap?: string[]; pop: number; res?: string; settlements?: number; desc: string }
export const ERA_TABLE: EraDef[] = [
  { id: "paleo", name: "Đồ Đá Cũ", caps: [], pop: 0, desc: "Săn bắt, hái lượm, lửa." },
  { id: "neo", name: "Đồ Đá Mới", caps: ["mài"], anyCap: ["trồng-trọt", "thuần-dưỡng"], pop: 50, desc: "Đá mài, trồng trọt hoặc chăn nuôi." },
  { id: "bronze", name: "Đồ Đồng", caps: ["nhiệt-cao", "nhận-biết-khoáng", "chứa", "luyện-đồng"], pop: 0, res: "copper", desc: "Lò nhiệt cao, luyện đồng." },
  { id: "iron", name: "Đồ Sắt", caps: ["luyện-sắt"], pop: 100, res: "iron", desc: "Lò rèn sắt." },
  { id: "classical", name: "Cổ Đại", caps: ["chữ-viết", "tiền-tệ", "luật-pháp"], pop: 150, settlements: 1, desc: "Chữ viết, tiền, luật thành văn." },
  { id: "medieval", name: "Trung Đại", caps: ["thép", "cối-xay", "thành-lũy"], pop: 250, settlements: 2, desc: "Thép, cối xay nước/gió, thành lũy đá." },
  { id: "renaissance", name: "Cận Đại", caps: ["in-ấn", "thuốc-súng", "hàng-hải-viễn-dương"], pop: 400, res: "sulfur", desc: "In ấn, thuốc súng, tàu vượt đại dương." },
  { id: "industrial", name: "Công Nghiệp", caps: ["máy-hơi-nước", "luyện-cốc", "đường-sắt"], pop: 600, res: "coal", desc: "Máy hơi nước, than cốc, đường sắt." },
  { id: "modern", name: "Hiện Đại", caps: ["điện", "động-cơ-đốt-trong", "lọc-dầu"], pop: 900, res: "oil", desc: "Điện, động cơ đốt trong, dầu mỏ." },
  { id: "atomic", name: "Nguyên Tử", caps: ["hàng-không", "vô-tuyến", "tên-lửa"], pop: 1200, desc: "Máy bay, vô tuyến, tên lửa." },
];
export const ERA_INDEX: Record<string, number> = Object.fromEntries(ERA_TABLE.flatMap((e, i) => [[e.name, i], [e.id, i]]));
/** A resource counts for a gate when owned land holds it, or this much is in store (bought or carried). */
export const ERA_RES_STOCK = 20;
/** What each era brings everyone in it: a higher ceiling on trade bonuses, more land to govern,
 *  more homes per centre and, every third era, one more action point. */
export function eraPerks(i: number): { roleCap: number; tiles: number; housingSlots: number; ap: number; officials: number } {
  return { roleCap: 1.5 + 0.5 * i, tiles: 2 * i, housingSlots: Math.floor(i / 2), ap: Math.floor(i / 3), officials: Math.floor(i / 2) };
}

// §2.1 Deep resources: coal, oil and sulfur are hidden until an invention reveals them; wild horses graze open land.
export const DEEP_RES = ["coal", "oil", "sulfur"] as const;
export const HORSES = { regen: 0.06, cap: "thuần-ngựa", huntShare: 0.15 };

// §5.3 Effect kinds that open with the eras (index into ERA_TABLE): a stone-age people cannot propose a railway's effects.
export const EFFECT_ERA: Record<string, number> = {
  growth: 1, transport: 2, explore: 2, range: 4, medicine: 4, officials: 4, housing_slots: 5,
  "move:ocean": 6, "reveal:coal": 3, "reveal:sulfur": 3, "reveal:oil": 7,
};

// §4.6 Officials: a nation hands a field to a person who works it every turn without the ruler's AP.
export interface OfficialDomain { title: string; desc: string; unique: boolean }
export const OFFICIAL_DOMAINS: Record<string, OfficialDomain> = {
  governor: { title: "Bá tước", desc: "giữ một trung tâm (thủ đô hoặc điểm định cư): mỗi lượt tự khai hoang ô tốt nhất quanh đó (2 ô từ tay nghề 3), +1 ô quản lý", unique: false },
  general: { title: "Đại tướng", desc: "chiến đấu và sức thủ tại nhà +4% mỗi bậc tay nghề", unique: true },
  agriculture: { title: "Thượng thư Nông", desc: "hái lượm, săn, đánh cá, nông +5% mỗi bậc; tự xây ruộng khi thiếu ăn", unique: true },
  scholar: { title: "Đại học sĩ", desc: "nghiên cứu +5% mỗi bậc; tự chọn nghiên cứu rẻ nhất khi đang bỏ trống", unique: true },
  merchant: { title: "Tổng quản Thương", desc: "đoàn buôn chở nhiều hơn và đi nhanh hơn 10% mỗi bậc; phí qua đất giảm một nửa", unique: true },
  builder: { title: "Tổng công trình", desc: "xây dựng +8% mỗi bậc; tự dựng lều khi hết chỗ ở và giếng khi thiếu nước", unique: true },
  explorer: { title: "Trưởng đoàn thám hiểm", desc: "mỗi lượt tự đưa 2 người đi thám hiểm theo vòng các hướng; tầm xa +2 ô mỗi bậc", unique: true },
};
export const OFFICIALS = {
  /** Slots: 1 + 1 per 60 people + era perks + invention effects, at most `max`. */
  perPop: 60, max: 10,
  /** Upkeep in food each turn: base + skill. */
  upkeepBase: 1,
  /** Skill 1–5, +1 every `skillEvery` turns in office. */
  skillEvery: 15,
  /** Loyalty 0–100: starts at `start`; below `idle` they do nothing; at 0 they desert (stability −desert). */
  start: 70, idle: 30, desert: 8, dismissStability: 2,
  /** A gift of goods worth this much buys one point of loyalty (reward_official). */
  giftPerPoint: 2,
  /** A governor whose seat lies farther than this from the capital grows restless (−1 loyalty a turn). */
  farSeat: 10,
};

// §2.4 National traits: each nation is born with one character, chosen before the game.
// A strength and a weakness in the same terms as invention effects (added in mods()),
// plus an ethos the nation's AI reads every turn. Tuned with tools/traits.ts.
export interface TraitDef {
  id: string;
  name: string;
  icon: string;
  /** For the Watcher, in Vietnamese. */
  desc: string;
  /** For the nation's AI, in English: who these people are and what they value. */
  ethos: string;
  effects: Invention["effects"];
  /** Extra discount on inventions a known nation already has (§7.5), on top of the best one. */
  diffusion?: number;
  start?: { stability?: number; reputation?: number };
}

export const TRAITS: TraitDef[] = [
  {
    id: "hunters", name: "Thợ săn thảo nguyên", icon: "🏹", desc: "Sống bằng cuộc săn, giỏi theo dấu thú, ít kiên nhẫn với sách vở.",
    ethos: "A people of the hunt. You read tracks, follow herds and prize courage and sharing the kill. Lean on hunting and the wild lands; knowledge comes slower to you.",
    effects: { role: { hunt: 0.1 }, rp: -0.1 },
  },
  {
    id: "sages", name: "Hiền triết", icon: "📜", desc: "Tò mò, quan sát và ghi nhớ; nghiên cứu nhanh nhưng yếu khi đánh nhau.",
    ethos: "A people of questions. You watch the sky, remember everything and honour teachers. Knowledge is your path to greatness; you are poor fighters, so avoid wars you cannot talk your way out of.",
    effects: { rp: 0.08, combat: -0.15 },
  },
  {
    id: "farmers", name: "Nông dân ven sông", icon: "🌾", desc: "Gắn bó với đất và mùa vụ; hái lượm, trồng trọt, đánh cá giỏi nhưng khó cai quản vùng xa.",
    ethos: "A people of the river bank. You know seeds, seasons and floods, and you love settled, fertile land. Feed many mouths and grow; distant lands are hard for you to hold.",
    effects: { role: { gather: 0.15, farm: 0.25, fish: 0.1 }, tiles: -1 },
  },
  {
    id: "artisans", name: "Thợ thủ công", icon: "🔨", desc: "Khéo tay, chế tác và xây dựng giỏi; săn bắt kém.",
    ethos: "A people of makers. You shape stone, wood and clay with pride and judge others by their craft. Build, make tools and goods worth trading; you are clumsy hunters.",
    effects: { role: { craft: 0.4, build: 0.3, hunt: -0.08 } },
  },
  {
    id: "warriors", name: "Chiến binh", icon: "⚔️", desc: "Thượng võ, đánh mạnh; bị láng giềng e dè và ít chú tâm học hỏi.",
    ethos: "A people of warriors. Strength, honour and glory in battle are what you value most. You fight harder than anyone, but neighbours distrust you and learning comes slowly.",
    effects: { combat: 0.25, rp: -0.05 }, start: { reputation: -10 },
  },
  {
    id: "traders", name: "Thương nhân", icon: "🤝", desc: "Giỏi giao thiệp, học nhanh từ nước đã gặp, được tin cậy; yếu về quân sự.",
    ethos: "A people of exchange. You love meeting strangers, trading and learning their ways, and your word is trusted. Seek contact, trade and treaties; you are weak in war.",
    effects: { combat: -0.1 }, diffusion: 0.15, start: { reputation: 10 },
  },
  {
    id: "nomads", name: "Du mục", icon: "🐎", desc: "Quen đi xa và chịu rét; quản được nhiều đất nhưng ngại xây cất.",
    ethos: "A people on the move. You roam wide lands, endure cold winters and feel cramped behind walls. Claim and hold wide territory; building is not your strength.",
    effects: { tiles: 2, winter: 0.75, role: { build: -0.2 } },
  },
  {
    id: "mountain", name: "Người núi đá", icon: "⛏️", desc: "Thạo đá, gỗ, đất sét và quặng; hái lượm kém.",
    ethos: "A people of stone and mountain. You know rock, clay, timber and the veins in the earth, and you value endurance. Gather materials and build strong; foraging is not your gift.",
    effects: { role: { extract: 0.25, gather: -0.15 } },
  },
  {
    id: "mystics", name: "Thầy tế", icon: "🔥", desc: "Đoàn kết quanh lửa thiêng và nghi lễ; ổn định cao, săn bắt kém.",
    ethos: "A people of the sacred fire. Rituals, ancestors and unity guide you; your people rarely turn on each other. Keep harmony and a strong culture; you are poor hunters.",
    effects: { stabilityPerTick: 1, role: { hunt: -0.08 } }, start: { stability: 10 },
  },
];
export const TRAIT_BY_ID: Record<string, TraitDef> = Object.fromEntries(TRAITS.map(t => [t.id, t]));

/** A trait's strengths and weaknesses as short Vietnamese lines, with signs. */
export function traitLines(t: TraitDef): string[] {
  const pct = (v: number) => `${v > 0 ? "+" : "−"}${Math.round(Math.abs(v) * 100)}%`, e = t.effects, out: string[] = [];
  for (const [r, v] of Object.entries(e.role || {})) if (v) out.push(`${r === "extract" ? "khai thác gỗ/đá/đất sét/mỏ" : ROLE_NAME[r as Role] ?? r} ${pct(v)}`);
  if (e.rp) out.push(`nghiên cứu ${pct(e.rp)}`);
  if (e.combat) out.push(`chiến đấu ${pct(e.combat)}`);
  if (e.tiles) out.push(`${e.tiles > 0 ? "+" : "−"}${Math.abs(e.tiles)} ô quản lý`);
  if (e.winter) out.push(`thiệt hại mùa đông ${pct(e.winter - 1)}`);
  if (e.stabilityPerTick) out.push(`${e.stabilityPerTick > 0 ? "+" : ""}${e.stabilityPerTick} ổn định/lượt`);
  if (t.diffusion) out.push(`học từ nước đã gặp rẻ thêm ${Math.round(t.diffusion * 100)}%`);
  if (t.start?.reputation) out.push(`uy tín khởi đầu ${t.start.reputation > 0 ? "+" : "−"}${Math.abs(t.start.reputation)}`);
  if (t.start?.stability) out.push(`ổn định khởi đầu +${t.start.stability}`);
  return out;
}
