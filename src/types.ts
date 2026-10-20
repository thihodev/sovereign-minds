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
  | "salt" | "reeds" | "copper" | "tin" | "iron" | "herbs";

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
  /** Current reserves. */
  res: Partial<Record<ResKey, number>>;
  /** Starting reserves; renewable resources regrow up to this cap. */
  cap: Partial<Record<ResKey, number>>;
  wonder: string | null;
  owner: number; // nation id, -1 = unclaimed
  /** Distance to the ice wall when it is 8 or less (§12.1): its cold wind reaches that far. */
  wall?: number;
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
  settlements: Array<{ tile: number; name: string; tick: number }>;
  /** Completed trades with each nation (§7.3, §7.8). */
  trades: Record<string, number>;
  /** Ore or salt the miners dig first. */
  mineTarget: string;
  /** Largest population ever, for the lost-knowledge rule (§5.5). */
  peakPopulation: number;
  inbox: Message[];
}

export interface Message { from: number; tick: number; text: string; gesture: boolean }

export type TreatyType = "non_aggression" | "passage" | "alliance" | "peace" | "tribute" | "vassal";
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
}
export interface TreatyOffer { id: number; from: number; to: number; type: TreatyType; duration: number | null; tribute: Record<string, number>; cede: number[]; payer: number; tick: number }
export interface TradeOffer { id: number; from: number; to: number; give: Record<string, number>; get: Record<string, number>; tick: number; status: "open" | "done" | "expired" | "failed" }
export interface Caravan { id: number; from: number; to: number; goods: Record<string, number>; arrive: number; offer: number }
export interface War { id: number; a: number; b: number; declared: number; start: number; end: number | null; reason: string }
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
}

/** A world-wide law issued by the Watcher (§10.2). */
export interface Decree { id: number; code: string; tick: number; effectiveTick: number; kind: string; text: string; fromPetition: number | null }

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
  version: 1;
  seed: string;
  tick: number;
  tiles: Tile[];
  nations: Nation[];
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
  eraGates: Record<string, number>; // era -> first tick a nation crossed it
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
export type TurnInput =
  | { kind: "ok"; response: AIResponse }
  | { kind: "asleep" }
  | { kind: "silent"; reason: string };

export interface AIResponse {
  thought?: string;
  memory?: string;
  labor?: Partial<Record<Role, number>>;
  crafts?: Record<string, number>;
  actions?: Array<Record<string, unknown>>;
}
