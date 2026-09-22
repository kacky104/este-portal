// マイページのサイドバー「関連サイト」に出す画像バナー（第663便・2026-09-22・カッキーさんの指示）。
// ★ 文字リンクを置き換える。★ 画像は 600×200（3:1）で作る決まり（表示は約250px幅）。置き場所は public/mypage/sidebar/。
// ★ 行き先・別タブ・出す相手は呼び出し側で決める（ここは見た目だけ）。★ 右上に件数の札などを重ねられる（badge）。
// ★ 第665便: href を null にすると押せない表示（薄く＋真ん中に札 disabledLabel）。公式HPの制作中・停止中で使う。

import Link from 'next/link';
import type { ReactNode } from 'react';

export function SidebarBanner({ href, src, alt, badge, pc, disabledLabel = '準備中' }: {
  href: string | null;
  src: string;
  alt: string;
  badge?: ReactNode;
  pc: boolean;
  disabledLabel?: string;
}) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={600} height={200} className="block w-full h-auto" loading="lazy" />
  );
  return (
    <div className={pc ? 'px-4 py-2' : 'px-4 py-1.5'}>
      {href === null ? (
        <div aria-disabled className="relative block overflow-hidden border border-slate-100 cursor-default select-none">
          <div className="opacity-40 grayscale-[40%]">{img}</div>
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="px-3 py-1 bg-slate-700/85 text-white text-[12px] font-black tracking-wider">{disabledLabel}</span>
          </span>
        </div>
      ) : (
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="relative block overflow-hidden border border-slate-100 shadow-sm transition hover:opacity-90 hover:shadow-md"
        >
          {img}
          {badge && <span className="absolute top-1.5 right-1.5">{badge}</span>}
        </Link>
      )}
    </div>
  );
}
