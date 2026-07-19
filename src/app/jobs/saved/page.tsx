import Link from 'next/link';
import type { Metadata } from 'next';
import { SavedJobsList } from './SavedJobsList';

// 保存一覧はローカル保存状態（localStorage/クライアントセッション）に依存＝個人ページのため noindex。
// タイトルは jobs/layout.tsx の template「%s｜フクエスワーク」に乗る（子セグメントに適用）。
export const metadata: Metadata = {
  title: '保存した求人',
  robots: { index: false, follow: false },
};

// 実描画（保存IDの取得〜求人フェッチ）はマウント後にクライアントで行う（SavedJobsList）。
// server 側は静的シェル（パンくず・見出し）のみ＝ISR/動的いずれにも依存しない。
export default function SavedJobsPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* パンくず：フクエスワーク › 保存した求人 */}
      <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
        <Link href="/jobs" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#059669' }}>
          フクエスワーク
        </Link>
        <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
        <span aria-current="page" className="font-semibold" style={{ color: '#4D7C0F' }}>
          保存した求人
        </span>
      </nav>

      <div className="mb-6">
        <h1
          className="text-2xl sm:text-3xl font-extrabold inline-block"
          style={{
            background: 'linear-gradient(95deg,#10B981,#84CC16)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}
        >
          保存した求人
        </h1>
        <p className="text-sm text-slate-500 mt-1.5">肉球ボタンで保存したお店の、公開中の求人を表示します</p>
      </div>

      <SavedJobsList />
    </main>
  );
}
