// 新人セラピスト用「NEW」バッジ（仕様で指定された緑色デザイン）

export function NewBadge({ className }: { className?: string }) {
  return (
    <span
      className={className}
      style={{
        background: '#15803d', // ★ 第1529便: #22c55e → green-700（白文字のコントラスト 2.3→5.0・PageSpeed ユーザー補助）
        color: 'white',
        fontSize: '11px',
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: '20px',
        lineHeight: 1.2,
        display: 'inline-block',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      NEW
    </span>
  );
}
