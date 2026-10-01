'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// ★ 第1056便（2026-10-01・カッキーさん）: フクエスワークのヘッダーに簡易ナビ（求人・コラム・用語集・マッチング）。
//   それまでヘッダーはロゴと保存メニューだけで、コラム・用語集・マッチングへの導線はフッターにしか無かった。
//   回遊と内部リンクのため、ロゴ行の下に1行で置く。今いるページは下線＋濃い緑（aria-current）。
//   スマホでも4つが1行に収まる幅（text-[13px]・gap-5）。

const ITEMS = [
  { href: '/jobs', label: '求人', match: (p: string) => p === '/jobs' || /^\/jobs\/(\d+|area|tag|dispatch)/.test(p) },
  { href: '/jobs/column', label: 'コラム', match: (p: string) => p.startsWith('/jobs/column') },
  { href: '/jobs/glossary', label: '用語集', match: (p: string) => p.startsWith('/jobs/glossary') },
  { href: '/jobs/matching', label: 'マッチング', match: (p: string) => p.startsWith('/jobs/matching') },
] as const;

export function JobsNav() {
  const pathname = usePathname() ?? '';
  return (
    <nav aria-label="サイト内メニュー" className="max-w-3xl mx-auto px-4">
      <ul className="flex items-center gap-5 h-9 text-[13px] font-bold">
        {ITEMS.map((it) => {
          const active = it.match(pathname);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? 'page' : undefined}
                className="inline-flex items-center h-9 border-b-2 transition-colors hover:opacity-80"
                style={active ? { color: '#047857', borderColor: '#10B981' } : { color: '#059669', borderColor: 'transparent' }}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
