// fukuX 認証バッジ（is_verified）。「行動の可否」とは無関係＝信頼の表示のみ。
// 色分け：運営事務局(kind='official')は公式＝ゴールド（is_verified に依存せず無条件表示）。
// 店舗(kind='shop')は運営手動の認証＝インディゴ。セラピスト(kind='therapist')は
// 所属＋画像付き投稿10件以上で自動付与される認証＝赤。kind 未指定時は従来どおり店舗(インディゴ)。
const BADGE: Record<'shop' | 'therapist' | 'official', { fill: string; title: string }> = {
  official: { fill: '#F59E0B', title: 'フクエス公式（運営事務局）' },
  shop: { fill: '#6366F1', title: '運営確認済みの店舗' },
  therapist: { fill: '#EF4444', title: '認証済みのセラピスト' },
};

export function VerifiedBadge({
  size = 14,
  className,
  kind,
}: {
  size?: number;
  className?: string;
  kind?: string;
}) {
  const { fill, title } =
    kind === 'official' ? BADGE.official : kind === 'therapist' ? BADGE.therapist : BADGE.shop;
  return (
    <span
      title={title}
      aria-label="認証済み"
      className={`inline-flex items-center justify-center flex-shrink-0 ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
        <path
          fill={fill}
          d="M12 1.5l2.5 2.1 3.3-.3.9 3.2 2.8 1.8-1.3 3 1.3 3-2.8 1.8-.9 3.2-3.3-.3L12 22.5l-2.5-2.1-3.3.3-.9-3.2L2.5 15.7l1.3-3-1.3-3 2.8-1.8.9-3.2 3.3.3z"
        />
        <path fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M8.2 12.2l2.6 2.6 5-5.4" />
      </svg>
    </span>
  );
}
