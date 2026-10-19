// Shared data shapes. The whole World is plain JSON so it can be saved,
// compressed and replayed.

export type Terrain =
  | "ocean" | "shallow" | "grass" | "forest" | "taiga" | "jungle"
  | "hill" | "mountain" | "coast" | "swamp" | "desert" | "tundra";
export type Zone = "cold" | "temp" | "trop";
export type Region = "west" | "east" | "isl" | null;

/** Natural reserves that live on tiles. Ores are hidden from AIs. */
export type ResKey =
  | "game" | "plants" | "fish" | "wood" | "stone" | "flint" | "clay"
  | "salt" | "reeds" | "copper" | "tin" | "iron";

export type Role =
  | "gather" | "hunt" | "fish" | "farm" | "wood" | "stone" | "flint" | "clay"
  | "craft" | "build" | "research" | "warrior";

export const ROLES: Role[] = [
  "gather", "hunt", "fish", "farm", "wood", "stone", "flint", "clay",
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
}

export type NationStatus = "active" | "asleep" | "error" | "dead";

export interface Nation {
  id: number;
  controller: "ai" | "bot";
  provider: string;
  model: string;
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
}

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

export interface Spy { id: number; owner: number; target: number; since: number; active: boolean }

export interface Wonder { key: string; name: string; i: number }

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
  /** Invention id -> first inventor (nation id) and tick. */
  registry: Record<string, { by: number[]; tick: number }>;
  nextBuildingId: number;
  spies: Spy[];
  nextSpyId: number;
  petitions: Petition[];
  decrees: Decree[];
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
