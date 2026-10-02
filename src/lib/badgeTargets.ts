// 特徴バッジを自動で選ぶ【対象の決め方】（第113便の運営の口から切り出し・第1098便）。★ 純粋関数のみ。
//   運営の口（therapist-badge-batch）と、自動の口（therapist-badge-auto）が同じ決めごとを見る。

import { getBadgeCategory } from './therapistBadges';

export type BadgeTargetRow = {
  feature_badges: unknown;
  body_type: string | null;
  profile_image_url: string | null;
  profile_images: unknown;
};

/**
 * ★★★ バッジが空か。★ null と [] の【両方】を空として扱う。
 *   ★ ここを `is null` だけにすると、default '[]' の行が1つも当たらない（2026-09-03 実測）。
 */
export function isEmptyBadges(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.filter(Boolean).length === 0;
  // ★ 配列でも null でもない値が入っていたら、空と決めつけない（触らない側に倒す）
  return false;
}

/** 判断する材料（写真かサイズ）を持っているか。 */
export function hasBadgeMaterial(r: Pick<BadgeTargetRow, 'body_type' | 'profile_image_url' | 'profile_images'>): boolean {
  const imgs = Array.isArray(r.profile_images) ? r.profile_images.filter(Boolean) : [];
  return imgs.length > 0 || !!r.profile_image_url || !!r.body_type;
}

/**
 * ★★★ 自動で選ぶ対象か（第1098便・カッキーさんの決定）。
 *   ① 駅ちかの取り込み対象（駅ちかの castId を持っている）
 *   ② バッジが空（★ 店舗様・本人が付けたバッジは上書きしない）
 *   ③ まだ一度も自動で選んでいない（feature_badges_auto_at が null・★ 1人1回だけ）
 *   ④ 材料（写真かサイズ）がある（★ 無い方は印を付けずに待つ＝材料が入った周で選ぶ）
 */
export function isAutoBadgeTarget(r: BadgeTargetRow & { feature_badges_auto_at: string | null; hasCastId: boolean }): boolean {
  return r.hasCastId && r.feature_badges_auto_at === null && isEmptyBadges(r.feature_badges) && hasBadgeMaterial(r);
}

// ───────────── キャッチフレーズ・紹介文の自動作成（第1104便・2026-10-02・カッキーさん）─────────────

/** 空白を除いた字数（運営の口 therapist-copy-batch と同じ数え方） */
export function profileTextLen(s: unknown): number {
  return (typeof s === 'string' ? s : '').replace(/\s/g, '').length;
}

/**
 * ★★★ 紹介文を自動で作る対象か。
 *   ① 特徴バッジを自動で付けた方（feature_badges_auto_at が入っている＝駅ちかから取り込んだ方）
 *   ② まだ一度も自動で作っていない（profile_copy_auto_at が null・★ 1人1回だけ）
 *   ③ 紹介文が minLen 字未満（★ 店舗様が書いた紹介文は上書きしない）
 */
export function isAutoCopyTarget(
  r: { feature_badges_auto_at: string | null; profile_copy_auto_at: string | null; profile_text: unknown },
  minLen: number,
): boolean {
  return r.feature_badges_auto_at !== null && r.profile_copy_auto_at === null && profileTextLen(r.profile_text) < minLen;
}

/**
 * ★★★ 自動で作る文章の【材料にするバッジ】（カッキーさんの決定: くじで付けた語は材料にしない）。
 *   ★ 外見・タイプ（数値＋AI が写真から選んだ語）だけを残す。
 *   ★ ランク・人気／雰囲気・性格／スキルは、自動ではくじで付けた語（実績や性格を見て付けた語ではない）。
 *     ★ 文章に書くと、バッジを外しても文章に残る。→ 材料から外す。
 */
export function copyMaterialBadge(badge: string): boolean {
  return getBadgeCategory(badge) === 'look';
}

/**
 * ★★ 写真から選ばれた外見のバッジが1つでもあるか（第1105便）。
 *   ★ 自動の口で、紹介文を書くときに【写真を AI に見せるか】を決める。
 *   ★ きっかけ: お店が「No photo」の画像を写真として登録していた方（Amateras ゆゆさん）の試し打ちで、
 *     AI が「柔らかな笑みを浮かべた写真が印象的」と、写っていない写真の描写を書いた。
 *   → 自動バッジのときに AI が写真から外見の語を1つも選べなかった方（＝人物が写っていない画像）は、
 *     写真を見せずに書かせる（「写真が印象的」のように、無い写真のことを書かせない）。
 * @param numeric 数値で決まる語（低身長・高身長・巨乳）。★ これは写真から選んだ語ではないので数えない
 */
export function hasPhotoLookBadge(badges: unknown, numeric: readonly string[]): boolean {
  if (!Array.isArray(badges)) return false;
  return badges.some((b) => typeof b === 'string' && copyMaterialBadge(b) && !numeric.includes(b));
}
