// 本体コラムの見出しブロック（2026-08-18 第23便）。
//
// 一覧（/column）とカテゴリ別一覧（/column/category/[key]）が共用する。
// ★ 片方だけ直すと見た目がずれるので、必ずここ1本で持つこと。
//
// やっていること:
//   - 見出し・説明文を中央寄せにする（カテゴリチップの中央寄せは CategoryChips 側）
//   - 英字のアイブロウ → グラデーションの大見出し → 細い罫線 → 説明文
//     ＝ /news・/reviews と同じ作法。サイト全体で見たときに揃う（2026-08-18 オーナー選択）。
//
// ★ 文字の色は「装飾だから薄くてよい」ではなく、実測でコントラスト比を取っている。
//   実測値（白地 #f8fafc 上・390px）: アイブロウ 5.64:1 / 見出し 4.93:1 / 説明文 7.25:1。
//   薄いピンク（pink-400 は白地に2.6:1）は読めないので使わないこと（禁則127と同じ考え方）。
//   ★ 色を明るい側へ動かすときは必ず測り直すこと。
//
// ★ 求人側（app/jobs/column/ColumnHeading.tsx）はこれの緑テーマ版。
//   構造を変えるときは両方そろえること（ArticleCard・CategoryChips と同じ運用）。

export function ColumnHeading({
  title,
  description,
}: {
  title: string;
  /** 空文字なら説明文の段落ごと出さない（未設定のカテゴリでも崩れない） */
  description: string;
}) {
  return (
    <header className="mb-6 text-center">
      <p className="text-[11px] font-semibold tracking-[0.35em] text-pink-700">COLUMN</p>
      <h1 className="mt-2 bg-gradient-to-r from-pink-700 via-rose-500 to-pink-700 bg-clip-text text-2xl sm:text-4xl font-black tracking-[0.04em] text-transparent drop-shadow-[0_1px_10px_rgba(236,72,153,0.18)]">
        {title}
      </h1>
      <div aria-hidden className="mx-auto mt-4 h-px w-24 bg-gradient-to-r from-transparent via-pink-400 to-transparent" />
      {description && (
        <p className="mx-auto mt-4 max-w-xl text-xs sm:text-sm leading-relaxed text-slate-600">{description}</p>
      )}
    </header>
  );
}
