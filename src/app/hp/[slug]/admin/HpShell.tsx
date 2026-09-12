'use client';

import { useEffect, useState } from 'react';
import { HP_ADMIN_NAV, HP_ADMIN_TITLE, type HpAdminSection } from './adminNav';

// 公式HP管理の外枠（第278便・2026-09-12・カッキーさんの指示）。
//
// ★★★ 骨格はフクエスワーク（WorkShell.tsx）と【同じ形】にそろえた。★ 迷わせないため:
//   左サイドバーで1画面1機能／いまどこにいるかが常に見える／カードは白。
//   ★ 直すときは WorkShell と見比べること（★ 片方だけ直すと、店舗が混乱する）。
// ★ 違うのは色だけ。★ フクエスワーク＝緑、ここ＝【赤】（地のレッド壁紙に合わせる）。
//
// ★★ スマホの形も WorkShell と同じ:
//   ★ 上の横並びメニューは出さない。★ 画面名の左に三本線を置き、左からドロワー。
//   ★ 背面タップ／×／Esc／項目タップで閉じる・開いている間は body を止める。
//
// ★★ 行き先はURLではなく【その場の切り替え】（onSelect）。★ /mypage/jobs と違い、
//   ここは1つのページ（/admin）の中で出し分けている。★ 入力中の内容を持ったまま
//   画面を移れるようにするため（★ ページを移ると、保存前の文字が消える）。

function NavIcon({ k }: { k: HpAdminSection }) {
  const p = {
    width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    className: 'flex-shrink-0',
  };
  switch (k) {
    // 家（ホーム）
    case 'home': return (<svg {...p}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>);
    // ★ 'design' のアイコンは第285便（2026-09-12）で削除。★ ホームに入ったため。
    // ★ 'concept'（文章）のアイコンは第282便（2026-09-12）で削除。★ ホームに入ったため。
    // 写真（トップ画像）
    case 'hero': return (<svg {...p}><rect x="3" y="3" width="18" height="18" rx="0" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>);
    // 積み木（表示ブロック）
    case 'blocks': return (<svg {...p}><rect x="3" y="3" width="18" height="6" /><rect x="3" y="12" width="18" height="9" /></svg>);
    // 旗（バナー）
    case 'banner': return (<svg {...p}><path d="M4 21V4h16l-3 4 3 4H4" /></svg>);
    // 鎖（リンク）
    case 'links': return (<svg {...p}><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>);
    // 星（ロゴ・アイコン）
    case 'brand': return (<svg {...p}><path d="M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6L12 16.8 6.6 19.6l1.2-6L3.3 9.4l6.1-.8z" /></svg>);
    // 人（担当者アカウント）
    default: return (
      <svg {...p}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    );
  }
}

/** ★ 選択中の項目の色（★ 地のレッド壁紙と同じ系統）。★ ここ1か所で決める。 */
const ON_BG = 'linear-gradient(90deg,#BE123C,#FB7185)';

export function HpShell({
  salonName, salonDomain, current, sections, onSelect, mypageHref, toast, children,
}: {
  salonName: string;
  /** ★ サイドバーの頭に小さく出す（★ どのサイトを触っているかの目印）。無ければ出さない。 */
  salonDomain?: string | null;
  current: HpAdminSection;
  /** ★ 出してよい画面。★ デザイン未確定・オーナー以外では減る（★ 判断は呼ぶ側の1か所）。 */
  sections: HpAdminSection[];
  onSelect: (k: HpAdminSection) => void;
  /** ★ 「マイページへ戻る」の行き先。★ 店舗ドメインで開いているときは絶対URLが渡る。 */
  mypageHref: string;
  toast?: string;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ★ 開いている間は後ろを動かさない＋Esc で閉じる（WorkShell と同じ）。
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

  // ★ 項目の並びは1か所（HP_ADMIN_NAV）。★ PCのサイドバーとスマホのドロワーで同じものを描く。
  const navList = (onNavigate?: () => void) =>
    HP_ADMIN_NAV.filter((n) => sections.includes(n.key)).map((n) => {
      const on = n.key === current;
      return (
        <button
          key={n.key}
          type="button"
          onClick={() => { onSelect(n.key); onNavigate?.(); }}
          aria-current={on ? 'true' : undefined}
          className={`relative flex w-full items-center gap-2.5 px-4 py-3 text-left text-[15.5px] md:text-[16px] font-bold transition-colors ${
            on ? 'text-white' : 'text-slate-600 hover:bg-rose-50'
          }`}
          style={on ? { background: ON_BG } : undefined}
        >
          <span className={on ? 'text-white' : 'text-rose-500'}><NavIcon k={n.key} /></span>
          {n.label}
          {/* ★ 選択中の右端に三角（フクエスワークと同じ合図）。★ スマホでは出さない。 */}
          {on && (
            <span className="hidden md:block absolute -right-px top-1/2 -translate-y-1/2 w-0 h-0 border-y-[8px] border-y-transparent border-r-[8px] border-r-slate-100" />
          )}
        </button>
      );
    });

  // ★ 地の色（レッドのテーマ壁紙）は layout.tsx が敷く。★ ここでは塗らない（★ 塗ると壁紙が隠れる）。
  return (
    <div className="min-h-screen md:flex">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-rose-200 shadow-lg px-6 py-3 text-[16px] font-bold text-rose-700 max-w-[90vw] text-center">
          {toast}
        </div>
      )}

      {/* ── 左サイドバー（★ PCだけ。スマホは三本線→ドロワー）───────────── */}
      <aside className="hidden md:block bg-white md:border-r border-slate-200 md:w-[288px] md:flex-none md:min-h-screen md:sticky md:top-0 md:self-start">
        <button
          type="button"
          onClick={() => onSelect('home')}
          aria-label="ホームへ"
          className="flex w-full items-center gap-2.5 px-4 py-4 border-b border-slate-100 text-left hover:bg-slate-50 transition-colors"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="w-7 h-7 flex-none" />
          <b className="text-[18px] font-black text-slate-800 tracking-tight">フクエスサイト</b>
        </button>

        <div className="px-4 py-3 border-b border-slate-100">
          <div className="text-[12.5px] font-bold text-slate-400 tracking-wider">店舗</div>
          <div className="text-[15.5px] font-bold text-slate-600 mt-0.5 leading-snug break-words">{salonName}</div>
          {salonDomain && (
            <div className="text-[12px] font-bold text-slate-400 mt-1 break-all">{salonDomain}</div>
          )}
        </div>

        <nav aria-label="画面" className="flex flex-col py-2">{navList()}</nav>

        <p className="px-4 py-3.5 mt-2 border-t border-slate-100 text-[13.5px] text-slate-400 leading-relaxed">
          お店の公式ホームページ（フクエスサイト）の写真・文章をここで変更します。
        </p>
      </aside>

      {/* ── 右側 ───────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          {/* ★ スマホの頭の帯。★ 押すとホームへ戻る（フクエスワークと同じ作法）。 */}
          <button
            type="button"
            onClick={() => onSelect('home')}
            aria-label="ホームへ"
            className="md:hidden flex w-full items-center gap-2.5 px-4 py-2.5 text-left"
            style={{ background: ON_BG }}
          >
            <span className="w-7 h-7 flex-none grid place-items-center rounded-full bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="w-full h-full object-contain" />
            </span>
            <b className="text-[16px] font-black text-white tracking-tight">フクエスサイト</b>
            <span className="ml-auto text-[11.5px] font-bold text-white/85 truncate max-w-[45%]">{salonName}</span>
          </button>

          <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {/* ★ スマホだけ: 画面名の【左】に三本線。 */}
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="メニューを開く"
                aria-expanded={drawerOpen}
                className="md:hidden -ml-1 p-1 text-rose-600"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
              <h1 className="text-[17px] font-black text-slate-800 truncate">{HP_ADMIN_TITLE[current]}</h1>
            </div>
            <a
              href={mypageHref}
              className="flex-none text-[13.5px] font-bold text-slate-400 hover:text-rose-600 transition-colors whitespace-nowrap"
            >
              マイページへ戻る
            </a>
          </div>
        </header>

        {/* ★★ 中身（メイン）だけ 1.2倍（★ フクエスワークの WorkShell と同じ・2026-09-12）。
            ★ zoom を使う。★ transform: scale だと場所だけ元の大きさのままで、
              右や下に余白・はみ出しが出る（レイアウトが付いてこない）。
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
            aria-label="ホームページ管理のメニュー"
            className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-white shadow-2xl overflow-y-auto overscroll-contain scrollbar-none pb-24 [padding-bottom:calc(6rem+env(safe-area-inset-bottom))]"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="" className="w-7 h-7 flex-none" />
                <b className="text-[16px] font-black text-slate-800 tracking-tight truncate">フクエスサイト</b>
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

            <div className="px-4 py-2.5 border-b border-slate-100">
              <div className="text-[12px] font-bold text-slate-400 tracking-wider">店舗</div>
              <div className="text-[14.5px] font-bold text-slate-600 mt-0.5 leading-snug break-words">{salonName}</div>
            </div>

            <div className="flex flex-col py-1.5">{navList(() => setDrawerOpen(false))}</div>

            <a
              href={mypageHref}
              className="mt-2 flex items-center gap-2.5 px-4 py-3 border-t border-slate-100 text-[14.5px] font-bold text-slate-500"
            >
              マイページへ戻る
            </a>
          </nav>
        </div>
      )}
    </div>
  );
}
