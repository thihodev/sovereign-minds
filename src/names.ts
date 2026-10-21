// §2.2 Names in Vietnamese: every name of a person or a place is made of Vietnamese syllables. The check strips the
// tone marks (keeping ă â ê ô ơ ư đ) and asks each word to be an onset, a vowel cluster and a coda of Vietnamese.
// The generators give bots and the engine's own people (leaders, officials, ministers) Vietnamese names.

import { pickOne, type Rand } from "./rng.ts";

const TONES = /[̣̀́̃̉]/g;
const SYLLABLE = /^(ngh|ng|gh|gi|kh|nh|ph|qu|th|tr|ch|[bcdđghklmnprstvx])?[aăâeêioôơuưy]{1,3}(ng|nh|ch|[cmnpt])?$/;

/** Is this word a Vietnamese syllable (any tone)? */
export function vietSyllable(word: string): boolean {
  const w = word.normalize("NFD").replace(TONES, "").normalize("NFC").toLowerCase();
  return SYLLABLE.test(w);
}
/** Why a name is not Vietnamese, or null. */
export function vietError(label: string, v: string): string | null {
  const words = v.trim().split(/[\s-]+/).filter(Boolean);
  if (!words.length) return `${label} trống`;
  const bad = words.filter(w => !vietSyllable(w));
  return bad.length ? `${label} phải là tên tiếng Việt (mỗi chữ là một âm tiết tiếng Việt, không số, không chữ ngoại): "${bad.slice(0, 3).join(", ")}" không phải` : null;
}

const PLACE = ["An", "Bình", "Bảo", "Bắc", "Cao", "Châu", "Đông", "Đồng", "Gia", "Hà", "Hải", "Hòa", "Hồng", "Hưng", "Kim", "Lạc", "Lam", "Lâm", "Long", "Minh",
  "Nam", "Ngọc", "Nguyên", "Phong", "Phú", "Phúc", "Quang", "Sơn", "Tân", "Tây", "Thạch", "Thanh", "Thái", "Thiên", "Thủy", "Trường", "Vân", "Việt", "Xuân", "Yên",
  "Đức", "Mộc", "Hoa", "Lĩnh", "Giang", "Dương", "Khê", "Lũng", "Nham", "Hương", "Tuyền", "Phượng", "Ninh", "Quảng", "Định", "Vĩnh", "Mỹ", "Trung", "Cát", "Lương"];
const FAMILY = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Vũ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý", "Mai", "Lâm", "Trịnh", "Đinh", "Cao"];
const GIVEN = ["An", "Bảo", "Bình", "Cường", "Dũng", "Đạt", "Giang", "Hà", "Hải", "Hiền", "Hùng", "Khang", "Khôi", "Lan", "Linh", "Long", "Mai", "Minh",
  "Nam", "Nga", "Ngọc", "Nhân", "Phong", "Phúc", "Quân", "Sơn", "Tâm", "Thảo", "Thành", "Trí", "Trung", "Tú", "Tuấn", "Uyên", "Vân", "Vinh", "Xuân", "Yến"];

/** A place name of `words` syllables, e.g. "Bình Sơn". */
export function vietPlace(rand: Rand, words = 2): string {
  const out: string[] = [];
  while (out.length < words) { const w = pickOne(PLACE, rand); if (!out.includes(w)) out.push(w); }
  return out.join(" ");
}
/** A person's name, e.g. "Trần Minh". */
export function vietPerson(rand: Rand): string { return `${pickOne(FAMILY, rand)} ${pickOne(GIVEN, rand)}`; }
