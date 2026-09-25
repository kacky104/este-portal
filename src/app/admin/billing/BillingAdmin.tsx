'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getBillingAdmin, saveBillingSettings, saveBillingItem, saveSalonProfile, saveContractLine, deleteContractLine,
  issueForSalons, markPaid, unmarkPaid, voidInvoice,
  type BillingAdminData, type BillingSettings, type ContractLineRow, type InvoiceRow,
} from '@/app/actions/billingAdmin';
import { InvoiceSheet } from '@/app/components/billing/InvoiceSheet';
import { addMonths, billingMonthForIssueDay, calcTotals, dateLabel, dueDateOf, issueMonthOf, lineAmount, linesForMonth, monthLabel, yen } from '@/lib/billing';

// 管理画面「請求書」（第825便で1枚の表に・第826便で事務員さん向けの並びに・第827便で左のサイドバー＋ページ分けに・2026-09-25・カッキーさん）。
// ★★ 左のサイドバーの項目＝ページ。上から仕事の順番:
//   ① 発行する（これから発行の店にチェック→発行）／② 入金待ち（入金済みにする・期限切れは赤）／③ 入金済み
//   契約（店ごとの料金を入れる・変える）／⚙ 設定（発行者・品目）／？ 使い方
//   ・月の帯は①②③契約のページに共通（いま見ている月）。★ 店の中身は右から出る枠（どのページからも同じ）
//   ・発行者が空なら、どのページでも上に黄色い帯
// ★ 前月に前払い: 「11月分」は 10月1日に発行・10月25日期限（src/lib/billing.ts）。

const input = 'border border-slate-300 px-2.5 py-2 text-[15px] w-full bg-white';
const btn = 'text-[15px] font-bold px-4 py-2 border disabled:opacity-40';
const btnPink = `${btn} bg-pink-600 text-white border-pink-600 hover:bg-pink-700`;
const btnGray = `${btn} bg-white text-slate-700 border-slate-300 hover:border-pink-400`;
const btnGreen = `${btn} bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700`;

type RunFn = (fn: () => Promise<{ ok: boolean; error?: string; mail?: string }>, okMsg?: string) => Promise<boolean>;

function jstToday(): string { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
function shortMonth(m: string): string { return `${Number(m.slice(0, 4))}年${Number(m.slice(5, 7))}月`; }
function md(ymd: string): string { return dateLabel(ymd).replace(/^\d+年/, ''); }
function daysBetween(a: string, b: string): number { return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400e3); }
function toHalf(v: string): string {
  return v.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[－ー−‐]/g, '-').replace(/[,，\s円¥￥]/g, '');
}
// ★ 第830便: あいうえお順の並べ替えの鍵。店名の中の最初のカナ（「THE LABYRINTH 〜ラビリンス〜」→「ラビリンス」）。
//   カナがない店（漢字・英字だけ）は店名そのまま。ひらがなはカタカナに寄せ、長音・記号は除く。
function kanaKey(name: string): string {
  const m = /[ぁ-んァ-ヶー]+/.exec(name);
  const src = m ? m[0] : name;
  return src.replace(/[ぁ-ん]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)).replace(/[ー〜～\-\s]/g, '').toLowerCase();
}
const jaCollator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });

function periodText(l: ContractLineRow): string {
  if (l.end_month === l.start_month) return `${shortMonth(l.start_month)}分だけ`;
  if (!l.end_month) return `${shortMonth(l.start_month)}分から毎月`;
  return `${shortMonth(l.start_month)}分〜${shortMonth(l.end_month)}分`;
}

type State = 'none' | 'ready' | 'issued' | 'paid';
type Row = {
  salonId: number; name: string; hidden: boolean;
  lines: ContractLineRow[];           // この月に入る契約の行
  invoice: InvoiceRow | null;         // この月の請求書（取り消し以外）
  voided: number;                     // 取り消した数
  total: number;
  state: State;
  transferName: string;               // ★ 第831便: 振込名義のメモ（通帳と照らす用）
};
type Page = 'issue' | 'unpaid' | 'paid' | 'contracts' | 'settings' | 'help';

const STATE_LABEL: Record<State, string> = { none: '契約なし', ready: '未発行', issued: '入金待ち', paid: '入金済み' };
const STATE_BADGE: Record<State, string> = {
  none: 'bg-slate-50 text-slate-400', ready: 'bg-slate-100 text-slate-600', issued: 'bg-amber-100 text-amber-800', paid: 'bg-emerald-100 text-emerald-800',
};

export function BillingAdmin({ initialMonth }: { initialMonth: string }) {
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<BillingAdminData | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState<Page>('issue');
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [openSalon, setOpenSalon] = useState<number | null>(null);
  const today = jstToday();
  const thisMonth = billingMonthForIssueDay(today);

  const load = useCallback(async () => {
    const r = await getBillingAdmin(month);
    if (r.ok) { setData(r.data); setErr(''); } else setErr(r.error);
  }, [month]);
  useEffect(() => { void load(); }, [load]);

  const run: RunFn = async (fn, okMsg) => {
    setBusy(true); setMsg('');
    try {
      const r = await fn();
      if (!r.ok) { setMsg(`×　${r.error}`); return false; }
      setMsg(`○　${r.mail ?? okMsg ?? '保存しました'}`); await load(); return true;
    } finally { setBusy(false); }
  };

  // ★ 第830便: 全部のページで あいうえお順・非表示の店は下
  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    const tax = data.settings.tax_rate_pct;
    const hasKana = (n: string) => /[ぁ-んァ-ヶ]/.test(n) ? 0 : 1; // ★ カナのない店（英字・漢字だけ）は後ろ
    const sorted = [...data.salons].sort((a, b) =>
      (Number(!!a.is_hidden) - Number(!!b.is_hidden)) || (hasKana(a.name) - hasKana(b.name)) || jaCollator.compare(kanaKey(a.name), kanaKey(b.name)) || a.id - b.id);
    return sorted.map((s) => {
      const lines = linesForMonth(data.lines.filter((l) => l.salon_id === s.id), month);
      const invs = data.invoices.filter((i) => i.salon_id === s.id);
      const live = invs.find((i) => i.status === 'issued' || i.status === 'paid') ?? null;
      const state: State = live ? (live.status === 'paid' ? 'paid' : 'issued') : lines.length ? 'ready' : 'none';
      return {
        salonId: s.id, name: s.name, hidden: !!s.is_hidden, lines, invoice: live,
        voided: invs.filter((i) => i.status === 'void').length,
        total: live ? live.total : calcTotals(lines, tax).total, state,
        transferName: data.profiles.find((p) => p.salon_id === s.id)?.transfer_name ?? '',
      };
    });
  }, [data, month]);

  const by = (st: State) => rows.filter((r) => r.state === st);
  const sumOf = (list: Row[]) => list.reduce((a, r) => a + r.total, 0);
  const ready = by('ready'), issued = by('issued'), paid = by('paid');
  const lateCount = issued.filter((r) => r.invoice?.due_date && r.invoice.due_date < today).length;
  const checkedReady = ready.filter((r) => checked.has(r.salonId));
  const issueDay = `${issueMonthOf(month).slice(0, 7)}-01`;
  const dueDay = data ? dueDateOf(month, data.settings.due_day) : '';
  const setupMissing = !!data && (!data.settings.issuer_name.trim() || !data.settings.bank_info.trim());

  const changeMonth = (m: string) => { setMonth(m); setChecked(new Set()); setMsg(''); };
  const changePage = (p: Page) => { setPage(p); setMsg(''); };
  const toggle = (id: number, on: boolean) => { const n = new Set(checked); if (on) n.add(id); else n.delete(id); setChecked(n); };

  const issue = (list: Row[]) => {
    if (list.length === 0) return;
    const names = list.length <= 3 ? list.map((r) => r.name).join('・') : `${list.slice(0, 2).map((r) => r.name).join('・')} ほか${list.length - 2}店`;
    if (!confirm(`【${monthLabel(month)}】の請求書を ${list.length}店（${names}）に発行します。\n合計 ¥${yen(sumOf(list))}\n\n発行すると店舗様のマイページに出て、お知らせのメールが届きます。\nよろしいですか？`)) return;
    void run(async () => { const r = await issueForSalons(month, list.map((x) => x.salonId)); if (r.ok) setChecked(new Set()); return r; });
  };
  const quickPaid = (r: Row) => {
    const inv = r.invoice!;
    const how = inv.payment_method === 'cash' ? '現金' : '振込';
    if (!confirm(`${r.name} の ${monthLabel(month)}（¥${yen(inv.total)}）を\n【今日 ${md(today)}・${how}】で入金済みにします。\n\n別の日や別の方法なら「キャンセル」→「請求書を見る」から入れてください。`)) return;
    void run(() => markPaid(inv.id, inv.payment_method, today), `${r.name} を入金済みにしました`);
  };

  // ── サイドバーの項目 ──
  const nav: { key: Page; label: string; count?: number; tone?: string; sub?: string }[] = [
    { key: 'issue', label: '① 発行する', count: ready.length, tone: 'bg-pink-600', sub: 'これから発行の店' },
    { key: 'unpaid', label: '② 入金待ち', count: issued.length, tone: lateCount ? 'bg-rose-600' : 'bg-amber-500', sub: lateCount ? `期限切れ ${lateCount}店` : '振込を確かめる' },
    { key: 'paid', label: '③ 入金済み', count: paid.length, tone: 'bg-emerald-600', sub: 'この月は完了' },
    { key: 'contracts', label: '契約（店ごとの料金）', sub: '新しい店・料金の変更' },
    { key: 'settings', label: '⚙ 設定', sub: '発行者・振込先・品目' },
    { key: 'help', label: '？ 使い方', sub: '初めての方はこちら' },
  ];
  const showMonth = page === 'issue' || page === 'unpaid' || page === 'paid' || page === 'contracts';

  const salonRow = (r: Row) => {
    const inv = r.invoice;
    const late = r.state === 'issued' && inv?.due_date && inv.due_date < today ? daysBetween(inv.due_date, today) : 0;
    return (
      <div key={r.salonId} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${late ? 'bg-rose-50/60' : ''}`}>
        {page === 'issue' && r.state === 'ready'
          ? <input type="checkbox" className="w-6 h-6 cursor-pointer" checked={checked.has(r.salonId)} onChange={(e) => toggle(r.salonId, e.target.checked)} />
          : page === 'issue' ? <span className="w-6" /> : null}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[17px] truncate">{r.name}{r.hidden && <span className="text-xs text-slate-400 font-normal">（非表示の店）</span>}</p>
          <p className="text-sm text-slate-500 truncate">
            {r.state === 'none' ? `${monthLabel(month)}の料金はありません` : (inv ? inv.lines : r.lines).map((l) => `${l.label} ${l.unit_price < 0 ? '−' : ''}${yen(Math.abs(l.unit_price * l.quantity))}`).join('／')}
          </p>
          {r.state === 'issued' && inv && (
            <p className={`text-sm ${late ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>
              {inv.invoice_no}・{inv.issue_date ? md(inv.issue_date) : ''}発行・期限 {inv.due_date ? md(inv.due_date) : ''}{late ? `（${late}日過ぎています）` : ''}
            </p>
          )}
          {r.transferName && (page === 'unpaid' || page === 'contracts') && (
            <p className="text-sm text-slate-700"><span className="text-xs bg-slate-100 px-1.5 py-0.5 mr-1">振込名義</span>{r.transferName}</p>
          )}
          {r.state === 'paid' && inv && <p className="text-sm text-emerald-700">{inv.paid_at ? md(inv.paid_at.slice(0, 10)) : ''}に{inv.paid_method === 'cash' ? '現金' : '振込'}で入金</p>}
        </div>
        <p className="w-28 text-right font-black text-xl">{r.state === 'none' ? '—' : `¥${yen(r.total)}`}</p>
        <span className={`w-24 text-center text-sm font-bold py-1 ${STATE_BADGE[r.state]}`}>{STATE_LABEL[r.state]}</span>
        <div className="flex gap-2">
          {page === 'contracts'
            ? <button type="button" className={r.state === 'none' ? btnPink : btnGray} onClick={() => setOpenSalon(r.salonId)}>{r.state === 'none' ? '料金を入れる' : '料金を見る・変える'}</button>
            : <>
              {r.state === 'ready' && <button type="button" className={btnGray} onClick={() => setOpenSalon(r.salonId)}>中身を確かめる</button>}
              {r.state === 'issued' && <>
                <button type="button" className={btnGreen} disabled={busy} onClick={() => quickPaid(r)}>入金済みにする</button>
                <button type="button" className={btnGray} onClick={() => setOpenSalon(r.salonId)}>請求書を見る</button>
              </>}
              {r.state === 'paid' && <button type="button" className={btnGray} onClick={() => setOpenSalon(r.salonId)}>請求書を見る</button>}
            </>}
        </div>
      </div>
    );
  };

  const listBox = (list: Row[], empty: string) => (
    <div className="mt-2 bg-white border border-slate-200 divide-y divide-slate-100">
      {list.length === 0 && <p className="p-5 text-slate-500 text-[15px]">{empty}</p>}
      {list.map(salonRow)}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <h1 className="text-lg font-black">請求書</h1>
          <span className="text-sm text-slate-500 hidden sm:inline">フクエス 店舗様へのご請求</span>
          <Link href="/admin" className="ml-auto text-sm text-slate-500 hover:text-pink-600">管理画面へ戻る</Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-5 md:flex md:gap-5 md:items-start">
        {/* ── 左のサイドバー（スマホでは上に横並び） ── */}
        <nav className="md:w-60 md:shrink-0 md:sticky md:top-[61px] mb-4 md:mb-0">
          <div className="bg-white border border-slate-200 flex md:flex-col overflow-x-auto md:overflow-visible">
            {nav.map((n) => (
              <button key={n.key} type="button" onClick={() => changePage(n.key)} aria-current={page === n.key ? 'page' : undefined}
                className={`shrink-0 text-left px-4 py-3 md:border-b border-slate-100 border-r md:border-r-0 last:border-r-0 md:last:border-b-0 transition flex items-center gap-3 ${
                  page === n.key ? 'bg-pink-50 border-l-4 border-l-pink-600 md:pl-3' : 'hover:bg-slate-50 md:border-l-4 md:border-l-transparent md:pl-3'
                }`}>
                <span className="min-w-0">
                  <span className={`block font-bold text-[15px] ${page === n.key ? 'text-pink-700' : ''}`}>{n.label}</span>
                  {n.sub && <span className="block text-xs text-slate-500 truncate">{n.sub}</span>}
                </span>
                {n.count !== undefined && data && (
                  <span className={`ml-auto shrink-0 text-white text-sm font-bold min-w-[28px] text-center px-2 py-0.5 rounded-full ${n.count ? n.tone : 'bg-slate-300'}`}>{n.count}</span>
                )}
              </button>
            ))}
          </div>
        </nav>

        {/* ── 右のページ ── */}
        <main className="flex-1 min-w-0">
          {setupMissing && page !== 'settings' && (
            <div className="mb-4 bg-amber-50 border-2 border-amber-400 px-4 py-3 flex flex-wrap items-center gap-3">
              <p className="text-[15px]"><b>はじめに：</b>請求書に印字する <b>屋号・振込先</b> がまだ入っていません。先に設定してください。</p>
              <button type="button" className={`${btnPink} ml-auto`} onClick={() => changePage('settings')}>⚙ 設定を開く</button>
            </div>
          )}

          {showMonth && (
            <div className="bg-white border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-3">
              <button type="button" className={btnGray} onClick={() => changeMonth(addMonths(month, -1))}>← 前の月</button>
              <div className="flex-1 min-w-[240px] text-center">
                <p className="text-xl font-black">{monthLabel(month)}の請求書</p>
                <p className="text-sm text-slate-600">
                  <b>{md(issueDay)}に発行</b>・お支払い期限 <b>{dueDay ? md(dueDay) : '—'}</b>
                  {month === thisMonth
                    ? <span className="ml-2 inline-block bg-pink-600 text-white text-xs font-bold px-2 py-0.5 align-middle">今日発行する分</span>
                    : <button type="button" className="ml-2 text-xs font-bold text-pink-600 underline" onClick={() => changeMonth(thisMonth)}>今日発行する分（{monthLabel(thisMonth)}）に戻る</button>}
                </p>
              </div>
              <button type="button" className={btnGray} onClick={() => changeMonth(addMonths(month, 1))}>次の月 →</button>
            </div>
          )}

          {msg && <p className={`mt-3 text-[15px] font-bold ${msg.startsWith('×') ? 'text-rose-600' : 'text-emerald-700'}`}>{msg}</p>}
          {err && <p className="mt-3 text-rose-600">読み込めませんでした：{err}</p>}
          {!data ? <p className="mt-6 text-slate-500">読み込み中…</p> : (
            <>
              {/* ① 発行する */}
              {page === 'issue' && (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <div>
                      <h2 className="font-black text-lg">① 発行する</h2>
                      <p className="text-sm text-slate-500">まだ発行していない {ready.length}店・合計 ¥{yen(sumOf(ready))}。「中身を確かめる」で金額を見て、チェックして下のボタンで発行します。</p>
                    </div>
                    {ready.length > 0 && (
                      <label className="text-sm flex items-center gap-1.5 ml-auto font-bold cursor-pointer">
                        <input type="checkbox" className="w-5 h-5" checked={checkedReady.length === ready.length}
                          onChange={(e) => setChecked(e.target.checked ? new Set(ready.map((r) => r.salonId)) : new Set())} />
                        全部の店にチェック
                      </label>
                    )}
                  </div>
                  {listBox(ready, rows.some((r) => r.state !== 'none') ? 'この月に発行する店は、もうありません（全部発行済みです）。' : 'この月に請求する店はまだありません。左の「契約」から料金を入れてください。')}
                  {ready.length > 0 && (
                    <div className="sticky bottom-0 mt-4 bg-white border-2 border-pink-300 px-4 py-3 flex flex-wrap items-center gap-3 shadow-lg">
                      <div>
                        <p className="text-[15px]">チェックした店：<b className="text-lg">{checkedReady.length}店</b>　合計 <b className="text-lg">¥{yen(sumOf(checkedReady))}</b></p>
                        <p className="text-xs text-slate-500">発行すると店舗様のマイページに出て、お知らせのメールが届きます。発行前に金額を確かめてください。</p>
                      </div>
                      <button type="button" className={`${btnPink} ml-auto text-base px-6 py-3`} disabled={busy || checkedReady.length === 0} onClick={() => issue(checkedReady)}>
                        {checkedReady.length === 0 ? '店にチェックを入れてください' : `チェックした${checkedReady.length}店に発行する`}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* ② 入金待ち */}
              {page === 'unpaid' && (
                <>
                  <div className="mt-4">
                    <h2 className="font-black text-lg">② 入金待ち</h2>
                    <p className="text-sm text-slate-500">発行済みで、まだ入金のない {issued.length}店・合計 ¥{yen(sumOf(issued))}。振込を確かめたら「入金済みにする」。{lateCount > 0 && <b className="text-rose-600">期限を過ぎた店が {lateCount}店あります。</b>}</p>
                  </div>
                  {listBox([...issued].sort((a, b) => (a.invoice?.due_date ?? '').localeCompare(b.invoice?.due_date ?? '')), '入金待ちの店はありません。')}
                </>
              )}

              {/* ③ 入金済み */}
              {page === 'paid' && (
                <>
                  <div className="mt-4">
                    <h2 className="font-black text-lg">③ 入金済み</h2>
                    <p className="text-sm text-slate-500">{monthLabel(month)}で入金が済んだ {paid.length}店・合計 ¥{yen(sumOf(paid))}。間違えたときは「請求書を見る」から入金待ちに戻せます。</p>
                  </div>
                  {listBox(paid, 'この月に入金済みの店はまだありません。')}
                </>
              )}

              {/* 契約 */}
              {page === 'contracts' && (
                <>
                  <div className="mt-4">
                    <h2 className="font-black text-lg">契約（店ごとの料金）</h2>
                    <p className="text-sm text-slate-500">全部の店があいうえお順で並びます（非表示の店は下）。新しい店は「料金を入れる」、すでにある店は「料金を見る・変える」。ここで入れた料金が、翌月から自動で「① 発行する」に並びます。</p>
                  </div>
                  {listBox(rows, '店がありません。')}
                </>
              )}

              {/* ⚙ 設定 */}
              {page === 'settings' && (
                <div className="mt-4">
                  <h2 className="font-black text-lg">⚙ 設定</h2>
                  <p className="text-sm text-slate-500 mb-3">請求書に印字する発行者（屋号・住所・振込先）と、料金を入れるときの品目の一覧。</p>
                  <SettingsBody key={String(data.settings.issuer_name) + data.items.length} data={data} busy={busy} run={run} />
                </div>
              )}

              {/* ？ 使い方 */}
              {page === 'help' && (
                <div className="mt-4 bg-white border border-slate-200 p-5 text-[15px] space-y-4 max-w-3xl">
                  <h2 className="font-black text-lg">？ 使い方</h2>
                  <div>
                    <p className="font-bold">毎月1日ごろにすること</p>
                    <ol className="list-decimal ml-5 mt-1 space-y-1">
                      <li>左の <b>「① 発行する」</b> を開く。今日発行する分（来月分）の店が並んでいます。</li>
                      <li>店の「中身を確かめる」で金額と請求先を見る。直すところがあれば、その枠の中で料金や割引を足せます。</li>
                      <li>店にチェックして、下の <b>「チェックした店に発行する」</b>。店舗様のマイページに請求書が出て、お知らせのメールが届きます。</li>
                    </ol>
                  </div>
                  <div>
                    <p className="font-bold">振込があったら</p>
                    <ol className="list-decimal ml-5 mt-1 space-y-1">
                      <li>左の <b>「② 入金待ち」</b> を開く。期限を過ぎた店は赤く出ます。</li>
                      <li>通帳と照らして <b>「入金済みにする」</b>。日付は今日、方法は契約どおり（振込／現金）で入ります。別の日なら「請求書を見る」から入れてください。</li>
                    </ol>
                  </div>
                  <div>
                    <p className="font-bold">新しい店と契約したら</p>
                    <ol className="list-decimal ml-5 mt-1 space-y-1">
                      <li>左の <b>「契約」</b> でその店の「料金を入れる」。品目を選ぶと金額が入ります。</li>
                      <li>「いつまで？」は普通「ずっと」。キャンペーンなら「◯月分まで」や「この月だけ」。割引はマイナスで入ります。</li>
                      <li>宛名やメールを変えたいときは、同じ枠の「③ 請求先・支払い方法」。</li>
                    </ol>
                  </div>
                  <div className="border-t border-slate-100 pt-3 text-sm text-slate-600 space-y-1">
                    <p>★ 料金は<b>前の月に前払い</b>です。「11月分」は 10月1日に発行し、お支払い期限は 10月25日。</p>
                    <p>★ 金額をまちがえて発行したら、その店の「請求書を見る」→「取り消して作り直す」。取り消した請求書は店舗様に「取り消し」と出ます。</p>
                    <p>★ 請求書の PDF はサーバーでは作りません。店舗様も運営も、請求書の画面から「印刷・PDFで保存」です。</p>
                    <p>★ 屋号・住所・振込先を変えるときは「⚙ 設定」。発行済みの請求書は発行したときの内容のまま残ります。</p>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {data && openSalon !== null && (
        <SalonPanel key={`${openSalon}-${month}`} data={data} month={month} row={rows.find((r) => r.salonId === openSalon)!}
          busy={busy} run={run} onClose={() => setOpenSalon(null)} />
      )}
    </div>
  );
}

// ── 右から出る枠 ─────────────────────────────────────────
// ★ 第828便: left を渡すと、PC では左から請求書の見本の画面が出て、右の枠と並ぶ（スマホでは右の枠だけ）。
function Drawer({ title, onClose, children, left, leftTitle }: {
  title: string; onClose: () => void; children: React.ReactNode; left?: React.ReactNode; leftTitle?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex">
      {left ? (
        <div className="hidden md:flex flex-1 min-w-0 flex-col bg-slate-200 h-full shadow-xl">
          <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center">
            <h2 className="text-lg font-black truncate">{leftTitle}</h2>
            <button type="button" className="ml-auto text-sm text-slate-500 underline" onClick={onClose}>閉じる</button>
          </div>
          <div className="flex-1 overflow-auto p-4">{left}</div>
        </div>
      ) : (
        <button type="button" aria-label="閉じる" className="flex-1 bg-black/30" onClick={onClose} />
      )}
      <div className={`w-full ${left ? 'max-w-2xl' : 'max-w-3xl'} bg-slate-50 h-full overflow-y-auto shadow-xl border-l border-slate-200`}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center z-10">
          <h2 className="text-lg font-black truncate">{title}</h2>
          <button type="button" className="ml-auto text-2xl leading-none text-slate-400 hover:text-slate-700 px-2" onClick={onClose}>×</button>
        </div>
        <div className="p-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}

// ── 店の中身 ─────────────────────────────────────────────
function SalonPanel({ data, month, row, busy, run, onClose }: { data: BillingAdminData; month: string; row: Row; busy: boolean; run: RunFn; onClose: () => void }) {
  const allLines = data.lines.filter((l) => l.salon_id === row.salonId);
  const other = allLines.filter((l) => !row.lines.some((x) => x.id === l.id));
  const prof = data.profiles.find((p) => p.salon_id === row.salonId);
  const [adding, setAdding] = useState<null | 'monthly' | 'discount' | 'once'>(null);
  const locked = row.state === 'issued' || row.state === 'paid';
  const t = calcTotals(row.lines, data.settings.tax_rate_pct);
  const preview = row.invoice ?? {
    invoice_no: null, billing_month: month, status: 'draft', recipient_name: prof?.recipient_name || row.name,
    payment_method: prof?.payment_method ?? 'transfer', issue_date: null, due_date: dueDateOf(month, data.settings.due_day),
    subtotal: t.subtotal, tax_amount: t.tax, total: t.total, tax_rate_pct: data.settings.tax_rate_pct,
    lines: row.lines.map((l) => ({ label: l.label, unit_price: l.unit_price, quantity: l.quantity, amount: lineAmount(l) })),
  };
  const [paidDay, setPaidDay] = useState(jstToday);
  const [paidMethod, setPaidMethod] = useState<'transfer' | 'cash'>(row.invoice?.payment_method ?? prof?.payment_method ?? 'transfer');

  return (
    <Drawer title={`${row.name}　${monthLabel(month)}`} onClose={onClose}
      leftTitle={row.invoice ? '発行した請求書（店舗様に見えている形）' : '請求書の見本（発行するとこの形で店舗様に届きます）'}
      left={<InvoiceSheet invoice={preview} issuer={data.settings} />}>
      {/* いまの状態と、次にすること */}
      <section className={`border-2 p-4 flex flex-wrap items-center gap-3 ${
        row.state === 'none' ? 'bg-white border-slate-300' : row.state === 'ready' ? 'bg-pink-50/40 border-pink-300' : row.state === 'issued' ? 'bg-amber-50/60 border-amber-300' : 'bg-emerald-50/60 border-emerald-300'
      }`}>
        {row.state === 'none' && <p className="text-[15px]"><b>この店は {monthLabel(month)} の料金がまだありません。</b><br /><span className="text-sm text-slate-600">下の「① この月の料金」で「＋ 毎月の料金を追加」を押して入れると、一覧の「これから発行」に並びます。</span></p>}
        {row.state === 'ready' && (
          <>
            <p className="text-[15px]"><b>まだ発行していません。</b>合計 <b className="text-xl">¥{yen(t.total)}</b><br /><span className="text-sm text-slate-600">左の見本と、下の料金・請求先を確かめてから、右のボタンで発行できます（一覧でまとめて発行しても同じです）。</span></p>
            <button type="button" className={`${btnPink} ml-auto`} disabled={busy} onClick={() => {
              if (!confirm(`${row.name} に ${monthLabel(month)} の請求書（¥${yen(t.total)}）を発行します。よろしいですか？`)) return;
              void run(() => issueForSalons(month, [row.salonId]));
            }}>この店だけ発行する</button>
          </>
        )}
        {row.state === 'issued' && row.invoice && (
          <>
            <p className="text-[15px]">発行済み（{row.invoice.invoice_no}・{row.invoice.issue_date ? dateLabel(row.invoice.issue_date) : ''}）・<b className="text-amber-700">入金待ち</b></p>
            <div className="w-full flex flex-wrap items-end gap-2">
              <label className="text-sm">入金日<input type="date" className={input} value={paidDay} onChange={(e) => setPaidDay(e.target.value)} /></label>
              <label className="text-sm">方法
                <select className={input} value={paidMethod} onChange={(e) => setPaidMethod(e.target.value as 'transfer' | 'cash')}><option value="transfer">振込</option><option value="cash">現金</option></select>
              </label>
              <button type="button" className={btnPink} disabled={busy} onClick={() => run(() => markPaid(row.invoice!.id, paidMethod, paidDay), '入金済みにしました')}>入金済みにする</button>
            </div>
          </>
        )}
        {row.state === 'paid' && row.invoice && (
          <>
            <p className="text-[15px]"><b className="text-emerald-700">入金済み</b>（{row.invoice.paid_at?.slice(0, 10)}・{row.invoice.paid_method === 'cash' ? '現金' : '振込'}）</p>
            <button type="button" className={`${btnGray} ml-auto`} disabled={busy} onClick={() => run(() => unmarkPaid(row.invoice!.id), '入金待ちに戻しました')}>入金待ちに戻す</button>
          </>
        )}
        {locked && (
          <button type="button" className="w-full text-left text-sm text-rose-600 underline" disabled={busy} onClick={() => {
            if (!confirm('この請求書を取り消します。店舗様の一覧には「取り消し」と出ます。\n料金を直してから、もう一度発行できます。よろしいですか？')) return;
            void run(() => voidInvoice(row.invoice!.id), '取り消しました。料金を直して、もう一度発行できます');
          }}>金額をまちがえた → 取り消して作り直す</button>
        )}
      </section>

      {/* ① この月の料金 */}
      <section className="bg-white border border-slate-200 p-4">
        <h3 className="font-bold mb-2">① この月の料金（税抜）{locked && <span className="text-sm font-normal text-slate-500">（発行済みなので、ここを変えても今の請求書は変わりません）</span>}</h3>
        {row.lines.length === 0 ? <p className="text-slate-500 text-[15px]">まだありません。</p> : (
          <ul className="divide-y divide-slate-100">
            {row.lines.map((l) => <LineItem key={l.id} l={l} busy={busy} run={run} />)}
          </ul>
        )}
        {!adding ? (
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" className={btnGray} onClick={() => setAdding('monthly')}>＋ 毎月の料金を追加</button>
            <button type="button" className={btnGray} onClick={() => setAdding('discount')}>＋ 割引を追加</button>
            <button type="button" className={btnGray} onClick={() => setAdding('once')}>＋ この月だけの料金を追加</button>
          </div>
        ) : (
          <AddForm mode={adding} month={month} salonId={row.salonId} data={data} busy={busy} run={run} onDone={() => setAdding(null)} />
        )}
        {other.length > 0 && (
          <details className="mt-4">
            <summary className="text-sm text-slate-500 cursor-pointer">ほかの月だけの料金・終わった料金（{other.length}件）</summary>
            <ul className="divide-y divide-slate-100 mt-1 opacity-70">{other.map((l) => <LineItem key={l.id} l={l} busy={busy} run={run} />)}</ul>
          </details>
        )}
      </section>

      {/* ② 請求書の見本（★ PC では左の画面に出る・ここはスマホだけ） */}
      <section className="md:hidden">
        <h3 className="font-bold mb-2">② {row.invoice ? '発行した請求書（店舗様に見えている形）' : '請求書の見本（発行するとこの形で店舗様に届きます）'}</h3>
        <div className="overflow-x-auto bg-slate-200 p-3">
          <InvoiceSheet invoice={preview} issuer={data.settings} />
        </div>
      </section>

      {/* 請求先 */}
      <ProfileForm salonId={row.salonId} salonName={row.name} data={data} busy={busy} run={run} />
    </Drawer>
  );
}

function LineItem({ l, busy, run }: { l: ContractLineRow; busy: boolean; run: RunFn }) {
  const discount = l.unit_price < 0;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
      <span className={`text-xs font-bold px-1.5 py-0.5 ${discount ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>{discount ? '割引' : '料金'}</span>
      <span className="font-bold">{l.label}{l.quantity > 1 ? ` ×${l.quantity}` : ''}</span>
      <span className="text-sm text-slate-500">{periodText(l)}</span>
      <span className={`ml-auto font-bold ${discount ? 'text-rose-600' : ''}`}>{discount ? '−' : ''}{yen(Math.abs(l.unit_price * l.quantity))}円</span>
      <button type="button" className="text-sm text-slate-400 hover:text-rose-600" disabled={busy}
        onClick={() => { if (confirm(`「${l.label}」（${periodText(l)}）を消しますか？\n発行済みの請求書は変わりません。`)) void run(() => deleteContractLine(l.id), '消しました'); }}>消す</button>
    </li>
  );
}

// ── 料金・割引の追加（期間は3択）─────────────────────────
function AddForm({ mode, month, salonId, data, busy, run, onDone }: {
  mode: 'monthly' | 'discount' | 'once'; month: string; salonId: number; data: BillingAdminData; busy: boolean; run: RunFn; onDone: () => void;
}) {
  const items = data.items.filter((i) => i.is_active && i.unit_price >= 0);
  const [itemId, setItemId] = useState<number | ''>(mode === 'discount' ? '' : (items[0]?.id ?? ''));
  const [label, setLabel] = useState(mode === 'discount' ? '割引' : (items[0]?.name ?? ''));
  const [amount, setAmount] = useState(mode === 'discount' ? '' : String(items[0]?.unit_price ?? ''));
  const [period, setPeriod] = useState<'forever' | 'until' | 'once'>(mode === 'once' ? 'once' : 'forever');
  const [until, setUntil] = useState(addMonths(month, 2));
  const n = Number(toHalf(amount));
  const bad = !label.trim() || !amount || !Number.isInteger(n) || n <= 0;
  const title = mode === 'monthly' ? '毎月の料金を追加' : mode === 'discount' ? '割引を追加' : 'この月だけの料金を追加';
  const untilOpts = Array.from({ length: 24 }, (_, i) => addMonths(month, i));
  return (
    <div className="mt-3 border-2 border-pink-200 bg-pink-50/40 p-3 space-y-3">
      <p className="font-bold">{title}</p>
      {mode !== 'discount' && (
        <label className="block text-sm">品目
          <select className={input} value={itemId} onChange={(e) => {
            const it = items.find((x) => x.id === Number(e.target.value));
            setItemId(it ? it.id : ''); if (it) { setLabel(it.name); setAmount(String(it.unit_price)); } else { setLabel(''); setAmount(''); }
          }}>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}（{yen(i.unit_price)}円）</option>)}
            <option value="">その他（自由に入力）</option>
          </select>
        </label>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block text-sm">請求書に出る名前<input className={input} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <label className="block text-sm">{mode === 'discount' ? '引く金額（税抜・円）' : '金額（税抜・円）'}
          <input className={`${input} text-right`} inputMode="numeric" placeholder={mode === 'discount' ? '例）10000' : ''} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
      </div>
      {mode !== 'once' && (
        <fieldset className="text-[15px] space-y-1.5">
          <legend className="text-sm mb-1">いつまで？（{shortMonth(month)}分から）</legend>
          <label className="flex items-center gap-2"><input type="radio" checked={period === 'forever'} onChange={() => setPeriod('forever')} />ずっと（やめるまで毎月）</label>
          <label className="flex items-center gap-2 flex-wrap"><input type="radio" checked={period === 'until'} onChange={() => setPeriod('until')} />
            <select className="border border-slate-300 px-2 py-1" value={until} onChange={(e) => { setUntil(e.target.value); setPeriod('until'); }}>
              {untilOpts.map((m) => <option key={m} value={m}>{shortMonth(m)}分</option>)}
            </select>まで
          </label>
          <label className="flex items-center gap-2"><input type="radio" checked={period === 'once'} onChange={() => setPeriod('once')} />{shortMonth(month)}分だけ</label>
        </fieldset>
      )}
      <p className="text-sm">
        → 請求書に <b className={mode === 'discount' ? 'text-rose-600' : ''}>{label || '（名前）'} {mode === 'discount' ? '−' : ''}{bad ? '—' : yen(n)}円</b> が
        {period === 'forever' ? `${shortMonth(month)}分から毎月` : period === 'until' ? `${shortMonth(month)}分〜${shortMonth(until)}分` : `${shortMonth(month)}分だけ`} 入ります
      </p>
      <div className="flex gap-2">
        <button type="button" className={btnPink} disabled={busy || bad} onClick={() => run(async () => {
          const r = await saveContractLine({
            salon_id: salonId, item_id: mode === 'discount' ? null : (itemId || null), label: label.trim(),
            unit_price: mode === 'discount' ? -n : n, quantity: 1, start_month: month,
            end_month: period === 'forever' ? null : period === 'once' ? month : until, sort_order: mode === 'discount' ? 90 : 10,
          });
          if (r.ok) onDone(); return r;
        }, '追加しました')}>追加する</button>
        <button type="button" className={btnGray} onClick={onDone}>やめる</button>
      </div>
    </div>
  );
}

// ── 請求先 ───────────────────────────────────────────────
function ProfileForm({ salonId, salonName, data, busy, run }: { salonId: number; salonName: string; data: BillingAdminData; busy: boolean; run: RunFn }) {
  const prof = data.profiles.find((p) => p.salon_id === salonId);
  const [recipient, setRecipient] = useState(prof?.recipient_name ?? '');
  const [email, setEmail] = useState(prof?.billing_email ?? '');
  const [pay, setPay] = useState<'transfer' | 'cash'>(prof?.payment_method ?? 'transfer');
  const [memo, setMemo] = useState(prof?.memo ?? '');
  const [transferName, setTransferName] = useState(prof?.transfer_name ?? '');
  return (
    <details className="bg-white border border-slate-200 p-4">
      <summary className="font-bold cursor-pointer">
        ③ 請求先・支払い方法 <span className="text-sm font-normal text-slate-500">（宛名：{prof?.recipient_name || salonName}／{(prof?.payment_method ?? 'transfer') === 'cash' ? '現金' : '振込'}／メール：{prof?.billing_email || 'オーナーのログインメール'}{prof?.transfer_name ? `／振込名義：${prof.transfer_name}` : ''}）</span>
        <span className="block text-xs font-normal text-slate-500 mt-0.5">押すと開きます。宛名を変えたいとき・メールを別の宛先にしたいとき・現金の店のとき・振込名義をメモしたいとき。</span>
      </summary>
      <div className="grid sm:grid-cols-2 gap-3 mt-3">
        <label className="text-sm">宛名<input className={input} placeholder={salonName} value={recipient} onChange={(e) => setRecipient(e.target.value)} /></label>
        <label className="text-sm">請求書のお知らせメール<input className={input} placeholder="空欄ならオーナーのログインメール" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="text-sm">支払い方法
          <select className={input} value={pay} onChange={(e) => setPay(e.target.value as 'transfer' | 'cash')}><option value="transfer">振込</option><option value="cash">現金</option></select>
        </label>
        <label className="text-sm">振込名義（通帳に出る名前・店舗には見えません）<input className={input} placeholder="例）カ）ラビリンス／ヤマダ タロウ" value={transferName} onChange={(e) => setTransferName(e.target.value)} /></label>
        <label className="text-sm">契約時のメモ（店舗には見えません）<input className={input} value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
      </div>
      <button type="button" className={`${btnPink} mt-3`} disabled={busy} onClick={() => run(() => saveSalonProfile({ salon_id: salonId, recipient_name: recipient, billing_email: email, payment_method: pay, memo, transfer_name: transferName }))}>保存する</button>
    </details>
  );
}

// ── ⚙ 設定（発行者・品目）★ 第827便からページに直接 ─────────
function SettingsBody({ data, busy, run }: { data: BillingAdminData; busy: boolean; run: RunFn }) {
  const [s, setS] = useState<BillingSettings & { registration_no: string }>({ ...data.settings, registration_no: data.settings.registration_no ?? '' });
  const f = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS({ ...s, [k]: e.target.value });
  const [rows, setRows] = useState(data.items.map((i) => ({ ...i, price: String(i.unit_price) })));
  const [nw, setNw] = useState({ name: '', price: '' });
  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 p-4 space-y-3">
        <h3 className="font-bold">品目（料金を追加するときの一覧）</h3>
        <p className="text-sm text-slate-500">金額は税抜。ここを変えても、もう入れた料金や発行済みの請求書は変わりません。</p>
        {rows.map((r, i) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2">
            <input className={`${input} flex-1 min-w-[180px]`} value={r.name} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
            <input className={`${input} w-32 text-right`} inputMode="numeric" value={r.price} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} />
            <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={r.is_active} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, is_active: e.target.checked } : x))} />使う</label>
            <button type="button" className={btnGray} disabled={busy} onClick={() => run(() => saveBillingItem({ id: r.id, name: r.name, unit_price: Number(toHalf(r.price)), is_active: r.is_active, sort_order: r.sort_order }))}>保存</button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <input className={`${input} flex-1 min-w-[180px]`} placeholder="新しい品目（例：オプションバナー）" value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} />
          <input className={`${input} w-32 text-right`} inputMode="numeric" placeholder="金額" value={nw.price} onChange={(e) => setNw({ ...nw, price: e.target.value })} />
          <button type="button" className={btnPink} disabled={busy || !nw.name.trim() || !nw.price} onClick={() => run(async () => {
            const r = await saveBillingItem({ name: nw.name, unit_price: Number(toHalf(nw.price)), is_active: true, sort_order: (rows.length + 1) * 10 });
            if (r.ok) setNw({ name: '', price: '' }); return r;
          }, '品目を足しました')}>足す</button>
        </div>
      </section>

      <section className="bg-white border border-slate-200 p-4 space-y-3">
        <h3 className="font-bold">発行者（請求書の右上と振込先）</h3>
        <p className="text-sm text-slate-500">発行した請求書には、発行したときの内容がそのまま残ります。</p>
        <label className="block text-sm">屋号・発行者名<input className={input} value={s.issuer_name} onChange={f('issuer_name')} /></label>
        <label className="block text-sm">住所<textarea className={input} rows={2} value={s.issuer_address} onChange={f('issuer_address')} /></label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">電話<input className={input} value={s.issuer_tel} onChange={f('issuer_tel')} /></label>
          <label className="text-sm">メール<input className={input} value={s.issuer_email} onChange={f('issuer_email')} /></label>
        </div>
        <label className="block text-sm">振込先（銀行・支店・種別・口座番号・名義）<textarea className={input} rows={4} value={s.bank_info} onChange={f('bank_info')} /></label>
        <label className="block text-sm">請求書の下の一言（例：振込手数料はご負担ください）<textarea className={input} rows={2} value={s.note} onChange={f('note')} /></label>
        <details>
          <summary className="text-sm text-slate-500 cursor-pointer">あまり変えないもの（登録番号・税率・期限日）</summary>
          <div className="grid sm:grid-cols-3 gap-3 mt-2">
            <label className="text-sm">登録番号（2027年9月から）<input className={input} placeholder="T＋13桁" value={s.registration_no} onChange={f('registration_no')} /></label>
            <label className="text-sm">税率（%）<input className={input} inputMode="numeric" value={String(s.tax_rate_pct)} onChange={(e) => setS({ ...s, tax_rate_pct: Number(toHalf(e.target.value)) || 0 })} /></label>
            <label className="text-sm">期限（発行した月の◯日）<input className={input} inputMode="numeric" value={String(s.due_day)} onChange={(e) => setS({ ...s, due_day: Number(toHalf(e.target.value)) || 0 })} /></label>
          </div>
        </details>
        <button type="button" className={btnPink} disabled={busy} onClick={() => run(() => saveBillingSettings({ ...s, registration_no: s.registration_no || null }))}>保存する</button>
      </section>
    </div>
  );
}
