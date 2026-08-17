// /listing「掲載をご希望の店舗様へ」の見出しブロック（2026-08-17 / 第20便）。
// もともと <h2> と説明文の <p> だった部分を、オーナー作成のデザイン画像に差し替えたもの。
//
// ★ 幅は本文ラッパー（max-w-3xl）の【中】。全幅にしていない（2026-08-17 オーナー判断）。
//   この帯は「すぐ下のPDF案内と入力フォームの見出し」なので、
//   フォームと左右が揃っているほうが、何の見出しなのかが伝わる。
//   上の3ブロック（ListingAbout / ListingFeatures / ListingHpPromo）は全幅だが、
//   あちらは独立した紹介セクションで役割が違う。
//
// ★ リンクを付けていない。画像の「下のフォームから相談する↓」が指しているのは
//   すぐ下にある実物のフォームで、押させる先が別にあるわけではない。
//   ここをリンクにすると「押したのにその場から動かない」体験になる。
//
// ★ 文章は sr-only で HTML に残してある（禁則85）。
//   とくに <h2>掲載をご希望の店舗様へ</h2> は見出し階層の一部なので必ず残すこと。
//   これを消すと、このページの h2 が「無料掲載について」から始まることになり、
//   フォームがどのセクションに属するのか読み上げでたどれなくなる。
//   ★ 画像側の文言を変えたら、ここの sr-only も同時に直すこと。
//
// ★ PC/SP の切り替えは 768px。<source media> と width/height をセットで扱うこと（禁則74）。
//   contact-pc.webp 2062×763 ／ contact-sp.webp 1254×1254。縦横比が大きく違う
//   （2.70 と 1.00）ので、width/height が無いと読み込み前後で下のフォームが飛ぶ。
//
// ★ display:none での出し分けはしない。表示されない側もブラウザは必ず落とすため（禁則84）。

export function ListingContactHeading() {
  return (
    <section className="mb-4">
      {/* ── 画面に出さないテキスト（検索エンジン・読み上げ用）。画像の文言と一致させること。 */}
      <h2 className="sr-only">掲載をご希望の店舗様へ</h2>
      <p className="sr-only">CONTACT　福岡で、もっと選ばれるお店へ。</p>
      <p className="sr-only">
        本サイトへの掲載をご希望の店舗様は、下記フォームからお気軽にお問い合わせください。掲載内容・条件等の詳細をご案内いたします。
      </p>
      <p className="sr-only">ご相談無料／資料請求OK</p>

      {/* ── 見た目（画像）。alt="" ＝ 装飾扱い（内容は上の sr-only が持っている）。 */}
      <picture>
        <source media="(max-width: 767px)" srcSet="/listing/contact-sp.webp" width={1254} height={1254} />
        <img
          src="/listing/contact-pc.webp"
          width={2062}
          height={763}
          alt=""
          loading="lazy"
          decoding="async"
          className="block w-full h-auto rounded-2xl"
        />
      </picture>
    </section>
  );
}
