// The engine's own reading of a nation's situation (§8.2 "advice"): what blocks it, what it can do about
// it now, with the numbers. The rules are long; this tells each nation the few that matter this turn,
// and it is always right about them because it is computed from the same code that applies them.

import { NEIGHBORS, col, row } from "../hex.ts";
import { AP_COST, BORDER, CONNECT, CONTAGION, EXODUS, HAMLET, ROADS, SCHISM, SETTLEMENT, OFFICIALS, PROVINCE } from "../rules.ts";
import { CAUSE_VI, provinces } from "../provinces.ts";
import { allBuildings, invName } from "../catalog.ts";
import { freshWater, governed, housing, housingParts, housingSlots, inventionCost, isHousing, maxOfficials, mods, nextEraNeeds, ownedTiles, researchOptions, roadNet, roadPlan, tileLimit, workers } from "../engine.ts";
import { mouths } from "../people.ts";
import { WHY_VI, exodusOf } from "../exodus.ts";
import { borderOf, neighbours } from "../border.ts";
import { isolated } from "../connect.ts";
import { WAY_NAME, contagious, immune, plagueNearby, quarantined } from "../contagion.ts";
import { PROSPERITY } from "../rules.ts";
import { estimateProsperity, knownProsperity } from "../prosperity.ts";
import { activeWar, treatiesBetween } from "../diplomacy.ts";
import type { Nation, World } from "../types.ts";

const xy = (i: number) => `(${col(i)}, ${row(i)})`;

export interface Advice { level: number; text: string }

export function advice(world: World, n: Nation): Advice[] {
  if (!n.founded || !n.alive) return [];
  const out: Advice[] = [], m = mods(world, n), owned = ownedTiles(world, n.id);
  const need = mouths(n) * m.foodPerPerson, food = n.stock.food || 0, roof = housing(world, n), hp = housingParts(world, n);
  const say = (level: number, text: string) => out.push({ level, text });

  // §4.8 people who left: the ruler's first duty
  const ex = exodusOf(n, world.tick);
  if (ex.recent) {
    const where = Object.entries(ex.to).map(([id, k]) => `${k} sang ${world.nations[Number(id)]?.name ?? "?"}`).join(", ");
    const why = Object.entries(ex.why).map(([w, k]) => `${k} vì ${WHY_VI[w as keyof typeof WHY_VI]}`).join(", ");
    const fix: string[] = [];
    if (ex.why.envy) fix.push("nâng thịnh vượng (lương thực dự trữ, hàng hóa, chỗ ở)");
    if (ex.why.unrest || ex.why.border) fix.push("nâng ổn định (đủ ăn, không vượt giới hạn đất, bàn thờ, hạ căng thẳng biên giới)");
    if (ex.why.faction || ex.why.schism) fix.push("hạ bất mãn (đường tới tỉnh cô lập, bá tước, ổn định ≥ 60)");
    say(ex.share > EXODUS.alarm ? 3 : ex.lastTurn ? 2 : 1, `${ex.recent} người đã bỏ đi trong ${EXODUS.window} lượt qua (${Math.round(ex.share * 100)}% dân${ex.lastTurn ? `, ${ex.lastTurn} người lượt vừa rồi` : ""}): ${why}${where ? `; ${where}` : ""}.${ex.share > EXODUS.alarm ? ` Đã quá ${EXODUS.alarm * 100}%: mỗi lượt −${EXODUS.stability} ổn định, uy tín và hạng giảm.` : ""} Giữ dân: ${fix.join("; ") || "giữ cho dân đủ ăn, có chỗ ở và yên ổn"}.`);
  }

  // Food
  if (food < need) say(3, `Lương thực ${Math.round(food)} không đủ một lượt ăn (${Math.round(need)}): thiếu thì người chết đói và không trẻ nào ra đời. Dồn người vào hái lượm, săn, đánh cá ngay.`);
  else if (food < need * 1.5) say(2, `Lương thực chỉ đủ ${(food / need).toFixed(1)} lượt (cần ${Math.round(need)} mỗi lượt, hư ${Math.round(m.spoilage * 100)}% mỗi lượt). Dân chỉ tăng khi còn dư ≥ 20% sau bữa.`);

  // Housing: the three ways to more room
  if (n.population >= roof - 2) {
    const ways: string[] = [];
    const tents = n.buildings.filter(b => isHousing(world, b.type)).length, slots = housingSlots(n, world);
    const homes = allBuildings(world).filter(b => (b.effect.housing || 0) > 0 && (n.inventions.includes(b.needs) || m.unlocked.has(b.type))).sort((a, b) => (b.effect.housing || 0) - (a.effect.housing || 0));
    if (homes.length && tents < slots) ways.push(`dựng ${homes[0].name} (+${homes[0].effect.housing} chỗ; còn ${slots - tents}/${slots} chỗ cho nhà ở)`);
    else if (homes.length && tents >= slots) {
      const best = homes[0].effect.housing || 0, worst = Math.min(...n.buildings.filter(b => isHousing(world, b.type)).map(b => allBuildings(world).find(x => x.type === b.type)?.effect.housing || 0));
      ways.push(`đã đủ ${slots} nhà ở cho các trung tâm hiện có${worst < best ? ` (nhà yếu nhất chỉ +${worst}, nhà tốt nhất bạn làm được +${best})` : ""}; mỗi điểm định cư mới mở thêm ${slots / (1 + n.settlements.length)} chỗ cho nhà ở`);
    } else {
      const tent = researchOptions(world, n).find(id => allBuildings(world).some(b => b.needs === id && (b.effect.housing || 0) > 0));
      if (tent) ways.push(`nghiên cứu ${invName(world, tent)} (${tent}, ${inventionCost(world, n, tent)} RP) để dựng nhà ở`);
    }
    if (hp.hamlets < hp.hamletMax) {
      const free = new Map<number, number>();
      for (const t of owned) for (const j of NEIGHBORS[t.i]) { const u = world.tiles[j]; if (u.owner === -1 && u.land) free.set(j, (HAMLET.people[u.terrain] || 0) + (u.river && HAMLET.people[u.terrain] ? HAMLET.river : 0)); }
      const best = [...free.entries()].filter(([, k]) => k >= 2).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 3);
      if (best.length) ways.push(`chiếm thêm đất cho thôn xóm (còn ${hp.hamletMax - hp.hamlets} chỗ): ${best.map(([i, k]) => `${xy(i)} +${k}`).join(", ")}`);
    }
    say(2, `Dân ${n.population}/${roof} chỗ ở: hết chỗ thì dân không tăng. Cách mở thêm: ${ways.join("; ") || "lập điểm định cư"}.`);
  }

  // Settlement: what is still missing
  const centresFree = SETTLEMENT.freeCentres - n.settlements.length + roadNet(world, n).linked.length;
  if (n.population >= SETTLEMENT.minPopulation * 0.7 || m.caps.has(SETTLEMENT.cap)) {
    const miss: string[] = [];
    if (!m.caps.has(SETTLEMENT.cap)) miss.push(`năng lực ${SETTLEMENT.cap} (có từ Hội đồng bộ lạc)`);
    if (n.population < SETTLEMENT.minPopulation) miss.push(`${SETTLEMENT.minPopulation - n.population} dân nữa (cần ${SETTLEMENT.minPopulation})`);
    const mats = (n.stock.wood || 0) + (n.stock.stone || 0);
    if (mats < SETTLEMENT.materials) miss.push(`${Math.ceil(SETTLEMENT.materials - mats)} gỗ/đá nữa (cần ${SETTLEMENT.materials})`);
    if (miss.length) say(1, `Lập điểm định cư (+${SETTLEMENT.housing} chỗ ở, thêm chỗ cho nhà ở, +đất): còn thiếu ${miss.join(", ")}.`);
    else say(1, `Đã đủ điều kiện lập điểm định cư (found_settlement trên đất trống cách mọi trung tâm ≥ ${SETTLEMENT.minDist} ô).${centresFree <= 0 ? " Điểm vượt mức miễn phí sẽ trừ ổn định, trừ khi nối đường về thủ đô." : ""}`);
  }

  // Era
  const era = nextEraNeeds(world, n);
  if (era && era.missing.length) say(1, `Để sang ${era.era} còn thiếu: ${era.missing.join(", ")}.`);

  // Water
  if (!freshWater(world, n)) say(1, "Thủ đô không có nước ngọt trong 2 ô: dân tăng chậm hơn và dễ mắc dịch. Đào Giếng (build well) hoặc chiếm đất tới sông (nearest_river).");

  // Land over the limit
  const held = governed(world, n), limit = tileLimit(world, n);
  if (held > limit) say(2, `Đang giữ ${held} ô, quá giới hạn quản lý ${limit}: mỗi ô thừa −2 ổn định mỗi lượt và làm tăng bất mãn. Bỏ ô kém (abandon_tile), hoặc làm đường nối các trung tâm (mỗi ${ROADS.tilesPerLimit} ô đường +1 giới hạn).`);

  // Discontent
  if ((n.discontent ?? 0) >= 40) say((n.discontent ?? 0) >= 75 ? 3 : 2, `Bất mãn ${Math.round(n.discontent ?? 0)}/100: tới 100 một phái sẽ đòi bỏ đi lập quốc riêng. Giữ ổn định ≥ ${SCHISM.calm} (đủ ăn, không vượt giới hạn đất, có nghi lễ/công trình ổn định) để nó nguội đi.`);

  // A connected realm (§2.7): settlements with no way home
  for (const c of isolated(world, n)) {
    const st = n.settlements.find(x => x.tile === c); if (!st) continue;
    const path = roadPlan(world, n, c, 1);
    say(2, `Điểm định cư ${st.name} bị cô lập (không đường bộ, đường thủy hay lối đi bộ ≤ ${CONNECT.walk} ô về thủ đô): đất quanh đó chỉ nộp ${CONNECT.isolatedYield * 100}% về kho và bất mãn +${CONNECT.isolatedDiscontent} mỗi lượt. ${path.length ? `Làm đường: build_road ${path.length} ô, bắt đầu ${path.slice(0, 4).map(xy).join(" ")}` : "Không tìm được lối đất để làm đường: dùng Bến thuyền ở cả hai nơi, hoặc chiếm đất nối liền"}.`);
  }

  // Provinces (§2.8): the restless or ungoverned ones, the worst two
  if (n.settlements.length) {
    const court = n.officials ?? [], slots = maxOfficials(world, n);
    const bad = provinces(world, n).filter(p => !p.capital && (p.mood >= 20 || p.causes.length)).sort((a, b) => b.mood - a.mood || b.people - a.people).slice(0, 2);
    for (const p of bad) {
      const fix: string[] = [];
      if (!p.loyal) fix.push(p.governor ? `thưởng cho bá tước ${p.governor.name} (trung thành ${p.governor.loyalty}, dưới ${OFFICIALS.idle} thì không làm việc; reward_official)` : `bổ nhiệm bá tước giữ ${xy(p.centre)} (appoint_official governor, seat ${xy(p.centre)}${court.length >= slots ? "; đã đủ chỗ quan chức: bãi bớt một người" : ""}): mỗi bậc tay nghề −${PROVINCE.calm} bất ổn và +${PROVINCE.yield * 100}% sản lượng`);
      if (p.causes.includes("cut_off")) fix.push("làm đường về thủ đô");
      if (p.causes.includes("crowded")) fix.push("thêm chỗ ở");
      const why = p.causes.map(c => CAUSE_VI[c]).join(", ");
      say(p.mood >= PROVINCE.secede ? 3 : p.mood >= 20 ? 2 : 1, `Tỉnh ${p.name} (${p.people} dân, ${p.tiles.length} ô) bất ổn ${Math.round(p.mood)}/100${why ? `, đang tăng vì ${why}` : ""}.${p.mood >= PROVINCE.secede ? " Khi bất mãn cả nước tới 100, tỉnh này sẽ đòi tách ra cùng đất đai." : ""}${fix.length ? ` Nên ${fix.join("; ")}.` : ""}`);
    }
  }

  // Neighbours (§7.9): the borders that need a decision
  for (const { o, border } of neighbours(world, n)) {
    if (!border) continue;
    const st = borderOf(world, n.id, o.id), t = Math.round(st.tension), treaty = treatiesBetween(world, n.id, o.id).map(x => x.type);
    const cause = (n.casusBelli[String(o.id)] ?? -1) >= world.tick;
    if (activeWar(world, n.id, o.id)) continue;
    if (t >= BORDER.dispute) say(3, `Biên giới với ${o.name} rất căng (${t}/100, ${border} ô giáp nhau, ${st.dispute ?? 0} lượt tranh chấp): mỗi lượt −${BORDER.disputeStability} ổn định và hai bên đều có chính nghĩa để tuyên chiến. ${treaty.length ? `Hiệp ước ${treaty.join(", ")} đang chặn chiến tranh; nó sẽ tan vỡ sau ${BORDER.treatyBreakAfter} lượt tranh chấp liên tục, hoặc bạn xé nó ngay (break_treaty) mà không mất uy tín vì có chính nghĩa. ` : ""}Hoặc hạ nhiệt (trade_offer, quà tặng, dỡ cách ly), hoặc chuẩn bị chiến binh.`);
    else if (t >= 40) say(2, `Biên giới với ${o.name} đang căng (${t}/100)${st.incidents.length ? `; gần nhất: ${st.incidents.at(-1)!.text}` : ""}. ${treaty.length ? "" : "Chưa có hiệp ước nào: một hiệp ước bất tương xâm hạ căng thẳng mỗi lượt."}`);
    else if (!treaty.length && !(n.trades[String(o.id)] || 0)) say(1, `${o.name} giáp bạn ${border} ô mà hai bên chưa buôn bán hay ký gì: gửi trade_offer hoặc treaty để mở quan hệ (chợ biên giới đã tự đổi ${st.market} lần).`);
    if (cause) say(2, `Bạn có chính nghĩa để tuyên chiến với ${o.name} tới lượt ${n.casusBelli[String(o.id)]} (không mất uy tín).`);
  }

  // Plague next door, or at home (§9.5)
  const tick = world.tick, cost = `ổn định −${CONTAGION.quarantineStability} và căng thẳng với mỗi láng giềng giáp biên +${CONTAGION.quarantineTension} mỗi lượt, chợ biên giới và buôn bán ngừng`;
  const sickNear = plagueNearby(world, n).filter(x => x.ways.length && !x.quarantined);
  if (contagious(n, tick) && !quarantined(n, tick))
    say(2, `Dân đang có dịch, còn lây được tới hết lượt ${n.outbreakUntil}: láng giềng giáp biên có ${CONTAGION.border * 100}% mỗi lượt bị lây, bạn hàng có đoàn buôn hay chợ biên giới với bạn ${CONTAGION.trade * 100}%. Cách ly (quarantine, ${AP_COST.quarantine} AP, turns 1–2) giữ dịch trong nhà và được +${CONTAGION.selfQuarantineRep} uy tín mỗi lượt có dịch; đổi lại ${cost}.`);
  else if (!quarantined(n, tick) && !immune(n, tick))
    for (const x of sickNear) {
      const p = Math.round(Math.max(...x.ways.map(w => w === "border" ? CONTAGION.border : CONTAGION.trade)) * (1 - m.medicine) * 100);
      say(2, `${x.o.name} đang có dịch (lây được tới hết lượt ${x.until}), có thể lây sang bạn ${x.ways.map(w => WAY_NAME[w]).join(", ")} (tới ${p}% mỗi đường mỗi lượt). Cách ly 1–2 lượt (quarantine) chặn được, đổi lại ${cost}.${m.medicine ? "" : " Y học (hiệu ứng medicine) cũng giảm khả năng lây."}`);
    }
  if (quarantined(n, tick) && !contagious(n, tick) && !sickNear.length)
    say(1, `Đang cách ly tới hết lượt ${n.quarantineUntil} mà quanh bạn không còn dịch: dỡ cách ly ({"type":"quarantine","turns":0}) để buôn bán và chợ biên giới họp lại.`);
  // Prosperity and pride (§4.7): how the people lives against the nations it knows, and what raises it
  const pr = n.prosperity;
  if (pr && pr.known !== null && pr.mood !== "acclaim" && pr.score < pr.known + PROSPERITY.margin / 2) {
    const WAY: Record<string, string> = {
      food: `lương thực ${pr.parts.food}/25: tích đủ ${PROSPERITY.foodTurns} lượt ăn trong kho (gốm giảm hư)`,
      goods: `hàng hóa ${pr.parts.goods}/25: làm nhiều loại hàng (công cụ, áo da, gốm, vải, dây thừng), mỗi loại chỉ tính tới ${PROSPERITY.goodCap} giá trị mỗi người`,
      room: `chỗ ở ${pr.parts.room}/25: dựng nhà ở, chiếm đất cho thôn xóm, lập điểm định cư (đủ điểm khi còn ${PROSPERITY.roomFull * 100}% chỗ trống)`,
      health: `sức khỏe và yên bình ${pr.parts.health}/25: tránh chiến tranh, giữ thảo dược chống dịch, áo da chống rét, đừng để đói`,
    };
    const weak = (Object.entries(pr.parts) as Array<[string, number]>).sort((a, b) => a[1] - b[1]).slice(0, 2).map(([k]) => WAY[k]);
    const top = knownProsperity(world, n).sort((a, b) => b.score - a.score || a.o.id - b.o.id)[0], est = top ? estimateProsperity(n, top.o) : "";
    if (pr.mood === "envy") say(2, `Dân ta ganh tị: thịnh vượng ${pr.score}/100, kém trung bình ${pr.known} của các nước quen biết${top ? ` (${top.o.name}${typeof est === "number" ? ` ~${est}` : ""})` : ""}. Mỗi lượt bất mãn tăng và có nhà bỏ sang nước giàu hơn. Tài nguyên của nước là để dân sống tốt: nâng ${weak.join("; ")}.`);
    else say(1, `Thịnh vượng ${pr.score}/100, trung bình các nước quen biết ${pr.known}: hơn họ ${PROSPERITY.margin} điểm thì dân tung hô (+${PROSPERITY.acclaimStability} ổn định mỗi lượt), kém ${PROSPERITY.margin} điểm thì dân ganh tị. Nâng ${weak.join("; ")}.`);
  }

  // Customs
  if ((n.family?.births ?? "neutral") === "limit" && n.population < 40) say(2, `Bạn đang hạn chế sinh khi chỉ có ${n.population} dân: dân sẽ co dần. Đổi về "neutral" (family_policy) trừ khi đang đói.`);

  // Research
  if (!n.research) {
    const opts = researchOptions(world, n).sort((a, b) => inventionCost(world, n, a) - inventionCost(world, n, b) || a.localeCompare(b)).slice(0, 3);
    if (opts.length) say(1, `Chưa nghiên cứu gì: rẻ nhất là ${opts.map(id => `${invName(world, id)} (${id}, ${inventionCost(world, n, id)} RP)`).join(", ")}.`);
  }

  // Idle hands
  const assigned = Object.values(n.labor).reduce((a, b) => a + b, 0), hands = workers(n);
  if (assigned < hands * 0.6) say(1, `${hands - assigned}/${hands} lao động chưa được giao việc (họ tự hái lượm, kém hiệu quả).`);

  // Warriors that can no longer be (customs, age)
  if ((n.family?.fighters ?? "all") === "men" && n.labor.warrior > 0 && n.labor.warrior >= n.population * 0.3) say(1, `Chỉ đàn ông ra trận mà ${n.labor.warrior} chiến binh đã là ${Math.round(n.labor.warrior / n.population * 100)}% dân: thêm nữa sẽ hết người làm.`);

  return out.sort((a, b) => b.level - a.level).slice(0, 7);
}
