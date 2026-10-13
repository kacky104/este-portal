import { mfConfigured, mfGet, firstArray } from '@/app/lib/billing/mfApi';
import { jstTodayYmd } from '@/app/lib/salonStats';

// ★ 第1435便（2026-10-13・カッキーさん）: マネーフォワードから楽天口座の入金明細を【読むだけ】の確認ページ。
//   ・認可は /admin/layout.tsx（ADMIN_UUID）。DB には何も書かない。MF にも書かない（GET だけ）
//   ・入金の自動確認（照らし合わせ）を作る前に、明細の形（日付・金額・振込名義）を確かめるため
export const dynamic = 'force-dynamic';

function addDays(ymd: string, d: number): string {
  const t = new Date(`${ymd}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
}
const s = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export default async function MfProbePage() {
  if (!mfConfigured()) {
    return <main className="p-6 text-sm">MF_API_KEY が未設定です（Vercel の環境変数を入れたあと、再デプロイが必要です）。</main>;
  }
  const today = jstTodayYmd();
  const from = addDays(today, -45);
  let accounts: Record<string, unknown>[] = [];
  let rows: Record<string, unknown>[] = [];
  let rakuten: Record<string, unknown> | null = null;
  let error = '';
  try {
    accounts = firstArray(await mfGet('/connected_accounts'));
    rakuten = accounts.find((a) => s(a.name).includes('楽天銀行')) ?? null;
    rows = firstArray(await mfGet('/transactions', {
      start_date: from, end_date: today, side: 'INCOME', order: 'desc', per_page: 100,
      connected_account_id: rakuten ? s(rakuten.id) : undefined,
    }));
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="mx-auto max-w-5xl p-6 text-sm text-slate-800">
      <h1 className="mb-1 text-lg font-bold">マネーフォワード 入金明細の確認（読むだけ）</h1>
      <p className="mb-4 text-xs text-slate-500">{from} 〜 {today}・入金（INCOME）のみ・DB には書きません</p>
      {error && <p className="mb-4 border border-rose-300 bg-rose-50 p-3 text-rose-700">{error}</p>}

      <h2 className="mt-4 font-bold">連携口座（{accounts.length}）</h2>
      <ul className="mb-4 list-disc pl-5">
        {accounts.map((a, i) => <li key={i}>{s(a.name)}（id: {s(a.id)}）{rakuten === a && <b className="ml-1 text-emerald-700">← これを読む</b>}</li>)}
      </ul>
      {!rakuten && !error && <p className="mb-4 text-amber-700">楽天銀行の口座が見つからなかったので、全口座の入金を出しています。</p>}

      <h2 className="mt-4 font-bold">入金（{rows.length}件）</h2>
      <table className="mt-2 w-full border-collapse text-xs">
        <thead><tr className="bg-slate-100"><th className="border p-1">日付</th><th className="border p-1">金額</th><th className="border p-1">内容（振込名義）</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="border p-1 whitespace-nowrap">{s(r.date ?? r.recognized_at ?? r.transaction_date)}</td>
              <td className="border p-1 text-right">{s(r.value ?? r.amount)}</td>
              <td className="border p-1">{s(r.content ?? r.description ?? r.summary)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows[0] && (
        <>
          <h2 className="mt-6 font-bold">1件目の中身（項目名の確認用）</h2>
          <pre className="mt-2 overflow-x-auto bg-slate-50 p-3 text-[11px]">{JSON.stringify(rows[0], null, 2)}</pre>
        </>
      )}
    </main>
  );
}
