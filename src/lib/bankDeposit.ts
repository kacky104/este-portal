// 入金明細と請求書の照らし合わせ（第1437便・2026-10-13・カッキーさん）の決めごと。純粋関数だけ（番人: npm run check:bankdeposit）。
//
// ・金額が一致する入金待ちの請求書を探す。振込名義（transfer_name）が明細の内容に入っていれば「名義も一致」
// ・★ いまは自動で入金済みにしない（AUTO_MARK_PAID = false・カッキーさん「最初の1〜2か月は全部候補で」）
// ・預金利息などは対象外

export const AUTO_MARK_PAID = false;

/** 名前の比べ方: 全角半角をそろえ、空白・「振込」を消し、大文字に */
export function normalizeName(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[\s　]+/g, '')
    .replace(/^(振込|フリコミ|ﾌﾘｺﾐ)/, '')
    .toUpperCase();
}

/** 覚える振込名義（表示用）: 全角半角をそろえ、先頭の「振込 」を消す */
export function cleanPayerName(content: string): string {
  return content.normalize('NFKC').replace(/^\s*(振込|フリコミ)\s*/, '').trim().slice(0, 60);
}

export function isNotPayment(content: string): boolean {
  return /利息|決算お利息|利子/.test(content);
}

export type InvoiceCand = { id: number; total: number; transferName: string };

/** たぶんこの請求書。金額一致の中で名義も一致すれば 'name'、金額一致が1件だけなら 'amount'、それ以外は null */
export function suggestInvoice(dep: { amount: number; content: string }, invoices: InvoiceCand[]): { invoiceId: number; reason: 'name' | 'amount' } | null {
  const same = invoices.filter((i) => i.total === dep.amount);
  if (same.length === 0) return null;
  const c = normalizeName(dep.content);
  const byName = same.filter((i) => {
    const n = normalizeName(i.transferName ?? '');
    return n.length >= 2 && c.includes(n);
  });
  if (byName.length === 1) return { invoiceId: byName[0].id, reason: 'name' };
  if (same.length === 1) return { invoiceId: same[0].id, reason: 'amount' };
  return null;
}
