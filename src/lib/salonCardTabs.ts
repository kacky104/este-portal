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
//   ★ 第1128便: 写メ日記の2件だけは、数を数える行と一緒に読んで TOP の HTML に入れておく（本数は増えない・押しても読まない）。

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

/** 写メ日記の1行ぶん（TOP の HTML に入れておく・第1128便） */
//   ★ 第1129便: 名前の左に出す丸い写真のために、セラピストの id と写真も持つ（写真が無ければ null）
export type CardDiaryRow = { id: string; name: string; text: string; at: string; therapistId: string; image: string | null };

/**
 * TOP の作り直しのときに読む数（店舗ごと）。口コミ・新人はここに入れない（今ある値から出す）。
 * ★ 第1128便: diaryRows ＝ 48時間以内の写メ日記の新しい順2件。★ 見た目は閉じたまま、中身だけ HTML に入れる
 *   （検索エンジンは、閉じてあるタブの中身も HTML にあれば読む。写メ日記の個別ページへのリンクも TOP に載る）。
 */
export type SalonCardTabCount = { diary: number; coupon: number; diaryRows?: CardDiaryRow[] };
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

/** 写メ日記の行（読んだまま）。★ 新しい順に並んでいること（呼ぶ側が order する） */
export type DiaryRowIn = { id?: unknown; salon_id?: unknown; therapist_id?: unknown; title?: unknown; content?: unknown; created_at?: unknown; therapists?: unknown };

/** 取り込んだセラピスト（1件 or 配列で返ってくる）から、名前と写真を取る */
export function therapistRefOf(v: unknown): { name: string; image: string | null } {
  const one = Array.isArray(v) ? v[0] : v;
  const o = one && typeof one === 'object' ? (one as { name?: unknown; profile_image_url?: unknown }) : null;
  return {
    name: typeof o?.name === 'string' ? o.name : '',
    image: typeof o?.profile_image_url === 'string' && o.profile_image_url ? o.profile_image_url : null,
  };
}

/**
 * 店舗ごとに、写メ日記の先頭 CARD_TAB_ROWS 件を行の形にする。★ 並びは渡された順（＝新しい順）。
 *   ★ id が無い行は入れない（リンクを作れない）。★ 本文は1行ぶんだけにして渡す（長い本文をそのまま画面へ運ばない）。
 */
export function topDiaryRowsBySalon(rows: ReadonlyArray<DiaryRowIn> | null | undefined): Record<number, CardDiaryRow[]> {
  const out: Record<number, CardDiaryRow[]> = {};
  for (const r of rows ?? []) {
    const sid = Number(r?.salon_id);
    if (r?.salon_id == null || !Number.isFinite(sid)) continue;
    if (typeof r.id !== 'string' && typeof r.id !== 'number') continue;
    const list = out[sid] ?? (out[sid] = []);
    if (list.length >= CARD_TAB_ROWS) continue;
    const th = therapistRefOf(r.therapists);
    list.push({
      id: String(r.id),
      name: th.name,
      text: diaryLine(r.title, r.content),
      at: typeof r.created_at === 'string' ? r.created_at : '',
      therapistId: r.therapist_id == null ? '' : String(r.therapist_id),
      image: th.image,
    });
  }
  return out;
}

/** 写メ日記の行とクーポンの行から、店舗ごとの数（と、写メ日記の先頭2件）を作る */
export function buildTabCounts(
  diaryRows: ReadonlyArray<DiaryRowIn> | null | undefined,
  couponRows: ReadonlyArray<{ salon_id?: unknown; valid_until?: unknown }> | null | undefined,
  todayJst: string,
): SalonCardTabCounts {
  const diary = countBySalon(diaryRows);
  const top = topDiaryRowsBySalon(diaryRows);
  const coupon = countBySalon(
    (couponRows ?? []).filter((r) => isCouponValid(typeof r.valid_until === 'string' ? r.valid_until : null, todayJst)),
  );
  const out: SalonCardTabCounts = {};
  for (const id of new Set([...Object.keys(diary), ...Object.keys(coupon)].map(Number))) {
    out[id] = { diary: diary[id] ?? 0, coupon: coupon[id] ?? 0, ...(top[id] && top[id].length > 0 ? { diaryRows: top[id] } : {}) };
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
