// 店舗カードのタブ（写メ日記・口コミ・新人・クーポン）の決めごと（第1126便・2026-10-03・カッキーさん）。★ 純粋関数のみ。
//
// ★★★ 形（カッキーさんの決定「C案」）
//   カードの下に、数のバッジが付いたタブの見出しを1行だけ出す（閉じておく）。押すと開き、もう一度押すと閉じる。
//   並びは 写メ日記 → 口コミ → 新人 → クーポン。0件のタブは薄く出す（押せない）。
//   開いたときは 2件を1行ずつ ＋「すべて見る」。
// ★★★ 数の決め方
//   写メ日記 … 48時間以内の投稿（NEW バッジと同じ窓＝DIARY_NEW_WINDOW_MS）
//   口コミ   … カードの ★ の横に出している件数（salons.review_count）と同じ
//   新人     … いま新人紹介中の人数（isNewFaceActive と同じ判定・カードが読んでいるセラピストから数える）
//   クーポン … 公開中で、期限が切れていない枚数（/salon/{id}/coupon と同じ条件）
// ★★★ 読み取り
//   数は TOP の作り直し（ISR）のときにまとめて2本だけ読む（写メ日記・クーポン）。口コミと新人は今ある値から出す。
//   中身（2件）は【押した店のぶんだけ】そのとき読む。

export type CardTabKey = 'diary' | 'review' | 'newface' | 'coupon';

/** タブの並びと文言（★ 順番はカッキーさんの指定） */
export const CARD_TABS: ReadonlyArray<{ key: CardTabKey; label: string; unit: string; more: string; path: string }> = [
  { key: 'diary', label: '写メ日記', unit: '件', more: '写メ日記をすべて見る', path: 'diary' },
  { key: 'review', label: '口コミ', unit: '件', more: '口コミをすべて見る', path: 'reviews' },
  { key: 'newface', label: '新人', unit: '名', more: '新人をすべて見る', path: 'newface' },
  { key: 'coupon', label: 'クーポン', unit: '枚', more: 'クーポンを見る', path: 'coupon' },
];

/** 開いたときに出す件数 */
export const CARD_TAB_ROWS = 2;

/** TOP の作り直しのときに読む数（店舗ごと）。口コミ・新人はここに入れない（今ある値から出す） */
export type SalonCardTabCount = { diary: number; coupon: number };
export type SalonCardTabCounts = Record<number, SalonCardTabCount>;

/** バッジに出す数。★ 0 は出さない（''）・100 以上は 99+ */
export function badgeText(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return n > 99 ? '99+' : String(Math.floor(n));
}

/** 今日の日付（JST・'YYYY-MM-DD'）。★ 今の時刻は呼ぶ側が渡す */
export function todayJstOf(nowMs: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date(nowMs));
}

/** クーポンが期限内か。★ 期限なし（null）は常に出す（/salon/{id}/coupon と同じ） */
export function isCouponValid(validUntil: string | null | undefined, todayJst: string): boolean {
  return validUntil == null || validUntil === '' || validUntil >= todayJst;
}

/** 行（salon_id 入り）を店舗ごとに数える。★ salon_id が数でない行は捨てる */
export function countBySalon(rows: ReadonlyArray<{ salon_id?: unknown }> | null | undefined): Record<number, number> {
  const out: Record<number, number> = {};
  for (const r of rows ?? []) {
    const id = Number(r?.salon_id);
    if (r?.salon_id == null || !Number.isFinite(id)) continue;
    out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

/** 写メ日記の行とクーポンの行から、店舗ごとの数を作る */
export function buildTabCounts(
  diaryRows: ReadonlyArray<{ salon_id?: unknown }> | null | undefined,
  couponRows: ReadonlyArray<{ salon_id?: unknown; valid_until?: unknown }> | null | undefined,
  todayJst: string,
): SalonCardTabCounts {
  const diary = countBySalon(diaryRows);
  const coupon = countBySalon(
    (couponRows ?? []).filter((r) => isCouponValid(typeof r.valid_until === 'string' ? r.valid_until : null, todayJst)),
  );
  const out: SalonCardTabCounts = {};
  for (const id of new Set([...Object.keys(diary), ...Object.keys(coupon)].map(Number))) {
    out[id] = { diary: diary[id] ?? 0, coupon: coupon[id] ?? 0 };
  }
  return out;
}

/** 1行に出す短い文（改行・連続する空白をまとめる）。★ 切るのは画面側（CSS の省略）に任せ、ここでは長すぎる分だけ落とす */
export function oneLine(text: unknown, max = 60): string {
  const s = (typeof text === 'string' ? text : '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) : s;
}

/** 写メ日記の行に出す文。タイトル → 本文の頭 → どちらも無ければ「写真を投稿しました」 */
export function diaryLine(title: unknown, content: unknown): string {
  return oneLine(title) || oneLine(content) || '写真を投稿しました';
}

/** 口コミの総合点（3つの平均・小数1位）。★ app/lib/reviews.ts の overallOf と同じ式 */
export function overallRating(service: unknown, technique: unknown, reception: unknown): number {
  const v = (Number(service) + Number(technique) + Number(reception)) / 3;
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : 0;
}
