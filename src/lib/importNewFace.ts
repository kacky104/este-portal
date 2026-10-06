// 取り込みで新しく作るセラピストに「新人（NEW）」を付けるか（第1257便・2026-10-07・カッキーさん・純粋関数）。
//
// ★★★ なぜ要るか（AMAZE 様で実際に起きた・2026-10-06 深夜）
//   フクエスリンク（駅ちかからの取り込み）は、駅ちかに居てフクエスに居ない方を【公開＋新人（NEW）】で作る（第227便）。
//   「駅ちかに新しく入った方＝新人」という前提だが、【その店を初めて取り込むとき】は在籍の全員が「フクエスに居ない方」なので、
//   昔から在籍している方まで全員に NEW が付いた（59名ぜんぶ新人）。
//
// ★★★ 決まり
//   その店で、駅ちかとの名簿の結び（therapist_media_ids）がはじめて作られてから【24時間】は、作る方に NEW を付けない。
//   ・結びが1件も無い ＝ その店の最初の取り込み → 付けない
//   ・最初の結びから24時間以内 ＝ 最初の取り込みの続き（個人ページは10人ずつ届く・枠2はあとから読む）→ 付けない
//   ・それより前から結びがある ＝ ふだんの取り込み → 付ける（今までどおり・第227便）
//   ★ 結びの時刻で見る理由: 取り込みの記録（salon_import_runs）は一覧の周（ingest-list）では書いていない。
//     結びは、作ったとき・名前で当たったときに必ず書くので、どちらの周でも同じ線になる。
//   ★ 手で登録していた店が今日フクエスリンクを始めた場合も、結びは今日できるので「最初の取り込み」として扱える。
//   ★ 既存の店は 2026-08-28 に旧列から結びを写してある（20260828_import_slot.sql）ので、今までどおり付く。
//
// ★ このファイルは通信も DB も触らない。読むのは呼ぶ側（lib/mediaCastIds.ts の earliestCastLinkAt）。

/** 最初の結びから、この時間のあいだは「最初の取り込み」とみなす。 */
export const IMPORT_FIRST_PERIOD_HOURS = 24;

/**
 * 取り込みで新しく作る方に NEW を付けるか。
 * @param earliestLinkAt その店・その媒体で、いちばん古い名簿の結びの時刻（無ければ null）
 * @returns true＝付ける（ふだんの取り込み）／false＝付けない（その店の最初の取り込み）
 * ★ 時刻が壊れていて読めないときは true（今までどおり付ける）。
 */
export function importNewFaceOnCreate(earliestLinkAt: string | null | undefined, now: Date = new Date()): boolean {
  if (earliestLinkAt === null || earliestLinkAt === undefined || earliestLinkAt === '') return false;
  const t = new Date(earliestLinkAt).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t >= IMPORT_FIRST_PERIOD_HOURS * 60 * 60 * 1000;
}
