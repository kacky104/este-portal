import Link from 'next/link';
import { MAIN_ARTICLE_CATEGORY_ORDER, mainArticleCategoryLabel } from '@/app/lib/mainArticleCategories';

// カテゴリ絞り込みチップ（本体コラム・ピンクテーマ）。activeKey=null は「すべて」（/column）を選択中扱い。
// 各カテゴリは /column/category/[key] へのルートセグメント遷移（searchParams 不使用）。
export function CategoryChips({ activeKey }: { activeKey: string | null }) {
  const chip = (href: string, label: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`text-xs font-bold px-3.5 py-1.5 rounded-full border transition-colors ${
        active
          ? 'bg-pink-600 text-white border-transparent shadow-sm shadow-pink-500/25'
          : 'bg-white text-pink-600 border-pink-200 hover:border-pink-300'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {chip('/column', 'すべて', activeKey === null)}
      {MAIN_ARTICLE_CATEGORY_ORDER.map((key) =>
        chip(`/column/category/${key}`, mainArticleCategoryLabel(key), activeKey === key),
      )}
    </div>
  );
}
