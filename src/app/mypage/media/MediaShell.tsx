'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getMediaLinkAlerts } from '@/app/actions/mediaCredentials';
import type { MediaLinkAlert } from '@/lib/mediaLinkStall';
import type { MediaPageDecision } from '@/lib/mediaVisibility';

// 媒体連携のページの外枠 ——【フクエスリンク】（第60便で見た目を差し替え）。
//
// ★★★ なぜ別サイトの見た目にするか（2026-08-30・カッキーさんの決定）
//   媒体連携は、店舗にとって「フクエスの1機能」ではなく【他媒体をまとめる道具】。
//   ★ フクエスワーク・fukuX と同じく、別の名前と見た目を持たせる。
//   ★ 名前は「フクエスリンク」。色は紺（本体のピンクからも、ベンリーの青緑からも離す）。
//
// ★ 骨格はベンリーに寄せた（2026-08-30 の実物調査・設計メモ §152）:
//   左サイドバーで1画面1機能／いまどこにいるかが常に見える／地はグレー・カードは白。
//
// ★★ 中身の決めごとは変えていない。
//   状態を上に、説明は本文から追い出す、できないことは理由といっしょに出す。
// ★ 足場だった /mypage/media/all（全部入り）は第65便で畳んだ。
//   ★ 6つの画面すべてが、この外枠を被って同じ形で並ぶ。

// ★ 'all'（全部入り）は第65便で畳んだ。★ 型からも外して、行き先を作れなくする
export type MediaNavKey = 'home' | 'work' | 'diary' | 'roster' | 'login' | 'log';

const NAV: Array<{ key: MediaNavKey; label: string; href: string; group?: string }> = [
  { key: 'home',   label: 'ホーム',           href: '/mypage/media' },
  // ★ セラピスト一覧は【基本の情報】なので、送る作業より上に置く（カッキーさん・2026-08-30）
  { key: 'roster', label: 'セラピスト一覧',    href: '/mypage/media/therapists' },
  { key: 'work',   label: '出勤を送る',        href: '/mypage/media/work',       group: '送る・確かめる' },
  { key: 'diary',  label: '写メ日記の投稿先',   href: '/mypage/media/diary' },
  { key: 'login',  label: 'ログイン情報',      href: '/mypage/media/login',      group: '設定・記録' },
  { key: 'log',    label: '連携の記録',        href: '/mypage/media/log' },
];

function NavIcon({ k }: { k: MediaNavKey }) {
  const p = {
    width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    className: 'flex-shrink-0',
  };
  switch (k) {
    case 'home':   return (<svg {...p}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>);
    case 'work':   return (<svg {...p}><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>);
    case 'diary':  return (<svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>);
    case 'roster': return (
      <svg {...p}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
    );
    case 'login':  return (<svg {...p}><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>);
    default:       return (<svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
  }
}

export function MediaShell({
  decision, loadError, salonId, salonName, title, current, toast, children,
}: {
  decision: MediaPageDecision;
  loadError: string;
  salonId: number | null;
  salonName?: string | null;
  title: string;
  current: MediaNavKey;
  toast?: string;
  children: React.ReactNode;
}) {
  const [alerts, setAlerts] = useState<MediaLinkAlert[]>([]);

  // ★ 出す相手にしか取りに行かない（取りに行くこと自体が媒体連携の存在を明かすため）。
  //   ★ 失敗しても画面は止めない。警告が出せないことを「異常なし」と見せないだけ。
  useEffect(() => {
    if (decision !== 'show' || salonId == null) { setAlerts([]); return; }
    let alive = true;
    (async () => {
      const res = await getMediaLinkAlerts({ salonId });
      if (alive && res.ok) setAlerts(res.data);
    })();
    return () => { alive = false; };
  }, [decision, salonId]);

  // ★★ 'show' 以外では【そもそも描かない】。hidden で隠すとページの中身から読めてしまう。
  if (decision === 'leave') return null;

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <p className="text-slate-500 text-sm whitespace-pre-line text-center leading-relaxed px-6">{loadError}</p>
      </div>
    );
  }

  if (decision !== 'show') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <p className="text-slate-400 text-sm">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 md:flex">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-indigo-200 shadow-lg px-6 py-3 text-sm font-bold text-indigo-700">
          {toast}
        </div>
      )}

      {/* ── 左サイドバー（スマホでは上の横並び）───────────────────── */}
      <aside className="bg-white border-b md:border-b-0 md:border-r border-slate-200 md:w-[252px] md:flex-none md:min-h-screen md:sticky md:top-0 md:self-start">
        <div className="flex items-center gap-2.5 px-3.5 md:px-4 py-3 md:py-4 border-b border-slate-100">
          <span className="w-7 h-7 md:w-9 md:h-9 flex-none grid place-items-center text-white bg-gradient-to-br from-indigo-700 to-indigo-500">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </span>
          <b className="text-[14px] md:text-[16px] font-black text-slate-800 tracking-tight">フクエスリンク</b>
        </div>

        {salonName && (
          <div className="hidden md:block px-4 py-3 border-b border-slate-100">
            <div className="text-[10.5px] font-bold text-slate-400 tracking-wider">店舗</div>
            <div className="text-[13.5px] font-bold text-slate-600 mt-0.5 leading-snug break-words">{salonName}</div>
          </div>
        )}

        <nav aria-label="画面" className="flex md:flex-col overflow-x-auto md:overflow-visible gap-1 md:gap-0 p-1.5 md:p-0 md:py-2">
          {NAV.map((n) => {
            const on = n.key === current;
            return (
              <div key={n.key} className="contents">
                {n.group && (
                  <div className="hidden md:block px-4 pt-3.5 pb-1 text-[11px] font-bold text-slate-400 tracking-wider">
                    {n.group}
                  </div>
                )}
                <Link
                  href={n.href}
                  aria-current={on ? 'true' : undefined}
                  className={`relative flex items-center gap-2 md:gap-2.5 whitespace-nowrap px-3 md:px-4 py-1.5 md:py-3 text-[12.5px] md:text-[14px] font-bold transition-colors ${
                    on
                      ? 'bg-gradient-to-r from-indigo-700 to-indigo-500 text-white'
                      : 'text-slate-600 hover:bg-indigo-50'
                  }`}
                >
                  <span className={on ? 'text-white' : 'text-indigo-500'}><NavIcon k={n.key} /></span>
                  {n.label}
                  {/* ★ 選択中の右端に三角（ベンリーと同じ合図）。★ スマホでは出さない */}
                  {on && (
                    <span className="hidden md:block absolute -right-px top-1/2 -translate-y-1/2 w-0 h-0 border-y-[8px] border-y-transparent border-r-[8px] border-r-slate-100" />
                  )}
                </Link>
              </div>
            );
          })}
        </nav>

        <p className="hidden md:block px-4 py-3.5 mt-2 border-t border-slate-100 text-[11.5px] text-slate-400 leading-relaxed">
          駅ちか・エステラブ・エステ魂・全国エステランキングとの連携をまとめて扱います。
        </p>
      </aside>

      {/* ── 右側 ───────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-3">
            <h1 className="text-[15px] font-black text-slate-800">{title}</h1>
            <Link href="/mypage" className="text-[11.5px] font-bold text-slate-400 hover:text-indigo-600 transition-colors">
              マイページへ戻る
            </Link>
          </div>

          {alerts.length > 0 && (
            <div className="px-4 md:px-6 pb-2.5">
              {alerts.map((a) => (
                <div
                  key={a.watch + ':' + a.reason + ':' + a.provider + '#' + a.slot}
                  className="mb-2 border border-rose-300 bg-rose-50 px-3 py-2.5"
                >
                  <p className="text-[12px] font-bold text-rose-700">
                    {a.watch === 'import' ? '駅ちかからの取り込みが止まっています' : '媒体連携が止まっています'}
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-rose-900">{a.message}</p>
                </div>
              ))}
            </div>
          )}
        </header>

        <main className="px-4 md:px-6 py-4 md:py-5 max-w-3xl w-full">{children}</main>
      </div>
    </div>
  );
}
