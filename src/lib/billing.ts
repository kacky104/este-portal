// 請求書の計算（第816便・2026-09-25・カッキーさん）。★ 純粋関数だけ（DBもDateの現在時刻も触らない）。
//
// ★ 決めごと（カッキーさん）
//   ・金額は円の整数・税抜。★ 割引はマイナスの行
//   ・消費税＝小計×税率。★ 1円未満は切り捨て。★ 小計がマイナスなら税0（そんな請求書は出さないが念のため）
//   ・毎月1日発行・期限は当月の due_day 日（既定25日）
//   ・請求番号は FK-YYYYMM-0001（対象の月＋その月の通し番号）
// ★ 月はすべて 'YYYY-MM-01' の文字列で持つ（DB の date 列と同じ形）。

export type BillingLineInput = { label: string; unit_price: number; quantity: number };

export type ContractLine = BillingLineInput & {
  start_month: string;       // 'YYYY-MM-01'
  end_month: string | null;  // 'YYYY-MM-01' or null（ずっと）
  sort_order?: number;
};

const MONTH_RE = /^(\d{4})-(\d{2})-01$/;

/** 'YYYY-MM-01' か。 */
export function isMonth(v: string): boolean {
  const m = MONTH_RE.exec(v);
  if (!m) return false;
  const mm = Number(m[2]);
  return mm >= 1 && mm <= 12;
}

/** 'YYYY-MM-DD'（どの日でも）→ その月の 'YYYY-MM-01'。 */
export function monthOf(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

/** 月を n か月ずらす（'YYYY-MM-01'）。 */
export function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12 + 1;
  return `${yy}-${String(mm).padStart(2, '0')}-01`;
}

/** その月に請求する契約の行だけ（開始月〜終了月に入るもの）。並びは sort_order → 元の順。 */
export function linesForMonth<T extends ContractLine>(lines: T[], month: string): T[] {
  return lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.start_month <= month && (l.end_month === null || l.end_month >= month))
    .sort((a, b) => (a.l.sort_order ?? 0) - (b.l.sort_order ?? 0) || a.i - b.i)
    .map(({ l }) => l);
}

/** 1行の金額（単価×数量）。 */
export function lineAmount(l: BillingLineInput): number {
  return Math.trunc(l.unit_price) * Math.trunc(l.quantity);
}

/** 小計・消費税・合計。★ 税は切り捨て。★ 小計がマイナスなら税0。 */
export function calcTotals(lines: BillingLineInput[], taxRatePct: number): { subtotal: number; tax: number; total: number } {
  const subtotal = lines.reduce((s, l) => s + lineAmount(l), 0);
  const tax = subtotal > 0 ? Math.floor((subtotal * taxRatePct) / 100) : 0;
  return { subtotal, tax, total: subtotal + tax };
}

/** お支払い期限（対象の月の dueDay 日）。 */
export function dueDateOf(month: string, dueDay: number): string {
  const d = Math.min(Math.max(Math.trunc(dueDay), 1), 28);
  return `${month.slice(0, 7)}-${String(d).padStart(2, '0')}`;
}

/** 請求番号 FK-YYYYMM-0001。 */
export function invoiceNo(month: string, seq: number): string {
  return `FK-${month.slice(0, 4)}${month.slice(5, 7)}-${String(seq).padStart(4, '0')}`;
}

/** 既に付いた番号の並びから、次の通し番号。 */
export function nextInvoiceSeq(month: string, existing: (string | null)[]): number {
  const prefix = invoiceNo(month, 0).slice(0, -4);
  let max = 0;
  for (const no of existing) {
    if (!no || !no.startsWith(prefix)) continue;
    const n = Number(no.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/** 表示用 '2026年10月分'。 */
export function monthLabel(month: string): string {
  return `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月分`;
}

/** 表示用 '2026年10月25日'。 */
export function dateLabel(ymd: string): string {
  return `${Number(ymd.slice(0, 4))}年${Number(ymd.slice(5, 7))}月${Number(ymd.slice(8, 10))}日`;
}

/** 表示用 '66,000'。 */
export function yen(n: number): string {
  return Math.trunc(n).toLocaleString('ja-JP');
}
