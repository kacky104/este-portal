'use client';

import { useEffect, useRef, useState } from 'react';
import type { ConecfAccess } from '@/app/actions/conecf';
import { listConecfOperatorSalons, setConecfActingSalon, type ConecfOperatorSalon } from '@/app/actions/conecf';
import { operatorSalonNote, actingScreenIsStale, CONECF_ACT_SIGNAL_KEY } from '@/lib/conecfActing';
import { useConecfSession } from './ConecfSession';
import { useConecfHref } from './ConecfBase';

// コネックエフ: 運営だけに出る帯（第1399便・2026-10-11・カッキーさん）。
//
// ★ 運営アカウントでログインしているときだけ ConecfShell が置く（店舗様には出ない）。
// ★ 2つの役目:
//   ① 店を選んで、その店のコネックエフを開く（選んだ店はサーバーが cookie に入れる。決めごとは lib/conecfActing.ts）
//   ② ほかの人の店を操作している間、どの画面でもいちばん上に「運営として『◯◯』を操作中」を出す
//      （押し間違いで、別の店の出勤を各サイトへ送らないため）。
// ★ 店を変えた・やめたあとは、ホームへ移って画面をまるごと読み直す
//   （前の店の一覧や入力途中の内容を、画面に残したまま次の店を操作しないため）。
// ★★★ タブを2つ開いているとき: 選んだ店は cookie 1つなので、あとから選んだ店が全部のタブに効く。
//   古いタブが前の店の画面のまま残ると、その画面での保存が【あとから選んだ店】に入ってしまう。
//   → ① 別のタブで店を変えたら、その場で知らせを受けて読み直す（localStorage の storage イベント）
//     ② タブに戻ってきたとき、サーバーが見ている店を読み直し、開いたときの店と違えば読み直す（①が届かなかったときの控え）

type Ok = Extract<ConecfAccess, { ok: true }>;

export function OperatorBar({ access }: { access: Ok }) {
  const href = useConecfHref();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<ConecfOperatorSalon[] | null>(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reloadHome = () => { window.location.assign(href('/')); };

  // ── ほかのタブで店を変えた／やめたら、この画面を読み直す ──
  const { refresh } = useConecfSession();
  const shownRef = useRef({ salonId: access.salonId, acting: access.acting });
  useEffect(() => {
    if (actingScreenIsStale(shownRef.current, { salonId: access.salonId, acting: access.acting })) {
      window.location.assign(href('/'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.salonId, access.acting]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === CONECF_ACT_SIGNAL_KEY) window.location.assign(href('/')); };
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('storage', onStorage); document.removeEventListener('visibilitychange', onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);
  /** ほかのタブへ知らせる（★ 値は毎回変える＝同じ店を選び直しても届く。失敗しても②の控えがある） */
  const signal = (salonId: number | null) => {
    try { window.localStorage.setItem(CONECF_ACT_SIGNAL_KEY, `${salonId ?? ''}:${Date.now()}`); } catch { /* 使えない環境では②に任せる */ }
  };

  const onOpen = async () => {
    setOpen(true);
    setError('');
    if (list) return;
    setBusy(true);
    const res = await listConecfOperatorSalons();
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setList(res.data);
    if (access.salonId != null) setPick(String(access.salonId));
  };

  const onGo = async () => {
    const id = Number(pick);
    if (!Number.isInteger(id) || id <= 0) { setError('店舗を選んでください'); return; }
    setBusy(true);
    setError('');
    const res = await setConecfActingSalon({ salonId: id });
    if (!res.ok) { setBusy(false); setError(res.error); return; }
    signal(id);
    reloadHome();
  };

  const onStop = async () => {
    setBusy(true);
    setError('');
    const res = await setConecfActingSalon({ salonId: null });
    if (!res.ok) { setBusy(false); setError(res.error); return; }
    signal(null);
    reloadHome();
  };

  const acting = access.acting;
  const btn = 'h-8 px-3 text-[13px] font-bold border disabled:opacity-40';

  return (
    <div className={acting ? 'bg-amber-300 text-slate-900' : 'bg-slate-800 text-white'}>
      <div className="px-4 md:px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {acting ? (
          <>
            <b className="text-[14px] leading-snug">運営として「{access.salonName || `店舗 ${access.salonId}`}」を操作中</b>
            <span className="text-[12.5px] leading-snug">保存・各サイトへの送信は、この店舗様の内容として実行されます。</span>
          </>
        ) : (
          <span className="text-[13px] font-bold">運営メニュー</span>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void onOpen()} disabled={busy}
            className={`${btn} ${acting ? 'border-slate-800 bg-white text-slate-900' : 'border-white/70 bg-transparent text-white'}`}>
            {acting ? '店舗を変える' : '店舗を選んで開く'}
          </button>
          {acting && (
            <button type="button" onClick={() => void onStop()} disabled={busy} className={`${btn} border-slate-800 bg-slate-800 text-white`}>
              やめる
            </button>
          )}
        </span>
      </div>
      {open && (
        <div className={`px-4 md:px-6 pb-3 ${acting ? '' : 'text-white'}`}>
          <div className="bg-white text-slate-900 border border-slate-300 p-3 space-y-2">
            <p className="text-[13px] leading-relaxed">
              開く店舗を選んでください。選ぶと、その店舗様のコネックエフをそのまま操作できます（保存・各サイトへの送信もできます）。「やめる」を押すか、ブラウザを閉じるまで続きます。
            </p>
            {list == null ? (
              <p className="text-[13px] text-slate-500">{busy ? '読み込み中…' : ''}</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="店舗"
                  className="h-9 min-w-0 flex-1 basis-[240px] border border-slate-300 bg-white px-2 text-[14px]">
                  <option value="">店舗を選ぶ</option>
                  {list.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.id}：{s.name || '（店名なし）'}（{operatorSalonNote(s)}）
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => void onGo()} disabled={busy || pick === ''} className={`${btn} border-indigo-700 bg-indigo-700 text-white`}>
                  {busy ? '開いています…' : 'この店舗を開く'}
                </button>
                <button type="button" onClick={() => { setOpen(false); setError(''); }} disabled={busy} className={`${btn} border-slate-300 bg-white text-slate-600`}>
                  閉じる
                </button>
              </div>
            )}
            {error && <p className="text-[13px] font-bold text-rose-700">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/** 運営として操作中は、まだ使えない所に置く札（第1399便。お知らせ・フクエスの上位表示・写真のアップロードは次の便） */
export function OperatorNotYet({ what }: { what: string }) {
  return (
    <div className="border border-amber-400 bg-amber-50 px-4 py-3.5">
      <p className="text-[14px] font-bold text-amber-800">運営として操作しているときは、まだ使えません</p>
      <p className="mt-1 text-[13.5px] leading-relaxed text-amber-900">
        {what}は、店舗様ご本人のログインでだけ使えます（運営から使えるようにする対応は、これから入れます）。
      </p>
    </div>
  );
}
