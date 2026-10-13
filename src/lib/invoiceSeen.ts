// ★ 第1432便（2026-10-13・カッキーさん）: ご請求書の「未読」の印（このブラウザだけ・運営からのお知らせ lib/opsNotices.ts と同じ考え方）。
//   ・マイページのサイドバー「ご請求書」の赤い数字と、店名の下の「新しいご請求書が届いています」は、まだ見ていない請求書の数
//   ・ご請求書の一覧（/mypage/invoices）を一度開いたら、そこに並んだ請求書に印を付ける＝どちらも消える
//   ・DB には書かない（別の端末・ブラウザでは、そこで一度開くまで出る）

export const INVOICE_SEEN_KEY = 'fukues.invoices.seen';

export function loadSeenInvoiceIds(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(INVOICE_SEEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function addSeenInvoiceIds(ids: string[]): void {
  try {
    const all = [...new Set([...loadSeenInvoiceIds(), ...ids.map(String)])].slice(-200);
    window.localStorage.setItem(INVOICE_SEEN_KEY, JSON.stringify(all));
  } catch {
    /* 保存できなくても画面は動かす */
  }
}
