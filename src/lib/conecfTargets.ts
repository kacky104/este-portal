// コネックエフ「送り先サイト」（conecf_therapist_targets）の決めごと（第408便・2026-09-17）。★ 純関数だけ。
//
// ★★ カッキーさんの決定（2026-09-17）
//   ・効かせるのは 出勤・今すぐ・写真・新規登録 の4つ（★ 写メ日記は別の便でベンリー型に）
//   ・「送らない」にしても、そのサイトにすでに載っている分は【何もしない】（新しく送らないだけ）
//   ・フクエスは送り先の1つとして画面に出すが、【外せない】（★ コネックエフの利用条件がフクエスとの契約）
//   ・行が無ければ【送る】（既定 ON）
// ★ 切り替え前の店（フクエスリンク）には効かせない（★ 呼ぶ側が conecf_enabled_at を見る）

/** 画面に出すフクエスの行（★ 保存しない・常にオン） */
export const FUKUES_TARGET = { provider: 'fukues', slot: 1, label: 'フクエス' } as const;
export const FUKUES_TARGET_NOTE = 'フクエスには常に掲載されます（コネックエフのご利用条件）';

export type TargetRow = { therapist_id: number | string; provider: string; slot: number | string; enabled: boolean | null };

/** この媒体×枠で「送らない」になっている人の id の集合 */
export function offSetFrom(rows: ReadonlyArray<TargetRow>, provider: string, slot: number): Set<number> {
  const s = new Set<number>();
  for (const r of rows) {
    if (r.enabled === false && String(r.provider) === provider && Number(r.slot) === slot) s.add(Number(r.therapist_id));
  }
  return s;
}

/** 保存してよい行か（★ フクエスは保存しない＝外せない） */
export function isSavableTarget(provider: string): boolean {
  return provider !== FUKUES_TARGET.provider;
}

/** 断るときの文 */
export function targetOffMessage(siteLabel: string): string {
  return `この女性は送り先サイトで「${siteLabel}」に送らない設定です。送るときは、コネックエフの女性の編集「送り先サイト」でオンにしてください`;
}
