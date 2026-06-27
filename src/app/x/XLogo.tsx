import Link from 'next/link';

// fukuX のワードマーク（仮ロゴ）。正式ロゴが決まったらこのコンポーネントだけ差し替えれば全体に反映される。
// 既存フクエス（オレンジ→マゼンタ）と差別化し、SNSらしいインディゴ→バイオレット→スカイのトーンにする。
export function XLogo({
  href = '/x',
  size = 'md',
}: {
  href?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const cls = size === 'lg' ? 'text-4xl' : size === 'sm' ? 'text-lg' : 'text-2xl';
  return (
    <Link href={href} className={`inline-flex items-baseline font-black tracking-tight leading-none ${cls}`}>
      <span className="text-slate-900">fuku</span>
      <span
        style={{
          background: 'linear-gradient(100deg,#6366F1,#8B5CF6,#0EA5E9)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent',
        }}
      >
        X
      </span>
    </Link>
  );
}
