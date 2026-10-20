// Hex grid helpers: 128 x 128 tiles, pointy-top, "odd-r" offset layout.
// A tile is addressed by its index i = row * N + col.

export const N = 128;
export const TILE_COUNT = N * N;

const DIRS = [
  [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]],
  [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]],
];

export const NEIGHBORS: number[][] = [];
for (let i = 0; i < TILE_COUNT; i++) {
  const c = i % N, r = (i / N) | 0, out: number[] = [];
  for (const [dc, dr] of DIRS[r & 1]) {
    const nc = c + dc, nr = r + dr;
    if (nc >= 0 && nc < N && nr >= 0 && nr < N) out.push(nr * N + nc);
  }
  NEIGHBORS.push(out);
}

export function col(i: number): number { return i % N; }
export function row(i: number): number { return (i / N) | 0; }
export function idx(c: number, r: number): number { return r * N + c; }
export function inBounds(c: number, r: number): boolean { return c >= 0 && c < N && r >= 0 && r < N; }

function cube(i: number): [number, number, number] {
  const c = i % N, r = (i / N) | 0, q = c - (r - (r & 1)) / 2;
  return [q, r, -q - r];
}

export function dist(i: number, j: number): number {
  const a = cube(i), b = cube(j);
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

export function within(i: number, rad: number): number[] {
  const c = i % N, r = (i / N) | 0, out: number[] = [];
  for (let rr = Math.max(0, r - rad); rr <= Math.min(N - 1, r + rad); rr++) {
    for (let cc = Math.max(0, c - rad - 1); cc <= Math.min(N - 1, c + rad + 1); cc++) {
      const j = rr * N + cc;
      if (dist(i, j) <= rad) out.push(j);
    }
  }
  return out;
}
