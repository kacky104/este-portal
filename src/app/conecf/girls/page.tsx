'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ConecfShell } from '../ConecfShell';
import { useConecfHref } from '../ConecfBase';
import { useToast } from '@/app/components/useToast';
import { listConecfGirls, createConecfGirl, type ConecfGirlRow } from '@/app/actions/conecfGirls';
import { revalidateSalon } from '@/app/lib/revalidateTop';

// コネックエフ「女性一覧」（第398便・1c・2026-09-17）。
// ★ ベンリーの女性一覧と同じ並び：写真・名前・年齢・新人・サイズ・入店日・公開。★ 行を押すと編集へ。
// ★ 親データはフクエスの therapists（★ ここに出る人＝フクエスに居る人）。

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';

function GirlsBody({ onToast }: { onToast: (m: string) => void }) {
  const href = useConecfHref();
  const [rows, setRows] = useState<ConecfGirlRow[] | null>(null);
  const [salonId, setSalonId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIsNew, setNewIsNew] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await listConecfGirls();
    if (res.ok) { setRows(res.data.girls); setSalonId(res.data.salonId); setError(''); }
    else setError(res.error);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onAdd = async () => {
    setBusy(true);
    const res = await createConecfGirl({ name: newName, isNewFace: newIsNew });
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    if (salonId != null) void revalidateSalon(salonId);
    window.location.href = href(`/girls/${res.data.id}`);
  };

  if (error) return <div className={`${CARD} p-5 text-[14px] text-slate-500`}>読み込めませんでした（{error}）</div>;

  const shown = (rows ?? []).filter((r) => q.trim() === '' || r.name.includes(q.trim()));
  const activeCount = (rows ?? []).filter((r) => r.isActive).length;

  return (
    <div className="space-y-3">
      <div className={`${CARD} p-4 flex flex-wrap items-center gap-3`}>
        <button
          type="button"
          onClick={() => setAdding((x) => !x)}
          className="px-4 py-2.5 bg-gradient-to-r from-indigo-700 to-indigo-500 text-white text-[14px] font-bold"
        >
          ＋ 新規登録
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="女性名で検索"
          className="flex-1 min-w-[160px] border border-slate-200 px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
        <span className="text-[13px] font-bold text-slate-400 tabular-nums">
          {rows ? `${rows.length}人（公開 ${activeCount}人）` : ''}
        </span>
      </div>

      {adding && (
        <div className={`${CARD} p-4 space-y-3`}>
          <p className="text-[15px] font-black text-slate-800">新しい女性を登録</p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="女性名（10文字まで）"
              maxLength={10}
              className="flex-1 min-w-[180px] border border-slate-200 px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <label className="flex items-center gap-1.5 text-[14px] text-slate-600">
              <input type="checkbox" checked={newIsNew} onChange={(e) => setNewIsNew(e.target.checked)} className="accent-indigo-600" />
              新人に設定する
            </label>
            <button
              type="button"
              disabled={busy || newName.trim() === ''}
              onClick={() => void onAdd()}
              className="px-4 py-2 bg-indigo-600 text-white text-[14px] font-bold disabled:opacity-40"
            >
              {busy ? '登録しています…' : '登録して編集へ'}
            </button>
          </div>
          <p className="text-[12.5px] text-slate-400">登録するとフクエスにも公開の状態で追加されます。駅ちか・エステ魂への登録は「女性をサイトへ登録」から行います。</p>
        </div>
      )}

      <div className={CARD}>
        {!rows && <p className="p-5 text-[14px] text-slate-400">読み込み中…</p>}
        {rows && rows.length === 0 && <p className="p-5 text-[14px] text-slate-500">まだ女性が登録されていません。</p>}
        {rows && rows.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {shown.map((g) => (
              <li key={g.id}>
                <Link href={href(`/girls/${g.id}`)} className={`flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50/60 ${g.isActive ? '' : 'opacity-60'}`}>
                  <span className="w-12 h-16 flex-none bg-slate-100 overflow-hidden">
                    {g.imageUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={g.imageUrl} alt="" className="w-full h-full object-cover" />
                      : <span className="w-full h-full grid place-items-center text-[11px] text-slate-400">写真なし</span>}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <b className="text-[16px] font-black text-slate-800 truncate">{g.name || '（名前なし）'}</b>
                      {g.age && <span className="text-[13px] text-slate-500">{g.age}歳</span>}
                      {g.isNewFace && <span className="text-[11.5px] font-bold text-white bg-rose-500 px-1.5 py-0.5">新人</span>}
                    </span>
                    <span className="block text-[13px] text-slate-500 truncate">{g.bodyType || 'サイズ未設定'}</span>
                  </span>
                  <span className="hidden sm:block text-[12.5px] text-slate-400 tabular-nums w-24 text-right">{g.joinedOn ? g.joinedOn.replace(/-/g, '/') : ''}</span>
                  <span className={`flex-none text-[12px] font-bold px-2 py-0.5 border ${g.isActive ? 'text-indigo-700 border-indigo-200 bg-indigo-50' : 'text-slate-500 border-slate-200 bg-slate-50'}`}>
                    {g.isActive ? '公開中' : '非公開'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function ConecfGirlsPage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="girls" title="女性一覧" toast={toast}>
      {() => <GirlsBody onToast={showToast} />}
    </ConecfShell>
  );
}
