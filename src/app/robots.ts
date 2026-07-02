import type { MetadataRoute } from 'next';

// 検索エンジン向け robots。公開ページ（トップ・サロン・セラピスト・フクエスワーク /jobs 等）は
// クロール許可し、ログイン必須の管理系・会員系のみ Disallow にする。
// /x（fukuX）は公開SNSのため全体は Disallow に入れない（管理系の /x/admin・/x/shop のみ除外）。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/mypage', // オーナー管理
          '/admin', // 運営管理
          '/moderation', // 口コミ審査
          '/member', // 会員マイページ
          '/cast', // セラピスト（キャスト）管理
          '/owner', // オーナー認証/ダッシュボード
          '/api/', // APIルート
          '/x/admin', // fukuX 運営パネル
          '/x/shop', // fukuX 店舗管理
        ],
      },
    ],
    sitemap: 'https://fukues.com/sitemap.xml',
  };
}
