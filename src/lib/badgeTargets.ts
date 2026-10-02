// 特徴バッジを自動で選ぶ【対象の決め方】（第113便の運営の口から切り出し・第1098便）。★ 純粋関数のみ。
//   運営の口（therapist-badge-batch）と、自動の口（therapist-badge-auto）が同じ決めごとを見る。

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
