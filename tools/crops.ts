// Draws what the asset packs lack for the village: crops in growth stages and tilled soil (dry and wet).
// 16×16 pixel art in the colours of Ninja Adventure's Palette.png, with the pack's dark outline added around each shape.
//
//   node tools/crops.ts [--preview out.png]   writes web/assets/crops/crops.png and tilled.png (and a ×4 preview sheet if asked)
//
// crops.png:  one row per crop (cải, cà rốt, ngô, bí ngô, lúa), one column per stage (0 seeds … 4 ripe), 16×16 each.
// tilled.png: row 0 dry, row 1 wet; column = which neighbours are tilled too (N=1, E=2, S=4, W=8), so 16 columns.
// No dependencies: a small PNG encoder over node:zlib.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "assets", "crops");

// Colours from Palette.png (the pack's own palette); the outline is the pack's #141b1b.
const C: Record<string, string> = {
  G: "#56864c", g: "#74a334", l: "#adbc3a", v: "#a8a129", k: "#345a52",
  h: "#ffe18d", Y: "#f1c471", B: "#d78b4a",
  o: "#ffad5d", O: "#ef914f", C: "#e46d3a", R: "#d14b34",
  b: "#965340", d: "#bd7959", w: "#f2eaf1", s: "#816855",
};
const OUTLINE = "#141b1b";

type Art = { rows: string[]; outline?: boolean };

const SEEDS: Art = { outline: false, rows: [
  "................", "................", "................", "................",
  "................", "................", "................", "................",
  "................", "................",
  "...hY......hY...",
  "...bb......bb...",
  "................",
  ".......hY.......",
  ".......bb.......",
  "................"] };

const SPROUT: Art = { rows: [
  "................", "................", "................", "................",
  "................", "................", "................", "................",
  "................",
  "....ll....ll....",
  "...lggl..lggl...",
  "....lggllggl....",
  "......gggg......",
  ".......gG.......",
  "................", "................"] };

const CROPS: Record<string, Art[]> = {
  cai: [SEEDS, SPROUT,
    { rows: [
      "................", "................", "................", "................",
      "................", "................", "................",
      "................",
      ".......ll.......",
      "....l.lggl.l....",
      "...lglgllglgl...",
      "...gglllllvgg...",
      "....gGlllvGg....",
      ".....GGGGGG.....",
      "................", "................"] },
    { rows: [
      "................", "................", "................", "................",
      "................",
      "......l..l......",
      "...l.lgllgl.l...",
      "..lgllglllglgl..",
      "..ggllllllllgg..",
      ".gglllhllllvlgg.",
      ".gGgllllllvvgGg.",
      "..gGglllvvvgGg..",
      "...gGGgvvgGGg...",
      ".....GGGGGG.....",
      "................", "................"] },
    { rows: [
      "................", "................", "................",
      "......llll......",
      "....llhhllll....",
      "...lhhlllllvl...",
      "..llhlllllllvl..",
      ".gllllllllllvlg.",
      ".gglllllllllvgg.",
      "gglgllllllvvglgg",
      "gGggvllllvvvggGg",
      ".gGggvvvvvvggGg.",
      "..gGGggggggGGg..",
      "....GGGGGGGG....",
      "................", "................"] }],
  carot: [SEEDS, SPROUT,
    { rows: [
      "................", "................", "................", "................",
      "................", "................", "................",
      "................",
      "......l..l......",
      ".....lgllgl.....",
      "....l.lgg.l.....",
      ".....lgggl......",
      "......ggg.......",
      ".......G........",
      "................", "................"] },
    { rows: [
      "................", "................", "................", "................",
      "................",
      ".....l...l......",
      "....lgl.lgl.....",
      ".....glglg.l....",
      "...l..ggg.lgl...",
      "..lgl.ggg.gl....",
      "...gggggggg.....",
      ".....ggGgg......",
      "......GGG.......",
      "................", "................", "................"] },
    { rows: [
      "................", "................",
      ".....l....l.....",
      "....lgl..lgl....",
      ".....ggl.gg..l..",
      "..l...gglg..lgl.",
      ".lgl..gggg.gg...",
      "..ggl.gggggg....",
      "....gggggGg.....",
      "......gGGg......",
      ".....CoOOC......",
      ".....COOOC......",
      "......CCC.......",
      "................", "................", "................"] }],
  ngo: [SEEDS,
    { rows: [
      "................", "................", "................", "................",
      "................", "................", "................", "................",
      "........l.......",
      ".......lg.......",
      "....l..lg.......",
      ".....lgggl......",
      "......lgg.......",
      ".......G........",
      "................", "................"] },
    { rows: [
      "................", "................", "................", "................",
      "................", "................",
      "........l.......",
      "........gl......",
      "......l.g.......",
      ".....lg.g.ll....",
      "......ggggg.....",
      "....llgggg......",
      ".......ggl......",
      ".......GG.......",
      "................", "................"] },
    { rows: [
      "................", "................",
      ".......l........",
      "......lg........",
      "......gg..ll....",
      "...ll.gG.lgg....",
      "..lgg.gGlg......",
      "....gggG........",
      "......gGggll....",
      "..llggGG..ggl...",
      ".lg...gG....g...",
      "......gG........",
      ".....lgGg.......",
      "......GG........",
      "................", "................"] },
    { rows: [
      "................",
      "......B..B......",
      ".....B.BB.B.....",
      ".......BB.......",
      "......gg..ll....",
      "...ll.gGhlgg....",
      "..lgg.gGYY......",
      "....gggGYYl.....",
      "......gGYglll...",
      "..llggGGg...gl..",
      ".lg.hYgG........",
      "....YYgG........",
      ".....lgGg.......",
      "......GG........",
      "................", "................"] }],
  bi: [SEEDS, SPROUT,
    { rows: [
      "................", "................", "................", "................",
      "................", "................", "................", "................",
      "................",
      "....lll..ll.....",
      "...lgggl.lgl....",
      "...gggg.ggggl...",
      "....ggGGGgg.....",
      "......GG........",
      "................", "................"] },
    { rows: [
      "................", "................", "................", "................",
      "................",
      ".........hY.....",
      "...lll..hYYY....",
      "..lgggl..YY.ll..",
      "..ggggg.gG.lggl.",
      "...ggGGGGggggg..",
      ".lll.GG...ggg...",
      ".lggl.G.........",
      "..gg............",
      "................", "................", "................"] },
    { rows: [
      "................", "................", "................",
      ".........lll....",
      "........lgggl...",
      ".......bgggg....",
      "....CCCbCCC.....",
      "...COoOCOoOC....",
      "..COooOCOooOC...",
      "..COoOOCOOoOC...",
      "..COOOOCOOOOC...",
      "..CCOOOCOOOCC.g.",
      "...CCCCCCCCC.gl.",
      ".gl.........gg..",
      "................", "................"] }],
  lua: [SEEDS,
    { rows: [
      "................", "................", "................", "................",
      "................", "................", "................", "................",
      "................",
      "......l...l.....",
      "...l..l..l......",
      "....l.gl.l......",
      ".....lgggl......",
      "......gGg.......",
      "................", "................"] },
    { rows: [
      "................", "................", "................", "................",
      "................", "................",
      "......l...l.....",
      "...l..l..l..l...",
      "....l.gl.l.l....",
      "....lg.gl.gl....",
      ".....gg.g.g.....",
      "......ggggg.....",
      ".......gGg......",
      "................", "................", "................"] },
    { rows: [
      "................", "................",
      "......l....l....",
      "..l...l...l.....",
      "...l..gl..l..l..",
      "...lg.g.lgl.l...",
      "....g.gl.g.lg...",
      "....lg.g.g.g....",
      ".....gg.gggg....",
      ".....g.ggg.g....",
      "......ggggg.....",
      "......gGgGg.....",
      ".......GGG......",
      "................", "................", "................"] },
    { rows: [
      "................",
      "......h...h.....",
      "....hY.Y.Y.Yh...",
      "...Y..YvYvY..Y..",
      "..Y..Y.vYv.Y..Y.",
      ".....YvvvvvY....",
      "....B.vvvvv.B...",
      "......vvvvv.....",
      ".....vvvvvvv....",
      ".....v.vvv.v....",
      "......vvvvv.....",
      "......vvvvv.....",
      "......vbvbv.....",
      ".......bbb......",
      "................", "................"] }],
};
const ORDER = ["cai", "carot", "ngo", "bi", "lua"];

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];

type Img = { w: number; h: number; data: Uint8Array };
const blank = (w: number, h: number): Img => ({ w, h, data: new Uint8Array(w * h * 4) });
const set = (im: Img, x: number, y: number, c: number[]) => { if (x < 0 || y < 0 || x >= im.w || y >= im.h) return; im.data.set(c, (y * im.w + x) * 4); };
const alpha = (im: Img, x: number, y: number) => (x < 0 || y < 0 || x >= im.w || y >= im.h ? 0 : im.data[(y * im.w + x) * 4 + 3]);

function drawArt(im: Img, art: Art, ox: number, oy: number) {
  if (art.rows.length !== 16 || art.rows.some((r) => r.length !== 16)) throw new Error("art must be 16×16: " + JSON.stringify(art.rows));
  const fill = (x: number, y: number) => x >= 0 && y >= 0 && x < 16 && y < 16 && art.rows[y][x] !== ".";
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const ch = art.rows[y][x];
    if (ch !== ".") { if (!C[ch]) throw new Error("no colour for " + ch); set(im, ox + x, oy + y, hex(C[ch])); }
    else if (art.outline !== false && (fill(x - 1, y) || fill(x + 1, y) || fill(x, y - 1) || fill(x, y + 1))) set(im, ox + x, oy + y, hex(OUTLINE));
  }
}

// Tilled soil: furrows across, a darker rim and a lip where the patch ends, rounded outer corners.
function drawTilled(im: Img, mask: number, wet: boolean, ox: number, oy: number) {
  const P = wet ? { base: "#965340", dark: "#543c52", hi: "#9c6546", rim: "#4e484a" } : { base: "#a3754e", dark: "#965340", hi: "#bd7959", rim: "#965340" };
  const N = mask & 1, E = mask & 2, S = mask & 4, W = mask & 8;
  const x0 = W ? 0 : 1, x1 = E ? 15 : 14, y0 = N ? 0 : 1, y1 = S ? 15 : 13;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const corner = (!N && !W && x === x0 && y === y0) || (!N && !E && x === x1 && y === y0) || (!S && !W && x === x0 && y === y1) || (!S && !E && x === x1 && y === y1);
    if (corner) continue;
    const edge = (!W && x === x0) || (!E && x === x1) || (!N && y === y0) || (!S && y === y1);
    const row = y % 4; // furrow every 4 px: highlight, base, base, groove
    let c = row === 3 ? P.dark : row === 0 ? P.hi : P.base;
    if (edge) c = P.rim;
    set(im, ox + x, oy + y, hex(c));
  }
  if (!S) for (let x = x0 + 1; x <= x1 - 1; x++) set(im, ox + x, oy + y1 + 1, hex(P.rim)); // lip under the patch
}

function png(im: Img): Buffer {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b: Buffer) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, "ascii"), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(im.w, 0); ih.writeUInt32BE(im.h, 4); ih[8] = 8; ih[9] = 6;
  const raw = Buffer.alloc((im.w * 4 + 1) * im.h);
  for (let y = 0; y < im.h; y++) raw.set(im.data.subarray(y * im.w * 4, (y + 1) * im.w * 4), y * (im.w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync(OUT, { recursive: true });
const crops = blank(16 * 5, 16 * ORDER.length);
ORDER.forEach((name, r) => CROPS[name].forEach((art, s) => drawArt(crops, art, s * 16, r * 16)));
writeFileSync(join(OUT, "crops.png"), png(crops));

const tilled = blank(16 * 16, 32);
for (let m = 0; m < 16; m++) { drawTilled(tilled, m, false, m * 16, 0); drawTilled(tilled, m, true, m * 16, 16); }
writeFileSync(join(OUT, "tilled.png"), png(tilled));

// preview: each crop stage on dry and wet soil, ×4, to check the art by eye
const pv = blank(5 * 16 * 2 * 4 + 8, ORDER.length * 16 * 4);
const bg = hex("#d3865f");
for (let i = 0; i < pv.w * pv.h; i++) pv.data.set(bg, i * 4);
for (let r = 0; r < ORDER.length; r++) for (let s = 0; s < 10; s++) {
  const wet = s >= 5, st = s % 5;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const tx = Math.floor(x / 4), ty = Math.floor(y / 4);
    const pick = (im: Img, sx: number, sy: number) => im.data.subarray(((sy) * im.w + sx) * 4, ((sy) * im.w + sx) * 4 + 4);
    const t = pick(tilled, 10 * 16 + tx, (wet ? 16 : 0) + ty); // mask E|W: a row of soil
    const c = pick(crops, st * 16 + tx, r * 16 + ty);
    const px = s * 64 + (wet ? 8 : 0) + x, py = r * 64 + y;
    if (t[3]) pv.data.set(t, (py * pv.w + px) * 4);
    if (c[3]) pv.data.set(c, (py * pv.w + px) * 4);
  }
}
const pi = process.argv.indexOf("--preview");
if (pi > 0) writeFileSync(process.argv[pi + 1], png(pv));
console.log("wrote", OUT);
