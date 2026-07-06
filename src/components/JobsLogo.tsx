import Link from 'next/link';
import Image from 'next/image';

// フクエスワーク（求人サイト）専用ロゴ。本体ヘッダー（肉球マーク＋サイト名）と同じ構成に揃える。
// 肉球は正規ロゴ画像 /logo-fukuwork.png（円囲み＋肉球・記事構造化データの publisher.logo と共通）。
// サイト名の左横に配置し、ロゴ＋サイト名（＋サブタイトル）全体をトップ /jobs へのリンク範囲に含める。
// 表示は w-6 h-6（24px・右の保存メニューの肉球と同寸）で、ヘッダー高 h-14 を変えない。
// width/height を明示（Retina 対応で 48px 実寸→24px 表示・滲み防止）＝レイアウトシフトなし。
// ヘッダー常設で LCP 相当のため priority 付与で初回から即表示。
export function JobsLogo() {
  return (
    <Link href="/jobs" className="flex items-center gap-2 min-w-0">
      <Image
        src="/logo-fukuwork.png"
        alt="フクエスワーク"
        width={48}
        height={48}
        priority
        className="w-6 h-6 flex-shrink-0 object-contain"
      />
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
