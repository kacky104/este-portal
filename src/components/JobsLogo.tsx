import Link from 'next/link';

// フクエスワーク（求人サイト）専用ロゴ。本体ヘッダー（肉球マーク＋サイト名）と同じ構成に揃える。
// 肉球はブランドカラー（グリーン→ライム #10B981→#84CC16）のグラデ塗りインラインSVG
// （lucide等の新規依存・画像ファイルの新規追加はしない方針）。サイト名の左横に配置し、
// ロゴ＋サイト名（＋サブタイトル）全体をトップ /jobs へのリンク範囲に含める。
// 高さは肉球 w-6 h-6（24px・右の保存メニューの肉球と同寸）で、ヘッダー高 h-14 を変えない。
export function JobsLogo() {
  return (
    <Link href="/jobs" className="flex items-center gap-2 min-w-0">
      {/* 肉球マーク（インラインSVG・グリーン→ライムのグラデ塗り）。装飾のため aria-hidden。 */}
      <svg viewBox="0 0 24 24" className="w-6 h-6 flex-shrink-0" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="fukuworkPaw" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#84CC16" />
          </linearGradient>
        </defs>
        <g fill="url(#fukuworkPaw)">
          <ellipse cx="5.6" cy="10" rx="1.9" ry="2.5" />
          <ellipse cx="10" cy="7" rx="2" ry="2.7" />
          <ellipse cx="14.5" cy="7" rx="2" ry="2.7" />
          <ellipse cx="18.6" cy="10" rx="1.9" ry="2.5" />
          <path d="M12 11.5c-3.3 0-6 2.4-6 5.2 0 1.9 1.5 3.3 3.4 3.3 1.2 0 1.9-.5 2.6-.5s1.4.5 2.6.5c1.9 0 3.4-1.4 3.4-3.3 0-2.8-2.7-5.2-6-5.2z" />
        </g>
      </svg>
      <span className="flex items-baseline gap-1.5 min-w-0">
        <span
          className="font-bold text-[22px] tracking-wide leading-none inline-block whitespace-nowrap"
          style={{
            background: 'linear-gradient(95deg,#10B981,#84CC16)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}
        >
          フクエスワーク
        </span>
        <span
          className="hidden min-[420px]:inline-block text-[11px] font-normal leading-none whitespace-nowrap"
          style={{ color: '#059669' }}
        >
          ～福岡メンズエステ求人～
        </span>
      </span>
    </Link>
  );
}
