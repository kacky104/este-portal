// オーナー/管理者の保存成功後に呼び、ISR キャッシュを即時更新するヘルパー群。
// ログイン cookie は同一オリジンの fetch で自動同送されるため、トークンの受け渡しは不要。
// 失敗（ネットワーク/権限等）は握りつぶし、ユーザー操作は止めない。

type RevalidateBody = { salonId?: number | string; therapistId?: number | string; top?: boolean; area?: string; areasAll?: boolean; ranking?: boolean };

// 週間ランキングページ（/ranking）だけを無効化する（下駄設定の保存後などに使う）。
export async function revalidateRanking(): Promise<void> {
  await postRevalidate({ ranking: true, top: false });
}

async function postRevalidate(body?: RevalidateBody): Promise<void> {
  try {
    await fetch("/api/revalidate", {
      method: "POST",
      ...(body
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    });
  } catch (e) {
    // 失敗してもユーザー操作は継続。ログのみ。
    console.warn("[revalidate] failed:", e);
  }
}

// トップ(/)のみを無効化（従来どおり）。
export async function revalidateTop(): Promise<void> {
  await postRevalidate();
}

// 掲載/出張フラグの変更後に、トップ(/)と全 /area ページ（出張含む）をまとめて無効化する。
export async function revalidateTopAndAreas(): Promise<void> {
  await postRevalidate({ top: true, areasAll: true });
}

// ピックアップ編集後に、対象セットのページだけを無効化する。
// area === null … トップ(/)、それ以外 … /area/<slug>（トップは無効化しない）。
export async function revalidateFeaturedArea(area: string | null): Promise<void> {
  if (area === null) {
    await revalidateTop();
    return;
  }
  await postRevalidate({ area, top: false });
}

// 指定サロンの詳細ページ配下（本体＋サブページ）を無効化する。
// サロン情報はトップ・エリアページのカード表示にも影響するため、既定でトップ(/)と
// 全エリアページ(/area/[slug])も無効化する（API 側は areasAll 対応済み）。
export async function revalidateSalon(
  salonId: number | string,
  opts?: { top?: boolean },
): Promise<void> {
  const top = opts?.top ?? true;
  await postRevalidate({ salonId, top, areasAll: top });
}

// 指定セラピストの公開ページ配下（本体＋/diary・/reviews）を無効化する。
// 出勤保存後の即時反映用。トップは別途 revalidateSalon が担うため既定では無効化しない（top: false）。
export async function revalidateTherapist(
  therapistId: number | string,
): Promise<void> {
  await postRevalidate({ therapistId, top: false });
}
