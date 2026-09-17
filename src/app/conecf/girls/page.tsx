'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ConecfShell } from '../ConecfShell';
import { useConecfHref } from '../ConecfBase';
import { useToast } from '@/app/components/useToast';
import { listConecfGirls, createConecfGirl, type ConecfGirlRow } from '@/app/actions/conecfGirls';
import { revalidateSalon } from '@/app/lib/revalidateTop';
import { getConecfFirstImport, requestConecfFirstImport, type FirstImportStatus } from '@/app/actions/conecfFirstImport';

// コネックエフ「女性一覧」（第398便・1c・2026-09-17）。
// ★ ベンリーの女性一覧と同じ並び：写真・名前・年齢・新人・サイズ・入店日・公開。★ 行を押すと編集へ。
// ★ 親データはフクエスの therapists（★ ここに出る人＝フクエスに居る人）。

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';

// ★★ 第406便: 駅ちかから最初に1回だけ取り込む（女性・年齢サイズ・週間の出勤）。
//   ★ 実際に読むのは VPS の周（15分ごと）なので、押してから数分〜20分ほどかかる。★ 1店舗1回だけ。
function FirstImportCard({ enabled, onToast, onDone }: { enabled: boolean; onToast: (m: string) => void; onDone: () => void }) {
  const [st, setSt] = useState<FirstImportStatus | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await getConecfFirstImport();
    if (res.ok) setSt(res.data);
  }, []);
  useEffect(() => { void load(); }, [load]);

  // ★ 待ち・取り込み中は1分ごとに見に行く。★ 完了したら一覧を読み直す
  const phase = st?.phase;
  useEffect(() => {
    if (phase !== 'waiting' && phase !== 'running') return;
    const id = window.setInterval(async () => {
      const res = await getConecfFirstImport();
      if (!res.ok) return;
      setSt(res.data);
      if (res.data.phase === 'done') onDone();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [phase, onDone]);

  if (!st || !st.hasEkichika) return null;

  const onRequest = async () => {
    setBusy(true);
    const res = await requestConecfFirstImport();
    setBusy(false);
    setConfirm(false);
    if (!res.ok) { onToast(res.error); return; }
    onToast('受け付けました。20分ほどで反映されます');
    void load();
  };

  if (st.phase === 'done') {
    const s = st.summary;
    return (
      <div className={`${CARD} p-4 text-[13.5px] text-slate-600 space-y-1`}>
        <p><b className="text-slate-800">駅ちかからの取り込み：完了</b>{st.doneAt ? `（${new Date(st.doneAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}）` : ''}</p>
        {s && <p>新しく登録 {s.created}人・登録済みと一致 {s.matched}人・出勤 {s.schedules}日ぶん{s.errors > 0 ? `・★ 失敗 ${s.errors}回` : ''}</p>}
        {s && s.unmatched.length > 0 && <p className="text-[12.5px] text-slate-500">取り込めなかった女性：{s.unmatched.join('、')}（お手数ですが「＋ 新規登録」から登録してください）</p>}
      </div>
    );
  }

  if (st.phase === 'waiting' || st.phase === 'running') {
    return (
      <div className={`${CARD} p-4 text-[14px] text-indigo-800 bg-indigo-50/60`}>
        <b>駅ちかから取り込んでいます…</b>
        <span className="block text-[12.5px] text-slate-500 mt-0.5">20分ほどで反映されます。この画面は開いたままでも閉じても大丈夫です。</span>
      </div>
    );
  }

  return (
    <div className={`${CARD} p-4 space-y-3`}>
      <div>
        <p className="text-[15px] font-black text-slate-800">駅ちかから女性と出勤を取り込む（最初の1回だけ）</p>
        <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
          駅ちかに載っている女性・年齢・サイズ・1週間の出勤を、コネックエフへまとめて取り込みます。<br />
          ・まだ居ない女性は<b>公開</b>で追加します（新人マークは付けません）<br />
          ・コネックエフで<b>入力済みの出勤の日はそのまま</b>残します／年齢・サイズは空欄だけ埋めます<br />
          ・<b>1回だけ</b>押せます。取り込み後は、出勤などはコネックエフで入力してください
        </p>
      </div>
      {!confirm ? (
        <button
          type="button"
          onClick={() => (enabled ? setConfirm(true) : onToast('取り込むには、ホームで「コネックエフに切り替える」を押してください'))}
          className="px-4 py-2.5 bg-indigo-600 text-white text-[14px] font-bold"
        >
          駅ちかから取り込む
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-bold text-slate-700">1回だけです。取り込みますか？</span>
          <button type="button" disabled={busy} onClick={() => void onRequest()} className="px-4 py-2 bg-indigo-600 text-white text-[14px] font-bold disabled:opacity-40">
            {busy ? '受け付けています…' : '取り込む'}
          </button>
          <button type="button" disabled={busy} onClick={() => setConfirm(false)} className="px-4 py-2 border border-slate-300 text-slate-600 text-[14px] font-bold">
            やめる
          </button>
        </div>
      )}
    </div>
  );
}

function GirlsBody({ enabled, onToast }: { enabled: boolean; onToast: (m: string) => void }) {
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

  const onImportDone = useCallback(() => {
    void load();
    if (salonId != null) void revalidateSalon(salonId);
  }, [load, salonId]);

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
      <FirstImportCard enabled={enabled} onToast={onToast} onDone={onImportDone} />
      <div className={`${CARD} p-4 flex flex-wrap items-center gap-3`}>
        <button
          type="button"
          onClick={() => (enabled ? setAdding((x) => !x) : onToast('登録するには、ホームで「コネックエフに切り替える」を押してください'))}
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
      {(a) => <GirlsBody enabled={!!a.enabledAt} onToast={showToast} />}
    </ConecfShell>
  );
}
