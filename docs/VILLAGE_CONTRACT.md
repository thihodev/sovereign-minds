# Village: the data contract between the engine and the Watcher UI

Status: binding for phases 1–5 of docs/VILLAGE_PLAN.md. Both sides code against this file; a change here is made in one commit that updates both sides.

Coordinates are tiles: `x` to the east, `y` to the south, `[0,0]` the top-left. Times are **minutes since 06:00 of the day** (`0` = 06:00, `1200` = 02:00, the hard end of a day). Text shown to the Watcher is Vietnamese; ids are ASCII.

## 1. The map: `src/village/map-data.json`

Hand-authored (by the map tool, see §4) and read by both the engine (walking, places, fields) and the UI (drawing). Served to the UI by `GET /api/static` as `map`.

```ts
interface VillageMapData {
  version: 1;
  width: number; height: number;          // about 80 × 60
  /** One ground kind per tile, row-major (y * width + x). */
  ground: GroundKind[];
  /** Tiles nobody can walk on, row-major, 1 = blocked (water, walls, house bodies, cliffs, trees, fences…). */
  blocked: (0 | 1)[];
  /** Drawn things with a footprint; the UI draws them, the engine only reads `blocks`, `kind` and `id`. */
  objects: MapObject[];
  /** Named places the villagers go to by id. */
  places: Place[];
  /** Field plots: each tile can be tilled, planted and watered. */
  plots: Plot[];
  /** Homes: one per household. */
  homes: Home[];
  /** Where water can be fished, by kind. */
  waters: { id: string; kind: "river" | "pond" | "sea"; tiles: [number, number][] }[];
  /** Tiles where wild things grow (forage) and trees that can be chopped, by area. */
  forage: { id: string; area: "forest" | "beach" | "riverside" | "meadow"; tiles: [number, number][] }[];
  trees: { id: string; x: number; y: number; kind: "oak" | "pine" | "fruit" | "bamboo" }[];
  mine: { entrance: [number, number]; floors: number };
}
type GroundKind = "grass" | "dirt" | "path" | "sand" | "water" | "deep" | "bridge" | "floor" | "cliff";
interface MapObject { id: string; kind: string; x: number; y: number; w: number; h: number; blocks: boolean; sprite?: string; season?: Record<string, string> }
interface Place {
  id: string;                // "square", "tavern", "shop", "smithy", "carpenter", "clinic", "temple", "dock", "beach", "forest", "mine", "riverbank", "pond", "board", "common_field", "home:<householdId>"
  name: string;              // Vietnamese: "Quảng trường", "Quán Gió Chiều"…
  kind: "outdoor" | "building";
  /** Tiles a villager stands on when "at" the place; the first is the default spot. */
  spots: [number, number][];
  /** The door tile for buildings (walking ends here, then the villager is "inside"). */
  door?: [number, number];
  /** Opening hours in minutes since 06:00, absent = always. */
  hours?: [number, number];
  closedOn?: number[];       // days of the week 0–6 (0 = Monday)
}
interface Plot { id: string; owner: string | "common"; tiles: [number, number][] }   // owner = household id
interface Home { household: string; place: string; door: [number, number]; beds: number }
```

## 2. The static payload: `GET /api/static`

```ts
{ map: VillageMapData,
  villagers: { id: string; name: string; sprite: string; tint?: string; faceset: string; household: string; job: string }[],
  items: Record<string, { name: string; icon: string; kind: string }>,   // id → Vietnamese name and icon path
  crops: Record<string, { name: string; stages: number; seasons: string[] }> }
```
`sprite` and `faceset` are paths under `web/assets/`.

## 3. A day: `GET /api/day/:n` (and the `day` SSE event with the newest `n`)

The engine simulates a whole day at once and stores this; the UI plays it back over the day's real length.

```ts
interface DayTimeline {
  day: number;                       // 1-based day count since the village began
  date: { year: number; season: "xuan" | "ha" | "thu" | "dong"; dayOfSeason: number; weekday: number };
  weather: "sun" | "cloud" | "rain" | "storm" | "snow";
  /** The field state at 06:00 and the changes during the day (tilling, planting, watering, harvesting). */
  fields: { start: FieldTile[]; changes: { t: number; x: number; y: number; tile: FieldTile | null }[] };
  /** Each villager's day, in order, gap-free from 0 until bedtime. */
  tracks: Record<string, Segment[]>;
  /** Things to show at a moment: speech, gifts, emotes, catches, sales… */
  events: DayEvent[];
  /** Night summary for the UI's end-of-day card. */
  summary: { villager: string; gold: number; energy: number; mood: number; note: string }[];
}
interface FieldTile { x: number; y: number; state: "tilled" | "planted" | "grown"; crop?: string; stage?: number; wet?: boolean; dead?: boolean }
type Segment =
  | { kind: "walk"; t0: number; t1: number; path: [number, number][] }          // tile path, constant speed between t0 and t1
  | { kind: "work"; t0: number; t1: number; at: [number, number]; facing: "n" | "s" | "e" | "w"; action: Action; target?: [number, number] }
  | { kind: "stay"; t0: number; t1: number; at: [number, number]; facing: "n" | "s" | "e" | "w"; inside?: string }   // inside = place id when in a building (not drawn)
  | { kind: "sleep"; t0: number; t1: number; inside: string };
type Action = "till" | "plant" | "water" | "harvest" | "fish" | "forage" | "chop" | "mine" | "craft" | "cook" | "eat" | "buy" | "sell" | "talk" | "gift" | "pray" | "post" | "build" | "rest" | "read";
interface DayEvent {
  t: number;
  kind: "say" | "gift" | "emote" | "catch" | "harvest" | "sale" | "buy" | "faint" | "festival" | "miracle" | "fail";
  who: string; to?: string;
  text?: string;                     // Vietnamese: what was said, or a short caption
  item?: string; qty?: number; gold?: number;
  emote?: "heart" | "happy" | "sad" | "angry" | "surprise" | "question" | "music" | "sleep" | "sweat" | "idea";
  at: [number, number];
}
```

## 4. Who owns what
- **The map** (`src/village/map-data.json`) is authored by the map tool `tools/mapedit/` (a small editor page plus the drawing code from `web/mockup.js`). The engine treats it as read-only data. Until it exists, the engine and its tests use a small map built in code with the same type.
- **The engine** (`src/village/*.ts`) makes `DayTimeline`s. Its tests check every timeline: tracks gap-free from 0 to bedtime, walks follow unblocked neighbouring tiles at the walking speed, and every event lies within its villager's position at that time.
- **The UI** (`web/village/*.js`) draws `VillageMapData` and plays `DayTimeline`s. It never computes rules.
