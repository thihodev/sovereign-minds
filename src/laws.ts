// §10.3 Laws the Watcher can change by decree. Each one is a number in the rule tables; a law decree
// sets it from its effective turn on, for the whole world, and every nation is told (world_laws, and the
// numbers in its rules). The values live in the world (its decrees), so a replay or a restart gives the
// same world; applyLaws() writes them into the rule tables before anything reads them.

import { BORDER, CONNECT, DEMO, ERA_TABLE, EVENTS, FLOOD, GROWTH, HAMLET, HORDES, HOUSING, OFFICIALS, PROVINCE, QUAKE, RESEARCH, ROADS, SCHISM, SEA, SETTLEMENT, START, TILES, TRADE, WAR } from "./rules.ts";
import type { World } from "./types.ts";

export interface LawDef {
  key: string;
  group: string;
  label: string;
  desc: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  get: () => number;
  set: (v: number) => void;
}

const field = <T extends object>(obj: T, k: keyof T) => ({ get: () => obj[k] as unknown as number, set: (v: number) => { (obj as Record<string, unknown>)[k as string] = v; } });

export const LAWS: LawDef[] = [
  { key: "settlement.minPopulation", group: "Định cư và chỗ ở", label: "Dân tối thiểu để lập điểm định cư", desc: "found_settlement cần ít nhất chừng này dân.", unit: "người", min: 10, max: 200, step: 5, ...field(SETTLEMENT, "minPopulation") },
  { key: "settlement.materials", group: "Định cư và chỗ ở", label: "Gỗ/đá để lập điểm định cư", desc: "Số đơn vị gỗ và/hoặc đá một điểm định cư tốn.", unit: "đơn vị", min: 0, max: 200, step: 5, ...field(SETTLEMENT, "materials") },
  { key: "settlement.minDist", group: "Định cư và chỗ ở", label: "Khoảng cách tối thiểu giữa các trung tâm", desc: "Điểm định cư mới phải cách thủ đô và các điểm khác ít nhất chừng này ô.", unit: "ô", min: 3, max: 15, step: 1, ...field(SETTLEMENT, "minDist") },
  { key: "settlement.freeCentres", group: "Định cư và chỗ ở", label: "Số điểm định cư không bị phạt ổn định", desc: "Mỗi điểm định cư vượt số này (chưa nối đường về thủ đô) làm ổn định −1 mỗi lượt.", unit: "điểm", min: 0, max: 20, step: 1, ...field(SETTLEMENT, "freeCentres") },
  { key: "settlement.housing", group: "Định cư và chỗ ở", label: "Chỗ ở tự nhiên của mỗi điểm định cư", desc: "", unit: "người", min: 0, max: 100, step: 5, ...field(SETTLEMENT, "housing") },
  { key: "start.naturalHousing", group: "Định cư và chỗ ở", label: "Chỗ ở tự nhiên ở thủ đô", desc: "Hang, bãi trú quanh thủ đô.", unit: "người", min: 5, max: 200, step: 5, ...field(START, "naturalHousing") },
  { key: "housing.perCentre", group: "Định cư và chỗ ở", label: "Số công trình nhà ở mỗi trung tâm", desc: "Lều và nhà ở tự phát minh, tối đa mỗi trung tâm (cộng thưởng kỷ nguyên).", unit: "công trình", min: 1, max: 12, step: 1, ...field(HOUSING, "perCentre") },
  { key: "hamlet.max", group: "Định cư và chỗ ở", label: "Chỗ ở thôn xóm tối đa", desc: "Tổng chỗ ở từ các ô đất (trước thưởng kỷ nguyên).", unit: "người", min: 0, max: 400, step: 10, ...field(HAMLET, "max") },
  { key: "hamlet.perEra", group: "Định cư và chỗ ở", label: "Thôn xóm thêm mỗi kỷ nguyên", desc: "", unit: "người", min: 0, max: 200, step: 5, ...field(HAMLET, "perEra") },
  { key: "tiles.base", group: "Đất đai", label: "Giới hạn quản lý cơ bản", desc: "Số ô quản lý được trước √dân và các thưởng.", unit: "ô", min: 3, max: 50, step: 1, ...field(TILES, "base") },
  { key: "tiles.perSettlement", group: "Đất đai", label: "Giới hạn ô thêm mỗi điểm định cư", desc: "", unit: "ô", min: 0, max: 20, step: 1, ...field(TILES, "perSettlement") },
  { key: "connect.isolatedYield", group: "Đất đai", label: "Đất của điểm định cư cô lập nộp về kho", desc: "Phần sản lượng về được kho khi điểm định cư không có đường bộ, đường thủy hay lối đi bộ về thủ đô.", unit: "", min: 0, max: 1, step: 0.05, ...field(CONNECT, "isolatedYield") },
  { key: "connect.walk", group: "Đất đai", label: "Lối đi bộ tối đa giữa hai trung tâm", desc: "Hai trung tâm cách nhau tối đa chừng này ô qua đất của mình thì coi như nối nhau.", unit: "ô", min: 1, max: 20, step: 1, ...field(CONNECT, "walk") },
  { key: "province.far", group: "Đất đai", label: "Tỉnh xa thủ đô cần bá tước từ", desc: "Tỉnh có trung tâm cách thủ đô hơn chừng này ô mà không có bá tước trung thành thì bất ổn dần.", unit: "ô", min: 2, max: 20, step: 1, ...field(PROVINCE, "far") },
  { key: "province.calm", group: "Đất đai", label: "Bá tước làm dịu tỉnh mỗi bậc tay nghề", desc: "Bất ổn của tỉnh giảm chừng này mỗi lượt cho mỗi bậc tay nghề của bá tước trung thành.", unit: "", min: 0, max: 5, step: 0.25, ...field(PROVINCE, "calm") },
  { key: "province.yield", group: "Đất đai", label: "Sản lượng thêm của tỉnh có bá tước, mỗi bậc", desc: "Đất của tỉnh có bá tước trung thành cho thêm chừng này phần sản lượng mỗi bậc tay nghề.", unit: "", min: 0, max: 0.1, step: 0.01, ...field(PROVINCE, "yield") },
  { key: "sea.limitWeight", group: "Đất đai", label: "Ô biển tính bằng bao nhiêu ô đất", desc: "Trọng số của một ô lãnh hải trong giới hạn quản lý.", unit: "ô", min: 0, max: 1, step: 0.05, ...field(SEA, "limitWeight") },
  { key: "roads.tilesPerLimit", group: "Đất đai", label: "Số ô đường để thêm 1 ô quản lý", desc: "", unit: "ô đường", min: 1, max: 20, step: 1, ...field(ROADS, "tilesPerLimit") },
  { key: "growth.rate", group: "Dân số", label: "Tốc độ tăng dân", desc: "Phần tăng logistic mỗi lượt: dân × tốc độ × (1 − dân/chỗ ở).", unit: "", min: 0, max: 0.3, step: 0.01, ...field(GROWTH, "rate") },
  { key: "demo.oldDeath", group: "Dân số", label: "Tỷ lệ người già qua đời mỗi lượt", desc: "", unit: "", min: 0.2, max: 1, step: 0.05, ...field(DEMO, "oldDeath") },
  { key: "demo.infant", group: "Dân số", label: "Tỷ lệ trẻ sơ sinh không qua khỏi", desc: "Mức nền, đã tính trong số sinh; y học và thảo dược giảm, thiếu nước tăng.", unit: "", min: 0, max: 0.6, step: 0.05, ...field(DEMO, "infant") },
  { key: "era.neoPop", group: "Kỷ nguyên và phát minh", label: "Dân cần để sang Đồ Đá Mới", desc: "", unit: "người", min: 10, max: 200, step: 5, ...field(ERA_TABLE[1], "pop") },
  { key: "research.depthStep", group: "Kỷ nguyên và phát minh", label: "Giá phát minh tăng theo độ sâu", desc: "Mỗi độ sâu thêm nhân giá × (1 + hệ số).", unit: "", min: 0, max: 2, step: 0.05, ...field(RESEARCH, "depthStep") },
  { key: "trade.toll", group: "Giao thương", label: "Phí qua đất", desc: "Phần mỗi món hàng nộp cho nước có đất mà đoàn buôn đi qua.", unit: "", min: 0, max: 0.5, step: 0.01, ...field(TRADE, "toll") },
  { key: "trade.porterLoad", group: "Giao thương", label: "Một người khuân vác chở", desc: "", unit: "đơn vị", min: 1, max: 30, step: 1, ...field(TRADE, "porterLoad") },
  { key: "trade.boatLoad", group: "Giao thương", label: "Một thuyền chở", desc: "", unit: "đơn vị", min: 5, max: 100, step: 5, ...field(TRADE, "boatLoad") },
  { key: "border.friction", group: "Chiến tranh và trật tự", label: "Căng thẳng mỗi ô biên giới mỗi lượt", desc: "Hai nước giáp nhau càng dài thì càng căng thẳng.", unit: "", min: 0, max: 3, step: 0.05, ...field(BORDER, "friction") },
  { key: "border.dispute", group: "Chiến tranh và trật tự", label: "Căng thẳng biên giới thành tranh chấp", desc: "Từ mức này hai bên đều có chính nghĩa để tuyên chiến.", unit: "", min: 20, max: 100, step: 5, ...field(BORDER, "dispute") },
  { key: "border.marketBelow", group: "Giao thương", label: "Chợ biên giới họp khi căng thẳng dưới", desc: "", unit: "", min: 0, max: 100, step: 5, ...field(BORDER, "marketBelow") },
  { key: "border.marketValue", group: "Giao thương", label: "Giá trị hàng mỗi phiên chợ biên giới", desc: "", unit: "", min: 0, max: 100, step: 2, ...field(BORDER, "marketValue") },
  { key: "war.reach", group: "Chiến tranh và trật tự", label: "Tầm đánh (không thuyền)", desc: "Ô địch tấn công được phải cách đất mình tối đa chừng này ô.", unit: "ô", min: 1, max: 8, step: 1, ...field(WAR, "reach") },
  { key: "hordes.minPop", group: "Chiến tranh và trật tự", label: "Man di chỉ cướp nước từ", desc: "Nước ít dân hơn số này không bị man di nhắm tới.", unit: "người", min: 10, max: 300, step: 5, ...field(HORDES, "minPop") },
  { key: "hordes.growth", group: "Chiến tranh và trật tự", label: "Man di mạnh lên mỗi lượt", desc: "", unit: "", min: 0, max: 3, step: 0.1, ...field(HORDES, "growth") },
  { key: "schism.threshold", group: "Chiến tranh và trật tự", label: "Ổn định dưới mức này thì bất mãn tăng", desc: "", unit: "", min: 0, max: 80, step: 5, ...field(SCHISM, "threshold") },
  { key: "schism.minPop", group: "Chiến tranh và trật tự", label: "Dân tối thiểu để có phái ly khai", desc: "", unit: "người", min: 20, max: 500, step: 10, ...field(SCHISM, "minPop") },
  { key: "officials.perPop", group: "Chiến tranh và trật tự", label: "Thêm 1 quan chức mỗi", desc: "", unit: "người", min: 10, max: 300, step: 10, ...field(OFFICIALS, "perPop") },
  { key: "events.winter", group: "Thiên tai", label: "Khả năng mùa đông khắc nghiệt", desc: "Mỗi lượt, trước các hệ số vùng lạnh.", unit: "", min: 0, max: 0.3, step: 0.01, ...field(EVENTS.winter, "chance") },
  { key: "events.plague", group: "Thiên tai", label: "Khả năng dịch bệnh", desc: "Mỗi lượt, trước các hệ số đông dân và thiếu nước.", unit: "", min: 0, max: 0.3, step: 0.01, ...field(EVENTS.plague, "chance") },
  { key: "events.drought", group: "Thiên tai", label: "Khả năng hạn hán", desc: "", unit: "", min: 0, max: 0.3, step: 0.01, ...field(EVENTS.drought, "chance") },
  { key: "flood.chance", group: "Thiên tai", label: "Khả năng lũ lụt", desc: "", unit: "", min: 0, max: 0.3, step: 0.01, ...field(FLOOD, "chance") },
  { key: "quake.chance", group: "Thiên tai", label: "Khả năng động đất", desc: "", unit: "", min: 0, max: 0.1, step: 0.002, ...field(QUAKE, "chance") },
];

export const LAW_BY_KEY: Record<string, LawDef> = Object.fromEntries(LAWS.map(l => [l.key, l]));
const DEFAULTS: Record<string, number> = Object.fromEntries(LAWS.map(l => [l.key, l.get()]));

/** The values set by law decrees that have taken effect, in order (later ones win). */
function decreed(world: World): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of world.decrees ?? []) if (d.law && d.effectiveTick <= world.tick && LAW_BY_KEY[d.law.key]) out[d.law.key] = d.law.value;
  return out;
}
/** The laws in force at the world's current turn. */
export function lawsOf(world: World): Record<string, number> {
  return { ...Object.fromEntries(LAWS.map(l => [l.key, l.get()])), ...DEFAULTS_UNLESS_SET(), ...decreed(world) };
}
// A law no decree sets keeps whatever the rule table holds (a test or a --variant may have tuned it);
// only the laws a decree set are written, and put back when no decree sets them any more.
let applied = new Set<string>();
const DEFAULTS_UNLESS_SET = () => Object.fromEntries([...applied].map(k => [k, DEFAULTS[k]]));

/** Write the laws in force into the rule tables. Cheap; call before anything reads them. */
export function applyLaws(world: World): void {
  const now = decreed(world);
  for (const k of applied) if (!(k in now)) LAW_BY_KEY[k].set(DEFAULTS[k]);
  for (const [k, v] of Object.entries(now)) if (LAW_BY_KEY[k].get() !== v) LAW_BY_KEY[k].set(v);
  applied = new Set(Object.keys(now));
}

/** A short fingerprint of the laws in force, to cache what is built from them (the nations' rules text). */
export function lawsKey(world: World): string {
  return (world.decrees ?? []).filter(d => d.law && d.effectiveTick <= world.tick).map(d => `${d.law!.key}=${d.law!.value}`).join(";");
}

/** Every law with its default and current value, for the Watcher and the chat. */
export function lawTable(world: World): Array<Omit<LawDef, "get" | "set"> & { value: number; default: number; pending?: number }> {
  applyLaws(world);
  const now = Object.fromEntries(LAWS.map(l => [l.key, l.get()]));
  const pending: Record<string, number> = {};
  for (const d of world.decrees ?? []) if (d.law && d.effectiveTick > world.tick) pending[d.law.key] = d.law.value;
  return LAWS.map(({ get: _g, set: _s, ...l }) => ({ ...l, value: now[l.key], default: DEFAULTS[l.key], pending: pending[l.key] }));
}

/** Check a proposed value; null when it is fine. */
export function lawError(key: string, value: number): string | null {
  const l = LAW_BY_KEY[key];
  if (!l) return "Không có luật này";
  if (!Number.isFinite(value)) return "Giá trị phải là một số";
  if (value < l.min || value > l.max) return `${l.label}: giá trị phải trong khoảng ${l.min}–${l.max}`;
  return null;
}

export const fmtLaw = (key: string, v: number): string => {
  const l = LAW_BY_KEY[key];
  const s = Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
  return l?.unit ? `${s} ${l.unit}` : s;
};
