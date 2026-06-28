import Link from 'next/link';
import Image from 'next/image';

// fukuX の正式ロゴ（画像）。public/fukux-logo.png（400×200・2:1・透過）を表示する。
// ヘッダー・サインアップ画面・認証モーダル等で共有。差し替えはこのコンポーネントだけで全体反映される。
// size に応じて高さを出し分け、幅は 2:1 で算出（縦横比固定＝潰れない）。
const SIZES = {
  sm: { w: 48, h: 24 },
  md: { w: 64, h: 32 },
  lg: { w: 80, h: 40 },
} as const;

export function XLogo({
  href = '/x',
  size = 'md',
}: {
  href?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const { w, h } = SIZES[size];
  return (
    <Link href={href} className="inline-flex items-center leading-none" aria-label="fukuX">
      <Image
        src="/fukux-logo.png"
        alt="fukuX"
        width={w}
        height={h}
        priority
        className="object-contain"
      />
    </Link>
  );
}
