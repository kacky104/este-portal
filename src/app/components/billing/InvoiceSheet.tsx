import { dateLabel, monthEnd, monthLabel, yen } from '@/lib/billing';

// 請求書の紙面（第816便）。★ 店舗マイページと管理画面の両方で使う。★ 印刷すると A4 1枚に収まる大きさ。
// ★ 発行済みは issuer（発行時に写した設定）を出す。★ 下書きの見本は今の設定を渡す。
// ★ 第829便: スマホ（sm 未満）では 4列の表をやめて、1行ずつ縦に積む（品名が1文字ずつ縦に潰れていた）。印刷と PC は表のまま。

export type SheetIssuer = {
  issuer_name: string; issuer_address: string; issuer_tel: string; issuer_email: string;
  registration_no: string | null; bank_info: string; note: string;
};
export type SheetInvoice = {
  invoice_no: string | null; billing_month: string; recipient_name: string; payment_method: 'transfer' | 'cash';
  issue_date: string | null; due_date: string | null; subtotal: number; tax_amount: number; total: number; tax_rate_pct: number;
  status: string; lines: { label: string; unit_price: number; quantity: number; amount: number }[];
};

export function InvoiceSheet({ invoice, issuer }: { invoice: SheetInvoice; issuer: SheetIssuer }) {
  const draft = invoice.status === 'draft';
  return (
    <div className="invoice-sheet bg-white text-slate-800 mx-auto w-full max-w-[794px] p-4 sm:p-8 md:p-12 border border-slate-200 print:border-0 print:p-0 relative">
      {draft && (
        <div className="absolute top-4 right-4 border-2 border-rose-400 text-rose-500 text-xs font-bold px-2 py-0.5 print:hidden">下書き（見本）</div>
      )}
      {invoice.status === 'void' && (
        <div className="absolute top-4 right-4 border-2 border-slate-400 text-slate-500 text-xs font-bold px-2 py-0.5">取り消し</div>
      )}
      <h1 className="text-center text-2xl font-bold tracking-[0.5em] mb-6 sm:mb-8 mt-4 sm:mt-0 print:mt-0">請求書</h1>

      <div className="flex flex-col sm:flex-row sm:justify-between gap-4 sm:gap-6 print:flex-row print:justify-between">
        <div className="min-w-0">
          <p className="text-lg font-bold border-b border-slate-800 pb-1 mb-3">{invoice.recipient_name} 御中</p>
          <p className="text-sm mb-1">{monthLabel(invoice.billing_month)}のご利用料金を、下記のとおりご請求申し上げます。</p>
          {/* ★ 第822便: 前月に前払い。★ どの期間の料金かを書いておく */}
          <p className="text-sm text-slate-600">ご利用期間：{dateLabel(invoice.billing_month)}〜{dateLabel(monthEnd(invoice.billing_month))}</p>
        </div>
        <div className="text-sm leading-6 text-left sm:text-right print:text-right">
          <p>請求番号：{invoice.invoice_no ?? '（発行時に付きます）'}</p>
          <p>発行日：{invoice.issue_date ? dateLabel(invoice.issue_date) : '（発行時に入ります）'}</p>
          <div className="mt-3 text-left inline-block">
            <p className="font-bold">{issuer.issuer_name || '（発行者名が未設定）'}</p>
            {issuer.issuer_address && <p className="whitespace-pre-line">{issuer.issuer_address}</p>}
            {issuer.issuer_tel && <p>TEL：{issuer.issuer_tel}</p>}
            {issuer.issuer_email && <p>{issuer.issuer_email}</p>}
            {issuer.registration_no && <p>登録番号：{issuer.registration_no}</p>}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-end gap-4 border-b-2 border-slate-800 pb-2 w-full sm:w-2/3 print:w-2/3">
        <span className="text-sm font-bold shrink-0">ご請求金額（税込）</span>
        <span className="text-2xl sm:text-3xl print:text-3xl font-bold ml-auto">¥{yen(invoice.total)}</span>
      </div>
      <p className="text-sm mt-2">お支払い期限：{invoice.due_date ? dateLabel(invoice.due_date) : '—'}</p>

      {/* ★ スマホ: 1行ずつ縦に積む（印刷では出さない） */}
      <div className="sm:hidden print:hidden mt-6 text-sm border-t-2 border-slate-800">
        {invoice.lines.map((l, i) => (
          <div key={i} className="flex items-center gap-3 py-2.5 border-b border-slate-300">
            <div className="min-w-0 flex-1">
              <p className="font-bold">{l.label}</p>
              <p className="text-xs text-slate-500">{l.quantity} × {l.unit_price < 0 ? '−' : ''}{yen(Math.abs(l.unit_price))}円</p>
            </div>
            <p className={`font-bold tabular-nums ${l.amount < 0 ? 'text-rose-600' : ''}`}>{l.amount < 0 ? '−' : ''}{yen(Math.abs(l.amount))}</p>
          </div>
        ))}
        <div className="flex justify-between py-1.5 mt-1"><span>小計</span><span className="tabular-nums">{yen(invoice.subtotal)}</span></div>
        <div className="flex justify-between py-1.5"><span>消費税（{invoice.tax_rate_pct}%）</span><span className="tabular-nums">{yen(invoice.tax_amount)}</span></div>
        <div className="flex justify-between py-2 font-bold bg-slate-100 px-2 border-y border-slate-300"><span>合計</span><span className="tabular-nums">{yen(invoice.total)}</span></div>
      </div>

      {/* PC・印刷: 4列の表 */}
      <table className="hidden sm:table print:table w-full mt-6 text-sm border-collapse">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-2 py-1.5 text-left">品名</th>
            <th className="border border-slate-300 px-2 py-1.5 w-16">数量</th>
            <th className="border border-slate-300 px-2 py-1.5 w-28 text-right">単価</th>
            <th className="border border-slate-300 px-2 py-1.5 w-28 text-right">金額</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((l, i) => (
            <tr key={i}>
              <td className="border border-slate-300 px-2 py-1.5">{l.label}</td>
              <td className="border border-slate-300 px-2 py-1.5 text-center">{l.quantity}</td>
              <td className="border border-slate-300 px-2 py-1.5 text-right">{l.unit_price < 0 ? '−' : ''}{yen(Math.abs(l.unit_price))}</td>
              <td className="border border-slate-300 px-2 py-1.5 text-right">{l.amount < 0 ? '−' : ''}{yen(Math.abs(l.amount))}</td>
            </tr>
          ))}
          {Array.from({ length: Math.max(0, 5 - invoice.lines.length) }).map((_, i) => (
            <tr key={`e${i}`}><td className="border border-slate-300 px-2 py-1.5">&nbsp;</td><td className="border border-slate-300" /><td className="border border-slate-300" /><td className="border border-slate-300" /></tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={2} /><td className="border border-slate-300 px-2 py-1.5 text-right">小計</td><td className="border border-slate-300 px-2 py-1.5 text-right">{yen(invoice.subtotal)}</td></tr>
          <tr><td colSpan={2} /><td className="border border-slate-300 px-2 py-1.5 text-right">消費税（{invoice.tax_rate_pct}%）</td><td className="border border-slate-300 px-2 py-1.5 text-right">{yen(invoice.tax_amount)}</td></tr>
          <tr><td colSpan={2} /><td className="border border-slate-300 px-2 py-1.5 text-right font-bold bg-slate-100">合計</td><td className="border border-slate-300 px-2 py-1.5 text-right font-bold bg-slate-100">{yen(invoice.total)}</td></tr>
        </tfoot>
      </table>

      <div className="mt-8 text-sm">
        <p className="font-bold mb-1">お支払い方法</p>
        {invoice.payment_method === 'cash' ? (
          <p>現金でのお支払い</p>
        ) : (
          <>
            <p>下記の口座へお振込みください。</p>
            <p className="whitespace-pre-line mt-1 border border-slate-300 p-3 break-words">{issuer.bank_info || '（振込先が未設定）'}</p>
          </>
        )}
        {issuer.note && <p className="whitespace-pre-line mt-3 text-slate-600">{issuer.note}</p>}
      </div>
    </div>
  );
}
