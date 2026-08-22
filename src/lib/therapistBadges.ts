// セラピストの「特徴バッジ」プリセット（単一の真実のソース）。
// /mypage の編集UI も、将来の表示側（カード/プロフィール）もこのファイルを参照する。

export type BadgeCategory = 'rank' | 'career' | 'look' | 'mood' | 'skill';

export type BadgeColors = { fill: string; text: string; border: string };

// カテゴリ別の色（fill / text / border の16進）。
export const BADGE_CATEGORY_COLORS: Record<BadgeCategory, BadgeColors> = {
  rank:   { fill: '#FEF3C7', text: '#B45309', border: '#FDE68A' },
  career: { fill: '#DBEAFE', text: '#1D4ED8', border: '#BFDBFE' },
  look:   { fill: '#FCE7F3', text: '#BE185D', border: '#FBCFE8' },
  mood:   { fill: '#FFEDD5', text: '#C2410C', border: '#FED7AA' },
  skill:  { fill: '#CCFBF1', text: '#0F766E', border: '#99F6E4' },
};

// カテゴリの表示名（編集UIの見出し用）。
export const BADGE_CATEGORY_LABELS: Record<BadgeCategory, string> = {
  rank:   'ランク・人気',
  career: '経験・キャリア',
  look:   '外見・タイプ',
  mood:   '雰囲気・性格',
  skill:  'スキル',
};

// カテゴリ表示順（この順序で UI に並べる）。
export const BADGE_CATEGORY_ORDER: BadgeCategory[] = ['rank', 'career', 'look', 'mood', 'skill'];

// カテゴリごとのバッジ一覧（順序もこの通り。保存値はこのラベル文字列をそのまま使う）。
export const BADGES_BY_CATEGORY: Record<BadgeCategory, string[]> = {
  rank:   ['NO.1', 'プレミア', '殿堂入り', '人気急上昇', '指名多数', 'リピーター多数'],
  career: ['未経験', '経験者', '新人', 'ベテラン', '女子大生', 'OL', 'お嬢様'],
  look:   ['ギャル', '清楚', 'キレイ', 'かわいい', 'お姉さん系', '妹系', '童顔', 'モデル系', 'スレンダー', '美脚', '低身長', '高身長', '熟女', '巨乳', 'アイドル系', 'キャバ嬢'],
  mood:   ['癒し系', '笑顔が素敵', '明るい', '天然', 'トーク上手', 'おしとやか', 'ツンデレ'],
  skill:  ['丁寧な施術', 'アロマ得意', '施術上手', '密着施術', 'リンパ得意', 'サービス抜群'],
};

// 1セラピストあたりの最大選択数。
// ★ ここを変えると編集UI（/mypage/therapist/[id]）・保存・カード表示のすべてが追随する。
//   ただし公式HP（/hp/○○）の parts.tsx だけは意図的に別の上限（4個）を持つ。理由はそちらのコメント参照。
export const MAX_BADGES = 6;

// ラベル → カテゴリ の逆引き表。
const LABEL_TO_CATEGORY: Record<string, BadgeCategory> = (() => {
  const map: Record<string, BadgeCategory> = {};
  for (const cat of BADGE_CATEGORY_ORDER) {
    for (const label of BADGES_BY_CATEGORY[cat]) map[label] = cat;
  }
  return map;
})();

// ラベル → 表示順の通し番号。BADGE_CATEGORY_ORDER × BADGES_BY_CATEGORY の並びをそのまま番号にしたもの。
const LABEL_ORDER: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  let i = 0;
  for (const cat of BADGE_CATEGORY_ORDER) {
    for (const label of BADGES_BY_CATEGORY[cat]) map[label] = i++;
  }
  return map;
})();

/**
 * カテゴリ順（ランク・人気 → 経験・キャリア → 外見 → 雰囲気 → スキル）に並べ替える。
 * ★ カードは2行までで切り落とす（FeatureBadges の max-h-[33px] + overflow-hidden）ので、
 *   幅が狭いと後ろのバッジが消える。つまり並び順が「どれが消えるか」を決める。
 *   選んだ順のままだと、たまたま最後に押した「NO.1」が消えて「スレンダー」だけ残る、
 *   といったことが起きるのでここで必ず揃える。
 */
export function sortBadges(list: string[]): string[] {
  return [...list].sort(
    (a, b) => (LABEL_ORDER[a] ?? Number.MAX_SAFE_INTEGER) - (LABEL_ORDER[b] ?? Number.MAX_SAFE_INTEGER),
  );
}

/** ラベルからカテゴリを引く（未知なら null）。 */
export function getBadgeCategory(label: string): BadgeCategory | null {
  return LABEL_TO_CATEGORY[label] ?? null;
}

/** ラベルから色を引く（未知なら null）。 */
export function getBadgeColors(label: string): BadgeColors | null {
  const cat = getBadgeCategory(label);
  return cat ? BADGE_CATEGORY_COLORS[cat] : null;
}

/**
 * 保存前バリデーション/正規化。読み出し側でも必ずこれを通す。
 * 未知ラベル・重複・非文字列を除外し、カテゴリ順に並べ替えてから最大 MAX_BADGES 件に切り詰める。
 * ★ 並べ替えてから切り詰める順番が大事。先に切り詰めると、上限を超えている古い行で
 *   「ランク・人気」のバッジが落ちて「スキル」だけが残ることがある。
 */
export function sanitizeBadges(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== 'string') continue;
    if (!LABEL_TO_CATEGORY[v]) continue; // 既知バッジのみ採用
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return sortBadges(out).slice(0, MAX_BADGES);
}
