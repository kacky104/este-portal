'use client';

// ★★ 第941便（2026-09-28・カッキーさん）: /x-shops の切り替えタブ（承認店舗／認証セラピスト）。
//   ★ 人気ランキング（RankingTabs）と同じ形: 同じページの中で切り替え・角なし隙間なしのセグメント。
//   ★ 両方とも最初から HTML に描き、選んでいない方は hidden（★ クローラーにも両方見える）。
//   ★ #therapists で開くと、最初から認証セラピストのタブ。
import { useEffect, useState, type ReactNode } from 'react';

type Colors = { heading: string; body: string; card: string; cardBorder: string };

export function XShopsTabs({ shops, therapists, shopCount, therapistCount, colors }: {
  shops: ReactNode;
  therapists: ReactNode;
  shopCount: number;
  therapistCount: number;
  colors: Colors;
}) {
  const [tab, setTab] = useState<'shops' | 'therapists'>('shops');
  useEffect(() => {
    if (window.location.hash === '#therapists') setTab('therapists');
  }, []);
  const change = (t: 'shops' | 'therapists') => {
    setTab(t);
    try { history.replaceState(null, '', t === 'therapists' ? '#therapists' : window.location.pathname); } catch { /* 何もしない */ }
  };
  const items = [
    ['shops', `承認店舗（${shopCount}）`],
    ['therapists', `認証セラピスト（${therapistCount}）`],
  ] as const;
  return (
    <>
      <div className="flex sm:justify-center mb-5">
        <div className="flex w-full sm:w-auto">
          {items.map(([key, label], i) => {
            const selected = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => change(key)}
                aria-pressed={selected}
                className={`flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-10 py-2.5 border text-sm font-bold transition-colors ${i > 0 ? '-ml-px' : ''} ${selected ? 'relative z-10' : ''}`}
                style={
                  selected
                    ? { background: `${colors.heading}1A`, color: colors.heading, borderColor: colors.heading }
                    : { background: colors.card, color: colors.body, borderColor: colors.cardBorder }
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div className={tab === 'shops' ? '' : 'hidden'}>{shops}</div>
      <div id="therapists" className={tab === 'therapists' ? 'scroll-mt-24' : 'hidden'}>{therapists}</div>
    </>
  );
}
