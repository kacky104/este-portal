// 特徴バッジ（ラベル）⇄ URLスラッグ の対応表。
// バッジ別ランディングページ /therapists/badge/[slug] のURL生成・逆引きに使う。
// スラッグは不変（変えると既存URL・被リンクが切れる）。therapistBadges.ts の全バッジを網羅する。

import { BADGES_BY_CATEGORY, BADGE_CATEGORY_ORDER } from '@/lib/therapistBadges';

// ラベル → スラッグ（ascii・重複なし）。
export const BADGE_TO_SLUG: Record<string, string> = {
  // rank
  'NO.1': 'no1',
  'プレミア': 'premium',
  '殿堂入り': 'legend',
  '人気急上昇': 'rising',
  '指名多数': 'popular',
  'リピーター多数': 'repeater',
  // career
  '未経験': 'beginner',
  '経験者': 'experienced',
  '新人': 'newcomer',
  'ベテラン': 'veteran',
  '女子大生': 'college',
  // look
  'ギャル': 'gal',
  '清楚': 'seiso',
  'キレイ': 'kirei',
  'かわいい': 'kawaii',
  'お姉さん系': 'oneesan',
  '妹系': 'imouto',
  '童顔': 'babyface',
  'モデル系': 'model',
  'スレンダー': 'slender',
  '美脚': 'bikyaku',
  '低身長': 'petite',
  '高身長': 'tall',
  '熟女': 'mature',
  '巨乳': 'bust',
  'アイドル系': 'idol',
  'キャバ嬢': 'cabaret',
  // mood
  '癒し系': 'iyashi',
  '笑顔が素敵': 'smile',
  '明るい': 'cheerful',
  '天然': 'natural',
  'トーク上手': 'talk',
  'おしとやか': 'graceful',
  'ツンデレ': 'tsundere',
  // skill
  '丁寧な施術': 'polite',
  'アロマ得意': 'aroma',
  '施術上手': 'skilled',
  '密着施術': 'mitchaku',
  'リンパ得意': 'lymph',
  'サービス抜群': 'service',
};

// スラッグ → ラベル（逆引き）。
export const SLUG_TO_BADGE: Record<string, string> = Object.fromEntries(
  Object.entries(BADGE_TO_SLUG).map(([label, slug]) => [slug, label]),
);

// 事前生成する全スラッグ一覧（generateStaticParams 用）。therapistBadges の定義順で返す。
export const BADGE_SLUG_LIST: string[] = BADGE_CATEGORY_ORDER.flatMap((cat) =>
  BADGES_BY_CATEGORY[cat].map((label) => BADGE_TO_SLUG[label]).filter(Boolean),
);

// 内部リンク（/therapists の「人気の特徴から探す」）に出す主要バッジ。
// 検索需要の高い 外見・スキル・雰囲気 中心に厳選。ランディングページへの導線＝クロール/ランキング補助。
export const POPULAR_BADGES: string[] = [
  '癒し系', '妹系', 'お姉さん系', 'かわいい', 'スレンダー', 'モデル系',
  '巨乳', '美脚', '新人', '女子大生', '密着施術', 'アロマ得意',
];

/** ラベル → スラッグ（未定義なら null）。 */
export function badgeToSlug(label: string): string | null {
  return BADGE_TO_SLUG[label] ?? null;
}

/** スラッグ → ラベル（未定義なら null）。 */
export function slugToBadge(slug: string): string | null {
  return SLUG_TO_BADGE[slug] ?? null;
}
