import Link from 'next/link';
import { getMyInvoices } from '@/app/actions/billingOwner';
import { dateLabel, monthLabel, yen } from '@/lib/billing';

// 店舗マイページ「ご請求書」一覧（第816便）。★ 発行済み・入金済み・取り消しだけが並ぶ（下書きは RLS で見えない）。
export const dynamic = 'force-dynamic';

const STATUS: Record<string, { text: string; cls: string }> = {
  issued: { text: 'お支払い待ち', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  paid: { text: 'お支払い済み', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  void: { text: '取り消し', cls: 'bg-slate-50 text-slate-500 border-slate-200' },
};

export default async function MyInvoicesPage() {
  const r = await getMyInvoices();
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-slate-800">ご請求書</h1>
          <Link href="/mypage" className="text-sm text-pink-600 underline">マイページへ戻る</Link>
        </div>
        {!r.ok ? (
          <p className="text-sm text-rose-600">読み込めませんでした：{r.error}</p>
        ) : r.items.length === 0 ? (
          <p className="text-sm text-slate-500 bg-white border border-slate-200 p-6">まだご請求書はありません。</p>
        ) : (
          <ul className="space-y-2">
            {r.items.map((it) => {
              const s = STATUS[it.status] ?? STATUS.issued;
              return (
                <li key={it.id}>
                  <Link href={`/mypage/invoices/${it.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-white border border-slate-200 px-4 py-3 hover:border-pink-300">
                    <span className="font-bold text-slate-800">{monthLabel(it.billing_month)}</span>
                    <span className={`text-xs border px-2 py-0.5 ${s.cls}`}>{s.text}</span>
                    <span className="text-xs text-slate-500">{it.invoice_no}</span>
                    <span className="ml-auto text-right">
                      <span className="block font-bold text-slate-800">¥{yen(it.total)}</span>
                      {it.status === 'issued' && it.due_date && <span className="block text-xs text-slate-500">期限 {dateLabel(it.due_date)}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
