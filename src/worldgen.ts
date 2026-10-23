// World generation (§12.5): two continents joined by an isthmus, an
// archipelago, rivers, wonders and fair spawn points, all inside a rim of
// ice wall nobody can cross (§12.1). Same seed -> same world. Shapes use
// coordinates from 0 to 1, so they scale with N; counts and distances use SCALE.

import { N, TILE_COUNT, NEIGHBORS, col, dist, pointOf, row, useShape, within, type Shape } from "./hex.ts";
import { xmur3, mulberry32, fbm, fbm3, rngFor, shuffle, type Rand } from "./rng.ts";
import { MEADOW_HERBS, RIVER, ROCK_SALT, SURFACE_IRON, VEIN, WONDER_DEFS } from "./rules.ts";
import type { Tile, Wonder, ResKey } from "./types.ts";

const AX = Math.sqrt(3) / 1.5;
/** The map is SCALE times as wide as the original 64 × 64 Nguyên Địa. */
export const SCALE = N / 64;
/** §12.1 The ice wall is WALL.min to WALL.max tiles thick; land within WALL.glacier of it is glacier. */
export const WALL = { min: 3, max: 6, glacier: 2, reach: 8 };
/** Spawns at least `min` apart; nearest neighbour ideally no farther than `far`. */
export const SPAWN = { min: Math.round(12 * Math.sqrt(SCALE)), far: Math.round(18 * Math.sqrt(SCALE)) };
/** §12.4 Wilderness: where the barbarian hordes live (§9.4). */
export const WILD = { count: Math.round(3 * SCALE), fromSpawn: Math.round(8 * Math.sqrt(SCALE)), band: 12, apart: Math.round(14 * Math.sqrt(SCALE)) };

export interface GeneratedWorld {
  tiles: Tile[];
  rivers: number[][];
  wonders: Wonder[];
  spawns: number[];
  spawnValues: number[];
  spread: number;
  wild: number[];
  herd: [number, number] | null;
}

const WONDER_OK: Record<string, (t: Tile, tiles: Tile[]) => boolean> = {
  volcano: t => t.terrain === "mountain",
  obsidian: t => t.terrain === "hill",
  cave: t => t.terrain === "hill" || t.terrain === "mountain",
  salt: t => t.terrain === "desert" || t.terrain === "coast",
  spring: t => t.terrain === "hill",
  meteor: t => ["grass", "tundra", "desert"].includes(t.terrain),
  falls: (t, tiles) => t.river && NEIGHBORS[t.i].some(j => ["hill", "mountain"].includes(tiles[j].terrain)),
};

export function tileValue(t: Tile): number {
  const R = t.res;
  let food = (R.game || 0) + (R.plants || 0) + (R.fish || 0) * (t.land ? 1 : 0.5);
  if (t.zone === "cold") food *= 0.8;
  return food + (R.wood || 0) * 0.15 + (R.stone || 0) * 0.02 + (R.flint || 0) + (R.clay || 0) * 0.15
    + (R.copper ? 25 : 0) + (t.river ? 30 : 0) + (t.delta ? 20 : 0);
}

export function generateWorld(seedStr: string, nNations: number, shape: Shape = { kind: "flat" }): GeneratedWorld {
  // §12.1 the world's shape: the flat map of old, or a globe (v0.67)
  useShape(shape);
  const globe = shape.kind === "sphere";
  const sf = xmur3(seedStr);
  const S1 = sf() | 0, S2 = sf() | 0, S3 = sf() | 0, S4 = sf() | 0, S5 = sf() | 0;
  const rand: Rand = mulberry32(sf());
  const T = TILE_COUNT, J = () => (rand() - 0.5) * 0.08;
  // counts and distances grow with the world: the flat map is SCALE times the old 64 × 64, a globe by its area
  const SC = globe ? Math.sqrt(T / 4096) : SCALE;
  const spawn = globe ? { min: Math.round(12 * Math.sqrt(SC)), far: Math.round(18 * Math.sqrt(SC)) } : SPAWN;
  const wildK = globe ? { count: Math.round(3 * SC), fromSpawn: Math.round(8 * Math.sqrt(SC)), band: 12, apart: Math.round(14 * Math.sqrt(SC)) } : WILD;
  const c1 = { x: (0.26 + J()) * AX, y: 0.38 + J() }, c2 = { x: (0.74 + J()) * AX, y: 0.62 + J() };
  const isl = { x: (0.11 + J() * 0.5) * AX, y: 0.90 };
  const mx = (c1.x + c2.x) / 2, my = (c1.y + c2.y) / 2;
  let ux = c2.x - c1.x, uy = c2.y - c1.y;
  const ul = Math.hypot(ux, uy); ux /= ul; uy /= ul;

  const elev = new Float32Array(T), moist = new Float32Array(T), sdv = new Float32Array(T);
  const wall = new Uint8Array(T);
  if (globe) globeShapes(T, rand, [S1, S2, S3, S4, S5], elev, moist, sdv, wall);
  else for (let i = 0; i < T; i++) {
    const c = i % N, r = (i / N) | 0;
    const px = ((c + 0.5 * (r & 1)) / N) * AX, py = r / N;
    const wx = px + (fbm(px * 4, py * 4, S3, 3) - 0.5) * 0.12, wy = py + (fbm(px * 4 + 7, py * 4 + 3, S3, 3) - 0.5) * 0.12;
    const e1 = 1 - Math.hypot((wx - c1.x) / 0.30, (wy - c1.y) / 0.37);
    const e2 = 1 - Math.hypot((wx - c2.x) / 0.30, (wy - c2.y) / 0.37);
    let m = Math.max(e1, e2, 0);
    const di = Math.hypot(wx - isl.x, wy - isl.y);
    if (di < 0.16) { const n = fbm(px * 14, py * 14, S4, 3); m = Math.max(m, (1 - di / 0.16) * (n > 0.5 ? 0.95 : 0.15)); }
    const sd = (px - mx) * ux + (py - my) * uy, along = Math.abs(-(px - mx) * uy + (py - my) * ux);
    sdv[i] = sd;
    if (along > 0.035) m *= Math.min(1, Math.abs(sd) / 0.06);
    elev[i] = 0.65 * m + 0.35 * fbm(px * 3, py * 3, S1, 5);
    moist[i] = fbm(px * 2.5 + 11, py * 2.5 + 5, S2, 4);
  }
  // §12.1 the ice wall: a rim of uneven thickness around the whole world (on a globe: the polar caps, above)
  if (!globe) for (let i = 0; i < T; i++) {
    const c = i % N, r = (i / N) | 0, edge = Math.min(c, r, N - 1 - c, N - 1 - r);
    const thick = WALL.min + Math.floor(fbm(c / N * 9, r / N * 9, S5, 3) * (WALL.max - WALL.min + 1.5));
    if (edge < Math.min(WALL.max, thick)) wall[i] = 1;
  }
  const thr = Array.from(elev).sort((a, b) => b - a)[Math.floor(T * (globe ? 0.42 : 0.55))]; // a globe is more sea, as on Earth
  const land = new Uint8Array(T);
  for (let i = 0; i < T; i++) land[i] = elev[i] > thr && !wall[i] ? 1 : 0;
  const water = (j: number) => !land[j] && !wall[j];
  // Distance to the wall, up to WALL.reach
  const wallDist = new Int16Array(T).fill(99);
  { let front: number[] = []; for (let i = 0; i < T; i++) if (wall[i]) { wallDist[i] = 0; front.push(i); }
    for (let d = 1; d <= WALL.reach && front.length; d++) { const next: number[] = []; for (const k of front) for (const j of NEIGHBORS[k]) if (wallDist[j] > d) { wallDist[j] = d; next.push(j); } front = next; } }

  // Isthmus: walk from the midpoint toward each continent until existing land.
  const forced = new Uint8Array(T);
  const tileAt = (px: number, py: number) => {
    const r = Math.round(py * N); if (r < 0 || r >= N) return -1;
    const c = Math.round((px / AX) * N - 0.5 * (r & 1)); return (c < 0 || c >= N) ? -1 : r * N + c;
  };
  if (!globe) for (const toward of [c1, c2]) { // the isthmus of the flat world
    for (let t = 0; t <= 1; t += 0.004) {
      const i = tileAt(mx + (toward.x - mx) * t, my + (toward.y - my) * t);
      if (i < 0) continue;
      if (wall[i]) break;
      if (land[i] && !forced[i]) break;
      land[i] = 1; forced[i] = 1; elev[i] = Math.max(elev[i], thr + 0.002);
      const k = NEIGHBORS[i][Math.floor(t * 1000) % NEIGHBORS[i].length];
      if (!land[k] && !wall[k]) { land[k] = 1; forced[k] = 1; elev[k] = Math.max(elev[k], thr + 0.002); }
    }
  }

  const comp = new Int32Array(T).fill(-1), compSize: number[] = [];
  for (let i = 0; i < T; i++) {
    if (!land[i] || comp[i] >= 0) continue;
    const id = compSize.length, stack = [i]; comp[i] = id; let n = 0;
    while (stack.length) { const k = stack.pop()!; n++; for (const j of NEIGHBORS[k]) if (land[j] && comp[j] < 0) { comp[j] = id; stack.push(j); } }
    compSize.push(n);
  }

  const landIdx: number[] = []; for (let i = 0; i < T; i++) if (land[i]) landIdx.push(i);
  const byElev = landIdx.slice().sort((a, b) => elev[b] - elev[a]);
  const mThr = elev[byElev[Math.floor(byElev.length * 0.08)]], hThr = elev[byElev[Math.floor(byElev.length * 0.22)]], lowThr = elev[byElev[Math.floor(byElev.length * 0.78)]];
  const mRank = new Float32Array(T);
  landIdx.slice().sort((a, b) => moist[a] - moist[b]).forEach((i, k) => { mRank[i] = k / landIdx.length; });

  const tiles: Tile[] = new Array(T);
  for (let i = 0; i < T; i++) {
    const r = (i / N) | 0, lat = Math.abs(row(i));
    const zone = globe ? (lat >= GLOBE.cold ? "cold" : lat <= GLOBE.tropic ? "trop" : "temp") : r <= Math.round(N * 0.2) ? "cold" : r >= Math.round(N * 0.8) ? "trop" : "temp";
    const t: Tile = { i, terrain: "ocean", zone, region: null, land: !!land[i], elev: Math.round(elev[i] * 1000) / 1000, river: false, delta: false, res: {}, cap: {}, wonder: null, owner: -1 };
    if (wallDist[i] <= WALL.reach) t.wall = wallDist[i];
    if (wall[i]) { t.terrain = "icewall"; t.elev = 1; tiles[i] = t; continue; }
    if (land[i]) {
      t.region = compSize[comp[i]] < 60 * SC * SC ? "isl" : (sdv[i] < 0 ? "west" : "east");
      const m = mRank[i], e = elev[i];
      if (e >= mThr && !forced[i]) t.terrain = "mountain";
      else if (e >= hThr && !forced[i]) t.terrain = "hill";
      else if (zone === "cold") t.terrain = m > 0.5 ? "taiga" : "tundra";
      else if (zone === "temp") t.terrain = m < 0.08 ? "desert" : m > 0.62 ? "forest" : (m > 0.52 && e < lowThr) ? "swamp" : "grass";
      else t.terrain = m < 0.22 ? "desert" : m > 0.55 ? "jungle" : (m > 0.45 && e < lowThr) ? "swamp" : "grass";
      if (wallDist[i] <= WALL.glacier && !forced[i]) t.terrain = "glacier";
    }
    tiles[i] = t;
  }
  for (const t of tiles) {
    if (t.terrain === "icewall") continue;
    if (!t.land) { t.terrain = within(t.i, 2).some(j => land[j]) ? "shallow" : "ocean"; continue; }
    if (["grass", "desert", "tundra"].includes(t.terrain) && NEIGHBORS[t.i].some(water)) t.terrain = "coast";
  }

  // Rivers
  const rivers: number[][] = [];
  const sources = shuffle(landIdx.filter(i => tiles[i].terrain === "mountain" || (tiles[i].terrain === "hill" && elev[i] > hThr + 0.01)), rand);
  const usedSrc: number[] = [];
  for (const s of sources) {
    if (rivers.length >= Math.round(8 * SC * 1.5)) break;
    if (usedSrc.some(u => dist(u, s) < (globe ? 9 : 7 * SC))) continue; // a globe has more land: its sources may lie closer
    const path = [s], seen = new Set([s]); let cur = s, end: number | null = null;
    for (let step = 0; step < 90 * SC; step++) {
      const nbs = NEIGHBORS[cur];
      if (nbs.some(j => wall[j])) break; // meltwater pools at the foot of the wall
      const sea = nbs.find(water); if (sea !== undefined) { end = sea; break; }
      const join = nbs.find(j => tiles[j].river && !seen.has(j)); if (join !== undefined) { end = join; break; }
      let best = -1; for (const j of nbs) if (!seen.has(j) && (best < 0 || elev[j] < elev[best])) best = j;
      if (best < 0) break;
      path.push(best); seen.add(best); cur = best;
    }
    if (end === null || path.length < 5) continue;
    usedSrc.push(s);
    for (const k of path) tiles[k].river = true;
    rivers.push(path.concat([end]));
  }
  for (const t of tiles) if (t.river && NEIGHBORS[t.i].some(water)) t.delta = true;

  // Reserves (±30%)
  const jit = (v: number) => Math.round(v * (0.7 + rand() * 0.6));
  for (const t of tiles) {
    const R = t.res;
    switch (t.terrain) {
      case "grass": R.game = jit(70); R.plants = jit(50); break;
      case "forest": R.wood = jit(200); R.game = jit(60); R.plants = jit(30); if (rand() < 0.35) R.herbs = jit(15); break;
      case "taiga": R.wood = jit(200); R.game = jit(50); break;
      case "jungle": R.wood = jit(150); R.plants = jit(80); R.herbs = jit(30); break;
      case "hill": R.stone = jit(500); if (rand() < 0.4) R.flint = jit(40); if (rand() < 0.2) R.copper = jit(80); if (rand() < 0.02) R.tin = jit(60); break;
      case "mountain": R.stone = jit(500); if (rand() < 0.1) R.copper = jit(80); if (rand() < 0.06) R.tin = jit(60); if (rand() < 0.08) R.iron = jit(100); break;
      case "coast": R.fish = jit(60); R.plants = jit(20); if (rand() < 0.25) R.salt = jit(30); break;
      case "swamp": R.clay = jit(150); R.reeds = jit(60); R.herbs = jit(20); break;
      case "desert": R.stone = jit(300); break;
      case "tundra": R.game = jit(80); R.stone = jit(300); break;
      case "shallow": R.fish = jit(60); break;
      // Reindeer and mammoth graze below the ice; frost-split rock is everywhere
      case "glacier": R.game = jit(45); R.stone = jit(250); if (rand() < 0.15) R.flint = jit(30); break;
    }
    if (t.river) {
      // §2.1 banks: fish, clay, reeds and floodplain plants; flint gravel in the upper course, near the hills
      R.fish = (R.fish || 0) + jit(60); R.clay = (R.clay || 0) + jit(150);
      R.reeds = (R.reeds || 0) + jit(RIVER.reeds); R.plants = (R.plants || 0) + jit(RIVER.plants);
      if (within(t.i, RIVER.flintNear).some(j => tiles[j].terrain === "hill" || tiles[j].terrain === "mountain")) R.flint = (R.flint || 0) + jit(RIVER.flint);
    }
    if (t.region === "isl" && ["hill", "coast", "grass"].includes(t.terrain) && rand() < 0.6) R.flint = jit(40);
  }

  // Wonders: at least two per continent, ≥ 6 tiles apart
  const wonders: Wonder[] = [];
  const need = ["west", "east", "west", "east"];
  WONDER_DEFS.forEach((w, k) => {
    const want = need[k];
    const pick = (strict: boolean) => shuffle(landIdx.slice(), rand).find(i => {
      const t = tiles[i];
      if (t.wonder || !WONDER_OK[w.key](t, tiles)) return false;
      if (strict && want && t.region !== want) return false;
      return wonders.every(o => dist(o.i, i) >= 6 * SC);
    });
    let i = pick(true); if (i === undefined) i = pick(false);
    if (i !== undefined) { tiles[i].wonder = w.key; wonders.push({ key: w.key, name: w.name, i }); }
  });
  for (const w of wonders) {
    const t = tiles[w.i];
    if (w.key === "obsidian") t.res.flint = 300;
    if (w.key === "salt") t.res.salt = 200;
    if (w.key === "meteor") t.res.iron = 20;
  }
  for (const t of tiles) t.cap = { ...t.res };
  seedDeepResources(seedStr, tiles);

  // Spawns: same value band (±5%), ≥ spawn.min apart, spread over climate zones, away from the ice
  const areaVal = (i: number) => Math.round(within(i, 3).reduce((s, j) => s + tileValue(tiles[j]), 0));
  const okTerr = ["grass", "forest", "taiga", "coast", "hill", "tundra", "jungle"];
  const cands = landIdx.filter(i => {
    const t = tiles[i], c = i % N, r = (i / N) | 0;
    return t.region !== "isl" && okTerr.includes(t.terrain) && !t.wonder && wallDist[i] > WALL.reach && (globe || (r >= 3 && r <= N - 4 && c >= 3 && c <= N - 4)) && wonders.every(w => dist(w.i, i) > 3);
  }).map(i => ({ i, v: areaVal(i), zone: tiles[i].zone }));
  // Every people needs the basics within reach: wood, stone, meat or fish, and wild plants for fibre and rope (§2.1),
  // and food on the seven tiles it starts with, so it can eat before it claims more.
  const basics = (i: number) => {
    let wood = 0, stone = 0, meat = 0, plants = 0, home = 0;
    for (const j of within(i, 2)) { const R = tiles[j].res; wood += R.wood || 0; stone += R.stone || 0; meat += (R.game || 0) + (R.fish || 0); plants += R.plants || 0; }
    for (const j of within(i, 1)) { const R = tiles[j].res; home += (R.game || 0) + (R.plants || 0) + (R.fish || 0); }
    return wood >= 150 && stone >= 150 && meat >= 80 && plants >= 60 && home >= 150;
  };
  const withBasics = cands.filter(c => basics(c.i));
  if (withBasics.length >= nNations) cands.splice(0, cands.length, ...withBasics);
  const sortedV = cands.map(c => c.v).sort((a, b) => a - b);
  let best: { score: number; chosen: typeof cands } | null = null;
  for (const p of [0.5, 0.6, 0.4, 0.7, 0.3, 0.55, 0.45, 0.65, 0.35]) {
    const T0 = sortedV[Math.floor(sortedV.length * p)], band = cands.filter(c => c.v >= T0 * 0.95 && c.v <= T0 * 1.05);
    for (let a = 0; a < 250; a++) {
      const chosen: typeof cands = [];
      for (const c of shuffle(band.slice(), rand)) { if (chosen.every(o => dist(o.i, c.i) >= spawn.min)) chosen.push(c); if (chosen.length === nNations) break; }
      if (chosen.length < nNations) continue;
      const zones = new Set(chosen.map(c => c.zone)).size;
      // Neighbours spawn.min–spawn.far tiles apart meet within a few dozen ticks; farther apart they never do.
      const nearest = chosen.map(c => Math.min(...chosen.filter(o => o !== c).map(o => dist(c.i, o.i))));
      const tooFar = nearest.reduce((x, d) => x + Math.max(0, d - spawn.far), 0);
      const score = zones * 1000 - tooFar * 10 + Math.min(...nearest);
      if (!best || score > best.score) best = { score, chosen };
    }
    if (best && new Set(best.chosen.map(c => c.zone)).size >= Math.min(3, nNations)) break;
  }
  if (!best) {
    const chosen: typeof cands = [];
    // No even band fits everyone: take the richest places that are far enough apart (never a barren one when better exist)
    for (const c of cands.slice().sort((a, b) => b.v - a.v || a.i - b.i)) { if (chosen.every(o => dist(o.i, c.i) >= spawn.min - 4)) chosen.push(c); if (chosen.length === nNations) break; }
    best = { score: 0, chosen };
  }
  const spawnsSorted = best.chosen.slice().sort((a, b) => a.i - b.i);
  const spawns = spawnsSorted.map(c => c.i), spawnValues = spawnsSorted.map(c => c.v);
  const spread = spawnValues.length ? (Math.max(...spawnValues) - Math.min(...spawnValues)) / Math.max(...spawnValues) : 0;

  // Wilderness (§12.4): untamed land on the frontier, a few days' walk beyond the first peoples, where the hordes live (§9.4)
  const wild: number[] = [];
  const far = shuffle(landIdx.filter(i => tiles[i].region !== "isl" && tiles[i].terrain !== "mountain" && tiles[i].wall === undefined)
    .map(i => ({ i, d: spawns.length ? Math.min(...spawns.map(s => dist(s, i))) : 99 }))
    .filter(f => f.d >= wildK.fromSpawn && f.d <= wildK.fromSpawn + wildK.band), rand);
  for (const f of far) { if (wild.length >= wildK.count) break; if (wild.every(w => dist(w, f.i) >= wildK.apart)) wild.push(f.i); }

  // Bison migration route
  let herd: [number, number] | null = null;
  const grass = landIdx.filter(i => tiles[i].terrain === "grass" && tiles[i].region !== "isl");
  for (let a = 0; a < 400 && grass.length > 2; a++) {
    const p = grass[Math.floor(rand() * grass.length)], q = grass[Math.floor(rand() * grass.length)];
    const d = dist(p, q);
    if (d >= 12 * SC * 0.75 && d <= 20 * SC * 0.8 && tiles[p].region === tiles[q].region) { herd = [p, q]; break; }
  }

  seedRiches(seedStr, tiles); // §2.11 and §2.10 after the spawns: fair starts are weighed without them
  seedAnimals(seedStr, tiles); // §6.4
  seedRiverPlenty(seedStr, tiles); // §2.1
  seedMeadowHerbs(seedStr, tiles); // §2.11 a nation's idea
  seedRockSalt(seedStr, tiles); // §2.11 a nation's idea
  seedVeins(seedStr, tiles);
  seedSurfaceIron(seedStr, tiles); // §2.11 a nation's idea (after the veins: surface iron is never a rich vein)
  return { tiles, rivers, wonders, spawns, spawnValues, spread, wild, herd };
}

/** §12.1 The globe's land and ice: a few continents around random centres, warped by noise, with ridges and basins;
 *  moisture by noise; the region of a tile is its hemisphere (west < 0° < east); the polar caps are the ice wall. */
export const GLOBE = { continents: [5, 8] as [number, number], radius: [0.35, 0.7] as [number, number], cap: 78, capJitter: 5, cold: 55, tropic: 23 };
function globeShapes(T: number, rand: Rand, S: number[], elev: Float32Array, moist: Float32Array, sdv: Float32Array, wall: Uint8Array): void {
  const [S1, S2, S3] = S, K = GLOBE.continents[0] + Math.floor(rand() * (GLOBE.continents[1] - GLOBE.continents[0] + 1));
  const centres: Array<{ p: number[]; r: number }> = [];
  for (let k = 0; k < K; k++) {
    // a uniform point, away from the poles
    const z = (rand() * 2 - 1) * 0.8, a = rand() * Math.PI * 2, q = Math.sqrt(1 - z * z);
    centres.push({ p: [q * Math.cos(a), z, q * Math.sin(a)], r: GLOBE.radius[0] + rand() * (GLOBE.radius[1] - GLOBE.radius[0]) });
  }
  for (let i = 0; i < T; i++) {
    const p = pointOf(i)!;
    const w = [p[0] + (fbm3(p[0] * 3, p[1] * 3, p[2] * 3, S3, 3) - 0.5) * 0.35, p[1] + (fbm3(p[0] * 3 + 7, p[1] * 3, p[2] * 3, S3, 3) - 0.5) * 0.35, p[2] + (fbm3(p[0] * 3, p[1] * 3 + 5, p[2] * 3, S3, 3) - 0.5) * 0.35];
    const wl = Math.hypot(w[0], w[1], w[2]);
    let m = 0;
    for (const c of centres) { const ang = Math.acos(Math.max(-1, Math.min(1, (w[0] * c.p[0] + w[1] * c.p[1] + w[2] * c.p[2]) / wl))); m = Math.max(m, 1 - ang / c.r); }
    elev[i] = 0.62 * Math.max(0, m) + 0.38 * fbm3(p[0] * 2.5 + 3, p[1] * 2.5, p[2] * 2.5, S1, 5);
    moist[i] = fbm3(p[0] * 2 + 11, p[1] * 2 + 5, p[2] * 2, S2, 4);
    sdv[i] = col(i);
    const lat = Math.abs(row(i)), cap = GLOBE.cap + (fbm3(p[0] * 4, p[1] * 4, p[2] * 4, S[4], 3) - 0.5) * 2 * GLOBE.capJitter;
    if (lat >= cap) wall[i] = 1;
  }
}

export const RESOURCE_KEYS: ResKey[] = ["game", "plants", "fish", "wood", "stone", "flint", "clay", "salt", "reeds", "herbs", "horse", "copper", "tin", "iron", "coal", "sulfur", "oil",
  "honey", "spice", "fur", "amber", "ochre", "marble", "gold", "silver", "gems", "shellfish", "pearl", "coral", "whale",
  "wolf", "wild_goat", "aurochs", "boar", "junglefowl"];

/** §2.1 Coal, oil, sulfur (hidden) and wild horses, laid with their own random stream so the rest of the
 *  map is unchanged; also run once on worlds made before they existed. Sets reserves and caps. */
/** §2.10 Rich veins: a few of each good's deposits, spread over the map, hold far more and yield more. */
export function seedVeins(seed: string, tiles: Tile[], goods: string[] = Object.keys(VEIN.count)): void {
  const rand = rngFor(seed, "veins", goods.join(","));
  for (const k of goods as ResKey[]) {
    const count = VEIN.count[k] ?? 0, picked: number[] = [];
    const sea = (VEIN.water as string[]).includes(k); // fishing grounds, pearl beds and whale roads lie at sea; the rest on land
    for (const t of shuffle(tiles.filter(t => !t.vein && t.land !== sea && (t.cap[k] || 0) > 0).map(t => t.i), rand)) {
      if (picked.length >= count) break;
      if (picked.some(j => dist(j, t) < VEIN.apart)) continue;
      const x = tiles[t]; picked.push(t);
      x.vein = k;
      const more = Math.round((x.cap[k] || 0) * (VEIN.mult - 1));
      x.res[k] = (x.res[k] || 0) + more; x.cap[k] = (x.cap[k] || 0) + more;
    }
  }
}

/** §2.11 The riches of land and sea beyond the basics: luxuries, precious ores, marble, and the sea's own goods. */
export function seedRiches(seed: string, tiles: Tile[]): void {
  const rand = rngFor(seed, "riches"), jit = (v: number) => Math.round(v * (0.7 + rand() * 0.6));
  const put = (t: Tile, k: ResKey, v: number) => { t.res[k] = (t.res[k] || 0) + v; t.cap[k] = (t.cap[k] || 0) + v; };
  const near = (t: Tile, terr: string[], r: number) => within(t.i, r).some(j => terr.includes(tiles[j].terrain));
  for (const t of tiles) {
    const z = t.zone, chance = (p: number) => rand() < p;
    switch (t.terrain) {
      case "forest":
        if (chance(0.25)) put(t, "honey", jit(15));
        if (z === "trop" && chance(0.12)) put(t, "spice", jit(20));
        if (z === "cold" && chance(0.3)) put(t, "fur", jit(25));
        break;
      case "jungle": if (chance(0.3)) put(t, "honey", jit(15)); if (chance(0.5)) put(t, "spice", jit(20)); break;
      case "grass": if (z !== "cold" && chance(0.1)) put(t, "honey", jit(15)); if (z === "trop" && chance(0.12)) put(t, "spice", jit(20)); break;
      case "taiga": if (chance(0.5)) put(t, "fur", jit(25)); break;
      case "tundra": if (chance(0.4)) put(t, "fur", jit(25)); break;
      case "glacier": if (chance(0.3)) put(t, "fur", jit(25)); break;
      case "hill":
        if (chance(0.15)) put(t, "ochre", jit(60));
        if (chance(0.05)) put(t, "marble", jit(300));
        if (chance(0.03)) put(t, "gold", jit(30));
        if (chance(0.02)) put(t, "silver", jit(40));
        break;
      case "mountain":
        if (chance(0.08)) put(t, "marble", jit(300));
        if (chance(0.04)) put(t, "gold", jit(30));
        if (chance(0.05)) put(t, "silver", jit(40));
        if (chance(0.03)) put(t, "gems", jit(15));
        break;
      case "desert": if (chance(0.12)) put(t, "ochre", jit(60)); break;
      case "coast":
        if (chance(0.6)) put(t, "shellfish", jit(30));
        if (z !== "trop" && chance(0.1)) put(t, "amber", jit(20));
        break;
      case "shallow":
        if (chance(0.2)) put(t, "shellfish", jit(25));
        if (chance(z === "trop" ? 0.08 : z === "temp" ? 0.03 : 0)) put(t, "pearl", jit(12));
        if (z === "trop" && chance(0.06)) put(t, "coral", jit(10));
        break;
      case "ocean": if (chance(z === "trop" ? 0.02 : 0.04)) put(t, "whale", jit(20)); break;
    }
    // gold washed down from the hills into the rivers
    if (t.river && t.land && chance(0.06) && near(t, ["hill", "mountain"], 2)) put(t, "gold", jit(20));
  }
}

/** §2.1 The river's plenty: more fish, wild grain and reeds on every river tile (after the spawns, so fair starts stay fair). */
export function seedRiverPlenty(seed: string, tiles: Tile[]): void {
  const rand = rngFor(seed, "river-plenty"), jit = (v: number) => Math.round(v * (0.7 + rand() * 0.6));
  for (const t of tiles) {
    if (!t.river || !t.land) continue;
    for (const [k, v] of Object.entries(RIVER.plenty) as Array<[ResKey, number]>) { const x = jit(v); t.res[k] = (t.res[k] || 0) + x; t.cap[k] = (t.cap[k] || 0) + x; }
  }
}

/** §2.11 Meadow herbs (a nation's idea): every grass and hill tile holds a few healing plants, so steppe peoples have medicine too. */
export function seedMeadowHerbs(seed: string, tiles: Tile[]): void {
  const rand = rngFor(seed, "meadow-herbs");
  for (const t of tiles) {
    if (!MEADOW_HERBS.terrains.includes(t.terrain)) continue;
    const x = MEADOW_HERBS.min + Math.floor(rand() * (MEADOW_HERBS.max - MEADOW_HERBS.min + 1));
    t.res.herbs = (t.res.herbs || 0) + x; t.cap.herbs = (t.cap.herbs || 0) + x;
  }
}

/** §2.11 Rock salt (a nation's idea): some hills and deserts hold a seam of salt, so inland peoples can salt their food too. */
export function seedRockSalt(seed: string, tiles: Tile[]): void {
  const rand = rngFor(seed, "rock-salt");
  for (const t of tiles) {
    const p = ROCK_SALT.chance[t.terrain]; if (!p) continue;
    if (rand() >= p) continue;
    const x = ROCK_SALT.min + Math.floor(rand() * (ROCK_SALT.max - ROCK_SALT.min + 1));
    t.res.salt = (t.res.salt || 0) + x; t.cap.salt = (t.cap.salt || 0) + x;
  }
}

/** §2.11 Surface iron (a nation's idea): iron gravel on some hills with no iron, so a people far from the iron
 *  veins can still smelt some. */
export function seedSurfaceIron(seed: string, tiles: Tile[]): void {
  const rand = rngFor(seed, "surface-iron");
  for (const t of tiles) {
    if (t.terrain !== "hill" || (t.res.iron || 0) > 0 || (t.cap.iron || 0) > 0 || rand() >= SURFACE_IRON.chance) continue;
    const x = SURFACE_IRON.min + Math.floor(rand() * (SURFACE_IRON.max - SURFACE_IRON.min + 1));
    t.res.iron = x; t.cap.iron = x; t.surfaceIron = true;
  }
}

/** §6.4 Wild herds that hunters can bring home alive: wolves, wild goats, aurochs, boars, junglefowl. */
export function seedAnimals(seed: string, tiles: Tile[]): void {
  const rand = rngFor(seed, "animals"), jit = (v: number) => Math.round(v * (0.7 + rand() * 0.6));
  const put = (t: Tile, k: ResKey, v: number) => { t.res[k] = (t.res[k] || 0) + v; t.cap[k] = (t.cap[k] || 0) + v; };
  for (const t of tiles) {
    const r = () => rand();
    switch (t.terrain) {
      case "forest": if (r() < 0.08) put(t, "wolf", jit(10)); if (r() < 0.08) put(t, "boar", jit(15)); break;
      case "taiga": if (r() < 0.1) put(t, "wolf", jit(10)); break;
      case "hill": if (r() < 0.15) put(t, "wild_goat", jit(20)); break;
      case "mountain": if (r() < 0.1) put(t, "wild_goat", jit(20)); break;
      case "grass": if (r() < 0.08) put(t, "aurochs", jit(15)); if (t.zone === "trop" && r() < 0.06) put(t, "junglefowl", jit(20)); break;
      case "jungle": if (r() < 0.1) put(t, "boar", jit(15)); if (r() < 0.12) put(t, "junglefowl", jit(20)); break;
      case "tundra": if (r() < 0.05) put(t, "wolf", jit(10)); break;
    }
  }
}

export function seedDeepResources(seed: string, tiles: Tile[]): void {
  const rand = rngFor(seed, "deep-resources"), jit = (v: number) => Math.round(v * (0.7 + rand() * 0.6));
  const volcano = tiles.find(t => t.wonder === "volcano");
  const put = (t: Tile, k: ResKey, v: number) => { t.res[k] = (t.res[k] || 0) + v; t.cap[k] = (t.cap[k] || 0) + v; };
  for (const t of tiles) {
    const r = rand();
    switch (t.terrain) {
      case "hill": case "mountain":
        if (r < 0.12) put(t, "coal", jit(150));
        else if (r < (volcano && dist(volcano.i, t.i) <= 4 ? 0.5 : 0.16)) put(t, "sulfur", jit(60));
        break;
      case "forest": case "taiga": if (r < 0.04) put(t, "coal", jit(120)); break;
      case "swamp": if (r < 0.06) put(t, "coal", jit(120)); else if (r < 0.12) put(t, "oil", jit(180)); break;
      case "desert": if (r < 0.08) put(t, "oil", jit(250)); break;
      case "coast": if (r < 0.04) put(t, "oil", jit(180)); break;
      case "shallow": if (r < 0.015) put(t, "oil", jit(200)); break;
      case "grass": case "tundra": if (r < 0.12) put(t, "horse", jit(30)); break;
    }
  }
}
