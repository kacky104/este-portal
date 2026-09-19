'use client';

// ★ 第496便: /cast「お客様」タブ＝お客様記録帳（セラピスト本人だけの手帳）。
// ★ 第518便: 報酬帳とまとめて「記録帳」タブに。1行＝1回の接客（日時・名前・回数・コース金額・一言メモ）。
//   上に「今日の報酬」（営業日＝朝6時区切り）と今月の合計、カレンダーで日ごとの合計。日を押すとその日の記録だけ出す。
//   回数は空欄なら同じ名前を日時順に数えて出す。名前で検索できる。
//   旧報酬帳（cast_earnings）の金額も合計には足す（入力は記録帳だけ）。
// 読み書きは actions/castCustomers（本人確認つき service_role）。★ お店・運営には出さない。

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listCustomerLogs, addCustomerLog, updateCustomerLog, deleteCustomerLog, getRecordMonth,
  type CustomerLog, type DaySum,
} from '@/app/actions/castCustomers';

const INPUT = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200';
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`;

// 今の日本時間を datetime-local の形（YYYY-MM-DDTHH:mm）に
function nowJstLocal(): string {
  return isoToJstLocal(new Date().toISOString());
}
function isoToJstLocal(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16);
}
function formatJst(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', weekday: 'short',
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}/${g('month')}/${g('day')}(${g('weekday')}) ${g('hour')}:${g('minute')}`;
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
// 「12,000」「１２０００」などを表示用に 12,000 へ。数字が無ければそのまま返す
function formatAmountInput(s: string): string {
  const d = s.normalize('NFKC').replace(/[^\d]/g, '');
  return d ? Number(d).toLocaleString('ja-JP') : s;
}

type Form = { servedAt: string; name: string; visitCount: string; memo: string; amount: string };
const emptyForm = (): Form => ({ servedAt: nowJstLocal(), name: '', visitCount: '', memo: '', amount: '' });

function LogFields({ form, setForm, names }: { form: Form; setForm: (f: Form) => void; names: string[] }) {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_7rem] gap-2.5">
        {/* ★ 第497便: iPhone の Safari は日時の入力欄に最小幅を持つので、枠からはみ出さないよう min-w-0＋appearance-none で縮める */}
        <label className="block min-w-0">
          <span className="block text-[11px] font-bold text-slate-500 mb-1">日時</span>
          <input type="datetime-local" className={`${INPUT} block min-w-0 max-w-full appearance-none h-[38px] text-left [&::-webkit-date-and-time-value]:text-left`} value={form.servedAt} onChange={(e) => setForm({ ...form, servedAt: e.target.value })} />
        </label>
        <label className="block min-w-0">
          <span className="block text-[11px] font-bold text-slate-500 mb-1">回数（空欄＝自動）</span>
          <input inputMode="numeric" className={INPUT} placeholder="自動" maxLength={4} value={form.visitCount} onChange={(e) => setForm({ ...form, visitCount: e.target.value })} />
        </label>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
        <label className="block min-w-0">
          <span className="block text-[11px] font-bold text-slate-500 mb-1">名前</span>
          <input className={INPUT} placeholder="例：田中さん" maxLength={40} list="cast-customer-names" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <datalist id="cast-customer-names">
            {names.map((n) => <option key={n} value={n} />)}
          </datalist>
        </label>
        <label className="block min-w-0">
          <span className="block text-[11px] font-bold text-slate-500 mb-1">コース金額</span>
          <span className="relative block">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">¥</span>
            <input
              inputMode="numeric"
              className={`${INPUT} pl-7 tabular-nums`}
              placeholder="例：12,000"
              maxLength={10}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              onBlur={() => { const f = formatAmountInput(form.amount); if (f !== form.amount) setForm({ ...form, amount: f }); }}
            />
          </span>
        </label>
      </div>
      <label className="block">
        <span className="block text-[11px] font-bold text-slate-500 mb-1">一言メモ</span>
        <textarea className={`${INPUT} resize-y min-h-[112px]`} rows={4} maxLength={200} placeholder="例：90分コース・延長15分／肩こり強め・甘いもの好き" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        <span className="block text-right text-[10px] text-slate-400">{form.memo.length}/200</span>
      </label>
    </div>
  );
}

export function CastCustomers({ today }: { today: string }) {
  const [logs, setLogs] = useState<CustomerLog[]>([]);
  const [total, setTotal] = useState(0);
  const [allNames, setAllNames] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [day, setDay] = useState(''); // カレンダーで選んだ日（空＝全部）
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [form, setForm] = useState<Form>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Form>(emptyForm);
  const [editError, setEditError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // 報酬（月ごとに日の合計）。★ 今日の月は上のカードに、表示中の月はカレンダーに使う
  const todayYm = today.slice(0, 7);
  const [showCal, setShowCal] = useState(false);
  const [ym, setYm] = useState(todayYm);
  const [months, setMonths] = useState<Record<string, Record<string, DaySum>>>({});
  const [sumError, setSumError] = useState('');
  const [sumTick, setSumTick] = useState(0); // 記録を変えたら読み直す

  const load = useCallback(async (q: string, d: string) => {
    setLoading(true);
    const res = await listCustomerLogs(q, d);
    if (res.ok) {
      setLogs(res.logs);
      setTotal(res.total);
      setLoadError('');
      if (!q && !d) {
        // 名前の候補（入力欄の予測）。新しく会った順に重ねずに
        const seen = new Set<string>();
        const ns: string[] = [];
        for (const l of res.logs) if (!seen.has(l.name)) { seen.add(l.name); ns.push(l.name); }
        setAllNames(ns);
      }
    } else {
      setLoadError(res.error);
    }
    setLoading(false);
  }, []);

  // 検索は打ち終わって少し待ってから
  useEffect(() => {
    const t = window.setTimeout(() => { void load(query, day); }, query ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [query, day, load]);

  // 今日の月と、カレンダーで見ている月の合計を読む
  useEffect(() => {
    let alive = true;
    const want = Array.from(new Set([todayYm, ym]));
    Promise.all(want.map((m) => getRecordMonth(m))).then((rs) => {
      if (!alive) return;
      const next: Record<string, Record<string, DaySum>> = {};
      let err = '';
      rs.forEach((r, i) => { if (r.ok) next[want[i]] = r.days; else err = r.error; });
      setMonths((prev) => ({ ...prev, ...next }));
      setSumError(err);
    });
    return () => { alive = false; };
  }, [todayYm, ym, sumTick]);

  const refresh = async () => {
    setSumTick((t) => t + 1);
    await load(query, day);
  };

  const handleAdd = async () => {
    setError(''); setNotice('');
    setSaving(true);
    const res = await addCustomerLog(form);
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    setNotice(`${form.name.trim()} さんを記録しました`);
    setForm(emptyForm());
    await refresh();
  };

  const startEdit = (l: CustomerLog) => {
    setEditId(l.id);
    setEditError('');
    setConfirmDeleteId(null);
    setEditForm({
      servedAt: isoToJstLocal(l.servedAt),
      name: l.name,
      visitCount: l.visitCount != null ? String(l.visitCount) : '',
      memo: l.memo,
      amount: l.amount != null ? l.amount.toLocaleString('ja-JP') : '',
    });
  };

  const handleUpdate = async () => {
    if (editId == null) return;
    setEditError('');
    const res = await updateCustomerLog(editId, editForm);
    if (!res.ok) { setEditError(res.error); return; }
    setEditId(null);
    await refresh();
  };

  const handleDelete = async (id: number) => {
    const res = await deleteCustomerLog(id);
    setConfirmDeleteId(null);
    if (!res.ok) { setLoadError(res.error); return; }
    if (editId === id) setEditId(null);
    await refresh();
  };

  const names = useMemo(() => allNames.slice(0, 300), [allNames]);

  // 今日・今月
  const todaySum = months[todayYm]?.[today] ?? { total: 0, count: 0, oldTotal: 0 };
  const todayMonthTotal = useMemo(() => Object.values(months[todayYm] ?? {}).reduce((s, d) => s + d.total, 0), [months, todayYm]);
  // カレンダーで見ている月
  const calDays = useMemo(() => months[ym] ?? {}, [months, ym]);
  const calTotal = useMemo(() => Object.values(calDays).reduce((s, d) => s + d.total, 0), [calDays]);
  const calWorkDays = useMemo(() => Object.values(calDays).filter((d) => d.count > 0).length, [calDays]);
  const calCount = useMemo(() => Object.values(calDays).reduce((s, d) => s + d.count, 0), [calDays]);
  const daySum = day ? (months[day.slice(0, 7)]?.[day] ?? null) : null;

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
  const [, tm] = todayYm.split('-').map(Number);

  const pickDay = (d: string) => {
    setDay((cur) => (cur === d ? '' : d));
    setQuery('');
  };

  return (
    <div className="space-y-4">
      {/* ── 今日の報酬 ── */}
      <div className="rounded-3xl p-5 text-white shadow-md" style={{ background: 'linear-gradient(135deg,#F472B6 0%,#DB2777 55%,#BE185D 100%)' }}>
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-white/80">今日の報酬・{labelDate(today)}</p>
            <p className="mt-1 text-[32px] leading-none font-black tabular-nums tracking-tight">{yen(todaySum.total)}</p>
            <p className="mt-1.5 text-[11px] font-bold text-white/85">{todaySum.count}人</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCal((v) => !v)}
            aria-pressed={showCal}
            className={`ml-auto shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors ${showCal ? 'bg-white text-pink-600' : 'bg-white/20 text-white hover:bg-white/30'}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden><rect x="3" y="5" width="18" height="16" rx="2" /><path strokeLinecap="round" d="M3 10h18M8 3v4M16 3v4" /></svg>
            カレンダー
          </button>
        </div>
        <div className="mt-4 pt-3 border-t border-white/25 flex items-baseline justify-between">
          <span className="text-[11px] font-bold text-white/80">{tm}月の合計</span>
          <span className="text-base font-black tabular-nums">{yen(todayMonthTotal)}</span>
        </div>
        <p className="mt-2 text-[10px] text-white/70">あなただけが見られます。お店には表示されません。</p>
      </div>
      {sumError && <p className="text-xs font-bold text-red-500">{sumError}</p>}

      {/* ── カレンダー ── */}
      {showCal && (
        <div className="bg-white rounded-3xl border border-pink-100 shadow-sm p-4 space-y-3">
          <div className="flex items-center">
            <button type="button" onClick={() => setYm((v) => addMonth(v, -1))} className="w-9 h-9 rounded-full text-slate-500 hover:bg-pink-50 text-lg font-bold" aria-label="前の月">‹</button>
            <div className="flex-1 text-center">
              <p className="text-sm font-black text-slate-800">{cy}年{cm}月</p>
              <p className="text-[11px] text-slate-400 tabular-nums"><span className="font-black text-pink-600">{yen(calTotal)}</span>・{calWorkDays}日・{calCount}人</p>
            </div>
            <button type="button" onClick={() => setYm((v) => addMonth(v, 1))} className="w-9 h-9 rounded-full text-slate-500 hover:bg-pink-50 text-lg font-bold" aria-label="次の月">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {WEEK.map((w, i) => (
              <div key={w} className={`text-center text-[10px] font-bold ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}`}>{w}</div>
            ))}
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} />;
              const info = calDays[d];
              const selected = d === day;
              const isToday = d === today;
              const has = info && info.total > 0;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => pickDay(d)}
                  aria-pressed={selected}
                  className={`min-w-0 h-14 rounded-lg border flex flex-col items-center justify-start pt-1 transition-colors ${selected ? 'border-pink-400 bg-pink-50' : has ? 'border-pink-100 bg-pink-50/40 hover:border-pink-300' : 'border-slate-100 bg-white hover:border-pink-200'}`}
                >
                  <span className={`text-[11px] font-bold leading-none ${isToday ? 'text-white bg-pink-500 rounded-full w-5 h-5 flex items-center justify-center' : i % 7 === 0 ? 'text-red-400' : i % 7 === 6 ? 'text-blue-400' : 'text-slate-600'}`}>
                    {Number(d.slice(8))}
                  </span>
                  {has && (
                    <span className="mt-1 w-full px-0.5 text-[9px] sm:text-[10px] font-bold text-pink-600 tabular-nums leading-tight truncate text-center">
                      {info.total.toLocaleString('ja-JP')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400">日付を押すと、その日の記録だけを下に出します。朝6時までは前の日に数えます。</p>
        </div>
      )}

      {/* ── 記録を足す ── */}
      <div className="bg-white rounded-3xl border border-pink-100 shadow-sm p-5 space-y-3">
        <LogFields form={form} setForm={setForm} names={names} />
        {error && <p className="text-xs font-bold text-red-500">{error}</p>}
        {notice && <p className="text-xs font-bold text-pink-600">{notice}</p>}
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || !form.name.trim()}
          className="w-full py-2.5 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-700 disabled:opacity-40 transition-colors"
        >
          {saving ? '保存中…' : '記録する'}
        </button>
      </div>

      {/* ── 検索と一覧 ── */}
      <div className="bg-white rounded-3xl border border-pink-100 shadow-sm p-5 space-y-3">
        {day ? (
          <div className="flex items-center gap-2 rounded-2xl bg-pink-50 border border-pink-100 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-800">{labelDate(day)}の記録</p>
              <p className="text-[11px] text-slate-500 tabular-nums">
                合計 <span className="font-black text-pink-600">{yen(daySum?.total ?? 0)}</span>
                {daySum && daySum.oldTotal > 0 && <span className="ml-1">（旧報酬帳の分 {yen(daySum.oldTotal)} を含む）</span>}
              </p>
            </div>
            <button type="button" onClick={() => setDay('')} className="ml-auto shrink-0 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-[11px] font-bold text-slate-500 hover:text-pink-600">すべて表示</button>
          </div>
        ) : (
          <div className="relative">
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} aria-hidden><circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M20 20l-3.5-3.5" /></svg>
            <input
              type="search"
              className={`${INPUT} pl-9`}
              placeholder="名前で検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
        <p className="text-[11px] text-slate-400">
          {loading ? '読み込み中…' : query ? `「${query}」の記録 ${total}件` : `記録 ${total}件`}
          {!loading && total > logs.length && `（新しい${logs.length}件を表示）`}
        </p>
        {loadError && <p className="text-xs font-bold text-red-500">{loadError}</p>}

        {!loading && logs.length === 0 && !loadError && (
          <p className="text-xs text-slate-400 text-center py-6">{query ? '見つかりませんでした' : day ? 'この日の記録はありません' : 'まだ記録がありません'}</p>
        )}

        <ul className="space-y-2">
          {logs.map((l) => (
            <li key={l.id} className="border border-slate-100 rounded-2xl p-3">
              {editId === l.id ? (
                <div className="space-y-2.5">
                  <LogFields form={editForm} setForm={setEditForm} names={names} />
                  {editError && <p className="text-xs font-bold text-red-500">{editError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={handleUpdate} className="flex-1 py-2 rounded-xl bg-pink-600 text-white text-xs font-bold hover:bg-pink-700">保存</button>
                    <button type="button" onClick={() => setEditId(null)} className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold hover:bg-slate-50">やめる</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-slate-400 tabular-nums">{formatJst(l.servedAt)}</span>
                    <span className="ml-auto flex items-center gap-1">
                      <button type="button" onClick={() => startEdit(l)} className="px-2 py-0.5 rounded-lg text-[11px] font-bold text-slate-400 hover:text-pink-600">直す</button>
                      {confirmDeleteId === l.id ? (
                        <>
                          <button type="button" onClick={() => handleDelete(l.id)} className="px-2 py-0.5 rounded-lg text-[11px] font-bold text-white bg-red-500 hover:bg-red-600">消す</button>
                          <button type="button" onClick={() => setConfirmDeleteId(null)} className="px-2 py-0.5 rounded-lg text-[11px] font-bold text-slate-400">やめる</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setConfirmDeleteId(l.id)} className="px-2 py-0.5 rounded-lg text-[11px] font-bold text-slate-400 hover:text-red-500">削除</button>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => { setDay(''); setQuery(l.name); }} className="min-w-0 truncate text-sm font-black text-slate-800 hover:text-pink-600 text-left">{l.name}</button>
                    <span className="shrink-0 text-[11px] font-bold text-pink-600 bg-pink-50 border border-pink-100 rounded-full px-2 py-0.5">{l.shownCount}回目</span>
                    {l.amount != null && (
                      <span className="ml-auto shrink-0 text-sm font-black text-slate-800 tabular-nums">{yen(l.amount)}</span>
                    )}
                  </div>
                  {l.memo && <p className="text-xs text-slate-600 whitespace-pre-wrap break-words">{l.memo}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
