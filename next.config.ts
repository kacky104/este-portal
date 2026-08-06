import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'images.pexels.com' },
      { protocol: 'https', hostname: 'efjrpanojfahqjwqpagg.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
    // AVIF を追加（2026-08-05）。既定は WebP のみで、AVIF は同画質で2〜3割小さい。
    // 対応ブラウザには AVIF、それ以外は WebP が配信される。
    formats: ['image/avif', 'image/webp'],
    // Supabase Storage の画像は差し替え頻度が低いため、変換結果のキャッシュを既定60秒→1時間に延長。
    minimumCacheTTL: 3600,
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