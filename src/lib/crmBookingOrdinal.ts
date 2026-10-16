// ★ 第1514便（2026-10-16・ラビリンス様のご要望／カッキーさん決定）: CRM の予約カードに出す「新規／◯回目」。
//
// ★ 何を数えるか
//   ・その予約が、そのお客様の【何件目の予約か】。CRM に入った予約すべて（ネット予約・手入力とも）。
//   ・キャンセルも数える（減らさない）。新規で予約→キャンセル→次の予約は「2回目」。
//   ・順番は「予約を入れた順」＝ created_at の古い順。同じ時刻なら id の順。
//   ・「誤って入れた予約を削除する」は行ごと消える＝ここには来ない＝数えない。
//   ・お客様がひも付いていない予約（customer_id なし）は数えない（何も出さない）。
//
// ★★ 顧客台帳・レポートの「利用◯回」（crm_customer_stats の visits＝実際に来店した回数）とは別物。混ぜない。

export type CrmOrdinalRow = {
  id: string;
  customerId: number | null;
  createdAt: string;
};

/** 予約ID → そのお客様の何件目か（1始まり）。customer_id なし・日時が読めない行は入れない */
export function crmBookingOrdinals(rows: ReadonlyArray<CrmOrdinalRow>): Map<string, number> {
  const byCustomer = new Map<number, Array<{ id: string; t: number }>>();
  for (const r of rows) {
    if (r.customerId == null || !Number.isFinite(r.customerId)) continue;
    const t = Date.parse(r.createdAt);
    if (!Number.isFinite(t)) continue;
    const list = byCustomer.get(r.customerId) ?? [];
    list.push({ id: String(r.id), t });
    byCustomer.set(r.customerId, list);
  }
  const out = new Map<string, number>();
  for (const list of byCustomer.values()) {
    list.sort((a, b) => (a.t - b.t) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    list.forEach((x, i) => out.set(x.id, i + 1));
  }
  return out;
}

/** カードに出す文字。1件目は「新規」、2件目からは「◯回目」。分からなければ null（何も出さない） */
export function crmOrdinalLabel(n: number | null | undefined): string | null {
  if (n == null || !Number.isInteger(n) || n < 1) return null;
  return n === 1 ? '新規' : `${n}回目`;
}
