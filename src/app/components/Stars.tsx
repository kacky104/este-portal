// 0.5刻みの★評価を描画する共通コンポーネント（サーバー/クライアント両用・presentationalのみ）。
// 半星は「グレーの星を下地に、オレンジの星を割合分だけ幅クリップして重ねる」方式で表現する。
// gradient の id 衝突を避けるため塗りは単色＋幅クリップで実装（同一ページに何個並んでもOK）。

const EMPTY = '#e2e8f0'; // slate-200
const FILL = '#FB923C';  // ブランドのオレンジ

export function StarIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden className="block">
      <path d="M12 2.2l2.95 5.98 6.6.96-4.78 4.66 1.13 6.58L12 17.27l-5.9 3.11 1.13-6.58L2.45 9.14l6.6-.96z" />
    </svg>
  );
}

function Star({ fill, size }: { fill: number; size: number }) {
  const pct = `${Math.max(0, Math.min(1, fill)) * 100}%`;
  return (
    <span className="relative inline-block flex-shrink-0" style={{ width: size, height: size }}>
      <span className="absolute inset-0">
        <StarIcon size={size} color={EMPTY} />
      </span>
      <span className="absolute inset-0 overflow-hidden" style={{ width: pct }}>
        <StarIcon size={size} color={FILL} />
      </span>
    </span>
  );
}

// value: 0〜5（0.5刻みを想定）。size: 1つの星のピクセル幅。
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const v = Number.isFinite(value) ? value : 0;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`5段階中 ${v} の評価`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} fill={v - i} size={size} />
      ))}
    </span>
  );
}
