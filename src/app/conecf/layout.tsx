import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { conecfBaseFor } from '@/lib/conecfHost';
import { ConecfBaseProvider } from './ConecfBase';
import { ConecfSessionProvider } from './ConecfSession';
import { ConecfConfirmHost } from './ConecfConfirm';

// コネックエフ（conecf.com）の共通レイアウト（第395便・1a・2026-09-17・カッキーさん）。
//
// ★ 入口は conecf.com。src/proxy.ts が https://conecf.com/xxx → /conecf/xxx へ rewrite する。
// ★ 色はフクエスリンクの紺を引き継ぐ（カッキーさんの決定）。
// ★ 第1872便（カッキーさん「全体の見た目を良くする」）: 地はテーマ壁紙（花柄）をやめ、薄い灰青のグラデーションに（★ 白いカードが浮いて読みやすい）。
// ★★ 表向きフクエスのサイトではないので、タイトル・OGP にフクエスの名前を出さない。
// ★ 管理画面なので検索に出さない。

export const metadata: Metadata = {
  title: { default: 'コネックエフ', template: '%s｜コネックエフ' },
  description: 'メンズエステ店舗向けの媒体一括更新ツール',
  robots: { index: false, follow: false },
  // ★ コネックエフ専用ファビコン（第405便・青いF）。ネストmetadataは最も近い定義が優先 → /conecf 配下だけ差し替わる。
  icons: {
    icon: [
      { url: '/favicon-conecf.ico', sizes: 'any' },
      { url: '/favicon-conecf-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-conecf-16.png', type: 'image/png', sizes: '16x16' },
    ],
    apple: [{ url: '/apple-touch-icon-conecf.png', sizes: '180x180' }],
  },
  alternates: {},
  openGraph: { title: 'コネックエフ', siteName: 'コネックエフ', description: 'メンズエステ店舗向けの媒体一括更新ツール', images: [] },
  twitter: { card: 'summary', title: 'コネックエフ', images: [] },
};

export const dynamic = 'force-dynamic';

export default async function ConecfLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const base = conecfBaseFor(h.get('x-forwarded-host') ?? h.get('host'));

  const bgStyle = {
    backgroundColor: '#f3f5fa',
    backgroundImage: 'radial-gradient(1200px 600px at 100% -10%, rgba(99, 102, 241, 0.10), transparent 60%), radial-gradient(900px 500px at -10% 100%, rgba(236, 72, 153, 0.06), transparent 60%)',
    backgroundAttachment: 'fixed' as const,
  };

  return (
    <ConecfBaseProvider base={base}>
      {/* ★ 第1117便: 外枠の状態（権限・赤帯・ココア）は layout の下で1回読む（画面を行き来しても読み直さない） */}
      <ConecfSessionProvider>
        <div className="conecf-venrey min-h-screen" style={bgStyle}>{children}{/* ★ 第1961便: 確認の窓（conecfConfirm）の本体は、ここに1つだけ */}<ConecfConfirmHost /></div>
      </ConecfSessionProvider>
    </ConecfBaseProvider>
  );
}
