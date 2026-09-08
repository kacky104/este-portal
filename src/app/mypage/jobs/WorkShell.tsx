'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { JobsPageDecision } from './useJobsGate';

// フクエスワーク（求人）の外枠 ——【別サイトの見た目】（第220便・2026-09-08・カッキーさんの指示）。
//
// ★★★ なぜ別サイトの見た目にするか
//   求人は、店舗にとって「フクエスの1機能」ではなく【人を採るための別の仕事】。
//   ★ フクエスリンク（紺）と同じく、別の名前と見た目を持たせる。
//   ★ 名前は「フクエスワーク」。色は緑（#10B981→#84CC16。公開側 /jobs と同じ緑）。
//
// ★ 骨格はフクエスリンク（MediaShell）にそろえた。★ 迷わせないため、形は同じにする:
//   左サイドバーで1画面1機能／いまどこにいるかが常に見える／地はグレー・カードは白。
//   ★ 直すときは、この2つを見比べること（★ どちらか片方だけ直すと、店舗が混乱する）。
//
// ★★ スマホの形（2026-09-08・カッキーさんの指示で作り直し）
//   ★ 上の横並びメニュー（帯）は【出さない】。★ 画面名の左に三本線を置き、左からドロワーを出す。
//   ★ サイドバーは PC だけ（md 以上）。★ 中身（NAV）は1つ＝PCとスマホで並びがずれない。
//   ★ 作法は /mypage のドロワーと同じ: 背面タップ／×／Esc／項目タップで閉じる・開いている間は
//     body の overflow を hidden・スクロールバーは出さない（scrollbar-none）。

export type WorkNavKey = 'home' | 'edit' | 'applications' | 'news';

const NAV: Array<{ key: WorkNavKey; label: string; href: string; group?: string }> = [
  { key: 'home',         label: 'ホーム',     href: '/mypage/jobs' },
  // ★ 求人内容が【基本の情報】。★ ここが埋まらないと応募も新着情報も出せないので、いちばん近くに置く。
  { key: 'edit',         label: '求人内容',   href: '/mypage/jobs/edit' },
  { key: 'applications', label: '応募',       href: '/mypage/jobs/applications', group: '応募・お知らせ' },
  { key: 'news',         label: '新着情報',   href: '/mypage/jobs/news' },
];

function NavIcon({ k }: { k: WorkNavKey }) {
  const p = {
    width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    className: 'flex-shrink-0',
  };
  switch (k) {
    case 'home': return (<svg {...p}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>);
    // 書類（求人内容）
    case 'edit': return (<svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h4" /></svg>);
    // 人（応募）
    case 'applications': return (
      <svg {...p}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
    );
    // 吹き出し（新着情報）
    default: return (<svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>);
  }
}

/** ★ フクエスワークの印＝【緑の肉球】（public/logo-fukuwork.png）。
 *  ★ サイドバーの頭・ドロワーの頭・スマホの緑の帯で、同じものを使う（★ 二重管理をしない）。
 *  ★ onGreen: 緑の帯の上に置くとき。★ 肉球も緑なので、白い丸を敷かないと沈む。 */
function BrandMark({ size = 'md', onGreen = false }: { size?: 'sm' | 'md'; onGreen?: boolean }) {
  const box = size === 'sm' ? 'w-7 h-7' : 'w-7 h-7 md:w-9 md:h-9';
  return (
    <span className={`${box} flex-none grid place-items-center rounded-full ${onGreen ? 'bg-white' : ''}`}>
      <Image
        src="/logo-fukuwork.png"
        alt="フクエスワーク"
        width={36}
        height={36}
        className="w-full h-full object-contain"
      />
    </span>
  );
}

export function WorkShell({
  decision, loadError, salonName, title, current, toast, children,
}: {
  decision: JobsPageDecision;
  loadError: string;
  salonName?: string | null;
  title: string;
  current: WorkNavKey;
  toast?: string;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ★ 開いている間は後ろを動かさない＋Esc で閉じる（/mypage のドロワーと同じ）。
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [drawerOpen]);

  // ★★ 'show' 以外では【そもそも描かない】。hidden で隠すとページの中身から読めてしまう。
  if (decision === 'leave') return null;

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500 text-[16px] whitespace-pre-line text-center leading-relaxed px-6">{loadError}</p>
      </div>
    );
  }

  if (decision !== 'show') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400 text-[16px]">読み込み中...</p>
      </div>
    );
  }

  // ★ 項目の並びは1か所（NAV）。★ PCのサイドバーとスマホのドロワーで同じものを描く。
  const navList = (onNavigate?: () => void) =>
    NAV.map((n) => {
      const on = n.key === current;
      return (
        <div key={n.key} className="contents">
          {n.group && (
            <div className="px-4 pt-3.5 pb-1 text-[13px] font-bold text-slate-400 tracking-wider">
              {n.group}
            </div>
          )}
          <Link
            href={n.href}
            onClick={onNavigate}
            aria-current={on ? 'true' : undefined}
            className={`relative flex items-center gap-2.5 px-4 py-3 text-[15.5px] md:text-[16px] font-bold transition-colors ${
              on ? 'text-white' : 'text-slate-600 hover:bg-emerald-50'
            }`}
            style={on ? { background: 'linear-gradient(90deg,#059669,#84CC16)' } : undefined}
          >
            <span className={on ? 'text-white' : 'text-emerald-500'}><NavIcon k={n.key} /></span>
            {n.label}
            {/* ★ 選択中の右端に三角（フクエスリンクと同じ合図）。★ スマホでは出さない */}
            {on && (
              <span className="hidden md:block absolute -right-px top-1/2 -translate-y-1/2 w-0 h-0 border-y-[8px] border-y-transparent border-r-[8px] border-r-slate-100" />
            )}
          </Link>
        </div>
      );
    });

  // ★ 地の色（グリーンのテーマ壁紙）は layout.tsx が敷く。★ ここでは塗らない
  //   （★ 塗ると壁紙が隠れる）。
  return (
    <div className="min-h-screen md:flex">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-emerald-200 shadow-lg px-6 py-3 text-[16px] font-bold text-emerald-700">
          {toast}
        </div>
      )}

      {/* ── 左サイドバー（★ PCだけ。スマホは三本線→ドロワー）───────────── */}
      <aside className="hidden md:block bg-white md:border-r border-slate-200 md:w-[288px] md:flex-none md:min-h-screen md:sticky md:top-0 md:self-start">
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-100">
          <BrandMark />
          <b className="text-[18px] font-black text-slate-800 tracking-tight">フクエスワーク</b>
        </div>

        {salonName && (
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="text-[12.5px] font-bold text-slate-400 tracking-wider">店舗</div>
            <div className="text-[15.5px] font-bold text-slate-600 mt-0.5 leading-snug break-words">{salonName}</div>
          </div>
        )}

        <nav aria-label="画面" className="flex flex-col py-2">{navList()}</nav>

        <p className="px-4 py-3.5 mt-2 border-t border-slate-100 text-[13.5px] text-slate-400 leading-relaxed">
          セラピスト求人サイト「フクエスワーク」への掲載をまとめて扱います。
        </p>
      </aside>

      {/* ── 右側 ───────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          {/* ★★ スマホの頭の帯（2026-09-08・カッキーさんの指示）。★ 印＋「フクエスワーク」。
              ★ 緑を基調（サイドバーの印・選択中の項目と同じ #059669→#84CC16）。
              ★ PC は左サイドバーの頭に同じものが出ているので、ここには出さない。 */}
          <div
            className="md:hidden flex items-center gap-2.5 px-4 py-2.5"
            style={{ background: 'linear-gradient(90deg,#059669,#84CC16)' }}
          >
            <BrandMark size="sm" onGreen />
            <b className="text-[16px] font-black text-white tracking-tight">フクエスワーク</b>
            <span className="ml-auto text-[11.5px] font-bold text-white/85">セラピスト求人</span>
          </div>

          <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {/* ★ スマホだけ: 画面名の【左】に三本線（2026-09-08・カッキーさんの指示）。 */}
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="メニューを開く"
                aria-expanded={drawerOpen}
                className="md:hidden -ml-1 p-1 text-emerald-600"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
              <h1 className="text-[17px] font-black text-slate-800 truncate">{title}</h1>
            </div>
            <Link href="/mypage" className="flex-none text-[13.5px] font-bold text-slate-400 hover:text-emerald-600 transition-colors">
              マイページへ戻る
            </Link>
          </div>
        </header>

        {/* ★★ 中身（メイン）だけ 1.2倍（2026-09-09・カッキーさんの指示）。
            ★ zoom を使う。★ transform: scale だと場所だけ元の大きさのままで、
              右や下に余白・はみ出しが出る（レイアウトが付いてこない）。
              zoom は組み直してくれるので、折り返しも横スクロールも崩れない。
            ★ かかるのは中身だけ。★ 左サイドバー・上の帯・見出しの行は元の大きさのまま。
            ★ 幅は max-w-3xl のまま＝見た目では 768×1.2 ≒ 920px 相当になる。 */}
        <main className="px-4 md:px-6 py-4 md:py-5 max-w-3xl w-full" style={{ zoom: 1.2 }}>{children}</main>
      </div>

      {/* ── スマホの左ドロワー ───────────────────────────── */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="メニューを閉じる"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <nav
            aria-label="フクエスワークのメニュー"
            className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-white shadow-2xl overflow-y-auto overscroll-contain scrollbar-none pb-24 [padding-bottom:calc(6rem+env(safe-area-inset-bottom))]"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5 min-w-0">
                <BrandMark size="sm" />
                <b className="text-[16px] font-black text-slate-800 tracking-tight truncate">フクエスワーク</b>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="閉じる"
                className="flex-none p-1 text-slate-400 hover:text-slate-600"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {salonName && (
              <div className="px-4 py-2.5 border-b border-slate-100">
                <div className="text-[12px] font-bold text-slate-400 tracking-wider">店舗</div>
                <div className="text-[14.5px] font-bold text-slate-600 mt-0.5 leading-snug break-words">{salonName}</div>
              </div>
            )}

            <div className="flex flex-col py-1.5">{navList(() => setDrawerOpen(false))}</div>

            <Link
              href="/mypage"
              onClick={() => setDrawerOpen(false)}
              className="mt-2 flex items-center gap-2.5 px-4 py-3 border-t border-slate-100 text-[14.5px] font-bold text-slate-500"
            >
              マイページへ戻る
            </Link>
          </nav>
        </div>
      )}
    </div>
  );
}
