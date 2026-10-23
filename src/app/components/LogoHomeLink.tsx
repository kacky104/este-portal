'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

// ヘッダーロゴのリンク（第1617便）。
// TOP（/）にいるときにロゴを押したら、いちばん上へ戻してページを読み込み直す。
//  - 先に scrollTo(0,0) してから reload するので、ブラウザのスクロール位置の復元でも一番上に来る。
//  - Ctrl/⌘ クリック・中クリック（新しいタブ）はブラウザに任せる。
// TOP 以外のページでは普通の <Link href="/">（遷移先は一番上から表示）。
export function LogoHomeLink({ className, children }: { className?: string; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <Link
      href="/"
      className={className}
      aria-label="フクエス トップへ"
      onClick={(e) => {
        if (pathname !== '/') return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        window.scrollTo(0, 0);
        window.location.reload();
      }}
    >
      {children}
    </Link>
  );
}
