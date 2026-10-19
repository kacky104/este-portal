import type { Metadata } from "next";
import "./globals.css";
import { SaveStoreInit } from "./components/SaveStoreInit";
import Wallpaper from "./components/Wallpaper";
import GoogleAnalytics from "./components/GoogleAnalytics";

// Geist / Geist_Mono（next/font）は削除（2026-08-05）。
// globals.css の body { font-family: Arial, ... } が常に優先されており、
// woff2 を全ページで preload しながら1文字も表示に使われていなかったため。

// 「検索」（機能語・クエリに現れない）を「情報」（実クエリに現れる語）へ置き換え（2026-07-10）。
const SITE_TITLE = "福岡メンズエステ情報・口コミポータルサイト【フクエス】";
const SITE_DESCRIPTION =
  "福岡メンズエステ情報・口コミポータルサイト『フクエス』。博多・天神・北九州・久留米など福岡全域から、口コミ評価の高い人気店舗をご紹介。あなたとお店をマッチングします。";
const SITE_URL = "https://fukues.com";
// ★ 第1523便: Supabase（画像・API の取得先）へ事前接続（PageSpeed「事前接続の候補」・推定 LCP 300ms 短縮）。
//   ヒーロー画像は /_next/image 経由だが、サムネ・API は直接 supabase.co へ行くので接続を先に張っておく。
const SUPABASE_ORIGIN = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin; } catch { return null; }
})();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  // ★ 2026-10-19: TOP用の canonical '/' は src/app/page.tsx へ移した。
  //   ここ（ルートの layout）に置くと、自前の canonical を持たないページ（noindex の写メ日記の個別記事など）が
  //   すべて「canonical = トップ」を受け継ぎ、noindex と矛盾する合図になっていたため。ここへ戻さないこと。
  // ファビコン（public/ の新ロゴ画像。app/favicon.ico 規約は廃止しここで一元管理）。
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "フクエス",
    images: [{ url: "/ogp.png", width: 1200, height: 630 }],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/ogp.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full antialiased">
      <head>
        {SUPABASE_ORIGIN && <link rel="preconnect" href={SUPABASE_ORIGIN} crossOrigin="anonymous" />}
        {SUPABASE_ORIGIN && <link rel="preconnect" href={SUPABASE_ORIGIN} />}
      </head>
      <body className="min-h-full flex flex-col">
        <SaveStoreInit />
        <Wallpaper />
        {children}
        {/* GA4（第1403便）: fukues.com のお客様向けページだけで読み込む。判断は lib/ga.ts */}
        <GoogleAnalytics />
      </body>
    </html>
  );
}
