'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { ConecfAccess } from '@/app/actions/conecf';
import { setConecfActingSalon } from '@/app/actions/conecf';
import { MediaBrandProvider, brandText, type MediaBrandValue } from '@/app/mypage/media/mediaBrand';
import { signOut } from '@/lib/auth';
import { useConecfHref } from './ConecfBase';
import { useConecfSession } from './ConecfSession';
import { CONECF_NAV, AUTO_HUB_CHILDREN, type ConecfNavKey } from './conecfNav';
import { CONECF_STOPPED_MESSAGE } from '@/lib/setPlan';
import { OperatorBar } from './OperatorBar';

/** ★ 第1775便（カッキーさん）: 上に貼り付く見出し（運営の帯・警告で高さが変わる）の高さを --conecf-header-h に入れる。
 *  週間スケジュールの日付の行は、この高さのすぐ下に貼り付く。 */
function trackHeaderHeight(el: HTMLElement | null) {
  if (!el) return;
  const root = document.documentElement;
  const set = () => root.style.setProperty('--conecf-header-h', `${el.offsetHeight}px`);
  set();
  const ro = new ResizeObserver(set);
  ro.observe(el);
  return () => { ro.disconnect(); root.style.removeProperty('--conecf-header-h'); };
}

// コネックエフの外枠（第395便・1a・2026-09-17）。
// ★ 骨格はフクエスリンク（MediaShell）と同じ：左サイドバー・1画面1機能・スマホは三本線→ドロワー。
// ★ 色は紺（indigo）を引き継ぐ（カッキーさんの決定）。
// ★ 権限はサーバー（getConecfAccess）で決める。★ ログインしていなければログイン画面へ。
// ★ 第1117便: 権限・赤帯・ココアの出し分けは ConecfSession（layout の下）が1回で読む。ここは受け取って描くだけ。
// ★ 第1872便（カッキーさん「全体の見た目を良くする」）: サイドバーは「いま居る画面」を角丸の紺の帯に（全幅の帯＋三角はやめた）。
//   まとまりの見出しは小さな色つきの文字、ロゴ・店名のまとまりを整理。見出し（h1）は太く・大きく。トーストは紺の濃い帯。

export function ConecfLogo({ size = 36 }: { size?: number }) {
  // ★ コネックエフの新ロゴ（青いF・透過）。第405便・2026-09-17・カッキーさん。
  // ★ public/conecf-mark.png（余白入り透過PNG）を next/image で表示する（fukuX の /fukux-mark.png と同じ作り）。
  return (
    <Image
      src="/conecf-mark.png"
      alt="コネックエフ"
      width={size}
      height={size}
      priority
      className="flex-none object-contain"
      style={{ width: size, height: size }}
    />
  );
}

// ★ 第1850〜1852便（カッキーさん）: サイドバーのまとまりごとの色（見出しとアイコン）。書いていないものは今まで通り
const GROUP_TONE: Record<string, string> = { 'セラピスト': 'text-pink-500', '出勤': 'text-emerald-600', '写メ日記・新着': 'text-amber-500', '記録': 'text-violet-600', 'ご案内': 'text-sky-600' };
const ICON_TONE: Partial<Record<ConecfNavKey, string>> = {
  girls: 'text-pink-500', girlsSync: 'text-pink-500', girlsSort: 'text-pink-500', placeholder: 'text-pink-500',
  now: 'text-pink-500',
  schedule: 'text-emerald-600', scheduleSync: 'text-emerald-600', shift: 'text-emerald-600',
  // ★ 第1938便: 上位表示設定はサイト自動更新一覧の下へ移したので、上の3つ（ホーム・ID・サイト自動更新一覧）と同じ青（既定の indigo）
  diary: 'text-amber-500', announce: 'text-amber-500', news: 'text-amber-500', cocoa: 'text-amber-500', vanillaBlog: 'text-amber-500',
  // ★ 第1858便: 記録＝紫・ご案内＝水色（ほかのまとまりと被らない色）
  log: 'text-violet-600', matrix: 'text-violet-600', analytics: 'text-violet-600',
  guide: 'text-sky-600', qa: 'text-sky-600', contact: 'text-sky-600',
};

function NavIcon({ k }: { k: ConecfNavKey }) {
  const p = {
    width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className: 'flex-shrink-0',
  };
  switch (k) {
    case 'home':         return (<svg {...p}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>);
    case 'sites':        return (<svg {...p}><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>);
    case 'autoHub':      return (<svg {...p}><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 21v-5h5" /><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /></svg>);
    case 'girls':        return (<svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></svg>);
    case 'girlsSort':    return (<svg {...p}><path d="M7 4v16M3 8l4-4 4 4" /><path d="M17 20V4M13 16l4 4 4-4" /></svg>);
    case 'girlsSync':    return (<svg {...p}><circle cx="9" cy="8" r="4" /><path d="M2 21v-1a6 6 0 0 1 6-6h2" /><path d="M16 15h6M19 12v6" /></svg>);
    case 'placeholder':  return (<svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg>);
    case 'schedule':     return (<svg {...p}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" /></svg>);
    case 'shift':        return (<svg {...p}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9zM8.5 13l2 2 4-4" /></svg>);
    case 'scheduleSync': return (<svg {...p}><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>);
    case 'now':          return (<svg {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>);
    case 'bump':         return (<svg {...p}><path d="M5 4h14" /><path d="M12 20V9" /><path d="M7 13l5-5 5 5" /></svg>);
    case 'diary':        return (<svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>);
    case 'news':         return (<svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>);
    case 'announce':     return (<svg {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>);
    case 'cocoa':        return (<svg {...p}><path d="M4 8h13a3 3 0 0 1 0 6h-1" /><path d="M4 8v7a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V8z" /><path d="M8 2v2M12 2v2" /></svg>);
    case 'vanillaBlog':  return (<svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>);
    case 'log':          return (<svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
    case 'analytics':    return (<svg {...p}><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></svg>);
    case 'matrix':       return (<svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16" /></svg>);
    case 'guide':        return (<svg {...p}><path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z" /><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z" /></svg>);
    case 'qa':           return (<svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14" /><path d="M12 17h.01" /></svg>);
    case 'contact':      return (<svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>);
    default:             return null;
  }
}

export function ConecfShell({
  current, title, toast, wide, children,
}: {
  current: ConecfNavKey;
  title: string;
  /** ★ 第438便: 画面の横幅をいっぱいに使う（★ 週間スケジュールのような表の画面だけ） */
  wide?: boolean;
  /** ★ 画面の上に一時的に出す一言（useToast） */
  toast?: string;
  /** ★ 権限が確かめられてから描く（★ 店舗が無い人に中身を一瞬でも見せない） */
  children: (access: Extract<ConecfAccess, { ok: true }>) => React.ReactNode;
}) {
  const href = useConecfHref();
  const session = useConecfSession();
  const access: ConecfAccess | null = session.state?.access ?? null;
  // ★ 止まっている連携の赤帯（MediaShell と同じ）。★ 失敗しても画面は止めない（空になるだけ）
  const alerts = session.state?.alerts ?? [];
  // ★ 第474便: 「ココア店長ブログ」を出すか（駅ちかのID・PASSがある店＋自動投稿がオンの店）。★ 分かるまでは出さない
  const cocoaNav = session.state?.cocoaNav ?? false;
  // ★ 2026-11-04: 「シフト管理表」を出すか（SHIFT_SALON_IDS の店だけ）。分かるまでは出さない
  const shiftNav = session.state?.shiftNav ?? false;
  const esutamaOptNav = session.state?.esutamaOptNav ?? false;
  const zenkokuOptNav = session.state?.zenkokuOptNav ?? false;
  const ekiMovieNav = session.state?.ekiMovieNav ?? false;
  const ekiMagazineNav = session.state?.ekiMagazineNav ?? false;
  const ekiRankImgNav = session.state?.ekiRankImgNav ?? false;
  // ★ 第1847便: 「サイト自動更新」は中の項目が1つでも使える店だけ。中の画面を開いているときは、それを光らせる
  //   ★ 第1848便: 駅ちか新着情報（どの店にも出す）が中に入ったので、いつも出す
  const autoHubNav = true;
  const inAutoHub = AUTO_HUB_CHILDREN.includes(current);
  // ★ 第1740便: 新しい希望の数（お店ごと・表を開くと 0 に戻る）
  const shiftNew = session.state?.shiftNew ?? 0;
  // ★ 一度も読めていないときだけ、読めなかった案内を出す
  const error = session.error && !session.state ? '読み込めませんでした。しばらくしてから開き直してください。' : '';
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ★ 第396便（1b）: フクエスリンクの画面を中で使うので、行き先と名前をコネックエフに差し替える
  const brand: MediaBrandValue = {
    name: 'コネックエフ',
    links: {
      home: href('/'), login: href('/sites'), roster: href('/girls/sync'), work: href('/schedule/sync'),
      schedule: href('/schedule'), diary: href('/diary'), news: href('/news'), log: href('/log'),
      matrix: href('/matrix'), qa: href('/qa'), guide: href('/guide'), girls: href('/girls'), announce: href('/announce'),
      // ★ 第1871便: Q&A から新しい画面へ
      sort: href('/girls/sort'), autoHub: href('/auto'), bump: href('/bump'), placeholder: href('/girls/placeholder'),
      analytics: href('/analytics'), contact: href('/contact'),
    },
  };

  // ★ 第1117便: 画面を開いたとき、外枠の状態が5分より古ければ読み直す（★ 新しければ何も読まない）
  const { ensureFresh } = session;
  useEffect(() => { ensureFresh(); }, [ensureFresh]);

  // ★ ログインしていなければログイン画面へ
  const needLogin = access != null && !access.ok && access.reason === 'login';
  useEffect(() => {
    if (needLogin) window.location.replace(href('/login'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needLogin]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [drawerOpen]);

  const onLogout = async () => {
    // ★ 第1399便: 運営が店を選んでいたら、ログアウトのときに外す（次にログインしたとき、前の店のまま始めない）。失敗してもログアウトは進める
    if (access && access.ok && access.role === 'operator') {
      try { await setConecfActingSalon({ salonId: null }); } catch { /* ログアウトを止めない */ }
    }
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
    CONECF_NAV.filter((n) => !AUTO_HUB_CHILDREN.includes(n.key) && (n.key !== 'autoHub' || autoHubNav || current === 'autoHub' || inAutoHub) && (n.key !== 'cocoa' || cocoaNav || current === 'cocoa') && (n.key !== 'shift' || shiftNav || current === 'shift') && (n.key !== 'esutamaOpt' || esutamaOptNav || current === 'esutamaOpt') && (n.key !== 'zenkokuOpt' || zenkokuOptNav || current === 'zenkokuOpt') && (n.key !== 'ekiMovie' || ekiMovieNav || current === 'ekiMovie') && (n.key !== 'ekiMagazine' || ekiMagazineNav || current === 'ekiMagazine') && (n.key !== 'ekiRankImg' || ekiRankImgNav || current === 'ekiRankImg')).map((n) => {
      const on = n.key === current || (n.key === 'autoHub' && inAutoHub);
      return (
        <div key={n.key} className="contents">
          {n.group && (
            <div className={`px-5 pt-4 pb-1 text-[11.5px] font-bold tracking-wide ${GROUP_TONE[n.group] ?? 'text-slate-400'}`}>{n.group}</div>
          )}
          <Link
            href={href(n.href)}
            onClick={onPick}
            aria-current={on ? 'true' : undefined}
            className={`relative mx-2 flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 transition-colors ${
              // ★★ 第462便: 名前の長い項目だけ小さめ（★ 232pxのサイドバーでも1行に収める）
              n.dense ? 'text-[12.5px] tracking-tight' : 'text-[14px]'
            } ${
              on ? 'bg-indigo-600 font-bold text-white shadow-sm' : 'font-normal text-slate-700 hover:bg-indigo-50 hover:text-indigo-800'
            }`}
          >
            {/* ★ 第1850〜1852便（カッキーさん）: まとまりごとのアイコンの色（セラピスト＝ピンク・出勤＝緑・写メ日記・新着＝黄） */}
            <span className={`grid h-7 w-7 flex-none place-items-center rounded-md ${on ? 'bg-white/15 text-white' : `bg-slate-50 ${ICON_TONE[n.key] ?? 'text-indigo-500'}`}`}><NavIcon k={n.key} /></span>
            {n.label}
            {n.key === 'shift' && shiftNew > 0 && !on && (
              <span className="ml-auto inline-flex min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-black leading-[20px] text-white" aria-label={`新しい希望 ${shiftNew}件`}>
                {shiftNew > 99 ? '99+' : shiftNew}
              </span>
            )}
          </Link>
        </div>
      );
    });

  const shopBox = (small: boolean) => (
    <div className={`mx-4 ${small ? 'my-2.5' : 'my-3'} rounded-xl bg-slate-50 px-3.5 py-2.5`}>
      <div className="flex items-center gap-2">
        <span className={`inline-block rounded px-1.5 py-px text-[10.5px] font-bold ${access.role === 'operator' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-700'}`}>
          {access.role === 'operator' ? '運営' : '店舗'}
        </span>
      </div>
      <div className="mt-1 text-[14px] font-bold leading-snug text-slate-800 break-words">
        {access.salonName || access.email}
      </div>
    </div>
  );

  return (
    <MediaBrandProvider value={brand}>
    <div className="min-h-screen md:flex">
      {/* ★ 第1939便: 自動更新中の名前のきらり（サイト自動更新一覧の中の画面）。色は --glint-base で変えられる（既定は紫） */}
      <style>{`.conecf-glint{background:linear-gradient(100deg,var(--glint-base,#6d28d9) 0%,var(--glint-base,#6d28d9) 40%,#a78bfa 46%,#ede9fe 50%,#a78bfa 54%,var(--glint-base,#6d28d9) 60%,var(--glint-base,#6d28d9) 100%);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:conecf-glint 3.2s ease-in-out infinite}@keyframes conecf-glint{0%{background-position:100% 0}60%,100%{background-position:0 0}}@media (prefers-reduced-motion:reduce){.conecf-glint{animation:none;color:var(--glint-base,#6d28d9);background:none}}`}</style>
      {toast && (
        <div className="fixed top-4 left-1/2 z-50 max-w-[92vw] -translate-x-1/2 rounded-xl bg-slate-900/95 px-5 py-3 text-[15px] font-bold text-white shadow-xl">
          {toast}
        </div>
      )}
      {/* ── 左サイドバー（PC）── */}
      <aside className="hidden md:block bg-white md:border-r border-slate-200/80 md:w-[272px] md:flex-none md:h-screen md:overflow-y-auto md:overscroll-contain scrollbar-none md:sticky md:top-0 md:self-start md:pb-12">
        <Link href={href('/')} className="flex items-center gap-2.5 px-5 pt-5 pb-3">
          <ConecfLogo size={32} />
          <b className="text-[17px] font-bold tracking-tight text-slate-900">コネックエフ</b>
        </Link>
        {shopBox(false)}
        <nav aria-label="画面" className="flex flex-col gap-0.5 pb-2">{navList()}</nav>
        <div className="mx-4 mt-3 border-t border-slate-100 pt-3">
          <button type="button" onClick={() => void onLogout()} className="text-[13px] font-bold text-slate-400 hover:text-indigo-600">
            ログアウト
          </button>
        </div>
      </aside>

      {/* ── 右側 ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header ref={trackHeaderHeight} className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
          {/* ★★★ 第1399便（カッキーさん）: 運営だけに出る帯。店を選んで開く／ほかの人の店を操作中は、どの画面でもいちばん上に出す */}
          {access.role === 'operator' && <OperatorBar access={access} />}
          <Link
            href={href('/')}
            aria-label="ホームへ"
            className="md:hidden flex w-full items-center gap-2.5 px-4 py-2.5 bg-indigo-600"
          >
            <span className="w-7 h-7 flex-none grid place-items-center rounded-md bg-white text-indigo-600">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="6" cy="12" r="3" /><circle cx="18" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M8.6 10.5l6.8-3.2M8.6 13.5l6.8 3.2" />
              </svg>
            </span>
            <b className="text-[16px] font-black text-white tracking-tight">コネックエフ</b>
            <span className="ml-auto text-[11.5px] font-bold text-white/85 truncate max-w-[45%]">{access.salonName}</span>
          </Link>
          <div className="px-4 md:px-6 py-3 md:py-3.5 flex items-center gap-2 min-w-0">
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
            {inAutoHub && (
              <Link href={href('/auto')} className="flex-none text-[13px] font-bold text-indigo-600 hover:underline whitespace-nowrap">サイト自動更新一覧 <span className="text-slate-400">/</span></Link>
            )}
            <h1 className="text-[17px] md:text-[18px] font-bold tracking-tight text-slate-900 truncate">{title}</h1>
          </div>
          {/* ★ 第1243便（カッキーさん）: セット（コネックエフ＋フクエスCRM）を OFF にした店＝切り替え済みで契約が無い店。
              どの画面でもいちばん上に「止めています」を出す（保存・各サイトへの更新はサーバーが止めている）。 */}
          {access.enabledAt && !access.contract && (
            <div className="px-4 md:px-6 pb-2.5">
              <div className="border border-amber-400 bg-amber-50 px-3 py-2.5">
                <p className="text-[14px] font-bold text-amber-800">コネックエフを止めています</p>
                <p className="mt-1 text-[14px] leading-relaxed text-amber-900">{CONECF_STOPPED_MESSAGE}</p>
              </div>
            </div>
          )}
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

        <main className={`px-4 md:px-6 py-4 md:py-6 w-full ${wide ? '' : 'max-w-5xl'}`}>{children(access)}</main>
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
            <div className="flex flex-col gap-0.5 py-1.5">{navList(() => setDrawerOpen(false))}</div>
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
