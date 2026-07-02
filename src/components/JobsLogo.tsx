import Link from 'next/link';

// フクエスワーク（求人サイト）専用ロゴ。共通 Logo を参考にしたテキストロゴ。
// ブランドカラー＝グリーン→ライム（#10B981→#84CC16）のグラデ文字。
// 肉球マーク等の画像アセットは未作成のため今回はテキストのみ（後日 public/fukuwork-mark.png を
// 追加する際はこのコンポーネントに画像を足すだけで全ヘッダーに反映される）。リンク先は /jobs。
export function JobsLogo() {
  return (
    <Link href="/jobs" className="flex items-baseline gap-1.5">
      <span
        className="font-bold text-[22px] tracking-wide leading-none inline-block"
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
        className="hidden min-[420px]:inline-block text-[11px] font-normal leading-none"
        style={{ color: '#059669' }}
      >
        ～福岡メンズエステ求人～
      </span>
    </Link>
  );
}
