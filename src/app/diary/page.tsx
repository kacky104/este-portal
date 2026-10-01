import type { Metadata } from 'next';
import { DiaryListBody } from './DiaryListBody';
import { buildDiaryListMetadata } from './diaryMetadata';

// ★ 第1082便: 1ページ目。2ページ目以降は ./page/[n]/page.tsx（旧 ?page= は next.config の redirects で転送）。
export const metadata: Metadata = buildDiaryListMetadata(1);

// ISR：1分ごとに再生成（新着日記の鮮度優先）。cookie を読まない createPublicClient を使うため動的化されない。
export const revalidate = 60;

export default function DiaryListPage() {
  return <DiaryListBody page={1} />;
}
