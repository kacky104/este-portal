import Link from 'next/link';
import Image from 'next/image';

// ヘッダー共通ロゴ。肉球ロゴ画像（/logo.png）＋「フクエス」グラデ文字＋サブテキスト。
// 全ヘッダーでベタ書きしていたマークアップをここに集約。リンク先は / 。
// 画像とリンクのみのためサーバーコンポーネントのまま（'use client' 不要）。
export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-1.5">
      <Image
        src="/logo.png"
        alt="フクエス"
        width={28}
        height={28}
        priority
        className="w-7 h-7 flex-shrink-0"
      />
      <span className="flex items-baseline gap-1"><span className="font-bold text-[22px] tracking-wide leading-none inline-block" style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>フクエス</span><span className="hidden min-[420px]:inline-block text-[12px] font-normal leading-none" style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>～福岡メンズエステポータル～</span></span>
    </Link>
  );
}
