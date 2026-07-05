// 求人一覧セクションの見出し「セラピスト求人」＋サブテキスト（全求人ページ共通）。
// バナーカードブロック（JobHeroBanners）がキーワード見出しを h1 として担うため、通常この一覧見出しは h2。
// ただしバナーが0件で JobHeroBanners が非表示になるページでは、この見出しを h1 に昇格させて h1 消失を防ぐ。
// （見出しレベルのみ切替。文言・スタイルは全ページ共通。<title>/meta/構造化データには関与しない。）
export function JobListHeading({ subtitle, asH1 = false }: { subtitle: string; asH1?: boolean }) {
  const Heading = asH1 ? 'h1' : 'h2';
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
        セラピスト求人
      </Heading>
      <p className="text-sm text-slate-500 mt-1.5">{subtitle}</p>
    </div>
  );
}
