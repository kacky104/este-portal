import { LogoHomeLink } from './LogoHomeLink';
import Image from 'next/image';

// ヘッダー共通ロゴ。ロゴ画像（/logo.png）＋「フクエス」グラデ文字。
// ★ 第488便（カッキーさん）: サブテキスト「～福岡メンズエステポータル～」は外した。
// 全ヘッダーでベタ書きしていたマークアップをここに集約。リンク先は / 。
// ★ 第1554便: スマホは少し小さく・折り返さない（ヘッダーにポイントが入って文字が縦に割れたため）。幅 380px 未満は画像だけ。
// 画像とリンクのみのためサーバーコンポーネントのまま（'use client' 不要）。
// ★ 第1617便: TOP でロゴを押したら一番上へ戻して読み込み直す（リンク部分だけ LogoHomeLink＝クライアント）。
export function Logo() {
  return (
    <LogoHomeLink className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0 whitespace-nowrap">
      <Image
        src="/logo.png"
        alt="フクエス"
        width={28}
        height={28}
        priority
        className="w-6 h-6 sm:w-7 sm:h-7 flex-shrink-0"
      />
      <span className="flex items-baseline gap-1 max-[379px]:hidden"><span className="font-bold text-[18px] sm:text-[22px] tracking-wide leading-none inline-block" style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>フクエス</span></span>
    </LogoHomeLink>
  );
}
