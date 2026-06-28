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
    <div className="relative min-h-screen text-slate-900">
      {/* fukuX 専用：濃いめピンク→パープルの固定グラデ背景。スクロール追従しない固定レイヤーで、
          短いページでも下端まで途切れない。/x 配下のこのレイアウト内に閉じており、本体（/x 外）には影響しない。 */}
      <div
        aria-hidden
        className="fixed inset-0 z-0"
        style={{ background: 'linear-gradient(160deg,#A855F7 0%,#C026D3 50%,#EC4899 100%)' }}
      />

      <div className="relative z-10">
        {/* ─── fukuX ヘッダー（左=アバター/ドロワー・中央=肉球ロゴ・右=スペーサー） ─── */}
        <XHeader />

        <main className="max-w-2xl mx-auto px-4 pb-20">{children}</main>
      </div>
    </div>
  );
}
