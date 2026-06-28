import type { Metadata } from 'next';
import { XHeader } from './XHeader';
import './x-theme.css';

// fukuX 専用シェル。既存フクエスの共通ヘッダー（Logo/各メニュー）は出さず、独自ヘッダーにする。
// ルートレイアウト（Cookie認証・<Wallpaper/>）は継承される。Wallpaper は /x 配下を除外済み（肉球壁紙なし）。
export const metadata: Metadata = {
  title: 'fukuX｜メンズエステ専用SNS',
  description: 'メンズエステ専用SNS「fukuX」。セラピスト・お店・ファンがつながる。',
};

// FOUC対策：ハイドレーション前に localStorage のテーマを #x-root へ即時反映する小スクリプト。
// 値が 'white' のときだけ属性を書き換える（既定の 'gradient' は SSR 出力と一致）。/x 内に閉じる。
const THEME_INIT = `try{var t=localStorage.getItem('fukux-theme');if(t==='white'){document.getElementById('x-root').setAttribute('data-x-theme','white');}}catch(e){}`;

export default function XLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      id="x-root"
      data-x-theme="gradient"
      suppressHydrationWarning
      className="relative min-h-screen text-slate-900"
    >
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />

      {/* fukuX 専用の固定背景レイヤー。テーマで グラデ⇄白 を出し分け（x-theme.css）。
          スクロール追従しない固定レイヤーで、短いページでも下端まで途切れない。本体（/x 外）には影響しない。 */}
      <div aria-hidden className="x-bg fixed inset-0 z-0" />

      <div className="relative z-10">
        {/* ─── fukuX ヘッダー（左=アバター/ドロワー・中央=肉球ロゴ・右=スペーサー） ─── */}
        <XHeader />

        <main className="max-w-2xl mx-auto px-4 pb-20">{children}</main>
      </div>
    </div>
  );
}
