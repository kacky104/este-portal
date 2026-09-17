// コネックエフの「女性」の値の決めごと（第398便・1c・2026-09-17）。★ 純粋関数だけ。
//
// ★★ 親データはフクエスの therapists（設計メモ §1）。★ 数字で持つサイズ・生年月日などは conecf_therapist_profiles。
//   保存するとき、フクエスが表示に使う therapists.age / body_type も【ここで作った文字】で同時に書く。
//   ★ body_type の形は /mypage と同じ「T160 B89(F) W56 H85」（lib/bodyType.ts の parseBodyType で読める形）。

export const CONECF_MAX_IMAGES = 8; // ★ 第421便: 駅ちかの画像の枠と同じ8枚（N枚目 → 枠N）
export const CONECF_NAME_MAX = 10;

export const CONECF_CUPS: readonly string[] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
export const CONECF_BLOOD_TYPES: readonly string[] = ['A', 'B', 'O', 'AB'];
export const CONECF_STYLES: readonly string[] = [
  '激スレンダー', 'スレンダー', 'スタンダード', 'グラマー', 'セクシー', 'ぽちゃ', '激ぽちゃ', '長身', '小柄', '巨乳', '美乳', '美脚', '美白',
];
export const CONECF_LOOK_TYPES: readonly string[] = [
  'かわいい系', 'きれい系', '清楚', '癒し系', 'セクシー系', 'ギャル系', 'ロリ系', '萌え系', 'アイドル系', 'OL系', 'お姉さん系',
  'モデル系', '女子大生系', 'お嬢様系', '人妻系', '熟女系', '素人系', '外国人(アジア系)', '外国人(金髪系)',
];

export type ConecfGirlSizes = {
  height: number | null; bust: number | null; cup: string | null; waist: number | null; hip: number | null;
};

/** 「T160 B89(F) W56 H85」。★ 無い項目は書かない。★ 何も無ければ空文字 */
export function bodyTypeFromSizes(s: ConecfGirlSizes): string {
  const parts: string[] = [];
  if (s.height != null) parts.push(`T${s.height}`);
  if (s.bust != null) parts.push(s.cup ? `B${s.bust}(${s.cup})` : `B${s.bust}`);
  if (s.waist != null) parts.push(`W${s.waist}`);
  if (s.hip != null) parts.push(`H${s.hip}`);
  return parts.join(' ');
}

/** 生年月日（YYYY-MM-DD）→ 満年齢。★ 読めなければ null */
export function ageFromBirthDate(birth: string | null | undefined, today: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth ?? '');
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ty = today.getFullYear(), tm = today.getMonth() + 1, td = today.getDate();
  let age = ty - y;
  if (tm < mo || (tm === mo && td < d)) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

export type ConecfGirlInput = {
  name: unknown; nameKana?: unknown; nameHira?: unknown; nameRomaji?: unknown;
  joinedOn?: unknown; isNewFace?: unknown;
  age?: unknown; birthDate?: unknown; ageFromBirth?: unknown;
  height?: unknown; bust?: unknown; cup?: unknown; waist?: unknown; hip?: unknown; weight?: unknown;
  bloodType?: unknown; style?: unknown; lookType?: unknown;
};

export type ConecfGirlValue = {
  name: string; nameKana: string | null; nameHira: string | null; nameRomaji: string | null;
  joinedOn: string | null; isNewFace: boolean;
  age: number | null; birthDate: string | null;
  height: number | null; bust: number | null; cup: string | null; waist: number | null; hip: number | null; weight: number | null;
  bloodType: string | null; style: string | null; lookType: string | null;
};

function str(x: unknown, max = 60): string | null {
  if (typeof x !== 'string') return null;
  const t = x.trim();
  return t === '' ? null : t.slice(0, max);
}

function num(x: unknown, min: number, max: number, label: string, errs: string[]): number | null {
  if (x === null || x === undefined || x === '') return null;
  const n = typeof x === 'number' ? x : Number(String(x).trim());
  if (!Number.isInteger(n) || n < min || n > max) { errs.push(`${label}は${min}〜${max}の数字で入れてください`); return null; }
  return n;
}

function date(x: unknown, label: string, errs: string[]): string | null {
  const s = str(x, 10);
  if (s === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s + 'T00:00:00Z'))) {
    errs.push(`${label}の日付が読めません`); return null;
  }
  return s;
}

function pick(x: unknown, list: readonly string[]): string | null {
  const s = str(x, 30);
  return s !== null && list.includes(s) ? s : null;
}

/**
 * ★ 画面から来た値を確かめて、保存する形にする。
 * ★ 年齢：「生年月日と連動」なら生年月日から出す。★ そうでなければ入れた数字。
 */
export function normalizeConecfGirl(input: ConecfGirlInput, today: Date):
  { ok: true; value: ConecfGirlValue } | { ok: false; error: string } {
  const errs: string[] = [];
  const name = str(input.name, 100);
  if (name === null) errs.push('女性名を入れてください');
  else if ([...name].length > CONECF_NAME_MAX) errs.push(`女性名は${CONECF_NAME_MAX}文字までです`);

  const birthDate = date(input.birthDate, '生年月日', errs);
  const joinedOn = date(input.joinedOn, '入店日', errs);
  let age = num(input.age, 18, 99, '年齢', errs);
  if (input.ageFromBirth === true) {
    const a = ageFromBirthDate(birthDate, today);
    if (a === null) errs.push('生年月日と連動させるには、生年月日を入れてください');
    else if (a < 18) errs.push('18歳未満の生年月日は登録できません');
    else age = a;
  }

  const value: ConecfGirlValue = {
    name: name ?? '',
    nameKana: str(input.nameKana), nameHira: str(input.nameHira), nameRomaji: str(input.nameRomaji),
    joinedOn, isNewFace: input.isNewFace === true,
    age, birthDate,
    height: num(input.height, 100, 230, '身長', errs),
    bust: num(input.bust, 50, 150, 'バスト', errs),
    cup: pick(input.cup, CONECF_CUPS),
    waist: num(input.waist, 40, 120, 'ウェスト', errs),
    hip: num(input.hip, 50, 150, 'ヒップ', errs),
    weight: num(input.weight, 30, 150, '体重', errs),
    bloodType: pick(input.bloodType, CONECF_BLOOD_TYPES),
    style: pick(input.style, CONECF_STYLES),
    lookType: pick(input.lookType, CONECF_LOOK_TYPES),
  };
  if (errs.length > 0) return { ok: false, error: errs[0] };
  return { ok: true, value };
}
