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
import { createPost } from "./map3d-post.js";
import { loadModels, modelMaterial } from "./map3d-models.js";
import { SQ3, WATER, hash, clamp, smooth, ease, Tris, SHAPES, WOODS, decorTile, layRoads, layTowns, powerGrid, moverList, NOISE_GLSL, riverMaterial as riverMat, smokeWisps as wisps, gullFlock, townGlow as glowPoints } from "./map3d-shared.js";

const TONE = { good: "#4cc283", bad: "#ef6b60", "": "#ffd84a" };
// ground colours of the lit relief (sRGB)
const GROUND = { grass: "#82ad48", forest: "#4f7d32", taiga: "#526f4a", jungle: "#3a7230", hill: "#97954f", mountain: "#7c7165", coast: "#d6c690", swamp: "#5f7150", desert: "#d8bb7c", tundra: "#a2ad98", glacier: "#d6e4ec", icewall: "#eef6fb" };
const GRASS_ZONE = { cold: "#88a064", temp: "#82ad48", trop: "#6daa40" };
const SAND = "#d4c48e", ROCK = "#6c6359", SNOW = "#f4f7f9", SEABED = "#b8aa7a";

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

const GEO = {};
const geo = k => (GEO[k] ??= SHAPES[k]());
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ the hex painter, shared by the land and the sea shaders
const HEX_GLSL = NOISE_GLSL + /* glsl */`
uniform highp sampler2D uTiles;
uniform highp sampler2D uPal;
uniform float uN, uHover, uPin, uSel, uBand, uTime, uDetail;
uniform vec2 uOrigin;
varying vec3 vWorld;
vec2 hexSlope = vec2(0.0); // the land's slope (world normal's x, z) under the pixel: furrows follow the contours
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
      float sl = length(hexSlope); // on a slope the rows run along it, as ploughmen do
      if (sl > 0.03) { vec2 cd = vec2(-hexSlope.y, hexSlope.x) / sl; dir = normalize(mix(dir, cd * (dot(cd, dir) < 0.0 ? -1.0 : 1.0), smoothstep(0.03, 0.18, sl))); }
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
/** The broad grain of the ground and the clouds' shadows change slowly across the land: worked out per vertex
 *  (the lattice is fine enough), so the pixels need not pay for them. vGrain: patches, finer patches, cloud shade. */
const GRAIN_VERTEX = s => "uniform float uTime, uDetail;\nvarying vec3 vGrain;\n" + NOISE_GLSL + s.replace("#include <begin_vertex>", `#include <begin_vertex>
  { vec2 q = (modelMatrix * vec4(transformed, 1.0)).xz;
    float cl = vnoise(q * 0.045 + uTime * vec2(0.012, 0.005)) * 0.65 + vnoise(q * 0.11 - uTime * vec2(0.008, 0.011)) * 0.35;
    vGrain = vec3(vnoise(q * 0.21), vnoise(q * 0.93 + 17.0), 1.0 - 0.17 * smoothstep(0.52, 0.74, cl) * uDetail); }`);

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
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.12, screenSpacePanning: false, maxPolarAngle: 1.32, minDistance: 3.5, maxDistance: 420, zoomSpeed: 1.2 });
  // a warm low sun from the south-west, a cool sky above and a faint blue fill from the other side
  const hemi = new THREE.HemisphereLight(0xc4d8ff, 0x4a3a28, 1.25); scene.add(hemi);
  const SUN_DIR = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();
  const sun = new THREE.DirectionalLight(0xffdcb0, 3.1); scene.add(sun); scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0x7fa2ff, 0.45); fill.position.set(80, 60, -90); scene.add(fill);
  sun.castShadow = renderer.shadowMap.enabled;
  const SHADOW = Math.min(renderer.capabilities.maxTextureSize, 4096);
  sun.shadow.mapSize.set(SHADOW, SHADOW); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
  // the air: a sky behind the map at low angles (a dark void below the horizon, a blue haze along it, deep blue
  // above, a glow where the sun is), and the same haze over the far land
  const HAZE = new THREE.Color("#3a5366");
  scene.fog = new THREE.Fog(HAZE, 200, 700);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uHaze: { value: HAZE }, uZenith: { value: new THREE.Color("#0f2236") }, uVoid: { value: new THREE.Color("#0a1419") }, uSun: { value: SUN_DIR }, uSunCol: { value: new THREE.Color("#ffd9a8") } },
    vertexShader: "varying vec3 vDir;\nvoid main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.99999; }",
    fragmentShader: `uniform vec3 uHaze, uZenith, uVoid, uSun, uSunCol; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = d.y > 0.0 ? mix(uHaze, uZenith, pow(smoothstep(0.0, 0.55, d.y), 0.6)) : mix(uHaze, uVoid, smoothstep(0.0, 0.16, -d.y));
        c += uSunCol * pow(max(dot(d, uSun), 0.0), 10.0) * 0.22 * smoothstep(-0.1, 0.1, d.y);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
  // "Đẹp" (finishing passes, ground grain, cloud shadows) or "Nhanh" (as plain as before); the Watcher's choice is kept
  const canPost = renderer.capabilities.isWebGL2 && (renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float"));
  let quality = (() => { try { const q = localStorage.getItem("sm-3d-q"); if (q === "hi" || q === "lo") return q; } catch { } return mobile ? "lo" : "hi"; })();
  if (!canPost) quality = "lo";
  let post = null;

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
    uHover: { value: -1 }, uPin: { value: -1 }, uSel: { value: -1 }, uBand: { value: 0.1 }, uTime: { value: 0 }, uDetail: { value: 1 },
    uSkyRefl: { value: new THREE.Color("#3a5366").multiplyScalar(0.55) },
    uLod: { value: new THREE.Vector3(0, 0, -1) }, // the woods: models within uLod.z of (x, z), their plain stand-ins beyond
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
  // a bump from a height given per pixel (three's perturbNormalArb): the ground's grain and the strata catch the light
  const BUMP_GLSL = /* glsl */`
vec3 bumpNormal(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = dFdx(surf_pos), vSigmaY = dFdy(surf_pos), R1 = cross(vSigmaY, surf_norm), R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  return normalize(abs(fDet) * surf_norm - sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2));
}`;
  function landMaterial() {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = "varying vec3 vWN;\n" + GRAIN_VERTEX(WORLD_VERTEX(sh.vertexShader)).replace("#include <begin_vertex>", "#include <begin_vertex>\n  vWN = mat3(modelMatrix) * objectNormal;");
      sh.fragmentShader = HEX_GLSL + BUMP_GLSL + "varying vec3 vWN;\nvarying vec3 vGrain;\n" + sh.fragmentShader
        .replace("#include <color_fragment>", `#include <color_fragment>
  vec3 nW = normalize(vWN);
  float bumpH = 0.0;
  {
    // the ground's grain: broad patches of greener and drier grass, finer mottling up close, strata across
    // the cliffs, sand darkened where the waves wet it, cloud shadows drifting over all
    vec2 q = vWorld.xz; float pw0 = max(fwidth(q.x), fwidth(q.y)), slope = 1.0 - nW.y, y = vWorld.y;
    vec3 c = diffuseColor.rgb;
    float n1 = vGrain.x, green = smoothstep(0.02, 0.09, c.g - max(c.r, c.b));
    c *= 1.0 + (n1 - 0.5) * 0.16 * (1.0 - smoothstep(0.3, 1.2, pw0)) + (vGrain.y - 0.5) * 0.12 * (1.0 - smoothstep(0.12, 0.4, pw0 * 0.93));
    c = mix(c, c * vec3(1.1, 1.03, 0.78), green * smoothstep(0.58, 0.82, n1) * 0.55);
    c = mix(c, c * vec3(0.86, 1.0, 1.03), green * smoothstep(0.42, 0.18, n1) * 0.45);
    float wet = (1.0 - smoothstep(0.03, 0.1, y)) * step(-0.06, y) * (1.0 - smoothstep(0.3, 0.6, slope));
    c = mix(c, c * vec3(0.64, 0.67, 0.7), wet * 0.7);
    c *= vGrain.z;
    if (uDetail > 0.5 && pw0 < 0.1) { // up close only: finer mottling and the cliffs' strata, catching the light
      float g3 = oct(q, 3.7, pw0), g4 = oct(q, 11.0, pw0), rk = smoothstep(0.2, 0.5, slope);
      float strata = rk > 0.0 ? vnoise(vec2((q.x + q.y) * 0.9, y * 9.0)) * (1.0 - smoothstep(0.1, 0.35, pw0 * 9.0)) : 0.0;
      c *= 1.0 + g3 * 0.2 + g4 * 0.14 - rk * 0.24 * smoothstep(0.45, 0.8, strata);
      bumpH = g3 * 0.06 + g4 * 0.025 + rk * strata * 0.07;
    }
    diffuseColor.rgb = c;
  }
  hexSlope = nW.xz;
  vec3 hexGlow; diffuseColor.rgb = hexPaint(diffuseColor.rgb, vWorld.xz, 0.0, hexGlow);`)
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
  { vec2 dB = vec2(dFdx(bumpH), dFdy(bumpH)); if (uDetail > 0.5) normal = bumpNormal(-vViewPosition, normal, dB, faceDirection); }`)
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += hexGlow;");
    };
    return m;
  }
  function seaMaterial() {
    const m = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x7d95a4, shininess: 110 });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = "attribute float depth;\nvarying float vDepth;\n" + GRAIN_VERTEX(WORLD_VERTEX(sh.vertexShader)).replace("#include <begin_vertex>", "#include <begin_vertex>\n  vDepth = depth;");
      sh.fragmentShader = HEX_GLSL + "uniform vec3 uSkyRefl;\nvarying float vDepth;\nvarying vec3 vGrain;\n" + sh.fragmentShader
        .replace("#include <color_fragment>", `#include <color_fragment>
  float seaFoam = 0.0;
  {
    // turquoise over the sand, deepening to navy; light dancing on the shallow floor; a line of foam on the
    // shore and waves rolling in to it, broken by noise
    float dep = vDepth, t = uTime; vec2 q = vWorld.xz; float pw0 = max(fwidth(q.x), fwidth(q.y)), near = 1.0 - smoothstep(0.05, 0.4, pw0);
    vec3 wc = mix(vec3(0.085, 0.43, 0.44), vec3(0.018, 0.15, 0.25), smoothstep(0.0, 0.75, dep));
    wc = mix(wc, vec3(0.004, 0.035, 0.08), smoothstep(0.75, 2.3, dep));
    if (uDetail > 0.5 && near > 0.0 && dep < 0.45) {
      vec2 cq = q * 2.3;
      float ca = abs(sin(cq.x + sin(cq.y * 1.3 + t * 0.9))) * abs(sin(cq.y * 1.1 + sin(cq.x * 0.8 - t * 0.7)));
      wc += vec3(0.05, 0.12, 0.1) * pow(1.0 - ca, 6.0) * (1.0 - smoothstep(0.05, 0.45, dep)) * near;
    }
    wc *= vGrain.z;
    if (dep < 0.26) {
      float nz = vnoise(q * 3.1 + vec2(t * 0.15, -t * 0.1));
      float edge = 1.0 - smoothstep(0.012, 0.05 + nz * 0.05, dep);
      float wv = fract(dep * 5.5 + t * 0.22 + nz * 0.35), line = smoothstep(0.8, 0.95, wv) * (1.0 - smoothstep(0.95, 1.0, wv));
      line *= (1.0 - smoothstep(0.04, 0.24, dep)) * smoothstep(0.3, 0.6, vnoise(q * 1.7 - t * 0.05)) * near;
      seaFoam = clamp(max(edge * 0.9, line * 0.75), 0.0, 1.0);
    }
    wc = mix(wc, vec3(0.8, 0.88, 0.9), seaFoam);
    diffuseColor.rgb = wc;
  }
  vec3 hexGlow; diffuseColor.rgb = hexPaint(diffuseColor.rgb, vWorld.xz, 1.0, hexGlow);`)
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
  {
    vec2 q = vWorld.xz; float t = uTime, pw0 = max(fwidth(q.x), fwidth(q.y)), amp = 0.07 * (1.0 - smoothstep(0.05, 0.4, pw0));
    vec2 g = vec2(cos(q.x * 1.1 + t * 0.9 + sin(q.y * 0.6)) * 0.6 + cos(q.x * 2.6 - q.y * 1.9 + t * 1.7) * 0.4,
                  cos(q.y * 1.3 - t * 0.8 + sin(q.x * 0.5)) * 0.6 + cos(q.y * 3.1 + q.x * 1.4 - t * 1.4) * 0.4);
    if (uDetail > 0.5) { float a2 = 1.0 - smoothstep(0.02, 0.1, pw0); g += vec2(cos(q.x * 6.3 + q.y * 2.1 + t * 2.6), cos(q.y * 5.7 - q.x * 2.9 - t * 2.2)) * 0.45 * a2; }
    normal = normalize((viewMatrix * vec4(normalize(vec3(-g.x * amp, 1.0, -g.y * amp)), 0.0)).xyz);
  }`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
  totalEmissiveRadiance += hexGlow;
  { float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0); totalEmissiveRadiance += uSkyRefl * (0.08 + fr) * (1.0 - seaFoam) * (uDetail * 0.5 + 0.5); }`);
    };
    return m;
  }
  const riverMaterial = () => riverMat(U);

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
      c.lerp(snow, smooth(4.1, 4.45, h + 0.55 * perlin(x * 0.45, z * 0.45)) * smooth(0.5, 0.78, ny)); // snow on the heights and the gentler slopes; bare rock below
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
      // the ribbon ends where the river meets the sea (the sea's own colour takes over)
      const mouth = samples.findIndex(([x, z], k) => k > 1 && surf(x, z) < -0.03);
      if (mouth > 1) samples.length = mouth;
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

  // ------------------------------------------------------------------ the models (web/map3d-models.js), loaded in the background:
  // until they are in, and for any that fails to load, the shapes above stand in
  const MMAT = {};
  /** The models' shared materials: "plain", "lit" (lit windows), "sway" (trees), "soft" (plants seen from both sides). */
  function modelMat(kind) {
    if (!MMAT[kind]) {
      const k = kind.replace("L", ""), lod = kind.endsWith("L"); // "…L": a wood's model, drawn near only
      const m = MMAT[kind] = modelMaterial(U, { sway: k === "sway" || k === "soft", lit: k === "lit", side: k === "soft" ? THREE.DoubleSide : THREE.FrontSide, extra: lod ? sh => lodShader(sh, true) : null, key: lod ? "L" : "" });
      m.userData.keep = true;
    }
    return MMAT[kind];
  }
  const hasModel = k => !!GEO["m:" + k];
  const MODEL_NEAR = 60; // nearer than this the woods and rocks are models (round the point looked at); farther, a tree is a few pixels and the plain shapes do
  /** The woods' level of detail, per copy: `near` (a model) is drawn only within uLod.z of the point looked at,
   *  its stand-in (a plain shape) only beyond, so the two meet without a gap or a double. A copy left out is
   *  folded to a point (no area, no pixels). Used by the materials and by the shadows' depth materials. */
  function lodShader(sh, near) {
    sh.uniforms.uLod = U.uLod;
    sh.vertexShader = "uniform vec3 uLod;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
  #ifdef USE_INSTANCING
  { float dl = distance(instanceMatrix[3].xz, uLod.xy); if (${near ? "dl > uLod.z" : "dl < uLod.z"}) transformed *= 0.0; }
  #endif`);
  }
  const LODMAT = {};
  /** The shadow caster of a LOD'd copy (cached: "near" or "far"). */
  function lodDepth(near) {
    const k = near ? "near" : "far";
    if (!LODMAT[k]) { const m = LODMAT[k] = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); m.onBeforeCompile = sh => lodShader(sh, near); m.customProgramCacheKey = () => "lodd" + k; m.userData.keep = true; }
    return LODMAT[k];
  }

  // ------------------------------------------------------------------ the static decor: woods, reeds, scrub, rocks, wonders, veins
  let decor = null;
  const woods = []; // per instanced mesh: the tile of each copy, its distance from the tile's centre and its matrix, so towns can clear them
  function buildDecor() {
    if (decor) { scene.remove(decor); disposeTree(decor); }
    decor = new THREE.Group(); scene.add(decor); woods.length = 0;
    const lite = quality === "lo";
    // the models are drawn up close, one mesh per kind holding only the copies near the point looked at (refill());
    // elsewhere, and from afar (where a tree is a few pixels), the plain shapes stand in for them ("^")
    const W = {}, add = (shape, i, x, z, sx, sy, sz, ry, color, sink = 0.03) => { if (riverAt(x, z) > 0.07) return; const [cx, cz] = pos(i), ch = shape.startsWith("m:") ? 0 : Math.min(CHUNKS - 1, Math.max(0, Math.floor((x + X0 + 1) / (2 * X0 + 2) * CHUNKS))) + CHUNKS * Math.min(CHUNKS - 1, Math.max(0, Math.floor((z + Z0 + 1) / (2 * Z0 + 2) * CHUNKS))); (W[shape + "@" + ch] ??= []).push([i, Math.hypot(x - cx, z - cz), x, surf(x, z) - sink, z, sx, sy, sz, ry, color]); };
    const spot = (i, j, rmax = 0.82) => { const [x, z] = pos(i), a = hash(i, j, 3) * 6.283, d = Math.sqrt(hash(j, i, 9)) * rmax; return [x + Math.cos(a) * d, z + Math.sin(a) * d]; };
    /** A tree: a model of its kind (one of several, picked by the spot) or the old trunk and crown; `dense`: the thick of the woods. */
    const tree = (kind, i, j, x, z, s, color, dense) => {
      const V = WOODS[kind], list = (lite ? V.lo : V.hi).filter(hasModel);
      let d = dense ? "+" : "";
      if (list.length) { const h = s * V.h; add("m:" + list[Math.floor(hash(i, j, 29) * list.length)] + d, i, x, z, h * V.w, h, h * V.w, hash(j, i, 5) * 6.283, color, 0.02); d += "^"; }
      if (kind === "conifer") { add("trunk" + d, i, x, z, s * 0.15, s * 0.5, s * 0.15, 0, "#4e3a2a"); add("conifer" + d, i, x, z, s * 0.85, s * 2.3, s * 0.85, hash(j, i, 5) * 6, color, -s * 0.3); }
      else if (kind === "palm") { add("trunk" + d, i, x, z, s * 0.14, s * 1.3, s * 0.14, 0, "#6b5236"); add("palm" + d, i, x, z, s, s * 1.7, s, hash(j, i, 5) * 6, color, 0); }
      else { add("trunk" + d, i, x, z, s * 0.18, s * 0.7, s * 0.18, 0, "#5e4330"); add("broad" + d, i, x, z, s, s * 1.1, s, hash(j, i, 5) * 6, color, -s * 0.45); }
    };
    /** A rock, a bush, a reed bed, a cactus: one of the models `names` (`w` across, `h` high), else the shape. */
    const thing = (names, shape, i, j, x, z, w, h, color) => {
      const list = names.filter(hasModel), ry = hash(i, j, 5) * 6.283;
      if (list.length) { const name = list[Math.floor(hash(j, i, 27) * list.length)], sz = GEO["m:" + name].userData.size, k = w / Math.max(sz.x, sz.z); add("m:" + name, i, x, z, k, h, k, ry, color, 0.02); shape += "^"; }
      add(shape, i, x, z, w, h, w, ry, color);
    };
    const D = { spot, tree, thing, nTree: lite ? 5 : 7 };
    for (let i = 0; i < N * N; i++) decorTile(D, i, ST.terrain[i]);
    const SMALL = new Set(["trunk", "rock", "reeds", "blob", "m:rockS", "m:bush", "m:reed", "m:cactus", "m:cactusS"]), STILL = new Set(["rock", "blob"]), SOFT = new Set(["m:bush", "m:reed"]);
    const woodMat = swayMaterial(), stoneMat = new THREE.MeshLambertMaterial({ flatShading: true }), woodFar = swayMaterial(true), stoneFar = new THREE.MeshLambertMaterial({ flatShading: true });
    stoneFar.onBeforeCompile = sh => lodShader(sh, false); stoneFar.customProgramCacheKey = () => "stonefar";
    for (const [key, items] of Object.entries(W)) {
      const kind = key.split("@")[0], shape = kind.replace("+", "").replace("^", ""), still = STILL.has(shape) || shape.startsWith("m:rock") || shape.startsWith("m:cactus");
      const far = kind.includes("^"), mat = shape.startsWith("m:") ? modelMat(SOFT.has(shape) ? "softL" : still ? "plainL" : "swayL") : still ? (far ? stoneFar : stoneMat) : far ? woodFar : woodMat;
      const m = new THREE.InstancedMesh(geo(shape), mat, items.length);
      m.userData.dense = kind.includes("+"); // the thick of the woods, drawn only nearer in
      m.userData.lod = shape.startsWith("m:") ? 1 : kind.includes("^") ? 2 : 0; // 1: the model, near; 2: its stand-in, far
      if (m.userData.lod) m.customDepthMaterial = lodDepth(m.userData.lod === 1);
      m.castShadow = true; m.receiveShadow = true;
      const tiles = new Int32Array(items.length), off = new Float32Array(items.length);
      items.forEach(([i, d, x, y, z, sx, sy, sz, ry, c], k) => { tiles[k] = i; off[k] = d; tmpQ.setFromAxisAngle(Y_AXIS, ry); tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz)); m.setMatrixAt(k, tmpM); m.setColorAt(k, typeof c === "string" ? tmpC.set(c) : c); });
      m.userData.small = SMALL.has(shape); m.computeBoundingSphere();
      const w = { m, tiles, off, base: m.instanceMatrix.array.slice() };
      if (m.userData.lod === 1) { w.colors = m.instanceColor.array.slice(); w.cleared = new Uint8Array(items.length); w.n = items.length; m.count = 0; m.frustumCulled = false; }
      woods.push(w);
      decor.add(m);
    }
    for (const w of woods) if (w.cleared) refill(w);
    // wonders shine; rich seams show as small crystals in their colour
    const P = parts();
    for (const w of ST.wonders || []) { const [x, z] = pos(w.i); P.add("gem", x, top(w.i) + 0.4, z, 0.45, 0.7, 0.45, 0, "#ffd84a", true); }
    for (const v of ST.veins || []) { const [x, z] = pos(v.i), vx = x - 0.45, vz = z + 0.35; P.add("gem", vx, ground(vx, vz) - 0.02, vz, 0.2, 0.3, 0.2, 0, hooks.veinColor[v.good] || "#d9822b"); }
    decor.add(P.build());
    for (const w of ST.wonders || []) addLabel(decor, w.i, `★ ${w.name}`, "wonder", 1.6);
    decor.add(gulls());
    need = true; reshadow();
  }
  /** Trees in the wind: each sways on its own beat, more at the crown than at the foot (the vertex shader; no cost on the CPU). */
  function swayMaterial(far = false) {
    const m = new THREE.MeshLambertMaterial({ flatShading: true });
    m.onBeforeCompile = sh => {
      if (far) lodShader(sh, false);
      sh.uniforms.uTime = U.uTime;
      sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
  #ifdef USE_INSTANCING
  { vec2 ip = instanceMatrix[3].xz; float sw = sin(uTime * 1.4 + ip.x * 0.7 + ip.y * 0.45) + 0.45 * sin(uTime * 2.9 + ip.x * 1.9 - ip.y * 1.3);
    float k = transformed.y * transformed.y; transformed.x += sw * 0.05 * k; transformed.z += sw * 0.03 * k; }
  #endif`);
    };
    m.customProgramCacheKey = () => (far ? "swayfar" : "sway");
    return m;
  }
  /** A kind of model tree (or rock) takes the copies within the LOD circle, the cleared ones left out. */
  function refill(w) {
    const L = U.uLod.value, R2 = L.z * L.z, a = w.m.instanceMatrix.array, c = w.m.instanceColor.array, B = w.base, C = w.colors;
    let j = 0;
    if (L.z > 0) for (let k = 0; k < w.n; k++) {
      if (w.cleared[k]) continue;
      const dx = B[k * 16 + 12] - L.x, dz = B[k * 16 + 14] - L.y;
      if (dx * dx + dz * dz >= R2) continue;
      for (let q = 0; q < 16; q++) a[j * 16 + q] = B[k * 16 + q];
      c[j * 3] = C[k * 3]; c[j * 3 + 1] = C[k * 3 + 1]; c[j * 3 + 2] = C[k * 3 + 2]; j++;
    }
    w.m.count = j; w.m.instanceMatrix.needsUpdate = true; w.m.instanceColor.needsUpdate = true;
  }
  /** Woods give way to towns, works and roads. */
  function clearWoods(cleared) {
    for (const w of woods) {
      if (w.cleared) { for (let k = 0; k < w.n; k++) { const r = cleared.get(w.tiles[k]); w.cleared[k] = r !== undefined && w.off[k] < r ? 1 : 0; } refill(w); continue; }
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
      /** A model (when the models are in) sized to w × h × d, or else `fallback()`; `lit`: its windows lit. */
      model(name, x, y, z, w, h, d, ry, color, lit = false, fallback = null) {
        const k = "m:" + name, sz = GEO[k]?.userData.size;
        if (!sz) { fallback?.(); return false; }
        (list[k + (lit ? "~" : "")] ??= []).push([x, y, z, w / sz.x, h, d / sz.z, ry, color]); return true;
      },
      build() {
        const g = new THREE.Group();
        for (const [key, items] of Object.entries(list)) {
          const glow = key.endsWith("*"), lit = key.endsWith("~"), shape = glow || lit ? key.slice(0, -1) : key;
          const mat = shape.startsWith("m:") ? modelMat(lit ? "lit" : "plain") : glow ? new THREE.MeshStandardMaterial({ emissive: 0x8a5a00, emissiveIntensity: 2.4, roughness: 0.35, metalness: 0.4 }) : new THREE.MeshLambertMaterial({ flatShading: true });
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
  /** The shared layout's view of the flat map (web/map3d-shared.js): the map itself is the frame of every tile. */
  function env(extra) {
    return Object.assign({
      K: 1, S, hooks, count: N * N, pos, surf, ground, riverAt, nbs: i => NBS[i], isWater, anchor() { }, top, dist, riverAcross,
      world: (x, y, z) => [x, y, z], worldDir: (x, z) => [x, 0, z], up: () => [0, 1, 0],
    }, extra);
  }

  function buildDynamic() {
    if (dyn) { scene.remove(dyn); disposeTree(dyn, true); }
    dyn = new THREE.Group(); scene.add(dyn); flags.length = 0;
    const chimneys = [], plantSmoke = [], AR = new Tris();
    const cleared = new Map(), clear = (i, r) => cleared.set(i, Math.max(cleared.get(i) ?? 0, r));
    const E = env({ clear, chimney: (x, y, z) => chimneys.push(x, y, z), plant: (x, y, z) => plantSmoke.push(x, y, z), flag: (n, x, y, z) => flags.push(makeFlag(n, x, y, z)), label: (i, text, kind, dy) => addLabel(dyn, i, text, kind, dy) });
    // roads: branches from the centres, as on the 2D map; railways with ballast, sleepers and two rails
    const R = new Tris();
    layRoads(E, R);
    if (R.p.length) {
      const rm = new THREE.Mesh(R.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
      rm.receiveShadow = true; dyn.add(rm);
    }
    // towns and works, the barbarians' camps, the power lines
    const P = parts();
    layTowns(E, P, AR);
    const { wire, glow } = powerGrid(E, P);
    if (wire.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(wire, 3));
      dyn.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x24272b, transparent: true, opacity: 0.9 })));
    }
    if (glow.length) dyn.add(townGlow(glow));
    airLinks();
    if (AR.p.length) { const am = new THREE.Mesh(AR.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })); am.receiveShadow = true; dyn.add(am); }
    dyn.add(P.build());
    if (chimneys.length) dyn.add(smokeWisps(chimneys));
    if (plantSmoke.length) dyn.add(smokeWisps(plantSmoke, "0.6, 0.59, 0.57", 1.8, 0.55));
    for (const f of flags) dyn.add(f.group);
    clearWoods(cleared);
    // names: a banner over each capital and town, as in the strategy games: its people in a badge of the nation's
    // colour, the name, and pips for its rank (village, town, city)
    for (const n of S.nations) {
      if (!n.alive || !n.founded || n.capital < 0) continue;
      const col = hooks.nationColor(n.id), prov = new Map((n.provinces || []).map(p => [p.centre, p]));
      const cp = prov.get(n.capital);
      addBanner(dyn, n.capital, n.name, "capital", 2.4, col, n.population, cp?.tier ?? 0, cp?.tierName, n.capitalName || "");
      for (const s of n.settlements || []) if (S.owners[s.tile] === n.id) { const p = prov.get(s.tile); addBanner(dyn, s.tile, s.name, "town", 1.1, col, p?.people, p?.tier ?? 0, p?.tierName); }
    }
    need = true; reshadow();
  }
  /** §7.3b A nation's open airports joined by faint dashed arcs (its centres are joined by air). */
  function airLinks() {
    for (const n of S.nations) {
      const open = (n.alive && n.founded && n.air?.open_tiles) || [];
      for (let k = 1; k < open.length; k++) {
        const a = at(open[0]), b = at(open[k]), L = a.distanceTo(b), pts = [];
        for (let q = 0; q <= 32; q++) { const t = q / 32; pts.push(new THREE.Vector3().lerpVectors(a, b, t).setY(a.y + (b.y - a.y) * t + 0.5 + Math.sin(Math.PI * t) * (1.2 + L * 0.12))); }
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: hooks.nationColor(n.id), dashSize: 0.45, gapSize: 0.35, transparent: true, opacity: 0.55 }));
        line.computeLineDistances(); dyn.add(line);
      }
    }
  }
  /** §6.8 Where a river crosses a tile: the point of its course nearest the centre, and the unit vector across it. */
  function riverAcross(i) {
    const [x, z] = pos(i);
    let best = null, bd = Infinity;
    for (const pts of riverPaths) for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; const L = Math.sqrt(L2); best = [px, pz, -dz / L, dx / L]; }
    }
    return best && bd < 1.2 ? best : [x, z, 1, 0];
  }
  // ------------------------------------------------------------------ life: chimney smoke and gulls, animated wholly on the GPU (web/map3d-shared.js)
  const LIFE = { uTime: U.uTime, uScale: { value: 400 }, uNear: { value: 1 } };
  /** A warm light over each electrified town, seen from afar. */
  const townGlow = src => glowPoints(LIFE, src);
  /** Wisps of smoke from the chimneys, seen only up close. */
  function smokeWisps(src, col = "0.8, 0.8, 0.78", big = 1, alpha = 0.32) { const m = wisps(LIFE, src, { col, big, alpha }); life.push(m); return m; }
  /** Gulls circling over the coasts. */
  function gulls() {
    const spots = [];
    for (let i = 0; i < N * N && spots.length < 160 * 4; i++) if (isWater(i) && ST.terrain[i] === "shallow" && hash(i, 61) < 0.035 && NBS[i].some(j => j >= 0 && !isWater(j))) { const [x, z] = pos(i); spots.push(x, 0, z, i); }
    const m = gullFlock(LIFE, spots); life.push(m);
    return m;
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
  /** A city banner: [people] Name ●●, in the nation's colour; the badge's figures dark or light to stand out on it. */
  function addBanner(parent, i, name, kind, dy, color, people, tier, tierName, sub = "") {
    const o = addLabel(parent, i, name, kind, dy, sub, color), el = o.element, c = new THREE.Color(color);
    if (people !== undefined && people !== null) {
      const b = document.createElement("b"); b.className = "m3-pop"; b.textContent = String(people);
      const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // linear
      b.style.color = lum > 0.28 ? "#0b1419" : "#fff";
      el.insertBefore(b, el.firstChild);
    }
    const pips = document.createElement("i"); pips.className = "m3-tier"; pips.setAttribute("aria-label", tierName || "");
    for (let k = 0; k < 3; k++) { const d = document.createElement("u"); if (k <= tier) d.className = "on"; pips.appendChild(d); }
    el.querySelector("span").after(pips);
    el.classList.add("m3-banner");
    return o;
  }
  const SHOW_AT = { capital: 400, town: 120, wonder: 70, horde: 80, fx: 1e9 };
  const RANK = { capital: 0, town: 1, horde: 2, wonder: 3 }, tmpV = new THREE.Vector3();
  function cullLabels() {
    const d = camera.position.distanceTo(controls.target);
    // the models only in the pieces of the map near the point looked at (their stand-ins elsewhere)
    const L = U.uLod.value, R = d < MODEL_NEAR ? (quality === "lo" ? 4 + d * 0.45 : 5 + d * 0.48) : -1, t = controls.target;
    if ((R > 0) !== (L.z > 0) || Math.hypot(t.x - L.x, t.z - L.y) > Math.max(1, R) * 0.2 || Math.abs(R - L.z) > Math.max(1, R) * 0.2) { L.set(t.x, t.z, R); for (const w of woods) if (w.cleared) refill(w); reshadow(); }
    for (const w of woods) { const u = w.m.userData; w.m.visible = d < (u.small ? 120 : u.dense ? 170 : 1e9) && (u.lod !== 1 || w.m.count > 0); }
    for (const o of allLabels) if (o.parent) o.visible = d < (SHOW_AT[o.userData.kind] ?? 100);
    // a label that would cover one more important (or one placed before it) steps aside
    const W = container.clientWidth, H = container.clientHeight, placed = [];
    const list = allLabels.filter(o => o.parent && o.visible).sort((a, b) => (RANK[a.userData.kind] ?? 9) - (RANK[b.userData.kind] ?? 9));
    for (const o of list) {
      o.getWorldPosition(tmpV).project(camera);
      if (tmpV.z > 1 || tmpV.x < -1.2 || tmpV.x > 1.2 || tmpV.y < -1.2 || tmpV.y > 1.2) { o.visible = false; continue; }
      const x = (tmpV.x + 1) / 2 * W, y = (1 - tmpV.y) / 2 * H, el = o.element;
      if (o.userData.w === undefined && el.isConnected && el.offsetWidth) { o.userData.w = el.offsetWidth; o.userData.h = el.offsetHeight; } // measured once: reading it each frame forces a layout
      const cap = o.userData.kind === "capital", w = (o.userData.w ?? el.textContent.length * (cap ? 9 : 7) + 40) / 2 + 2, h = (o.userData.h ?? (cap ? 44 : 22)) / 2 + 1; // until measured, a generous guess
      if (placed.some(r => x - w < r[2] && x + w > r[0] && y - h < r[3] && y + h > r[1])) { o.visible = false; continue; }
      placed.push([x - w, y - h, x + w, y + h]);
    }
  }

  // ------------------------------------------------------------------ what moves: caravans, boats, trains, people at work
  let movers = null, moveT0 = performance.now();
  const SHAPES_OF = { plane: { plane: 1 }, walker: { person: 1 }, cart: { box: 1, blob: 3 }, train: { box: 4, cyl: 1 }, boat: { hull: 1, sail: 1, mast: 1 }, fishing: { hull: 1, sail: 1, mast: 1 }, moored: { hull: 1, mast: 1 } };
  const SHIP_OF = { boat: { "m:shipL": 1 }, fishing: { "m:shipL": 1 }, moored: { "m:ship": 1 } }; // with the models: one ship each
  function buildMovers() {
    if (movers) { scene.remove(movers.group); disposeTree(movers.group); }
    const list = moverList(env());
    const counts = {};
    const ships = !!(GEO["m:ship"] && GEO["m:shipL"]);
    for (const m of list) for (const [k, c] of Object.entries((ships && SHIP_OF[m.kind]) || SHAPES_OF[m.kind])) counts[k] = (counts[k] || 0) + c;
    const group = new THREE.Group(), meshes = {};
    for (const [k, c] of Object.entries(counts)) {
      const m = new THREE.InstancedMesh(k === "mast" ? geo("cyl") : geo(k), k.startsWith("m:") ? modelMat("plain") : new THREE.MeshLambertMaterial({ flatShading: true }), c);
      m.frustumCulled = false; m.castShadow = false; meshes[k] = m; group.add(m);
    }
    movers = { list, group, meshes, ships }; scene.add(group); moveT0 = performance.now();
  }
  function dist(a, b) { const [ax, az] = pos(a), [bx, bz] = pos(b); return Math.hypot(ax - bx, az - bz); }
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
      if (movers.ships) { const k = sail ? "m:shipL" : "m:ship", sz = GEO[k].userData.size; put(k, x, y - 0.02 * s, z, 0.55 * s / sz.x, (sail ? 0.42 : 0.13) * s, 0.55 * s / sz.x, a + Math.PI, color); return; }
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
      if (m.kind === "plane") { // §7.3b flying from one airport to the other along an arc
        const c = m.c, span = Math.max(1, c.arrive - (c.depart ?? c.arrive - 1)), f = clamp(((S.tick - (c.depart ?? S.tick)) + turnPhase) / span, 0, 1), A = at(c.path[0]), B = at(c.path.at(-1)), L = A.distanceTo(B);
        const x = A.x + (B.x - A.x) * f, z = A.z + (B.z - A.z) * f, y = A.y + (B.y - A.y) * f + 0.5 + Math.sin(Math.PI * f) * (1.2 + L * 0.12);
        if (f < 1) put("plane", x, y, z, 0.42, 0.42, 0.42, Math.atan2(-(B.z - A.z), B.x - A.x), m.color); // landed: parked at the far airport
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
  // a double click zooms in 2× towards the point (shift: out)
  el.addEventListener("dblclick", ev => { ev.preventDefault(); fly = null; zoomToward(ev); zoomVel += Math.log(ev.shiftKey ? 2 : 0.5); need = true; });
  el.addEventListener("contextmenu", ev => ev.preventDefault());
  // the wheel zooms smoothly, gliding on after the last notch, towards the point under the pointer
  let zoomVel = 0, zoomAnchor = null, lastNow = 0;
  const zoomPlane = new THREE.Plane(), zoomHit = new THREE.Vector3(), zoomTmp = new THREE.Vector3();
  el.addEventListener("wheel", ev => {
    ev.preventDefault(); ev.stopImmediatePropagation(); // MapControls' own (instant) wheel zoom is not used
    const dy = ev.deltaMode === 1 ? ev.deltaY * 32 : ev.deltaMode === 2 ? ev.deltaY * 400 : ev.deltaY;
    // one notch of a mouse wheel (deltaY ≈ 100) is about 1.75×: from the whole world to a city in five notches;
    // a trackpad's small deltas add up smoothly
    zoomVel += clamp(dy, -240, 240) * 0.0056;
    zoomToward(ev);
    fly = null; need = true;
  }, { capture: true, passive: false });
  /** The wheel and the double click zoom about the point under the pointer. */
  function zoomToward(ev) {
    const r = el.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera); zoomPlane.set(Y_AXIS, -controls.target.y);
    const d = camera.position.distanceTo(controls.target), hit = ray.ray.intersectPlane(zoomPlane, zoomHit);
    zoomAnchor = hit && hit.distanceTo(controls.target) < d * 2 ? hit.clone() : controls.target.clone();
  }
  function glideZoom(now) {
    if (!zoomVel) return;
    const dt = clamp((now - (lastNow || now)) / 16.7, 0.25, 4), step = zoomVel * (1 - Math.pow(0.78, dt));
    zoomVel -= step; if (Math.abs(zoomVel) < 2e-4) zoomVel = 0;
    const d = camera.position.distanceTo(controls.target), far = ST ? Math.max(d, home().length() * 1.3) : controls.maxDistance; // fully out: the whole world, with a little room
    const k = clamp(d * Math.exp(step), controls.minDistance, far) / d;
    if (Math.abs(k - 1) < 1e-6) { zoomVel = 0; return; }
    const A = zoomTmp.copy(zoomAnchor ?? controls.target); // a homothety about the anchor: it stays where it is on the screen
    camera.position.sub(A).multiplyScalar(k).add(A); controls.target.sub(A).multiplyScalar(k).add(A);
    const bx = X0 + 6, bz = Z0 + 6, t = controls.target, ox = clamp(t.x, -bx, bx) - t.x, oz = clamp(t.z, -bz, bz) - t.z; // not off the map
    if (ox || oz) { t.x += ox; t.z += oz; camera.position.x += ox; camera.position.z += oz; }
    need = true;
  }

  // ------------------------------------------------------------------ camera moves
  // the tilt follows the zoom, as in the strategy games: steep over the whole world, low and cinematic up close.
  // The Watcher's own tilt is kept as a share of the usual one (so a top-down view stays top-down while zooming).
  const ELEV_FAR = THREE.MathUtils.degToRad(57), ELEV_NEAR = THREE.MathUtils.degToRad(27);
  /** The usual angle from the vertical at a distance `d`. */
  const tiltFor = d => Math.PI / 2 - (ELEV_NEAR + (ELEV_FAR - ELEV_NEAR) * smooth(Math.log(7), Math.log(230), Math.log(Math.max(d, 1))));
  let tiltShare = 1, lastDist = 0;
  const sph = new THREE.Spherical(), offV = new THREE.Vector3();
  function followTilt() {
    offV.copy(camera.position).sub(controls.target);
    const d = offV.length(); if (d < 1e-6) return;
    sph.setFromVector3(offV);
    if (fly || Math.abs(d - lastDist) < d * 1e-5) tiltShare = sph.phi / tiltFor(d);
    else {
      const want = clamp(tiltFor(d) * tiltShare, 0.01, controls.maxPolarAngle);
      if (Math.abs(want - sph.phi) > 1e-5) { sph.phi = want; offV.setFromSpherical(sph); camera.position.copy(controls.target).add(offV); camera.lookAt(controls.target); }
    }
    lastDist = d;
  }
  /** The camera's offset from the point it looks at: `d` away, at the usual tilt for `d`, facing along `dir` (x, z). */
  const usual = (d, dx = 0, dz = 1) => { const p = tiltFor(d), f = Math.hypot(dx, dz) || 1; return new THREE.Vector3(dx / f * Math.sin(p) * d, Math.cos(p) * d, dz / f * Math.sin(p) * d); };
  let fly = null;
  function focus(i, close = false) {
    if (i < 0 || !HT) return;
    const p = at(i), d = close ? 16 : Math.min(camera.position.distanceTo(controls.target), 45);
    const dir = camera.position.clone().sub(controls.target);
    let off = dir.clone().setLength(d);
    if (close || dir.clone().normalize().y > 0.9) off = usual(d, dir.x, dir.z);
    if (!Number.isFinite(off.x)) off = usual(d);
    zoomVel = 0;
    fly = { t0: performance.now(), dur: 700, fromT: controls.target.clone(), toT: p, fromC: camera.position.clone(), toC: p.clone().add(off) };
  }
  function turn(a) {
    const off = camera.position.clone().sub(controls.target).applyAxisAngle(Y_AXIS, a);
    fly = { t0: performance.now(), dur: 250, fromT: controls.target.clone(), toT: controls.target.clone(), fromC: camera.position.clone(), toC: controls.target.clone().add(off) };
  }
  /** North up again; `down`: look straight down (or back to the usual tilt if already). */
  function faceNorth(down) {
    const d = camera.position.distanceTo(controls.target), off = camera.position.clone().sub(controls.target).normalize();
    const toC = down && off.y < 0.97 ? new THREE.Vector3(0, 0.999, 0.045).normalize().multiplyScalar(d) : usual(d);
    zoomVel = 0;
    fly = { t0: performance.now(), dur: 500, fromT: controls.target.clone(), toT: controls.target.clone(), fromC: camera.position.clone(), toC: controls.target.clone().add(toC) };
  }
  /** The + and − buttons and keys: the same glide as the wheel, about the middle of the view. */
  function zoom(f) { fly = null; zoomAnchor = null; zoomVel += Math.log(1 / f) * 1.5; need = true; } // the buttons' 1.6 is 2× here
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
    return usual(dist); // steep from afar: the relief reads, the far side stays in view
  }
  function fit() { zoomVel = 0; fly = { t0: performance.now(), dur: 700, fromT: controls.target.clone(), toT: new THREE.Vector3(0, 0, 0), fromC: camera.position.clone(), toC: home() }; }

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
  const perf = { n: 0, sum: 0, last: 0 }, tmpV2 = new THREE.Vector2(), life = [];
  /** "hi" (Đẹp) or "lo" (Nhanh); `keep`: remember the choice. */
  function setQuality(q, keep = true) {
    if (q !== "hi" && q !== "lo") return quality;
    if (q === "hi" && !canPost) q = "lo";
    const was = quality; quality = q;
    if (keep) try { localStorage.setItem("sm-3d-q", q); } catch { }
    U.uDetail.value = q === "hi" ? 1 : 0;
    if (q === "hi" && !post) post = createPost(renderer);
    if (q === "lo" && post) { post.dispose(); post = null; }
    if (q !== was && ST && GEO["m:oak"]) { buildDecor(); if (S) buildDynamic(); } // Nhanh: fewer trees, fewer kinds
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
  function theme() {
    // the interface is dark: a night-blue void around the map, a blue haze over its far side
    scene.background = new THREE.Color("#0a1419");
    need = true;
  }
  function frame(now) {
    raf = 0;
    if (!running || document.hidden) return;
    if (fly) { const t = clamp((now - fly.t0) / fly.dur, 0, 1), e = ease(t); controls.target.lerpVectors(fly.fromT, fly.toT, e); camera.position.lerpVectors(fly.fromC, fly.toC, e); if (t >= 1) fly = null; need = true; }
    glideZoom(now); lastNow = now;
    controls.update();
    followTilt();
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
      sky.position.copy(camera.position);
      LIFE.uNear.value = 1 - smooth(55, 105, d);
      for (const o of life) o.visible = LIFE.uNear.value > 0;
      // the HTML labels move only when the view does (or a turn's events float over the map)
      camera.updateMatrixWorld();
      const view = [...camera.matrixWorld.elements, ...camera.projectionMatrix.elements, labelGen, container.clientWidth];
      const moved = fxQueue.length > 0 || !lastLabelView || view.some((v, k) => v !== lastLabelView[k]);
      if (moved) cullLabels();
      renderer.getDrawingBufferSize(tmpV2); LIFE.uScale.value = tmpV2.y * 0.5 * camera.projectionMatrix.elements[5];
      if (post) {
        // the finishing passes: AO (not over the whole world, where the baked shading does), a soft bloom,
        // tilt-shift from medium distance on (none up close), the grade
        try { post.render(scene, camera, { dist: d, ao: 1 - smooth(150, 280, d), bloom: 0.12, dof: smooth(18, 70, d) * (0.85 - 0.3 * smooth(120, 300, d)) }); }
        catch (e) { console.warn("[3D] finishing passes off:", e); setQuality("lo", false); renderer.setRenderTarget(null); renderer.render(scene, camera); }
      } else renderer.render(scene, camera);
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
      if (x.userData.life) { const k = life.indexOf(x); if (k >= 0) life.splice(k, 1); }
      if (x.geometry && !Object.values(GEO).includes(x.geometry)) x.geometry.dispose();
      if (x.material) { const ms = Array.isArray(x.material) ? x.material : [x.material]; for (const m of ms) { if (m.userData.keep) continue; if (!keepShared || !m.map) m.dispose(); } }
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
    /** "hi" (Đẹp) or "lo" (Nhanh): read it, or set it (kept for the next visit). */
    quality: q => (q === undefined ? quality : setQuality(q)),
  };
  setQuality(quality, false);
  loadModels(geos => {
    for (const [k, g] of Object.entries(geos)) GEO["m:" + k] = g;
    if (ST) buildDecor();
    if (S && ST) { buildDynamic(); buildMovers(); }
    need = true;
  });
  if (/[?&#]m3debug/.test(location.search + location.hash)) window.__m3 = { api: api3, camera, controls, renderer, scene }; // for checks in the browser only
  raf = requestAnimationFrame(frame);
  return api3;
}
