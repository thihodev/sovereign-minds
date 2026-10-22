// Low-poly models for the 3D map (Kenney's Hexagon, Castle and Nature kits, CC0: web/vendor/models/*/License.txt).
// Each model is loaded once, flattened into one geometry with its colours baked into the vertices (no textures
// at draw time), stood on y = 0, centred and scaled to a height of 1. One attribute, aTint, marks the parts that
// take the colour of each copy: roofs and banners (the nation's colour), leaves (the wood's green), stone.
// The map draws them with InstancedMesh, thousands at a time, through modelMaterial() below.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/GLTFLoader.js";
import { mergeGeometries } from "three/addons/BufferGeometryUtils.js";

const BASE = "/vendor/models/";
// the Nature kit has plain materials: each is given its colour here (tint 1: the copy's colour multiplies it)
const NATURE = {
  leafsGreen: ["#ffffff", 1], leafsDark: ["#ffffff", 1], woodBark: ["#6e4c33", 0], woodBarkDark: ["#5b4130", 0],
  dirt: ["#ffffff", 1], grass: ["#6f8c48", 0], _defaultMat: ["#e2ddd2", 1], wood: ["#9a7048", 0], woodDark: ["#6e4c33", 0],
  woodInner: ["#d6bf94", 0], colorRed: ["#ffffff", 1], stone: ["#c9c4b8", 0], stoneDark: ["#9a958a", 0],
};
/** name: [pack, file, options]. stone: the castle's sandstone turned grey; sail: light parts take the copy's colour; tint: all of it does. */
export const MODEL_LIST = {
  // woods
  oak: ["nature", "tree_oak"], broad: ["nature", "tree_default"], fat: ["nature", "tree_fat"], small: ["nature", "tree_small"],
  poplar: ["nature", "tree_simple"],
  pine: ["nature", "tree_pineDefaultA"], pineSmall: ["nature", "tree_pineSmallA"], pineTall: ["nature", "tree_pineTallA"],
  palm: ["nature", "tree_palm"], palmBend: ["nature", "tree_palmBend"],
  bush: ["nature", "plant_bushLarge", { tint: true }], reed: ["nature", "grass_large", { tint: true }], cactus: ["nature", "cactus_tall", { tint: true }], cactusS: ["nature", "cactus_short", { tint: true }],
  // stone
  rockA: ["nature", "rock_largeA"], rockB: ["nature", "rock_largeB"], rockS: ["nature", "rock_smallA"], rockT: ["nature", "rock_tallA"], rockT2: ["nature", "rock_tallB"],
  // homes and works
  house: ["hex", "unit-house"], mansion: ["hex", "unit-mansion"], windmill: ["hex", "unit-mill"], tower: ["hex", "unit-tower"],
  ship: ["hex", "unit-ship", { sail: true }], shipL: ["hex", "unit-ship-large", { sail: true }],
  fence: ["nature", "fence_simple"], tent: ["nature", "tent_detailedOpen"],
  // castles
  keep: ["castle", "tower-square", { stone: true }], hexTower: ["castle", "tower-hexagon-base", { stone: true }], hexRoof: ["castle", "tower-hexagon-roof", { stone: true }],
  wall: ["castle", "wall", { stone: true }],
};

const lin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const pixelCache = new Map();
function pixels(image) {
  let p = pixelCache.get(image);
  if (!p) {
    const c = document.createElement("canvas"); c.width = image.width; c.height = image.height;
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(image, 0, 0);
    p = { w: c.width, h: c.height, d: x.getImageData(0, 0, c.width, c.height).data }; pixelCache.set(image, p);
  }
  return p;
}

/** One model, flattened: position, normal, colour (linear) and aTint, height 1, standing on y = 0. */
function bake(root, opt = {}) {
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    let g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); if (g.index) g = g.toNonIndexed();
    const n = g.attributes.position.count, col = new Float32Array(n * 3), tint = new Float32Array(n), m = o.material, uv = g.attributes.uv;
    const px = m.map?.image ? pixels(m.map.image) : null, named = NATURE[m.name];
    for (let v = 0; v < n; v++) {
      let r, gg, b, t = 0;
      if (px && uv) {
        const x = Math.min(px.w - 1, Math.max(0, Math.floor(uv.getX(v) * px.w))), y = Math.min(px.h - 1, Math.max(0, Math.floor(uv.getY(v) * px.h))), k = (y * px.w + x) * 4;
        r = px.d[k] / 255; gg = px.d[k + 1] / 255; b = px.d[k + 2] / 255;
        const blue = b > r + 0.18 && b > gg + 0.08, lum = 0.3 * r + 0.59 * gg + 0.11 * b;
        if (blue) { const v0 = Math.min(1, b * 1.12); r = gg = b = v0; t = 1; } // roofs and banners: the nation's colour
        else if (opt.sail && lum > 0.62) { r = gg = b = Math.min(1, lum * 1.08); t = 1; }
        else if (opt.stone) { const s = 0.18; r = lum + (r - lum) * s; gg = lum + (gg - lum) * s; b = lum + (b - lum) * s + 0.015; r *= 0.97; }
        r = lin(r); gg = lin(gg); b = lin(b);
      } else if (opt.tint) { r = gg = b = 1; t = 1; }
      else if (named) { const c = new THREE.Color(named[0]); r = c.r; gg = c.g; b = c.b; t = named[1]; }
      else { r = m.color.r; gg = m.color.g; b = m.color.b; }
      col[v * 3] = r; col[v * 3 + 1] = gg; col[v * 3 + 2] = b; tint[v] = t;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", g.attributes.position); out.setAttribute("normal", g.attributes.normal);
    out.setAttribute("color", new THREE.BufferAttribute(col, 3)); out.setAttribute("aTint", new THREE.BufferAttribute(tint, 1));
    parts.push(out);
  });
  const g = mergeGeometries(parts);
  g.computeBoundingBox();
  const bb = g.boundingBox, h = Math.max(1e-6, bb.max.y - bb.min.y);
  g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2).scale(1 / h, 1 / h, 1 / h);
  g.computeBoundingBox(); g.computeBoundingSphere();
  g.userData.size = g.boundingBox.getSize(new THREE.Vector3()); // width, 1, depth
  return g;
}

/** Load every model (in the background); `onReady(geos)` once all that could be loaded are baked. A model that
 *  fails is left out (the map keeps its own shape for it); if none loads, onReady is not called. */
export function loadModels(onReady) {
  const loader = new GLTFLoader(), geos = {};
  const jobs = Object.entries(MODEL_LIST).map(([name, [pack, file, opt]]) =>
    loader.loadAsync(`${BASE}${pack}/${file}.glb`).then(g => { geos[name] = bake(g.scene, opt); g.scene.traverse(o => { o.geometry?.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } }); })
      .catch(e => console.warn(`[3D] model ${pack}/${file}:`, e?.message || e)));
  Promise.all(jobs).then(() => { pixelCache.clear(); if (Object.keys(geos).length) onReady(geos); });
}

/** The models' material: baked colours, the copy's colour on the parts marked for it; `sway`: trees in the wind;
 *  `lit`: warm lit windows on the walls (electrified towns), between heights win[0] and win[1] of the model. */
export function modelMaterial(U, { sway = false, lit = false, win = [0.12, 0.34], side = THREE.FrontSide, extra = null, key = "" } = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side });
  const uWin = { value: new THREE.Vector2(win[0], win[1]) };
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWin = uWin;
    sh.vertexShader = "uniform float uTime;\nattribute float aTint;\nvarying float vTint;\nvarying vec3 vLoc;\nvarying vec3 vLN;\n" + sh.vertexShader
      .replace("#include <color_vertex>", `#include <color_vertex>
  vTint = aTint; vLoc = position; vLN = normal;
  #ifdef USE_INSTANCING_COLOR
  vColor.xyz = color.xyz * mix(vec3(1.0), instanceColor.xyz, aTint);
  #endif`)
      .replace("#include <begin_vertex>", sway ? `#include <begin_vertex>
  #ifdef USE_INSTANCING
  { vec2 ip = instanceMatrix[3].xz; float sw = sin(uTime * 1.4 + ip.x * 0.7 + ip.y * 0.45) + 0.45 * sin(uTime * 2.9 + ip.x * 1.9 - ip.y * 1.3);
    float k = transformed.y * transformed.y; transformed.x += sw * 0.05 * k; transformed.z += sw * 0.03 * k; }
  #endif` : "#include <begin_vertex>");
    sh.fragmentShader = "uniform vec2 uWin;\nvarying float vTint;\nvarying vec3 vLoc;\nvarying vec3 vLN;\n" + sh.fragmentShader
      .replace("#include <emissivemap_fragment>", lit ? `#include <emissivemap_fragment>
  if (vTint < 0.5 && abs(vLN.y) < 0.35 && vLoc.y > uWin.x && vLoc.y < uWin.y) {
    float a = abs(vLN.x) > abs(vLN.z) ? vLoc.z : vLoc.x, f = fract(a * 9.0 + 0.5), yy = (vLoc.y - uWin.x) / (uWin.y - uWin.x);
    float w = smoothstep(0.28, 0.34, f) * (1.0 - smoothstep(0.66, 0.72, f)) * smoothstep(0.18, 0.28, yy) * (1.0 - smoothstep(0.72, 0.82, yy));
    totalEmissiveRadiance += vec3(1.0, 0.6, 0.24) * 1.6 * w;
  }` : "#include <emissivemap_fragment>");
    extra?.(sh);
  };
  m.customProgramCacheKey = () => `model:${sway ? 1 : 0}${lit ? 1 : 0}${key}`;
  return m;
}
