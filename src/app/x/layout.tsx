import type { Metadata } from 'next';
import { XHeader } from './XHeader';

// fukuX 専用シェル。既存フクエスの共通ヘッダー（Logo/各メニュー）は出さず、独自ヘッダーにする。
// ルートレイアウト（Cookie認証・<Wallpaper/>）は継承される。Wallpaper は /x 配下を除外済み（肉球壁紙なし）。
export const metadata: Metadata = {
  title: 'fukuX｜メンズエステ専用SNS',
  description: 'メンズエステ専用SNS「fukuX」。セラピスト・お店・ファンがつながる。',
};

export default function XLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* ─── fukuX ヘッダー（左=アバター/ドロワー・中央=肉球ロゴ・右=スペーサー） ─── */}
      <XHeader />

      <main className="max-w-2xl mx-auto px-4 pb-20">{children}</main>
    </div>
  );
}
