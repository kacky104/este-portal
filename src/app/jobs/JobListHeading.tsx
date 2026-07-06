// 求人一覧セクションの見出し「セラピスト求人」＋サブテキスト（全求人ページ共通）。
// バナーカードブロック（JobHeroBanners）がキーワード見出しを h1 として担うため、通常この一覧見出しは h2。
// ただしバナーが0件で JobHeroBanners が非表示になるページでは、この見出しを h1 に昇格させて h1 消失を防ぐ。
// h1 昇格時（asH1=true）は h1Title でページ固有文言に差し替え可能（SEO：ファーストビューh1のページ固有性を確保）。
// h1Title 未指定、または非昇格時（h2）は従来どおり共通文言「セラピスト求人」。バナー側 h1 と排他描画のためh1は常に1つ。
// （見出しレベルと昇格時文言のみ切替。スタイルは全ページ共通。<title>/meta/構造化データには関与しない。）
export function JobListHeading({
  subtitle,
  asH1 = false,
  h1Title,
}: {
  subtitle: string;
  asH1?: boolean;
  h1Title?: string;
}) {
  const Heading = asH1 ? 'h1' : 'h2';
  // 昇格時のみページ固有文言を採用。非昇格（h2）や未指定は共通文言を維持。
  const text = asH1 && h1Title ? h1Title : 'セラピスト求人';
  return (
    <div className="mb-6">
      <Heading
        className="text-2xl sm:text-3xl font-extrabold inline-block"
        style={{
          background: 'linear-gradient(95deg,#10B981,#84CC16)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent',
        }}
      >
        {text}
      </Heading>
      <p className="text-sm text-slate-500 mt-1.5">{subtitle}</p>
    </div>
  );
}
