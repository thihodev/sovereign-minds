// The world in 3D (Three.js): the same tiles, owners, roads, towns and events as the 2D map, lifted into relief.
// app.js loads this module only when the Watcher turns 3D on; it hands over the data and its own helpers (hooks)
// and gets picking and hovering back, so the inspector and everything else work as in 2D.
//
// The land is one continuous height field (a fine triangle lattice), shaped from the tiles' elevations: plains,
// valleys, ridged mountain massifs, beaches sloping into a sea whose colour deepens with the depth below it.
// Who holds what is painted onto that surface by the shaders (hex lookup per pixel): territory tint, border
// ribbons, war fronts, plazas, fields, hover and pin outlines — so nothing floats over or sinks into the slopes.
import * as THREE from "three";
import { MapControls } from "three/addons/MapControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/CSS2DRenderer.js";
import { mergeGeometries } from "three/addons/BufferGeometryUtils.js";

const SQ3 = Math.sqrt(3);
const WATER = new Set(["ocean", "shallow"]);
const ROAD_COLOR = [null, "#94744c", "#a89670", "#bdb8ac", "#4f4a46"];
const TONE = { good: "#4cc283", bad: "#ef6b60", "": "#ffd84a" };
// ground colours of the lit relief (sRGB)
const GROUND = { grass: "#82ad48", forest: "#4f7d32", taiga: "#526f4a", jungle: "#3a7230", hill: "#97954f", mountain: "#7c7165", coast: "#d6c690", swamp: "#5f7150", desert: "#d8bb7c", tundra: "#a2ad98", glacier: "#d6e4ec", icewall: "#eef6fb" };
const GRASS_ZONE = { cold: "#88a064", temp: "#82ad48", trop: "#6daa40" };
const SAND = "#d4c48e", ROCK = "#6c6359", SNOW = "#f4f7f9", SEABED = "#b8aa7a";
const hash = (...k) => { let h = 2166136261; for (const x of k) { h ^= x; h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// ------------------------------------------------------------------ noise (gradient noise, seeded by the world)
const PERM = new Uint8Array(512);
function seedNoise(seed) {
  let s = 0; for (const ch of String(seed)) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
const grad = (h, x, y) => { const g = h & 7, u = g < 4 ? x : y, v = g < 4 ? y : x; return ((g & 1) ? -u : u) + ((g & 2) ? -v : v); };
function perlin(x, y) {
  const fx = Math.floor(x), fy = Math.floor(y), X = fx & 255, Y = fy & 255; x -= fx; y -= fy;
  const u = fade(x), v = fade(y), A = PERM[X] + Y, B = PERM[X + 1] + Y;
  const a = grad(PERM[A], x, y) + u * (grad(PERM[B], x - 1, y) - grad(PERM[A], x, y));
  const b = grad(PERM[A + 1], x, y - 1) + u * (grad(PERM[B + 1], x - 1, y - 1) - grad(PERM[A + 1], x, y - 1));
  return (a + v * (b - a)) * 0.7;
}
const fbm = (x, y) => perlin(x, y) * 0.6 + perlin(x * 2.03, y * 2.03) * 0.28 + perlin(x * 4.1, y * 4.1) * 0.12;
function ridged(x, y) {
  let s = 0, a = 0.62, w = 1;
  for (let o = 0; o < 4; o++) { let n = 1 - Math.abs(perlin(x, y)); n *= n * w; w = clamp(n * 1.6, 0, 1); s += n * a; a *= 0.5; x = x * 2.07 + 3.1; y = y * 2.07 - 1.7; }
  return s;
}

/** The triangle of a lattice (rows `dz` apart, points `s` apart, odd rows shifted by s/2) under (x, z): its three
 *  point indices and weights, written into `o` = [i0, i1, i2, w0, w1, w2]. Tiles and the land's vertices both use it. */
function lattice(x, z, s, dz, x0, z0, nc, nr, o) {
  let r = Math.floor((z - z0) / dz); r = clamp(r, 0, nr - 2);
  const t = clamp((z - z0) / dz - r, 0, 1), odd = r & 1;
  const u = odd ? (x - x0 - s / 2) / s + t * 0.5 : (x - x0) / s - t * 0.5;
  let c = Math.floor(u), f = u - c;
  if (c < 0) { c = 0; f = 0; } else if (c > nc - 2) { c = nc - 2; f = 1; }
  const i00 = r * nc + c, i01 = i00 + 1, i10 = i00 + nc, i11 = i10 + 1;
  if (!odd) { if (f + t <= 1) { o[0] = i00; o[1] = i01; o[2] = i10; o[3] = 1 - f - t; o[4] = f; o[5] = t; } else { o[0] = i11; o[1] = i01; o[2] = i10; o[3] = f + t - 1; o[4] = 1 - t; o[5] = 1 - f; } }
  else if (t >= f) { o[0] = i00; o[1] = i10; o[2] = i11; o[3] = 1 - t; o[4] = t - f; o[5] = f; }
  else { o[0] = i00; o[1] = i01; o[2] = i11; o[3] = 1 - f; o[4] = f - t; o[5] = t; }
  return o;
}

/** A builder of plain triangles with a colour each, for roads, rails and the map's edge. */
class Tris {
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
const SHAPES = {
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
  person: () => { const b = new THREE.ConeGeometry(0.32, 0.8, 6).translate(0, 0.4, 0), h = new THREE.SphereGeometry(0.2, 8, 6).translate(0, 0.95, 0); return mergeGeometries([ni(b), ni(h)]); },
};
const GEO = {};
const geo = k => (GEO[k] ??= SHAPES[k]());
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ the hex painter, shared by the land and the sea shaders
const HEX_GLSL = /* glsl */`
uniform highp sampler2D uTiles;
uniform highp sampler2D uPal;
uniform float uN, uHover, uPin, uSel, uBand, uTime;
uniform vec2 uOrigin;
varying vec3 vWorld;
const vec2 NRM[6] = vec2[6](vec2(1.0, 0.0), vec2(0.5, -0.8660254), vec2(-0.5, -0.8660254), vec2(-1.0, 0.0), vec2(-0.5, 0.8660254), vec2(0.5, 0.8660254));
vec2 hexCell(vec2 p, out vec2 centre) {
  vec2 q = p + uOrigin;
  float r = q.y / 1.5, a = q.x / 1.7320508 - r * 0.5;
  vec3 cube = vec3(a, r, -a - r), rc = floor(cube + 0.5), df = abs(rc - cube);
  if (df.x > df.y && df.x > df.z) rc.x = -rc.y - rc.z; else if (df.y > df.z) rc.y = -rc.x - rc.z;
  float row = rc.y, col = rc.x + (row - mod(row, 2.0)) * 0.5;
  centre = vec2(1.7320508 * (rc.x + row * 0.5), 1.5 * row) - uOrigin;
  return vec2(col, row);
}
vec3 hexPaint(vec3 col, vec2 p, float water, out vec3 glow) {
  glow = vec3(0.0);
  vec2 c; vec2 cr = hexCell(p, c);
  if (cr.x < 0.0 || cr.y < 0.0 || cr.x >= uN || cr.y >= uN) return col;
  ivec4 t = ivec4(texelFetch(uTiles, ivec2(cr), 0) * 255.0 + 0.5);
  float idx = cr.y * uN + cr.x, pw = max(fwidth(p.x), fwidth(p.y));
  vec2 d = p - c;
  int owner = t.r - 1, bmask = t.g & 63, fmask = t.b & 63;
  float emin = 1.0, band = 0.0, front = 0.0, inner = 0.0, edge = 0.0, W = max(uBand, pw * 3.5), FW = max(max(uBand * 1.8, 0.2), pw * 5.0), IW = max(0.8, pw * 16.0);
  for (int k = 0; k < 6; k++) {
    float e = 0.8660254 - dot(d, NRM[k]);
    emin = min(emin, e);
    if ((bmask & (1 << k)) != 0) { band = max(band, 1.0 - smoothstep(W - pw, W + pw, e)); inner = max(inner, 1.0 - smoothstep(0.0, IW, e)); edge = max(edge, 1.0 - smoothstep(0.0, pw * 1.2, e)); }
    if ((fmask & (1 << k)) != 0) { front = max(front, 1.0 - smoothstep(FW - pw, FW + pw, e)); inner = max(inner, 1.0 - smoothstep(0.0, IW, e)); }
  }
  vec3 nc = owner >= 0 ? texelFetch(uPal, ivec2(owner, 0), 0).rgb : vec3(0.0);
  if (owner >= 0) col = mix(col, nc, (water > 0.5 ? 0.16 : 0.18) + inner * inner * 0.26);
  if (water < 0.5) {
    // what people made of the ground: fields, salt pans, the paved heart of each town
    float fine = 1.0 - smoothstep(0.015, 0.06, pw), dl = length(d);
    int tier = t.g >> 6;
    if ((t.b & 64) != 0 && emin > 0.08) {
      float h = fract(sin(idx * 12.9898) * 43758.5453) * 3.1416;
      vec2 dir = vec2(cos(h), sin(h));
      float u = dot(d, dir), v = dot(d, vec2(-dir.y, dir.x)), plot = mod(floor(v * 2.4 + 3.0 + h), 3.0);
      vec3 fc = plot < 0.5 ? vec3(0.52, 0.36, 0.06) : plot < 1.5 ? vec3(0.22, 0.36, 0.05) : vec3(0.30, 0.19, 0.07);
      float furrow = 0.5 + 0.5 * sin(u * 30.0);
      col = mix(col, fc * (1.0 - 0.3 * furrow * fine), 0.88);
      col *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.02 + pw, fract(v * 2.4 + h) / 2.4)) * fine; // a hedge between the plots
    }
    if ((t.b & 128) != 0 && emin > 0.1) {
      vec2 g = fract(d * 3.4 + 0.5);
      float sq = step(0.1, g.x) * step(g.x, 0.9) * step(0.1, g.y) * step(g.y, 0.9);
      col = mix(col, vec3(0.86, 0.87, 0.85), 0.92 * sq);
    }
    if (tier > 0) {
      float R = tier == 1 ? 0.2 : tier == 2 ? 0.27 : 0.33;
      float inP = 1.0 - smoothstep(R - pw, R + pw, dl);
      vec2 cell = floor(d * 10.0);
      float cob = fine * 0.12 * fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
      col = mix(col, vec3(0.36, 0.31, 0.24) * (1.0 - cob), inP * 0.92);
      col *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.025 + pw, abs(dl - R)));
    }
  }
  int ov = t.a >> 1;
  if (ov > 0) col = mix(col, (t.a & 1) == 1 ? vec3(0.78, 0.03, 0.01) : vec3(1.0, 0.66, 0.0), 0.15 + float(ov) / 127.0 * 0.6);
  bool dim = uSel >= 0.0 && float(owner) != uSel;
  if (dim) col = mix(col, vec3(0.19, 0.21, 0.24), 0.5) * 0.7;
  // borders: a ribbon of the owner's colour along the edge, glowing; a war front striped yellow and black
  float bk = dim ? 0.45 : 1.0;
  if (band > 0.0) { col = mix(col, nc, band * bk); glow += nc * band * 0.6 * bk; col *= 1.0 - edge * 0.55; }
  if (front > 0.0) {
    float s = step(0.5, fract((p.x + p.y) * 1.2));
    vec3 fcol = s > 0.5 ? vec3(1.0, 0.56, 0.02) : vec3(0.012, 0.009, 0.004);
    col = mix(col, fcol, front); glow += fcol * front * 0.7;
  }
  // the hex grid, faint, only up close
  col *= 1.0 - (1.0 - smoothstep(0.0, pw * 1.3, emin)) * (1.0 - smoothstep(0.03, 0.09, pw)) * 0.2;
  if (idx == uPin) { float o = 1.0 - smoothstep(0.08 + pw, 0.08 + pw * 2.5, emin); col = mix(col, vec3(1.0, 0.75, 0.15), 0.22 + 0.75 * o); glow += vec3(1.0, 0.7, 0.12) * o * 0.9; }
  else if (idx == uHover) { float o = 1.0 - smoothstep(0.05 + pw, 0.05 + pw * 2.5, emin); col = mix(col, vec3(1.0), 0.12 + 0.8 * o); glow += vec3(0.7) * o; }
  return col;
}
`;
const WORLD_VERTEX = s => "varying vec3 vWorld;\n" + s.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");

export function create(container, hooks) {
  // ------------------------------------------------------------------ scene, camera, renderer
  const mobile = matchMedia("(pointer: coarse)").matches || Math.min(innerWidth, innerHeight) < 600;
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: "high-performance" });
  const DPR_MAX = Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.5); // labels are HTML, crisp anyway: the land need not pay for every retina pixel
  let dpr = DPR_MAX; renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !mobile; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // the land and the towns stand still: shadows are cast again only when they change
  const reshadow = () => { renderer.shadowMap.needsUpdate = true; };
  renderer.domElement.className = "map3d-canvas"; renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("aria-label", "Bản đồ thế giới 3D: kéo để di chuyển, chuột phải hoặc hai ngón để xoay, lăn để phóng to");
  container.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer(); labels.domElement.className = "map3d-labels"; container.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 2000);
  const controls = new MapControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.12, screenSpacePanning: false, maxPolarAngle: 1.32, minDistance: 4, maxDistance: 420, zoomSpeed: 1.2 });
  // a warm low sun from the south-west, a cool sky above and a faint blue fill from the other side
  const hemi = new THREE.HemisphereLight(0xc4d8ff, 0x4a3a28, 1.25); scene.add(hemi);
  const SUN_DIR = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();
  const sun = new THREE.DirectionalLight(0xffdcb0, 3.1); scene.add(sun); scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0x7fa2ff, 0.45); fill.position.set(80, 60, -90); scene.add(fill);
  sun.castShadow = renderer.shadowMap.enabled;
  const SHADOW = Math.min(renderer.capabilities.maxTextureSize, 4096);
  sun.shadow.mapSize.set(SHADOW, SHADOW); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
  scene.fog = new THREE.Fog(0x152630, 200, 700);

  // ------------------------------------------------------------------ the world's shape
  let ST = null, S = null, N = 128, X0 = 0, Z0 = 0, HT = null, NBS = null;
  const pos = i => { const c = i % N, r = (i / N) | 0; return [SQ3 * (c + 0.5 * (r & 1)) - X0, 1.5 * r - Z0]; };
  const top = i => (HT ? HT[i] : 0);
  const isWater = i => WATER.has(ST.terrain[i]);
  const NB = i => { const c = i % N, r = (i / N) | 0, D = r & 1 ? [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]] : [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]]; return D.map(([dc, dr]) => { const cc = c + dc, rr = r + dr; return cc >= 0 && cc < N && rr >= 0 && rr < N ? rr * N + cc : -1; }); };
  const at = (i, dy = 0) => { const [x, z] = pos(i); return new THREE.Vector3(x, top(i) + dy, z); };
  /** The tile under a point of the plane, or -1 off the map. */
  function hexAt(x, z) {
    const r = (z + Z0) / 1.5, a = (x + X0) / SQ3 - r / 2, cz = -a - r;
    let rx = Math.round(a), ry = Math.round(r); const rz = Math.round(cz);
    const dx = Math.abs(rx - a), dy = Math.abs(ry - r), dz = Math.abs(rz - cz);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz;
    const col = rx + (ry - (ry & 1)) / 2;
    return col >= 0 && col < N && ry >= 0 && ry < N ? ry * N + col : -1;
  }

  // the land's lattice: GX × GZ points `GS` apart
  const GS = mobile ? 0.7 : 0.5, GDZ = GS * SQ3 / 2, CHUNKS = 4;
  let GX = 0, GZ = 0, gx0 = 0, gz0 = 0, G = null, HMAX = 4;
  const tri = [0, 0, 0, 0, 0, 0];
  /** The height of the land's surface at (x, z), exactly as the mesh is drawn. */
  function surf(x, z) { lattice(x, z, GS, GDZ, gx0, gz0, GX, GZ, tri); return G[tri[0]] * tri[3] + G[tri[1]] * tri[4] + G[tri[2]] * tri[5]; }
  /** The ground or the sea surface, whichever is higher. */
  const ground = (x, z) => Math.max(0, surf(x, z));

  /** Each tile's part in the relief: land height, sea depth, how mountainous and how rough. */
  function tileShapes() {
    const NN = N * N, Hl = new Float32Array(NN), Dw = new Float32Array(NN), Lm = new Float32Array(NN), Mt = new Float32Array(NN), Rg = new Float32Array(NN), Hb = new Float32Array(NN), Col = new Float32Array(NN * 3);
    const dist = new Int16Array(NN).fill(-1), queue = [];
    for (let i = 0; i < NN; i++) if (!isWater(i)) { dist[i] = 0; queue.push(i); }
    for (let q = 0; q < queue.length; q++) for (const j of NBS[queue[q]]) if (j >= 0 && dist[j] < 0) { dist[j] = dist[queue[q]] + 1; queue.push(j); }
    // how deep inside its range each mountain lies: the edges low, the heart of the range highest
    const high = t => t === "mountain" || t === "icewall", deep = new Int16Array(NN).fill(0), mq = [];
    for (let i = 0; i < NN; i++) if (high(ST.terrain[i]) && NBS[i].some(j => j < 0 || !high(ST.terrain[j]))) { deep[i] = 1; mq.push(i); }
    for (let q = 0; q < mq.length; q++) for (const j of NBS[mq[q]]) if (j >= 0 && high(ST.terrain[j]) && !deep[j]) { deep[j] = deep[mq[q]] + 1; mq.push(j); }
    const c = new THREE.Color();
    for (let i = 0; i < NN; i++) {
      const t = ST.terrain[i];
      if (WATER.has(t)) { Lm[i] = -1; Dw[i] = t === "shallow" ? 0.28 + 0.12 * Math.min(dist[i], 3) : 0.6 + 0.3 * Math.min(Math.max(0, dist[i] - 1), 6); c.set(SEABED); }
      else {
        Lm[i] = 1;
        const e = clamp(((ST.elev?.[i] ?? 40) - 20) / 70, 0, 1), base = 0.2 + e * 1.35;
        let h = base, mt = 0, rg = 0.08;
        if (t === "coast") { h = 0.12 + e * 0.15; rg = 0.03; }
        else if (t === "swamp") { h = Math.min(base, 0.15); rg = 0.02; }
        else if (t === "desert") { h = base * 0.85; rg = 0.1; }
        else if (t === "hill") { h = base + 0.42; mt = 0.08; rg = 0.2; Hb[i] = 1; }
        else if (t === "mountain") { const k = Math.min(1, (deep[i] || 3) / 3); h = base + 0.5 + 0.35 * k; mt = 0.4 + 0.6 * k; rg = 0.2; Hb[i] = 0.6; }
        else if (t === "glacier") { h = base + 0.4; mt = 0.25; rg = 0.12; }
        else if (t === "icewall") { h = 2.3; mt = 0.85; rg = 0.2; }
        else if (t === "forest" || t === "jungle" || t === "taiga") rg = 0.1;
        Hl[i] = h; Mt[i] = mt; Rg[i] = rg;
        c.set(t === "grass" ? GRASS_ZONE[ST.zone?.[i]] ?? GROUND.grass : GROUND[t] ?? hooks.terrain?.[t]?.[1] ?? "#888888");
      }
      Col[i * 3] = c.r; Col[i * 3 + 1] = c.g; Col[i * 3 + 2] = c.b;
    }
    // under the sea the land's height is its neighbours' (so a cliff meets the water, not a step)
    for (let i = 0; i < NN; i++) if (Lm[i] < 0) { let s = 0, k = 0; for (const j of NBS[i]) if (j >= 0 && Lm[j] > 0) { s += Hl[j]; k++; } Hl[i] = k ? s / k : 0.06; }
    return { Hl, Dw, Lm, Mt, Rg, Hb, Col };
  }

  /** The height field: tile values blended across the lattice of tile centres, beaches, ridged massifs, river valleys. */
  function heights() {
    seedNoise(ST.seed ?? "world");
    NBS = Array.from({ length: N * N }, (_, i) => NB(i));
    gx0 = -X0 - 1.4; gz0 = -Z0 - 1.4;
    GX = Math.ceil((2 * X0 + 2.8) / GS) + 2; GZ = Math.ceil((1.5 * (N - 1) + 2.8) / GDZ) + 1;
    const V = GX * GZ, T = tileShapes(), o = [0, 0, 0, 0, 0, 0];
    G = new Float32Array(V);
    const col = new Float32Array(V * 3), L0 = new Float32Array(V), LH = new Float32Array(V), DEP = new Float32Array(V);
    for (let r = 0; r < GZ; r++) for (let c = 0; c < GX; c++) {
      const v = r * GX + c, x = gx0 + c * GS + (r & 1) * GS / 2, z = gz0 + r * GDZ;
      lattice(x, z, SQ3, 1.5, -X0, -Z0, N, N, o);
      let lm = 0, land = 0, dep = 0, mt = 0, rg = 0, hb = 0, cr = 0, cg = 0, cb = 0, ws = 0;
      for (let k = 0; k < 3; k++) {
        const i = o[k], w = o[k + 3]; lm += T.Lm[i] * w; land += T.Hl[i] * w; dep += T.Dw[i] * w; mt += T.Mt[i] * w; rg += T.Rg[i] * w; hb += T.Hb[i] * w;
        const ww = w * w * w * w; cr += T.Col[i * 3] * ww; cg += T.Col[i * 3 + 1] * ww; cb += T.Col[i * 3 + 2] * ww; ws += ww;
      }
      // land: gentle undulation everywhere, ridges where the mountains are
      let lh = land + rg * (fbm(x * 0.3, z * 0.3) * 1.1 + fbm(x * 0.9 + 11, z * 0.9 - 5) * 0.6);
      if (hb > 0.01) lh += hb * Math.max(0, 0.35 + fbm(x * 0.55 - 4, z * 0.55 + 2)) * 0.9; // rolling hills
      if (mt > 0.01) lh += mt * mt * (ridged(x * 0.2 + 7.3, z * 0.2 - 3.1) * 2.7 - 0.25);
      L0[v] = lm; LH[v] = lh; DEP[v] = dep;
      col[v * 3] = cr / ws; col[v * 3 + 1] = cg / ws; col[v * 3 + 2] = cb / ws;
    }
    // the shore, softened: a coastline that curves instead of tracing the hexes
    const L = boxBlur(L0, GX, GZ, 2), DB = boxBlur(DEP, GX, GZ, 3);
    for (let r = 0; r < GZ; r++) for (let c = 0; c < GX; c++) {
      const v = r * GX + c, x = gx0 + c * GS + (r & 1) * GS / 2, z = gz0 + r * GDZ, lm = L[v], lh = LH[v], dep = DB[v];
      if (lm >= 0) G[v] = 0.06 + (lh - 0.06) * smooth(0, 0.62, lm);
      else if (lm > -0.2) G[v] = 0.06 + lm / 0.2 * 0.14;
      else G[v] = -0.08 - (dep - 0.08) * smooth(0.2, 0.85, -lm) + fbm(x * 0.5, z * 0.5) * 0.06;
    }
    carveRivers();
    HMAX = 0; for (let v = 0; v < V; v++) HMAX = Math.max(HMAX, G[v]);
    HMAX += 0.1;
    HT = new Float32Array(N * N); for (let i = 0; i < N * N; i++) { const [x, z] = pos(i); HT[i] = ground(x, z); }
    return { col, L };
  }

  /** Rivers wear their valleys: the land along each course is lowered, never below the sea. */
  let riverPaths = [], CUT = null;
  /** How deep the river has cut at (x, z): 0 away from every river. */
  const riverAt = (x, z) => { lattice(x, z, GS, GDZ, gx0, gz0, GX, GZ, tri); return CUT[tri[0]] * tri[3] + CUT[tri[1]] * tri[4] + CUT[tri[2]] * tri[5]; };
  function carveRivers() {
    riverPaths = [];
    const cut = CUT = new Float32Array(G.length);
    for (const path of ST.rivers || []) {
      if (path.length < 2) continue;
      let pts = path.map(i => pos(i));
      for (let it = 0; it < 2; it++) { const q = [pts[0]]; for (let k = 0; k < pts.length - 1; k++) { const [a, b] = [pts[k], pts[k + 1]]; q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } q.push(pts.at(-1)); pts = q; }
      riverPaths.push(pts);
      const R = 0.7;
      for (let k = 0; k < pts.length - 1; k++) {
        const [ax, az] = pts[k], [bx, bz] = pts[k + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
        const r0 = Math.max(0, Math.floor((Math.min(az, bz) - R - gz0) / GDZ)), r1 = Math.min(GZ - 1, Math.ceil((Math.max(az, bz) + R - gz0) / GDZ));
        const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - R - gx0) / GS) - 1), c1 = Math.min(GX - 1, Math.ceil((Math.max(ax, bx) + R - gx0) / GS) + 1);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          const x = gx0 + c * GS + (r & 1) * GS / 2, z = gz0 + r * GDZ, t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
          const d = Math.hypot(x - ax - dx * t, z - az - dz * t), v = r * GX + c;
          cut[v] = Math.max(cut[v], 0.2 * (1 - smooth(0.14, R, d)));
        }
      }
    }
    for (let v = 0; v < G.length; v++) if (cut[v] > 0 && G[v] > 0) G[v] = Math.max(G[v] - cut[v], Math.min(G[v], 0.035));
  }

  // ------------------------------------------------------------------ the tiles' paint: owners, borders, fronts, plazas, overlays (one texel per tile)
  const tileTex = new THREE.DataTexture(new Uint8Array(128 * 128 * 4), 128, 128, THREE.RGBAFormat, THREE.UnsignedByteType);
  const palTex = new THREE.DataTexture(new Float32Array(256 * 4), 256, 1, THREE.RGBAFormat, THREE.FloatType);
  for (const t of [tileTex, palTex]) { t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; }
  const U = {
    uTiles: { value: tileTex }, uPal: { value: palTex }, uN: { value: 128 }, uOrigin: { value: new THREE.Vector2() },
    uHover: { value: -1 }, uPin: { value: -1 }, uSel: { value: -1 }, uBand: { value: 0.1 }, uTime: { value: 0 },
  };
  let selected = -1, pinned = -1, layer = null;
  function paintTiles() {
    if (!ST || !S) return;
    const NN = N * N;
    if (tileTex.image.width !== N) { tileTex.dispose(); tileTex.image = { data: new Uint8Array(NN * 4), width: N, height: N }; }
    const d = tileTex.image.data, owners = S.owners;
    const atWar = new Set((S.wars || []).flatMap(w => [`${w.a}:${w.b}`, `${w.b}:${w.a}`]));
    const tier = new Map(), fieldT = new Set(), saltT = new Set();
    for (const n of S.nations) {
      if (!n.alive || !n.founded) continue;
      const tiers = new Map((n.provinces || []).map(p => [p.centre, p.tier || 0]));
      for (const c of [n.capital, ...(n.settlements || []).map(s => s.tile)]) if (c >= 0 && owners[c] === n.id) tier.set(c, (tiers.get(c) ?? 0) + 1);
      for (const b of n.buildings || []) if (b.done) { if (b.type === "field") fieldT.add(b.tile); else if (b.type === "salt_pan") saltT.add(b.tile); }
    }
    for (let i = 0; i < NN; i++) {
      const o = owners[i];
      let bm = 0, fm = 0;
      if (o >= 0) for (let k = 0; k < 6; k++) { const j = NBS[i][k], oj = j >= 0 ? owners[j] : -1; if (oj === o) continue; if (oj >= 0 && atWar.has(`${o}:${oj}`)) fm |= 1 << k; else bm |= 1 << k; }
      let ov = 0;
      if (layer && layer.values[i] > 0) ov = (layer.threat ? 1 : 0) | (Math.max(1, Math.round(clamp(layer.values[i] / layer.max, 0, 1) * 127)) << 1);
      d[i * 4] = o >= 0 ? Math.min(255, o + 1) : 0;
      d[i * 4 + 1] = bm | (Math.min(3, tier.get(i) ?? 0) << 6);
      d[i * 4 + 2] = fm | (fieldT.has(i) ? 64 : 0) | (saltT.has(i) ? 128 : 0);
      d[i * 4 + 3] = ov;
    }
    tileTex.needsUpdate = true;
    const p = palTex.image.data, c = new THREE.Color();
    for (const n of S.nations) if (n.id < 255) { c.set(hooks.nationColor(n.id)); p[n.id * 4] = c.r; p[n.id * 4 + 1] = c.g; p[n.id * 4 + 2] = c.b; p[n.id * 4 + 3] = 1; }
    palTex.needsUpdate = true;
    need = true;
  }

  // ------------------------------------------------------------------ the land, the sea and the map's edge
  const groups = { fx: new THREE.Group() };
  scene.add(groups.fx);
  let world = null;
  function landMaterial() {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = WORLD_VERTEX(sh.vertexShader);
      sh.fragmentShader = HEX_GLSL + sh.fragmentShader
        .replace("#include <color_fragment>", "#include <color_fragment>\n  vec3 hexGlow; diffuseColor.rgb = hexPaint(diffuseColor.rgb, vWorld.xz, 0.0, hexGlow);")
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += hexGlow;");
    };
    return m;
  }
  function seaMaterial() {
    const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x40525e, shininess: 60 });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = "attribute float depth;\nvarying float vDepth;\n" + WORLD_VERTEX(sh.vertexShader).replace("#include <begin_vertex>", "#include <begin_vertex>\n  vDepth = depth;");
      sh.fragmentShader = HEX_GLSL + "varying float vDepth;\n" + sh.fragmentShader
        .replace("#include <color_fragment>", `#include <color_fragment>
  {
    float dep = vDepth;
    vec3 wc = mix(vec3(0.07, 0.34, 0.36), vec3(0.016, 0.12, 0.2), smoothstep(0.0, 0.75, dep));
    wc = mix(wc, vec3(0.004, 0.03, 0.075), smoothstep(0.75, 2.3, dep));
    float foam = 1.0 - smoothstep(0.0, 0.11, dep);
    foam *= 0.55 + 0.45 * sin(dep * 70.0 - uTime * 2.0 + sin(vWorld.x * 2.3 + vWorld.z * 1.7) * 2.0);
    wc = mix(wc, vec3(0.78, 0.86, 0.88), clamp(foam, 0.0, 1.0) * 0.85);
    diffuseColor.rgb = wc;
  }
  vec3 hexGlow; diffuseColor.rgb = hexPaint(diffuseColor.rgb, vWorld.xz, 1.0, hexGlow);`)
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
  {
    vec2 q = vWorld.xz; float t = uTime, amp = 0.07 * (1.0 - smoothstep(0.05, 0.4, max(fwidth(q.x), fwidth(q.y))));
    vec2 g = vec2(cos(q.x * 1.1 + t * 0.9 + sin(q.y * 0.6)) * 0.6 + cos(q.x * 2.6 - q.y * 1.9 + t * 1.7) * 0.4,
                  cos(q.y * 1.3 - t * 0.8 + sin(q.x * 0.5)) * 0.6 + cos(q.y * 3.1 + q.x * 1.4 - t * 1.4) * 0.4);
    normal = normalize((viewMatrix * vec4(normalize(vec3(-g.x * amp, 1.0, -g.y * amp)), 0.0)).xyz);
  }`)
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += hexGlow;");
    };
    return m;
  }
  function riverMaterial() {
    const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x2a3a44, shininess: 40 });
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = U.uTime;
      sh.vertexShader = "attribute vec2 flow;\nvarying vec2 vFlow;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vFlow = flow;");
      sh.fragmentShader = "uniform float uTime;\nvarying vec2 vFlow;\n" + sh.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
  { float across = sin(vFlow.y * 3.1416), s = sin(vFlow.x * 2.6 - uTime * 1.8 + sin(vFlow.y * 3.1416 + vFlow.x * 0.7) * 0.6);
    diffuseColor.rgb = mix(vec3(0.03, 0.12, 0.17), vec3(0.04, 0.2, 0.3), across) + vec3(0.05, 0.07, 0.08) * smoothstep(0.6, 1.0, s) * across * across; }`);
    };
    return m;
  }

  function buildWorld() {
    if (world) { scene.remove(world); disposeTree(world); }
    world = new THREE.Group(); scene.add(world);
    const { col, L } = heights(), V = GX * GZ;
    // the land: one lattice of triangles
    const P = new Float32Array(V * 3);
    for (let r = 0; r < GZ; r++) for (let c = 0; c < GX; c++) { const v = r * GX + c; P[v * 3] = gx0 + c * GS + (r & 1) * GS / 2; P[v * 3 + 1] = G[v]; P[v * 3 + 2] = gz0 + r * GDZ; }
    // cut into CHUNKS × CHUNKS pieces, so that up close the camera draws (and the sun shades) only what it sees
    const idx = new Uint32Array((GX - 1) * (GZ - 1) * 6), dryParts = [], wetParts = [];
    for (let q = 0; q < CHUNKS * CHUNKS; q++) { dryParts.push([]); wetParts.push([]); }
    let k = 0;
    for (let r = 0; r < GZ - 1; r++) for (let c = 0; c < GX - 1; c++) {
      const a = r * GX + c, b = a + 1, d = a + GX, e = d + 1, ch = Math.min(CHUNKS - 1, Math.floor(c * CHUNKS / (GX - 1))) + CHUNKS * Math.min(CHUNKS - 1, Math.floor(r * CHUNKS / (GZ - 1)));
      const two = (r & 1) ? [a, d, e, a, e, b] : [a, d, b, b, d, e];
      for (let q = 0; q < 6; q++) { idx[k++] = two[q]; dryParts[ch].push(two[q]); }
      for (let q = 0; q < 6; q += 3) if (Math.min(G[two[q]], G[two[q + 1]], G[two[q + 2]]) < 0.04) wetParts[ch].push(two[q], two[q + 1], two[q + 2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(P, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    // colour: beaches, bare rock on steep slopes, snow on the heights, shade in the hollows
    const nrm = g.getAttribute("normal").array, blur = boxBlur(G, GX, GZ, 3), sand = new THREE.Color(SAND), rock = new THREE.Color(ROCK), snow = new THREE.Color(SNOW), c = new THREE.Color();
    for (let r = 0; r < GZ; r++) for (let cc = 0; cc < GX; cc++) {
      const v = r * GX + cc, x = P[v * 3], z = P[v * 3 + 2], h = G[v], ny = nrm[v * 3 + 1];
      c.setRGB(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]);
      const tone = 1 + 0.1 * perlin(x * 0.7, z * 0.7) + 0.05 * perlin(x * 2.9, z * 2.9);
      c.multiplyScalar(tone);
      if (L[v] > -0.4 && L[v] < 0.55) c.lerp(sand, (1 - smooth(0.1, 0.24, h)) * (1 - smooth(0.25, 0.55, L[v])) * 0.85);
      if (h > 0.25) c.lerp(rock, smooth(0.86, 0.66, ny) * 0.85);
      c.lerp(snow, smooth(3.8, 4.1, h + 0.45 * perlin(x * 0.45, z * 0.45)) * smooth(0.45, 0.7, ny));
      // hillshade, exaggerated as on a relief map: slopes facing the sun lighter, the others darker
      const lit = nrm[v * 3] * SUN_DIR.x + ny * SUN_DIR.y + nrm[v * 3 + 2] * SUN_DIR.z, shade = h > 0 ? clamp(1 + (lit - SUN_DIR.y) * 0.9, 0.6, 1.25) : 1;
      const ao = clamp(1 - (blur[v] - h) * 0.55, 0.55, 1.08) * shade;
      col[v * 3] = c.r * ao; col[v * 3 + 1] = c.g * ao; col[v * 3 + 2] = c.b * ao;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const landMat = landMaterial();
    for (const m of pieces(g, dryParts, landMat)) { m.castShadow = true; m.receiveShadow = true; world.add(m); }
    // the sea: a flat sheet at 0 over every wet triangle, knowing how deep it is
    const depth = new Float32Array(V), SP = new Float32Array(V * 3);
    for (let v = 0; v < V; v++) { depth[v] = Math.max(0, -G[v]); SP[v * 3] = P[v * 3]; SP[v * 3 + 2] = P[v * 3 + 2]; }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(SP, 3));
    sg.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(V * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    sg.setAttribute("depth", new THREE.BufferAttribute(depth, 1));
    const seaMat = seaMaterial();
    for (const m of pieces(sg, wetParts, seaMat)) { m.receiveShadow = true; world.add(m); }
    // the map's edge: earth cut down to a dark base, like a table model
    const E = new Tris(), earth = new THREE.Color("#4a3c2e"), base = new THREE.Color("#120e0b"), deep = new THREE.Color("#0d2a3a");
    const edge = (list, out) => {
      for (let q = 0; q < list.length - 1; q++) {
        const a = list[q], b = list[q + 1], ya = Math.max(0, G[a]), yb = Math.max(0, G[b]);
        const A = [P[a * 3], ya, P[a * 3 + 2]], B = [P[b * 3], yb, P[b * 3 + 2]], A2 = [A[0], -4, A[2]], B2 = [B[0], -4, B[2]];
        const ca = G[a] < 0 ? deep : earth, cb = G[b] < 0 ? deep : earth;
        const tri = (p1, c1, p2, c2, p3, c3) => { for (const [p, cl] of out ? [[p1, c1], [p3, c3], [p2, c2]] : [[p1, c1], [p2, c2], [p3, c3]]) { E.p.push(...p); E.c.push(cl.r, cl.g, cl.b); } };
        tri(A, ca, B, cb, B2, base); tri(A, ca, B2, base, A2, base);
      }
    };
    edge(Array.from({ length: GX }, (_, c) => c), false);
    edge(Array.from({ length: GX }, (_, c) => (GZ - 1) * GX + c), true);
    edge(Array.from({ length: GZ }, (_, r) => r * GX), true);
    edge(Array.from({ length: GZ }, (_, r) => r * GX + GX - 1), false);
    const skirt = new THREE.Mesh(E.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); world.add(skirt);
    // rivers: a flowing ribbon down each valley, widening towards the sea
    const RP = [], RF = [], RI = [];
    for (const pts of riverPaths) {
      let len = 0, total = 0;
      for (let q = 1; q < pts.length; q++) total += Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]);
      const samples = [];
      for (let q = 0; q < pts.length - 1; q++) {
        const [ax, az] = pts[q], [bx, bz] = pts[q + 1], L2 = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L2 / 0.2));
        for (let s = 0; s < n; s++) samples.push([ax + (bx - ax) * s / n, az + (bz - az) * s / n, len + L2 * s / n]);
        len += L2;
      }
      samples.push([...pts.at(-1), total]);
      const base0 = RP.length / 3;
      samples.forEach(([x, z, l], s) => {
        const nx = samples[Math.min(s + 1, samples.length - 1)], pv = samples[Math.max(s - 1, 0)], dx = nx[0] - pv[0], dz = nx[1] - pv[1], D = Math.hypot(dx, dz) || 1;
        const w = (0.1 + 0.14 * l / Math.max(1, total)), ox = -dz / D * w, oz = dx / D * w, yc = ground(x, z) + 0.02;
        RP.push(x + ox, Math.max(yc, ground(x + ox, z + oz) + 0.012), z + oz, x - ox, Math.max(yc, ground(x - ox, z - oz) + 0.012), z - oz);
        RF.push(l, 0, l, 1);
        if (s) { const a = base0 + (s - 1) * 2; RI.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      });
    }
    if (RP.length) {
      const rg = new THREE.BufferGeometry();
      rg.setAttribute("position", new THREE.Float32BufferAttribute(RP, 3)); rg.setAttribute("flow", new THREE.Float32BufferAttribute(RF, 2)); rg.setIndex(RI); rg.computeVertexNormals();
      const rm = new THREE.Mesh(rg, riverMaterial()); rm.material.side = THREE.DoubleSide; rm.receiveShadow = true; world.add(rm);
    }
    U.uN.value = N; U.uOrigin.value.set(X0, Z0);
    reshadow(); need = true;
  }
  /** Meshes sharing one set of vertices, each drawing its own part of the triangles, each with its own bounds. */
  function pieces(base, parts, material) {
    const out = [], pa = base.getAttribute("position").array;
    for (const list of parts) {
      if (!list.length) continue;
      const g = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(base.attributes)) g.setAttribute(name, attr);
      g.setIndex(list);
      const box = new THREE.Box3();
      for (const v of list) box.expandByPoint(tmpP.set(pa[v * 3], pa[v * 3 + 1], pa[v * 3 + 2]));
      g.boundingBox = box; g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      out.push(new THREE.Mesh(g, material));
    }
    return out;
  }
  function boxBlur(src, w, h, r) {
    const a = new Float32Array(src.length), b = new Float32Array(src.length);
    for (let y = 0; y < h; y++) { let s = 0, n = 0; for (let x = -r; x < w; x++) { if (x + r < w) { s += src[y * w + x + r]; n++; } if (x - r - 1 >= 0) { s -= src[y * w + x - r - 1]; n--; } if (x >= 0) a[y * w + x] = s / n; } }
    for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let y = -r; y < h; y++) { if (y + r < h) { s += a[(y + r) * w + x]; n++; } if (y - r - 1 >= 0) { s -= a[(y - r - 1) * w + x]; n--; } if (y >= 0) b[y * w + x] = s / n; } }
    return b;
  }

  // ------------------------------------------------------------------ the static decor: woods, reeds, scrub, rocks, wonders, veins
  let decor = null;
  const woods = []; // per instanced mesh: the tile of each copy, its distance from the tile's centre and its matrix, so towns can clear them
  function buildDecor() {
    if (decor) { scene.remove(decor); disposeTree(decor); }
    decor = new THREE.Group(); scene.add(decor); woods.length = 0;
    const W = {}, add = (shape, i, x, z, sx, sy, sz, ry, color, sink = 0.03) => { if (riverAt(x, z) > 0.07) return; const [cx, cz] = pos(i), ch = Math.min(CHUNKS - 1, Math.max(0, Math.floor((x + X0 + 1) / (2 * X0 + 2) * CHUNKS))) + CHUNKS * Math.min(CHUNKS - 1, Math.max(0, Math.floor((z + Z0 + 1) / (2 * Z0 + 2) * CHUNKS))); (W[shape + "@" + ch] ??= []).push([i, Math.hypot(x - cx, z - cz), x, surf(x, z) - sink, z, sx, sy, sz, ry, color]); };
    const tint = (hex, i, j, amt = 0.14) => { const c = new THREE.Color(hex), f = 1 + (hash(i, j, 41) - 0.5) * amt * 2; c.offsetHSL((hash(j, i, 43) - 0.5) * 0.03, 0, 0); return c.multiplyScalar(f); };
    const spot = (i, j, rmax = 0.82) => { const [x, z] = pos(i), a = hash(i, j, 3) * 6.283, d = Math.sqrt(hash(j, i, 9)) * rmax; return [x + Math.cos(a) * d, z + Math.sin(a) * d]; };
    for (let i = 0; i < N * N; i++) {
      const t = ST.terrain[i];
      if (t === "forest") for (let j = 0; j < 7; j++) {
        const [x, z] = spot(i, j), s = 0.21 + hash(i, j, 13) * 0.1, autumn = hash(i, j, 17) < 0.06;
        add(j < 3 ? "trunk" : "trunk+", i, x, z, s * 0.18, s * 0.7, s * 0.18, 0, "#5e4330");
        add(j < 3 ? "broad" : "broad+", i, x, z - 0, s, s * 1.1, s, hash(j, i, 5) * 6, tint(autumn ? "#9a8a2c" : hash(i, j, 19) < 0.5 ? "#4b7f33" : "#5a8a35", i, j), -s * 0.45);
      } else if (t === "taiga") for (let j = 0; j < 7; j++) {
        const [x, z] = spot(i, j), s = 0.2 + hash(i, j, 13) * 0.09;
        add(j < 3 ? "trunk" : "trunk+", i, x, z, s * 0.15, s * 0.5, s * 0.15, 0, "#4e3a2a");
        add(j < 3 ? "conifer" : "conifer+", i, x, z, s * 0.85, s * 2.3, s * 0.85, hash(j, i, 5) * 6, tint(hash(i, j, 19) < 0.5 ? "#2f5a3e" : "#3b6a48", i, j), -s * 0.3);
      } else if (t === "jungle") for (let j = 0; j < 8; j++) {
        const [x, z] = spot(i, j), s = 0.23 + hash(i, j, 13) * 0.11, tall = hash(i, j, 23) < 0.35;
        add(j < 3 ? "trunk" : "trunk+", i, x, z, s * 0.14, s * (tall ? 1.3 : 0.8), s * 0.14, 0, "#6b5236");
        add((tall ? "palm" : "broad") + (j < 3 ? "" : "+"), i, x, z, s * (tall ? 1.0 : 1.15), s * (tall ? 1.7 : 1.0), s * (tall ? 1.0 : 1.15), hash(j, i, 5) * 6, tint(hash(i, j, 19) < 0.5 ? "#2c6a2c" : "#3f7f30", i, j), tall ? 0 : -s * 0.4);
      } else if (t === "swamp") {
        for (let j = 0; j < 5; j++) { const [x, z] = spot(i, j); add("reeds", i, x, z, 0.3, 0.3 + hash(i, j, 7) * 0.12, 0.3, hash(i, j, 5) * 6, tint("#7d8a3e", i, j)); }
        for (let j = 5; j < 7; j++) { const [x, z] = spot(i, j); add("blob", i, x, z, 0.22, 0.18, 0.22, 0, tint("#40583a", i, j)); }
      } else if (t === "desert") { for (let j = 0; j < 2; j++) if (hash(i, j, 31) < 0.45) { const [x, z] = spot(i, j); add("blob", i, x, z, 0.13, 0.09, 0.13, 0, tint("#8a8a4a", i, j)); } }
      else if (t === "grass") { if (hash(i, 31) < 0.18) { const [x, z] = spot(i, 1), s = 0.3; add("trunk", i, x, z, s * 0.18, s * 0.7, s * 0.18, 0, "#5e4330"); add("broad", i, x, z, s, s * 1.1, s, 0, tint("#5f8f38", i, 1), -s * 0.45); } if (hash(i, 37) < 0.3) { const [x, z] = spot(i, 2); add("blob", i, x, z, 0.16, 0.12, 0.16, 0, tint("#6a8e3a", i, 2)); } }
      else if (t === "hill") for (let j = 0; j < 2; j++) { const [x, z] = spot(i, j), s = 0.1 + hash(i, j, 7) * 0.12; add("rock", i, x, z, s * 1.3, s, s, hash(i, j, 5) * 6, tint("#9a8d7c", i, j, 0.1)); if (j === 0 && hash(i, 39) < 0.4) { const [x2, z2] = spot(i, 7), s2 = 0.26; add("trunk", i, x2, z2, s2 * 0.18, s2 * 0.7, s2 * 0.18, 0, "#5e4330"); add("broad", i, x2, z2, s2, s2 * 1.1, s2, 0, tint("#62853a", i, 7), -s2 * 0.45); } }
      else if (t === "mountain" && hash(i, 35) < 0.5) { const [x, z] = spot(i, 0), s = 0.14 + hash(i, 0, 7) * 0.14; add("rock", i, x, z, s * 1.3, s, s, hash(i, 0, 5) * 6, tint("#958a7c", i, 0, 0.1)); }
      else if (t === "tundra" && hash(i, 33) < 0.5) { const [x, z] = spot(i, 1); add("rock", i, x, z, 0.12, 0.09, 0.1, 0, "#9aa29a"); }
    }
    const SMALL = new Set(["trunk", "rock", "reeds", "blob"]), woodMat = new THREE.MeshLambertMaterial({ flatShading: true });
    for (const [key, items] of Object.entries(W)) {
      const kind = key.split("@")[0], shape = kind.replace("+", ""), m = new THREE.InstancedMesh(geo(shape), woodMat, items.length);
      m.userData.dense = kind.endsWith("+"); // the thick of the woods, drawn only nearer in
      m.castShadow = true; m.receiveShadow = true;
      const tiles = new Int32Array(items.length), off = new Float32Array(items.length);
      items.forEach(([i, d, x, y, z, sx, sy, sz, ry, c], k) => { tiles[k] = i; off[k] = d; tmpQ.setFromAxisAngle(Y_AXIS, ry); tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz)); m.setMatrixAt(k, tmpM); m.setColorAt(k, typeof c === "string" ? tmpC.set(c) : c); });
      m.userData.small = SMALL.has(shape); m.computeBoundingSphere();
      woods.push({ m, tiles, off, base: m.instanceMatrix.array.slice() });
      decor.add(m);
    }
    // wonders shine; rich seams show as small crystals in their colour
    const P = parts();
    for (const w of ST.wonders || []) { const [x, z] = pos(w.i); P.add("gem", x, top(w.i) + 0.4, z, 0.45, 0.7, 0.45, 0, "#ffd84a", true); }
    for (const v of ST.veins || []) { const [x, z] = pos(v.i), vx = x - 0.45, vz = z + 0.35; P.add("gem", vx, ground(vx, vz) - 0.02, vz, 0.2, 0.3, 0.2, 0, hooks.veinColor[v.good] || "#d9822b"); }
    decor.add(P.build());
    for (const w of ST.wonders || []) addLabel(decor, w.i, `★ ${w.name}`, "wonder", 1.6);
    need = true; reshadow();
  }
  /** Woods give way to towns, works and roads. */
  function clearWoods(cleared) {
    for (const w of woods) {
      const a = w.m.instanceMatrix.array; a.set(w.base);
      for (let k = 0; k < w.tiles.length; k++) { const r = cleared.get(w.tiles[k]); if (r !== undefined && w.off[k] < r) a.fill(0, k * 16, k * 16 + 16); }
      w.m.instanceMatrix.needsUpdate = true;
    }
  }

  /** A batch of shapes for one rebuild. */
  const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
  function parts() {
    const list = {};
    return {
      add(shape, x, y, z, sx, sy, sz, ry, color, glow = false) { (list[shape + (glow ? "*" : "")] ??= []).push([x, y, z, sx, sy, sz, ry, color]); },
      build() {
        const g = new THREE.Group();
        for (const [key, items] of Object.entries(list)) {
          const glow = key.endsWith("*"), shape = glow ? key.slice(0, -1) : key;
          const mat = glow ? new THREE.MeshStandardMaterial({ emissive: 0x8a5a00, roughness: 0.35, metalness: 0.4 }) : new THREE.MeshLambertMaterial({ flatShading: true });
          const m = new THREE.InstancedMesh(geo(shape), mat, items.length);
          m.castShadow = !glow; m.receiveShadow = true;
          items.forEach(([x, y, z, sx, sy, sz, ry, c], k) => { tmpQ.setFromAxisAngle(Y_AXIS, ry); tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz)); m.setMatrixAt(k, tmpM); m.setColorAt(k, tmpC.set(c)); });
          m.computeBoundingSphere();
          g.add(m);
        }
        return g;
      },
    };
  }
  // a point turned with a shape: local (ox, oz) under a turn of `ry` about the vertical
  const turnXZ = (ox, oz, ry) => [ox * Math.cos(ry) + oz * Math.sin(ry), -ox * Math.sin(ry) + oz * Math.cos(ry)];

  // ------------------------------------------------------------------ what changes each turn: roads, towns, works, flags
  let dyn = null;
  const flagTex = new Map();
  function flagTexture(flag) {
    const key = JSON.stringify(flag);
    if (!flagTex.has(key)) {
      const c = document.createElement("canvas"); c.width = 96; c.height = 64;
      hooks.drawFlag(c.getContext("2d"), 0, 0, 96, 64, flag, 1);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; flagTex.set(key, t);
    }
    return flagTex.get(key);
  }
  const flags = [];
  const WALLS = ["#e9dfc8", "#ddd0b4", "#efe7d6", "#d2bf9a", "#e3d6bd"], STONE = "#b5aa96", WOOD = "#8f6a42", TERRA = new THREE.Color("#a94f34");

  /** A road or rail laid on the ground: a ribbon from A to B whose edges follow the slopes. */
  function ribbon(T, ax, az, bx, bz, w, col, lift, shift = 0, water = false) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L, n = Math.max(1, Math.ceil(L / 0.22));
    const y = (x, z) => (water ? 0.035 : ground(x, z) + lift);
    let prev = null;
    for (let s = 0; s <= n; s++) {
      const t = s / n, cx = ax + dx * t + nx * shift, cz = az + dz * t + nz * shift;
      const l = [cx + nx * w / 2, 0, cz + nz * w / 2], r = [cx - nx * w / 2, 0, cz - nz * w / 2];
      l[1] = y(l[0], l[2]); r[1] = y(r[0], r[2]);
      if (prev) T.quad(prev[0], l, r, prev[1], col);
      prev = [l, r];
    }
  }
  function disc(T, x, z, rad, col, lift) { const y = ground(x, z) + lift; for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, b = a + Math.PI / 3; const A = [x + Math.cos(a) * rad, 0, z + Math.sin(a) * rad], B = [x + Math.cos(b) * rad, 0, z + Math.sin(b) * rad]; A[1] = ground(A[0], A[2]) + lift; B[1] = ground(B[0], B[2]) + lift; T.tri([x, y, z], B, A, col); } }

  function buildDynamic() {
    if (dyn) { scene.remove(dyn); disposeTree(dyn, true); }
    dyn = new THREE.Group(); scene.add(dyn); flags.length = 0;
    const owners = S.owners, roads = S.roads || [], cleared = new Map(), clear = (i, r) => cleared.set(i, Math.max(cleared.get(i) ?? 0, r));
    // roads: branches from the centres, as on the 2D map; railways with ballast, sleepers and two rails
    const R = new Tris(), lane = new THREE.Color("#dcecf6"), steam = new THREE.Color("#ffe8a8"), hubs = new Set(), joints = new Map();
    const BALLAST = new THREE.Color("#5a5450"), SLEEPER = new THREE.Color("#5e4330"), RAIL = new THREE.Color("#dfe5ea"), roadCols = ROAD_COLOR.map(c => c && new THREE.Color(c));
    for (const n of S.nations) if (n.alive && n.founded) { hubs.add(n.capital); for (const st of n.settlements || []) hubs.add(st.tile); }
    const { parent, links, loose } = hooks.roadTree(hubs);
    const seg = (i, j, lv) => {
      const w = isWater(i) && isWater(j), wild = loose.has(i) && owners[i] < 0 && owners[j] < 0;
      if (wild) return; // roads gone wild are left off the 3D map: they only clutter it
      const [x, z] = pos(i), [x2, z2] = pos(j);
      if (w) { ribbon(R, x, z, x2, z2, lv >= 4 ? 0.09 : 0.06, lv >= 4 ? steam : lane, 0, 0, true); return; }
      clear(i, 0.4); clear(j, 0.4);
      if (lv >= 4) { // §2.5 a railway
        ribbon(R, x, z, x2, z2, 0.3, BALLAST, 0.03);
        const dx = x2 - x, dz = z2 - z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
        for (let s = 0.09; s < L; s += 0.17) { const cx = x + ux * s, cz = z + uz * s; ribbon(R, cx - ux * 0.025, cz - uz * 0.025, cx + ux * 0.025, cz + uz * 0.025, 0.25, SLEEPER, 0.045); }
        ribbon(R, x, z, x2, z2, 0.03, RAIL, 0.065, 0.07); ribbon(R, x, z, x2, z2, 0.03, RAIL, 0.065, -0.07);
        joints.set(i, [0.15, BALLAST]); joints.set(j, joints.get(j) ?? [0.15, BALLAST]);
        return;
      }
      const wd = 0.07 + lv * 0.03, col = roadCols[lv] || roadCols[1];
      ribbon(R, x, z, x2, z2, wd, col, 0.03);
      for (const t of [i, j]) if ((joints.get(t)?.[0] ?? 0) < wd / 2) joints.set(t, [wd / 2, col]);
    };
    for (let i = 0; i < N * N; i++) { const lv = roads[i] || 0, j = parent.get(i); if (lv && j !== undefined && j >= 0) seg(i, j, Math.min(lv, roads[j] || lv)); }
    for (const [i, h] of links) seg(i, h, roads[i] || 1);
    for (const [t, [r, col]] of joints) if (!isWater(t)) { const [x, z] = pos(t); disc(R, x, z, r * 1.05, col, 0.03); }
    if (R.p.length) {
      const rm = new THREE.Mesh(R.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
      rm.receiveShadow = true; dyn.add(rm);
    }

    // towns and works
    const P = parts();
    for (const n of S.nations) {
      if (!n.alive || !n.founded) continue;
      const color = hooks.nationColor(n.id), tierOf = new Map((n.provinces || []).map(p => [p.centre, p.tier || 0]));
      const centres = [n.capital, ...(n.settlements || []).map(s => s.tile)].filter(c => c >= 0 && S.owners[c] === n.id);
      const roofBase = new THREE.Color(color).lerp(TERRA, 0.45);
      // the works on each centre stand around its edge; houses keep clear of them
      const spots = new Map(), onCentre = new Map();
      for (const b of n.buildings || []) {
        if (b.kind === "housing" || !centres.includes(b.tile)) continue;
        const key = b.tile + ":" + b.type; if (onCentre.has(key)) { spots.set(b.id, null); continue; } onCentre.set(key, 1); // one of each kind is enough to see
        const k = onCentre.get(b.tile) ?? 0; onCentre.set(b.tile, k + 1);
        const a = k * 2.2 + 0.5, dd = 0.66 + (k % 2) * 0.1, [x, z] = pos(b.tile);
        spots.set(b.id, [x + Math.cos(a) * dd, z + Math.sin(a) * dd]);
      }
      for (const c of centres) {
        const [x, z] = pos(c), tier = tierOf.get(c) ?? 0, cap = c === n.capital;
        clear(c, 2);
        const taken = [...(n.buildings || [])].filter(b => spots.get(b.id) && b.tile === c).map(b => spots.get(b.id));
        const count = [6, 12, 18][tier] + (cap ? 3 : 0), R0 = [0.2, 0.27, 0.33][tier], spread = [0.6, 0.72, 0.7][tier];
        const homes = [];
        for (let k = 0, built = 0; k < count * 2 && built < count; k++) {
          const a = k * 2.399 + hash(c, k) * 0.5, d = R0 + 0.1 + (spread - R0 - 0.1) * Math.sqrt(((k % count) + 0.5) / count) + (hash(k, c, 3) - 0.5) * 0.05;
          const hx = x + Math.cos(a) * d, hz = z + Math.sin(a) * d;
          if (surf(hx, hz) < 0.03 || riverAt(hx, hz) > 0.06 || taken.some(([tx, tz]) => Math.hypot(tx - hx, tz - hz) < 0.2) || homes.some(([tx, tz]) => Math.hypot(tx - hx, tz - hz) < 0.15)) continue;
          built++; homes.push([hx, hz]);
          const w = (0.13 + hash(k, c) * 0.05) * (tier === 2 ? 0.95 : 1), L = w * (1.3 + hash(c, k, 7) * 0.4), floors = tier === 2 && k % 3 === 0 ? 2 : tier === 1 && k % 5 === 0 ? 1.5 : 1;
          const ht = (0.11 + hash(c, k, 5) * 0.04) * floors, y = surf(hx, hz) - 0.05, ry = -a + (hash(c, k, 9) < 0.5 ? 0 : Math.PI / 2);
          const roof = roofBase.clone().offsetHSL((hash(c, k, 11) - 0.5) * 0.04, 0, (hash(c, k, 13) - 0.5) * 0.1);
          P.add("box", hx, y, hz, w, ht + 0.05, L, ry, WALLS[(c + k) % WALLS.length]);
          P.add("gable", hx, y + ht + 0.05, hz, w * 1.18, w * 0.62, L * 1.1, ry, roof.getStyle());
          if (hash(c, k, 15) < 0.55) { const [ox, oz] = turnXZ(w * 0.22, L * 0.28, ry); P.add("box", hx + ox, y + ht + 0.05 + w * 0.2, hz + oz, 0.035, w * 0.42, 0.035, ry, "#5a4a40"); }
        }
        if (cap) { // the keep, its banners and the flag on top
          const y = surf(x, z) - 0.05;
          P.add("box", x, y, z, 0.26, 0.6, 0.26, 0.3, "#cfc3aa");
          for (let q = 0; q < 4; q++) { const [ox, oz] = turnXZ(q % 2 ? 0.1 : -0.1, q < 2 ? 0.1 : -0.1, 0.3); P.add("box", x + ox, y + 0.6, z + oz, 0.07, 0.07, 0.07, 0.3, "#cfc3aa"); }
          P.add("box", x + 0.2, y, z + 0.12, 0.2, 0.32, 0.2, 0.3, "#d8ccb2"); P.add("roof", x + 0.2, y + 0.32, z + 0.12, 0.22, 0.2, 0.22, 0.3, roofBase.getStyle());
          flags.push(makeFlag(n, x, y + 0.6, z));
        } else if (tier >= 1) { const y = surf(x, z) - 0.03; P.add("cyl", x, y, z, 0.12, 0.08, 0.12, 0, "#9a948a"); P.add("cone", x, y + 0.08, z, 0.05, 0.34, 0.05, 0, "#d9cfb8"); }
        else { const y = surf(x, z) - 0.03; P.add("cyl", x, y, z, 0.1, 0.07, 0.1, 0, "#8e8a82"); }
        if (tier === 2) { // a city wall with towers
          const Rw = 0.8, K = 16;
          for (let k = 0; k < K; k++) {
            const a0 = k / K * Math.PI * 2, a1 = (k + 1) / K * Math.PI * 2, am = (a0 + a1) / 2, mx = x + Math.cos(am) * Rw, mz = z + Math.sin(am) * Rw;
            if (surf(mx, mz) < 0.04) continue;
            P.add("box", mx, surf(mx, mz) - 0.08, mz, 0.06, 0.24, 2 * Rw * Math.sin(Math.PI / K) + 0.02, -am, STONE);
            if (k % 3 === 0) { const tx = x + Math.cos(a0) * Rw, tz = z + Math.sin(a0) * Rw, ty = surf(tx, tz) - 0.08; P.add("cyl", tx, ty, tz, 0.13, 0.34, 0.13, 0, "#c2b7a2"); P.add("cone", tx, ty + 0.34, tz, 0.17, 0.14, 0.17, 0, roofBase.getStyle()); }
          }
        }
      }
      // works on the land (homes are counted in the towns above)
      for (const b of n.buildings || []) {
        if (b.kind === "housing") continue;
        if (spots.get(b.id) === null) continue;
        const [x, z] = pos(b.tile), r = hash(b.id, 7) * 6.28, at0 = spots.get(b.id), X = at0 ? at0[0] : x, Z = at0 ? at0[1] : z, h = surf(X, Z) - 0.03;
        if (!at0) clear(b.tile, b.type === "field" || b.type === "salt_pan" || b.type === "palisade" ? 2 : 0.55);
        if (!b.done) { // scaffolding: poles, a beam and the first course of walls
          for (let q = 0; q < 4; q++) { const [ox, oz] = turnXZ(q % 2 ? 0.13 : -0.13, q < 2 ? 0.13 : -0.13, r); P.add("box", X + ox, h, Z + oz, 0.025, 0.32, 0.025, r, "#a88a5c"); }
          P.add("box", X, h + 0.3, Z, 0.3, 0.025, 0.03, r, "#a88a5c"); P.add("box", X, h, Z, 0.24, 0.1, 0.24, r, "#d9c9a6");
          continue;
        }
        switch (b.type) {
          case "field": { const [ox, oz] = turnXZ(0.42, 0.2, r); const fy = surf(x + ox, z + oz); P.add("cone", x + ox, fy - 0.02, z + oz, 0.13, 0.13, 0.13, 0, "#d8b85a"); P.add("cone", x + ox + 0.12, fy - 0.02, z + oz + 0.05, 0.1, 0.1, 0.1, 0, "#cfae50"); break; }
          case "pen": for (let s = 0; s < 6; s++) { const a = s * Math.PI / 3 + Math.PI / 6, px = X + Math.cos(a) * 0.3, pz = Z + Math.sin(a) * 0.3; P.add("box", px, surf(px, pz) - 0.02, pz, 0.31, 0.07, 0.02, -a + Math.PI / 2, WOOD); } P.add("blob", X - 0.08, h, Z, 0.14, 0.11, 0.2, r, "#f0ece0"); P.add("blob", X + 0.1, h, Z + 0.08, 0.13, 0.1, 0.18, r + 1, "#6b4b33"); break;
          case "pier": case "harbor": case "fish_dock": {
            const sea = NBS[b.tile].find(j => j >= 0 && isWater(j));
            if (sea === undefined || sea < 0) { P.add("box", X, h, Z, 0.24, 0.1, 0.18, r, "#9a7448"); P.add("gable", X, h + 0.1, Z, 0.27, 0.08, 0.2, r, "#7a5a40"); break; } // a river landing: a boat shed
            const [sx, sz] = pos(sea), dx = sx - x, dz = sz - z, D = Math.hypot(dx, dz) || 1, ux = dx / D, uz = dz / D, ry = Math.atan2(ux, uz), big = b.type === "harbor" ? 1.5 : 1;
            const cx = x + ux * 1.05, cz = z + uz * 1.05;
            P.add("box", cx, 0.04, cz, 0.15 * big, 0.04, 0.9 * big, ry, "#9a7448");
            for (const s of [-1, 1]) for (const f of [0.6, 1.35]) { const px = x + ux * f + uz * 0.07 * s * big, pz = z + uz * f - ux * 0.07 * s * big; P.add("cyl", px, -0.15, pz, 0.03, 0.23, 0.03, 0, "#5e4330"); }
            if (b.type === "harbor") { const wx = x + ux * 0.45, wz = z + uz * 0.45, wy = surf(wx, wz) - 0.04; P.add("box", wx, wy, wz, 0.3, 0.22, 0.22, ry, "#b9a682"); P.add("gable", wx, wy + 0.22, wz, 0.34, 0.14, 0.26, ry + Math.PI / 2, "#7a5a40"); P.add("box", cx + ux * 0.3, 0.08, cz + uz * 0.3, 0.03, 0.4, 0.03, 0, "#5e4330"); P.add("box", cx + ux * 0.3, 0.46, cz + uz * 0.3, 0.03, 0.03, 0.3, ry, "#5e4330"); }
            if (b.type === "fish_dock") { const fx = x + ux * 0.5 + uz * 0.2, fz = z + uz * 0.5 - ux * 0.2, fy = surf(fx, fz) - 0.02; P.add("box", fx, fy, fz, 0.22, 0.12, 0.04, ry, WOOD); P.add("box", fx, fy + 0.12, fz, 0.24, 0.02, 0.06, ry, "#c9c2b0"); }
            break;
          }
          case "salt_pan": { const [ox, oz] = turnXZ(0.5, 0, r); P.add("cone", x + ox, surf(x + ox, z + oz) - 0.02, z + oz, 0.16, 0.12, 0.16, 0, "#f6f4ee"); break; }
          case "temple": P.add("box", X, h, Z, 0.4, 0.07, 0.32, r, "#d7d0c2"); P.add("box", X, h + 0.07, Z, 0.26, 0.2, 0.2, r, "#f1ede4"); for (let q = 0; q < 4; q++) { const [ox, oz] = turnXZ(-0.1 + q * 0.067, 0.14, r); P.add("cyl", X + ox, h + 0.07, Z + oz, 0.03, 0.2, 0.03, 0, "#f6f2ea"); } P.add("gable", X, h + 0.27, Z, 0.32, 0.12, 0.36, r + Math.PI / 2, "#c9b48a"); break;
          case "altar": P.add("box", X, h, Z, 0.18, 0.11, 0.18, r, "#8f8a82"); P.add("cone", X, h + 0.11, Z, 0.09, 0.16, 0.09, 0, "#ff9a3c", true); break;
          case "palisade": for (let s = 0; s < 22; s++) { const a = s / 22 * 6.283, px = x + Math.cos(a) * 0.86, pz = z + Math.sin(a) * 0.86; if (surf(px, pz) > 0.03) P.add("cone", px, surf(px, pz) - 0.05, pz, 0.07, 0.3 + hash(s, b.id) * 0.06, 0.07, 0, WOOD); } break;
          case "well": P.add("cyl", X, h, Z, 0.16, 0.1, 0.16, 0, "#8e8a82"); P.add("box", X - 0.06, h, Z, 0.02, 0.22, 0.02, 0, WOOD); P.add("box", X + 0.06, h, Z, 0.02, 0.22, 0.02, 0, WOOD); P.add("gable", X, h + 0.22, Z, 0.18, 0.08, 0.12, Math.PI / 2, "#7a5a40"); break;
          case "market": for (let q = 0; q < 3; q++) { const [ox, oz] = turnXZ((q - 1) * 0.15, (q % 2) * 0.08, r), sx = X + ox, sz = Z + oz, sy = surf(sx, sz) - 0.03; P.add("box", sx, sy, sz, 0.11, 0.07, 0.09, r, "#a07a4a"); P.add("gable", sx, sy + 0.12, sz, 0.15, 0.06, 0.12, r, ["#d24a3a", "#e2b13c", "#3a7ad2"][q]); P.add("box", sx, sy, sz, 0.12, 0.12, 0.01, r, "#6b4b33"); } break;
          case "kiln": P.add("dome", X, h, Z, 0.26, 0.2, 0.26, 0, "#a5532e"); P.add("cyl", X + 0.08, h, Z, 0.05, 0.28, 0.05, 0, "#7a3e22"); break;
          case "workshop": P.add("box", X, h, Z, 0.26, 0.14, 0.2, r, "#b9a07a"); P.add("gable", X, h + 0.14, Z, 0.29, 0.1, 0.23, r, "#6e5a44"); { const [ox, oz] = turnXZ(0.07, 0.05, r); P.add("box", X + ox, h + 0.14, Z + oz, 0.04, 0.14, 0.04, r, "#4a3c32"); } break;
          case "pit": P.add("cyl", X, h - 0.02, Z, 0.24, 0.05, 0.24, 0, "#4a3c2c"); P.add("roof", X, h + 0.02, Z, 0.2, 0.08, 0.2, r, "#8a6d48"); break;
          case "granary": P.add("cyl", X, h, Z, 0.2, 0.18, 0.2, 0, "#c8b48a"); P.add("cone", X, h + 0.18, Z, 0.26, 0.14, 0.26, 0, "#9b7448"); break;
          case "grinder": P.add("cyl", X, h, Z, 0.2, 0.06, 0.2, 0, "#8e8a82"); P.add("cyl", X, h + 0.06, Z, 0.16, 0.05, 0.16, 0, "#a29d94"); P.add("box", X, h + 0.11, Z, 0.26, 0.025, 0.025, r, WOOD); P.add("box", X + 0.24, h, Z + 0.1, 0.12, 0.08, 0.1, r, "#e8dcc2"); break; // a millstone, its handle, a sack of flour
          case "herb_garden": for (let q = 0; q < 3; q++) { const [ox, oz] = turnXZ((q - 1) * 0.1, 0, r); P.add("box", X + ox, h, Z + oz, 0.06, 0.05, 0.26, r, ["#4f9a4a", "#7db35a", "#9a6ab0"][q]); } break;
          case "border_gate": for (const s of [-1, 1]) { const [ox, oz] = turnXZ(s * 0.17, 0, r); P.add("box", X + ox, h, Z + oz, 0.09, 0.36, 0.09, r, "#b5aa96"); P.add("roof", X + ox, h + 0.36, Z + oz, 0.11, 0.1, 0.11, r, roofBase.getStyle()); } P.add("box", X, h + 0.26, Z, 0.36, 0.06, 0.08, r, "#a69a84"); { const [ox, oz] = turnXZ(0.1, 0.24, r); P.add("box", X + ox, h, Z + oz, 0.14, 0.08, 0.12, r, "#a07a4a"); P.add("gable", X + ox, h + 0.12, Z + oz, 0.17, 0.06, 0.14, r, "#e2b13c"); } break;
          case "watchtower": for (let q = 0; q < 4; q++) { const [ox, oz] = turnXZ(q % 2 ? 0.07 : -0.07, q < 2 ? 0.07 : -0.07, r); P.add("box", X + ox, h, Z + oz, 0.025, 0.5, 0.025, r, WOOD); } P.add("box", X, h + 0.42, Z, 0.2, 0.05, 0.2, r, "#7a5a3a"); P.add("roof", X, h + 0.47, Z, 0.24, 0.16, 0.24, r, roofBase.getStyle()); break;
          default: P.add("box", X, h, Z, 0.22, 0.14, 0.2, r, "#c4b08a"); P.add("gable", X, h + 0.14, Z, 0.25, 0.1, 0.23, r, hooks.kindColor?.[b.kind] || "#7b6a55");
        }
      }
    }
    // barbarian camps: dark tents round a fire
    for (const hd of S.hordes || []) {
      const [x, z] = pos(hd.tile);
      for (let k = 0; k < 5; k++) { const a = k * 1.256 + 0.4, tx = x + Math.cos(a) * 0.36, tz = z + Math.sin(a) * 0.36; P.add("cone", tx, ground(tx, tz) - 0.02, tz, 0.24, 0.26, 0.24, a, "#5b1e1a"); }
      P.add("cone", x, ground(x, z) - 0.02, z, 0.1, 0.18, 0.1, 0, "#ff7a2f", true);
      clear(hd.tile, 0.6);
      addLabel(dyn, hd.tile, `☠ ${hd.name} · ${hd.strength}`, "horde", 1.0);
    }
    dyn.add(P.build());
    for (const f of flags) dyn.add(f.group);
    clearWoods(cleared);
    // names: a banner for each capital in its nation's colour, a smaller one for each town
    for (const n of S.nations) {
      if (!n.alive || !n.founded || n.capital < 0) continue;
      const col = hooks.nationColor(n.id);
      addLabel(dyn, n.capital, `${n.name}`, "capital", 2.4, n.capitalName ? `${n.capitalName} · ${n.population}👤` : "", col);
      for (const s of n.settlements || []) if (S.owners[s.tile] === n.id) addLabel(dyn, s.tile, s.name, "town", 1.0, "", col);
    }
    need = true; reshadow();
  }
  function makeFlag(n, x, y, z) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(geo("cyl"), new THREE.MeshLambertMaterial({ color: 0x4b3a2a })); pole.scale.set(0.035, 0.85, 0.035); pole.position.set(x, y, z); pole.castShadow = true; g.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28, 8, 1).translate(0.21, 0, 0), new THREE.MeshLambertMaterial({ map: flagTexture(n.flag), side: THREE.DoubleSide }));
    cloth.position.set(x, y + 0.7, z); cloth.castShadow = true; g.add(cloth);
    const base = cloth.geometry.attributes.position.array.slice();
    return { group: g, cloth, base, phase: hash(n.id, 9) * 6 };
  }

  // ------------------------------------------------------------------ labels (HTML over the canvas: crisp Vietnamese at any zoom)
  const allLabels = [];
  let labelGen = 0;
  function addLabel(parent, i, text, kind, dy, sub = "", color = "") {
    const el = document.createElement("div"); el.className = `m3-label m3-${kind}`;
    if (color) el.style.setProperty("--nc", color);
    const t = document.createElement("span"); t.textContent = text; el.appendChild(t);
    if (sub) { const s = document.createElement("small"); s.textContent = sub; el.appendChild(s); }
    const o = new CSS2DObject(el); o.position.copy(at(i, dy)); o.userData.kind = kind; parent.add(o); allLabels.push(o); labelGen++;
    return o;
  }
  const SHOW_AT = { capital: 400, town: 120, wonder: 70, horde: 80, fx: 1e9 };
  const RANK = { capital: 0, town: 1, horde: 2, wonder: 3 }, tmpV = new THREE.Vector3();
  function cullLabels() {
    const d = camera.position.distanceTo(controls.target);
    for (const w of woods) w.m.visible = d < (w.m.userData.small ? 120 : w.m.userData.dense ? 170 : 1e9);
    for (const o of allLabels) if (o.parent) o.visible = d < (SHOW_AT[o.userData.kind] ?? 100);
    // a label that would cover one more important (or one placed before it) steps aside
    const W = container.clientWidth, H = container.clientHeight, placed = [];
    const list = allLabels.filter(o => o.parent && o.visible).sort((a, b) => (RANK[a.userData.kind] ?? 9) - (RANK[b.userData.kind] ?? 9));
    for (const o of list) {
      o.getWorldPosition(tmpV).project(camera);
      if (tmpV.z > 1 || tmpV.x < -1.2 || tmpV.x > 1.2 || tmpV.y < -1.2 || tmpV.y > 1.2) { o.visible = false; continue; }
      const x = (tmpV.x + 1) / 2 * W, y = (1 - tmpV.y) / 2 * H, el = o.element;
      if (o.userData.w === undefined && el.isConnected && el.offsetWidth) { o.userData.w = el.offsetWidth; o.userData.h = el.offsetHeight; } // measured once: reading it each frame forces a layout
      const w = (o.userData.w ?? el.textContent.length * 7 + 14) / 2 + 2, h = (o.userData.h ?? 20) / 2 + 1;
      if (placed.some(r => x - w < r[2] && x + w > r[0] && y - h < r[3] && y + h > r[1])) { o.visible = false; continue; }
      placed.push([x - w, y - h, x + w, y + h]);
    }
  }

  // ------------------------------------------------------------------ what moves: caravans, boats, trains, people at work
  let movers = null, moveT0 = performance.now();
  const SHAPES_OF = { walker: { person: 1 }, cart: { box: 1, blob: 3 }, train: { box: 4, cyl: 1 }, boat: { hull: 1, sail: 1, mast: 1 }, fishing: { hull: 1, sail: 1, mast: 1 }, moored: { hull: 1, mast: 1 } };
  function buildMovers() {
    if (movers) { scene.remove(movers.group); disposeTree(movers.group); }
    const list = [];
    const rail = i => (S.roads?.[i] || 0) >= 4 && !isWater(i);
    for (const c of S.caravans || []) if (c.path?.length > 1) list.push({ kind: c.mode === "water" ? "boat" : c.path.filter(rail).length * 2 >= c.path.length ? "train" : "cart", c, color: hooks.nationColor(c.from) });
    // §2.5 a train for each railway network: from the capital to the farthest centre the rails reach, and back
    for (const n of S.nations) {
      if (!n.alive || !n.founded || n.capital < 0) continue;
      const centres = new Set((n.settlements || []).map(s => s.tile)), prev = new Map([[n.capital, -1]]), queue = [n.capital];
      let far = -1;
      for (let q = 0; q < queue.length; q++) for (const j of NBS[queue[q]]) if (j >= 0 && !prev.has(j) && (rail(j) || centres.has(j))) { prev.set(j, queue[q]); queue.push(j); if (centres.has(j)) far = j; }
      if (far < 0) continue;
      const path = []; for (let k = far; k >= 0; k = prev.get(k)) path.unshift(k);
      if (path.length >= 3) list.push({ kind: "train", path, color: hooks.nationColor(n.id), ph: hash(n.id, 77) });
    }
    for (const n of S.nations) {
      if (!n.alive || !n.founded) continue;
      const color = hooks.nationColor(n.id), unit = Math.max(1, Math.ceil(n.population / 120)), centres = [n.capital, ...(n.settlements || []).map(s => s.tile)];
      const home = t => centres.reduce((b, c) => (dist(c, t) < dist(b, t) ? c : b), centres[0]);
      for (const w of n.work || []) {
        const from = home(w.tile);
        if (w.role === "fish") {
          const shore = isWater(w.tile) ? shoreOf(n, w.tile) : w.tile, sea = isWater(w.tile) ? w.tile : NBS[w.tile].find(j => j >= 0 && isWater(j));
          if (shore >= 0 && sea !== undefined && sea >= 0) { for (let k = 0; k < Math.min(3, Math.max(1, Math.round(w.n / unit / 2))); k++) list.push({ kind: "fishing", a: shore, b: sea, k, color, ph: hash(w.tile, k, n.id) }); continue; }
        }
        for (let k = 0; k < Math.min(3, Math.max(1, Math.round(w.n / unit))); k++) list.push({ kind: "walker", a: from, b: w.tile, k, color, ph: hash(w.tile, k, n.id, w.role.length) });
      }
      // boats at rest at the piers
      if ((n.stock?.boat || 0) >= 1) for (const b of (n.buildings || []).filter(b => b.done && (b.type === "pier" || b.type === "harbor"))) {
        const sea = NBS[b.tile].find(j => j >= 0 && isWater(j)); if (sea === undefined || sea < 0) continue;
        for (let k = 0; k < Math.min(3, Math.floor(n.stock.boat)); k++) list.push({ kind: "moored", a: b.tile, b: sea, k, color, ph: hash(b.tile, k) });
      }
    }
    const counts = {};
    for (const m of list) for (const [k, c] of Object.entries(SHAPES_OF[m.kind])) counts[k] = (counts[k] || 0) + c;
    const group = new THREE.Group(), meshes = {};
    for (const [k, c] of Object.entries(counts)) {
      const m = new THREE.InstancedMesh(k === "mast" ? geo("cyl") : geo(k), new THREE.MeshLambertMaterial({ flatShading: true }), c);
      m.frustumCulled = false; m.castShadow = false; meshes[k] = m; group.add(m);
    }
    movers = { list, group, meshes }; scene.add(group); moveT0 = performance.now();
  }
  function dist(a, b) { const [ax, az] = pos(a), [bx, bz] = pos(b); return Math.hypot(ax - bx, az - bz); }
  function shoreOf(n, tile) {
    let best = -1, bd = Infinity;
    const ports = (n.buildings || []).filter(b => b.done && ["pier", "harbor", "fish_dock"].includes(b.type)).map(b => b.tile);
    const cands = ports.length ? ports : [n.capital, ...(n.settlements || []).map(s => s.tile)];
    for (const c of cands) { const d = dist(c, tile); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  /** A point part of the way along a path of tiles, on the ground, and the heading there. */
  const pointOnPath = (path, f, sea = false) => {
    const L = path.length - 1, p = clamp(f, 0, 1) * L, k = Math.min(L - 1, Math.floor(p)), t = p - k, [ax, az] = pos(path[k]), [bx, bz] = pos(path[k + 1]);
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    return [new THREE.Vector3(x, sea ? 0 : ground(x, z) + 0.02, z), Math.atan2(-(bz - az), bx - ax)];
  };
  const COLORS = new Map(), colorOf = c => { let v = COLORS.get(c); if (!v) COLORS.set(c, v = new THREE.Color(c)); return v; }; // parsing a colour each frame costs more than drawing it
  function updateMovers(now) {
    if (!movers) return;
    const near = camera.position.distanceTo(controls.target) < 140, M = movers.meshes, idx = {};
    for (const k in M) idx[k] = 0;
    const put = (k, x, y, z, sx, sy, sz, ry, color) => { const m = M[k]; if (!m) return; tmpQ.setFromAxisAngle(Y_AXIS, ry); tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz)); m.setMatrixAt(idx[k], tmpM); m.setColorAt(idx[k]++, colorOf(color)); };
    const boat = (x, y, z, s, a, color, sail = true) => {
      put("hull", x, y, z, 0.5 * s, 0.28 * s, 0.26 * s, a, color);
      put("mast", x, y + 0.05, z, 0.02, 0.5 * s, 0.02, 0, "#4b3a2a");
      if (sail) put("sail", x - Math.cos(a) * 0.03, y + 0.12 * s, z + Math.sin(a) * 0.03, 0.2 * s, 0.46 * s, 0.04, a, "#f4efe2");
    };
    const turnPhase = Math.min(1, (now - moveT0) / 30000);
    for (const m of movers.list) {
      if (m.kind === "train") {
        // a steam engine and its wagons in the nation's colour, a trail of smoke behind
        const path = m.c ? m.c.path : m.path, L = path.length - 1;
        let f;
        if (m.c) { const span = Math.max(1, m.c.arrive - (m.c.depart ?? m.c.arrive - 1)); f = ((S.tick - (m.c.depart ?? S.tick)) + turnPhase) / span; }
        else { const t = ((now / (6000 + L * 900)) + m.ph) % 1; f = ease(t < 0.5 ? t * 2 : 2 - t * 2); }
        const back = 0.42 / Math.max(1, L), [p, a] = pointOnPath(path, f), dir = m.c || (((now / (6000 + L * 900)) + m.ph) % 1) < 0.5 ? 1 : -1;
        const fx = Math.cos(a) * dir, fz = -Math.sin(a) * dir;
        put("box", p.x, p.y + 0.06, p.z, 0.38, 0.16, 0.17, a, "#26262b"); put("box", p.x - fx * 0.1, p.y + 0.06, p.z - fz * 0.1, 0.14, 0.26, 0.17, a, "#33333a");
        put("cyl", p.x + fx * 0.12, p.y + 0.2, p.z + fz * 0.12, 0.07, 0.14, 0.07, 0, "#16161a");
        for (let k = 1; k <= 2; k++) { const [q, b] = pointOnPath(path, f - k * back * dir); put("box", q.x, q.y + 0.06, q.z, 0.36, 0.17, 0.17, b, m.color); }
        if (near && animOn && now - (m.smoke || 0) > 260) { m.smoke = now; smoke.push(puff(new THREE.Vector3(p.x + fx * 0.12, p.y + 0.34, p.z + fz * 0.12), Math.floor(now / 260) % 97, "#e6e6e6", 0, 0.06, 1400, 0.45)); }
        continue;
      }
      if (m.kind === "cart" || (m.kind === "boat" && m.c)) {
        const c = m.c, span = Math.max(1, c.arrive - (c.depart ?? c.arrive - 1)), f = ((S.tick - (c.depart ?? S.tick)) + turnPhase) / span;
        const [p, a] = pointOnPath(c.path, f, m.kind === "boat");
        if (m.kind === "cart") { const fx = Math.cos(a), fz = -Math.sin(a); put("box", p.x, p.y + 0.05, p.z, 0.3, 0.14, 0.18, a, "#8a6a42"); put("blob", p.x + fz * 0.1, p.y - 0.02, p.z - fx * 0.1, 0.12, 0.12, 0.04, a, "#3e2e20"); put("blob", p.x - fz * 0.1, p.y - 0.02, p.z + fx * 0.1, 0.12, 0.12, 0.04, a, "#3e2e20"); put("blob", p.x + fx * 0.3, p.y, p.z + fz * 0.3, 0.2, 0.15, 0.12, a, "#6b4b33"); }
        else boat(p.x, 0, p.z, 1.15, a, m.color);
        continue;
      }
      if (!near) continue;
      const [ax, az] = pos(m.a), [bx, bz] = pos(m.b), off = (m.k - 1) * 0.28;
      if (m.kind === "walker") {
        const period = 9000 + m.ph * 5000, t = ((now / period) + m.ph) % 1, leg = t < 0.4 ? ease(t / 0.4) : t < 0.6 ? 1 : 1 - ease((t - 0.6) / 0.4);
        const a = Math.atan2(-(bz - az), bx - ax), x = ax + (bx - ax) * leg + Math.sin(a) * off, z = az + (bz - az) * leg + Math.cos(a) * off;
        put("person", x, ground(x, z) + (t >= 0.4 && t < 0.6 ? Math.abs(Math.sin(now / 160 + m.k)) * 0.04 : 0), z, 0.2, 0.2, 0.2, a, m.color);
      } else if (m.kind === "fishing") {
        const t = ((now / (12000 + m.ph * 6000)) + m.ph) % 1, leg = t < 0.3 ? ease(t / 0.3) : t < 0.75 ? 1 : 1 - ease((t - 0.75) / 0.25), f = 0.45 + 0.55 * leg;
        const a = Math.atan2(-(bz - az), bx - ax) + (t >= 0.75 ? Math.PI : 0), bob = Math.sin(now / 420 + m.k * 1.7) * 0.02;
        boat(ax + (bx - ax) * f + off, bob, az + (bz - az) * f + off * 0.4, 0.95, a, m.color);
      } else {
        const bob = Math.sin(now / 600 + m.k) * 0.015;
        boat(ax + (bx - ax) * 0.6 + (m.k - 1) * 0.3, bob, az + (bz - az) * 0.6 + (m.k - 1) * 0.12, 0.9, 0.4, m.color, false);
      }
    }
    for (const [k, m] of Object.entries(M)) { m.count = idx[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }

  // ------------------------------------------------------------------ the turn's events, played over the map
  let fxQueue = [];
  const smoke = [];
  function playFx(list) {
    for (const f of fxQueue) f.done?.();
    fxQueue = [];
    if (!list?.length) return;
    const t0 = performance.now(), gap = clamp(14000 / list.length, 150, 1000);
    fxQueue = list.slice(0, 300).filter(f => f.tile >= 0 || f.path?.length).map((f, k) => ({ f, t0: t0 + k * gap, dur: hooks.fxDur(f), started: false }));
  }
  function startFx(q) {
    const f = q.f, tile = f.path?.length ? f.path[Math.floor(f.path.length / 2)] : f.tile, tone = TONE[hooks.fxTone(f)] ?? TONE[""];
    const g = new THREE.Group(); groups.fx.add(g);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.95, 6), new THREE.MeshBasicMaterial({ color: tone, transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI / 6; ring.position.copy(at(tile, 0.15)); ring.renderOrder = 5; g.add(ring);
    if (f.path?.length > 1) {
      const pts = f.path.map(i => at(i, 0.15)), line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xfff4cf, dashSize: 0.5, gapSize: 0.35, toneMapped: false }));
      line.computeLineDistances(); g.add(line);
    }
    const el = document.createElement("div"); el.className = `m3-fx ${hooks.fxTone(f)}`; el.textContent = hooks.fxWord(f);
    const label = new CSS2DObject(el); label.position.copy(at(tile, 1.2)); g.add(label);
    if (["battle", "raid", "fire", "eruption", "riot"].includes(f.kind)) for (let k = 0; k < 6; k++) smoke.push(puff(at(tile, 0.2), k, f.kind === "battle" || f.kind === "raid" ? "#ff8a3c" : "#ff6a2a"));
    q.g = g; q.ring = ring; q.label = label; q.el = el; q.started = true;
    q.done = () => { groups.fx.remove(g); disposeTree(g, true); el.remove(); };
  }
  function puff(p, k, color, delay = k * 180, size = 0.2, dur = 2600, alpha = 0.75) {
    const m = new THREE.Mesh(geo("blob"), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, fog: true }));
    m.position.copy(p).add(new THREE.Vector3((hash(k, 1) - 0.5) * size * 3, 0, (hash(k, 2) - 0.5) * size * 3)); m.scale.setScalar(size);
    groups.fx.add(m);
    return { m, t0: performance.now() + delay, dur, size, alpha, base: m.position.clone() };
  }
  function updateFx(now) {
    for (const q of fxQueue) {
      const t = (now - q.t0) / q.dur;
      if (t < 0) continue;
      if (!q.started) startFx(q);
      if (t > 1) { q.done(); q.dead = true; continue; }
      const fade = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;
      q.ring.scale.setScalar(1 + t * 1.6); q.ring.material.opacity = 0.85 * (1 - t);
      q.el.style.opacity = fade; q.label.position.y = q.ring.position.y + 1.0 + t * 1.2;
    }
    fxQueue = fxQueue.filter(q => !q.dead);
    for (const s of smoke) {
      const t = (now - s.t0) / s.dur;
      if (t < 0) { s.m.visible = false; continue; }
      s.m.visible = true;
      if (t > 1) { groups.fx.remove(s.m); s.m.material.dispose(); s.dead = true; continue; }
      s.m.position.set(s.base.x + t * 0.3, s.base.y + t * 1.6 * s.size * 5, s.base.z); s.m.scale.setScalar(s.size + t * s.size * 2.5); s.m.material.opacity = s.alpha * (1 - t);
      if (t > 0.35) s.m.material.color.lerp(new THREE.Color("#555555"), 0.06);
    }
    for (let k = smoke.length - 1; k >= 0; k--) if (smoke[k].dead) smoke.splice(k, 1);
    // smoke over the fields of the wars now on
    if (S && now - (updateFx.last || 0) > 900) {
      updateFx.last = now;
      for (const w of S.wars || []) if (w.lastTile >= 0 && w.lastTile !== undefined && w.lastTile !== null) smoke.push(puff(at(w.lastTile, 0.25), Math.floor(now / 900) % 97, "#9a9a9a", 0));
    }
  }

  // ------------------------------------------------------------------ hover and pin: drawn by the land's shader
  let hovered = -1;
  function setHover(i) { if (i === hovered) return; hovered = i; U.uHover.value = i === pinned ? -1 : i; need = true; }
  // the pinned tile also gets a line drawn over everything, so towns and woods cannot hide it
  let pinMesh = null;
  function updatePin() {
    if (pinMesh) { scene.remove(pinMesh); pinMesh.geometry.dispose(); pinMesh.material.dispose(); pinMesh = null; }
    if (pinned < 0 || !G) return;
    const [x, z] = pos(pinned), pts = [];
    for (let k = 0; k <= 24; k++) { const a = Math.PI / 180 * (60 * Math.floor(k / 4) - 30), b = a + Math.PI / 3, t = (k % 4) / 4, px = x + Math.cos(a) * (1 - t) + Math.cos(b) * t, pz = z + Math.sin(a) * (1 - t) + Math.sin(b) * t; pts.push(new THREE.Vector3(px, ground(px, pz) + 0.04, pz)); }
    pinMesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.85, depthTest: false, toneMapped: false }));
    pinMesh.renderOrder = 6; scene.add(pinMesh); need = true;
  }

  // ------------------------------------------------------------------ picking: which tile is under the pointer (a ray marched down onto the relief)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function tileAt(ev) {
    if (!G) return -1;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    if (d.y > -1e-4) return -1;
    let t = Math.max(0, (o.y - HMAX) / -d.y);
    const tEnd = o.y / -d.y + 0.01, step = 0.12;
    const above = t => o.y + d.y * t - ground(o.x + d.x * t, o.z + d.z * t);
    let prev = t;
    for (; t <= tEnd; t += step) { if (above(t) <= 0) break; prev = t; }
    if (t > tEnd) t = tEnd;
    let lo = prev, hi = t;
    for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (above(m) > 0) lo = m; else hi = m; }
    return hexAt(o.x + d.x * hi, o.z + d.z * hi);
  }
  let down = null, hoverAt = 0;
  const el = renderer.domElement;
  el.addEventListener("pointerdown", ev => { down = { x: ev.clientX, y: ev.clientY }; });
  el.addEventListener("pointerup", ev => { if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 6 && ev.button === 0) hooks.onPick(tileAt(ev)); down = null; });
  el.addEventListener("pointermove", ev => { if (ev.buttons) { hooks.onHover(-1); setHover(-1); return; } const now = performance.now(); if (now - hoverAt < 60) return; hoverAt = now; const i = tileAt(ev); setHover(i); hooks.onHover(i, ev); });
  el.addEventListener("pointerleave", () => { hooks.onHover(-1); setHover(-1); });
  // keys: arrows or WASD to move, Q/E to turn, R to face north, T to look straight down, Enter to pick the tile in the middle
  el.addEventListener("keydown", ev => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = ev.key.toLowerCase(), d = camera.position.distanceTo(controls.target), step = Math.max(1.5, d * 0.08);
    const fwd = controls.target.clone().sub(camera.position).setY(0); if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const move = { arrowup: fwd, w: fwd, arrowdown: fwd.clone().negate(), s: fwd.clone().negate(), arrowleft: right.clone().negate(), a: right.clone().negate(), arrowright: right, d: right }[k];
    if (move) { ev.preventDefault(); const v = move.clone().multiplyScalar(step); controls.target.add(v); camera.position.add(v); need = true; return; }
    if (k === "q" || k === "e") { ev.preventDefault(); turn(k === "q" ? 0.2 : -0.2); return; }
    if (k === "r") { ev.preventDefault(); faceNorth(false); return; }
    if (k === "t") { ev.preventDefault(); faceNorth(true); return; }
    if (k === "enter") { ev.preventDefault(); const r = el.getBoundingClientRect(), R = view(); hooks.onPick(tileAt({ clientX: r.left + R.x + R.w / 2, clientY: r.top + R.y + R.h / 2 })); }
  });
  el.addEventListener("dblclick", ev => { const i = tileAt(ev); if (i >= 0) focus(i, true); });
  el.addEventListener("contextmenu", ev => ev.preventDefault());

  // ------------------------------------------------------------------ camera moves
  let fly = null;
  function focus(i, close = false) {
    if (i < 0 || !HT) return;
    const p = at(i), d = close ? 16 : Math.min(camera.position.distanceTo(controls.target), 45);
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (close || dir.y > 0.9) { const flat = Math.hypot(dir.x, dir.z) || 1; dir.set(dir.x / flat * 0.6, 0.8, dir.z / flat * 0.6); if (!Number.isFinite(dir.x) || (dir.x === 0 && dir.z === 0)) dir.set(0, 0.69, 0.72); dir.normalize(); }
    fly = { t0: performance.now(), dur: 700, fromT: controls.target.clone(), toT: p, fromC: camera.position.clone(), toC: p.clone().add(dir.multiplyScalar(d)) };
  }
  function turn(a) {
    const off = camera.position.clone().sub(controls.target).applyAxisAngle(Y_AXIS, a);
    fly = { t0: performance.now(), dur: 250, fromT: controls.target.clone(), toT: controls.target.clone(), fromC: camera.position.clone(), toC: controls.target.clone().add(off) };
  }
  /** North up again; `down`: look straight down (or back to the usual tilt if already). */
  function faceNorth(down) {
    const d = camera.position.distanceTo(controls.target), off = camera.position.clone().sub(controls.target).normalize();
    const flat = down && off.y < 0.97 ? new THREE.Vector3(0, 0.999, 0.045) : new THREE.Vector3(0, 0.766, 0.643);
    fly = { t0: performance.now(), dur: 500, fromT: controls.target.clone(), toT: controls.target.clone(), fromC: camera.position.clone(), toC: controls.target.clone().add(flat.normalize().multiplyScalar(d)) };
  }
  function zoom(f) {
    const dir = camera.position.clone().sub(controls.target), d = clamp(dir.length() / f, controls.minDistance, controls.maxDistance);
    fly = { t0: performance.now(), dur: 300, fromT: controls.target.clone(), toT: controls.target.clone(), fromC: camera.position.clone(), toC: controls.target.clone().add(dir.setLength(d)) };
  }
  /** The part of the screen the docks leave free (container pixels). */
  function view() {
    const W = container.clientWidth, H = container.clientHeight, R = hooks.visibleRect?.();
    return R && R.w > 120 && R.h > 120 ? R : { x: 0, y: 0, w: W, h: H };
  }
  let lastView = "";
  /** Shift the picture so the camera's centre falls in the middle of the free part of the screen. */
  function aim() {
    const W = container.clientWidth, H = container.clientHeight, R = view(), key = `${W}x${H}:${R.x},${R.y},${R.w},${R.h}`;
    if (key === lastView) return;
    lastView = key;
    const dx = R.x + R.w / 2 - W / 2, dy = R.y + R.h / 2 - H / 2;
    camera.setViewOffset(W, H, -dx, -dy, W, H); camera.updateProjectionMatrix(); need = true;
  }
  /** Where the camera sees the whole world: far enough for its width and its depth at this screen's shape. */
  function home() {
    // the free part of the screen sees tan(fov/2) × its share of the height, up and across
    const R = view(), H = Math.max(1, container.clientHeight), half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), w = X0 + 4, d = Z0 + 6;
    const dist = Math.max(w / (half * R.w / H), d / (half * R.h / H) * 0.95) * 1.15; // the near edge looks wider: a little more room
    return new THREE.Vector3(0, dist * 0.766, dist * 0.643); // about 50° above the horizon: the relief reads, the far side stays in view
  }
  function fit() { fly = { t0: performance.now(), dur: 700, fromT: controls.target.clone(), toT: new THREE.Vector3(0, 0, 0), fromC: camera.position.clone(), toC: home() }; }

  // the sun's shadow covers what the camera looks at, finer up close; cast again only when the view moves on far enough
  let shadowFit = null;
  function fitShadow() {
    if (!sun.castShadow) return;
    const d = camera.position.distanceTo(controls.target), E = clamp(d * 0.95, 14, 170), p = controls.target;
    if (shadowFit && p.distanceTo(shadowFit.p) < shadowFit.E * 0.3 && E / shadowFit.E < 1.35 && E / shadowFit.E > 0.74) return;
    shadowFit = { p: p.clone(), E };
    sun.target.position.copy(p); sun.position.copy(p).addScaledVector(SUN_DIR, 180);
    Object.assign(sun.shadow.camera, { left: -E, right: E, top: E, bottom: -E, near: 60, far: 320 });
    sun.shadow.camera.updateProjectionMatrix(); sun.target.updateMatrixWorld();
    reshadow();
  }

  // ------------------------------------------------------------------ the loop
  const perf = { n: 0, sum: 0, last: 0 };
  let need = true, running = true, raf = 0, animOn = hooks.anim?.() ?? true, lastLabelView = null;
  controls.addEventListener("change", () => { need = true; });
  function resize() {
    const w = Math.max(100, container.clientWidth), h = Math.max(100, container.clientHeight);
    renderer.setSize(w, h, false); labels.setSize(w, h); camera.aspect = w / h; lastView = ""; aim(); camera.updateProjectionMatrix(); need = true;
  }
  new ResizeObserver(resize).observe(container);
  function theme() {
    // the interface is dark: a night-blue void around the map, a blue haze over its far side
    scene.background = new THREE.Color("#0a1419");
    need = true;
  }
  function frame(now) {
    raf = 0;
    if (!running || document.hidden) return;
    if (fly) { const t = clamp((now - fly.t0) / fly.dur, 0, 1), e = ease(t); controls.target.lerpVectors(fly.fromT, fly.toT, e); camera.position.lerpVectors(fly.fromC, fly.toC, e); if (t >= 1) fly = null; need = true; }
    controls.update();
    const live = animOn || fxQueue.length || smoke.length;
    if (live) {
      U.uTime.value = now / 1000;
      updateMovers(now); updateFx(now);
      for (const f of flags) { const p = f.cloth.geometry.attributes.position, a = p.array; for (let k = 0; k < a.length; k += 3) a[k + 2] = f.base[k + 2] + Math.sin(now / 260 + f.phase + f.base[k] * 6) * 0.05 * f.base[k] * 2.2; p.needsUpdate = true; }
      need = true;
    }
    if (now - (frame.aimed || 0) > 300) { frame.aimed = now; aim(); } // the docks open and close
    // a slow machine draws fewer pixels rather than fewer frames (and takes them back when it can)
    if (live) {
      perf.n++; perf.sum += Math.min(100, now - (perf.last || now)); perf.last = now;
      if (perf.n >= 90) {
        const ms = perf.sum / perf.n, next = ms > 24 ? Math.max(1, dpr - 0.25) : ms < 15 ? Math.min(DPR_MAX, dpr + 0.25) : dpr;
        if (next !== dpr) { dpr = next; renderer.setPixelRatio(dpr); resize(); }
        perf.n = 0; perf.sum = 0;
      }
    } else perf.last = 0;
    if (need) {
      const d = camera.position.distanceTo(controls.target);
      scene.fog.near = d * 0.85; scene.fog.far = d * 3.2;
      U.uBand.value = clamp(d * 0.0016, 0.06, 0.45);
      fitShadow();
      // the HTML labels move only when the view does (or a turn's events float over the map)
      camera.updateMatrixWorld();
      const view = [...camera.matrixWorld.elements, ...camera.projectionMatrix.elements, labelGen, container.clientWidth];
      const moved = fxQueue.length > 0 || !lastLabelView || view.some((v, k) => v !== lastLabelView[k]);
      if (moved) cullLabels();
      renderer.render(scene, camera);
      if (moved) labels.render(scene, camera);
      lastLabelView = view; need = false;
      hooks.onZoom?.(home().length() / Math.max(1e-6, d));
    }
    raf = requestAnimationFrame(frame);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && running && !raf) raf = requestAnimationFrame(frame); });

  function disposeTree(o, keepShared = false) {
    o.traverse(x => {
      if (x.isCSS2DObject) { x.element.remove(); const k = allLabels.indexOf(x); if (k >= 0) allLabels.splice(k, 1); }
      if (x.geometry && !Object.values(GEO).includes(x.geometry)) x.geometry.dispose();
      if (x.material) { const ms = Array.isArray(x.material) ? x.material : [x.material]; for (const m of ms) { if (!keepShared || !m.map) m.dispose(); } }
    });
  }

  // the first view of the whole world, once the container has a size to frame it in
  let placed = false;
  function placeCamera() {
    if (!ST || container.hidden || container.clientHeight < 50) return;
    resize(); camera.position.copy(home()); controls.target.set(0, 0, 0); placed = true; need = true;
  }

  // ------------------------------------------------------------------ the module's face
  const api3 = {
    setStatic(st) {
      ST = st; N = st.n; X0 = SQ3 * N / 2; Z0 = 0.75 * N;
      buildWorld(); buildDecor(); theme();
      shadowFit = null;
      placeCamera();
      if (S) api3.setState(S);
    },
    setState(s) { S = s; if (!ST) return; paintTiles(); buildDynamic(); buildMovers(); updatePin(); },
    setSelected(id) { if (selected === id) return; selected = id; U.uSel.value = id ?? -1; need = true; },
    setPinned(i) { if (pinned === i) return; pinned = i; U.uPin.value = i ?? -1; if (hovered === i) U.uHover.value = -1; updatePin(); need = true; },
    setLayer(values, max, threat) { layer = values ? { values, max, threat } : null; paintTiles(); },
    playFx, focus, zoom, fit, theme, faceNorth, turn,
    setAnim(on) { animOn = on; need = true; },
    show(on) { running = on; container.hidden = !on; if (on) { resize(); if (!placed) placeCamera(); if (!raf) raf = requestAnimationFrame(frame); } },
    distance: () => camera.position.distanceTo(controls.target),
  };
  raf = requestAnimationFrame(frame);
  return api3;
}
