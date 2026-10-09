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
    // ★ 第1078便: 3840w（4K 向け）を外す。hero の元画像が最大1600〜2400px なので出番がなく、srcset が1本ずつ短くなる。
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    formats: ['image/avif', 'image/webp'],
    // Supabase Storage の画像は差し替え頻度が低いため、変換結果のキャッシュを既定60秒→1時間に延長。
    // ★ 第1054便（2026-10-01）: 1時間→30日に。アップロードは Date.now() 入りの別ファイル名で保存するので
    //   同じURLの中身が変わることはなく、長く持っても古い画像が出ることはない。
    //   Vercel の画像変換回数と Supabase からの読み出しを減らす。
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  // ★ 第1185便: フクエックスの運営アカウントがコラムを毎日1本投稿する周（/api/admin/x-column-post）は、
  //   コラムの md（src/content/column/*.md）を実行時に読む。サーバーの関数に md を同梱する。
  //   ★ 外すと本番でコラムが0本になり、その周は何も投稿しなくなる（skipped: 'no_columns'）。
  outputFileTracingIncludes: {
    '/api/admin/x-column-post': ['./src/content/column/**/*'],
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
  // 埋め込みウィジェット（/embed/ 配下）だけ、どのサイトからでも iframe で読み込めることを明示する。
  // 現状サイト全体に X-Frame-Options は付けていないが、将来全体を DENY にしても
  // 埋め込みが壊れないよう、許可をこのパスに限定して宣言しておく（2026-08-06）。
  async redirects() {
    return [
      // ★ 第1084便: 旧 /working?area=・…/diary?page=N の転送は src/proxy.ts（rewriteLegacyQueryUrl）へ移した。
      //   ここ（redirects）だと has で取ったクエリが転送先に残る（/diary/page/2?page=2）ため。
      // ★ 第1373便（2026-10-10）: エリアの統合（博多・住吉 ＋ 中洲・天神・薬院 → 博多・天神・中洲）。古い slug の URL を新しい URL へ（308）。
      //   対応は src/app/lib/areas.ts の LEGACY_AREA_SLUGS と同じ。★ slug を変えるときは両方直すこと。
      { source: '/area/:slug(hakata-eki|nakasu-tenjin)', destination: '/area/hakata-tenjin-nakasu', permanent: true },
      { source: '/working/:slug(hakata-eki|nakasu-tenjin)', destination: '/working/hakata-tenjin-nakasu', permanent: true },
      { source: '/jobs/area/:slug(hakata-eki|nakasu-tenjin)', destination: '/jobs/area/hakata-tenjin-nakasu', permanent: true },
      { source: '/jobs/area/:slug(hakata-eki|nakasu-tenjin)/tag/:tag', destination: '/jobs/area/hakata-tenjin-nakasu/tag/:tag', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/embed/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
          // 検索エンジンにも断片ページを拾わせない（metadata の noindex と二重防御）。
          { key: 'X-Robots-Tag', value: 'noindex' },
        ],
      },
    ];
  },
};

export default nextConfig;