// 求人コラムの見出しブロック（2026-08-18 第23便）。
// 本体側 app/column/ColumnHeading.tsx の緑テーマ版。構造は同じ・色だけ違う。
// ★ 片方だけ直すと見た目がずれるので、変えるときは必ず両方そろえること。
//
// ★ 文字の色は実測でコントラスト比を取っている。
//   実測値（白地 #f8fafc 上・390px）: アイブロウ 5.13:1 / 見出し 4.14:1 / 説明文 6.67:1。
//   見出しは24px以上の太字（大きな文字）なので基準は3:1。薄い緑は白地で読めないので使わないこと。

export function ColumnHeading({
  title,
  description,
}: {
  title: string;
  /** 空文字なら説明文の段落ごと出さない */
  description: string;
}) {
  return (
    <header className="mb-6 text-center">
      <p className="text-[11px] font-semibold tracking-[0.35em] text-emerald-700">WORK COLUMN</p>
      <h1 className="mt-2 bg-gradient-to-r from-emerald-700 via-lime-600 to-emerald-700 bg-clip-text text-2xl sm:text-4xl font-black tracking-[0.04em] text-transparent drop-shadow-[0_1px_10px_rgba(16,185,129,0.18)]">
        {title}
      </h1>
      <div aria-hidden className="mx-auto mt-4 h-px w-24 bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />
      {description && (
        <p className="mx-auto mt-4 max-w-xl text-xs sm:text-sm leading-relaxed text-slate-600">{description}</p>
      )}
    </header>
  );
}
