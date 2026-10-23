// The shape of the world (§12.1). Two shapes share one way of addressing tiles (an index 0 … TILE_COUNT − 1) and one set
// of helpers (NEIGHBORS, dist, within, col, row, stepDir, findTile), so every rule works on both:
// - "flat": the old world, 128 × 128 pointy-top hexes in an "odd-r" offset layout, i = row × N + col, ringed by the
//   Ice Wall. Its numbers are exactly those of every version before v0.67.
// - "sphere" (v0.67): a globe of hexagons, the dual of an icosahedron whose edges are cut in `freq` parts: 10·freq² + 2
//   tiles, each with six neighbours but for twelve with five. A tile is named by its longitude and latitude, and
//   col() / row() return them (degrees, one decimal), so "[col, row]" reads "[lon, lat]" there.
// The world's shape is set once per world (useWorld); the bindings below follow it.

export type Shape = { kind: "flat" } | { kind: "sphere"; freq: number };

export const N = 128;
export const FLAT_COUNT = N * N;

interface Topology {
  shape: Shape; count: number; neighbors: number[][];
  /** the unit vector of each tile's centre (the globe only) */
  points?: number[][];
  col(i: number): number; row(i: number): number;
  dist(i: number, j: number): number; within(i: number, rad: number): number[];
  step(i: number, dir: string): number; find(a: number, b: number): number;
}

// ---------------------------------------------------------------- flat

const ODD_R = [
  [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]],
  [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]],
];
const FLAT_STEPS: Record<string, [number[], number[]]> = {
  E: [[1, 0], [1, 0]], NE: [[0, -1], [1, -1]], NW: [[-1, -1], [0, -1]], W: [[-1, 0], [-1, 0]], SW: [[-1, 1], [0, 1]], SE: [[0, 1], [1, 1]],
};
function flatTopology(): Topology {
  const neighbors: number[][] = [];
  for (let i = 0; i < FLAT_COUNT; i++) {
    const c = i % N, r = (i / N) | 0, out: number[] = [];
    for (const [dc, dr] of ODD_R[r & 1]) {
      const nc = c + dc, nr = r + dr;
      if (nc >= 0 && nc < N && nr >= 0 && nr < N) out.push(nr * N + nc);
    }
    neighbors.push(out);
  }
  const cube = (i: number): [number, number, number] => { const c = i % N, r = (i / N) | 0, q = c - (r - (r & 1)) / 2; return [q, r, -q - r]; };
  const dist = (i: number, j: number) => { const a = cube(i), b = cube(j); return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])); };
  const inside = (c: number, r: number) => c >= 0 && c < N && r >= 0 && r < N;
  return {
    shape: { kind: "flat" }, count: FLAT_COUNT, neighbors,
    col: i => i % N, row: i => (i / N) | 0, dist,
    within(i, rad) {
      const c = i % N, r = (i / N) | 0, out: number[] = [];
      for (let rr = Math.max(0, r - rad); rr <= Math.min(N - 1, r + rad); rr++)
        for (let cc = Math.max(0, c - rad - 1); cc <= Math.min(N - 1, c + rad + 1); cc++) { const j = rr * N + cc; if (dist(i, j) <= rad) out.push(j); }
      return out;
    },
    step(i, d) { const s = FLAT_STEPS[d]; if (!s) return -1; const c = i % N, r = (i / N) | 0, [dc, dr] = s[r & 1]; return inside(c + dc, r + dr) ? (r + dr) * N + c + dc : -1; },
    find(c, r) { return Number.isInteger(c) && Number.isInteger(r) && inside(c, r) ? r * N + c : -1; },
  };
}

// ---------------------------------------------------------------- sphere

/** The bearing of each direction an expedition may take, in degrees from east, counter-clockwise (north 90). */
export const BEARING: Record<string, number> = { E: 0, NE: 60, N: 90, NW: 120, W: 180, SW: 240, S: 270, SE: 300 };

function sphereTopology(freq: number): Topology {
  // the icosahedron
  const t = (1 + Math.sqrt(5)) / 2;
  const V0 = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map(v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; });
  const F0 = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  // every point of the cut faces, made one where faces meet (keyed on the rounded unit vector)
  const pts: number[][] = [], key = new Map<string, number>(), edges = new Set<string>();
  const point = (x: number, y: number, z: number) => {
    const l = Math.hypot(x, y, z), u = [x / l, y / l, z / l], k = u.map(c => Math.round(c * 1e7)).join(",");
    let id = key.get(k); if (id === undefined) { id = pts.length; pts.push(u); key.set(k, id); }
    return id;
  };
  const link = (a: number, b: number) => { if (a !== b) edges.add(a < b ? `${a},${b}` : `${b},${a}`); };
  for (const [ia, ib, ic] of F0) {
    const A = V0[ia], B = V0[ib], C = V0[ic], grid: number[][] = [];
    for (let i = 0; i <= freq; i++) {
      grid.push([]);
      for (let j = 0; j <= freq - i; j++) {
        const a = (freq - i - j) / freq, b = i / freq, c = j / freq;
        grid[i].push(point(A[0] * a + B[0] * b + C[0] * c, A[1] * a + B[1] * b + C[1] * c, A[2] * a + B[2] * b + C[2] * c));
      }
    }
    for (let i = 0; i <= freq; i++) for (let j = 0; j <= freq - i; j++) {
      if (j + 1 <= freq - i) link(grid[i][j], grid[i][j + 1]);
      if (i + 1 <= freq && j <= freq - i - 1) { link(grid[i][j], grid[i + 1][j]); link(grid[i][j + 1], grid[i + 1][j]); }
    }
  }
  // tiles ordered north to south, then west to east, so neighbouring tiles lie near each other in memory
  const lat = pts.map(p => Math.asin(Math.max(-1, Math.min(1, p[1]))) * 180 / Math.PI);
  const lon = pts.map(p => Math.atan2(p[2], p[0]) * 180 / Math.PI);
  const band = 180 / (3 * freq);
  const order = pts.map((_, k) => k).sort((a, b) => Math.round((90 - lat[a]) / band) - Math.round((90 - lat[b]) / band) || lon[a] - lon[b] || a - b);
  const at = new Int32Array(pts.length); order.forEach((k, i) => { at[k] = i; });
  const P = order.map(k => pts[k]), LAT = order.map(k => Math.round(lat[k] * 10) / 10), LON = order.map(k => Math.round(lon[k] * 10) / 10);
  const neighbors: number[][] = P.map(() => []);
  for (const e of edges) { const [a, b] = e.split(",").map(Number); neighbors[at[a]].push(at[b]); neighbors[at[b]].push(at[a]); }
  // each tile's neighbours counter-clockwise from east, like the flat ones
  const bearing = (i: number, j: number) => {
    const p = P[i], q = P[j], east = [-p[2], 0, p[0]], el = Math.hypot(east[0], east[2]) || 1;
    const e = [east[0] / el, 0, east[2] / el], nrt = [e[1] * p[2] - e[2] * p[1], e[2] * p[0] - e[0] * p[2], e[0] * p[1] - e[1] * p[0]]; // north = east × up
    const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    const b = Math.atan2(d[0] * nrt[0] + d[1] * nrt[1] + d[2] * nrt[2], d[0] * e[0] + d[1] * e[1] + d[2] * e[2]) * 180 / Math.PI;
    return (b + 360) % 360;
  };
  for (let i = 0; i < neighbors.length; i++) neighbors[i].sort((a, b) => bearing(i, a) - bearing(i, b) || a - b);
  // one step is the mean angle between neighbours
  let sum = 0, k2 = 0;
  for (let i = 0; i < P.length; i += 7) for (const j of neighbors[i]) { sum += angle(P[i], P[j]); k2++; }
  const stepAngle = sum / k2;
  const dist = (i: number, j: number) => (i === j ? 0 : Math.max(1, Math.round(angle(P[i], P[j]) / stepAngle)));
  const rings = new Map<number, number[]>(), mark = new Uint32Array(P.length); let stamp = 0, ringSize = 0;
  return {
    shape: { kind: "sphere", freq }, count: P.length, neighbors, points: P,
    col: i => LON[i], row: i => LAT[i], dist,
    within(i, rad) {
      // the rings out to rad steps, as on the flat world (1 + 6 + 12 + …); kept, as the rules ask the same rings each turn
      const key = i * 256 + Math.max(0, Math.min(255, rad)), hit = rings.get(key);
      if (hit) return hit.slice();
      if (++stamp === 0xffffffff) { mark.fill(0); stamp = 1; }
      const out = [i]; mark[i] = stamp; let ring = [i];
      for (let r = 0; r < rad && ring.length; r++) { const next: number[] = []; for (const k of ring) for (const j of neighbors[k]) if (mark[j] !== stamp) { mark[j] = stamp; next.push(j); out.push(j); } ring = next; }
      out.sort((a, b) => a - b);
      if ((ringSize += out.length) > 4e6) { rings.clear(); ringSize = out.length; }
      rings.set(key, out);
      return out.slice();
    },
    step(i, d) {
      const want = BEARING[d]; if (want === undefined) return -1;
      let best = -1, off = Infinity;
      for (const j of neighbors[i]) { const o = Math.abs(((bearing(i, j) - want + 540) % 360) - 180); if (o < off) { off = o; best = j; } }
      return off <= 45 ? best : -1;
    },
    find(lo, la) {
      if (!Number.isFinite(lo) || !Number.isFinite(la) || la < -90 || la > 90) return -1;
      const r = Math.PI / 180, q = [Math.cos(la * r) * Math.cos(lo * r), Math.sin(la * r), Math.cos(la * r) * Math.sin(lo * r)];
      let best = -1, dot = -2;
      for (let i = 0; i < P.length; i++) { const d = P[i][0] * q[0] + P[i][1] * q[1] + P[i][2] * q[2]; if (d > dot) { dot = d; best = i; } }
      return best;
    },
  };
}
function angle(a: number[], b: number[]): number { return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))); }

// ---------------------------------------------------------------- the world's shape now

const cache = new Map<string, Topology>();
function topologyOf(shape: Shape): Topology {
  const k = shape.kind === "flat" ? "flat" : `sphere:${shape.freq}`;
  let t = cache.get(k);
  if (!t) { t = shape.kind === "flat" ? flatTopology() : sphereTopology(shape.freq); cache.set(k, t); }
  return t;
}
let T = topologyOf({ kind: "flat" });

export let TILE_COUNT = T.count;
export let NEIGHBORS: number[][] = T.neighbors;
/** The shape every helper follows from now on. */
export function useShape(shape: Shape = { kind: "flat" }): void {
  const t = topologyOf(shape);
  if (t === T) return;
  T = t; TILE_COUNT = t.count; NEIGHBORS = t.neighbors;
}
/** The shape a world was made with (worlds before v0.67 are flat), and switch to it. */
export function useWorld(world: { shape?: Shape }): void { useShape(world.shape ?? { kind: "flat" }); }
export const currentShape = (): Shape => T.shape;
export const tileCountOf = (shape: Shape = { kind: "flat" }): number => (shape.kind === "flat" ? FLAT_COUNT : 10 * shape.freq * shape.freq + 2);

/** The globe: the unit vector of a tile's centre (y toward the north pole); undefined on the flat world. */
export function pointOf(i: number): number[] | undefined { return T.points?.[i]; }

/** Flat: the column; sphere: the longitude (degrees, one decimal). */
export function col(i: number): number { return T.col(i); }
/** Flat: the row; sphere: the latitude (degrees, one decimal). */
export function row(i: number): number { return T.row(i); }
/** Flat only: the index of a column and row. */
export function idx(c: number, r: number): number { return r * N + c; }
/** Flat only: is this column and row on the map? */
export function inBounds(c: number, r: number): boolean { return c >= 0 && c < N && r >= 0 && r < N; }
/** Steps between two tiles (on the sphere, the arc between their centres in mean steps). */
export function dist(i: number, j: number): number { return T.dist(i, j); }
/** Every tile within rad steps of i, i itself included. */
export function within(i: number, rad: number): number[] { return T.within(i, rad); }
/** The neighbour of i that way (E, NE, NW, W, SW, SE; on the sphere also N, S), or −1. */
export function stepDir(i: number, dir: string): number { return T.step(i, dir); }
/** The tile named by [col, row] (flat) or [lon, lat] (sphere: the nearest), or −1. */
export function findTile(a: number, b: number): number { return T.find(a, b); }
