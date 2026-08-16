// /listing の「お店の成長を支える10の機能」ブロック（2026-08-17 / 第19便）。
//
// ★ もともとここは HTML のカード8枚だった（店舗ページ／セラピスト紹介／写メ日記／
//   予約導線／口コミ／求人／埋め込み／fukuX）。オーナー作成のデザイン画像へ差し替え、
//   あわせて【09 予約ボード】【10 公式ホームページ制作】の2つが増えて10機能になった。
//
// ★ SP用は「上」「下」の2枚をもらったが、縦に連結して1ファイルにしてある。
//   理由は転送量。display:none で出し分けると、表示されない側の画像も
//   ブラウザは必ずダウンロードする（PCの人にSP画像2枚が無駄に流れる）。
//   1ファイルにして <picture> で選ばせれば、どの端末も必要な1枚だけを受け取る。
//   ★ 画像を作り直すときも「上・下の2枚」でもらってよい。連結はこちらで行う。
//     連結後の実寸は 864×3642（上下とも 864×1821）。
//
// ★ 文章は sr-only で HTML に残してある（ListingAbout と同じ方針）。
//   画像側の文言を変えたら、ここの sr-only も必ず同時に直すこと。
//
// ★ このブロックは確実にファーストビューの下なので loading="lazy"。
//   ページ上部のヒーローと ListingAbout（eager）とは扱いを分けている。
//
// ★ PC/SP の切り替えは 768px。<source media> と width/height をセットで扱うこと（禁則74）。
//   features-pc.webp 1586×992 ／ features-sp.webp 864×3642。

/** 画像に載っている10機能（名前と短い説明）。sr-only の一覧に使う。 */
const FEATURES: ReadonlyArray<{ no: string; name: string; desc: string }> = [
  { no: '01', name: '店舗ページ', desc: '店舗情報・料金・写真を掲載' },
  { no: '02', name: 'セラピスト紹介・出勤スケジュール', desc: 'プロフィールと本日の出勤を発信' },
  { no: '03', name: '写メ日記', desc: 'スマートフォンから日記を投稿' },
  { no: '04', name: '予約につながる導線', desc: '電話・LINE・ネット予約へ誘導' },
  { no: '05', name: '口コミ・ランキング', desc: '信頼と新規来店を後押し' },
  { no: '06', name: 'セラピスト求人', desc: 'フクエスワークで採用を支援' },
  { no: '07', name: '公式サイトへの埋め込み', desc: '写メ日記・口コミをそのまま表示' },
  { no: '08', name: 'fukuX（フクエックス）', desc: '福岡メンズエステ専用SNS' },
  { no: '09', name: '予約ボード', desc: 'PC・スマートフォンから、お客さまの予約をかんたんに一元管理。' },
  { no: '10', name: '公式ホームページ制作', desc: '掲載データと連動した、お店専用の公式ホームページを制作。' },
];

export function ListingFeatures() {
  return (
    <section className="w-full">
      {/* ── 画面に出さないテキスト（検索エンジン・読み上げ用）── */}
      <h2 className="sr-only">掲載するだけじゃない。お店の成長を支える、10の機能。</h2>
      <p className="sr-only">
        ALL-IN-ONE PLATFORM　集客・採用・予約・運営まで。フクエスひとつで、もっとスマートに。
      </p>
      <ul className="sr-only">
        {FEATURES.map((f) => (
          <li key={f.no}>
            {f.no}　{f.name}　{f.desc}
          </li>
        ))}
      </ul>
      <p className="sr-only">
        NEW　予約も、ホームページも。店舗運営をさらにスマートに。
        集客から予約、公式サイトまで。フクエスが、お店の成長を支えます。
      </p>

      {/* ── 見た目（全幅の画像）。alt="" ＝ 装飾扱い（内容は上の sr-only が持っている）。 */}
      <picture>
        <source media="(max-width: 767px)" srcSet="/listing/features-sp.webp" width={864} height={3642} />
        <img
          src="/listing/features-pc.webp"
          width={1586}
          height={992}
          alt=""
          loading="lazy"
          decoding="async"
          className="block w-full h-auto"
        />
      </picture>
    </section>
  );
}
