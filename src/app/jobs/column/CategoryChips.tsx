import Link from 'next/link';
import { ARTICLE_CATEGORY_ORDER, articleCategoryLabel, articleCategoryChip } from '@/app/lib/articleCategories';

// カテゴリ絞り込みチップ。activeKey=null は「すべて」（/jobs/column）を選択中扱い。
// 各カテゴリは /jobs/column/category/[key] へのルートセグメント遷移（searchParams 不使用）。
export function CategoryChips({ activeKey }: { activeKey: string | null }) {
  // 色はカテゴリごと（articleCategoryChip）。「すべて」はキー無し＝緑のまま。形は角丸の長方形（第1045便）。
  const chip = (href: string, label: string, active: boolean, key: string | null = null) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? 'page' : undefined}
      className="text-xs font-bold px-3.5 py-1.5 rounded-lg border transition-colors"
      style={articleCategoryChip(key, active)}
    >
      {label}
    </Link>
  );

  return (
    // 中央寄せ（2026-08-18 第23便）。★ 本体側 app/column/CategoryChips.tsx も同じにしてある。
    <div className="flex flex-wrap justify-center gap-2 mb-6">
      {chip('/jobs/column', 'すべて', activeKey === null)}
      {ARTICLE_CATEGORY_ORDER.map((key) =>
        chip(`/jobs/column/category/${key}`, articleCategoryLabel(key), activeKey === key, key),
      )}
    </div>
  );
}
