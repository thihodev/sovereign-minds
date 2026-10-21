// The world in 3D (Three.js): the same tiles, owners, roads, towns and events as the 2D map, lifted into relief.
// app.js loads this module only when the Watcher turns 3D on; it hands over the data and its own helpers (hooks)
// and gets picking and hovering back, so the inspector and everything else work as in 2D.
import * as THREE from "three";
import { MapControls } from "three/addons/MapControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/CSS2DRenderer.js";

const SQ3 = Math.sqrt(3);
const WATER = new Set(["ocean", "shallow"]);
const TREES = { forest: "blob", jungle: "blob", taiga: "cone" };
const ROAD_COLOR = [null, "#8a5a2e", "#a08a68", "#b9b9b4"];
const TONE = { good: "#4cc283", bad: "#ef6b60", "": "#ffd84a" };
const hash = (...k) => { let h = 2166136261; for (const x of k) { h ^= x; h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/** A builder of plain triangles with a colour each, for borders, fronts, roads and rivers. */
class Tris {
  constructor() { this.p = []; this.c = []; }
  quad(a, b, c, d, col) { for (const v of [a, b, c, a, c, d]) { this.p.push(v[0], v[1], v[2]); this.c.push(col.r, col.g, col.b); } }
  /** A flat band from A to B, `w` wide, lying over the ground. */
  band(A, B, w, col) {
    const dx = B[0] - A[0], dz = B[2] - A[2], L = Math.hypot(dx, dz) || 1, nx = -dz / L * w / 2, nz = dx / L * w / 2;
    this.quad([A[0] + nx, A[1], A[2] + nz], [B[0] + nx, B[1], B[2] + nz], [B[0] - nx, B[1], B[2] - nz], [A[0] - nx, A[1], A[2] - nz], col);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals();
    return g;
  }
}

/** Small shapes placed many times: one instanced mesh per shape, each copy with its own place, size, turn and colour. */
const SHAPES = {
  box: () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  roof: () => new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
  cone: () => new THREE.ConeGeometry(0.5, 1, 7).translate(0, 0.5, 0),
  peak: () => new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0),
  cyl: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0),
  blob: () => new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0),
  gem: () => new THREE.OctahedronGeometry(0.5, 0).translate(0, 0.5, 0),
  hull: () => { const g = new THREE.CylinderGeometry(0.5, 0.32, 1, 6, 1, false, 0, Math.PI); g.rotateZ(Math.PI / 2); g.rotateX(Math.PI); return g.translate(0, 0.25, 0); },
  sail: () => new THREE.ConeGeometry(0.5, 1, 3).translate(0, 0.5, 0),
  person: () => { const b = new THREE.ConeGeometry(0.32, 0.8, 6).translate(0, 0.4, 0), h = new THREE.SphereGeometry(0.2, 8, 6).translate(0, 0.95, 0); return mergeTwo(b, h); },
};
function mergeTwo(a, b) {
  const pa = a.toNonIndexed(), pb = b.toNonIndexed(), g = new THREE.BufferGeometry();
  for (const k of ["position", "normal"]) { const x = pa.getAttribute(k).array, y = pb.getAttribute(k).array, z = new Float32Array(x.length + y.length); z.set(x); z.set(y, x.length); g.setAttribute(k, new THREE.BufferAttribute(z, 3)); }
  return g;
}

export function create(container, hooks) {
  // ------------------------------------------------------------------ scene, camera, renderer
  const mobile = matchMedia("(pointer: coarse)").matches || Math.min(innerWidth, innerHeight) < 600;
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.shadowMap.enabled = !mobile; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // the land and the towns stand still: shadows are cast again only when they change
  const reshadow = () => { renderer.shadowMap.needsUpdate = true; };
  renderer.domElement.className = "map3d-canvas"; renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("aria-label", "Bản đồ thế giới 3D: kéo để di chuyển, chuột phải hoặc hai ngón để xoay, lăn để phóng to");
  container.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer(); labels.domElement.className = "map3d-labels"; container.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2000);
  const controls = new MapControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.12, screenSpacePanning: false, maxPolarAngle: 1.32, minDistance: 5, maxDistance: 320, zoomSpeed: 1.2 });
  const hemi = new THREE.HemisphereLight(0xdfefff, 0x3a3428, 1.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.55); sun.position.set(-90, 160, 70); scene.add(sun); scene.add(sun.target);
  Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 10, far: 500 });
  sun.castShadow = renderer.shadowMap.enabled; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.04;

  // ------------------------------------------------------------------ the world's shape
  let ST = null, S = null, N = 128, H = null, X0 = 0, Z0 = 0;
  const pos = i => { const c = i % N, r = (i / N) | 0; return [SQ3 * (c + 0.5 * (r & 1)) - X0, 1.5 * r - Z0]; };
  const top = i => (H ? H[i] : 0);
  const isWater = i => WATER.has(ST.terrain[i]);
  const NB = i => { const c = i % N, r = (i / N) | 0, D = r & 1 ? [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]] : [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]]; return D.map(([dc, dr]) => { const cc = c + dc, rr = r + dr; return cc >= 0 && cc < N && rr >= 0 && rr < N ? rr * N + cc : -1; }); };
  const at = (i, dy = 0) => { const [x, z] = pos(i); return new THREE.Vector3(x, top(i) + dy, z); };
  const corner = (i, k, inset = 0) => { const [x, z] = pos(i), a = Math.PI / 180 * (60 * k - 30), r = 1 - inset; return [x + r * Math.cos(a), z + r * Math.sin(a)]; };
  // the edge shared with neighbour k (E, NE, NW, W, SW, SE): its two corners
  const EDGE = [[0, 1], [5, 0], [4, 5], [3, 4], [2, 3], [1, 2]];

  function heights() {
    H = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) {
      const t = ST.terrain[i];
      if (WATER.has(t)) { H[i] = 0; continue; }
      const e = clamp(((ST.elev?.[i] ?? 40) / 100 - 0.22) / 0.6, 0, 1);
      let h = 0.12 + e * 0.6;
      if (t === "coast") h = 0.1;
      else if (t === "swamp") h = Math.min(h, 0.14);
      else if (t === "hill") h += 0.3;
      else if (t === "mountain") h += 0.7;
      else if (t === "glacier") h += 0.15;
      else if (t === "icewall") h = 1.8;
      // few broad steps: a lowland reads as one plain, not a staircase of hexes
      H[i] = Math.max(0.08, Math.round(h * 4) / 4);
    }
  }

  // land: one hexagonal column per tile; water: a thin hex per tile, with gentle waves
  const groups = { land: null, water: null, props: new THREE.Group(), lines: new THREE.Group(), moving: new THREE.Group(), fx: new THREE.Group(), labels: new THREE.Group() };
  for (const g of ["props", "lines", "moving", "fx", "labels"]) scene.add(groups[g]);
  const landIdx = [], waterIdx = [], slotOf = new Int32Array(128 * 128).fill(-1);
  const baseColor = [], tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
  const waterUniforms = { uTime: { value: 0 } };

  function buildTerrain() {
    for (const k of ["land", "water"]) if (groups[k]) { scene.remove(groups[k]); groups[k].geometry.dispose(); groups[k].material.dispose(); }
    landIdx.length = 0; waterIdx.length = 0;
    for (let i = 0; i < N * N; i++) (isWater(i) ? waterIdx : landIdx).push(i);
    const col = new THREE.CylinderGeometry(1, 1, 1, 6, 1).translate(0, 0.5, 0);
    const land = new THREE.InstancedMesh(col, new THREE.MeshLambertMaterial({ flatShading: true }), landIdx.length);
    land.castShadow = true; land.receiveShadow = true;
    landIdx.forEach((i, k) => { slotOf[i] = k; const [x, z] = pos(i); tmpM.compose(tmpP.set(x, -0.6, z), tmpQ.identity(), tmpS.set(1, H[i] + 0.6, 1)); land.setMatrixAt(k, tmpM); });
    const wgeo = new THREE.CylinderGeometry(1, 1, 0.5, 6, 1).translate(0, -0.25, 0);
    const wmat = new THREE.MeshPhongMaterial({ shininess: 70, specular: 0x557788, transparent: true, opacity: 0.94 });
    wmat.onBeforeCompile = sh => {
      sh.uniforms.uTime = waterUniforms.uTime;
      sh.vertexShader = "uniform float uTime;\nvarying vec3 vW;\n" + sh.vertexShader.replace("#include <project_vertex>", `
        vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        if (position.y > -0.01) transformed.y += 0.035 * sin(wp.x * 0.9 + uTime * 1.3) * cos(wp.z * 0.7 - uTime * 1.1);
        vW = wp.xyz;
        #include <project_vertex>`);
      sh.fragmentShader = "uniform float uTime;\nvarying vec3 vW;\n" + sh.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
        float ripple = sin(vW.x * 1.7 + uTime * 1.6) * sin(vW.z * 1.3 - uTime * 1.2);
        diffuseColor.rgb *= 0.93 + 0.07 * ripple;
        diffuseColor.rgb += vec3(0.05, 0.07, 0.08) * smoothstep(0.82, 1.0, ripple);`);
    };
    const water = new THREE.InstancedMesh(wgeo, wmat, waterIdx.length);
    water.receiveShadow = true;
    waterIdx.forEach((i, k) => { slotOf[i] = k; const [x, z] = pos(i); tmpM.compose(tmpP.set(x, 0, z), tmpQ.identity(), tmpS.set(1, 1, 1)); water.setMatrixAt(k, tmpM); });
    groups.land = land; groups.water = water; scene.add(land); scene.add(water); reshadow();
    for (let i = 0; i < N * N; i++) baseColor[i] = new THREE.Color(hooks.terrain[ST.terrain[i]]?.[1] ?? "#888888");
  }

  // ------------------------------------------------------------------ colours: owners, the picked nation, overlays
  let selected = -1, pinned = -1, layer = null;
  const GREY = new THREE.Color("#7a8088");
  function paint() {
    if (!groups.land || !S) return;
    const owners = S.owners, nc = new Map();
    const natCol = o => { if (!nc.has(o)) nc.set(o, new THREE.Color(hooks.nationColor(o))); return nc.get(o); };
    for (let i = 0; i < N * N; i++) {
      tmpC.copy(baseColor[i]);
      const o = owners[i];
      if (o >= 0) tmpC.lerp(natCol(o), isWater(i) ? 0.2 : 0.38);
      if (layer && layer.values[i] > 0) { const a = clamp(layer.values[i] / layer.max, 0, 1); tmpC.lerp(new THREE.Color(layer.threat ? "#e12d1e" : "#ffd400"), 0.15 + a * 0.6); }
      if (selected >= 0 && o !== selected) tmpC.lerp(GREY, 0.45).multiplyScalar(0.8);
      if (i === pinned) tmpC.lerp(new THREE.Color("#ffd84a"), 0.45);
      (isWater(i) ? groups.water : groups.land).setColorAt(slotOf[i], tmpC);
    }
    groups.land.instanceColor.needsUpdate = true; groups.water.instanceColor.needsUpdate = true;
    need = true;
  }

  // ------------------------------------------------------------------ the static decor: trees, peaks, rivers, wonders, veins
  let decor = null;
  function buildDecor() {
    if (decor) { scene.remove(decor); disposeTree(decor); }
    decor = new THREE.Group(); scene.add(decor);
    const P = parts(), PT = parts();
    for (let i = 0; i < N * N; i++) {
      const t = ST.terrain[i], [x, z] = pos(i), h = H[i];
      if (TREES[t]) {
        const k = t === "jungle" ? 3 : 2, dark = t === "jungle" ? "#2a6338" : t === "taiga" ? "#3a6650" : "#4a8045";
        for (let j = 0; j < k; j++) {
          const a = hash(i, j, 3) * 6.283, d = 0.2 + hash(j, i, 9) * 0.45, s = 0.24 + hash(i, j, 13) * 0.12;
          PT.add(TREES[t], x + Math.cos(a) * d, h, z + Math.sin(a) * d, t === "taiga" ? s * 0.9 : s * 1.2, t === "taiga" ? s * 2.4 : s * 1.3, t === "taiga" ? s * 0.9 : s * 1.2, 0, dark);
        }
      } else if (t === "mountain") P.add("peak", x, h, z, 0.55, 0.35 + hash(i, 1) * 0.3, 0.55, hash(i, 2) * 1, h >= 1.4 ? "#c9cdd0" : "#8b8179");
      else if (t === "icewall") { if (hash(i, 6) < 0.5) P.add("peak", x, h, z, 0.6, 0.4 + hash(i, 4) * 0.4, 0.6, hash(i, 5), "#f4fbff"); }
      else if (t === "swamp" && hash(i, 8) < 0.4) for (let j = 0; j < 2; j++) P.add("cyl", x + (hash(i, j, 21) - 0.5) * 0.8, h, z + (hash(j, i, 22) - 0.5) * 0.8, 0.04, 0.22, 0.04, 0, "#6a7a3a");
    }
    for (const w of ST.wonders || []) { const [x, z] = pos(w.i); P.add("gem", x, top(w.i) + 0.35, z, 0.45, 0.7, 0.45, 0, "#ffd84a", true); }
    for (const v of ST.veins || []) { const [x, z] = pos(v.i); P.add("gem", x - 0.45, top(v.i) + 0.05, z + 0.35, 0.22, 0.3, 0.22, 0, hooks.veinColor[v.good] || "#d9822b"); }
    decor.add(P.build());
    decor.userData.trees = PT.build(); decor.add(decor.userData.trees);
    // rivers: a band of water down their course
    const T = new Tris(), blue = new THREE.Color("#5fb4e6");
    for (const path of ST.rivers || []) for (let k = 1; k < path.length; k++) {
      const a = path[k - 1], b = path[k], [ax, az] = pos(a), [bx, bz] = pos(b);
      T.band([ax, top(a) + 0.03, az], [bx, top(b) + 0.03, bz], 0.36, blue);
    }
    const rm = new THREE.Mesh(T.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    rm.receiveShadow = true; decor.add(rm);
    // wonder names, shown up close
    for (const w of ST.wonders || []) addLabel(decor, w.i, `★ ${w.name}`, "wonder", 1.5);
    need = true; reshadow();
  }

  /** A batch of shapes for one rebuild. */
  function parts() {
    const list = {};
    return {
      add(shape, x, y, z, sx, sy, sz, ry, color, glow = false) { (list[shape + (glow ? "*" : "")] ??= []).push([x, y, z, sx, sy, sz, ry, color]); },
      build() {
        const g = new THREE.Group();
        for (const [key, items] of Object.entries(list)) {
          const glow = key.endsWith("*"), shape = glow ? key.slice(0, -1) : key;
          const mat = glow ? new THREE.MeshStandardMaterial({ emissive: 0x6a5200, roughness: 0.3, metalness: 0.5 }) : new THREE.MeshLambertMaterial({ flatShading: shape !== "blob" });
          const m = new THREE.InstancedMesh(geo(shape), mat, items.length);
          m.castShadow = true; m.receiveShadow = true;
          items.forEach(([x, y, z, sx, sy, sz, ry, c], k) => { tmpQ.setFromAxisAngle(Y_AXIS, ry); tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz)); m.setMatrixAt(k, tmpM); m.setColorAt(k, tmpC.set(c)); });
          g.add(m);
        }
        return g;
      },
    };
  }
  const Y_AXIS = new THREE.Vector3(0, 1, 0), GEO = {};
  const geo = k => (GEO[k] ??= SHAPES[k]());

  // ------------------------------------------------------------------ what changes each turn: borders, roads, towns, works, flags
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
  function buildDynamic() {
    if (dyn) { scene.remove(dyn); disposeTree(dyn, true); }
    dyn = new THREE.Group(); scene.add(dyn); flags.length = 0;
    const owners = S.owners, roads = S.roads || [];
    // borders: a low wall in the owner's colour along every edge where the land changes hands; a war front taller, striped
    const T = new Tris(), F = new Tris(), cols = new Map(), colOf = o => { if (!cols.has(o)) cols.set(o, new THREE.Color(hooks.nationColor(o))); return cols.get(o); };
    const atWar = new Set((S.wars || []).flatMap(w => [`${w.a}:${w.b}`, `${w.b}:${w.a}`]));
    const yellow = new THREE.Color("#ffc828"), black = new THREE.Color("#16120a");
    for (let i = 0; i < N * N; i++) {
      const o = owners[i]; if (o < 0) continue;
      const nb = NB(i), y0 = top(i) + 0.01;
      for (let k = 0; k < 6; k++) {
        const j = nb[k], oj = j >= 0 ? owners[j] : -1;
        if (oj === o) continue;
        const [c1, c2] = EDGE[k], a = corner(i, c1, 0.05), b = corner(i, c2, 0.05);
        const front = oj >= 0 && atWar.has(`${o}:${oj}`), hgt = front ? 0.42 : 0.2;
        if (!front) { const a2 = corner(i, c1, 0.26), b2 = corner(i, c2, 0.26), yb = y0 + 0.012; T.quad([a[0], yb, a[1]], [b[0], yb, b[1]], [b2[0], yb, b2[1]], [a2[0], yb, a2[1]], colOf(o)); }
        if (front) { const steps = 3; for (let s = 0; s < steps; s++) { const t0 = s / steps, t1 = (s + 1) / steps, p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], p1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]; F.quad([p0[0], y0, p0[1]], [p1[0], y0, p1[1]], [p1[0], y0 + hgt, p1[1]], [p0[0], y0 + hgt, p0[1]], (s + k) % 2 ? yellow : black); } }
        else T.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y0 + hgt, b[1]], [a[0], y0 + hgt, a[1]], colOf(o));
      }
    }
    const wallMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    dyn.add(new THREE.Mesh(T.geometry(), wallMat));
    if (F.p.length) dyn.add(new THREE.Mesh(F.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
    // roads: a band from each road tile to each road neighbour; sea lanes pale on the water
    // roads: branches from the centres, as on the 2D map (a mesh of every touching pair reads as a web of triangles)
    const R = new Tris(), lane = new THREE.Color("#e8f4ff"), hubs = new Set();
    for (const n of S.nations) if (n.alive && n.founded) { hubs.add(n.capital); for (const st of n.settlements || []) hubs.add(st.tile); }
    const { parent, links, loose } = hooks.roadTree(hubs);
    const seg = (i, j, lv) => {
      const w = isWater(i) && isWater(j), wild = loose.has(i) && owners[i] < 0 && owners[j] < 0;
      if (wild) return; // roads gone wild are left off the 3D map: they only clutter it
      const [x, z] = pos(i), [x2, z2] = pos(j);
      R.band([x, top(i) + 0.05, z], [x2, top(j) + 0.05, z2], w ? 0.07 : 0.1 + lv * 0.03, w ? lane : new THREE.Color(ROAD_COLOR[lv] || ROAD_COLOR[1]));
    };
    for (let i = 0; i < N * N; i++) { const lv = roads[i] || 0, j = parent.get(i); if (lv && j !== undefined && j >= 0) seg(i, j, Math.min(lv, roads[j] || lv)); }
    for (const [i, h] of links) seg(i, h, roads[i] || 1);
    if (R.p.length) { const rm = new THREE.Mesh(R.geometry(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); rm.receiveShadow = true; dyn.add(rm); }

    // towns and works
    const P = parts();
    for (const n of S.nations) {
      if (!n.alive || !n.founded) continue;
      const color = hooks.nationColor(n.id), tierOf = new Map((n.provinces || []).map(p => [p.centre, p.tier || 0]));
      const centres = [n.capital, ...(n.settlements || []).map(s => s.tile)].filter(c => S.owners[c] === n.id);
      for (const c of centres) {
        if (c < 0) continue;
        const [x, z] = pos(c), h = top(c), tier = tierOf.get(c) ?? 0, cap = c === n.capital;
        const houses = [3, 6, 11][tier] + (cap ? 2 : 0), small = tier === 2 ? 0.85 : 1.15;
        P.add("cyl", x, h - 0.03, z, cap ? 1.5 : 1.25, 0.05, cap ? 1.5 : 1.25, 0, new THREE.Color(color).lerp(new THREE.Color("#e8dcc2"), 0.55).getStyle());
        for (let k = 0; k < houses; k++) {
          const a = k * 2.399 + hash(c, k) * 0.5, d = 0.22 + Math.sqrt(k / houses) * 0.58, hx = x + Math.cos(a) * d, hz = z + Math.sin(a) * d;
          const w = (0.24 + hash(k, c) * 0.08) * small, ht = (0.18 + hash(c, k, 5) * 0.08) * small * (tier === 2 && k % 4 === 0 ? 2.2 : 1);
          P.add("box", hx, h, hz, w, ht, w * 1.2, a, "#e8dcc2"); P.add("roof", hx, h + ht, hz, w * 1.05, w * 0.7, w * 1.25, a, color);
        }
        if (cap) { P.add("box", x - 0.1, h, z + 0.1, 0.4, 0.55, 0.4, 0.3, "#d8ccb0"); P.add("roof", x - 0.1, h + 0.55, z + 0.1, 0.48, 0.38, 0.48, 0.3, color); }
        if (tier === 2) P.add("cyl", x + 0.55, h, z - 0.3, 0.14, 0.6, 0.14, 0, "#cbbd9c");
      }
      if (n.capital >= 0) flags.push(makeFlag(n));
      // works on the land (homes are counted in the towns above)
      const onCentre = new Map();
      for (const b of n.buildings || []) {
        if (b.kind === "housing") continue;
        const [x, z] = pos(b.tile), h = top(b.tile), d = b.done, r = hash(b.id, 7) * 6.28;
        const centre = centres.includes(b.tile);
        let ox = 0, oz = 0;
        if (centre) { const k = onCentre.get(b.tile) ?? 0; onCentre.set(b.tile, k + 1); const a = k * 1.1 + 0.6, dd = 0.72; ox = Math.cos(a) * dd; oz = Math.sin(a) * dd; }
        const X = x + ox, Z = z + oz, scaf = d ? 1 : 0.55, wood = "#9b7448";
        if (!d) { P.add("box", X, h, Z, 0.26, 0.2, 0.26, r, "#c9b58f"); continue; } // scaffolding
        switch (b.type) {
          case "field": for (let s = 0; s < 3; s++) P.add("box", x + (s - 1) * 0.42, h, z, 0.36, 0.035, 1.2, Math.PI / 6, s % 2 ? "#c9b84f" : "#9dbb3e"); break;
          case "pen": for (let s = 0; s < 6; s++) { const a = s * Math.PI / 3; P.add("box", X + Math.cos(a) * 0.38, h, Z + Math.sin(a) * 0.38, 0.4, 0.08, 0.03, -a + Math.PI / 2, wood); } P.add("blob", X - 0.1, h, Z, 0.16, 0.12, 0.22, r, "#f0ece0"); P.add("blob", X + 0.12, h, Z + 0.1, 0.14, 0.11, 0.2, r + 1, "#6b4b33"); break;
          case "pier": case "harbor": case "fish_dock": {
            const sea = NB(b.tile).findIndex(j => j >= 0 && isWater(j)), a = sea >= 0 ? -(sea * 60) * Math.PI / 180 : 0, big = b.type === "harbor" ? 1.6 : 1;
            P.add("box", x + Math.cos(a) * 0.75, Math.max(0.02, h - 0.05), z + Math.sin(a) * 0.75, 0.9 * big, 0.06, 0.22 * big, -a, wood);
            if (b.type === "harbor") P.add("box", x + Math.cos(a) * 0.35, h, z + Math.sin(a) * 0.35, 0.3, 0.35, 0.3, -a, "#b9a682");
            if (b.type === "fish_dock") P.add("box", X, h, Z, 0.2, 0.14, 0.2, r, "#a0855f");
            break;
          }
          case "salt_pan": for (let s = 0; s < 4; s++) P.add("box", x + (s % 2 - 0.5) * 0.45, h, z + ((s >> 1) - 0.5) * 0.45, 0.38, 0.03, 0.38, 0, "#f5f5f0"); break;
          case "temple": P.add("box", X, h, Z, 0.42, 0.08, 0.42, r, "#eeeae0"); P.add("box", X, h + 0.08, Z, 0.32, 0.25, 0.32, r, "#f4f1ea"); P.add("roof", X, h + 0.33, Z, 0.36, 0.2, 0.36, r, "#d9cfb8"); break;
          case "altar": P.add("box", X, h, Z, 0.18, 0.12, 0.18, r, "#9a958c"); P.add("cone", X, h + 0.12, Z, 0.1, 0.16, 0.1, 0, "#ff9a3c"); break;
          case "palisade": for (let s = 0; s < 14; s++) { const a = s / 14 * 6.283; P.add("cyl", x + Math.cos(a) * 0.9, h, z + Math.sin(a) * 0.9, 0.07, 0.3, 0.07, 0, wood); } break;
          case "well": P.add("cyl", X, h, Z, 0.18, 0.1, 0.18, 0, "#8e8a82"); break;
          case "market": P.add("box", X, h, Z, 0.36, 0.12, 0.3, r, "#c49a5a"); P.add("roof", X, h + 0.12, Z, 0.44, 0.14, 0.38, r, "#e2b13c"); break;
          case "kiln": P.add("cone", X, h, Z, 0.26, 0.26, 0.26, 0, "#a5532e"); break;
          case "workshop": P.add("box", X, h, Z, 0.3, 0.14, 0.24, r, "#b39b74"); P.add("roof", X, h + 0.14, Z, 0.32, 0.1, 0.26, r, "#6e5a44"); break;
          case "pit": P.add("cyl", X, h - 0.02, Z, 0.24, 0.04, 0.24, 0, "#5a4a36"); break;
          case "border_gate": P.add("box", X - 0.18, h, Z, 0.07, 0.34, 0.07, 0, wood); P.add("box", X + 0.18, h, Z, 0.07, 0.34, 0.07, 0, wood); P.add("roof", X, h + 0.34, Z, 0.5, 0.16, 0.22, 0, color); P.add("box", X + 0.3, h, Z + 0.22, 0.2, 0.1, 0.16, r, "#c49a5a"); break;
          default: P.add("box", X, h, Z, 0.24 * scaf, 0.16, 0.24, r, "#bfae8c"); P.add("roof", X, h + 0.16, Z, 0.27, 0.12, 0.27, r, hooks.kindColor?.[b.kind] || "#7b6a55");
        }
      }
    }
    // barbarian camps
    for (const hd of S.hordes || []) {
      const [x, z] = pos(hd.tile), h = top(hd.tile);
      for (let k = 0; k < 4; k++) { const a = k * 1.57 + 0.4; P.add("cone", x + Math.cos(a) * 0.38, h, z + Math.sin(a) * 0.38, 0.26, 0.34, 0.26, 0, "#5b1e1a"); }
      P.add("cone", x, h, z, 0.12, 0.25, 0.12, 0, "#ff7a2f");
      addLabel(dyn, hd.tile, `☠ ${hd.name} · ${hd.strength}`, "horde", 1.0);
    }
    dyn.add(P.build());
    for (const f of flags) dyn.add(f.group);
    // names
    for (const n of S.nations) {
      if (!n.alive || !n.founded || n.capital < 0) continue;
      addLabel(dyn, n.capital, `${n.name}`, "capital", 2.6, n.capitalName ? `${n.capitalName} · ${n.population}👤` : "");
      for (const s of n.settlements || []) if (S.owners[s.tile] === n.id) addLabel(dyn, s.tile, s.name, "town", 1.0);
    }
    need = true; reshadow();
  }
  function makeFlag(n) {
    const g = new THREE.Group(), [x, z] = pos(n.capital), h = top(n.capital);
    const pole = new THREE.Mesh(geo("cyl"), new THREE.MeshLambertMaterial({ color: 0x5b4a36 })); pole.scale.set(0.05, 1.25, 0.05); pole.position.set(x + 0.2, h + 0.42, z); pole.castShadow = true; g.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.44, 8, 1).translate(0.33, 0, 0), new THREE.MeshLambertMaterial({ map: flagTexture(n.flag), side: THREE.DoubleSide }));
    cloth.position.set(x + 0.2, h + 1.42, z); cloth.castShadow = true; g.add(cloth);
    const base = cloth.geometry.attributes.position.array.slice();
    return { group: g, cloth, base, phase: hash(n.id, 9) * 6 };
  }

  // ------------------------------------------------------------------ labels (HTML over the canvas: crisp Vietnamese at any zoom)
  const allLabels = [];
  function addLabel(parent, i, text, kind, dy, sub = "") {
    const el = document.createElement("div"); el.className = `m3-label m3-${kind}`;
    el.textContent = text;
    if (sub) { const s = document.createElement("small"); s.textContent = sub; el.appendChild(s); }
    const o = new CSS2DObject(el); o.position.copy(at(i, dy)); o.userData.kind = kind; parent.add(o); allLabels.push(o);
    return o;
  }
  const SHOW_AT = { capital: 400, town: 120, wonder: 70, horde: 80, fx: 1e9 };
  const RANK = { capital: 0, town: 1, horde: 2, wonder: 3 }, tmpV = new THREE.Vector3();
  function cullLabels() {
    const d = camera.position.distanceTo(controls.target);
    if (decor?.userData.trees) decor.userData.trees.visible = d < 110;
    for (const o of allLabels) if (o.parent) o.visible = d < (SHOW_AT[o.userData.kind] ?? 100);
    // a label that would cover one more important (or one placed before it) steps aside
    const W = container.clientWidth, H = container.clientHeight, placed = [];
    const list = allLabels.filter(o => o.parent && o.visible).sort((a, b) => (RANK[a.userData.kind] ?? 9) - (RANK[b.userData.kind] ?? 9));
    for (const o of list) {
      o.getWorldPosition(tmpV).project(camera);
      if (tmpV.z > 1 || tmpV.x < -1.2 || tmpV.x > 1.2 || tmpV.y < -1.2 || tmpV.y > 1.2) { o.visible = false; continue; }
      const x = (tmpV.x + 1) / 2 * W, y = (1 - tmpV.y) / 2 * H, el = o.element;
      if (el.offsetWidth) { o.userData.w = el.offsetWidth; o.userData.h = el.offsetHeight; }
      const w = (o.userData.w ?? el.textContent.length * 7 + 14) / 2 + 2, h = (o.userData.h ?? 20) / 2 + 1;
      if (placed.some(r => x - w < r[2] && x + w > r[0] && y - h < r[3] && y + h > r[1])) { o.visible = false; continue; }
      placed.push([x - w, y - h, x + w, y + h]);
    }
  }

  // ------------------------------------------------------------------ what moves: caravans, boats, people at work
  let movers = null, moveT0 = performance.now();
  function buildMovers() {
    if (movers) { scene.remove(movers.group); disposeTree(movers.group); }
    const list = [];
    for (const c of S.caravans || []) if (c.path?.length > 1) list.push({ kind: c.mode === "water" ? "boat" : "cart", c, color: hooks.nationColor(c.from) });
    for (const n of S.nations) {
      if (!n.alive || !n.founded) continue;
      const color = hooks.nationColor(n.id), unit = Math.max(1, Math.ceil(n.population / 120)), centres = [n.capital, ...(n.settlements || []).map(s => s.tile)];
      const home = t => centres.reduce((b, c) => (dist(c, t) < dist(b, t) ? c : b), centres[0]);
      for (const w of n.work || []) {
        const from = home(w.tile);
        if (w.role === "fish") {
          const shore = isWater(w.tile) ? shoreOf(n, w.tile) : w.tile, sea = isWater(w.tile) ? w.tile : NB(w.tile).find(j => j >= 0 && isWater(j));
          if (shore >= 0 && sea !== undefined && sea >= 0) { for (let k = 0; k < Math.min(3, Math.max(1, Math.round(w.n / unit / 2))); k++) list.push({ kind: "fishing", a: shore, b: sea, k, color, ph: hash(w.tile, k, n.id) }); continue; }
        }
        for (let k = 0; k < Math.min(3, Math.max(1, Math.round(w.n / unit))); k++) list.push({ kind: "walker", a: from, b: w.tile, k, color, ph: hash(w.tile, k, n.id, w.role.length) });
      }
      // boats at rest at the piers
      if ((n.stock?.boat || 0) >= 1) for (const b of (n.buildings || []).filter(b => b.done && (b.type === "pier" || b.type === "harbor"))) {
        const sea = NB(b.tile).find(j => j >= 0 && isWater(j)); if (sea === undefined || sea < 0) continue;
        for (let k = 0; k < Math.min(3, Math.floor(n.stock.boat)); k++) list.push({ kind: "moored", a: b.tile, b: sea, k, color, ph: hash(b.tile, k) });
      }
    }
    // one instanced mesh per shape, rewritten each frame
    const counts = { hull: 0, sail: 0, box: 0, blob: 0, person: 0 };
    for (const m of list) { if (m.kind === "walker") counts.person++; else if (m.kind === "cart") { counts.box++; counts.blob += 2; } else { counts.hull++; if (m.kind !== "moored") counts.sail++; } }
    const group = new THREE.Group(), meshes = {};
    for (const [k, c] of Object.entries(counts)) { if (!c) continue; const m = new THREE.InstancedMesh(geo(k), new THREE.MeshLambertMaterial({ flatShading: true }), c); m.frustumCulled = false; meshes[k] = m; group.add(m); }
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
  const pointOnPath = (path, f) => { const L = path.length - 1, p = clamp(f, 0, 1) * L, k = Math.min(L - 1, Math.floor(p)), t = p - k, A = at(path[k], 0.02), B = at(path[k + 1], 0.02); return [A.lerp(B, t), Math.atan2(-(B.z - A.z), B.x - A.x)]; };
  function updateMovers(now) {
    if (!movers) return;
    const near = camera.position.distanceTo(controls.target) < 140, M = movers.meshes, idx = { hull: 0, sail: 0, box: 0, blob: 0, person: 0 };
    const put = (k, x, y, z, sx, sy, sz, ry, color) => { const m = M[k]; if (!m) return; tmpQ.setFromAxisAngle(Y_AXIS, ry); tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz)); m.setMatrixAt(idx[k], tmpM); m.setColorAt(idx[k]++, tmpC.set(color)); };
    const hide = k => { const m = M[k]; if (!m) return; tmpM.makeScale(0, 0, 0); m.setMatrixAt(idx[k]++, tmpM); };
    const turnPhase = Math.min(1, (now - moveT0) / 30000);
    for (const m of movers.list) {
      if (m.kind === "cart" || (m.kind === "boat" && m.c)) {
        const c = m.c, span = Math.max(1, c.arrive - (c.depart ?? c.arrive - 1)), f = ((S.tick - (c.depart ?? S.tick)) + turnPhase) / span;
        const [p, a] = pointOnPath(c.path, f);
        if (m.kind === "cart") { put("box", p.x, p.y, p.z, 0.32, 0.18, 0.2, a, "#8a6a42"); put("blob", p.x + Math.cos(a) * 0.3, p.y, p.z - Math.sin(a) * 0.3, 0.16, 0.16, 0.2, a, "#6b4b33"); put("blob", p.x + Math.cos(a) * 0.3 + 0.08, p.y, p.z - Math.sin(a) * 0.3 + 0.08, 0.16, 0.16, 0.2, a, "#6b4b33"); }
        else { put("hull", p.x, 0.0, p.z, 0.55, 0.3, 0.3, a, m.color); put("sail", p.x, 0.12, p.z, 0.2, 0.55, 0.05, a, "#f4efe2"); }
        continue;
      }
      if (!near) { if (m.kind === "walker") hide("person"); else { hide("hull"); if (m.kind !== "moored") hide("sail"); } continue; }
      const A = at(m.a, 0.02), B = at(m.b, 0.02), off = (m.k - 1) * 0.28;
      if (m.kind === "walker") {
        const period = 9000 + m.ph * 5000, t = ((now / period) + m.ph) % 1, leg = t < 0.4 ? ease(t / 0.4) : t < 0.6 ? 1 : 1 - ease((t - 0.6) / 0.4);
        const p = A.clone().lerp(B, leg), a = Math.atan2(-(B.z - A.z), B.x - A.x);
        put("person", p.x + Math.sin(a) * off, p.y + (t >= 0.4 && t < 0.6 ? Math.abs(Math.sin(now / 160 + m.k)) * 0.04 : 0), p.z + Math.cos(a) * off, 0.22, 0.22, 0.22, a, m.color);
      } else if (m.kind === "fishing") {
        const t = ((now / (12000 + m.ph * 6000)) + m.ph) % 1, leg = t < 0.3 ? ease(t / 0.3) : t < 0.75 ? 1 : 1 - ease((t - 0.75) / 0.25);
        const p = A.clone().lerp(B, 0.35 + 0.65 * leg), a = Math.atan2(-(B.z - A.z), B.x - A.x) + (t >= 0.75 ? Math.PI : 0);
        const bob = Math.sin(now / 420 + m.k * 1.7) * 0.03;
        put("hull", p.x + off, bob, p.z + off * 0.4, 0.5, 0.28, 0.28, a, m.color); put("sail", p.x + off, 0.12 + bob, p.z + off * 0.4, 0.18, 0.5, 0.05, a, "#f4efe2");
      } else {
        const p = A.clone().lerp(B, 0.6), bob = Math.sin(now / 600 + m.k) * 0.02;
        put("hull", p.x + (m.k - 1) * 0.3, bob, p.z + (m.k - 1) * 0.12, 0.45, 0.26, 0.26, 0.4, m.color);
      }
    }
    for (const m of Object.values(M)) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
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
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.95, 6), new THREE.MeshBasicMaterial({ color: tone, transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false }));
    ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI / 6; ring.position.copy(at(tile, 0.2)); ring.renderOrder = 5; g.add(ring);
    if (f.path?.length > 1) {
      const pts = f.path.map(i => at(i, 0.12)), line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xfff4cf, dashSize: 0.5, gapSize: 0.35 }));
      line.computeLineDistances(); g.add(line);
    }
    const el = document.createElement("div"); el.className = `m3-fx ${hooks.fxTone(f)}`; el.textContent = hooks.fxWord(f);
    const label = new CSS2DObject(el); label.position.copy(at(tile, 1.2)); g.add(label);
    if (["battle", "raid", "fire", "eruption", "riot"].includes(f.kind)) for (let k = 0; k < 6; k++) smoke.push(puff(at(tile, 0.2), k, f.kind === "battle" || f.kind === "raid" ? "#ff8a3c" : "#ff6a2a"));
    q.g = g; q.ring = ring; q.label = label; q.el = el; q.started = true;
    q.done = () => { groups.fx.remove(g); disposeTree(g, true); el.remove(); };
  }
  function puff(p, k, color) {
    const m = new THREE.Mesh(geo("blob"), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    m.position.copy(p).add(new THREE.Vector3((hash(k, 1) - 0.5) * 0.6, 0, (hash(k, 2) - 0.5) * 0.6)); m.scale.setScalar(0.2);
    groups.fx.add(m);
    return { m, t0: performance.now() + k * 180, dur: 2600, base: m.position.clone() };
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
      s.m.position.set(s.base.x, s.base.y + t * 1.6, s.base.z); s.m.scale.setScalar(0.2 + t * 0.5); s.m.material.opacity = 0.8 * (1 - t);
      if (t > 0.35) s.m.material.color.lerp(new THREE.Color("#555555"), 0.08);
    }
    for (let k = smoke.length - 1; k >= 0; k--) if (smoke[k].dead) smoke.splice(k, 1);
    // smoke over the fields of the wars now on
    if (S && now - (updateFx.last || 0) > 900) {
      updateFx.last = now;
      for (const w of S.wars || []) if (w.lastTile >= 0 && w.lastTile !== undefined) smoke.push(puff(at(w.lastTile, 0.25), Math.floor(now / 900), "#9a9a9a"));
    }
  }

  // ------------------------------------------------------------------ the pinned tile's outline
  let hoverMesh = null, hovered = -1;
  function outline(i, color, lift) {
    const pts = []; for (let k = 0; k <= 6; k++) { const [x, z] = corner(i, k % 6); pts.push(new THREE.Vector3(x, top(i) + lift, z)); }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false }));
  }
  function setHover(i) {
    if (i === hovered) return;
    hovered = i;
    if (hoverMesh) { scene.remove(hoverMesh); hoverMesh.geometry.dispose(); hoverMesh.material.dispose(); hoverMesh = null; }
    if (i >= 0 && i !== pinned && H) { hoverMesh = outline(i, 0xffffff, 0.05); hoverMesh.renderOrder = 6; scene.add(hoverMesh); }
    need = true;
  }
  let pinMesh = null;
  function updatePin() {
    if (pinMesh) { scene.remove(pinMesh); pinMesh.geometry.dispose(); pinMesh = null; }
    if (pinned < 0 || !H) return;
    const pts = []; for (let k = 0; k <= 6; k++) { const [x, z] = corner(pinned, k % 6); pts.push(new THREE.Vector3(x, top(pinned) + 0.06, z)); }
    pinMesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffd84a }));
    scene.add(pinMesh); need = true;
  }

  // ------------------------------------------------------------------ picking: which tile is under the pointer
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function tileAt(ev) {
    if (!groups.land) return -1;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([groups.land, groups.water], false)[0];
    if (!hit) return -1;
    return hit.object === groups.land ? landIdx[hit.instanceId] : waterIdx[hit.instanceId];
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
    if (i < 0 || !H) return;
    const p = at(i), d = close ? 18 : Math.min(camera.position.distanceTo(controls.target), 45);
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (close || dir.y > 0.9) { const flat = Math.hypot(dir.x, dir.z) || 1; dir.set(dir.x / flat * 0.55, 0.83, dir.z / flat * 0.55); if (!Number.isFinite(dir.x) || (dir.x === 0 && dir.z === 0)) dir.set(0, 0.69, 0.72); dir.normalize(); }
    fly = { t0: performance.now(), dur: 700, fromT: controls.target.clone(), toT: p, fromC: camera.position.clone(), toC: p.clone().add(dir.multiplyScalar(d)) };
  }
  function turn(a) {
    const off = camera.position.clone().sub(controls.target).applyAxisAngle(Y_AXIS, a);
    fly = { t0: performance.now(), dur: 250, fromT: controls.target.clone(), toT: controls.target.clone(), fromC: camera.position.clone(), toC: controls.target.clone().add(off) };
  }
  /** North up again; `down`: look straight down (or back to the usual tilt if already). */
  function faceNorth(down) {
    const d = camera.position.distanceTo(controls.target), off = camera.position.clone().sub(controls.target).normalize();
    const flat = down && off.y < 0.97 ? new THREE.Vector3(0, 0.999, 0.045) : new THREE.Vector3(0, 0.86, 0.5);
    fly = { t0: performance.now(), dur: 500, fromT: controls.target.clone(), toT: controls.target.clone(), fromC: camera.position.clone(), toC: controls.target.clone().add(flat.normalize().multiplyScalar(d)) };
  }
  function zoom(f) {
    const dir = camera.position.clone().sub(controls.target), d = clamp(dir.length() / f, controls.minDistance, controls.maxDistance);
    fly = { t0: performance.now(), dur: 300, fromT: controls.target.clone(), toT: controls.target.clone(), fromC: camera.position.clone(), toC: controls.target.clone().add(dir.setLength(d)) };
  }
  /** Where the camera sees the whole world: far enough for its width and its depth at this screen's shape. */
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
  function home() {
    // the free part of the screen sees tan(fov/2) × its share of the height, up and across
    const R = view(), H = Math.max(1, container.clientHeight), half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), w = X0 + 4, d = Z0 + 6;
    const dist = Math.max(w / (half * R.w / H), d / (half * R.h / H) * 0.95) * 1.15; // the near edge looks wider: a little more room
    return new THREE.Vector3(0, dist * 0.86, dist * 0.5);
  }
  function fit() { fly = { t0: performance.now(), dur: 700, fromT: controls.target.clone(), toT: new THREE.Vector3(0, 0, 0), fromC: camera.position.clone(), toC: home() }; }

  // ------------------------------------------------------------------ the loop
  let need = true, running = true, raf = 0, animOn = hooks.anim?.() ?? true;
  controls.addEventListener("change", () => { need = true; });
  function resize() {
    const w = Math.max(100, container.clientWidth), h = Math.max(100, container.clientHeight);
    renderer.setSize(w, h, false); labels.setSize(w, h); camera.aspect = w / h; lastView = ""; aim(); camera.updateProjectionMatrix(); need = true;
  }
  new ResizeObserver(resize).observe(container);
  function theme() {
    const dark = hooks.isDark();
    scene.background = new THREE.Color(dark ? "#0b1418" : "#bcd6e2");
    scene.fog = new THREE.Fog(dark ? "#0b1418" : "#bcd6e2", 280, 650);
    hemi.intensity = dark ? 0.95 : 1.15; need = true;
  }
  function frame(now) {
    raf = 0;
    if (!running || document.hidden) return;
    if (fly) { const t = clamp((now - fly.t0) / fly.dur, 0, 1), e = ease(t); controls.target.lerpVectors(fly.fromT, fly.toT, e); camera.position.lerpVectors(fly.fromC, fly.toC, e); if (t >= 1) fly = null; need = true; }
    controls.update();
    const live = animOn || fxQueue.length || smoke.length;
    if (live) {
      waterUniforms.uTime.value = now / 1000;
      updateMovers(now); updateFx(now);
      for (const f of flags) { const p = f.cloth.geometry.attributes.position, a = p.array; for (let k = 0; k < a.length; k += 3) a[k + 2] = f.base[k + 2] + Math.sin(now / 260 + f.phase + f.base[k] * 6) * 0.05 * f.base[k] * 2.2; p.needsUpdate = true; }
      need = true;
    }
    if (now - (frame.aimed || 0) > 300) { frame.aimed = now; aim(); } // the docks open and close
    if (need) {
      cullLabels(); renderer.render(scene, camera); labels.render(scene, camera); need = false;
      hooks.onZoom?.(home().length() / Math.max(1e-6, camera.position.distanceTo(controls.target)));
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
      heights(); buildTerrain(); buildDecor(); theme();
      sun.target.position.set(0, 0, 0);
      placeCamera();
      if (S) api3.setState(S);
    },
    setState(s) { S = s; if (!ST) return; paint(); buildDynamic(); buildMovers(); updatePin(); },
    setSelected(id) { if (selected === id) return; selected = id; paint(); },
    setPinned(i) { if (pinned === i) return; pinned = i; paint(); updatePin(); },
    setLayer(values, max, threat) { layer = values ? { values, max, threat } : null; paint(); },
    playFx, focus, zoom, fit, theme, faceNorth, turn,
    setAnim(on) { animOn = on; need = true; },
    show(on) { running = on; container.hidden = !on; if (on) { resize(); if (!placed) placeCamera(); if (!raf) raf = requestAnimationFrame(frame); } },
    distance: () => camera.position.distanceTo(controls.target),
  };
  raf = requestAnimationFrame(frame);
  return api3;
}
