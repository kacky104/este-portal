import Link from 'next/link';

// /listing の「公式ホームページ制作 0円」案内バナー（2026-08-17 / 第20便）。
// ListingFeatures（10機能）の直下・「掲載をご希望の店舗様へ」の直上に置く全幅の帯。
//
// ★ 帯まるごとが1本のリンク（/hp/templates）。
//   画像の中に「ホームページ制作を見る →」のボタンが【絵として】描き込まれているため、
//   その上にHTMLのボタンを重ねない。重ねると「画像リンク」と「ボタンリンク」の
//   2つの押せる場所ができ、読み上げでも同じ行き先が二重に読まれる（禁則：CTAのカードは1本の <a>）。
//
// ★ リンクの読み上げ名は aria-label で与えている。
//   中身の <img> は alt=""（装飾扱い）なので、これが無いとリンクに名前が無い状態になり、
//   スクリーンリーダーでは行き先の分からない「リンク」としか読まれない。
//   説明文は下の sr-only が持っているが、そちらは <a> の【外】に置いてある
//   （中に入れるとリンク名が長文まるごとになって読み上げが冗長になる）。
//
// ★ PC/SP の切り替えは 768px。<source media> と width/height をセットで扱うこと（禁則74）。
//   hp-pc.webp 1920×819 ／ hp-sp.webp 1254×1254。縦横比が大きく違うので
//   width/height を書かないと読み込み前後で下のコンテンツが飛ぶ。
//
// ★ display:none での出し分けはしない。表示されない側もブラウザは必ず落とすため（禁則84）。
//
// ★ 金額は画像の中にしか無い。文言を変えたら下の sr-only も必ず同時に直すこと（禁則85）。

export function ListingHpPromo() {
  return (
    <section className="w-full">
      {/* ── 画面に出さないテキスト（検索エンジン・読み上げ用）。
             ★ 画像に描かれている文言と一言一句そろえること。 */}
      <h2 className="sr-only">フクエス掲載店さま限定　公式ホームページを、もっと身近に。</h2>
      <ul className="sr-only">
        <li>フクエス掲載中なら、制作料 165,000円 → 0円</li>
        <li>フクエスワークにも掲載なら、月額 11,000円 → 0円</li>
      </ul>
      <p className="sr-only">両方掲載なら、年間11,000円のドメイン更新料のみ。</p>

      {/* ── 見た目（全幅の画像・帯ごと1本のリンク）── */}
      <Link
        href="/hp/templates"
        aria-label="ホームページ制作を見る"
        className="block hover:opacity-95 transition-opacity"
      >
        <picture>
          <source media="(max-width: 767px)" srcSet="/listing/hp-sp.webp" width={1254} height={1254} />
          <img
            src="/listing/hp-pc.webp"
            width={1920}
            height={819}
            alt=""
            loading="lazy"
            decoding="async"
            className="block w-full h-auto"
          />
        </picture>
      </Link>
    </section>
  );
}
