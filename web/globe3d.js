// The globe in 3D (Three.js): a world of hexagons (and twelve pentagons) on a ball, turned with the mouse.
// app.js loads this module instead of map3d.js when the world is a globe (§12.1); it answers the same calls
// (setStatic, setState, setPinned, focus, zoom, playFx, quality, …) and hands picking and hovering back, so the
// inspector and everything else work as on the flat map.
//
// The ground is built as on the flat map, only bent round the ball: the triangles between every three tile centres
// (where the tiles' corners lie) are cut into a fine mesh whose heights and colours blend the three tiles (plains,
// rolling hills, ridged mountains, beaches sloping into a sea that deepens away from the shore, river valleys).
// Who holds what is painted by the shaders from a small texture, one texel a tile (owner, borders, war fronts,
// fields, town squares, overlays): a turn changes the texture, never the mesh. Up close the mesh is drawn in pieces
// (only those facing the eye), from afar a plain one does.
//
// Towns, works, roads, woods and what moves are laid out by the flat map's own code (web/map3d-shared.js), each in
// the frame of its tile's tangent plane, and drawn with the same models (Kenney's kits) carried onto the ball. They
// are kept per kind and only the copies near the eye are drawn (and none from afar).
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/CSS2DRenderer.js";
import { createPost } from "./map3d-post.js";
import { loadModels, modelMaterial } from "./map3d-models.js";
import { SQ3, WATER, hash, clamp, smooth, ease, Tris, SHAPES, WOODS, decorTile, layRoads, layTowns, powerGrid, moverList, riverMaterial, smokeWisps, gullFlock, townGlow } from "./map3d-shared.js";

const R = 100; // the globe's radius; a tile is about 2.4 across
const TONE = { good: "#4cc283", bad: "#ef6b60", "": "#ffd84a" };
const GROUND = { grass: "#82ad48", forest: "#4f7d32", taiga: "#526f4a", jungle: "#3a7230", hill: "#97954f", mountain: "#7c7165", coast: "#d6c690", swamp: "#5f7150", desert: "#d8bb7c", tundra: "#a2ad98", glacier: "#d6e4ec", icewall: "#eef6fb" };
const GRASS_ZONE = { cold: "#88a064", temp: "#82ad48", trop: "#6daa40" };
const SAND = "#d4c48e", ROCK = "#6c6359", SNOW = "#f4f7f9";
const SUB = 4; // the triangle between three tile centres is cut into SUB² (the land and the coasts)
const HSC = 0.5; // the relief: the flat map's heights × this (a ball wears its mountains lower)
const NCH = 120; // pieces of the ground, drawn only when they face the eye
const FINE_ALT = 50; // nearer than this the fine ground is drawn, farther the plain one
const Y = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ noise in 3D (gradient noise, seeded by the world)
const PERM = new Uint8Array(512);
function seedNoise(seed) {
  let s = 0; for (const ch of String(seed)) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const j = s % (i + 1); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
const fadeN = t => t * t * t * (t * (t * 6 - 15) + 10);
const grad3 = (h, x, y, z) => { const u = h < 8 ? x : y, v = h < 4 ? y : h === 12 || h === 14 ? x : z; return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); };
const lerpN = (a, b, t) => a + t * (b - a);
function perlin3(x, y, z) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z), X = fx & 255, Yy = fy & 255, Z = fz & 255;
  x -= fx; y -= fy; z -= fz;
  const u = fadeN(x), v = fadeN(y), w = fadeN(z);
  const A = PERM[X] + Yy, AA = PERM[A] + Z, AB = PERM[A + 1] + Z, B = PERM[X + 1] + Yy, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
  return lerpN(lerpN(lerpN(grad3(PERM[AA] & 15, x, y, z), grad3(PERM[BA] & 15, x - 1, y, z), u), lerpN(grad3(PERM[AB] & 15, x, y - 1, z), grad3(PERM[BB] & 15, x - 1, y - 1, z), u), v),
    lerpN(lerpN(grad3(PERM[AA + 1] & 15, x, y, z - 1), grad3(PERM[BA + 1] & 15, x - 1, y, z - 1), u), lerpN(grad3(PERM[AB + 1] & 15, x, y - 1, z - 1), grad3(PERM[BB + 1] & 15, x - 1, y - 1, z - 1), u), v), w) * 0.7;
}
const fbm3 = (x, y, z) => perlin3(x, y, z) * 0.6 + perlin3(x * 2.03, y * 2.03, z * 2.03) * 0.28 + perlin3(x * 4.1, y * 4.1, z * 4.1) * 0.12;
function ridged3(x, y, z) {
  let s = 0, a = 0.62, w = 1;
  for (let o = 0; o < 4; o++) { let n = 1 - Math.abs(perlin3(x, y, z)); n *= n * w; w = clamp(n * 1.6, 0, 1); s += n * a; a *= 0.5; x = x * 2.07 + 3.1; y = y * 2.07 - 1.7; z = z * 2.07 + 0.9; }
  return s;
}

const NOISE3_GLSL = /* glsl */`
float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1, 0, 0)), u.x), mix(h13(i + vec3(0, 1, 0)), h13(i + vec3(1, 1, 0)), u.x), u.y),
             mix(mix(h13(i + vec3(0, 0, 1)), h13(i + vec3(1, 0, 1)), u.x), mix(h13(i + vec3(0, 1, 1)), h13(i + vec3(1, 1, 1)), u.x), u.y), u.z);
}
`;
// The tiles' paint, shared by the land and the sea: the pixel's tile is the nearest of its triangle's three corners
// (the tiles' centres), and how near it lies to that tile's edge is the difference of their weights.
const PAINT_GLSL = NOISE3_GLSL + /* glsl */`
uniform highp sampler2D uTiles;
uniform highp sampler2D uPal;
uniform highp sampler2D uDirs;
uniform float uHover, uPin, uSel, uBand, uTime, uDetail, uNear, uK, uHS;
flat varying vec3 vTl;
flat varying vec3 vSd;
varying vec2 vBw;
varying vec3 vPos;
vec3 tilePaint(vec3 col, float water, out vec3 glow) {
  glow = vec3(0.0);
  vec3 w = vec3(1.0 - vBw.x - vBw.y, vBw.x, vBw.y);
  int k = (w.x >= w.y && w.x >= w.z) ? 0 : (w.y >= w.z ? 1 : 2);
  float wk = k == 0 ? w.x : k == 1 ? w.y : w.z, w1 = k == 0 ? w.y : k == 1 ? w.z : w.x, w2 = k == 0 ? w.z : k == 1 ? w.x : w.y;
  float tf = k == 0 ? vTl.x : k == 1 ? vTl.y : vTl.z, sf = k == 0 ? vSd.x : k == 1 ? vSd.y : vSd.z;
  int t = int(tf + 0.5), sd = int(sf + 0.5), s1 = sd & 7, s2 = sd >> 3;
  float e1 = wk - w1, e2 = wk - w2, emin = min(e1, e2), fw = max(fwidth(emin), 1e-4);
  ivec2 tx = ivec2(t % 256, t / 256);
  ivec4 d = ivec4(texelFetch(uTiles, tx, 0) * 255.0 + 0.5);
  int owner = d.r - 1, bm = d.g & 63, fm = d.b & 63;
  bool b1 = (bm & (1 << s1)) != 0, b2 = (bm & (1 << s2)) != 0, f1 = (fm & (1 << s1)) != 0, f2 = (fm & (1 << s2)) != 0;
  float W = max(uBand, fw * 2.5), FW = min(0.48, max(uBand * 1.6, fw * 4.0)), IW = max(0.5, fw * 10.0);
  float band = 0.0, front = 0.0, inner = 0.0, edge = 0.0;
  if (b1) { band = max(band, 1.0 - smoothstep(W - fw, W + fw, e1)); inner = max(inner, 1.0 - smoothstep(0.0, IW, e1)); edge = max(edge, 1.0 - smoothstep(0.0, fw * 1.2, e1)); }
  if (b2) { band = max(band, 1.0 - smoothstep(W - fw, W + fw, e2)); inner = max(inner, 1.0 - smoothstep(0.0, IW, e2)); edge = max(edge, 1.0 - smoothstep(0.0, fw * 1.2, e2)); }
  if (f1) { front = max(front, 1.0 - smoothstep(FW - fw, FW + fw, e1)); inner = max(inner, 1.0 - smoothstep(0.0, IW, e1)); }
  if (f2) { front = max(front, 1.0 - smoothstep(FW - fw, FW + fw, e2)); inner = max(inner, 1.0 - smoothstep(0.0, IW, e2)); }
  vec3 nc = owner >= 0 ? texelFetch(uPal, ivec2(owner, 0), 0).rgb : vec3(0.0);
  if (owner >= 0) col = mix(col, nc, (water > 0.5 ? 0.14 : 0.13) + (1.0 - uNear) * 0.17 + inner * inner * 0.22);
  int tier = d.g >> 6;
  if (water < 0.5 && (tier > 0 || (d.b & 192) != 0)) {
    // what people made of the ground: fields, salt pans, the paved heart of each town, drawn in the tile's own
    // flat frame (the tiles' units, as on the flat map)
    vec3 c = texelFetch(uDirs, tx, 0).xyz, ex = normalize(cross(vec3(0.0, 1.0, 0.0), c) + vec3(1e-6, 0.0, 0.0)), nx = cross(c, ex);
    vec3 dq = normalize(vPos) - c;
    vec2 dl = vec2(dot(dq, ex), -dot(dq, nx)) * ${R.toFixed(1)} / uK;
    float pw = max(fwidth(dl.x), fwidth(dl.y)), fine = 1.0 - smoothstep(0.015, 0.06, pw), dlen = length(dl);
    if ((d.b & 64) != 0 && emin > 0.08) {
      float h = fract(sin(tf * 12.9898) * 43758.5453) * 3.1416;
      vec2 dir = vec2(cos(h), sin(h));
      float u = dot(dl, dir), v = dot(dl, vec2(-dir.y, dir.x)), plot = mod(floor(v * 2.4 + 3.0 + h), 3.0);
      vec3 fc = plot < 0.5 ? vec3(0.52, 0.36, 0.06) : plot < 1.5 ? vec3(0.22, 0.36, 0.05) : vec3(0.30, 0.19, 0.07);
      float furrow = 0.5 + 0.5 * sin(u * 30.0);
      col = mix(col, fc * (1.0 - 0.3 * furrow * fine), 0.88 * smoothstep(0.08, 0.16, emin));
      col *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.02 + pw, fract(v * 2.4 + h) / 2.4)) * fine;
    }
    if ((d.b & 128) != 0 && emin > 0.1) {
      vec2 g = fract(dl * 3.4 + 0.5);
      float sq = step(0.1, g.x) * step(g.x, 0.9) * step(0.1, g.y) * step(g.y, 0.9);
      col = mix(col, vec3(0.86, 0.87, 0.85), 0.92 * sq);
    }
    if (tier > 0) {
      float R0 = tier == 1 ? 0.2 : tier == 2 ? 0.27 : 0.33;
      float inP = 1.0 - smoothstep(R0 - pw, R0 + pw, dlen);
      vec2 cell = floor(dl * 10.0);
      float cob = fine * 0.12 * fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
      col = mix(col, vec3(0.36, 0.31, 0.24) * (1.0 - cob), inP * 0.92);
      col *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.025 + pw, abs(dlen - R0)));
      if (uNear < 0.5) col = mix(col, vec3(0.42, 0.37, 0.3), (1.0 - uNear * 2.0) * smoothstep(0.62, 0.7, wk) * 0.8); // from afar: a town's dot
    }
  }
  int ov = d.a >> 1;
  if (ov > 0) col = mix(col, (d.a & 1) == 1 ? vec3(0.78, 0.03, 0.01) : vec3(1.0, 0.66, 0.0), 0.15 + float(ov) / 127.0 * 0.6);
  bool dim = uSel >= 0.0 && float(owner) != uSel;
  if (dim) col = mix(col, vec3(0.19, 0.21, 0.24), 0.5) * 0.7;
  // borders: a ribbon of the owner's colour along the edge, glowing; a war front striped yellow and black
  float bk = dim ? 0.45 : 1.0;
  if (band > 0.0) { col = mix(col, nc, band * bk); glow += nc * band * 0.5 * bk; col *= 1.0 - edge * 0.5; }
  if (front > 0.0) {
    float s = step(0.5, fract((vPos.x + vPos.y + vPos.z) / uK * 0.9));
    vec3 fcol = s > 0.5 ? vec3(1.0, 0.56, 0.02) : vec3(0.012, 0.009, 0.004);
    col = mix(col, fcol, front); glow += fcol * front * 0.6;
  }
  // the tiles' outlines, faint, only up close
  col *= 1.0 - (1.0 - smoothstep(0.0, fw * 1.4, emin)) * uNear * 0.18;
  if (abs(tf - uPin) < 0.5) { float o = 1.0 - smoothstep(0.06 + fw, 0.06 + fw * 3.0, emin); col = mix(col, vec3(1.0, 0.75, 0.15), 0.2 + 0.75 * o); glow += vec3(1.0, 0.7, 0.12) * o * 0.9; }
  else if (abs(tf - uHover) < 0.5) { float o = 1.0 - smoothstep(0.04 + fw, 0.04 + fw * 3.0, emin); col = mix(col, vec3(1.0), 0.12 + 0.8 * o); glow += vec3(0.6) * o; }
  return col;
}
`;
const PAINT_VERTEX = s => "attribute vec2 aBw;\nattribute vec3 aTl;\nattribute vec3 aSd;\nflat varying vec3 vTl;\nflat varying vec3 vSd;\nvarying vec2 vBw;\nvarying vec3 vPos;\n" + s.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vTl = aTl; vSd = aSd; vBw = aBw; vPos = position;");

export function create(container, hooks) {
  // ------------------------------------------------------------------ scene, camera, renderer
  const mobile = matchMedia("(pointer: coarse)").matches || Math.min(innerWidth, innerHeight) < 600;
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: "high-performance" });
  const DPR_MAX = Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.5);
  let dpr = DPR_MAX; renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = "map3d-canvas"; renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("aria-label", "Địa cầu 3D: kéo để xoay, lăn để phóng to, nhấp đúp để bay tới một nơi");
  container.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer(); labels.domElement.className = "map3d-labels"; container.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#04080d");
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2000);
  scene.add(camera);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.1, enablePan: false, enableZoom: false, minPolarAngle: 0.08, maxPolarAngle: Math.PI - 0.08, rotateSpeed: 0.5 });
  // the light comes with the eye, from the upper left: the side looked at is always day
  scene.add(new THREE.HemisphereLight(0xc4d8ff, 0x4a3a28, 1.15));
  const sun = new THREE.DirectionalLight(0xffe6c4, 2.7); camera.add(sun); sun.position.set(-150, 140, 25);
  const canPost = renderer.capabilities.isWebGL2 && (renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float"));
  let quality = (() => { try { const q = localStorage.getItem("sm-3d-q"); if (q === "hi" || q === "lo") return q; } catch { } return mobile ? "lo" : "hi"; })();
  if (!canPost) quality = "lo";
  let post = null;

  // ------------------------------------------------------------------ the globe's shape
  let ST = null, S = null, T = 0, P = null, H = null, NBS = null, OFF = null, K = 1.4, HS = 0.7;
  const dirOf = (i, out = new THREE.Vector3()) => out.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
  const isWater = i => WATER.has(ST.terrain[i]);
  /** A tile's centre on the ground, lifted by `dy`. */
  const at = (i, dy = 0) => dirOf(i).multiplyScalar(R + H[i] + dy);
  /** The tile nearest a direction: a walk from tile to nearer tile, from `start` (or the last one found). */
  let lastNear = 0;
  function nearestTile(q, start = lastNear) {
    const dot = i => P[i * 3] * q.x + P[i * 3 + 1] * q.y + P[i * 3 + 2] * q.z;
    let i = start >= 0 && start < T ? start : 0, best = dot(i);
    for (let g = 0; g < 4000; g++) { let next = -1; for (const j of NBS[i]) { const d = dot(j); if (d > best) { best = d; next = j; } } if (next < 0) break; i = next; }
    lastNear = i; return i;
  }

  // the fine mesh: its triangles between three tile centres ("duals"), the points shared between them
  let ND = 0, DT = null, DUAL = null, NV = 0, VT = null, VW = null, VQ = null, VG = null, VC = null, VN = null, EDGE = null, INNER = null, SIDE = null, CHUNK = null;
  const side = (a, b) => { const nb = NBS[a]; for (let k = 0; k < nb.length; k++) if (nb[k] === b) return k; return 0; };
  /** The point (i, j) of dual d's lattice (`s` steps a side): its shared index. */
  function vid(d, i, j, s = SUB) {
    const A = DT[d * 3], B = DT[d * 3 + 1], C = DT[d * 3 + 2];
    if (s !== SUB) { i *= SUB / s; j *= SUB / s; }
    if (j === 0) return i === 0 ? A : i === SUB ? B : edgeV(A, B, i);
    if (i === 0) return j === SUB ? C : edgeV(A, C, j);
    if (i + j === SUB) return edgeV(B, C, j);
    // inside: row j (1..SUB-2), column i (1..SUB-1-j)
    let k = 0; for (let r = 1; r < j; r++) k += SUB - 1 - r;
    return INNER[d] + k + (i - 1);
  }
  function edgeV(a, b, t) { return a < b ? EDGE.get(a * T + b) + t - 1 : EDGE.get(b * T + a) + (SUB - t) - 1; }

  /** Where direction q meets the mesh: the dual under it and its three weights (written into `out`), from tile `hint`. */
  const bw = [0, 0, 0, 0];
  function dualAt(q, hint) {
    const a = nearestTile(q, hint), n = NBS[a].length;
    let bestD = -1, bestMin = -Infinity;
    for (let k = 0; k < n; k++) {
      const d = DUAL[OFF[a] + k];
      weights(d, q);
      const m = Math.min(bw[0], bw[1], bw[2]);
      if (m >= -1e-6) { bestD = d; break; }
      if (m > bestMin) { bestMin = m; bestD = d; }
    }
    weights(bestD, q); bw[3] = bestD;
    return bw;
  }
  /** The weights of the three centres of dual d at q (where the ray from the ball's centre meets their plane). */
  function weights(d, q) {
    const A = DT[d * 3] * 3, B = DT[d * 3 + 1] * 3, C = DT[d * 3 + 2] * 3;
    const ax = P[A], ay = P[A + 1], az = P[A + 2], bx = P[B], by = P[B + 1], bz = P[B + 2], cx = P[C], cy = P[C + 1], cz = P[C + 2];
    const wa = q.x * (by * cz - bz * cy) + q.y * (bz * cx - bx * cz) + q.z * (bx * cy - by * cx);
    const wb = q.x * (cy * az - cz * ay) + q.y * (cz * ax - cx * az) + q.z * (cx * ay - cy * ax);
    const wc = q.x * (ay * bz - az * by) + q.y * (az * bx - ax * bz) + q.z * (ax * by - ay * bx);
    const s = wa + wb + wc || 1;
    bw[0] = wa / s; bw[1] = wb / s; bw[2] = wc / s;
  }
  /** The ground's height at direction q, in the tiles' units (as the fine mesh draws it); `hint`: a tile near. */
  let lastGround = 0;
  function groundAt(q, hint = lastGround) {
    if (!VG) return 0;
    const w = dualAt(q, hint), d = w[3];
    lastGround = DT[d * 3];
    const u = clamp(w[1], 0, 1) * SUB, v = clamp(w[2], 0, 1) * SUB;
    let i0 = Math.min(SUB - 1, Math.floor(u)), j0 = Math.min(SUB - 1, Math.floor(v));
    if (i0 + j0 > SUB - 1) { if (u - i0 > v - j0) j0 = SUB - 1 - i0; else i0 = SUB - 1 - j0; }
    const fu = clamp(u - i0, 0, 1), fv = clamp(v - j0, 0, 1);
    let h;
    if (fu + fv <= 1 || i0 + j0 === SUB - 1) h = VG[vid(d, i0, j0)] * (1 - fu - fv) + VG[vid(d, i0 + 1, j0)] * fu + VG[vid(d, i0, j0 + 1)] * fv;
    else h = VG[vid(d, i0 + 1, j0 + 1)] * (fu + fv - 1) + VG[vid(d, i0, j0 + 1)] * (1 - fu) + VG[vid(d, i0 + 1, j0)] * (1 - fv);
    return h * HSC;
  }

  /** Each tile's part in the relief (as on the flat map): land height, sea depth, how mountainous and how rough. */
  function tileShapes() {
    const Hl = new Float32Array(T), Dw = new Float32Array(T), Lm = new Float32Array(T), Mt = new Float32Array(T), Rg = new Float32Array(T), Hb = new Float32Array(T), Col = new Float32Array(T * 3);
    const dist = new Int16Array(T).fill(-1), queue = [];
    for (let i = 0; i < T; i++) if (!isWater(i)) { dist[i] = 0; queue.push(i); }
    for (let q = 0; q < queue.length; q++) for (const j of NBS[queue[q]]) if (dist[j] < 0) { dist[j] = dist[queue[q]] + 1; queue.push(j); }
    const high = t => t === "mountain" || t === "icewall", deep = new Int16Array(T), mq = [];
    for (let i = 0; i < T; i++) if (high(ST.terrain[i]) && NBS[i].some(j => !high(ST.terrain[j]))) { deep[i] = 1; mq.push(i); }
    for (let q = 0; q < mq.length; q++) for (const j of NBS[mq[q]]) if (high(ST.terrain[j]) && !deep[j]) { deep[j] = deep[mq[q]] + 1; mq.push(j); }
    const c = new THREE.Color();
    for (let i = 0; i < T; i++) {
      const t = ST.terrain[i];
      if (WATER.has(t)) { Lm[i] = -1; Dw[i] = t === "shallow" ? 0.28 + 0.12 * Math.min(dist[i], 3) : 0.6 + 0.3 * Math.min(Math.max(0, dist[i] - 1), 6); c.set("#b8aa7a"); }
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
    for (let i = 0; i < T; i++) if (Lm[i] < 0) { let s = 0, k = 0; for (const j of NBS[i]) if (Lm[j] > 0) { s += Hl[j]; k++; } Hl[i] = k ? s / k : 0.06; }
    return { Hl, Dw, Lm, Mt, Rg, Hb, Col, dist };
  }

  // rivers: their courses (smoothed), and per tile the pieces of course near it
  let riverPaths = [], RSEG = null;
  /** How deep a river has cut at direction q (the flat map's measure: 0.2 in its bed, 0 away from it); `tiles`: where to look. */
  const tq0 = new THREE.Vector3();
  function riverCut(q, tiles) {
    let best = Infinity;
    for (const t of tiles) {
      const L = RSEG.get(t); if (!L) continue;
      for (let k = 0; k < L.length; k += 6) {
        const ax = L[k], ay = L[k + 1], az = L[k + 2], dx = L[k + 3] - ax, dy = L[k + 4] - ay, dz = L[k + 5] - az, L2 = dx * dx + dy * dy + dz * dz || 1e-12;
        const s = clamp(((q.x - ax) * dx + (q.y - ay) * dy + (q.z - az) * dz) / L2, 0, 1), ex = q.x - ax - dx * s, ey = q.y - ay - dy * s, ez = q.z - az - dz * s;
        best = Math.min(best, ex * ex + ey * ey + ez * ez);
      }
    }
    if (best === Infinity) return 0;
    const d = Math.sqrt(best) * R / K; // in the tiles' units
    return 0.2 * (1 - smooth(0.14, 0.7, d));
  }
  function buildRivers() {
    riverPaths = []; RSEG = new Map();
    for (const path of ST.rivers || []) {
      if (path.length < 2) continue;
      let pts = path.map(i => dirOf(i));
      for (let it = 0; it < 2; it++) { const q = [pts[0]]; for (let k = 0; k < pts.length - 1; k++) { const a = pts[k], b = pts[k + 1]; q.push(a.clone().lerp(b, 0.25).normalize(), a.clone().lerp(b, 0.75).normalize()); } q.push(pts.at(-1)); pts = q; }
      riverPaths.push(pts);
      let hint = path[0];
      for (let k = 0; k < pts.length - 1; k++) {
        const m = tq0.copy(pts[k]).add(pts[k + 1]).normalize(), t = nearestTile(m, hint); hint = t;
        for (const u of [t, ...NBS[t]]) { let L = RSEG.get(u); if (!L) RSEG.set(u, L = []); L.push(pts[k].x, pts[k].y, pts[k].z, pts[k + 1].x, pts[k + 1].y, pts[k + 1].z); }
      }
    }
  }

  /** The globe's shape: tile directions, the duals and the fine mesh's shared points with their heights and colours. */
  function buildShape() {
    T = ST.terrain.length; NBS = ST.nb;
    seedNoise(ST.seed ?? "world");
    P = new Float32Array(T * 3); H = new Float32Array(T);
    const D = Math.PI / 180;
    for (let i = 0; i < T; i++) { const la = ST.lat[i] * D, lo = ST.lon[i] * D; P[i * 3] = Math.cos(la) * Math.cos(lo); P[i * 3 + 1] = Math.sin(la); P[i * 3 + 2] = -Math.cos(la) * Math.sin(lo); }
    // the tiles' own unit: their spacing over the flat map's √3
    { let s = 0, n = 0; for (let i = 0; i < T; i += 7) for (const j of NBS[i]) { s += Math.acos(clamp(P[i * 3] * P[j * 3] + P[i * 3 + 1] * P[j * 3 + 1] + P[i * 3 + 2] * P[j * 3 + 2], -1, 1)); n++; } K = s / n * R / SQ3; HS = K * HSC; }
    // the duals: one per meeting of three tiles (the same whichever tile asks)
    OFF = new Int32Array(T + 1); for (let i = 0; i < T; i++) OFF[i + 1] = OFF[i] + NBS[i].length;
    DUAL = new Int32Array(OFF[T]);
    const key = new Map(), dt = [];
    for (let i = 0; i < T; i++) {
      const nb = NBS[i], n = nb.length;
      for (let k = 0; k < n; k++) {
        const b = nb[k], c = nb[(k + 1) % n], t3 = [i, b, c].sort((x, y) => x - y), kk = (t3[0] * T + t3[1]) * T + t3[2];
        let id = key.get(kk);
        if (id === undefined) { id = dt.length / 3; dt.push(i, b, c); key.set(kk, id); }
        DUAL[OFF[i] + k] = id;
      }
    }
    ND = dt.length / 3; DT = Int32Array.from(dt);
    // the shared points: the centres, SUB-1 on each edge between two tiles, the rest inside each dual
    EDGE = new Map(); let nv = T;
    for (let i = 0; i < T; i++) for (const j of NBS[i]) if (i < j) { EDGE.set(i * T + j, nv); nv += SUB - 1; }
    for (let d = 0; d < ND; d++) for (const [x, y] of [[0, 1], [0, 2], [1, 2]]) { // (and any side of a dual the lists of neighbours leave out)
      const a = Math.min(DT[d * 3 + x], DT[d * 3 + y]), b = Math.max(DT[d * 3 + x], DT[d * 3 + y]);
      if (!EDGE.has(a * T + b)) { EDGE.set(a * T + b, nv); nv += SUB - 1; }
    }
    INNER = new Int32Array(ND); const inner = (SUB - 1) * (SUB - 2) / 2;
    for (let d = 0; d < ND; d++) { INNER[d] = nv; nv += inner; }
    NV = nv; VT = new Int32Array(NV * 3).fill(-1); VW = new Float32Array(NV * 3); VQ = new Float32Array(NV * 3);
    for (let i = 0; i < T; i++) { VT[i * 3] = i; VW[i * 3] = 1; VQ.set([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], i * 3); }
    const setV = (v, tiles, ws) => {
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < tiles.length; k++) { VT[v * 3 + k] = tiles[k]; VW[v * 3 + k] = ws[k]; x += P[tiles[k] * 3] * ws[k]; y += P[tiles[k] * 3 + 1] * ws[k]; z += P[tiles[k] * 3 + 2] * ws[k]; }
      const l = Math.hypot(x, y, z); VQ[v * 3] = x / l; VQ[v * 3 + 1] = y / l; VQ[v * 3 + 2] = z / l;
    };
    for (const [kk, base] of EDGE) { const a = Math.floor(kk / T), b = kk % T; for (let t = 1; t < SUB; t++) setV(base + t - 1, [a, b], [1 - t / SUB, t / SUB]); }
    for (let d = 0; d < ND; d++) {
      const tiles = [DT[d * 3], DT[d * 3 + 1], DT[d * 3 + 2]];
      for (let j = 1; j < SUB; j++) for (let i = 1; i + j < SUB; i++) setV(vid(d, i, j), tiles, [(SUB - i - j) / SUB, i / SUB, j / SUB]);
    }
    // the pieces: each tile to the nearest of NCH points spread evenly over the ball
    const seeds = [], ga = Math.PI * (3 - Math.sqrt(5));
    for (let k = 0; k < NCH; k++) { const y = 1 - (k + 0.5) / NCH * 2, r = Math.sqrt(1 - y * y); seeds.push(new THREE.Vector3(Math.cos(k * ga) * r, y, Math.sin(k * ga) * r)); }
    CHUNK = new Int16Array(T);
    for (let i = 0; i < T; i++) { let best = -2, bk = 0; for (let k = 0; k < NCH; k++) { const s = seeds[k], d = s.x * P[i * 3] + s.y * P[i * 3 + 1] + s.z * P[i * 3 + 2]; if (d > best) { best = d; bk = k; } } CHUNK[i] = bk; }
    SIDE = new Float32Array(ND * 3);
    for (let d = 0; d < ND; d++) { const A = DT[d * 3], B = DT[d * 3 + 1], C = DT[d * 3 + 2]; SIDE[d * 3] = side(A, B) + 8 * side(A, C); SIDE[d * 3 + 1] = side(B, C) + 8 * side(B, A); SIDE[d * 3 + 2] = side(C, A) + 8 * side(C, B); }
    // heights: the tiles' shapes blended, rough ground, rolling hills, ridged massifs, beaches, the seabed
    const TS = tileShapes();
    buildRivers();
    VG = new Float32Array(NV); VC = new Float32Array(NV * 3); const LV = new Float32Array(NV);
    const q = new THREE.Vector3();
    for (let v = 0; v < NV; v++) {
      let lm = 0, land = 0, dep = 0, mt = 0, rg = 0, hb = 0, cr = 0, cg = 0, cb = 0, ws = 0;
      for (let k = 0; k < 3; k++) {
        const i = VT[v * 3 + k]; if (i < 0) continue;
        const w = VW[v * 3 + k];
        lm += TS.Lm[i] * w; land += TS.Hl[i] * w; dep += TS.Dw[i] * w; mt += TS.Mt[i] * w; rg += TS.Rg[i] * w; hb += TS.Hb[i] * w;
        const ww = w * w * w * w; cr += TS.Col[i * 3] * ww; cg += TS.Col[i * 3 + 1] * ww; cb += TS.Col[i * 3 + 2] * ww; ws += ww;
      }
      const x = VQ[v * 3] * R / K, y = VQ[v * 3 + 1] * R / K, z = VQ[v * 3 + 2] * R / K; // in the tiles' units
      let G;
      const L = lm > -0.9 && lm < 0.9 ? lm + fbm3(x * 0.45 + 3, y * 0.45, z * 0.45 - 2) * 0.5 : lm; // the shore wanders a little
      if (L < -0.25) G = -0.08 - (dep - 0.08) * smooth(0.2, 0.85, -L) + perlin3(x * 0.5, y * 0.5, z * 0.5) * 0.06;
      else {
        let lh = land + rg * (fbm3(x * 0.3, y * 0.3, z * 0.3) * 1.1 + fbm3(x * 0.9 + 11, y * 0.9, z * 0.9 - 5) * 0.6);
        if (hb > 0.01) lh += hb * Math.max(0, 0.35 + fbm3(x * 0.55 - 4, y * 0.55 + 2, z * 0.55)) * 0.9; // rolling hills
        if (mt > 0.01) lh += mt * mt * (ridged3(x * 0.2 + 7.3, y * 0.2 - 3.1, z * 0.2 + 1.7) * 2.7 - 0.25);
        if (L >= 0) G = 0.06 + (lh - 0.06) * smooth(0, 0.62, L);
        else if (L > -0.2) G = 0.06 + L / 0.2 * 0.14;
        else G = -0.08 - (dep - 0.08) * smooth(0.2, 0.85, -L);
      }
      // rivers wear their valleys, never below the sea
      if (G > 0 && (RSEG.has(VT[v * 3]) || RSEG.has(VT[v * 3 + 1]) || RSEG.has(VT[v * 3 + 2]))) { q.set(VQ[v * 3], VQ[v * 3 + 1], VQ[v * 3 + 2]); const cut = riverCut(q, [VT[v * 3], VT[v * 3 + 1], VT[v * 3 + 2]].filter(t => t >= 0)); if (cut > 0) G = Math.max(G - cut, Math.min(G, 0.035)); }
      VG[v] = G; LV[v] = L;
      VC[v * 3] = cr / ws; VC[v * 3 + 1] = cg / ws; VC[v * 3 + 2] = cb / ws;
    }
    for (let i = 0; i < T; i++) H[i] = Math.max(0, VG[i]) * HS;
    // normals over the fine land, then the colours: beaches, bare rock on steep slopes, snow on the heights
    VN = new Float32Array(NV * 3);
    const pt = (v, o) => { const r = R + Math.max(VG[v], -0.3) * HS; o[0] = VQ[v * 3] * r; o[1] = VQ[v * 3 + 1] * r; o[2] = VQ[v * 3 + 2] * r; return o; };
    const A = [0, 0, 0], B = [0, 0, 0], C = [0, 0, 0];
    const face = (a, b, c) => {
      pt(a, A); pt(b, B); pt(c, C);
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * A[0] + ny * A[1] + nz * A[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
      for (const u of [a, b, c]) { VN[u * 3] += nx; VN[u * 3 + 1] += ny; VN[u * 3 + 2] += nz; }
    };
    for (let d = 0; d < ND; d++) if (!isWater(DT[d * 3]) || !isWater(DT[d * 3 + 1]) || !isWater(DT[d * 3 + 2])) eachTri(d, SUB, face); // (under the open sea no one sees the ground)
    const sand = new THREE.Color(SAND), rock = new THREE.Color(ROCK), snow = new THREE.Color(SNOW), c = new THREE.Color();
    for (let v = 0; v < NV; v++) {
      const l = Math.hypot(VN[v * 3], VN[v * 3 + 1], VN[v * 3 + 2]) || 1; VN[v * 3] /= l; VN[v * 3 + 1] /= l; VN[v * 3 + 2] /= l;
      const ny = VN[v * 3] * VQ[v * 3] + VN[v * 3 + 1] * VQ[v * 3 + 1] + VN[v * 3 + 2] * VQ[v * 3 + 2], h = VG[v], Lv = LV[v];
      const x = VQ[v * 3] * R / K, y = VQ[v * 3 + 1] * R / K, z = VQ[v * 3 + 2] * R / K;
      c.setRGB(VC[v * 3], VC[v * 3 + 1], VC[v * 3 + 2]);
      c.multiplyScalar(1 + 0.1 * perlin3(x * 0.7, y * 0.7, z * 0.7) + 0.05 * perlin3(x * 2.9, y * 2.9, z * 2.9));
      if (Lv > -0.4 && Lv < 0.55) c.lerp(sand, (1 - smooth(0.1, 0.24, h)) * (1 - smooth(0.25, 0.55, Lv)) * 0.85);
      // (the ball's slopes are half as steep as the flat map's: its thresholds, bent to match)
      if (h > 0.25) c.lerp(rock, smooth(0.959, 0.868, ny) * 0.85);
      c.lerp(snow, smooth(4.35, 4.75, h + 0.55 * perlin3(x * 0.45, y * 0.45, z * 0.45)) * smooth(0.756, 0.928, ny));
      // hillshade, as on the flat map's relief: a low sun from the south-west of each place (north is always up)
      const qx = VQ[v * 3], qy = VQ[v * 3 + 1], qz = VQ[v * 3 + 2], el = Math.hypot(qz, qx) || 1, ex = qz / el, ez = -qx / el;
      const sx = -ez * qy, sy = ez * qx - ex * qz, sz = ex * qy; // south
      const lx = -0.55 * ex + 0.62 * qx + 0.56 * sx, ly = 0.62 * qy + 0.56 * sy, lz = -0.55 * ez + 0.62 * qz + 0.56 * sz, ll = Math.hypot(lx, ly, lz);
      const lit = (VN[v * 3] * lx + VN[v * 3 + 1] * ly + VN[v * 3 + 2] * lz) / ll, f = h > 0 ? clamp(1 + (lit - 0.62 / ll) * 1.6, 0.6, 1.25) : 1;
      VC[v * 3] = c.r * f; VC[v * 3 + 1] = c.g * f; VC[v * 3 + 2] = c.b * f;
    }
  }
  /** Each small triangle of dual d's lattice (`s` steps a side), by its points' shared indices. */
  function eachTri(d, s, fn) {
    for (let j = 0; j < s; j++) for (let i = 0; i + j < s; i++) {
      fn(vid(d, i, j, s), vid(d, i + 1, j, s), vid(d, i, j + 1, s));
      if (i + j < s - 1) fn(vid(d, i + 1, j, s), vid(d, i + 1, j + 1, s), vid(d, i, j + 1, s));
    }
  }

  // ------------------------------------------------------------------ the tiles' paint (one texel a tile)
  const TW = 256;
  let tileTex = new THREE.DataTexture(new Uint8Array(TW * 4), TW, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  let dirTex = new THREE.DataTexture(new Float32Array(TW * 4), TW, 1, THREE.RGBAFormat, THREE.FloatType);
  const palTex = new THREE.DataTexture(new Float32Array(256 * 4), 256, 1, THREE.RGBAFormat, THREE.FloatType);
  for (const t of [tileTex, palTex, dirTex]) { t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; }
  const U = {
    uTiles: { value: tileTex }, uPal: { value: palTex }, uDirs: { value: dirTex }, uHover: { value: -1 }, uPin: { value: -1 }, uSel: { value: -1 },
    uBand: { value: 0.12 }, uTime: { value: 0 }, uDetail: { value: 1 }, uNear: { value: 0 }, uK: { value: 1.4 }, uHS: { value: 0.7 },
    uSkyRefl: { value: new THREE.Color("#3a5366").multiplyScalar(0.55) },
  };
  let selected = -1, pinned = -1, layer = null;
  function paintTiles() {
    if (!ST || !S) return;
    const rows = Math.ceil(T / TW);
    if (tileTex.image.height !== rows) { tileTex.dispose(); tileTex = new THREE.DataTexture(new Uint8Array(TW * rows * 4), TW, rows, THREE.RGBAFormat, THREE.UnsignedByteType); tileTex.magFilter = tileTex.minFilter = THREE.NearestFilter; tileTex.generateMipmaps = false; U.uTiles.value = tileTex; }
    const d = tileTex.image.data, owners = S.owners;
    const atWar = new Set((S.wars || []).flatMap(w => [`${w.a}:${w.b}`, `${w.b}:${w.a}`]));
    const tier = new Map(), fieldT = new Set(), saltT = new Set();
    for (const n of S.nations) {
      if (!n.alive || !n.founded) continue;
      const tiers = new Map((n.provinces || []).map(p => [p.centre, p.tier || 0]));
      for (const c of [n.capital, ...(n.settlements || []).map(s => s.tile)]) if (c >= 0 && owners[c] === n.id) tier.set(c, (tiers.get(c) ?? 0) + 1);
      for (const b of n.buildings || []) if (b.done) { if (b.type === "field") fieldT.add(b.tile); else if (b.type === "salt_pan") saltT.add(b.tile); }
    }
    for (let i = 0; i < T; i++) {
      const o = owners[i], nb = NBS[i];
      let bm = 0, fm = 0;
      if (o >= 0) for (let k = 0; k < nb.length; k++) { const oj = owners[nb[k]]; if (oj === o) continue; if (oj >= 0 && atWar.has(`${o}:${oj}`)) fm |= 1 << k; else bm |= 1 << k; }
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

  // ------------------------------------------------------------------ the land and the sea
  function landMaterial() {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = PAINT_VERTEX(sh.vertexShader);
      sh.fragmentShader = PAINT_GLSL + sh.fragmentShader
        .replace("#include <color_fragment>", `#include <color_fragment>
  {
    // the ground's grain (as on the flat map): broad patches of greener and drier grass, finer mottling up close,
    // sand darkened where the waves wet it
    vec3 q = vPos / uK; float pw0 = length(fwidth(q)), y = (length(vPos) - ${R.toFixed(1)}) / uHS;
    vec3 c = diffuseColor.rgb;
    if (pw0 < 0.6) { // (from afar a pixel holds more than the grain: none is worked out)
      float n1 = vnoise3(q * 0.21), n2 = pw0 < 0.43 ? vnoise3(q * 0.93 + 17.0) : 0.5, green = smoothstep(0.02, 0.09, c.g - max(c.r, c.b)), fade = 1.0 - smoothstep(0.3, 0.6, pw0);
      c *= 1.0 + (n1 - 0.5) * 0.16 * fade + (n2 - 0.5) * 0.12 * (1.0 - smoothstep(0.12, 0.4, pw0 * 0.93));
      c = mix(c, c * vec3(1.1, 1.03, 0.78), green * smoothstep(0.58, 0.82, n1) * 0.55 * fade);
      c = mix(c, c * vec3(0.86, 1.0, 1.03), green * smoothstep(0.42, 0.18, n1) * 0.45 * fade);
    }
    float wet = (1.0 - smoothstep(0.03, 0.1, y)) * step(-0.06, y);
    c = mix(c, c * vec3(0.64, 0.67, 0.7), wet * 0.7);
    if (uDetail > 0.5 && pw0 < 0.1) { float g3 = (vnoise3(q * 3.7) - 0.5) * (1.0 - smoothstep(0.12, 0.4, pw0 * 3.7)), g4 = (vnoise3(q * 11.0) - 0.5) * (1.0 - smoothstep(0.12, 0.4, pw0 * 11.0)); c *= 1.0 + g3 * 0.2 + g4 * 0.14; }
    diffuseColor.rgb = c;
  }
  vec3 hexGlow; diffuseColor.rgb = tilePaint(diffuseColor.rgb, 0.0, hexGlow);`)
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += hexGlow;");
    };
    m.customProgramCacheKey = () => "globe-land2";
    return m;
  }
  function seaMaterial() {
    const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x7d95a4, shininess: 110 });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = "attribute float aDep;\nvarying float vDep;\n" + PAINT_VERTEX(sh.vertexShader).replace("#include <begin_vertex>", "#include <begin_vertex>\n  vDep = aDep;");
      sh.fragmentShader = PAINT_GLSL + "uniform vec3 uSkyRefl;\nvarying float vDep;\n" + sh.fragmentShader
        .replace("#include <color_fragment>", `#include <color_fragment>
  float seaFoam = 0.0;
  {
    // turquoise over the sand, deepening to navy; light dancing on the shallow floor; a line of foam on the
    // shore and waves rolling in to it, broken by noise (the flat map's sea)
    float dep = vDep, t = uTime; vec3 q = vPos / uK; float pw0 = length(fwidth(q)), near = 1.0 - smoothstep(0.05, 0.4, pw0);
    vec3 wc = mix(vec3(0.085, 0.43, 0.44), vec3(0.018, 0.15, 0.25), smoothstep(0.0, 0.75, dep));
    wc = mix(wc, vec3(0.004, 0.035, 0.08), smoothstep(0.75, 2.3, dep));
    if (uDetail > 0.5 && near > 0.0 && dep < 0.45) {
      vec2 cq = vec2(dot(q, vec3(0.8, 0.1, 0.59)), dot(q, vec3(-0.5, 0.7, 0.5))) * 2.3;
      float ca = abs(sin(cq.x + sin(cq.y * 1.3 + t * 0.9))) * abs(sin(cq.y * 1.1 + sin(cq.x * 0.8 - t * 0.7)));
      wc += vec3(0.05, 0.12, 0.1) * pow(1.0 - ca, 6.0) * (1.0 - smoothstep(0.05, 0.45, dep)) * near;
    }
    if (dep < 0.26 && near <= 0.0) seaFoam = (1.0 - smoothstep(0.012, 0.07, dep)) * 0.36;
    else if (dep < 0.26) {
      float nz = vnoise3(q * 3.1 + vec3(t * 0.15, 0.0, -t * 0.1));
      float edge = 1.0 - smoothstep(0.012, 0.05 + nz * 0.05, dep);
      float wv = fract(dep * 5.5 + t * 0.22 + nz * 0.35), line = smoothstep(0.8, 0.95, wv) * (1.0 - smoothstep(0.95, 1.0, wv));
      line *= (1.0 - smoothstep(0.04, 0.24, dep)) * smoothstep(0.3, 0.6, vnoise3(q * 1.7 - t * 0.05)) * near;
      seaFoam = clamp(max(edge * 0.9 * (0.4 + 0.6 * near), line * 0.75), 0.0, 1.0);
    }
    wc = mix(wc, vec3(0.8, 0.88, 0.9), seaFoam);
    diffuseColor.rgb = wc;
  }
  vec3 hexGlow; diffuseColor.rgb = tilePaint(diffuseColor.rgb, 1.0, hexGlow);`)
        .replace("#include <specularmap_fragment>", "float specularStrength = 0.1 + 0.9 * uNear;")
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
  {
    // waves, in the sea's own plane (east and south round the ball)
    vec3 up = normalize(vPos), ex = normalize(cross(vec3(0.0, 1.0, 0.0), up) + vec3(1e-6, 0.0, 0.0)), ez = cross(ex, up);
    vec3 q = vPos / uK; float t = uTime, pw0 = length(fwidth(q)), amp = 0.07 * (1.0 - smoothstep(0.05, 0.4, pw0));
    vec2 g = vec2(cos(dot(q, vec3(1.1, 0.3, 0.2)) + t * 0.9 + sin(dot(q, vec3(0.2, 0.6, -0.3)))) * 0.6 + cos(dot(q, vec3(2.6, -1.9, 0.7)) + t * 1.7) * 0.4,
                  cos(dot(q, vec3(-0.4, 1.3, 0.9)) - t * 0.8 + sin(dot(q, vec3(0.5, -0.2, 0.4)))) * 0.6 + cos(dot(q, vec3(1.4, 3.1, -1.2)) - t * 1.4) * 0.4);
    if (uDetail > 0.5) { float a2 = 1.0 - smoothstep(0.02, 0.1, pw0); g += vec2(cos(dot(q, vec3(6.3, 2.1, 1.0)) + t * 2.6), cos(dot(q, vec3(-2.9, 5.7, 2.0)) - t * 2.2)) * 0.45 * a2; }
    normal = normalize((viewMatrix * vec4(normalize(up - ex * g.x * amp - ez * g.y * amp), 0.0)).xyz);
  }`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
  totalEmissiveRadiance += hexGlow;
  { float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0); totalEmissiveRadiance += uSkyRefl * (0.08 + fr) * (1.0 - seaFoam) * (uDetail * 0.5 + 0.5); }`);
    };
    m.customProgramCacheKey = () => "globe-sea2";
    return m;
  }

  /** The meshes of a list of duals, `s` steps a side, grouped (land: the ground lifted; sea: flat at the sea's level). */
  function groundGeometry(duals, s, sea) {
    const nv = (s + 1) * (s + 2) / 2, nt = s * s, n = duals.length;
    const PA = new Float32Array(n * nv * 3), NA = new Float32Array(n * nv * 3), BA = new Float32Array(n * nv * 2), TA = new Float32Array(n * nv * 3), SA = new Float32Array(n * nv * 3);
    const CA = sea ? null : new Float32Array(n * nv * 3), DA = sea ? new Float32Array(n * nv) : null, IX = new Uint32Array(n * nt * 3);
    let v = 0, ix = 0;
    const loc = new Map();
    duals.forEach(d => {
      const A = DT[d * 3], B = DT[d * 3 + 1], C = DT[d * 3 + 2], base = v;
      loc.clear();
      for (let j = 0; j <= s; j++) for (let i = 0; i + j <= s; i++) {
        const u = vid(d, i, j, s), wb = i / s, wc = j / s, wa = 1 - wb - wc;
        if (sea) { for (let c = 0; c < 3; c++) { PA[v * 3 + c] = (P[A * 3 + c] * wa + P[B * 3 + c] * wb + P[C * 3 + c] * wc) * R; } const l = Math.hypot(PA[v * 3], PA[v * 3 + 1], PA[v * 3 + 2]); NA[v * 3] = PA[v * 3] / l; NA[v * 3 + 1] = PA[v * 3 + 1] / l; NA[v * 3 + 2] = PA[v * 3 + 2] / l; DA[v] = Math.max(0, -VG[u]); }
        else { const r = R + VG[u] * HS; PA[v * 3] = VQ[u * 3] * r; PA[v * 3 + 1] = VQ[u * 3 + 1] * r; PA[v * 3 + 2] = VQ[u * 3 + 2] * r; NA[v * 3] = VN[u * 3]; NA[v * 3 + 1] = VN[u * 3 + 1]; NA[v * 3 + 2] = VN[u * 3 + 2]; CA[v * 3] = VC[u * 3]; CA[v * 3 + 1] = VC[u * 3 + 1]; CA[v * 3 + 2] = VC[u * 3 + 2]; }
        BA[v * 2] = wb; BA[v * 2 + 1] = wc;
        TA[v * 3] = A; TA[v * 3 + 1] = B; TA[v * 3 + 2] = C; SA[v * 3] = SIDE[d * 3]; SA[v * 3 + 1] = SIDE[d * 3 + 1]; SA[v * 3 + 2] = SIDE[d * 3 + 2];
        loc.set(i * 64 + j, v); v++;
      }
      for (let j = 0; j < s; j++) for (let i = 0; i + j < s; i++) {
        const a = loc.get(i * 64 + j), b = loc.get((i + 1) * 64 + j), c = loc.get(i * 64 + j + 1);
        IX[ix++] = a; IX[ix++] = b; IX[ix++] = c;
        if (i + j < s - 1) { IX[ix++] = b; IX[ix++] = loc.get((i + 1) * 64 + j + 1); IX[ix++] = c; }
      }
      void base;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(PA, 3)); g.setAttribute("normal", new THREE.BufferAttribute(NA, 3));
    if (CA) g.setAttribute("color", new THREE.BufferAttribute(CA, 3)); else g.setAttribute("aDep", new THREE.BufferAttribute(DA, 1));
    g.setAttribute("aBw", new THREE.BufferAttribute(BA, 2)); g.setAttribute("aTl", new THREE.BufferAttribute(TA, 3)); g.setAttribute("aSd", new THREE.BufferAttribute(SA, 3));
    g.setIndex(new THREE.BufferAttribute(IX, 1));
    g.computeBoundingSphere();
    return g;
  }

  let world = null, chunks = [], farLand = null, farSea = null;
  function buildWorld() {
    if (world) { scene.remove(world); disposeTree(world); }
    world = new THREE.Group(); scene.add(world);
    const t0 = performance.now();
    buildShape();
    U.uK.value = K; U.uHS.value = HS;
    // the tiles' directions, for the shader's local frames
    const rows = Math.ceil(T / TW);
    dirTex.dispose(); dirTex = new THREE.DataTexture(new Float32Array(TW * rows * 4), TW, rows, THREE.RGBAFormat, THREE.FloatType);
    dirTex.magFilter = dirTex.minFilter = THREE.NearestFilter; dirTex.generateMipmaps = false;
    for (let i = 0; i < T; i++) dirTex.image.data.set([P[i * 3], P[i * 3 + 1], P[i * 3 + 2], 1], i * 4);
    dirTex.needsUpdate = true; U.uDirs.value = dirTex;
    // which duals are land (any of their tiles is) and which are sea, which sea lies by a shore
    const landD = [], seaFine = [], seaOpen = [], seaAll = [], byChunk = Array.from({ length: NCH }, () => ({ land: [], sea: [], open: [] }));
    const dist = new Int16Array(T).fill(99); { const qq = []; for (let i = 0; i < T; i++) if (!isWater(i)) { dist[i] = 0; qq.push(i); } for (let k = 0; k < qq.length; k++) for (const j of NBS[qq[k]]) if (dist[j] > dist[qq[k]] + 1) { dist[j] = dist[qq[k]] + 1; qq.push(j); } }
    for (let d = 0; d < ND; d++) {
      const A = DT[d * 3], B = DT[d * 3 + 1], C = DT[d * 3 + 2], ch = byChunk[CHUNK[A]];
      const land = !isWater(A) || !isWater(B) || !isWater(C), wet = isWater(A) || isWater(B) || isWater(C);
      if (land) { landD.push(d); ch.land.push(d); }
      if (wet) { seaAll.push(d); if (Math.min(dist[A], dist[B], dist[C]) <= 1) { seaFine.push(d); ch.sea.push(d); } else { seaOpen.push(d); ch.open.push(d); } }
    }
    const landMat = landMaterial(), seaMat = seaMaterial();
    chunks = new Array(NCH).fill(null);
    byChunk.forEach((c, k) => {
      const meshes = [];
      if (c.land.length) meshes.push(new THREE.Mesh(groundGeometry(c.land, SUB, false), landMat));
      if (c.sea.length) meshes.push(new THREE.Mesh(groundGeometry(c.sea, SUB, true), seaMat));
      if (c.open.length) meshes.push(new THREE.Mesh(groundGeometry(c.open, 1, true), seaMat));
      if (!meshes.length) return;
      // the piece's middle and how far round the ball it reaches
      const mid = new THREE.Vector3(); let n = 0;
      for (const list of [c.land, c.sea, c.open]) for (const d of list) { mid.x += P[DT[d * 3] * 3]; mid.y += P[DT[d * 3] * 3 + 1]; mid.z += P[DT[d * 3] * 3 + 2]; n++; }
      mid.normalize(); let ang = 0;
      for (const list of [c.land, c.sea, c.open]) for (const d of list) for (let q = 0; q < 3; q++) { const t = DT[d * 3 + q]; ang = Math.max(ang, Math.acos(clamp(mid.x * P[t * 3] + mid.y * P[t * 3 + 1] + mid.z * P[t * 3 + 2], -1, 1))); }
      for (const m of meshes) world.add(m);
      chunks[k] = { meshes, mid, ang: ang + 0.02 };
    });
    farLand = new THREE.Mesh(groundGeometry(landD, 1, false), landMat); world.add(farLand);
    farSea = new THREE.Mesh(groundGeometry(seaAll, 1, true), seaMat); world.add(farSea);
    // the far land's normals: of its own (coarser) triangles
    { const g = farLand.geometry, pa = g.attributes.position.array, na = g.attributes.normal.array, ix = g.index.array, acc = new Float32Array(T * 3), ta = g.attributes.aTl.array;
      const tileOf = v => { const wb = g.attributes.aBw.array[v * 2], wc = g.attributes.aBw.array[v * 2 + 1]; return ta[v * 3 + (wb > 0.5 ? 1 : wc > 0.5 ? 2 : 0)]; };
      for (let k = 0; k < ix.length; k += 3) { const a = ix[k] * 3, b = ix[k + 1] * 3, c = ix[k + 2] * 3; const ux = pa[b] - pa[a], uy = pa[b + 1] - pa[a + 1], uz = pa[b + 2] - pa[a + 2], vx = pa[c] - pa[a], vy = pa[c + 1] - pa[a + 1], vz = pa[c + 2] - pa[a + 2]; let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; if (nx * pa[a] + ny * pa[a + 1] + nz * pa[a + 2] < 0) { nx = -nx; ny = -ny; nz = -nz; } for (const v of [ix[k], ix[k + 1], ix[k + 2]]) { const t = tileOf(v); acc[t * 3] += nx; acc[t * 3 + 1] += ny; acc[t * 3 + 2] += nz; } }
      for (let v = 0; v < pa.length / 3; v++) { const t = tileOf(v), l = Math.hypot(acc[t * 3], acc[t * 3 + 1], acc[t * 3 + 2]) || 1; na[v * 3] = acc[t * 3] / l; na[v * 3 + 1] = acc[t * 3 + 1] / l; na[v * 3 + 2] = acc[t * 3 + 2] / l; } }
    buildRiverRibbons();
    atmosphere(); need = true;
    console.info(`[3D] globe: ${T} tiles, ${ND} duals, ${NV} points, ${chunks.length} pieces, built in ${Math.round(performance.now() - t0)} ms`);
  }

  /** Rivers: a flowing ribbon down each valley (the flat map's water), widening towards the sea. */
  let rivers = null;
  function buildRiverRibbons() {
    const RP = [], RF = [], RI = [], q = new THREE.Vector3(), sd = new THREE.Vector3(), tg = new THREE.Vector3(), e = new THREE.Vector3();
    for (const pts of riverPaths) {
      // samples every 0.2 of the tiles' units
      const samples = []; let len = 0;
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1], L = a.distanceTo(b) * R / K, n = Math.max(1, Math.ceil(L / 0.2));
        for (let s = 0; s < n; s++) samples.push([a.clone().lerp(b, s / n).normalize(), len + L * s / n]);
        len += L;
      }
      samples.push([pts.at(-1).clone(), len]);
      let hint = nearestTile(samples[0][0]);
      const mouth = samples.findIndex(([p], k) => k > 1 && groundAt(p, hint) < -0.03 * HSC);
      if (mouth > 1) samples.length = mouth;
      const base0 = RP.length / 3;
      samples.forEach(([p, l], s) => {
        const nx = samples[Math.min(s + 1, samples.length - 1)][0], pv = samples[Math.max(s - 1, 0)][0];
        tg.subVectors(nx, pv); sd.crossVectors(tg, p).normalize();
        const w = (0.1 + 0.14 * l / Math.max(1, len)) * K, yc = groundAt(p, hint) + 0.02;
        hint = lastGround;
        const side = sgn => { e.copy(p).multiplyScalar(R).addScaledVector(sd, w * sgn).normalize(); const y = Math.max(yc, groundAt(e, hint) + 0.012); e.multiplyScalar(R + y * K); RP.push(e.x, e.y, e.z); };
        side(1); side(-1);
        RF.push(l, 0, l, 1);
        if (s) { const a = base0 + (s - 1) * 2; RI.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      });
    }
    if (rivers) { world.remove(rivers); rivers.geometry.dispose(); }
    rivers = null;
    if (!RP.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(RP, 3)); g.setAttribute("flow", new THREE.Float32BufferAttribute(RF, 2)); g.setIndex(RI); g.computeVertexNormals();
    rivers = new THREE.Mesh(g, riverMaterial(U)); rivers.material.side = THREE.DoubleSide;
    rivers.material.polygonOffset = true; rivers.material.polygonOffsetFactor = -1; rivers.material.polygonOffsetUnits = -2;
    world.add(rivers);
  }

  // the air round the world, the clouds (Đẹp), the stars
  let air = null, clouds = null;
  function atmosphere() {
    if (air) { scene.remove(air); disposeTree(air); }
    air = new THREE.Group(); scene.add(air);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(R * 1.1, 96, 48), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: "varying vec3 vN; varying vec3 vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
      // seen from inside, the far side of a shell round the globe: brightest at the globe's rim, fading out to the shell's
      fragmentShader: "varying vec3 vN; varying vec3 vV; void main() { float r = -dot(vN, vV); float a = pow(smoothstep(0.0, 0.42, r), 2.2); gl_FragColor = vec4(vec3(0.3, 0.58, 1.0) * a * 0.85, 1.0);\n#include <colorspace_fragment>\n}",
    }));
    glow.renderOrder = 2; air.add(glow);
    clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.04, 128, 64), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uTime: U.uTime, uFade: { value: 1 } },
      vertexShader: "varying vec3 vP; varying vec3 vN; void main() { vP = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform float uTime, uFade; varying vec3 vP; varying vec3 vN;\n${NOISE3_GLSL}
        void main() {
          vec3 q = normalize(vP) * 6.0 + vec3(uTime * 0.006, 0.0, uTime * 0.004);
          float n = vnoise3(q) * 0.55 + vnoise3(q * 2.3 + 4.1) * 0.3 + vnoise3(q * 5.1 - 2.3) * 0.15;
          float a = smoothstep(0.56, 0.8, n) * 0.48 * uFade;
          float lit = 0.6 + 0.4 * clamp(dot(vN, normalize(vec3(-0.6, 0.6, 0.5))), 0.0, 1.0);
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(lit), a);
          #include <colorspace_fragment>
        }`,
    }));
    clouds.renderOrder = 3; air.add(clouds);
    const NS = 2600, sp = new Float32Array(NS * 3), ss = new Float32Array(NS);
    for (let k = 0; k < NS; k++) { const u = hash(k, 1) * 2 - 1, a = hash(k, 2) * Math.PI * 2, s = Math.sqrt(1 - u * u); sp.set([Math.cos(a) * s * 1500, u * 1500, Math.sin(a) * s * 1500], k * 3); ss[k] = 0.6 + Math.pow(hash(k, 3), 6) * 2.4; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3)); sg.setAttribute("aSize", new THREE.BufferAttribute(ss, 1));
    const stars = new THREE.Points(sg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uPx: { value: 1 } },
      vertexShader: "attribute float aSize; uniform float uPx; varying float vA; void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.99999; gl_PointSize = aSize * uPx; vA = clamp(aSize / 2.0, 0.25, 1.0); }",
      fragmentShader: "varying float vA; void main() { vec2 d = gl_PointCoord - 0.5; float a = (1.0 - smoothstep(0.1, 0.5, length(d))) * vA; gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a, a); }",
    }));
    stars.frustumCulled = false; stars.renderOrder = -5; air.add(stars); air.userData.stars = stars;
  }

  // ------------------------------------------------------------------ a tile's own flat frame (the shared layout's), carried onto the ball
  const F = { tile: -1, c: new THREE.Vector3(), e: new THREE.Vector3(), n: new THREE.Vector3() };
  function anchor(i) {
    if (F.tile === i) return;
    F.tile = i; dirOf(i, F.c);
    F.e.crossVectors(Y, F.c); if (F.e.lengthSq() < 1e-10) F.e.set(1, 0, 0); F.e.normalize(); F.n.crossVectors(F.c, F.e);
  }
  /** A point (x, z) of the frame: its direction on the ball. */
  function toDir(x, z, out = new THREE.Vector3()) { return out.copy(F.c).multiplyScalar(R).addScaledVector(F.e, x * K).addScaledVector(F.n, -z * K).normalize(); }
  const tpos = new THREE.Vector3(), tq1 = new THREE.Vector3();
  function posOf(j) {
    if (j === F.tile) return [0, 0];
    dirOf(j, tpos); const d = tpos.dot(F.c) || 1e-6; tpos.multiplyScalar(R / d).addScaledVector(F.c, -R);
    return [tpos.dot(F.e) / K, -tpos.dot(F.n) / K];
  }
  const surfL = (x, z) => groundAt(toDir(x, z, tq1), F.tile);
  /** The env the shared layout works through (web/map3d-shared.js). */
  function env(extra) {
    return Object.assign({
      K, S, hooks, count: T, nbs: i => NBS[i], isWater, anchor, pos: posOf, surf: surfL, ground: (x, z) => Math.max(0, surfL(x, z)),
      riverAt: (x, z) => { const q = toDir(x, z, tq1); if (!RSEG.size) return 0; const t = nearestTile(q, F.tile); return riverCut(q, [t]); },
      top: i => H[i] / K,
      dist: (a, b) => Math.acos(clamp(P[a * 3] * P[b * 3] + P[a * 3 + 1] * P[b * 3 + 1] + P[a * 3 + 2] * P[b * 3 + 2], -1, 1)),
      riverAcross: i => {
        const L = RSEG.get(i), c = dirOf(i);
        let best = null, bd = Infinity;
        for (let k = 0; L && k < L.length; k += 6) {
          const a = new THREE.Vector3(L[k], L[k + 1], L[k + 2]), b = new THREE.Vector3(L[k + 3], L[k + 4], L[k + 5]), ab = b.clone().sub(a), s = clamp(c.clone().sub(a).dot(ab) / (ab.lengthSq() || 1e-12), 0, 1), p = a.clone().addScaledVector(ab, s), d = p.distanceTo(c) * R / K;
          if (d < bd) { bd = d; best = [p, ab]; }
        }
        if (!best || bd > 1.2) return [0, 0, 1, 0];
        const [p, ab] = best, dp = p.clone().multiplyScalar(R / p.dot(F.c)).addScaledVector(F.c, -R), px = dp.dot(F.e) / K, pz = -dp.dot(F.n) / K, dx = ab.dot(F.e), dz = -ab.dot(F.n), L2 = Math.hypot(dx, dz) || 1;
        return [px, pz, -dz / L2, dx / L2];
      },
      world: (x, y, z) => { const q = toDir(x, z, tq1); return [q.x * (R + y * K), q.y * (R + y * K), q.z * (R + y * K)]; },
      worldDir: (x, z) => [(F.e.x * x - F.n.x * z) * K, (F.e.y * x - F.n.y * z) * K, (F.e.z * x - F.n.z * z) * K],
      up: A => { const l = Math.hypot(A[0], A[1], A[2]) || 1; return [A[0] / l, A[1] / l, A[2] / l]; },
    }, extra);
  }
  /** A copy's matrix (column by column into `o` at `k`): standing at direction q, `r` from the centre, turned `ry`
   *  about its up from east, sx × sy × sz in the tiles' units. */
  function place(o, k, q, r, sx, sy, sz, ry) {
    let ex = q.z, ez = -q.x; const l = Math.hypot(ex, ez); if (l < 1e-9) { ex = 1; ez = 0; } else { ex /= l; ez /= l; }
    // south = east × up
    const s0 = -ez * q.y, s1 = ez * q.x - ex * q.z, s2 = ex * q.y, c = Math.cos(ry), sn = Math.sin(ry);
    const X0 = ex * c - s0 * sn, X1 = -s1 * sn, X2 = ez * c - s2 * sn, Z0 = ex * sn + s0 * c, Z1 = s1 * c, Z2 = ez * sn + s2 * c;
    sx *= K; sy *= K; sz *= K;
    o[k] = X0 * sx; o[k + 1] = X1 * sx; o[k + 2] = X2 * sx; o[k + 3] = 0;
    o[k + 4] = q.x * sy; o[k + 5] = q.y * sy; o[k + 6] = q.z * sy; o[k + 7] = 0;
    o[k + 8] = Z0 * sz; o[k + 9] = Z1 * sz; o[k + 10] = Z2 * sz; o[k + 11] = 0;
    o[k + 12] = q.x * r; o[k + 13] = q.y * r; o[k + 14] = q.z * r; o[k + 15] = 1;
  }

  // ------------------------------------------------------------------ what stands on the ground: kept per kind, drawn only near the eye
  const GEO = {};
  const geo = k => (GEO[k] ??= SHAPES[k]());
  const hasModel = k => !!GEO["m:" + k];
  const MMAT = {};
  function modelMat(kind) { // "plain", "lit" (lit windows), "sway" (trees), "soft" (plants seen from both sides)
    if (!MMAT[kind]) { const m = MMAT[kind] = modelMaterial(U, { sway: kind === "sway" || kind === "soft", lit: kind === "lit", side: kind === "soft" ? THREE.DoubleSide : THREE.FrontSide, key: "g" }); m.userData.keep = true; }
    return MMAT[kind];
  }
  const MAT = {};
  function shapeMat(kind) {
    if (!MAT[kind]) {
      let m;
      if (kind === "glow") m = new THREE.MeshStandardMaterial({ emissive: 0x8a5a00, emissiveIntensity: 2.4, roughness: 0.35, metalness: 0.4 });
      else if (kind === "sway") { m = new THREE.MeshLambertMaterial({ flatShading: true }); m.onBeforeCompile = sh => { sh.uniforms.uTime = U.uTime; sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
  #ifdef USE_INSTANCING
  { vec3 ip = instanceMatrix[3].xyz; float sw = sin(uTime * 1.4 + ip.x * 0.7 + ip.z * 0.45) + 0.45 * sin(uTime * 2.9 + ip.y * 1.9 - ip.z * 1.3);
    float k = transformed.y * transformed.y; transformed.x += sw * 0.05 * k; transformed.z += sw * 0.03 * k; }
  #endif`); }; m.customProgramCacheKey = () => "gsway"; }
      else m = new THREE.MeshLambertMaterial({ flatShading: true });
      m.userData.keep = true; MAT[kind] = m;
    }
    return MAT[kind];
  }
  /** Copies of many kinds, each drawn by one instanced mesh holding only the copies near enough to the eye.
   *  A kind's `mode`: "near" (seen within reach.near × its own share), "model" (a wood's model, within reach.model),
   *  "far" (the model's plain stand-in, from where the model ends to reach.far). */
  class Pool {
    constructor() { this.kinds = new Map(); this.group = new THREE.Group(); this.n = 0; }
    kind(key, mode, geometry, material) {
      let k = this.kinds.get(key);
      if (!k) this.kinds.set(key, k = { key, mode, geometry, material, M: [], C: [], X: [], RK: [], TL: [], OF: [] });
      return k;
    }
    push(k, q, r, sx, sy, sz, ry, color, rk = 1, tile = -1, off = 0) {
      const at = k.M.length; k.M.length += 16; place(k.M, at, q, r, sx, sy, sz, ry);
      tmpC.set(color); k.C.push(tmpC.r, tmpC.g, tmpC.b); k.X.push(q.x * r, q.y * r, q.z * r); k.RK.push(rk); k.TL.push(tile); k.OF.push(off);
    }
    finish() {
      for (const k of this.kinds.values()) {
        const n = k.RK.length; if (!n) continue;
        k.M = Float32Array.from(k.M); k.C = Float32Array.from(k.C); k.X = Float32Array.from(k.X); k.RK = Float32Array.from(k.RK); k.TL = Int32Array.from(k.TL); k.OF = Float32Array.from(k.OF); k.cut = new Uint8Array(n);
        const m = k.m = new THREE.InstancedMesh(k.geometry, k.material, n); m.count = 0; m.frustumCulled = false;
        m.setColorAt(0, tmpC.set(0xffffff)); this.group.add(m); this.n += n;
      }
    }
    /** Woods give way to towns, works and roads: copies on a cleared tile within its radius are left out. */
    clear(cleared) { for (const k of this.kinds.values()) if (k.cut) for (let i = 0; i < k.cut.length; i++) { const r = cleared.get(k.TL[i]); k.cut[i] = r !== undefined && k.OF[i] < r ? 1 : 0; } }
    refill(cam, fwd, reach, cone) {
      const cx = cam.x, cy = cam.y, cz = cam.z, rr = cx * cx + cy * cy + cz * cz;
      let drawn = 0;
      for (const k of this.kinds.values()) {
        const m = k.m; if (!m) continue;
        const a = m.instanceMatrix.array, c = m.instanceColor.array, M = k.M, C = k.C, X = k.X, n = k.RK.length;
        const base = k.mode === "model" ? reach.model : k.mode === "far" ? reach.model : reach.near, far = k.mode === "far" ? reach.far : 0;
        let j = 0;
        if ((k.mode === "far" ? far : base) > 0) for (let i = 0; i < n; i++) {
          if (k.cut[i]) continue;
          const x = X[i * 3], y = X[i * 3 + 1], z = X[i * 3 + 2], dx = x - cx, dy = y - cy, dz = z - cz, d2 = dx * dx + dy * dy + dz * dz;
          const lim = base * k.RK[i];
          if (k.mode === "far" ? (d2 < lim * lim || d2 > far * far) : d2 > lim * lim) continue;
          if (x * cx + y * cy + z * cz < R * R * 0.998 && rr > 0) continue; // behind the ball
          if (d2 > 9 && dx * fwd.x + dy * fwd.y + dz * fwd.z < Math.sqrt(d2) * cone) continue; // out of the view
          a.set(M.subarray(i * 16, i * 16 + 16), j * 16); c[j * 3] = C[i * 3]; c[j * 3 + 1] = C[i * 3 + 1]; c[j * 3 + 2] = C[i * 3 + 2]; j++;
        }
        m.count = j; drawn += j;
        if (j) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
      }
      return drawn;
    }
  }
  const tmpC = new THREE.Color(), tq = new THREE.Vector3();
  /** How far a copy is seen, by its size: a plank goes before a house. */
  const share = (sx, sy, sz) => { const s = Math.max(sx, sy, sz); return s < 0.08 ? 0.45 : s < 0.2 ? 0.75 : 1; };
  /** The shared layout's batch of shapes (P.add, P.model), into a pool, in the current tile's frame. */
  function partsFor(pool) {
    return {
      add(shape, x, y, z, sx, sy, sz, ry, color, glow = false) {
        const k = pool.kind(shape + (glow ? "*" : ""), "near", geo(shape), shapeMat(glow ? "glow" : "plain"));
        toDir(x, z, tq); pool.push(k, tq, R + y * K, sx, sy, sz, ry, color, share(sx, sy, sz));
      },
      model(name, x, y, z, w, h, d, ry, color, lit = false, fallback = null) {
        const key = "m:" + name, sz = GEO[key]?.userData.size;
        if (!sz) { fallback?.(); return false; }
        const k = pool.kind(key + (lit ? "~" : ""), "near", GEO[key], modelMat(lit ? "lit" : "plain"));
        toDir(x, z, tq); pool.push(k, tq, R + y * K, w / sz.x, h, d / sz.z, ry, color, share(w, h, d)); return true;
      },
    };
  }
  /** Triangles laid in the current tile's frame (roads, rails, airstrips), kept by piece of the ground. */
  class GTris {
    constructor() { this.parts = new Map(); }
    tri(a, b, c, col) {
      let t = this.parts.get(CHUNK[F.tile]); if (!t) this.parts.set(CHUNK[F.tile], t = new Tris());
      for (const v of [a, b, c]) { toDir(v[0], v[2], tq); const r = R + v[1] * K; t.p.push(tq.x * r, tq.y * r, tq.z * r); t.c.push(col.r, col.g, col.b); }
    }
    quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
    meshes(material) { const out = []; for (const [ch, t] of this.parts) { const m = new THREE.Mesh(t.geometry(), material); m.userData.chunk = ch; out.push(m); } return out; }
  }

  // ------------------------------------------------------------------ the woods and the wild (web/map3d-shared.js decides what grows where)
  let decor = null, decorPool = null;
  function buildDecor() {
    if (decor) { scene.remove(decor); disposeTree(decor); }
    decor = new THREE.Group(); scene.add(decor);
    const pool = decorPool = new Pool(), lite = quality === "lo", models = !!GEO["m:oak"];
    const put = (key, mode, g, mat, i, x, z, sx, sy, sz, ry, color, sink, rk) => {
      const k = pool.kind(key, mode, g, mat); toDir(x, z, tq);
      pool.push(k, tq, R + (groundAt(tq, i) - sink) * K, sx, sy, sz, ry, color, rk, i, Math.hypot(x, z));
    };
    const D = {
      nTree: lite ? 5 : 7,
      spot: (i, j, rmax = 0.82) => { anchor(i); const a = hash(i, j, 3) * 6.283, d = Math.sqrt(hash(j, i, 9)) * rmax; return [Math.cos(a) * d, Math.sin(a) * d]; },
      tree(kind, i, j, x, z, s, color, dense) {
        if (riverAtL(x, z, i) > 0.07) return;
        const V = WOODS[kind], list = (lite ? V.lo : V.hi).filter(hasModel), rk = dense ? 0.7 : 1, ry = hash(j, i, 5) * 6.283;
        if (list.length) { const name = list[Math.floor(hash(i, j, 29) * list.length)], h = s * V.h; put("m:" + name, "model", GEO["m:" + name], modelMat("sway"), i, x, z, h * V.w, h, h * V.w, ry, color, 0.02, rk); }
        // the plain stand-in, from where the models end (or everywhere until they are in)
        const crown = kind === "conifer" ? ["conifer", s * 0.85, s * 2.3] : kind === "palm" ? ["palm", s, s * 1.7] : ["broad", s, s * 1.2];
        put(crown[0] + "^", "far", geo(crown[0]), shapeMat("sway"), i, x, z, crown[1], crown[2], crown[1], ry, color, 0.03, list.length ? rk : 0);
      },
      thing(names, shape, i, j, x, z, w, h, color) {
        if (riverAtL(x, z, i) > 0.07) return;
        const list = names.filter(hasModel), ry = hash(i, j, 5) * 6.283, still = shape === "rock" || names[0].startsWith("cactus"), rk = shape === "rock" && w > 0.25 ? 1 : 0.6;
        if (list.length) { const name = list[Math.floor(hash(j, i, 27) * list.length)], sz = GEO["m:" + name].userData.size, k = w / Math.max(sz.x, sz.z); put("m:" + name, "model", GEO["m:" + name], modelMat(names[0] === "bush" || names[0] === "reed" ? "soft" : still ? "plain" : "sway"), i, x, z, k, h, k, ry, color, 0.02, rk); }
        else put(shape, "model", geo(shape), shapeMat("plain"), i, x, z, w, h, w, ry, color, 0.03, rk);
      },
    };
    for (let i = 0; i < T; i++) decorTile(D, i, ST.terrain[i]);
    // wonders shine; rich seams show as small crystals in their colour
    const P2 = partsFor(pool);
    for (const w of ST.wonders || []) { anchor(w.i); pool.push(pool.kind("gem*", "near", geo("gem"), shapeMat("glow")), dirOf(w.i, tq), R + H[w.i] + 0.4 * K, 0.45, 0.7, 0.45, 0, "#ffd84a", 3); }
    for (const v of ST.veins || []) { anchor(v.i); const x = -0.45, z = 0.35; P2.add("gem", x, Math.max(0, surfL(x, z)) - 0.02, z, 0.2, 0.3, 0.2, 0, hooks.veinColor?.[v.good] || "#d9822b"); }
    pool.finish(); decor.add(pool.group);
    for (const w of ST.wonders || []) addLabel(decor, w.i, `★ ${w.name}`, "wonder", 1.3);
    if (dynCleared) pool.clear(dynCleared);
    lod.at = 0; lod.pending = true; need = true;
  }
  const riverAtL = (x, z, i) => { if (!RSEG.size) return 0; anchor(i); const q = toDir(x, z, tq1); return riverCut(q, [nearestTile(q, i)]); };

  // ------------------------------------------------------------------ what changes each turn: roads, towns, works, flags (web/map3d-shared.js lays them out)
  let dyn = null, dynPool = null, dynCleared = null;
  const flagTex = new Map();
  function flagTexture(flag) {
    const key = JSON.stringify(flag);
    if (!flagTex.has(key)) { const c = document.createElement("canvas"); c.width = 96; c.height = 64; hooks.drawFlag(c.getContext("2d"), 0, 0, 96, 64, flag, 1); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; flagTex.set(key, t); }
    return flagTex.get(key);
  }
  const flags = [];
  let roadMeshes = [];
  const LIFE = { uTime: U.uTime, uScale: { value: 400 }, uNear: { value: 1 } };
  const life = [];
  function buildDynamic() {
    if (dyn) { scene.remove(dyn); disposeTree(dyn, true); }
    dyn = new THREE.Group(); scene.add(dyn); flags.length = 0; life.length = 0;
    const chimneys = [], plantSmoke = [], AR = new GTris(), Rd = new GTris(), cleared = new Map(), clear = (i, r) => cleared.set(i, Math.max(cleared.get(i) ?? 0, r));
    const E = env({
      clear, label: (i, text, kind, dy) => addLabel(dyn, i, text, kind, dy * 0.9),
      chimney: (x, y, z) => chimneys.push(...E.world(x, y, z)), plant: (x, y, z) => plantSmoke.push(...E.world(x, y, z)),
      flag: (n, x, y, z) => flags.push(makeFlag(n, x, y, z)),
    });
    // roads and railways, then the towns, their works, the camps and the power lines
    layRoads(E, Rd);
    const pool = dynPool = new Pool(), Pp = partsFor(pool);
    layTowns(E, Pp, AR);
    const { wire, glow } = powerGrid(E, Pp);
    const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    roadMeshes = [...Rd.meshes(flatMat), ...AR.meshes(flatMat)];
    for (const m of roadMeshes) dyn.add(m);
    if (wire.length) { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(wire, 3)); const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x24272b, transparent: true, opacity: 0.9 })); l.userData.near = true; dyn.add(l); }
    if (glow.length) dyn.add(townGlow(LIFE, glow, K));
    airLinks();
    pool.finish(); dyn.add(pool.group);
    if (chimneys.length) { const m = smokeWisps(LIFE, chimneys, { globe: true, k: K }); life.push(m); dyn.add(m); }
    if (plantSmoke.length) { const m = smokeWisps(LIFE, plantSmoke, { col: "0.6, 0.59, 0.57", big: 1.8, alpha: 0.55, globe: true, k: K }); life.push(m); dyn.add(m); }
    for (const f of flags) dyn.add(f.group);
    dyn.add(gulls());
    dynCleared = cleared; decorPool?.clear(cleared);
    // names: a banner over each capital and town, as on the flat map
    const owners = S.owners;
    for (const n of S.nations) {
      if (!n.alive || !n.founded || n.capital < 0) continue;
      const col = hooks.nationColor(n.id), prov = new Map((n.provinces || []).map(p => [p.centre, p]));
      const cp = prov.get(n.capital);
      addBanner(dyn, n.capital, n.name, "capital", 2.2, col, n.population, cp?.tier ?? 0, cp?.tierName, n.capitalName || "");
      for (const s of n.settlements || []) if (owners[s.tile] === n.id) { const p = prov.get(s.tile); addBanner(dyn, s.tile, s.name, "town", 1.2, col, p?.people, p?.tier ?? 0, p?.tierName); }
    }
    lod.at = 0; lod.pending = true; need = true;
  }
  /** §7.3b A nation's open airports joined by faint dashed arcs over the ball. */
  function airLinks() {
    for (const n of S.nations) {
      const open = (n.alive && n.founded && n.air?.open_tiles) || [];
      for (let k = 1; k < open.length; k++) {
        const a = dirOf(open[0]), b = dirOf(open[k]), ang = a.angleTo(b), pts = [];
        for (let q = 0; q <= 32; q++) { const t = q / 32, p = slerp(a, b, t, new THREE.Vector3()); pts.push(p.multiplyScalar(R + 0.8 + Math.sin(Math.PI * t) * (1.5 + ang * R * 0.12))); }
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: hooks.nationColor(n.id), dashSize: 0.6, gapSize: 0.45, transparent: true, opacity: 0.55 }));
        line.computeLineDistances(); dyn.add(line);
      }
    }
  }
  const slerp = (a, b, t, out) => { const ang = a.angleTo(b); if (ang < 1e-6) return out.copy(a); const s = Math.sin(ang); return out.copy(a).multiplyScalar(Math.sin((1 - t) * ang) / s).addScaledVector(b, Math.sin(t * ang) / s); };
  function makeFlag(n, x, y, z) {
    const g = new THREE.Group(), q = toDir(x, z), m = new THREE.Matrix4();
    place(m.elements, 0, q, R + y * K, 1, 1, 1, 0); m.decompose(g.position, g.quaternion, g.scale);
    const pole = new THREE.Mesh(geo("cyl"), new THREE.MeshLambertMaterial({ color: 0x4b3a2a })); pole.scale.set(0.035, 0.85, 0.035); g.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28, 8, 1).translate(0.21, 0, 0), new THREE.MeshLambertMaterial({ map: flagTexture(n.flag), side: THREE.DoubleSide }));
    cloth.position.set(0, 0.7, 0); g.add(cloth); g.userData.near = true;
    return { group: g, cloth, base: cloth.geometry.attributes.position.array.slice(), phase: hash(n.id, 9) * 6 };
  }
  /** Gulls circling over the ports, and here and there along the shores. */
  function gulls() {
    const spots = [], seen = new Set();
    const add = i => { if (seen.has(i)) return; seen.add(i); const p = dirOf(i).multiplyScalar(R); spots.push(p.x, p.y, p.z, i); };
    for (const n of S.nations) if (n.alive && n.founded) for (const b of n.buildings || []) if (b.done && (b.type === "pier" || b.type === "harbor" || b.type === "fish_dock")) { const sea = NBS[b.tile].find(j => isWater(j)); if (sea !== undefined) add(sea); }
    for (let i = 0; i < T && spots.length < 260 * 4; i++) if (ST.terrain[i] === "shallow" && hash(i, 61) < 0.035 && NBS[i].some(j => !isWater(j))) add(i);
    const m = gullFlock(LIFE, spots, { globe: true, k: K, up: (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; } });
    life.push(m);
    return m;
  }

  // ------------------------------------------------------------------ labels (HTML over the canvas), hidden past the horizon
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
  function addBanner(parent, i, name, kind, dy, color, people, tier, tierName, sub = "") {
    const o = addLabel(parent, i, name, kind, dy, sub, color), el = o.element, c = new THREE.Color(color);
    if (people !== undefined && people !== null) {
      const b = document.createElement("b"); b.className = "m3-pop"; b.textContent = String(people);
      b.style.color = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.28 ? "#0b1419" : "#fff";
      el.insertBefore(b, el.firstChild);
    }
    const pips = document.createElement("i"); pips.className = "m3-tier"; pips.setAttribute("aria-label", tierName || "");
    for (let k = 0; k < 3; k++) { const d = document.createElement("u"); if (k <= tier) d.className = "on"; pips.appendChild(d); }
    el.querySelector("span").after(pips); el.classList.add("m3-banner");
    return o;
  }
  // how high above the ground (world units) each kind of label still shows
  const SHOW_AT = { capital: 1e9, town: 70, wonder: 45, horde: 50, fx: 1e9 };
  const RANK = { capital: 0, town: 1, horde: 2, wonder: 3 }, tmpV = new THREE.Vector3();
  function cullLabels() {
    const alt = camera.position.length() - R, cp = camera.position, W = container.clientWidth, H2 = container.clientHeight, placed = [];
    for (const o of allLabels) if (o.parent) { o.getWorldPosition(tmpV); o.visible = alt < (SHOW_AT[o.userData.kind] ?? 60) && tmpV.dot(cp) > R * R * 1.0005; }
    const list = allLabels.filter(o => o.parent && o.visible).sort((a, b) => (RANK[a.userData.kind] ?? 9) - (RANK[b.userData.kind] ?? 9));
    for (const o of list) {
      o.getWorldPosition(tmpV).project(camera);
      if (tmpV.z > 1 || Math.abs(tmpV.x) > 1.2 || Math.abs(tmpV.y) > 1.2) { o.visible = false; continue; }
      const x = (tmpV.x + 1) / 2 * W, y = (1 - tmpV.y) / 2 * H2, el = o.element;
      if (o.userData.w === undefined && el.isConnected && el.offsetWidth) { o.userData.w = el.offsetWidth; o.userData.h = el.offsetHeight; }
      const cap = o.userData.kind === "capital", w = (o.userData.w ?? el.textContent.length * (cap ? 9 : 7) + 40) / 2 + 2, h = (o.userData.h ?? (cap ? 44 : 22)) / 2 + 1;
      if (placed.some(r => x - w < r[2] && x + w > r[0] && y - h < r[3] && y + h > r[1])) { o.visible = false; continue; }
      placed.push([x - w, y - h, x + w, y + h]);
    }
  }

  // ------------------------------------------------------------------ what moves: caravans, ships, boats, trains, people at work (near the eye only)
  let movers = null, moveT0 = performance.now();
  const SHAPES_OF = { plane: { plane: 1 }, walker: { person: 1 }, stroll: { person: 1 }, cart: { box: 1, blob: 3 }, train: { box: 4, cyl: 1 }, boat: { hull: 1, sail: 1, mast: 1 }, ship: { hull: 1, sail: 1, mast: 1 }, fishing: { hull: 1, sail: 1, mast: 1 }, moored: { hull: 1, mast: 1 } };
  const SHIP_OF = { boat: { "m:shipL": 1 }, ship: { "m:shipL": 1 }, fishing: { "m:ship": 1 }, moored: { "m:ship": 1 } };
  /** The sea way between two tiles by water (the tiles in order), or null. */
  function seaWay(a, b, limit = 6000) {
    const prev = new Map([[a, -1]]), queue = [a];
    for (let q = 0; q < queue.length && queue.length < limit; q++) { const t = queue[q]; if (t === b) break; for (const j of NBS[t]) if (!prev.has(j) && isWater(j)) { prev.set(j, t); queue.push(j); } }
    if (!prev.has(b)) return null;
    const path = []; for (let k = b; k >= 0; k = prev.get(k)) path.unshift(k);
    return path;
  }
  function buildMovers() {
    if (movers) { scene.remove(movers.group); disposeTree(movers.group); }
    const list = moverList(env());
    // ships between a nation's ports, by sea (to and fro)
    for (const n of S.nations) {
      if (!n.alive || !n.founded || !((n.stock?.boat || 0) >= 1)) continue;
      const ports = (n.buildings || []).filter(b => b.done && (b.type === "harbor" || b.type === "pier")).map(b => NBS[b.tile].find(j => isWater(j))).filter(t => t !== undefined);
      const seen = new Set();
      for (let k = 1; k < ports.length && seen.size < 3; k++) {
        if (ports[k] === ports[0] || seen.has(ports[k])) continue; seen.add(ports[k]);
        const path = seaWay(ports[0], ports[k]);
        if (path && path.length >= 3) list.push({ kind: "ship", path, color: hooks.nationColor(n.id), ph: hash(n.id, k, 91) });
      }
    }
    // townsfolk: a few people about each town, between its homes and its square (more in a bigger town)
    const CLOTHES = ["#8a5a3a", "#5a6e8a", "#9a8a5a", "#6a7a4a", "#7a4a4a", "#d8cfbf", "#4a4a5a"];
    for (const n of S.nations) {
      if (!n.alive || !n.founded) continue;
      const tierOf = new Map((n.provinces || []).map(p => [p.centre, p.tier || 0])), color = hooks.nationColor(n.id);
      for (const c of [n.capital, ...(n.settlements || []).map(s => s.tile)]) {
        if (c < 0 || S.owners[c] !== n.id) continue;
        anchor(c);
        const tier = tierOf.get(c) ?? 0, cnt = [4, 7, 11][tier] + (c === n.capital ? 3 : 0);
        for (let k = 0; k < cnt; k++) {
          const a1 = hash(c, k, 71) * 6.283, r1 = 0.22 + hash(c, k, 73) * 0.5, a2 = a1 + (hash(c, k, 75) - 0.5) * 2.4, r2 = 0.08 + hash(c, k, 77) * 0.55;
          list.push({ kind: "stroll", a: c, A: toDir(Math.cos(a1) * r1, Math.sin(a1) * r1), B: toDir(Math.cos(a2) * r2, Math.sin(a2) * r2), k, ph: hash(c, k, 79), color: hash(c, k, 81) < 0.3 ? color : CLOTHES[Math.floor(hash(c, k, 83) * CLOTHES.length)] });
        }
      }
    }
    for (const m of list) {
      const p = m.c?.path || m.path; m.mid = p ? p[Math.floor(p.length / 2)] : m.a; // where it is, for the reach
      m.span = p ? Math.max(...[p[0], p.at(-1)].map(t => dirOf(t).angleTo(dirOf(m.mid)))) * R : 3;
    }
    const counts = {};
    const ships = !!(GEO["m:ship"] && GEO["m:shipL"]);
    for (const m of list) for (const [k, c] of Object.entries((ships && SHIP_OF[m.kind]) || SHAPES_OF[m.kind])) counts[k] = (counts[k] || 0) + c;
    const group = new THREE.Group(), meshes = {};
    for (const [k, c] of Object.entries(counts)) {
      const m = new THREE.InstancedMesh(k === "mast" ? geo("cyl") : geo(k), k.startsWith("m:") ? modelMat("plain") : shapeMat("plain"), Math.max(1, c * (k === "box" || k === "blob" ? 2 : 1)));
      m.frustumCulled = false; m.count = 0; meshes[k] = m; group.add(m);
    }
    movers = { list, group, meshes, ships }; scene.add(group); moveT0 = performance.now();
  }
  const COLORS = new Map(), colorOf = c => { let v = COLORS.get(c); if (!v) COLORS.set(c, v = new THREE.Color(c)); return v; };
  const mq = new THREE.Vector3(), mq2 = new THREE.Vector3(), mA = new THREE.Vector3(), mB = new THREE.Vector3(), mt = new THREE.Vector3();
  /** A point of a path of tiles, part `f` of the way (smoothed through the tiles' centres): its direction into `out`. */
  function onPath(path, f, out) {
    const L = path.length - 1, p = clamp(f, 0, 1) * L, k = Math.min(L - 1, Math.floor(p)), t = p - k;
    // Catmull-Rom through the centres, back onto the ball
    const p0 = dirOf(path[Math.max(0, k - 1)], mA), p1 = dirOf(path[k], mq2), p2 = dirOf(path[k + 1], mB), p3 = dirOf(path[Math.min(L, k + 2)], mt);
    const t2 = t * t, t3 = t2 * t;
    out.set(0, 0, 0)
      .addScaledVector(p0, -0.5 * t3 + t2 - 0.5 * t).addScaledVector(p1, 1.5 * t3 - 2.5 * t2 + 1)
      .addScaledVector(p2, -1.5 * t3 + 2 * t2 + 0.5 * t).addScaledVector(p3, 0.5 * t3 - 0.5 * t2);
    return out.normalize();
  }
  /** The heading at direction q towards direction q2, as the shared layout counts it (from east, turning to north). */
  function heading(q, q2) {
    let ex = q.z, ez = -q.x; const l = Math.hypot(ex, ez) || 1; ex /= l; ez /= l;
    const dx = q2.x - q.x, dy = q2.y - q.y, dz = q2.z - q.z, s0 = -ez * q.y, s1 = ez * q.x - ex * q.z, s2 = ex * q.y;
    const lx = dx * ex + dz * ez, lz = dx * s0 + dy * s1 + dz * s2; // east and south
    return Math.atan2(-lz, lx);
  }
  /** A point `ox` along the heading `a` and `oz` across it (the tiles' units) from q. */
  function offset(q, a, ox, oz, out) {
    let ex = q.z, ez = -q.x; const l = Math.hypot(ex, ez) || 1; ex /= l; ez /= l;
    const s0 = -ez * q.y, s1 = ez * q.x - ex * q.z, s2 = ex * q.y, c = Math.cos(a), s = Math.sin(a);
    // forward = east cos a − south sin a; to the side = east sin a + south cos a
    const fx = ex * c - s0 * s, fy = -s1 * s, fz = ez * c - s2 * s, rx = ex * s + s0 * c, ry = s1 * c, rz = ez * s + s2 * c;
    return out.set(q.x * R + (fx * ox + rx * oz) * K, q.y * R + (fy * ox + ry * oz) * K, q.z * R + (fz * ox + rz * oz) * K).normalize();
  }
  function updateMovers(now) {
    if (!movers) return;
    const M = movers.meshes, idx = {}, alt = camera.position.length() - R, cam = camera.position, cd = mq.copy(cam).normalize().clone();
    for (const k in M) idx[k] = 0;
    const reachNear = alt < 55 ? Math.min(90, 14 + alt * 2.2) : 0, reachFar = Math.min(260, 40 + alt * 3);
    const put = (k, q, h, sx, sy, sz, ry, color) => { const m = M[k]; if (!m || idx[k] >= m.instanceMatrix.count) return; place(m.instanceMatrix.array, idx[k] * 16, q, R + h * K, sx, sy, sz, ry); m.setColorAt(idx[k]++, colorOf(color)); };
    const near = (m, reach) => reach > 0 && dirOf(m.mid, mq).angleTo(cd) * R < reach + m.span && mq.dot(cam) > R * 0.995 - m.span;
    const boat = (q, y, s, a, color, sail = true) => {
      if (movers.ships) { const k = sail ? "m:shipL" : "m:ship", sz = GEO[k].userData.size; put(k, q, y - 0.02 * s, 0.55 * s / sz.x, (sail ? 0.42 : 0.13) * s, 0.55 * s / sz.x, a + Math.PI, color); return; }
      put("hull", q, y, 0.5 * s, 0.28 * s, 0.26 * s, a, color);
      put("mast", q, y + 0.05, 0.02, 0.5 * s, 0.02, 0, "#4b3a2a");
      if (sail) put("sail", q, y + 0.12 * s, 0.2 * s, 0.46 * s, 0.04, a, "#f4efe2");
    };
    const turnPhase = Math.min(1, (now - moveT0) / 30000), p = new THREE.Vector3(), p2 = new THREE.Vector3(), o = new THREE.Vector3();
    const caravanF = c => { const span = Math.max(1, c.arrive - (c.depart ?? c.arrive - 1)); return ((S.tick - (c.depart ?? S.tick)) + turnPhase) / span; };
    for (const m of movers.list) {
      if (m.kind === "plane") { // §7.3b flying from one airport to the other along an arc
        if (!near(m, reachFar)) continue;
        const c = m.c, f = clamp(caravanF(c), 0, 1); if (f >= 1) continue;
        const a = dirOf(c.path[0], mA), b = dirOf(c.path.at(-1), mB), ang = a.angleTo(b);
        slerp(a, b, f, p); slerp(a, b, Math.min(1, f + 0.01), p2);
        put("plane", p, (0.8 + Math.sin(Math.PI * f) * (1.5 + ang * R * 0.12)) / K, 0.55, 0.55, 0.55, heading(p, p2), m.color);
        continue;
      }
      if (!near(m, reachNear)) continue;
      if (m.kind === "train") {
        // a steam engine and its wagons in the nation's colour
        const path = m.c ? m.c.path : m.path, L = path.length - 1;
        let f, dir = 1;
        if (m.c) f = caravanF(m.c);
        else { const t = ((now / (6000 + L * 900)) + m.ph) % 1; f = ease(t < 0.5 ? t * 2 : 2 - t * 2); dir = t < 0.5 ? 1 : -1; }
        f = clamp(f, 0, 1);
        onPath(path, f, p); onPath(path, clamp(f + 0.01 * dir, 0, 1), p2);
        const a = heading(p, p2), h = groundAt(p, path[Math.round(f * L)]) + 0.02, back = 0.42 / Math.max(1, L);
        put("box", p, h + 0.06, 0.38, 0.16, 0.17, a, "#26262b"); put("box", offset(p, a, -0.1, 0, o), h + 0.06, 0.14, 0.26, 0.17, a, "#33333a");
        put("cyl", offset(p, a, 0.12, 0, o), h + 0.2, 0.07, 0.14, 0.07, 0, "#16161a");
        for (let k = 1; k <= 2; k++) { const fk = clamp(f - k * back * dir, 0, 1); onPath(path, fk, o); onPath(path, clamp(fk + 0.01 * dir, 0, 1), p2); put("box", o, groundAt(o, path[Math.round(fk * L)]) + 0.08, 0.36, 0.17, 0.17, heading(o, p2), m.color); }
        continue;
      }
      if (m.kind === "cart" || m.kind === "boat" || m.kind === "ship") {
        const path = m.c ? m.c.path : m.path, L = path.length - 1;
        let f, dir = 1;
        if (m.c) f = clamp(caravanF(m.c), 0, 1);
        else { const t = ((now / (20000 + L * 2600)) + m.ph) % 1; f = t < 0.5 ? t * 2 : 2 - t * 2; f = ease(clamp((f - 0.04) / 0.92, 0, 1)); dir = t < 0.5 ? 1 : -1; }
        onPath(path, f, p); onPath(path, clamp(f + 0.004 * dir, 0, 1), p2);
        let a = heading(p, p2); if (f >= 1 && dir > 0) a = heading(dirOf(path[L - 1], mA), dirOf(path[L], mB));
        if (m.kind === "cart") {
          const h = groundAt(p, path[Math.round(f * L)]) + 0.02;
          put("box", p, h + 0.05, 0.3, 0.14, 0.18, a, "#8a6a42");
          put("blob", offset(p, a, 0, 0.1, o), h - 0.02, 0.12, 0.12, 0.04, a, "#3e2e20"); put("blob", offset(p, a, 0, -0.1, o), h - 0.02, 0.12, 0.12, 0.04, a, "#3e2e20");
          put("blob", offset(p, a, 0.3, 0, o), h, 0.2, 0.15, 0.12, a, "#6b4b33");
        } else boat(p, Math.sin(now / 520 + m.ph * 9) * 0.015, m.kind === "ship" ? 1.4 : 1.15, a, m.color);
        continue;
      }
      if (m.kind === "stroll") { // a townsman about his errands: there, a pause, back, a pause
        const t = ((now / (14000 + m.ph * 9000)) + m.ph) % 1, leg = t < 0.4 ? ease(t / 0.4) : t < 0.5 ? 1 : t < 0.9 ? 1 - ease((t - 0.5) / 0.4) : 0;
        slerp(m.A, m.B, leg, p); const a = heading(m.A, m.B) + (t >= 0.5 ? Math.PI : 0), still = (t >= 0.4 && t < 0.5) || t >= 0.9;
        put("person", p, groundAt(p, m.a) - 0.01, 0.17, 0.17 * (still ? 1 : 1 + Math.abs(Math.sin(now / 140 + m.k)) * 0.06), 0.17, still ? a + Math.sin(now / 900 + m.k) * 0.8 : a, m.color);
        continue;
      }
      dirOf(m.a, mA); dirOf(m.b, mB);
      const off = (m.k - 1) * 0.28;
      if (m.kind === "walker") {
        const period = 9000 + m.ph * 5000, t = ((now / period) + m.ph) % 1, leg = t < 0.4 ? ease(t / 0.4) : t < 0.6 ? 1 : 1 - ease((t - 0.6) / 0.4);
        slerp(mA, mB, leg * 0.92 + 0.04, p); const a = heading(mA, mB) + (t >= 0.6 ? Math.PI : 0);
        offset(p, heading(mA, mB), 0, off, o);
        const work = t >= 0.4 && t < 0.6;
        put("person", o, groundAt(o, m.b) + (work ? Math.abs(Math.sin(now / 160 + m.k)) * 0.04 : 0), 0.2, 0.2, 0.2, work ? a + Math.sin(now / 700 + m.k) : a, m.color);
      } else if (m.kind === "fishing") {
        const t = ((now / (12000 + m.ph * 6000)) + m.ph) % 1, leg = t < 0.3 ? ease(t / 0.3) : t < 0.75 ? 1 : 1 - ease((t - 0.75) / 0.25), f = 0.45 + 0.55 * leg;
        slerp(mA, mB, f, p); offset(p, heading(mA, mB), 0.3 * Math.sin(m.ph * 20 + leg * 3), off, o);
        const a = heading(mA, mB) + (t >= 0.75 ? Math.PI : 0) + (t >= 0.3 && t < 0.75 ? Math.sin(now / 1600 + m.k) * 0.8 : 0);
        boat(o, Math.sin(now / 420 + m.k * 1.7) * 0.02, 0.95, a, m.color, true);
      } else {
        slerp(mA, mB, 0.6, p); offset(p, heading(mA, mB), 0, (m.k - 1) * 0.3, o);
        boat(o, Math.sin(now / 600 + m.k) * 0.015, 0.9, heading(mA, mB) + 0.4, m.color, false);
      }
    }
    for (const [k, m] of Object.entries(M)) { m.count = idx[k]; if (idx[k]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } }
  }

  // ------------------------------------------------------------------ the turn's events, played over the globe
  let fxQueue = [];
  const fxGroup = new THREE.Group(); scene.add(fxGroup);
  function playFx(list) {
    for (const f of fxQueue) f.done?.();
    fxQueue = [];
    if (!list?.length) return;
    const t0 = performance.now(), gap = clamp(14000 / list.length, 150, 1000);
    fxQueue = list.slice(0, 300).filter(f => f.tile >= 0 || f.path?.length).map((f, k) => ({ f, t0: t0 + k * gap, dur: hooks.fxDur(f), started: false }));
  }
  function startFx(q) {
    const f = q.f, tile = f.path?.length ? f.path[Math.floor(f.path.length / 2)] : f.tile, tone = TONE[hooks.fxTone(f)] ?? TONE[""];
    const g = new THREE.Group(); fxGroup.add(g);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.95, 6), new THREE.MeshBasicMaterial({ color: tone, transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false, toneMapped: false }));
    const d = dirOf(tile); ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d); ring.position.copy(at(tile, 0.15)); ring.renderOrder = 5; g.add(ring);
    if (f.path?.length > 1) {
      const pts = f.path.map(i => at(i, 0.2)), line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xfff4cf, dashSize: 0.5, gapSize: 0.35, toneMapped: false }));
      line.computeLineDistances(); g.add(line);
    }
    const el = document.createElement("div"); el.className = `m3-fx ${hooks.fxTone(f)}`; el.textContent = hooks.fxWord(f);
    const label = new CSS2DObject(el); label.position.copy(at(tile, 1.2)); g.add(label);
    q.g = g; q.ring = ring; q.label = label; q.el = el; q.dir = d; q.tile = tile; q.started = true;
    q.done = () => { fxGroup.remove(g); disposeTree(g, true); el.remove(); };
  }
  function updateFx(now) {
    for (const q of fxQueue) {
      const t = (now - q.t0) / q.dur;
      if (t < 0) continue;
      if (!q.started) startFx(q);
      if (t > 1) { q.done(); q.dead = true; continue; }
      const fade = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;
      q.ring.scale.setScalar(1 + t * 1.6); q.ring.material.opacity = 0.85 * (1 - t);
      q.el.style.opacity = q.label.position.dot(camera.position) > R * R ? fade : 0; // not through the globe
      q.label.position.copy(at(q.tile, 1.0 + t * 1.2));
    }
    fxQueue = fxQueue.filter(q => !q.dead);
  }

  // ------------------------------------------------------------------ hover and pin (drawn by the land's shader)
  let hovered = -1;
  function setHover(i) { if (i === hovered) return; hovered = i; U.uHover.value = i === pinned ? -1 : i; need = true; }

  // ------------------------------------------------------------------ picking: the ray meets the ball, then the nearest tile
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ball = new THREE.Sphere(new THREE.Vector3(), R + 0.1), hit = new THREE.Vector3();
  /** Where the ray through a screen point meets the globe (a unit vector), or null in the sky. */
  function dirAt(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectSphere(ball, hit)) return null;
    // up close, march on to the ground itself (the hills stand above the ball)
    if (VG && camera.position.length() - R < 40) {
      const o = ray.ray.origin, dv = ray.ray.direction, top = R + 4 * HS;
      ball.radius = top; const h0 = ray.ray.intersectSphere(ball, mt); ball.radius = R + 0.1;
      if (h0) {
        let t = o.distanceTo(h0), prev = t; const step = 0.15, tEnd = o.distanceTo(hit) + 0.01;
        const above = t => { mq.copy(o).addScaledVector(dv, t); const r = mq.length(); return r - (R + Math.max(0, groundAt(mq.normalize())) * K); };
        for (; t <= tEnd; t += step) { if (above(t) <= 0) break; prev = t; }
        let lo = prev, hi = Math.min(t, tEnd);
        for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2; if (above(m) > 0) lo = m; else hi = m; }
        return mq.copy(o).addScaledVector(dv, hi).normalize().clone();
      }
    }
    return hit.clone().normalize();
  }
  const tileAt = ev => { if (!P) return -1; const d = dirAt(ev.clientX, ev.clientY); return d ? nearestTile(d) : -1; };
  let down = null, hoverAt = 0;
  const el = renderer.domElement;
  el.addEventListener("pointerdown", ev => { down = { x: ev.clientX, y: ev.clientY }; fly = null; });
  el.addEventListener("pointerup", ev => { if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 6 && ev.button === 0) hooks.onPick(tileAt(ev)); down = null; });
  el.addEventListener("pointermove", ev => { if (ev.buttons) { hooks.onHover(-1); setHover(-1); return; } const now = performance.now(); if (now - hoverAt < 50) return; hoverAt = now; const i = tileAt(ev); setHover(i); hooks.onHover(i, ev); });
  el.addEventListener("pointerleave", () => { hooks.onHover(-1); setHover(-1); });
  el.addEventListener("keydown", ev => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = ev.key.toLowerCase(), a = Math.max(0.004, Math.min(0.25, (camera.position.length() - R) / R * 0.12));
    const turnBy = { arrowleft: [a, 0], a: [a, 0], arrowright: [-a, 0], d: [-a, 0], arrowup: [0, a], w: [0, a], arrowdown: [0, -a], s: [0, -a] }[k];
    if (turnBy) { ev.preventDefault(); const c = viewCentre(), d = camera.position.length(), e = new THREE.Vector3().crossVectors(Y, c).normalize(); if (turnBy[0]) c.applyAxisAngle(Y, -turnBy[0]); if (turnBy[1]) c.applyAxisAngle(e, -turnBy[1]); flyTo(c.normalize(), d, 220); return; }
    if (k === "r") { ev.preventDefault(); faceNorth(false); return; }
    if (k === "t") { ev.preventDefault(); faceNorth(true); return; }
    if (k === "enter") { ev.preventDefault(); const r = el.getBoundingClientRect(), V = view(); hooks.onPick(tileAt({ clientX: r.left + V.x + V.w / 2, clientY: r.top + V.y + V.h / 2 })); }
  });
  // a double click flies in 2× towards the point (shift: out)
  el.addEventListener("dblclick", ev => { ev.preventDefault(); const d = dirAt(ev.clientX, ev.clientY); zoomAnchor = d; zoomVel += Math.log(ev.shiftKey ? 2 : 0.5); fly = null; need = true; });
  el.addEventListener("contextmenu", ev => ev.preventDefault());
  // the wheel zooms smoothly, gliding on after the last notch, towards the point under the pointer
  let zoomVel = 0, zoomAnchor = null, lastNow = 0;
  el.addEventListener("wheel", ev => {
    ev.preventDefault(); ev.stopImmediatePropagation();
    const dy = ev.deltaMode === 1 ? ev.deltaY * 32 : ev.deltaMode === 2 ? ev.deltaY * 400 : ev.deltaY;
    zoomVel += clamp(dy, -240, 240) * 0.0056;
    zoomAnchor = dirAt(ev.clientX, ev.clientY);
    fly = null; need = true;
  }, { capture: true, passive: false });

  // ------------------------------------------------------------------ the camera: round the globe, tilting to the horizon as it comes down
  const altMax = () => homeDist() * 1.25 - R;
  /** The lowest the eye may come over direction c: a little above the ground there. */
  const altMin = c => 2.6 + Math.max(0, groundAt(c)) * K;
  let topDown = false;
  /** How far the view tilts from straight down at a height `d` from the centre. */
  const tiltFor = d => topDown ? 0 : smooth(70, 6, d - R) * Math.min(0.95, 0.8 * Math.asin(Math.min(1, R / d)));
  /** The angle (at the centre) between the point under the camera and the point the tilted view looks at. */
  function lead(d) {
    const t = tiltFor(d); if (t < 1e-4) return 0;
    const c = Math.cos(t), disc = d * d * c * c - d * d + R * R; if (disc < 0) return 0;
    const s = d * c - Math.sqrt(disc); return Math.atan2(s * Math.sin(t), d - s * c);
  }
  const northOf = v => { const n = Y.clone().addScaledVector(v, -v.dot(Y)); return n.lengthSq() < 1e-8 ? new THREE.Vector3(0, 0, -1) : n.normalize(); };
  /** Put the camera `d` from the centre so the middle of the view falls on direction `c` (north up). */
  let placedAt = null; // the camera's place and the middle of the view it was put there for (no drift from going back and forth)
  function placeFor(c, d) {
    const phi = lead(d), u = c.clone().multiplyScalar(Math.cos(phi)).addScaledVector(northOf(c), -Math.sin(phi)).normalize();
    camera.position.copy(u).multiplyScalar(d);
    placedAt = { p: camera.position.clone(), c: c.clone().normalize() };
  }
  /** The direction the middle of the view looks at on the globe (or the point under the camera). */
  function viewCentre() {
    if (placedAt && placedAt.p.distanceToSquared(camera.position) < 1e-6) return placedAt.c.clone();
    const d = camera.position.length(), phi = lead(d), u = camera.position.clone().normalize();
    return phi ? u.multiplyScalar(Math.cos(phi)).addScaledVector(northOf(u), Math.sin(phi)).normalize() : u;
  }
  function applyTilt() {
    controls.update();
    const t = tiltFor(camera.position.length());
    if (t > 1e-4) camera.rotateX(t);
    camera.updateMatrixWorld();
  }
  function glideZoom(now) {
    if (!zoomVel) return;
    const dt = clamp((now - (lastNow || now)) / 16.7, 0.25, 4), step = zoomVel * (1 - Math.pow(0.78, dt));
    zoomVel -= step; if (Math.abs(zoomVel) < 2e-4) zoomVel = 0;
    let c = viewCentre();
    const d = camera.position.length(), alt = d - R, alt2 = clamp(alt * Math.exp(step), Math.min(alt, altMin(camera.position.clone().normalize())), altMax()), k = alt2 / alt;
    if (Math.abs(k - 1) < 1e-6) { zoomVel = 0; return; }
    // the point under the pointer stays about where it is: the middle of the view moves towards it as much as the height falls
    if (zoomAnchor && k < 1) c = c.clone().lerp(zoomAnchor, 1 - k).normalize();
    placeFor(c, R + alt2);
    need = true;
  }
  let fly = null;
  function flyTo(c, d, dur = 800) { zoomVel = 0; fly = { t0: performance.now(), dur, c0: viewCentre(), d0: camera.position.length(), c1: c.clone().normalize(), d1: d }; need = true; }
  function stepFly(now) {
    if (!fly) return;
    const t = clamp((now - fly.t0) / fly.dur, 0, 1), e = ease(t);
    const ang = fly.c0.angleTo(fly.c1), c = ang < 1e-6 ? fly.c1.clone() : fly.c0.clone().multiplyScalar(Math.sin((1 - e) * ang) / Math.sin(ang)).addScaledVector(fly.c1, Math.sin(e * ang) / Math.sin(ang)).normalize();
    // on a long way the camera rises first and comes down at the end
    const a0 = fly.d0 - R, a1 = fly.d1 - R, lift = Math.min(R * 1.4, ang * R * 0.9), alt = Math.exp(Math.log(a0) + (Math.log(a1) - Math.log(a0)) * e) + Math.sin(Math.PI * e) * Math.max(0, lift - Math.max(a0, a1)) * 0.6;
    placeFor(c, R + alt);
    if (t >= 1) fly = null;
    need = true;
  }
  function focus(i, close = false) {
    if (i < 0 || !P) return;
    const d = close ? R + 14 : Math.min(camera.position.length(), R + 45);
    flyTo(dirOf(i), d, 900);
  }
  /** "N": north up (it always is) and the usual tilt; "T": straight down, or the usual tilt again. */
  function faceNorth(down) { topDown = down ? !topDown : false; flyTo(viewCentre(), camera.position.length(), 400); }
  function zoom(f) { fly = null; zoomAnchor = null; zoomVel += Math.log(1 / f) * 1.5; need = true; }
  function view() { const W = container.clientWidth, H2 = container.clientHeight, Rr = hooks.visibleRect?.(); return Rr && Rr.w > 120 && Rr.h > 120 ? Rr : { x: 0, y: 0, w: W, h: H2 }; }
  let lastView = "";
  function aim() {
    const W = container.clientWidth, H2 = container.clientHeight, Rr = view(), key = `${W}x${H2}:${Rr.x},${Rr.y},${Rr.w},${Rr.h}`;
    if (key === lastView) return;
    lastView = key;
    camera.setViewOffset(W, H2, -(Rr.x + Rr.w / 2 - W / 2), -(Rr.y + Rr.h / 2 - H2 / 2), W, H2); camera.updateProjectionMatrix(); need = true;
  }
  /** Far enough to see the whole globe in the free part of the screen. */
  function homeDist() {
    const Rr = view(), H2 = Math.max(1, container.clientHeight), half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), k = Math.min(Rr.h / H2, Rr.w / H2 / Math.max(1e-6, 1)) * half;
    return Math.max(R * 1.6, (R * 1.2) / Math.sin(Math.atan(k)));
  }
  function fit() { flyTo(viewCentre(), homeDist(), 800); }

  // ------------------------------------------------------------------ level of detail: the pieces of ground facing the eye, the copies near it
  const lod = { at: 0, key: "", pending: false };
  const fwd = new THREE.Vector3(), camDir = new THREE.Vector3();
  function updateLod(now, alt) {
    const cam = camera.position, d = cam.length(), fine = alt < FINE_ALT;
    camDir.copy(cam).normalize();
    const horizon = Math.acos(clamp(R / d, -1, 1)) + 0.06;
    for (const c of chunks) { if (!c) continue; const v = fine && c.mid.angleTo(camDir) < horizon + c.ang; for (const m of c.meshes) m.visible = v; }
    if (farLand) { farLand.visible = !fine; farSea.visible = !fine; }
    for (const m of roadMeshes) { const ch = chunks[m.userData.chunk]; m.visible = alt < 140 && (!ch || ch.mid.angleTo(camDir) < horizon + ch.ang); }
    // the copies: refilled when the view has moved (at most every 100 ms), and once more when it stops
    const key = `${cam.x.toFixed(2)},${cam.y.toFixed(2)},${cam.z.toFixed(2)},${camera.quaternion.x.toFixed(3)},${camera.quaternion.y.toFixed(3)},${camera.quaternion.z.toFixed(3)},${quality}`;
    if (key !== lod.key) { lod.key = key; lod.pending = true; }
    if (!lod.pending || now - lod.at < 100) return;
    lod.at = now; lod.pending = false;
    camera.getWorldDirection(fwd);
    const lite = quality === "lo", reach = {
      near: alt < 90 ? Math.min(140, 14 + alt * 2.4) : 0,
      model: alt < 70 ? Math.min(lite ? 34 : 46, (lite ? 13 : 16) + alt * 1.6) : 0,
      far: alt < 75 ? Math.min(150, 18 + alt * 2.8) : 0,
    };
    const aspect = camera.aspect || 1.6, half = THREE.MathUtils.degToRad(camera.fov / 2), diag = Math.atan(Math.tan(half) * Math.hypot(1, aspect)), cone = Math.cos(Math.min(1.45, diag + 0.25));
    lod.drawn = (decorPool?.refill(cam, fwd, reach, cone) || 0) + (dynPool?.refill(cam, fwd, reach, cone) || 0);
  }

  // ------------------------------------------------------------------ the loop
  const perf = { n: 0, sum: 0, last: 0 }, tmpV2 = new THREE.Vector2();
  function setQuality(q, keep = true) {
    if (q !== "hi" && q !== "lo") return quality;
    if (q === "hi" && !canPost) q = "lo";
    const was = quality; quality = q;
    if (keep) try { localStorage.setItem("sm-3d-q", q); } catch { }
    U.uDetail.value = q === "hi" ? 1 : 0;
    if (q === "hi" && !post) post = createPost(renderer);
    if (q === "lo" && post) { post.dispose(); post = null; }
    if (q !== was && ST) buildDecor(); // Nhanh: fewer trees, fewer kinds
    need = true;
    return quality;
  }
  let need = true, running = true, raf = 0, animOn = hooks.anim?.() ?? true, lastLabelView = null;
  controls.addEventListener("change", () => { need = true; });
  function resize() {
    const w = Math.max(100, container.clientWidth), h = Math.max(100, container.clientHeight);
    renderer.setSize(w, h, false); labels.setSize(w, h); camera.aspect = w / h; lastView = ""; aim(); camera.updateProjectionMatrix(); need = true;
  }
  new ResizeObserver(resize).observe(container);
  function frame(now) {
    raf = 0;
    if (!running || document.hidden) return;
    stepFly(now); glideZoom(now); lastNow = now;
    // dragging turns the globe about as fast as the ground under the pointer moves
    const d0 = camera.position.length();
    controls.rotateSpeed = clamp((d0 - R) / R * 0.55, 0.012, 1.1);
    applyTilt();
    const alt = camera.position.length() - R;
    const live = animOn || fxQueue.length;
    if (live) {
      U.uTime.value = now / 1000; updateFx(now);
      if (alt < 260) updateMovers(now);
      if (alt < 60) for (const f of flags) { const p = f.cloth.geometry.attributes.position, a = p.array; for (let k = 0; k < a.length; k += 3) a[k + 2] = f.base[k + 2] + Math.sin(now / 260 + f.phase + f.base[k] * 6) * 0.05 * f.base[k] * 2.2; p.needsUpdate = true; }
      need = true;
    }
    if (now - (frame.aimed || 0) > 300) { frame.aimed = now; aim(); }
    if (live) {
      perf.n++; perf.sum += Math.min(100, now - (perf.last || now)); perf.last = now;
      if (perf.n >= 90) {
        const ms = perf.sum / perf.n, next = ms > 24 ? Math.max(0.75, dpr - 0.25) : ms < 15 ? Math.min(DPR_MAX, dpr + 0.25) : dpr;
        if (next !== dpr) { dpr = next; renderer.setPixelRatio(dpr); resize(); }
        perf.n = 0; perf.sum = 0;
      }
    } else perf.last = 0;
    if (need || lod.pending) {
      const d = camera.position.length();
      // near and far planes round what can be seen: from the eye to just past the horizon
      camera.near = Math.max(0.05, alt * 0.25 * Math.cos(tiltFor(d))); camera.far = Math.sqrt(Math.max(0, d * d - R * R)) + R * 0.6; camera.updateProjectionMatrix();
      U.uBand.value = clamp(alt * 0.0042, 0.07, 0.42);
      U.uNear.value = 1 - smooth(10, 40, alt);
      updateLod(now, alt);
      if (clouds) { clouds.visible = quality === "hi" && alt > 40; clouds.material.uniforms.uFade.value = smooth(40, 120, alt); } // the clouds only from high up: never over the land looked at
      LIFE.uNear.value = 1 - smooth(22, 50, alt);
      for (const o of life) o.visible = LIFE.uNear.value > 0;
      for (const f of flags) f.group.visible = alt < 60;
      if (dyn) for (const o of dyn.children) if (o.userData.near) o.visible = alt < 70;
      if (air?.userData.stars) { renderer.getDrawingBufferSize(tmpV2); air.userData.stars.material.uniforms.uPx.value = tmpV2.y / 900; LIFE.uScale.value = tmpV2.y * 0.5 * camera.projectionMatrix.elements[5]; }
      const vw = [...camera.matrixWorld.elements, ...camera.projectionMatrix.elements, labelGen, container.clientWidth];
      const moved = fxQueue.length > 0 || !lastLabelView || vw.some((v, k) => v !== lastLabelView[k]);
      if (moved) cullLabels();
      if (post) {
        try { post.render(scene, camera, { dist: alt, ao: 0.6 * (1 - smooth(25, 80, alt)), bloom: 0.12, dof: 0 }); }
        catch (e) { console.warn("[3D] finishing passes off:", e); setQuality("lo", false); renderer.setRenderTarget(null); renderer.render(scene, camera); }
      } else renderer.render(scene, camera);
      if (moved) labels.render(scene, camera);
      lastLabelView = vw; need = false;
      hooks.onZoom?.((homeDist() - R) / Math.max(1e-6, alt));
    }
    raf = requestAnimationFrame(frame);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && running && !raf) raf = requestAnimationFrame(frame); });
  function disposeTree(o, keepShared = false) {
    o.traverse(x => {
      if (x.isCSS2DObject) { x.element.remove(); const k = allLabels.indexOf(x); if (k >= 0) allLabels.splice(k, 1); }
      if (x.userData.life) { const k = life.indexOf(x); if (k >= 0) life.splice(k, 1); }
      if (x.isInstancedMesh) x.dispose();
      if (x.geometry && !Object.values(GEO).includes(x.geometry)) x.geometry.dispose();
      if (x.material) { const ms = Array.isArray(x.material) ? x.material : [x.material]; for (const m of ms) { if (m.userData.keep) continue; if (!keepShared || !m.map) m.dispose(); } }
    });
  }

  let placed = false;
  function placeCamera() {
    if (!ST || container.hidden || container.clientHeight < 50) return;
    resize();
    // first look: at the nations (the middle of their capitals), else at longitude 0
    const c = new THREE.Vector3();
    for (const n of S?.nations || []) if (n.alive && n.founded && n.capital >= 0) c.add(dirOf(n.capital));
    if (c.lengthSq() < 1e-6) c.set(1, 0.3, 0);
    controls.target.set(0, 0, 0); placeFor(c.normalize(), homeDist()); controls.update(); placed = true; need = true;
  }

  const api3 = {
    setStatic(st) { ST = st; buildWorld(); buildDecor(); placeCamera(); if (S) api3.setState(S); },
    setState(s) { const first = !S; S = s; if (!ST) return; paintTiles(); buildDynamic(); buildMovers(); if (first && placed) placeCamera(); },
    setSelected(id) { if (selected === id) return; selected = id; U.uSel.value = id ?? -1; need = true; },
    setPinned(i) { if (pinned === i) return; pinned = i; U.uPin.value = i ?? -1; if (hovered === i) U.uHover.value = -1; need = true; },
    setLayer(values, max, threat) { layer = values ? { values, max, threat } : null; paintTiles(); },
    playFx, focus, zoom, fit, faceNorth, theme() { need = true; },
    turn(a) { const c = viewCentre().applyAxisAngle(Y, a); flyTo(c, camera.position.length(), 250); },
    setAnim(on) { animOn = on; need = true; },
    show(on) { running = on; container.hidden = !on; if (on) { resize(); if (!placed) placeCamera(); if (!raf) raf = requestAnimationFrame(frame); } },
    distance: () => camera.position.length() - R,
    quality: q => (q === undefined ? quality : setQuality(q)),
  };
  setQuality(quality, false);
  loadModels(geos => {
    for (const [k, g] of Object.entries(geos)) GEO["m:" + k] = g;
    if (ST) buildDecor();
    if (S && ST) { buildDynamic(); buildMovers(); }
    need = true;
  });
  if (/[?&#]m3debug/.test(location.search + location.hash)) window.__m3 = { api: api3, camera, controls, renderer, scene, viewCentre, placeFor, dirOf, groundAt, lod, pools: () => [decorPool, dynPool], movers: () => movers }; // for checks in the browser only
  raf = requestAnimationFrame(frame);
  return api3;
}
