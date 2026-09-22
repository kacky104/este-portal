// マイページのサイドバー「関連サイト」に出す画像バナー（第663便・2026-09-22・カッキーさんの指示）。
// ★ 文字リンクを置き換える。★ 画像は 600×200（3:1）で作る決まり（表示は約250px幅）。置き場所は public/mypage/sidebar/。
// ★ 行き先・別タブ・出す相手は呼び出し側で決める（ここは見た目だけ）。★ 右上に件数の札などを重ねられる（badge）。

import Link from 'next/link';
import type { ReactNode } from 'react';

export function SidebarBanner({ href, src, alt, badge, pc }: {
  href: string;
  src: string;
  alt: string;
  badge?: ReactNode;
  pc: boolean;
}) {
  return (
    <div className={pc ? 'px-4 py-2' : 'px-4 py-1.5'}>
      <Link
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block overflow-hidden border border-slate-100 shadow-sm transition hover:opacity-90 hover:shadow-md"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} width={600} height={200} className="block w-full h-auto" loading="lazy" />
        {badge && <span className="absolute top-1.5 right-1.5">{badge}</span>}
      </Link>
    </div>
  );
}
