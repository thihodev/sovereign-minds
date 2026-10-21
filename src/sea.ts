// §2.11 The sea and what explorers bring back. Waters near a nation, the fish and pearls and whales in them,
// where a pier would serve best, and the lands seen across the water; and after each expedition, a report of
// what it saw. Pure reads of the World: the engine and the observation call them.

import { NEIGHBORS, col, dist, row, within } from "./hex.ts";
import { REGEN, REGION_NAME, RES_NAME, SEA, TERRAIN } from "./rules.ts";
import { buildingOf } from "./catalog.ts";
import { buildingWorks, canSeeRes, mods, ownedTiles, seaReach } from "./engine.ts";
import { tileValue } from "./worldgen.ts";
import { liveHordes } from "./wild.ts";
import type { Nation, ResKey, Tile, World } from "./types.ts";

const xy = (i: number) => `(${col(i)}, ${row(i)})`;
const SEA_GOODS: ResKey[] = ["fish", "shellfish", "pearl", "coral", "whale", "oil"];
/** Goods worth naming in a report: not the everyday ones found everywhere. */
const NOTABLE: ResKey[] = ["copper", "tin", "iron", "gold", "silver", "gems", "marble", "salt", "flint", "clay", "ochre", "herbs", "honey", "spice", "fur", "amber", "horse", "coal", "oil", "sulfur", "pearl", "coral", "whale"];
const water = (t: Tile) => !t.land;

// ---------------------------------------------------------------- land masses

const partsMemo = new WeakMap<World, Int32Array>();
/** Which land mass each tile belongs to (−1 for water); the land does not change, so it is reckoned once. */
export function landParts(world: World): Int32Array {
  const hit = partsMemo.get(world); if (hit) return hit;
  const part = new Int32Array(world.tiles.length).fill(-1);
  let id = 0;
  for (const t of world.tiles) {
    if (!t.land || part[t.i] >= 0) continue;
    const queue = [t.i]; part[t.i] = id;
    while (queue.length) { const k = queue.pop()!; for (const j of NEIGHBORS[k]) if (world.tiles[j].land && part[j] < 0) { part[j] = id; queue.push(j); } }
    id++;
  }
  partsMemo.set(world, part);
  return part;
}

/** What a tile's reserve of a good gives back each turn, i.e. what can be taken from it for ever. */
const regen = (t: Tile, k: ResKey) => (t.cap[k] || 0) * (REGEN[k] || 0);

// ---------------------------------------------------------------- the expedition's report

/** What an expedition saw that the nation had not seen before, in a few Vietnamese lines. */
export function discoveryReport(world: World, n: Nation, dir: string, fresh: number[]): string {
  if (!fresh.length) return `Đoàn thám hiểm đi hướng ${dir} và trở về: không thấy vùng nào mới.`;
  const see = (k: string) => canSeeRes(world, n, k), parts: string[] = [];
  const tiles = fresh.map(i => world.tiles[i]), land = tiles.filter(t => t.land), sea = tiles.filter(water);
  parts.push(`${fresh.length} ô mới (${land.length} đất, ${sea.length} nước)`);
  const rivers = land.filter(t => t.river);
  if (rivers.length) parts.push(`sông ở ${xy(nearestTo(n, rivers).i)}`);
  // rich veins and wonders
  const veins = tiles.filter(t => t.vein && see(t.vein) && (t.res[t.vein] || 0) > 0).slice(0, 4);
  if (veins.length) parts.push(`◆ mạch giàu: ${veins.map(t => `${RES_NAME[t.vein!]} ${xy(t.i)}${t.owner >= 0 ? ` (của ${world.nations[t.owner]?.name})` : " (vô chủ)"}`).join(", ")}`);
  const wonders = world.wonders.filter(w => fresh.includes(w.i));
  if (wonders.length) parts.push(`kỳ quan ${wonders.map(w => `${w.name} ${xy(w.i)}`).join(", ")}`);
  // the best free land, and notable goods on free land
  const free = land.filter(t => t.owner < 0 && t.terrain !== "icewall");
  const best = free.slice().sort((a, b) => tileValue(b) - tileValue(a) || a.i - b.i).slice(0, 2);
  if (best.length) parts.push(`đất vô chủ tốt nhất: ${best.map(t => `${xy(t.i)} ${TERRAIN[t.terrain].name.toLowerCase()}${t.river ? " có sông" : ""}`).join(", ")}`);
  const found: string[] = [];
  for (const k of NOTABLE) {
    if (!see(k)) continue;
    const at = tiles.filter(t => t.owner < 0 && (t.res[k] || 0) >= 1 && !(t.vein === k));
    if (!at.length) continue;
    const total = at.reduce((s, t) => s + (t.res[k] || 0), 0);
    found.push(`${RES_NAME[k]} ${Math.round(total)} (gần nhất ${xy(nearestTo(n, at).i)})`);
  }
  if (found.length) parts.push(`tài nguyên trên đất và nước vô chủ: ${found.slice(0, 7).join(", ")}`);
  // the sea
  const shallow = sea.filter(t => t.terrain === "shallow"), ocean = sea.filter(t => t.terrain === "ocean");
  if (shallow.length) {
    const fish = shallow.reduce((s, t) => s + (t.res.fish || 0), 0), back = shallow.reduce((s, t) => s + regen(t, "fish"), 0);
    parts.push(`biển nông ${shallow.length} ô: cá ${Math.round(fish)}, hồi khoảng ${Math.round(back)}/lượt`);
  }
  if (ocean.length) parts.push(`biển sâu ${ocean.length} ô${ocean.some(t => (t.res.whale || 0) > 0) ? `, có cá voi (${xy(nearestTo(n, ocean.filter(t => (t.res.whale || 0) > 0)).i)})` : ""}`);
  // land across the water
  const part = landParts(world), home = part[n.capital];
  const across = land.filter(t => part[t.i] !== home);
  if (across.length) {
    const t = nearestTo(n, across);
    parts.push(`đất bên kia biển ở ${xy(t.i)}${t.region === "isl" ? ` (${REGION_NAME.isl})` : ""}: ${across.length} ô`);
  }
  // other peoples and dangers
  const owners = [...new Set(tiles.filter(t => t.owner >= 0 && t.owner !== n.id).map(t => t.owner))].map(id => world.nations[id]).filter(o => o?.founded);
  if (owners.length) parts.push(`đất của ${owners.map(o => o.name).join(", ")}`);
  const camps = liveHordes(world).filter(h => fresh.includes(h.tile));
  if (camps.length) parts.push(`trại man di ${camps.map(h => `${h.name} ${xy(h.tile)} (sức ${Math.round(h.strength)})`).join(", ")}`);
  return `Đoàn thám hiểm đi hướng ${dir} trở về: ${parts.join("; ")}.`;
}

function nearestTo(n: Nation, ts: Tile[]): Tile {
  return ts.reduce((a, b) => (dist(b.i, n.capital) < dist(a.i, n.capital) || (dist(b.i, n.capital) === dist(a.i, n.capital) && b.i < a.i) ? b : a));
}

// ---------------------------------------------------------------- the sea as the nation sees it

/** The waters around a nation for its observation (§2.11), or undefined when it has no sea near. */
export function seaView(world: World, n: Nation, near = 6) {
  if (!n.founded) return undefined;
  const m = mods(world, n), owned = ownedTiles(world, n.id), boats = m.move.has("shallow"), ships = m.move.has("ocean");
  const see = (k: string) => canSeeRes(world, n, k);
  const mineW = owned.filter(water), shore = owned.filter(t => t.land && (t.terrain === "coast" || NEIGHBORS[t.i].some(j => !world.tiles[j].land)));
  const part = landParts(world), home = part[n.capital];
  // free water seen near our land
  const nearW: Tile[] = [];
  for (const i of n.seen) {
    const t = world.tiles[i];
    if (t.land || t.owner >= 0) continue;
    let d = Infinity; for (const o of owned) { const k = dist(o.i, i); if (k < d) d = k; if (d <= 1) break; }
    if (d <= near) nearW.push(t);
  }
  const across = new Map<number, Tile[]>();
  for (const i of n.seen) { const t = world.tiles[i]; if (t.land && part[i] >= 0 && part[i] !== home) { const a = across.get(part[i]) ?? []; a.push(t); across.set(part[i], a); } }
  if (!mineW.length && !shore.length && !nearW.length && !across.size) return undefined;
  const sum = (ts: Tile[], k: ResKey) => Math.round(ts.reduce((s, t) => s + (t.res[k] || 0), 0));
  const back = (ts: Tile[], k: ResKey) => Math.round(ts.reduce((s, t) => s + regen(t, k), 0) * 10) / 10;
  const spots = (ts: Tile[], k: ResKey) => see(k) ? ts.filter(t => (t.res[k] || 0) >= 1).sort((a, b) => (b.res[k] || 0) - (a.res[k] || 0) || a.i - b.i).slice(0, 3).map(t => ({ tile: [col(t.i), row(t.i)], amount: Math.round(t.res[k] || 0), rich_vein: t.vein === k || undefined })) : [];
  const ports = n.buildings.filter(b => buildingWorks(world, b) && (buildingOf(world, b.type)?.effect.port || 0) > 0);
  const claimable = boats ? nearW.filter(t => (t.terrain === "shallow" || ships) && NEIGHBORS[t.i].some(j => world.tiles[j].owner === n.id) && (NEIGHBORS[t.i].some(j => world.tiles[j].owner === n.id && world.tiles[j].land) || seaReach(world, n, t.i))).length : 0;
  // where a pier would serve best: our shore or river land with the most fish within reach
  const portTiles = new Set(ports.map(b => b.tile));
  const sites = boats ? owned.filter(t => t.land && (t.terrain === "coast" || t.river) && !portTiles.has(t.i)).map(t => {
    let fish = 0; for (const j of within(t.i, SEA.pierReach)) { const u = world.tiles[j]; if (!u.land && (u.owner < 0 || u.owner === n.id)) fish += u.cap.fish || 0; }
    return { tile: [col(t.i), row(t.i)], fish_within_reach: Math.round(fish) };
  }).filter(s => s.fish_within_reach > 0).sort((a, b) => b.fish_within_reach - a.fish_within_reach).slice(0, 3) : [];
  return {
    can: { hold_shallow_sea: boats, hold_deep_sea: ships, piers: ports.length, harbors: ports.filter(b => (buildingOf(world, b.type)?.effect.harbor || 0) > 0).length, fish_bonus_from_docks: Math.round(Math.min(0.5, n.buildings.filter(b => buildingWorks(world, b)).reduce((s, b) => s + (buildingOf(world, b.type)?.effect.fish || 0), 0)) * 100) + "%" },
    my_waters: mineW.length ? { tiles: mineW.length, fish: sum(mineW, "fish"), fish_regrows_per_turn: back(mineW, "fish"), pearls: see("pearl") ? sum(mineW, "pearl") : undefined, coral: sum(mineW, "coral") || undefined, whales: sum(mineW, "whale") || undefined, oil: see("oil") ? sum(mineW, "oil") || undefined : undefined } : undefined,
    my_shore: shore.length ? { tiles: shore.length, shellfish: sum(shore, "shellfish"), amber: sum(shore, "amber") || undefined } : undefined,
    free_waters_near: nearW.length ? {
      tiles: nearW.length, shallow: nearW.filter(t => t.terrain === "shallow").length, fish: sum(nearW, "fish"), fish_regrows_per_turn: back(nearW, "fish"),
      claimable_now: claimable, fishing_grounds: spots(nearW.filter(t => t.vein === "fish"), "fish"), pearl_beds: spots(nearW, "pearl"), coral: spots(nearW, "coral"), whales: spots(nearW, "whale"),
    } : undefined,
    pier_sites: sites.length ? sites : undefined,
    lands_across_the_sea: [...across.values()].map(ts => {
      const t = nearestTo(n, ts), owners = [...new Set(ts.filter(x => x.owner >= 0).map(x => x.owner))].map(id => world.nations[id]?.name).filter(Boolean);
      const goods = NOTABLE.filter(see).map(k => [k, sum(ts.filter(x => x.owner < 0), k)] as const).filter(([, q]) => q > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, q]) => `${k} ${q}`);
      return { nearest: [col(t.i), row(t.i)], distance: dist(t.i, n.capital), seen_tiles: ts.length, island: t.region === "isl" || undefined, owners: owners.length ? owners : undefined, free_goods: goods.length ? goods : undefined };
    }).sort((a, b) => a.distance - b.distance).slice(0, 4),
  };
}

/** §2.11 What the advice says about the sea. */
export function seaAdvice(world: World, n: Nation): Array<{ level: number; text: string }> {
  const v = seaView(world, n); if (!v) return [];
  const out: Array<{ level: number; text: string }> = [];
  const fw = v.free_waters_near;
  if (fw && fw.fish_regrows_per_turn >= 10) {
    if (!v.can.hold_shallow_sea) out.push({ level: 1, text: `Biển gần bạn: ${fw.shallow} ô biển nông vô chủ, cá hồi khoảng ${fw.fish_regrows_per_turn}/lượt. Nghiên cứu Thuyền độc mộc (P16) để giữ biển nông (mỗi ô nước chỉ tính 1/3 vào giới hạn đất) và ra khơi.` });
    else if (fw.claimable_now) out.push({ level: 1, text: `Có ${fw.claimable_now} ô biển chiếm được ngay (claim_tile), cá hồi khoảng ${fw.fish_regrows_per_turn}/lượt cả vùng: cá nuôi dân, mỗi ô nước chỉ tính 1/3 vào giới hạn đất.` });
  }
  if (fw?.fishing_grounds.length) out.push({ level: 2, text: `Ngư trường ◆ vô chủ ở (${fw.fishing_grounds[0].tile.join(", ")}): cá gấp 4, đánh bắt +50%. Chiếm lấy trước nước khác.` });
  if (fw?.pearl_beds.length) out.push({ level: 1, text: `Bãi ngọc trai ở (${fw.pearl_beds[0].tile.join(", ")}): ngư dân giữ vùng nước ấy sẽ mò được ngọc (xa xỉ phẩm, giá cao).` });
  if (v.can.hold_shallow_sea && !v.can.piers && v.pier_sites?.length) out.push({ level: 1, text: `Chưa có Bến thuyền: dựng ở (${v.pier_sites[0].tile.join(", ")}) (${v.pier_sites[0].fish_within_reach} cá trong tầm). Bến cho buôn bằng đường thủy, nối điểm định cư bằng nước, giữ lãnh hải xa bờ.` });
  const far = v.lands_across_the_sea[0];
  if (far) out.push({ level: 1, text: `Đã thấy đất bên kia biển ở (${far.nearest.join(", ")})${far.island ? " (quần đảo)" : ""}${far.owners ? ` của ${far.owners.join(", ")}` : ""}${far.free_goods ? `, vô chủ có ${far.free_goods.join(", ")}` : ""}. Muốn tới: thuyền (P16) đi biển nông, tàu viễn dương (move ocean) vượt biển sâu.` });
  return out;
}

export { SEA_GOODS };
