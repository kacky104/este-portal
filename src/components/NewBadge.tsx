// 新人セラピスト用「NEW」バッジ（仕様で指定された緑色デザイン）

export function NewBadge({ className }: { className?: string }) {
  return (
    <span
      className={className}
      style={{
        background: '#22c55e',
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
