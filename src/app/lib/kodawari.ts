// こだわり条件（絞り込み用）のカテゴリ定義。
// 値は salons.tags(text[]) の要素文字列と一致させる（＝タグそのものをフィルタキーに使う）。
//
// 実際に選べる候補は、掲載中サロンの tags 実データから動的に構成する（buildKodawariGroups）。
// そのため、ここに定義の無いタグも「その他」カテゴリへ自動で入り、取りこぼしなく絞り込める。
// 逆に、実データに1件も無いタグは表示しない（空振りチップを作らない）。

export type KodawariCategory = { key: string; label: string; tags: string[] };

// 既知タグの分類・表示順（メンズエステの代表的なこだわり）。
// 実データのタグ表記に合わせて随時追加・調整してよい。ここは「並び順とカテゴリ分け」のためだけに使う。
export const KODAWARI_CATEGORIES: KodawariCategory[] = [
  {
    key: 'facility',
    label: '設備・空間',
    tags: ['完全個室', '個室シャワー', 'シャワー完備', '駅近', '駐車場あり', '待合室あり'],
  },
  {
    key: 'service',
    label: 'サービス',
    tags: ['オイル', '厳選アロマ', 'アロマ', 'リンパ', '密着', 'ディープリンパ'],
  },
  {
    key: 'therapist',
    label: 'セラピスト',
    tags: ['女性セラピスト', '日本人セラピスト', '20代中心', 'セラピスト多数', '新人在籍'],
  },
  {
    key: 'style',
    label: '利用スタイル',
    tags: [
      '出張専門', 'ホテル対応', '店舗型', 'カップルOK',
      '深夜営業', '24時間営業', '事前予約制', '当日予約OK', 'クレジットカード可',
    ],
  },
];

const OTHER_KEY = 'other';
const OTHER_LABEL = 'その他';

// 既知タグ → カテゴリkey の逆引き。
const TAG_TO_CATEGORY = new Map<string, string>();
for (const c of KODAWARI_CATEGORIES) for (const t of c.tags) TAG_TO_CATEGORY.set(t, c.key);

// 既知タグの表示順（未知タグは末尾扱い）。
const TAG_ORDER = new Map<string, number>();
{
  let i = 0;
  for (const c of KODAWARI_CATEGORIES) for (const t of c.tags) TAG_ORDER.set(t, i++);
}

export type KodawariGroup = { key: string; label: string; tags: string[] };

/**
 * 実データのタグ集合から、UI表示用のカテゴリ別グループを構成する。
 * - 既知タグは定義カテゴリへ、未知タグは「その他」へ。
 * - 各カテゴリ内は「定義順 → 未知は日本語名順」。
 * - 実データに存在するタグだけを出す（空振りチップを作らない）。
 */
export function buildKodawariGroups(availableTags: string[]): KodawariGroup[] {
  const set = new Set(availableTags.filter(Boolean));
  const byCat = new Map<string, string[]>();
  for (const tag of set) {
    const cat = TAG_TO_CATEGORY.get(tag) ?? OTHER_KEY;
    const arr = byCat.get(cat);
    if (arr) arr.push(tag);
    else byCat.set(cat, [tag]);
  }

  const order = (a: string, b: string) => {
    const oa = TAG_ORDER.get(a) ?? Number.POSITIVE_INFINITY;
    const ob = TAG_ORDER.get(b) ?? Number.POSITIVE_INFINITY;
    return oa !== ob ? oa - ob : a.localeCompare(b, 'ja');
  };

  const groups: KodawariGroup[] = [];
  for (const c of KODAWARI_CATEGORIES) {
    const tags = (byCat.get(c.key) ?? []).sort(order);
    if (tags.length) groups.push({ key: c.key, label: c.label, tags });
  }
  const other = (byCat.get(OTHER_KEY) ?? []).sort(order);
  if (other.length) groups.push({ key: OTHER_KEY, label: OTHER_LABEL, tags: other });
  return groups;
}
