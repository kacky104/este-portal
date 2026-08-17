// /listing の「掲載店舗募集のご案内（PDF）」への導線（2026-08-17 / 第20便）。
// もともとHTMLで組んだピンクのカード（PDFアイコン＋2行のテキスト）だった部分を、
// オーナー作成のデザイン画像に差し替えたもの。
//
// ★ 幅は本文ラッパー（max-w-3xl）の【中】。上のCONTACT帯やHP 0円帯と違って全幅にしない。
//   これは下のお問い合わせフォームと対になる導線で、フォームと左右が揃っているほうが
//   同じブロックの一部として読める。
//
// ★ 帯まるごとが1本の <a>（禁則：CTAのカードは1本の <a>）。
//   「資料を開く →」のボタンは画像に絵として描き込まれているので、
//   その上にHTMLのボタンを重ねない。重ねると押せる場所が2つになり、
//   読み上げでも同じ行き先が二重に読まれる。
//
// ★ リンクの読み上げ名は aria-label で与えている。中の <img> は alt=""（装飾扱い）なので、
//   これが無いとリンクに名前が無い状態になり、行き先の分からない「リンク」としか読まれない。
//   説明文は sr-only で <a> の【外】に置いてある（中に入れるとリンク名が長文になる）。
//
// ★ target="_blank" + rel="noopener noreferrer" は差し替え前と同じ。
//   PDFを別タブで開き、掲載ページ自体は残す（戻ってフォームを送れるように）。
//
// ★ PC/SP の切り替えは 768px。<source media> と width/height をセットで扱うこと（禁則74）。
//   pdfguide-pc.webp 1983×490 ／ pdfguide-sp.webp 1746×901。
//   ★ 縦横比が 4.05 と 1.94 で大きく違う。width/height を書かないと
//     読み込み前後で下のフォームが大きく飛ぶ。
//
// ★ 受け取った元PNGは【ファイル名とPC/SPが逆】だった（2026-08-17）。
//   ずんぐりした 1746×901（名前は PDFPC）が幅の狭いスマホ向き、
//   横長の 1983×793（名前は PDFSP）が幅の広いPC向き。実測して入れ替えてある。
//   ★ 次に画像をもらったときも、名前ではなく【縦横比】で判断すること。
//
// ★ PC用は元PNGの上147px・下156px が「ほぼ白」の余白だったので切り落としてある。
//   そのまま使うと、うっすらピンクのページ背景の上に白い帯が約60pxずつ乗って見える。
//
// ★ display:none での出し分けはしない。表示されない側もブラウザは必ず落とすため（禁則84）。

export function ListingGuidePdfLink() {
  return (
    <section className="mb-4">
      {/* ── 画面に出さないテキスト（検索エンジン・読み上げ用）。画像の文言と一致させること。 */}
      <p className="sr-only">
        PDF GUIDE　詳しい掲載内容をPDFで見る。料金・機能・掲載までの流れをまとめたご案内資料です。
      </p>

      <a
        href="/docs/fukues-listing-guide.pdf"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="掲載店舗募集のご案内（PDF）を開く"
        className="block hover:opacity-95 transition-opacity"
      >
        <picture>
          <source media="(max-width: 767px)" srcSet="/listing/pdfguide-sp.webp" width={1746} height={901} />
          <img
            src="/listing/pdfguide-pc.webp"
            width={1983}
            height={490}
            alt=""
            loading="lazy"
            decoding="async"
            className="block w-full h-auto rounded-2xl"
          />
        </picture>
      </a>
    </section>
  );
}
