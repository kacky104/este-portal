import type { Metadata } from 'next';
import { XHeader } from './XHeader';
import { XMeProvider, type MeSeed } from './XMeProvider';
import { getXContext } from './xProfile';
import { createClient } from '@/app/lib/supabase/server';
import { fetchShopMini } from './xAffiliation';
import './x-theme.css';

// fukuX 専用シェル。既存フクエスの共通ヘッダー（Logo/各メニュー）は出さず、独自ヘッダーにする。
// ルートレイアウト（Cookie認証・<Wallpaper/>）は継承される。Wallpaper は /x 配下を除外済み（肉球壁紙なし）。
export const metadata: Metadata = {
  title: 'fukuX｜メンズエステ専用SNS',
  description: 'メンズエステ専用SNS「fukuX」。セラピスト・お店・ファンがつながる。',
  // fukuX(/x 配下)だけ丸ロゴ(肉球)をファビコンに。ネストmetadataは最も近い定義が優先されるため、
  // root の icons(フクエス本体)は /x 外でそのまま維持される。
  icons: {
    icon: [
      { url: '/favicon-fukux-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-fukux-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/fukux-mark.png', sizes: '200x200', type: 'image/png' },
    ],
    apple: [{ url: '/fukux-mark.png' }],
  },
};

// FOUC対策：ハイドレーション前に localStorage のテーマを #x-root へ即時反映する小スクリプト。
// 値が 'white' のときだけ属性を書き換える（既定の 'gradient' は SSR 出力と一致）。/x 内に閉じる。
const THEME_INIT = `try{var t=localStorage.getItem('fukux-theme');if(t==='white'){document.getElementById('x-root').setAttribute('data-x-theme','white');}}catch(e){}`;

export default async function XLayout({ children }: { children: React.ReactNode }) {
  // me をサーバーで取得して Provider に seed（リロード時のクライアント二重取得・待ちを解消）。
  // getXContext は cache() 済み＝各ページの呼び出しと getUser を共有（1リクエスト1回）。
  // ※ seed は props で渡すだけ＝ISRキャッシュには焼かない（ISR凍結回避を維持）。レイアウトは動的化する。
  const { userId, email, profile } = await getXContext();
  let affiliatedShop: MeSeed['affiliatedShop'] = null;
  if (profile?.kind === 'therapist' && profile.affiliated_shop_id) {
    const supabase = await createClient();
    const shop = await fetchShopMini(supabase, profile.affiliated_shop_id);
    affiliatedShop = shop ? { handle: shop.handle, displayName: shop.displayName } : null;
  }
  const seed: MeSeed = { me: profile, userId, email, affiliatedShop };

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
        {/* 自分(me)を一元配布（遷移=Provider生存で再取得なし／リロード=サーバーseedで待ちなし。ISRには焼かない）。 */}
        <XMeProvider seed={seed}>
          {/* ─── fukuX ヘッダー（左=アバター/ドロワー・中央=肉球ロゴ・右=スペーサー） ─── */}
          <XHeader />

          <main className="max-w-2xl mx-auto px-4 pb-20">{children}</main>
        </XMeProvider>
      </div>
    </div>
  );
}
