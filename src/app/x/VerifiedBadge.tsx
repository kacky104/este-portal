// fukuX 認証バッジ（is_verified）。現状は店舗(kind='shop')のみ付与する運用。
// 「行動の可否」とは無関係＝信頼の表示のみ。fukuX のトーン（インディゴ）に合わせたチェックバッジ。
export function VerifiedBadge({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <span
      title="運営確認済みの店舗"
      aria-label="認証済み"
      className={`inline-flex items-center justify-center flex-shrink-0 ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
        <path
          fill="#6366F1"
          d="M12 1.5l2.5 2.1 3.3-.3.9 3.2 2.8 1.8-1.3 3 1.3 3-2.8 1.8-.9 3.2-3.3-.3L12 22.5l-2.5-2.1-3.3.3-.9-3.2L2.5 15.7l1.3-3-1.3-3 2.8-1.8.9-3.2 3.3.3z"
        />
        <path fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M8.2 12.2l2.6 2.6 5-5.4" />
      </svg>
    </span>
  );
}
