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
  };
  const ZONE = { cold: "Hàn đới", temp: "Ôn đới", trop: "Nhiệt đới" };
  const RES = { game: "thú săn", plants: "cây dại", fish: "cá", wood: "gỗ", stone: "đá", flint: "đá lửa", clay: "đất sét", salt: "muối", reeds: "sậy", copper: "quặng đồng", tin: "quặng thiếc", iron: "sắt", food: "lương thực", fiber: "sợi", hide: "da", bone: "xương", stone_tool: "công cụ đá", blade: "lưỡi đá", rope: "dây thừng", hide_coat: "áo da", spear: "giáo", bow: "cung tên", axe: "rìu", pottery: "gốm", cloth: "vải" };
  const ROLE = { gather: "hái lượm", hunt: "săn", fish: "cá", farm: "nông", wood: "gỗ", stone: "đá", flint: "đá lửa", clay: "đất sét", craft: "chế tác", build: "xây", research: "nghiên cứu", warrior: "chiến binh" };

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
  const WILD_R = 4; // hexes around each wilderness centre shown as "vùng hoang"

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
  const nationName = n => n.founded ? n.name : `Bộ lạc ${n.id + 1}`;

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

    // territory tint
    g.globalAlpha = .42;
    S.owners.forEach((o, i) => { if (o < 0 || !vis(i)) return; const [x, y] = center(i); hexPath(g, x, y, s * 1.02); g.fillStyle = nationColor(o); g.fill(); });
    g.globalAlpha = 1;
    // borders
    g.lineWidth = clamp(s * .22 * z, 1.5, 5) * px;
    S.owners.forEach((o, i) => {
      if (o < 0 || !vis(i)) return;
      const [x, y] = center(i), nb = NB(i);
      g.strokeStyle = nationColor(o); g.beginPath();
      for (let k = 0; k < 6; k++) {
        if (nb[k] >= 0 && S.owners[nb[k]] === o) continue;
        // edge k faces neighbour direction k: E, NE, NW, W, SW, SE
        const a1 = Math.PI / 180 * ([0, -60, -120, 180, 120, 60][k] - 30), a2 = a1 + Math.PI / 3;
        g.moveTo(x + s * Math.cos(a1), y + s * Math.sin(a1)); g.lineTo(x + s * Math.cos(a2), y + s * Math.sin(a2));
      }
      g.stroke();
    });
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
    // caravans: a parcel riding the road between the two capitals
    const cars = S.caravans || [];
    cars.forEach((c, k) => {
      const A = S.nations[c.from], B = S.nations[c.to]; if (!A || !B) return;
      const [x1, y1] = center(A.capital), [x2, y2] = center(B.capital);
      const total = Math.max(1, Math.ceil(hexDist(A.capital, B.capital) / 8)), prog = clamp(1 - (c.arrive - S.tick) / total, .12, .88);
      g.save(); g.setLineDash([3 * px, 4 * px]); g.lineWidth = 1.5 * px; g.strokeStyle = "rgba(255,240,205,.7)";
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.restore();
      const off = (k % 3 - 1) * 5 * px, len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const x = x1 + (x2 - x1) * prog - (y2 - y1) / len * off, y = y1 + (y2 - y1) * prog + (x2 - x1) / len * off, r = 4.5 * px;
      g.fillStyle = nationColor(c.from); g.strokeStyle = "#0b1a22"; g.lineWidth = 1.5 * px;
      g.beginPath(); g.rect(x - r, y - r * .8, r * 2, r * 1.6); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(x - r, y - r * .8); g.lineTo(x, y); g.lineTo(x + r, y - r * .8); g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = px; g.stroke();
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
      ${owner ? `<br>Thuộc <b>${esc(nationName(owner))}</b>` : ""}${w ? `<br>Kỳ quan: <b>${esc(w.name)}</b>` : ""}${inWild(i) ? `<br><span class="muted">Vùng hoang</span>` : ""}`;
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
    Object.assign(S || {}, s); window.__status = s;
    tickCountdown();
  }
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
      <div class="kv kv6"><div><b>${n.population}</b><span>dân</span></div><div><b>${Math.round(n.stock.food || 0)}</b><span>lương thực</span></div><div><b>${n.stability}</b><span>ổn định</span></div><div><b>${n.tiles}/${n.tileLimit}</b><span>ô</span></div><div><b>${n.inventions.length}</b><span>phát minh</span></div><div><b>${n.reputation}</b><span>uy tín</span></div></div>
      <div class="meta">Kỷ nguyên <b>${esc(n.era)}</b>${n.research ? ` · nghiên cứu ${esc(n.research.name)} ${n.research.progress}/${n.research.cost} RP` : ""}</div>
      ${n.research ? `<div class="bar" role="progressbar" aria-label="Tiến độ nghiên cứu" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>` : ""}
      ${n.thought ? `<div class="thought"></div>` : ""}
      <h4>${tile === null ? "Công trình" : "Công trình trên ô này"}</h4>
      <div class="chips">${blds.map(b => `<span>${esc(b.name)}${b.done ? "" : " (đang xây)"}</span>`).join("") || `<span class="none">không có</span>`}</div>
      ${tile === null && (n.settlements || []).length ? `<h4>Điểm định cư</h4><div class="chips">${n.settlements.map(x => `<span>${esc(x.name)}</span>`).join("")}</div>` : ""}
      ${wars.length ? `<h4>Đang chiến tranh</h4><div class="meta">${wars.map(w => esc(w.a === n.id ? w.bName : w.aName)).join(", ")}</div>` : ""}
      <div class="row"><button type="button" class="primary" data-act="detail">Mở hồ sơ đầy đủ</button>${n.alive ? `<button type="button" data-act="locate">Xem trên bản đồ</button>` : ""}${tile === null ? `<button type="button" data-act="list">Danh sách quốc gia</button>` : ""}</div>`;
    el.querySelector(".flag").replaceWith(flagCanvas(n.flag, 54, 36));
    el.querySelector(".nname").textContent = nationName(n);
    el.querySelector(".nmeta").textContent = [n.people, n.capitalName && `thủ đô ${n.capitalName}`, n.model].filter(Boolean).join(" · ");
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
      <div class="chips">${t.river ? "<span>Sông</span>" : ""}${t.delta ? "<span>Châu thổ</span>" : ""}${t.land ? "" : "<span>Biển</span>"}${capOf ? `<span>Thủ đô ${esc(capOf.capitalName || nationName(capOf))}</span>` : ""}${stl ? `<span>Điểm định cư ${esc(stl.name)}</span>` : ""}${inWild(i) ? "<span>Vùng hoang</span>" : ""}${ST.herd?.includes(i) ? "<span>Điểm dừng đàn bò rừng</span>" : ""}${w ? `<span class="wonder">Kỳ quan: ${esc(w.name)}</span>` : ""}</div>
      <h4>Trữ lượng</h4>
      ${keys.length ? `<table class="res"><tr><th>Tài nguyên</th><th>Hiện có</th><th>Tối đa</th></tr>${keys.map(k => `<tr><td>${esc(RES[k] ?? k)}${HIDDEN_RES.has(k) ? ` <span class="pill">ẩn với AI</span>` : ""}</td><td class="mono">${Math.round(t.res?.[k] || 0)}</td><td class="mono">${Math.round(t.cap?.[k] || 0)}</td></tr>`).join("")}</table>` : `<p class="note">Không có trữ lượng.</p>`}
      <h4>Trận đánh ở ô này</h4>
      ${battles.length ? `<ol class="chronicle">${battles.map(b => `<li><span class="t">${b.tick}</span><span>${esc(nm(b.attacker))} ${b.kind === "raid" ? "đột kích" : "tấn công"} ${esc(nm(b.defender))}: ${b.won ? "thắng" : "thua"} (${b.a} vs ${b.d}), thương vong ${b.lossA}/${b.lossD}</span></li>`).join("")}</ol>` : `<p class="note">Chưa có trận nào gần đây.</p>`}
      <h4>Chủ sở hữu</h4>${owner ? "" : `<p class="note">Vô chủ.</p>`}`;
    el.querySelector("[data-act=unpin]").onclick = () => pinTile(-1);
    if (owner) el.append(nationBlock(owner, i));
    box.replaceChildren(el);
  }

  // ---------------------------------------------------------------- nations
  function statusPill(n) {
    if (!n.alive) return `<span class="pill bad">Diệt vong</span>`;
    if (n.controller === "bot") return `<span class="pill">Bot</span>`;
    if (n.status === "asleep") return `<span class="pill warn">Ngủ đến ${new Date(n.sleepUntil).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>`;
    if (n.status === "error") return `<span class="pill bad">Lỗi key</span>`;
    return `<span class="pill ok">Đang chơi</span>`;
  }
  function renderNations() {
    const box = $("#nations"); box.innerHTML = "";
    for (const n of S.nations) {
      const el = document.createElement("article"); el.className = `nation${n.alive ? "" : " dead"}`;
      const pct = n.research ? Math.min(100, n.research.progress / n.research.cost * 100) : 0;
      el.innerHTML = `<div class="head"><span class="flag"></span><div class="grow"><div class="name">${esc(nationName(n))}</div><div class="model">${esc(n.model)} · ${esc(n.era)}</div></div>${statusPill(n)}</div>
        <div class="kv"><div><b>${n.population}</b><span>dân</span></div><div><b>${Math.round(n.stock.food || 0)}</b><span>lương thực</span></div><div><b>${n.stability}</b><span>ổn định</span></div><div><b>${n.tiles}/${n.tileLimit}</b><span>ô</span></div><div><b>${n.inventions.length}</b><span>phát minh</span></div></div>
        ${n.research ? `<div class="muted" style="font-size:12px">Nghiên cứu ${esc(n.research.name)} · ${n.research.progress}/${n.research.cost} RP</div><div class="bar" role="progressbar" aria-label="Tiến độ nghiên cứu" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>` : ""}
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
    const labor = Object.entries(n.labor).filter(([, v]) => v).map(([k, v]) => `${ROLE[k]} ${v}`).join(", ");
    const stock = Object.entries(n.stock).map(([k, v]) => `${RES[k] ?? k} ${v}`).join(", ");
    const intel = Object.entries(n.intel || {}).map(([oid, it]) => `<tr><td>${esc(S.nations[oid]?.name)}</td><td>mức ${it.level}</td><td>lượt ${it.asOf}</td><td>${esc(JSON.stringify(it.report).slice(0, 220))}</td></tr>`).join("");
    $("#nation-detail").innerHTML = `
      <div class="row"><span class="flagbig"></span><div><h2>${esc(n.name)}</h2><div class="muted">${esc(n.people)} · thủ đô ${esc(n.capitalName)} · ${esc(n.model)}</div></div><span style="flex:1"></span>${statusPill(n)}<button id="dlg-close">Đóng</button></div>
      ${n.manifesto ? `<p><i>“${esc(n.manifesto)}”</i></p>` : ""}
      ${n.formerNames?.length ? `<p class="muted">Tên cũ: ${esc(n.formerNames.join(" → "))}</p>` : ""}
      ${n.statusNote ? `<p class="note">Ghi chú: ${esc(n.statusNote)}</p>` : ""}
      <h3>Suy nghĩ lượt này</h3><p>${esc(n.thought || "—")}</p>
      <h3>Bản ghi nhớ (AI tự viết)</h3><pre>${esc(n.memory || "—")}</pre>
      <h3>Lao động</h3><p>${esc(labor || "—")}</p>
      <h3>Kho</h3><p>${esc(stock || "—")}</p>
      <h3>Phát minh</h3><div class="chips">${n.inventions.map(v => `<span>${esc(v.name)}</span>`).join("")}</div>
      <h3>Công trình</h3><div class="chips">${n.buildings.map(b => `<span>${esc(b.name)}${b.done ? "" : " (đang xây)"}</span>`).join("") || "—"}</div>
      <h3>Điểm định cư</h3><p>${esc((n.settlements || []).map(x => x.name).join(", ") || "—")}</p>
      <h3>Quan hệ</h3><p>${esc(Object.entries(n.relations || {}).filter(([, r]) => r !== "chưa biết").map(([id, r]) => `${nm(id)}: ${r}`).join(" · ") || "—")}</p>
      <h3>Hộp thư lượt này (do nước khác viết)</h3>${(n.inbox || []).map(m => `<pre>${esc(m.fromName)}${m.gesture ? " (cử chỉ)" : ""}: ${esc(m.text)}</pre>`).join("") || "<p>—</p>"}
      <h3>Tình báo về nước khác</h3>${intel ? `<table><tr><th>Nước</th><th>Mức</th><th>Từ</th><th>Biết gì</th></tr>${intel}</table>` : "<p>Chưa gặp ai.</p>"}
      <h3>Sự kiện lượt trước</h3><p>${esc((n.events || []).join(" · ") || "—")}</p>
      <h3>Hành động bị từ chối</h3><p>${esc((n.rejected || []).map(r => `${r.action}: ${r.reason}`).join(" · ") || "—")}</p>
      <h3>Thống kê gọi AI</h3><p class="mono">gọi ${n.stats.calls} · hợp lệ ${n.stats.ok} · hành động sai ${n.stats.invalid} · lượt ngủ ${n.stats.asleepTicks} · lượt im lặng ${n.stats.silentTicks}</p>
      <h3>5 lượt gần nhất (nguyên văn)</h3>${turns.map(t => `<pre>lượt ${t.tick} · ${esc(t.kind)} · ${t.latency_ms}ms${t.error ? " · " + esc(t.error) : ""}\n${esc((t.raw || "").slice(0, 1500))}</pre>`).join("") || "<p>—</p>"}`;
    $("#nation-detail .flagbig").replaceWith(flagCanvas(n.flag, 72, 48));
    $("#dlg-close").onclick = () => d.close();
    d.showModal();
  }

  // ---------------------------------------------------------------- chronicle
  const chron = $("#chronicle");
  function addChronicle(items, prepend = true) {
    for (const c of items) {
      const li = document.createElement("li"); li.className = `k-${c.kind}`;
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
  function renderInventions() {
    const props = (S.proposals || []).slice().reverse();
    const pending = props.filter(p => p.status === "pending").length, badge = $("#prop-count");
    badge.hidden = !pending; badge.textContent = pending;
    const box = $("#proposals"); box.innerHTML = props.length ? "" : `<p class="note">Chưa có đơn phát minh nào.</p>`;
    const ST2 = { pending: ["Chờ trọng tài", "warn"], approved: ["Được duyệt", "ok"], rejected: ["Bị bác", "bad"], duplicate: ["Trùng", ""] };
    for (const p of props) {
      const [st, cls] = ST2[p.status], el = document.createElement("article"); el.className = "card2";
      const r = p.ruling;
      el.innerHTML = `<div class="row"><b class="pname"></b><span style="flex:1"></span><span class="pill ${cls}">${st}</span></div>
        <div class="meta">#${p.id} · ${esc(nm(p.nation))} · lượt ${p.tick} · độ sâu ${p.depth} · ${p.power} điểm · tiên quyết ${esc(p.prereqs.join(", "))}${p.caps.length ? ` · năng lực ${esc(p.caps.join(", "))}` : ""}</div>
        <div class="pdesc"></div><pre class="peff"></pre>
        ${r ? `<div class="meta">Trọng tài ${esc(r.judge)}: nhân quả ${r.causality}, vật chất ${r.material}, vật lý ${r.physics}${r.add_prereqs?.length ? ` · thêm tiên quyết ${esc(r.add_prereqs.join(", "))}` : ""} — ${esc(r.reason)}</div>` : ""}
        ${p.status === "pending" ? `<div class="row"><input type="text" placeholder="Lý do (tùy chọn)" style="flex:1"><button class="primary" data-a="1">Duyệt</button><button data-a="0">Bác</button></div>` : ""}`;
      el.querySelector(".pname").textContent = p.name;
      el.querySelector(".pdesc").textContent = p.description;
      el.querySelector(".peff").textContent = p.effects.map(e => JSON.stringify(e)).join("\n");
      for (const b of el.querySelectorAll("button[data-a]")) b.onclick = async () => {
        await api(`/api/proposals/${p.id}`, { method: "POST", body: { approve: b.dataset.a === "1", reason: el.querySelector("input").value } }).catch(e => alert(e.message));
        b.textContent = "Đã ghi, áp dụng lượt sau"; b.disabled = true;
      };
      box.append(el);
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

  // ---------------------------------------------------------------- diplomacy
  function relClass(r) { return /chiến/.test(r) ? "war" : /liên minh|tông chủ|chư hầu/.test(r) ? "ally" : /hòa bình|bất tương/.test(r) ? "peace" : ""; }
  function renderDiplomacy() {
    const alive = S.nations.filter(n => n.founded);
    $("#relations").innerHTML = `<tr><th></th>${alive.map(n => `<th>${esc(n.name)}</th>`).join("")}</tr>` + alive.map(a => `<tr><th>${esc(a.name)}</th>${alive.map(b => {
      if (a.id === b.id) return `<td>—</td>`;
      const r = a.relations?.[b.id] ?? ""; return `<td class="rel ${relClass(r)}">${esc(r)}${a.trades?.[b.id] ? ` · ${a.trades[b.id]} lần buôn` : ""}</td>`;
    }).join("")}</tr>`).join("");
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
    $("#ranking").innerHTML = `<tr><th>#</th><th>Quốc gia</th><th class="num">Điểm</th>${PARTS.map(([, h, t]) => `<th class="num" title="${esc(t)}">${h}</th>`).join("")}</tr>` +
      (rows.map((r, k) => `<tr${r.alive ? "" : ` class="gone"`}><td>${k + 1}</td><td><i class="sw" style="background:${esc(S.nations[r.nation]?.flag.colors[0] || "#888")}"></i>${esc(r.name)}${r.alive ? "" : " †"}</td><td class="num"><b>${r.score}</b></td>${PARTS.map(([key]) => `<td class="num">${r.parts?.[key] ?? 0}</td>`).join("")}</tr>`).join("")
        || `<tr><td colspan="${PARTS.length + 3}" class="note">Chưa có quốc gia nào lập quốc.</td></tr>`);
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
  async function boot() {
    ST = await api("/api/static");
    layout(); drawBase(); legend(); updateZoomUi();
    await refresh();
    addChronicle(await api("/api/chronicle?limit=200"), false);
    const es = new EventSource("/api/events");
    es.addEventListener("status", e => applyStatus(JSON.parse(e.data)));
    es.addEventListener("tick", e => { const d = JSON.parse(e.data); addChronicle(d.chronicle); refresh(); });
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
