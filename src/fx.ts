// Map effects: where things happened during one step(), for the Watcher's map
// animations. Recording only: nothing here is read back by the engine, so the
// world stays deterministic. step() opens the sink, everything it calls may
// add to it, and step() returns what was collected.

export type FxKind =
  | "death" | "birth" | "build" | "invention" | "claim" | "lost_tile" | "explore" | "settle" | "era" | "migrate"
  | "raid" | "repelled" | "clear" | "battle" | "beasts" | "flood" | "quake" | "winter" | "plague" | "famine"
  | "drought" | "bounty" | "herd" | "fire" | "meteor" | "eruption" | "riot" | "horde_back"
  | "fishrun" | "caravan" | "toll" | "robbed" | "storm" | "seized";

export interface MapFx {
  kind: FxKind;
  tile: number;
  nation?: number;
  /** How many: people dead or born, warriors… */
  n?: number;
  /** A second place: where migrants went, where a raid came from. */
  from?: number;
  to?: number;
  /** The tiles an expedition walked. */
  path?: number[];
  /** Why someone died: famine, winter, plague, beasts, quake, raid, battle, explore, horde. */
  cause?: string;
  /** A short label, e.g. the name of what was built or invented. */
  text?: string;
}

let sink: MapFx[] | null = null;
export function fxBegin(): void { sink = []; }
export function fxEnd(): MapFx[] { const out = sink ?? []; sink = null; return out; }
export function fx(e: MapFx): void { sink?.push(e); }
/** Shorthand for a death toll at a tile (ignored when nobody died). */
export function fxDeath(tile: number, nation: number, n: number, cause: string): void { if (n > 0) fx({ kind: "death", tile, nation, n, cause }); }
