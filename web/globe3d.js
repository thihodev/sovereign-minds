// The globe in 3D (Three.js): a world of hexagons (and twelve pentagons) on a ball, turned with the mouse.
// app.js loads this module instead of map3d.js when the world is a globe (§12.1); it answers the same calls
// (setStatic, setState, setPinned, focus, zoom, playFx, quality, …) and hands picking and hovering back, so the
// inspector and everything else work as on the flat map.
//
// Every tile is a fan of triangles round its centre, its corners where three tiles meet, the land lifted a little
// by its height; the whole world is one merged mesh. Who holds what is painted by the shader from a small texture,
// one texel a tile (owner, borders, war fronts, overlays): a turn changes the texture, never the mesh.
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/CSS2DRenderer.js";
import { createPost } from "./map3d-post.js";

const R = 100; // the globe's radius; a tile is about 1.4 across
const WATER = new Set(["ocean", "shallow"]);
const ROAD_COLOR = [null, "#94744c", "#a89670", "#bdb8ac", "#4f4a46"];
const TONE = { good: "#4cc283", bad: "#ef6b60", "": "#ffd84a" };
const GROUND = { grass: "#82ad48", forest: "#4f7d32", taiga: "#526f4a", jungle: "#3a7230", hill: "#97954f", mountain: "#7c7165", coast: "#d6c690", swamp: "#5f7150", desert: "#d8bb7c", tundra: "#a2ad98", glacier: "#d6e4ec", icewall: "#eef6fb" };
const GRASS_ZONE = { cold: "#88a064", temp: "#82ad48", trop: "#6daa40" };
const KIND_COLOR = { farm: "#d8b85a", craft: "#b9a07a", port: "#9a7448", water: "#8e8a82", defense: "#a69a84", sacred: "#f1ede4", store: "#c8b48a", other: "#c4b08a" };
const hash = (...k) => { let h = 2166136261; for (const x of k) { h ^= x; h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const Y = new THREE.Vector3(0, 1, 0);

const NOISE_GLSL = /* glsl */`
float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h13(i), h13(i + vec3(1, 0, 0)), u.x), mix(h13(i + vec3(0, 1, 0)), h13(i + vec3(1, 1, 0)), u.x), u.y),
             mix(mix(h13(i + vec3(0, 0, 1)), h13(i + vec3(1, 0, 1)), u.x), mix(h13(i + vec3(0, 1, 1)), h13(i + vec3(1, 1, 1)), u.x), u.y), u.z);
}
`;

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
  scene.add(new THREE.HemisphereLight(0xc4d8ff, 0x3a3428, 0.9));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.6); camera.add(sun); sun.position.set(-160, 150, 40);
  const canPost = renderer.capabilities.isWebGL2 && (renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float"));
  let quality = (() => { try { const q = localStorage.getItem("sm-3d-q"); if (q === "hi" || q === "lo") return q; } catch { } return mobile ? "lo" : "hi"; })();
  if (!canPost) quality = "lo";
  let post = null;

  // ------------------------------------------------------------------ the globe's shape
  let ST = null, S = null, T = 0, P = null, H = null, NBS = null, OFF = null, CU = null, CH = null;
  const dirOf = i => new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
  const isWater = i => WATER.has(ST.terrain[i]);
  /** A tile's centre on the ground, lifted by `dy`. */
  const at = (i, dy = 0) => dirOf(i).multiplyScalar(R + H[i] + dy);
  /** The height of the ground over tile i in the direction `q` (a unit vector): the fan triangle under it, interpolated. */
  function surfAt(i, q) {
    const n = NBS[i].length, o = OFF[i], c = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    for (let k = 0; k < n; k++) {
      const a = o + (k + n - 1) % n, b = o + k;
      const A = [CU[a * 3], CU[a * 3 + 1], CU[a * 3 + 2]], B = [CU[b * 3], CU[b * 3 + 1], CU[b * 3 + 2]];
      // barycentric weights of q in (c, A, B), the triangle nearly flat on the ball
      const v0 = [A[0] - c[0], A[1] - c[1], A[2] - c[2]], v1 = [B[0] - c[0], B[1] - c[1], B[2] - c[2]], v2 = [q.x - c[0], q.y - c[1], q.z - c[2]];
      const d00 = v0[0] * v0[0] + v0[1] * v0[1] + v0[2] * v0[2], d01 = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2], d11 = v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2];
      const d20 = v2[0] * v0[0] + v2[1] * v0[1] + v2[2] * v0[2], d21 = v2[0] * v1[0] + v2[1] * v1[1] + v2[2] * v1[2], den = d00 * d11 - d01 * d01 || 1;
      const wa = (d11 * d20 - d01 * d21) / den, wb = (d00 * d21 - d01 * d20) / den;
      if (wa >= -0.02 && wb >= -0.02 && wa + wb <= 1.02) return H[i] * (1 - wa - wb) + CH[a] * wa + CH[b] * wb;
    }
    return H[i];
  }
  /** A point within tile i, `r` (world units) from its centre at angle `a`: its direction and its ground height. */
  const tq = new THREE.Vector3(), te = new THREE.Vector3(), tn = new THREE.Vector3();
  function spotIn(i, r, a, out = new THREE.Vector3()) {
    const c = dirOf(i);
    te.crossVectors(Y, c); if (te.lengthSq() < 1e-8) te.set(1, 0, 0); te.normalize(); tn.crossVectors(c, te);
    out.copy(c).multiplyScalar(R).addScaledVector(te, Math.cos(a) * r).addScaledVector(tn, Math.sin(a) * r).normalize();
    return out;
  }
  /** The tile nearest a direction: a walk from tile to nearer tile, from the last one found. */
  let lastNear = 0;
  function nearestTile(q) {
    const dot = i => P[i * 3] * q.x + P[i * 3 + 1] * q.y + P[i * 3 + 2] * q.z;
    let i = lastNear, best = dot(i);
    for (let g = 0; g < 4000; g++) { let next = -1; for (const j of NBS[i]) { const d = dot(j); if (d > best) { best = d; next = j; } } if (next < 0) break; i = next; }
    lastNear = i; return i;
  }

  /** Each tile's height: the sea flat at 0, the land a little above it, the mountains and the ice higher. */
  function tileHeight(i) {
    const t = ST.terrain[i]; if (WATER.has(t)) return 0;
    const e = clamp(((ST.elev?.[i] ?? 40) - 20) / 70, 0, 1);
    let h = 0.07 + e * 0.32;
    if (t === "coast") h = 0.05 + e * 0.05; else if (t === "swamp") h = 0.06; else if (t === "hill") h += 0.2; else if (t === "mountain") h += 0.55; else if (t === "glacier") h += 0.25; else if (t === "icewall") h = 0.95;
    return h;
  }

  // ------------------------------------------------------------------ the tiles' paint (one texel a tile)
  const TW = 256;
  let tileTex = new THREE.DataTexture(new Uint8Array(TW * 4), TW, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  const palTex = new THREE.DataTexture(new Float32Array(256 * 4), 256, 1, THREE.RGBAFormat, THREE.FloatType);
  for (const t of [tileTex, palTex]) { t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; }
  const U = {
    uTiles: { value: tileTex }, uPal: { value: palTex }, uHover: { value: -1 }, uPin: { value: -1 }, uSel: { value: -1 },
    uBand: { value: 0.12 }, uTime: { value: 0 }, uDetail: { value: 1 }, uNear: { value: 0 },
  };
  let selected = -1, pinned = -1, layer = null;
  function paintTiles() {
    if (!ST || !S) return;
    const rows = Math.ceil(T / TW);
    if (tileTex.image.height !== rows) { tileTex.dispose(); tileTex = new THREE.DataTexture(new Uint8Array(TW * rows * 4), TW, rows, THREE.RGBAFormat, THREE.UnsignedByteType); tileTex.magFilter = tileTex.minFilter = THREE.NearestFilter; tileTex.generateMipmaps = false; U.uTiles.value = tileTex; }
    const d = tileTex.image.data, owners = S.owners;
    const atWar = new Set((S.wars || []).flatMap(w => [`${w.a}:${w.b}`, `${w.b}:${w.a}`]));
    const tier = new Map();
    for (const n of S.nations) {
      if (!n.alive || !n.founded) continue;
      const tiers = new Map((n.provinces || []).map(p => [p.centre, p.tier || 0]));
      for (const c of [n.capital, ...(n.settlements || []).map(s => s.tile)]) if (c >= 0 && owners[c] === n.id) tier.set(c, (tiers.get(c) ?? 0) + 1);
    }
    for (let i = 0; i < T; i++) {
      const o = owners[i], nb = NBS[i];
      let bm = 0, fm = 0;
      if (o >= 0) for (let k = 0; k < nb.length; k++) { const oj = owners[nb[k]]; if (oj === o) continue; if (oj >= 0 && atWar.has(`${o}:${oj}`)) fm |= 1 << k; else bm |= 1 << k; }
      let ov = 0;
      if (layer && layer.values[i] > 0) ov = (layer.threat ? 1 : 0) | (Math.max(1, Math.round(clamp(layer.values[i] / layer.max, 0, 1) * 127)) << 1);
      d[i * 4] = o >= 0 ? Math.min(255, o + 1) : 0;
      d[i * 4 + 1] = bm | (Math.min(3, tier.get(i) ?? 0) << 6);
      d[i * 4 + 2] = fm;
      d[i * 4 + 3] = ov;
    }
    tileTex.needsUpdate = true;
    const p = palTex.image.data, c = new THREE.Color();
    for (const n of S.nations) if (n.id < 255) { c.set(hooks.nationColor(n.id)); p[n.id * 4] = c.r; p[n.id * 4 + 1] = c.g; p[n.id * 4 + 2] = c.b; p[n.id * 4 + 3] = 1; }
    palTex.needsUpdate = true;
    need = true;
  }

  // ------------------------------------------------------------------ the land and the sea: one mesh
  function landMaterial() {
    const m = new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x6f8aa0, shininess: 70 });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = "attribute float aTile;\nattribute vec3 aInfo;\nflat varying float vTile;\nvarying vec3 vInfo;\nvarying vec3 vPos;\n" + sh.vertexShader
        .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vTile = aTile; vInfo = aInfo; vPos = position;");
      sh.fragmentShader = "uniform highp sampler2D uTiles;\nuniform highp sampler2D uPal;\nuniform float uHover, uPin, uSel, uBand, uTime, uDetail, uNear;\nflat varying float vTile;\nvarying vec3 vInfo;\nvarying vec3 vPos;\n" + NOISE_GLSL + sh.fragmentShader
        .replace("#include <color_fragment>", `#include <color_fragment>
  vec3 hexGlow = vec3(0.0);
  {
    int t = int(vTile + 0.5);
    ivec4 d = ivec4(texelFetch(uTiles, ivec2(t % ${TW}, t / ${TW}), 0) * 255.0 + 0.5);
    int owner = d.r - 1, side = int(vInfo.x + 0.5);
    float e = vInfo.y, fw = max(fwidth(e), 1e-4), wet = vInfo.z;
    bool border = (d.g & (1 << side)) != 0, front = (d.b & (1 << side)) != 0;
    vec3 col = diffuseColor.rgb;
    // the ground's grain up close: a mottle that fades before it is finer than the pixels
    if (uDetail > 0.5 && wet < 0.5) { float g = vnoise3(vPos * 2.3) - 0.5, g2 = vnoise3(vPos * 7.1) - 0.5; col *= 1.0 + g * 0.16 + g2 * 0.1 * uNear; }
    vec3 nc = owner >= 0 ? texelFetch(uPal, ivec2(owner, 0), 0).rgb : vec3(0.0);
    float inner = (border || front) ? 1.0 - smoothstep(0.0, 0.6, e) : 0.0;
    if (owner >= 0) col = mix(col, nc, (wet > 0.5 ? 0.14 : 0.13) + (1.0 - uNear) * 0.17 + inner * inner * 0.22); // stronger from afar, where the land's detail is lost
    int tier = d.g >> 6;
    // the paved heart of each town: a disc round the centre, larger for a bigger town
    if (tier > 0 && wet < 0.5) { float R0 = tier == 1 ? 0.78 : tier == 2 ? 0.7 : 0.62; col = mix(col, vec3(0.42, 0.37, 0.3), smoothstep(R0 - fw, R0 + fw, e) * 0.8); }
    int ov = d.a >> 1;
    if (ov > 0) col = mix(col, (d.a & 1) == 1 ? vec3(0.78, 0.03, 0.01) : vec3(1.0, 0.66, 0.0), 0.15 + float(ov) / 127.0 * 0.6);
    bool dim = uSel >= 0.0 && float(owner) != uSel;
    if (dim) col = mix(col, vec3(0.19, 0.21, 0.24), 0.5) * 0.7;
    float bk = dim ? 0.45 : 1.0, W = max(uBand, fw * 2.5);
    if (border) { float b = 1.0 - smoothstep(W - fw, W + fw, e); col = mix(col, nc, b * bk); hexGlow += nc * b * 0.45 * bk; col *= 1.0 - (1.0 - smoothstep(0.0, fw * 1.2, e)) * 0.5; }
    if (front) {
      float f = 1.0 - smoothstep(W * 1.6 - fw, W * 1.6 + fw, e), s = step(0.5, fract((vPos.x + vPos.y + vPos.z) * 1.4));
      vec3 fc = s > 0.5 ? vec3(1.0, 0.56, 0.02) : vec3(0.012, 0.009, 0.004);
      col = mix(col, fc, f); hexGlow += fc * f * 0.6;
    }
    // the tiles' outlines, faint, only up close
    col *= 1.0 - (1.0 - smoothstep(0.0, fw * 1.4, e)) * uNear * 0.22;
    if (abs(vTile - uPin) < 0.5) { float o = 1.0 - smoothstep(0.06 + fw, 0.06 + fw * 3.0, e); col = mix(col, vec3(1.0, 0.75, 0.15), 0.2 + 0.75 * o); hexGlow += vec3(1.0, 0.7, 0.12) * o * 0.9; }
    else if (abs(vTile - uHover) < 0.5) { float o = 1.0 - smoothstep(0.04 + fw, 0.04 + fw * 3.0, e); col = mix(col, vec3(1.0), 0.12 + 0.8 * o); hexGlow += vec3(0.6) * o; }
    diffuseColor.rgb = col;
  }`)
        .replace("#include <specularmap_fragment>", "float specularStrength = vInfo.z * (0.55 + 0.45 * uDetail);")
        .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
  if (vInfo.z > 0.5 && uDetail > 0.5) { // waves on the sea, catching the light
    vec3 q = vPos * 1.7 + vec3(uTime * 0.35, uTime * 0.21, -uTime * 0.3);
    vec3 g = vec3(vnoise3(q) - 0.5, vnoise3(q + 13.1) - 0.5, vnoise3(q - 7.7) - 0.5);
    normal = normalize(normal + (viewMatrix * vec4(g, 0.0)).xyz * 0.35);
  }`)
        .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += hexGlow;");
    };
    m.customProgramCacheKey = () => "globe-land";
    return m;
  }

  let world = null;
  function buildWorld() {
    if (world) { scene.remove(world); disposeTree(world); }
    world = new THREE.Group(); scene.add(world);
    T = ST.terrain.length; NBS = ST.nb;
    // the tiles' directions (east to the right when north is up: z runs west)
    P = new Float32Array(T * 3); H = new Float32Array(T);
    const D = Math.PI / 180;
    for (let i = 0; i < T; i++) { const la = ST.lat[i] * D, lo = ST.lon[i] * D; P[i * 3] = Math.cos(la) * Math.cos(lo); P[i * 3 + 1] = Math.sin(la); P[i * 3 + 2] = -Math.cos(la) * Math.sin(lo); H[i] = tileHeight(i); }
    // the corners, one per meeting of three tiles (the same numbers whichever tile asks)
    OFF = new Int32Array(T + 1); for (let i = 0; i < T; i++) OFF[i + 1] = OFF[i] + NBS[i].length;
    const NC = OFF[T]; CU = new Float32Array(NC * 3); CH = new Float32Array(NC);
    const cid = new Int32Array(NC), key = new Map(), uniq = [];
    for (let i = 0; i < T; i++) {
      const nb = NBS[i], n = nb.length;
      for (let k = 0; k < n; k++) {
        const t3 = [i, nb[k], nb[(k + 1) % n]].sort((a, b) => a - b), kk = (t3[0] * T + t3[1]) * T + t3[2];
        let id = key.get(kk);
        if (id === undefined) {
          id = uniq.length / 4;
          let x = 0, y = 0, z = 0; for (const j of t3) { x += P[j * 3]; y += P[j * 3 + 1]; z += P[j * 3 + 2]; }
          const l = Math.hypot(x, y, z); uniq.push(x / l, y / l, z / l, (H[t3[0]] + H[t3[1]] + H[t3[2]]) / 3);
          key.set(kk, id);
        }
        cid[OFF[i] + k] = id;
      }
    }
    // (uniq holds x, y, z, h per corner)
    const NU = uniq.length / 4;
    for (let c = 0; c < NC; c++) { const u = cid[c]; CU[c * 3] = uniq[u * 4]; CU[c * 3 + 1] = uniq[u * 4 + 1]; CU[c * 3 + 2] = uniq[u * 4 + 2]; CH[c] = uniq[u * 4 + 3]; }
    // smooth normals: the faces' normals gathered at the centres and the corners
    const pos = (u, out) => { if (u < T) { const r = R + H[u]; out[0] = P[u * 3] * r; out[1] = P[u * 3 + 1] * r; out[2] = P[u * 3 + 2] * r; } else { const c = u - T, r = R + uniq[c * 4 + 3]; out[0] = uniq[c * 4] * r; out[1] = uniq[c * 4 + 1] * r; out[2] = uniq[c * 4 + 2] * r; } return out; };
    const NRM = new Float32Array((T + NU) * 3), A = [0, 0, 0], B = [0, 0, 0], C = [0, 0, 0];
    const tris = new Int32Array(NC * 4); // centre, corner a, corner b (as point ids), side
    for (let i = 0, q = 0; i < T; i++) {
      const n = NBS[i].length;
      for (let k = 0; k < n; k++, q++) {
        let a = T + cid[OFF[i] + (k + n - 1) % n], b = T + cid[OFF[i] + k];
        pos(i, A); pos(a, B); pos(b, C);
        const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (nx * A[0] + ny * A[1] + nz * A[2] < 0) { [a, b] = [b, a]; nx = -nx; ny = -ny; nz = -nz; } // facing out
        tris[q * 4] = i; tris[q * 4 + 1] = a; tris[q * 4 + 2] = b; tris[q * 4 + 3] = k;
        for (const u of [i, a, b]) { NRM[u * 3] += nx; NRM[u * 3 + 1] += ny; NRM[u * 3 + 2] += nz; }
      }
    }
    // colours: each tile its ground (the sea deepening away from the shore), softened at its corners
    const dist = new Int16Array(T).fill(-1), queue = [];
    for (let i = 0; i < T; i++) if (!isWater(i)) { dist[i] = 0; queue.push(i); }
    for (let q = 0; q < queue.length; q++) for (const j of NBS[queue[q]]) if (dist[j] < 0) { dist[j] = dist[queue[q]] + 1; queue.push(j); }
    const TC = new Float32Array(T * 3), c = new THREE.Color(), shallow = new THREE.Color("#2b8c96"), deep = new THREE.Color("#0a2f52"), abyss = new THREE.Color("#061c36");
    for (let i = 0; i < T; i++) {
      const t = ST.terrain[i];
      if (WATER.has(t)) { const k = t === "shallow" ? 0.15 * Math.min(dist[i], 3) : 0.35 + 0.1 * Math.min(dist[i], 6); c.copy(shallow).lerp(deep, Math.min(1, k)); if (dist[i] > 8) c.lerp(abyss, 0.6); }
      else c.set(t === "grass" ? GRASS_ZONE[ST.zone?.[i]] ?? GROUND.grass : GROUND[t] ?? hooks.terrain?.[t]?.[1] ?? "#888888");
      const f = 1 + (hash(i, 7) - 0.5) * 0.08; TC[i * 3] = c.r * f; TC[i * 3 + 1] = c.g * f; TC[i * 3 + 2] = c.b * f;
    }
    const CC = new Float32Array(NU * 3), CN = new Float32Array(NU);
    for (let i = 0; i < T; i++) for (let k = 0; k < NBS[i].length; k++) { const u = cid[OFF[i] + k]; CC[u * 3] += TC[i * 3]; CC[u * 3 + 1] += TC[i * 3 + 1]; CC[u * 3 + 2] += TC[i * 3 + 2]; CN[u]++; }
    // the mesh: three vertices a triangle (each knows its tile, its side, how far from the edge, wet or dry)
    const V = NC * 3, PA = new Float32Array(V * 3), NA = new Float32Array(V * 3), CA = new Float32Array(V * 3), TA = new Float32Array(V), IA = new Float32Array(V * 3);
    for (let q = 0; q < NC; q++) {
      const i = tris[q * 4], wet = isWater(i) ? 1 : 0;
      for (let s = 0; s < 3; s++) {
        const u = tris[q * 4 + s], v = q * 3 + s;
        pos(u, A); PA.set(A, v * 3);
        const nl = Math.hypot(NRM[u * 3], NRM[u * 3 + 1], NRM[u * 3 + 2]) || 1; NA[v * 3] = NRM[u * 3] / nl; NA[v * 3 + 1] = NRM[u * 3 + 1] / nl; NA[v * 3 + 2] = NRM[u * 3 + 2] / nl;
        if (s === 0) { CA[v * 3] = TC[i * 3]; CA[v * 3 + 1] = TC[i * 3 + 1]; CA[v * 3 + 2] = TC[i * 3 + 2]; }
        else { const cu = u - T, m = CN[cu] || 1; for (let ch = 0; ch < 3; ch++) CA[v * 3 + ch] = TC[i * 3 + ch] * 0.5 + CC[cu * 3 + ch] / m * 0.5; }
        TA[v] = i; IA[v * 3] = tris[q * 4 + 3]; IA[v * 3 + 1] = s === 0 ? 1 : 0; IA[v * 3 + 2] = wet;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(PA, 3)); g.setAttribute("normal", new THREE.BufferAttribute(NA, 3));
    g.setAttribute("color", new THREE.BufferAttribute(CA, 3)); g.setAttribute("aTile", new THREE.BufferAttribute(TA, 1)); g.setAttribute("aInfo", new THREE.BufferAttribute(IA, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R + 2);
    world.add(new THREE.Mesh(g, landMaterial()));
    // rivers: ribbons from tile to tile, smoothed, widening towards the sea
    const RB = new Ribbons();
    for (const path of ST.rivers || []) {
      if (path.length < 2) continue;
      let pts = path.map(i => dirOf(i));
      for (let it = 0; it < 2; it++) { const q = [pts[0]]; for (let k = 0; k < pts.length - 1; k++) { const a = pts[k], b = pts[k + 1]; q.push(a.clone().lerp(b, 0.25).normalize(), a.clone().lerp(b, 0.75).normalize()); } q.push(pts.at(-1)); pts = q; }
      const tiles = pts.map(p => nearestTile(p));
      RB.strip(pts, pts.map((p, k) => 0.12 + 0.2 * k / pts.length), pts.map((p, k) => surfAt(tiles[k], p) + 0.025), new THREE.Color("#3d93c9"));
    }
    if (RB.p.length) { const rm = new THREE.Mesh(RB.geometry(), new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0x5a6e7a, shininess: 80, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })); world.add(rm); }
    atmosphere(); need = true;
  }

  /** Strips along the ground: for roads, rails, rivers. Points are unit vectors; widths and heights per point. */
  class Ribbons {
    constructor() { this.p = []; this.c = []; this.n = []; }
    strip(pts, w, h, col) {
      const side = new THREE.Vector3(), dir = new THREE.Vector3(), up = new THREE.Vector3();
      let prev = null;
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k], a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
        dir.subVectors(b, a); up.copy(p); side.crossVectors(dir, up); if (side.lengthSq() < 1e-12) side.set(1, 0, 0); side.normalize().multiplyScalar((typeof w === "number" ? w : w[k]) / 2);
        const r = R + (typeof h === "number" ? h : h[k]), L = p.clone().multiplyScalar(r).add(side), Rr = p.clone().multiplyScalar(r).sub(side);
        if (prev) { this.tri(prev[0], L, prev[1], up, col); this.tri(prev[1], L, Rr, up, col); }
        prev = [L, Rr];
      }
    }
    tri(a, b, c, n, col) {
      // facing out
      const u = new THREE.Vector3().subVectors(b, a), v = new THREE.Vector3().subVectors(c, a), f = u.cross(v).dot(a) < 0;
      for (const p of f ? [a, c, b] : [a, b, c]) { this.p.push(p.x, p.y, p.z); this.c.push(col.r, col.g, col.b); const l = p.length(); this.n.push(p.x / l, p.y / l, p.z / l); }
    }
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
      return g;
    }
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
    clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.014, 128, 64), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uTime: U.uTime, uFade: { value: 1 } },
      vertexShader: "varying vec3 vP; varying vec3 vN; void main() { vP = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform float uTime, uFade; varying vec3 vP; varying vec3 vN;\n${NOISE_GLSL}
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
    const K = 2600, sp = new Float32Array(K * 3), ss = new Float32Array(K);
    for (let k = 0; k < K; k++) { const u = hash(k, 1) * 2 - 1, a = hash(k, 2) * Math.PI * 2, s = Math.sqrt(1 - u * u); sp.set([Math.cos(a) * s * 1500, u * 1500, Math.sin(a) * s * 1500], k * 3); ss[k] = 0.6 + Math.pow(hash(k, 3), 6) * 2.4; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3)); sg.setAttribute("aSize", new THREE.BufferAttribute(ss, 1));
    const stars = new THREE.Points(sg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uPx: { value: 1 } },
      vertexShader: "attribute float aSize; uniform float uPx; varying float vA; void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.99999; gl_PointSize = aSize * uPx; vA = clamp(aSize / 2.0, 0.25, 1.0); }",
      fragmentShader: "varying float vA; void main() { vec2 d = gl_PointCoord - 0.5; float a = (1.0 - smoothstep(0.1, 0.5, length(d))) * vA; gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a, a); }",
    }));
    stars.frustumCulled = false; stars.renderOrder = -5; air.add(stars); air.userData.stars = stars;
  }

  // ------------------------------------------------------------------ what stands on the land: towns, works, roads, woods
  const GEO = {
    box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), roof: new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
    cone: new THREE.ConeGeometry(0.5, 1, 7).translate(0, 0.5, 0), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0),
    blob: new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0), gem: new THREE.OctahedronGeometry(0.5, 0).translate(0, 0.5, 0),
  };
  const shared = new Set(Object.values(GEO));
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpR = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpC = new THREE.Color();
  /** A batch of shapes standing on the ball (each upright along its own "up"). */
  function parts() {
    const list = {};
    return {
      /** shape at direction q (unit), height h over the sea, w × ht × d, turned by ry about its up. */
      add(shape, q, h, w, ht, d, ry, color, glow = false) { (list[shape + (glow ? "*" : "")] ??= []).push([q.x, q.y, q.z, h, w, ht, d, ry, color]); },
      build() {
        const g = new THREE.Group();
        for (const [key, items] of Object.entries(list)) {
          const glow = key.endsWith("*"), shape = glow ? key.slice(0, -1) : key;
          const mat = glow ? new THREE.MeshStandardMaterial({ emissive: 0x8a5a00, emissiveIntensity: 2.4, roughness: 0.35, metalness: 0.4 }) : new THREE.MeshLambertMaterial({ flatShading: true });
          const m = new THREE.InstancedMesh(GEO[shape], mat, items.length);
          items.forEach(([x, y, z, h, w, ht, d, ry, c], k) => {
            tmpP.set(x, y, z); tmpQ.setFromUnitVectors(Y, tmpP); tmpR.setFromAxisAngle(Y, ry); tmpQ.multiply(tmpR);
            tmpM.compose(tmpP.multiplyScalar(R + h), tmpQ, tmpS.set(w, ht, d)); m.setMatrixAt(k, tmpM); m.setColorAt(k, tmpC.set(c));
          });
          m.computeBoundingSphere(); g.add(m);
        }
        return g;
      },
    };
  }
  // the woods: a few trees on each wooded tile, drawn only near (one instanced mesh a kind)
  let woods = null;
  function buildWoods() {
    if (woods) { scene.remove(woods); disposeTree(woods); }
    const Pt = parts(), q = new THREE.Vector3(), lite = quality === "lo";
    for (let i = 0; i < T; i++) {
      const t = ST.terrain[i], n = t === "forest" ? (lite ? 3 : 5) : t === "taiga" ? (lite ? 3 : 5) : t === "jungle" ? (lite ? 4 : 6) : t === "grass" && hash(i, 31) < 0.15 ? 1 : t === "hill" && hash(i, 33) < 0.4 ? 1 : 0;
      for (let j = 0; j < n; j++) {
        spotIn(i, Math.sqrt(hash(i, j, 9)) * 0.8, hash(i, j, 3) * 6.283, q);
        const h = surfAt(i, q) - 0.02, s = 0.22 + hash(i, j, 13) * 0.1, c = new THREE.Color(t === "taiga" ? "#2f5a3e" : t === "jungle" ? "#2c6a2c" : hash(i, j, 19) < 0.5 ? "#4b7f33" : "#5a8a35").multiplyScalar(0.9 + hash(j, i) * 0.2).getHex();
        if (t === "taiga") Pt.add("cone", q, h, s * 0.9, s * 2.4, s * 0.9, 0, c); else if (t === "hill") Pt.add("blob", q, h, s * 0.9, s * 0.5, s * 0.9, hash(i, 2) * 6, 0x9a8d7c); else Pt.add("blob", q, h, s, s * 1.5, s, hash(i, j) * 6, c);
      }
    }
    woods = Pt.build(); scene.add(woods);
  }

  let dyn = null;
  const flagTex = new Map();
  function flagTexture(flag) {
    const key = JSON.stringify(flag);
    if (!flagTex.has(key)) { const c = document.createElement("canvas"); c.width = 96; c.height = 64; hooks.drawFlag(c.getContext("2d"), 0, 0, 96, 64, flag, 1); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; flagTex.set(key, t); }
    return flagTex.get(key);
  }
  const flags = [];
  function buildDynamic() {
    if (dyn) { scene.remove(dyn); disposeTree(dyn, true); }
    dyn = new THREE.Group(); scene.add(dyn); flags.length = 0;
    const owners = S.owners, roads = S.roads || [], q = new THREE.Vector3();
    // roads and rails: branches from the centres, as on the 2D map; sea lanes faint
    const RB = new Ribbons(), hubs = new Set(), roadCols = ROAD_COLOR.map(c => c && new THREE.Color(c)), lane = new THREE.Color("#dcecf6");
    for (const n of S.nations) if (n.alive && n.founded) { hubs.add(n.capital); for (const st of n.settlements || []) hubs.add(st.tile); }
    const { parent, links, loose } = hooks.roadTree(hubs);
    const seg = (i, j, lv) => {
      if (loose.has(i) && owners[i] < 0 && owners[j] < 0) return; // roads gone wild are left off
      const a = dirOf(i), b = dirOf(j), pts = [], w = isWater(i) && isWater(j);
      for (let s = 0; s <= 4; s++) pts.push(a.clone().lerp(b, s / 4).normalize());
      const hs = pts.map((p, s) => (w ? 0.03 : surfAt(s < 2 ? i : j, p) + 0.035));
      if (w) { RB.strip(pts, 0.07, hs, lane); return; }
      if (lv >= 4) { RB.strip(pts, 0.26, hs, new THREE.Color("#4a4440")); RB.strip(pts, 0.08, hs.map(h => h + 0.012), new THREE.Color("#c8cdd2")); return; }
      RB.strip(pts, 0.09 + lv * 0.04, hs, roadCols[lv] || roadCols[1]);
    };
    for (let i = 0; i < T; i++) { const lv = roads[i] || 0, j = parent.get(i); if (lv && j !== undefined && j >= 0) seg(i, j, Math.min(lv, roads[j] || lv)); }
    for (const [i, h] of links) seg(i, h, roads[i] || 1);
    if (RB.p.length) dyn.add(new THREE.Mesh(RB.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })));
    // towns: houses round each centre (more for a bigger town), a keep and the flag at the capital
    const Pt = parts();
    for (const n of S.nations) {
      if (!n.alive || !n.founded) continue;
      const color = new THREE.Color(hooks.nationColor(n.id)), tierOf = new Map((n.provinces || []).map(p => [p.centre, p.tier || 0]));
      const hsl = {}; color.getHSL(hsl); const roof = new THREE.Color().setHSL(hsl.h, hsl.s * 0.6, clamp(hsl.l, 0.34, 0.52)).lerp(new THREE.Color("#a94f34"), 0.3).getHex();
      const centres = [n.capital, ...(n.settlements || []).map(s => s.tile)].filter(c => c >= 0 && owners[c] === n.id);
      for (const c of centres) {
        const tier = tierOf.get(c) ?? 0, cap = c === n.capital, count = [6, 11, 16][tier] + (cap ? 4 : 0);
        for (let k = 0; k < count; k++) {
          spotIn(c, 0.34 + 0.7 * Math.sqrt((k + 0.5) / count), k * 2.399 + hash(c, k) * 0.5, q);
          const h = surfAt(c, q) - 0.02, w = 0.17 + hash(k, c) * 0.07, ht = (0.13 + hash(c, k, 5) * 0.07) * (tier === 2 && k % 3 === 0 ? 2 : 1), ry = hash(c, k, 9) * 6.283;
          Pt.add("box", q, h, w, ht, w * 1.3, ry, ["#e9dfc8", "#ddd0b4", "#efe7d6", "#d2bf9a"][(c + k) % 4]);
          Pt.add("roof", q, h + ht, w * 1.05, w * 0.6, w * 1.35, ry, roof);
        }
        q.copy(dirOf(c));
        if (cap) {
          const h = surfAt(c, q) - 0.03;
          Pt.add("box", q, h, 0.42, 0.8, 0.42, 0.3, "#cfc3aa"); Pt.add("roof", q, h + 0.8, 0.46, 0.42, 0.46, 0.3, roof);
          for (let k = 0; k < 4; k++) { const tq2 = spotIn(c, 0.42, k * Math.PI / 2 + 0.3, new THREE.Vector3()), th = surfAt(c, tq2) - 0.03; Pt.add("cyl", tq2, th, 0.16, 0.55, 0.16, 0, "#c9bda4"); Pt.add("cone", tq2, th + 0.55, 0.22, 0.28, 0.22, 0, roof); }
          flags.push(makeFlag(n, q, h + 1.2));
        } else if (tier >= 1) { const h = surfAt(c, q) - 0.03; Pt.add("box", q, h, 0.2, 0.58, 0.2, 0.4, "#d6cab0"); Pt.add("roof", q, h + 0.58, 0.24, 0.26, 0.24, 0.4, roof); }
      }
      // works on the land: a small building each, scaffolding colour while going up
      const seen = new Map();
      for (const b of n.buildings || []) {
        if (b.kind === "housing") continue;
        const k = seen.get(b.tile) ?? 0; seen.set(b.tile, k + 1); if (k >= 6) continue;
        const cen = centres.includes(b.tile);
        spotIn(b.tile, cen ? 0.95 : 0.35 + 0.15 * k, k * 1.9 + hash(b.id, 3) * 0.6, q);
        const h = surfAt(b.tile, q) - 0.02, col = b.done ? KIND_COLOR[b.kind] || "#c4b08a" : "#d9c9a6";
        Pt.add("box", q, h, 0.28, b.done ? 0.2 : 0.1, 0.24, hash(b.id, 7) * 6, col);
        if (b.done) Pt.add("roof", q, h + 0.2, 0.28, 0.13, 0.28, hash(b.id, 7) * 6, "#6e5a44");
      }
    }
    // barbarian camps; wonders; rich seams
    for (const hd of S.hordes || []) {
      if (!hd.alive) continue;
      for (let k = 0; k < 5; k++) { spotIn(hd.tile, 0.35, k * 1.256, q); Pt.add("cone", q, surfAt(hd.tile, q) - 0.02, 0.22, 0.24, 0.22, 0, "#5b1e1a"); }
      q.copy(dirOf(hd.tile)); Pt.add("cone", q, H[hd.tile], 0.1, 0.18, 0.1, 0, "#ff7a2f", true);
      addLabel(dyn, hd.tile, `☠ ${hd.name} · ${hd.strength}`, "horde", 0.9);
    }
    for (const w of ST.wonders || []) { q.copy(dirOf(w.i)); Pt.add("gem", q, H[w.i] + 0.25, 0.4, 0.65, 0.4, 0, "#ffd84a", true); addLabel(dyn, w.i, `★ ${w.name}`, "wonder", 1.3); }
    for (const v of ST.veins || []) { spotIn(v.i, 0.5, 2.2, q); Pt.add("gem", q, surfAt(v.i, q) - 0.02, 0.18, 0.28, 0.18, 0, hooks.veinColor?.[v.good] || "#d9822b"); }
    dyn.add(Pt.build());
    for (const f of flags) dyn.add(f.group);
    // names: a banner over each capital and town, as on the flat map
    for (const n of S.nations) {
      if (!n.alive || !n.founded || n.capital < 0) continue;
      const col = hooks.nationColor(n.id), prov = new Map((n.provinces || []).map(p => [p.centre, p]));
      const cp = prov.get(n.capital);
      addBanner(dyn, n.capital, n.name, "capital", 1.6, col, n.population, cp?.tier ?? 0, cp?.tierName, n.capitalName || "");
      for (const s of n.settlements || []) if (owners[s.tile] === n.id) { const p = prov.get(s.tile); addBanner(dyn, s.tile, s.name, "town", 0.8, col, p?.people, p?.tier ?? 0, p?.tierName); }
    }
    need = true;
  }
  function makeFlag(n, q, h) {
    const g = new THREE.Group(), base = q.clone().multiplyScalar(R + h - 0.3);
    g.position.copy(base); g.quaternion.setFromUnitVectors(Y, q);
    const pole = new THREE.Mesh(GEO.cyl, new THREE.MeshLambertMaterial({ color: 0x4b3a2a })); pole.scale.set(0.035, 0.75, 0.035); g.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28, 8, 1).translate(0.21, 0, 0), new THREE.MeshLambertMaterial({ map: flagTexture(n.flag), side: THREE.DoubleSide }));
    cloth.position.set(0, 0.62, 0); g.add(cloth);
    return { group: g, cloth, base: cloth.geometry.attributes.position.array.slice(), phase: hash(n.id, 9) * 6 };
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

  // ------------------------------------------------------------------ caravans on their way (moving between turns)
  let movers = null, moveT0 = performance.now();
  function buildMovers() {
    if (movers) { scene.remove(movers); disposeTree(movers); }
    const list = (S.caravans || []).filter(c => c.path?.length > 1);
    movers = new THREE.InstancedMesh(GEO.box, new THREE.MeshLambertMaterial({ flatShading: true }), Math.max(1, list.length));
    movers.userData.list = list; movers.count = list.length; movers.frustumCulled = false; scene.add(movers); moveT0 = performance.now();
  }
  function updateMovers(now) {
    if (!movers?.userData.list.length) return;
    const turnPhase = Math.min(1, (now - moveT0) / 30000), q = new THREE.Vector3();
    movers.userData.list.forEach((c, k) => {
      const span = Math.max(1, c.arrive - (c.depart ?? c.arrive - 1)), f = clamp(((S.tick - (c.depart ?? S.tick)) + turnPhase) / span, 0, 1), L = c.path.length - 1, p = f * L, s = Math.min(L - 1, Math.floor(p));
      q.copy(dirOf(c.path[s])).lerp(dirOf(c.path[s + 1]), p - s).normalize();
      const air = c.mode === "air", h = air ? 1.2 + Math.sin(Math.PI * f) * 3 : Math.max(0.02, surfAt(nearestTile(q), q)) + 0.03;
      tmpQ.setFromUnitVectors(Y, q); tmpM.compose(tmpP.copy(q).multiplyScalar(R + h), tmpQ, tmpS.set(0.28, 0.16, 0.18)); movers.setMatrixAt(k, tmpM); movers.setColorAt(k, tmpC.set(hooks.nationColor(c.from)));
    });
    movers.instanceMatrix.needsUpdate = true; if (movers.instanceColor) movers.instanceColor.needsUpdate = true;
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
    return ray.ray.intersectSphere(ball, hit) ? hit.clone().normalize() : null;
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
  const ALT_MIN = 3, altMax = () => homeDist() * 1.25 - R;
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
    const d = camera.position.length(), alt = d - R, alt2 = clamp(alt * Math.exp(step), ALT_MIN, altMax()), k = alt2 / alt;
    if (Math.abs(k - 1) < 1e-6) { zoomVel = 0; return; }
    // the point under the pointer stays about where it is: the middle of the view moves towards it as much as the height falls
    let c = viewCentre();
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
    if (q !== was && ST) buildWoods(); // Nhanh: fewer trees
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
    const live = animOn || fxQueue.length;
    if (live) {
      U.uTime.value = now / 1000; updateMovers(now); updateFx(now);
      for (const f of flags) { const p = f.cloth.geometry.attributes.position, a = p.array; for (let k = 0; k < a.length; k += 3) a[k + 2] = f.base[k + 2] + Math.sin(now / 260 + f.phase + f.base[k] * 6) * 0.05 * f.base[k] * 2.2; p.needsUpdate = true; }
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
    if (need) {
      const d = camera.position.length(), alt = d - R;
      // near and far planes round what can be seen: from the eye to just past the horizon
      camera.near = Math.max(0.05, alt * 0.3 * Math.cos(tiltFor(d))); camera.far = Math.sqrt(Math.max(0, d * d - R * R)) + R * 0.6; camera.updateProjectionMatrix();
      U.uBand.value = clamp(alt * 0.0042, 0.07, 0.42);
      U.uNear.value = 1 - smooth(10, 40, alt);
      if (clouds) { clouds.visible = quality === "hi" && alt > 40; clouds.material.uniforms.uFade.value = smooth(40, 120, alt); } // the clouds only from high up: never over the land looked at
      if (woods) woods.visible = alt < (quality === "lo" ? 30 : 45);
      if (air?.userData.stars) { renderer.getDrawingBufferSize(tmpV2); air.userData.stars.material.uniforms.uPx.value = tmpV2.y / 900; }
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
      if (x.geometry && !shared.has(x.geometry)) x.geometry.dispose();
      if (x.material) { const ms = Array.isArray(x.material) ? x.material : [x.material]; for (const m of ms) if (!keepShared || !m.map) m.dispose(); }
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
    setStatic(st) { ST = st; buildWorld(); buildWoods(); placeCamera(); if (S) api3.setState(S); },
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
  if (/[?&#]m3debug/.test(location.search + location.hash)) window.__m3 = { api: api3, camera, controls, renderer, scene, viewCentre, placeFor }; // for checks in the browser only
  raf = requestAnimationFrame(frame);
  return api3;
}
