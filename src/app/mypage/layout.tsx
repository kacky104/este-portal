import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { isCrmHost } from '@/lib/crmHost';
import { createClient } from '@/app/lib/supabase/server';
import { getTheme } from '@/app/lib/themes';
import { fetchThemeWallpapers } from '@/app/lib/ranking';

// /mypage 配下（オーナー専用マイページ）は検索インデックス対象外。
// robots.txt で Disallow はしない（クロールを止めると noindex を読めず残り続けるため）。
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// サーバーサイド認証ガード（2026-07-12 追加。admin/moderation の layout と同方式）。
// 従来はクライアント側 useEffect の redirect のみで、未ログインでも一瞬 UI シェルが
// レンダリングされていた（データは RLS 保護あり）。children 描画前に弾いて非対称を解消。
// オーナー本人チェック（salons.owner_id 照合）は従来どおり各 page 側のロジックが担う。
// cookie を読むため /mypage は動的レンダリングになる（ログイン必須ページなので正しい挙動）。
export default async function MypageLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 未ログインはオーナーログインへ（クライアント側の従来遷移先と同じ）。
  // ★ 第631便: fukuescrm.com（CRM ドメイン）では CRM 専用のログイン（/login → /crm/login）へ。
  if (!user) {
    const h = await headers();
    if (isCrmHost(h.get('x-forwarded-host') ?? h.get('host'))) redirect('/login');
    // ★ 第821便: ログインしたら【開こうとしたページ】へ戻す（★ 請求書のメールのリンクなど）。
    //   ★ 戻り先は /mypage の中だけ（★ proxy.ts が入れた x-fukues-path・// で始まるものは使わない）。
    const want = h.get('x-fukues-path') ?? '';
    const back = want.startsWith('/mypage') && !want.startsWith('//') ? want : '/mypage';
    redirect(`/owner/login?redirectTo=${encodeURIComponent(back)}`);
  }

  // ★ 背景はシルバーテーマ＋テーマ壁紙（theme_wallpapers の silver）。2026-09-06・カッキーさんの指示。
  //   ★ /salons と同じ方式。★ 壁紙の上に theme.bg の85%不透明（D9）を重ねて、
  //     入力欄や文字が読みにくくならないようにする。
  //   ★ 壁紙が未設定なら、ただの地色（theme.bg）になる。★ 読めなくても画面は止めない。
  const theme = getTheme('silver');
  const wallpapers = await fetchThemeWallpapers();
  const wallpaperUrl = wallpapers[theme.key] ?? null;
  const bgStyle = {
    backgroundColor: theme.bg,
    ...(wallpaperUrl
      ? {
          backgroundImage: `linear-gradient(${theme.bg}D9, ${theme.bg}D9), url(${wallpaperUrl})`,
          backgroundSize: 'cover' as const,
          backgroundPosition: 'center' as const,
          backgroundAttachment: 'fixed' as const,
        }
      : {}),
  };

  return <div className="min-h-screen" style={bgStyle}>{children}</div>;
}
