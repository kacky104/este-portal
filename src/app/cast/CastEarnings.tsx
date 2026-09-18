'use client';

// ★ 第498便: /cast「報酬」タブ＝報酬帳（セラピスト本人だけ）。
// その日の 1人目・2人目… の金額と一言メモ → 日の合計。「カレンダー」で月の表（日ごとの合計・月の合計）。
// 読み書きは actions/castEarnings（本人確認つき service_role）。★ お店・運営には出さない。

import { useEffect, useMemo, useState } from 'react';
import { getEarningsDay, saveEarningsDay, getEarningsMonth } from '@/app/actions/castEarnings';

const INPUT = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200';
const ROW_MAX = 50;
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

type Row = { amount: string; memo: string };
const emptyRow = (): Row => ({ amount: '', memo: '' });

const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`;
// 「12,000」「１２０００」などを数字に。空は null
function parseAmount(s: string): number | null {
  const d = s.normalize('NFKC').replace(/[^\d]/g, '');
  return d ? Number(d) : null;
}
function labelDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}月${d}日(${WEEK[w]})`;
}
function addMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

export function CastEarnings({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [showCal, setShowCal] = useState(false);
  const [ym, setYm] = useState(today.slice(0, 7));
  const [month, setMonth] = useState<Record<string, { total: number; count: number }>>({});
  const [monthErr, setMonthErr] = useState('');
  const [monthTick, setMonthTick] = useState(0); // 保存したら月の表を読み直す

  // その日の記録を読む
  useEffect(() => {
    let alive = true;
    getEarningsDay(date).then((res) => {
      if (!alive) return;
      if (res.ok) {
        setRows(res.rows.length ? res.rows.map((r) => ({ amount: r.amount.toLocaleString('ja-JP'), memo: r.memo })) : [emptyRow()]);
        setError('');
      } else {
        setRows([emptyRow()]);
        setError(res.error);
      }
      setDirty(false);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [date]);

  // 月の表を読む（カレンダーを開いているときだけ）
  useEffect(() => {
    if (!showCal) return;
    let alive = true;
    getEarningsMonth(ym).then((res) => {
      if (!alive) return;
      if (res.ok) { setMonth(res.days); setMonthErr(''); } else { setMonth({}); setMonthErr(res.error); }
    });
    return () => { alive = false; };
  }, [showCal, ym, monthTick]);

  const dayTotal = useMemo(() => rows.reduce((s, r) => s + (parseAmount(r.amount) ?? 0), 0), [rows]);
  const monthTotal = useMemo(() => Object.values(month).reduce((s, d) => s + d.total, 0), [month]);
  const monthDays = useMemo(() => Object.values(month).filter((d) => d.count > 0).length, [month]);
  const monthCount = useMemo(() => Object.values(month).reduce((s, d) => s + d.count, 0), [month]);

  const changeDate = (next: string) => {
    if (!next || next === date) return;
    if (dirty && !window.confirm('保存していない入力があります。捨てて日付を変えますか？')) return;
    setNotice('');
    setLoading(true);
    setDate(next);
    setYm(next.slice(0, 7));
  };

  const edit = (i: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(true);
    setNotice('');
  };
  const addRow = () => {
    if (rows.length >= ROW_MAX) return;
    setRows((rs) => [...rs, emptyRow()]);
    setDirty(true);
  };
  const removeRow = (i: number) => {
    setRows((rs) => (rs.length <= 1 ? [emptyRow()] : rs.filter((_, j) => j !== i)));
    setDirty(true);
    setNotice('');
  };

  const handleSave = async () => {
    setError(''); setNotice('');
    // 金額もメモも空の行は保存しない。メモだけの行は止める
    const out: { amount: number; memo: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const a = parseAmount(rows[i].amount);
      const memo = rows[i].memo.trim();
      if (a == null && !memo) continue;
      if (a == null) { setError(`${i + 1}人目の金額を入れてください`); return; }
      if (a > 9999999) { setError(`${i + 1}人目の金額が大きすぎます`); return; }
      out.push({ amount: a, memo });
    }
    setSaving(true);
    const res = await saveEarningsDay(date, out);
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    setRows(out.length ? out.map((r) => ({ amount: r.amount.toLocaleString('ja-JP'), memo: r.memo })) : [emptyRow()]);
    setDirty(false);
    setNotice(`${labelDate(date)}の報酬を保存しました`);
    setMonthTick((t) => t + 1);
  };

  // カレンダーのマス（日曜はじまり）
  const cells = useMemo(() => {
    const [y, m] = ym.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out: (string | null)[] = Array.from({ length: first }, () => null);
    for (let d = 1; d <= last; d++) out.push(`${ym}-${String(d).padStart(2, '0')}`);
    while (out.length % 7) out.push(null);
    return out;
  }, [ym]);

  const [cy, cm] = ym.split('-').map(Number);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl border border-pink-100 shadow-sm p-5 space-y-4">
        <div className="flex items-start gap-2">
          <div>
            <h2 className="text-sm font-black text-slate-800">報酬帳</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">あなただけが見られます。お店には表示されません。</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCal((v) => !v)}
            aria-pressed={showCal}
            className={`ml-auto shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-[12px] font-bold transition-colors ${showCal ? 'bg-pink-50 text-pink-600 border-pink-300' : 'bg-white text-slate-500 border-slate-200 hover:border-pink-300 hover:text-pink-600'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden><rect x="3" y="5" width="18" height="16" rx="2" /><path strokeLinecap="round" d="M3 10h18M8 3v4M16 3v4" /></svg>
            カレンダー
          </button>
        </div>

        {/* カレンダー（月の表） */}
        {showCal && (
          <div className="rounded-2xl border border-pink-100 bg-pink-50/30 p-3 space-y-3">
            <div className="flex items-center">
              <button type="button" onClick={() => setYm((v) => addMonth(v, -1))} className="w-8 h-8 rounded-full text-slate-500 hover:bg-white text-lg font-bold" aria-label="前の月">‹</button>
              <p className="flex-1 text-center text-sm font-black text-slate-800">{cy}年{cm}月</p>
              <button type="button" onClick={() => setYm((v) => addMonth(v, 1))} className="w-8 h-8 rounded-full text-slate-500 hover:bg-white text-lg font-bold" aria-label="次の月">›</button>
            </div>
            <div className="rounded-xl bg-white border border-pink-100 px-4 py-3 text-center">
              <p className="text-[11px] font-bold text-slate-400">{cm}月の合計</p>
              <p className="text-2xl font-black text-pink-600 tabular-nums">{yen(monthTotal)}</p>
              <p className="text-[11px] text-slate-400">{monthDays}日・{monthCount}人</p>
            </div>
            {monthErr && <p className="text-xs font-bold text-red-500">{monthErr}</p>}
            <div className="grid grid-cols-7 gap-1">
              {WEEK.map((w, i) => (
                <div key={w} className={`text-center text-[10px] font-bold ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}`}>{w}</div>
              ))}
              {cells.map((d, i) => {
                if (!d) return <div key={`e${i}`} />;
                const info = month[d];
                const selected = d === date;
                const isToday = d === today;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => changeDate(d)}
                    className={`min-w-0 h-14 rounded-lg border flex flex-col items-center justify-start pt-1 transition-colors ${selected ? 'border-pink-400 bg-pink-50' : 'border-slate-100 bg-white hover:border-pink-200'}`}
                  >
                    <span className={`text-[11px] font-bold leading-none ${isToday ? 'text-white bg-pink-500 rounded-full w-5 h-5 flex items-center justify-center' : i % 7 === 0 ? 'text-red-400' : i % 7 === 6 ? 'text-blue-400' : 'text-slate-600'}`}>
                      {Number(d.slice(8))}
                    </span>
                    {info && info.count > 0 && (
                      <span className="mt-1 w-full px-0.5 text-[9px] sm:text-[10px] font-bold text-pink-600 tabular-nums leading-tight truncate text-center">
                        {info.total.toLocaleString('ja-JP')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* その日の記録 */}
        <div className="space-y-3">
          <label className="block min-w-0">
            <span className="block text-[11px] font-bold text-slate-500 mb-1">日付</span>
            <input
              type="date"
              className={`${INPUT} block min-w-0 max-w-full appearance-none h-[38px] text-left [&::-webkit-date-and-time-value]:text-left`}
              value={date}
              onChange={(e) => changeDate(e.target.value)}
            />
          </label>
          <p className="text-sm font-black text-slate-800">{labelDate(date)}{loading && <span className="ml-2 text-[11px] font-normal text-slate-400">読み込み中…</span>}</p>

          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={i} className="border border-slate-100 rounded-2xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-black text-pink-600 w-12 shrink-0">{i + 1}人目</span>
                  <div className="relative flex-1 min-w-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">¥</span>
                    <input
                      inputMode="numeric"
                      className={`${INPUT} pl-7 tabular-nums`}
                      placeholder="金額"
                      maxLength={10}
                      value={r.amount}
                      onChange={(e) => edit(i, { amount: e.target.value })}
                      onBlur={() => { const a = parseAmount(r.amount); const f = a != null ? a.toLocaleString('ja-JP') : ''; if (a != null && f !== r.amount) edit(i, { amount: f }); }}
                    />
                  </div>
                  <button type="button" onClick={() => removeRow(i)} aria-label={`${i + 1}人目を消す`} className="w-8 h-8 shrink-0 rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 text-lg leading-none">×</button>
                </div>
                <input
                  className={INPUT}
                  placeholder="一言メモ（例：60分コース・延長15分）"
                  maxLength={60}
                  value={r.memo}
                  onChange={(e) => edit(i, { memo: e.target.value })}
                />
              </li>
            ))}
          </ul>

          {rows.length < ROW_MAX && (
            <button type="button" onClick={addRow} className="w-full py-2 rounded-xl border border-dashed border-pink-300 text-pink-600 text-sm font-bold hover:bg-pink-50">
              ＋ 追加（{rows.length + 1}人目）
            </button>
          )}

          <div className="flex items-baseline justify-between rounded-2xl bg-pink-50 border border-pink-100 px-4 py-3">
            <span className="text-xs font-bold text-slate-500">この日の合計</span>
            <span className="text-xl font-black text-pink-600 tabular-nums">{yen(dayTotal)}</span>
          </div>

          {error && <p className="text-xs font-bold text-red-500">{error}</p>}
          {notice && <p className="text-xs font-bold text-pink-600">{notice}</p>}
          {dirty && !error && <p className="text-[11px] text-slate-400">まだ保存していません</p>}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="w-full py-2.5 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-700 disabled:opacity-40 transition-colors"
          >
            {saving ? '保存中…' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  );
}
