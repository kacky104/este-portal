'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getBillingAdmin, saveBillingSettings, saveBillingItem, saveSalonProfile, saveContractLine, deleteContractLine,
  issueForSalons, markPaid, unmarkPaid, voidInvoice,
  type BillingAdminData, type BillingSettings, type ContractLineRow, type InvoiceRow,
} from '@/app/actions/billingAdmin';
import { InvoiceSheet } from '@/app/components/billing/InvoiceSheet';
import { addMonths, calcTotals, dateLabel, dueDateOf, issueMonthOf, lineAmount, linesForMonth, monthLabel, yen } from '@/lib/billing';

// 管理画面「請求書」（第825便・2026-09-25・カッキーさんの指示で作り直し）。
// ★★ 1枚の表で完結させる。★ 開くと【今月発行する分】が店ごとに1行で並ぶ（契約から自動）。
//   ・「中身を見る」→ その店の請求書の見本・毎月の料金・割引・今月だけの追加・請求先が1か所に
//   ・チェックした店にまとめて発行（発行の直前に契約から作り直す＝下書きを手で直す場面をなくした）
//   ・発行者の設定と品目は右上の「⚙ 設定」
// ★ 前月に前払い: 「11月分」は 10月1日に発行・10月25日期限（src/lib/billing.ts）。

const input = 'border border-slate-300 px-2.5 py-2 text-[15px] w-full bg-white';
const btn = 'text-[15px] font-bold px-4 py-2 border disabled:opacity-40';
const btnPink = `${btn} bg-pink-600 text-white border-pink-600 hover:bg-pink-700`;
const btnGray = `${btn} bg-white text-slate-700 border-slate-300 hover:border-pink-400`;

type RunFn = (fn: () => Promise<{ ok: boolean; error?: string; mail?: string }>, okMsg?: string) => Promise<boolean>;

function jstToday(): string { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
function shortMonth(m: string): string { return `${Number(m.slice(0, 4))}年${Number(m.slice(5, 7))}月`; }
function toHalf(v: string): string {
  return v.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[－ー−‐]/g, '-').replace(/[,，\s円¥￥]/g, '');
}
function periodText(l: ContractLineRow): string {
  if (l.end_month === l.start_month) return `${shortMonth(l.start_month)}分だけ`;
  if (!l.end_month) return `${shortMonth(l.start_month)}分から毎月`;
  return `${shortMonth(l.start_month)}分〜${shortMonth(l.end_month)}分`;
}

type Row = {
  salonId: number; name: string; hidden: boolean;
  lines: ContractLineRow[];           // この月に入る契約の行
  invoice: InvoiceRow | null;         // この月の請求書（取り消し以外）
  voided: number;                     // 取り消した数
  total: number;
  state: 'none' | 'ready' | 'issued' | 'paid';
};

export function BillingAdmin({ initialMonth }: { initialMonth: string }) {
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<BillingAdminData | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [openSalon, setOpenSalon] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    const tax = data.settings.tax_rate_pct;
    return data.salons.map((s) => {
      const lines = linesForMonth(data.lines.filter((l) => l.salon_id === s.id), month);
      const invs = data.invoices.filter((i) => i.salon_id === s.id);
      const live = invs.find((i) => i.status === 'issued' || i.status === 'paid') ?? null;
      const state: Row['state'] = live ? (live.status === 'paid' ? 'paid' : 'issued') : lines.length ? 'ready' : 'none';
      return {
        salonId: s.id, name: s.name, hidden: !!s.is_hidden, lines, invoice: live,
        voided: invs.filter((i) => i.status === 'void').length,
        total: live ? live.total : calcTotals(lines, tax).total, state,
      };
    });
  }, [data, month]);

  const shown = rows.filter((r) => showAll || r.state !== 'none');
  const ready = rows.filter((r) => r.state === 'ready');
  const sum = (st: Row['state']) => rows.filter((r) => r.state === st).reduce((a, r) => a + r.total, 0);
  const checkedReady = ready.filter((r) => checked.has(r.salonId));
  const issueDay = `${issueMonthOf(month).slice(0, 7)}-01`;

  const changeMonth = (m: string) => { setMonth(m); setChecked(new Set()); setMsg(''); };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
          <h1 className="text-lg font-black">請求書</h1>
          <button type="button" onClick={() => setSettingsOpen(true)} className="ml-auto text-sm font-bold text-slate-600 border border-slate-300 px-3 py-1.5 hover:border-pink-400">⚙ 設定（発行者・品目）</button>
          <Link href="/admin" className="text-sm text-slate-500 hover:text-pink-600">管理画面へ戻る</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5">
        {/* ── いつ発行する分か ── */}
        <div className="bg-white border border-slate-200 px-4 py-4 flex flex-wrap items-center gap-3">
          <button type="button" className={btnGray} onClick={() => changeMonth(addMonths(month, -1))}>← 前の月</button>
          <div className="flex-1 min-w-[220px] text-center">
            <p className="text-xl font-black">{dateLabel(issueDay).replace(/^\d+年/, '')}に発行する請求書</p>
            <p className="text-sm text-slate-500">{monthLabel(month)}（{dateLabel(month).replace(/^\d+年/, '')}〜）のご利用料金・お支払い期限 {data ? dateLabel(dueDateOf(month, data.settings.due_day)).replace(/^\d+年/, '') : ''}</p>
          </div>
          <button type="button" className={btnGray} onClick={() => changeMonth(addMonths(month, 1))}>次の月 →</button>
        </div>

        {data && (
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div className="bg-white border border-slate-200 py-2"><p className="text-xs text-slate-500">まだ発行していない</p><p className="text-lg font-bold">{ready.length}店・¥{yen(sum('ready'))}</p></div>
            <div className="bg-white border border-amber-200 py-2"><p className="text-xs text-amber-700">入金待ち</p><p className="text-lg font-bold text-amber-700">¥{yen(sum('issued'))}</p></div>
            <div className="bg-white border border-emerald-200 py-2"><p className="text-xs text-emerald-700">入金済み</p><p className="text-lg font-bold text-emerald-700">¥{yen(sum('paid'))}</p></div>
          </div>
        )}

        {msg && <p className={`mt-3 text-[15px] font-bold ${msg.startsWith('×') ? 'text-rose-600' : 'text-emerald-700'}`}>{msg}</p>}
        {err && <p className="mt-3 text-rose-600">読み込めませんでした：{err}</p>}
        {!data ? <p className="mt-6 text-slate-500">読み込み中…</p> : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="text-sm flex items-center gap-1.5">
                <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                契約のない店も出す（新しく契約を入れるとき）
              </label>
              {ready.length > 0 && (
                <button type="button" className="text-sm text-pink-600 underline ml-auto"
                  onClick={() => setChecked(checked.size === ready.length ? new Set() : new Set(ready.map((r) => r.salonId)))}>
                  {checked.size === ready.length ? 'チェックを全部外す' : 'まだの店を全部チェック'}
                </button>
              )}
            </div>

            <div className="mt-2 bg-white border border-slate-200 divide-y divide-slate-100">
              {shown.length === 0 && <p className="p-5 text-slate-500">この月に請求する店はありません。「契約のない店も出す」にチェックして、店の「契約を入れる」から始めてください。</p>}
              {shown.map((r) => (
                <div key={r.salonId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <input type="checkbox" className="w-5 h-5" disabled={r.state !== 'ready'} checked={checked.has(r.salonId)}
                    onChange={(e) => { const n = new Set(checked); if (e.target.checked) n.add(r.salonId); else n.delete(r.salonId); setChecked(n); }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate">{r.name}{r.hidden && <span className="text-xs text-slate-400 font-normal">（非表示）</span>}</p>
                    <p className="text-sm text-slate-500 truncate">
                      {r.state === 'none' ? '契約なし' : (r.invoice ? r.invoice.lines : r.lines).map((l) => `${l.label} ${l.unit_price < 0 ? '−' : ''}${yen(Math.abs(l.unit_price * l.quantity))}`).join('／')}
                    </p>
                  </div>
                  <p className="w-28 text-right font-bold text-lg">{r.state === 'none' ? '—' : `¥${yen(r.total)}`}</p>
                  <span className={`w-24 text-center text-sm font-bold py-1 ${
                    r.state === 'ready' ? 'bg-slate-100 text-slate-600' : r.state === 'issued' ? 'bg-amber-100 text-amber-800' : r.state === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'text-slate-300'
                  }`}>{r.state === 'ready' ? '未発行' : r.state === 'issued' ? '入金待ち' : r.state === 'paid' ? '入金済み' : ''}</span>
                  <button type="button" className={btnGray} onClick={() => setOpenSalon(r.salonId)}>{r.state === 'none' ? '契約を入れる' : '中身を見る'}</button>
                </div>
              ))}
            </div>

            {ready.length > 0 && (
              <div className="sticky bottom-0 mt-4 bg-white border border-pink-200 px-4 py-3 flex flex-wrap items-center gap-3 shadow">
                <p className="text-[15px]">チェックした店：<b>{checkedReady.length}店</b>・合計 <b>¥{yen(checkedReady.reduce((a, r) => a + r.total, 0))}</b></p>
                <button type="button" className={`${btnPink} ml-auto`} disabled={busy || checkedReady.length === 0} onClick={() => {
                  if (!confirm(`${checkedReady.length}店に ${monthLabel(month)} の請求書を発行します。\n店舗様のマイページに出て、メールが届きます。よろしいですか？`)) return;
                  void run(async () => { const r = await issueForSalons(month, checkedReady.map((x) => x.salonId)); if (r.ok) setChecked(new Set()); return r; });
                }}>チェックした店に発行する</button>
              </div>
            )}
          </>
        )}
      </main>

      {data && openSalon !== null && (
        <SalonPanel key={`${openSalon}-${month}`} data={data} month={month} row={rows.find((r) => r.salonId === openSalon)!}
          busy={busy} run={run} onClose={() => setOpenSalon(null)} />
      )}
      {data && settingsOpen && <SettingsPanel data={data} busy={busy} run={run} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

// ── 右から出る枠 ─────────────────────────────────────────
function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <button type="button" aria-label="閉じる" className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-3xl bg-slate-50 h-full overflow-y-auto shadow-xl">
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
    <Drawer title={`${row.name}　${monthLabel(month)}`} onClose={onClose}>
      {/* 状態と操作 */}
      <section className="bg-white border border-slate-200 p-4 flex flex-wrap items-center gap-3">
        {row.state === 'none' && <p className="text-[15px]">この月の料金がまだありません。下の「毎月の料金を追加」から入れてください。</p>}
        {row.state === 'ready' && (
          <>
            <p className="text-[15px]">まだ発行していません。合計 <b className="text-lg">¥{yen(t.total)}</b></p>
            <button type="button" className={`${btnPink} ml-auto`} disabled={busy} onClick={() => {
              if (!confirm(`${row.name} に ${monthLabel(month)} の請求書（¥${yen(t.total)}）を発行します。よろしいですか？`)) return;
              void run(() => issueForSalons(month, [row.salonId]));
            }}>この店に発行する</button>
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

      {/* この月の料金 */}
      <section className="bg-white border border-slate-200 p-4">
        <h3 className="font-bold mb-2">この月の料金{locked && <span className="text-sm font-normal text-slate-500">（発行済みなので、ここを変えても今の請求書は変わりません）</span>}</h3>
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

      {/* 請求書の見本 */}
      <section>
        <h3 className="font-bold mb-2">{row.invoice ? '発行した請求書' : '請求書の見本'}</h3>
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
  return (
    <details className="bg-white border border-slate-200 p-4">
      <summary className="font-bold cursor-pointer">
        請求先・支払い方法 <span className="text-sm font-normal text-slate-500">（宛名：{prof?.recipient_name || salonName}／{(prof?.payment_method ?? 'transfer') === 'cash' ? '現金' : '振込'}／メール：{prof?.billing_email || 'オーナーのログインメール'}）</span>
      </summary>
      <div className="grid sm:grid-cols-2 gap-3 mt-3">
        <label className="text-sm">宛名<input className={input} placeholder={salonName} value={recipient} onChange={(e) => setRecipient(e.target.value)} /></label>
        <label className="text-sm">請求書のお知らせメール<input className={input} placeholder="空欄ならオーナーのログインメール" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="text-sm">支払い方法
          <select className={input} value={pay} onChange={(e) => setPay(e.target.value as 'transfer' | 'cash')}><option value="transfer">振込</option><option value="cash">現金</option></select>
        </label>
        <label className="text-sm">契約時のメモ（店舗には見えません）<input className={input} value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
      </div>
      <button type="button" className={`${btnPink} mt-3`} disabled={busy} onClick={() => run(() => saveSalonProfile({ salon_id: salonId, recipient_name: recipient, billing_email: email, payment_method: pay, memo }))}>保存する</button>
    </details>
  );
}

// ── ⚙ 設定（発行者・品目）────────────────────────────────
function SettingsPanel({ data, busy, run, onClose }: { data: BillingAdminData; busy: boolean; run: RunFn; onClose: () => void }) {
  const [s, setS] = useState<BillingSettings & { registration_no: string }>({ ...data.settings, registration_no: data.settings.registration_no ?? '' });
  const f = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS({ ...s, [k]: e.target.value });
  const [rows, setRows] = useState(data.items.map((i) => ({ ...i, price: String(i.unit_price) })));
  const [nw, setNw] = useState({ name: '', price: '' });
  return (
    <Drawer title="⚙ 設定" onClose={onClose}>
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
            if (r.ok) { setNw({ name: '', price: '' }); onClose(); } return r;
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
    </Drawer>
  );
}
