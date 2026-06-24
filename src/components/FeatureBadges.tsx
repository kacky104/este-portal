// セラピストカード用の特徴バッジ表示（小型）。
// 色は therapistBadges.ts の getBadgeColors（カテゴリ別）を流用。詳細ページ/編集UIと同じ配色。
// 純粋な表示コンポーネント（フック・cookie 不使用）なのでサーバー/クライアント両方から使える。
import { getBadgeColors } from '@/lib/therapistBadges';

export function FeatureBadges({
  badges,
  className = '',
}: {
  badges?: string[] | null;
  className?: string;
}) {
  const list = (badges ?? []).slice(0, 3);
  if (list.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-0.5 ${className}`}>
      {list.map((label) => {
        const c = getBadgeColors(label);
        if (!c) return null; // 未知ラベルは出さない
        return (
          <span
            key={label}
            className="text-[9px] font-bold leading-none px-1.5 py-0.5 rounded-full border whitespace-nowrap"
            style={{ backgroundColor: c.fill, color: c.text, borderColor: c.border }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}
