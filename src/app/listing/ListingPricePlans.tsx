// /listing の「料金プラン」ブロック（2026-08-17 / 第20便）。
//
// ★ なぜ入れたか。それまで金額は掲載案内PDFの中にしか無く、ページ上には
//   「制作料 165,000円 → 0円」「月額 11,000円 → 0円」という【割引だけ】が出ていた。
//   その 0円 の条件である「フクエス掲載中」「フクエスワークにも掲載」がいくらなのかは
//   どこにも書かれていない状態で、割引の額だけ大きく見せて定価を伏せている形だった。
//   ★ PDFはフォーム無しで誰でも直接開けるURLなので、隠すことで守れているものは何も無い。
//
// ★ 置き場所は ListingFeatures（10機能）の直後・ListingHpPromo（公式HP 0円）の【前】。
//   「機能 → いくら → その掲載店なら0円 → 問い合わせ」の順にするため。
//   順番を入れ替えると 0円 が何に対する割引なのか分からなくなるので動かさないこと。
//
// ★ 隔たりは入れていない。上の10機能が暗い画像・この料金プランがクリーム・
//   下のHP 0円がまた暗い、と交互になるため、境目は色で分かれる。
//   （ListingContactHeading で 40px の黒い隔たりを入れたのは、上下とも暗くて
//     つながって見えたから。同じ理由がここには無い。）
//
// ★ 金額は画像の中にしかないので、sr-only に文字でも持たせてある（禁則85）。
//   料金は「掲載を検討している店舗様がいちばん知りたい情報」なので、
//   検索エンジンにも読み上げにも残らない状態にはしないこと。
//   ★ 金額を改定したら【画像・sr-only・掲載案内PDF】の3つを同時に直すこと。
//     どれか1つ忘れると、画面とPDFで違う金額を出すことになる。
//     PDF は public/docs/fukues-listing-guide.pdf（6ページ目が料金）。
//
// ★ PC/SP の切り替えは 768px。<source media> と width/height をセットで扱うこと（禁則74）。
//   price-pc.webp 1672×941 ／ price-sp.webp 864×1821。
//
// ★ display:none での出し分けはしない。表示されない側もブラウザは必ず落とすため（禁則84）。

export function ListingPricePlans() {
  return (
    <section className="w-full">
      {/* ── 画面に出さないテキスト（検索エンジン・読み上げ用）。画像の文言と一致させること。 */}
      <h2 className="sr-only">料金プラン</h2>
      <p className="sr-only">必要なサービスを、わかりやすい月額で。</p>

      <h3 className="sr-only">集客プラン　フクエス 店舗掲載　月額 66,000円（税込）</h3>
      <ul className="sr-only">
        <li>店舗ページ・セラピスト紹介</li>
        <li>出勤・写メ日記・口コミ</li>
        <li>fukuX・予約ボード</li>
      </ul>

      <h3 className="sr-only">採用オプション　フクエスワーク 求人掲載　月額 33,000円（税込）</h3>
      <ul className="sr-only">
        <li>求人ページ掲載</li>
        <li>Googleしごと検索対応</li>
        <li>店舗ページとの連携</li>
      </ul>

      <p className="sr-only">※ 契約期間・お支払い方法など、詳細はお問い合わせ時にご案内します。</p>

      {/* ── 見た目（全幅の画像）。alt="" ＝ 装飾扱い（内容は上の sr-only が持っている）。 */}
      <picture>
        <source media="(max-width: 767px)" srcSet="/listing/price-sp.webp" width={864} height={1821} />
        <img
          src="/listing/price-pc.webp"
          width={1672}
          height={941}
          alt=""
          loading="lazy"
          decoding="async"
          className="block w-full h-auto"
        />
      </picture>
    </section>
  );
}
