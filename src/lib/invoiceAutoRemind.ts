// 請求書の自動催促（第1433便・2026-10-13・カッキーさん）の決めごと。純粋関数だけ（番人: npm run check:invoiceremind）。
//
// ・1回目: 期限（due_date）の翌日から（＝今日 > 期限）。メール＋マイページの赤い帯
// ・2回目: 1回目から5日後（期限の6日後より前には送らない）。メールだけ
// ・入金待ち（issued）だけ。入金済み・取り消しには送らない
// ・日付はすべて日本時間の 'YYYY-MM-DD'

export const AUTO_REMIND_SECOND_AFTER_DAYS = 5;

export type RemindInput = {
  status: string;
  due_date: string | null;
  auto_remind1_at: string | null; // ISO
  auto_remind2_at: string | null; // ISO
};

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** ISO の日時 → 日本時間の 'YYYY-MM-DD' */
export function jstYmdOf(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 今日送るのはどれか。null＝送らない */
export function planInvoiceRemind(inv: RemindInput, todayYmd: string): 'first' | 'second' | null {
  if (inv.status !== 'issued' || !inv.due_date) return null;
  if (!(todayYmd > inv.due_date)) return null;
  if (!inv.auto_remind1_at) return 'first';
  if (inv.auto_remind2_at) return null;
  const from = [addDaysYmd(inv.due_date, 1 + AUTO_REMIND_SECOND_AFTER_DAYS), addDaysYmd(jstYmdOf(inv.auto_remind1_at), AUTO_REMIND_SECOND_AFTER_DAYS)].sort()[1];
  return todayYmd >= from ? 'second' : null;
}
