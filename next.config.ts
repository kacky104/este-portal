import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 開発時の左下インジケーター（Nバッジ）を非表示。本番ビルドには元々出ない。
  devIndicators: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'images.pexels.com' },
      { protocol: 'https', hostname: 'efjrpanojfahqjwqpagg.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },
  // クライアントルーターキャッシュの再利用時間。既定では静的(ISR)ページのRSCが
  // ブラウザ内で5分再利用され、出勤表などの保存が回遊中のユーザーに最大5分見えない。
  // 静的30秒・動的0秒に短縮（サーバー側ISRは revalidateSalon 等で即時無効化済み）。
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 30,
    },
  },
};

export default nextConfig;