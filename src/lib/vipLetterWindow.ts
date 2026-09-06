// VIPレターを画面に出す期間（★ 会員の受信箱と、店舗の送信済み一覧で共有）。
//
// ★★★ なぜ要るか（2026-09-06・カッキーさんの決定）
//   VIPレターは「そのとき限りのご案内」。★ 半年前のレターが受信箱に残っていても、
//   会員は使えず、店舗も何が生きているのか分からなくなる。
//   → **30日**を過ぎたものは画面に出さない。
//
// ★★ 消すのは【表示だけ】。★ DBの行は残す（消した行は戻せないため）。
//   ★ 日数を変えたいときは、この数字1つを直せば両方の画面が同時に変わる。
//   ★ お知らせ・クーポンの新着は14日（notificationFeed.ts）。★ こちらとは別の話なので揃えない。

/** 出しておく日数。★ ここが唯一の正。 */
export const VIP_LETTER_WINDOW_DAYS = 30;

const WINDOW_MS = VIP_LETTER_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * まだ出してよいレターか。
 *
 * ★ 読めない日時（空・壊れている）は **出す**。★ 「読めなかった」を「期限切れ」に倒さない
 *   （★ 黙って消えるより、出ているほうが気づける）。
 */
export function isVipLetterVisible(sentAtIso: string | null | undefined, now: Date = new Date()): boolean {
  if (!sentAtIso) return true;
  const t = new Date(sentAtIso).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t <= WINDOW_MS;
}

/** 期間の始まり（これより古いものは出さない）のISO。★ DBに渡す用。 */
export function vipLetterWindowStartISO(now: Date = new Date()): string {
  return new Date(now.getTime() - WINDOW_MS).toISOString();
}
