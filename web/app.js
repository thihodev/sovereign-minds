// Watcher UI. Everything AI-written is inserted as text (esc), never as HTML.
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const api = async (path, opts = {}) => {
    const res = await fetch(path, { headers: { "content-type": "application/json" }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };
  // ---------------------------------------------------------------- small pieces of every panel: numbers first, words behind a "?"
  const fmt = v => Math.round(+v || 0).toLocaleString("vi-VN");
  const fmt1 = v => (Math.round((+v || 0) * 10) / 10).toLocaleString("vi-VN");
  const signed = v => Math.abs(v) < 0.05 ? "±0" : `${v > 0 ? "+" : "−"}${fmt1(Math.abs(v))}`;
  const toneOf = (v, good, warn) => v >= good ? "good" : v >= warn ? "warn" : "bad";
  const pctOf = (a, b) => b > 0 ? Math.max(0, Math.min(100, a / b * 100)) : 0;
  /** A "?" that explains on hover or focus, so the panels carry numbers, not paragraphs. */
  const tip = text => text ? `<span class="tip" tabindex="0" role="img" aria-label="${esc(text)}" title="${esc(text)}">?</span>` : "";
  const meter = (pct, cls = "", label = "") => `<span class="meter ${cls}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"${label ? ` aria-label="${esc(label)}"` : ""}><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span>`;
  /** A key number: small label, big value, an optional change or bar; the story behind it in the title. */
  const statTile = ({ l, v, d = "", dt = "", m = null, mt = "", t = "" }) =>
    `<div class="tile"${t ? ` title="${esc(t)}"` : ""}><span class="l">${l}</span><b class="v">${v}</b>${d ? `<span class="d ${dt}">${d}</span>` : ""}${m !== null ? meter(m, mt) : ""}</div>`;
  /** A section with a header; `fold` makes it collapsible, its open state remembered per key. */
  const SEC_OPEN = (() => { try { return JSON.parse(localStorage.getItem("sm-sec") || "{}"); } catch { return {}; } })();
  function sec(key, title, body, { count = "", cls = "", aside = "", help = "", fold = true, open = false } = {}) {
    const head = `${title}${count !== "" && count !== null ? ` <span class="cnt ${cls}">${count}</span>` : ""}${help ? tip(help) : ""}${aside ? `<span class="aside">${aside}</span>` : ""}`;
    if (!fold) return `<section class="sec"><h4 class="sec-h">${head}</h4>${body}</section>`;
    const isOpen = key in SEC_OPEN ? SEC_OPEN[key] : open;
    return `<details class="sec" data-sec="${esc(key)}"${isOpen ? " open" : ""}><summary>${head}</summary>${body}</details>`;
  }
  document.addEventListener("toggle", e => {
    const d = e.target; if (!(d instanceof HTMLDetailsElement) || !d.dataset.sec) return;
    SEC_OPEN[d.dataset.sec] = d.open; try { localStorage.setItem("sm-sec", JSON.stringify(SEC_OPEN)); } catch { }
  }, true);
  /** The first `n` items, the rest behind "xem thêm" (one click, no reload). */
  function topN(items, n, wrap = x => x.join("")) {
    if (items.length <= n) return wrap(items);
    const label = `+ ${items.length - n} nữa`;
    return `${wrap(items.slice(0, n))}<div class="more-box" hidden>${wrap(items.slice(n))}</div><button type="button" class="more" data-more="${label}">${label}</button>`;
  }
  document.addEventListener("click", e => {
    const b = e.target.closest?.("button[data-more]"); if (!b) return;
    const box = b.previousElementSibling; if (!box?.classList.contains("more-box")) return;
    box.hidden = !box.hidden; b.textContent = box.hidden ? b.dataset.more : "Thu gọn";
  });
  const chipList = (items, cls = "") => items.length ? `<div class="chips ${cls}">${items.join("")}</div>` : `<p class="empty">—</p>`;
  const SWORD = "⚔️";
  const SQ3 = Math.sqrt(3);
  const TERRAIN = {
    ocean: ["Biển sâu", "#1d4a66"], shallow: ["Biển nông", "#2d6c8c"], grass: ["Đồng cỏ", "#9dbb68"], forest: ["Rừng", "#4e7d45"],
    taiga: ["Rừng lá kim", "#3d6450"], jungle: ["Rừng rậm", "#2c6a3a"], hill: ["Đồi", "#b39a63"], mountain: ["Núi", "#8b8179"],
    coast: ["Ven biển", "#d3cb9b"], swamp: ["Đầm lầy", "#6d8a6c"], desert: ["Sa mạc", "#dcc48a"], tundra: ["Lãnh nguyên", "#b7c2b4"],
    glacier: ["Băng hà", "#c4d8e2"], icewall: ["Tường Băng", "#eef7fc"],
  };
  const ZONE = { cold: "Hàn đới", temp: "Ôn đới", trop: "Nhiệt đới" };
  const RES = { game: "thú săn", plants: "cây dại", fish: "cá", wood: "gỗ", stone: "đá", flint: "đá lửa", clay: "đất sét", salt: "muối", reeds: "sậy", herbs: "thảo dược", copper: "quặng đồng", tin: "quặng thiếc", iron: "sắt", food: "lương thực", fiber: "sợi", hide: "da", bone: "xương", stone_tool: "công cụ đá", blade: "lưỡi đá", rope: "dây thừng", hide_coat: "áo da", spear: "giáo", bow: "cung tên", axe: "rìu", pottery: "gốm", cloth: "vải", coal: "than đá", oil: "dầu mỏ", sulfur: "lưu huỳnh", horse: "ngựa hoang", boat: "thuyền",
    honey: "mật ong", spice: "gia vị", fur: "lông thú", amber: "hổ phách", ochre: "đất son", marble: "cẩm thạch", gold: "vàng", silver: "bạc", gems: "đá quý",
    shellfish: "sò ốc", pearl: "ngọc trai", coral: "san hô", whale: "cá voi", whale_oil: "dầu cá voi", coin: "tiền", food_reserve: "lương dự trữ",
    wolf: "sói hoang", wild_goat: "dê núi hoang", aurochs: "bò rừng", boar: "lợn rừng", junglefowl: "gà rừng", dog: "chó", goat: "dê cừu", cattle: "bò", pig: "lợn", fowl: "gà" };
  const ROLE = { gather: "hái lượm", hunt: "săn", fish: "cá", farm: "nông", wood: "gỗ", stone: "đá", flint: "đá lửa", clay: "đất sét", mine: "khai mỏ", craft: "chế tác", build: "xây", research: "nghiên cứu", warrior: "chiến binh" };

  let ST = null, S = null, geo = null, hoverI = -1;
  let M3 = null, is3D = false; // the 3D map, when the Watcher turns it on (web/map3d.js)
  const cv = $("#map"), ctx = cv.getContext("2d");
  const base = document.createElement("canvas"), bctx = base.getContext("2d");

  // ---------------------------------------------------------------- flags
  function drawFlag(g, x, y, w, h, flag, px = 1) {
    const c = flag.colors || ["#888", "#fff"], a = c[0], b = c[1] || "#fff", d = c[2] || a;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = a; g.fillRect(x, y, w, h);
    const L = flag.layout;
    if (L === "h2") { g.fillStyle = b; g.fillRect(x, y + h / 2, w, h / 2); }
    else if (L === "h3") { g.fillStyle = b; g.fillRect(x, y + h / 3, w, h / 3); g.fillStyle = d; g.fillRect(x, y + 2 * h / 3, w, h / 3); }
    else if (L === "v2") { g.fillStyle = b; g.fillRect(x + w / 2, y, w / 2, h); }
    else if (L === "v3") { g.fillStyle = b; g.fillRect(x + w / 3, y, w / 3, h); g.fillStyle = d; g.fillRect(x + 2 * w / 3, y, w / 3, h); }
    else if (L === "cross") { g.fillStyle = b; g.fillRect(x + w * 0.4, y, w * 0.2, h); g.fillRect(x, y + h * 0.4, w, h * 0.2); }
    else if (L === "diagonal") { g.fillStyle = b; g.beginPath(); g.moveTo(x + w, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.fill(); }
    else if (L === "border") { g.strokeStyle = b; g.lineWidth = Math.max(2 * px, h * 0.16); g.strokeRect(x, y, w, h); }
    // symbol: a simple shape in the second colour
    const cx = x + w / 2, cy = y + h / 2, r = h * 0.24;
    g.fillStyle = L === "plain" || L === "border" ? b : (L === "cross" ? a : "#ffffffcc");
    g.beginPath();
    const sym = flag.symbol;
    if (["sun", "circle", "eye"].includes(sym)) g.arc(cx, cy, r, 0, 7);
    else if (sym === "moon") { g.arc(cx, cy, r, 0.6, 5.7); g.arc(cx + r * 0.5, cy, r * 0.8, 5.5, 0.8, true); }
    else if (["star", "spiral", "crown"].includes(sym)) { for (let k = 0; k < 10; k++) { const an = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r * 1.1; g.lineTo(cx + rr * Math.cos(an), cy + rr * Math.sin(an)); } }
    else if (["mountain", "triangle", "fire", "arrow", "spear"].includes(sym)) { g.moveTo(cx - r, cy + r * 0.8); g.lineTo(cx, cy - r); g.lineTo(cx + r, cy + r * 0.8); }
    else if (["diamond", "fish", "leaf"].includes(sym)) { g.moveTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r, cy); }
    else if (["wave", "river", "snake"].includes(sym)) { g.rect(cx - r, cy - r * 0.25, r * 2, r * 0.5); }
    else { g.rect(cx - r * 0.7, cy - r * 0.7, r * 1.4, r * 1.4); }
    g.closePath(); g.fill();
    g.restore();
    g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = px; g.strokeRect(x + px / 2, y + px / 2, w - px, h - px);
  }
  function flagCanvas(flag, w = 42, h = 28) {
    const c = document.createElement("canvas"), dpr = Math.min(2, devicePixelRatio || 1);
    c.width = w * dpr; c.height = h * dpr; c.style.width = w + "px"; c.style.height = h + "px";
    const g = c.getContext("2d"); g.scale(dpr, dpr); drawFlag(g, 0, 0, w, h, flag); return c;
  }

  // ---------------------------------------------------------------- map
  // The canvas fills the screen (geo.cw × geo.ch). World coordinates are the world laid out to
  // fit that screen (geo.w × geo.h, CSS px). The view maps world -> screen:
  // screen = world * z + (tx, ty). Docks float over the edges, so "fit" uses the visible rect.
  const mapview = $("#mapview");
  const view = { z: 1, tx: 0, ty: 0 };
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let pinnedI = -1, focusFx = null, anim = 0;
  const WILD_R = 6; // hexes around each wilderness centre shown as "vùng hoang" (beasts are fiercer there, §9.4)

  function layout() {
    // keep what the Watcher was looking at when the screen changes size
    const keep = geo ? { fx: (geo.cw / 2 - view.tx) / view.z / geo.w, fy: (geo.ch / 2 - view.ty) / view.z / geo.h, z: view.z } : null;
    const N = ST.n, cw = Math.max(200, mapview.clientWidth), ch = Math.max(200, mapview.clientHeight), pad = 6;
    const uw = (N + 0.5) * SQ3, uh = 1.5 * (N - 1) + 2;
    const s = Math.min((cw - 2 * pad) / uw, (ch - 2 * pad) / uh), w = uw * s + 2 * pad, h = uh * s + 2 * pad, dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    // terrain cache: sharper than the screen so moderate zoom stays crisp; deeper zoom draws tiles directly
    const bs = Math.max(1, Math.min(3, 4096 / (Math.max(w, h) * dpr)));
    base.width = Math.round(w * dpr * bs); base.height = Math.round(h * dpr * bs);
    geo = { N, s, pad, w, h, cw, ch, dpr, bs, ox: pad + s * SQ3 / 2, oy: pad + s, zmin: 0.3, zmax: Math.max(4, 110 / s) };
    if (keep) { view.z = keep.z; view.tx = cw / 2 - keep.fx * w * view.z; view.ty = ch / 2 - keep.fy * h * view.z; clampView(view); }
    else Object.assign(view, fitView());
  }
  const center = i => { const N = geo.N, c = i % N, r = (i / N) | 0; return [geo.ox + geo.s * SQ3 * (c + 0.5 * (r & 1)), geo.oy + 1.5 * geo.s * r]; };
  const cube = i => { const N = geo.N, c = i % N, r = (i / N) | 0, q = c - (r - (r & 1)) / 2; return [q, r]; };
  const hexDist = (a, b) => { const [q1, r1] = cube(a), [q2, r2] = cube(b), dq = q1 - q2, dr = r1 - r2; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; };
  function hexPath(g, x, y, s) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 30); k ? g.lineTo(x + s * Math.cos(a), y + s * Math.sin(a)) : g.moveTo(x + s * Math.cos(a), y + s * Math.sin(a)); } g.closePath(); }
  // size and px are in world units; px = one screen CSS pixel at the current zoom
  function label(g, text, x, y, size, color = "#fff", weight = 600, px = 1) {
    g.font = `${weight} ${size}px "Be Vietnam Pro", system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
    g.lineWidth = Math.max(2 * px, size / 3.5); g.strokeStyle = "rgba(8,20,28,.85)"; g.strokeText(text, x, y); g.fillStyle = color; g.fillText(text, x, y);
  }
  // labels that would cover one already on the map are left out (capitals first, then settlements, then the rest)
  let placed = [];
  function fits(x0, y0, x1, y1) { for (const r of placed) if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return false; return true; }
  function reserve(g, text, x, y, size, weight, px) {
    g.font = `${weight} ${size}px "Be Vietnam Pro", system-ui, sans-serif`;
    const w = g.measureText(text).width / 2 + 4 * px, h = size * .7;
    placed.push([x - w, y - h, x + w, y + h]);
  }
  /** A label that steps aside: drawn only where it covers nothing drawn before it. `pill`: on a dark backing. */
  function tag(g, text, x, y, size, color, weight, px, pill = false) {
    g.font = `${weight} ${size}px "Be Vietnam Pro", system-ui, sans-serif`;
    const w = g.measureText(text).width / 2 + 4 * px, h = size * .7;
    if (!fits(x - w, y - h, x + w, y + h)) return false;
    placed.push([x - w, y - h, x + w, y + h]);
    if (pill) { g.beginPath(); g.roundRect?.(x - w - 2 * px, y - h, 2 * w + 4 * px, 2 * h, h); g.fillStyle = "rgba(8,20,28,.62)"; g.fill(); }
    label(g, text, x, y, size, color, weight, px);
    return true;
  }
  const NB = (i) => { const N = geo.N, c = i % N, r = (i / N) | 0, D = r & 1 ? [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]] : [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]]; return D.map(([dc, dr]) => [c + dc, r + dr]).map(([cc, rr]) => cc >= 0 && cc < N && rr >= 0 && rr < N ? rr * N + cc : -1); };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function drawTerrain(g, vis, px) {
    const s = geo.s, T = ST.terrain;
    for (let i = 0; i < T.length; i++) { if (vis && !vis(i)) continue; const [x, y] = center(i); hexPath(g, x, y, s * 1.02); g.fillStyle = TERRAIN[T[i]][1]; g.fill(); }
    for (let i = 0; i < T.length; i++) {
      const t = T[i]; if (vis && !vis(i)) continue;
      const [x, y] = center(i);
      if (t === "mountain") { g.beginPath(); g.moveTo(x - s * .55, y + s * .35); g.lineTo(x, y - s * .5); g.lineTo(x + s * .55, y + s * .35); g.closePath(); g.fillStyle = "#6b625b"; g.fill(); }
      else if (t === "hill") { g.beginPath(); g.arc(x, y + s * .3, s * .42, Math.PI * 1.1, Math.PI * 1.9); g.strokeStyle = "#8d7746"; g.lineWidth = Math.max(px, s * .12); g.stroke(); }
      else if (t === "forest" || t === "taiga" || t === "jungle") { g.fillStyle = "rgba(10,40,20,.35)"; g.beginPath(); g.arc(x - s * .22, y + s * .05, s * .2, 0, 7); g.arc(x + s * .22, y - s * .08, s * .2, 0, 7); g.fill(); }
      else if (t === "glacier") { g.strokeStyle = "rgba(90,130,160,.55)"; g.lineWidth = Math.max(px * .8, s * .08); g.beginPath(); g.moveTo(x - s * .45, y - s * .1); g.lineTo(x - s * .1, y + s * .15); g.lineTo(x + s * .35, y - s * .05); g.stroke(); }
      else if (t === "icewall") {
        // seracs: pale spikes, and a deep blue cliff shadow on every face that looks into the world
        g.fillStyle = "#ffffff"; g.beginPath(); g.moveTo(x - s * .5, y + s * .35); g.lineTo(x - s * .2, y - s * .55); g.lineTo(x + s * .05, y + s * .1); g.lineTo(x + s * .3, y - s * .4); g.lineTo(x + s * .55, y + s * .35); g.closePath(); g.fill();
        const nb = NB(i);
        g.strokeStyle = "rgba(38,86,122,.75)"; g.lineWidth = Math.max(1.5 * px, s * .38); g.beginPath();
        for (let k = 0; k < 6; k++) {
          if (nb[k] < 0 || T[nb[k]] === "icewall") continue;
          const a1 = Math.PI / 180 * ([0, -60, -120, 180, 120, 60][k] - 30), a2 = a1 + Math.PI / 3;
          g.moveTo(x + s * .86 * Math.cos(a1), y + s * .86 * Math.sin(a1)); g.lineTo(x + s * .86 * Math.cos(a2), y + s * .86 * Math.sin(a2));
        }
        g.stroke();
      }
    }
    g.lineCap = "round"; g.lineJoin = "round";
    for (const path of ST.rivers) { g.beginPath(); path.forEach((i, k) => { const [x, y] = center(i); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.strokeStyle = "#5fb4e6"; g.lineWidth = Math.max(1.4 * px, s * .32); g.stroke(); }
  }
  function drawBase() {
    const g = bctx, k = geo.dpr * geo.bs;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = TERRAIN.ocean[1]; g.fillRect(0, 0, geo.w, geo.h);
    drawTerrain(g, null, 1 / geo.bs);
  }

  const nationColor = id => S.nations[id]?.founded ? S.nations[id].flag.colors[0] : "#cccccc";
  /** White for a dark colour, near-black for a light one: the halo that keeps a border visible on any land. */
  const contrastMemo = new Map();
  function contrastOf(hex) {
    if (!contrastMemo.has(hex)) {
      const v = parseInt(String(hex).slice(1), 16), lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const L = 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
      contrastMemo.set(hex, L < 0.3 ? "#ffffff" : "#0b1a22");
    }
    return contrastMemo.get(hex);
  }
  const nationName = n => n.founded ? n.name : `Bộ lạc ${n.id + 1}`;

  // ------------------------------------------------ map layers: threats and resources (§9.4)
  const THREAT_LAYERS = { danger: "Mối đe dọa (tổng hợp)", beasts: "Thú dữ", hordes: "Man di", flood: "Lũ lụt", cold: "Giá rét, gió băng" };
  let layerKind = "", layerData = null, layerMax = 1, layerReq = 0;
  async function loadLayer() {
    const my = ++layerReq;
    if (!layerKind) { layerData = null; showLayerScale(); scheduleRender(); M3?.setLayer(null); return; }
    let r; try { r = await api(`/api/layer?kind=${encodeURIComponent(layerKind)}`); } catch { return; }
    if (my !== layerReq) return;
    layerData = r.values;
    if (layerKind in THREAT_LAYERS) layerMax = 5;
    else { const pos = layerData.filter(v => v > 0).sort((a, b) => a - b); layerMax = pos.length ? pos[Math.floor(pos.length * 0.95)] || pos[pos.length - 1] : 1; }
    showLayerScale(); scheduleRender();
    M3?.setLayer(layerData, layerMax, layerKind in THREAT_LAYERS);
  }
  function showLayerScale() {
    const box = $("#layer-scale"); box.hidden = !layerData;
    if (!layerData) return;
    const threat = layerKind in THREAT_LAYERS;
    box.className = `layer-scale ${threat ? "threat" : "res"}`;
    $("#layer-scale-text").textContent = threat ? "an toàn → nguy hiểm" : `0 → ${Math.round(layerMax)}+ ${RES[layerKind] ?? layerKind}`;
  }
  function drawLayer(g, vis, s) {
    if (!layerData) return;
    const threat = layerKind in THREAT_LAYERS;
    for (let i = 0; i < layerData.length; i++) {
      const v = layerData[i]; if (!(v > 0) || !vis(i)) continue;
      const a = clamp(v / layerMax, 0, 1), [x, y] = center(i);
      hexPath(g, x, y, s * 1.02);
      g.fillStyle = threat ? `rgba(225,45,30,${(0.1 + a * 0.62).toFixed(3)})` : `rgba(255,212,0,${(0.14 + a * 0.68).toFixed(3)})`;
      g.fill();
    }
  }


  // ------------------------------------------------ animation: people at work, and what just happened (§10)
  // Two layers drawn over the map. Ambient: small figures in each nation's colour walk between a
  // centre and the tiles where their trade works (S.nations[].work). Events: the last tick's map
  // effects (fx from the engine) play one after another: deaths, births, buildings, raids, floods…
  const ROLE_ICON = { gather: "🌿", hunt: "🏹", fish: "🐟", wood: "🪓", stone: "⛏", flint: "⛏", clay: "🏺", mine: "⛏", farm: "🌾", craft: "🔨", build: "🧱", research: "📜", warrior: "🛡" };
  const CAUSE_ICON = { famine: "🍂", winter: "❄", plague: "🦠", beasts: "🐺", quake: "💥", raid: "🔥", battle: "⚔️", brawl: "🤜", explore: "🧭", horde: "⚔️" };
  // Long enough to follow by eye; the strip above the map can replay any of them
  const FX_DUR = { contagion: 5500, death: 4800, birth: 3600, explore: 6500, caravan: 6500, robbed: 6500, raid: 6500, repelled: 6500, clear: 6500, battle: 5500, migrate: 6000, settle: 5500, era: 6000, invention: 4800, winter: 5500, meteor: 3600 };
  const FX_DEFAULT = 4200;
  const ANIM = {
    on: (() => { try { const v = localStorage.getItem("sm-anim"); return v === null ? !reduceMotion.matches : v === "1"; } catch { return !reduceMotion.matches; } })(),
    queue: [], last: 0, raf: 0,
  };
  /** Hex radius (CSS px) from which the walking figures are drawn: below it they would be specks, and the loop sleeps. */
  const AMBIENT_MIN = 6;
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const hash = (...k) => { let h = 2166136261; for (const x of k) { h ^= x; h = Math.imul(h, 16777619); } return ((h >>> 0) % 10000) / 10000; };
  /** Queue a tick's effects: the dramatic ones last a little longer, everything starts staggered. */
  function playFx(list) {
    if (!list?.length) return;
    const t0 = performance.now(), gap = clamp(14000 / list.length, 150, 1000);
    ANIM.queue = list.slice(0, 400).map((f, k) => ({ ...f, t0: t0 + k * gap, dur: FX_DUR[f.kind] || FX_DEFAULT }));
    if (is3D && M3) M3.playFx(list);
    showTicker(list);
    ensureAnim();
  }
  // The map is wide: a strip of what is playing, each one a button that flies there
  const FX_WORD = {
    death: f => `${CAUSE_ICON[f.cause] || "☠"} ${f.n} người chết${{ famine: " đói", winter: " rét", plague: " vì dịch", beasts: " vì thú dữ", quake: " vì động đất", raid: " vì man di", battle: " trận mạc", brawl: " vì xô xát biên giới", explore: " khi thám hiểm", horde: " đánh man di" }[f.cause] || ""}`,
    birth: f => `👶 +${f.n} dân`, build: f => `🔨 xây xong ${f.text || ""}`, invention: f => `💡 ${f.text || "phát minh"}`, claim: () => "🚩 khai hoang", lost_tile: () => "🏚 bỏ hoang một ô",
    explore: () => "🧭 thám hiểm", settle: f => `🏕 lập ${f.text || "điểm định cư"}`, era: f => `🌟 bước vào ${f.text}`, migrate: f => `🚶 ${f.n} người bỏ đi`,
    raid: f => `🔥 ${f.text} cướp phá`, repelled: f => `🛡 đẩy lui ${f.text}`, clear: f => f.text === "won" ? "🏳 đánh tan man di" : "⚔️ đánh man di thất bại", battle: f => { const [res, kind, foe] = String(f.text).split(":"); return kind === "clash" ? `⚔️ giao tranh biên giới: thắng ${foe}${f.n ? ` (${f.n} người ra trận)` : ""}` : `⚔️ ${res === "won" ? "thắng" : "thua"} ${kind === "raid" ? "trận đột kích" : "trận"}${foe ? ` khi đánh ${foe}` : ""}`; },
    brawl: f => `🤜 xô xát biên giới với ${f.text} (${f.n} người chết, không phải chiến tranh)`,
    beasts: f => `🐺 ${f.text || "thú dữ"} tấn công`, flood: () => "🌊 lũ lụt", quake: () => "💥 động đất", winter: () => "❄ mùa đông khắc nghiệt", plague: () => "🦠 dịch bệnh", famine: () => "🍂 nạn đói",
    fishrun: () => "🐟 mùa cá về", caravan: f => `${f.text === "water" ? "⛵" : "🐂"} đoàn buôn lên đường (${f.n} lượt)`, toll: f => `🪙 thu phí đoàn buôn của ${nm(f.from)}`,
    schism: f => `✊ ${f.n} người theo ${f.text} xin ly khai, chờ bạn duyệt`, road: f => `🛤 làm xong ${String(f.text || "đường").toLowerCase()}`, robbed: f => `🔥 ${f.text} cướp đoàn buôn`, storm: () => "⛈ bão nhấn chìm thuyền", seized: f => `⛓ tịch thu đoàn buôn của ${nm(f.from)}`,
    contagion: f => `🦠 dịch lan từ ${f.text} sang ${S.nations[f.nation] ? nationName(S.nations[f.nation]) : "?"}${{ border: " qua biên giới", caravan: " theo đoàn buôn", market: " qua chợ biên giới" }[f.cause] || ""}`,
    minister: f => `🏛 có ${String(f.text || "bộ trưởng").toLowerCase()} mới`,
    drought: () => "☀ hạn hán", bounty: () => "🌾 bội thu", herd: () => "🐂 đàn bò rừng", fire: () => "🔥 cháy rừng", meteor: () => "☄ thiên thạch", eruption: () => "🌋 núi lửa phun", riot: () => "✊ nội loạn", horde_back: () => "☠ man di trở lại",
  };
  const QUIET_FX = new Set(["birth", "claim", "herd", "bounty", "fishrun", "road"]);
  // §10 the turn's news: grouped by nation, the worst first, each item a button that flies there
  const FX_BAD = new Set(["death", "raid", "plague", "famine", "winter", "migrate", "brawl", "robbed", "storm", "seized", "contagion", "drought", "fire", "eruption", "riot", "beasts", "flood", "quake", "lost_tile", "horde_back", "schism"]);
  const FX_GOOD = new Set(["invention", "era", "build", "settle", "repelled", "road", "minister", "bounty"]);
  const fxTone = f => f.kind === "battle" ? (String(f.text).startsWith("won") ? "good" : "bad") : f.kind === "clear" ? (f.text === "won" ? "good" : "bad") : FX_BAD.has(f.kind) ? "bad" : FX_GOOD.has(f.kind) ? "good" : "";
  let newsMin = false, newsAll = false, newsList = [], newsPinned = false, boardPinned = false;
  try { newsMin = localStorage.getItem("sm-news-min") === "1"; } catch { }
  function flyTo(f) {
    const focus = f.path?.length ? f.path[Math.floor(f.path.length / 2)] : f.tile; // a journey: look at its middle
    if (focus === undefined) return;
    if (is3D && M3) { M3.focus(focus, true); M3.playFx([f]); return; }
    centerOn(focus, Math.max(view.z, (f.path?.length > 8 ? 18 : 28) / geo.s)); ANIM.queue.push({ ...f, t0: performance.now() + 350, dur: FX_DUR[f.kind] || FX_DEFAULT }); ensureAnim();
  }
  function showTicker(list) {
    newsList = list.filter(f => !QUIET_FX.has(f.kind));
    newsAll = false;
    renderNews();
  }
  function renderNews() {
    const box = $("#fx-ticker"); if (!box || !S) return;
    if (!newsList.length) { box.hidden = true; return; }
    // one group per nation; the world's own events (no nation) last
    const groups = new Map();
    for (const f of newsList) { const k = f.nation !== undefined && S.nations[f.nation] && f.kind !== "contagion" ? f.nation : -1; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); }
    const weight = fs => fs.filter(f => fxTone(f) === "bad").length * 3 + fs.length;
    const ordered = [...groups.entries()].sort((a, b) => (a[0] < 0) - (b[0] < 0) || weight(b[1]) - weight(a[1]));
    const bad = newsList.filter(f => fxTone(f) === "bad").length, shown = newsAll ? ordered : ordered.slice(0, 5);
    box.hidden = false; box.classList.toggle("min", newsMin);
    box.innerHTML = `<header><span>📰 Bản tin · L${S.lastFx?.tick >= 0 ? S.lastFx.tick : S.tick}</span><span class="count${bad ? " bad" : ""}" title="${bad} tin xấu trên ${newsList.length} tin">${newsList.length}${bad ? ` · ${bad} xấu` : ""}</span><span class="grow"></span>
        <button type="button" data-act="min" aria-label="${newsMin ? "Mở" : "Thu gọn"} bản tin" title="${newsMin ? "Mở" : "Thu gọn"}">${newsMin ? "▾" : "▴"}</button><button type="button" data-act="close" aria-label="Ẩn bản tin tới lượt sau" title="Ẩn tới lượt sau">×</button></header>
      <div class="news-body">${shown.map(([id, fs]) => {
        // the bad first; four chips a nation, the rest behind "+N"
        const n = id >= 0 ? S.nations[id] : null, sorted = fs.slice().sort((a, b) => (fxTone(b) === "bad") - (fxTone(a) === "bad")), nb = fs.filter(f => fxTone(f) === "bad").length;
        const chip = (f, k) => { const w = FX_WORD[f.kind]?.(f) ?? f.kind; return `<button type="button" class="${fxTone(f)}" data-fx="${newsList.indexOf(f)}" title="${esc(w)} · bấm để xem trên bản đồ"${k >= 4 ? " hidden" : ""}>${esc(w)}</button>`; };
        return `<div class="grp">${n ? `<div class="who" data-nation="${id}" title="Mở ${esc(nationName(n))}"><i class="sw" style="background:${esc(nationColor(id))}"></i>${esc(nationName(n))}<span class="n${nb ? " bad" : ""}">${fs.length}${nb ? ` · ${nb} xấu` : ""}</span></div>` : `<div class="who">🌍 Thế giới<span class="n">${fs.length}</span></div>`}
          <div class="items">${sorted.map(chip).join("")}${sorted.length > 4 ? `<button type="button" class="plus" data-act="grp">+${sorted.length - 4}</button>` : ""}</div></div>`;
      }).join("")}${ordered.length > shown.length ? `<button type="button" class="more" data-act="all">+ ${ordered.length - shown.length} nơi khác</button>` : ""}</div>`;
    for (const b of box.querySelectorAll("[data-act=grp]")) b.onclick = () => { for (const x of b.parentElement.querySelectorAll("[hidden]")) x.hidden = false; b.remove(); };
    // with the right dock open the news folds by itself; the button then pins it open instead
    box.classList.toggle("pinned", newsPinned);
    box.querySelector("[data-act=min]").onclick = () => {
      if (document.body.classList.contains("right-open")) { newsPinned = !newsPinned; newsMin = false; }
      else { newsMin = !newsMin; try { localStorage.setItem("sm-news-min", newsMin ? "1" : "0"); } catch { } }
      renderNews();
    };
    box.querySelector("[data-act=close]").onclick = () => { box.hidden = true; };
    box.querySelector("[data-act=all]")?.addEventListener("click", () => { newsAll = true; renderNews(); });
    for (const b of box.querySelectorAll("[data-fx]")) b.onclick = () => flyTo(newsList[+b.dataset.fx]);
    for (const w of box.querySelectorAll("[data-nation]")) w.onclick = () => inspectNation(+w.dataset.nation);
  }

  // §10 every nation at a glance: people, stability, alarms; click to fly there and open it
  let boardMin = false;
  try { boardMin = localStorage.getItem("sm-board-min") === "1"; } catch { }
  function alarmsOf(n) {
    const out = [];
    if ((S.wars || []).some(w => w.a === n.id || w.b === n.id)) out.push(["⚔️", "Đang có chiến tranh"]);
    if (n.health?.outbreak) out.push(["🦠", "Đang có dịch"]);
    if ((n.threats || []).some(t => t.kind === "famine" && t.level >= 3)) out.push(["🍂", "Lương thực không đủ một lượt ăn"]);
    if (n.exodus?.alarm) out.push(["🚶", `Dân bỏ đi: ${n.exodus.recent} người trong 10 lượt`]);
    if ((n.discontent ?? 0) >= 70) out.push(["✊", `Bất mãn ${n.discontent}/100: sắp có phái ly khai`]);
    if (n.status === "error" || n.status === "asleep") out.push(["💤", n.status === "error" ? "Lỗi key" : "Đang ngủ"]);
    return out;
  }
  function renderBoard() {
    const box = $("#board"); if (!box || !S) return;
    const list = S.nations.filter(n => n.founded || n.alive).sort((a, b) => (b.alive - a.alive) || b.population - a.population || a.id - b.id);
    const sel = inspect?.kind === "nation" ? inspect.id : -1;
    const stabColor = v => v >= 60 ? "var(--good)" : v >= 30 ? "var(--warn)" : "var(--bad)";
    box.classList.toggle("min", boardMin);
    box.innerHTML = `<header><span>Quốc gia</span><span class="count">${list.filter(n => n.alive).length}</span><span class="grow"></span><button type="button" data-act="min" aria-label="${boardMin ? "Mở" : "Thu gọn"} bảng quốc gia" title="${boardMin ? "Mở" : "Thu gọn"}">${boardMin ? "▾" : "▴"}</button></header>
      <ol>${list.map(n => { const al = n.alive ? alarmsOf(n) : []; return `<li tabindex="0" data-id="${n.id}" class="${n.alive ? "" : "dead"}${n.id === sel ? " sel" : ""}" title="${esc(nationName(n))}: ${n.population} dân, ổn định ${n.stability}, ${n.era}">
        <i class="sw" style="background:${esc(nationColor(n.id))}"></i><span class="nm">${esc(nationName(n))}</span><span class="pop">${n.alive ? fmt(n.population) : "†"}</span>
        <span class="line2"><span class="stab" aria-label="Ổn định ${n.stability}"><i style="width:${n.alive ? n.stability : 0}%;background:${stabColor(n.stability)}"></i></span><span class="alarms">${al.map(([i, t]) => `<span title="${esc(t)}">${i}</span>`).join("")}</span></span></li>`; }).join("")}</ol>`;
    box.classList.toggle("pinned", boardPinned);
    box.querySelector("[data-act=min]").onclick = () => {
      if (document.body.classList.contains("left-open")) { boardPinned = !boardPinned; boardMin = false; }
      else { boardMin = !boardMin; try { localStorage.setItem("sm-board-min", boardMin ? "1" : "0"); } catch { } }
      renderBoard();
    };
    for (const li of box.querySelectorAll("li")) {
      li.onclick = () => inspectNation(+li.dataset.id);
      li.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inspectNation(+li.dataset.id); } };
    }
  }
  function ensureAnim() { if (!ANIM.raf) ANIM.raf = requestAnimationFrame(animFrame); }
  function animFrame(now) {
    ANIM.raf = 0;
    if (document.hidden) return;
    ANIM.queue = ANIM.queue.filter(f => now < f.t0 + f.dur);
    const ambient = ANIM.on && geo && geo.s * view.z >= AMBIENT_MIN;
    if (!ambient && !ANIM.queue.length) { scheduleRender(); return; }
    if (now - ANIM.last >= 40) { ANIM.last = now; render(); } // ~25 fps is plenty for little walking people
    ANIM.raf = requestAnimationFrame(animFrame);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) ensureAnim(); });

  // A light outline keeps a dark flag colour readable on forest and a light one on snow
  function figure(g, x, y, r, color, px) {
    g.lineWidth = Math.min(1.4 * px, r * .22); g.strokeStyle = "rgba(255,255,255,.85)"; g.fillStyle = color; // thin for small figures, or a crowd turns to a white smudge
    g.beginPath(); g.arc(x, y - r * 1.6, r * .62, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(x - r * .8, y + r * .6); g.lineTo(x, y - r * 1.1); g.lineTo(x + r * .8, y + r * .6); g.closePath(); g.fill(); g.stroke();
  }
  /** A route that reads on any terrain: a dark halo under light dashes. */
  function route(g, points, px) {
    if (points.length < 2) return;
    const line = () => { g.beginPath(); points.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); };
    g.lineCap = "round"; g.lineJoin = "round";
    line(); g.setLineDash([]); g.lineWidth = 5 * px; g.strokeStyle = "rgba(8,20,28,.7)"; g.stroke();
    line(); g.setLineDash([5 * px, 4 * px]); g.lineWidth = 2.4 * px; g.strokeStyle = "#fff4cf"; g.stroke();
    g.setLineDash([]);
  }
  function icon(g, text, x, y, size) { g.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, x, y); }
  function floatText(g, text, x, y, size, color, px) { label(g, text, x, y, size, color, 800, px); }

  /** People one figure stands for: one each up to FIGURES_MAX people, then a few each, so the map never clogs. */
  const FIGURES_MAX = 160;
  const perFigure = n => Math.max(1, Math.ceil(n.population / FIGURES_MAX));
  /** Where a nation's people may walk: their own tiles (their waters too), or a road on land.
   *  Per nation: a nearest-centre search over that ground (land steps 1, water steps 3, so they keep to land),
   *  rebuilt only when the borders, the roads or the centres change. */
  const walkCache = new Map(); // nation id → { key, pass, src, par, capital, routes }
  let walkS = null, walkSig = -1;
  function walkMaps(n) {
    if (walkS !== S) {
      walkS = S;
      let h = 2166136261;
      const mix = x => { h ^= x + 2; h = Math.imul(h, 16777619); };
      mix(S.owners.length);
      for (let i = 0; i < S.owners.length; i++) { mix(S.owners[i]); mix(S.roads?.[i] || 0); }
      if ((h >>> 0) !== walkSig) { walkSig = h >>> 0; walkCache.clear(); }
    }
    const centres = [n.capital, ...(n.settlements || []).map(x => x.tile)], key = centres.join(",");
    let m = walkCache.get(n.id);
    if (m && m.key === key) return m;
    const T = S.owners.length, pass = new Uint8Array(T), src = new Int32Array(T).fill(-1), par = new Int32Array(T).fill(-1), dist = new Int32Array(T).fill(1 << 30);
    for (let i = 0; i < T; i++) pass[i] = S.owners[i] === n.id || (S.roads?.[i] > 0 && !isWater(i)) ? 1 : 0;
    const buckets = [[]];
    for (const c of centres) if (c >= 0 && pass[c] && dist[c]) { dist[c] = 0; src[c] = c; buckets[0].push(c); }
    for (let d = 0; d < buckets.length; d++) for (const i of buckets[d] || []) {
      if (dist[i] !== d) continue;
      for (const j of NB(i)) {
        if (j < 0 || !pass[j]) continue;
        const nd = d + (isWater(j) ? 3 : 1);
        if (nd < dist[j]) { dist[j] = nd; src[j] = src[i]; par[j] = i; (buckets[nd] ||= []).push(j); }
      }
    }
    m = { key, pass, src, par, capital: n.capital, routes: new Map() };
    walkCache.set(n.id, m);
    return m;
  }
  /** The tiles a worker walks, home centre first, work last; one tile when their patch has no centre and no road to one
   *  (they live and work there); null when there is nowhere of theirs to stand. */
  function walkRoute(m, w) {
    if (m.routes.has(w)) return m.routes.get(w);
    let t = w;
    if (!m.pass[t]) {
      // a site off their ground (a road being laid into the wild): they work from the nearest tile of theirs
      t = -1;
      let ring = [w]; const seen = new Set(ring);
      for (let d = 0; d < 3 && t < 0 && ring.length; d++) {
        const next = [];
        for (const i of ring) for (const j of NB(i)) if (j >= 0 && !seen.has(j)) { seen.add(j); next.push(j); }
        const ok = next.filter(j => m.pass[j]);
        t = ok.find(j => m.src[j] >= 0) ?? ok[0] ?? -1;
        ring = next;
      }
      if (t < 0 && m.pass[m.capital]) t = m.capital;
    }
    let path = null;
    if (t >= 0) {
      path = [t];
      if (m.src[t] >= 0) while (m.par[path[path.length - 1]] >= 0) path.push(m.par[path[path.length - 1]]);
      path.reverse();
    }
    m.routes.set(w, path);
    return path;
  }
  /** Everyone is on the map: workers walk to their work, the rest (children, elders, idle hands) stay round the centres. */
  function drawAmbient(g, now, s, z, px, vis) {
    if (!ANIM.on || s * z < AMBIENT_MIN) return;
    const r = clamp(s * .3 * z, 3, 7) * px, iconSize = clamp(s * .8 * z, 10, 18) * px, still = reduceMotion.matches;
    // a spot inside a tile for figure k: spread out, not stacked
    const spot = (tile, k, salt) => { const a = hash(tile, k, salt) * Math.PI * 2, d = Math.sqrt(hash(k, tile, salt + 7)); return [Math.cos(a) * s * .62 * d, Math.sin(a) * s * .5 * d]; };
    for (const n of S.nations) {
      if (!n.alive || !n.founded) continue;
      const color = n.flag.colors[0], unit = perFigure(n);
      let working = 0;
      const wm = walkMaps(n);
      for (const w of n.work || []) {
        working += w.n;
        // §2.11 fishers on the water go by boat, from the nearest pier or shore of their own
        if (w.role === "fish") {
          if (isWater(w.tile)) { drawBoats(g, n, harbourFor(n, w.tile), w.tile, w, now, s, z, px, vis, unit); continue; }
          const sea = NB(w.tile).find(j => j >= 0 && isWater(j));
          if (sea !== undefined) drawBoats(g, n, w.tile, sea, w, now, s, z, px, vis, unit); // off the shore
          else if (ST.river[w.tile]) drawCanoes(g, n, w, now, s, z, px, vis, unit); // on the river
        }
        // home centre → work, tile by tile over their own ground or a road; never across the wild
        const path = walkRoute(wm, w.tile);
        if (!path) continue;
        const L = path.length, at = path[L - 1];
        if (!vis(at) && !vis(path[0])) continue;
        const [wx, wy] = center(at);
        if (s * z >= 7 && ROLE_ICON[w.role]) { g.globalAlpha = .9; icon(g, ROLE_ICON[w.role], wx + s * .45, wy - s * .45, iconSize); g.globalAlpha = 1; }
        const people = Math.max(1, Math.round(w.n / unit));
        for (let k = 0; k < people; k++) {
          const ph = hash(w.tile, k, n.id, w.role.length), period = (7000 + ph * 5000) * (1 + Math.max(0, L - 5) * .12), [ox, oy] = spot(at, k, w.role.length);
          let x, y;
          if (L === 1 || still) {
            // working on the spot, drifting a little round their place
            const a = (still ? 0 : now / period + ph) * Math.PI * 2;
            x = wx + ox + Math.cos(a) * s * .08; y = wy + oy + Math.sin(a) * s * .06;
          } else {
            // there and back along the way: walk out, work a while, walk home
            const t = ((now / period) + ph) % 1, leg = t < .4 ? ease(t / .4) : t < .6 ? 1 : 1 - ease((t - .6) / .4);
            const p = leg * (L - 1), i = Math.min(L - 2, Math.floor(p)), [bx, by] = lerp(center(path[i]), center(path[i + 1]), p - i);
            // spread round the home and the work, close to the way between them so no one steps off it
            const end = .6 + .4 * leg, sc = end + (.25 - end) * Math.min(1, p, L - 1 - p);
            x = bx + ox * sc; y = by + oy * sc;
            if (t >= .4 && t < .6) y += Math.sin(now / 180 + k) * s * .06; // busy at the work
          }
          figure(g, x, y, r, color, px);
        }
      }
      // §2.11 boats at rest at the piers and harbours
      if ((n.stock?.boat || 0) >= 1 && s * z >= 7) for (const b of (n.buildings || []).filter(b => b.done && (b.type === "pier" || b.type === "harbor"))) {
        if (!vis(b.tile)) continue;
        const sea = NB(b.tile).find(j => j >= 0 && isWater(j)), [px0, py0] = center(b.tile), [sx, sy] = sea !== undefined ? center(sea) : [px0 + s * .6, py0];
        const moored = Math.min(3, Math.floor(n.stock.boat));
        for (let k = 0; k < moored; k++) boat(g, px0 + (sx - px0) * .55 + (k - 1) * s * .28, py0 + (sy - py0) * .55 + Math.sin(now / 600 + k) * s * .02, clamp(s * .26 * z, 3, 6) * px, n.flag.colors[0], px, 1, false);
      }
      // The rest of the people: at home round the capital and the settlements, a little smaller
      // homes: their tiles within 2 of each centre (the capital's count twice), so the crowd spreads round the flag, not under it
      const hearth = c => { if (c < 0 || !wm.pass[c]) return []; const near = new Set([c]); for (const j of NB(c)) if (j >= 0) { near.add(j); for (const k of NB(j)) if (k >= 0) near.add(k); } return [c, ...[...near].filter(j => j !== c && S.owners[j] === n.id)]; };
      const homes = [...hearth(n.capital), ...hearth(n.capital).slice(1), ...(n.settlements || []).flatMap(x => hearth(x.tile))];
      const home = homes.length ? Math.max(0, Math.round((n.population - working) / unit)) : 0;
      for (let k = 0; k < home; k++) {
        const c = homes[(k * 7 + Math.floor(k / homes.length)) % homes.length];
        if (!vis(c)) continue;
        const [cx, cy] = center(c), [ox, oy] = spot(c, k, 99), ph = hash(c, k, n.id, 5);
        const a = (still ? 0 : now / (9000 + ph * 6000) + ph) * Math.PI * 2;
        figure(g, cx + ox * 1.15 + Math.cos(a) * s * .1, cy + oy * 1.15 + Math.sin(a) * s * .08, r * .75, color, px);
      }
      // how many, under the capital's name
      if (vis(n.capital)) {
        const [cx, cy] = center(n.capital), fs = clamp(s * 1.1 * z, 10, 15) * px;
        label(g, `👥 ${n.population}${unit > 1 ? ` · 1 hình = ${unit} người` : ""}`, cx, cy + fs * (n.status === "asleep" || n.status === "error" ? 3.4 : 2.3), fs * .8, "#fff7d6", 600, px);
      }
    }
  }


  /** A small boat: a hull in the nation's colour, a pale sail; `heading` −1 or 1. */
  function boat(g, x, y, r, color, px, heading = 1, sail = true) {
    g.save(); g.translate(x, y); g.scale(heading, 1);
    g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.lineTo(r * .65, r * .45); g.lineTo(-r * .7, r * .45); g.closePath();
    g.fillStyle = color; g.fill(); g.lineWidth = px; g.strokeStyle = "#0b1a22"; g.stroke();
    if (sail) { g.beginPath(); g.moveTo(-r * .05, -r * 1.25); g.lineTo(-r * .05, 0); g.lineTo(r * .7, -r * .15); g.closePath(); g.fillStyle = "#f4efe2"; g.fill(); g.stroke(); }
    g.restore();
  }
  // the shore each boat puts out from: a pier or harbour of the nation, else its land nearest the water
  const harbourMemo = new Map();
  function harbourFor(n, tile) {
    const key = `${n.id}:${tile}:${S.tick}`; if (harbourMemo.has(key)) return harbourMemo.get(key);
    const ports = (n.buildings || []).filter(b => b.done && (b.type === "pier" || b.type === "harbor" || b.type === "fish_dock")).map(b => b.tile);
    let best = -1, bd = Infinity;
    for (const c of ports.length ? ports : S.owners.map((o, i) => o === n.id && !isWater(i) && NB(i).some(j => j >= 0 && isWater(j)) ? i : -1).filter(i => i >= 0)) { const d = hexDist(c, tile); if (d < bd) { bd = d; best = c; } }
    harbourMemo.set(key, best); if (harbourMemo.size > 400) harbourMemo.clear();
    return best;
  }
  function drawCanoes(g, n, w, now, s, z, px, vis, unit) {
    if (!vis(w.tile)) return;
    const [x, y] = center(w.tile), r = clamp(s * .26 * z, 3, 6) * px, k2 = Math.min(2, Math.max(1, Math.round(w.n / unit / 3)));
    for (let k = 0; k < k2; k++) { const ph = hash(w.tile, k, n.id, 41), a = (reduceMotion.matches ? 0 : now / (9000 + ph * 4000) + ph) * Math.PI * 2; boat(g, x + Math.cos(a) * s * .35, y + Math.sin(a) * s * .2, r, n.flag.colors[0], px, Math.cos(a + Math.PI / 2) >= 0 ? 1 : -1, false); }
  }
  function drawBoats(g, n, from, to, w, now, s, z, px, vis, unit) {
    if (from < 0 || (!vis(from) && !vis(to))) return;
    const a = center(from), b = center(to), r = clamp(s * .42 * z, 5, 11) * px, still = reduceMotion.matches;
    const boats = Math.min(4, Math.max(1, Math.round(w.n / unit / 2)));
    for (let k = 0; k < boats; k++) {
      const ph = hash(w.tile, k, n.id, 31), period = 11000 + ph * 6000, t = still ? .5 : ((now / period) + ph) % 1;
      // out, a long while at the nets, back
      const leg = t < .3 ? ease(t / .3) : t < .75 ? 1 : 1 - ease((t - .75) / .25);
      const off = (k - (boats - 1) / 2) * s * .35, [x, y] = lerp(a, b, leg);
      const bob = still ? 0 : Math.sin(now / 420 + k * 1.7) * s * .04;
      boat(g, x + off * leg, y + bob + off * .3 * leg, r, n.flag.colors[0], px, (t < .3 || t >= .75 ? (b[0] >= a[0] ? 1 : -1) * (t < .3 ? 1 : -1) : 1), t < .3 || t >= .75);
      if (leg === 1 && s * z >= 9 && !still) { g.beginPath(); g.arc(x + off + r * 1.4, y + bob + r * .6, r * (.5 + .3 * Math.sin(now / 300 + k)), 0, 7); g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = px; g.stroke(); } // the net
    }
  }

  function drawEvents(g, now, s, z, px) {
    if (!ANIM.queue.length) return;
    const big = clamp(s * 1.2 * z, 12, 26) * px, unit = clamp(s * z, 7, 30) * px;
    for (const f of ANIM.queue) {
      const t = (now - f.t0) / f.dur; if (t < 0 || t > 1) continue;
      const [x, y] = center(f.tile), fade = t < .15 ? t / .15 : t > .75 ? (1 - t) / .25 : 1;
      const nc = f.nation !== undefined && S.nations[f.nation] ? nationColor(f.nation) : "#ffffff";
      g.save(); g.globalAlpha = clamp(fade, 0, 1);
      switch (f.kind) {
        case "death": {
          const rise = t * unit * 2.2;
          icon(g, CAUSE_ICON[f.cause] || "☠", x - big * .9, y - unit - rise, big);
          floatText(g, `−${f.n}`, x + big * .4, y - unit - rise, big, "#ff6b5e", px);
          break;
        }
        case "birth": floatText(g, `+${f.n} 👶`, x, y - unit - t * unit * 2, big, "#7ee08a", px); break;
        case "build": case "settle": case "invention": case "era": case "minister": {
          const rr = unit * (0.6 + t * (f.kind === "era" ? 3.2 : 1.8));
          g.beginPath(); g.arc(x, y, rr, 0, 7); g.lineWidth = 3 * px; g.strokeStyle = f.kind === "invention" || f.kind === "era" ? "#ffd84a" : nc; g.stroke();
          if (f.kind === "settle" && f.from !== undefined) route(g, [center(f.from), [x, y]], px);
          icon(g, { build: "🔨", settle: "🏕", invention: "💡", era: "🌟", minister: "🏛" }[f.kind], x, y - unit * 1.2 - t * unit, big * 1.2);
          if (f.text && s * z >= 3) floatText(g, f.text, x, y + unit * 1.3, big * .8, f.kind === "build" || f.kind === "settle" ? "#ffffff" : "#ffe9a0", px);
          break;
        }
        case "claim": case "lost_tile": {
          hexPath(g, x, y, s * 1.02); g.fillStyle = f.kind === "claim" ? nc : "#9aa3a0"; g.globalAlpha *= .35 + .45 * Math.sin(t * Math.PI * 3) ** 2; g.fill();
          g.lineWidth = 2.5 * px; g.strokeStyle = "#fff"; g.stroke();
          break;
        }
        case "caravan": case "explore": {
          const path = f.path || [f.tile], upto = Math.max(1, Math.floor(path.length * Math.min(1, t * 1.4)));
          route(g, path.slice(0, upto).map(center), px);
          const [ex, ey] = center(path[upto - 1]); figure(g, ex, ey, clamp(s * .22 * z, 2.5, 5) * px, nc, px);
          icon(g, f.kind === "caravan" ? (f.text === "water" ? "⛵" : "🐂") : "🧭", ex, ey - unit * 1.3, big * .9);
          break;
        }
        case "raid": case "repelled": case "clear": case "battle": case "brawl": case "migrate": case "robbed": {
          const from = f.kind === "migrate" ? f.tile : f.from, to = f.kind === "migrate" ? f.to : f.tile;
          if (from === undefined || to === undefined) break;
          const a = center(from), b = center(to), walk = Math.min(1, t / .55);
          const color = f.kind === "raid" || f.kind === "repelled" || f.kind === "robbed" ? "#ff6b3d" : nc;
          const men = Math.min(8, Math.max(2, Math.ceil((f.n || 4) / 5)));
          for (let k = 0; k < men; k++) {
            const off = (k - (men - 1) / 2) * s * .25, [mx, my] = lerp(a, b, ease(Math.max(0, walk - k * .03)));
            figure(g, mx + off, my, clamp(s * .22 * z, 2.5, 5) * px, color, px);
          }
          if (t > .55 && f.kind !== "migrate") {
            const k2 = (t - .55) / .45, [bx, by] = b;
            g.beginPath(); g.arc(bx, by, unit * (0.8 + k2 * 2), 0, 7); g.lineWidth = 3 * px; g.strokeStyle = "#ff4d3d"; g.stroke();
            const won = String(f.text || "").startsWith("won") || f.kind === "raid";
            const sym = f.kind === "brawl" ? "🤜" : f.kind === "repelled" ? "🛡" : f.kind === "raid" || f.kind === "robbed" ? "🔥" : f.kind === "clear" ? (f.text === "won" ? "🏳" : "⚔️") : won ? "⚔️" : "🛡";
            icon(g, sym, bx, by - unit * 1.4, big * 1.3);
          }
          if (f.kind === "migrate" && f.n) floatText(g, `${f.n} người bỏ đi`, a[0], a[1] - unit * 1.4, big * .8, "#ffd0a0", px);
          break;
        }
        case "contagion": {
          // §9.5 a line from the sick capital to the one it reaches; the germ travels along it
          if (f.from === undefined) break;
          const a = center(f.from), b = [x, y], [mx, my] = lerp(a, b, ease(Math.min(1, t / .6)));
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(mx, my); g.lineCap = "round";
          g.setLineDash([]); g.lineWidth = 5 * px; g.strokeStyle = "rgba(8,20,28,.6)"; g.stroke();
          g.setLineDash([6 * px, 5 * px]); g.lineWidth = 2.6 * px; g.strokeStyle = "#9be06b"; g.stroke(); g.setLineDash([]);
          icon(g, "🦠", mx, my - unit * .6, big * 1.1);
          if (t > .6) { const k2 = (t - .6) / .4; g.beginPath(); g.arc(x, y, unit * (0.6 + k2 * 2.4), 0, 7); g.lineWidth = 3 * px * (1 - k2); g.strokeStyle = "#9be06b"; g.stroke(); }
          break;
        }
        case "beasts": {
          icon(g, "🐺", x + Math.sin(t * 40) * unit * .2, y - unit * .4, big * 1.4);
          g.strokeStyle = "#ff4d3d"; g.lineWidth = 2.5 * px;
          for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(x + k * unit * .35 - unit * .3, y - unit * .7); g.lineTo(x + k * unit * .35 + unit * .3, y + unit * .5); g.stroke(); }
          if (f.text && s * z >= 3) floatText(g, f.text, x, y + unit * 1.3, big * .8, "#ffb59a", px);
          break;
        }
        case "flood": case "quake": case "plague": case "famine": case "drought": case "riot": case "eruption": case "horde_back": case "fishrun": case "toll": case "storm": case "seized": {
          const col = { flood: "#5fb4e6", quake: "#c08a4a", plague: "#9be06b", famine: "#8a5a2b", drought: "#ffb43d", riot: "#ff4d3d", eruption: "#ff5a1f", horde_back: "#2a0d0a", fishrun: "#7fd3ff", toll: "#ffd84a", storm: "#9aa7ff", seized: "#ff4d3d" }[f.kind];
          for (let k = 0; k < 3; k++) { const p = (t * 1.6 + k / 3) % 1; g.beginPath(); g.arc(x + (f.kind === "quake" ? Math.sin(now / 30) * unit * .15 : 0), y, unit * (0.5 + p * 3), 0, 7); g.lineWidth = 3 * px * (1 - p); g.strokeStyle = col; g.stroke(); }
          icon(g, { flood: "🌊", quake: "💥", plague: "🦠", famine: "🍂", drought: "☀", riot: "✊", eruption: "🌋", horde_back: "☠", fishrun: "🐟", toll: "🪙", storm: "⛈", seized: "⛓" }[f.kind], x, y - unit * 1.4, big * 1.2);
          break;
        }
        case "winter": {
          for (let k = 0; k < 14; k++) { const ph = hash(f.tile, k), sx = x + (ph - .5) * unit * 6, sy = y - unit * 3 + ((t * 1.5 + ph) % 1) * unit * 5; icon(g, "❄", sx, sy, big * .7); }
          break;
        }
        case "bounty": icon(g, "🌾", x, y - unit - t * unit * 1.5, big * 1.3); break;
        case "herd": icon(g, "🐂", x - unit * 2 + t * unit * 4, y, big * 1.3); break;
        case "fire": icon(g, "🔥", x, y - Math.sin(now / 90) * unit * .2, big * 1.4); break;
        case "meteor": {
          const p = Math.min(1, t / .4), sx = x + unit * 6 * (1 - p), sy = y - unit * 8 * (1 - p);
          g.beginPath(); g.moveTo(sx + unit * 2, sy - unit * 2.6); g.lineTo(sx, sy); g.strokeStyle = "#ffd84a"; g.lineWidth = 3 * px; g.stroke();
          if (p >= 1) { g.beginPath(); g.arc(x, y, unit * (1 + (t - .4) * 4), 0, 7); g.strokeStyle = "#ffae3d"; g.stroke(); }
          break;
        }
      }
      g.restore();
    }
  }

  // §6.1 buildings on their tiles: an icon for what each does; one going up carries scaffolding and a ring of its progress
  const BTYPE = { tent: "⛺", field: "🌾", pen: "🐐", workshop: "🔨", kiln: "🏺", pit: "🕳", altar: "⛩", palisade: "🪵", well: "🪣", pier: "⚓", fish_dock: "🎣", salt_pan: "🧂", harbor: "🚢", temple: "🏛" };
  const BKIND = { housing: "🏠", farm: "🌾", craft: "🔨", port: "⚓", water: "🪣", defense: "🛡", sacred: "⛩", store: "🏺", other: "🏛" };
  const bIcon = b => BTYPE[b.type] || BKIND[b.kind] || "🏛";
  function drawBuildings(g, vis, s, z, px) {
    if (s * z < 11) return;
    const size = clamp(s * .42 * z, 10, 26) * px;
    for (const n of S.nations) {
      if (!n.alive) continue;
      const byTile = new Map();
      for (const b of n.buildings || []) if (vis(b.tile)) { if (!byTile.has(b.tile)) byTile.set(b.tile, []); byTile.get(b.tile).push(b); }
      for (const [t, list] of byTile) {
        const [cx, cy] = center(t), show = list.slice(0, 4);
        show.forEach((b, k) => {
          const a = show.length === 1 ? -2.2 : -2.2 + k * (Math.PI * 2 / show.length), r = s * .62;
          const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * .85;
          g.beginPath(); g.arc(x, y, size * .62, 0, 7); g.fillStyle = b.done ? "rgba(255,252,240,.88)" : "rgba(255,252,240,.5)"; g.fill();
          g.lineWidth = 1.4 * px; g.strokeStyle = nationColor(n.id); g.setLineDash(b.done ? [] : [2 * px, 2 * px]); g.stroke(); g.setLineDash([]);
          g.globalAlpha = b.done && !b.off ? 1 : .55; icon(g, bIcon(b), x, y + size * .03, size * .78); g.globalAlpha = 1;
          if (!b.done) {
            const p = b.work ? Math.min(1, b.progress / b.work) : 0;
            g.beginPath(); g.arc(x, y, size * .78, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p); g.lineWidth = 2.4 * px; g.strokeStyle = "#ffd84a"; g.stroke();
            icon(g, "🏗", x + size * .55, y - size * .5, size * .5);
          }
          if (b.off) { g.lineWidth = 2 * px; g.strokeStyle = "#ff4d3d"; g.beginPath(); g.moveTo(x - size * .4, y - size * .4); g.lineTo(x + size * .4, y + size * .4); g.stroke(); }
        });
        if (list.length > show.length) label(g, `+${list.length - show.length}`, cx, cy + s * .55, size * .6, "#fffbe8", 700, px);
      }
    }
  }

  // §2.5 roads on land (track, packed earth, pale paving) and sea lanes (dashed channels, beacons on the best)
  const ROAD_STYLE = [null, { c: "#b08458", w: .09, dash: [.45, .3] }, { c: "#8a5a2e", w: .13 }, { c: "#efe4c8", w: .17 }, { c: "#d4dae0", w: .07, rail: true }];
  const isWater = i => ST.terrain[i] === "ocean" || ST.terrain[i] === "shallow";
  // the nation picked on the board or in the inspector: the rest of the map dims, its border glows
  function drawSelectedNation(g, s, z, px, byNation, edges) {
    if (inspect?.kind !== "nation") return;
    const id = inspect.id, tiles = byNation.get(id) || [], all = [];
    S.owners.forEach((o, i) => { if (o === id) all.push(i); });
    if (!all.length) return;
    // dim everything but its land
    g.save(); g.beginPath(); g.rect(-geo.w, -geo.h, geo.w * 3, geo.h * 3);
    for (const i of all) { const [x, y] = center(i); hexPath2(g, x, y, s * 1.02); }
    g.fillStyle = "rgba(4,10,16,.45)"; g.fill("evenodd"); g.restore();
    // a glowing, breathing border in its colour
    const pulse = .5 + .5 * Math.sin(performance.now() / 380), c = nationColor(id);
    g.save(); g.beginPath(); for (const i of all) edges(i, id); g.lineCap = "round"; g.lineJoin = "round";
    g.lineWidth = Math.max(5 * px, s * .55) * (1 + .25 * pulse); g.strokeStyle = `rgba(255,255,255,${.35 + .25 * pulse})`; g.stroke();
    g.lineWidth = Math.max(2.5 * px, s * .25); g.strokeStyle = c; g.stroke();
    g.restore();
    if (ANIM.on) ensureAnim(); // the border breathes while the map is animated
  }
  /** A hexagon added to the current path (no beginPath), for clip and even-odd fills. */
  function hexPath2(g, x, y, s) { for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 30); k ? g.lineTo(x + s * Math.cos(a), y + s * Math.sin(a)) : g.moveTo(x + s * Math.cos(a), y + s * Math.sin(a)); } g.closePath(); }

  // §7.4 war fronts: the borders between nations at war, in red, with crossed swords at the heart of each front
  let frontMemo = null;
  function warFronts() {
    const key = `${S.tick}:${(S.wars || []).map(w => w.id).join(",")}`;
    if (frontMemo?.key === key) return frontMemo.fronts;
    const fronts = (S.wars || []).filter(w => w.start <= S.tick).map(w => {
      const edges = [], tiles = [];
      S.owners.forEach((o, i) => {
        if (o !== w.a) return;
        NB(i).forEach((j, k) => { if (j >= 0 && S.owners[j] === w.b) { edges.push([i, k]); tiles.push(i, j); } });
      });
      const last = (S.battles || []).filter(b => (b.attacker === w.a && b.defender === w.b) || (b.attacker === w.b && b.defender === w.a)).at(-1);
      // the heart of the front: the last battle, else the front tile nearest the middle of it
      let heart = last?.tile ?? -1;
      if (heart < 0 && tiles.length) { const [mx, my] = tiles.map(center).reduce((a, b) => [a[0] + b[0], a[1] + b[1]]).map(v => v / tiles.length); heart = tiles.reduce((a, b) => { const [ax, ay] = center(a), [bx, by] = center(b); return (bx - mx) ** 2 + (by - my) ** 2 < (ax - mx) ** 2 + (ay - my) ** 2 ? b : a; }); }
      if (heart < 0) { const A = S.nations[w.a], B = S.nations[w.b]; heart = A?.alive ? A.capital : B?.capital ?? -1; }
      return { war: w, edges, heart, last };
    });
    frontMemo = { key, fronts };
    return fronts;
  }
  function drawFronts(g, s, z, px) {
    const pulse = .55 + .45 * Math.sin(performance.now() / 260);
    for (const f of warFronts()) {
      if (f.edges.length) {
        g.save(); g.beginPath();
        for (const [i, k] of f.edges) {
          const [x, y] = center(i), a1 = Math.PI / 180 * ([0, -60, -120, 180, 120, 60][k] - 30), a2 = a1 + Math.PI / 3;
          g.moveTo(x + s * Math.cos(a1), y + s * Math.sin(a1)); g.lineTo(x + s * Math.cos(a2), y + s * Math.sin(a2));
        }
        // a hazard line: amber and black, unlike any flag colour
        g.lineCap = "butt"; g.lineWidth = Math.max(4 * px, s * .34); g.strokeStyle = `rgba(255,200,40,${.25 + .25 * pulse})`; g.stroke();
        g.lineWidth = Math.max(2.4 * px, s * .16); g.strokeStyle = "#16120a"; g.stroke();
        g.setLineDash([s * .28, s * .22]); g.strokeStyle = "#ffc828"; g.stroke();
        g.restore();
      }
      if (f.heart >= 0) {
        const [x, y] = center(f.heart), R = clamp(s * .9 * z, 9, 16) * px;
        g.beginPath(); g.arc(x, y, R * (1.5 + .5 * pulse), 0, 7); g.fillStyle = `rgba(255,200,40,${.22 * pulse})`; g.fill();
        g.beginPath(); g.arc(x, y, R, 0, 7); g.fillStyle = "#16120a"; g.fill(); g.lineWidth = 2 * px; g.strokeStyle = "#ffc828"; g.stroke();
        // crossed swords, drawn
        g.save(); g.translate(x, y); g.strokeStyle = "#ffe9a8"; g.lineWidth = Math.max(1.5 * px, R * .16); g.lineCap = "round";
        for (const d of [1, -1]) { g.beginPath(); g.moveTo(-R * .55 * d, R * .55); g.lineTo(R * .55 * d, -R * .55); g.moveTo(-R * .62 * d + R * .12, R * .3); g.lineTo(-R * .3 * d, R * .62 - R * .12 * 0); g.stroke(); }
        g.restore();
      }
    }
    if (warFronts().length && ANIM.on) ensureAnim();
  }
  /** Fly to a war's front and replay its last battles there. */
  function goToWar(w) {
    const f = warFronts().find(x => x.war.id === w.id); if (!f || f.heart < 0) return;
    centerOn(f.heart, Math.max(view.z, 26 / geo.s));
    const recent = (S.battles || []).filter(b => ((b.attacker === w.a && b.defender === w.b) || (b.attacker === w.b && b.defender === w.a)) && b.tick >= S.tick - 3);
    recent.forEach((b, k) => replayBattle(b, 400 + k * 900));
  }
  function replayBattle(b, delay = 350) {
    const home = S.owners.reduce((best, o, i) => o === b.attacker && (best < 0 || hexDist(i, b.tile) < hexDist(best, b.tile)) ? i : best, -1);
    ANIM.queue.push({ kind: "battle", tile: b.tile, nation: b.attacker, from: home >= 0 ? home : b.tile, n: Math.max(4, b.lossA * 3), text: `${b.won ? "won" : "lost"}:${b.kind}:${nm(b.defender)}`, t0: performance.now() + delay, dur: FX_DUR.battle });
    ensureAnim();
  }
  let treeMemo = null;
  /** The road network as a spanning tree of each cluster of touching road tiles (land and water apart): every road
   *  stays one connected line, without the mesh of every touching pair. Each centre touching a cluster is joined to it. */
  function roadTree(hubs) {
    const key = S.tick + ":" + S.roads.length + ":" + hubs.size;
    if (treeMemo?.key === key) return treeMemo;
    const parent = new Map(), links = [], loose = new Set(), road = i => i >= 0 && (S.roads[i] || 0) > 0;
    S.roads.forEach((lv, start) => {
      if (!lv || parent.has(start)) return;
      // the cluster, one kind of tile
      const water = isWater(start), cluster = [start], seen = new Set([start]);
      for (let q = 0; q < cluster.length; q++) for (const j of NB(cluster[q])) if (road(j) && !seen.has(j) && isWater(j) === water) { seen.add(j); cluster.push(j); }
      // the centres it touches; the tree grows from a tile next to one of them, else from its first tile
      const touching = new Map(); // hub -> one tile of the cluster beside it
      if (!water) for (const i of cluster) for (const h of NB(i)) if (h >= 0 && hubs.has(h) && !seen.has(h) && !touching.has(h)) touching.set(h, i);
      const root = touching.size ? [...touching.values()][0] : cluster.reduce((a, b) => Math.min(a, b));
      parent.set(root, -1);
      const queue = [root];
      for (let q = 0; q < queue.length; q++) for (const j of NB(queue[q])) if (seen.has(j) && !parent.has(j)) { parent.set(j, queue[q]); queue.push(j); }
      for (const [h, i] of touching) links.push([i, h]);
      if (!touching.size) for (const i of cluster) loose.add(i); // a road no centre uses any more
    });
    treeMemo = { key, parent, links, loose };
    return treeMemo;
  }
  function drawRoads(g, vis, s, z, px) {
    if (!S.roads || s * z < 3) return;
    const hubs = new Set(); for (const n of S.nations) if (n.alive && n.founded) { hubs.add(n.capital); for (const st of n.settlements || []) hubs.add(st.tile); }
    // a road network drawn as branches from the centres, not as a mesh of every touching pair
    // roads on land no one holds any more (abandoned, gone wild) are drawn faint
    const segs = { land: [[], [], [], [], []], wild: [[], [], [], [], []], sea: [[], [], [], [], []] }, dots = [], { parent, links, loose } = roadTree(hubs);
    const kind = (i, j) => isWater(i) ? "sea" : loose.has(i) && S.owners[i] < 0 && S.owners[j] < 0 ? "wild" : "land";
    S.roads.forEach((lv, i) => {
      if (!lv || !vis(i)) return;
      const water = isWater(i), j = parent.get(i);
      if (j === undefined || j < 0) { if (!links.some(([a]) => a === i) && !NB(i).some(k => parent.get(k) === i)) dots.push([i, lv, water]); return; }
      segs[kind(i, j)][Math.min(lv, S.roads[j] || lv)].push([i, j]);
    });
    for (const [i, h] of links) if (vis(i) || vis(h)) segs.land[S.roads[i] || 1].push([i, h]); // a centre joined to its road
    const line = (list, width, color, dash) => {
      if (!list.length) return;
      g.beginPath();
      for (const [a, b] of list) { const [x1, y1] = center(a), [x2, y2] = center(b); g.moveTo(x1, y1); g.lineTo(x2, y2); }
      g.setLineDash(dash ? dash.map(d => d * s) : []); g.lineWidth = width; g.strokeStyle = color; g.stroke();
    };
    g.save(); g.lineCap = "round";
    for (let lv = 1; lv < ROAD_STYLE.length; lv++) {
      const st = ROAD_STYLE[lv], w = Math.max(1.1 * px, s * st.w * (s * z < 8 ? .7 : 1));
      g.globalAlpha = .38; line(segs.wild[lv], w * .7, st.c, [.3, .25]); g.globalAlpha = 1;
      if (st.rail) { // §2.5 a railway: dark ballast, wooden sleepers across, a steel rail along
        line(segs.land[lv], Math.max(3 * px, s * .3), "rgba(40,36,34,.75)");
        line(segs.land[lv], Math.max(2.6 * px, s * .26), "#6b4b33", [.06, .12]);
        line(segs.land[lv], w, st.c);
      } else {
        line(segs.land[lv], w + 1.6 * px, "rgba(30,20,10,.45)");
        line(segs.land[lv], w, st.c, st.dash);
      }
      line(segs.sea[lv], Math.max(1 * px, s * .07) + 2 * px, "rgba(10,40,70,.5)");
      line(segs.sea[lv], Math.max(1 * px, s * .07), lv >= 2 ? "#ffffff" : "#cfeeff", [.35, .25]);
    }
    for (const [i, lv, water] of dots) { const [x, y] = center(i); g.beginPath(); g.arc(x, y, s * (.12 + lv * .03), 0, 7); g.fillStyle = water ? "#cfeeff" : ROAD_STYLE[lv].c; g.fill(); g.lineWidth = px; g.strokeStyle = "rgba(30,20,10,.6)"; g.stroke(); }
    // beacons on the best sea lanes
    if (s * z >= 6) S.roads.forEach((lv, i) => { if (lv === 3 && isWater(i) && vis(i) && i % 4 === 0) { const [x, y] = center(i); g.beginPath(); g.arc(x, y, s * .14, 0, 7); g.fillStyle = "#ffd84a"; g.fill(); } });
    g.restore();
  }

  function render() {
    if (!geo || !S) return;
    if (is3D && M3) { M3.setSelected(inspect?.kind === "nation" ? inspect.id : -1); M3.setPinned(pinnedI); return; }
    const g = ctx, s = geo.s, z = view.z, px = 1 / z, dpr = geo.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = "#10283a"; g.fillRect(0, 0, cv.width, cv.height);
    g.setTransform(dpr * z, 0, 0, dpr * z, dpr * view.tx, dpr * view.ty);
    g.fillStyle = TERRAIN.ocean[1]; g.fillRect(0, 0, geo.w, geo.h);
    const vx0 = -view.tx / z - 2 * s, vy0 = -view.ty / z - 2 * s, vx1 = vx0 + geo.cw / z + 4 * s, vy1 = vy0 + geo.ch / z + 4 * s;
    const vis = i => { const [x, y] = center(i); return x > vx0 && x < vx1 && y > vy0 && y < vy1; };
    if (z <= geo.bs * 1.1) g.drawImage(base, 0, 0, geo.w, geo.h); else drawTerrain(g, vis, px);

    // wilderness areas and the bison route (§12.4): quiet dashed outlines under everything else
    g.save(); g.setLineDash([6 * px, 5 * px]); g.lineWidth = 1.5 * px;
    for (const w of ST.wild || []) {
      const [x, y] = center(w), R = (WILD_R + .6) * s * SQ3;
      g.beginPath(); g.arc(x, y, R, 0, 7); g.fillStyle = "rgba(240,248,230,.08)"; g.fill(); g.strokeStyle = "rgba(240,248,230,.55)"; g.stroke();
    }
    if (ST.herd) {
      const [x1, y1] = center(ST.herd[0]), [x2, y2] = center(ST.herd[1]), mx = (x1 + x2) / 2, my = (y1 + y2) / 2, nx = -(y2 - y1) * .18, ny = (x2 - x1) * .18;
      g.beginPath(); g.moveTo(x1, y1); g.quadraticCurveTo(mx + nx, my + ny, x2, y2); g.strokeStyle = "rgba(246,214,150,.85)"; g.lineWidth = 2 * px; g.stroke();
      g.setLineDash([]);
      for (const [x, y] of [[x1, y1], [x2, y2]]) { g.beginPath(); g.arc(x, y, 3.5 * px, 0, 7); g.fillStyle = "#f6d696"; g.fill(); }
    }
    g.restore();

    // territory: a tint, a hatch and a two-layer border, so a flag colour that matches the land
    // (dark green on forest, sand on desert) still reads: the hatch and the outer edge use a contrast colour
    const owned = []; S.owners.forEach((o, i) => { if (o >= 0 && vis(i)) owned.push(i); });
    g.globalAlpha = .34;
    for (const i of owned) { const [x, y] = center(i); hexPath(g, x, y, s * 1.02); g.fillStyle = nationColor(S.owners[i]); g.fill(); }
    g.globalAlpha = 1;
    if (s * z >= 8) {
      g.save(); g.lineWidth = Math.max(px, s * .05); g.globalAlpha = .14;
      for (const i of owned) {
        const [x, y] = center(i), o = S.owners[i];
        g.save(); hexPath(g, x, y, s); g.clip();
        g.strokeStyle = contrastOf(nationColor(o)); g.beginPath();
        for (let d = -s * 1.4; d <= s * 1.4; d += s * .55) { g.moveTo(x + d - s, y + s); g.lineTo(x + d + s, y - s); }
        g.stroke(); g.restore();
      }
      g.restore();
    }
    drawLayer(g, vis, s);
    // borders: a contrast halo under the flag colour
    const bw = clamp(s * .22 * z, 1.5, 5) * px;
    const edges = (i, o) => {
      const [x, y] = center(i), nb = NB(i);
      for (let k = 0; k < 6; k++) {
        if (nb[k] >= 0 && S.owners[nb[k]] === o) continue;
        // edge k faces neighbour direction k: E, NE, NW, W, SW, SE
        const a1 = Math.PI / 180 * ([0, -60, -120, 180, 120, 60][k] - 30), a2 = a1 + Math.PI / 3;
        g.moveTo(x + s * Math.cos(a1), y + s * Math.sin(a1)); g.lineTo(x + s * Math.cos(a2), y + s * Math.sin(a2));
      }
    };
    const byNation = new Map(); for (const i of owned) { const o = S.owners[i]; if (!byNation.has(o)) byNation.set(o, []); byNation.get(o).push(i); }
    g.lineCap = "round";
    for (const [o, tiles] of byNation) {
      const c = nationColor(o);
      g.beginPath(); for (const i of tiles) edges(i, o); g.lineWidth = bw * 2.1; g.strokeStyle = contrastOf(c); g.globalAlpha = .9; g.stroke();
      g.globalAlpha = 1; g.lineWidth = bw; g.strokeStyle = c; g.stroke();
    }
    // §2.8 provinces: a thin dashed line between the land of two centres of one nation, once zoomed in
    if (s * z >= 9) {
      const cs = new Map(), prov = new Map();
      const centresOf = o => { if (!cs.has(o)) { const n = S.nations[o]; cs.set(o, n ? [n.capital, ...(n.settlements || []).map(x => x.tile)].filter(c => S.owners[c] === o) : []); } return cs.get(o); };
      const provOf = i => { if (!prov.has(i)) { let b = -1, d = Infinity; for (const c of centresOf(S.owners[i])) { const k = hexDist(c, i); if (k < d || (k === d && c < b)) { d = k; b = c; } } prov.set(i, b); } return prov.get(i); };
      g.save(); g.beginPath();
      for (const [o, tiles] of byNation) {
        if (centresOf(o).length < 2) continue;
        for (const i of tiles) {
          const [x, y] = center(i), nb = NB(i), p = provOf(i);
          for (let k = 0; k < 6; k++) {
            const j = nb[k]; if (j < 0 || j < i || S.owners[j] !== o || provOf(j) === p) continue;
            const a1 = Math.PI / 180 * ([0, -60, -120, 180, 120, 60][k] - 30), a2 = a1 + Math.PI / 3;
            g.moveTo(x + s * Math.cos(a1), y + s * Math.sin(a1)); g.lineTo(x + s * Math.cos(a2), y + s * Math.sin(a2));
          }
        }
      }
      g.setLineDash([3 * px, 3 * px]); g.lineWidth = 1.2 * px; g.strokeStyle = "rgba(255,255,255,.75)"; g.stroke(); g.restore();
    }
    drawRoads(g, vis, s, z, px);
    drawFronts(g, s, z, px);
    drawSelectedNation(g, s, z, px, byNation, edges);
    // the capitals' names come first: every other label steps around them
    placed = [];
    const small = clamp(s * .95 * z, 9, 13) * px, fs = clamp(s * 1.1 * z, 11, 16) * px;
    for (const n of S.nations) if (n.alive) { const [x, y] = center(n.capital); reserve(g, nationName(n), x, y + fs * 1.15, fs, 700, px); }
    // names of the quiet places, once there is room to read them
    if (s * z >= 5) {
      for (const w of ST.wild || []) { const [x, y] = center(w); tag(g, "Vùng hoang", x, y - (WILD_R + .6) * s * SQ3 - 8 * px, small, "#eef6e6", 500, px); }
      if (ST.herd) { const [x1, y1] = center(ST.herd[0]), [x2, y2] = center(ST.herd[1]); tag(g, "Tuyến bò rừng", (x1 + x2) / 2 - (y2 - y1) * .09, (y1 + y2) / 2 + (x2 - x1) * .09, small, "#f6d696", 500, px); }
    }
    // wonders
    for (const w of ST.wonders) {
      const [x, y] = center(w.i), R = clamp(s * .8 * z, 5, 14) * px; g.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? R * .45 : R; g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
      g.closePath(); g.fillStyle = "#ffd84a"; g.fill(); g.lineWidth = px; g.strokeStyle = "#3a2a00"; g.stroke();
      if (s * z >= 14) tag(g, w.name, x, y + R + 8 * px, small, "#ffe9a0", 500, px);
    }
    // §2.10 rich veins: a small diamond in the good's colour
    if (s * z >= 4.5) for (const v of ST.veins || []) {
      const [x, y] = center(v.i), R = clamp(s * .45 * z, 3, 8) * px;
      g.beginPath(); g.moveTo(x, y - R); g.lineTo(x + R * .75, y); g.lineTo(x, y + R); g.lineTo(x - R * .75, y); g.closePath();
      g.fillStyle = VEIN_COLOR[v.good] || "#ddd"; g.fill(); g.lineWidth = px; g.strokeStyle = "#1a1a1a"; g.stroke();
      if (s * z >= 16) tag(g, `Mạch ${v.name}`, x, y + R + 7 * px, small, "#f0e6d0", 500, px);
    }
    // barbarian hordes (§9.4): a dark camp-fire marker with their strength
    for (const h of S.hordes || []) {
      const [x, y] = center(h.tile), R = clamp(s * 1.1 * z, 7, 16) * px;
      g.globalAlpha = h.alive ? 1 : .45;
      g.beginPath(); g.arc(x, y, R, 0, 7); g.fillStyle = "#2a0d0a"; g.fill(); g.lineWidth = 2 * px; g.strokeStyle = h.alive ? "#ff6b3d" : "#b9a69e"; g.stroke();
      g.beginPath(); g.moveTo(x - R * .45, y + R * .4); g.lineTo(x + R * .45, y - R * .5); g.moveTo(x + R * .45, y + R * .4); g.lineTo(x - R * .45, y - R * .5);
      g.strokeStyle = "#ffd2b8"; g.lineWidth = Math.max(1.5 * px, R * .16); g.stroke();
      if (s * z >= 4 && (h.alive || s * z >= 10)) tag(g, h.alive ? `${h.name} · ${h.strength}` : `${h.name} (đã tan)`, x, y + R + 9 * px, small, h.alive ? "#ffb59a" : "#cbbab3", 600, px);
      g.globalAlpha = 1;
    }
    // caravans (§7.3): along their real road, sliding between ticks; ⛵ by water, 🐂 overland
    const st = window.__status, frac = st && !st.paused && st.tickSeconds ? clamp(1 - (st.nextTickAt - Date.now()) / (st.tickSeconds * 1000), 0, 1) : 0;
    (S.caravans || []).forEach((c, k) => {
      const A = S.nations[c.from], B = S.nations[c.to]; if (!A || !B) return;
      let pos, path = c.path;
      if (path?.length > 1) {
        const span = Math.max(1, c.arrive - (c.depart ?? c.arrive - 1)), p = clamp((S.tick - (c.depart ?? S.tick) + frac) / span, 0, 1);
        const f = p * (path.length - 1), i0 = Math.floor(f), i1 = Math.min(path.length - 1, i0 + 1);
        pos = lerp(center(path[i0]), center(path[i1]), f - i0);
        g.save(); g.globalAlpha = .55; route(g, path.map(center), px); g.restore();
      } else {
        const [x1, y1] = center(A.capital), [x2, y2] = center(B.capital);
        const total = Math.max(1, Math.ceil(hexDist(A.capital, B.capital) / 8)), prog = clamp(1 - (c.arrive - S.tick) / total, .12, .88);
        pos = [x1 + (x2 - x1) * prog, y1 + (y2 - y1) * prog];
      }
      const [x, y] = pos, r = 4.5 * px, off = (k % 3 - 1) * 4 * px;
      if (s * z >= 4) icon(g, c.mode === "water" ? "⛵" : "🐂", x + off, y - r * 2.6, clamp(s * .9 * z, 11, 18) * px);
      g.fillStyle = nationColor(c.from); g.strokeStyle = "#0b1a22"; g.lineWidth = 1.5 * px;
      g.beginPath(); g.rect(x + off - r, y - r * .8, r * 2, r * 1.6); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(x + off - r, y - r * .8); g.lineTo(x + off, y); g.lineTo(x + off + r, y - r * .8); g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = px; g.stroke();
    });
    for (const b of (S.battles || []).filter(b => b.tick >= S.tick - 3)) {
      const [x, y] = center(b.tile), r = clamp(s * .8 * z, 5, 12) * px; g.strokeStyle = "#ff4d3d"; g.lineWidth = clamp(s * .25 * z, 2, 4) * px;
      g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke();
    }
    const now = performance.now();
    drawAmbient(g, now, s, z, px, vis);
    drawBuildings(g, vis, s, z, px); // above the people, so the capital's buildings are not lost in the crowd
    // capitals with flags (their names were reserved first)
    for (const n of S.nations) {
      if (!n.alive) continue;
      const [x, y] = center(n.capital), fw = clamp(s * 3 * z, 18, 44) * px, fh = fw * 2 / 3, lift = clamp(s * z, 6, 14) * px;
      g.strokeStyle = "#0b1a22"; g.lineWidth = 1.5 * px; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - fh - lift); g.stroke();
      drawFlag(g, x, y - fh - lift, fw, fh, n.flag, px);
      g.font = `700 ${fs}px "Be Vietnam Pro", system-ui, sans-serif`;
      const tw = g.measureText(nationName(n)).width / 2 + fs * .75;
      g.beginPath(); g.roundRect?.(x - tw, y + fs * .45, tw * 2, fs * 1.4, fs * .7); g.fillStyle = "rgba(8,20,28,.7)"; g.fill();
      g.beginPath(); g.arc(x - tw + fs * .55, y + fs * 1.15, fs * .24, 0, 7); g.fillStyle = nationColor(n.id); g.fill();
      label(g, nationName(n), x + fs * .22, y + fs * 1.15, fs, "#fff", 700, px);
      if (n.status === "asleep" || n.status === "error") label(g, n.status === "asleep" ? "đang ngủ" : "lỗi key", x, y + fs * 2.3, fs * .85, "#ffd0a0", 500, px);
    }
    // a fallen nation's settlements, and settlements on land lost to another, are no longer on the map
    for (const n of S.nations) if (n.alive && n.founded) for (const st of n.settlements || []) {
      if (S.owners[st.tile] !== n.id) continue;
      const [x, y] = center(st.tile); g.beginPath(); g.arc(x, y, clamp(s * .7 * z, 4, 10) * px, 0, 7); g.fillStyle = n.flag.colors[0]; g.fill(); g.lineWidth = 1.5 * px; g.strokeStyle = "#0b1a22"; g.stroke();
      if (s * z >= 4) tag(g, st.name, x, y + small * 1.5, small, "#fff", 500, px);
    }

    drawEvents(g, now, s, z, px);
    if (hoverI >= 0 && hoverI !== pinnedI) { const [x, y] = center(hoverI); hexPath(g, x, y, s * 1.05); g.lineWidth = 2 * px; g.strokeStyle = "#fff"; g.stroke(); }
    if (pinnedI >= 0) {
      const [x, y] = center(pinnedI); hexPath(g, x, y, s * 1.08);
      g.lineWidth = 4 * px; g.strokeStyle = "rgba(8,20,28,.8)"; g.stroke(); g.lineWidth = 2.5 * px; g.strokeStyle = "#ffd84a"; g.stroke();
    }
    // "here it is" pulse after locating a nation
    if (focusFx) {
      const t = (performance.now() - focusFx.t0) / 1600;
      if (t >= 1) focusFx = null;
      else {
        const [x, y] = center(focusFx.i), r = (reduceMotion.matches ? 22 : 10 + 34 * t) * px;
        g.beginPath(); g.arc(x, y, r, 0, 7); g.lineWidth = 3 * px; g.strokeStyle = `rgba(255,216,74,${reduceMotion.matches ? .9 : 1 - t})`; g.stroke();
        scheduleRender();
      }
    }
  }
  let rq = 0;
  function scheduleRender() { if (!rq) rq = requestAnimationFrame(() => { rq = 0; render(); }); }

  // ------------------------------------------------ view: zoom, pan, fit, centre
  function clampView(v) {
    if (!geo) return v;
    v.z = clamp(v.z, geo.zmin, geo.zmax);
    // the world may slide partly under a dock or off screen, never all the way
    const W = geo.w * v.z, H = geo.h * v.z, mx = Math.min(geo.cw * .45, W * .6), my = Math.min(geo.ch * .45, H * .6);
    v.tx = clamp(v.tx, Math.min(0, geo.cw - W) - mx, Math.max(0, geo.cw - W) + mx);
    v.ty = clamp(v.ty, Math.min(0, geo.ch - H) - my, Math.max(0, geo.ch - H) + my);
    return v;
  }
  /** The part of the screen not covered by the top bar or an open dock. */
  function visibleRect() {
    let x0 = 0, x1 = geo.cw, y0 = $("#topbar").getBoundingClientRect().bottom + 6, y1 = geo.ch;
    for (const d of document.querySelectorAll(".dock:not([hidden])")) {
      const r = d.getBoundingClientRect();
      if (r.width >= geo.cw * .85) y1 = Math.min(y1, r.top);
      else if (r.left + r.width / 2 < geo.cw / 2) x0 = Math.max(x0, r.right); else x1 = Math.min(x1, r.left);
    }
    if (x1 - x0 < 100) { x0 = 0; x1 = geo.cw; }
    if (y1 - y0 < 80) { y0 = 0; y1 = geo.ch; }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function fitView() {
    const R = visibleRect(), z = clamp(Math.min(R.w / geo.w, R.h / geo.h) * .97, geo.zmin, geo.zmax);
    return { z, tx: R.x + (R.w - geo.w * z) / 2, ty: R.y + (R.h - geo.h * z) / 2 };
  }
  function setView(v, animate = false) {
    const to = clampView({ ...v });
    cancelAnimationFrame(anim); anim = 0;
    if (!animate || reduceMotion.matches) { Object.assign(view, to); updateZoomUi(); scheduleRender(); return; }
    const from = { ...view }, t0 = performance.now(), D = 260;
    // interpolate the zoom geometrically so the motion feels even
    const step = now => {
      const t = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - t, 3);
      const z = from.z * Math.pow(to.z / from.z, e), k = (z - from.z) / ((to.z - from.z) || 1);
      view.z = z;
      view.tx = to.z === from.z ? from.tx + (to.tx - from.tx) * e : from.tx + (to.tx - from.tx) * k;
      view.ty = to.z === from.z ? from.ty + (to.ty - from.ty) * e : from.ty + (to.ty - from.ty) * k;
      render();
      anim = t < 1 ? requestAnimationFrame(step) : 0;
      if (!anim) { Object.assign(view, to); updateZoomUi(); render(); }
    };
    anim = requestAnimationFrame(step);
  }
  function zoomAt(sx, sy, factor, animate = false) {
    const z = clamp(view.z * factor, geo.zmin, geo.zmax), wx = (sx - view.tx) / view.z, wy = (sy - view.ty) / view.z;
    setView({ z, tx: sx - wx * z, ty: sy - wy * z }, animate);
  }
  const zoomBy = f => { if (is3D && M3) return M3.zoom(f); if (!geo) return; const R = visibleRect(); zoomAt(R.x + R.w / 2, R.y + R.h / 2, f, true); };
  const fitWorld = () => { if (is3D && M3) return M3.fit(); if (geo) setView(fitView(), true); };
  function centerOn(i, z) {
    if (is3D && M3) { M3.focus(i, z !== undefined); return; }
    if (!geo || i < 0) return;
    const R = visibleRect(), fz = fitView().z;
    z = clamp(z ?? Math.max(view.z, fz * 3), geo.zmin, geo.zmax);
    const [x, y] = center(i);
    setView({ z, tx: R.x + R.w / 2 - x * z, ty: R.y + R.h / 2 - y * z }, true);
    focusFx = { i, t0: performance.now() };
  }
  function updateZoomUi() {
    if (ANIM.on) ensureAnim();
    if (!geo) return;
    const rel = view.z / fitView().z;
    $("#zoom-in").disabled = view.z >= geo.zmax - 1e-6;
    $("#zoom-out").disabled = view.z <= geo.zmin + 1e-6;
    $("#zoom-level").textContent = `${rel < 9.95 ? rel.toFixed(1) : Math.round(rel)}×`;
  }
  $("#zoom-in").onclick = () => zoomBy(1.6);
  $("#zoom-out").onclick = () => zoomBy(1 / 1.6);
  $("#zoom-fit").onclick = fitWorld;

  // ------------------------------------------------ picking, hover card, selection
  function screenPt(ev) {
    const r = cv.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * geo.cw / r.width, y: (ev.clientY - r.top) * geo.ch / r.height };
  }
  function pickScreen(sx, sy) {
    const X = (sx - view.tx) / view.z - geo.ox, Y = (sy - view.ty) / view.z - geo.oy;
    let q = (SQ3 / 3 * X - Y / 3) / geo.s, r = (2 / 3 * Y) / geo.s, z = -q - r;
    let rq = Math.round(q), rr = Math.round(r), rz = Math.round(z);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), dz = Math.abs(rz - z);
    if (dq > dr && dq > dz) rq = -rr - rz; else if (dr > dz) rr = -rq - rz;
    const c = rq + (rr - (rr & 1)) / 2;
    return (c < 0 || c >= geo.N || rr < 0 || rr >= geo.N) ? -1 : rr * geo.N + c;
  }
  const inWild = i => (ST.wild || []).some(c => hexDist(c, i) <= WILD_R);
  /** A light card that follows the mouse; the full story is in the inspector after a click. */
  function hoverCard(i, ev) {
    const box = $("#tileinfo");
    if (i < 0 || !ev) { box.hidden = true; return; }
    const o = S.owners[i], owner = o >= 0 ? S.nations[o] : null, w = ST.wonders.find(x => x.i === i);
    const tags = [ST.river[i] && "sông", ST.delta[i] && "châu thổ", inWild(i) && "vùng hoang"].filter(Boolean).join(" · ");
    box.innerHTML = `<div class="h"><b>${esc(TERRAIN[ST.terrain[i]][0])}</b>${tags ? ` <span class="muted">· ${tags}</span>` : ""} <span class="muted mono">(${i % geo.N}, ${(i / geo.N) | 0})</span></div>
      ${owner ? `<div><i class="sw" style="background:${esc(nationColor(o))}"></i>${isWater(i) ? "Lãnh hải " : ""}<b>${esc(nationName(owner))}</b></div>` : ""}
      ${S.roads?.[i] ? `<div>🛤 ${esc(isWater(i) ? S.roadLevels[S.roads[i] - 1].lane : S.roadLevels[S.roads[i] - 1].name)}</div>` : ""}${w ? `<div>⭐ <b>${esc(w.name)}</b></div>` : ""}`;
    box.hidden = false;
    const bw = box.offsetWidth, bh = box.offsetHeight;
    let x = ev.clientX + 16, y = ev.clientY + 16;
    if (x + bw > innerWidth - 8) x = ev.clientX - bw - 12;
    if (y + bh > innerHeight - 8) y = ev.clientY - bh - 12;
    box.style.left = `${Math.max(4, x)}px`; box.style.top = `${Math.max(4, y)}px`;
  }
  /** If an opening dock or sheet now covers the tile, slide the map so it stays in sight. */
  function revealTile(i) {
    const R = visibleRect(), [x, y] = center(i), sx = x * view.z + view.tx, sy = y * view.z + view.ty, m = 24;
    if (sx >= R.x + m && sx <= R.x + R.w - m && sy >= R.y + m && sy <= R.y + R.h - m) return;
    setView({ z: view.z, tx: R.x + R.w / 2 - x * view.z, ty: R.y + R.h / 2 - y * view.z }, true);
  }
  function pinTile(i) {
    pinnedI = i;
    if (i >= 0) { inspect = { kind: "tile", i }; openRight("inspect"); revealTile(i); }
    else if (inspect?.kind === "tile") inspect = null;
    renderInspector();
    scheduleRender();
  }

  // ------------------------------------------------ pointer: hover, drag to pan, pinch, tap to pin
  const pointers = new Map();
  let drag = null, pinch = null;
  function startPinch() {
    const [a, b] = [...pointers.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: view.z, wx: (mid.x - view.tx) / view.z, wy: (mid.y - view.ty) / view.z };
  }
  cv.addEventListener("pointerdown", ev => {
    if (!geo || (ev.pointerType === "mouse" && ev.button !== 0)) return;
    cv.setPointerCapture(ev.pointerId);
    const p = screenPt(ev); pointers.set(ev.pointerId, p);
    if (pointers.size === 1) drag = { x: p.x, y: p.y, tx: view.tx, ty: view.ty, moved: false };
    else if (pointers.size === 2) { pinch = startPinch(); if (drag) drag.moved = true; }
  });
  cv.addEventListener("pointermove", ev => {
    if (!geo) return;
    const p = screenPt(ev);
    if (pointers.has(ev.pointerId)) {
      pointers.set(ev.pointerId, p);
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const z = clamp(pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0, geo.zmin, geo.zmax);
        setView({ z, tx: mid.x - pinch.wx * z, ty: mid.y - pinch.wy * z });
        return;
      }
      if (drag) {
        const dx = p.x - drag.x, dy = p.y - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 5) { drag.moved = true; cv.classList.add("grabbing"); hoverCard(-1); }
        if (drag.moved) { setView({ z: view.z, tx: drag.tx + dx, ty: drag.ty + dy }); return; }
      }
    }
    if (ev.pointerType !== "mouse") return;
    const i = pickScreen(p.x, p.y);
    if (i !== hoverI) { hoverI = i; scheduleRender(); }
    hoverCard(drag ? -1 : i, ev);
  });
  function pointerEnd(ev) {
    if (!pointers.has(ev.pointerId)) return;
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) { const [p] = pointers.values(); drag = { x: p.x, y: p.y, tx: view.tx, ty: view.ty, moved: true }; return; }
    if (pointers.size) return;
    cv.classList.remove("grabbing");
    if (drag && !drag.moved && ev.type === "pointerup") {
      const p = screenPt(ev), i = pickScreen(p.x, p.y);
      pinTile(i < 0 || i === pinnedI ? -1 : i);
    }
    drag = null;
  }
  cv.addEventListener("pointerup", pointerEnd);
  cv.addEventListener("pointercancel", pointerEnd);
  cv.addEventListener("pointerleave", ev => {
    if (ev.pointerType !== "mouse" || pointers.size) return;
    hoverI = -1; scheduleRender(); hoverCard(-1);
  });
  cv.addEventListener("wheel", ev => {
    if (!geo) return;
    ev.preventDefault();
    const p = screenPt(ev), dy = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaMode === 2 ? ev.deltaY * 400 : ev.deltaY;
    zoomAt(p.x, p.y, Math.exp(-clamp(dy, -200, 200) * (ev.ctrlKey ? 0.01 : 0.0022)));
  }, { passive: false });
  cv.addEventListener("dblclick", ev => { ev.preventDefault(); const p = screenPt(ev); zoomAt(p.x, p.y, ev.shiftKey ? 1 / 2 : 2, true); });
  // keyboard on the focused map: arrows pan, Enter pins the tile in the middle
  cv.addEventListener("keydown", ev => {
    if (!geo || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = ev.key, step = 60;
    const d = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[k];
    if (d) { ev.preventDefault(); setView({ z: view.z, tx: view.tx + d[0], ty: view.ty + d[1] }, true); }
    else if (k === "Enter") { ev.preventDefault(); const R = visibleRect(), i = pickScreen(R.x + R.w / 2, R.y + R.h / 2); pinTile(i === pinnedI ? -1 : i); }
  });

  // ---------------------------------------------------------------- header
  function statusLabel(s) {
    if (s.setupPending) return ["Chờ tạo thế giới", "warn"];
    if (s.claudeWait && !s.busy) return ["Chờ Claude", "warn"];
    if (s.busy) return ["Đang xử lý lượt", "warn"];
    if (s.paused) return ["Tạm dừng", "bad"];
    return ["Đang chạy", "ok"];
  }
  function applyStatus(s) {
    $("#tick").textContent = `Lượt ${s.tick} · năm ${s.tick * 10}`;
    const [txt, cls] = statusLabel(s); const p = $("#run-state"); p.textContent = txt; p.className = `pill ${cls}`;
    const bp = $("#btn-pause"); bp.textContent = s.paused ? "Tiếp tục" : "Tạm dừng"; bp.setAttribute("aria-pressed", String(!!s.paused));
    $("#version").textContent = `v${s.version}`;
    const sel = $("#tick-seconds"); if (![...sel.options].some(o => +o.value === s.tickSeconds)) sel.add(new Option(`${s.tickSeconds} giây`, s.tickSeconds)); sel.value = s.tickSeconds;
    const err = $("#engine-error"); err.hidden = !s.lastError; err.textContent = s.lastError ? `Lỗi Engine (thế giới tạm dừng):\n${s.lastError}` : "";
    const cw = $("#claude-wait"); cw.hidden = !s.claudeWait || !!s.lastError;
    cw.textContent = s.claudeWait ? `${s.claudeWait.reason}\nThử lại lúc ${hhmm(s.claudeWait.until)}.` : "";
    if (s.setupPending && !setupAsked) { setupAsked = true; openSetup(); }
    Object.assign(S || {}, s); window.__status = s;
    tickCountdown();
  }
  const hhmm = t => new Date(t).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  function tickCountdown() {
    const s = window.__status, cd = $("#countdown"), bar = $("#tickbar"); if (!s) return;
    const idle = s.paused || s.busy, leftMs = Math.max(0, s.nextTickAt - Date.now()), left = Math.ceil(leftMs / 1000);
    cd.textContent = idle ? "" : `lượt sau ${left >= 60 ? Math.floor(left / 60) + "p " : ""}${left % 60}s`;
    bar.hidden = idle;
    if (!idle) bar.firstElementChild.style.width = `${clamp(100 - leftMs / 10 / Math.max(1, s.tickSeconds), 0, 100)}%`;
  }
  setInterval(tickCountdown, 500);
  function renderSummary() {
    const alive = S.nations.filter(n => n.alive).length, wars = (S.wars || []).length;
    const gates = Object.entries(S.eraGates || {}).sort((a, b) => a[1] - b[1]);
    const latest = gates[gates.length - 1];
    $("#world-summary").innerHTML =
      `<span class="stat" title="Quốc gia còn sống / tổng số"><b>${alive}</b>/${S.nations.length} quốc gia</span>` +
      `<span class="stat gate" title="${esc(gates.length ? gates.map(([e, t]) => `${e}: lượt ${t}`).join(" · ") : "Chưa quốc gia nào qua cổng kỷ nguyên")}">${latest ? `Cổng <b>${esc(latest[0])}</b> · lượt ${latest[1]}` : "Chưa qua cổng kỷ nguyên"}</span>` +
      `<button type="button" class="stat war-chip${wars ? " hot" : ""}" id="war-chip" ${wars ? `title="Bấm để bay tới mặt trận"` : "disabled"}>${wars ? "⚔️ " : ""}<b>${wars}</b> cuộc chiến</button>` +
      (() => { const m = S.minds || [], models = new Set(m.map(x => x.model)).size; return `<button type="button" class="stat minds-chip" id="minds-chip" title="${m.length} bộ não AI, ${models} model: bấm để xem từng cái">🧠 <b>${m.length}</b> AI</button>`; })();
    $("#minds-chip").onclick = openMinds;
    $("#war-chip").onclick = () => {
      const ws = S.wars || []; if (!ws.length) return;
      if (ws.length === 1) goToWar(ws[0]);
      else { openRight("diplomacy"); document.querySelector('#tab-diplomacy .seg button[data-sub="war"]')?.click(); }
    };
  }
  // every AI mind running now, grouped by model
  const MIND_ICON = { "Quốc gia": "🏛", "Bộ trưởng": "🎓", "Trọng tài": "⚖️", "Sử gia": "📜" };
  const MIND_STATE = { playing: ["đang chạy", "ok"], active: ["đang chạy", "ok"], asleep: ["đang ngủ (chờ hạn mức)", "warn"], error: ["lỗi", "bad"] };
  function openMinds() {
    const m = S.minds || [], by = new Map();
    for (const x of m) { const k = x.model || x.provider || "?"; if (!by.has(k)) by.set(k, []); by.get(k).push(x); }
    const perTurn = m.reduce((s, x) => s + x.perTurn, 0);
    $("#minds-body").innerHTML = m.length ? `<p class="note">${m.length} bộ não AI, ${by.size} model; mỗi lượt khoảng ${perTurn} lệnh gọi (trọng tài chỉ gọi khi có đơn phát minh, sử gia mỗi vài lượt). Bot không tính.</p>
      <div class="minds-sum">${[...by.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, xs]) => `<div class="card2"><div class="row"><b>${esc(k)}</b><span style="flex:1"></span><span class="pill">×${xs.length}</span></div><div class="meta">${Object.entries(xs.reduce((o, x) => (o[x.role] = (o[x.role] || 0) + 1, o), {})).map(([r, c]) => `${MIND_ICON[r] || ""} ${esc(r)} ${c}`).join(" · ")}${xs.some(x => x.effort) ? ` · effort ${[...new Set(xs.map(x => x.effort).filter(Boolean))].map(esc).join("/")}` : ""}</div></div>`).join("")}</div>
      <table class="res prod"><thead><tr><th>Vai</th><th>Ai</th><th>Model</th><th>Trạng thái</th></tr></thead><tbody>${m.map(x => { const [st, cls] = MIND_STATE[x.status] || [x.status, ""]; return `<tr><td>${MIND_ICON[x.role] || ""} ${esc(x.role)}</td><td>${esc(x.who)}</td><td>${esc(x.model)}${x.effort ? ` · ${esc(x.effort)}` : ""}</td><td><span class="pill ${cls}">${esc(st)}</span></td></tr>`; }).join("")}</tbody></table>`
      : `<p class="note">Không có model AI nào đang chạy: mọi quốc gia đều là bot.</p>`;
    $("#minds-dialog").showModal();
  }
  $("#minds-close").onclick = () => $("#minds-dialog").close();
  const togglePause = () => api("/api/control", { method: "POST", body: { action: window.__status?.paused ? "resume" : "pause" } }).then(applyStatus).catch(() => { });
  const stepTick = () => api("/api/control", { method: "POST", body: { action: "step" } }).catch(() => { });
  $("#btn-pause").onclick = togglePause;
  $("#btn-step").onclick = stepTick;
  $("#tick-seconds").onchange = e => api("/api/control", { method: "POST", body: { action: "tick_seconds", value: +e.target.value } }).then(applyStatus);

  // ---------------------------------------------------------------- theme: dark only
  const effectiveTheme = () => "dark";

  // ---------------------------------------------------------------- docks
  // Left dock = Claude chat. Right dock = the inspector and every Watcher panel.
  // Both float over the map, collapse, resize by their inner edge, and are remembered.
  const phone = matchMedia("(max-width: 700px)");
  const root = document.documentElement;
  const DOCKS = {
    left: { el: $("#dock-left"), open: false, w: 360, min: 260 },
    right: { el: $("#dock-right"), open: false, w: 440, min: 320 },
  };
  let curTab = "nations";
  try {
    const saved = JSON.parse(localStorage.getItem("sm-docks") || "null");
    if (saved) { for (const side of ["left", "right"]) if (saved[side]) { DOCKS[side].open = !!saved[side].open; if (+saved[side].w) DOCKS[side].w = +saved[side].w; } }
    else DOCKS.left.open = !phone.matches;
    curTab = localStorage.getItem("sm-tab") || curTab;
  } catch { DOCKS.left.open = !phone.matches; }
  if (!document.querySelector(`.tabs button[data-tab="${CSS.escape(curTab)}"]`)) curTab = "nations";
  if (phone.matches) DOCKS.left.open = DOCKS.right.open = false; // phones start on the bare map; sheets open from the bar
  const maxDockW = () => Math.max(280, Math.round(innerWidth * .6));
  function saveDocks() {
    try { localStorage.setItem("sm-docks", JSON.stringify({ left: { open: DOCKS.left.open, w: DOCKS.left.w }, right: { open: DOCKS.right.open, w: DOCKS.right.w } })); } catch { }
  }
  const tabButtons = [...document.querySelectorAll(".tabs button")];
  const tabTitle = b => b.title || b.textContent.trim();
  function applyDocks() {
    for (const side of ["left", "right"]) {
      const d = DOCKS[side];
      if (!phone.matches) d.w = clamp(d.w, d.min, maxDockW()); // phones use sheets; keep the desktop width
      d.el.hidden = !d.open;
      root.style.setProperty(`--${side}-w`, `${d.w}px`);
      document.body.classList.toggle(`${side}-open`, d.open);
    }
    $("#dock-left-open").hidden = DOCKS.left.open;
    const bc = $("#btn-chat"); bc.setAttribute("aria-expanded", String(DOCKS.left.open)); bc.classList.toggle("on", DOCKS.left.open);
    for (const b of tabButtons) {
      const on = b.dataset.tab === curTab;
      b.setAttribute("aria-selected", String(on && DOCKS.right.open)); b.tabIndex = on ? 0 : -1;
    }
    updateZoomUi();
  }
  function setDock(side, open) {
    if (open && phone.matches) DOCKS[side === "left" ? "right" : "left"].open = false;
    DOCKS[side].open = open; applyDocks(); saveDocks();
    if (side === "left" && open) loadChat();
    if (side === "right" && open) onPanelShown(curTab);
  }
  function onPanelShown(tab) {
    if (tab === "stats" && S) renderStats();
    if (tab === "tree" && S) renderTrees();
    if (tab === "inspect" && S) renderInspector();
  }
  function openRight(tab, focus = false) {
    curTab = tab;
    const b = tabButtons.find(x => x.dataset.tab === tab);
    for (const p of document.querySelectorAll("#dock-right .panel")) p.hidden = p.id !== `tab-${tab}`;
    $("#dock-right-title").textContent = b ? tabTitle(b) : "";
    try { localStorage.setItem("sm-tab", tab); } catch { }
    b?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (focus) b?.focus();
    if (DOCKS.right.open) { applyDocks(); onPanelShown(tab); } else setDock("right", true);
  }
  for (const b of tabButtons) {
    b.id ||= `tabbtn-${b.dataset.tab}`; b.setAttribute("aria-controls", "dock-right");
    // the open panel's button closes the dock again
    b.onclick = () => DOCKS.right.open && curTab === b.dataset.tab ? setDock("right", false) : openRight(b.dataset.tab);
  }
  $(".tabs").addEventListener("keydown", e => {
    const k = tabButtons.indexOf(document.activeElement); if (k < 0) return;
    const to = { ArrowRight: k + 1, ArrowLeft: k - 1, ArrowDown: k + 1, ArrowUp: k - 1, Home: 0, End: tabButtons.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault(); openRight(tabButtons[(to + tabButtons.length) % tabButtons.length].dataset.tab, true);
  });
  $("#btn-chat").onclick = () => setDock("left", !DOCKS.left.open);
  $("#dock-left-open").onclick = () => setDock("left", true);
  $("#dock-left-close").onclick = () => setDock("left", false);
  $("#dock-right-close").onclick = () => setDock("right", false);
  // drag (or arrow keys on) the inner edge to resize
  for (const h of document.querySelectorAll(".dock-resize")) {
    const side = h.dataset.side, d = DOCKS[side];
    const setW = w => { d.w = clamp(Math.round(w), d.min, maxDockW()); root.style.setProperty(`--${side}-w`, `${d.w}px`); h.setAttribute("aria-valuenow", String(d.w)); };
    h.addEventListener("pointerdown", e => {
      if (phone.matches) return;
      e.preventDefault(); h.setPointerCapture(e.pointerId); document.body.classList.add("resizing");
      const move = ev => setW(side === "left" ? ev.clientX - d.el.getBoundingClientRect().left : d.el.getBoundingClientRect().right - ev.clientX);
      const up = () => { h.removeEventListener("pointermove", move); h.removeEventListener("pointerup", up); h.removeEventListener("pointercancel", up); document.body.classList.remove("resizing"); saveDocks(); updateZoomUi(); };
      h.addEventListener("pointermove", move); h.addEventListener("pointerup", up); h.addEventListener("pointercancel", up);
    });
    h.addEventListener("keydown", e => {
      const dir = { ArrowLeft: -1, ArrowRight: 1 }[e.key]; if (!dir) return;
      e.preventDefault(); setW(d.w + dir * (side === "left" ? 24 : -24)); saveDocks();
    });
    h.setAttribute("aria-valuemin", String(d.min)); h.setAttribute("aria-valuenow", String(d.w));
  }
  phone.addEventListener?.("change", () => { if (phone.matches && DOCKS.left.open && DOCKS.right.open) DOCKS.left.open = false; applyDocks(); });
  addEventListener("resize", () => applyDocks());
  // the docks start just under the top bar, whatever height it wraps to
  new ResizeObserver(() => root.style.setProperty("--top", `${Math.ceil($("#topbar").getBoundingClientRect().bottom)}px`)).observe($("#topbar"));

  // ---------------------------------------------------------------- inspector
  // What you clicked: a tile (with its owner) or a nation.
  let inspect = null, inspReq = 0;
  const REGION = { west: "Lục địa Tây", east: "Lục địa Đông", isl: "Quần đảo" };
  const HIDDEN_RES = new Set(["copper", "tin", "iron", "gold", "silver", "gems"]);
  function inspectNation(id) {
    const n = S.nations[id]; if (!n) return;
    pinnedI = -1; inspect = { kind: "nation", id }; renderBoard();
    openRight("inspect"); renderInspector();
    if (n.alive) centerOn(n.capital); else scheduleRender();
  }
  const VEIN_COLOR = { copper: "#d9822b", tin: "#b8c4cc", iron: "#7a4a3a", salt: "#ffffff", flint: "#3d3d4a", clay: "#b5653c", coal: "#222222", sulfur: "#e8d84a", oil: "#111111", horse: "#a0703a",
    gold: "#ffd700", silver: "#e6e8ec", gems: "#3fd0c9", marble: "#f4f1ea", amber: "#ffb000", spice: "#c0392b", fur: "#8b5a2b", fish: "#4fc3f7", pearl: "#fdf6e3", whale: "#2c3e70" };
  // §2.11 the sea around a nation, and the fine things its people enjoy
  function seaBlock(n) {
    const v = n.sea, l = n.luxuries, out = [];
    const xyT = t => `(${t.join(", ")})`;
    // §6.4 herds
    const h = n.herds;
    if (h) {
      const ICON = { dog: "🐕", goat: "🐐", cattle: "🐂", pig: "🐖", fowl: "🐓", horse: "🐎" };
      const herd = Object.entries(h.animals || {}).map(([k, c]) => `<span>${ICON[k] || ""} ${esc(RES[k] ?? k)} <b>${c}</b></span>`);
      const wild = (h.wild_on_my_land || []).map(x => `<span class="dim" title="${x.can_tame ? "Đang bắt về nuôi" : "Cần Thuần dưỡng"}">hoang: ${esc(RES[x.wild] ?? x.wild)} ${x.on_my_land}${x.can_tame ? " ↻" : ""}</span>`);
      out.push(sec("", "Đàn gia súc", `<div class="chips">${herd.join("") || `<span class="dim">Chưa nuôi con nào</span>`}${wild.join("")}</div>`, { fold: false, aside: `chuồng ${h.pens} · sức chứa ${h.room_grazers}/${h.room_others}`, help: "Sức chứa: thú ăn cỏ / thú khác. ↻ = đang bắt thú hoang về nuôi." }));
    }
    const faith = [...(n.missions || []).map(m => `<span title="${esc(`${m.priests} nhà truyền giáo ${m.where < 0 ? "trong nước" : `ở ${m.place}`} tới lượt ${m.until}`)}">🙏 ${m.where < 0 ? "trong nước" : esc(m.place)}${m.converts ? ` · ${m.converts} người theo` : ""}</span>`), n.festival ? `<span>🎉 lễ hội L${n.festival.tick}</span>` : ""].filter(Boolean);
    if (faith.length) out.push(sec("", "Tín ngưỡng", `<div class="chips">${faith.join("")}</div>`, { fold: false }));
    if (l) out.push(sec("", "Xa xỉ phẩm", `<div class="chips">${l.kinds.length ? l.kinds.map(g => `<span>${esc(RES[g] ?? g)}</span>`).join("") : `<span class="dim">không</span>`}</div>`, { fold: false, aside: `+${l.stability} ổn định/lượt`, help: `Mỗi loại cần ${l.need} trong kho.` }));
    if (v) {
      const rows = [];
      rows.push(["Thuyền", `${v.can.hold_shallow_sea ? "biển nông" : "chưa (cần Thuyền độc mộc)"}${v.can.hold_deep_sea ? ", biển sâu" : ""}`], ["Bến / cảng / bến cá", `${v.can.piers} / ${v.can.harbors || 0} / ${v.can.fish_bonus_from_docks}`]);
      if (v.my_waters) rows.push([`Lãnh hải ${v.my_waters.tiles} ô`, `cá ${v.my_waters.fish} (+${v.my_waters.fish_regrows_per_turn}/lượt)${v.my_waters.pearls ? ` · ngọc ${v.my_waters.pearls}` : ""}${v.my_waters.coral ? ` · san hô ${v.my_waters.coral}` : ""}${v.my_waters.whales ? ` · cá voi ${v.my_waters.whales}` : ""}`]);
      if (v.my_shore) rows.push([`Bờ biển ${v.my_shore.tiles} ô`, `sò ốc ${v.my_shore.shellfish}${v.my_shore.amber ? ` · hổ phách ${v.my_shore.amber}` : ""}`]);
      const f = v.free_waters_near;
      if (f) rows.push(["Biển vô chủ gần", `${f.tiles} ô (${f.shallow} nông) · cá ${f.fish} (+${f.fish_regrows_per_turn}/lượt) · chiếm ngay ${f.claimable_now}`]);
      if (f?.fishing_grounds.length) rows.push(["Ngư trường ◆", f.fishing_grounds.map(x => xyT(x.tile)).join(" ")]);
      if (f?.pearl_beds.length) rows.push(["Ngọc trai", f.pearl_beds.map(x => xyT(x.tile)).join(" ")]);
      if (f?.whales.length) rows.push(["Cá voi", f.whales.map(x => xyT(x.tile)).join(" ")]);
      if (v.pier_sites) rows.push(["Chỗ dựng bến", v.pier_sites.map(p => `${xyT(p.tile)} ${p.fish_within_reach} cá`).join(", ")]);
      for (const a of v.lands_across_the_sea || []) rows.push([`Bên kia biển ${xyT(a.nearest)}`, `${a.island ? "quần đảo · " : ""}thấy ${a.seen_tiles} ô · cách ${a.distance}${a.owners ? ` · của ${a.owners.map(esc).join(", ")}` : ""}${a.free_goods ? ` · có ${a.free_goods.map(esc).join(", ")}` : ""}`]);
      out.push(sec("prof-sea", "Biển", `<dl class="kvl wide">${rows.map(([k, x]) => `<dt>${esc(k)}</dt><dd>${x}</dd>`).join("")}</dl>`, { open: true }));
    }
    return out.join("");
  }
  const TIER_ICON = ["", "🏘", "🏙"];
  const THREAT_ICON = { war: "⚔️", famine: "🍂", drought: "☀", water: "💧", winter: "❄", plague: "🦠", flood: "🌊", beasts: "🐺", horde: "☠", quake: "💥", volcano: "🌋", cold: "🥶", icewall: "🧊",
    discontent: "✊", schism: "✊", unrest: "🔥", housing: "🏚", overreach: "🚩" };
  const LEVEL_CLS = ["", "", "warn", "bad"];
  /** Threats one line each: icon, title, level; the long text in the tooltip. */
  function threatLines(list, empty = "Không có.") {
    if (!list.length) return `<p class="empty">${esc(empty)}</p>`;
    return `<ul class="lines">${list.map(t => `<li class="lv${t.level}" title="${esc(t.detail)}"><span class="i">${THREAT_ICON[t.kind] || "⚠"}</span><span class="t">${esc(t.title)}</span><span class="pill ${LEVEL_CLS[t.level]}">${LEVEL[t.level]}</span></li>`).join("")}</ul>`;
  }
  const sumBook = b => Object.values(b || {}).reduce((s, v) => s + v, 0);
  const netOf = t => t?.last ? sumBook(t.last.in) - sumBook(t.last.out) : 0;
  /** The change of a number over the turns the side panel remembers (n.recent, oldest first). */
  function trend(n, key) {
    const r = n.recent || [], first = r[0];
    if (!first || r.length < 2) return null;
    const now = key === "pop" ? n.population : key === "food" ? Math.round(n.stock.food || 0) : n.stability;
    return { d: now - first[key], since: first.tick };
  }
  const trendText = tr => tr ? (tr.d === 0 ? "±0" : `${tr.d > 0 ? "▲" : "▼"} ${fmt(Math.abs(tr.d))}`) : "";
  const trendTone = tr => !tr || tr.d === 0 ? "" : tr.d > 0 ? "good" : "bad";
  /** The six numbers the Watcher looks at first. */
  function keyTiles(n, few = false) {
    const t = n.treasury, net = netOf(t), pop = trend(n, "pop"), food = trend(n, "food");
    const since = pop ? ` (so với lượt ${pop.since})` : "";
    const tiles = [
      statTile({ l: "👥 Dân", v: fmt(n.population), d: trendText(pop), dt: trendTone(pop), t: `${n.population} dân${pop ? `, ${signed(pop.d)}${since}` : ""}${n.demo ? ` · ${n.demo.households} hộ · ${n.demo.fighters} người ra trận được` : ""}` }),
      statTile({ l: "🌾 Lương thực", v: fmt(n.stock.food || 0), d: trendText(food), dt: trendTone(food), t: `Kho lương thực${food ? `, ${signed(food.d)}${since}` : ""}${n.demo ? ` · ăn ${n.demo.mouths} suất mỗi lượt` : ""}` }),
      statTile({ l: "⚖️ Ổn định", v: n.stability, m: n.stability, mt: toneOf(n.stability, 60, 30), t: "Ổn định 0–100: dưới 30 dân bất an, bất mãn tăng" }),
    ];
    if (few) return `<div class="tiles">${tiles.join("")}</div>`;
    tiles.push(
      statTile({ l: "💰 Ngân khố", v: t ? fmt(t.coin) : "—", d: t?.last ? `${signed(net)}/lượt` : "", dt: net > 0.05 ? "good" : net < -0.05 ? "bad" : "", t: t ? `${fmt1(t.coin)} tiền · thuế ${Math.round(t.tax * 100)}% · thuế quan ${Math.round(t.tariff * 100)}%${t.coin > t.safe ? " · kho đầy, đang thất thoát" : ""}` : "Chưa có ngân khố" }),
      statTile({ l: "🗺 Lãnh thổ", v: `${n.governed ?? n.tiles}<small>/${n.tileLimit}</small>`, m: pctOf(n.governed ?? n.tiles, n.tileLimit), mt: (n.governed ?? n.tiles) > n.tileLimit ? "bad" : "", t: `${n.governed ?? n.tiles} ô quản lý / giới hạn ${n.tileLimit}${n.waters ? ` · ${n.waters} ô lãnh hải` : ""}` }),
      statTile({ l: "💡 Phát minh", v: n.inventions.length, d: n.research ? `${Math.round(pctOf(n.research.progress, n.research.cost))}% kế tiếp` : "", t: n.research ? `Đang nghiên cứu ${n.research.name}: ${n.research.progress}/${n.research.cost} RP` : "Không nghiên cứu gì" }),
    );
    return `<div class="tiles">${tiles.join("")}</div>`;
  }
  /** Small numbers in a row: reputation, living standard, prosperity, discontent, era, royal house. */
  function gauges(n) {
    const g = [];
    g.push(`<span title="Uy tín với các nước khác">🏅 Uy tín <b>${n.reputation}</b></span>`);
    if (n.living) g.push(`<span title="Mức sống 0–100${n.living.expected.some(x => !x.met) ? `: thiếu ${n.living.expected.filter(x => !x.met).map(x => x.name).join(", ")}` : ""}">🏠 Mức sống <b class="${toneOf(n.living.score, 75, 40)}">${n.living.score}</b></span>`);
    if (n.prosperity && n.alive && n.founded) g.push(`<span title="Thịnh vượng 0–100, hạng ${n.prosperity.rank?.rank ?? "?"}/${n.prosperity.rank?.of ?? "?"} trong các nước quen biết${n.prosperity.mood === "acclaim" ? " · dân tung hô" : n.prosperity.mood === "envy" ? " · dân ganh tị" : ""}">✨ Thịnh vượng <b class="${n.prosperity.mood === "envy" ? "bad" : n.prosperity.mood === "acclaim" ? "good" : ""}">${n.prosperity.score}</b></span>`);
    if (n.alive && n.founded) g.push(`<span title="Bất mãn 0–100: tới 100 một phái xin ly khai">✊ Bất mãn <b class="${n.discontent >= 70 ? "bad" : n.discontent >= 40 ? "warn" : ""}">${n.discontent}</b></span>`);
    g.push(`<span title="${esc(n.nextEra ? `Để sang ${n.nextEra.era} còn cần: ${n.nextEra.missing.join(", ") || "đã đủ"}` : "Kỷ nguyên")}">🏺 <b>${esc(n.era)}</b></span>`);
    if (n.royals?.house) g.push(`<span title="${esc(`${(n.royals.unwed || []).length} hoàng thân chưa thành hôn${(n.royals.in_laws || []).length ? ` · thông gia: ${n.royals.in_laws.map(x => x.nation).join(", ")}` : ""}`)}">👑 <b>${esc(n.royals.house)}</b></span>`);
    return `<div class="gauges">${g.join("")}</div>`;
  }
  /** What needs the Watcher's eye now: wars (click to fly to the front), outbreaks, hunger, flight, unrest. */
  function alertsOf(n) {
    if (!n.alive) return "";
    const out = [];
    for (const w of (S.wars || []).filter(w => w.a === n.id || w.b === n.id)) {
      const ta = w.tally?.[n.id], foe = w.a === n.id ? w.b : w.a, tb = w.tally?.[foe];
      out.push(`<button type="button" class="bad" data-war="${w.id}" title="Bấm để bay tới mặt trận">${SWORD} Chiến tranh với ${esc(nm(foe))}${ta || tb ? ` <span class="dim">${fmt1(ta?.score || 0)} : ${fmt1(tb?.score || 0)}</span>` : ""}<span class="go">mặt trận ›</span></button>`);
    }
    for (const [i, t] of alarmsOf(n)) if (i !== SWORD) out.push(`<div class="${i === "💤" ? "warn" : "bad"}">${i} ${esc(t)}</div>`);
    if (n.health?.quarantine) out.push(`<div class="warn" title="Không buôn bán, không chợ biên giới tới hết lượt ${n.health.quarantineUntil}">🚧 Đang cách ly</div>`);
    for (const c of (n.classes || []).filter(c => c.mood < 30)) out.push(`<div class="warn" title="${esc(c.because.join("; "))}">${ORDER_ICON[c.class] || "⚠"} ${esc(c.name)} ${c.strike ? "đình công" : "bất bình"} <span class="dim">${c.mood}</span></div>`);
    return out.length ? `<div class="alerts">${out.join("")}</div>` : "";
  }
  function nationBlock(n, tile) {
    const el = document.createElement("section"); el.className = "insp-nation";
    const pct = n.research ? pctOf(n.research.progress, n.research.cost) : 0;
    const blds = tile === null ? n.buildings : n.buildings.filter(b => b.tile === tile);
    // one chip a kind, with how many; the ones going up and the sabotaged ones on their own
    const bchips = (() => {
      const done = new Map(), out = [];
      for (const b of blds) {
        if (!b.done) out.push(`<span class="warn" title="Đang xây ${b.progress}/${b.work} công">${bIcon(b)} ${esc(b.name)} ${Math.round(pctOf(b.progress, b.work))}%</span>`);
        else if (b.off) out.push(`<span class="bad" title="Bị phá hoại, tạm ngừng">${bIcon(b)} ${esc(b.name)} ✗</span>`);
        else { const k = done.get(b.type); if (k) k.n++; else done.set(b.type, { b, n: 1 }); }
      }
      return [...out, ...[...done.values()].map(({ b, n }) => `<span${b.desc ? ` title="${esc(b.desc)}"` : ""}>${bIcon(b)} ${esc(b.name)}${n > 1 ? ` <b>×${n}</b>` : ""}</span>`)];
    })();
    const head = `<div class="head"><span class="flag"></span><div class="grow"><h3 class="nname"></h3><div class="sub nmeta"></div></div><div class="pills">${healthPills(n)}${statusPill(n)}</div></div>`;
    const actions = `<div class="actions"><button type="button" class="primary sm" data-act="detail">Hồ sơ đầy đủ</button>${n.alive ? `<button type="button" class="sm" data-act="locate" title="Xem trên bản đồ">📍 Bản đồ</button>` : ""}${tile === null ? `<button type="button" class="more" data-act="list">Tất cả quốc gia ›</button>` : ""}</div>`;
    if (tile !== null) {
      el.innerHTML = `${head}${keyTiles(n, true)}${bchips.length ? sec("", "Công trình trên ô này", chipList(bchips), { fold: false, count: blds.length }) : ""}${actions}`;
    } else {
      const threats = (n.threats || []).filter(t => t.level >= 1), top = Math.max(0, ...threats.map(t => t.level));
      const stl = (n.settlements || []).map(x => { const p = (n.provinces || []).find(q => q.centre === x.tile); return `<span title="${esc(p ? `${p.tierName}${p.focus ? `, trọng tâm ${p.focus}` : ""} · ${p.people} dân${p.next ? ` · ${p.next}` : ""}` : "")}">${p?.tier ? `${TIER_ICON[p.tier]} ` : ""}${esc(x.name)}</span>`; });
      const res = (n.resources?.territory || []).slice().sort((a, b) => b.left - a.left).map(l => `<span class="${l.max && l.left / l.max < 0.15 ? "warn" : ""}" title="${esc(`${l.left}/${l.max}${l.regrows ? ", tái tạo dần" : ", không tái tạo"}${l.hidden ? "; AI của nước này chưa thấy" : ""}`)}">${esc(RES[l.key] ?? l.key)} <b>${fmt(l.left)}</b>${l.hidden ? " 👁" : ""}</span>`);
      el.innerHTML = `${head}
        ${keyTiles(n)}
        ${alertsOf(n)}
        ${n.research ? `<div class="research" title="Tiến độ nghiên cứu"><span>📜</span><span class="t">${esc(n.research.name)}</span><span class="dim">${fmt(n.research.progress)}/${fmt(n.research.cost)} RP</span>${meter(pct, "", "Tiến độ nghiên cứu")}</div>` : ""}
        ${n.alive && n.founded ? gauges(n) : ""}
        ${n.thought ? `<p class="quote clamp2"></p>` : ""}
        ${actions}
        ${n.alive ? sec("insp-threats", "Mối đe dọa", threatLines(threats.slice(0, 6), "Không có mối đe dọa đáng kể."), { count: threats.length || "", cls: top >= 3 ? "hot" : top >= 2 ? "warm" : "", open: true }) : ""}
        ${sec("insp-bld", "Công trình", topN(bchips, 14, x => chipList(x)), { count: blds.length || "" })}
        ${stl.length ? sec("insp-stl", "Điểm định cư", chipList(stl), { count: stl.length }) : ""}
        ${n.alive ? sec("insp-res", "Tài nguyên", res.length ? topN(res, 12, x => chipList(x)) : `<p class="empty">Không có.</p>`, { count: res.length || "", help: "Trữ lượng còn lại trên lãnh thổ. 👁 = AI của nước này chưa thấy. Rê chuột để xem tối đa." }) : ""}`;
      for (const b of el.querySelectorAll("[data-war]")) b.onclick = () => { const w = (S.wars || []).find(x => x.id === +b.dataset.war); if (w) goToWar(w); };
    }
    el.querySelector(".flag").replaceWith(flagCanvas(n.flag, tile === null ? 48 : 36, tile === null ? 32 : 24));
    el.querySelector(".nname").textContent = nationName(n);
    el.querySelector(".nmeta").textContent = [n.trait && `${n.trait.icon} ${n.trait.name}`, n.capitalName && `thủ đô ${n.capitalName}`, modelLabel(n)].filter(Boolean).join(" · ");
    if (n.trait) el.querySelector(".nmeta").title = `${n.people} · ${n.trait.name}: ${n.trait.lines.join(" · ")}`;
    const q = el.querySelector(".quote"); if (q) { q.textContent = `“${n.thought}”`; q.title = n.thought; }
    el.querySelector("[data-act=detail]").onclick = () => openNation(n.id);
    el.querySelector("[data-act=locate]")?.addEventListener("click", () => centerOn(n.capital));
    el.querySelector("[data-act=list]")?.addEventListener("click", () => openRight("nations"));
    return el;
  }
  async function renderInspector() {
    const box = $("#inspector"); if (!S) return;
    if (!inspect) {
      box.innerHTML = `<div class="insp-empty"><p><b>Chưa chọn gì</b></p><p class="empty">Nhấp một ô trên bản đồ, hoặc một nước trong bảng Quốc gia.</p></div>`;
      return;
    }
    if (inspect.kind === "nation") { const n = S.nations[inspect.id]; box.replaceChildren(nationBlock(n, null)); return; }
    const i = inspect.i, my = ++inspReq;
    let t; try { t = await api(`/api/tile?i=${i}`); } catch (e) { box.innerHTML = `<p class="note">Không tải được ô: ${esc(e.message)}</p>`; return; }
    if (my !== inspReq || inspect?.kind !== "tile" || inspect.i !== i) return;
    const owner = t.owner >= 0 ? S.nations[t.owner] : null, w = ST.wonders.find(x => x.i === i);
    const vein = (ST.veins || []).find(x => x.i === i);
    const capOf = S.nations.find(n => n.alive && n.capital === i), stl = S.nations.flatMap(n => (n.settlements || []).filter(x => x.tile === i))[0];
    const keys = [...new Set([...Object.keys(t.cap || {}), ...Object.keys(t.res || {})])].filter(k => (t.cap?.[k] || 0) >= .5 || (t.res?.[k] || 0) >= .5);
    const battles = (S.battles || []).filter(b => b.tile === i).slice().reverse();
    const tags = [t.river && "<span>Sông</span>", t.delta && "<span>Châu thổ</span>", !t.land && "<span>Biển</span>", t.road && `<span>🛤 ${esc(t.land ? S.roadLevels[t.road - 1].name : S.roadLevels[t.road - 1].lane)}</span>`,
      capOf && `<span>★ Thủ đô ${esc(capOf.capitalName || nationName(capOf))}</span>`, stl && `<span>🏕 ${esc(stl.name)}</span>`, inWild(i) && `<span class="warn">Vùng hoang</span>`, ST.herd?.includes(i) && "<span>🐂 Tuyến bò rừng</span>",
      w && `<span class="good">⭐ ${esc(w.name)}</span>`, vein && `<span class="good">◆ Mạch ${esc(vein.name)}</span>`, !owner && `<span class="dim">Vô chủ</span>`].filter(Boolean);
    const el = document.createElement("div"); el.className = "insp-tile";
    el.innerHTML = `<div class="head"><span class="swatch" style="background:${TERRAIN[t.terrain][1]}"></span><div class="grow"><h3>${esc(TERRAIN[t.terrain][0])}</h3>
        <div class="meta">(${i % geo.N}, ${(i / geo.N) | 0}) · ${ZONE[t.zone]} · ${esc(REGION[t.region] || "ngoài khơi")}${typeof t.elev === "number" ? ` · cao ${t.elev.toFixed(2)}` : ""}</div></div>
        <button type="button" class="icon" data-act="unpin" aria-label="Bỏ chọn ô" title="Bỏ chọn (Esc)">×</button></div>
      ${tags.length ? `<div class="chips">${tags.join("")}</div>` : ""}
      ${sec("", "Trữ lượng", keys.length ? `<div class="reslist">${keys.map(k => { const now = t.res?.[k] || 0, cap = t.cap?.[k] || 0; return `<span class="n">${esc(RES[k] ?? k)}${HIDDEN_RES.has(k) ? ` <span class="pill" title="Ẩn với AI">ẩn</span>` : ""}</span>${meter(pctOf(now, cap), now < cap * 0.25 ? "warn" : "good")}<span class="q"><b>${fmt(now)}</b>/${fmt(cap)}</span>`; }).join("")}</div>` : `<p class="empty">Không có trữ lượng.</p>`, { fold: false, count: keys.length || "" })}
      ${sec("", "Mối đe dọa", threatLines(t.threats || [], "Không có gì đáng ngại."), { fold: false })}
      ${battles.length ? sec("tile-battles", "Trận đánh", `<ol class="chronicle">${battles.map(b => `<li><span class="t">${b.tick}</span><span>${esc(nm(b.attacker))} ${b.kind === "raid" ? "đột kích" : "đánh"} ${esc(nm(b.defender))}: <b class="${b.won ? "good" : "bad"}">${b.won ? "thắng" : "thua"}</b> <span class="dim">${b.a}:${b.d} · mất ${b.lossA}/${b.lossD}</span></span></li>`).join("")}</ol>`, { count: battles.length, open: true }) : ""}`;
    el.querySelector("[data-act=unpin]").onclick = () => pinTile(-1);
    if (owner) el.append(nationBlock(owner, i));
    box.replaceChildren(el);
  }

  // ---------------------------------------------------------------- nations
  const MODEL_NAME = { haiku: "Haiku", sonnet: "Sonnet" };
  const modelLabel = n => n.provider === "claude" ? `Claude ${MODEL_NAME[n.model] ?? n.model}${n.effort ? ` · ${n.effort}` : ""}` : n.model;
  /** §9.5 an outbreak that can still spread, a quarantine in force */
  function healthPills(n) {
    const h = n.health || {};
    return (h.outbreak ? `<span class="pill bad" title="Còn lây được sang láng giềng và bạn hàng tới hết lượt ${h.outbreakUntil}">🦠 Đang có dịch</span> ` : "")
      + (h.quarantine ? `<span class="pill warn" title="Đóng cửa biên giới tới hết lượt ${h.quarantineUntil}: không buôn bán, không chợ biên giới">🚧 Đang cách ly</span> ` : "");
  }
  function statusPill(n) {
    if (!n.alive) return `<span class="pill bad">Diệt vong</span>`;
    if (n.controller === "bot") return `<span class="pill">Bot</span>`;
    if (n.provider === "claude" && window.__status?.claudeWait) return `<span class="pill warn">Chờ Claude</span>`;
    if (n.status === "asleep") return `<span class="pill warn">Ngủ đến ${new Date(n.sleepUntil).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>`;
    if (n.status === "error") return `<span class="pill bad">Lỗi key</span>`;
    return `<span class="pill ok">Đang chơi</span>`;
  }
  function renderNations() {
    const box = $("#nations"); box.innerHTML = "";
    for (const n of S.nations) {
      const el = document.createElement("article"); el.className = `nation${n.alive ? "" : " dead"}`;
      const pct = n.research ? Math.min(100, n.research.progress / n.research.cost * 100) : 0;
      // trait, officials and thought sit in tooltips; the card shows numbers, research and the worst threat
      const top = n.alive ? (n.threats || []).filter(t => t.level >= 2).sort((a, b) => b.level - a.level)[0] : null;
      const who = [n.trait && `${n.trait.name}: ${n.trait.lines.join(" · ")}`, (n.officials || []).length && `Triều đình: ${n.officials.map(o => o.name).join(", ")}`, n.thought && `“${n.thought}”`].filter(Boolean).join("\n");
      el.innerHTML = `<div class="head"><span class="flag"></span><div class="grow"><div class="name">${n.trait ? `${esc(n.trait.icon)} ` : ""}${esc(nationName(n))}</div><div class="model">${esc(n.era)} · ${esc(modelLabel(n))}</div></div>${statusPill(n)}</div>
        <div class="tiles">${statTile({ l: "Dân", v: fmt(n.population) })}${statTile({ l: "Lương thực", v: fmt(n.stock.food || 0) })}${statTile({ l: "Ổn định", v: n.stability, m: n.stability, mt: toneOf(n.stability, 60, 30) })}${statTile({ l: "Ô", v: `${n.governed ?? n.tiles}<small>/${n.tileLimit}</small>`, t: n.waters ? `${n.waters} ô lãnh hải` : "" })}${statTile({ l: "Phát minh", v: n.inventions.length })}</div>
        <div class="foot">${n.research ? `<span class="t" title="${esc(`${n.research.progress}/${n.research.cost} RP`)}">📜 ${esc(n.research.name)} · ${Math.round(pct)}%</span>` : `<span class="t"></span>`}${top ? `<span class="threat-tag lv${top.level}" title="${esc(top.detail)}">⚠ ${esc(top.title)}</span>` : ""}
          <button type="button" class="sm" data-act="locate"${n.alive ? "" : " disabled"}>📍</button><button type="button" class="sm" data-act="detail">Hồ sơ</button></div>`;
      if (who) el.title = who;
      el.querySelector(".flag").replaceWith(flagCanvas(n.flag, 36, 24));
      const name = nationName(n);
      el.querySelector("[data-act=locate]").setAttribute("aria-label", `Xem ${name} trên bản đồ`);
      el.querySelector("[data-act=detail]").setAttribute("aria-label", `Chi tiết về ${name}`);
      el.querySelector("[data-act=detail]").onclick = e => { e.stopPropagation(); openNation(n.id); };
      // clicking anywhere else on the card finds the nation on the map and in the inspector
      el.querySelector("[data-act=locate]").onclick = e => { e.stopPropagation(); inspectNation(n.id); };
      el.onclick = e => { if (e.target.closest("button")) return; inspectNation(n.id); };
      box.append(el);
    }
  }
  // §4.2 the people by age and sex: men to the left, women to the right, the young at the bottom
  const AGE_NAMES = ["Trẻ em 0–9", "Thiếu niên 10–19", "Trưởng thành 20–49", "Người già 50+"];
  function pyramid(n) {
    const d = n.demo; if (!d) return "";
    const top = Math.max(1, ...d.m, ...d.f), w = x => `${Math.round(x / top * 100)}%`;
    const rows = [3, 2, 1, 0].map(a => `<div class="pyr-row"><div class="pyr-m"><i style="width:${w(d.m[a])}"></i><b>${d.m[a]}</b></div><span>${AGE_NAMES[a]}</span><div class="pyr-f"><i style="width:${w(d.f[a])}"></i><b>${d.f[a]}</b></div></div>`).join("");
    const hp = n.housingParts;
    const housing = hp ? `Chỗ ở ${n.housing}: thủ đô ${hp.natural}${hp.settlements ? ` · điểm định cư ${hp.settlements}` : ""} · lều ${hp.buildings} · thôn xóm ${hp.hamlets}/${hp.hamletMax}${hp.wonder ? ` · hang ${hp.wonder}` : ""}` : "";
    return `<div class="card">${sec("", "Dân cư", `<div class="pyr" role="img" aria-label="Tháp dân số"><div class="pyr-head"><span>♂ ${d.m.reduce((a, b) => a + b, 0)}</span><span></span><span>${d.f.reduce((a, b) => a + b, 0)} ♀</span></div>${rows}</div>
      <dl class="kvl"><dt>Hộ</dt><dd>${d.households}</dd><dt>Ra trận được</dt><dd>${d.fighters}</dd><dt>Suất ăn / lượt</dt><dd>${d.mouths}</dd>${n.housing ? `<dt title="${esc(housing)}">Chỗ ở</dt><dd title="${esc(housing)}">${n.housing}</dd>` : ""}<dt>Lượt trước</dt><dd><span class="good">+${d.born}</span> · <span class="bad">−${d.infants + d.aged}</span></dd></dl>
      <div class="chips"><span title="Phong tục sinh đẻ">👪 ${esc(n.family.birthsName)}</span><span title="Ai ra trận">${SWORD} ${esc(n.family.fightersName)}</span></div>`, { fold: false, help: `Lượt trước: ${d.born} trẻ sinh, ${d.infants} trẻ sơ sinh mất, ${d.aged} người qua đời vì tuổi già hay lao lực.` })}</div>`;
  }
  // §2.8 the provinces: one per centre, its land, its people, its way home, its governor and its mood
  const WAY = { capital: "thủ đô", road: "🛤 đường bộ", water: "⛵ đường thủy", walk: "🚶 đi bộ" };
  // §6.1 the nation's buildings: what is going up (in the order the builders take them), what stands, what it can build
  const at = i => `(${i % geo.N}, ${(i / geo.N) | 0})`;
  const costText = c => Object.entries(c || {}).map(([k, q]) => `${q} ${RES[k] || k}`).join(" + ") || "không tốn vật liệu";
  function buildList(n) {
    const going = (n.buildings || []).filter(b => !b.done), done = (n.buildings || []).filter(b => b.done), rate = n.buildRate || 0;
    let queue = 0;
    const goingHtml = going.map(b => {
      queue += Math.max(0, b.work - b.progress);
      const eta = rate > 0 ? Math.max(1, Math.ceil(queue / rate)) : null, pct = b.work ? Math.round(b.progress / b.work * 100) : 0;
      return `<div class="bld"${b.desc ? ` title="${esc(b.desc)}"` : ""}><div class="row"><b>${bIcon(b)} ${esc(b.name)}</b><button class="link" data-tile="${b.tile}">${at(b.tile)} ↗</button><span class="grow"></span><span class="meta">${b.progress}/${b.work} công · ${eta ? `~${eta} lượt` : "chưa có thợ"}</span></div>${meter(pct, "", `Tiến độ ${b.name}`)}</div>`;
    }).join("");
    const roads = n.roadWorks || [], roadLeft = roads.reduce((a, r) => a + Math.max(0, r.work - r.progress), 0);
    const groups = new Map();
    for (const b of done) { if (!groups.has(b.type)) groups.set(b.type, []); groups.get(b.type).push(b); }
    const doneHtml = [...groups.values()].map(list => { const tiles = [...new Set(list.map(b => b.tile))]; return `<li${list[0].desc ? ` title="${esc(list[0].desc)}"` : ""}><span class="i">${bIcon(list[0])}</span><span class="t">${esc(list[0].name)}${list.length > 1 ? ` <b>×${list.length}</b>` : ""}</span><span class="r">${tiles.slice(0, 3).map(t => { const k = list.filter(b => b.tile === t).length; return `<button class="link" data-tile="${t}">${at(t)}${k > 1 ? `×${k}` : ""}${list.some(b => b.tile === t && b.off) ? " ✗" : ""}</button>`; }).join(" ")}${tiles.length > 3 ? ` +${tiles.length - 3}` : ""}</span></li>`; });
    const cat = n.buildCatalog || [];
    const rules = d => [d.max ? `tối đa ${d.max}` : "", d.perTile ? "mỗi ô một cái" : "", d.terrains ? `trên ${d.terrains.map(t => TERRAIN[t]?.[0] || t).join("/")}${d.river ? " hoặc ô có sông" : ""}` : d.river ? "cần ô có sông" : "", d.kind === "housing" ? `nhà ở: tối đa ${n.housingSlots} cho mọi trung tâm` : ""].filter(Boolean).join(" · ");
    const catHtml = cat.length ? `<table class="law-table bcat"><thead><tr><th scope="col">Công trình</th><th scope="col">Vật liệu</th><th scope="col">Công</th></tr></thead><tbody>${cat.map(d => `<tr title="${esc([d.desc, rules(d)].filter(Boolean).join(" · "))}"><td>${bIcon(d)} <b>${esc(d.name)}</b>${d.custom ? " ★" : ""}${d.have ? ` <span class="muted">(có ${d.have})</span>` : ""}${d.desc ? `<div class="muted">${esc(d.desc)}</div>` : ""}</td><td>${esc(costText(d.cost))}</td><td>${d.work}</td></tr>`).join("")}</tbody></table>` : `<p class="empty">Chưa phát minh ra công trình nào.</p>`;
    return `<div class="tiles">${statTile({ l: "🔨 Thợ xây", v: n.labor?.build ?? 0 })}${statTile({ l: "⚙ Công / lượt", v: fmt1(rate) })}${statTile({ l: "🛤 Đường đang làm", v: roads.length, d: roads.length ? `còn ${fmt(roadLeft)} công` : "" })}</div>
      ${sec("", "Đang xây", goingHtml || `<p class="empty">Không có.</p>`, { fold: false, count: going.length || "", cls: going.length ? "warm" : "", help: "AI ra lệnh build (1 AP) chọn công trình và ô; vật liệu trừ ngay, rồi thợ xây làm dần theo thứ tự khởi công. Công thừa dành cho đường đang làm." })}
      ${sec("", "Đã xong", doneHtml.length ? topN(doneHtml, 12, x => `<ul class="lines">${x.join("")}</ul>`) : `<p class="empty">Chưa có.</p>`, { fold: false, count: done.length })}
      ${sec("prof-catalog", "Có thể xây", catHtml, { count: cat.length || "" })}`;
  }
  function provinceList(n) {
    const help = "Mỗi trung tâm là một tỉnh: đất là các ô gần nó nhất, dân chia theo chỗ ở. Tỉnh bị cô lập, xa thủ đô mà không có bá tước, hay chật chỗ ở thì bất ổn dần; tới 50 nó làm cả nước bất mãn thêm, và khi cả nước bất mãn tới 100 thì tỉnh bất ổn nhất có thể đòi tách ra cùng đất đai.";
    return sec("", "Tỉnh", n.provinces.map(p => `<div class="card2 province">
      <div class="row"><b>${p.capital ? "★ " : ""}${p.tier ? `${TIER_ICON[p.tier]} ` : ""}${esc(p.name)}</b>${p.tier ? ` <span class="pill">${esc(p.tierName)}${p.focus ? ` · ${esc(p.focus)}` : ""}</span>` : ""}<button class="link" data-tile="${p.centre}" aria-label="Xem trên bản đồ">↗</button><span class="grow"></span><span class="meta" title="dân · chỗ ở · số ô">👥 ${p.people} · 🏠 ${p.housing} · 🗺 ${p.tiles}</span></div>
      <div class="row" title="Bất ổn của tỉnh 0–100${p.causes.length ? `: đang tăng vì ${esc(p.causes.join(", "))}` : ""}"><span class="meta">Bất ổn</span><span class="grow">${meter(p.mood, p.mood >= 50 ? "bad" : p.mood >= 25 ? "warn" : "good", `Bất ổn của tỉnh ${p.name}`)}</span><b class="mono ${p.mood >= 50 ? "bad" : ""}">${p.mood}</b></div>
      <div class="meta">${p.capital ? "Tỉnh thủ đô" : `${WAY[p.way] ?? "✗ cô lập"} · cách ${p.distance} ô`} · ${p.governor ? `bá tước ${esc(p.governor.name)} <span title="tay nghề · trung thành">(${p.governor.skill}★, ${p.governor.loyalty}${p.loyal ? "" : ", bỏ bê"})</span>` : `<span class="warn">không có bá tước</span>`}${p.causes.length ? ` · <span class="warn">▲ ${esc(p.causes.join(", "))}</span>` : ""}${p.next ? ` · ${esc(p.next)}` : ""}</div></div>`).join(""), { fold: false, count: n.provinces.length, help });
  }
  async function openNation(id) {
    const n = S.nations[id], d = $("#nation-dialog");
    const turns = await api(`/api/nation/${id}/turns?limit=5`).catch(() => []);
    const chipsOf = (list, cls = "") => list.length ? `<div class="chips ${cls}">${list.join("")}</div>` : `<p class="empty">—</p>`;
    const labor = Object.entries(n.labor).filter(([, v]) => v).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span>${esc(ROLE[k] ?? k)} <b>${v}</b></span>`);
    const stock = Object.entries(n.stock).filter(([, v]) => v >= 0.05).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span>${esc(RES[k] ?? k)} <b>${fmt1(v)}</b></span>`);
    const intel = Object.entries(n.intel || {}).map(([oid, it]) => `<div class="card2"><div class="row"><i class="sw" style="background:${esc(nationColor(+oid))}"></i><b>${esc(S.nations[oid]?.name)}</b><span class="grow"></span><span class="meta">mức ${it.level} · L${it.asOf}</span></div>${intelText(it.report)}</div>`).join("");
    const relations = Object.entries(n.relations || {}).filter(([, r]) => r !== "chưa biết");
    const threatsN = (n.threats || []).filter(t => t.level >= 2).length;
    const advice = n.advice || [], adviceHot = advice.some(a => a.level >= 3);
    const events = n.events || [], rejected = n.rejected || [];
    $("#nation-detail").innerHTML = `
      <div class="row dlg-top"><span class="flagbig"></span><div class="who"><h2>${esc(n.name)}</h2><div class="muted">${esc(n.people)} · thủ đô ${esc(n.capitalName)} · ${esc(modelLabel(n))}</div></div>${healthPills(n)}${statusPill(n)}<button id="dlg-close">Đóng</button></div>
      <div class="subtabs" data-key="nation">
        <nav class="seg"><button data-sub="overview">Tổng quan</button><button data-sub="court">Triều đình <span class="cnt">${(n.officials || []).length + (n.ministers || []).length || ""}</span></button>${(n.provinces || []).length > 1 ? `<button data-sub="provinces">Tỉnh <span class="cnt${n.provinces.some(p => p.mood >= 50) ? " hot" : ""}">${n.provinces.length}</span></button>` : ""}<button data-sub="build">Công trình <span class="cnt${(n.buildings || []).some(b => !b.done) ? " warmcnt" : ""}">${(n.buildings || []).length || ""}</span></button><button data-sub="economy">Kinh tế</button><button data-sub="threats">Đe dọa ${threatsN ? `<span class="cnt hot">${threatsN}</span>` : ""}</button><button data-sub="foreign">Đối ngoại <span class="cnt">${relations.length || ""}</span></button><button data-sub="log">Nhật ký AI</button></nav>
        <section data-sub="overview">
          ${keyTiles(n)}
          ${alertsOf(n)}
          ${n.alive && n.founded ? gauges(n) : ""}
          ${n.manifesto ? `<p class="quote clamp2" title="${esc(n.manifesto)}">“${esc(n.manifesto)}”</p>` : ""}
          <div class="ov">
            ${eraBlock(n)}
            ${treasuryBlock(n)}
            ${livingBlock(n)}
            ${prosperityBlock(n)}
            ${classesBlock(n)}
            ${pyramid(n)}
            ${n.alive && n.founded ? `<div class="card">${sec("", "Bất mãn", `<div class="row"><span class="grow">${meter(n.discontent, n.discontent >= 70 ? "bad" : n.discontent >= 40 ? "warn" : "good", "Bất mãn")}</span><b class="mono">${n.discontent}<span class="dim">/100</span></b></div>
              ${n.exodus && n.exodus.recent ? `<div class="alerts"><div class="${n.exodus.alarm ? "bad" : "warn"}" title="${esc(`${Object.entries(n.exodus.why).map(([w, k]) => `${k} vì ${w}`).join(", ")}${Object.keys(n.exodus.to).length ? ` · sang ${Object.entries(n.exodus.to).map(([o, k]) => `${o} ${k}`).join(", ")}` : ""}${n.exodus.alarm ? " · quá 3%: ổn định, uy tín và hạng đang giảm" : ""}`)}">🚶 ${n.exodus.recent} người bỏ đi / 10 lượt <span class="dim">${Math.round(n.exodus.share * 100)}%${n.exodus.lastTurn ? ` · ${n.exodus.lastTurn} lượt trước` : ""}</span></div></div>` : ""}`, { fold: false, help: "Tới 100 (khi có từ 60 dân) một phái sẽ xin bỏ đi lập quốc riêng; giảm khi ổn định ≥ 60." })}</div>` : ""}
            ${greatsBlock(n)}
            ${royalsBlock(n)}
            ${advice.length ? `<div class="card full">${sec("prof-advice", "Cố vấn", `<ul class="advice">${advice.map(a => `<li class="lv${a.level}">${esc(a.text)}</li>`).join("")}</ul>`, { count: advice.length, cls: adviceHot ? "hot" : "", help: "Lời khuyên engine gửi cho AI của nước này lượt này." })}</div>` : ""}
            <div class="card full">${sec("prof-last", "Lượt trước", `${n.thought ? `<p class="quote">“${esc(n.thought)}”</p>` : ""}${events.length ? `<ul class="lines flat">${events.map(e => `<li><span class="t wrap">${esc(e)}</span></li>`).join("")}</ul>` : `<p class="empty">Không có sự kiện.</p>`}${rejected.length ? `<h4 class="sec-h">Bị từ chối <span class="cnt hot">${rejected.length}</span></h4><ul class="lines flat">${rejected.map(r => `<li><span class="t wrap"><b>${esc(ACTION[r.action] ?? r.action)}</b>: ${esc(r.reason)}</span></li>`).join("")}</ul>` : ""}`, { count: events.length || "", aside: rejected.length ? `<span class="bad">${rejected.length} lệnh bị từ chối</span>` : n.idleStreak ? `<span class="warn">${n.idleStreak} lượt không ra lệnh</span>` : "" })}</div>
            ${n.recent?.length ? `<div class="card full">${sec("prof-recent", "Các lượt gần đây", `<ul class="lines flat">${n.recent.slice().reverse().map(r => `<li title="${esc(`Lệnh: ${r.orders.join(" · ") || "(không ra lệnh)"}`)}"><b class="mono">L${r.tick}</b><span class="t">${esc(r.orders.join(" · ") || "(không ra lệnh)")}</span><span class="r">👥${r.pop} · 🌾${r.food} · ⚖️${r.stab}</span></li>`).join("")}</ul>`, { count: n.recent.length, help: "AI của nước này thấy mục này mỗi lượt." })}</div>` : ""}
            <div class="card full">${sec("", "Đặc thù & trí tuệ", `${n.trait ? `<div><b>${esc(n.trait.icon)} ${esc(n.trait.name)}</b> ${tip(n.trait.desc)}<div class="chips" style="margin-top:6px">${n.trait.lines.map(x => `<span>${esc(x)}</span>`).join("")}</div></div>` : ""}
              ${n.provider === "claude" && n.alive ? `<div class="model-pick"><label class="sr-only" for="dlg-model">Model</label><select id="dlg-model"></select><label class="sr-only" for="dlg-effort">Effort</label><select id="dlg-effort"></select><button type="button" id="dlg-model-save">Lưu</button><span class="note" id="dlg-model-msg">Áp dụng từ lượt sau.</span></div>` : ""}
              ${[n.origin && `Ly khai từ <b>${esc(n.origin.fromName || "?")}</b> ở lượt ${n.origin.tick}, theo ${esc(n.origin.leader)}`, n.statusNote && `Ghi chú: ${esc(n.statusNote)}`, n.formerNames?.length && `Tên cũ: ${esc(n.formerNames.join(" → "))}`].filter(Boolean).map(x => `<div class="meta">${x}</div>`).join("")}`, { fold: false })}</div>
          </div>
        </section>
        <section data-sub="court">${courtList(n)}${ministerList(n)}</section>
        ${(n.provinces || []).length > 1 ? `<section data-sub="provinces">${provinceList(n)}</section>` : ""}
        <section data-sub="build">${buildList(n)}</section>
        <section data-sub="economy">
          ${sec("", "Lao động", chipsOf(labor), { fold: false, count: Object.values(n.labor).reduce((a, b) => a + b, 0) })}
          ${sec("", "Kho", topN(stock, 16, x => chipsOf(x)), { fold: false, count: stock.length })}
          ${resTable(n)}
          ${seaBlock(n)}
          ${n.market ? sec("prof-market", "Đặc sản & thị trường", marketChips(n.market), { open: true }) : ""}
          ${(n.settlements || []).length ? sec("", "Điểm định cư", chipsOf((n.settlements || []).map(x => { const l = n.links?.[x.tile]; return `<span class="${l ? "" : "bad"}">${esc(x.name)} ${({ road: "🛤", water: "⛵", walk: "🚶" })[l] ?? "✗"}</span>`; })), { fold: false, count: n.settlements.length, help: "🛤 nối bằng đường bộ · ⛵ đường thủy · 🚶 đi bộ · ✗ cô lập" }) : ""}
          ${n.roadNet ? sec("", "Đường sá", `<dl class="kvl"><dt>Ô đường nối các trung tâm</dt><dd>${n.roadNet.tiles} <span class="dim">(+${Math.min(10, Math.floor(n.roadNet.tiles / 4))} ô giới hạn)</span></dd><dt>Điểm định cư đã nối thủ đô</dt><dd>${n.roadNet.linked.length}/${(n.settlements || []).length}</dd><dt>Cấp tối đa</dt><dd>${esc(S.roadLevels[n.roadNet.level - 1].name)} / ${esc(S.roadLevels[n.roadNet.level - 1].lane)}</dd>${n.roadNet.works ? `<dt>Đang làm</dt><dd>${n.roadNet.works} ô</dd>` : ""}${n.waters ? `<dt>Lãnh hải</dt><dd>${n.waters} ô</dd>` : ""}</dl>`, { fold: false }) : ""}
          ${sec("prof-inv", "Phát minh", chipsOf(n.inventions.map(v => `<span>${esc(v.name)}</span>`)), { count: n.inventions.length })}
        </section>
        <section data-sub="threats">${threatDetails(n.threats || [], "Không có mối đe dọa nào.")}</section>
        <section data-sub="foreign">
          ${sec("", "Quan hệ", relations.length ? `<div class="chips">${relations.map(([oid, r]) => `<span class="rel ${relClass(r)}"><i class="sw" style="background:${esc(nationColor(+oid))}"></i>${esc(nm(oid))} · ${esc(r)}${S.nations[oid]?.health?.outbreak ? " · 🦠" : ""}${S.nations[oid]?.health?.quarantine ? " · 🚧" : ""}</span>`).join("")}</div>` : `<p class="empty">Chưa gặp ai.</p>`, { fold: false, count: relations.length || "" })}
          ${sec("", "Hộp thư lượt này", (n.inbox || []).map(m => `<div class="card2"><b>${esc(m.fromName)}${m.gesture ? " (cử chỉ)" : ""}</b><div>${esc(m.text)}</div></div>`).join("") || `<p class="empty">Trống.</p>`, { fold: false, count: (n.inbox || []).length || "", help: "Do nước khác viết." })}
          ${sec("", "Tình báo", intel || `<p class="empty">Chưa có tin tình báo.</p>`, { fold: false, count: Object.keys(n.intel || {}).length || "" })}
        </section>
        <section data-sub="log">
          <div class="chips"><span title="Số lần gọi AI">📞 ${n.stats.calls} lần gọi</span><span class="good">✓ ${n.stats.ok} hợp lệ</span><span class="${n.stats.invalid ? "bad" : ""}">✗ ${n.stats.invalid} sai</span><span class="${n.stats.asleepTicks ? "warn" : ""}">💤 ${n.stats.asleepTicks} lượt ngủ</span><span>🤐 ${n.stats.silentTicks} lượt im lặng</span></div>
          ${sec("prof-turns", "5 lượt gần nhất", turns.map(turnCard).join("") || `<p class="empty">—</p>`, { count: turns.length || "", open: true })}
          ${(n.annals || []).length ? sec("prof-annals", "Biên niên quốc gia", `<ol class="annals">${n.annals.slice().reverse().map(c => `<li><div class="row"><b>${esc(c.turns)}</b><span class="meta">👥 ${esc(c.people)} · 🌾 TB ${c.food_avg} · ⚖️ TB ${c.stability_avg} · 🗺 ${esc(c.tiles)}</span></div>${c.notable.length ? `<ul class="plain">${c.notable.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</li>`).join("")}</ol>`, { count: n.annals.length, help: "AI đọc mục này mỗi lượt." }) : ""}
          ${sec("prof-memory", "Bản ghi nhớ (AI tự viết)", `<pre>${esc(n.memory || "—")}</pre>`)}
        </section>
      </div>`;
    initSubtabs($("#nation-detail"));
    for (const b of $("#nation-detail").querySelectorAll(".province [data-tile], .bld [data-tile], .lines [data-tile]")) b.onclick = () => { d.close(); centerOn(Number(b.dataset.tile)); };
    for (const b of $("#nation-detail").querySelectorAll("[data-war]")) b.onclick = () => { const w = (S.wars || []).find(x => x.id === +b.dataset.war); if (w) { d.close(); goToWar(w); } };
    // §4.9 the Watcher grants or dismisses a minister
    const go = $("#nation-detail").querySelector("[data-grant-go]");
    if (go) go.onclick = async () => {
      const box = go.closest(".grant"), val = k => box.querySelector(`[data-grant=${k}]`).value;
      try { await api(`/api/nation/${id}/ministers/grant`, { method: "POST", body: { domain: val("domain"), model: val("model"), effort: val("effort") } }); box.querySelector("[data-grant-msg]").textContent = "Đã ban: nhậm chức từ lượt sau."; refresh(); }
      catch (e) { box.querySelector("[data-grant-msg]").textContent = e.message; }
    };
    // dismissing asks twice on the button itself (no browser dialog)
    for (const b of $("#nation-detail").querySelectorAll("button[data-dismiss-minister]")) b.onclick = async () => {
      if (!b.classList.contains("armed")) { b.classList.add("armed", "primary"); b.textContent = "Bấm lần nữa để bãi nhiệm"; setTimeout(() => { b.classList.remove("armed", "primary"); b.textContent = "Bãi nhiệm"; }, 4000); return; }
      try { await api(`/api/nation/${id}/ministers/${b.dataset.dismissMinister}/dismiss`, { method: "POST", body: { verdict: "" } }); d.close(); refresh(); }
      catch (e) { b.textContent = e.message; }
    };
    $("#nation-detail .flagbig").replaceWith(flagCanvas(n.flag, 54, 36));
    $("#dlg-close").onclick = () => d.close();
    if ($("#dlg-model")) {
      const opt = await setupInfo().catch(() => null);
      if (opt) {
        fillSelect($("#dlg-model"), opt.models.map(m => [m.id, m.label]), n.model);
        fillSelect($("#dlg-effort"), opt.efforts.map(e => [e, `effort ${e}`]), n.effort || "low");
      }
      $("#dlg-model-save").onclick = async () => {
        try { await api(`/api/nation/${id}/model`, { method: "POST", body: { model: $("#dlg-model").value, effort: $("#dlg-effort").value } }); $("#dlg-model-msg").textContent = "Đã lưu, áp dụng từ lượt sau."; refresh(); }
        catch (e) { $("#dlg-model-msg").textContent = e.message; }
      };
    }
    if (!d.open) d.showModal();
    d.scrollTop = 0;
  }

  // ---------------------------------------------------------------- the court (§4.6)
  const DOMAIN_ICON = { governor: "🏰", general: SWORD, agriculture: "🌾", scholar: "📜", merchant: "🪙", builder: "🔨", explorer: "🧭" };
  // ---------------------------------------------------------------- prosperity and pride (§4.7)
  const PROSP_PARTS = [["food", "Lương thực", "#c9a227"], ["goods", "Hàng hóa", "#3fb3cf"], ["room", "Chỗ ở", "#4cc283"], ["health", "Sức khỏe & yên bình", "#ff8f6b"]];
  // §4.11 the standard of living: each need of the people's era (and the next), met or not
  const ERA_NAMES = ["Đồ Đá Cũ", "Đồ Đá Mới", "Đồ Đồng", "Đồ Sắt", "Cổ Đại", "Trung Đại", "Cận Đại", "Công Nghiệp", "Hiện Đại", "Nguyên Tử"];
  // §4.12 great people
  const GREAT_ICON = { scholar: "📚", general: SWORD, merchant: "🪙", artisan: "🔨", prophet: "🔥", explorer: "🧭" };
  const ORDER_ICON = { farmers: "🌾", artisans: "🔨", merchants: "⚖️", clergy: "📜", officials: "🏛", soldiers: "🛡" };
  function eraBlock(n) {
    const pct = n.research ? pctOf(n.research.progress, n.research.cost) : 0;
    return `<div class="card">${sec("", "Kỷ nguyên", `<div class="big">${esc(n.era)}</div>
      ${n.nextEra ? `<div class="meta">Để sang <b>${esc(n.nextEra.era)}</b>${n.nextEra.missing.length ? " còn thiếu:" : ": đã đủ, sang ở lượt sau"}</div>${n.nextEra.missing.length ? `<div class="chips">${n.nextEra.missing.map(x => `<span class="warn">${esc(x)}</span>`).join("")}</div>` : ""}` : `<div class="meta">Kỷ nguyên cuối.</div>`}
      ${n.research ? `<div class="research"><span>📜</span><span class="t">${esc(n.research.name)}</span><span class="dim">${fmt(n.research.progress)}/${fmt(n.research.cost)} RP</span>${meter(pct, "", "Tiến độ nghiên cứu")}</div>` : ""}`, { fold: false })}</div>`;
  }
  function classesBlock(n) {
    const cs = n.classes || []; if (!cs.length) return "";
    return `<div class="card">${sec("", "Tầng lớp", `<ul class="orders">${cs.map(c => `<li title="${esc(`${c.size} người${c.because.length ? ` · ${c.because.join("; ")}` : ""}`)}"><span class="i">${ORDER_ICON[c.class] || "•"}</span><b>${esc(c.name)}</b>
      ${meter(c.mood, toneOf(c.mood, 70, 30))}<span class="mono">${c.mood}${c.heading_to !== c.mood ? `<span class="${c.heading_to > c.mood ? "good" : "bad"}">${c.heading_to > c.mood ? "↗" : "↘"}</span>` : ""}</span>${c.strike ? ` <span class="pill bad">đình công</span>` : ""}</li>`).join("")}</ul>`,
      { fold: false, help: "Hài lòng ≥ 70: làm việc tốt hơn 5%. Dưới 30: mất ổn định. Dưới 15: đình công. Rê chuột vào một tầng lớp để xem số người và họ muốn gì." })}</div>`;
  }
  function treasuryBlock(n) {
    const t = n.treasury; if (!t) return "";
    const pct = x => `${Math.round(x * 100)}%`;
    const book = (b, sign) => Object.entries(b || {}).sort((a, c) => c[1] - a[1]).map(([k, v]) => `<li><span>${esc(t.lines[k] || k)}</span><b class="mono ${sign > 0 ? "up" : "down"}">${sign > 0 ? "+" : "−"}${fmt1(v)}</b></li>`);
    const net = netOf(t);
    return `<div class="card">${sec("", "Ngân khố", `<div class="big">${fmt(t.coin)}<small class="${net > 0.05 ? "good" : net < -0.05 ? "bad" : "dim"}">${t.last ? `${signed(net)}/lượt` : ""}</small></div>
      <div class="chips"><span class="${t.tax > t.fair ? "bad" : ""}" title="Thuế sản xuất${t.tax > t.fair ? ": nặng, dân bất bình" : ""}">Thuế ${pct(t.tax)}</span><span title="Thuế quan và phí qua đất">Thuế quan ${pct(t.tariff)}</span>${t.coin > t.safe ? `<span class="bad" title="Kho quá ${fmt(t.safe)} tiền: đang thất thoát">Kho đầy</span>` : ""}</div>
      ${t.last ? `<div class="books"><div><h4>Thu</h4><ul>${book(t.last.in, 1).join("") || `<li class="muted">—</li>`}</ul></div><div><h4>Chi</h4><ul>${book(t.last.out, -1).join("") || `<li class="muted">—</li>`}</ul></div></div>` : ""}`, { fold: false })}</div>`;
  }
  function royalsBlock(n) {
    const r = n.royals; if (!r || !r.house) return "";
    const people = [...(r.unwed || []).map(x => `<li title="chưa thành hôn · sinh lượt ${x.born}"><span class="i">👑</span><span class="t">${esc(x.name)}</span><span class="r">L${x.born}</span></li>`),
      ...(r.married_in || []).map(x => `<li title="từ ${esc(x.from || "?")} về"><span class="i">💍</span><span class="t">${esc(x.name)}</span><span class="r">${esc(x.from || "?")}</span></li>`)];
    const laws = (r.in_laws || []).map(x => `<li title="${esc(`${x.bride} · tới lượt ${x.until} · biên giới dịu đi, không thuế quan`)}"><span class="i">🤝</span><span class="t">Thông gia ${esc(x.nation)}</span><span class="r">→L${x.until}</span></li>`);
    return `<div class="card">${sec("", `Hoàng tộc ${esc(r.house)}`, `<ul class="lines">${[...laws, ...people].join("") || `<li class="muted">Chưa có ai.</li>`}</ul>`, { fold: false, help: "Người trị vì là chính AI; hoàng tộc là họ hàng của triều đình, gả cưới để kết thông gia với nước khác." })}</div>`;
  }
  function greatsBlock(n) {
    const g = n.greats || []; if (!g.length) return "";
    return `<div class="card">${sec("", "Danh nhân", `<ul class="lines">${g.map(x => `<li title="${esc(`${x.gift} · từ lượt ${x.born}, phụng sự tới lượt ${x.dies}${x.fromName ? ` · mời từ ${x.fromName}` : ""}`)}"><span class="i">${GREAT_ICON[x.kind] || "⭐"}</span><span class="t">${esc(x.title)} ${esc(x.name)}</span><span class="r">→L${x.dies}</span></li>`).join("")}</ul>`, { fold: false, count: g.length })}</div>`;
  }
  function livingBlock(n) {
    const l = n.living; if (!l) return "";
    const miss = l.expected.filter(x => !x.met), met = l.expected.length - miss.length;
    return `<div class="card">${sec("", "Mức sống", `<div class="row"><span class="big ${toneOf(l.score, 75, 40)}">${l.score}</span><span class="grow">${meter(l.score, toneOf(l.score, 75, 40), "Mức sống")}</span><span class="dim">${met}/${l.expected.length} đủ</span></div>
      ${miss.length ? `<div class="chips">${miss.map(x => `<span class="bad" title="${esc(`${ERA_NAMES[x.era] || ""} · có ${x.have}, cần ${x.want}. Cách đáp ứng: ${x.how}`)}">✗ ${esc(x.name)}</span>`).join("")}</div>` : `<p class="empty">Đủ mọi nhu cầu.</p>`}
      ${sec("prof-needs", "Tất cả nhu cầu", `<ul class="needs">${l.expected.map(x => `<li class="${x.met ? "ok" : "no"}" title="${esc(x.met ? "" : `Cách đáp ứng: ${x.how}`)}"><span>${x.met ? "✓" : "✗"}</span><b>${esc(x.name)}</b><span class="meta">${esc(ERA_NAMES[x.era] || "")} · có ${esc(x.have)}${x.met ? "" : ` · cần ${esc(x.want)}`}</span></li>`).join("")}</ul>`)}`,
      { fold: false, help: "Mức sống cao: nghiên cứu nhanh hơn, dân yên. Thấp: bất mãn tăng. Từ thời Đồ Sắt, cổng kỷ nguyên cần mức sống tối thiểu." })}</div>`;
  }
  function prosperityBlock(n) {
    const p = n.prosperity;
    if (!p || !n.alive || !n.founded) return "";
    const mood = p.mood === "acclaim" ? `<span class="pill ok">dân tung hô</span>` : p.mood === "envy" ? `<span class="pill bad">dân ganh tị</span>` : "";
    const bar = `<div class="bar prosp" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.score}" aria-label="Thịnh vượng">${PROSP_PARTS.map(([k, h, c]) => `<i style="width:${p.parts[k]}%;background:${c}" title="${esc(`${h}: ${p.parts[k]}/25`)}"></i>`).join("")}</div>`;
    const legend = `<div class="legend-inline">${PROSP_PARTS.map(([k, h, c]) => `<span title="${esc(h)}"><i style="background:${c}"></i>${p.parts[k]}</span>`).join("")}</div>`;
    // this people against the nations it knows, most prosperous first
    const rows = [{ id: n.id, name: n.name, score: p.score, me: true }, ...(p.others || [])].sort((a, b) => b.score - a.score || a.id - b.id);
    const cmp = (p.others || []).length ? `<ul class="prosp-cmp">${rows.map(r => `<li${r.me ? ` class="me"` : ""}><span>${esc(r.name)}</span><div class="bar"><i style="width:${r.score}%"></i></div><b class="mono">${r.score}</b></li>`).join("")}</ul>` : "";
    const trend = (p.history || []).length > 1 ? p.history.slice(-6).join(" → ") : "";
    return `<div class="card">${sec("", "Thịnh vượng", `<div class="row"><span class="big">${p.score}</span>${mood}<span class="grow"></span>${p.rank ? `<span class="dim" title="Hạng trong các nước quen biết · trung bình của họ ${p.known ?? "—"}">hạng ${p.rank.rank}/${p.rank.of}</span>` : ""}</div>${bar}${legend}${cmp}${p.left ? `<div class="meta bad">Lượt trước ${p.left.k} người bỏ sang ${esc(nm(p.left.to))}</div>` : ""}`,
      { fold: false, help: `Dân so cuộc sống của mình với các nước quen biết: hơn trung bình thì tung hô triều đình, kém thì ganh tị và có nhà bỏ sang nước giàu hơn.${trend ? ` Gần đây: ${trend}.` : ""}` })}</div>`;
  }

  // a name that already carries its title is not given it twice
  const titled = (title, name) => { const t = String(title || ""), v = String(name || ""); return t && v.toLowerCase().startsWith(t.toLowerCase() + " ") ? v : `${t} ${v}`.trim(); };
  function courtList(n) {
    const c = n.officials || [];
    const body = c.length ? `<ul class="lines">${c.map(o => `<li title="${esc(`Lượt trước: ${o.lastAct}${o.seat !== null && o.seat !== undefined ? ` · giữ (${o.seat % ST.n}, ${(o.seat / ST.n) | 0})` : ""} · từ lượt ${o.since}`)}"><span class="i">${DOMAIN_ICON[o.domain] || "👤"}</span><span class="t"><b>${esc(titled(o.title, o.name))}</b> <span class="dim">· ${esc(o.lastAct)}</span></span><span class="r" title="tay nghề · trung thành">${"★".repeat(o.skill)}<span class="dim">${"☆".repeat(5 - o.skill)}</span> · <span class="${o.loyalty < 30 ? "bad" : o.loyalty < 50 ? "warn" : ""}">♥${o.loyalty}</span></span></li>`).join("")}</ul>` : `<p class="empty">Chưa bổ nhiệm ai.</p>`;
    return sec("", "Quan chức", body, { fold: false, count: `${c.length}/${n.courtSlots ?? 0}` });
  }

  // §4.9 AI ministers: one more mind per field, with its own AP
  const MINISTER_ICON = { economy: "⚒", war: SWORD, diplomacy: "🕊", learning: "📚", interior: "🏛" };
  function ministerList(n) {
    const c = n.ministers || [];
    const help = `Mỗi bộ trưởng là một trí tuệ AI riêng với ${n.ministerAp ?? 0} AP mỗi lượt.${n.ministerNext ? ` Ghế tiếp theo từ ${n.ministerNext} dân (đang có ${n.population}).` : ""} Quốc gia từ 500 dân tự xin (hiện trong Thỉnh nguyện), hoặc bạn ban thẳng ở đây (thêm ghế ở 1000, 2000, 4000 dân).`;
    // the Watcher may grant one unasked while a seat is free
    const f = n.ministerFree, models = [...(S.claudeModels || []).map(m => `<option value="${esc(m.id)}">Claude ${esc(m.label)}</option>`), `<option value="bot">Bot</option>`].join("");
    const grant = f?.seats > 0 && f.domains.length ? `<div class="grant row"><b>Ban (${f.seats} ghế trống):</b><select data-grant="domain">${f.domains.map(d => `<option value="${esc(d.id)}" title="${esc(d.desc)}">${esc(d.title)}</option>`).join("")}</select><select data-grant="model">${models}</select><select data-grant="effort">${(S.claudeEfforts || []).map(e => `<option${e === "low" ? " selected" : ""}>${esc(e)}</option>`).join("")}</select><button type="button" class="primary sm" data-grant-go>Ban</button><span class="meta" data-grant-msg></span></div>` : "";
    const list = c.length ? `<ul class="court">${c.map(m => `<li${m.lastThought ? ` title="${esc(`Suy nghĩ: “${m.lastThought}”`)}"` : ""}><span class="i">${MINISTER_ICON[m.domain] || "👤"}</span><div style="flex:1;min-width:0"><b>${esc(titled(m.title, m.name))}</b> <span class="muted">${esc(m.controller === "bot" ? "bot" : `Claude ${m.model}${m.effort ? ` · ${m.effort}` : ""}`)}</span>${m.until !== undefined ? ` <span class="pill ok" title="Thưởng sáng kiến">🎁 tới L${m.until}</span>` : ""}
      <div class="meta clamp2">${esc((m.lastOrders || []).join(" · ") || "chưa ra lệnh")}</div><div class="meta">từ L${m.since}${m.lastTick !== undefined ? ` · lệnh cuối L${m.lastTick}` : ""}</div></div>
      <button type="button" class="sm" data-dismiss-minister="${m.id}">Bãi nhiệm</button></li>`).join("")}</ul>` : `<p class="empty">Chưa có bộ trưởng nào.</p>`;
    return sec("", "Bộ trưởng AI", `${grant}${list}`, { fold: false, count: `${c.filter(m => m.until === undefined).length}/${n.ministerSeats ?? 0}`, help, aside: c.some(m => m.until !== undefined) ? "+1 trí tuệ thưởng" : "" });
  }

  // ---------------------------------------------------------------- threats and resources (§9.4)
  const LEVEL = ["ghi nhận", "để ý", "nghiêm trọng", "khẩn cấp"];
  function threatList(list, empty) { return threatLines(list, empty); }
  /** Threats one line each; open one to read what it means. */
  function threatDetails(list, empty) {
    if (!list.length) return `<p class="empty">${esc(empty)}</p>`;
    return `<div class="threats-d">${list.slice().sort((a, b) => b.level - a.level).map(t => `<details class="threat-d lv${t.level}"><summary><span>${THREAT_ICON[t.kind] || "⚠"}</span><span class="t">${esc(t.title)}</span><span class="pill ${LEVEL_CLS[t.level]}">${LEVEL[t.level]}</span></summary><p>${esc(t.detail)}</p></details>`).join("")}</div>`;
  }
  function resChips(n, limit = 14) {
    const lines = (n.resources?.territory || []).slice().sort((a, b) => b.left - a.left);
    if (!lines.length) return `<p class="empty">Không có.</p>`;
    return topN(lines.map(l => `<span class="${l.max && l.left / l.max < 0.15 ? "warn" : ""}" title="${esc(`${l.left}/${l.max}${l.regrows ? ", tái tạo dần" : ", không tái tạo"}${l.hidden ? "; AI của nước này chưa nhìn thấy" : ""}`)}">${esc(RES[l.key] ?? l.key)} <b>${fmt(l.left)}</b>${l.regrows ? " ↻" : ""}${l.hidden ? " 👁" : ""}</span>`), limit, x => `<div class="chips">${x.join("")}</div>`);
  }
  function resTable(n) {
    const r = n.resources; if (!r) return "";
    const near = Object.entries(r.nearest || {});
    return `${sec("", "Tài nguyên trên lãnh thổ", resChips(n), { fold: false, count: (r.territory || []).length || "", help: `↻ tái tạo dần · 👁 AI của nước này chưa thấy.${r.missing?.length ? ` Không có trên lãnh thổ: ${r.missing.join(", ")}.` : ""}` })}
      ${near.length ? sec("prof-near", "Ô vô chủ gần nhất", `<table class="res"><tr><th>Tài nguyên</th><th>Ô</th><th>Cách</th><th>Trữ lượng</th></tr>${near.map(([k, v]) => `<tr><td>${esc(RES[k] ?? k)}</td><td class="mono">${v.tile.join(", ")}</td><td class="mono">${v.dist} ô</td><td class="mono">${v.amount}</td></tr>`).join("")}</table>`, { count: near.length }) : ""}`;
  }
  /** §6.3 a nation on the market: what it is rich in, good at, short of, and has to spare. */
  function marketChips(m) {
    return `<div class="chips">${m.specialties.map(x => `<span class="good" title="${esc(`Đặc sản: ${Math.round(x.share * 100)}% trữ lượng các nước${x.veins ? ` · ${x.veins} mạch giàu` : ""}`)}">★ ${esc(x.name)}${x.veins ? ` ◆${x.veins}` : ""}</span>`).join("")}
      ${[...m.edge.inventions, ...m.edge.products].map(x => `<span title="Thế mạnh">💪 ${esc(x)}</span>`).join("")}
      ${m.shortages.map(x => `<span class="bad" title="${esc(`Thiếu: giá ở đây ${x.local}, thế giới ${x.world}`)}">− ${esc(x.name)}</span>`).join("")}
      ${m.surpluses.map(x => `<span class="dim" title="${esc(`Dư ${x.spare}, giá thế giới ${x.world}`)}">+ ${esc(x.name)} ${fmt(x.spare)}</span>`).join("")}</div>`;
  }
  $("#layer-kind").onchange = e => { layerKind = e.target.value; loadLayer(); };
  const animBox = $("#anim-on");
  animBox.checked = ANIM.on;
  animBox.onchange = () => { ANIM.on = animBox.checked; try { localStorage.setItem("sm-anim", ANIM.on ? "1" : "0"); } catch { } ensureAnim(); scheduleRender(); };
  $("#anim-replay").onclick = () => { const l = S?.lastFx; if (l?.fx?.length) playFx(l.fx); else $("#anim-replay").title = "Chưa có lượt nào để phát lại"; };

  // ---------------------------------------------------------------- an AI's reply, readable (the raw JSON stays one click away)
  const ACTION = {
    found_nation: "Lập quốc", research: "Nghiên cứu", build: "Xây", claim_tile: "Khai hoang", abandon_tile: "Bỏ ô", explore: "Thám hiểm", plant_spy: "Cài gián điệp",
    petition: "Thỉnh nguyện", propose_invention: "Đề xuất phát minh", found_settlement: "Lập điểm định cư", rename_nation: "Đổi tên", sabotage: "Phá hoại", steal_tech: "Đánh cắp công nghệ",
    incite: "Kích động", message: "Gửi tin", trade_offer: "Đề nghị trao đổi", accept_trade: "Nhận trao đổi", treaty: "Đề nghị hiệp ước", accept_treaty: "Nhận hiệp ước",
    break_treaty: "Phá ước", declare_war: "Tuyên chiến", declare_independence: "Tuyên bố độc lập", attack: "Tấn công", raid: "Đột kích", clear_wild: "Đánh man di",
    quarantine: "Cách ly", request_minister: "Xin bộ trưởng AI",
    appoint_official: "Bổ nhiệm quan", dismiss_official: "Bãi nhiệm quan", reward_official: "Ban thưởng quan", build_road: "Làm đường",
    family_policy: "Phong tục gia đình", accept_migrants: "Nhận dân di cư", rename: "Đổi tên địa danh", gift: "Tặng quà",
    mission: "Truyền giáo", festival: "Mở lễ hội",
  };
  // the values the AIs write in English, said in Vietnamese
  const WORD = {
    governor: "bá tước", general: "đại tướng", agriculture: "thượng thư nông", scholar: "đại học sĩ", merchant: "tổng quản thương", builder: "tổng công trình", explorer: "trưởng đoàn thám hiểm",
    economy: "kinh tế", war: "quân sự", diplomacy: "ngoại giao", learning: "học thuật", interior: "nội vụ",
    encourage: "khuyến khích sinh", neutral: "tự nhiên", limit: "hạn chế sinh", men: "chỉ đàn ông", all: "mọi người",
    non_aggression: "bất tương xâm", passage: "đi lại", alliance: "liên minh", peace: "hòa bình", tribute: "cống nạp", vassal: "chư hầu",
    me: "mình", them: "bên kia", home: "trong nước", on: "bật", off: "tắt", capital: "thủ đô", settlement: "điểm định cư", official: "quan chức",
    E: "Đông", W: "Tây", NE: "Đông Bắc", NW: "Tây Bắc", SE: "Đông Nam", SW: "Tây Nam",
  };
  const KEY = { tile: "ô", target: "nhắm", to: "gửi", warriors: "chiến binh", people: "người", direction: "hướng", from: "từ", invention: "phát minh", type_: "loại", building: "công trình", name: "tên", text: "nội dung", kind: "loại", duration: "thời hạn", offer: "đề nghị", give: "đưa", get: "nhận", horde: "bộ lạc", title: "tiêu đề", reason: "lý do", category: "loại", capital: "thủ đô", people_: "dân tộc", tribute: "cống phẩm", payer: "bên nộp",
    domain: "chức", seat: "trấn giữ", where: "nơi", priests: "nhà truyền giáo", luxury: "xa xỉ phẩm", official: "quan", path: "đường", level: "cấp", births: "sinh đẻ", fighters: "ra trận", what: "đổi", old: "tên cũ", treaty: "hiệp ước", accept: "nhận", faction: "phe", on: "bật", cede: "nhượng ô", gesture: "cử chỉ", good: "hàng", amount: "số lượng", qty: "số lượng", answer: "trả lời" };
  const isXY = v => Array.isArray(v) && v.length === 2 && v.every(x => typeof x === "number");
  function val(v, k) {
    if (isXY(v)) return `(${v[0]}, ${v[1]})`;
    if (Array.isArray(v)) return v.every(isXY) ? v.map(x => val(x)).join(" → ") : v.map(x => val(x)).join(", "); // a road: its tiles in order
    if (v && typeof v === "object") return Object.entries(v).map(([g, q]) => typeof q === "number" ? `${q} ${RES[g] ?? g}` : `${KEY[g] ?? g}: ${val(q)}`).join(", ");
    if (typeof v === "boolean") return v ? "có" : "không";
    if (k === "people" && typeof v === "string") return v; // a people's name
    return WORD[v] ?? RES[v] ?? String(v);
  }
  function actionLine(a) {
    if (!a || typeof a !== "object") return esc(String(a));
    if (a.type === "propose_invention") return `<b>${ACTION[a.type]}</b> “${esc(a.name)}”: ${esc(a.description || "")}${effectList(Array.isArray(a.effects) ? a.effects : [])}`;
    const rest = Object.entries(a).filter(([k]) => k !== "type" && k !== "flag" && k !== "manifesto").map(([k, v]) => `${KEY[k] ?? k} ${esc(val(v, k))}`).join(" · ");
    return `<b>${esc(ACTION[a.type] ?? a.type)}</b>${rest ? ` — ${rest}` : ""}`;
  }
  function parseReply(raw) {
    const s = String(raw || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/g, "");
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    try { return a >= 0 && b > a ? JSON.parse(s.slice(a, b + 1)) : null; } catch { return null; }
  }
  const KIND = { ok: ["hợp lệ", "ok"], invalid: ["sai định dạng", "bad"], ratelimit: ["hết giới hạn", "warn"], auth: ["lỗi đăng nhập", "bad"], timeout: ["quá giờ", "warn"], error: ["lỗi", "bad"], bot: ["bot", ""] };
  function turnCard(t) {
    const r = parseReply(t.raw), [kw, kc] = KIND[t.kind] || [t.kind, ""];
    const labor = r?.labor ? Object.entries(r.labor).filter(([, v]) => v).map(([k, v]) => `${ROLE[k] ?? k} ${v}`).join(", ") : "";
    const crafts = r?.crafts ? Object.entries(r.crafts).filter(([, v]) => v).map(([k, v]) => `${RES[k] ?? k} ×${v}`).join(", ") : "";
    const acts = Array.isArray(r?.actions) ? r.actions : [];
    return `<div class="card2 turn"><div class="row"><b>Lượt ${t.tick}</b><span class="pill ${kc}">${esc(kw)}</span><span class="meta">${(t.latency_ms / 1000).toFixed(1)} giây${t.model ? ` · ${esc(t.model)}` : ""}</span></div>
      ${t.error ? `<div class="meta">${esc(t.error)}</div>` : ""}
      ${r ? `${r.thought ? `<p class="thought">“${esc(r.thought)}”</p>` : ""}
        ${labor ? `<div class="meta">Lao động: ${esc(labor)}</div>` : ""}${crafts ? `<div class="meta">Chế tác: ${esc(crafts)}</div>` : ""}
        ${acts.length ? `<ol class="acts">${acts.map(a => `<li>${actionLine(a)}</li>`).join("")}</ol>` : `<div class="meta">Không có hành động.</div>`}
        ${r.memory ? `<details><summary class="meta">Bản ghi nhớ AI tự viết</summary><pre>${esc(r.memory)}</pre></details>` : ""}` : ""}
      ${t.raw ? `<details><summary class="meta">Xem nguyên văn</summary><pre>${esc(t.raw.slice(0, 4000))}</pre></details>` : ""}</div>`;
  }
  const INTEL = { name: "tên", people: "dân tộc", capital: "thủ đô", size: "quy mô", reputation: "uy tín", population: "dân số", population_est: "dân số ước", warriors_est: "chiến binh ước", stability: "ổn định", era: "kỷ nguyên", inventions: "phát minh", visible_inventions: "phát minh thấy được", stock: "kho", food: "lương thực", tiles: "số ô", tiles_count: "số ô", buildings_seen: "công trình thấy được" };
  function intelText(rep) {
    if (!rep) return `<p class="empty">—</p>`;
    // the long lists (inventions seen, stock) fold to their first words; the whole line is in the tooltip
    return `<dl class="intel">${Object.entries(rep).filter(([k, v]) => v !== undefined && !["flag", "tiles_seen", "name"].includes(k)).map(([k, v]) => { const s = Array.isArray(v) ? v.join(", ") : val(v); return `<dt>${esc(INTEL[k] ?? k)}</dt><dd class="clamp2" title="${esc(s)}">${esc(s)}</dd>`; }).join("")}</dl>`;
  }

  // ---------------------------------------------------------------- new world (§2.4)
  let setupCache = null, setupAsked = false;
  const setupInfo = async () => setupCache ??= await api("/api/setup");
  function fillSelect(sel, pairs, value) {
    sel.replaceChildren(...pairs.map(([v, t]) => new Option(t, v)));
    if (value !== undefined) sel.value = value;
  }
  async function openSetup() {
    setupCache = null;
    let o; try { o = await setupInfo(); } catch (e) { console.error("[setup]", e); return; }
    const d = $("#setup-dialog"), rows = $("#setup-rows");
    $("#setup-claude").textContent = o.claude.loggedIn ? "" : "Claude chưa đăng nhập: các quốc gia sẽ chờ đến khi bạn đăng nhập ở khung Chat Claude.";
    $("#setup-seed").value = `nguyen-dia-${Math.random().toString(36).slice(2, 7)}`;
    fillSelect($("#setup-count"), [2, 3, 4, 5, 6, 7, 8].map(k => [k, `${k} quốc gia`]), Math.min(8, Math.max(2, o.nations || 6)));
    $("#setup-tick").value = [600, 1200, 1800, 3600].includes(o.tickSeconds) ? o.tickSeconds : 1200;
    const traitPairs = [["", "🎲 Ngẫu nhiên"], ...o.traits.map(t => [t.id, `${t.icon} ${t.name}`])];
    const byId = Object.fromEntries(o.traits.map(t => [t.id, t]));
    const keep = [...rows.querySelectorAll("li")].map(li => ({ trait: li.querySelector(".t").value, model: li.querySelector(".m").value, effort: li.querySelector(".e").value }));
    const describe = li => { const t = byId[li.querySelector(".t").value]; li.querySelector(".lines").textContent = t ? `${t.desc} ${t.lines.join(" · ")}` : "Một đặc thù chưa ai chọn, rút ngẫu nhiên khi bắt đầu."; };
    const cost = () => {
      const r = [...rows.querySelectorAll("li")], son = r.filter(li => li.querySelector(".m").value === "sonnet").length;
      const hi = r.filter(li => ["high", "xhigh", "max"].includes(li.querySelector(".e").value)).length;
      $("#setup-cost").textContent = `${r.length} lệnh Claude mỗi lượt${son ? `, ${son} Sonnet` : ""}${hi ? `, ${hi} effort cao` : ""}: Sonnet và effort cao tốn giới hạn gói nhiều hơn.`;
    };
    const build = () => {
      const n = +$("#setup-count").value;
      rows.replaceChildren(...Array.from({ length: n }, (_, k) => {
        const li = document.createElement("li"), prev = keep[k] || {};
        li.innerHTML = `<div class="pick"><span class="num">${k + 1}</span>
          <select class="t" aria-label="Đặc thù quốc gia ${k + 1}"></select><select class="m" aria-label="Model quốc gia ${k + 1}"></select><select class="e" aria-label="Effort quốc gia ${k + 1}"></select></div><div class="lines"></div>`;
        fillSelect(li.querySelector(".t"), traitPairs, prev.trait ?? "");
        fillSelect(li.querySelector(".m"), o.models.map(m => [m.id, m.label]), prev.model ?? "haiku");
        fillSelect(li.querySelector(".e"), o.efforts.map(e => [e, `effort ${e}`]), prev.effort ?? "low");
        li.querySelector(".t").onchange = () => { describe(li); keep[k] = { ...keep[k], trait: li.querySelector(".t").value }; };
        li.querySelector(".m").onchange = li.querySelector(".e").onchange = () => { keep[k] = { trait: li.querySelector(".t").value, model: li.querySelector(".m").value, effort: li.querySelector(".e").value }; cost(); };
        describe(li);
        return li;
      }));
      cost();
    };
    $("#setup-count").onchange = build;
    $("#setup-random").onclick = () => {
      const ids = o.traits.map(t => t.id).sort(() => Math.random() - 0.5);
      rows.querySelectorAll("li").forEach((li, k) => { li.querySelector(".t").value = ids[k % ids.length]; describe(li); keep[k] = { ...keep[k], trait: ids[k % ids.length] }; });
    };
    $("#setup-all-haiku").onclick = () => { rows.querySelectorAll("li").forEach((li, k) => { li.querySelector(".m").value = "haiku"; li.querySelector(".e").value = "low"; keep[k] = { ...keep[k], model: "haiku", effort: "low" }; }); cost(); };
    $("#setup-close").onclick = () => d.close();
    $("#setup-msg").textContent = "";
    build();
    d.showModal();
  }
  $("#btn-new-world").onclick = openSetup;
  $("#setup-form").addEventListener("submit", async ev => {
    ev.preventDefault();
    const nations = [...$("#setup-rows").querySelectorAll("li")].map(li => ({ trait: li.querySelector(".t").value, model: li.querySelector(".m").value, effort: li.querySelector(".e").value }));
    const chosen = nations.map(x => x.trait).filter(Boolean);
    if (new Set(chosen).size !== chosen.length) { $("#setup-msg").textContent = "Mỗi đặc thù chỉ dùng cho một quốc gia."; return; }
    $("#setup-go").disabled = true; $("#setup-msg").textContent = "Đang chờ lượt hiện tại xong rồi tạo thế giới…";
    try { await api("/api/world/new", { method: "POST", body: { seed: $("#setup-seed").value.trim(), tickSeconds: +$("#setup-tick").value, nations } }); location.reload(); }
    catch (e) { $("#setup-msg").textContent = e.message; $("#setup-go").disabled = false; }
  });

  // ---------------------------------------------------------------- chronicle
  const chron = $("#chronicle");
  // §10 chronicle filters: each kind belongs to one group
  const CHRON_GROUP = {
    war: "war", battle: "war", fall: "war", raid: "war", horde: "war", spy: "war", deceit: "war",
    invention: "invent", proposal: "invent", lost: "invent", era: "invent", gate: "invent",
    event: "disaster", famine: "disaster", beasts: "disaster",
    road: "nation", quarantine: "diplo", treaty: "diplo", trade: "diplo", contact: "diplo", petition: "diplo", decree: "diplo",
  };
  function addChronicle(items, prepend = true) {
    for (const c of items) {
      const li = document.createElement("li"); li.className = `k-${c.kind}`; li.dataset.g = CHRON_GROUP[c.kind] || "nation";
      li.innerHTML = `<span class="t">${c.tick}</span><span class="x"></span>`; li.querySelector(".x").textContent = c.text;
      prepend ? chron.prepend(li) : chron.append(li);
    }
    while (chron.children.length > 400) chron.lastChild.remove();
  }

  // The Historian's chapters (§10.1), newest first; only the newest starts open.
  const hist = $("#history");
  function addChapters(list, prepend = true) {
    for (const c of list) {
      if (hist.querySelector(`[data-id="${c.id}"]`)) continue;
      hist.querySelector(".note")?.remove();
      const d = document.createElement("details"); d.className = "card2"; d.dataset.id = c.id;
      d.innerHTML = `<summary><b></b> <span class="meta"></span></summary><p style="margin:6px 0 0;white-space:pre-wrap"></p>`;
      d.querySelector("b").textContent = c.title;
      d.querySelector(".meta").textContent = `lượt ${c.from_tick}–${c.to_tick} · năm ${c.from_tick * 10}–${(c.to_tick + 1) * 10} · ${c.author}`;
      d.querySelector("p").textContent = c.text;
      d.open = prepend || !hist.children.length;
      prepend ? hist.prepend(d) : hist.append(d);
    }
    setCount("chronicle", "history", hist.querySelectorAll("details").length);
  }
  api("/api/history").then(list => addChapters(list, false)).catch(() => {});

  // ---------------------------------------------------------------- petitions & decrees
  const PSTATUS = { pending: ["Đang chờ", "warn"], accepted: ["Chấp thuận", "ok"], partial: ["Một phần", "ok"], rejected: ["Bác bỏ", "bad"], merged: ["Đã gộp", ""] };
  // §4.5 factions that want to leave: the Watcher lets them go and gives the new nation a mind
  const SSTATUS = { pending: ["Xin ra đi", "warn"], approved: ["Đã cho phép, đi ở lượt sau", "ok"], done: ["Đã lập quốc", "ok"], refused: ["Không cho đi", "bad"], expired: ["Hết hạn", ""], asking: ["Đang xin định cư nước khác", "warn"], emigrated: ["Đã sang nước khác", ""], returned: ["Quay về nước cũ", "bad"] };
  /** Waiting items stay on top as cards; decided ones fold away under one header. */
  function splitDecided(box, key, title, waiting, decided) {
    box.replaceChildren(...waiting);
    if (!decided.length) return;
    const d = document.createElement("details"); d.className = "sec"; d.dataset.sec = key;
    d.open = !!SEC_OPEN[key];
    d.innerHTML = `<summary>${esc(title)} <span class="cnt">${decided.length}</span></summary>`;
    const list = document.createElement("div"); list.style.cssText = "display:grid;gap:8px";
    list.append(...decided); d.append(list); box.append(d);
  }
  const mindOptions = () => [...(S.claudeModels || []).map(m => `<option value="${esc(m.id)}">Claude ${esc(m.label)}</option>`), `<option value="bot">Bot (không tốn lượt Claude)</option>`].join("");
  const effortOptions = () => (S.claudeEfforts || []).map(e => `<option value="${esc(e)}"${e === "low" ? " selected" : ""}>${esc(e)}</option>`).join("");
  const nationTag = id => { const n = S.nations[id]; return n ? `<i class="sw" style="background:${esc(nationColor(id))}"></i>${esc(nationName(n))}` : "?"; };
  function renderSchisms() {
    const box = $("#schisms"), list = (S.schisms || []).slice().sort((a, b) => b.id - a.id);
    const cards = list.map(x => {
      const [st, cls] = SSTATUS[x.status] || [x.status, ""], pending = x.status === "pending";
      const el = document.createElement("article"); el.className = "petition schism";
      el.innerHTML = `<div class="row"><h3></h3><span class="grow"></span><span class="pill ${cls}">${st}</span></div>
        <div class="meta">✊ #${x.id} · từ ${nationTag(x.from)} · L${x.tick} · <b>${x.people}</b> người (~${Math.round(x.share * 100)}%) · ${x.province !== undefined ? `tỉnh ${esc(x.provinceName || "?")}` : "đất mới"} <button class="link" data-act="site" title="Xem trên bản đồ">(${x.site % 128}, ${(x.site / 128) | 0}) ↗</button>${pending ? ` · <span class="warn">còn ${x.waitLeft} lượt</span>` : ""}</div>
        <div class="body"></div>
        ${pending ? `<div class="row"><label class="sr-only" for="sch-model-${x.id}">Model</label><select id="sch-model-${x.id}">${mindOptions()}</select><label class="sr-only" for="sch-effort-${x.id}">Effort</label><select id="sch-effort-${x.id}">${effortOptions()}</select>${tip(`${x.province !== undefined ? "Nếu cho phép, tỉnh tách khỏi nước cũ cùng điểm định cư, đất đai và công trình của tỉnh, người sống ở đó, phần kho tương ứng và mọi phát minh, rồi tự đặt tên, cờ ở lượt đầu." : "Nếu cho phép, họ mang theo gia đình, phần kho tương ứng và mọi phát minh của nước cũ, rồi tự đặt tên, cờ ở lượt đầu."} Nếu không, họ sẽ xin sang định cư ở một nước quen biết, hoặc quay về trong uất ức. Chọn trí tuệ cho quốc gia mới.`)}</div>
        <textarea rows="1" placeholder="Lời phán (gửi cho nước cũ, tùy chọn)"></textarea>
        <div class="actions"><button data-s="approved" class="primary sm">Cho lập quốc</button><button data-s="refused" class="sm">Không cho đi</button></div>`
        : `<div class="meta">${x.toName ? `${x.status === "emigrated" ? "Đã sang" : x.status === "asking" ? "Đang xin sang" : "Đã xin sang"} <b>${esc(x.toName)}</b> · ` : ""}${x.nationName ? `Thành <b>${esc(x.nationName)}</b> · ` : ""}${x.model ? `${esc(x.model === "bot" ? "bot" : `Claude ${x.model} · ${x.effort}`)} · ` : ""}⚖️ ${esc(x.verdict || "—")}</div>`}`;
      el.querySelector("h3").textContent = `Phái ${x.leader} xin lập quốc`;
      el.querySelector(".body").textContent = `Bất mãn vì ${x.grievance}.`;
      el.querySelector("[data-act=site]").onclick = () => centerOn(x.site);
      const model = el.querySelector("select[id^=sch-model]"), effort = el.querySelector("select[id^=sch-effort]");
      if (model) model.onchange = () => { effort.disabled = model.value === "bot"; };
      for (const b of el.querySelectorAll("button[data-s]")) b.onclick = async () => {
        await api(`/api/schisms/${x.id}`, { method: "POST", body: { status: b.dataset.s, model: model.value, effort: effort.value, verdict: el.querySelector("textarea").value } }).catch(e => alertMsg(e.message));
        refresh();
      };
      return [pending, el];
    });
    splitDecided(box, "pet-schisms", "Ly khai đã quyết", cards.filter(c => c[0]).map(c => c[1]), cards.filter(c => !c[0]).map(c => c[1]));
  }
  // §4.9 a nation asks for an AI minister: the Watcher grants it a mind (Claude model and effort, or the bot), or refuses
  const MSTATUS = { pending: ["Xin bộ trưởng", "warn"], approved: ["Đã ban, nhậm chức lượt sau", "ok"], done: ["Đang tại chức", "ok"], refused: ["Không ban", "bad"], expired: ["Hết hạn", ""], ended: ["Đã thôi chức", ""] };
  function renderMinisterRequests() {
    const box = $("#minister-requests"); if (!box) return;
    const list = (S.ministerRequests || []).slice().sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || b.id - a.id).slice(0, 30);
    const cards = list.map(x => {
      const [st, cls] = MSTATUS[x.status] || [x.status, ""], from = S.nations[x.nation], pending = x.status === "pending";
      const el = document.createElement("article"); el.className = "petition minister";
      el.innerHTML = `<div class="row"><h3></h3><span class="grow"></span><span class="pill ${cls}">${st}</span></div>
        <div class="meta">🎓 #${x.id} · ${nationTag(x.nation)} · L${x.tick} · <span title="Dân lúc xin → nay">👥 ${x.population} → ${x.populationNow}</span> · ${x.seats} ghế${pending ? ` · <span class="warn">còn ${x.waitLeft} lượt</span>` : ""}</div>
        <div class="body"></div>
        ${pending ? `<div class="row"><label class="sr-only" for="min-model-${x.id}">Model</label><select id="min-model-${x.id}">${mindOptions()}</select><label class="sr-only" for="min-effort-${x.id}">Effort</label><select id="min-effort-${x.id}">${effortOptions()}</select>${tip(`Nếu ban, từ lượt sau một trí tuệ AI riêng lo ${x.desc} cho quốc gia này mỗi lượt, với AP riêng, theo chỉ dẫn của người trị vì. Mỗi bộ trưởng Claude tốn thêm một lượt gọi Claude mỗi lượt chơi.`)}</div>
        <textarea rows="1" placeholder="Lời các vị thần (tùy chọn)"></textarea>
        <div class="actions"><button data-s="approved" class="primary sm">Ban bộ trưởng</button><button data-s="refused" class="sm">Không ban</button></div>`
        : `<div class="meta">${x.model ? `${esc(x.model === "bot" ? "bot" : `Claude ${x.model} · ${x.effort}`)} · ` : ""}⚖️ ${esc(x.verdict || "—")}</div>`}`;
      el.querySelector("h3").textContent = `${from ? nationName(from) : "?"} xin ${x.title}`;
      el.querySelector(".body").textContent = x.reason || "";
      el.querySelector(".body").hidden = !x.reason;
      const model = el.querySelector("select[id^=min-model]"), effort = el.querySelector("select[id^=min-effort]");
      if (model) model.onchange = () => { effort.disabled = model.value === "bot"; };
      for (const b of el.querySelectorAll("button[data-s]")) b.onclick = async () => {
        await api(`/api/ministers/requests/${x.id}`, { method: "POST", body: { status: b.dataset.s, model: model.value, effort: effort.value, verdict: el.querySelector("textarea").value } }).catch(e => alertMsg(e.message));
        refresh();
      };
      return [pending, el];
    });
    splitDecided(box, "pet-ministers", "Đơn bộ trưởng đã quyết", cards.filter(c => c[0]).map(c => c[1]), cards.filter(c => !c[0]).map(c => c[1]));
  }
  // §10.5 the book of initiatives: waiting, taken up, built into the world
  const IDEA_STATE = p => p.implemented ? ["đã vào game", "ok"] : p.status === "accepted" || p.status === "partial" ? [p.status === "partial" ? "duyệt một phần" : "đã duyệt", "warn"] : p.status === "pending" ? ["chờ trọng tài", ""] : [PSTATUS[p.status]?.[0] ?? p.status, "bad"];
  const REWARD_TEXT = "Chấp thuận: nước gửi được một trí tuệ AI (bộ trưởng) trong 10 lượt, +10 uy tín, +5 ổn định, nghiên cứu +25%. Một phần: trí tuệ 5 lượt, +5, +2, +10%. Thưởng một lần.";
  function ideaCard(p) {
    const [st, cls] = IDEA_STATE(p), todo = (p.status === "accepted" || p.status === "partial") && !p.implemented;
    return `<article class="petition idea">
      <div class="row"><b>${esc(p.title)}</b><span class="pill">${esc(p.kind || "khác")}</span><span class="grow"></span><span class="pill ${cls}">${esc(st)}</span></div>
      <div class="meta">${nationTag(p.nation)} · L${p.tick} · #${p.id}${p.implemented ? ` · vào game L${p.implemented}${p.implementedNote ? `: ${esc(p.implementedNote)}` : ""}` : ""}</div>
      <div class="body clamp3" data-expand title="Bấm để đọc hết">${esc(p.text)}</div>${p.reason ? `<div class="meta clamp2" title="${esc(p.reason)}">Lý do: ${esc(p.reason)}</div>` : ""}
      ${p.verdict ? `<div class="verdict"><b>${p.judge ? `⚖️ ${esc(p.judge)}` : "⚖️ Các vị thần"}:</b> ${esc(p.verdict)}</div>` : ""}
      ${p.status === "pending" ? `<div class="meta">⚖️ Trọng tài Claude sẽ phán ở lượt tới.</div><details class="override"><summary>Tự quyết thay trọng tài</summary><textarea rows="2" placeholder="Lời phán của các vị thần (gửi lại cho quốc gia này)" data-verdict="${p.id}"></textarea>
      <div class="actions"><button type="button" class="primary sm" data-decide="${p.id}" data-s="accepted">Chấp thuận</button><button type="button" class="sm" data-decide="${p.id}" data-s="partial">Một phần</button><button type="button" class="sm" data-decide="${p.id}" data-s="rejected">Bác bỏ</button>${tip(`${REWARD_TEXT}${p.mind ? ` Trí tuệ họ xin: ${p.mind}.` : ""}`)}</div></details>` : ""}
      ${todo ? `<div class="row"><input type="text" placeholder="Ghi chú (ví dụ: bản 0.30)" data-note="${p.id}"><button type="button" class="primary sm" data-built="${p.id}">✅ Đã đưa vào game</button></div>` : ""}
      ${p.implemented && !p.honoured ? `<div class="row"><button type="button" class="sm" data-unbuilt="${p.id}">Hoàn tác</button><span class="meta">nước gửi được vinh danh ở lượt sau</span></div>` : ""}
    </article>`;
  }
  function renderIdeas() {
    const ideas = (S.petitions || []).filter(p => p.category === "sáng kiến").slice().sort((a, b) => b.id - a.id);
    const todo = ideas.filter(p => !p.implemented && (p.status === "accepted" || p.status === "partial")), waiting = ideas.filter(p => p.status === "pending");
    const built = ideas.filter(p => p.implemented), refused = ideas.filter(p => !p.implemented && (p.status === "rejected" || p.status === "merged"));
    setCount("petitions", "ideas", todo.length || "");
    $("#ideas-pipeline").innerHTML = ideas.length ? `<div class="chips"><span title="Trọng tài Claude sẽ phán">⏳ chờ trọng tài <b>${waiting.length}</b></span>›<span class="${todo.length ? "warn" : ""}" title="Đã duyệt, chờ bạn xây vào game">🛠 chờ làm <b>${todo.length}</b></span>›<span class="good">🎮 trong game <b>${built.length}</b></span>${refused.length ? `<span class="dim">✗ bác ${refused.length}</span>` : ""}</div>` : "";
    $("#ideas").innerHTML = ideas.length ? [
      todo.length ? sec("", "Chờ đưa vào game", todo.map(ideaCard).join(""), { fold: false, count: todo.length, cls: "warm" }) : "",
      waiting.length ? sec("ideas-wait", "Chờ trọng tài", waiting.map(ideaCard).join(""), { count: waiting.length, open: true }) : "",
      built.length ? sec("ideas-built", "Đã đưa vào game", built.map(ideaCard).join(""), { count: built.length }) : "",
      refused.length ? sec("ideas-refused", "Bác bỏ", refused.map(ideaCard).join(""), { count: refused.length }) : "",
    ].join("") : `<p class="empty">Chưa có sáng kiến nào. ${tip("Các AI được nhắc gửi sáng kiến (thỉnh nguyện loại “sáng kiến”, miễn phí) và được thưởng một trí tuệ AI khi được chấp thuận.")}</p>`;
    for (const b of document.querySelectorAll("#ideas [data-expand]")) b.onclick = () => b.classList.toggle("clamp3");
    for (const b of document.querySelectorAll("#ideas [data-built]")) b.onclick = async () => { const note = document.querySelector(`#ideas [data-note="${b.dataset.built}"]`)?.value || ""; await api(`/api/petitions/${b.dataset.built}/implemented`, { method: "POST", body: { done: true, note } }).catch(e => alertMsg(e.message)); refresh(); };
    for (const b of document.querySelectorAll("#ideas [data-decide]")) b.onclick = async () => {
      const verdict = document.querySelector(`#ideas [data-verdict="${b.dataset.decide}"]`)?.value || "";
      await api(`/api/petitions/${b.dataset.decide}`, { method: "POST", body: { status: b.dataset.s, verdict } }).catch(e => alertMsg(e.message)); refresh();
    };
    for (const b of document.querySelectorAll("#ideas [data-unbuilt]")) b.onclick = async () => { await api(`/api/petitions/${b.dataset.unbuilt}/implemented`, { method: "POST", body: { done: false } }).catch(e => alertMsg(e.message)); refresh(); };
  }
  $("#ideas-export").onclick = () => {
    const todo = (S.petitions || []).filter(p => p.category === "sáng kiến" && (p.status === "accepted" || p.status === "partial") && !p.implemented);
    const text = todo.length ? `Các sáng kiến của các quốc gia đã được duyệt, cần xây vào Sovereign Minds (mỗi cái: làm luật trong engine, cho AI biết, hiện trên UI, viết test, cập nhật docs/RULES.md và CHANGELOG):\n\n${todo.map(p => `- #${p.id} [${p.kind || "khác"}] ${p.title} (của ${S.nations[p.nation]?.name ?? "?"}${p.status === "partial" ? ", chấp thuận một phần" : ""})\n  Nội dung: ${p.text}\n  Lý do: ${p.reason || "—"}${p.verdict ? `\n  Lời phán của Watcher: ${p.verdict}` : ""}`).join("\n")}\n\nXong cái nào, tôi sẽ bấm "Đã đưa vào game" cho cái đó trong Sổ sáng kiến.` : "";
    const ta = $("#ideas-export-text"); ta.hidden = !text; ta.value = text;
    if (text) { ta.select(); navigator.clipboard?.writeText(text).then(() => { $("#ideas-export-msg").textContent = `Đã chép ${todo.length} sáng kiến.`; }, () => { $("#ideas-export-msg").textContent = "Chọn và chép đoạn bên dưới."; }); }
    else $("#ideas-export-msg").textContent = "Không có sáng kiến nào chờ làm.";
  };
  function renderPetitions() {
    renderSchisms();
    renderMinisterRequests();
    const list = S.petitions.slice().sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || b.id - a.id);
    const pending = list.filter(p => p.status === "pending" && p.category !== "sáng kiến").length + // the Judge of Ideas rules on initiatives
      (S.schisms || []).filter(x => x.status === "pending").length + (S.ministerRequests || []).filter(x => x.status === "pending").length, badge = $("#pet-count");
    badge.hidden = !pending; badge.textContent = pending;
    const box = $("#petitions");
    const cards = list.map(p => {
      const [st, cls] = PSTATUS[p.status], open = p.status === "pending";
      const el = document.createElement("article"); el.className = "petition";
      el.innerHTML = `<div class="row"><h3></h3>${p.category === "sáng kiến" ? `<span class="pill ok">💡</span>` : ""}<span class="grow"></span>${p.rewarded ? `<span class="pill ok" title="Nước này đã được thưởng cho thỉnh nguyện này">🏅</span>` : ""}<span class="pill ${cls}">${st}</span></div>
        <div class="meta">${nationTag(p.nation)} · L${p.tick} · ${esc(p.category)} · #${p.id} <span class="dim" title="Lúc gửi: dân · lương thực · ổn định · số ô">· 👥${p.context.population} 🌾${p.context.food} ⚖️${p.context.stability} 🗺${p.context.tiles}</span></div>
        <div class="body"></div><div class="meta reason"></div>
        ${open ? `<textarea rows="1" placeholder="Lời phán (gửi lại cho quốc gia này, tùy chọn)"></textarea>
        <div class="actions"><button data-s="accepted" class="primary sm">Chấp thuận</button><button data-s="partial" class="sm">Một phần</button><button data-s="rejected" class="sm">Bác bỏ</button><span class="grow"></span><button data-act="decree" class="sm" title="Soạn Sắc lệnh từ thỉnh nguyện này">⚖️ Sắc lệnh</button><button data-act="ask" class="sm" title="Hỏi Claude nên quyết thế nào">💬 Hỏi</button>${tip(p.category === "sáng kiến" ? REWARD_TEXT : "Chấp thuận: nước gửi được +10 uy tín, +5 ổn định, nghiên cứu đang làm +25%. Một phần: +5, +2, +10%. Thưởng một lần.")}</div>`
        : `<div class="meta">⚖️ ${esc(p.verdict || "—")}</div>`}`;
      el.querySelector("h3").textContent = p.title;
      el.querySelector(".body").textContent = p.text;
      el.querySelector(".reason").textContent = p.reason ? `Lý do: ${p.reason}` : "";
      if (!open) { el.querySelector(".body").classList.add("clamp3"); el.querySelector(".body").onclick = e => e.currentTarget.classList.toggle("clamp3"); }
      for (const b of el.querySelectorAll("button[data-s]")) b.onclick = async () => {
        await api(`/api/petitions/${p.id}`, { method: "POST", body: { status: b.dataset.s, verdict: el.querySelector("textarea").value } }).catch(e => alertMsg(e.message));
        refresh();
      };
      const dec = el.querySelector("button[data-act=decree]");
      if (dec) dec.onclick = () => { $("#decree-text").value = p.text.slice(0, 1000); $("#decree-from").value = p.id; document.querySelector('.tabs button[data-tab="decrees"]').click(); };
      const ask = el.querySelector("button[data-act=ask]");
      if (ask) ask.onclick = () => { setDock("left", true); $("#chat-input").value = `Phân tích thỉnh nguyện #${p.id} "${p.title}": có nên chấp thuận không, tác động lên cân bằng và công bằng ra sao, và nếu chấp thuận thì Sắc lệnh nên viết thế nào?`; $("#chat-input").focus(); };
      return [open, el];
    });
    splitDecided(box, "pet-decided", "Thỉnh nguyện đã quyết", cards.filter(c => c[0]).map(c => c[1]), cards.filter(c => !c[0]).map(c => c[1]));
    if (!list.length && !(S.schisms || []).length && !(S.ministerRequests || []).length) box.innerHTML = `<p class="empty">Chưa có thỉnh nguyện nào.</p>`;
    else if (!cards.some(c => c[0]) && !(S.schisms || []).some(x => x.status === "pending") && !(S.ministerRequests || []).some(x => x.status === "pending")) box.insertAdjacentHTML("afterbegin", `<p class="empty">✓ Không có đơn nào chờ bạn.</p>`);
  }
  function renderDecrees() {
    $("#decrees").innerHTML = S.decrees.slice().reverse().map(d => `<li><div class="row"><b>${esc(d.code)}</b><span class="pill${d.law ? " ok" : ""}">${d.law ? "luật" : esc(d.kind)}</span><span class="grow"></span><span class="meta">L${d.tick}${d.effectiveTick > S.tick ? ` → hiệu lực L${d.effectiveTick}` : ""}${S.renameDecree?.code === d.code ? ` · ${S.renameDecree.done ? "hết hạn" : `đổi tên tới L${S.renameDecree.until}`}` : ""}</span></div><div class="clamp2" title="${esc(d.text)}">${esc(d.text)}</div></li>`).join("") || `<li class="note">Chưa có Sắc lệnh.</li>`;
    setCount("decrees", "issued", S.decrees.length);
    renderLaws();
  }
  // §10.3 law decrees: the rule numbers the Watcher can change
  const fmtV = (l, v) => `${Number.isInteger(v) ? v : Math.round(v * 1000) / 1000}${l.unit ? ` ${l.unit}` : ""}`;
  function renderLaws() {
    const laws = S.laws || [], sel = $("#law-key");
    if (!sel.options.length) {
      const groups = [...new Set(laws.map(l => l.group))];
      sel.innerHTML = groups.map(g => `<optgroup label="${esc(g)}">${laws.filter(l => l.group === g).map(l => `<option value="${esc(l.key)}">${esc(l.label)}</option>`).join("")}</optgroup>`).join("");
      sel.onchange = showLaw;
    }
    showLaw();
    const changed = laws.filter(l => l.value !== l.default || l.pending !== undefined);
    setCount("decrees", "laws", changed.length);
    $("#law-table").innerHTML = `<thead><tr><th scope="col">Luật</th><th scope="col">Hiện tại</th><th scope="col">Mặc định</th></tr></thead><tbody>${laws.map(l => `<tr data-key="${esc(l.key)}" class="${l.value !== l.default ? "changed" : ""}"><td>${esc(l.label)}</td><td>${fmtV(l, l.value)}${l.pending !== undefined ? ` → ${fmtV(l, l.pending)} <span class="muted">(lượt sau)</span>` : ""}</td><td class="muted">${fmtV(l, l.default)}</td></tr>`).join("")}</tbody>`;
    for (const tr of $("#law-table").querySelectorAll("tr[data-key]")) tr.onclick = () => { sel.value = tr.dataset.key; showLaw(); $("#law-value").focus(); };
  }
  function showLaw() {
    const l = (S.laws || []).find(x => x.key === $("#law-key").value); if (!l) return;
    const inp = $("#law-value");
    inp.min = l.min; inp.max = l.max; inp.step = l.step;
    if (document.activeElement !== inp) inp.value = l.pending ?? l.value;
    $("#law-info").textContent = `Hiện tại ${fmtV(l, l.value)} · mặc định ${fmtV(l, l.default)} · khoảng ${l.min}–${l.max}.${l.desc ? ` ${l.desc}` : ""}`;
  }
  $("#law-form").onsubmit = async e => {
    e.preventDefault();
    try { await api("/api/laws", { method: "POST", body: { key: $("#law-key").value, value: Number($("#law-value").value), note: $("#law-note").value, fromPetition: $("#decree-from").value || null } }); $("#law-note").value = ""; $("#law-msg").textContent = "Đã ban sắc lệnh luật; có hiệu lực từ lượt sau."; refresh(); }
    catch (err) { $("#law-msg").textContent = err.message; }
  };
  function alertMsg(m) { $("#decree-msg").textContent = m; }
  $("#decree-kind").onchange = () => { $("#decree-turns-row").hidden = $("#decree-kind").value !== "đổi tên"; };
  $("#decree-form").onsubmit = async e => {
    e.preventDefault();
    try { await api("/api/decrees", { method: "POST", body: { kind: $("#decree-kind").value, text: $("#decree-text").value, turns: $("#decree-kind").value === "đổi tên" ? Number($("#decree-turns").value) : null, fromPetition: $("#decree-from").value || null } }); $("#decree-text").value = ""; $("#decree-from").value = ""; alertMsg("Đã ban Sắc lệnh."); refresh(); }
    catch (err) { alertMsg(err.message); }
  };

  // ---------------------------------------------------------------- Claude chat
  const log = $("#chatlog");
  function msg(role, text) { const d = document.createElement("div"); d.className = `msg ${role}`; d.textContent = text; log.append(d); log.scrollTop = log.scrollHeight; return d; }
  async function renderLogin() {
    const box = $("#claude-login"), st = await api("/api/claude").catch(e => ({ available: false, error: e.message }));
    const form = $("#chatform");
    if (st.loggedIn) {
      box.innerHTML = `<div class="row note">Đã đăng nhập Claude${st.email ? ` (${esc(st.email)})` : ""}${st.plan ? ` · gói ${esc(st.plan)}` : ""}. <button id="cl-logout">Đăng xuất</button></div>`;
      $("#cl-logout").onclick = async () => { await api("/api/claude/logout", { method: "POST" }); renderLogin(); };
      form.hidden = false; return;
    }
    form.hidden = true;
    if (!st.available) { box.innerHTML = `<div class="login-box">${esc(st.error)}</div>`; return; }
    const L = st.login || {};
    box.innerHTML = `<div class="login-box">
      <b>Đăng nhập Claude</b>
      <span class="note">Dùng gói Claude của bạn (Pro/Max), không tốn phí API. Thông tin đăng nhập lưu trong thư mục data/claude trên máy này.</span>
      ${L.state === "waiting_code" ? `<span>1. Mở <a href="${esc(L.url)}" target="_blank" rel="noopener">trang đăng nhập Claude</a> và cho phép truy cập.</span>
        <span>2. Dán mã hiện ra vào đây:</span><div class="row"><input type="text" id="cl-code" placeholder="Mã xác nhận" style="flex:1"><button class="primary" id="cl-submit">Xác nhận</button><button id="cl-cancel">Hủy</button></div>`
      : `<div class="row"><button class="primary" id="cl-start">Đăng nhập Claude</button></div>`}
      ${L.error ? `<span class="note" style="color:var(--bad)">${esc(L.error)}</span>` : ""}
      <span class="note">Cách khác: chạy <code>docker compose exec sovereign-minds claude auth login</code> trong terminal.</span></div>`;
    $("#cl-start")?.addEventListener("click", async () => {
      const tab = window.open("about:blank", "_blank");
      const r = await api("/api/claude/login/start", { method: "POST" });
      if (r.url && tab) tab.location = r.url; else tab?.close();
      renderLogin();
    });
    $("#cl-submit")?.addEventListener("click", async () => { const r = await api("/api/claude/login/code", { method: "POST", body: { code: $("#cl-code").value } }); renderLogin(); if (r.state !== "done" && r.error) msg("err", r.error); });
    $("#cl-cancel")?.addEventListener("click", async () => { await api("/api/claude/login/cancel", { method: "POST" }); renderLogin(); });
  }
  let chatLoaded = false;
  async function loadChat() {
    renderLogin();
    if (chatLoaded) return; chatLoaded = true;
    const hist = await api("/api/chat").catch(() => []);
    log.innerHTML = ""; for (const m of hist) msg(m.role, m.text);
  }
  $("#chatform").onsubmit = async e => {
    e.preventDefault();
    const text = $("#chat-input").value.trim(); if (!text) return;
    $("#chat-input").value = ""; msg("user", text);
    const out = msg("claude", "…"); let first = true;
    $("#chat-send").disabled = true;
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text }) });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `HTTP ${res.status}`); }
      const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let k; while ((k = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, k); buf = buf.slice(k + 2);
          const ev = /event: (\w+)/.exec(chunk)?.[1], data = JSON.parse(/data: (.*)/.exec(chunk)?.[1] || "{}");
          if (ev === "delta") { if (first) { out.textContent = ""; first = false; } out.textContent += data.text; log.scrollTop = log.scrollHeight; }
          if (ev === "error") { out.className = "msg err"; out.textContent = data.error; }
        }
      }
    } catch (err) { out.className = "msg err"; out.textContent = err.message; }
    $("#chat-send").disabled = false;
  };
  $("#chat-input").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#chatform").requestSubmit(); } });
  $("#chat-clear").onclick = async () => { await api("/api/chat", { method: "DELETE" }); log.innerHTML = ""; };

  // ---------------------------------------------------------------- inventions
  const nm = id => S.nations[id]?.name ?? `#${id}`;
  // An open invention's effects in words (they come as JSON from the AI; the Watcher reads Vietnamese)
  const goods = g => Object.entries(g || {}).map(([k, q]) => `${q} ${RES[k] ?? k}`).join(", ");
  const BLD_EFFECT = { housing: v => `+${v} chỗ ở`, stability: v => `+${v} ổn định/lượt`, spoilage: v => `hư lương thực −${v}%`, craft_slots: v => `${v} chỗ chế tác`, defense: v => `phòng thủ +${v}%`, farm_slots: v => `${v} chỗ nông dân`, farm_food: v => `${v} lương thực/nông dân` };
  function effectText(e) {
    const role = r => r === "extract" ? "khai thác (gỗ, đá, đất sét, mỏ)" : ROLE[r] ?? r;
    switch (e.kind) {
      case "role_bonus": return ["🛠", `${role(e.role)} +${e.percent}%`];
      case "spoilage": return ["🏺", `lương thực hư ít hơn ${e.percent}%`];
      case "recipe": return ["🔨", `Công thức <b>${esc(e.name || e.id)}</b>: ${esc(goods(e.input))} → ${e.output_qty || 1} món, ${e.work || 1} công tại ${esc(e.at === "workshop" ? "Bãi chế tác" : e.at === "kiln" ? "Lò gốm" : e.at)}${e.tool ? ` · là công cụ: ${esc(role(e.tool.role))} +${e.tool.percent}%, mỗi món cho ${e.tool.per} người` : ""}`];
      case "building": return ["🏠", `Công trình <b>${esc(e.name || e.id)}</b>: tốn ${esc(goods(e.cost)) || "không gì"}, ${e.work} công · ${esc(Object.entries(e.effect || {}).filter(([, v]) => v).map(([k, v]) => BLD_EFFECT[k]?.(v) ?? `${k} ${v}`).join(", ") || "không hiệu ứng")}`];
      case "stability": return ["🔥", `+${e.per_tick} ổn định mỗi lượt`];
      case "ap": return ["⚡", `+${e.amount || 1} điểm hành động (AP)`];
      case "combat": return ["⚔️", `chiến đấu +${e.percent}%`];
      case "move": return ["🧭", `đi được ${e.terrain === "shallow" ? "biển nông" : e.terrain === "mountain" ? "núi" : e.terrain === "ocean" ? "biển sâu (vượt đại dương)" : esc(e.terrain)}`];
      case "reveal": return ["⛏", `nhìn thấy ${esc(RES[e.resource] ?? e.resource)}`];
      case "research": return ["📜", `nghiên cứu (RP) +${e.percent}%`];
      case "tile_limit": return ["🚩", `+${e.amount} ô quản lý`];
      case "growth": return ["👶", `dân tăng nhanh hơn ${e.percent}%`];
      case "transport": return ["🛞", `đoàn buôn chở nhiều và đi nhanh hơn ${e.percent}%`];
      case "explore": return ["🧭", `thám hiểm xa thêm ${e.tiles} ô`];
      case "range": return ["🏹", "tầm đánh +1 ô"];
      case "medicine": return ["⚕", `dịch bệnh ít và nhẹ hơn ${e.percent}%`];
      case "officials": return ["👑", "+1 quan chức"];
      case "housing_slots": return ["🏘", "+1 công trình nhà ở mỗi trung tâm"];
      default: return ["•", esc(JSON.stringify(e))];
    }
  }
  const effectList = effects => effects?.length ? `<ul class="effects">${effects.map(e => { const [i, t] = effectText(e); return `<li><span class="i">${i}</span><span>${t}</span></li>`; }).join("")}</ul>` : "";

  // §6.2 what the world can make, and who makes it
  function renderProducts() {
    const P = S.products; if (!P) return;
    const who = (list, empty) => list.length ? list.map(esc).join(", ") : `<span class="muted">${empty}</span>`;
    $("#products-recipes").innerHTML = `<table class="res prod"><thead><tr><th>Công thức</th><th>Nguyên liệu → sản phẩm</th><th>Làm được</th></tr></thead><tbody>${P.recipes.map(r => `<tr><td><b>${esc(r.name)}</b>${r.custom ? " ★" : ""}<div class="meta">cần ${esc(r.needs)} · ${r.work} công · tại ${esc(r.at)}</div></td><td>${esc(r.input)} → <b>${esc(r.output)}</b>${r.tool ? `<div class="meta">công cụ: ${esc(r.tool)}</div>` : ""}</td><td>${who(r.makers, r.know.length ? `biết: ${r.know.map(esc).join(", ")} (chưa có xưởng)` : "chưa nước nào")}</td></tr>`).join("")}</tbody></table>`;
    $("#products-buildings").innerHTML = `<table class="res prod"><thead><tr><th>Công trình</th><th>Tác dụng</th><th>Đã xây</th></tr></thead><tbody>${P.buildings.map(b => `<tr><td><b>${esc(b.name)}</b>${b.custom ? " ★" : ""}<div class="meta">cần ${esc(b.needs)} · tốn ${esc(b.cost || "không gì")} · ${b.work} công</div></td><td>${esc(b.effect || b.desc || "—")}</td><td>${who(b.built, "chưa ai xây")}</td></tr>`).join("")}</tbody></table>`;
  }
  function renderInventions() {
    const props = (S.proposals || []).slice().reverse();
    const pending = props.filter(p => p.status === "pending").length, badge = $("#prop-count");
    badge.hidden = !pending; badge.textContent = pending;
    const box = $("#proposals"), pbox = $("#proposals-pending"), decidedN = props.length - pending;
    box.innerHTML = decidedN ? "" : `<p class="note">Chưa có đơn nào được quyết.</p>`;
    const J = S.judge, when = t => new Date(t).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    pbox.innerHTML = pending
      ? `<p class="note">⚖️ Trọng tài Claude chấm ở lượt sau${J?.claudeSleepUntil ? ` · <span class="warn">chờ hạn mức tới ${when(J.claudeSleepUntil)}</span>` : ""}${J?.claudeWaitUntil ? ` · <span class="warn">thế giới chờ Claude tới ${when(J.claudeWaitUntil)}</span>` : ""} ${tip(`Đơn qua kiểm tra cứng của Engine rồi tới Trọng tài Claude, tối đa ${J ? J.perTick * J.batch : "?"} đơn mỗi lượt; trọng tài tự nhận ra đơn trùng. Bạn có thể duyệt tay thay; quyết định áp dụng ở lượt sau.`)}</p>`
      : `<p class="empty">✓ Không có đơn nào đang chờ.</p>`;
    setCount("inventions", "pending", pending); setCount("inventions", "decided", decidedN); setCount("inventions", "book", (S.customInventions || []).length);
    const ST2 = { pending: ["Chờ trọng tài", "warn"], approved: ["Được duyệt", "ok"], rejected: ["Bị bác", "bad"], duplicate: ["Trùng", ""] };
    const open = new Set([...document.querySelectorAll("#proposals details[open]")].map(d => d.dataset.id));
    for (const p of props) {
      const [st0, cls] = ST2[p.status], r = p.ruling, decided = p.status !== "pending";
      const st = p.status === "duplicate" && p.inventionName ? `Trùng với ${p.inventionName} · không thêm mới` : st0;
      // Pending ones stay open for a decision; decided ones fold into one line (click to read)
      const el = document.createElement(decided ? "details" : "article"); el.className = `card2 prop${decided ? " decided" : ""}`;
      el.dataset.id = p.id; if (open.has(String(p.id))) el.open = true;
      const head = `<b class="pname"></b><span class="meta">${esc(nm(p.nation))} · lượt ${p.tick}</span><span style="flex:1"></span><span class="pill ${cls}">${st}</span>`;
      el.innerHTML = `${decided ? `<summary class="row">${head}</summary>` : `<div class="row">${head}</div>`}
        <div class="meta" title="${esc(`Tiên quyết: ${p.prereqs.join(", ")}${p.caps.length ? ` · năng lực: ${p.caps.join(", ")}` : ""}`)}">#${p.id} · độ sâu ${p.depth} · ${p.power} điểm · ${p.prereqs.length} tiên quyết</div>
        <div class="pdesc"></div>${effectList(p.effects)}
        ${r ? `<div class="meta">Trọng tài ${esc(r.judge)}: nhân quả ${r.causality}/2, vật chất ${r.material}/2, vật lý ${r.physics}/2${r.add_prereqs?.length ? ` · thêm tiên quyết ${esc(r.add_prereqs.join(", "))}` : ""}${r.remove_effects?.length ? ` · bỏ hiệu ứng số ${r.remove_effects.map(i => i + 1).join(", ")}` : ""} — ${esc(r.reason)}</div>` : ""}
        ${p.status === "pending" ? `<div class="row"><input type="text" placeholder="Lý do (tùy chọn)" style="flex:1;min-width:0"><button class="primary sm" data-a="1">Duyệt</button><button class="sm" data-a="0">Bác</button><span class="meta" data-msg></span></div>` : ""}`;
      el.querySelector(".pname").textContent = p.name;
      el.querySelector(".pdesc").textContent = p.description;
      for (const b of el.querySelectorAll("button[data-a]")) b.onclick = async () => {
        await api(`/api/proposals/${p.id}`, { method: "POST", body: { approve: b.dataset.a === "1", reason: el.querySelector("input").value } }).then(() => { b.textContent = "Đã ghi, áp dụng lượt sau"; b.disabled = true; }, e => { el.querySelector("[data-msg]").textContent = e.message; });
      };
      (decided ? box : pbox).append(el);
    }
    const cbox = $("#custom-inventions"), list = (S.customInventions || []).slice().reverse();
    cbox.innerHTML = list.length ? "" : `<p class="note">Chưa có phát minh mới nào được công nhận.</p>`;
    for (const v of list) {
      const el = document.createElement("article"); el.className = "card2";
      el.innerHTML = `<div class="row"><b class="vname"></b><span class="meta">${esc(v.id)} · độ sâu ${v.depth} · ${v.rp} RP</span></div>
        <div class="meta" title="${esc(`Tiên quyết: ${v.prereqs.map(p => p.name).join(", ")}${v.caps.length ? ` · năng lực: ${v.caps.join(", ")}` : ""}`)}">${nationTag(v.by)} · L${v.tick}</div>
        <div class="vdesc clamp2"></div><div class="meta">✦ ${esc(v.effects || "—")}</div>`;
      el.querySelector(".vname").textContent = v.name; el.querySelector(".vdesc").textContent = v.description;
      cbox.append(el);
    }
  }

  // ---------------------------------------------------------------- sub-tabs inside a panel or a dialog
  // <div class="subtabs" data-key="k"><nav class="seg"><button data-sub="a">…</button></nav><section data-sub="a">…</section></div>
  // The open sub-tab is remembered per key; counts go in <span class="cnt" data-count="a">.
  const subOpen = key => { try { return localStorage.getItem(`sm-sub-${key}`); } catch { return null; } };
  function initSubtabs(root = document, onShow = () => { }) {
    for (const box of root.querySelectorAll(".subtabs")) {
      const key = box.dataset.key, buttons = [...box.querySelectorAll(":scope > nav.seg > button[data-sub]")];
      const show = name => {
        if (!buttons.some(b => b.dataset.sub === name)) name = buttons[0]?.dataset.sub;
        for (const b of buttons) { const on = b.dataset.sub === name; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); }
        for (const sec of box.querySelectorAll(":scope > section[data-sub]")) sec.hidden = sec.dataset.sub !== name;
        try { localStorage.setItem(`sm-sub-${key}`, name); } catch { }
        onShow(key, name);
      };
      for (const b of buttons) { b.type = "button"; b.setAttribute("role", "tab"); b.onclick = () => show(b.dataset.sub); }
      show(subOpen(key));
    }
  }
  function setCount(key, name, n) {
    const el = document.querySelector(`.subtabs[data-key="${key}"] [data-count="${name}"]`);
    if (el) { el.textContent = n || ""; el.hidden = !n; }
  }

  // ---------------------------------------------------------------- diplomacy
  function relClass(r) { return /chiến/.test(r) ? "war" : /thù địch/.test(r) ? "hostile" : /liên minh|tông chủ|chư hầu/.test(r) ? "ally" : /hòa bình|bất tương/.test(r) ? "peace" : ""; }
  function renderDiplomacy() {
    const alive = S.nations.filter(n => n.founded && n.alive);
    // one card per nation: who it knows and how (strangers are only counted)
    $("#relations").innerHTML = alive.map(a => {
      const known = alive.filter(b => b.id !== a.id && (a.relations?.[b.id] ?? "chưa biết") !== "chưa biết");
      const strangers = alive.length - 1 - known.length;
      return `<div class="card2 rel-card"><div class="row"><i class="sw" style="background:${esc(a.flag.colors[0])}"></i><b>${esc(a.name)}</b><span style="flex:1"></span><span class="meta">${known.length ? `biết ${known.length}${strangers ? `, chưa gặp ${strangers}` : ""}` : "chưa gặp ai"}</span></div>
        ${known.length ? `<div class="chips">${known.map(b => { const r = a.relations[b.id], bd = (S.borders || {})[a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`], t = bd ? Math.round(bd.tension) : null; return `<span class="rel ${relClass(r)}" title="${esc(`${a.name} và ${b.name}: ${r}${a.trades?.[b.id] ? `, ${a.trades[b.id]} lần buôn` : ""}${t !== null ? `, căng thẳng biên giới ${t}/100${bd.market ? `, chợ biên giới ${bd.market} lần` : ""}${bd.incidents.length ? `. Sự cố gần nhất (lượt ${bd.incidents.at(-1).tick}): ${bd.incidents.at(-1).text}` : ""}` : ""}`)}"><i class="sw" style="background:${esc(b.flag.colors[0])}"></i>${esc(b.name)} · ${esc(r)}${a.trades?.[b.id] ? ` · 🤝${a.trades[b.id]}` : ""}${t ? ` · <b class="tension ${t >= 70 ? "hot" : t >= 40 ? "warm" : ""}">⚡${t}</b>` : ""}</span>`; }).join("")}</div>` : ""}</div>`;
    }).join("") || `<p class="note">Chưa có quốc gia nào lập quốc.</p>`;
    const maxH = Math.max(1, ...(S.hordes || []).map(h => h.strength));
    const hordes = (S.hordes || []).slice().sort((a, b) => b.alive - a.alive || b.strength - a.strength);
    $("#hordes").innerHTML = hordes.length ? `<ul class="lines">${hordes.map(h => `<li class="${h.alive ? "" : "dim"}" title="${esc(h.alive ? `Sức mạnh ${h.strength}${h.lastRaid ? ` · lượt ${h.lastRaid.tick} cướp ${nm(h.lastRaid.nation)}: ${h.lastRaid.won ? "thắng" : "bị đẩy lui"}` : " · chưa cướp ai"}` : `Đã bị đánh tan, trở lại lượt ${h.returns}`)}"><span class="i">☠</span><span class="t"><b>${esc(h.name)}</b>${h.lastRaid ? ` <span class="dim">· L${h.lastRaid.tick} ${esc(nm(h.lastRaid.nation))} ${h.lastRaid.won ? "🔥" : "🛡"}</span>` : ""}</span>${h.alive ? `${meter(h.strength / maxH * 100, "bad", `Sức mạnh ${h.name}`)}<b class="mono">${h.strength}</b>` : `<span class="r">tan · về L${h.returns}</span>`}<button type="button" class="link" data-tile="${h.tile}" title="Xem trên bản đồ">↗</button></li>`).join("")}</ul>` : `<p class="empty">Thế giới này không có man di.</p>`;
    for (const b of document.querySelectorAll("#hordes [data-tile]")) b.onclick = () => centerOn(+b.dataset.tile);
    // §6.3 + §7.10 the market: prices, and what each nation is rich in, good at and short of
    const pr = (S.prices || []).slice().sort((a, b) => b.price / b.standard - a.price / a.standard || a.name.localeCompare(b.name));
    $("#prices").innerHTML = pr.length ? `<table class="res prices"><thead><tr><th>Hàng</th><th>Giá</th><th>Chuẩn</th><th></th></tr></thead><tbody>${pr.map(p => { const r = p.price / p.standard, d = p.price - p.prev; return `<tr><td>${esc(p.name)}</td><td class="${r >= 1.6 ? "bad" : r <= 0.6 ? "good" : ""}"><b>${p.price}</b></td><td class="meta">${p.standard}</td><td>${Math.abs(d) < 0.01 ? "" : d > 0 ? `<span class="bad">↑</span>` : `<span class="good">↓</span>`}</td></tr>`; }).join("")}</tbody></table>` : `<p class="empty">Chưa có giá: thị trường mở sau lượt đầu.</p>`;
    $("#market-nations").innerHTML = alive.filter(n => n.market).map(n => `<div class="card2"><div class="row"><i class="sw" style="background:${esc(n.flag.colors[0])}"></i><b>${esc(n.name)}</b></div>${marketChips(n.market)}</div>`).join("") || `<p class="empty">Chưa có quốc gia nào lập quốc.</p>`;
    const cars = S.caravans || [];
    $("#caravans").innerHTML = cars.length ? `<ul class="lines">${cars.map(c => { const g = Object.entries(c.goods || {}).map(([k, q]) => `${Math.round(q * 10) / 10} ${RES[k] ?? k}`).join(", "); return `<li title="${esc(`${g}${c.porters ? ` · ${c.porters} người khuân vác` : ""}${c.boats ? ` · ${c.boats} thuyền` : ""}`)}"><span class="i">${c.mode === "water" ? "⛵" : "🐂"}</span><span class="t"><b>${esc(nm(c.from))} → ${esc(nm(c.to))}</b> <span class="dim">· ${esc(g)}</span></span><span class="r">→ L${c.arrive}</span></li>`; }).join("")}</ul>` : `<p class="empty">Không có đoàn buôn nào trên đường.</p>`;
    setCount("diplomacy", "war", (S.wars || []).length); setCount("diplomacy", "treaties", (S.treaties || []).length);
    setCount("diplomacy", "hordes", (S.hordes || []).filter(h => h.alive).length); setCount("diplomacy", "trade", cars.length);
    // §7.4 a war at a glance: the score up front (A 7 : 1.8 B), the tally and the treaty folded
    const hist = S.warHistory || [];
    const sideTag = (s, cls) => `<span class="side ${cls}"><i class="sw" style="background:${esc(nationColor(s.id))}"></i><span title="${esc(s.name)}">${esc(s.name)}${s.alive ? "" : " †"}</span></span>`;
    function warCard(h, live) {
      const tallied = h.a.score !== null && h.a.score !== undefined;
      const va = tallied ? h.a.score : h.a.won, vb = tallied ? h.b.score : h.b.won;
      const row = (label, k, bad) => `<tr><td>${label}</td><td class="${bad && h.a[k] > h.b[k] ? "bad" : ""}">${h.a[k]}</td><td class="${bad && h.b[k] > h.a[k] ? "bad" : ""}">${h.b[k]}</td></tr>`;
      const lostA = h.b.tiles, lostB = h.a.tiles;
      // §7.4b how the peace came out: the winner by the score and what changed hands
      const p = h.peace;
      const peaceLine = !p ? "" : p.winner ? `🏆 <b>${esc(p.winner)}</b> thắng (dẫn ${p.lead})` : p.white ? "🤝 Hòa trắng" : "🤝 Hòa có điều khoản";
      return `<div class="war${live ? " live" : ""}">
        <div class="score" title="${tallied ? "Điểm chiến tranh" : "Trận thắng"}">${sideTag(h.a, "a")}<span class="pts"><span class="${va > vb ? "lead" : ""}">${tallied ? fmt1(va) : va}</span><span class="sep">:</span><span class="${vb > va ? "lead" : ""}">${tallied ? fmt1(vb) : vb}</span></span>${sideTag(h.b, "b")}</div>
        <div class="row"><span class="meta" title="${esc(h.reason || "")}">L${h.start}${h.end !== null ? `–${h.end}` : "→"} · ${h.battles} trận${tallied && h.a.clashes + h.b.clashes ? ` · ${h.a.clashes + h.b.clashes} giao tranh` : ""} · 💀 ${h.a.dead}/${h.b.dead}</span><span class="grow"></span>${live || peaceLine ? "" : `<span class="pill${h.end === null ? " bad" : ""}" title="${esc(h.outcome)}">${esc(h.outcome.length > 26 ? h.outcome.slice(0, 24) + "…" : h.outcome)}</span>`}</div>
        ${peaceLine ? `<div class="meta">${peaceLine}${p.reparations || p.tiles ? ` · bồi thường${p.tiles ? ` ${p.tiles} ô` : ""}${p.reparations ? " + hàng" : ""}` : ""}</div>` : ""}
        <div class="actions">${live ? `<button type="button" class="primary sm" data-war="${h.id}">${SWORD} Xem mặt trận</button>` : ""}${h.lastTile !== null ? `<button type="button" class="link" data-tally-tile="${h.lastTile}" title="Tới nơi giao tranh gần nhất">📍 Nơi giao tranh</button>` : ""}</div>
        <details data-sec="war-${h.id}"${SEC_OPEN[`war-${h.id}`] ? " open" : ""}><summary>Chi tiết${h.treaty ? " & hòa ước" : ""}${h.talks?.length ? ` · ${h.talks.length} thư` : ""}</summary>
        ${h.outcome.length > 26 ? `<div class="meta">${esc(h.outcome)}</div>` : ""}${h.reason ? `<div class="meta">Lý do: ${esc(h.reason)}</div>` : ""}${p?.terms ? `<div class="meta">Hòa ước: ${esc(p.terms)}</div>` : ""}
        ${treatyTerms(h)}
        <table class="res tally"><thead><tr><th></th><th>${esc(h.a.name)}</th><th>${esc(h.b.name)}</th></tr></thead><tbody>
          ${tallied ? row("Điểm chiến tranh", "score") + row("Giao tranh biên giới thắng", "clashes") : ""}${row("Trận thắng", "won")}${row(tallied ? "Người chết" : "Người chết trong trận", "dead", true)}${h.brawl ? `<tr><td>Chết vì xô xát trước chiến tranh</td><td class="${h.brawl.a > h.brawl.b ? "bad" : ""}">${h.brawl.a}</td><td class="${h.brawl.b > h.brawl.a ? "bad" : ""}">${h.brawl.b}</td></tr>` : ""}${row("Ô chiếm được", "tiles")}${row("Trung tâm chiếm được", "centres")}${row("Đột kích thành công", "raids")}
          <tr><td>Ô bị mất</td><td class="${lostA > lostB ? "bad" : ""}">${lostA}</td><td class="${lostB > lostA ? "bad" : ""}">${lostB}</td></tr>
        </tbody></table></details></div>`;
    }
    $("#wars").innerHTML = (S.wars || []).map(w => {
      const h = hist.find(x => x.id === w.id);
      if (h) return warCard(h, true);
      return `<div class="war live"><div class="row"><b>${esc(w.aName)} ${SWORD} ${esc(w.bName)}</b><span class="grow"></span><button type="button" class="primary sm" data-war="${w.id}">${SWORD} Xem mặt trận</button></div><div class="meta">L${w.declared} · ${esc(w.reason || "")}</div></div>`;
    }).join("") || `<p class="empty">Thế giới đang yên bình.</p>`;
    for (const b of document.querySelectorAll("#wars [data-war]")) b.onclick = () => { const w = (S.wars || []).find(x => x.id === +b.dataset.war); if (w) goToWar(w); };
    const ended = hist.filter(h => h.end !== null);
    $("#war-history").innerHTML = ended.length ? topN(ended.map(h => warCard(h, false)), 4) : `<p class="empty">Chưa có cuộc chiến nào kết thúc.</p>`;
    function treatyTerms(h) {
      const t = h.treaty, talks = h.talks || [];
      const rows = [];
      if (t) {
        rows.push(["Hòa ước", `#${t.id}${t.by ? `, do ${esc(t.by)} đề nghị` : ""}`]);
        // what was agreed, then what happened: in force, ended on time, torn up, or fallen early (and when)
        const agreed = t.term ? `${t.term} lượt (L${t.start}–${t.start + t.term})` : t.term === null ? "vĩnh viễn" : `từ L${t.start}`;
        const early = !t.active && t.end !== null && (!t.term || t.end < t.start + t.term);
        const fate = t.active ? `<span class="good">đang hiệu lực</span>` : t.brokenBy ? `<span class="bad">bị ${esc(t.brokenBy)} xé bỏ ở L${t.end}</span>` : t.endedBy ? `<span class="bad">${esc(t.endedBy)} (L${t.end})</span>` : early ? `<span class="bad">kết thúc sớm ở L${t.end}</span>` : "đã hết hạn";
        rows.push(["Thời hạn", `${agreed} · ${fate}`]);
        if (t.tribute) rows.push(["Cống nạp", `${esc(t.payer)} → ${esc(t.receiver)}: ${esc(t.tribute)}/lượt · đã nộp ${t.paid}${t.term ? `/${t.term}` : ""}${t.missed ? `, <span class="bad">thiếu ${t.missed}</span>` : ""}${!t.active && t.term && t.paid < t.term ? " (chấm dứt trước khi nộp đủ)" : ""}`]);
        if (t.cede) rows.push(["Nhượng đất", `${esc(t.payer)} → ${esc(t.receiver)}: ${t.cede} ô`]);
        if (!t.tribute && !t.cede) rows.push(["Điều khoản", "không có: hòa trắng"]);
      }
      if (h.peace?.reparations || h.peace?.tiles) rows.push(["Bồi thường", `${h.peace.reparations ? esc(h.peace.reparations) : ""}${h.peace.tiles ? `${h.peace.reparations ? " và " : ""}${h.peace.tiles} ô biên giới` : ""}`]);
      const KIND = { offer: "📜 đề nghị", message: "✉ thư", signed: "✅ ký" };
      const log = talks.length ? `<details class="talks"><summary>Thương lượng (${talks.length})</summary><ul class="plain">${talks.map(x => `<li><span class="t mono">L${x.tick}</span> <b>${esc(x.fromName)}</b> ${KIND[x.kind] || ""}: ${esc(x.text)}</li>`).join("")}</ul></details>` : "";
      return rows.length || log ? `<div class="terms">${rows.length ? `<table class="res terms-t"><tbody>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</tbody></table>` : ""}${log}</div>` : "";
    }
    for (const b of document.querySelectorAll("#wars [data-tally-tile], #war-history [data-tally-tile]")) b.onclick = () => centerOn(+b.dataset.tallyTile, Math.max(view.z, 26 / geo.s));
    const TN = { non_aggression: "bất tương xâm", passage: "đi lại", alliance: "liên minh", peace: "hòa bình", tribute: "cống nạp", vassal: "chư hầu" };
    const TI = { non_aggression: "🕊", passage: "🚶", alliance: "🤝", peace: "🕊", tribute: "🪙", vassal: "👑" };
    $("#treaties").innerHTML = (S.treaties || []).length ? `<ul class="lines">${S.treaties.map(t => { const trib = Object.keys(t.tribute || {}).length ? `${t.aName} nộp ${Object.entries(t.tribute).map(([k, q]) => `${q} ${RES[k] ?? k}`).join(", ")}/lượt` : ""; return `<li title="${esc(`#${t.id} ${TN[t.type] || t.type} · từ lượt ${t.start}${t.end ? ` đến ${t.end}` : ", vĩnh viễn"}${trib ? ` · ${trib}` : ""}`)}"><span class="i">${TI[t.type] || "📜"}</span><span class="t"><b>${esc(t.aName)} — ${esc(t.bName)}</b> <span class="dim">· ${esc(TN[t.type] || t.type)}${trib ? ` · ${esc(trib)}` : ""}</span></span><span class="r">L${t.start}${t.end ? `–${t.end}` : "→∞"}</span></li>`; }).join("")}</ul>` : `<p class="empty">Chưa có hiệp ước.</p>`;
    const bl = (S.battles || []).slice().reverse().map((b, k) => `<li class="clickable" data-battle="${(S.battles || []).length - 1 - k}" title="${esc(`Bấm để bay tới và xem lại trận${b.note ? ` · ${b.note}` : ""}`)}"><span class="t">${b.tick}</span><span>${esc(nm(b.attacker))} ${b.kind === "raid" ? "đột kích" : "đánh"} ${esc(nm(b.defender))}: <b class="${b.won ? "good" : "bad"}">${b.won ? "thắng" : "thua"}</b> <span class="dim">${b.a}:${b.d} · mất ${b.lossA}/${b.lossD}</span> <span class="link">📍</span></span></li>`);
    $("#battles").innerHTML = bl.length ? topN(bl, 8) : `<li class="note">Chưa có trận đánh.</li>`;
    for (const li of document.querySelectorAll("#battles [data-battle]")) li.onclick = () => { const b = S.battles[+li.dataset.battle]; if (b) { centerOn(b.tile, Math.max(view.z, 26 / geo.s)); replayBattle(b); } };
  }

  // ---------------------------------------------------------------- stats
  let statsCache = null;
  async function renderStats() {
    statsCache = await api("/api/stats").catch(() => []);
    drawChart();
    // the Engine scores the world (§9.3); the Watcher only shows it
    const PARTS = [["people", "Dân", "Dân số"], ["land", "Đất", "3 điểm mỗi ô"], ["knowledge", "Tri thức", "Phát minh đã biết, sâu hơn đáng giá hơn"], ["firsts", "Đầu tiên", "Phát minh đầu tiên trên thế giới"], ["inventor", "Sáng tạo", "Phát minh tự đề xuất được công nhận"], ["honour", "Uy tín", "Uy tín"], ["prosperity", "Thịnh vượng", "Nửa điểm thịnh vượng trung bình 10 lượt gần nhất"], ["age", "Tuổi", "Số thập kỷ tồn tại"]];
    const rows = S.ranking || [];
    // one row per nation: score, and a bar split by where the points come from (hover a piece for its value)
    const COL = ["#4cc283", "#c9a227", "#3fb3cf", "#ffd84a", "#c77dff", "#ff8f6b", "#e67aa8", "#98a7a1"];
    const top = Math.max(1, ...rows.map(r => r.score));
    $("#ranking").innerHTML = rows.length ? `<div class="legend-inline">${PARTS.map(([, h, t], i) => `<span title="${esc(t)}"><i style="background:${COL[i]}"></i>${h}</span>`).join("")}</div>
      <ol class="rank">${rows.map(r => `<li${r.alive ? "" : ` class="gone"`}><div class="row"><i class="sw" style="background:${esc(S.nations[r.nation]?.flag.colors[0] || "#888")}"></i><b>${esc(r.name)}${r.alive ? "" : " †"}</b><span style="flex:1"></span><b class="mono">${r.score}</b></div>
        <div class="stack" style="width:${Math.max(4, r.score / top * 100)}%">${PARTS.map(([key, h], i) => { const v = r.parts?.[key] ?? 0; return v > 0 ? `<i style="flex:${v};background:${COL[i]}" title="${esc(`${h}: ${v}`)}"></i>` : ""; }).join("")}</div></li>`).join("")}</ol>`
      : `<p class="note">Chưa có quốc gia nào lập quốc.</p>`;
  }
  function drawChart() {
    const c = $("#chart"), g = c.getContext("2d"), key = $("#stat-key").value, data = statsCache || [];
    // draw at the size it is shown, so text stays readable in a narrow dock
    const dpr = Math.min(devicePixelRatio || 1, 2), W = Math.max(240, c.clientWidth || 800), H = Math.round(W * .5), P = 36;
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!data.length) return;
    const ticks = [...new Set(data.map(d => d.tick))], maxT = Math.max(...ticks, 1), maxV = Math.max(1, ...data.map(d => d[key]));
    const css = getComputedStyle(document.documentElement);
    g.strokeStyle = css.getPropertyValue("--line"); g.fillStyle = css.getPropertyValue("--muted"); g.font = "12px sans-serif"; g.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { const y = H - P - (H - 2 * P) * k / 4; g.beginPath(); g.moveTo(P, y); g.lineTo(W - 10, y); g.stroke(); g.fillText(String(Math.round(maxV * k / 4)), 4, y + 4); }
    g.fillText(`lượt ${maxT}`, W - 60, H - 12);
    const legend = [];
    for (const n of S.nations) {
      const pts = data.filter(d => d.nation === n.id); if (!pts.length) continue;
      g.strokeStyle = n.flag.colors[0]; g.lineWidth = 2; g.beginPath();
      pts.forEach((d, k) => { const x = P + (W - P - 10) * d.tick / maxT, y = H - P - (H - 2 * P) * d[key] / maxV; k ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke(); legend.push(`<span><i style="background:${n.flag.colors[0]}"></i>${esc(n.name)}</span>`);
    }
    $("#chart-legend").innerHTML = legend.join("");
  }
  $("#stat-key").onchange = drawChart;

  // ---------------------------------------------------------------- invention tree
  // A layered graph: one column per depth, prerequisite edges left -> right,
  // a dot per nation that owns the invention (hollow ring = researching it now).
  let invList = null, invKey = null, invLoading = null;
  async function loadInventions() {
    const key = (S.customInventions || []).map(v => v.id).join(",");
    if (invList && key === invKey) return invList;
    if (!invLoading) invLoading = api("/api/inventions").then(list => { invList = list; invKey = key; return list; }).finally(() => { invLoading = null; });
    return invLoading;
  }
  const measureCtx = document.createElement("canvas").getContext("2d");
  function wrapText(text, maxW, font, maxLines) {
    measureCtx.font = font;
    const words = String(text).split(/\s+/).filter(Boolean), lines = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (measureCtx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] += "…"; }
    return lines.map(l => { while (l.length > 2 && measureCtx.measureText(l).width > maxW) l = l.slice(0, -2) + "…"; return l; });
  }
  function treeData() {
    const owners = {}, researching = {};
    for (const n of S.nations) {
      for (const v of n.inventions) (owners[v.id] ||= []).push(n);
      if (n.alive && n.research) (researching[n.research.id] ||= []).push(n);
    }
    return { owners, researching };
  }
  function buildTree(box, big) {
    const list = invList || [], byId = Object.fromEntries(list.map(v => [v.id, v]));
    const { owners, researching } = treeData();
    const W = big ? 176 : 92, H = big ? 54 : 46, GX = big ? 64 : 16, GY = big ? 14 : 8, PAD = 8, TOP = big ? 30 : 24;
    const fontPx = big ? 13 : 11, font = `600 ${fontPx}px "Be Vietnam Pro", system-ui, sans-serif`;
    const cols = [];
    for (const v of list) (cols[v.depth] ||= []).push(v);
    for (let d = 0; d < cols.length; d++) cols[d] ||= [];
    const maxLen = Math.max(1, ...cols.map(c => c.length));
    const yOf = {}, place = (c) => { const off = (maxLen - c.length) * (H + GY) / 2; c.forEach((v, k) => yOf[v.id] = TOP + off + k * (H + GY)); };
    cols.forEach(place);
    // a few barycentre sweeps to untangle the edges
    for (let sweep = 0; sweep < 4; sweep++) {
      for (let d = 1; d < cols.length; d++) {
        const bc = v => { const ps = [...v.prereqs, ...(v.links || [])].filter(p => byId[p]); return ps.length ? ps.reduce((a, p) => a + yOf[p], 0) / ps.length : yOf[v.id]; };
        const key = Object.fromEntries(cols[d].map(v => [v.id, bc(v)]));
        cols[d].sort((a, b) => key[a.id] - key[b.id] || a.id.localeCompare(b.id)); place(cols[d]);
      }
    }
    const xOf = v => PAD + v.depth * (W + GX);
    const width = PAD * 2 + cols.length * W + (cols.length - 1) * GX, height = TOP + PAD + maxLen * (H + GY) - GY;
    let edges = "", nodes = "";
    for (const v of list) for (const [p, cap] of [...v.prereqs.map(p => [p, false]), ...(v.links || []).map(p => [p, true])]) {
      const u = byId[p]; if (!u || u.depth >= v.depth && cap) continue;
      const x1 = xOf(u) + W, y1 = yOf[u.id] + H / 2, x2 = xOf(v), y2 = yOf[v.id] + H / 2, mx = (x1 + x2) / 2;
      edges += `<path class="edge${cap ? " cap" : ""}" data-from="${esc(u.id)}" data-to="${esc(v.id)}" d="M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"/>`;
    }
    const dotR = big ? 4.5 : 3.5, dotGap = dotR * 2 + 2.5, maxDots = Math.floor((W - 12) / dotGap);
    for (const v of list) {
      const x = xOf(v), y = yOf[v.id], own = owners[v.id] || [], res = (researching[v.id] || []).filter(n => !own.includes(n));
      const lines = wrapText(v.name, W - (v.custom ? 22 : 12), font, 2);
      const who = own.map(n => nationName(n)).join(", ");
      const aria = `${v.name}${v.custom ? ", do các nước tạo" : ""}. ${own.length ? `Đã có: ${who}` : "Chưa ai có"}`;
      let dots = "";
      [...own.map(n => [n, false]), ...res.map(n => [n, true])].slice(0, maxDots).forEach(([n, ring], k) => {
        const cx = x + 6 + dotR + k * dotGap, cy = y + H - 6 - dotR + 1;
        dots += ring ? `<circle class="dot ring" cx="${cx}" cy="${cy}" r="${dotR - .5}" style="stroke:${esc(n.flag.colors[0])}"/>`
          : `<circle class="dot${n.alive ? "" : " gone"}" cx="${cx}" cy="${cy}" r="${dotR}" style="fill:${esc(n.flag.colors[0])}"/>`;
      });
      const extra = own.length + res.length - maxDots;
      if (extra > 0) dots += `<text class="more" x="${x + W - 6}" y="${y + H - 6}" text-anchor="end">+${extra}</text>`;
      nodes += `<g class="node${v.custom ? " custom" : ""}${v.frame ? " frame" : ""}${own.length ? " owned" : ""}" data-id="${esc(v.id)}" tabindex="0" role="img" aria-label="${esc(aria)}${v.frame ? ", phát minh khung" : ""}">
        <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="6"/>
        ${lines.map((l, k) => `<text class="nm" x="${x + 6}" y="${(y + 4 + fontPx + k * fontPx * 1.25).toFixed(1)}" style="font-size:${fontPx}px">${esc(l)}</text>`).join("")}
        ${v.custom ? `<text class="star" x="${x + W - 5}" y="${y + fontPx + 3}" text-anchor="end" aria-hidden="true">★</text>` : ""}
        ${v.frame && big ? `<text class="ftag" x="${x + W - 6}" y="${y + H - 7}" text-anchor="end" aria-hidden="true">khung</text>` : ""}
        ${dots}</g>`;
    }
    box.innerHTML = `<svg class="tree" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-label="Cây phát minh: ${list.length} phát minh, ${cols.length} tầng độ sâu">
      <g class="cols" aria-hidden="true">${cols.map((c, d) => `<text class="colhead" x="${PAD + d * (W + GX) + W / 2}" y="${TOP - 9}" text-anchor="middle">${d ? `Độ sâu ${d}` : "Khởi đầu"}</text>`).join("")}</g>
      <g class="edges">${edges}</g><g class="nodes">${nodes}</g></svg>`;
    box.dataset.depths = String(cols.length);
    wireTree(box, byId, owners, researching);
  }
  function lineage(byId, id) {
    // everything this invention needs, and everything that needs it
    const up = new Set([id]), down = new Set([id]), kids = {};
    for (const v of Object.values(byId)) for (const p of [...v.prereqs, ...(v.links || [])]) (kids[p] ||= []).push(v.id);
    const walk = (set, next) => { const st = [id]; while (st.length) { const x = st.pop(); for (const y of next(x)) if (!set.has(y)) { set.add(y); st.push(y); } } };
    walk(up, x => [...(byId[x]?.prereqs || []), ...(byId[x]?.links || [])]); walk(down, x => kids[x] || []);
    return new Set([...up, ...down]);
  }
  function wireTree(box, byId, owners, researching) {
    const wrap = box.parentElement, tip = wrap.querySelector(".tree-tip"), svg = box.querySelector("svg");
    const show = g => {
      const id = g.dataset.id, v = byId[id], keep = lineage(byId, id);
      svg.classList.add("focus");
      for (const n of svg.querySelectorAll(".node")) n.classList.toggle("hl", keep.has(n.dataset.id));
      for (const e of svg.querySelectorAll(".edge")) e.classList.toggle("hl", keep.has(e.dataset.from) && keep.has(e.dataset.to));
      g.classList.add("cur");
      const own = owners[id] || [], res = researching[id] || [], first = S.registry?.[id];
      tip.innerHTML = `<b></b>${v.custom ? ` <span class="pill warn">do các nước tạo</span>` : ""}${v.frame ? ` <span class="pill">khung kỷ nguyên</span>` : ""}
        <div class="meta">${esc(id)} · độ sâu ${v.depth}${v.rp ? ` · ${v.rp} RP` : " · khởi đầu"}${v.caps.length ? ` · năng lực ${esc(v.caps.join(", "))}` : ""}</div>
        <p class="desc"></p>
        ${v.prereqs.length ? `<div class="meta">Cần: ${esc(v.prereqs.map(p => byId[p]?.name ?? p).join(", "))}</div>` : ""}
        ${v.needsCaps?.length ? `<div class="meta">Cần năng lực: ${esc(v.needsCaps.join(", "))}, từ bất kỳ phát minh nào (${esc((v.links || []).map(p => byId[p]?.name ?? p).join(", ") || "chưa ai có")}). Nước đã có mọi năng lực mà khung này mang lại thì không cần học nó.</div>` : ""}
        <div class="meta">${own.length ? `Đã có: ${own.map(n => `<span class="sw" style="background:${esc(n.flag.colors[0])}"></span>${esc(nationName(n))}`).join(", ")}` : "Chưa ai có"}</div>
        ${res.length ? `<div class="meta">Đang nghiên cứu: ${esc(res.map(nationName).join(", "))}</div>` : ""}
        ${v.custom && v.by !== null ? `<div class="meta">Phát minh bởi ${esc(nm(v.by))}</div>` : first ? `<div class="meta">Đầu tiên: ${esc(first.by.map(nm).join(", "))} · lượt ${first.tick}</div>` : ""}`;
      tip.querySelector("b").textContent = v.name; tip.querySelector(".desc").textContent = v.desc || "";
      tip.hidden = false;
      // beside the node when there is room, otherwise just below it
      const wr = wrap.getBoundingClientRect(), r = g.getBoundingClientRect(), tw = tip.offsetWidth;
      let left, top = r.top - wr.top;
      if (r.right - wr.left + 8 + tw <= wr.width) left = r.right - wr.left + 8;
      else if (r.left - wr.left - 8 - tw >= 0) left = r.left - wr.left - 8 - tw;
      else { left = clamp(r.left - wr.left, 0, Math.max(0, wr.width - tw)); top = r.bottom - wr.top + 6; }
      tip.style.left = `${left}px`; tip.style.top = `${Math.max(0, top)}px`;
      wrap.dataset.hover = id;
    };
    const hide = () => {
      svg.classList.remove("focus"); tip.hidden = true; delete wrap.dataset.hover;
      for (const n of svg.querySelectorAll(".hl, .cur")) n.classList.remove("hl", "cur");
    };
    svg.addEventListener("pointerover", e => { const g = e.target.closest(".node"); if (g) show(g); });
    // touch: pointerout follows every tap, so a tap keeps the card until focus or the tap moves elsewhere
    svg.addEventListener("pointerout", e => { const g = e.target.closest(".node"); if (e.pointerType === "mouse" && g && !g.contains(e.relatedTarget)) hide(); });
    svg.addEventListener("focusin", e => { const g = e.target.closest(".node"); if (g) show(g); });
    svg.addEventListener("focusout", hide);
    svg.addEventListener("click", e => { if (!e.target.closest(".node")) hide(); });
    box.addEventListener("scroll", hide, { passive: true });
    wrap.hideTip = hide; wrap.showNode = show;
  }
  function treeLegend() {
    const owners = S.nations.filter(n => n.founded || n.inventions.length);
    return owners.map(n => `<span><i class="sw" style="background:${esc(n.flag.colors[0])}"></i>${esc(nationName(n))}</span>`).join("") +
      `<span><i class="sw ring"></i>đang nghiên cứu</span><span><b class="star">★</b> do các nước tạo</span>`;
  }
  let treeSig = "";
  async function renderTrees(force = false) {
    const small = DOCKS.right.open && curTab === "tree", big = $("#tree-dialog").open;
    if (!small && !big) return;
    try { await loadInventions(); } catch (e) { $("#tree").innerHTML = `<p class="note">Không tải được cây phát minh: ${esc(e.message)}</p>`; return; }
    const sig = JSON.stringify([invKey, S.nations.map(n => [n.inventions.length, n.research?.id, n.flag.colors[0], n.name, n.alive]), small, big]);
    if (!force && sig === treeSig) return;
    treeSig = sig;
    const legend = treeLegend();
    for (const [on, box, leg] of [[small, $("#tree"), $("#tree-legend")], [big, $("#tree-big"), $("#tree-big-legend")]]) {
      if (!on) continue;
      const hover = box.parentElement.dataset.hover;
      leg.innerHTML = legend; buildTree(box, box === $("#tree-big"));
      // keep the highlight steady across a live refresh
      const g = hover && box.querySelector(`.node[data-id="${CSS.escape(hover)}"]`);
      if (g) box.parentElement.showNode(g); else box.parentElement.querySelector(".tree-tip").hidden = true;
    }
    const nCustom = (invList || []).filter(v => v.custom).length;
    $("#tree-count").textContent = `${(invList || []).length} phát minh${nCustom ? `, ${nCustom} do các nước tạo` : ""}`;
  }
  $("#tree-expand").onclick = () => { $("#tree-dialog").showModal(); treeSig = ""; renderTrees(); };
  $("#tree-close").onclick = () => $("#tree-dialog").close();
  $("#tree-dialog").addEventListener("close", () => { treeSig = ""; });
  // a click on the dark backdrop closes the large view
  $("#tree-dialog").addEventListener("click", e => {
    const d = e.currentTarget, r = d.getBoundingClientRect();
    if (e.target === d && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) d.close();
  });

  // ---------------------------------------------------------------- keyboard shortcuts
  // Never while typing, never with modifiers, and not behind an open dialog (Esc excepted:
  // the browser closes the dialog itself).
  const typing = el => !!el?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable=false])");
  addEventListener("keydown", e => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || typing(e.target)) return;
    const dialogOpen = !!document.querySelector("dialog[open]");
    if (e.key === "Escape") {
      if (dialogOpen) return;
      for (const w of document.querySelectorAll(".treewrap")) w.hideTip?.();
      // one step back at a time: the selected tile, then the right dock, then the chat sheet on phones
      if (pinnedI >= 0) { e.preventDefault(); pinTile(-1); }
      else if (DOCKS.right.open) { e.preventDefault(); setDock("right", false); }
      else if (phone.matches && DOCKS.left.open) { e.preventDefault(); setDock("left", false); }
      return;
    }
    if (dialogOpen) return;
    const k = e.key;
    if (k === " " || k === "Spacebar") {
      if (e.target.closest?.("button, a, summary, [role=tab], .node")) return; // Space activates the focused control
      e.preventDefault(); if (!e.repeat) togglePause();
    } else if (k === "n" || k === "N") { if (!e.repeat) stepTick(); }
    else if (k === "+" || k === "=") zoomBy(1.6);
    else if (k === "-" || k === "_") zoomBy(1 / 1.6);
    else if (k === "0") fitWorld();
    else if (k === "?") $("#help-dialog").showModal();
    else if (k === "c" || k === "C") setDock("left", !DOCKS.left.open);
    else return;
  });
  $("#btn-help").onclick = () => $("#help-dialog").showModal();
  $("#help-close").onclick = () => $("#help-dialog").close();

  // ---------------------------------------------------------------- the 3D map (Three.js, loaded on demand)
  const btn3d = $("#view-3d");
  let M3loading = null;
  async function set3D(on) {
    if (on && !window.WebGLRenderingContext) { btn3d.title = "Trình duyệt này không hỗ trợ WebGL để xem 3D"; return; }
    is3D = on;
    try { localStorage.setItem("sm-3d", on ? "1" : "0"); } catch { }
    btn3d.setAttribute("aria-pressed", String(on)); btn3d.classList.toggle("on", on); btn3d.title = on ? "Về bản đồ 2D" : "Xem bản đồ 3D";
    if (on && !M3) {
      btn3d.disabled = true;
      try {
        // one 3D map only, however many times it is asked for while it loads
        M3loading ??= import("/map3d.js").then(mod => mod.create($("#map3d"), {
          terrain: TERRAIN, veinColor: VEIN_COLOR, drawFlag, nationColor, roadTree,
          onPick: i => pinTile(i), onHover: (i, ev) => hoverCard(i, ev),
          fxWord: f => FX_WORD[f.kind]?.(f) ?? f.kind, fxTone, fxDur: f => FX_DUR[f.kind] || FX_DEFAULT,
          isDark: () => true, anim: () => ANIM.on,
          visibleRect: () => geo ? visibleRect() : null,
          onZoom: rel => { $("#zoom-level").textContent = `${rel < 9.95 ? rel.toFixed(1) : Math.round(rel)}×`; },
        }));
        const m = await M3loading;
        if (!M3) { M3 = m; M3.setStatic(ST); }
      } catch (e) { is3D = false; M3loading = null; btn3d.classList.remove("on"); btn3d.setAttribute("aria-pressed", "false"); btn3d.title = `Không mở được bản đồ 3D: ${e.message}`; console.error("[3D]", e); try { localStorage.setItem("sm-3d", "0"); } catch { } return; }
      finally { btn3d.disabled = false; }
    }
    cv.hidden = on;
    M3?.show(on);
    if (on) { M3.setState(S); M3.setLayer(layerData, layerMax, layerKind in THREAT_LAYERS); M3.setAnim(ANIM.on); render(); }
    else { hoverCard(-1); scheduleRender(); }
    document.body.classList.toggle("view-3d", on);
  }
  btn3d.onclick = () => set3D(!is3D);
  $("#view-north").onclick = () => M3?.faceNorth(false);
  $("#view-top").onclick = () => M3?.faceNorth(true);

  // ---------------------------------------------------------------- data flow
  async function refresh() {
    S = await api("/api/state");
    if (is3D && M3) M3.setState(S);
    applyStatus(S); render(); renderSummary(); renderBoard(); renderNations(); renderProducts(); renderIdeas(); renderPetitions(); renderDecrees(); renderInventions(); renderDiplomacy();
    if (DOCKS.right.open && curTab === "stats") renderStats();
    renderTrees();
    if (DOCKS.right.open && curTab === "inspect") renderInspector();
  }
  function legend() {
    $("#legend").innerHTML = Object.entries(TERRAIN).filter(([k]) => k !== "ocean").map(([, [n, c]]) => `<span><i style="background:${c}"></i>${n}</span>`).join("") + `<span><i style="background:#5fb4e6"></i>Sông</span><span><i style="background:#ffd84a;border-radius:50%"></i>Kỳ quan</span>` +
      `<span><i class="lg-wild"></i>Vùng hoang</span><span><i class="lg-herd"></i>Tuyến bò rừng</span><span><i class="lg-caravan"></i>Đoàn buôn</span><span><i class="lg-battle">×</i>Trận đánh</span><span><i style="height:4px;background:repeating-linear-gradient(90deg,#ffc828 0 5px,#16120a 5px 9px);border-radius:0"></i>Mặt trận (nước đang chiến tranh)</span>` +
      `<span><i style="background:#d9822b;transform:rotate(45deg) scale(.7)"></i>Mạch giàu (màu theo loại)</span>` +
      `<span><i style="height:3px;background:#8a5a2e;border-radius:2px"></i>Đường</span><span><i style="height:5px;background:repeating-linear-gradient(90deg,#6b4b33 0 2px,#2a2624 2px 5px);border-top:1px solid #d4dae0;border-radius:0"></i>Đường sắt</span><span><i style="height:2px;background:repeating-linear-gradient(90deg,#8a5a2e88 0 4px,transparent 4px 7px);border-radius:0"></i>Đường bỏ hoang (đất vô chủ, không nối trung tâm nào; xuống cấp dần)</span>`;
  }
  for (const b of document.querySelectorAll("#chron-filter button")) b.onclick = () => {
    for (const x of document.querySelectorAll("#chron-filter button")) x.classList.toggle("on", x === b);
    chron.dataset.f = b.dataset.f;
  };
  initSubtabs(document, (key, name) => { if (key === "stats" && name === "chart" && statsCache) drawChart(); });
  async function boot() {
    ST = await api("/api/static");
    layout(); drawBase(); legend(); updateZoomUi();
    await refresh();
    if (S.lastFx?.fx?.length && S.lastFx.tick >= S.tick - 1) showTicker(S.lastFx.fx); // the last turn's news, after a reload
    addChronicle(await api("/api/chronicle?limit=200"), false);
    ensureAnim();
    try { if (localStorage.getItem("sm-3d") === "1") set3D(true); } catch { }
    const es = new EventSource("/api/events");
    es.addEventListener("status", e => applyStatus(JSON.parse(e.data)));
    es.addEventListener("tick", e => { const d = JSON.parse(e.data); addChronicle(d.chronicle); refresh().then(() => playFx(d.fx)); if (layerKind) loadLayer(); });
    es.addEventListener("reload", () => location.reload());
    es.addEventListener("history", e => { const d = JSON.parse(e.data); addChapters([d.chapter]); addChronicle([d.entry]); });
    let rt, lastW = mapview.clientWidth;
    let lastH = mapview.clientHeight;
    const relayout = () => { if (mapview.clientWidth === lastW && mapview.clientHeight === lastH && geo?.dpr === Math.min(devicePixelRatio || 1, 2)) return; lastW = mapview.clientWidth; lastH = mapview.clientHeight; clearTimeout(rt); rt = setTimeout(() => { layout(); drawBase(); updateZoomUi(); render(); }, 120); };
    new ResizeObserver(relayout).observe(mapview);
    document.fonts?.ready.then(() => render());
  }
  // restore the docks before the map measures what it can see
  for (const p of document.querySelectorAll("#dock-right .panel")) p.hidden = p.id !== `tab-${curTab}`;
  $("#dock-right-title").textContent = tabTitle(tabButtons.find(x => x.dataset.tab === curTab));
  applyDocks();
  if (DOCKS.left.open) loadChat();
  boot().catch(e => { document.body.insertAdjacentHTML("afterbegin", `<p class="error">Không kết nối được Engine: ${esc(e.message)}</p>`); });
})();
