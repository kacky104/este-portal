import type { Metadata } from 'next';
import Link from 'next/link';
import { JobsLogo } from '@/components/JobsLogo';

// フクエスワーク（求人サイト）専用シェル。
// root layout にはサイト共通ヘッダーが無く（各ページが自前でヘッダーを描画する構造）、
// 肉球壁紙は <Wallpaper/> がパス毎に body.paw-bg を付け外しする方式。
// そのため「本体ヘッダーを消す」＝このセクションで自前ヘッダーのみ描画し、
// Wallpaper 側で /jobs を除外する（fukuX(/x) と同じ考え方）。root の Cookie/フォント等は継承。

const SITE_URL = 'https://fukues.com';
const BRAND_TITLE = 'フクエスワーク｜福岡メンズエステのセラピスト求人サイト';
const BRAND_DESCRIPTION =
  '「フクエスワーク」は福岡のメンズエステで働くセラピスト求人サイト。博多・天神・北九州など福岡全域のメンズエステ求人を、給与・こだわり条件から探せます。未経験歓迎の求人も掲載中。';

// /jobs 配下だけ独自 metadata（ネストは最も近い定義が優先＝本体 root の設定は /jobs 外で維持）。
export const metadata: Metadata = {
  title: {
    default: BRAND_TITLE,
    template: '%s｜フクエスワーク',
  },
  description: BRAND_DESCRIPTION,
  // ファビコンは App Router のセグメント別アイコン規約（src/app/jobs/icon.png）で /jobs 配下だけ
  // 自動適用される。root（フクエス本体）のファビコンは /jobs 外でそのまま維持。ここでは指定不要。
  openGraph: {
    title: BRAND_TITLE,
    description: BRAND_DESCRIPTION,
    url: `${SITE_URL}/jobs`,
    siteName: 'フクエスワーク',
    // 専用OGP画像（1200×630）。/x の ogp-fukux.png と同方式。
    images: [{ url: '/ogp-fukuwork.png', width: 1200, height: 630, alt: 'フクエスワーク' }],
    locale: 'ja_JP',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: BRAND_TITLE,
    description: BRAND_DESCRIPTION,
    images: ['/ogp-fukuwork.png'],
  },
};

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return (
    // 別サイト感を出すため肉球壁紙は使わず、白〜ごく薄いグリーンの無地背景。
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(#ffffff,#F1FAF4)' }}>
      {/* ─── フクエスワーク専用ヘッダー（左=ロゴ→/jobs、右=本体TOPへのテキストリンク） ─── */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b" style={{ borderColor: '#D6EFE0' }}>
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <JobsLogo />
          <Link
            href="/"
            className="text-xs font-medium text-slate-500 hover:text-emerald-600 transition-colors whitespace-nowrap inline-flex items-center gap-1"
          >
            フクエスTOPへ
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      {/* ─── フクエスワーク専用フッター（本体フクエスへの内部リンクを残す） ─── */}
      <footer className="border-t bg-white/70 py-6 mt-12" style={{ borderColor: '#D6EFE0' }}>
        <div className="max-w-3xl mx-auto px-4 flex flex-col items-center gap-2 text-center">
          <p className="text-xs text-slate-400">© 2026 フクエスワーク. All rights reserved.</p>
          <p className="text-xs text-slate-400">
            運営:{' '}
            <a href={SITE_URL} className="font-medium hover:opacity-80 transition-opacity" style={{ color: '#059669' }}>
              フクエス（福岡メンズエステポータル）
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
