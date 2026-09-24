'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getBillingAdmin, saveBillingSettings, saveBillingItem, saveSalonProfile, saveContractLine, deleteContractLine,
  createDrafts, saveDraft, deleteDraft, issueInvoice, markPaid, unmarkPaid, voidInvoice,
  type BillingAdminData, type BillingSettings, type ContractLineRow, type InvoiceRow,
} from '@/app/actions/billingAdmin';
import { InvoiceSheet } from '@/app/components/billing/InvoiceSheet';
import { addMonths, calcTotals, dateLabel, lineAmount, monthLabel, yen } from '@/lib/billing';

// 管理画面「請求書」（第816便・2026-09-25・カッキーさん）。
// ★ タブ: 今月の請求／店舗の契約／品目／発行者の設定
// ★ 流れ: 契約 → 「下書きを作る」（毎月1日は cron でも作る）→ 下書きを確かめて「発行」→ 入金を確かめて「入金済み」

type Tab = 'invoices' | 'contracts' | 'items' | 'settings';
const input = 'border border-slate-300 px-2 py-1 text-sm w-full';
const btn = 'text-sm font-bold px-3 py-1.5 border';
const btnPink = `${btn} bg-pink-600 text-white border-pink-600 hover:bg-pink-700 disabled:opacity-50`;
const btnGray = `${btn} bg-white text-slate-700 border-slate-300 hover:border-pink-300 disabled:opacity-50`;
const STATUS: Record<string, { text: string; cls: string }> = {
  draft: { text: '下書き', cls: 'bg-slate-100 text-slate-600' },
  issued: { text: '発行済み・入金待ち', cls: 'bg-amber-100 text-amber-800' },
  paid: { text: '入金済み', cls: 'bg-emerald-100 text-emerald-800' },
  void: { text: '取り消し', cls: 'bg-slate-100 text-slate-400 line-through' },
};

// ★ 第819便: 月の選択肢は【今月を中心に固定】（前6か月〜先12か月）。★ 以前は選んだ月を中心に作り直していて、
//   前の月を選ぶたびに選択肢が過去へずれ、2022年まで行けてしまった。★ 範囲外の月を選んでいるときだけ足す
const TODAY_MONTH = (() => { const d = new Date(Date.now() + 9 * 3600e3); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`; })();
function monthOptions(selected?: string): string[] {
  const base = Array.from({ length: 19 }, (_, i) => addMonths(TODAY_MONTH, i - 6));
  if (selected && !base.includes(selected)) base.push(selected);
  return base.sort();
}

export function BillingAdmin({ initialMonth }: { initialMonth: string }) {
  const [tab, setTab] = useState<Tab>('invoices');
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<BillingAdminData | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await getBillingAdmin(month);
    if (r.ok) { setData(r.data); setErr(''); } else setErr(r.error);
  }, [month]);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, okMsg?: string) => {
    setBusy(true); setMsg('');
    try {
      const r = await fn();
      if (!r.ok) setMsg(`×　${r.error}`);
      else { setMsg(`○　${(r.mail as string | undefined) ?? okMsg ?? '保存しました'}`); await load(); }
    } finally { setBusy(false); }
  };

  const salonName = useMemo(() => new Map((data?.salons ?? []).map((s) => [s.id, s.name])), [data]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-base font-black text-slate-800">請求書</h1>
          <Link href="/admin" className="text-xs text-slate-500 hover:text-pink-600">管理者ダッシュボードへ</Link>
        </div>
      </header>
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex flex-wrap gap-1.5 mb-4">
          {([['invoices', '月の請求'], ['contracts', '店舗の契約'], ['items', '品目'], ['settings', '発行者の設定']] as [Tab, string][]).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)}
              className={`text-sm font-bold px-3 py-1.5 border ${tab === k ? 'bg-pink-600 text-white border-pink-600' : 'bg-white text-slate-600 border-slate-300'}`}>{label}</button>
          ))}
        </div>
        {msg && <p className={`text-sm mb-3 ${msg.startsWith('×') ? 'text-rose-600' : 'text-emerald-700'}`}>{msg}</p>}
        {err && <p className="text-sm text-rose-600 mb-3">読み込めませんでした：{err}</p>}
        {!data ? <p className="text-sm text-slate-500">読み込み中…</p> : (
          <>
            {tab === 'invoices' && (
              <InvoicesTab data={data} month={month} setMonth={setMonth} busy={busy} run={run} salonName={salonName} />
            )}
            {tab === 'contracts' && <ContractsTab data={data} busy={busy} run={run} />}
            {tab === 'items' && <ItemsTab key={data.items.map((i) => `${i.id}:${i.name}:${i.unit_price}:${i.is_active}:${i.sort_order}`).join('|')} data={data} busy={busy} run={run} />}
            {tab === 'settings' && <SettingsTab settings={data.settings} busy={busy} run={run} />}
          </>
        )}
      </div>
    </div>
  );
}

type RunFn = (fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, okMsg?: string) => Promise<void>;

// ── 月の請求 ───────────────────────────────────────────────
function InvoicesTab({ data, month, setMonth, busy, run, salonName }: {
  data: BillingAdminData; month: string; setMonth: (m: string) => void; busy: boolean; run: RunFn; salonName: Map<number, string>;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const sum = (s: string) => data.invoices.filter((i) => i.status === s).reduce((a, i) => a + i.total, 0);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" className={btnGray} onClick={() => setMonth(addMonths(month, -1))}>←</button>
        <select className="border border-slate-300 px-2 py-1.5 text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>
          {monthOptions(month).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <button type="button" className={btnGray} onClick={() => setMonth(addMonths(month, 1))}>→</button>
        <button type="button" className={btnPink} disabled={busy}
          onClick={() => run(async () => { const r = await createDrafts(month); return r.ok ? { ok: true, mail: `下書きを ${r.created} 通作りました（もうある店 ${r.skipped}）` } : r; })}>
          契約から下書きを作る
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-1">★ 前月に前払い：{monthLabel(month)}は {dateLabel(`${addMonths(month, -1).slice(0, 7)}-01`)} に発行・期限は同じ月の{data.settings.due_day}日</p>
      <p className="text-xs text-slate-500 mb-3">
        発行済み ¥{yen(sum('issued'))}　／　入金済み ¥{yen(sum('paid'))}　／　下書き {data.invoices.filter((i) => i.status === 'draft').length} 通
      </p>
      {data.invoices.length === 0 ? (
        <p className="text-sm text-slate-500 bg-white border border-slate-200 p-4">この月の請求書はまだありません。「店舗の契約」を入れてから「契約から下書きを作る」を押してください。</p>
      ) : (
        <ul className="space-y-2">
          {data.invoices.map((inv) => (
            <li key={inv.id} className="bg-white border border-slate-200">
              <button type="button" onClick={() => setOpen(open === inv.id ? null : inv.id)} className="w-full flex flex-wrap items-center gap-3 px-3 py-2 text-left">
                <span className="font-bold text-slate-800">{salonName.get(inv.salon_id) ?? `店舗${inv.salon_id}`}</span>
                <span className={`text-xs px-2 py-0.5 ${STATUS[inv.status].cls}`}>{STATUS[inv.status].text}</span>
                <span className="text-xs text-slate-500">{inv.invoice_no ?? ''}</span>
                {inv.payment_method === 'cash' && <span className="text-xs text-slate-500">現金</span>}
                <span className="ml-auto font-bold">¥{yen(inv.total)}</span>
              </button>
              {open === inv.id && <InvoiceDetail inv={inv} data={data} busy={busy} run={run} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InvoiceDetail({ inv, data, busy, run }: { inv: InvoiceRow; data: BillingAdminData; busy: boolean; run: RunFn }) {
  const [lines, setLines] = useState(inv.lines.map((l) => ({ label: l.label, unit_price: String(l.unit_price), quantity: String(l.quantity) })));
  const [recipient, setRecipient] = useState(inv.recipient_name);
  const [pay, setPay] = useState<'transfer' | 'cash'>(inv.payment_method);
  const [note, setNote] = useState(inv.admin_note);
  const [paidMethod, setPaidMethod] = useState<'transfer' | 'cash'>(inv.payment_method);
  const [paidDay, setPaidDay] = useState(() => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));
  const [preview, setPreview] = useState(false);
  const isDraft = inv.status === 'draft';
  const parsed = lines.map((l) => ({ label: l.label, unit_price: Number(toHalf(l.unit_price)) || 0, quantity: Number(toHalf(l.quantity)) || 1 }));
  const t = calcTotals(parsed, inv.tax_rate_pct);
  const sheetInv = isDraft
    ? { ...inv, recipient_name: recipient, payment_method: pay, subtotal: t.subtotal, tax_amount: t.tax, total: t.total,
        lines: parsed.filter((l) => l.label).map((l) => ({ ...l, amount: lineAmount(l) })) }
    : inv;
  return (
    <div className="border-t border-slate-100 px-3 py-3 space-y-3">
      {isDraft ? (
        <>
          <div className="grid sm:grid-cols-3 gap-2">
            <label className="text-xs text-slate-500">宛名<input className={input} value={recipient} onChange={(e) => setRecipient(e.target.value)} /></label>
            <label className="text-xs text-slate-500">支払い方法
              <select className={input} value={pay} onChange={(e) => setPay(e.target.value as 'transfer' | 'cash')}><option value="transfer">振込</option><option value="cash">現金</option></select>
            </label>
            <label className="text-xs text-slate-500">メモ（店舗には出ない）<input className={input} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-slate-500"><th className="text-left">品名</th><th className="w-28">単価（税抜・割引は −10000 のように）</th><th className="w-16">数量</th><th className="w-24 text-right">金額</th><th className="w-8" /></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="pr-1 py-0.5"><input className={input} value={l.label} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} /></td>
                  <td className="pr-1"><input className={`${input} text-right`} inputMode="numeric" value={l.unit_price} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unit_price: e.target.value } : x))} /></td>
                  <td className="pr-1"><input className={`${input} text-center`} inputMode="numeric" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} /></td>
                  <td className="text-right">{yen(lineAmount(parsed[i]))}</td>
                  <td className="text-center"><button type="button" className="text-rose-500 text-xs" onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" className={btnGray} onClick={() => setLines([...lines, { label: '', unit_price: '', quantity: '1' }])}>＋ 行を足す</button>
            <select className="border border-slate-300 px-2 py-1.5 text-sm" value="" onChange={(e) => {
              const it = data.items.find((x) => x.id === Number(e.target.value));
              if (it) setLines([...lines, { label: it.name, unit_price: String(it.unit_price), quantity: '1' }]);
            }}>
              <option value="">品目から足す…</option>
              {data.items.filter((x) => x.is_active).map((x) => <option key={x.id} value={x.id}>{x.name}（{yen(x.unit_price)}）</option>)}
            </select>
            <span className="ml-auto text-sm">小計 {yen(t.subtotal)}　消費税 {yen(t.tax)}　<b>合計 ¥{yen(t.total)}</b></span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnGray} disabled={busy} onClick={() => run(() => saveDraft({ id: inv.id, recipient_name: recipient, payment_method: pay, admin_note: note, lines: parsed }))}>下書きを保存</button>
            <button type="button" className={btnGray} onClick={() => setPreview(!preview)}>{preview ? '見本を閉じる' : '見本を見る'}</button>
            <button type="button" className={btnPink} disabled={busy} onClick={() => {
              if (!confirm('保存した内容で発行します。店舗様のマイページに出て、メールが届きます。よろしいですか？\n（直した内容は先に「下書きを保存」してください）')) return;
              void run(() => issueInvoice(inv.id));
            }}>発行する</button>
            <button type="button" className="text-xs text-rose-500 ml-auto" disabled={busy} onClick={() => { if (confirm('この下書きを消しますか？')) void run(() => deleteDraft(inv.id), '下書きを消しました'); }}>下書きを消す</button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">発行日 {inv.issue_date ? dateLabel(inv.issue_date) : '—'}・期限 {inv.due_date ? dateLabel(inv.due_date) : '—'}</span>
          {inv.status === 'paid' && <span className="text-emerald-700">入金 {inv.paid_at?.slice(0, 10)}（{inv.paid_method === 'cash' ? '現金' : '振込'}）</span>}
          <button type="button" className={btnGray} onClick={() => setPreview(!preview)}>{preview ? '閉じる' : '請求書を見る'}</button>
          {inv.status === 'issued' && (
            <>
              <select className="border border-slate-300 px-2 py-1.5" value={paidMethod} onChange={(e) => setPaidMethod(e.target.value as 'transfer' | 'cash')}><option value="transfer">振込</option><option value="cash">現金</option></select>
              <input type="date" className="border border-slate-300 px-2 py-1" value={paidDay} onChange={(e) => setPaidDay(e.target.value)} />
              <button type="button" className={btnPink} disabled={busy} onClick={() => run(() => markPaid(inv.id, paidMethod, paidDay), '入金済みにしました')}>入金済みにする</button>
            </>
          )}
          {inv.status === 'paid' && <button type="button" className={btnGray} disabled={busy} onClick={() => run(() => unmarkPaid(inv.id), '入金待ちに戻しました')}>入金待ちに戻す</button>}
          {inv.status !== 'void' && (
            <button type="button" className="text-xs text-rose-500 ml-auto" disabled={busy} onClick={() => {
              if (confirm('この請求書を取り消しますか？（店舗様の一覧には「取り消し」と出ます。同じ月の下書きを作り直せるようになります）')) void run(() => voidInvoice(inv.id), '取り消しました');
            }}>取り消す</button>
          )}
        </div>
      )}
      {preview && (
        <div className="overflow-x-auto bg-slate-100 p-3">
          <InvoiceSheet invoice={sheetInv} issuer={{ ...data.settings, note: data.settings.note }} />
        </div>
      )}
    </div>
  );
}

// ── 店舗の契約 ─────────────────────────────────────────────
function ContractsTab({ data, busy, run }: { data: BillingAdminData; busy: boolean; run: RunFn }) {
  const [salonId, setSalonId] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const withLines = new Set(data.lines.map((l) => l.salon_id));
  const salons = data.salons.filter((s) => !q || s.name.includes(q));
  const salon = data.salons.find((s) => s.id === salonId) ?? null;
  return (
    <div className="grid md:grid-cols-[340px_1fr] gap-4">
      <div className="bg-white border border-slate-200 p-2 max-h-[70vh] overflow-y-auto">
        <input className={`${input} mb-2`} placeholder="店舗名で探す" value={q} onChange={(e) => setQ(e.target.value)} />
        {salons.map((s) => (
          <button key={s.id} type="button" onClick={() => setSalonId(s.id)}
            title={s.name}
            className={`block w-full text-left text-[13px] px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis ${salonId === s.id ? 'bg-pink-50 text-pink-700 font-bold' : 'text-slate-700'}`}>
            {withLines.has(s.id) ? '● ' : '　'}{s.name}{s.is_hidden ? '（非表示）' : ''}
          </button>
        ))}
      </div>
      <div>
        {!salon ? <p className="text-sm text-slate-500">左から店舗を選んでください（● は契約の行がある店）。</p> : (
          <SalonContract key={salon.id} salonId={salon.id} salonName={salon.name} data={data} busy={busy} run={run} />
        )}
      </div>
    </div>
  );
}

function SalonContract({ salonId, salonName, data, busy, run }: { salonId: number; salonName: string; data: BillingAdminData; busy: boolean; run: RunFn }) {
  const prof = data.profiles.find((p) => p.salon_id === salonId);
  const [recipient, setRecipient] = useState(prof?.recipient_name ?? '');
  const [email, setEmail] = useState(prof?.billing_email ?? '');
  const [pay, setPay] = useState<'transfer' | 'cash'>(prof?.payment_method ?? 'transfer');
  const [memo, setMemo] = useState(prof?.memo ?? '');
  const lines = data.lines.filter((l) => l.salon_id === salonId);
  const [editing, setEditing] = useState<Partial<ContractLineRow> | null>(null);
  const thisMonth = data.month;
  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 p-3 space-y-2">
        <p className="font-bold text-slate-800">{salonName}　の請求先</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="text-xs text-slate-500">宛名（空欄なら店舗名「{salonName}」）<input className={input} value={recipient} onChange={(e) => setRecipient(e.target.value)} /></label>
          <label className="text-xs text-slate-500">請求書メールの送り先（空欄ならオーナーのログインメール）<input className={input} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="text-xs text-slate-500">支払い方法
            <select className={input} value={pay} onChange={(e) => setPay(e.target.value as 'transfer' | 'cash')}><option value="transfer">振込</option><option value="cash">現金</option></select>
          </label>
          <label className="text-xs text-slate-500">契約時の条件メモ（請求書には出ない）<input className={input} value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
        </div>
        <button type="button" className={btnPink} disabled={busy} onClick={() => run(() => saveSalonProfile({ salon_id: salonId, recipient_name: recipient, billing_email: email, payment_method: pay, memo }))}>請求先を保存</button>
      </div>

      <div className="bg-white border border-slate-200 p-3">
        <p className="font-bold text-slate-800 mb-2">毎月の契約（割引は「＋ 割引を足す」から）</p>
        {lines.length === 0 ? <p className="text-sm text-slate-500 mb-2">まだありません。</p> : (
          <table className="w-full text-sm mb-2">
            <thead><tr className="text-xs text-slate-500"><th className="text-left">品名</th><th className="text-right">単価</th><th>数量</th><th>期間</th><th /></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="py-1">{l.label}</td>
                  <td className={`text-right ${l.unit_price < 0 ? 'text-rose-600' : ''}`}>{yen(l.unit_price)}</td>
                  <td className="text-center">{l.quantity}</td>
                  <td className="text-center text-xs">{monthLabel(l.start_month).replace('分', '')}〜{l.end_month ? monthLabel(l.end_month).replace('分', '') : 'ずっと'}</td>
                  <td className="text-right whitespace-nowrap">
                    <button type="button" className="text-xs text-pink-600 mr-2" onClick={() => setEditing(l)}>直す</button>
                    <button type="button" className="text-xs text-rose-500" disabled={busy} onClick={() => { if (confirm(`「${l.label}」を消しますか？（発行済みの請求書は変わりません）`)) void run(() => deleteContractLine(l.id), '消しました'); }}>消す</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!editing ? (
          <div className="flex flex-wrap gap-2">
            <select className="border border-slate-300 px-2 py-1.5 text-sm" value="" onChange={(e) => {
              const it = data.items.find((x) => x.id === Number(e.target.value));
              if (it) setEditing({ salon_id: salonId, item_id: it.id, label: it.name, unit_price: it.unit_price, quantity: 1, start_month: thisMonth, end_month: null, sort_order: it.sort_order });
            }}>
              <option value="">＋ 品目から足す…</option>
              {data.items.filter((x) => x.is_active).map((x) => <option key={x.id} value={x.id}>{x.name}（{yen(x.unit_price)}）</option>)}
            </select>
            <button type="button" className={btnGray} onClick={() => setEditing({ salon_id: salonId, item_id: null, label: '割引', unit_price: undefined, quantity: 1, start_month: thisMonth, end_month: null, sort_order: 90 })}>＋ 割引を足す</button>
          </div>
        ) : (
          <LineEditor line={editing} busy={busy} onCancel={() => setEditing(null)}
            onSave={(l) => run(async () => { const r = await saveContractLine({ ...(l as ContractLineRow), salon_id: salonId }); if (r.ok) setEditing(null); return r; })} />
        )}
      </div>
    </div>
  );
}

// ★ 第817便（カッキーさん）: 金額は文字のまま持つ（数字に直すのは保存のとき）。★ 以前は1文字ごとに数字へ直していて、
//   「−」だけ・空のときに NaN になり打てなくなっていた。
// ★ 割引は「割引」を選んで【プラスの金額】を入れる（保存のときにマイナスにする）。★ 並び順は画面に出さない（請求→割引の順に自動）。
function toHalf(v: string): string {
  return v.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[－ー−‐]/g, '-').replace(/[,，\s円¥￥]/g, '');
}
function LineEditor({ line, busy, onCancel, onSave }: { line: Partial<ContractLineRow>; busy: boolean; onCancel: () => void; onSave: (l: Partial<ContractLineRow>) => void }) {
  const [label, setLabel] = useState(line.label ?? '');
  const [kind, setKind] = useState<'charge' | 'discount'>((line.unit_price ?? 0) < 0 || (line.unit_price === undefined && line.sort_order === 90) ? 'discount' : 'charge');
  const [amount, setAmount] = useState(line.unit_price === undefined ? '' : String(Math.abs(line.unit_price)));
  const [qty, setQty] = useState(String(line.quantity ?? 1));
  const [start, setStart] = useState(line.start_month ?? '2026-10-01');
  const [end, setEnd] = useState<string | null>(line.end_month ?? null);
  const months = monthOptions(line.start_month);
  const n = Number(toHalf(amount).replace(/^-/, ''));
  const bad = !amount || !Number.isFinite(n) || !Number.isInteger(n);
  return (
    <div className="border border-pink-200 bg-pink-50/40 p-2 grid sm:grid-cols-6 gap-2 items-end">
      <label className="text-xs text-slate-500">種類
        <select className={input} value={kind} onChange={(e) => {
          const k = e.target.value as 'charge' | 'discount'; setKind(k);
          if (k === 'discount' && (!label || label === line.label)) setLabel('割引');
        }}>
          <option value="charge">請求</option><option value="discount">割引（引く）</option>
        </select>
      </label>
      <label className="text-xs text-slate-500 sm:col-span-2">品名<input className={input} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
      <label className="text-xs text-slate-500">{kind === 'discount' ? '引く金額（税抜）' : '単価（税抜）'}
        <input className={`${input} text-right`} inputMode="numeric" placeholder="10000" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label className="text-xs text-slate-500">数量<input className={`${input} text-center`} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
      <span className={`text-sm text-right pb-1 ${kind === 'discount' ? 'text-rose-600' : ''}`}>{bad ? '' : `${kind === 'discount' ? '−' : ''}${yen(n * (Number(toHalf(qty)) || 1))}円`}</span>
      <label className="text-xs text-slate-500 sm:col-span-2">開始月（最初に請求する「◯月分」）
        <select className={input} value={start} onChange={(e) => setStart(e.target.value)}>{months.map((m) => <option key={m} value={m}>{monthLabel(m).replace('分', '')}</option>)}</select>
      </label>
      <label className="text-xs text-slate-500 sm:col-span-2">終了月（最後に請求する「◯月分」）
        <select className={input} value={end ?? ''} onChange={(e) => setEnd(e.target.value || null)}>
          <option value="">ずっと</option>{months.map((m) => <option key={m} value={m}>{monthLabel(m).replace('分', '')}</option>)}
        </select>
      </label>
      <div className="sm:col-span-2 flex gap-2">
        <button type="button" className={btnPink} disabled={busy || bad} onClick={() => onSave({
          ...line, label: label.trim(), unit_price: kind === 'discount' ? -n : n, quantity: Number(toHalf(qty)) || 1,
          start_month: start, end_month: end, sort_order: kind === 'discount' ? 90 : (line.sort_order !== undefined && line.sort_order < 90 ? line.sort_order : 10),
        })}>保存</button>
        <button type="button" className={btnGray} onClick={onCancel}>やめる</button>
      </div>
    </div>
  );
}

// ── 品目 ───────────────────────────────────────────────────
function ItemsTab({ data, busy, run }: { data: BillingAdminData; busy: boolean; run: RunFn }) {
  const [rows, setRows] = useState(data.items.map((i) => ({ ...i, price: String(i.unit_price) })));
  const [nw, setNw] = useState({ name: '', price: '', sort: '0' });
  return (
    <div className="bg-white border border-slate-200 p-3">
      <p className="text-xs text-slate-500 mb-2">金額は税抜。★ ここの金額を変えても、店舗の契約の行と発行済みの請求書は変わりません（契約の行に足すときの初期値です）。</p>
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-slate-500"><th className="text-left">品目名</th><th className="w-32">単価（税抜）</th><th className="w-20">並び順</th><th className="w-20">使う</th><th className="w-16" /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td className="pr-1 py-0.5"><input className={input} value={r.name} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></td>
              <td className="pr-1"><input className={`${input} text-right`} value={r.price} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} /></td>
              <td className="pr-1"><input className={input} value={String(r.sort_order)} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, sort_order: Number(e.target.value) } : x))} /></td>
              <td className="text-center"><input type="checkbox" checked={r.is_active} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, is_active: e.target.checked } : x))} /></td>
              <td><button type="button" className="text-xs text-pink-600" disabled={busy} onClick={() => run(() => saveBillingItem({ id: r.id, name: r.name, unit_price: Number(r.price.replace(/[,\s]/g, '')), is_active: r.is_active, sort_order: r.sort_order }))}>保存</button></td>
            </tr>
          ))}
          <tr className="border-t border-slate-200">
            <td className="pr-1 pt-2"><input className={input} placeholder="新しい品目（例: オプションバナー）" value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} /></td>
            <td className="pr-1 pt-2"><input className={`${input} text-right`} placeholder="0" value={nw.price} onChange={(e) => setNw({ ...nw, price: e.target.value })} /></td>
            <td className="pr-1 pt-2"><input className={input} value={nw.sort} onChange={(e) => setNw({ ...nw, sort: e.target.value })} /></td>
            <td />
            <td className="pt-2"><button type="button" className="text-xs text-pink-600 font-bold" disabled={busy} onClick={() => run(async () => {
              const r = await saveBillingItem({ name: nw.name, unit_price: Number(nw.price.replace(/[,\s]/g, '')), is_active: true, sort_order: Number(nw.sort) || 0 });
              if (r.ok) setNw({ name: '', price: '', sort: '0' }); return r;
            })}>足す</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── 発行者の設定 ───────────────────────────────────────────
function SettingsTab({ settings, busy, run }: { settings: BillingSettings; busy: boolean; run: RunFn }) {
  const [s, setS] = useState({ ...settings, registration_no: settings.registration_no ?? '' });
  const f = (k: keyof typeof s) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setS({ ...s, [k]: e.target.value });
  return (
    <div className="bg-white border border-slate-200 p-3 space-y-2 max-w-2xl">
      <p className="text-xs text-slate-500">請求書の右上と振込先に出る内容です。★ 発行した請求書には、発行したときの内容がそのまま残ります（あとで変えても過去の分は変わりません）。</p>
      <label className="block text-xs text-slate-500">屋号・発行者名<input className={input} value={s.issuer_name} onChange={f('issuer_name')} /></label>
      <label className="block text-xs text-slate-500">住所（改行できます）<textarea className={input} rows={2} value={s.issuer_address} onChange={f('issuer_address')} /></label>
      <div className="grid sm:grid-cols-2 gap-2">
        <label className="text-xs text-slate-500">電話<input className={input} value={s.issuer_tel} onChange={f('issuer_tel')} /></label>
        <label className="text-xs text-slate-500">メール<input className={input} value={s.issuer_email} onChange={f('issuer_email')} /></label>
      </div>
      <label className="block text-xs text-slate-500">登録番号（T＋13桁・無いあいだは空欄＝請求書に出ません）<input className={input} value={s.registration_no} onChange={f('registration_no')} /></label>
      <label className="block text-xs text-slate-500">振込先（銀行名・支店・種別・口座番号・名義を改行で）<textarea className={input} rows={4} value={s.bank_info} onChange={f('bank_info')} /></label>
      <label className="block text-xs text-slate-500">請求書の下の一言（例: 振込手数料はご負担ください）<textarea className={input} rows={2} value={s.note} onChange={f('note')} /></label>
      <div className="grid grid-cols-2 gap-2 max-w-xs">
        <label className="text-xs text-slate-500">税率（%）<input className={input} inputMode="numeric" value={String(s.tax_rate_pct)} onChange={(e) => setS({ ...s, tax_rate_pct: Number(e.target.value) })} /></label>
        <label className="text-xs text-slate-500">期限（毎月◯日）<input className={input} inputMode="numeric" value={String(s.due_day)} onChange={(e) => setS({ ...s, due_day: Number(e.target.value) })} /></label>
      </div>
      <button type="button" className={btnPink} disabled={busy} onClick={() => run(() => saveBillingSettings({ ...s, registration_no: s.registration_no || null }))}>設定を保存</button>
    </div>
  );
}
