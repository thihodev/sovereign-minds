// What the flat 3D map (web/map3d.js) and the globe (web/globe3d.js) share: the small shapes, the woods' kinds,
// how the woods, the roads, the towns, their works and the power lines are laid out, who walks and sails where,
// and the materials of the rivers, the smoke, the gulls and the towns' lights.
//
// The layout works in a tile's own flat frame, as on the flat map: x to the east, z to the south, y up, a tile's
// neighbours √3 apart. The map hands it an "env" E that answers in that frame: E.pos(i) is a tile's centre,
// E.surf(x, z) the ground (below the sea too), E.ground(x, z) the ground or the sea, E.riverAt(x, z) how deep a
// river has cut there. On the flat map the frame is the map itself; on the globe E.anchor(i) sets it round the
// tile being laid out (its tangent plane) and every shape is carried from there onto the ball.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/BufferGeometryUtils.js";

export const SQ3 = Math.sqrt(3);
export const WATER = new Set(["ocean", "shallow"]);
export const ROAD_COLOR = [null, "#94744c", "#a89670", "#bdb8ac", "#4f4a46"];
export const hash = (...k) => { let h = 2166136261; for (const x of k) { h ^= x; h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/** A builder of plain triangles with a colour each, for roads, rails and the map's edge. */
export class Tris {
  constructor() { this.p = []; this.c = []; }
  tri(a, b, c, col) { for (const v of [a, b, c]) { this.p.push(v[0], v[1], v[2]); this.c.push(col.r, col.g, col.b); } }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals();
    return g;
  }
}

// ------------------------------------------------------------------ small shapes, placed many times (unit size, standing on y = 0)
function gable() { // a roof: two slopes along z, gables at both ends
  const p = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5, 0, 1, 0.5, -0.5, 0, -0.5, 0, 1, -0.5, 0, 1, 0.5, -0.5, 0, -0.5, 0, 1, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, 0, 1, 0.5, 0.5, 0, -0.5, 0, 1, 0.5, 0, 1, -0.5];
  // every face turned outwards (away from the roof's middle)
  for (let k = 0; k < p.length; k += 9) {
    const a = p.slice(k, k + 3), b = p.slice(k + 3, k + 6), c = p.slice(k + 6, k + 9);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3 - 0.33, (a[2] + b[2] + c[2]) / 3];
    if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) for (let q = 0; q < 3; q++) [p[k + 3 + q], p[k + 6 + q]] = [p[k + 6 + q], p[k + 3 + q]];
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return g;
}
const ni = g => (g.index ? g.toNonIndexed() : g);
function conifer() { const a = new THREE.ConeGeometry(0.5, 0.62, 6, 1, true).translate(0, 0.31, 0), b = new THREE.ConeGeometry(0.34, 0.55, 6, 1, true).translate(0, 0.72, 0); return mergeGeometries([a, b].map(ni)); }
function broad() { return new THREE.IcosahedronGeometry(0.5, 0).scale(1, 1, 1).translate(0, 0.55, 0); }
function palm() { const a = new THREE.IcosahedronGeometry(0.5, 0).scale(1.25, 0.55, 1.25).translate(0, 0.72, 0), b = new THREE.ConeGeometry(0.42, 0.35, 6).rotateX(Math.PI).translate(0, 0.62, 0); return mergeGeometries([ni(a), ni(b)]); }
function reeds() { const parts = []; for (let k = 0; k < 5; k++) { const a = k * 1.3; parts.push(new THREE.ConeGeometry(0.06, 1, 4).translate(Math.cos(a) * 0.2, 0.5, Math.sin(a) * 0.2).scale(1, 0.7 + (k % 3) * 0.15, 1).toNonIndexed()); } return mergeGeometries(parts); }
export const SHAPES = {
  box: () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  gable, roof: () => new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
  cone: () => new THREE.ConeGeometry(0.5, 1, 8).translate(0, 0.5, 0),
  cyl: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0),
  dome: () => new THREE.SphereGeometry(0.5, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
  blob: () => new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0),
  gem: () => new THREE.OctahedronGeometry(0.5, 0).translate(0, 0.5, 0),
  rock: () => new THREE.DodecahedronGeometry(0.5, 0).scale(1, 0.6, 1).translate(0, 0.18, 0),
  trunk: () => new THREE.CylinderGeometry(0.35, 0.5, 1, 4, 1, true).translate(0, 0.5, 0),
  broad, conifer, palm, reeds,
  hull: () => { const g = new THREE.CylinderGeometry(0.5, 0.32, 1, 6, 1, false, 0, Math.PI); g.rotateZ(Math.PI / 2); g.rotateX(Math.PI); return g.translate(0, 0.25, 0); },
  sail: () => new THREE.ConeGeometry(0.5, 1, 3).translate(0, 0.5, 0),
  // a steel pylon: a tapering lattice mast (four open sides) and a cross-arm for the wires
  pylon: () => {
    const parts = [new THREE.BoxGeometry(1.6, 0.04, 0.07).translate(0, 0.9, 0), new THREE.BoxGeometry(1.1, 0.04, 0.07).translate(0, 0.68, 0), new THREE.ConeGeometry(0.12, 0.14, 4).translate(0, 1.04, 0)];
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push(new THREE.BoxGeometry(0.06, 1.0, 0.06).rotateZ(0.36 * sx).rotateX(-0.36 * sz).translate(sx * 0.29, 0.48, sz * 0.29));
    for (const y of [0.3, 0.6]) { const w = 0.62 - y * 0.42; for (const [ox, oz, lx, lz] of [[0, w / 2, w, 0.03], [0, -w / 2, w, 0.03], [w / 2, 0, 0.03, w], [-w / 2, 0, 0.03, w]]) parts.push(new THREE.BoxGeometry(lx, 0.03, lz).translate(ox, y, oz)); }
    return mergeGeometries(parts.map(ni));
  },
  // an aeroplane, nose along +x: fuselage, wings, tailplane and fin
  plane: () => mergeGeometries([new THREE.CylinderGeometry(0.06, 0.1, 1, 6).rotateZ(Math.PI / 2).translate(0, 0.1, 0), new THREE.ConeGeometry(0.06, 0.14, 6).rotateZ(-Math.PI / 2).translate(0.57, 0.1, 0),
    new THREE.BoxGeometry(0.24, 0.025, 1.1).translate(0.06, 0.09, 0), new THREE.BoxGeometry(0.13, 0.02, 0.38).translate(-0.43, 0.12, 0), new THREE.BoxGeometry(0.16, 0.2, 0.025).translate(-0.43, 0.2, 0)].map(ni)),
  person: () => { const b = new THREE.ConeGeometry(0.32, 0.8, 6).translate(0, 0.4, 0), h = new THREE.SphereGeometry(0.2, 8, 6).translate(0, 0.95, 0); return mergeGeometries([ni(b), ni(h)]); },
};

// ------------------------------------------------------------------ the woods and the wild
/** The woods' kinds: their models (Nhanh: fewer), their height and breadth for a size `s`. */
export const WOODS = {
  broad: { hi: ["oak", "broad", "fat"], lo: ["fat", "small"], h: 1.32, w: 1.1 },
  poplar: { hi: ["poplar"], lo: ["poplar"], h: 1.4, w: 1.0 },
  conifer: { hi: ["pine", "pineSmall", "pineTall"], lo: ["pineTall"], h: 1.75, w: 1.1 },
  palm: { hi: ["palm", "palmBend"], lo: ["palm"], h: 1.45, w: 0.95 },
};
/** A colour a little different for each spot. */
export const tint = (hex, i, j, amt = 0.14) => { const c = new THREE.Color(hex), f = 1 + (hash(i, j, 41) - 0.5) * amt * 2; c.offsetHSL((hash(j, i, 43) - 0.5) * 0.03, 0, 0); return c.multiplyScalar(f); };
/** What grows and lies on tile i of terrain t: D.spot(i, j) a place on it, D.tree(kind, i, j, x, z, size, colour, dense),
 *  D.thing(models, shape, i, j, x, z, width, height, colour) a rock, a bush, a reed bed, a cactus; D.nTree trees a wood. */
export function decorTile(D, i, t) {
  const { spot, tree, thing, nTree } = D;
  if (t === "forest") for (let j = 0; j < nTree; j++) {
    const [x, z] = spot(i, j), s = 0.21 + hash(i, j, 13) * 0.1, autumn = hash(i, j, 17) < 0.06;
    tree(hash(i, j, 21) < 0.15 ? "poplar" : "broad", i, j, x, z, s, tint(autumn ? "#9a8a2c" : hash(i, j, 19) < 0.5 ? "#4b7f33" : "#5a8a35", i, j), j >= 3);
  } else if (t === "taiga") for (let j = 0; j < nTree; j++) {
    const [x, z] = spot(i, j), s = 0.2 + hash(i, j, 13) * 0.09;
    tree("conifer", i, j, x, z, s, tint(hash(i, j, 19) < 0.5 ? "#2f5a3e" : "#3b6a48", i, j), j >= 3);
  } else if (t === "jungle") for (let j = 0; j < nTree + 1; j++) {
    const [x, z] = spot(i, j), s = 0.23 + hash(i, j, 13) * 0.11, tall = hash(i, j, 23) < 0.35;
    tree(tall ? "palm" : "broad", i, j, x, z, tall ? s : s * 1.1, tint(hash(i, j, 19) < 0.5 ? "#2c6a2c" : "#3f7f30", i, j), j >= 3);
  } else if (t === "swamp") {
    for (let j = 0; j < 5; j++) { const [x, z] = spot(i, j); thing(["reed"], "reeds", i, j, x, z, 0.3, 0.3 + hash(i, j, 7) * 0.12, tint("#7d8a3e", i, j)); }
    for (let j = 5; j < 7; j++) { const [x, z] = spot(i, j); thing(["bush"], "blob", i, j, x, z, 0.24, 0.16, tint("#40583a", i, j)); }
  } else if (t === "desert") { for (let j = 0; j < 2; j++) if (hash(i, j, 31) < 0.45) { const [x, z] = spot(i, j); if (hash(i, j, 33) < 0.5) thing(["cactus", "cactusS"], "blob", i, j, x, z, 0.1, 0.16, tint("#6f8a46", i, j)); else thing(["bush"], "blob", i, j, x, z, 0.15, 0.09, tint("#8a8a4a", i, j)); } }
  else if (t === "grass") { if (hash(i, 31) < 0.18) { const [x, z] = spot(i, 1); tree("broad", i, 1, x, z, 0.3, tint("#5f8f38", i, 1), false); } if (hash(i, 37) < 0.3) { const [x, z] = spot(i, 2); thing(["bush"], "blob", i, 2, x, z, 0.2, 0.13, tint("#6a8e3a", i, 2)); } }
  else if (t === "hill") for (let j = 0; j < 2; j++) { const [x, z] = spot(i, j), s = 0.1 + hash(i, j, 7) * 0.12; thing(["rockA", "rockB", "rockS"], "rock", i, j, x, z, s * 1.4, s * 0.8, tint("#9a8d7c", i, j, 0.1)); if (j === 0 && hash(i, 39) < 0.4) { const [x2, z2] = spot(i, 7); tree("broad", i, 7, x2, z2, 0.26, tint("#62853a", i, 7), false); } }
  else if (t === "mountain" && hash(i, 35) < 0.5) { const [x, z] = spot(i, 0), s = 0.14 + hash(i, 0, 7) * 0.14; thing(["rockT", "rockT2", "rockB"], "rock", i, 0, x, z, s * 1.4, s * 1.1, tint("#958a7c", i, 0, 0.1)); }
  else if (t === "tundra" && hash(i, 33) < 0.5) { const [x, z] = spot(i, 1); thing(["rockS"], "rock", i, 1, x, z, 0.14, 0.07, "#9aa29a"); }
}

// ------------------------------------------------------------------ roads and rails
export const WALLS = ["#e9dfc8", "#ddd0b4", "#efe7d6", "#d2bf9a", "#e3d6bd"], STONE = "#b5aa96", WOOD = "#8f6a42", TERRA = new THREE.Color("#a94f34");
// a point turned with a shape: local (ox, oz) under a turn of `ry` about the vertical
export const turnXZ = (ox, oz, ry) => [ox * Math.cos(ry) + oz * Math.sin(ry), -ox * Math.sin(ry) + oz * Math.cos(ry)];

/** A road or rail laid on the ground: a ribbon from A to B whose edges follow the slopes. */
export function ribbon(E, T, ax, az, bx, bz, w, col, lift, shift = 0, water = false) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L, n = Math.max(1, Math.ceil(L / 0.22));
  const y = (x, z) => (water ? 0.035 : E.ground(x, z) + lift);
  let prev = null;
  for (let s = 0; s <= n; s++) {
    const t = s / n, cx = ax + dx * t + nx * shift, cz = az + dz * t + nz * shift;
    const l = [cx + nx * w / 2, 0, cz + nz * w / 2], r = [cx - nx * w / 2, 0, cz - nz * w / 2];
    l[1] = y(l[0], l[2]); r[1] = y(r[0], r[2]);
    if (prev) T.quad(prev[0], l, r, prev[1], col);
    prev = [l, r];
  }
}
export function disc(E, T, x, z, rad, col, lift) { const y = E.ground(x, z) + lift; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, b = a + Math.PI / 3; const A = [x + Math.cos(a) * rad, 0, z + Math.sin(a) * rad], B = [x + Math.cos(b) * rad, 0, z + Math.sin(b) * rad]; A[1] = E.ground(A[0], A[2]) + lift; B[1] = E.ground(B[0], B[2]) + lift; T.tri([x, y, z], B, A, col); } }

/** Roads: branches from the centres, as on the 2D map; railways with ballast, sleepers and two rails; sea lanes faint. */
export function layRoads(E, R) {
  const { S, hooks } = E, owners = S.owners, roads = S.roads || [];
  const lane = new THREE.Color("#dcecf6"), steam = new THREE.Color("#ffe8a8"), hubs = new Set(), joints = new Map();
  const BALLAST = new THREE.Color("#5a5450"), SLEEPER = new THREE.Color("#5e4330"), RAIL = new THREE.Color("#dfe5ea"), roadCols = ROAD_COLOR.map(c => c && new THREE.Color(c));
  for (const n of S.nations) if (n.alive && n.founded) { hubs.add(n.capital); for (const st of n.settlements || []) hubs.add(st.tile); }
  const { parent, links, loose } = hooks.roadTree(hubs);
  const seg = (i, j, lv) => {
    const w = E.isWater(i) && E.isWater(j), wild = loose.has(i) && owners[i] < 0 && owners[j] < 0;
    if (wild) return; // roads gone wild are left off the 3D map: they only clutter it
    E.anchor(i);
    const [x, z] = E.pos(i), [x2, z2] = E.pos(j);
    if (w) { ribbon(E, R, x, z, x2, z2, lv >= 4 ? 0.09 : 0.06, lv >= 4 ? steam : lane, 0, 0, true); return; }
    E.clear(i, 0.4); E.clear(j, 0.4);
    if (lv >= 4) { // §2.5 a railway
      ribbon(E, R, x, z, x2, z2, 0.3, BALLAST, 0.03);
      const dx = x2 - x, dz = z2 - z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
      for (let s = 0.09; s < L; s += 0.17) { const cx = x + ux * s, cz = z + uz * s; ribbon(E, R, cx - ux * 0.025, cz - uz * 0.025, cx + ux * 0.025, cz + uz * 0.025, 0.25, SLEEPER, 0.045); }
      ribbon(E, R, x, z, x2, z2, 0.03, RAIL, 0.065, 0.07); ribbon(E, R, x, z, x2, z2, 0.03, RAIL, 0.065, -0.07);
      joints.set(i, [0.15, BALLAST]); joints.set(j, joints.get(j) ?? [0.15, BALLAST]);
      return;
    }
    const wd = 0.07 + lv * 0.03, col = roadCols[lv] || roadCols[1];
    ribbon(E, R, x, z, x2, z2, wd, col, 0.03);
    for (const t of [i, j]) if ((joints.get(t)?.[0] ?? 0) < wd / 2) joints.set(t, [wd / 2, col]);
  };
  for (let i = 0; i < E.count; i++) { const lv = roads[i] || 0, j = parent.get(i); if (lv && j !== undefined && j >= 0) seg(i, j, Math.min(lv, roads[j] || lv)); }
  for (const [i, h] of links) seg(i, h, roads[i] || 1);
  for (const [t, [r, col]] of joints) if (!E.isWater(t)) { E.anchor(t); const [x, z] = E.pos(t); disc(E, R, x, z, r * 1.05, col, 0.03); }
}

// ------------------------------------------------------------------ towns and works
/** The towns of every nation (homes by size, the capital's keep, a town's bell tower, a city's wall), the works on
 *  the land, the barbarians' camps. P: the batch of shapes (P.add, P.model), AR: the airports' strips. The env also
 *  takes the chimneys' and the plants' smoke (E.chimney, E.plant), the flags (E.flag), the labels (E.label) and the
 *  woods to clear (E.clear). */
export function layTowns(E, P, AR) {
  const { S, hooks } = E, pos = (i) => E.pos(i), surf = (x, z) => E.surf(x, z);
  for (const n of S.nations) {
    if (!n.alive || !n.founded) continue;
    const color = hooks.nationColor(n.id), tierOf = new Map((n.provinces || []).map(p => [p.centre, p.tier || 0]));
    const centres = [n.capital, ...(n.settlements || []).map(s => s.tile)].filter(c => c >= 0 && S.owners[c] === n.id);
    // roofs in the nation's colour, muted and weathered towards terracotta so they sit in the scene
    const roofBase = new THREE.Color(color), hsl = {}; roofBase.getHSL(hsl);
    roofBase.setHSL(hsl.h, hsl.s * 0.55, clamp(hsl.l, 0.34, 0.52)).lerp(TERRA, 0.3);
    const roofCss = roofBase.getStyle(), litC = new Set(n.power?.centres ?? []); // §6.8 the centres the grid lights
    // the works on each centre stand around its edge; houses keep clear of them
    const spots = new Map(), onCentre = new Map();
    for (const b of n.buildings || []) {
      if (b.kind === "housing" || b.type === "airport" || !centres.includes(b.tile)) continue;
      const key = b.tile + ":" + b.type; if (onCentre.has(key)) { spots.set(b.id, null); continue; } onCentre.set(key, 1); // one of each kind is enough to see
      const k = onCentre.get(b.tile) ?? 0; onCentre.set(b.tile, k + 1);
      E.anchor(b.tile);
      const a = k * 2.2 + 0.5, dd = 0.66 + (k % 2) * 0.1, [x, z] = pos(b.tile);
      spots.set(b.id, [x + Math.cos(a) * dd, z + Math.sin(a) * dd]);
    }
    for (const c of centres) {
      E.anchor(c);
      const [x, z] = pos(c), tier = tierOf.get(c) ?? 0, cap = c === n.capital;
      E.clear(c, 2);
      const taken = [...(n.buildings || [])].filter(b => spots.get(b.id) && b.tile === c).map(b => spots.get(b.id));
      const count = [6, 12, 18][tier] + (cap ? 3 : 0), R0 = [0.2, 0.27, 0.33][tier], spread = [0.6, 0.72, 0.7][tier];
      const homes = [];
      for (let k = 0, built = 0; k < count * 2 && built < count; k++) {
        const a = k * 2.399 + hash(c, k) * 0.5, d = R0 + 0.1 + (spread - R0 - 0.1) * Math.sqrt(((k % count) + 0.5) / count) + (hash(k, c, 3) - 0.5) * 0.05;
        const hx = x + Math.cos(a) * d, hz = z + Math.sin(a) * d;
        if (surf(hx, hz) < 0.03 || E.riverAt(hx, hz) > 0.06 || taken.some(([tx, tz]) => Math.hypot(tx - hx, tz - hz) < 0.2) || homes.some(([tx, tz]) => Math.hypot(tx - hx, tz - hz) < 0.15)) continue;
        built++; homes.push([hx, hz]);
        const w = (0.13 + hash(k, c) * 0.05) * (tier === 2 ? 0.95 : 1), L = w * (1.3 + hash(c, k, 7) * 0.4), floors = tier === 2 && k % 3 === 0 ? 2 : tier === 1 && k % 5 === 0 ? 1.5 : 1;
        const ht = (0.11 + hash(c, k, 5) * 0.04) * floors, y = surf(hx, hz) - 0.05, ry = -a + (hash(c, k, 9) < 0.5 ? 0 : Math.PI / 2);
        const roof = roofBase.clone().offsetHSL((hash(c, k, 11) - 0.5) * 0.04, 0, (hash(c, k, 13) - 0.5) * 0.1);
        const big = floors > 1 || (tier >= 1 && hash(c, k, 19) < 0.3);
        if (!P.model(big ? "mansion" : "house", hx, y + 0.03, hz, w * 1.15, ht + w * 0.75, big ? L * 1.2 : L, ry, roof.getStyle(), litC.has(c))) {
          P.add("box", hx, y, hz, w, ht + 0.05, L, ry, WALLS[(c + k) % WALLS.length]);
          P.add("gable", hx, y + ht + 0.05, hz, w * 1.18, w * 0.62, L * 1.1, ry, roof.getStyle());
        }
        if (hash(c, k, 15) < 0.55) {
          const [ox, oz] = turnXZ(w * 0.22, L * 0.28, ry), cy = y + ht + 0.05 + w * 0.2;
          P.add("box", hx + ox, cy, hz + oz, 0.035, w * 0.42, 0.035, ry, "#5a4a40");
          if (hash(c, k, 17) < 0.5) E.chimney(hx + ox, cy + w * 0.42, hz + oz);
        }
      }
      if (cap) { // the keep, its banners and the flag on top
        const y = surf(x, z) - 0.05;
        if (P.model("keep", x, y, z, 0.32, 0.62, 0.32, 0.3, roofCss, litC.has(c))) { // a stone keep, round towers with roofs in the nation's colour, a hall
          for (const [tx0, tz0] of [[0.27, 0.27], [-0.27, 0.27], [0.27, -0.27], [-0.27, -0.27]]) { const [ox, oz] = turnXZ(tx0, tz0, 0.3), tx = x + ox, tz = z + oz, ty = surf(tx, tz) - 0.05; P.model("hexTower", tx, ty, tz, 0.15, 0.36, 0.15, 0.3, roofCss); P.model("hexRoof", tx, ty + 0.36, tz, 0.19, 0.17, 0.19, 0.3, roofCss); }
          { const [ox, oz] = turnXZ(0.06, -0.32, 0.3); P.model("mansion", x + ox, y + 0.02, z + oz, 0.34, 0.3, 0.2, 0.3 + Math.PI / 2, roofCss, litC.has(c)); }
          E.flag(n, x, y + 0.6, z);
        } else {
        P.add("box", x, y, z, 0.3, 0.12, 0.3, 0.3, "#b9ad96"); // a plinth
        P.add("box", x, y, z, 0.26, 0.6, 0.26, 0.3, "#cfc3aa");
        P.add("box", x, y + 0.56, z, 0.3, 0.04, 0.3, 0.3, "#bfb39c"); // a string course under the battlements
        for (const [mx0, mz0] of [[-0.11, -0.11], [0, -0.11], [0.11, -0.11], [0.11, 0], [0.11, 0.11], [0, 0.11], [-0.11, 0.11], [-0.11, 0]]) { const [ox, oz] = turnXZ(mx0, mz0, 0.3); P.add("box", x + ox, y + 0.6, z + oz, 0.065, 0.07, 0.065, 0.3, "#cfc3aa"); }
        for (const [tx0, tz0] of [[0.27, 0.27], [-0.27, 0.27], [0.27, -0.27], [-0.27, -0.27]]) { const [ox, oz] = turnXZ(tx0, tz0, 0.3), tx = x + ox, tz = z + oz, ty = surf(tx, tz) - 0.05; P.add("cyl", tx, ty, tz, 0.1, 0.34, 0.1, 0, "#c9bda4"); P.add("cyl", tx, ty + 0.32, tz, 0.125, 0.04, 0.125, 0, "#bcae95"); P.add("cone", tx, ty + 0.36, tz, 0.15, 0.17, 0.15, 0, roofCss); }
        { const [ox, oz] = turnXZ(0.06, -0.3, 0.3); P.add("box", x + ox, y, z + oz, 0.3, 0.2, 0.16, 0.3, "#d8ccb2"); P.add("gable", x + ox, y + 0.2, z + oz, 0.34, 0.12, 0.18, 0.3 + Math.PI / 2, roofCss); }
        E.flag(n, x, y + 0.6, z);
        }
      } else if (tier >= 1) { // a town's bell tower on its square
        const y = surf(x, z) - 0.03;
        if (!P.model("tower", x, y, z, 0.17, 0.56, 0.19, 0.4, roofCss, litC.has(c))) { P.add("box", x, y, z, 0.13, 0.36, 0.13, 0.4, "#d6cab0"); P.add("box", x, y + 0.36, z, 0.15, 0.03, 0.15, 0.4, "#bcae95"); P.add("roof", x, y + 0.39, z, 0.15, 0.16, 0.15, 0.4, roofCss); }
      }
      else { const y = surf(x, z) - 0.03; P.add("cyl", x, y, z, 0.1, 0.07, 0.1, 0, "#8e8a82"); }
      if (tier === 2) { // a city wall with towers
        const Rw = 0.8, K = 16;
        for (let k = 0; k < K; k++) {
          const a0 = k / K * Math.PI * 2, a1 = (k + 1) / K * Math.PI * 2, am = (a0 + a1) / 2, mx = x + Math.cos(am) * Rw, mz = z + Math.sin(am) * Rw;
          if (surf(mx, mz) < 0.04) continue;
          const seg = 2 * Rw * Math.sin(Math.PI / K) + 0.02, wy = surf(mx, mz) - 0.08;
          if (!P.model("wall", mx, wy, mz, 0.09, 0.29, seg, -am, STONE)) {
            P.add("box", mx, wy, mz, 0.07, 0.24, seg, -am, STONE);
            P.add("box", mx - Math.cos(am) * 0.012, wy + 0.24, mz - Math.sin(am) * 0.012, 0.045, 0.02, seg, -am, "#a69b87"); // the wall walk
            for (const f of [-0.3, 0, 0.3]) { const ux = -Math.sin(am), uz = Math.cos(am), px = mx + ux * f * seg + Math.cos(am) * 0.022, pz = mz + uz * f * seg + Math.sin(am) * 0.022; P.add("box", px, wy + 0.24, pz, 0.026, 0.05, 0.05, -am, STONE); }
          }
          if (k % 3 === 0) { const tx = x + Math.cos(a0) * Rw, tz = z + Math.sin(a0) * Rw, ty = surf(tx, tz) - 0.08; if (P.model("hexTower", tx, ty, tz, 0.2, 0.38, 0.2, -a0, roofCss)) P.model("hexRoof", tx, ty + 0.38, tz, 0.24, 0.19, 0.24, -a0, roofCss); else { P.add("cyl", tx, ty, tz, 0.13, 0.34, 0.13, 0, "#c2b7a2"); P.add("cyl", tx, ty + 0.32, tz, 0.16, 0.05, 0.16, 0, "#b2a690"); P.add("cone", tx, ty + 0.37, tz, 0.19, 0.16, 0.19, 0, roofCss); } }
        }
      }
    }
    // works on the land (homes are counted in the towns above)
    for (const b of n.buildings || []) {
      if (b.kind === "housing") continue;
      E.anchor(b.tile);
      if (b.type === "airport") { airport(E, n, b, P, AR); continue; } // §7.3b beside the town
      if (spots.get(b.id) === null) continue;
      const [x, z] = pos(b.tile), r = hash(b.id, 7) * 6.28, at0 = spots.get(b.id), X = at0 ? at0[0] : x, Z = at0 ? at0[1] : z, h = surf(X, Z) - 0.03;
      if (!at0) E.clear(b.tile, b.type === "field" || b.type === "salt_pan" || b.type === "palisade" ? 2 : 0.55);
      if (!b.done) { // scaffolding: poles, a beam and the first course of walls
        for (let q = 0; q < 4; q++) { const [ox, oz] = turnXZ(q % 2 ? 0.13 : -0.13, q < 2 ? 0.13 : -0.13, r); P.add("box", X + ox, h, Z + oz, 0.025, 0.32, 0.025, r, "#a88a5c"); }
        P.add("box", X, h + 0.3, Z, 0.3, 0.025, 0.03, r, "#a88a5c"); P.add("box", X, h, Z, 0.24, 0.1, 0.24, r, "#d9c9a6");
        continue;
      }
      switch (b.type) {
        case "field": { const [ox, oz] = turnXZ(0.42, 0.2, r); const fy = surf(x + ox, z + oz); P.add("cone", x + ox, fy - 0.02, z + oz, 0.13, 0.13, 0.13, 0, "#d8b85a"); P.add("cone", x + ox + 0.12, fy - 0.02, z + oz + 0.05, 0.1, 0.1, 0.1, 0, "#cfae50"); break; }
        case "pen": for (let s = 0; s < 6; s++) { const a = s * Math.PI / 3 + Math.PI / 6, px = X + Math.cos(a) * 0.3, pz = Z + Math.sin(a) * 0.3; if (!P.model("fence", px, surf(px, pz) - 0.02, pz, 0.31, 0.09, 0.03, -a + Math.PI / 2, WOOD)) P.add("box", px, surf(px, pz) - 0.02, pz, 0.31, 0.07, 0.02, -a + Math.PI / 2, WOOD); } P.add("blob", X - 0.08, h, Z, 0.14, 0.11, 0.2, r, "#f0ece0"); P.add("blob", X + 0.1, h, Z + 0.08, 0.13, 0.1, 0.18, r + 1, "#6b4b33"); break;
        case "pier": case "harbor": case "fish_dock": {
          const sea = E.nbs(b.tile).find(j => j >= 0 && E.isWater(j));
          if (sea === undefined || sea < 0) { P.add("box", X, h, Z, 0.24, 0.1, 0.18, r, "#9a7448"); P.add("gable", X, h + 0.1, Z, 0.27, 0.08, 0.2, r, "#7a5a40"); break; } // a river landing: a boat shed
          const [sx, sz] = pos(sea), dx = sx - x, dz = sz - z, D = Math.hypot(dx, dz) || 1, ux = dx / D, uz = dz / D, ry = Math.atan2(ux, uz), big = b.type === "harbor" ? 1.5 : 1;
          const cx = x + ux * 1.05, cz = z + uz * 1.05;
          for (const s of [-1, 1]) P.add("box", cx + uz * 0.05 * s * big, 0.025, cz - ux * 0.05 * s * big, 0.025, 0.035, 0.9 * big, ry, "#5e4330"); // stringers
          for (let f = -0.43 * big; f <= 0.43 * big; f += 0.055) P.add("box", cx + ux * f, 0.06, cz + uz * f, 0.17 * big, 0.014, 0.045, ry, hash(b.id, Math.round(f * 100)) < 0.5 ? "#a07a4c" : "#8d6a40");
          P.add("cyl", cx + ux * 0.43 * big, 0.06, cz + uz * 0.43 * big, 0.035, 0.07, 0.035, 0, "#4a3a2c");
          for (const s of [-1, 1]) for (const f of [0.6, 1.35]) { const px = x + ux * f + uz * 0.07 * s * big, pz = z + uz * f - ux * 0.07 * s * big; P.add("cyl", px, -0.15, pz, 0.03, 0.23, 0.03, 0, "#5e4330"); }
          if (b.type === "harbor") { const wx = x + ux * 0.45, wz = z + uz * 0.45, wy = surf(wx, wz) - 0.04; if (!P.model("mansion", wx, wy + 0.02, wz, 0.26, 0.34, 0.36, ry, "#7a5a40")) { P.add("box", wx, wy, wz, 0.3, 0.22, 0.22, ry, "#b9a682"); P.add("gable", wx, wy + 0.22, wz, 0.34, 0.14, 0.26, ry + Math.PI / 2, "#7a5a40"); } P.add("box", cx + ux * 0.3, 0.08, cz + uz * 0.3, 0.03, 0.4, 0.03, 0, "#5e4330"); P.add("box", cx + ux * 0.3, 0.46, cz + uz * 0.3, 0.03, 0.03, 0.3, ry, "#5e4330"); }
          if (b.type === "fish_dock") { const fx = x + ux * 0.5 + uz * 0.2, fz = z + uz * 0.5 - ux * 0.2, fy = surf(fx, fz) - 0.02; P.add("box", fx, fy, fz, 0.22, 0.12, 0.04, ry, WOOD); P.add("box", fx, fy + 0.12, fz, 0.24, 0.02, 0.06, ry, "#c9c2b0"); }
          break;
        }
        case "salt_pan": { const [ox, oz] = turnXZ(0.5, 0, r); P.add("cone", x + ox, surf(x + ox, z + oz) - 0.02, z + oz, 0.16, 0.12, 0.16, 0, "#f6f4ee"); break; }
        case "temple": P.add("box", X, h, Z, 0.4, 0.07, 0.32, r, "#d7d0c2"); P.add("box", X, h + 0.07, Z, 0.26, 0.2, 0.2, r, "#f1ede4"); for (let q = 0; q < 4; q++) { const [ox, oz] = turnXZ(-0.1 + q * 0.067, 0.14, r); P.add("cyl", X + ox, h + 0.07, Z + oz, 0.03, 0.2, 0.03, 0, "#f6f2ea"); } P.add("gable", X, h + 0.27, Z, 0.32, 0.12, 0.36, r + Math.PI / 2, "#c9b48a"); break;
        case "altar": P.add("box", X, h, Z, 0.18, 0.11, 0.18, r, "#8f8a82"); P.add("cone", X, h + 0.11, Z, 0.09, 0.16, 0.09, 0, "#ff9a3c", true); break;
        case "palisade": for (let s = 0; s < 22; s++) { const a = s / 22 * 6.283, px = x + Math.cos(a) * 0.86, pz = z + Math.sin(a) * 0.86; if (surf(px, pz) > 0.03) P.add("cone", px, surf(px, pz) - 0.05, pz, 0.07, 0.3 + hash(s, b.id) * 0.06, 0.07, 0, WOOD); } break;
        case "well": P.add("cyl", X, h, Z, 0.16, 0.1, 0.16, 0, "#8e8a82"); P.add("box", X - 0.06, h, Z, 0.02, 0.22, 0.02, 0, WOOD); P.add("box", X + 0.06, h, Z, 0.02, 0.22, 0.02, 0, WOOD); P.add("gable", X, h + 0.22, Z, 0.18, 0.08, 0.12, Math.PI / 2, "#7a5a40"); break;
        case "market": for (let q = 0; q < 3; q++) { const [ox, oz] = turnXZ((q - 1) * 0.15, (q % 2) * 0.08, r), sx = X + ox, sz = Z + oz, sy = surf(sx, sz) - 0.03; P.add("box", sx, sy, sz, 0.11, 0.07, 0.09, r, "#a07a4a"); P.add("gable", sx, sy + 0.12, sz, 0.15, 0.06, 0.12, r, ["#d24a3a", "#e2b13c", "#3a7ad2"][q]); P.add("box", sx, sy, sz, 0.12, 0.12, 0.01, r, "#6b4b33"); } break;
        case "kiln": P.add("dome", X, h, Z, 0.26, 0.2, 0.26, 0, "#a5532e"); P.add("cyl", X + 0.08, h, Z, 0.05, 0.28, 0.05, 0, "#7a3e22"); E.chimney(X + 0.08, h + 0.28, Z); break;
        case "workshop": P.add("box", X, h, Z, 0.26, 0.14, 0.2, r, "#b9a07a"); P.add("gable", X, h + 0.14, Z, 0.29, 0.1, 0.23, r, "#6e5a44"); { const [ox, oz] = turnXZ(0.07, 0.05, r); P.add("box", X + ox, h + 0.14, Z + oz, 0.04, 0.14, 0.04, r, "#4a3c32"); } break;
        case "pit": P.add("cyl", X, h - 0.02, Z, 0.24, 0.05, 0.24, 0, "#4a3c2c"); P.add("roof", X, h + 0.02, Z, 0.2, 0.08, 0.2, r, "#8a6d48"); break;
        case "granary": P.add("cyl", X, h, Z, 0.2, 0.18, 0.2, 0, "#c8b48a"); P.add("cone", X, h + 0.18, Z, 0.26, 0.14, 0.26, 0, "#9b7448"); break;
        case "grinder": if (P.model("windmill", X, h - 0.02, Z, 0.26, 0.62, 0.34, r, roofCss)) { P.add("box", X + 0.2, h, Z + 0.12, 0.1, 0.07, 0.08, r, "#e8dcc2"); break; } // a windmill grinding (and a sack of flour)
          P.add("cyl", X, h, Z, 0.2, 0.06, 0.2, 0, "#8e8a82"); P.add("cyl", X, h + 0.06, Z, 0.16, 0.05, 0.16, 0, "#a29d94"); P.add("box", X, h + 0.11, Z, 0.26, 0.025, 0.025, r, WOOD); P.add("box", X + 0.24, h, Z + 0.1, 0.12, 0.08, 0.1, r, "#e8dcc2"); break; // a millstone, its handle, a sack of flour
        case "herb_garden": for (let q = 0; q < 3; q++) { const [ox, oz] = turnXZ((q - 1) * 0.1, 0, r); P.add("box", X + ox, h, Z + oz, 0.06, 0.05, 0.26, r, ["#4f9a4a", "#7db35a", "#9a6ab0"][q]); } break;
        case "border_gate": for (const s of [-1, 1]) { const [ox, oz] = turnXZ(s * 0.17, 0, r); P.add("box", X + ox, h, Z + oz, 0.09, 0.36, 0.09, r, "#b5aa96"); P.add("roof", X + ox, h + 0.36, Z + oz, 0.11, 0.1, 0.11, r, roofCss); } P.add("box", X, h + 0.26, Z, 0.36, 0.06, 0.08, r, "#a69a84"); { const [ox, oz] = turnXZ(0.1, 0.24, r); P.add("box", X + ox, h, Z + oz, 0.14, 0.08, 0.12, r, "#a07a4a"); P.add("gable", X + ox, h + 0.12, Z + oz, 0.17, 0.06, 0.14, r, "#e2b13c"); } break;
        case "watchtower": if (P.model("tower", X, h, Z, 0.2, 0.62, 0.23, r, roofCss)) break;
          for (let q = 0; q < 4; q++) { const [ox, oz] = turnXZ(q % 2 ? 0.07 : -0.07, q < 2 ? 0.07 : -0.07, r); P.add("box", X + ox, h, Z + oz, 0.025, 0.5, 0.025, r, WOOD); } P.add("box", X, h + 0.42, Z, 0.2, 0.05, 0.2, r, "#7a5a3a"); P.add("roof", X, h + 0.47, Z, 0.24, 0.16, 0.24, r, roofCss); break;
        case "power_plant": { // §6.8 a thermal plant: a brick hall, its boiler house, two tall chimneys smoking while it runs, a coal heap
          const on = (n.power?.made ?? 0) > 0, L2 = (ox, oz) => { const [a, c] = turnXZ(ox, oz, r); return [X0 + a, Z0 + c]; }, X0 = at0 ? X : X - 0.42, Z0 = at0 ? Z : Z + 0.3;
          const h0 = surf(X0, Z0) - 0.03;
          P.add("box", X0, h0, Z0, 0.46, 0.2, 0.28, r, "#8d4b37");
          for (let q = 0; q < 3; q++) { const [sx, sz] = L2(-0.15 + q * 0.15, 0); P.add("gable", sx, h0 + 0.2, sz, 0.15, 0.08, 0.3, r + Math.PI / 2, "#57524d"); }
          { const [bx, bz] = L2(-0.1, 0.22); P.add("box", bx, h0, bz, 0.22, 0.3, 0.18, r, "#7c4231"); P.add("box", bx, h0 + 0.3, bz, 0.24, 0.02, 0.2, r, "#4b4744"); }
          for (const ox of [0.02, 0.26]) { const [cx2, cz2] = L2(ox, 0.22), cy = surf(cx2, cz2) - 0.03; P.add("cyl", cx2, cy, cz2, 0.07, 0.86, 0.07, 0, "#a35a43"); P.add("cyl", cx2, cy + 0.74, cz2, 0.08, 0.04, 0.08, 0, "#e2dcd0"); if (on) E.plant(cx2, cy + 0.86, cz2); }
          { const [hx2, hz2] = L2(-0.34, -0.06); P.add("blob", hx2, surf(hx2, hz2) - 0.04, hz2, 0.24, 0.1, 0.2, r, "#262422"); }
          break;
        }
        case "hydro_dam": { // §6.8 a concrete dam across the river, its spillway foaming, a powerhouse on the bank
          const ground = (x, z) => E.ground(x, z);
          const [fx, fz, px2, pz2] = E.riverAcross(b.tile), across = Math.atan2(px2, pz2);
          const banks = Math.max(ground(fx + px2 * 0.5, fz + pz2 * 0.5), ground(fx - px2 * 0.5, fz - pz2 * 0.5)), y0 = ground(fx, fz) - 0.14, top = Math.max(banks + 0.06, y0 + 0.22);
          P.add("box", fx, y0, fz, 0.16, top - y0, 1.05, across, "#c9c5bb");
          P.add("box", fx, top, fz, 0.2, 0.025, 1.1, across, "#a9a49a");
          for (const sd of [-1, 1]) P.add("box", fx + px2 * 0.55 * sd, y0, fz + pz2 * 0.55 * sd, 0.24, top - y0 + 0.06, 0.08, across, "#b8b3a8");
          P.add("box", fx + pz2 * 0.14, ground(fx, fz) + 0.005, fz - px2 * 0.14, 0.12, 0.02, 0.5, across, "#e8f2f4"); // foam below the spillway
          { const bx = fx + px2 * 0.7, bz = fz + pz2 * 0.7, by = surf(bx, bz) - 0.03; P.add("box", bx, by, bz, 0.22, 0.15, 0.18, across, "#b8b2a6"); P.add("gable", bx, by + 0.15, bz, 0.24, 0.07, 0.2, across + Math.PI / 2, "#6e6a64"); }
          E.clear(b.tile, 0.9);
          break;
        }
        default: P.add("box", X, h, Z, 0.22, 0.14, 0.2, r, "#c4b08a"); P.add("gable", X, h + 0.14, Z, 0.25, 0.1, 0.23, r, hooks.kindColor?.[b.kind] || "#7b6a55");
      }
    }
  }
  // barbarian camps: dark tents round a fire
  for (const hd of S.hordes || []) {
    E.anchor(hd.tile);
    const [x, z] = pos(hd.tile), ground = (x, z) => E.ground(x, z);
    for (let k = 0; k < 5; k++) { const a = k * 1.256 + 0.4, tx = x + Math.cos(a) * 0.36, tz = z + Math.sin(a) * 0.36; if (!P.model("tent", tx, ground(tx, tz) - 0.02, tz, 0.32, 0.22, 0.26, -a, "#6b231d")) P.add("cone", tx, ground(tx, tz) - 0.02, tz, 0.24, 0.26, 0.24, a, "#5b1e1a"); }
    P.add("cone", x, ground(x, z) - 0.02, z, 0.1, 0.18, 0.1, 0, "#ff7a2f", true);
    E.clear(hd.tile, 0.6);
    E.label(hd.tile, `☠ ${hd.name} · ${hd.strength}`, "horde", 1.0);
  }
}

/** §7.3b An airport: a runway on the flattest dry side of the town, just outside it, a terminal and a control tower
 *  by it, a plane on the apron while it is open (a dirt strip while it is being built). */
function airport(E, n, b, P, AR) {
  const { S, hooks } = E, surf = (x, z) => E.surf(x, z), ground = (x, z) => E.ground(x, z);
  const c = b.tile, [x, z] = E.pos(c), hc = ground(x, z), nbs = E.nbs(c);
  let best = null, bs = Infinity;
  for (let k = 0; k < nbs.length; k++) {
    const j = nbs[k]; if (j < 0) continue;
    const [jx, jz] = E.pos(j), jl = Math.hypot(jx - x, jz - z) / SQ3 || 1, ux = (jx - x) / SQ3 / jl, uz = (jz - z) / SQ3 / jl, tx = -uz, tz = ux, mx = x + ux * 1.32, mz = z + uz * 1.32;
    let sc = (E.isWater(j) ? 50 : 0) + ((S.roads?.[j] || 0) > 0 ? 12 : 0) + (S.owners[j] !== n.id ? 6 : 0);
    for (const f of [-0.55, 0, 0.55]) { const g = surf(mx + tx * f, mz + tz * f); sc += Math.abs(g - hc) * 4 + (g < 0.04 ? 20 : 0) + E.riverAt(mx + tx * f, mz + tz * f) * 30; }
    if (S.nations.some(o => o.capital === j || (o.settlements || []).some(st => st.tile === j))) sc += 40;
    if (sc < bs) { bs = sc; best = [j, ux, uz, tx, tz, mx, mz]; }
  }
  if (!best) return;
  const [j, ux, uz, tx, tz, mx, mz] = best, open = (n.air?.open_tiles ?? []).includes(c), L = 0.68;
  if (!b.done) { ribbon(E, AR, mx - tx * L, mz - tz * L, mx + tx * L, mz + tz * L, 0.16, new THREE.Color("#8a7458"), 0.035); E.clear(j, 1.2); return; }
  ribbon(E, AR, mx - tx * L, mz - tz * L, mx + tx * L, mz + tz * L, 0.17, new THREE.Color("#3b3d40"), 0.035);
  const dash = new THREE.Color("#e9e6dc");
  for (let f = -L + 0.12; f < L - 0.1; f += 0.16) ribbon(E, AR, mx + tx * f, mz + tz * f, mx + tx * (f + 0.07), mz + tz * (f + 0.07), 0.016, dash, 0.04);
  for (const e of [-1, 1]) for (const s of [-0.05, -0.025, 0.025, 0.05]) { const f = e * (L - 0.06); ribbon(E, AR, mx + tx * f + ux * s, mz + tz * f + uz * s, mx + tx * (f - e * 0.07) + ux * s, mz + tz * (f - e * 0.07) + uz * s, 0.012, dash, 0.04); }
  // the apron, the terminal and the tower, between the strip and the town
  const ax = x + ux * 1.02, az = z + uz * 1.02, ry = Math.atan2(tx, tz);
  ribbon(E, AR, ax - tx * 0.3, az - tz * 0.3, ax + tx * 0.3, az + tz * 0.3, 0.2, new THREE.Color("#55575a"), 0.033);
  { const px = ax + tx * 0.16 - ux * 0.02, pz = az + tz * 0.16 - uz * 0.02, py = surf(px, pz) - 0.02; P.add("box", px, py, pz, 0.08, 0.08, 0.26, ry, "#dcd8cf"); P.add("box", px, py + 0.08, pz, 0.09, 0.012, 0.27, ry, "#6c7a84"); }
  { const px = ax - tx * 0.22, pz = az - tz * 0.22, py = surf(px, pz) - 0.02; P.add("cyl", px, py, pz, 0.045, 0.3, 0.045, 0, "#d5d1c8"); P.add("cyl", px, py + 0.3, pz, 0.08, 0.055, 0.08, 0, "#7fb6cf", open); P.add("cyl", px, py + 0.355, pz, 0.09, 0.015, 0.09, 0, "#4a4d52"); }
  if (open) P.add("plane", ax - tx * 0.02 + ux * 0.04, ground(ax, az) + 0.02, az - tz * 0.02 + uz * 0.04, 0.26, 0.26, 0.26, Math.atan2(-tz, tx), hooks.nationColor(n.id));
  E.clear(j, 1.3);
}

/** §6.8 The power lines: from each nation's plants along its roads to the centres they light, a pylon on each
 *  tile beside the road and wires sagging between; and a warm glow over each lit town. Returns the wires (pairs of
 *  points) and the glows, in the map's own coordinates (E.world carries a point of the tile's frame there, E.worldDir
 *  a direction, E.up gives the up there). */
export function powerGrid(E, P) {
  const { S } = E, roads = S.roads || [], wire = [], glow = [], OFF = [0.36, -0.24], PH = 0.55;
  for (const n of S.nations) {
    if (!n.alive || !n.founded || !n.power?.centres?.length || !(n.power.made > 0)) continue;
    const lit = new Set(n.power.centres), hubs = new Set([n.capital, ...(n.settlements || []).map(s => s.tile)]);
    const plants = (n.buildings || []).filter(b => b.done && (b.type === "power_plant" || b.type === "hydro_dam")).map(b => b.tile);
    // the shortest ways from the plants along roads (the grid follows the roads)
    const prev = new Map(plants.map(t => [t, -1])), queue = [...plants];
    for (let q = 0; q < queue.length; q++) for (const j of E.nbs(queue[q])) if (j >= 0 && !prev.has(j) && !E.isWater(j) && (hubs.has(j) ? S.owners[j] === n.id : (roads[j] || 0) > 0)) { prev.set(j, queue[q]); queue.push(j); }
    const edges = [], seen = new Set();
    for (const c of lit) { if (!prev.has(c)) continue; for (let t = c; prev.get(t) >= 0; t = prev.get(t)) { const a = prev.get(t), key = Math.min(a, t) + ":" + Math.max(a, t); if (seen.has(key)) break; seen.add(key); edges.push([a, t]); } }
    // a pylon on each tile of the lines, beside the road, its arm across their way; in a town, one at its edge towards each line
    const way = new Map(), poles = new Map();
    for (const [a, b] of edges) for (const [u, v] of [[a, b], [b, a]]) { E.anchor(u); const [ux, uz] = E.pos(u), [vx, vz] = E.pos(v), D = Math.hypot(vx - ux, vz - uz) || 1, e = way.get(u) ?? [0, 0]; e[0] += (vx - ux) / D; e[1] += (vz - uz) / D; way.set(u, e); }
    const pole = (t, other) => {
      const key = hubs.has(t) ? t + ">" + other : String(t);
      if (poles.has(key)) return poles.get(key);
      E.anchor(t);
      const [x0, z0] = E.pos(t);
      let x, z, dx, dz;
      if (hubs.has(t)) { const [ox, oz] = E.pos(other); dx = ox - x0; dz = oz - z0; const D = Math.hypot(dx, dz) || 1; x = x0 + dx / D * 0.98 + OFF[0] * 0.4; z = z0 + dz / D * 0.98 + OFF[1] * 0.4; }
      else { [dx, dz] = way.get(t); x = x0 + OFF[0]; z = z0 + OFF[1]; }
      const D = Math.hypot(dx, dz) || 1, ax = -dz / D, az = dx / D, y = E.ground(x, z) - 0.02;
      P.add("pylon", x, y, z, 0.13, PH, 0.13, Math.atan2(-az, ax), "#6a6e73");
      const p = [E.world(x, y + PH * 0.9, z), E.worldDir(ax * 0.095, az * 0.095)]; poles.set(key, p); return p;
    };
    for (const [a, b] of edges) {
      const [A, Aa] = pole(a, b), [B, Ba] = pole(b, a), up = E.up(A);
      const d = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], du = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
      const flip = Aa[0] * Ba[0] + Aa[1] * Ba[1] + Aa[2] * Ba[2] < 0 ? -1 : 1, L = Math.hypot(d[0] - up[0] * du, d[1] - up[1] * du, d[2] - up[2] * du) / E.K, sag = (0.04 + L * 0.03) * E.K;
      for (const sd of [-1, 1]) {
        let px = A[0] + Aa[0] * sd, py = A[1] + Aa[1] * sd, pz = A[2] + Aa[2] * sd;
        for (let q = 1; q <= 8; q++) {
          const t = q / 8, s4 = sag * 4 * t * (1 - t);
          const x = A[0] + Aa[0] * sd + (B[0] + Ba[0] * sd * flip - A[0] - Aa[0] * sd) * t - up[0] * s4;
          const y = A[1] + Aa[1] * sd + (B[1] + Ba[1] * sd * flip - A[1] - Aa[1] * sd) * t - up[1] * s4;
          const z = A[2] + Aa[2] * sd + (B[2] + Ba[2] * sd * flip - A[2] - Aa[2] * sd) * t - up[2] * s4;
          wire.push(px, py, pz, x, y, z); px = x; py = y; pz = z;
        }
      }
    }
    for (const c of lit) if (S.owners[c] === n.id) { E.anchor(c); const [x, z] = E.pos(c); glow.push(...E.world(x, E.top(c) + 0.35, z)); }
  }
  return { wire, glow };
}

// ------------------------------------------------------------------ who walks and sails where
/** What moves: caravans (by air, by water, by rail, by road), a train on each railway network, people walking to
 *  their work, fishing boats, boats at rest at the piers. E.dist(a, b) compares distances between tiles. */
export function moverList(E) {
  const { S, hooks } = E, list = [];
  const rail = i => (S.roads?.[i] || 0) >= 4 && !E.isWater(i);
  for (const c of S.caravans || []) if (c.path?.length > 1) list.push({ kind: c.mode === "air" ? "plane" : c.mode === "water" ? "boat" : c.path.filter(rail).length * 2 >= c.path.length ? "train" : "cart", c, color: hooks.nationColor(c.from) });
  // §2.5 a train for each railway network: from the capital to the farthest centre the rails reach, and back
  for (const n of S.nations) {
    if (!n.alive || !n.founded || n.capital < 0) continue;
    const centres = new Set((n.settlements || []).map(s => s.tile)), prev = new Map([[n.capital, -1]]), queue = [n.capital];
    let far = -1;
    for (let q = 0; q < queue.length; q++) for (const j of E.nbs(queue[q])) if (j >= 0 && !prev.has(j) && (rail(j) || centres.has(j))) { prev.set(j, queue[q]); queue.push(j); if (centres.has(j)) far = j; }
    if (far < 0) continue;
    const path = []; for (let k = far; k >= 0; k = prev.get(k)) path.unshift(k);
    if (path.length >= 3) list.push({ kind: "train", path, color: hooks.nationColor(n.id), ph: hash(n.id, 77) });
  }
  const shoreOf = (n, tile) => {
    let best = -1, bd = Infinity;
    const ports = (n.buildings || []).filter(b => b.done && ["pier", "harbor", "fish_dock"].includes(b.type)).map(b => b.tile);
    const cands = ports.length ? ports : [n.capital, ...(n.settlements || []).map(s => s.tile)];
    for (const c of cands) { const d = E.dist(c, tile); if (d < bd) { bd = d; best = c; } }
    return best;
  };
  for (const n of S.nations) {
    if (!n.alive || !n.founded) continue;
    const color = hooks.nationColor(n.id), unit = Math.max(1, Math.ceil(n.population / 120)), centres = [n.capital, ...(n.settlements || []).map(s => s.tile)];
    const home = t => centres.reduce((b, c) => (E.dist(c, t) < E.dist(b, t) ? c : b), centres[0]);
    for (const w of n.work || []) {
      const from = home(w.tile);
      if (w.role === "fish") {
        const shore = E.isWater(w.tile) ? shoreOf(n, w.tile) : w.tile, sea = E.isWater(w.tile) ? w.tile : E.nbs(w.tile).find(j => j >= 0 && E.isWater(j));
        if (shore >= 0 && sea !== undefined && sea >= 0) { for (let k = 0; k < Math.min(3, Math.max(1, Math.round(w.n / unit / 2))); k++) list.push({ kind: "fishing", a: shore, b: sea, k, color, ph: hash(w.tile, k, n.id) }); continue; }
      }
      for (let k = 0; k < Math.min(3, Math.max(1, Math.round(w.n / unit))); k++) list.push({ kind: "walker", a: from, b: w.tile, k, color, ph: hash(w.tile, k, n.id, w.role.length), role: w.role });
    }
    // boats at rest at the piers
    if ((n.stock?.boat || 0) >= 1) for (const b of (n.buildings || []).filter(b => b.done && (b.type === "pier" || b.type === "harbor"))) {
      const sea = E.nbs(b.tile).find(j => j >= 0 && E.isWater(j)); if (sea === undefined || sea < 0) continue;
      for (let k = 0; k < Math.min(3, Math.floor(n.stock.boat)); k++) list.push({ kind: "moored", a: b.tile, b: sea, k, color, ph: hash(b.tile, k) });
    }
  }
  return list;
}

// ------------------------------------------------------------------ materials: rivers, smoke, gulls, the towns' lights
// value noise in 2D (the flat map's ground, foam and clouds; the rivers' current)
export const NOISE_GLSL = /* glsl */`
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f); return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + 1.0), u.x), u.y); }
// one octave, faded out before it is finer than the pixels that draw it
float oct(vec2 q, float f, float pw) { return (vnoise(q * f) - 0.5) * (1.0 - smoothstep(0.12, 0.4, pw * f)); }
`;
/** A river: a ribbon whose `flow` attribute runs along it (x, in world units) and across it (y, 0 to 1). */
export function riverMaterial(U) {
  const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x5a6e7a, shininess: 80 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = "attribute vec2 flow;\nvarying vec2 vFlow;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vFlow = flow;");
    sh.fragmentShader = "uniform float uTime;\nvarying vec2 vFlow;\n" + NOISE_GLSL + sh.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
  { // the current: streaks and flecks of foam carried down, foam along the banks
    float across = sin(vFlow.y * 3.1416);
    vec3 c = mix(vec3(0.025, 0.11, 0.15), vec3(0.035, 0.18, 0.25), across);
    float s = vnoise(vec2(vFlow.x * 2.2 - uTime * 0.9, vFlow.y * 5.0)), s2 = vnoise(vec2(vFlow.x * 6.0 - uTime * 1.7, vFlow.y * 9.0 + 3.0));
    c += vec3(0.09, 0.12, 0.12) * smoothstep(0.6, 0.85, s * 0.6 + s2 * 0.4) * across;
    float bank = 1.0 - smoothstep(0.0, 0.18, min(vFlow.y, 1.0 - vFlow.y));
    diffuseColor.rgb = mix(c, vec3(0.62, 0.72, 0.72), bank * 0.5 * smoothstep(0.35, 0.75, s2)); }`);
  };
  return m;
}
// the local frame of a point: up, and east and south along the ground (the flat map: y, x and z; the globe: away
// from its centre, and round it)
const FRAME_FLAT = "vec3 UP_ = vec3(0.0, 1.0, 0.0), EX_ = vec3(1.0, 0.0, 0.0), EZ_ = vec3(0.0, 0.0, 1.0);";
const FRAME_GLOBE = "vec3 UP_ = normalize(position), EX_ = normalize(cross(vec3(0.0, 1.0, 0.0), UP_) + vec3(1e-6, 0.0, 0.0)), EZ_ = cross(EX_, UP_);";
/** Points drawn wholly on the GPU (smoke, gulls); `globe`: their up is away from the ball's centre. */
export function pointsMaterial(LIFE, vs, fs, globe = false) {
  return new THREE.ShaderMaterial({
    uniforms: LIFE, transparent: true, depthWrite: false,
    vertexShader: "uniform float uTime, uScale, uNear;\n" + vs.replace("#FRAME", globe ? FRAME_GLOBE : FRAME_FLAT),
    fragmentShader: fs.replace("#END", "#include <tonemapping_fragment>\n#include <colorspace_fragment>"),
  });
}
/** Wisps of smoke from the chimneys: a few puffs each, rising, drifting with the wind and fading; seen only up close.
 *  `src`: x, y, z of each chimney; `k`: the size of the map's units (the globe's tiles are larger). */
export function smokeWisps(LIFE, src, { col = "0.8, 0.8, 0.78", big = 1, alpha = 0.32, globe = false, k = 1 } = {}) {
  const K = 4, n = src.length / 3, P = new Float32Array(n * K * 3), PH = new Float32Array(n * K);
  for (let i = 0; i < n; i++) for (let q = 0; q < K; q++) { P.set([src[i * 3], src[i * 3 + 1], src[i * 3 + 2]], (i * K + q) * 3); PH[i * K + q] = q / K + hash(i, 5) * 0.37; }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setAttribute("aPhase", new THREE.BufferAttribute(PH, 1));
  const B = (big * k).toFixed(2);
  const m = new THREE.Points(g, pointsMaterial(LIFE, `attribute float aPhase; varying float vA;
      void main() {
        #FRAME
        float age = fract(uTime * 0.11 + aPhase);
        vec3 p = position + (EX_ * (age * 0.32 + sin(age * 5.0 + aPhase * 30.0) * 0.03) + UP_ * (age * 0.75) + EZ_ * (age * 0.1)) * ${B};
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uScale * (0.07 + age * 0.24) * ${B} / -mv.z;
        vA = (1.0 - age) * smoothstep(0.0, 0.15, age) * ${alpha.toFixed(2)} * uNear;
      }`, `varying float vA;
      void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0, a = exp(-r * 3.0) * (1.0 - r) * vA; if (a <= 0.004) discard; gl_FragColor = vec4(vec3(${col}), a);
      #END
      }`, globe));
  m.frustumCulled = false; m.renderOrder = 2; m.userData.life = true;
  return m;
}
/** Gulls circling over the coasts: a few billboards, wings beating. `spots`: x, y, z (the sea) and a seed (a tile)
 *  each; `up(x, y, z)`: the way up there. */
export function gullFlock(LIFE, spots, { globe = false, k = 1, up = () => [0, 1, 0] } = {}) {
  const K = 3, n = spots.length / 4, P = new Float32Array(n * K * 3), A = new Float32Array(n * K * 4);
  for (let s = 0; s < n; s++) { const i = spots[s * 4 + 3], x = spots[s * 4], y = spots[s * 4 + 1], z = spots[s * 4 + 2], u = up(x, y, z); for (let q = 0; q < K; q++) { const j = s * K + q, h = (0.9 + hash(i, q, 3) * 0.7) * k; P.set([x + u[0] * h, y + u[1] * h, z + u[2] * h], j * 3); A.set([0.5 + hash(i, q, 5) * 0.9, (hash(i, q, 7) < 0.5 ? -1 : 1) * (0.25 + hash(i, q, 9) * 0.2), hash(i, q, 11) * 6.283, hash(i, q, 13) * 6.283], j * 4); } }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.setAttribute("aOrbit", new THREE.BufferAttribute(A, 4));
  const B = k.toFixed(2);
  const m = new THREE.Points(g, pointsMaterial(LIFE, `attribute vec4 aOrbit; varying float vFlap; varying float vA;
      void main() {
        #FRAME
        float a = uTime * aOrbit.y + aOrbit.z;
        vec3 p = position + (EX_ * (cos(a) * aOrbit.x) + UP_ * (sin(uTime * 0.5 + aOrbit.w) * 0.12) + EZ_ * (sin(a) * aOrbit.x)) * ${B};
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uScale * 0.2 * ${B} / -mv.z;
        vFlap = sin(uTime * 7.0 + aOrbit.w * 3.0); vA = uNear;
      }`, `varying float vFlap; varying float vA;
      void main() {
        vec2 d = gl_PointCoord - 0.5; float x = abs(d.x);
        float wing = d.y + 0.08 - x * (0.55 + vFlap * 0.45) + x * x * 0.9; // a gull's M, its wings up and down
        float a = (1.0 - smoothstep(0.035, 0.07, abs(wing))) * (1.0 - smoothstep(0.38, 0.46, x)) * vA;
        if (a <= 0.02) discard;
        gl_FragColor = vec4(mix(vec3(0.95), vec3(0.3, 0.32, 0.35), smoothstep(0.25, 0.42, x)), a);
      #END
      }`, globe));
  m.frustumCulled = false; m.renderOrder = 2; m.userData.life = true;
  return m;
}
/** A warm light over each electrified town, seen from afar (added light, no shadow). */
export function townGlow(LIFE, src, k = 1) {
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(src, 3));
  const m = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: LIFE, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uScale;\nvoid main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = min(uScale * ${(2.6 * k).toFixed(2)} / -mv.z, 512.0); }`,
    fragmentShader: "void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r >= 1.0) discard; float a = (1.0 - r) * (1.0 - r) * 0.22; gl_FragColor = vec4(vec3(1.0, 0.62, 0.28) * a, 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
  }));
  m.frustumCulled = false; m.renderOrder = 3;
  return m;
}
