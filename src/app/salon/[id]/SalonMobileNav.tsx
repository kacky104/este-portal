'use client';

// ★★★ 店舗詳細（スマホだけ）の「店名＋情報行＋三本線」と右ドロワー（第219便・2026-09-08・カッキーさんの指示）
//
//   ① 画面の流れの中: 店名（1行に自動縮小）＋情報2行、その右に三本線。★ PC（md以上）はこの部品を描かない。
//   ② 下へスクロールして①が隠れたら、共通ヘッダー（ロゴ行＋テスト運用中の帯）の【すぐ下】に
//      「店名1行＋三本線」だけの小さなバー（約48px）が貼り付く（★ カッキーさんの判断: 2行は固定しない）。
//   ③ 三本線を押すと右からドロワー。中身はクイックナビと同じ11個（同じ順・同じ数字バッジ）。
//      ★ 背面タップ／×／Esc／項目を押す で閉じる。開いている間は本文のスクロールを止める。
//
//   ★ 共通ヘッダーの高さは決め打ちしない（帯の有無・折返しで変わる）。<header> と帯の要素を測る。
//   ★ 数字（本日出勤・写メ日記・口コミ・クーポン・お知らせ）はサーバー（page.tsx）から受け取る。
//     ★ 「今すぐ」の人数は時刻で変わるので、クイックナビと同じ ImasuguCountBadge の考え方＝ここでは数字を出さない。
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AutoFitText } from '@/app/components/AutoFitText';

export type SalonNavItem = {
  key: string;
  label: string;
  href: string;
  external?: boolean;
  /** 右端に出す数字（0 や undefined は出さない） */
  count?: number;
};

type Props = {
  salonName: string;
  metaLine1: string;
  metaLine2: string;
  items: SalonNavItem[];
  colors: { heading: string; body: string; card: string; cardBorder: string; accent: string };
};

export function SalonMobileNav({ salonName, metaLine1, metaLine2, items, colors }: Props) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [stuck, setStuck] = useState(false);
  const [topPx, setTopPx] = useState(0);
  const [open, setOpen] = useState(false);

  // ★ 共通ヘッダー（sticky）＋告知の帯の【高さ】を足して、小さなバーの top にする。
  //   ★★ getBoundingClientRect（画面上の位置）ではなく offsetHeight（高さ）で測る（2026-09-08・実機で震えた）。
  //     実機のブラウザはスクロール中にアドレスバーが伸び縮みし、位置は毎フレーム変わるが高さは変わらない。
  //     ★ 位置で測っていたときは scroll のたびに top が変わり、バーがガタガタ震えた。
  //   ★ 帯（SiteNoticeBanner）は後から描かれることがあるので、ResizeObserver で追いかける。
  //   ★ 帯は data-site-notice（SiteNoticeBanner）で探す。★ header の隣、で探すと Next が挟む要素で外れることがある。
  useEffect(() => {
    const header = document.querySelector('header');
    if (!header) return;
    const banner = document.querySelector<HTMLElement>('[data-site-notice]');
    const measure = () => {
      const h = header.offsetHeight + (banner ? banner.offsetHeight : 0);
      setTopPx((prev) => (Math.abs(prev - h) < 1 ? prev : Math.round(h)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    if (banner) ro.observe(banner);
    return () => ro.disconnect();
  }, []);

  // ★ 画面の流れの中の①（店名＋2行＋三本線）が固定ヘッダーの下に【完全に】隠れたら貼り付く。
  //   ★★ IntersectionObserver を使う（2026-09-08・実機でページの先頭なのにバーが出ていた）。
  //     scroll イベントだけだと、画像が読み込まれて①が下へ押し下げられても再判定されず、
  //     読み込み前の「①が上にある」判定のまま残った。IntersectionObserver は位置が変われば呼ばれる。
  //   ★ rootMargin の上を -topPx にして「固定ヘッダーの下端」を境目にする。
  //   ★ 見えなくなったときだけ「上に抜けたか（bottom < 境目）／下にあるか」を見て、上のときだけ貼り付く。
  useEffect(() => {
    const el = anchorRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) { setStuck(false); return; }
        setStuck(entry.boundingClientRect.bottom <= topPx + 1);
      },
      { root: null, rootMargin: `-${Math.max(0, topPx)}px 0px 0px 0px`, threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [topPx]);

  // ★ ドロワーを開いている間は本文をスクロールさせない。Esc で閉じる。
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [open]);

  const burger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="この店舗のメニューを開く"
      aria-expanded={open}
      className="flex-none p-2 -mr-2 rounded-lg active:opacity-70"
      style={{ color: colors.accent }}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );

  return (
    <div className="md:hidden">
      {/* ① 画面の流れの中: 店名＋2行、右に三本線 */}
      <div ref={anchorRef} className="mb-4">
        <h1 className="px-2">
          <AutoFitText text={salonName} max={26} min={15} className="text-center font-bold leading-tight" style={{ color: colors.heading }} />
        </h1>
        <div className="mt-1.5 px-2 flex items-center gap-2">
          <div className="flex-1 min-w-0 text-center leading-relaxed" style={{ color: colors.body }}>
            <p className="text-[12px]">{metaLine1}</p>
            {metaLine2 && <p className="text-[12px]">{metaLine2}</p>}
          </div>
          {burger}
        </div>
      </div>

      {/* ② スクロールしたら貼り付く小さなバー（店名1行＋三本線） */}
      {/* ★★ 隠すときは visibility:hidden（invisible）で消す（2026-09-08・実機で判明）。
          ★ 前は -translate-y-full（自分の高さぶん上へずらす）で隠していたが、バーの top は「ヘッダー＋帯」の下端なので、
            上へ48pxずらしても【帯の上に被さったまま】見えていた（ヘッダーの裏には入らない）。
            ★ それが「先頭からバーが出て帯を隠す」「スクロールで震える」の正体。 */}
      <div
        aria-hidden={!stuck}
        className={`fixed inset-x-0 z-40 border-b shadow-sm backdrop-blur-md transition-[opacity,transform] duration-200 ${stuck ? 'visible opacity-100 translate-y-0' : 'invisible opacity-0 -translate-y-2 pointer-events-none'}`}
        style={{ top: topPx, backgroundColor: `${colors.card}F2`, borderColor: colors.cardBorder }}
      >
        <div className="px-4 h-12 flex items-center gap-2">
          <p className="flex-1 min-w-0 truncate font-bold text-[15px]" style={{ color: colors.heading }}>{salonName}</p>
          {burger}
        </div>
      </div>

      {/* ③ 右ドロワー */}
      {open && (
        <div className="fixed inset-x-0 top-0 h-dvh z-[60]" role="dialog" aria-modal="true" aria-label="店舗メニュー">
          <button type="button" aria-label="メニューを閉じる" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/40" />
          <nav
            aria-label="店舗メニュー"
            className="absolute inset-y-0 right-0 w-[280px] max-w-[85vw] shadow-2xl overflow-y-auto overscroll-contain [padding-bottom:calc(4rem+env(safe-area-inset-bottom))]"
            style={{ backgroundColor: colors.card }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: colors.cardBorder }}>
              <p className="min-w-0 truncate text-sm font-bold" style={{ color: colors.heading }}>{salonName}</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="閉じる" className="flex-none p-1" style={{ color: colors.body }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <ul>
              {items.map((it) => {
                const inner = (
                  <>
                    <span className="flex-1 min-w-0 truncate">{it.label}</span>
                    {it.count != null && it.count > 0 && (
                      <span className="flex-none inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-black text-white" style={{ backgroundColor: colors.accent }}>
                        {it.count}
                      </span>
                    )}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="flex-none opacity-50" aria-hidden>
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </>
                );
                const cls = 'flex items-center gap-3 px-4 py-3.5 text-[14px] font-bold border-b';
                return (
                  <li key={it.key}>
                    {it.external ? (
                      <a href={it.href} target="_blank" rel="noopener noreferrer" className={cls} style={{ color: colors.heading, borderColor: colors.cardBorder }} onClick={() => setOpen(false)}>
                        {inner}
                      </a>
                    ) : (
                      <Link href={it.href} className={cls} style={{ color: colors.heading, borderColor: colors.cardBorder }} onClick={() => setOpen(false)}>
                        {inner}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
}
