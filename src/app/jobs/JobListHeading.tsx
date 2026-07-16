// 求人一覧セクションの見出し「セラピスト求人」＋サブテキスト（全求人ページ共通）。
// ページの h1 はバナーカードブロック（JobHeroBanners）がバナー0件でも常に描画して担うため、
// この一覧見出しは常に h2（h1 の二重化を避ける）。
// asH1/h1Title は「JobHeroBanners を置かないページでこの見出しに h1 を担わせる」ための予備プロップで、
// 現在は全求人ページが JobHeroBanners を持つため未使用（asH1=true を渡す呼び出し元は無い）。
// 昇格時（asH1=true）は h1Title でページ固有文言に差し替え可能。非昇格（h2）や未指定は共通文言「セラピスト求人」。
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
      {/* 30分入れ替えの注記（見出し h2/h1 構造には含めない・控えめなグレー小文字）。
          この一覧は shuffleJobs（30分バケット）でシャッフル済みのため表記と一致。 */}
      <p className="text-xs text-gray-500 mt-1">表示順は30分ごとに入れ替わります</p>
    </div>
  );
}
