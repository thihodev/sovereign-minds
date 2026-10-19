// World generation (§12.5). Same algorithm as the map preview page:
// two continents joined by an isthmus, an archipelago, rivers, wonders,
// and fair spawn points. Same seed -> same world.

import { N, TILE_COUNT, NEIGHBORS, dist, within } from "./hex.ts";
import { xmur3, mulberry32, fbm, shuffle, type Rand } from "./rng.ts";
import { WONDER_DEFS } from "./rules.ts";
import type { Tile, Wonder, ResKey } from "./types.ts";

const AX = Math.sqrt(3) / 1.5;

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

export function generateWorld(seedStr: string, nNations: number): GeneratedWorld {
  const sf = xmur3(seedStr);
  const S1 = sf() | 0, S2 = sf() | 0, S3 = sf() | 0, S4 = sf() | 0;
  const rand: Rand = mulberry32(sf());
  const T = TILE_COUNT, J = () => (rand() - 0.5) * 0.08;
  const c1 = { x: (0.26 + J()) * AX, y: 0.38 + J() }, c2 = { x: (0.74 + J()) * AX, y: 0.62 + J() };
  const isl = { x: (0.11 + J() * 0.5) * AX, y: 0.90 };
  const mx = (c1.x + c2.x) / 2, my = (c1.y + c2.y) / 2;
  let ux = c2.x - c1.x, uy = c2.y - c1.y;
  const ul = Math.hypot(ux, uy); ux /= ul; uy /= ul;

  const elev = new Float32Array(T), moist = new Float32Array(T), sdv = new Float32Array(T);
  for (let i = 0; i < T; i++) {
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
  const thr = Array.from(elev).sort((a, b) => b - a)[Math.floor(T * 0.55)];
  const land = new Uint8Array(T);
  for (let i = 0; i < T; i++) land[i] = elev[i] > thr ? 1 : 0;

  // Isthmus: walk from the midpoint toward each continent until existing land.
  const forced = new Uint8Array(T);
  const tileAt = (px: number, py: number) => {
    const r = Math.round(py * N); if (r < 0 || r >= N) return -1;
    const c = Math.round((px / AX) * N - 0.5 * (r & 1)); return (c < 0 || c >= N) ? -1 : r * N + c;
  };
  for (const toward of [c1, c2]) {
    for (let t = 0; t <= 1; t += 0.004) {
      const i = tileAt(mx + (toward.x - mx) * t, my + (toward.y - my) * t);
      if (i < 0) continue;
      if (land[i] && !forced[i]) break;
      land[i] = 1; forced[i] = 1; elev[i] = Math.max(elev[i], thr + 0.002);
      const k = NEIGHBORS[i][Math.floor(t * 1000) % NEIGHBORS[i].length];
      if (!land[k]) { land[k] = 1; forced[k] = 1; elev[k] = Math.max(elev[k], thr + 0.002); }
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
    const r = (i / N) | 0, zone = r <= 12 ? "cold" : r >= 51 ? "trop" : "temp";
    const t: Tile = { i, terrain: "ocean", zone, region: null, land: !!land[i], elev: Math.round(elev[i] * 1000) / 1000, river: false, delta: false, res: {}, cap: {}, wonder: null, owner: -1 };
    if (land[i]) {
      t.region = compSize[comp[i]] < 60 ? "isl" : (sdv[i] < 0 ? "west" : "east");
      const m = mRank[i], e = elev[i];
      if (e >= mThr && !forced[i]) t.terrain = "mountain";
      else if (e >= hThr && !forced[i]) t.terrain = "hill";
      else if (zone === "cold") t.terrain = m > 0.5 ? "taiga" : "tundra";
      else if (zone === "temp") t.terrain = m < 0.08 ? "desert" : m > 0.62 ? "forest" : (m > 0.52 && e < lowThr) ? "swamp" : "grass";
      else t.terrain = m < 0.22 ? "desert" : m > 0.55 ? "jungle" : (m > 0.45 && e < lowThr) ? "swamp" : "grass";
    }
    tiles[i] = t;
  }
  for (const t of tiles) {
    if (!t.land) { t.terrain = within(t.i, 2).some(j => land[j]) ? "shallow" : "ocean"; continue; }
    if (["grass", "desert", "tundra"].includes(t.terrain) && NEIGHBORS[t.i].some(j => !land[j])) t.terrain = "coast";
  }

  // Rivers
  const rivers: number[][] = [];
  const sources = shuffle(landIdx.filter(i => tiles[i].terrain === "mountain" || (tiles[i].terrain === "hill" && elev[i] > hThr + 0.01)), rand);
  const usedSrc: number[] = [];
  for (const s of sources) {
    if (rivers.length >= 8) break;
    if (usedSrc.some(u => dist(u, s) < 7)) continue;
    const path = [s], seen = new Set([s]); let cur = s, end: number | null = null;
    for (let step = 0; step < 90; step++) {
      const nbs = NEIGHBORS[cur];
      const sea = nbs.find(j => !land[j]); if (sea !== undefined) { end = sea; break; }
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
  for (const t of tiles) if (t.river && NEIGHBORS[t.i].some(j => !land[j])) t.delta = true;

  // Reserves (±30%)
  const jit = (v: number) => Math.round(v * (0.7 + rand() * 0.6));
  for (const t of tiles) {
    const R = t.res;
    switch (t.terrain) {
      case "grass": R.game = jit(70); R.plants = jit(50); break;
      case "forest": R.wood = jit(200); R.game = jit(60); R.plants = jit(30); break;
      case "taiga": R.wood = jit(200); R.game = jit(50); break;
      case "jungle": R.wood = jit(150); R.plants = jit(80); break;
      case "hill": R.stone = jit(500); if (rand() < 0.4) R.flint = jit(40); if (rand() < 0.2) R.copper = jit(80); if (rand() < 0.02) R.tin = jit(60); break;
      case "mountain": R.stone = jit(500); if (rand() < 0.1) R.copper = jit(80); if (rand() < 0.06) R.tin = jit(60); if (rand() < 0.08) R.iron = jit(100); break;
      case "coast": R.fish = jit(60); R.plants = jit(20); if (rand() < 0.25) R.salt = jit(30); break;
      case "swamp": R.clay = jit(150); R.reeds = jit(60); break;
      case "desert": R.stone = jit(300); break;
      case "tundra": R.game = jit(80); R.stone = jit(300); break;
      case "shallow": R.fish = jit(60); break;
    }
    if (t.river) { R.fish = (R.fish || 0) + jit(60); R.clay = (R.clay || 0) + jit(150); }
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
      return wonders.every(o => dist(o.i, i) >= 6);
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

  // Spawns: same value band (±5%), ≥ 12 apart, spread over climate zones
  const areaVal = (i: number) => Math.round(within(i, 3).reduce((s, j) => s + tileValue(tiles[j]), 0));
  const okTerr = ["grass", "forest", "taiga", "coast", "hill", "tundra", "jungle"];
  const cands = landIdx.filter(i => {
    const t = tiles[i], c = i % N, r = (i / N) | 0;
    return t.region !== "isl" && okTerr.includes(t.terrain) && !t.wonder && r >= 3 && r <= N - 4 && c >= 3 && c <= N - 4 && wonders.every(w => dist(w.i, i) > 3);
  }).map(i => ({ i, v: areaVal(i), zone: tiles[i].zone }));
  // Every people needs the basics within reach: wood, stone and meat or fish (§2.1).
  const basics = (i: number) => {
    let wood = 0, stone = 0, meat = 0;
    for (const j of within(i, 2)) { const R = tiles[j].res; wood += R.wood || 0; stone += R.stone || 0; meat += (R.game || 0) + (R.fish || 0); }
    return wood >= 150 && stone >= 150 && meat >= 80;
  };
  const withBasics = cands.filter(c => basics(c.i));
  if (withBasics.length >= nNations * 6) cands.splice(0, cands.length, ...withBasics);
  const sortedV = cands.map(c => c.v).sort((a, b) => a - b);
  let best: { score: number; chosen: typeof cands } | null = null;
  for (const p of [0.5, 0.6, 0.4, 0.7, 0.3, 0.55, 0.45, 0.65, 0.35]) {
    const T0 = sortedV[Math.floor(sortedV.length * p)], band = cands.filter(c => c.v >= T0 * 0.95 && c.v <= T0 * 1.05);
    for (let a = 0; a < 250; a++) {
      const chosen: typeof cands = [];
      for (const c of shuffle(band.slice(), rand)) { if (chosen.every(o => dist(o.i, c.i) >= 12)) chosen.push(c); if (chosen.length === nNations) break; }
      if (chosen.length < nNations) continue;
      const zones = new Set(chosen.map(c => c.zone)).size;
      // Neighbours 12–18 tiles apart meet within a few dozen ticks; farther apart they never do.
      const nearest = chosen.map(c => Math.min(...chosen.filter(o => o !== c).map(o => dist(c.i, o.i))));
      const tooFar = nearest.reduce((x, d) => x + Math.max(0, d - 18), 0);
      const score = zones * 1000 - tooFar * 10 + Math.min(...nearest);
      if (!best || score > best.score) best = { score, chosen };
    }
    if (best && new Set(best.chosen.map(c => c.zone)).size >= Math.min(3, nNations)) break;
  }
  if (!best) {
    const chosen: typeof cands = [];
    for (const c of shuffle(cands.slice(), rand)) { if (chosen.every(o => dist(o.i, c.i) >= 10)) chosen.push(c); if (chosen.length === nNations) break; }
    best = { score: 0, chosen };
  }
  const spawnsSorted = best.chosen.slice().sort((a, b) => a.i - b.i);
  const spawns = spawnsSorted.map(c => c.i), spawnValues = spawnsSorted.map(c => c.v);
  const spread = spawnValues.length ? (Math.max(...spawnValues) - Math.min(...spawnValues)) / Math.max(...spawnValues) : 0;

  // Wilderness: farthest from every spawn
  const wild: number[] = [];
  const far = landIdx.filter(i => tiles[i].region !== "isl" && tiles[i].terrain !== "mountain")
    .map(i => ({ i, d: spawns.length ? Math.min(...spawns.map(s => dist(s, i))) : 99 }))
    .sort((a, b) => b.d - a.d || a.i - b.i);
  for (const f of far) { if (wild.length >= 3) break; if (f.d >= 8 && wild.every(w => dist(w, f.i) >= 14)) wild.push(f.i); }

  // Bison migration route
  let herd: [number, number] | null = null;
  const grass = landIdx.filter(i => tiles[i].terrain === "grass" && tiles[i].region !== "isl");
  for (let a = 0; a < 400 && grass.length > 2; a++) {
    const p = grass[Math.floor(rand() * grass.length)], q = grass[Math.floor(rand() * grass.length)];
    const d = dist(p, q);
    if (d >= 12 && d <= 20 && tiles[p].region === tiles[q].region) { herd = [p, q]; break; }
  }

  return { tiles, rivers, wonders, spawns, spawnValues, spread, wild, herd };
}

export const RESOURCE_KEYS: ResKey[] = ["game", "plants", "fish", "wood", "stone", "flint", "clay", "salt", "reeds", "copper", "tin", "iron"];
