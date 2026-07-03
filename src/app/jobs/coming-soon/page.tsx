import Link from 'next/link';
import type { Metadata } from 'next';

// 求人準備中ページ。サロン詳細の「女性求人」アイコンから、まだアクティブな求人が無い店舗の
// 遷移先として使う静的ページ（/jobs レイアウト＝フクエスワークのブランド枠配下）。
// 準備中の薄いページなので検索結果に出さない（noindex）。follow は残してサイト内回遊は許可。
export const metadata: Metadata = {
  title: '求人情報 準備中',
  robots: { index: false, follow: true },
};

export default function JobsComingSoonPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-16">
      <div className="rounded-2xl border border-emerald-100 bg-white p-10 text-center shadow-sm">
        {/* アイコン（砂時計・準備中の雰囲気。ブランドのグリーン→ライム系） */}
        <div
          className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-5"
          style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 22h14" />
            <path d="M5 2h14" />
            <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
            <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
          </svg>
        </div>

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
          求人情報 準備中
        </h1>

        <p className="text-sm text-slate-500 mt-4 leading-relaxed">
          この店舗の求人情報は現在準備中です。公開までしばらくお待ちください。
        </p>

        <Link
          href="/jobs"
          className="inline-flex items-center gap-1.5 mt-8 text-sm font-bold px-5 py-2.5 rounded-xl border transition-colors hover:bg-emerald-50"
          style={{ borderColor: '#6EE7B7', color: '#059669' }}
        >
          他の求人を見る
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </main>
  );
}
