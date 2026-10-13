'use client';

import { useCallback, useEffect, useState } from 'react';
import { confirmDeposit, getDepositCandidates, ignoreDeposit, syncDepositsNow, type DepositRow, type OpenInvoice } from '@/app/actions/billingAdmin';
import { monthLabel, yen } from '@/lib/billing';

// ★ 第1437便（2026-10-13・カッキーさん）: 「② 入金待ち」の上に出す「入金の候補」。
//   楽天口座に入った振込（マネーフォワード経由・毎朝 9:00 に読む）を、どの請求書の入金か決める。
//   ・候補（金額と振込名義から）を最初から選んでおく。違えば選び直す
//   ・「この請求書の入金にする」＝ 入金済み（振込・入金日＝明細の日付）＋ 振込名義を覚える
//   ・「対象外」＝ 請求書と関係ない入金（返金・ほかの売上など）
export function DepositCandidates({ onChanged }: { onChanged: () => void }) {
  const [deps, setDeps] = useState<DepositRow[]>([]);
  const [invs, setInvs] = useState<OpenInvoice[]>([]);
  const [pick, setPick] = useState<Record<string, number>>({});
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const r = await getDepositCandidates();
    if (!r.ok) { setMsg(`×　${r.error}`); return; }
    setDeps(r.deposits); setInvs(r.invoices); setMissing(!!r.missingTable);
    setPick(Object.fromEntries(r.deposits.filter((d) => d.suggested_invoice_id).map((d) => [d.mf_id, d.suggested_invoice_id as number])));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<{ ok: boolean; error?: string; mail?: string }>, okMsg?: string) => {
    setBusy(true); setMsg('');
    try {
      const r = await fn();
      setMsg(r.ok ? `○　${r.mail ?? okMsg ?? '保存しました'}` : `×　${r.error}`);
      await load(); if (r.ok) onChanged();
    } finally { setBusy(false); }
  };

  const label = (i: OpenInvoice) => `${i.salon_name}・${monthLabel(i.billing_month)}・¥${yen(i.total)}${i.invoice_no ? `（${i.invoice_no}）` : ''}`;
  const md = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;

  if (missing) return null;
  return (
    <div className="mt-4 bg-white border-2 border-sky-300">
      <div className="px-4 py-3 border-b border-sky-100 flex flex-wrap items-center gap-2">
        <h3 className="font-black text-[16px]">入金の候補（楽天口座）</h3>
        <span className="text-xs text-slate-500">マネーフォワードから毎朝9:00に読みます。どの請求書の入金か決めてください（自動では入金済みにしません）</span>
        <button type="button" disabled={busy} onClick={() => act(() => syncDepositsNow())} className="ml-auto text-sm font-bold px-3 py-1.5 border border-sky-400 text-sky-700 bg-white hover:bg-sky-50 disabled:opacity-40">今すぐ読む</button>
      </div>
      {msg && <p className={`px-4 pt-2 text-sm ${msg.startsWith('×') ? 'text-rose-600' : 'text-emerald-700'}`}>{msg}</p>}
      {deps.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-500">決めていない入金はありません。</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {deps.map((d) => {
            const chosen = pick[d.mf_id];
            const inv = invs.find((i) => i.id === chosen);
            const diff = inv && inv.total !== d.amount;
            return (
              <div key={d.mf_id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="text-sm text-slate-500">{md(d.deposit_date)}</span>
                  <span className="font-black text-lg">¥{yen(d.amount)}</span>
                  <span className="text-[15px] font-bold">{d.content || '（名義なし）'}</span>
                  {d.suggest_reason === 'name' && <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5">金額・名義が一致</span>}
                  {d.suggest_reason === 'amount' && <span className="text-xs font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5">金額だけ一致</span>}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select className="border border-slate-300 px-2 py-1.5 text-[14px] bg-white min-w-[260px] flex-1" value={chosen ?? ''} onChange={(e) => setPick((p) => ({ ...p, [d.mf_id]: Number(e.target.value) }))}>
                    <option value="">― どの請求書の入金？ ―</option>
                    {invs.map((i) => <option key={i.id} value={i.id}>{label(i)}</option>)}
                  </select>
                  <button type="button" disabled={busy || !chosen} onClick={() => {
                    if (!inv) return;
                    if (!confirm(`${md(d.deposit_date)} の入金 ¥${yen(d.amount)}（${d.content}）を\n${label(inv)} の入金にします。${diff ? '\n\n★ 金額が違います。よろしいですか？' : ''}`)) return;
                    void act(() => confirmDeposit(d.mf_id, inv.id));
                  }} className="text-[14px] font-bold px-3 py-1.5 bg-emerald-600 text-white border border-emerald-600 hover:bg-emerald-700 disabled:opacity-40">この請求書の入金にする</button>
                  <button type="button" disabled={busy} onClick={() => { if (confirm('この入金を「対象外」（請求書と関係ない入金）にします。よろしいですか？')) void act(() => ignoreDeposit(d.mf_id), '対象外にしました'); }}
                    className="text-[14px] font-bold px-3 py-1.5 bg-white text-slate-600 border border-slate-300 hover:border-slate-500 disabled:opacity-40">対象外</button>
                </div>
                {diff && <p className="mt-1 text-xs font-bold text-rose-600">金額が違います（請求 ¥{yen(inv!.total)}）</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
