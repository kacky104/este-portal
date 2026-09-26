'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useConecfHref } from './ConecfBase';
import { listConecfGirls, type ConecfGirlRow } from '@/app/actions/conecfGirls';
import { getSalonCastLinks } from '@/app/actions/castInvite';

// ★ 第884便（カッキーさん）: ホームに「セラピストページ連携」の連携率と、まだ連携していない方の一覧。
// ★ ねらい: オーナー様が数字を見て、未連携の方を招待したくなるように。
// ★ 数えるのは【公開中】のセラピストだけ（★ 非公開＝お休み・退店予定の方で率を下げない）。
// ★ 招待そのものは各セラピストの編集ページ（基本情報）で行う（★ ここは入口だけ。招待の処理を2つ持たない）。

const SHOW = 8;

export function CastLinkProgress({ salonId }: { salonId: number | null }) {
  const href = useConecfHref();
  const [girls, setGirls] = useState<ConecfGirlRow[] | null>(null);
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (salonId == null) return;
    let alive = true;
    void Promise.all([listConecfGirls(), getSalonCastLinks({ salonId })]).then(([g, l]) => {
      if (!alive) return;
      if (!g.ok || !l.ok) { setError(true); return; }
      setGirls(g.data.girls);
      setLinked(new Set(l.linkedIds));
      setInvited(new Set(l.invitedIds));
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [salonId]);

  // ★ 読めなかったときは出さない（★ 0% と書かない。読めていないことと0名は違う）
  if (salonId == null || error || !girls) return null;
  const active = girls.filter((g) => g.isActive);
  if (active.length === 0) return null;

  const done = active.filter((g) => linked.has(String(g.id)));
  // ★ 招待中の方を後ろに（★ まだ何もしていない方から招待してもらう）
  const rest = active
    .filter((g) => !linked.has(String(g.id)))
    .sort((a, b) => Number(invited.has(String(a.id))) - Number(invited.has(String(b.id))));
  const pct = Math.round((done.length / active.length) * 100);
  const shown = showAll ? rest : rest.slice(0, SHOW);

  return (
    <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5 space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <h3 className="text-[16px] font-bold text-slate-700">セラピストページ連携</h3>
        <p className="text-[14px] text-slate-500 tabular-nums">
          <b className="text-[22px] font-black text-indigo-700">{done.length}</b>
          <span className="mx-1">/</span>{active.length}名 連携済み（{pct}%）
        </p>
      </div>
      <div className="h-2.5 bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-700 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[13px] text-slate-500 leading-relaxed">
        連携したセラピストは、写メ日記・今すぐ・出勤を自分のスマホから更新できます。お店の入力が減り、写メ日記の転送にも連携が必要です。
        <span className="text-slate-400">（公開中の方だけ数えています）</span>
      </p>

      {rest.length === 0 ? (
        <p className="text-[14px] font-bold text-emerald-700">公開中のセラピスト全員が連携済みです。</p>
      ) : (
        <div>
          <p className="text-[13.5px] font-bold text-slate-600 mb-2">まだ連携していない方（{rest.length}名）</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {shown.map((g) => {
              const inv = invited.has(String(g.id));
              return (
                <li key={g.id} className="flex items-center gap-2.5 border border-slate-200 px-2.5 py-2">
                  <span className="w-9 h-9 flex-none rounded-full overflow-hidden bg-slate-100">
                    {g.imageUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={g.imageUrl} alt="" className="w-full h-full object-cover" />
                      : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-slate-700">{g.name || '（名前なし）'}</span>
                    <span className={`block text-[12px] ${inv ? 'text-amber-600' : 'text-rose-500'}`}>
                      {inv ? '招待中（本人のログイン待ち）' : '未連携'}
                    </span>
                  </span>
                  <Link href={href(`/girls/${g.id}`)}
                    className="flex-none h-8 px-3 inline-flex items-center border border-indigo-300 text-indigo-700 text-[12.5px] font-bold hover:bg-indigo-50">
                    {inv ? '確認する' : '招待する'}
                  </Link>
                </li>
              );
            })}
          </ul>
          {rest.length > shown.length && (
            <button type="button" onClick={() => setShowAll(true)} className="mt-2 text-[14px] font-bold text-slate-500 underline">
              残り{rest.length - shown.length}名を見る
            </button>
          )}
        </div>
      )}
    </div>
  );
}
