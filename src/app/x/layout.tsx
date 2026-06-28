import type { Metadata } from 'next';
import Link from 'next/link';
import { XLogo } from './XLogo';
import { XHeaderAdminLink } from './XHeaderAdminLink';
import { XHeaderShopLink } from './XHeaderShopLink';

// fukuX 専用シェル。既存フクエスの共通ヘッダー（Logo/各メニュー）は出さず、独自ヘッダーにする。
// ルートレイアウト（Cookie認証・<Wallpaper/>）は継承される。Wallpaper は /x 配下を除外済み（肉球壁紙なし）。
export const metadata: Metadata = {
  title: 'fukuX｜メンズエステ専用SNS',
  description: 'メンズエステ専用SNS「fukuX」。セラピスト・お店・ファンがつながる。',
};

export default function XLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* ─── fukuX ヘッダー（独自・最小ナビ） ─── */}
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <XLogo />
          {/* 最小ナビ：運営リンク（運営UUID時のみ）＋フクエス本体へ戻る導線 */}
          <div className="flex items-center gap-3">
            <XHeaderShopLink />
            <XHeaderAdminLink />
            <Link
              href="/"
              className="text-xs font-medium text-slate-400 hover:text-indigo-500 transition-colors"
            >
              フクエス本体 →
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-20">{children}</main>
    </div>
  );
}
