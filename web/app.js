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
  function drawFlag(g, x, y, w, h, flag) {
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
    else if (L === "border") { g.strokeStyle = b; g.lineWidth = Math.max(2, h * 0.16); g.strokeRect(x, y, w, h); }
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
    g.strokeStyle = "rgba(0,0,0,.45)"; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  function flagCanvas(flag, w = 42, h = 28) {
    const c = document.createElement("canvas"), dpr = Math.min(2, devicePixelRatio || 1);
    c.width = w * dpr; c.height = h * dpr; c.style.width = w + "px"; c.style.height = h + "px";
    const g = c.getContext("2d"); g.scale(dpr, dpr); drawFlag(g, 0, 0, w, h, flag); return c;
  }

  // ---------------------------------------------------------------- map
  function layout() {
    const N = ST.n, w = cv.parentElement.clientWidth - 20, pad = 6;
    const s = (w - 2 * pad) / ((N + 0.5) * SQ3), h = (1.5 * (N - 1) + 2) * s + 2 * pad, dpr = Math.min(devicePixelRatio || 1, 2);
    for (const c of [cv, base]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    cv.style.aspectRatio = `${w} / ${h}`;
    geo = { N, s, pad, w, h, dpr, ox: pad + s * SQ3 / 2, oy: pad + s };
  }
  const center = i => { const N = geo.N, c = i % N, r = (i / N) | 0; return [geo.ox + geo.s * SQ3 * (c + 0.5 * (r & 1)), geo.oy + 1.5 * geo.s * r]; };
  function hexPath(g, x, y, s) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 30); k ? g.lineTo(x + s * Math.cos(a), y + s * Math.sin(a)) : g.moveTo(x + s * Math.cos(a), y + s * Math.sin(a)); } g.closePath(); }
  function label(g, text, x, y, size, color = "#fff", weight = 600) {
    g.font = `${weight} ${size}px "Be Vietnam Pro", system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.lineJoin = "round";
    g.lineWidth = Math.max(2, size / 3.5); g.strokeStyle = "rgba(8,20,28,.85)"; g.strokeText(text, x, y); g.fillStyle = color; g.fillText(text, x, y);
  }
  const NB = (i) => { const N = geo.N, c = i % N, r = (i / N) | 0, D = r & 1 ? [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]] : [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]]; return D.map(([dc, dr]) => [c + dc, r + dr]).map(([cc, rr]) => cc >= 0 && cc < N && rr >= 0 && rr < N ? rr * N + cc : -1); };

  function drawBase() {
    const g = bctx, s = geo.s;
    g.setTransform(geo.dpr, 0, 0, geo.dpr, 0, 0);
    g.fillStyle = TERRAIN.ocean[1]; g.fillRect(0, 0, geo.w, geo.h);
    ST.terrain.forEach((t, i) => { const [x, y] = center(i); hexPath(g, x, y, s * 1.02); g.fillStyle = TERRAIN[t][1]; g.fill(); });
    ST.terrain.forEach((t, i) => {
      const [x, y] = center(i);
      if (t === "mountain") { g.beginPath(); g.moveTo(x - s * .55, y + s * .35); g.lineTo(x, y - s * .5); g.lineTo(x + s * .55, y + s * .35); g.closePath(); g.fillStyle = "#6b625b"; g.fill(); }
      else if (t === "hill") { g.beginPath(); g.arc(x, y + s * .3, s * .42, Math.PI * 1.1, Math.PI * 1.9); g.strokeStyle = "#8d7746"; g.lineWidth = Math.max(1, s * .12); g.stroke(); }
      else if (t === "forest" || t === "taiga" || t === "jungle") { g.fillStyle = "rgba(10,40,20,.35)"; g.beginPath(); g.arc(x - s * .22, y + s * .05, s * .2, 0, 7); g.arc(x + s * .22, y - s * .08, s * .2, 0, 7); g.fill(); }
    });
    g.lineCap = "round"; g.lineJoin = "round";
    for (const path of ST.rivers) { g.beginPath(); path.forEach((i, k) => { const [x, y] = center(i); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.strokeStyle = "#5fb4e6"; g.lineWidth = Math.max(1.4, s * .32); g.stroke(); }
  }

  function render() {
    if (!geo || !S) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(base, 0, 0);
    const g = ctx, s = geo.s; g.setTransform(geo.dpr, 0, 0, geo.dpr, 0, 0);
    const color = id => S.nations[id]?.founded ? S.nations[id].flag.colors[0] : "#cccccc";
    // territory tint
    S.owners.forEach((o, i) => { if (o < 0) return; const [x, y] = center(i); hexPath(g, x, y, s * 1.02); g.globalAlpha = .42; g.fillStyle = color(o); g.fill(); g.globalAlpha = 1; });
    // borders
    g.lineWidth = Math.max(1.5, s * .22);
    S.owners.forEach((o, i) => {
      if (o < 0) return;
      const [x, y] = center(i), nb = NB(i);
      for (let k = 0; k < 6; k++) {
        if (nb[k] >= 0 && S.owners[nb[k]] === o) continue;
        // edge k faces neighbour direction k: E, NE, NW, W, SW, SE
        const a1 = Math.PI / 180 * ([0, -60, -120, 180, 120, 60][k] - 30), a2 = a1 + Math.PI / 3;
        g.beginPath(); g.moveTo(x + s * Math.cos(a1), y + s * Math.sin(a1)); g.lineTo(x + s * Math.cos(a2), y + s * Math.sin(a2)); g.strokeStyle = color(o); g.stroke();
      }
    });
    // wonders
    for (const w of ST.wonders) {
      const [x, y] = center(w.i), R = s * .8; g.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? R * .45 : R; g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
      g.closePath(); g.fillStyle = "#ffd84a"; g.fill(); g.lineWidth = 1; g.strokeStyle = "#3a2a00"; g.stroke();
    }
    // capitals with flags
    for (const n of S.nations) {
      if (!n.alive) continue;
      const [x, y] = center(n.capital), fw = Math.max(18, s * 3), fh = fw * 2 / 3;
      g.strokeStyle = "#0b1a22"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - fh - s); g.stroke();
      drawFlag(g, x, y - fh - s, fw, fh, n.flag);
      label(g, n.founded ? n.name : `Bộ lạc ${n.id + 1}`, x, y + s * 1.6, Math.max(10, s * 1.1));
      if (n.status === "asleep" || n.status === "error") label(g, n.status === "asleep" ? "đang ngủ" : "lỗi key", x, y + s * 3, Math.max(9, s * .9), "#ffd0a0", 500);
    }
    for (const n of S.nations) for (const st of n.settlements || []) {
      const [x, y] = center(st.tile); g.beginPath(); g.arc(x, y, s * .7, 0, 7); g.fillStyle = n.flag.colors[0]; g.fill(); g.lineWidth = 1.5; g.strokeStyle = "#0b1a22"; g.stroke();
      label(g, st.name, x, y + s * 1.5, Math.max(9, s * .95), "#fff", 500);
    }
    for (const b of (S.battles || []).filter(b => b.tick >= S.tick - 3)) {
      const [x, y] = center(b.tile), r = s * .8; g.strokeStyle = "#ff4d3d"; g.lineWidth = Math.max(2, s * .25);
      g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.stroke();
    }
    if (hoverI >= 0) { const [x, y] = center(hoverI); hexPath(g, x, y, s * 1.05); g.lineWidth = 2; g.strokeStyle = "#fff"; g.stroke(); }
  }

  function pick(ev) {
    const rect = cv.getBoundingClientRect();
    const X = (ev.clientX - rect.left) * (geo.w / rect.width) - geo.ox, Y = (ev.clientY - rect.top) * (geo.h / rect.height) - geo.oy;
    let q = (SQ3 / 3 * X - Y / 3) / geo.s, r = (2 / 3 * Y) / geo.s, z = -q - r;
    let rq = Math.round(q), rr = Math.round(r), rz = Math.round(z);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), dz = Math.abs(rz - z);
    if (dq > dr && dq > dz) rq = -rr - rz; else if (dr > dz) rr = -rq - rz;
    const c = rq + (rr - (rr & 1)) / 2;
    return (c < 0 || c >= geo.N || rr < 0 || rr >= geo.N) ? -1 : rr * geo.N + c;
  }
  let tileReq = 0;
  async function showTile(i) {
    const box = $("#tileinfo");
    if (i < 0) { box.hidden = true; return; }
    const my = ++tileReq, t = await api(`/api/tile?i=${i}`); if (my !== tileReq) return;
    const owner = t.owner >= 0 ? S.nations[t.owner] : null, w = ST.wonders.find(x => x.i === i);
    const res = Object.entries(t.res).filter(([, v]) => v >= .5).map(([k, v]) => `${RES[k] ?? k} ${Math.round(v)}`).join(", ") || "không";
    box.innerHTML = `<b>${esc(TERRAIN[t.terrain][0])}</b>${t.river ? " · sông" : ""}${t.delta ? " · châu thổ" : ""}<br>
      <span class="muted">ô ${i % geo.N}, ${(i / geo.N) | 0} · ${ZONE[t.zone]}</span><br>
      ${owner ? `Thuộc <b>${esc(owner.name)}</b><br>` : ""}${w ? `Kỳ quan: <b>${esc(w.name)}</b><br>` : ""}Trữ lượng: ${esc(res)}`;
    box.hidden = false;
  }
  cv.addEventListener("pointermove", ev => { const i = pick(ev); if (i !== hoverI) { hoverI = i; render(); showTile(i); } });
  cv.addEventListener("pointerleave", () => { hoverI = -1; render(); $("#tileinfo").hidden = true; });

  // ---------------------------------------------------------------- header
  function statusLabel(s) {
    if (s.busy) return ["Đang xử lý lượt", "warn"];
    if (s.paused) return ["Tạm dừng", "bad"];
    return ["Đang chạy", "ok"];
  }
  function applyStatus(s) {
    $("#tick").textContent = `Lượt ${s.tick} · năm ${s.tick * 10}`;
    const [txt, cls] = statusLabel(s); const p = $("#run-state"); p.textContent = txt; p.className = `pill ${cls}`;
    $("#btn-pause").textContent = s.paused ? "Tiếp tục" : "Tạm dừng";
    $("#version").textContent = `v${s.version}`;
    const sel = $("#tick-seconds"); if (![...sel.options].some(o => +o.value === s.tickSeconds)) sel.add(new Option(`${s.tickSeconds} giây`, s.tickSeconds)); sel.value = s.tickSeconds;
    const err = $("#engine-error"); err.hidden = !s.lastError; err.textContent = s.lastError ? `Lỗi Engine (thế giới tạm dừng):\n${s.lastError}` : "";
    Object.assign(S || {}, s); window.__status = s;
  }
  setInterval(() => {
    const s = window.__status; if (!s) return;
    const left = Math.max(0, Math.round((s.nextTickAt - Date.now()) / 1000));
    $("#countdown").textContent = s.paused || s.busy ? "" : `lượt sau ${left >= 60 ? Math.floor(left / 60) + "p " : ""}${left % 60}s`;
  }, 1000);
  $("#btn-pause").onclick = () => api("/api/control", { method: "POST", body: { action: window.__status?.paused ? "resume" : "pause" } }).then(applyStatus);
  $("#btn-step").onclick = () => api("/api/control", { method: "POST", body: { action: "step" } });
  $("#tick-seconds").onchange = e => api("/api/control", { method: "POST", body: { action: "tick_seconds", value: +e.target.value } }).then(applyStatus);

  // ---------------------------------------------------------------- tabs
  for (const b of document.querySelectorAll(".tabs button")) b.onclick = () => {
    for (const x of document.querySelectorAll(".tabs button")) x.setAttribute("aria-selected", x === b);
    for (const p of document.querySelectorAll(".panel")) p.hidden = p.id !== `tab-${b.dataset.tab}`;
    try { localStorage.setItem("sm-tab", b.dataset.tab); } catch { }
    if (b.dataset.tab === "chat") loadChat();
    if (b.dataset.tab === "stats" && S) renderStats();
  };
  try { const t = localStorage.getItem("sm-tab"); if (t) document.querySelector(`.tabs button[data-tab="${t}"]`)?.click(); } catch { }

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
      el.innerHTML = `<div class="head"><span class="flag"></span><div class="grow"><div class="name">${esc(n.founded ? n.name : `Bộ lạc ${n.id + 1}`)}</div><div class="model">${esc(n.controller === "ai" ? n.model : n.model)} · ${esc(n.era)}</div></div>${statusPill(n)}</div>
        <div class="kv"><div><b>${n.population}</b><span>dân</span></div><div><b>${Math.round(n.stock.food || 0)}</b><span>lương thực</span></div><div><b>${n.stability}</b><span>ổn định</span></div><div><b>${n.tiles}/${n.tileLimit}</b><span>ô</span></div><div><b>${n.inventions.length}</b><span>phát minh</span></div></div>
        ${n.research ? `<div class="muted" style="font-size:12px">Nghiên cứu ${esc(n.research.name)} · ${n.research.progress}/${n.research.cost} RP</div><div class="bar"><i style="width:${pct}%"></i></div>` : ""}
        ${n.thought ? `<div class="thought">“${esc(n.thought)}”</div>` : ""}`;
      el.querySelector(".flag").replaceWith(flagCanvas(n.flag));
      el.onclick = () => openNation(n.id);
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
    const rows = S.nations.filter(n => n.founded).map(n => {
      const first = Object.values(S.registry || {}).filter(r => r.by[0] === n.id).length;
      const custom = (S.customInventions || []).filter(v => v.by === n.id).length;
      const score = n.population + n.inventions.length * 10 + first * 15 + custom * 25 + n.tiles * 3 + n.reputation;
      return { n, first, custom, score };
    }).sort((a, b) => b.score - a.score);
    $("#ranking").innerHTML = `<tr><th>#</th><th>Quốc gia</th><th>Điểm</th><th>Dân</th><th>Phát minh</th><th>Đầu tiên</th><th>Tự tạo</th><th>Ô</th><th>Uy tín</th></tr>` +
      rows.map((r, k) => `<tr><td>${k + 1}</td><td>${esc(r.n.name)}${r.n.alive ? "" : " †"}</td><td>${r.score}</td><td>${r.n.population}</td><td>${r.n.inventions.length}</td><td>${r.first}</td><td>${r.custom}</td><td>${r.n.tiles}</td><td>${r.n.reputation}</td></tr>`).join("");
  }
  function drawChart() {
    const c = $("#chart"), g = c.getContext("2d"), key = $("#stat-key").value, data = statsCache || [];
    const W = c.width, H = c.height, P = 40;
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

  // ---------------------------------------------------------------- data flow
  async function refresh() {
    S = await api("/api/state");
    applyStatus(S); render(); renderNations(); renderPetitions(); renderDecrees(); renderInventions(); renderDiplomacy();
    if (!$("#tab-stats").hidden) renderStats();
  }
  function legend() {
    $("#legend").innerHTML = Object.entries(TERRAIN).filter(([k]) => k !== "ocean").map(([, [n, c]]) => `<span><i style="background:${c}"></i>${n}</span>`).join("") + `<span><i style="background:#5fb4e6"></i>Sông</span><span><i style="background:#ffd84a;border-radius:50%"></i>Kỳ quan</span>`;
  }
  async function boot() {
    ST = await api("/api/static");
    layout(); drawBase(); legend();
    await refresh();
    addChronicle(await api("/api/chronicle?limit=200"), false);
    const es = new EventSource("/api/events");
    es.addEventListener("status", e => applyStatus(JSON.parse(e.data)));
    es.addEventListener("tick", e => { const d = JSON.parse(e.data); addChronicle(d.chronicle); refresh(); });
    es.addEventListener("reload", () => location.reload());
    es.addEventListener("history", e => { const d = JSON.parse(e.data); addChapters([d.chapter]); addChronicle([d.entry]); });
    let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { layout(); drawBase(); render(); }, 150); });
    document.fonts?.ready.then(() => render());
  }
  boot().catch(e => { document.body.insertAdjacentHTML("afterbegin", `<p class="error">Không kết nối được Engine: ${esc(e.message)}</p>`); });
})();
