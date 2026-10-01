import type { Metadata } from 'next';

// ★ 第1082便: /diary と /diary/page/[n] の metadata（1か所）。
const PAGE_TITLE = '福岡メンズエステの写メ日記【フクエス】';
const PAGE_DESC =
  '福岡のメンズエステ各店のセラピストが投稿する写メ日記を新着順でまとめてチェック。出勤情報やお店の雰囲気、セラピストの日常が写真でわかります。';

// ?page=n ごとに自己参照 canonical とタイトルを出す（2026-08-06）。
// 従来は静的 metadata で canonical を '/diary' 固定にしていたため、2ページ目以降の
// 中身（＝古い日記）が「1ページ目の重複」扱いになりインデックスされなかった。
// このページはもともと本体側で searchParams を読む＝動的レンダリングなので、
// generateMetadata で読んでもレンダリング方式は変わらない。
export function buildDiaryListMetadata(page: number): Metadata {
  // 1ページ目は素のパス。★ 第1082便: 2ページ目以降は /diary/page/[n]（?page= から変更・ISR を効かせるため）。
  const path = page <= 1 ? '/diary' : `/diary/page/${page}`;
  const suffix = page <= 1 ? '' : `（${page}ページ目）`;
  // ★ 第1084便: 2ページ目以降も1ページ目と同じ「…【フクエス】」の形に揃える
  const title = page <= 1 ? PAGE_TITLE : `福岡メンズエステの写メ日記${suffix}【フクエス】`;
  const description = page <= 1 ? PAGE_DESC : `${PAGE_DESC}${suffix}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    // Next の metadata は浅いマージ＝openGraph を部分指定すると root layout の og が丸ごと消える
    // （og:image も消える）。そのため images まで全て明示する。
    openGraph: {
      title,
      description,
      url: path,
      siteName: 'フクエス',
      type: 'website',
      images: [{ url: '/ogp.png', width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/ogp.png'] },
  };
}
