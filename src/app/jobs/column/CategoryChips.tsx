import Link from 'next/link';
import { ARTICLE_CATEGORY_ORDER, articleCategoryLabel } from '@/app/lib/articleCategories';

// カテゴリ絞り込みチップ。activeKey=null は「すべて」（/jobs/column）を選択中扱い。
// 各カテゴリは /jobs/column/category/[key] へのルートセグメント遷移（searchParams 不使用）。
export function CategoryChips({ activeKey }: { activeKey: string | null }) {
  const chip = (href: string, label: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? 'page' : undefined}
      className="text-xs font-bold px-3.5 py-1.5 rounded-full border transition-colors"
      style={
        active
          ? { background: 'linear-gradient(to right,#10B981,#84CC16)', color: '#fff', borderColor: 'transparent' }
          : { color: '#059669', borderColor: '#A7F3D0', background: '#fff' }
      }
    >
      {label}
    </Link>
  );

  return (
    // 中央寄せ（2026-08-18 第23便）。★ 本体側 app/column/CategoryChips.tsx も同じにしてある。
    <div className="flex flex-wrap justify-center gap-2 mb-6">
      {chip('/jobs/column', 'すべて', activeKey === null)}
      {ARTICLE_CATEGORY_ORDER.map((key) =>
        chip(`/jobs/column/category/${key}`, articleCategoryLabel(key), activeKey === key),
      )}
    </div>
  );
}
