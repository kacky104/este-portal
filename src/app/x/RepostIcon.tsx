// fukuX「リポスト」用アイコン。currentColor 追従＝親の text-* 色で塗り分け（既定グレー／リポスト済みは緑）。
// 図柄は矢印ループ（2本の矢印が循環）のアウトライン。塗りではなくストローク（いいね等と同じ作法）。
export function RepostIcon({ className, size = 18 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
