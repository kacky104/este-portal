'use client';

// ★ 第496便: /cast「お客様」タブ＝お客様記録帳（セラピスト本人だけの手帳）。
// 1行＝1回の接客（日時・名前・回数・一言メモ）。回数は空欄なら同じ名前を日時順に数えて出す。名前で検索できる。
// 読み書きは actions/castCustomers（本人確認つき service_role）。★ お店・運営には出さない。

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listCustomerLogs, addCustomerLog, updateCustomerLog, deleteCustomerLog, type CustomerLog,
} from '@/app/actions/castCustomers';

const INPUT = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200';

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

type Form = { servedAt: string; name: string; visitCount: string; memo: string };
const emptyForm = (): Form => ({ servedAt: nowJstLocal(), name: '', visitCount: '', memo: '' });

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
      <label className="block">
        <span className="block text-[11px] font-bold text-slate-500 mb-1">名前</span>
        <input className={INPUT} placeholder="例：田中さん" maxLength={40} list="cast-customer-names" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <datalist id="cast-customer-names">
          {names.map((n) => <option key={n} value={n} />)}
        </datalist>
      </label>
      <label className="block">
        <span className="block text-[11px] font-bold text-slate-500 mb-1">一言メモ</span>
        <textarea className={`${INPUT} resize-none`} rows={2} maxLength={200} placeholder="例：肩こり強め・甘いもの好き" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
        <span className="block text-right text-[10px] text-slate-400">{form.memo.length}/200</span>
      </label>
    </div>
  );
}

export function CastCustomers() {
  const [logs, setLogs] = useState<CustomerLog[]>([]);
  const [total, setTotal] = useState(0);
  const [allNames, setAllNames] = useState<string[]>([]);
  const [query, setQuery] = useState('');
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

  const load = useCallback(async (q: string) => {
    setLoading(true);
    const res = await listCustomerLogs(q);
    if (res.ok) {
      setLogs(res.logs);
      setTotal(res.total);
      setLoadError('');
      if (!q) {
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
    const t = window.setTimeout(() => { void load(query); }, query ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [query, load]);

  const handleAdd = async () => {
    setError(''); setNotice('');
    setSaving(true);
    const res = await addCustomerLog(form);
    setSaving(false);
    if (!res.ok) { setError(res.error); return; }
    setNotice(`${form.name.trim()} さんを記録しました`);
    setForm(emptyForm());
    await load(query);
  };

  const startEdit = (l: CustomerLog) => {
    setEditId(l.id);
    setEditError('');
    setConfirmDeleteId(null);
    setEditForm({ servedAt: isoToJstLocal(l.servedAt), name: l.name, visitCount: l.visitCount != null ? String(l.visitCount) : '', memo: l.memo });
  };

  const handleUpdate = async () => {
    if (editId == null) return;
    setEditError('');
    const res = await updateCustomerLog(editId, editForm);
    if (!res.ok) { setEditError(res.error); return; }
    setEditId(null);
    await load(query);
  };

  const handleDelete = async (id: number) => {
    const res = await deleteCustomerLog(id);
    setConfirmDeleteId(null);
    if (!res.ok) { setLoadError(res.error); return; }
    if (editId === id) setEditId(null);
    await load(query);
  };

  const names = useMemo(() => allNames.slice(0, 300), [allNames]);

  return (
    <div className="space-y-4">
      {/* 記録を足す */}
      <div className="bg-white rounded-3xl border border-pink-100 shadow-sm p-5 space-y-3">
        <div>
          <h2 className="text-sm font-black text-slate-800">お客様記録帳</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">あなただけが見られる手帳です。お店には表示されません。</p>
        </div>
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

      {/* 検索と一覧 */}
      <div className="bg-white rounded-3xl border border-pink-100 shadow-sm p-5 space-y-3">
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
        <p className="text-[11px] text-slate-400">
          {loading ? '読み込み中…' : query ? `「${query}」の記録 ${total}件` : `記録 ${total}件`}
          {!loading && total > logs.length && `（新しい${logs.length}件を表示）`}
        </p>
        {loadError && <p className="text-xs font-bold text-red-500">{loadError}</p>}

        {!loading && logs.length === 0 && !loadError && (
          <p className="text-xs text-slate-400 text-center py-6">{query ? '見つかりませんでした' : 'まだ記録がありません'}</p>
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
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <button type="button" onClick={() => setQuery(l.name)} className="text-sm font-black text-slate-800 hover:text-pink-600 text-left">{l.name}</button>
                    <span className="text-[11px] font-bold text-pink-600 bg-pink-50 border border-pink-100 rounded-full px-2 py-0.5">{l.shownCount}回目</span>
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
