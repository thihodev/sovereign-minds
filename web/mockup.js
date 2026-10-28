// Làng AI — static mockup scene (phase 0). Plain JS, Canvas 2D, no build step.
// Everything here is hand-placed and fake: it only shows how the village would look, built from the real tiles.
"use strict";

const T = 16;              // tile size in px
const MW = 48, MH = 28;    // map size in tiles
const A = "assets/";

// ---------------------------------------------------------------- assets
const FILES = {
  floor: "ninja/tilesets/TilesetFloor.png",
  water: "ninja/tilesets/TilesetWater.png",
  nature: "ninja/tilesets/TilesetNature.png",
  house: "ninja/tilesets/TilesetHouse.png",
  element: "ninja/tilesets/TilesetElement.png",
  camp: "ninja/tilesets/tileset_camp.png",
  detail: "ninja/tilesets/TilesetFloorDetail.png",
  ripples: "ninja/animated/WaterRipples.png",
  plant: "ninja/animated/Plant.png",
  crops: "crops/crops.png",
  tilled: "crops/tilled.png",
  shadow: "ninja/characters/Shadow.png",
  heart: "ninja/ui/emote27.png",
  facebox: "ninja/ui/FacesetBox.png",
  hoe: "ninja/items/Hoe.png",
  can: "ninja/items/WateringCan.png",
  chickenW: "ninja/animals/Chicken/SpriteSheetWhite.png",
  chickenB: "ninja/animals/Chicken/SpriteSheetBrown.png",
  cat: "ninja/animals/Cat/SpriteSheet.png",
  dog: "ninja/animals/Dog/SpriteSheet.png",
};
const CHARS = ["OldMan3", "Samurai", "OldWoman", "Boy", "Villager4", "Hunter", "Noble", "Princess", "Monk"];
for (const c of CHARS) { FILES["ch_" + c] = `ninja/characters/${c}/SpriteSheet.png`; FILES["fa_" + c] = `ninja/characters/${c}/Faceset.png`; }

const IMG = {};
function loadAll() {
  return Promise.all(Object.entries(FILES).map(([k, f]) => new Promise((ok, bad) => {
    const im = new Image(); im.onload = () => { IMG[k] = im; ok(); }; im.onerror = () => bad(new Error("không tải được " + f)); im.src = A + f;
  })));
}

// ---------------------------------------------------------------- small helpers
const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const ctx2d = (c) => { const g = c.getContext("2d"); g.imageSmoothingEnabled = false; return g; };
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const key = (r, g, b) => (r << 16) | (g << 8) | b;
function hash(x, y, s = 0) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

function imageData(img) { const c = canvas(img.width, img.height); const g = ctx2d(c); g.drawImage(img, 0, 0); return { c, g, d: g.getImageData(0, 0, c.width, c.height) }; }

// Colour map from one block of a sheet to another of the same layout: each colour of A goes to the colour B has most often at the same pixel.
function deriveMap(img, ax, ay, bx, by, w, h) {
  const { d } = imageData(img); const W = img.width, px = d.data; const votes = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((ay + y) * W + ax + x) * 4, j = ((by + y) * W + bx + x) * 4;
    if (px[i + 3] < 200 || px[j + 3] < 200) continue;
    const a = key(px[i], px[i + 1], px[i + 2]), b = key(px[j], px[j + 1], px[j + 2]);
    let m = votes.get(a); if (!m) votes.set(a, m = new Map()); m.set(b, (m.get(b) || 0) + 1);
  }
  const out = new Map();
  for (const [a, m] of votes) { let best = a, n = -1; for (const [b, c] of m) if (c > n) { best = b; n = c; } out.set(a, best); }
  return out;
}
function mapFromHex(obj) { const m = new Map(); for (const [a, b] of Object.entries(obj)) m.set(key(...hexRGB(a)), key(...hexRGB(b))); return m; }
function recolor(img, map) {
  const { c, g, d } = imageData(img); const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const v = map.get(key(px[i], px[i + 1], px[i + 2]));
    if (v !== undefined) { px[i] = v >> 16; px[i + 1] = (v >> 8) & 255; px[i + 2] = v & 255; }
  }
  g.putImageData(d, 0, 0); return c;
}

// ---------------------------------------------------------------- seasons
// floor: the season's block in TilesetFloor (11×7 tiles: grass around, path inside).
// foliage: how the trees' three greens turn, taken from the pack's own green / orange / white trees.
const SEASONS = {
  xuan: { name: "Xuân", floor: [0, 7], foliage: null },
  ha: { name: "Hạ", floor: [11, 7], foliage: { "#adbc3a": "#74a334", "#74a334": "#4a7f4b", "#4a7f4b": "#345a52" } },
  thu: { name: "Thu", floor: [0, 0], foliage: { "#adbc3a": "#eecf9b", "#74a334": "#ffad5d", "#4a7f4b": "#e46d3a" } },
  dong: { name: "Đông", floor: [0, 14], foliage: { "#adbc3a": "#ffffff", "#74a334": "#f2eaf1", "#4a7f4b": "#abc2bc" }, ice: true },
};
const SHEETS = {}; // per season: { nature, water, ground }

function prepareSeason(s) {
  if (SHEETS[s]) return SHEETS[s];
  const S = SEASONS[s];
  const nature = S.foliage ? recolor(IMG.nature, mapFromHex(S.foliage)) : IMG.nature;
  // water edges are drawn on spring grass: turn that grass into this season's grass
  const [fx, fy] = S.floor;
  const water = s === "xuan" ? IMG.water : recolor(IMG.water, deriveMap(IMG.floor, 0, 7 * T, fx * T, fy * T, 11 * T, 7 * T));
  // winter bushes: snow on top, still green underneath
  const bush = s === "dong" ? recolor(IMG.nature, mapFromHex({ "#adbc3a": "#f2eaf1" })) : nature;
  const out = { nature, water, bush };
  out.ground = buildGround(s, out);
  SHEETS[s] = out;
  return out;
}

// ---------------------------------------------------------------- the map
// '.' grass  '#' dirt path  '~' water  'f' tilled dry  'F' tilled wet
const MAP = [];
for (let y = 0; y < MH; y++) MAP.push(new Array(MW).fill("."));
function fill(ch, x, y, w, h) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < MW && j < MH) MAP[j][i] = ch; }
const at = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH ? null : MAP[y][x]);

// river with a pool where people fish, and a pond in the south-west
fill("~", 32, 0, 3, MH); fill("~", 31, 18, 5, 5); fill("~", 30, 19, 1, 3); fill("~", 36, 19, 1, 3);
fill("~", 2, 23, 6, 4); fill("~", 3, 22, 4, 1); fill("~", 1, 24, 1, 2);
// main road east-west, crossing the bridge
fill("#", 0, 11, 31, 2); fill("#", 36, 11, 12, 2);
// door paths of the north row
fill("#", 2, 8, 1, 3); fill("#", 11, 8, 1, 3); fill("#", 18, 9, 1, 2); fill("#", 23, 9, 2, 2);
// the square
fill("#", 15, 13, 10, 6);
// path to the field and the field itself
fill("#", 19, 19, 2, 2); fill("#", 14, 21, 14, 7);
for (let y = 22; y <= 26; y++) fill(y % 2 ? "f" : "f", 15, y, 12, 1);
fill("F", 15, 22, 5, 3);
// west lane down to the big house and the small house
fill("#", 7, 13, 2, 8); fill("#", 3, 20, 6, 1); fill("#", 9, 17, 2, 1);
// east side: the road goes on into the woods
fill("#", 40, 13, 2, 4);

const isDirt = (x, y) => { const c = at(x, y); return c === null || c === "#" || c === "f" || c === "F"; };
const isWater = (x, y) => { const c = at(x, y); return c === null ? (at(Math.min(MW - 1, Math.max(0, x)), Math.min(MH - 1, Math.max(0, y))) === "~") : c === "~"; };
function openWater(x, y) { for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (!isWater(x + i, y + j)) return false; return true; }
const isTilled = (x, y) => { const c = at(x, y); return c === "f" || c === "F"; };
const dirtSame = (x, y) => { const c = at(x, y); if (c === null) return isDirt(Math.min(MW - 1, Math.max(0, x)), Math.min(MH - 1, Math.max(0, y))); return c === "#" || c === "f" || c === "F"; };

// Blob autotile from 8×8 quarters. Block layout (shared by TilesetFloor and TilesetWater):
// 3×3 patch at (0..2, 0..2), inner corners in the ring at (5,1) (6,1) (5,2) (6,2).
function autotile(g, img, bx, by, x, y, same, fillTile) {
  const n = same(x, y - 1), s = same(x, y + 1), w = same(x - 1, y), e = same(x + 1, y);
  const nw = same(x - 1, y - 1), ne = same(x + 1, y - 1), sw = same(x - 1, y + 1), se = same(x + 1, y + 1);
  const quad = (qx, qy, v, h, d, corner, hedge, vedge, nub) => {
    let t = fillTile;
    if (!v && !h) t = corner; else if (!v) t = hedge; else if (!h) t = vedge; else if (!d) t = nub;
    g.drawImage(img, (bx + t[0]) * T + qx * 8, (by + t[1]) * T + qy * 8, 8, 8, x * T + qx * 8, y * T + qy * 8, 8, 8);
  };
  quad(0, 0, n, w, nw, [0, 0], [1, 0], [0, 1], [6, 2]);
  quad(1, 0, n, e, ne, [2, 0], [1, 0], [2, 1], [5, 2]);
  quad(0, 1, s, w, sw, [0, 2], [1, 2], [0, 1], [6, 1]);
  quad(1, 1, s, e, se, [2, 2], [1, 2], [2, 1], [5, 1]);
}

// Water banks are wide (they reach past the middle of the tile), so water uses whole tiles chosen by which
// sides are open, and the ring's inner tiles for a single open diagonal. Same block layout as above.
const WATER_TILE = { 0: [1, 1], 1: [1, 0], 2: [2, 1], 4: [1, 2], 8: [0, 1], 9: [0, 0], 3: [2, 0], 12: [0, 2], 6: [2, 2],
  5: [1, 3], 10: [3, 1], 13: [0, 3], 7: [2, 3], 11: [3, 0], 14: [3, 2], 15: [1, 3] };
function waterTile(g, img, bx, by, x, y) {
  const o = (i, j) => !isWater(x + i, y + j);
  const m = (o(0, -1) ? 1 : 0) | (o(1, 0) ? 2 : 0) | (o(0, 1) ? 4 : 0) | (o(-1, 0) ? 8 : 0);
  let t = WATER_TILE[m];
  if (m === 0) {
    const d = [o(-1, -1) && [6, 2], o(1, -1) && [5, 2], o(-1, 1) && [6, 1], o(1, 1) && [5, 1]].filter(Boolean);
    if (d.length === 1) t = d[0];
    else if (d.length > 1) { autotile(g, img, bx, by, x, y, isWater, [1, 1]); return; }
  }
  g.drawImage(img, (bx + t[0]) * T, (by + t[1]) * T, T, T, x * T, y * T, T, T);
}

function buildGround(s, sh) {
  const S = SEASONS[s]; const [fx, fy] = S.floor;
  const c = canvas(MW * T, MH * T); const g = ctx2d(c);
  const F = IMG.floor;
  const [wx, wy] = S.ice ? [13, 0] : [0, 6];
  const W = S.ice ? IMG.water : sh.water;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    // grass, now and then with tufts (block row 5, cols 1..4)
    const r = hash(x, y, 1); const v = r < 0.86 ? 0 : 1 + Math.floor(hash(x, y, 2) * 4);
    g.drawImage(F, (fx + v) * T, (fy + 5) * T, T, T, x * T, y * T, T, T);
    if (isDirt(x, y)) {
      const rr = hash(x, y, 3); const fillTile = rr < 0.06 ? [0, 4] : rr < 0.1 ? [1, 4] : [1, 1];
      autotile(g, F, fx, fy, x, y, dirtSame, isTilled(x, y) ? [1, 1] : fillTile);
    } else if (isWater(x, y)) {
      waterTile(g, W, wx, wy, x, y);
      // lily pads, pebbles, a glint, fish shadows on open water (TilesetWater column 11)
      if (!S.ice && openWater(x, y)) { const q = hash(x, y, 4); const d = q < 0.05 ? 3 : q < 0.09 ? 2 : q < 0.11 ? 1 : q < 0.13 ? 4 : 0; if (d) g.drawImage(W, 11 * T, d * T, T, T, x * T, y * T, T, T); }
    }
  }
  // tilled soil over the field's dirt
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (isTilled(x, y)) {
    const m = (isTilled(x, y - 1) ? 1 : 0) | (isTilled(x + 1, y) ? 2 : 0) | (isTilled(x, y + 1) ? 4 : 0) | (isTilled(x - 1, y) ? 8 : 0);
    g.drawImage(IMG.tilled, m * T, at(x, y) === "F" ? T : 0, T, T, x * T, y * T, T, T);
  }
  // flat details: small tufts and flowers in spring/summer, leaves in autumn, snowy tufts in winter
  const decals = s === "thu" ? [[0, 0], [1, 0], [5, 0], [6, 0], [8, 0]] : s === "dong" ? [[0, 3], [2, 3], [3, 3], [4, 3]] : [[0, 2], [2, 2], [3, 2], [4, 2], [5, 2]];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (at(x, y) !== "." || hash(x, y, 7) > 0.07) continue;
    if (isWater(x - 1, y) || isWater(x + 1, y) || isWater(x, y - 1) || isWater(x, y + 1) || isDirt(x, y + 1) || isDirt(x, y - 1) || isDirt(x - 1, y) || isDirt(x + 1, y)) continue;
    const [dx, dy] = decals[Math.floor(hash(x, y, 8) * decals.length)];
    g.drawImage(IMG.detail, dx * T, dy * T, T, T, x * T, y * T, T, T);
  }
  return c;
}

// ---------------------------------------------------------------- sprites
// [sheet, sx, sy, w, h] in pixels. "nature" is resolved to the season's recoloured sheet.
const SPR = {
  treeBig: ["nature", 48, 288, 48, 48], treePink: ["nature0", 0, 288, 48, 48],
  treeCluster: ["nature", 64, 32, 64, 48],
  pine: ["nature", 32, 0, 32, 32], pineSnow: ["nature0", 160, 0, 32, 32],
  pines: ["nature", 0, 32, 64, 48], pinesSnow: ["nature0", 128, 80, 64, 48], pines0: ["nature0", 0, 32, 64, 48], pine0: ["nature0", 32, 0, 32, 32],
  treeRound: ["nature", 0, 0, 32, 32],
  bush0: ["bush", 0, 160, 16, 16], bush1: ["bush", 16, 160, 16, 16], bush2: ["bush", 32, 160, 16, 16], bush3: ["bush", 96, 160, 16, 16],
  fern: ["bush", 64, 160, 16, 16], grassTall: ["bush", 112, 160, 16, 16],
  sunflower: ["nature", 0, 176, 16, 16], sunflower2: ["nature", 16, 176, 16, 16], redFlower: ["nature", 48, 176, 16, 16], daisy: ["nature", 96, 176, 16, 16],
  rockGrey: ["nature", 256, 128, 32, 32], rockGreySmall: ["nature", 288, 144, 16, 16], rockBrownSmall: ["nature", 224, 144, 16, 16],
  stump: ["nature", 32, 128, 32, 32], stumpSmall: ["nature", 64, 128, 16, 16], log: ["nature", 80, 128, 16, 16],
  houseOrange: ["house", 0, 0, 64, 48], houseRed: ["house", 192, 0, 64, 48], shop: ["house", 256, 0, 48, 48], tavern: ["house", 304, 0, 64, 48],
  houseSmall: ["house", 304, 304, 48, 48], houseBig: ["house", 400, 112, 64, 112],
  doorOrange: ["house", 32, 48, 16, 16],
  well: ["element", 96, 16, 16, 16], board: ["element", 96, 48, 16, 32], scarecrow: ["element", 240, 0, 16, 16],
  barrel: ["element", 0, 0, 16, 16], pot: ["element", 16, 0, 16, 16], bucket: ["element", 64, 0, 16, 16], crate: ["element", 128, 0, 16, 16],
  stall: ["house", 256, 256, 48, 32], basketFish: ["house", 256, 208, 16, 16], basketVeg: ["house", 272, 208, 16, 16], basketFruit: ["house", 288, 208, 16, 16],
  deck: ["water", 0, 192, 16, 16],
  lamp: ["camp", 96, 80, 16, 32],
  plant: ["plant", 0, 0, 16, 16], // Backgrounds/Animated/Plant: a daisy swaying, 4 frames
};
// low rail fence: neighbours N=1 E=2 S=4 W=8 -> tile in TilesetHouse
const FENCE = { 0: [14, 6], 1: [11, 6], 4: [11, 6], 5: [11, 6], 2: [10, 6], 8: [10, 7], 10: [11, 7], 6: [8, 6], 12: [9, 6], 3: [8, 7], 9: [9, 7], 11: [12, 7], 14: [13, 6], 13: [13, 7], 7: [12, 6], 15: [14, 7] };

function sheetFor(name, season) {
  const sh = SHEETS[season];
  if (name === "nature") return sh.nature;
  if (name === "nature0") return IMG.nature;
  if (name === "bush") return sh.bush;
  return IMG[name];
}
// sprite key per season (spring cherries, snowy pines…)
function seasonal(k, season, o) {
  if (k === "treeBig" && o.cherry && season === "xuan") return "treePink";
  if (k === "pine" && season === "dong") return "pineSnow";
  if (k === "pines" && season === "dong") return "pinesSnow";
  if ((k === "pines" || k === "pine") && season === "thu") return k + "0"; // evergreens stay green in autumn
  return k;
}

// The pack's wooden bridge (TilesetHouse, cols 10–12, rows 15–17) runs north–south; turned a quarter
// it spans the river east–west, its beams becoming the rails. The plank middle is repeated to the length needed.
const BRIDGE = { x: 30 * T + 8, y: 10 * T + 8, len: 5 * T, c: null };
function buildBridge() {
  const sx = 160, sw = 48; let y0 = 999, y1 = 0;
  const { d } = imageData(IMG.house);
  for (let y = 224; y < 300; y++) for (let x = sx; x < sx + sw; x++) if (d.data[(y * IMG.house.width + x) * 4 + 3] > 0) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const sh = y1 - y0 + 1, cap = 10, L = BRIDGE.len;
  const v = canvas(sw, L), vg = ctx2d(v);
  vg.drawImage(IMG.house, sx, y0, sw, cap, 0, 0, sw, cap);
  for (let y = cap; y < L - cap; y += 8) vg.drawImage(IMG.house, sx, y0 + cap + 8, sw, Math.min(8, L - cap - y), 0, y, sw, Math.min(8, L - cap - y));
  vg.drawImage(IMG.house, sx, y0 + sh - cap, sw, cap, 0, L - cap, sw, cap);
  const r = canvas(L, sw), rg = ctx2d(r);
  rg.translate(0, sw); rg.rotate(-Math.PI / 2); rg.drawImage(v, 0, 0);
  BRIDGE.c = r;
}

// ---------------------------------------------------------------- scene objects
const FLOWERS = new Set(["sunflower", "sunflower2", "redFlower", "daisy", "plant"]);
const OBJ = [];   // {k, x, y (top-left px), base (sort y), tree?, cherry?, lights?}
function put(k, tx, ty, opt = {}) {
  // (tx, ty) = tile where the sprite's bottom-left sits; the sprite rises from there
  const [, , , w, h] = SPR[k];
  const x = tx * T + (opt.dx || 0), y = (ty + 1) * T - h + (opt.dy || 0);
  const o = { k, x, y, w, h, base: y + h - (opt.baseUp || 2), ...opt };
  OBJ.push(o); return o;
}
const FENCES = new Set();
function fenceRect(x, y, w, h, gaps = []) {
  for (let i = x; i < x + w; i++) { FENCES.add(i + "," + y); FENCES.add(i + "," + (y + h - 1)); }
  for (let j = y; j < y + h; j++) { FENCES.add(x + "," + j); FENCES.add((x + w - 1) + "," + j); }
  for (const g of gaps) FENCES.delete(g);
}
function fenceLine(x, y, w) { for (let i = x; i < x + w; i++) FENCES.add(i + "," + y); }

// north row: two homes, the shop, the tavern
put("houseOrange", 1, 7, { lights: [[5, 36, 7, 9], [36, 36, 7, 9], [52, 36, 7, 9]], door: true });
put("doorOrange", 2, 7, { base: 7 * T + 15 });
put("houseRed", 10, 7, { lights: [[4, 36, 8, 9], [36, 36, 8, 9], [52, 36, 8, 9]] });
put("doorOrange", 11, 7, { base: 8 * T + 15 });
put("shop", 17, 8, { lights: [[4, 37, 8, 10], [36, 37, 8, 10]] });
put("tavern", 22, 8, { lights: [[20, 30, 7, 8], [40, 30, 7, 8], [56, 30, 6, 8]] });
// south side: the big house of the Ba family and a small cottage
put("houseBig", 2, 19, { lights: [[18, 70, 5, 6], [38, 70, 5, 6]] });
put("houseSmall", 9, 16, { lights: [[20, 9, 10, 10]] });

// gardens with fences
fenceRect(5, 7, 4, 4, ["6,10"]);       // flower garden beside the orange house
fenceRect(25, 13, 5, 5);              // chicken yard east of the square
fenceRect(13, 20, 16, 8, ["19,20", "20,20"]); // around the field, gate on the path

// garden beds
put("sunflower", 6, 8); put("sunflower2", 7, 8); put("redFlower", 6, 9); put("plant", 7, 9, { anim: 4 });

// the square: well, notice board, lamps, crates by the shop
put("well", 19, 14);
put("bucket", 20, 14);
put("board", 16, 14);
put("lamp", 15, 13, { lamp: [12, 8] }); put("lamp", 24, 18, { lamp: [12, 8] }); put("lamp", 9, 10, { lamp: [12, 8] }); put("lamp", 29, 10, { lamp: [12, 8] });
put("barrel", 16, 9); put("crate", 20, 9); put("barrel", 21, 9);
put("stall", 22, 14); put("basketFish", 22, 15, { dy: -3 }); put("basketVeg", 23, 15, { dy: -3 }); put("basketFruit", 24, 15, { dy: -3 });
put("scarecrow", 23, 23);

// trees: forest edge along the north, woods east of the river, a few in the village
const trees = [];
for (let x = -1; x < 31; x += 3) trees.push(["treeCluster", x + (hash(x, 0) * 2 | 0), 2 + (hash(x, 1) < 0.5 ? 0 : 1)]);
for (let x = 0; x < 31; x += 4) trees.push(["treeBig", x + 1, 4 + (hash(x, 3) < 0.4 ? -1 : 0), { cherry: hash(x, 5) < 0.3 }]);
for (const [x, y] of [[36, 2], [40, 1], [44, 3], [37, 6], [42, 7], [46, 8], [45, 15], [38, 17], [43, 20], [37, 24], [41, 26], [46, 24], [44, 11 - 2]]) trees.push(["treeBig", x, y, { cherry: hash(x, y) < 0.3 }]);
for (const [x, y] of [[39, 4], [46, 5], [36, 9], [44, 17], [40, 22], [46, 27], [38, 27]]) trees.push(["pine", x, y]);
for (const [x, y] of [[42, 4], [35, 16], [39, 14]]) trees.push(["pines", x, y]);
for (const [x, y, c] of [[30, 16, true], [11, 25, false], [0, 18, true], [29, 25, false]]) trees.push(["treeBig", x, y, { cherry: c }]);
for (const [k, x, y, o] of trees) put(k, x, y, { tree: true, ...(o || {}) });

// bushes, rocks, stumps, flowers in the grass
const deco = [
  ["bush0", 0, 13], ["bush1", 13, 9], ["bush2", 14, 10], ["bush0", 27, 9], ["bush2", 12, 21], ["bush0", 10, 22],
  ["bush2", 30, 23], ["bush0", 9, 26], ["bush3", 0, 21], ["fern", 6, 4], ["fern", 20, 4], ["grassTall", 27, 4], ["grassTall", 31, 7],
  ["rockGrey", 35, 23], ["rockGreySmall", 30, 17], ["rockGreySmall", 37, 13], ["rockGreySmall", 8, 23], ["rockGreySmall", 46, 13], ["rockBrownSmall", 3, 13],
  ["stump", 38, 9], ["stumpSmall", 12, 4], ["log", 43, 14],
  ["redFlower", 26, 19], ["daisy", 28, 19], ["sunflower", 12, 12 - 1], ["daisy", 1, 16], ["redFlower", 10, 20], ["daisy", 30, 13], ["daisy", 36, 15], ["redFlower", 45, 18],
];
for (const [k, x, y] of deco) put(k, x, y);

// crops in the field rows: [crop row in crops.png, stage]
const CROP = [];
// crops.png rows: 0 cải, 1 cà rốt, 2 ngô, 3 bí ngô, 4 lúa
function plot(crop, x, y, w, h, stages) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) CROP.push({ x: i, y: j, crop, stage: stages[Math.floor(hash(i, j, 21) * stages.length)] }); }
plot(0, 15, 22, 5, 2, [3, 4, 4, 4]);   // cabbages, just watered
plot(1, 20, 22, 3, 2, [2, 3, 3]);      // carrots
plot(1, 24, 22, 3, 2, [3, 3, 4]);
plot(2, 15, 24, 5, 1, [0]);            // corn just sown
plot(4, 23, 24, 4, 1, [1, 1, 2]);      // rice sprouting
plot(2, 15, 25, 4, 2, [3, 4, 4]);      // tall corn
plot(3, 19, 25, 4, 2, [2, 3, 4, 4]);   // pumpkins
plot(4, 23, 25, 4, 2, [4, 4, 3]);      // ripe rice

// ---------------------------------------------------------------- villagers (fake data)
const DIRS = { down: 0, up: 1, left: 2, right: 3 };
const P = (x, y) => [x * T + 8, y * T + 14];
const PEOPLE = [
  { id: "ba", name: "Ông Ba", sheet: "OldMan3", age: 67, job: "Nông dân", act: "hoe", pos: P(21, 24), dir: "left",
    mood: { "Sức lực": 0.55, "No bụng": 0.7, "Vui vẻ": 0.8 }, hearts: 3, doing: "✓ cuốc đất ruộng ngô<br>→ trưa về nhà ăn cơm" },
  { id: "mai", name: "Cô Mai", sheet: "Princess", age: 22, job: "Trồng rau", act: "water", pos: P(17, 21), dir: "down",
    mood: { "Sức lực": 0.8, "No bụng": 0.5, "Vui vẻ": 0.9 }, hearts: 4, doing: "✓ tưới luống cải<br>→ chiều ra chợ bán rau" },
  { id: "lan", name: "Chị Lan", sheet: "Samurai", age: 31, job: "Ngư dân", act: "talk", pos: P(17, 18), dir: "right", emote: "heart",
    mood: { "Sức lực": 0.6, "No bụng": 0.6, "Vui vẻ": 0.95 }, hearts: 5, doing: "✓ câu được 6 con cá rô<br>→ đang tán chuyện ở giếng" },
  { id: "tu", name: "Bà Tư", sheet: "OldWoman", age: 72, job: "Bán nước chè", act: "talk", pos: P(19, 18), dir: "left", frames: 2,
    say: "Chào chị Lan! Hôm nay cá nhiều không?",
    mood: { "Sức lực": 0.4, "No bụng": 0.8, "Vui vẻ": 0.75 }, hearts: 3, doing: "→ hỏi chuyện chị Lan<br>→ tối mở hàng chè" },
  { id: "hung", name: "Anh Hùng", sheet: "Hunter", age: 28, job: "Thợ săn, câu cá", act: "fish", pos: P(29, 20), dir: "right",
    mood: { "Sức lực": 0.7, "No bụng": 0.35, "Vui vẻ": 0.6 }, hearts: 2, doing: "… câu cá ở vũng sông<br>→ mang cá ra quán" },
  { id: "ti", name: "Cu Tí", sheet: "Boy", age: 9, job: "Học trò", act: "walk", speed: 2.2,
    path: [[2, 12], [15, 12], [15, 17], [21, 17], [21, 12], [30, 12], [36, 12], [44, 12], [30, 12], [15, 12]], loop: true,
    mood: { "Sức lực": 0.95, "No bụng": 0.6, "Vui vẻ": 1 }, hearts: 4, doing: "→ chạy chơi với con Vàng<br>→ chiều học chữ ở chùa" },
  { id: "phu", name: "Ông Phú", sheet: "Noble", age: 54, job: "Chủ tiệm tạp hóa", act: "walk", speed: 1.2,
    path: [[18, 10], [18, 12], [23, 12], [23, 10], [23, 12], [18, 12]], loop: true,
    mood: { "Sức lực": 0.6, "No bụng": 0.9, "Vui vẻ": 0.55 }, hearts: 1, doing: "→ ghé quán bàn chuyện giá gạo<br>→ chiều mở tiệm" },
  { id: "minh", name: "Thầy Minh", sheet: "Monk", age: 60, job: "Thầy đồ", act: "walk", speed: 1,
    path: [[28, 11], [37, 11], [40, 11], [40, 15], [40, 11], [28, 11]], loop: true,
    mood: { "Sức lực": 0.5, "No bụng": 0.5, "Vui vẻ": 0.7 }, hearts: 3, doing: "→ qua cầu sang rừng hái thuốc<br>→ chiều dạy chữ" },
  { id: "na", name: "Bé Na", sheet: "Villager4", age: 7, job: "Con nhà ông Ba", act: "walk", speed: 1.5,
    path: [[8, 14], [8, 19], [5, 20], [3, 21], [5, 20], [8, 19]], loop: true,
    mood: { "Sức lực": 0.9, "No bụng": 0.4, "Vui vẻ": 0.85 }, hearts: 4, doing: "→ đi tìm con mèo Mướp<br>→ ra ao xem cá" },
];
for (const p of PEOPLE) if (p.path) { p.path = p.path.map(([x, y]) => P(x, y)); let L = 0; p.seg = []; for (let i = 0; i < p.path.length; i++) { const a = p.path[i], b = p.path[(i + 1) % p.path.length]; const d = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]); p.seg.push({ a, b, d, L }); L += d; } p.len = L; }

const ANIMALS = [
  { img: "chickenW", home: [27 * T + 0, 15 * T + 2], range: [30, 14], phase: 0 },
  { img: "chickenB", home: [27 * T + 8, 16 * T + 4], range: [24, 8], phase: 2.1 },
  { img: "chickenW", home: [26 * T + 8, 14 * T + 14], range: [10, 6], phase: 4.3 },
  { img: "cat", home: [25 * T + 8, 9 * T + 14], range: [0, 0], phase: 0, sit: true },
  { img: "dog", follow: "ti", phase: 0 },
];

// ---------------------------------------------------------------- state & camera
const view = document.getElementById("view");
const g = view.getContext("2d");
const qs = new URLSearchParams(location.search);
const state = {
  season: SEASONS[qs.get("season")] ? qs.get("season") : "xuan",
  minutes: qs.get("time") ? (([h, m]) => h * 60 + (m || 0))(qs.get("time").split(":").map(Number)) : 14 * 60 + 30,
  weather: ["clear", "rain", "snow"].includes(qs.get("weather")) ? qs.get("weather") : "clear",
  zoom: Math.min(5, Math.max(2, Number(qs.get("zoom")) || 3)),
  cx: Number(qs.get("cx")) || 20.5 * T, cy: Number(qs.get("cy")) || 14 * T, // camera centre in world px
  selected: null,
  freeze: qs.get("t") ? Number(qs.get("t")) : null,
};
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = window.devicePixelRatio || 1;
  W = Math.round(window.innerWidth); H = Math.round(window.innerHeight);
  view.width = Math.round(W * DPR); view.height = Math.round(H * DPR);
  clampCam();
}
function clampCam() {
  const z = state.zoom, hw = W / z / 2, hh = H / z / 2;
  state.cx = MW * T <= hw * 2 ? MW * T / 2 : Math.min(MW * T - hw, Math.max(hw, state.cx));
  state.cy = MH * T <= hh * 2 ? MH * T / 2 : Math.min(MH * T - hh, Math.max(hh, state.cy));
}
// world → screen offset, rounded so every tile lands on whole device pixels
function camOffset() { const z = state.zoom * DPR; return [Math.round(W * DPR / 2 - state.cx * z), Math.round(H * DPR / 2 - state.cy * z), z]; }

// ---------------------------------------------------------------- light & time
const TINT = [ // minutes → multiply colour
  [360, [250, 190, 196]], [420, [255, 214, 200]], [510, [255, 238, 222]], [660, [255, 253, 248]], [720, [255, 255, 255]], [930, [255, 251, 240]],
  [1020, [255, 232, 190]], [1080, [255, 212, 156]], [1120, [250, 186, 140]], [1160, [190, 150, 170]], [1200, [112, 108, 172]], [1250, [70, 80, 150]], [1440, [52, 62, 130]],
];
function lerp(a, b, t) { return a + (b - a) * t; }
function tintAt(m) {
  for (let i = 0; i < TINT.length - 1; i++) { const [m0, c0] = TINT[i], [m1, c1] = TINT[i + 1]; if (m <= m1) { const t = Math.max(0, (m - m0) / (m1 - m0)); return c0.map((v, k) => Math.round(lerp(v, c1[k], t))); } }
  return TINT[TINT.length - 1][1];
}
const nightness = (m) => Math.min(1, Math.max(0, (m - 1080) / 150)); // lights come on from 18:00, full by 20:30

// ---------------------------------------------------------------- drawing
let lightC = canvas(1, 1), lightG = ctx2d(lightC);
const PARTS = []; // particles in world space: {x,y,vx,vy,life,col}
let lastT = 0;

function personAt(p, t) {
  if (!p.path) return { x: p.pos[0], y: p.pos[1], dir: p.dir, moving: false };
  let d = (t * p.speed * T) % p.len;
  for (const s of p.seg) if (d <= s.L + s.d) {
    const f = s.d ? (d - s.L) / s.d : 0;
    // walk along x first, then y (grid paths)
    const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], tot = Math.abs(dx) + Math.abs(dy);
    const k = f * tot; let x, y, dir;
    if (k <= Math.abs(dx)) { x = s.a[0] + Math.sign(dx) * k; y = s.a[1]; dir = dx > 0 ? "right" : "left"; }
    else { x = s.b[0]; y = s.a[1] + Math.sign(dy) * (k - Math.abs(dx)); dir = dy > 0 ? "down" : "up"; }
    return { x, y, dir, moving: true };
  }
  return { x: p.path[0][0], y: p.path[0][1], dir: "down", moving: false };
}

function frame(now) {
  const t = state.freeze !== null ? state.freeze : now / 1000;
  const dt = Math.min(0.05, t - lastT || 0); lastT = t;
  const season = state.season;
  const sh = prepareSeason(season);
  g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
  g.fillStyle = "#1b1a20"; g.fillRect(0, 0, view.width, view.height);
  const [ox, oy, z] = camOffset();
  g.setTransform(z, 0, 0, z, ox, oy);

  // 1. ground (pre-drawn per season)
  g.drawImage(sh.ground, 0, 0);
  // water ripples on open water (not when frozen)
  if (!SEASONS[season].ice) for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    if (!isWater(x, y) || !openWater(x, y) || hash(x, y, 4) < 0.13 || hash(x, y, 11) > 0.16) continue;
    const f = Math.floor(t * 4 + hash(x, y, 12) * 4) % 4;
    g.drawImage(IMG.ripples, f * T, 0, T, T, x * T, y * T, T, T);
  }
  // the bridge, lying flat over the river
  g.drawImage(BRIDGE.c, BRIDGE.x, BRIDGE.y);
  // fences sit flat-ish: draw them with the sorted objects so people pass in front/behind properly
  // 2. crops (on the soil, below people)
  for (const c of CROP) {
    if (season === "dong") continue; // nothing grows under the snow
    g.drawImage(IMG.crops, c.stage * T, c.crop * T, T, T, c.x * T, c.y * T - 2, T, T);
  }

  // 3. sorted objects & people
  const list = [];
  for (const o of OBJ) list.push({ base: o.base, o });
  for (const f of FENCES) { const [x, y] = f.split(",").map(Number); list.push({ base: y * T + 12, fence: [x, y] }); }
  const pos = {};
  for (const p of PEOPLE) { const s = personAt(p, t); pos[p.id] = s; list.push({ base: s.y, p, s }); }
  for (const a of ANIMALS) { const s = animalAt(a, t, pos); a.s = s; list.push({ base: s.y, a, s }); }
  list.sort((u, v) => u.base - v.base);

  const fading = (o) => {
    if (!o.tree) return 1;
    for (const p of PEOPLE) { const s = pos[p.id]; if (s.y < o.base - 2 && s.x > o.x + 4 && s.x < o.x + o.w - 4 && s.y > o.y + 6 && s.y - 14 < o.base) return 0.65; }
    return 1;
  };
  for (const it of list) {
    if (it.o) {
      const o = it.o;
      if (season === "dong" && FLOWERS.has(o.k)) continue; const k = seasonal(o.k, season, o); const [sn, sx, sy, w, h] = SPR[k];
      const a = fading(o); if (a < 1) g.globalAlpha = a;
      const fx = o.anim ? (Math.floor(t * 5 + o.x) % o.anim) * w : 0;
      g.drawImage(sheetFor(sn, season), sx + fx, sy, w, h, o.x, o.y, w, h);
      g.globalAlpha = 1;
    } else if (it.fence) {
      const [x, y] = it.fence; const has = (i, j) => FENCES.has(i + "," + j);
      const m = (has(x, y - 1) ? 1 : 0) | (has(x + 1, y) ? 2 : 0) | (has(x, y + 1) ? 4 : 0) | (has(x - 1, y) ? 8 : 0);
      const [tx, ty] = FENCE[m];
      g.drawImage(IMG.house, tx * T, ty * T, T, T, x * T, y * T, T, T);
    } else if (it.p) drawPerson(it.p, it.s, t);
    else if (it.a) drawAnimal(it.a, it.s, t);
  }

  // particles (dirt from the hoe, water from the can)
  for (let i = PARTS.length - 1; i >= 0; i--) {
    const q = PARTS[i]; q.life -= dt; if (q.life <= 0) { PARTS.splice(i, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 160 * dt;
    g.fillStyle = q.col; g.fillRect(Math.round(q.x), Math.round(q.y), 1, 1);
  }

  // 4. light: tint by the hour, cut out lamp and window glow, then lit windows on top
  drawLight(t, ox, oy, z);

  // 5. weather (screen space)
  drawWeather(t, dt);

  // 6. labels: names, emotes, speech bubble (screen space so text stays crisp)
  g.setTransform(1, 0, 0, 1, 0, 0);
  for (const p of PEOPLE) drawLabel(p, pos[p.id], ox, oy, z, t);

  requestAnimationFrame(frame);
}

function drawPerson(p, s, t) {
  const im = IMG["ch_" + p.sheet]; const col = DIRS[s.dir];
  const frames = p.frames || 4;
  let row = s.moving ? Math.floor(t * 8 + p.id.length) % frames : 0;
  let x = Math.round(s.x - 8), y = Math.round(s.y - 16);
  const S = IMG.shadow;
  g.globalAlpha = 0.9; g.drawImage(S, Math.round(s.x - S.width / 2), Math.round(s.y - 4)); g.globalAlpha = 1;
  if (p.act === "hoe") {
    // lift (0–0.45s), strike (0.45–0.8s), rest — repeat every 1.3s
    const c = (t + 0.3) % 1.3;
    const strike = c > 0.45 && c < 0.8;
    row = strike ? 4 : 0;
    g.drawImage(im, col * T, row * T, T, T, x, y + (c < 0.45 ? -1 : 0), T, T);
    // the hoe: raised over the shoulder, then down into the soil in front
    g.save();
    // Hoe.png has the blade top-right: turned half round it bites the soil in front, a quarter round it is lifted overhead
    if (strike) { g.translate(x + 1, y + 11); g.rotate(Math.PI); } else { g.translate(x + 9, y + (c < 0.45 ? 1 : 3)); g.rotate(-Math.PI / 2); }
    g.drawImage(IMG.hoe, 0, 0, 16, 16, -6, -6, 12, 12); g.restore();
    if (strike && !p._hit) { p._hit = true; for (let i = 0; i < 6; i++) PARTS.push({ x: x - 5 + Math.random() * 4, y: y + 15, vx: -30 + Math.random() * 40, vy: -50 - Math.random() * 30, life: 0.45, col: i % 2 ? "#965340" : "#bd7959" }); }
    if (!strike) p._hit = false;
    return;
  }
  g.drawImage(im, col * T, row * T, T, T, x, y, T, T);
  if (p.act === "water") {
    const c = t % 2.4, pour = c > 0.6;
    g.save(); g.translate(x + 14, y + 12); if (pour) g.rotate(0.6);
    g.drawImage(IMG.can, 0, 0, 16, 16, -5, -5, 10, 10); g.restore();
    if (pour && Math.random() < 0.7) PARTS.push({ x: x + 18 + Math.random() * 2, y: y + 15, vx: 4 + Math.random() * 10, vy: 20, life: 0.22, col: Math.random() < 0.5 ? "#79b8ce" : "#b8dce5" });
  }
  if (p.act === "fish") {
    // rod over the water, line to a bobbing float
    const hx = x + 12, hy = y + 9;
    const tipx = hx + 13, tipy = hy - 12;
    const bob = Math.sin(t * 2.2) * 0.8 + (t % 6 < 0.4 ? 1.5 : 0);
    const fx = tipx + 14, fy = y + 18 + bob;
    g.strokeStyle = "#5b3a24"; g.lineWidth = 1.3; g.beginPath(); g.moveTo(hx, hy); g.lineTo(tipx, tipy); g.stroke();
    g.strokeStyle = "rgba(242,234,241,0.85)"; g.lineWidth = 0.5; g.beginPath(); g.moveTo(tipx, tipy); g.quadraticCurveTo(tipx + 10, tipy + 4, fx, fy - 1); g.stroke();
    g.fillStyle = "#e0394c"; g.fillRect(Math.round(fx) - 1, Math.round(fy) - 2, 2, 2); g.fillStyle = "#f2eaf1"; g.fillRect(Math.round(fx) - 1, Math.round(fy), 2, 1);
    const r = (t % 2) * 4; g.strokeStyle = `rgba(242,234,241,${0.6 - r / 8})`; g.lineWidth = 0.6; g.beginPath(); g.ellipse(fx, fy + 1, 2 + r, 1 + r / 2.5, 0, 0, Math.PI * 2); g.stroke();
  }
}

function animalAt(a, t, pos) {
  if (a.follow) {
    const s = pos[a.follow]; const back = { down: [0, -14], up: [0, 14], left: [14, 0], right: [-14, 0] }[s.dir];
    return { x: s.x + back[0], y: s.y + back[1], flip: s.dir === "right", moving: s.moving };
  }
  if (a.sit) return { x: a.home[0], y: a.home[1], flip: false, moving: false };
  const u = t * 0.35 + a.phase; const x = a.home[0] + Math.sin(u) * a.range[0] / 2, y = a.home[1] + Math.sin(u * 0.7 + 1) * a.range[1] / 2;
  return { x, y, flip: Math.cos(u) > 0, moving: Math.abs(Math.cos(u)) > 0.3 };
}
function drawAnimal(a, s, t) {
  const im = IMG[a.img]; const fw = im.width / 2;
  const f = s.moving ? Math.floor(t * 6 + a.phase * 3) % 2 : (a.sit ? Math.floor(t * 0.7) % 2 : Math.floor(t * 1.5 + a.phase) % 2);
  const x = Math.round(s.x - fw / 2), y = Math.round(s.y - im.height);
  g.globalAlpha = 0.7; g.drawImage(IMG.shadow, Math.round(s.x - 5), Math.round(s.y - 3), 10, 5); g.globalAlpha = 1;
  if (s.flip) { g.save(); g.translate(x + fw, y); g.scale(-1, 1); g.drawImage(im, f * fw, 0, fw, im.height, 0, 0, fw, im.height); g.restore(); }
  else g.drawImage(im, f * fw, 0, fw, im.height, x, y, fw, im.height);
}

function drawLight(t, ox, oy, z) {
  const m = state.minutes; let tint = tintAt(m);
  if (state.weather === "rain") tint = tint.map((v) => Math.round(v * 0.82));
  if (state.weather === "snow") tint = tint.map((v, i) => Math.round(v * (i === 2 ? 0.98 : 0.9)));
  const night = nightness(m);
  const VW = view.width, VH = view.height;
  if (lightC.width !== VW || lightC.height !== VH) { lightC = canvas(VW, VH); lightG = ctx2d(lightC); }
  const L = lightG;
  L.globalCompositeOperation = "source-over";
  L.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`; L.fillRect(0, 0, VW, VH);
  const lights = [];
  if (night > 0) {
    for (const o of OBJ) {
      if (o.lamp) lights.push([o.x + o.lamp[0], o.y + o.lamp[1], 46, 1]);
      if (o.lights) for (const [lx, ly, lw, lh] of o.lights) lights.push([o.x + lx + lw / 2, o.y + ly + lh, 30, 0.75]);
    }
    for (const [x, y, r, s] of lights) {
      const sx = x * z + ox, sy = y * z + oy, R = r * z;
      const gr = L.createRadialGradient(sx, sy, 0, sx, sy, R);
      gr.addColorStop(0, `rgba(255,226,170,${0.95 * night * s})`); gr.addColorStop(0.45, `rgba(255,200,140,${0.55 * night * s})`); gr.addColorStop(1, "rgba(255,200,140,0)");
      L.fillStyle = gr; L.fillRect(sx - R, sy - R, R * 2, R * 2);
    }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "multiply"; g.drawImage(lightC, 0, 0);
  // golden hour: a soft warm wash keeps the colours rich instead of muddy
  const warm = Math.max(0, 1 - Math.abs(m - 1110) / 90) * (state.weather === "clear" ? 1 : 0.4);
  const dawn = Math.max(0, 1 - Math.abs(m - 380) / 80) * (state.weather === "clear" ? 1 : 0.4);
  if (warm > 0 || dawn > 0) {
    g.globalCompositeOperation = "soft-light";
    g.fillStyle = warm >= dawn ? `rgba(255,150,60,${0.45 * warm})` : `rgba(255,170,190,${0.35 * dawn})`;
    g.fillRect(0, 0, VW, VH);
  }
  g.globalCompositeOperation = "source-over";
  if (night > 0) {
    g.setTransform(z, 0, 0, z, ox, oy);
    // lit windows and lamp flames stay bright
    const flick = 0.85 + Math.sin(t * 9) * 0.05 + Math.sin(t * 23) * 0.04;
    for (const o of OBJ) {
      if (o.lights) for (const [lx, ly, lw, lh] of o.lights) { g.globalAlpha = night * 0.85; g.fillStyle = "#ffd77a"; g.fillRect(o.x + lx, o.y + ly, lw, lh); g.fillStyle = "#fff1b8"; g.fillRect(o.x + lx + 1, o.y + ly + 1, Math.max(1, lw - 2), Math.max(1, lh - 3)); }
      if (o.lamp) { g.globalAlpha = night * flick; g.fillStyle = "#ffe9a0"; g.fillRect(o.x + o.lamp[0] - 1, o.y + o.lamp[1] - 1, 3, 4); }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "lighter";
    for (const [x, y, r, s] of lights) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r * 0.6);
      gr.addColorStop(0, `rgba(255,170,80,${0.22 * night * s * flick})`); gr.addColorStop(1, "rgba(255,170,80,0)");
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = "source-over";
  }
}

const DROPS = [];
function drawWeather(t, dt) {
  const w = state.weather;
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (w === "clear") { DROPS.length = 0; return; }
  const VW = view.width, VH = view.height, n = w === "rain" ? 260 : 220;
  while (DROPS.length < n) DROPS.push({ x: Math.random() * VW, y: Math.random() * VH, s: 0.6 + Math.random() * 0.8, p: Math.random() * 6 });
  const px = Math.max(2, Math.round(DPR * state.zoom / 1.5));
  for (const d of DROPS) {
    if (w === "rain") {
      d.y += 620 * d.s * dt * DPR; d.x -= 140 * d.s * dt * DPR;
      g.fillStyle = "rgba(200,228,240,0.7)";
      for (let k = 0; k < 5; k++) g.fillRect(Math.round(d.x + k * px * 0.45), Math.round(d.y - k * px * 2), Math.max(1, px / 2), px * 2);
    } else {
      d.y += 40 * d.s * dt * DPR; d.x += Math.sin(t * 1.3 + d.p) * 18 * dt * DPR;
      g.fillStyle = "rgba(255,255,255,0.9)"; const sz = d.s > 1.1 ? px * 1.5 : px; g.fillRect(Math.round(d.x), Math.round(d.y), sz, sz);
    }
    if (d.y > VH + 10) { d.y = -10; d.x = Math.random() * VW * 1.2; }
    if (d.x < -10) d.x = VW + 5; if (d.x > VW + 10) d.x = -5;
  }
}

function drawLabel(p, s, ox, oy, z, t) {
  const sx = (s.x) * z + ox, sy = (s.y - 17) * z + oy;
  const fs = Math.round(Math.max(18, z * 6.2));
  g.font = `${fs}px VT323, monospace`; g.textAlign = "center"; g.textBaseline = "bottom";
  const sel = state.selected === p.id;
  // name tag
  g.lineWidth = Math.max(3, fs / 5); g.strokeStyle = "rgba(27,20,16,0.85)"; g.lineJoin = "round";
  g.strokeText(p.name, sx, sy); g.fillStyle = sel ? "#ffe18d" : "#fff6e6"; g.fillText(p.name, sx, sy);
  // emote over the head
  if (p.emote) {
    const im = IMG[p.emote]; const bob = Math.round(Math.sin(t * 3) * 1.5);
    const ex = Math.round((s.x - 7) * z + ox), ey = Math.round((s.y - 34 + bob) * z + oy) - fs * 0.6;
    g.imageSmoothingEnabled = false; g.drawImage(im, ex, ey, im.width * z, im.height * z);
  }
  // speech bubble
  if (p.say) {
    const pad = fs * 0.55, maxW = Math.max(200, fs * 11);
    g.font = `${fs}px VT323, monospace`;
    const words = p.say.split(" "), lines = []; let line = "";
    for (const wd of words) { const test = line ? line + " " + wd : wd; if (g.measureText(test).width > maxW && line) { lines.push(line); line = wd; } else line = test; }
    lines.push(line);
    const lw = Math.max(...lines.map((l) => g.measureText(l).width)), lh = fs * 0.95;
    const bw = Math.round(lw + pad * 2), bh = Math.round(lines.length * lh + pad * 1.4);
    const bx = Math.round(sx - bw * 0.2), by = Math.round(sy - fs * 1.15 - bh);
    const u = Math.max(2, Math.round(z * 0.8));
    g.fillStyle = "#3b2416"; roundRect(bx - u, by - u, bw + u * 2, bh + u * 2, u * 3); g.fill();
    g.fillStyle = "#fff8e8"; roundRect(bx, by, bw, bh, u * 2); g.fill();
    // tail
    const tx = Math.round(sx + u * 3);
    g.fillStyle = "#3b2416"; g.beginPath(); g.moveTo(tx - u * 4, by + bh - 1); g.lineTo(tx + u * 1, by + bh - 1); g.lineTo(tx - u * 3, by + bh + u * 5); g.closePath(); g.fill();
    g.fillStyle = "#fff8e8"; g.beginPath(); g.moveTo(tx - u * 3, by + bh - u); g.lineTo(tx, by + bh - u); g.lineTo(tx - u * 2.6, by + bh + u * 3); g.closePath(); g.fill();
    g.fillStyle = "#3b2416"; g.textAlign = "left"; g.textBaseline = "top";
    lines.forEach((l, i) => g.fillText(l, bx + pad, by + pad * 0.6 + i * lh));
  }
}
function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// ---------------------------------------------------------------- UI
const WEEKDAY = "Thứ Ba", DAY = 12;
const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
function weatherIcon() {
  const c = document.getElementById("wicon"); const w = ctx2d(c); w.clearRect(0, 0, 14, 14);
  const night = state.minutes >= 1140 || state.minutes < 330;
  const px = (x, y, col) => { w.fillStyle = col; w.fillRect(x, y, 1, 1); };
  if (state.weather === "rain") {
    w.fillStyle = "#8d977f"; w.fillRect(2, 3, 10, 4); w.fillRect(4, 1, 5, 2); w.fillStyle = "#abc2bc"; w.fillRect(3, 3, 8, 2);
    w.fillStyle = "#2d697b"; for (const [x, y] of [[3, 9], [6, 10], [9, 9], [4, 12], [8, 12]]) w.fillRect(x, y, 1, 2);
  } else if (state.weather === "snow") {
    w.fillStyle = "#8d977f"; w.fillRect(2, 3, 10, 4); w.fillRect(4, 1, 5, 2); w.fillStyle = "#f2eaf1"; w.fillRect(3, 3, 8, 2);
    for (const [x, y] of [[3, 9], [7, 10], [10, 9], [5, 12], [9, 12]]) px(x, y, "#4a5270");
  } else if (night) {
    w.fillStyle = "#f1c471"; w.fillRect(4, 2, 6, 10); w.fillRect(3, 4, 1, 6); w.fillRect(10, 3, 1, 8); w.clearRect(7, 2, 4, 8); w.fillStyle = "#ffe18d"; w.fillRect(5, 3, 1, 3);
  } else {
    w.fillStyle = "#ef914f"; for (const [x, y] of [[6, 0], [7, 0], [6, 13], [7, 13], [0, 6], [0, 7], [13, 6], [13, 7], [2, 2], [11, 2], [2, 11], [11, 11]]) w.fillRect(x, y, 1, 1);
    w.fillStyle = "#f1c471"; w.fillRect(4, 3, 6, 8); w.fillRect(3, 4, 8, 6); w.fillStyle = "#ffe18d"; w.fillRect(5, 4, 3, 2);
  }
}
function updateUI() {
  const S = SEASONS[state.season];
  document.getElementById("clocktext").innerHTML = `${S.name} ${DAY} <span class="sep">·</span> ${WEEKDAY} <span class="sep">·</span> ${fmt(state.minutes)}`;
  document.getElementById("timeval").textContent = fmt(state.minutes);
  document.getElementById("time").value = state.minutes;
  document.getElementById("zoomval").textContent = state.zoom;
  for (const b of document.querySelectorAll("[data-season]")) b.classList.toggle("on", b.dataset.season === state.season);
  for (const b of document.querySelectorAll("[data-weather]")) b.classList.toggle("on", b.dataset.weather === state.weather);
  weatherIcon();
}
function openCard(p) {
  state.selected = p ? p.id : null;
  const card = document.getElementById("card");
  if (!p) { card.classList.remove("open"); return; }
  card.classList.add("open");
  document.getElementById("cname").textContent = p.name;
  document.getElementById("cjob").textContent = `${p.job} · ${p.age} tuổi`;
  document.getElementById("chearts").textContent = "♥".repeat(p.hearts) + "♡".repeat(5 - p.hearts);
  const colors = { "Sức lực": "#74a334", "No bụng": "#ef914f", "Vui vẻ": "#e0394c" };
  document.getElementById("cbars").innerHTML = Object.entries(p.mood).map(([k, v]) => `<div class="bar"><span>${k}</span><span class="meter"><i style="width:${Math.round(v * 100)}%;background:${colors[k]}"></i></span><span>${Math.round(v * 10)}</span></div>`).join("");
  document.getElementById("cdoing").innerHTML = `<b>Hôm nay</b><br>${p.doing}`;
  const fc = document.getElementById("facebox"); const f = ctx2d(fc); f.clearRect(0, 0, 48, 48);
  f.drawImage(IMG.facebox, 0, 0); f.drawImage(IMG["fa_" + p.sheet], 5, 5);
}

function setupUI() {
  for (const b of document.querySelectorAll("[data-season]")) b.addEventListener("click", () => { state.season = b.dataset.season; updateUI(); });
  for (const b of document.querySelectorAll("[data-weather]")) b.addEventListener("click", () => { state.weather = b.dataset.weather; updateUI(); });
  const tm = document.getElementById("time");
  tm.addEventListener("input", () => { state.minutes = Number(tm.value); updateUI(); });
  document.getElementById("cardclose").addEventListener("click", () => openCard(null));
  // drag to pan, wheel to zoom, click to pick a villager
  let drag = null;
  view.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, cx: state.cx, cy: state.cy, moved: false }; view.setPointerCapture(e.pointerId); view.classList.add("drag"); });
  view.addEventListener("pointermove", (e) => {
    if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    state.cx = drag.cx - dx / state.zoom; state.cy = drag.cy - dy / state.zoom; clampCam();
  });
  view.addEventListener("pointerup", (e) => {
    view.classList.remove("drag");
    if (drag && !drag.moved) pick(e.clientX, e.clientY);
    drag = null;
  });
  view.addEventListener("wheel", (e) => {
    e.preventDefault();
    const nz = Math.min(5, Math.max(2, state.zoom + (e.deltaY < 0 ? 1 : -1)));
    if (nz === state.zoom) return;
    // keep the point under the cursor still
    const wx = state.cx + (e.clientX - W / 2) / state.zoom, wy = state.cy + (e.clientY - H / 2) / state.zoom;
    state.zoom = nz; state.cx = wx - (e.clientX - W / 2) / nz; state.cy = wy - (e.clientY - H / 2) / nz; clampCam(); updateUI();
  }, { passive: false });
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") openCard(null); });
}
function pick(cx, cy) {
  const wx = state.cx + (cx - W / 2) / state.zoom, wy = state.cy + (cy - H / 2) / state.zoom;
  let best = null, bd = 1e9;
  for (const p of PEOPLE) { const s = personAt(p, lastT); const dx = wx - s.x, dy = wy - (s.y - 8); const d = dx * dx + dy * dy; if (Math.abs(dx) < 10 && dy > -12 && dy < 10 && d < bd) { best = p; bd = d; } }
  openCard(best);
}

// test hook for screenshots: window.mock.set({season, minutes, weather, zoom, cx, cy, select})
window.mock = {
  state, set(o) { Object.assign(state, o); if (o.select !== undefined) openCard(PEOPLE.find((p) => p.id === o.select) || null); clampCam(); updateUI(); },
};

(async function main() {
  resize(); setupUI();
  try { await loadAll(); } catch (e) { document.body.insertAdjacentHTML("beforeend", `<p style="color:#fff;position:fixed;top:40%;width:100%;text-align:center;font-size:28px">${e.message}</p>`); return; }
  try { await document.fonts.load("20px VT323"); } catch { /* font is optional */ }
  buildBridge();
  for (const s of Object.keys(SEASONS)) prepareSeason(s);
  updateUI();
  if (qs.get("select")) openCard(PEOPLE.find((p) => p.id === qs.get("select")) || null);
  requestAnimationFrame(frame);
})();
