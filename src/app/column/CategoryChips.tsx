import Link from 'next/link';
import { MAIN_ARTICLE_CATEGORY_ORDER, mainArticleCategoryLabel, mainArticleCategoryChip } from '@/app/lib/mainArticleCategories';

// カテゴリ絞り込みチップ（本体コラム・ピンクテーマ）。activeKey=null は「すべて」（/column）を選択中扱い。
// 各カテゴリは /column/category/[key] へのルートセグメント遷移（searchParams 不使用）。
export function CategoryChips({ activeKey }: { activeKey: string | null }) {
  // 色はカテゴリごと（mainArticleCategoryChip）。「すべて」はキー無し＝ピンクのまま。形は角丸の長方形（第1045便）。
  const chip = (href: string, label: string, active: boolean, key: string | null = null) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`text-xs font-bold px-3.5 py-1.5 rounded-lg border transition-colors ${mainArticleCategoryChip(key, active)}`}
    >
      {label}
    </Link>
  );

  return (
    // 中央寄せ（2026-08-18 第23便）。見出し・説明文と縦のラインをそろえるため。
    // ★ 求人側 app/jobs/column/CategoryChips.tsx も同じにしてある。
    <div className="flex flex-wrap justify-center gap-2 mb-6">
      {chip('/column', 'すべて', activeKey === null)}
      {MAIN_ARTICLE_CATEGORY_ORDER.map((key) =>
        chip(`/column/category/${key}`, mainArticleCategoryLabel(key), activeKey === key, key),
      )}
    </div>
  );
}
