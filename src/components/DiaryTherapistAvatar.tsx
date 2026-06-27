import Image from 'next/image';

// 写メ日記カード用のセラピスト丸アイコン。
// スタイルはトップのピックアップサロン（FeaturedSalonSlider）の円形サムネを流用：円形・白枠・影。
// 画像が無いセラピストは名前イニシャルをピンクグラデ地に表示（流用元の ♡ フォールバック相当）。
export function DiaryTherapistAvatar({
  src,
  name,
  size = 32,
}: {
  src: string | null;
  name: string;
  size?: number;
}) {
  return (
    <span
      className="relative flex-shrink-0 rounded-full border-2 border-white overflow-hidden shadow-sm bg-gradient-to-br from-pink-300 to-rose-400 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image src={src} alt={name} fill className="object-cover" sizes={`${size}px`} />
      ) : (
        <span className="text-white font-bold leading-none" style={{ fontSize: Math.round(size * 0.45) }}>
          {name.charAt(0) || '♡'}
        </span>
      )}
    </span>
  );
}
