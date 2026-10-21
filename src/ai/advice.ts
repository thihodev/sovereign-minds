// The engine's own reading of a nation's situation (§8.2 "advice"): what blocks it, what it can do about
// it now, with the numbers. The rules are long; this tells each nation the few that matter this turn,
// and it is always right about them because it is computed from the same code that applies them.

import { NEIGHBORS, col, dist, row, within } from "../hex.ts";
import { WAR, AP_COST, BUILDING_BY_TYPE, CLASSES, ROYALS, TREASURY, URBAN, GREATS, INITIATIVE, LIVING, CAPITAL_MOVE, RIVER, ANIMALS, HERDS, FESTIVAL, KIN, LUXURY, MISSION, RENAME_DECREE, BORDER, CONNECT, CONTAGION, EXODUS, LAND, HAMLET, ROADS, SCHISM, SETTLEMENT, OFFICIALS, PROVINCE } from "../rules.ts";
import { CAUSE_VI, provinces } from "../provinces.ts";
import { allBuildings, invName } from "../catalog.ts";
import { freshWater, governed, housing, housingParts, housingSlots, inventionCost, isHousing, maxOfficials, mods, nextEraNeeds, ownedTiles, researchOptions, roadNet, roadPlan, tileLimit, unrenamed, workers, luxuries, canSeeRes } from "../engine.ts";
import { mouths } from "../people.ts";
import { WHY_VI, exodusOf } from "../exodus.ts";
import { borderOf, neighbours } from "../border.ts";
import { isolated } from "../connect.ts";
import { WAY_NAME, contagious, immune, plagueNearby, quarantined } from "../contagion.ts";
import { PROSPERITY } from "../rules.ts";
import { estimateProsperity, knownProsperity } from "../prosperity.ts";
import { activeWar, hostile, peaceOutlook, touching, treatiesBetween, warSide } from "../diplomacy.ts";
import { ministerAdvice } from "../ministers.ts";
import { goodVi, landReserves, shortages, specialtiesOf, surpluses, veinsNear } from "../market.ts";
import { seaAdvice } from "../sea.ts";
import { herdView } from "../herds.ts";
import { livingStandard } from "../living.ts";
import { greatsView } from "../greats.ts";
import { inLaws, royalsView } from "../royals.ts";
import { urbanView } from "../urban.ts";
import { classView } from "../classes.ts";
import { goodValue } from "../catalog.ts";
import type { Nation, World } from "../types.ts";

const xy = (i: number) => `(${col(i)}, ${row(i)})`;

export interface Advice { level: number; text: string }

export function advice(world: World, n: Nation): Advice[] {
  if (!n.founded || !n.alive) return [];
  const out: Advice[] = [], m = mods(world, n), owned = ownedTiles(world, n.id);
  const need = mouths(n) * m.foodPerPerson, food = n.stock.food || 0, roof = housing(world, n), hp = housingParts(world, n);
  const say = (level: number, text: string) => out.push({ level, text });

  // §10.6 the gods' decrees: a renaming decree in force, and what the gods said lately
  const rd = world.renameDecree;
  if (rd && !rd.done && world.tick >= rd.from && world.tick <= rd.until) {
    const { changed, left } = unrenamed(world, n);
    const how = `rename_nation (name, people, capital, flag) và rename (what: capital|settlement|official), đều miễn phí, không mất ổn định`;
    say(changed ? 2 : 3, `Sắc lệnh ${rd.code} của các vị thần: "${rd.text}". Còn ${rd.until - world.tick + 1} lượt (hết lượt ${rd.until}).${left.length ? ` Chưa đổi: ${left.slice(0, 8).join(", ")}${left.length > 8 ? ` và ${left.length - 8} tên nữa` : ""}.` : " Đã đổi hết."} Dùng ${how}.${changed ? "" : ` Không đổi tên nào: −${RENAME_DECREE.reputation} uy tín, −${RENAME_DECREE.stability} ổn định.`}`);
  }
  for (const d of world.decrees) if (d.code !== rd?.code && d.effectiveTick <= world.tick && world.tick - d.effectiveTick < 10) say(2, `Sắc lệnh ${d.code} của các vị thần (lượt ${d.effectiveTick}): "${d.text}". Hãy làm theo bằng các lệnh của bạn.`);

  // §4.8 people who left: the ruler's first duty
  const ex = exodusOf(n, world.tick);
  if (ex.recent) {
    const where = Object.entries(ex.to).map(([id, k]) => `${k} sang ${world.nations[Number(id)]?.name ?? "?"}`).join(", ");
    const why = Object.entries(ex.why).map(([w, k]) => `${k} vì ${WHY_VI[w as keyof typeof WHY_VI]}`).join(", ");
    const fix: string[] = [];
    if (ex.why.envy) fix.push("nâng thịnh vượng (lương thực dự trữ, hàng hóa, chỗ ở)");
    if (ex.why.unrest || ex.why.border) fix.push("nâng ổn định (đủ ăn, có chỗ ở, bàn thờ, hạ căng thẳng biên giới)");
    if (ex.why.faction || ex.why.schism) fix.push("hạ bất mãn (đường tới tỉnh cô lập, bá tước, ổn định ≥ 60)");
    // §4.10 the ruler's own way to win hearts back
    const faithful = m.caps.has(MISSION.cap), homeMission = (n.missions ?? []).some(x => x.where < 0 && x.until >= world.tick);
    if (ex.why.unrest || ex.why.faction || ex.why.envy || ex.why.border) fix.push(faithful
      ? `${homeMission ? "" : "truyền giáo trong nước (mission home: −bất mãn, +ổn định, sinh nở ×" + MISSION.births + "); "}${!n.festival || world.tick - n.festival.tick >= FESTIVAL.every ? `mở lễ hội (festival: +${FESTIVAL.stability} ổn định, mùa cưới sinh ×${FESTIVAL.births})` : "lễ hội lần tới sau lượt " + (n.festival.tick + FESTIVAL.every)}`
      : "nghiên cứu Nghi lễ (P5) để truyền giáo và an lòng dân");
    if (ex.why.faith) fix.push("nhà truyền giáo nước khác đang kéo dân đi: cách ly (quarantine) để đuổi họ, hoặc làm dân hài lòng hơn");
    say(ex.share > EXODUS.alarm ? 3 : ex.lastTurn ? 2 : 1, `${ex.recent} người đã bỏ đi trong ${EXODUS.window} lượt qua (${Math.round(ex.share * 100)}% dân${ex.lastTurn ? `, ${ex.lastTurn} người lượt vừa rồi` : ""}): ${why}${where ? `; ${where}` : ""}.${ex.share > EXODUS.alarm ? ` Đã quá ${EXODUS.alarm * 100}%: mỗi lượt −${EXODUS.stability} ổn định, uy tín và hạng giảm.` : ""} Giữ dân: ${fix.join("; ") || "giữ cho dân đủ ăn, có chỗ ở và yên ổn"}.`);
  }

  // §4.10 discontent climbing: faith and feasts calm a people before it splits
  if ((n.discontent ?? 0) >= 60 && !ex.recent) {
    const faithful = m.caps.has(MISSION.cap);
    say((n.discontent ?? 0) >= 85 ? 3 : 2, `Bất mãn ${Math.round(n.discontent ?? 0)}/100: tới 100 thì một phái đòi ly khai. ${faithful ? `Truyền giáo trong nước (mission home, −${MISSION.calm}/lượt trong ${MISSION.turns} lượt) và lễ hội (festival, −${FESTIVAL.calm}, +${FESTIVAL.stability} ổn định)` : "Nghiên cứu Nghi lễ (P5) để truyền giáo"}; bổ nhiệm bá tước và làm đường cho tỉnh xa.`);
  }

  // Food
  if (food < need) {
    // §4.4 a famine first: it costs 5 stability and 10 discontent a turn, and every other remedy fails while it lasts
    const ways = ["dồn người vào hái lượm, săn, đánh cá ngay (labor)"];
    if (m.caps.has("trồng-trọt")) ways.push("xây Ruộng trên đồng cỏ hoặc ô có sông");
    if (n.inventions.includes("P9") && owned.some(t => t.terrain === "coast" || t.river)) ways.push("dựng Bến cá (+25% cá)");
    ways.push("bớt chiến binh, thợ chế tác, thợ xây, người nghiên cứu cho tới khi đủ ăn", "mua lương thực của nước dư (trade_offer)", "KHÔNG mở lễ hội (tốn 0,5 lương thực mỗi người)");
    say(3, `Lương thực ${Math.round(food)} không đủ một lượt ăn (${Math.round(need)}): người chết đói, không trẻ nào ra đời, mỗi lượt −5 ổn định và +10 bất mãn, dân bỏ đi. Việc đầu tiên: ${ways.join("; ")}.`);
  }
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
  // §2.1 rivers: the richest land; a neighbour's river land at our border is worth a treaty, a trade, or a war
  {
    const ownRiver = owned.filter(t => t.river && t.land).length;
    const theirs = world.nations.filter(o => o.id !== n.id && o.alive && o.founded && n.met.includes(o.id)).map(o => ({ o, k: world.tiles.filter(t => t.owner === o.id && t.river && t.land && owned.some(m => dist(m.i, t.i) <= 2)).length })).filter(x => x.k > 0).sort((a, b) => b.k - a.k)[0];
    if (theirs && ownRiver < 3) say(2, `${theirs.o.name} giữ ${theirs.k} ô đất ven sông sát biên giới ta, còn ta chỉ có ${ownRiver}. Đất ven sông giàu nhất: nhiều cá, lúa hoang, đất sét, ruộng +${RIVER.fieldBonus * 100}% (châu thổ +${RIVER.deltaBonus * 100}%), mỗi ô thêm ${HAMLET.river} gia đình. Giành lấy bằng thương lượng (nhượng đất trong hiệp ước), hoặc bằng chiến tranh khi có chính nghĩa và quân mạnh hơn.`);
  }
  if (!freshWater(world, n)) {
    // §2.3 a settlement on a river could be the better capital
    const wet = n.settlements.find(st => within(st.tile, RIVER.waterReach).some(j => world.tiles[j].river || world.tiles[j].terrain === "swamp"));
    say(1, `Thủ đô không có nước ngọt trong 2 ô: dân tăng chậm hơn và dễ mắc dịch. Đào Giếng (build well) hoặc chiếm đất tới sông (nearest_river)${wet && (n.capitalMoved === undefined || world.tick - n.capitalMoved >= CAPITAL_MOVE.every) ? `, hoặc dời đô về ${wet.name} bên sông (move_capital, ${CAPITAL_MOVE.materials} gỗ/đá, −${CAPITAL_MOVE.stability} ổn định)` : ""}.`);
  }

  // Land over the limit
  const held = governed(world, n), limit = tileLimit(world, n);
  if (held > limit) say(2, `Đang giữ ${held} ô, quá giới hạn quản lý ${limit}: không đủ người làm, mỗi lượt ${LAND.overRelease} ô thừa (trống, xa, nghèo nhất) tự thành đất hoang. Muốn giữ đất: nâng giới hạn bằng đường nối các trung tâm (mỗi ${ROADS.tilesPerLimit} ô đường +1), lập điểm định cư hoặc tăng dân; hoặc tự chọn ô bỏ (abandon_tile) để giữ ô tốt.`);

  // Discontent
  if ((n.discontent ?? 0) >= 40) say((n.discontent ?? 0) >= 75 ? 3 : 2, `Bất mãn ${Math.round(n.discontent ?? 0)}/100: tới 100 một phái sẽ đòi bỏ đi lập quốc riêng. Giữ ổn định ≥ ${SCHISM.calm} (đủ ăn, có chỗ ở, có nghi lễ/công trình ổn định) để nó nguội đi.`);

  // §2.5 transport is the lifeblood: land with no road beside it sends home less
  {
    const land = owned.filter(t => t.land), served = (t: { i: number; road?: number }) => (t.road || 0) > 0 || NEIGHBORS[t.i].some(j => world.tiles[j].owner === n.id && world.tiles[j].land && (world.tiles[j].road || 0) > 0);
    const off = land.filter(t => !served(t));
    if (land.length >= 10 && off.length / land.length > 0.5 && (n.stock.wood || 0) >= 6)
      say(1, `${off.length}/${land.length} ô đất chưa có đường ở trên hay bên cạnh. Mỗi ô có đường của bạn ở trên hoặc kề bên nộp về kho thêm ${ROADS.yield.slice(1).map(x => x * 100 + "%").join("/")} (đường cấp 1/2/3); ô có đường nối về thủ đô được thủ thêm ${ROADS.reinforce * 100}%. Làm đường (build_road) xuyên qua vùng đất giàu nhất (roads.land_without_road).`);
  }

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

  // §4.5 the nation it split from, or the ones that split from it
  for (const o of world.nations) {
    if (!o.alive || o.id === n.id) continue;
    if (n.origin?.from === o.id) say(2, `${o.name} là nước cũ của ta và luôn mong thâu tóm lại: không thể liên minh, thông hành hay bất tương xâm với họ; họ luôn có chính nghĩa đánh ta, và nếu thủ đô ta rơi vào tay họ, cả nước sẽ nhập về họ. Giữ chiến binh ở biên giới với họ.`);
    else if (o.origin?.from === n.id) say(1, `${o.name} là phần đất đã tách khỏi ta (lượt ${o.origin.tick}): ta luôn có chính nghĩa để đòi lại; chiếm được thủ đô của họ thì đất, dân và kho của họ trở về với ta.`);
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

  // §4.9 AI ministers: how far to the next seat, and when one can be asked for
  // §6.3 + §7.10 what the nation lacks, where it lies, and what it can sell
  const known = n.met.map(id => world.nations[id]).filter(o => o?.alive && o.founded);
  const spare = surpluses(world, n);
  for (const sh of shortages(world, n).slice(0, 2)) {
    const name = goodVi(world, sh.good), ways: string[] = [];
    const rich = known.filter(o => specialtiesOf(world, o, n).some(x => x.good === sh.good) || surpluses(world, o).some(x => x.good === sh.good));
    if (rich.length) ways.push(`mua của ${rich.slice(0, 3).map(o => o.name).join(", ")}${spare.length ? ` (đổi ${goodVi(world, spare[0].good)} bạn đang dư, giá thế giới ${spare[0].world})` : ""} hoặc ký cống nạp bằng ${name}`);
    const veins = veinsNear(world, n).filter(v => v.good === sh.good);
    const free = veins.find(v => v.owner < 0), theirs = veins.find(v => v.owner >= 0);
    if (free) ways.push(`chiếm mạch ${name} tự do ở ${xy(free.tile)}, cách ${free.distance} ô (mở rộng đất hoặc lập điểm định cư)`);
    if (theirs) ways.push(`mạch ${name} của ${world.nations[theirs.owner].name} ở ${xy(theirs.tile)} sát biên giới: thương lượng, hoặc chiếm nếu có chính nghĩa và quân mạnh hơn`);
    say(2, `Thiếu ${name}: cần ${sh.need}/lượt, có ${sh.have}; ở nước bạn giá ${sh.local}, giá thế giới ${sh.world}. ${ways.length ? `Cách có: ${ways.join("; ")}.` : "Chưa biết nước nào giàu thứ này: đi thám hiểm, gặp thêm nước."}`);
  }
  if (spare.length) {
    const top = spare[0], buyers = known.filter(o => shortages(world, o).some(x => x.good === top.good));
    say(1, `Dư ${top.spare} ${goodVi(world, top.good)} (giá thế giới ${top.world}${top.world > goodValue(world, top.good) ? ", đang đắt" : ""})${buyers.length ? `: ${buyers.slice(0, 3).map(o => o.name).join(", ")} đang thiếu, hãy bán cho họ (trade_offer)` : ": đem bán lấy thứ bạn thiếu"}.`);
  }
  const mine = specialtiesOf(world, n).filter(x => x.veins.length);
  const exposed = mine.flatMap(x => x.veins.map(i => ({ good: x.good, i }))).find(v => world.nations.some(o => o.alive && o.founded && o.id !== n.id && activeWar(world, n.id, o.id) && world.tiles.some(t => t.owner === o.id && Math.abs(col(t.i) - col(v.i)) + Math.abs(row(t.i) - row(v.i)) <= 3)));
  if (exposed) say(3, `Mạch ${goodVi(world, exposed.good)} của bạn ở ${xy(exposed.i)} nằm sát quân thù: đặt chiến binh, dựng hàng rào, đừng để mất nó.`);

  // §7.9 brawl after brawl: one more and the border goes to war
  for (const o of world.nations) {
    if (o.id === n.id || !o.alive || !o.founded) continue;
    const st = world.borders?.[n.id < o.id ? `${n.id}-${o.id}` : `${o.id}-${n.id}`];
    const recent = (st?.brawls ?? []).filter(x => world.tick - x.tick < BORDER.brawlWindow);
    if (recent.length >= BORDER.brawlsToWar - 1 && !activeWar(world, n.id, o.id))
      say(3, `Biên giới với ${o.name} đã có ${recent.length} vụ xô xát chết người trong ${BORDER.brawlWindow} lượt: thêm một vụ nữa là chiến tranh. Hạ căng thẳng ngay (hiệp ước, buôn bán, quà tặng) hoặc chuẩn bị chiến binh ở biên giới.`);
  }

  // §7.4b at war: the score, the dead, the border clashes, the price of peace, and where to strike
  for (const w of world.wars.filter(x => x.end === null && (x.a === n.id || x.b === n.id))) {
    const foe = world.nations[w.a === n.id ? w.b : w.a], front = touching(world, n.id, foe.id).length;
    if (w.start > world.tick) {
      say(3, `${w.a === n.id ? `Ta đã tuyên chiến với ${foe.name}` : `${foe.name} đã tuyên chiến với ta`}: chiến sự bắt đầu từ lượt ${w.start}.${front ? ` Hai nước giáp nhau ${front} ô: từ lượt đó quân hai bên tự giao tranh ở biên giới mỗi lượt; thiếu chiến binh thì dân quân chết thay. Phân thêm chiến binh (labor warrior) và rèn vũ khí ngay.` : ""} Hòa trắng chỉ ký được từ lượt ${w.start + WAR.peaceAfter}.`);
      continue;
    }
    const us = warSide(w, n.id), them = warSide(w, foe.id), o = peaceOutlook(w, n.id), r1 = (x: number) => Math.round(x * 10) / 10;
    const parts = [`Đang chiến tranh với ${foe.name} (lượt thứ ${world.tick - w.start + 1}): điểm chiến tranh ta ${r1(us.score)} – họ ${r1(them.score)}; ta mất ${us.dead} người, họ mất ${them.dead}; ta chiếm ${us.tiles + us.centres} ô, họ chiếm ${them.tiles + them.centres} ô.`];
    parts.push(front
      ? `Hai nước giáp nhau ${front} ô: mỗi lượt quân hai bên tự giao tranh ở biên giới (${WAR.clash.engage * 100}% chiến binh và dân quân ở mặt trận này); bên yếu hơn chết nhiều hơn, bên mạnh gấp ${WAR.clash.push} lần đẩy lùi biên giới và chiếm một ô. Ta có ${n.labor.warrior} chiến binh.`
      : `Hai nước chưa giáp nhau nên không có giao tranh biên giới: chỉ đánh được bằng attack/raid trong tầm.`);
    if (o.lead <= -WAR.losingBy) parts.push(`Ta đang thua ${-o.lead} điểm: mỗi lượt −1 ổn định, +1 bất mãn.`);
    parts.push(o.winner === null
      ? world.tick < o.whiteFrom
        ? `Chưa được hòa trắng trước lượt ${o.whiteFrom}; muốn dừng sớm hơn thì hòa ước phải có điều khoản: cống nạp đáng ≥ ${WAR.earlyTribute}/lượt (giá thế giới) trong ≥ ${WAR.earlyTurns} lượt, hoặc nhượng ít nhất 1 ô.`
        : `Ký hòa bây giờ là hòa trắng${w.a === n.id ? `: ta tuyên chiến nên dân oán, −${WAR.whiteStability} ổn định` : ""}. Bên nào dẫn ${WAR.decisive}+ điểm khi ký hòa thì bên kia phải bồi thường.`
      : o.winner === n.id
        ? `Ta đang thắng: ký hòa bây giờ thì ${foe.name} phải bồi thường ngay ${Math.round(o.share * 100)}% mọi thứ trong kho${o.tiles ? ` và ${o.tiles} ô biên giới` : ""}; đánh tiếp thì được nhiều hơn (tối đa ${WAR.reparation.maxShare * 100}%).`
        : `Ta đang thua nặng: ký hòa bây giờ ta phải bồi thường ${Math.round(o.share * 100)}% mọi thứ trong kho${o.tiles ? ` và ${o.tiles} ô biên giới` : ""}. Đánh tiếp để gỡ điểm, hoặc cầu hòa sớm trước khi mất thêm.`);
    const centres = new Set([foe.capital, ...foe.settlements.map(s => s.tile)]);
    const targets = touching(world, foe.id, n.id).filter(i => world.tiles[i].land && !centres.has(i)).sort((a, b) => NEIGHBORS[b].filter(j => world.tiles[j].owner === n.id).length - NEIGHBORS[a].filter(j => world.tiles[j].owner === n.id).length || a - b).slice(0, 2);
    if (targets.length) parts.push(`Ô đáng đánh (attack, kề nhiều ô của ta nên mặt trận rộng): ${targets.map(i => `${xy(i)} ${world.tiles[i].terrain}`).join(", ")}; thắng thì chiếm ô, thu chiến lợi phẩm và +${WAR.score.battle + WAR.score.tile} điểm.`);
    say(3, parts.join(" "));
  }

  // §4.5 betrayal: the old nation and the traitors
  for (const o of world.nations) {
    if (!o.alive || !o.founded || !hostile(world, n, o)) continue;
    if (o.origin?.from === n.id) say(1, `${o.name} là kẻ phản bội đã tách khỏi ta (lượt ${o.origin.tick}): hai nước thù địch, không buôn bán. Ta luôn có chính nghĩa đánh họ và đánh mạnh hơn ${KIN.vengeance * 100}%; mỗi ô lấy lại +${KIN.retake} ổn định; chiếm được thủ đô của họ thì cả nước họ trở về. Muốn buôn bán lại: ký hòa bình (peace) hoặc buộc họ làm chư hầu.`);
    else say(2, `${o.name} coi ta là kẻ phản bội: hai nước thù địch, không buôn bán, họ có thể tấn công bất cứ lượt nào mà không mất uy tín (và đánh mạnh hơn ${KIN.vengeance * 100}%). Giữ chiến binh và hàng rào ở biên giới với họ, tìm đồng minh nơi khác, hoặc cầu hòa (treaty peace) để yên ổn.`);
  }

  // §6.4 herds: wild ones on the land to tame, a herd outgrowing its room, meat in a famine
  const hv = herdView(world, n);
  if (hv) {
    const tameable = hv.wild_on_my_land.filter(x => x.can_tame), locked = hv.wild_on_my_land.filter(x => !x.can_tame && x.animal !== "horse");
    if (!Object.keys(hv.animals).length && tameable.length && n.labor.hunt > 0) say(1, `Trên đất bạn có thú hoang thuần hóa được (${tameable.map(x => `${goodVi(world, x.wild)} → ${goodVi(world, x.animal)}`).join(", ")}): thợ săn sẽ bắt sống về nuôi. Chúng sinh sôi, cho thịt, sữa, lông, da; chó giúp săn, bò kéo cày, ngựa ra trận.`);
    else if (!tameable.length && locked.length && !m.caps.has(ANIMALS.goat.cap)) say(1, `Đất bạn có ${locked.map(x => goodVi(world, x.wild)).join(", ")}: nghiên cứu Thuần dưỡng (P15) để bắt về nuôi thành đàn gia súc.`);
    const grazers = ["goat", "cattle", "horse"].reduce((s2, k) => s2 + (hv.animals[k] || 0), 0);
    if (grazers > hv.room_grazers) say(1, `Đàn ăn cỏ (${grazers}) vượt sức chứa ${hv.room_grazers}: mỗi lượt một phần bị giết thịt. Dựng Chuồng (+${HERDS.pen}) hoặc giữ thêm đồng cỏ.`);
    if (food < need && Object.keys(hv.animals).length) say(3, `Đang thiếu ăn: có thể giết thịt gia súc ngay (cull), ví dụ ${Object.entries(hv.animals).slice(0, 2).map(([k, c]) => `${c} ${goodVi(world, k)} = ${c * ANIMALS[k].meat} lương thực`).join(", ")}.`);
  }

  // §4.11 the standard of living: what the people of this age expect and lack
  {
    const l = livingStandard(world, n), next = nextEraNeeds(world, n);
    if (l.missing.length) say(l.score < LIVING.restless ? 2 : 1, `Mức sống ${l.score}/100 (dân thời này mong: ${l.expected.length} nhu cầu, đáp ứng ${l.expected.length - l.missing.length}). Còn thiếu: ${l.missing.slice(0, 4).map(x => `${x.name} (có ${x.have}, cần ${x.want}: ${x.how})`).join("; ")}. Mức sống cao thì nghiên cứu nhanh hơn (tới +${LIVING.rp * 100}%) và dân yên${next && /mức sống/.test(next.missing.join(" ")) ? `; cổng ${next.era} cần mức sống cao hơn` : ""}.`);
  }

  // §4.13 the treasury: spend it, keep the tax fair, build what earns
  if (n.founded && n.treasury) {
    const t = n.treasury, purse = n.stock.coin || 0, last = t.last;
    const net = last ? Object.values(last.in).reduce((x, y) => x + y, 0) - Object.values(last.out).reduce((x, y) => x + y, 0) : 0;
    const canMarket = (n.inventions.includes("P12") || m.unlocked.has("market")) && !n.buildings.some(b => b.type === "market");
    if (t.tax > TREASURY.fair + 1e-9) say(2, `Thuế sản xuất ${Math.round(t.tax * 100)}% vượt mức dân chịu được (${Math.round(TREASURY.fair * 100)}%): mỗi lượt mất ổn định và thêm bất mãn. Hạ thuế (tax) khi ngân khố đã đủ.`);
    if (purse > TREASURY.safe) say(1, `Ngân khố ${Math.round(purse)} tiền: quá ${TREASURY.safe} thì mỗi lượt thất thoát ${TREASURY.leak * 100}% phần dư. Hãy chi: thuê thợ cho công trình đang xây (invest building, ${TREASURY.coinPerWork} tiền/công), nuôi học giả (invest research, ${TREASURY.coinPerRP} tiền/RP), xây chợ, làm đường (ngân khố tự mua gỗ, đá còn thiếu), hoặc mua hàng của nước khác bằng tiền (trade_offer give coin).`);
    else if (purse < 10 && net < 0) say(2, `Ngân khố cạn (${Math.round(purse)} tiền, lượt trước hụt ${Math.round(-net)}): lương quan lại sẽ phải trả bằng lương thực. Xây công trình sinh lợi (chợ, bến thuyền, cảng), làm đường, hoặc tăng thuế một chút.`);
    if (canMarket) say(1, `Xây Chợ (build market): công trình công cộng thu ${BUILDING_BY_TYPE.market?.effect.income ?? 2} tiền/lượt, thêm 1 tiền mỗi 50 dân và mỗi bạn hàng.`);
  }

  // §4.15 the orders of society: the bitter and the restless, and what they want
  if (n.founded) {
    const cv = classView(world, n).filter(c => c.mood < CLASSES.restless || c.heading_to < CLASSES.restless).sort((a, b) => a.mood - b.mood);
    for (const c of cv.slice(0, 2)) {
      const want = c.because.filter(x => x.startsWith("−")).join(", ");
      say(c.strike ? 3 : 2, `${c.name[0].toUpperCase()}${c.name.slice(1)} ${c.strike ? "đang đình công" : "bất bình"} (hài lòng ${c.mood}/100, đang hướng tới ${c.heading_to}${want ? `: ${want}` : ""}). ${c.strike ? `Việc của họ giảm ${CLASSES.strikeCut * 100}%. ` : ""}Sửa điều họ cần, hoặc ban ơn từ ngân khố (grant, ${c.class}: mỗi tiền một người +${CLASSES.grantPer} hài lòng, ~${Math.ceil(Math.max(CLASSES.grantMinSize, c.size) * (CLASSES.restless + 10 - c.mood) / CLASSES.grantPer)} tiền để qua mức ${CLASSES.restless + 10}).`);
    }
  }

  // §2.13 towns and cities: a focus for each, and what the next tier lacks
  if (n.founded) {
    const tv = urbanView(world, n, provinces(world, n));
    const idle = tv.find(x => x.tier !== "Làng" && !x.focus);
    if (idle) say(1, `${idle.tier} ${idle.centre} chưa có trọng tâm: đặt city_focus (trade: ×${URBAN.focus.trade.mult} tiền, learning: ×${URBAN.focus.learning.mult} nghiên cứu, craft, faith, garrison).`);
    const near = tv.find(x => x.next && !x.next.startsWith("đủ") && x.people >= (x.tier === "Làng" ? URBAN.town.people : URBAN.city.people) * 0.7);
    if (near) say(1, `${near.centre} sắp lớn lên: ${near.next}.`);
  }

  // §4.14 royal marriages: an offer waiting, or a tense neighbour to bind
  {
    const rv = royalsView(world, n);
    for (const o of rv.marriage_offers_to_you ?? []) say(2, `${o.from} cầu hôn: gả ${o.royal} sang triều ta${Object.keys(o.dowry).length ? ` với hồi môn ${Object.entries(o.dowry).map(([k, q]) => `${q} ${goodVi(world, k)}`).join(", ")}` : ""}. Nhận lời (accept_marriage, offer ${o.offer}) để thành thông gia ${ROYALS.bond} lượt: biên giới dịu đi, không thuế quan, +${ROYALS.reputation} uy tín.`);
    const tense = known.filter(o => !inLaws(world, n.id, o.id) && borderOf(world, n.id, o.id).tension >= 40 && !activeWar(world, n.id, o.id)).sort((x, y) => borderOf(world, n.id, y.id).tension - borderOf(world, n.id, x.id).tension)[0];
    if (tense && rv.unwed.length) say(1, `Biên giới với ${tense.name} đang căng (${Math.round(borderOf(world, n.id, tense.id).tension)}/100): gả ${rv.unwed[0].name} sang đó (royal_marriage) để thành thông gia, mỗi lượt căng thẳng −${ROYALS.calm}.`);
  }

  // §4.12 great people: a richer life draws the great ones of a poorer neighbour
  {
    const gv = greatsView(world, n), mineL = n.living ?? 50;
    const lure = gv?.others?.map(g => ({ g, o: world.nations.find(x => x.name === g.nation)! })).filter(x => x.o && mineL - (x.o.living ?? 50) >= 20)[0];
    if (lure && (n.invited === undefined || world.tick - n.invited >= GREATS.inviteEvery))
      say(1, `${GREATS.kinds[lure.g.kind].name} ${lure.g.name} của ${lure.o.name} (${GREATS.kinds[lure.g.kind].desc}): dân ta sống tốt hơn họ, có thể mời sang (invite_great, lễ vật đáng ≥ ${GREATS.giftWorth} theo giá thế giới; lễ vật thuộc về họ dù người ấy có nhận lời hay không).`);
  }

  // §2.11 the sea, and the fine things that calm a people
  for (const a of seaAdvice(world, n)) say(a.level, a.text);
  const lux = luxuries(world, n);
  if (lux.kinds.length < 2 && n.population >= 20) {
    const res = landReserves(world).get(n.id) ?? {};
    const onLand = LUXURY.goods.filter(g => !lux.kinds.includes(g) && (res[g]?.amount ?? 0) > 0 && canSeeRes(world, n, g)).map(g => goodVi(world, g));
    const sellers = known.filter(o => LUXURY.goods.some(g => surpluses(world, o).some(x => x.good === g))).map(o => o.name);
    say(1, `Xa xỉ phẩm: dân đang dùng ${lux.kinds.length ? lux.kinds.map(g => goodVi(world, g)).join(", ") : "không thứ nào"} (+${lux.stability} ổn định/lượt). Mỗi loại có đủ ${lux.need} trong kho cho thêm +${LUXURY.stability}/lượt (tối đa +${LUXURY.max}).${onLand.length ? ` Trên đất bạn có: ${onLand.join(", ")} (hái lượm, săn, đánh cá hay đào mỏ để lấy).` : ""}${sellers.length ? ` Mua của ${sellers.slice(0, 3).join(", ")}.` : ""}`);
  }

  // §10.5 an idea for the world, now and then: the gods reward the ones they take up
  {
    const last = world.petitions.filter(p => p.nation === n.id).at(-1);
    if (world.tick > 10 && (!last || world.tick - last.tick >= INITIATIVE.nudgeAfter) && world.tick % 5 === n.id % 5)
      say(2, `Đề xuất một sáng kiến cho thế giới (petition, category "sáng kiến", MIỄN PHÍ, 0 AP): một tài nguyên, cơ chế, sự kiện, công trình hay phong tục mới, cụ thể, có con số. Được chấp thuận thì các vị thần ban cho nước ta MỘT TRÍ TUỆ AI thứ hai (một bộ trưởng tự chọn lĩnh vực qua "mind") trong ${INITIATIVE.mind.accepted} lượt, thêm ${INITIATIVE.mind.implemented} lượt nếu ý tưởng được đưa vào game; kèm +${INITIATIVE.accepted.reputation} uy tín, +${INITIATIVE.accepted.stability} ổn định, nghiên cứu +${INITIATIVE.accepted.inspiration * 100}%.`);
  }

  for (const a of ministerAdvice(world, n)) say(a.level, a.text);

  return out.sort((a, b) => b.level - a.level).slice(0, 7);
}
