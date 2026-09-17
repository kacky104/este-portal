'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getConecfAccess, type ConecfAccess } from '@/app/actions/conecf';
import { getMediaLinkAlerts } from '@/app/actions/mediaCredentials';
import type { MediaLinkAlert } from '@/lib/mediaLinkStall';
import { MediaBrandProvider, brandText, type MediaBrandValue } from '@/app/mypage/media/mediaBrand';
import { signOut } from '@/lib/auth';
import { useConecfHref } from './ConecfBase';
import { CONECF_NAV, type ConecfNavKey } from './conecfNav';

// コネックエフの外枠（第395便・1a・2026-09-17）。
// ★ 骨格はフクエスリンク（MediaShell）と同じ：左サイドバー・1画面1機能・スマホは三本線→ドロワー。
// ★ 色は紺（indigo）を引き継ぐ（カッキーさんの決定）。
// ★ 権限はサーバー（getConecfAccess）で決める。★ ログインしていなければログイン画面へ。

export function ConecfLogo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="flex-none grid place-items-center text-white bg-gradient-to-br from-indigo-700 to-indigo-500"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* ★ 仮のマーク（点と点をつなぐ）。★ ロゴが決まったら差し替える */}
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="18" cy="18" r="3" />
        <path d="M8.6 10.5l6.8-3.2M8.6 13.5l6.8 3.2" />
      </svg>
    </span>
  );
}

function NavIcon({ k }: { k: ConecfNavKey }) {
  const p = {
    width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className: 'flex-shrink-0',
  };
  switch (k) {
    case 'home':         return (<svg {...p}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>);
    case 'sites':        return (<svg {...p}><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>);
    case 'girls':        return (<svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></svg>);
    case 'girlsSync':    return (<svg {...p}><circle cx="9" cy="8" r="4" /><path d="M2 21v-1a6 6 0 0 1 6-6h2" /><path d="M16 15h6M19 12v6" /></svg>);
    case 'schedule':     return (<svg {...p}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></svg>);
    case 'scheduleSync': return (<svg {...p}><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>);
    case 'now':          return (<svg {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>);
    case 'diary':        return (<svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>);
    case 'news':         return (<svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>);
    case 'cocoa':        return (<svg {...p}><path d="M4 8h13a3 3 0 0 1 0 6h-1" /><path d="M4 8v7a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V8z" /><path d="M8 2v2M12 2v2" /></svg>);
    case 'log':          return (<svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
    case 'matrix':       return (<svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16" /></svg>);
    case 'guide':        return (<svg {...p}><path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z" /><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z" /></svg>);
    case 'qa':           return (<svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14" /><path d="M12 17h.01" /></svg>);
    default:             return null;
  }
}

export function ConecfShell({
  current, title, toast, children,
}: {
  current: ConecfNavKey;
  title: string;
  /** ★ 画面の上に一時的に出す一言（useToast） */
  toast?: string;
  /** ★ 権限が確かめられてから描く（★ 店舗が無い人に中身を一瞬でも見せない） */
  children: (access: Extract<ConecfAccess, { ok: true }>) => React.ReactNode;
}) {
  const href = useConecfHref();
  const [access, setAccess] = useState<ConecfAccess | null>(null);
  const [error, setError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [alerts, setAlerts] = useState<MediaLinkAlert[]>([]);

  // ★ 第396便（1b）: フクエスリンクの画面を中で使うので、行き先と名前をコネックエフに差し替える
  const brand: MediaBrandValue = {
    name: 'コネックエフ',
    links: {
      home: href('/'), login: href('/sites'), roster: href('/girls/sync'), work: href('/schedule/sync'),
      schedule: href('/schedule'), diary: href('/diary'), news: href('/news'), log: href('/log'),
      matrix: href('/matrix'), qa: href('/qa'), guide: href('/guide'), girls: href('/girls'),
    },
  };

  // ★ 止まっている連携の赤帯（MediaShell と同じ）。★ 失敗しても画面は止めない
  const salonIdForAlerts = access && access.ok ? access.salonId : null;
  useEffect(() => {
    if (salonIdForAlerts == null) { setAlerts([]); return; }
    let alive = true;
    getMediaLinkAlerts({ salonId: salonIdForAlerts }).then((res) => { if (alive && res.ok) setAlerts(res.data); }).catch(() => {});
    return () => { alive = false; };
  }, [salonIdForAlerts]);

  useEffect(() => {
    let alive = true;
    getConecfAccess()
      .then((a) => {
        if (!alive) return;
        if (!a.ok && a.reason === 'login') {
          window.location.replace(href('/login'));
          return;
        }
        setAccess(a);
      })
      .catch(() => { if (alive) setError('読み込めませんでした。しばらくしてから開き直してください。'); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [drawerOpen]);

  const onLogout = async () => {
    try { await signOut(); } finally { window.location.replace(href('/login')); }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <p className="text-slate-500 text-[16px] text-center leading-relaxed">{error}</p>
      </div>
    );
  }

  if (!access || (!access.ok && access.reason === 'login')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400 text-[16px]">読み込み中...</p>
      </div>
    );
  }

  if (!access.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white border border-slate-200 shadow-sm p-7 text-center space-y-4">
          <div className="flex justify-center"><ConecfLogo /></div>
          <p className="text-[16px] font-black text-slate-800">店舗情報が見つかりません</p>
          <p className="text-[14px] text-slate-500 leading-relaxed">
            このアカウントには、コネックエフで使える店舗がありません。<br />
            ログイン中: {access.email}
          </p>
          <button
            type="button"
            onClick={() => void onLogout()}
            className="w-full py-2.5 border border-slate-300 text-[14px] font-bold text-slate-600 hover:bg-slate-50"
          >
            別のアカウントでログインする
          </button>
        </div>
      </div>
    );
  }

  const navList = (onPick?: () => void) =>
    CONECF_NAV.map((n) => {
      const on = n.key === current;
      return (
        <div key={n.key} className="contents">
          {n.group && (
            <div className="px-4 pt-3.5 pb-1 text-[13px] font-bold text-slate-400 tracking-wider">{n.group}</div>
          )}
          <Link
            href={href(n.href)}
            onClick={onPick}
            aria-current={on ? 'true' : undefined}
            className={`relative flex items-center gap-2.5 whitespace-nowrap px-4 py-3 text-[15px] md:text-[16px] font-bold transition-colors ${
              on ? 'bg-gradient-to-r from-indigo-700 to-indigo-500 text-white' : 'text-slate-600 hover:bg-indigo-50'
            }`}
          >
            <span className={on ? 'text-white' : 'text-indigo-500'}><NavIcon k={n.key} /></span>
            {n.label}
            {on && (
              <span className="hidden md:block absolute -right-px top-1/2 -translate-y-1/2 w-0 h-0 border-y-[8px] border-y-transparent border-r-[8px] border-r-slate-100" />
            )}
          </Link>
        </div>
      );
    });

  const shopBox = (small: boolean) => (
    <div className={`px-4 ${small ? 'py-2.5' : 'py-3'} border-b border-slate-100`}>
      <div className={`${small ? 'text-[12px]' : 'text-[12.5px]'} font-bold text-slate-400 tracking-wider`}>
        {access.role === 'operator' ? '運営' : '店舗'}
      </div>
      <div className={`${small ? 'text-[14.5px]' : 'text-[15.5px]'} font-bold text-slate-600 mt-0.5 leading-snug break-words`}>
        {access.salonName || access.email}
      </div>
    </div>
  );

  return (
    <MediaBrandProvider value={brand}>
    <div className="min-h-screen md:flex">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-indigo-200 shadow-lg px-6 py-3 text-[16px] font-bold text-indigo-700">
          {toast}
        </div>
      )}
      {/* ── 左サイドバー（PC）── */}
      <aside className="hidden md:block bg-white md:border-r border-slate-200 md:w-[288px] md:flex-none md:h-screen md:overflow-y-auto md:overscroll-contain scrollbar-none md:sticky md:top-0 md:self-start md:pb-12">
        <Link href={href('/')} className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-100">
          <ConecfLogo />
          <b className="text-[18px] font-black text-slate-800 tracking-tight">コネックエフ</b>
        </Link>
        {shopBox(false)}
        <nav aria-label="画面" className="flex flex-col py-2">{navList()}</nav>
        <div className="px-4 pt-3 mt-2 border-t border-slate-100">
          <button type="button" onClick={() => void onLogout()} className="text-[13.5px] font-bold text-slate-400 hover:text-indigo-600">
            ログアウト
          </button>
        </div>
      </aside>

      {/* ── 右側 ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          <Link
            href={href('/')}
            aria-label="ホームへ"
            className="md:hidden flex w-full items-center gap-2.5 px-4 py-2.5 bg-gradient-to-r from-indigo-700 to-indigo-500"
          >
            <span className="w-7 h-7 flex-none grid place-items-center bg-white text-indigo-600">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="6" cy="12" r="3" /><circle cx="18" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M8.6 10.5l6.8-3.2M8.6 13.5l6.8 3.2" />
              </svg>
            </span>
            <b className="text-[16px] font-black text-white tracking-tight">コネックエフ</b>
            <span className="ml-auto text-[11.5px] font-bold text-white/85 truncate max-w-[45%]">{access.salonName}</span>
          </Link>
          <div className="px-4 md:px-6 py-3 flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="メニューを開く"
              aria-expanded={drawerOpen}
              className="md:hidden -ml-1 p-1 text-indigo-600"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <h1 className="text-[17px] font-black text-slate-800 truncate">{title}</h1>
          </div>
          {alerts.length > 0 && (
            <div className="px-4 md:px-6 pb-2.5">
              {alerts.map((a) => (
                <div key={a.watch + ':' + a.reason + ':' + a.provider + '#' + a.slot} className="mb-2 border border-rose-300 bg-rose-50 px-3 py-2.5">
                  <p className="text-[14px] font-bold text-rose-700">
                    {a.watch === 'import' ? '駅ちかからの取り込みが止まっています' : '連携が止まっています'}
                  </p>
                  <p className="mt-1 text-[14px] leading-relaxed text-rose-900">{brandText('コネックエフ', a.message)}</p>
                </div>
              ))}
            </div>
          )}
        </header>

        <main className="link-zoom px-4 md:px-6 py-4 md:py-5 max-w-3xl w-full">{children(access)}</main>
      </div>

      {/* ── スマホの左ドロワー ── */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} aria-hidden />
          <nav
            aria-label="コネックエフのメニュー"
            className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-white shadow-2xl overflow-y-auto overscroll-contain pb-24 [padding-bottom:calc(6rem+env(safe-area-inset-bottom))]"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
              <Link href={href('/')} onClick={() => setDrawerOpen(false)} className="flex items-center gap-2.5 min-w-0">
                <ConecfLogo size={28} />
                <b className="text-[16px] font-black text-slate-800 tracking-tight truncate">コネックエフ</b>
              </Link>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="閉じる" className="flex-none p-1 text-slate-400 hover:text-slate-600">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            {shopBox(true)}
            <div className="flex flex-col py-1.5">{navList(() => setDrawerOpen(false))}</div>
            <button
              type="button"
              onClick={() => void onLogout()}
              className="mt-2 w-full text-left px-4 py-3 border-t border-slate-100 text-[14.5px] font-bold text-slate-500"
            >
              ログアウト
            </button>
          </nav>
        </div>
      )}
    </div>
    </MediaBrandProvider>
  );
}

/** ★ 1a の中身（準備中）。★ 画面ができたら差し替える */
export function ConecfComingSoon({ note }: { note?: string }) {
  return (
    <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-8 text-center space-y-2">
      <p className="text-[16px] font-black text-slate-700">準備中です</p>
      <p className="text-[14px] text-slate-500 leading-relaxed">{note ?? 'この画面は、順番に使えるようにしていきます。'}</p>
    </div>
  );
}
