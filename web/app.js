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
  const SQ3 = Math.sqrt(3);
  const TERRAIN = {
    ocean: ["Biển sâu", "#1d4a66"], shallow: ["Biển nông", "#2d6c8c"], grass: ["Đồng cỏ", "#9dbb68"], forest: ["Rừng", "#4e7d45"],
    taiga: ["Rừng lá kim", "#3d6450"], jungle: ["Rừng rậm", "#2c6a3a"], hill: ["Đồi", "#b39a63"], mountain: ["Núi", "#8b8179"],
    coast: ["Ven biển", "#d3cb9b"], swamp: ["Đầm lầy", "#6d8a6c"], desert: ["Sa mạc", "#dcc48a"], tundra: ["Lãnh nguyên", "#b7c2b4"],
    glacier: ["Băng hà", "#c4d8e2"], icewall: ["Tường Băng", "#eef7fc"],
  };
  const ZONE = { cold: "Hàn đới", temp: "Ôn đới", trop: "Nhiệt đới" };
  const RES = { game: "thú săn", plants: "cây dại", fish: "cá", wood: "gỗ", stone: "đá", flint: "đá lửa", clay: "đất sét", salt: "muối", reeds: "sậy", herbs: "thảo dược", copper: "quặng đồng", tin: "quặng thiếc", iron: "sắt", food: "lương thực", fiber: "sợi", hide: "da", bone: "xương", stone_tool: "công cụ đá", blade: "lưỡi đá", rope: "dây thừng", hide_coat: "áo da", spear: "giáo", bow: "cung tên", axe: "rìu", pottery: "gốm", cloth: "vải", coal: "than đá", oil: "dầu mỏ", sulfur: "lưu huỳnh", horse: "ngựa hoang", boat: "thuyền" };
  const ROLE = { gather: "hái lượm", hunt: "săn", fish: "cá", farm: "nông", wood: "gỗ", stone: "đá", flint: "đá lửa", clay: "đất sét", mine: "khai mỏ", craft: "chế tác", build: "xây", research: "nghiên cứu", warrior: "chiến binh" };

  let ST = null, S = null, geo = null, hoverI = -1;
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
    if (!layerKind) { layerData = null; showLayerScale(); scheduleRender(); return; }
    let r; try { r = await api(`/api/layer?kind=${encodeURIComponent(layerKind)}`); } catch { return; }
    if (my !== layerReq) return;
    layerData = r.values;
    if (layerKind in THREAT_LAYERS) layerMax = 5;
    else { const pos = layerData.filter(v => v > 0).sort((a, b) => a - b); layerMax = pos.length ? pos[Math.floor(pos.length * 0.95)] || pos[pos.length - 1] : 1; }
    showLayerScale(); scheduleRender();
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
  const CAUSE_ICON = { famine: "🍂", winter: "❄", plague: "🦠", beasts: "🐺", quake: "💥", raid: "🔥", battle: "⚔", explore: "🧭", horde: "⚔" };
  // Long enough to follow by eye; the strip above the map can replay any of them
  const FX_DUR = { death: 4800, birth: 3600, explore: 6500, caravan: 6500, robbed: 6500, raid: 6500, repelled: 6500, clear: 6500, battle: 5500, migrate: 6000, settle: 5500, era: 6000, invention: 4800, winter: 5500, meteor: 3600 };
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
  function centreFor(n, tile) {
    const cs = [n.capital, ...(n.settlements || []).map(s => s.tile)];
    return cs.reduce((b, c) => hexDist(c, tile) < hexDist(b, tile) ? c : b, cs[0]);
  }
  /** Queue a tick's effects: the dramatic ones last a little longer, everything starts staggered. */
  function playFx(list) {
    if (!list?.length) return;
    const t0 = performance.now(), gap = clamp(14000 / list.length, 150, 1000);
    ANIM.queue = list.slice(0, 400).map((f, k) => ({ ...f, t0: t0 + k * gap, dur: FX_DUR[f.kind] || FX_DEFAULT }));
    showTicker(list);
    ensureAnim();
  }
  // The map is wide: a strip of what is playing, each one a button that flies there
  const FX_WORD = {
    death: f => `${CAUSE_ICON[f.cause] || "☠"} ${f.n} người chết${{ famine: " đói", winter: " rét", plague: " vì dịch", beasts: " vì thú dữ", quake: " vì động đất", raid: " vì man di", battle: " trận mạc", explore: " khi thám hiểm", horde: " đánh man di" }[f.cause] || ""}`,
    birth: f => `👶 +${f.n} dân`, build: f => `🔨 xây xong ${f.text || ""}`, invention: f => `💡 ${f.text || "phát minh"}`, claim: () => "🚩 khai hoang", lost_tile: () => "🏚 bỏ hoang một ô",
    explore: () => "🧭 thám hiểm", settle: f => `🏕 lập ${f.text || "điểm định cư"}`, era: f => `🌟 bước vào ${f.text}`, migrate: f => `🚶 ${f.n} người bỏ đi`,
    raid: f => `🔥 ${f.text} cướp phá`, repelled: f => `🛡 đẩy lui ${f.text}`, clear: f => f.text === "won" ? "🏳 đánh tan man di" : "⚔ đánh man di thất bại", battle: f => String(f.text).startsWith("won") ? "⚔ thắng trận" : "⚔ thua trận",
    beasts: f => `🐺 ${f.text || "thú dữ"} tấn công`, flood: () => "🌊 lũ lụt", quake: () => "💥 động đất", winter: () => "❄ mùa đông khắc nghiệt", plague: () => "🦠 dịch bệnh", famine: () => "🍂 nạn đói",
    fishrun: () => "🐟 mùa cá về", caravan: f => `${f.text === "water" ? "⛵" : "🐂"} đoàn buôn lên đường (${f.n} lượt)`, toll: f => `🪙 thu phí đoàn buôn của ${nm(f.from)}`,
    road: f => `🛤 làm xong ${String(f.text || "đường").toLowerCase()}`, robbed: f => `🔥 ${f.text} cướp đoàn buôn`, storm: () => "⛈ bão nhấn chìm thuyền", seized: f => `⛓ tịch thu đoàn buôn của ${nm(f.from)}`,
    drought: () => "☀ hạn hán", bounty: () => "🌾 bội thu", herd: () => "🐂 đàn bò rừng", fire: () => "🔥 cháy rừng", meteor: () => "☄ thiên thạch", eruption: () => "🌋 núi lửa phun", riot: () => "✊ nội loạn", horde_back: () => "☠ man di trở lại",
  };
  const QUIET_FX = new Set(["birth", "claim", "herd", "bounty", "fishrun", "road"]);
  function showTicker(list) {
    const box = $("#fx-ticker"); if (!box) return;
    const items = list.filter(f => !QUIET_FX.has(f.kind)).slice(0, 14);
    box.replaceChildren(...items.map(f => {
      const b = document.createElement("button"); b.type = "button";
      const who = f.nation !== undefined && S.nations[f.nation] ? `${nationName(S.nations[f.nation])}: ` : "";
      b.textContent = who + (FX_WORD[f.kind]?.(f) ?? f.kind);
      if (f.nation !== undefined && S.nations[f.nation]) b.style.borderLeftColor = nationColor(f.nation);
      // fly there and play just this one again, leaving the strip as it is
      const focus = f.path?.length ? f.path[Math.floor(f.path.length / 2)] : f.tile; // a journey: look at its middle
      b.onclick = () => { centerOn(focus, Math.max(view.z, (f.path?.length > 8 ? 18 : 28) / geo.s)); ANIM.queue.push({ ...f, t0: performance.now() + 350, dur: FX_DUR[f.kind] || FX_DEFAULT }); ensureAnim(); };
      return b;
    }));
    if (items.length) {
      const x = document.createElement("button"); x.type = "button"; x.className = "close"; x.textContent = "×"; x.title = "Ẩn (hiện lại khi có lượt mới)";
      x.setAttribute("aria-label", "Ẩn dải tin"); x.onclick = () => { box.hidden = true; };
      box.append(x);
    }
    box.hidden = !items.length; // stays until the next tick or until closed
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
      for (const w of n.work || []) {
        working += w.n;
        if (!vis(w.tile)) continue;
        const home = centreFor(n, w.tile), [hx, hy] = center(home), [wx, wy] = center(w.tile);
        if (s * z >= 7 && ROLE_ICON[w.role]) { g.globalAlpha = .9; icon(g, ROLE_ICON[w.role], wx + s * .45, wy - s * .45, iconSize); g.globalAlpha = 1; }
        const people = Math.max(1, Math.round(w.n / unit));
        for (let k = 0; k < people; k++) {
          const ph = hash(w.tile, k, n.id, w.role.length), period = 7000 + ph * 5000, [ox, oy] = spot(w.tile, k, w.role.length);
          let x, y;
          if (home === w.tile || still) {
            // working on the spot, drifting a little round their place
            const a = (still ? 0 : now / period + ph) * Math.PI * 2;
            x = wx + ox + Math.cos(a) * s * .08; y = wy + oy + Math.sin(a) * s * .06;
          } else {
            // there and back: walk out, work a while, walk home
            const t = ((now / period) + ph) % 1, leg = t < .4 ? ease(t / .4) : t < .6 ? 1 : 1 - ease((t - .6) / .4);
            [x, y] = lerp([hx + ox * .6, hy + oy * .6], [wx + ox, wy + oy], leg);
            if (t >= .4 && t < .6) y += Math.sin(now / 180 + k) * s * .06; // busy at the work
          }
          figure(g, x, y, r, color, px);
        }
      }
      // The rest of the people: at home round the capital and the settlements, a little smaller
      // homes: their tiles within 2 of each centre (the capital's count twice), so the crowd spreads round the flag, not under it
      const hearth = c => { const near = new Set([c]); for (const j of NB(c)) if (j >= 0) { near.add(j); for (const k of NB(j)) if (k >= 0) near.add(k); } return [c, ...[...near].filter(j => j !== c && S.owners[j] === n.id)]; };
      const homes = [...hearth(n.capital), ...hearth(n.capital).slice(1), ...(n.settlements || []).flatMap(x => hearth(x.tile))];
      const home = Math.max(0, Math.round((n.population - working) / unit));
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
        case "build": case "settle": case "invention": case "era": {
          const rr = unit * (0.6 + t * (f.kind === "era" ? 3.2 : 1.8));
          g.beginPath(); g.arc(x, y, rr, 0, 7); g.lineWidth = 3 * px; g.strokeStyle = f.kind === "invention" || f.kind === "era" ? "#ffd84a" : nc; g.stroke();
          if (f.kind === "settle" && f.from !== undefined) route(g, [center(f.from), [x, y]], px);
          icon(g, { build: "🔨", settle: "🏕", invention: "💡", era: "🌟" }[f.kind], x, y - unit * 1.2 - t * unit, big * 1.2);
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
        case "raid": case "repelled": case "clear": case "battle": case "migrate": case "robbed": {
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
            const sym = f.kind === "repelled" ? "🛡" : f.kind === "raid" || f.kind === "robbed" ? "🔥" : f.kind === "clear" ? (f.text === "won" ? "🏳" : "⚔") : won ? "⚔" : "🛡";
            icon(g, sym, bx, by - unit * 1.4, big * 1.3);
          }
          if (f.kind === "migrate" && f.n) floatText(g, `${f.n} người bỏ đi`, a[0], a[1] - unit * 1.4, big * .8, "#ffd0a0", px);
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

  // §2.5 roads on land (track, packed earth, pale paving) and sea lanes (dashed channels, beacons on the best)
  const ROAD_STYLE = [null, { c: "#b08458", w: .09, dash: [.45, .3] }, { c: "#8a5a2e", w: .13 }, { c: "#efe4c8", w: .17 }];
  const isWater = i => ST.terrain[i] === "ocean" || ST.terrain[i] === "shallow";
  function drawRoads(g, vis, s, z, px) {
    if (!S.roads || s * z < 3) return;
    const hubs = new Set(); for (const n of S.nations) if (n.alive && n.founded) { hubs.add(n.capital); for (const st of n.settlements || []) hubs.add(st.tile); }
    const segs = { land: [[], [], [], []], sea: [[], [], [], []] }, dots = [];
    S.roads.forEach((lv, i) => {
      if (!lv || !vis(i)) return;
      const water = isWater(i); let linked = false;
      for (const j of NB(i)) {
        if (j < 0) continue;
        const lj = S.roads[j] || 0, hub = !water && hubs.has(j) && !isWater(j);
        if (isWater(j) !== water || (!lj && !hub)) continue;
        linked = true;
        if (lj && j < i) continue; // each pair once
        segs[water ? "sea" : "land"][lj ? Math.min(lv, lj) : lv].push([i, j]);
      }
      if (!linked) dots.push([i, lv, water]);
    });
    const line = (list, width, color, dash) => {
      if (!list.length) return;
      g.beginPath();
      for (const [a, b] of list) { const [x1, y1] = center(a), [x2, y2] = center(b); g.moveTo(x1, y1); g.lineTo(x2, y2); }
      g.setLineDash(dash ? dash.map(d => d * s) : []); g.lineWidth = width; g.strokeStyle = color; g.stroke();
    };
    g.save(); g.lineCap = "round";
    for (let lv = 1; lv <= 3; lv++) {
      const st = ROAD_STYLE[lv], w = Math.max(1.2 * px, s * st.w);
      line(segs.land[lv], w + 2.2 * px, "rgba(30,20,10,.55)");
      line(segs.land[lv], w, st.c, st.dash);
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
    g.globalAlpha = .42;
    for (const i of owned) { const [x, y] = center(i); hexPath(g, x, y, s * 1.02); g.fillStyle = nationColor(S.owners[i]); g.fill(); }
    g.globalAlpha = 1;
    if (s * z >= 5) {
      g.save(); g.lineWidth = Math.max(px, s * .07); g.globalAlpha = .28;
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
    drawRoads(g, vis, s, z, px);
    // names of the quiet places, once there is room to read them
    const small = clamp(s * .95 * z, 9, 13) * px;
    if (s * z >= 5) {
      for (const w of ST.wild || []) { const [x, y] = center(w); label(g, "Vùng hoang", x, y - (WILD_R + .6) * s * SQ3 - 8 * px, small, "#eef6e6", 500, px); }
      if (ST.herd) { const [x1, y1] = center(ST.herd[0]), [x2, y2] = center(ST.herd[1]); label(g, "Tuyến bò rừng", (x1 + x2) / 2 - (y2 - y1) * .09, (y1 + y2) / 2 + (x2 - x1) * .09, small, "#f6d696", 500, px); }
    }
    // wonders
    for (const w of ST.wonders) {
      const [x, y] = center(w.i), R = clamp(s * .8 * z, 5, 14) * px; g.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? R * .45 : R; g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
      g.closePath(); g.fillStyle = "#ffd84a"; g.fill(); g.lineWidth = px; g.strokeStyle = "#3a2a00"; g.stroke();
      if (s * z >= 14) label(g, w.name, x, y + R + 8 * px, small, "#ffe9a0", 500, px);
    }
    // barbarian hordes (§9.4): a dark camp-fire marker with their strength
    for (const h of S.hordes || []) {
      const [x, y] = center(h.tile), R = clamp(s * 1.1 * z, 7, 16) * px;
      g.globalAlpha = h.alive ? 1 : .45;
      g.beginPath(); g.arc(x, y, R, 0, 7); g.fillStyle = "#2a0d0a"; g.fill(); g.lineWidth = 2 * px; g.strokeStyle = h.alive ? "#ff6b3d" : "#b9a69e"; g.stroke();
      g.beginPath(); g.moveTo(x - R * .45, y + R * .4); g.lineTo(x + R * .45, y - R * .5); g.moveTo(x + R * .45, y + R * .4); g.lineTo(x - R * .45, y - R * .5);
      g.strokeStyle = "#ffd2b8"; g.lineWidth = Math.max(1.5 * px, R * .16); g.stroke();
      if (s * z >= 4) label(g, h.alive ? `${h.name} · ${h.strength}` : `${h.name} (đã tan)`, x, y + R + 9 * px, small, h.alive ? "#ffb59a" : "#cbbab3", 600, px);
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
    // capitals with flags
    const fs = clamp(s * 1.1 * z, 10, 15) * px;
    for (const n of S.nations) {
      if (!n.alive) continue;
      const [x, y] = center(n.capital), fw = clamp(s * 3 * z, 18, 44) * px, fh = fw * 2 / 3, lift = clamp(s * z, 6, 14) * px;
      g.strokeStyle = "#0b1a22"; g.lineWidth = 1.5 * px; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - fh - lift); g.stroke();
      drawFlag(g, x, y - fh - lift, fw, fh, n.flag, px);
      label(g, nationName(n), x, y + fs * 1.1, fs, "#fff", 600, px);
      if (n.status === "asleep" || n.status === "error") label(g, n.status === "asleep" ? "đang ngủ" : "lỗi key", x, y + fs * 2.3, fs * .85, "#ffd0a0", 500, px);
    }
    for (const n of S.nations) for (const st of n.settlements || []) {
      const [x, y] = center(st.tile); g.beginPath(); g.arc(x, y, clamp(s * .7 * z, 4, 10) * px, 0, 7); g.fillStyle = n.flag.colors[0]; g.fill(); g.lineWidth = 1.5 * px; g.strokeStyle = "#0b1a22"; g.stroke();
      label(g, st.name, x, y + small * 1.5, small, "#fff", 500, px);
    }
    for (const b of (S.battles || []).filter(b => b.tick >= S.tick - 3)) {
      const [x, y] = center(b.tile), r = clamp(s * .8 * z, 5, 12) * px; g.strokeStyle = "#ff4d3d"; g.lineWidth = clamp(s * .25 * z, 2, 4) * px;
      g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke();
    }
    const now = performance.now();
    drawAmbient(g, now, s, z, px, vis);
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
  const zoomBy = f => { if (!geo) return; const R = visibleRect(); zoomAt(R.x + R.w / 2, R.y + R.h / 2, f, true); };
  const fitWorld = () => geo && setView(fitView(), true);
  function centerOn(i, z) {
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
    box.innerHTML = `<b>${esc(TERRAIN[ST.terrain[i]][0])}</b>${ST.river[i] ? " · sông" : ""}${ST.delta[i] ? " · châu thổ" : ""}
      <span class="muted">· ô ${i % geo.N}, ${(i / geo.N) | 0}</span>
      ${S.roads?.[i] ? `<br>🛤 ${esc(isWater(i) ? S.roadLevels[S.roads[i] - 1].lane : S.roadLevels[S.roads[i] - 1].name)}` : ""}
      ${owner ? `<br>${isWater(i) ? "Lãnh hải của" : "Thuộc"} <b>${esc(nationName(owner))}</b>` : ""}${w ? `<br>Kỳ quan: <b>${esc(w.name)}</b>` : ""}${inWild(i) ? `<br><span class="muted">Vùng hoang</span>` : ""}`;
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
      `<span class="stat" title="${esc(gates.length ? gates.map(([e, t]) => `${e}: lượt ${t}`).join(" · ") : "Chưa quốc gia nào qua cổng kỷ nguyên")}">${latest ? `Cổng <b>${esc(latest[0])}</b> · lượt ${latest[1]}` : "Chưa qua cổng kỷ nguyên"}</span>` +
      `<span class="stat${wars ? " hot" : ""}"><b>${wars}</b> cuộc chiến</span>`;
  }
  const togglePause = () => api("/api/control", { method: "POST", body: { action: window.__status?.paused ? "resume" : "pause" } }).then(applyStatus).catch(() => { });
  const stepTick = () => api("/api/control", { method: "POST", body: { action: "step" } }).catch(() => { });
  $("#btn-pause").onclick = togglePause;
  $("#btn-step").onclick = stepTick;
  $("#tick-seconds").onchange = e => api("/api/control", { method: "POST", body: { action: "tick_seconds", value: +e.target.value } }).then(applyStatus);

  // ---------------------------------------------------------------- theme
  const darkMq = matchMedia("(prefers-color-scheme: dark)");
  const effectiveTheme = () => document.documentElement.dataset.theme || (darkMq.matches ? "dark" : "light");
  function syncThemeButton() {
    const dark = effectiveTheme() === "dark", b = $("#btn-theme");
    b.setAttribute("aria-label", dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối");
    b.title = b.getAttribute("aria-label");
    b.querySelector(".ico-sun").hidden = !dark; b.querySelector(".ico-moon").hidden = dark;
  }
  function themeChanged() { syncThemeButton(); if (DOCKS.right.open && curTab === "stats" && statsCache) drawChart(); }
  $("#btn-theme").onclick = () => {
    const next = effectiveTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("sm-theme", next); } catch { }
    themeChanged();
  };
  darkMq.addEventListener?.("change", themeChanged);
  syncThemeButton();

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
  const tabTitle = b => b.firstChild.textContent.trim();
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
    const to = { ArrowRight: k + 1, ArrowLeft: k - 1, Home: 0, End: tabButtons.length - 1 }[e.key];
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
  const HIDDEN_RES = new Set(["copper", "tin", "iron"]);
  function inspectNation(id) {
    const n = S.nations[id]; if (!n) return;
    pinnedI = -1; inspect = { kind: "nation", id };
    openRight("inspect"); renderInspector();
    if (n.alive) centerOn(n.capital); else scheduleRender();
  }
  function nationBlock(n, tile) {
    const el = document.createElement("section"); el.className = "insp-nation";
    const pct = n.research ? Math.min(100, n.research.progress / n.research.cost * 100) : 0;
    const blds = tile === null ? n.buildings : n.buildings.filter(b => b.tile === tile);
    const wars = (S.wars || []).filter(w => w.a === n.id || w.b === n.id);
    el.innerHTML = `<div class="head"><span class="flag"></span><div class="grow"><h3 class="nname"></h3><div class="meta nmeta"></div></div>${statusPill(n)}</div>
      <div class="kv kv6"><div><b>${n.population}</b><span>dân</span></div><div><b>${Math.round(n.stock.food || 0)}</b><span>lương thực</span></div><div><b>${n.stability}</b><span>ổn định</span></div><div><b>${n.governed ?? n.tiles}/${n.tileLimit}</b><span>ô${n.waters ? ` (${n.waters} biển)` : ""}</span></div><div><b>${n.inventions.length}</b><span>phát minh</span></div><div><b>${n.reputation}</b><span>uy tín</span></div></div>
      <div class="meta">Kỷ nguyên <b>${esc(n.era)}</b>${n.research ? ` · nghiên cứu ${esc(n.research.name)} ${n.research.progress}/${n.research.cost} RP` : ""}</div>
      ${n.research ? `<div class="bar" role="progressbar" aria-label="Tiến độ nghiên cứu" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>` : ""}
      ${n.thought ? `<div class="thought"></div>` : ""}
      <h4>${tile === null ? "Công trình" : "Công trình trên ô này"}</h4>
      <div class="chips">${blds.map(b => `<span>${esc(b.name)}${b.done ? "" : " (đang xây)"}</span>`).join("") || `<span class="none">không có</span>`}</div>
      ${tile === null && (n.settlements || []).length ? `<h4>Điểm định cư</h4><div class="chips">${n.settlements.map(x => `<span>${esc(x.name)}</span>`).join("")}</div>` : ""}
      ${wars.length ? `<h4>Đang chiến tranh</h4><div class="meta">${wars.map(w => esc(w.a === n.id ? w.bName : w.aName)).join(", ")}</div>` : ""}
      ${tile === null && n.alive ? `<h4>Mối đe dọa</h4>${threatList((n.threats || []).filter(t => t.level >= 1).slice(0, 5), "Không có mối đe dọa đáng kể.")}<h4>Tài nguyên trên lãnh thổ</h4>${resChips(n)}` : ""}
      <div class="row"><button type="button" class="primary" data-act="detail">Mở hồ sơ đầy đủ</button>${n.alive ? `<button type="button" data-act="locate">Xem trên bản đồ</button>` : ""}${tile === null ? `<button type="button" data-act="list">Danh sách quốc gia</button>` : ""}</div>`;
    el.querySelector(".flag").replaceWith(flagCanvas(n.flag, 54, 36));
    el.querySelector(".nname").textContent = nationName(n);
    el.querySelector(".nmeta").textContent = [n.trait && `${n.trait.icon} ${n.trait.name}`, n.people, n.capitalName && `thủ đô ${n.capitalName}`, modelLabel(n)].filter(Boolean).join(" · ");
    if (n.thought) el.querySelector(".thought").textContent = `“${n.thought}”`;
    el.querySelector("[data-act=detail]").onclick = () => openNation(n.id);
    el.querySelector("[data-act=locate]")?.addEventListener("click", () => centerOn(n.capital));
    el.querySelector("[data-act=list]")?.addEventListener("click", () => openRight("nations"));
    return el;
  }
  async function renderInspector() {
    const box = $("#inspector"); if (!S) return;
    if (!inspect) {
      box.innerHTML = `<div class="insp-empty"><p><b>Chưa chọn gì.</b></p><p class="note">Nhấp một ô trên bản đồ để xem địa hình, trữ lượng (kể cả quặng ẩn với AI), chủ sở hữu, công trình và trận đánh ở đó. Nhấp một thẻ trong bảng Quốc gia để xem quốc gia ấy.</p></div>`;
      return;
    }
    if (inspect.kind === "nation") { const n = S.nations[inspect.id]; box.replaceChildren(nationBlock(n, null)); return; }
    const i = inspect.i, my = ++inspReq;
    let t; try { t = await api(`/api/tile?i=${i}`); } catch (e) { box.innerHTML = `<p class="note">Không tải được ô: ${esc(e.message)}</p>`; return; }
    if (my !== inspReq || inspect?.kind !== "tile" || inspect.i !== i) return;
    const owner = t.owner >= 0 ? S.nations[t.owner] : null, w = ST.wonders.find(x => x.i === i);
    const capOf = S.nations.find(n => n.alive && n.capital === i), stl = S.nations.flatMap(n => (n.settlements || []).filter(x => x.tile === i))[0];
    const keys = [...new Set([...Object.keys(t.cap || {}), ...Object.keys(t.res || {})])].filter(k => (t.cap?.[k] || 0) >= .5 || (t.res?.[k] || 0) >= .5);
    const battles = (S.battles || []).filter(b => b.tile === i).slice().reverse();
    const el = document.createElement("div"); el.className = "insp-tile";
    el.innerHTML = `<div class="head"><span class="swatch" style="background:${TERRAIN[t.terrain][1]}"></span><div class="grow"><h3>${esc(TERRAIN[t.terrain][0])}</h3>
        <div class="meta">ô ${i % geo.N}, ${(i / geo.N) | 0} · ${ZONE[t.zone]} · ${esc(REGION[t.region] || "ngoài khơi")}${typeof t.elev === "number" ? ` · độ cao ${t.elev.toFixed(2)}` : ""}</div></div>
        <button type="button" class="icon" data-act="unpin" aria-label="Bỏ chọn ô" title="Bỏ chọn (Esc)">×</button></div>
      <div class="chips">${t.river ? "<span>Sông</span>" : ""}${t.delta ? "<span>Châu thổ</span>" : ""}${t.land ? "" : "<span>Biển</span>"}${t.road ? `<span>🛤 ${esc(t.land ? S.roadLevels[t.road - 1].name : S.roadLevels[t.road - 1].lane)}</span>` : ""}${capOf ? `<span>Thủ đô ${esc(capOf.capitalName || nationName(capOf))}</span>` : ""}${stl ? `<span>Điểm định cư ${esc(stl.name)}</span>` : ""}${inWild(i) ? "<span>Vùng hoang</span>" : ""}${ST.herd?.includes(i) ? "<span>Điểm dừng đàn bò rừng</span>" : ""}${w ? `<span class="wonder">Kỳ quan: ${esc(w.name)}</span>` : ""}</div>
      <h4>Trữ lượng</h4>
      ${keys.length ? `<table class="res"><tr><th>Tài nguyên</th><th>Hiện có</th><th>Tối đa</th></tr>${keys.map(k => `<tr><td>${esc(RES[k] ?? k)}${HIDDEN_RES.has(k) ? ` <span class="pill">ẩn với AI</span>` : ""}</td><td class="mono">${Math.round(t.res?.[k] || 0)}</td><td class="mono">${Math.round(t.cap?.[k] || 0)}</td></tr>`).join("")}</table>` : `<p class="note">Không có trữ lượng.</p>`}
      <h4>Mối đe dọa ở ô này</h4>${threatList(t.threats || [], "Không có gì đáng ngại.")}
      <h4>Trận đánh ở ô này</h4>
      ${battles.length ? `<ol class="chronicle">${battles.map(b => `<li><span class="t">${b.tick}</span><span>${esc(nm(b.attacker))} ${b.kind === "raid" ? "đột kích" : "tấn công"} ${esc(nm(b.defender))}: ${b.won ? "thắng" : "thua"} (${b.a} vs ${b.d}), thương vong ${b.lossA}/${b.lossD}</span></li>`).join("")}</ol>` : `<p class="note">Chưa có trận nào gần đây.</p>`}
      <h4>Chủ sở hữu</h4>${owner ? "" : `<p class="note">Vô chủ.</p>`}`;
    el.querySelector("[data-act=unpin]").onclick = () => pinTile(-1);
    if (owner) el.append(nationBlock(owner, i));
    box.replaceChildren(el);
  }

  // ---------------------------------------------------------------- nations
  const MODEL_NAME = { haiku: "Haiku", sonnet: "Sonnet" };
  const modelLabel = n => n.provider === "claude" ? `Claude ${MODEL_NAME[n.model] ?? n.model}${n.effort ? ` · ${n.effort}` : ""}` : n.model;
  const traitTag = n => n.trait ? `<div class="trait" title="${esc(n.trait.lines.join(" · "))}">${esc(n.trait.icon)} <b>${esc(n.trait.name)}</b> · <span class="muted">${esc(n.trait.lines.join(", "))}</span></div>` : "";
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
      el.innerHTML = `<div class="head"><span class="flag"></span><div class="grow"><div class="name">${esc(nationName(n))}</div><div class="model">${esc(modelLabel(n))} · ${esc(n.era)}</div></div>${statusPill(n)}</div>
        ${traitTag(n)}
        ${(n.officials || []).length ? `<div class="trait">👑 ${(n.officials || []).map(o => `${DOMAIN_ICON[o.domain] || ""} ${esc(o.name)}`).join(" · ")}</div>` : ""}
        <div class="kv"><div><b>${n.population}</b><span>dân</span></div><div><b>${Math.round(n.stock.food || 0)}</b><span>lương thực</span></div><div><b>${n.stability}</b><span>ổn định</span></div><div><b>${n.governed ?? n.tiles}/${n.tileLimit}</b><span>ô${n.waters ? ` (${n.waters} biển)` : ""}</span></div><div><b>${n.inventions.length}</b><span>phát minh</span></div></div>
        ${n.research ? `<div class="muted" style="font-size:12px">Nghiên cứu ${esc(n.research.name)} · ${n.research.progress}/${n.research.cost} RP</div><div class="bar" role="progressbar" aria-label="Tiến độ nghiên cứu" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>` : ""}
        ${(() => { const top = (n.threats || []).find(t => t.level >= 2); return top && n.alive ? `<div class="threat-tag lv${top.level}" title="${esc(top.detail)}">⚠ ${esc(top.title)}</div>` : ""; })()}
        ${n.thought ? `<div class="thought">“${esc(n.thought)}”</div>` : ""}
        <div class="row actions"><button type="button" data-act="locate"${n.alive ? "" : " disabled"}>Xem trên bản đồ</button><button type="button" data-act="detail">Chi tiết</button></div>`;
      el.querySelector(".flag").replaceWith(flagCanvas(n.flag));
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
  async function openNation(id) {
    const n = S.nations[id], d = $("#nation-dialog");
    const turns = await api(`/api/nation/${id}/turns?limit=5`).catch(() => []);
    const chipsOf = list => list.length ? `<div class="chips">${list.map(x => `<span>${esc(x)}</span>`).join("")}</div>` : `<p class="note">—</p>`;
    const labor = Object.entries(n.labor).filter(([, v]) => v).map(([k, v]) => `${ROLE[k] ?? k} ${v}`);
    const stock = Object.entries(n.stock).map(([k, v]) => `${RES[k] ?? k} ${v}`);
    const intel = Object.entries(n.intel || {}).map(([oid, it]) => `<div class="card2"><div class="row"><b>${esc(S.nations[oid]?.name)}</b><span style="flex:1"></span><span class="meta">mức ${it.level} · tin từ lượt ${it.asOf}</span></div><div class="meta">${intelText(it.report)}</div></div>`).join("");
    const relations = Object.entries(n.relations || {}).filter(([, r]) => r !== "chưa biết");
    const threatsN = (n.threats || []).filter(t => t.level >= 2).length;
    $("#nation-detail").innerHTML = `
      <div class="row dlg-top"><span class="flagbig"></span><div><h2>${esc(n.name)}</h2><div class="muted">${esc(n.people)} · thủ đô ${esc(n.capitalName)} · ${esc(modelLabel(n))}</div></div><span style="flex:1"></span>${statusPill(n)}<button id="dlg-close">Đóng</button></div>
      <div class="subtabs" data-key="nation">
        <nav class="seg"><button data-sub="overview">Tổng quan</button><button data-sub="court">Triều đình <span class="cnt">${(n.officials || []).length || ""}</span></button><button data-sub="economy">Kinh tế</button><button data-sub="threats">Đe dọa ${threatsN ? `<span class="cnt hot">${threatsN}</span>` : ""}</button><button data-sub="foreign">Đối ngoại <span class="cnt">${relations.length || ""}</span></button><button data-sub="log">Nhật ký AI</button></nav>
        <section data-sub="overview">
          ${n.manifesto ? `<p class="manifesto">“${esc(n.manifesto)}”</p>` : ""}
          <div class="kv kv6"><div><b>${n.population}</b><span>dân</span></div><div><b>${Math.round(n.stock.food || 0)}</b><span>lương thực</span></div><div><b>${n.stability}</b><span>ổn định</span></div><div><b>${n.governed ?? n.tiles}/${n.tileLimit}</b><span>ô${n.waters ? ` (${n.waters} biển)` : ""}</span></div><div><b>${n.inventions.length}</b><span>phát minh</span></div><div><b>${n.reputation}</b><span>uy tín</span></div></div>
          <h3>Kỷ nguyên: ${esc(n.era)}</h3>${n.nextEra ? `<p class="muted">Để sang <b>${esc(n.nextEra.era)}</b> còn cần: ${esc(n.nextEra.missing.join(", ") || "đã đủ, sẽ sang ở lượt sau")}</p>` : `<p class="muted">Đã tới kỷ nguyên cuối.</p>`}
          ${n.trait ? `<h3>Đặc thù: ${esc(n.trait.icon)} ${esc(n.trait.name)}</h3><p>${esc(n.trait.desc)} <span class="muted">${esc(n.trait.lines.join(" · "))}</span></p>` : ""}
          ${n.provider === "claude" && n.alive ? `<h3>Model</h3><div class="model-pick"><label class="sr-only" for="dlg-model">Model</label><select id="dlg-model"></select><label class="sr-only" for="dlg-effort">Effort</label><select id="dlg-effort"></select><button type="button" id="dlg-model-save">Lưu</button><span class="note" id="dlg-model-msg">Áp dụng từ lượt sau.</span></div>` : ""}
          ${n.statusNote ? `<p class="note">Ghi chú: ${esc(n.statusNote)}</p>` : ""}
          <h3>Suy nghĩ lượt này</h3><p class="thought">${n.thought ? `“${esc(n.thought)}”` : "—"}</p>
          <h3>Sự kiện lượt trước</h3>${(n.events || []).length ? `<ul class="plain">${n.events.map(e => `<li>${esc(e)}</li>`).join("")}</ul>` : `<p class="note">—</p>`}
          ${(n.rejected || []).length ? `<h3>Hành động bị từ chối</h3><ul class="plain">${n.rejected.map(r => `<li><b>${esc(ACTION[r.action] ?? r.action)}</b>: ${esc(r.reason)}</li>`).join("")}</ul>` : ""}
          ${n.formerNames?.length ? `<p class="muted">Tên cũ: ${esc(n.formerNames.join(" → "))}</p>` : ""}
        </section>
        <section data-sub="court"><p class="muted">${(n.officials || []).length}/${n.courtSlots ?? 0} chỗ quan chức.</p>${courtList(n)}</section>
        <section data-sub="economy">
          <h3>Lao động</h3>${chipsOf(labor)}
          <h3>Kho</h3>${chipsOf(stock)}
          <h3>Tài nguyên</h3>${resTable(n)}
          <h3>Công trình</h3>${chipsOf(n.buildings.map(b => `${b.name}${b.done ? "" : " (đang xây)"}`))}
          <h3>Điểm định cư</h3>${chipsOf((n.settlements || []).map(x => `${x.name}${x.road ? " 🛤" : ""}`))}
          ${n.roadNet ? `<h3>Đường sá & lãnh hải</h3><p class="note">${n.roadNet.tiles} ô đường nối các trung tâm (+${Math.min(10, Math.floor(n.roadNet.tiles / 4))} giới hạn ô) · ${n.roadNet.linked.length}/${(n.settlements || []).length} điểm định cư đã nối thủ đô (🛤) · cấp tối đa: ${esc(S.roadLevels[n.roadNet.level - 1].name)} / ${esc(S.roadLevels[n.roadNet.level - 1].lane)}${n.roadNet.works ? ` · ${n.roadNet.works} ô đang làm` : ""}${n.waters ? ` · ${n.waters} ô lãnh hải` : ""}</p>` : ""}
          <h3>Phát minh (${n.inventions.length})</h3>${chipsOf(n.inventions.map(v => v.name))}
        </section>
        <section data-sub="threats">${threatList(n.threats || [], "Không có mối đe dọa nào.")}</section>
        <section data-sub="foreign">
          <h3>Quan hệ</h3>${relations.length ? `<div class="chips">${relations.map(([oid, r]) => `<span class="rel ${relClass(r)}">${esc(nm(oid))} · ${esc(r)}</span>`).join("")}</div>` : `<p class="note">Chưa gặp ai.</p>`}
          <h3>Hộp thư lượt này (do nước khác viết)</h3>${(n.inbox || []).map(m => `<div class="card2"><b>${esc(m.fromName)}${m.gesture ? " (cử chỉ)" : ""}</b><div>${esc(m.text)}</div></div>`).join("") || `<p class="note">—</p>`}
          <h3>Tình báo về nước khác</h3>${intel || `<p class="note">Chưa có tin tình báo.</p>`}
        </section>
        <section data-sub="log">
          <p class="mono muted">gọi ${n.stats.calls} · hợp lệ ${n.stats.ok} · hành động sai ${n.stats.invalid} · lượt ngủ ${n.stats.asleepTicks} · lượt im lặng ${n.stats.silentTicks}</p>
          <h3>Bản ghi nhớ (AI tự viết)</h3><pre>${esc(n.memory || "—")}</pre>
          <h3>5 lượt gần nhất</h3>${turns.map(turnCard).join("") || "<p>—</p>"}
        </section>
      </div>`;
    initSubtabs($("#nation-detail"));
    $("#nation-detail .flagbig").replaceWith(flagCanvas(n.flag, 72, 48));
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
    d.showModal();
  }

  // ---------------------------------------------------------------- the court (§4.6)
  const DOMAIN_ICON = { governor: "🏰", general: "⚔", agriculture: "🌾", scholar: "📜", merchant: "🪙", builder: "🔨", explorer: "🧭" };
  function courtList(n) {
    const c = n.officials || [];
    if (!c.length) return `<p class="note">Chưa bổ nhiệm ai.</p>`;
    return `<ul class="court">${c.map(o => `<li><span class="i">${DOMAIN_ICON[o.domain] || "👤"}</span><div><b>${esc(o.title)} ${esc(o.name)}</b>${o.seat !== null && o.seat !== undefined ? ` <span class="muted">giữ (${o.seat % ST.n}, ${(o.seat / ST.n) | 0})</span>` : ""}
      <div class="meta">tay nghề ${"★".repeat(o.skill)}${"☆".repeat(5 - o.skill)} · trung thành <span class="${o.loyalty < 30 ? "bad" : o.loyalty < 50 ? "warn" : ""}">${o.loyalty}</span> · từ lượt ${o.since}</div>
      <div class="meta">Lượt trước: ${esc(o.lastAct)}</div></div></li>`).join("")}</ul>`;
  }

  // ---------------------------------------------------------------- threats and resources (§9.4)
  const LEVEL = ["ghi nhận", "để ý", "nghiêm trọng", "khẩn cấp"];
  function threatList(list, empty) {
    if (!list.length) return `<p class="note">${esc(empty)}</p>`;
    return `<ul class="threats">${list.map(t => `<li class="lv${t.level}"><span class="pill ${["", "", "warn", "bad"][t.level]}">${LEVEL[t.level]}</span> <b>${esc(t.title)}</b> <span class="d">${esc(t.detail)}</span></li>`).join("")}</ul>`;
  }
  function resChips(n) {
    const lines = n.resources?.territory || [];
    if (!lines.length) return `<p class="note">Không có.</p>`;
    return `<div class="chips">${lines.map(l => `<span title="${l.regrows ? "tái tạo dần" : "không tái tạo"}${l.hidden ? "; AI của nước này chưa nhìn thấy" : ""}">${esc(RES[l.key] ?? l.key)} ${l.left}/${l.max}${l.regrows ? " ↻" : ""}${l.hidden ? " (ẩn)" : ""}</span>`).join("")}</div>`;
  }
  function resTable(n) {
    const r = n.resources; if (!r) return "<p>—</p>";
    const near = Object.entries(r.nearest || {});
    return `${resChips(n)}
      ${r.missing?.length ? `<p class="muted">Không có trên lãnh thổ: ${esc(r.missing.join(", "))}.</p>` : ""}
      ${near.length ? `<table class="res"><tr><th>Tài nguyên</th><th>Ô vô chủ gần nhất đã thấy</th><th>Cách thủ đô</th><th>Trữ lượng</th></tr>${near.map(([k, v]) => `<tr><td>${esc(RES[k] ?? k)}</td><td class="mono">${v.tile.join(", ")}</td><td class="mono">${v.dist} ô</td><td class="mono">${v.amount}</td></tr>`).join("")}</table>` : ""}`;
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
  };
  const KEY = { tile: "ô", target: "nhắm", to: "gửi", warriors: "chiến binh", people: "người", direction: "hướng", from: "từ", invention: "phát minh", type_: "loại", building: "công trình", name: "tên", text: "nội dung", kind: "loại", duration: "thời hạn", offer: "đề nghị", give: "đưa", get: "nhận", horde: "bộ lạc", title: "tiêu đề", reason: "lý do", category: "loại", capital: "thủ đô", people_: "dân tộc", tribute: "cống phẩm", payer: "bên nộp" };
  function val(v) {
    if (Array.isArray(v) && v.length === 2 && v.every(x => typeof x === "number")) return `(${v[0]}, ${v[1]})`;
    if (v && typeof v === "object") return Object.entries(v).map(([k, q]) => typeof q === "number" ? `${q} ${RES[k] ?? k}` : `${k}: ${val(q)}`).join(", ");
    return String(v);
  }
  function actionLine(a) {
    if (!a || typeof a !== "object") return esc(String(a));
    if (a.type === "propose_invention") return `<b>${ACTION[a.type]}</b> “${esc(a.name)}”: ${esc(a.description || "")}${effectList(Array.isArray(a.effects) ? a.effects : [])}`;
    const rest = Object.entries(a).filter(([k]) => k !== "type" && k !== "flag" && k !== "manifesto").map(([k, v]) => `${KEY[k] ?? k} ${esc(val(v))}`).join(" · ");
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
    if (!rep) return "—";
    return Object.entries(rep).filter(([k, v]) => v !== undefined && !["flag", "tiles_seen"].includes(k)).map(([k, v]) => `${esc(INTEL[k] ?? k)}: ${esc(Array.isArray(v) ? v.join(", ") : val(v))}`).join("<br>");
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
    road: "nation", treaty: "diplo", trade: "diplo", contact: "diplo", petition: "diplo", decree: "diplo",
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
  function renderPetitions() {
    const list = S.petitions.slice().sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || b.id - a.id);
    const pending = list.filter(p => p.status === "pending").length, badge = $("#pet-count");
    badge.hidden = !pending; badge.textContent = pending;
    const box = $("#petitions"); box.innerHTML = list.length ? "" : `<p class="note">Chưa có thỉnh nguyện nào.</p>`;
    for (const p of list) {
      const n = S.nations[p.nation], [st, cls] = PSTATUS[p.status];
      const el = document.createElement("article"); el.className = "petition";
      el.innerHTML = `<div class="row"><h3></h3><span style="flex:1"></span><span class="pill ${cls}">${st}</span></div>
        <div class="meta">#${p.id} · ${esc(n?.name)} · lượt ${p.tick} · loại ${esc(p.category)} · lúc gửi: ${p.context.population} dân, ${p.context.food} lương thực, ổn định ${p.context.stability}, ${p.context.tiles} ô</div>
        <div class="body"></div><div class="meta reason"></div>
        ${p.status === "pending" ? `<textarea rows="2" placeholder="Lời phán của các vị thần (gửi lại cho quốc gia này)"></textarea>
        <div class="row"><button data-s="accepted" class="primary">Chấp thuận</button><button data-s="partial">Một phần</button><button data-s="rejected">Bác bỏ</button><button data-act="decree">Soạn Sắc lệnh</button><button data-act="ask">Hỏi Claude</button></div>`
        : `<div class="meta">Lời phán: ${esc(p.verdict || "—")}</div>`}`;
      el.querySelector("h3").textContent = p.title;
      el.querySelector(".body").textContent = p.text;
      el.querySelector(".reason").textContent = p.reason ? `Lý do: ${p.reason}` : "";
      for (const b of el.querySelectorAll("button[data-s]")) b.onclick = async () => {
        await api(`/api/petitions/${p.id}`, { method: "POST", body: { status: b.dataset.s, verdict: el.querySelector("textarea").value } }).catch(e => alertMsg(e.message));
        refresh();
      };
      const dec = el.querySelector("button[data-act=decree]");
      if (dec) dec.onclick = () => { $("#decree-text").value = p.text.slice(0, 1000); $("#decree-from").value = p.id; document.querySelector('.tabs button[data-tab="decrees"]').click(); };
      const ask = el.querySelector("button[data-act=ask]");
      if (ask) ask.onclick = () => { document.querySelector('.tabs button[data-tab="chat"]').click(); $("#chat-input").value = `Phân tích thỉnh nguyện #${p.id} "${p.title}": có nên chấp thuận không, tác động lên cân bằng và công bằng ra sao, và nếu chấp thuận thì Sắc lệnh nên viết thế nào?`; $("#chat-input").focus(); };
      box.append(el);
    }
  }
  function renderDecrees() {
    $("#decrees").innerHTML = S.decrees.slice().reverse().map(d => `<li><b>${esc(d.code)}</b> · lượt ${d.tick} · ${esc(d.kind)}<br>${esc(d.text)}</li>`).join("") || `<li class="note">Chưa có Sắc lệnh.</li>`;
  }
  function alertMsg(m) { $("#decree-msg").textContent = m; }
  $("#decree-form").onsubmit = async e => {
    e.preventDefault();
    try { await api("/api/decrees", { method: "POST", body: { kind: $("#decree-kind").value, text: $("#decree-text").value, fromPetition: $("#decree-from").value || null } }); $("#decree-text").value = ""; $("#decree-from").value = ""; alertMsg("Đã ban Sắc lệnh."); refresh(); }
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
      case "combat": return ["⚔", `chiến đấu +${e.percent}%`];
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

  function renderInventions() {
    const props = (S.proposals || []).slice().reverse();
    const pending = props.filter(p => p.status === "pending").length, badge = $("#prop-count");
    badge.hidden = !pending; badge.textContent = pending;
    const box = $("#proposals"), pbox = $("#proposals-pending"), decidedN = props.length - pending;
    box.innerHTML = decidedN ? "" : `<p class="note">Chưa có đơn nào được quyết.</p>`;
    pbox.innerHTML = pending ? "" : `<p class="note">Không có đơn nào đang chờ.</p>`;
    setCount("inventions", "pending", pending); setCount("inventions", "decided", decidedN); setCount("inventions", "book", (S.customInventions || []).length);
    const ST2 = { pending: ["Chờ trọng tài", "warn"], approved: ["Được duyệt", "ok"], rejected: ["Bị bác", "bad"], duplicate: ["Trùng", ""] };
    const open = new Set([...document.querySelectorAll("#proposals details[open]")].map(d => d.dataset.id));
    for (const p of props) {
      const [st, cls] = ST2[p.status], r = p.ruling, decided = p.status !== "pending";
      // Pending ones stay open for a decision; decided ones fold into one line (click to read)
      const el = document.createElement(decided ? "details" : "article"); el.className = `card2 prop${decided ? " decided" : ""}`;
      el.dataset.id = p.id; if (open.has(String(p.id))) el.open = true;
      const head = `<b class="pname"></b><span class="meta">${esc(nm(p.nation))} · lượt ${p.tick}</span><span style="flex:1"></span><span class="pill ${cls}">${st}</span>`;
      el.innerHTML = `${decided ? `<summary class="row">${head}</summary>` : `<div class="row">${head}</div>`}
        <div class="meta">#${p.id} · độ sâu ${p.depth} · ${p.power} điểm · tiên quyết ${esc(p.prereqs.join(", "))}${p.caps.length ? ` · năng lực ${esc(p.caps.join(", "))}` : ""}</div>
        <div class="pdesc"></div>${effectList(p.effects)}
        ${r ? `<div class="meta">Trọng tài ${esc(r.judge)}: nhân quả ${r.causality}/2, vật chất ${r.material}/2, vật lý ${r.physics}/2${r.add_prereqs?.length ? ` · thêm tiên quyết ${esc(r.add_prereqs.join(", "))}` : ""}${r.remove_effects?.length ? ` · bỏ hiệu ứng số ${r.remove_effects.map(i => i + 1).join(", ")}` : ""} — ${esc(r.reason)}</div>` : ""}
        ${p.status === "pending" ? `<div class="row"><input type="text" placeholder="Lý do (tùy chọn)" style="flex:1"><button class="primary" data-a="1">Duyệt</button><button data-a="0">Bác</button></div>` : ""}`;
      el.querySelector(".pname").textContent = p.name;
      el.querySelector(".pdesc").textContent = p.description;
      for (const b of el.querySelectorAll("button[data-a]")) b.onclick = async () => {
        await api(`/api/proposals/${p.id}`, { method: "POST", body: { approve: b.dataset.a === "1", reason: el.querySelector("input").value } }).catch(e => alert(e.message));
        b.textContent = "Đã ghi, áp dụng lượt sau"; b.disabled = true;
      };
      (decided ? box : pbox).append(el);
    }
    const cbox = $("#custom-inventions"), list = (S.customInventions || []).slice().reverse();
    cbox.innerHTML = list.length ? "" : `<p class="note">Chưa có phát minh mới nào được công nhận.</p>`;
    for (const v of list) {
      const el = document.createElement("article"); el.className = "card2";
      el.innerHTML = `<div class="row"><b class="vname"></b><span class="meta">${esc(v.id)} · độ sâu ${v.depth} · ${v.rp} RP</span></div>
        <div class="meta">Phát minh bởi ${esc(nm(v.by))} ở lượt ${v.tick} · tiên quyết ${esc(v.prereqs.map(p => p.name).join(", "))}${v.caps.length ? ` · năng lực ${esc(v.caps.join(", "))}` : ""}</div>
        <div class="vdesc"></div><div class="meta">Hiệu ứng: ${esc(v.effects || "—")}</div>`;
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
  function relClass(r) { return /chiến/.test(r) ? "war" : /liên minh|tông chủ|chư hầu/.test(r) ? "ally" : /hòa bình|bất tương/.test(r) ? "peace" : ""; }
  function renderDiplomacy() {
    const alive = S.nations.filter(n => n.founded && n.alive);
    // one card per nation: who it knows and how (strangers are only counted)
    $("#relations").innerHTML = alive.map(a => {
      const known = alive.filter(b => b.id !== a.id && (a.relations?.[b.id] ?? "chưa biết") !== "chưa biết");
      const strangers = alive.length - 1 - known.length;
      return `<div class="card2 rel-card"><div class="row"><i class="sw" style="background:${esc(a.flag.colors[0])}"></i><b>${esc(a.name)}</b><span style="flex:1"></span><span class="meta">${known.length ? `biết ${known.length}${strangers ? `, chưa gặp ${strangers}` : ""}` : "chưa gặp ai"}</span></div>
        ${known.length ? `<div class="chips">${known.map(b => { const r = a.relations[b.id]; return `<span class="rel ${relClass(r)}" title="${esc(`${a.name} và ${b.name}: ${r}${a.trades?.[b.id] ? `, ${a.trades[b.id]} lần buôn` : ""}`)}"><i class="sw" style="background:${esc(b.flag.colors[0])}"></i>${esc(b.name)} · ${esc(r)}${a.trades?.[b.id] ? ` · 🤝${a.trades[b.id]}` : ""}</span>`; }).join("")}</div>` : ""}</div>`;
    }).join("") || `<p class="note">Chưa có quốc gia nào lập quốc.</p>`;
    const maxH = Math.max(1, ...(S.hordes || []).map(h => h.strength));
    $("#hordes").innerHTML = (S.hordes || []).map(h => `<div class="card2 horde${h.alive ? "" : " gone"}"><div class="row"><b>☠ ${esc(h.name)}</b><span style="flex:1"></span><button type="button" class="link" data-tile="${h.tile}" title="Xem trên bản đồ">(${h.tile % ST.n}, ${(h.tile / ST.n) | 0}) ↗</button></div>
      ${h.alive ? `<div class="bar" title="sức mạnh ${h.strength}"><i style="width:${Math.round(h.strength / maxH * 100)}%;background:var(--bad)"></i></div><div class="meta">sức mạnh <b>${h.strength}</b>${h.lastRaid ? ` · lượt ${h.lastRaid.tick} cướp ${esc(nm(h.lastRaid.nation))}: ${h.lastRaid.won ? "thắng" : "bị đẩy lui"}` : " · chưa cướp ai"}</div>` : `<div class="meta">đã bị đánh tan, trở lại lượt ${h.returns}</div>`}</div>`).join("") || `<p class="note">Thế giới này không có man di.</p>`;
    for (const b of document.querySelectorAll("#hordes [data-tile]")) b.onclick = () => centerOn(+b.dataset.tile);
    const cars = S.caravans || [];
    $("#caravans").innerHTML = cars.map(c => `<div class="card2"><div class="row"><b>${c.mode === "water" ? "⛵" : "🐂"} ${esc(nm(c.from))} → ${esc(nm(c.to))}</b><span style="flex:1"></span><span class="meta">tới lượt ${c.arrive}</span></div>
      <div class="meta">${esc(Object.entries(c.goods || {}).map(([k, q]) => `${Math.round(q * 10) / 10} ${RES[k] ?? k}`).join(", "))}${c.porters ? ` · ${c.porters} người khuân vác` : ""}${c.boats ? ` · ${c.boats} thuyền` : ""}</div></div>`).join("") || `<p class="note">Không có đoàn buôn nào trên đường.</p>`;
    setCount("diplomacy", "war", (S.wars || []).length); setCount("diplomacy", "treaties", (S.treaties || []).length);
    setCount("diplomacy", "hordes", (S.hordes || []).filter(h => h.alive).length); setCount("diplomacy", "trade", cars.length);
    $("#wars").innerHTML = (S.wars || []).map(w => `<div class="card2"><b>${esc(w.aName)} ⚔ ${esc(w.bName)}</b><span class="meta">tuyên chiến lượt ${w.declared}, giao tranh từ lượt ${w.start}${w.reason ? ` · ${esc(w.reason)}` : ""}</span></div>`).join("") || `<p class="note">Thế giới đang yên bình.</p>`;
    const TN = { non_aggression: "bất tương xâm", passage: "đi lại", alliance: "liên minh", peace: "hòa bình", tribute: "cống nạp", vassal: "chư hầu" };
    $("#treaties").innerHTML = (S.treaties || []).map(t => `<div class="card2"><b>#${t.id} ${esc(TN[t.type] || t.type)}: ${esc(t.aName)} — ${esc(t.bName)}</b><span class="meta">từ lượt ${t.start}${t.end ? ` đến ${t.end}` : ", vĩnh viễn"}${Object.keys(t.tribute || {}).length ? ` · ${esc(t.aName)} nộp ${esc(Object.entries(t.tribute).map(([k, q]) => `${q} ${RES[k] ?? k}`).join(", "))}/lượt` : ""}</span></div>`).join("") || `<p class="note">Chưa có hiệp ước.</p>`;
    $("#battles").innerHTML = (S.battles || []).slice().reverse().map(b => `<li><span class="t">${b.tick}</span><span>${esc(nm(b.attacker))} ${b.kind === "raid" ? "đột kích" : "tấn công"} ${esc(nm(b.defender))}: ${b.won ? "thắng" : "thua"} (${b.a} vs ${b.d}), thương vong ${b.lossA}/${b.lossD}${b.note ? ` · ${esc(b.note)}` : ""}</span></li>`).join("") || `<li class="note">Chưa có trận đánh.</li>`;
  }

  // ---------------------------------------------------------------- stats
  let statsCache = null;
  async function renderStats() {
    statsCache = await api("/api/stats").catch(() => []);
    drawChart();
    // the Engine scores the world (§9.3); the Watcher only shows it
    const PARTS = [["people", "Dân", "Dân số"], ["land", "Đất", "3 điểm mỗi ô"], ["knowledge", "Tri thức", "Phát minh đã biết, sâu hơn đáng giá hơn"], ["firsts", "Đầu tiên", "Phát minh đầu tiên trên thế giới"], ["inventor", "Sáng tạo", "Phát minh tự đề xuất được công nhận"], ["honour", "Uy tín", "Uy tín"], ["age", "Tuổi", "Số thập kỷ tồn tại"]];
    const rows = S.ranking || [];
    // one row per nation: score, and a bar split by where the points come from (hover a piece for its value)
    const COL = ["#4cc283", "#c9a227", "#3fb3cf", "#ffd84a", "#c77dff", "#ff8f6b", "#98a7a1"];
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
        const bc = v => { const ps = v.prereqs.filter(p => byId[p]); return ps.length ? ps.reduce((a, p) => a + yOf[p], 0) / ps.length : yOf[v.id]; };
        const key = Object.fromEntries(cols[d].map(v => [v.id, bc(v)]));
        cols[d].sort((a, b) => key[a.id] - key[b.id] || a.id.localeCompare(b.id)); place(cols[d]);
      }
    }
    const xOf = v => PAD + v.depth * (W + GX);
    const width = PAD * 2 + cols.length * W + (cols.length - 1) * GX, height = TOP + PAD + maxLen * (H + GY) - GY;
    let edges = "", nodes = "";
    for (const v of list) for (const p of v.prereqs) {
      const u = byId[p]; if (!u) continue;
      const x1 = xOf(u) + W, y1 = yOf[u.id] + H / 2, x2 = xOf(v), y2 = yOf[v.id] + H / 2, mx = (x1 + x2) / 2;
      edges += `<path class="edge" data-from="${esc(u.id)}" data-to="${esc(v.id)}" d="M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"/>`;
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
      nodes += `<g class="node${v.custom ? " custom" : ""}${own.length ? " owned" : ""}" data-id="${esc(v.id)}" tabindex="0" role="img" aria-label="${esc(aria)}">
        <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="6"/>
        ${lines.map((l, k) => `<text class="nm" x="${x + 6}" y="${(y + 4 + fontPx + k * fontPx * 1.25).toFixed(1)}" style="font-size:${fontPx}px">${esc(l)}</text>`).join("")}
        ${v.custom ? `<text class="star" x="${x + W - 5}" y="${y + fontPx + 3}" text-anchor="end" aria-hidden="true">★</text>` : ""}
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
    for (const v of Object.values(byId)) for (const p of v.prereqs) (kids[p] ||= []).push(v.id);
    const walk = (set, next) => { const st = [id]; while (st.length) { const x = st.pop(); for (const y of next(x)) if (!set.has(y)) { set.add(y); st.push(y); } } };
    walk(up, x => byId[x]?.prereqs || []); walk(down, x => kids[x] || []);
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
      tip.innerHTML = `<b></b>${v.custom ? ` <span class="pill warn">do các nước tạo</span>` : ""}
        <div class="meta">${esc(id)} · độ sâu ${v.depth}${v.rp ? ` · ${v.rp} RP` : " · khởi đầu"}${v.caps.length ? ` · năng lực ${esc(v.caps.join(", "))}` : ""}</div>
        <p class="desc"></p>
        ${v.prereqs.length ? `<div class="meta">Cần: ${esc(v.prereqs.map(p => byId[p]?.name ?? p).join(", "))}</div>` : ""}
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

  // ---------------------------------------------------------------- data flow
  async function refresh() {
    S = await api("/api/state");
    applyStatus(S); render(); renderSummary(); renderNations(); renderPetitions(); renderDecrees(); renderInventions(); renderDiplomacy();
    if (DOCKS.right.open && curTab === "stats") renderStats();
    renderTrees();
    if (DOCKS.right.open && curTab === "inspect") renderInspector();
  }
  function legend() {
    $("#legend").innerHTML = Object.entries(TERRAIN).filter(([k]) => k !== "ocean").map(([, [n, c]]) => `<span><i style="background:${c}"></i>${n}</span>`).join("") + `<span><i style="background:#5fb4e6"></i>Sông</span><span><i style="background:#ffd84a;border-radius:50%"></i>Kỳ quan</span>` +
      `<span><i class="lg-wild"></i>Vùng hoang</span><span><i class="lg-herd"></i>Tuyến bò rừng</span><span><i class="lg-caravan"></i>Đoàn buôn</span><span><i class="lg-battle">×</i>Trận đánh</span>`;
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
    addChronicle(await api("/api/chronicle?limit=200"), false);
    ensureAnim();
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
