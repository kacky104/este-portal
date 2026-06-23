// オーナー/管理者の保存成功後に呼び、トップ(/)の ISR キャッシュを即時更新する。
// ログイン cookie は同一オリジンの fetch で自動同送されるため、トークンの受け渡しは不要。
// 失敗（ネットワーク/権限等）は握りつぶし、ユーザー操作は止めない。
export async function revalidateTop(): Promise<void> {
  try {
    await fetch("/api/revalidate", { method: "POST" });
  } catch (e) {
    // 失敗してもユーザー操作は継続。ログのみ。
    console.warn("[revalidateTop] failed:", e);
  }
}
