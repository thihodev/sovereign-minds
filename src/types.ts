// Shared data shapes. The whole World is plain JSON so it can be saved,
// compressed and replayed.

import type { BuildingDef, Invention, Recipe } from "./rules.ts";

export type Terrain =
  | "ocean" | "shallow" | "grass" | "forest" | "taiga" | "jungle"
  | "hill" | "mountain" | "coast" | "swamp" | "desert" | "tundra"
  /** §12.1 the world's rim: an ice wall nobody can cross, and the glacier land at its foot. */
  | "icewall" | "glacier";
export type Zone = "cold" | "temp" | "trop";
export type Region = "west" | "east" | "isl" | null;

/** Natural reserves that live on tiles. Ores are hidden from AIs. */
export type ResKey =
  | "game" | "plants" | "fish" | "wood" | "stone" | "flint" | "clay"
  | "salt" | "reeds" | "copper" | "tin" | "iron" | "herbs"
  | "coal" | "oil" | "sulfur" | "horse"
  | "honey" | "spice" | "fur" | "amber" | "ochre" | "marble" | "gold" | "silver" | "gems"
  | "shellfish" | "pearl" | "coral" | "whale"
  | "wolf" | "wild_goat" | "aurochs" | "boar" | "junglefowl";

export type Role =
  | "gather" | "hunt" | "fish" | "farm" | "wood" | "stone" | "flint" | "clay" | "mine"
  | "craft" | "build" | "research" | "warrior";

export const ROLES: Role[] = [
  "gather", "hunt", "fish", "farm", "wood", "stone", "flint", "clay", "mine",
  "craft", "build", "research", "warrior",
];

export interface Tile {
  i: number;
  terrain: Terrain;
  zone: Zone;
  region: Region;
  land: boolean;
  elev: number;
  river: boolean;
  delta: boolean;
  /** §2.11 iron lying on the surface of a hill (a nation's idea): it regrows slowly */
  surfaceIron?: true;
  /** Current reserves. */
  res: Partial<Record<ResKey, number>>;
  /** Starting reserves; renewable resources regrow up to this cap. */
  cap: Partial<Record<ResKey, number>>;
  wonder: string | null;
  owner: number; // nation id, -1 = unclaimed
  /** Distance to the ice wall when it is 8 or less (§12.1): its cold wind reaches that far. */
  wall?: number;
  /** §2.5 A road on land, a sea lane on water: 1–3 (none when absent). It stays when the tile changes hands. */
  road?: number;
  /** §2.10 a rich vein of this good: far larger reserves, +50% to whoever works it */
  vein?: ResKey;
}

export interface Flag {
  layout: string;
  colors: string[]; // 2-3 hex colours, first = primary (territory colour)
  symbol: string;
}

export interface Building {
  id: number;
  type: string;
  tile: number;
  progress: number; // work done
  done: boolean;
  hp: number; // 0-100
  /** §7.8 sabotage: a finished building gives no effect while world.tick < disabledUntil. */
  disabledUntil?: number;
}

export type NationStatus = "active" | "asleep" | "error" | "dead";

export interface Nation {
  id: number;
  controller: "ai" | "bot";
  provider: string;
  model: string;
  /** Set when NATIONS names a model ("groq:openai/gpt-oss-120b"); otherwise the provider default. */
  pinnedModel?: string;
  /** Claude nations: the CLI's effort level (low … max); "" = the model's default. */
  effort?: string;
  /** National trait id (§2.4, TRAITS in rules.ts); "" = none (worlds made before v0.4). */
  trait?: string;
  founded: boolean;
  name: string;
  capitalName: string;
  people: string;
  flag: Flag;
  manifesto: string;
  capital: number;
  alive: boolean;
  population: number;
  labor: Record<Role, number>;
  crafts: Record<string, number>;
  stock: Record<string, number>;
  stability: number;
  reputation: number;
  inventions: string[];
  research: { id: string; progress: number } | null;
  buildings: Building[];
  seen: number[];
  met: number[];
  memory: string;
  lastThought: string;
  toolWear: number;
  silentStreak: number;
  riot: boolean;
  era: string;
  /** Tick the nation last changed era (null = never); opens the rename window (§2.2). */
  eraTick: number | null;
  /** Tick of the last rename_nation (null = never): one rename per era change. */
  renameTick: number | null;
  /** How the nation ended, when it has: taken by another, returned to the nation it split from, or perished on its own. */
  fate?: { tick: number; cause: "conquest" | "reunited" | "perished"; by?: number; why?: string };
  /** §4.12 the great people serving the nation, and the turn it last tried to lure one */
  greats?: Great[]; invited?: number;
  /** §4.13 tax rates and this turn's and last turn's books (the coin itself is stock.coin) */
  treasury?: import("./treasury.ts").Treasury;
  /** §6.8 this turn's electric power: made, asked for, the share of the people reached, the centres on the grid */
  power?: import("./power.ts").PowerState;
  /** §7.3b its airports open this turn (tiles), and how many stand shut */
  air?: import("./air.ts").AirState;
  /** §4.14 the royal house: its name and its princes and princesses (those married in carry `from`) */
  house?: string; royals?: import("./royals.ts").Royal[];
  /** §4.5b the ruler's name when one took the throne in a civil war, the houses that ruled, and the turn the last one did */
  ruler?: string; dynasties?: Array<{ tick: number; house: string; leader: string; trait: string; from?: string }>; dynastyTick?: number;
  /** the wound a civil war left: extra discontent a turn until `until` */
  civilScar?: { until: number; rate: number };
  /** §2.13 each centre's tier (village, town, city) and focus, by centre tile */
  urban?: Record<string, import("./urban.ts").Urban>;
  /** §4.15 each order of society's mood, 0–100 */
  classes?: Record<string, number>;
  /** §10.5 petitions the gods took up: the nation's honoured ideas */
  initiatives?: number;
  /** §4.11 the standard of living, worked out each turn (0–100) */
  living?: number;
  /** §2.3 the turn the capital last moved (it may move again CAPITAL_MOVE.every turns later) */
  capitalMoved?: number;
  /** Names the nation used before rename_nation, oldest first (§2.2). */
  formerNames: string[];
  /** Inventions whose secrets a spy stole: researching them costs 50% less (§7.8). */
  stolenTech: string[];
  /** Runtime only: quota sleep is decided by the gateway, never by the engine. */
  status: NationStatus;
  sleepUntil: number;
  sleepBackoffMin: number;
  statusNote: string;
  stats: { calls: number; ok: number; invalid: number; asleepTicks: number; silentTicks: number };
  lastRejected: Array<{ action: string; reason: string }>;
  lastEvents: string[];
  eventTimers: Record<string, number>;
  /** What this nation knows about each other nation (rule 7.8). */
  intel: Record<string, Intel>;
  /** Tick until which declaring war on a nation costs no reputation (caught spy). */
  casusBelli: Record<string, number>;
  /** Extra centres founded with found_settlement (§2.3). */
  /** §4.10 missions out (where: −1 at home, else the host nation's id), and the last festival */
  missions?: Array<{ where: number; priests: number; tick: number; until: number; converts: number }>;
  festival?: { tick: number; until: number };
  /** §6.3 what the nation made and used of each good, remembered over a few turns: [made, used] per turn */
  flow?: Record<string, [number, number]>;
  settlements: Array<{ tile: number; name: string; tick: number; /** §2.5 joined to the capital by road */ road?: boolean }>;
  /** Completed trades with each nation (§7.3, §7.8). */
  trades: Record<string, number>;
  /** Ore or salt the miners dig first. */
  mineTarget: string;
  /** Largest population ever, for the lost-knowledge rule (§5.5). */
  peakPopulation: number;
  inbox: Message[];
  /** §4.6 the people the ruler handed a field to (worlds before v0.5 have none). */
  officials?: Official[];
  /** §2.5 Roads and sea lanes ordered and paid for, built in order by the builders' spare work. */
  roadWorks?: RoadWork[];
  /** §4.2 People by age group (0–9, 10–19, 20–49, 50+), men and women; sums to population. */
  demo?: Demography;
  /** §4.2 family customs chosen by the nation's AI */
  family?: { births: string; fighters: string };
  /** §4.8 the people who left, by turn: how many, to which nation, why */
  exodus?: Array<{ tick: number; k: number; to: number | null; why: string }>;
  /** §8.2 the nation's annals since its founding (chapters, oldest first) and the chapter being written */
  annals?: Array<{ from: number; to: number; pop: [number, number]; food: number; stab: number; land: [number, number]; notes: Array<{ tick: number; p: number; text: string }> }>;
  annalDraft?: { from: number; to: number; pop: [number, number]; food: number; stab: number; land: [number, number]; notes: Array<{ tick: number; p: number; text: string }>; turns: number };
  /** §8.2 the last turns in brief, for the nation's own observation */
  recent?: Array<{ tick: number; pop: number; food: number; stab: number; orders: string[]; events: string[] }>;
  /** §8.2 what it ordered this turn and what came of it */
  turnOrders?: string[];
  /** §2.9 the turn of the last land given up, and the stability it has cost that turn */
  abandoned?: { tick: number; cost: number };
  /** §3.2 turns in a row with no order given */
  idleStreak?: number;
  /** §4.5 discontent 0–100: at 100 a faction wants to leave */
  discontent?: number;
  /** §4.5 a nation founded by a faction that left another */
  origin?: { from: number; tick: number; leader: string };
  /** §9.5 the last turn this people can pass on the plague it has, the last turn it cannot catch it again,
   *  and the last turn of its quarantine (all inclusive). */
  outbreakUntil?: number;
  immuneUntil?: number;
  /** §9.6 the disease it has or last had (absent: dịch hạch), the last turn it is immune to each disease it lived
   *  through, and how many outbreaks of each it suffered unprotected (it studies their cures faster) */
  disease?: string;
  immunity?: Record<string, number>;
  diseaseLore?: Record<string, number>;
  quarantineUntil?: number;
  /** §2.8 each province's unrest 0–100, by its centre tile (absent = 0) */
  provinceUnrest?: Record<string, number>;
  /** §4.7 how well the people lives, and how it feels about it against the nations it knows */
  prosperity?: Prosperity;
  /** §4.9 the AI ministers the gods granted it, each running one field (worlds before v0.14 have none) */
  ministers?: Minister[];
}

/** §4.9 An AI minister: one more mind that runs one field of its nation every turn, from its own AP. */
export interface Minister {
  id: number;
  domain: string;
  name: string;
  /** Its mind: a Claude model and effort, or the bot's logic for its field. */
  controller: "ai" | "bot";
  model: string;
  effort?: string;
  since: number;
  /** §10.5 a mind the gods gave for an idea: it serves until this turn, outside the seats */
  until?: number;
  /** The request it was granted by. */
  request: number;
  /** Last turn: what it thought and what it ordered (✓/✗), and the tick. */
  lastThought?: string;
  lastOrders?: string[];
  lastTick?: number;
}

/** §4.9 A nation's request to the gods for a minister, waiting for the Watcher. */
export interface MinisterRequest {
  id: number;
  nation: number;
  domain: string;
  tick: number;
  /** The people when it asked. */
  population: number;
  reason: string;
  /** pending → approved (by the Watcher) → done (the minister took office next turn) → ended (dismissed or stepped down);
   *  or refused / expired. */
  status: "pending" | "approved" | "refused" | "expired" | "done" | "ended";
  controller?: "ai" | "bot";
  model?: string;
  effort?: string;
  verdict?: string;
  decidedTick?: number;
  /** The minister it became. */
  minister?: number;
  /** The nation has been told of the Watcher's last word (refusal, dismissal). */
  delivered?: boolean;
}

/** §4.7 Prosperity 0–100 (four parts of 25) and national pride. */
export interface Prosperity {
  score: number;
  parts: { food: number; goods: number; room: number; health: number };
  /** Scars of famine, plague, cold and war, 0–1, fading each turn. */
  woe: number;
  /** The last scores, oldest first. */
  history: number[];
  /** The average of the nations it knows (null: knows none), and what the people feel about it. */
  known: number | null;
  mood: "acclaim" | "envy" | null;
  /** Tick of the last chronicle line; people who left for a richer nation last turn, and where. */
  said?: number;
  left?: { k: number; to: number };
}

/** §4.5 A faction that wants to leave its nation and found its own, waiting for the Watcher. */
export interface Schism {
  id: number;
  from: number;
  tick: number;
  /** Share of the people that goes, and how many that was when it formed. */
  share: number;
  people: number;
  /** Where they mean to settle (a province faction: its centre). */
  site: number;
  /** §2.8 a province that wants to leave with its land: its centre tile and name */
  province?: number;
  provinceName?: string;
  leader: string;
  grievance: string;
  /** pending → approved → done (a new nation); or refused/expired → asking another nation → emigrated, or returned home */
  status: "pending" | "approved" | "refused" | "expired" | "done" | "asking" | "emigrated" | "returned" | "fighting" | "won" | "crushed";
  /** The nation they ask to take them in, and until when. */
  to?: number;
  askUntil?: number;
  /** The Watcher's answer: the mind the new nation gets. */
  controller?: "ai" | "bot";
  provider?: string;
  model?: string;
  effort?: string;
  verdict?: string;
  decidedTick?: number;
  /** The nation it became. */
  nation?: number;
  /** §4.5b a faction that rose for the throne instead of leaving: the turns each side won, the rebels' odds last turn,
   *  and whether the Watcher has chosen the new ruler's mind */
  kind?: "civil";
  score?: { rebels: number; crown: number };
  odds?: number;
  mind?: boolean;
  /** v0.55 the nations that aided a side, turn by turn; the war's toll so far */
  aid?: Array<{ nation: number; side: "crown" | "rebels"; tick: number; warriors: number; worth: number }>;
  toll?: { dead: number; fled: number; burned: number; ruined: number };
}

export interface Demography {
  m: number[]; f: number[];
  /** Last turn: children born (who lived), infants lost, deaths of old age and hardship. */
  born?: number; infants?: number; aged?: number;
  /** Last turn's other comings and goings: deaths by cause, people who left or arrived, the population it began with. */
  died?: Record<string, number>; left?: number; arrived?: number; start?: number;
}

export interface RoadWork { tile: number; level: number; progress: number }

/** §4.12 A great person: born to a nation, serving it until `dies`. */
export interface Great { id: number; name: string; kind: string; born: number; dies: number; from?: number }

/** §4.6 An official: works a field every turn on the ruler's behalf. */
export interface Official {
  id: number;
  name: string;
  domain: string;
  /** A governor's centre (capital or settlement tile); null for the others. */
  seat: number | null;
  skill: number;
  loyalty: number;
  since: number;
  /** What they did last turn, in words. */
  lastAct: string;
}

export interface Message { from: number; tick: number; text: string; gesture: boolean }

export type TreatyType = "non_aggression" | "passage" | "alliance" | "peace" | "tribute" | "vassal" | "hunt";
export interface Treaty {
  id: number;
  type: TreatyType;
  a: number; // proposer
  b: number;
  /** tribute/vassal: a pays b each tick */
  tribute: Record<string, number>;
  cede: number[]; // tiles a hands to b when it starts
  start: number;
  end: number | null;
  active: boolean;
  brokenBy: number | null;
  /** who proposed it (a is the payer when there is tribute) */
  by?: number;
  /** turns of tribute paid in full, and turns it fell short */
  paid?: number; missed?: number;
  /** why it ended before its term, when nobody tore it up */
  endedBy?: string;
  /** the turns it was agreed for (null: for ever), kept when it ends early */
  term?: number | null;
}
export interface TreatyOffer { id: number; from: number; to: number; type: TreatyType; duration: number | null; tribute: Record<string, number>; cede: number[]; payer: number; tick: number }
export interface TradeOffer { id: number; from: number; to: number; give: Record<string, number>; get: Record<string, number>; tick: number; status: "open" | "done" | "expired" | "failed" }
export interface Caravan {
  id: number; from: number; to: number; goods: Record<string, number>; arrive: number; offer: number;
  /** §7.3 How it travels (worlds before v0.4 have none of these). */
  mode?: "land" | "water" | "air";
  /** The road, first tile at the sender; `depart` is the tick it left. */
  path?: number[];
  depart?: number;
  /** Porters (land) or boats (water) away with it until it arrives. */
  porters?: number;
  boats?: number;
}
export interface War { id: number; a: number; b: number; declared: number; start: number; end: number | null; reason: string;
  /** §7.9 the dead of the border brawls that led to it, by nation id */
  brawlDead?: Record<string, number>;
  /** §7.4b the war's own tally by nation id (v0.30; wars from before have none) */
  tally?: Record<string, WarSide>;
  /** §7.4b the last tile fought over (a battle or a border clash), for the Watcher */
  lastTile?: number;
  /** §7.4b how the peace was made: the winner by the score, what the loser paid, or a white peace */
  peace?: WarPeace;
  /** the talks between the two while they fought: peace offers with their terms, letters, the signing */
  talks?: WarTalk[];
  /** the peace treaty that ended it */
  treaty?: number }
export interface WarTalk { tick: number; from: number; kind: "offer" | "message" | "signed"; text: string }
export interface WarSide { score: number; dead: number; clashes: number; battles: number; tiles: number; centres: number; raids: number }
export interface WarPeace { tick: number; winner: number | null; lead: number; reparations: Record<string, number>; tiles: number; white: boolean;
  /** what the treaty itself carried: tribute a turn, tiles ceded, by whom */
  terms?: string }
export interface Battle { tick: number; attacker: number; defender: number; tile: number; kind: "attack" | "raid"; a: number; d: number; won: boolean; lossA: number; lossD: number; note: string }

export interface Intel {
  level: number; // 0-4
  lastContact: number; // tick
  asOf: number; // tick the report below was taken
  report: Record<string, unknown>;
}

export type PetitionStatus = "pending" | "accepted" | "partial" | "rejected" | "merged";

/** A nation's request to the gods (the Watcher) to change the world (§10.5). */
export interface Petition {
  id: number;
  /** §10.7 the AI judge that ruled on it (absent: the Watcher) */
  judge?: string;
  /** §10.5 the field the nation wants the gift of a mind in, should the idea be taken up */
  mind?: string;
  nation: number;
  tick: number;
  category: string;
  title: string;
  text: string;
  reason: string;
  /** Snapshot of the nation when it asked, for the Watcher's context. */
  context: { population: number; stability: number; food: number; tiles: number; era: string };
  status: PetitionStatus;
  verdict: string;
  decidedTick: number | null;
  mergedInto: number | null;
  delivered: boolean;
  /** §10.5 the reward was given (once, whatever the gods decide later) */
  rewarded?: boolean;
  /** §10.5 an initiative: what kind of depth it adds; the turn it was built into the world, and whether its honour was given */
  kind?: string; implemented?: number | null; implementedNote?: string; honoured?: boolean;
}

/** A world-wide law issued by the Watcher (§10.2). */
export interface Decree {
  id: number; code: string; tick: number; effectiveTick: number; kind: string; text: string; fromPetition: number | null;
  /** §10.3 a law decree: the rule it sets, to what, and what it was */
  law?: { key: string; value: number; previous: number };
}

export interface Spy {
  id: number; owner: number; target: number; since: number; active: boolean;
  /** What the spy did this tick ("" = nothing). Doubles detection; cleared after the roll (§7.8). */
  acted: string;
}

export interface Wonder { key: string; name: string; i: number }

/** §9.4 A barbarian horde living in a wilderness. Not a nation: it never talks, trades or signs. */
export interface Horde {
  id: number;
  name: string;
  tile: number;
  strength: number;
  alive: boolean;
  /** Tick a beaten horde comes back (null while it lives). */
  returns: number | null;
  /** Tick of its last raid, and on whom. */
  lastRaid: { tick: number; nation: number; won: boolean } | null;
}

export interface ChronicleEntry { tick: number; nation: number | null; kind: string; text: string }

export interface World {
  /** §10.8 the rules version this world last ran under, and when the rules last changed (the rulers are told for a few turns) */
  rulesVersion?: string;
  rulesChange?: { from: string | null; to: string; tick: number };
  version: 1;
  seed: string;
  tick: number;
  tiles: Tile[];
  nations: Nation[];
  /** §4.5 factions that want to leave, and those that did (worlds before v0.6 have none) */
  schisms?: Schism[];
  /** §4.9 nations' requests for AI ministers (worlds before v0.14 have none) */
  ministerRequests?: MinisterRequest[];
  wonders: Wonder[];
  rivers: number[][];
  herd: [number, number] | null;
  wild: number[];
  /** §9.4 the barbarian hordes of the wilderness (worlds before v0.4 have none). */
  hordes?: Horde[];
  /** Invention id -> first inventor (nation id) and tick. */
  registry: Record<string, { by: number[]; tick: number }>;
  nextBuildingId: number;
  spies: Spy[];
  nextSpyId: number;
  petitions: Petition[];
  decrees: Decree[];
  /** Everything the nations invented themselves (§5): canon for the whole world. */
  custom: CustomCatalog;
  proposals: Proposal[];
  treaties: Treaty[];
  treatyOffers: TreatyOffer[];
  tradeOffers: TradeOffer[];
  caravans: Caravan[];
  wars: War[];
  battles: Battle[];
  nextId: number;
  /** Ticks each owned tile has been cut off from every centre (§2.3). */
  cutoff: Record<string, number>;
  /** §10.6 a renaming decree in force: until when, what the gods asked, and every name as it was when it was given */
  renameDecree?: { code: string; from: number; until: number; text: string; done?: boolean;
    names: Record<string, { nation: string; capital: string; people: string; places: Record<string, string>; officials: Record<string, string> }> };
  /** §7.9 tension, incidents and market between neighbours, keyed "a-b" (a < b) */
  /** §4.14 royal marriages between the courts, and the offers still open */
  marriages?: import("./royals.ts").Marriage[]; marriageOffers?: import("./royals.ts").MarriageOffer[];
  borders?: Record<string, { tension: number; incidents: Array<{ tick: number; text: string }>; market: number; dispute?: number }>;
  eraGates: Record<string, number>; // era -> first tick a nation crossed it
  /** §2.5 turns each road on land no one holds has gone untended (it loses a level every ROADS.decayTicks) */
  wildRoads?: Record<string, number>;
  /** §2.11 the riches of land and sea were seeded (worlds before v0.18 get them when loaded) */
  riches?: number;
  /** §6.3 world prices in food units, and last turn's for the trend (worlds before v0.17 have none) */
  market?: { prices: Record<string, number>; prev: Record<string, number> };
}

export interface CustomCatalog {
  inventions: Record<string, Invention>;
  recipes: Record<string, Recipe>;
  buildings: Record<string, BuildingDef>;
  goods: Record<string, { name: string; value: number; by: number }>;
  next: number;
}

/** An invention proposal (§5.4) waiting for, or past, the judge. */
export interface Proposal {
  id: number;
  nation: number;
  tick: number;
  status: "pending" | "approved" | "rejected" | "duplicate";
  name: string;
  description: string;
  prereqs: string[];
  requires: { res?: string; terrain?: string } | null;
  caps: string[];
  effects: Array<Record<string, unknown>>;
  depth: number;
  power: number;
  ruling: Ruling | null;
  inventionId: string | null;
}

export interface Ruling {
  judge: string;
  causality: number;
  material: number;
  physics: number;
  duplicate_of: string | null;
  add_prereqs: string[];
  remove_effects: number[];
  remove_capabilities: string[];
  reason: string;
}

/** What one nation submitted for a tick. Logged verbatim, so replay is exact. */
export type TurnInput = (
  | { kind: "ok"; response: AIResponse }
  | { kind: "asleep" }
  | { kind: "silent"; reason: string }
) & {
  /** §4.9 what the nation's ministers answered this turn (absent: none); they act after the ruler, whatever the ruler's kind. */
  ministers?: MinisterInput[];
};
export interface MinisterInput { minister: number; domain: string; response: AIResponse }

export interface AIResponse {
  thought?: string;
  memory?: string;
  labor?: Partial<Record<Role, number>>;
  crafts?: Record<string, number>;
  actions?: Array<Record<string, unknown>>;
}
