import Link from 'next/link';
import type { Metadata } from 'next';
import { WorkMatchForm } from './WorkMatchForm';

// フクエスワーク「求職マッチング」エントリー（女の子＝求職者の希望入力フォーム）。
// 女の子が希望条件と連絡先を入力 → 運営が条件に合う掲載店舗を数店ピックして本人に連絡・斡旋する。
// ログイン不要の公開フォーム（送信は Server Action 経由・work_match_entries に保存＋運営メール通知）。
// ヘッダー/フッター/背景は jobs/layout.tsx を継承。SEO対象（求職者向けの入口ページ）。
const SITE_URL = 'https://fukues.com';
const PAGE_TITLE = 'お仕事マッチング｜あなたに合うお店を運営が無料でご紹介';
const PAGE_DESC =
  '希望のエリア・働き方・条件を入力するだけ。福岡のメンズエステ求人の中から、あなたの希望に合うお店を運営が無料でお探しして、ご希望の連絡先へご案内します。未経験の方も大歓迎です。';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESC,
  alternates: { canonical: '/jobs/matching' },
  openGraph: {
    title: `${PAGE_TITLE}｜フクエスワーク`,
    description: PAGE_DESC,
    url: `${SITE_URL}/jobs/matching`,
    siteName: 'フクエスワーク',
    type: 'website',
    images: [{ url: `${SITE_URL}/ogp-fukuwork.png` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${PAGE_TITLE}｜フクエスワーク`,
    description: PAGE_DESC,
    images: [`${SITE_URL}/ogp-fukuwork.png`],
  },
};

export default function JobMatchingPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* パンくず：フクエスワーク › お仕事マッチング */}
      <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
        <Link href="/jobs" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#059669' }}>
          フクエスワーク
        </Link>
        <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
        <span aria-current="page" className="font-semibold" style={{ color: '#4D7C0F' }}>
          お仕事マッチング
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
          お仕事マッチング
        </h1>
        <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
          希望を入力するだけで、あなたに合うお店を運営が無料でお探しします。<br className="hidden sm:block" />
          条件に合うお店を数店おまとめして、ご希望の連絡先へそっとご案内します。まずはお気軽にどうぞ🐾
        </p>
      </div>

      {/* 3ステップの案内（安心してもらうための説明） */}
      <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-6">
        {[
          { n: '1', t: '希望を入力', d: 'エリアや働き方など、気になる条件を選ぶだけ' },
          { n: '2', t: '運営がお探し', d: 'ご希望に合うお店を運営が無料でピックアップ' },
          { n: '3', t: 'ご案内', d: 'ご希望の連絡先へご案内。応募するかはあなた次第' },
        ].map((s) => (
          <li key={s.n} className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-black mb-1.5">{s.n}</span>
            <p className="text-xs font-bold text-slate-700">{s.t}</p>
            <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{s.d}</p>
          </li>
        ))}
      </ol>

      <WorkMatchForm />

      <p className="text-[11px] text-slate-400 leading-relaxed mt-4">
        ・ご入力内容は運営がお店探しのためだけに利用します。無理な勧誘は行いません。<br />
        ・掲載店舗への就業をお手伝いする無料のサービスです（お祝い金がもらえるお店もあります）。<br />
        ・個人情報の取り扱いは
        <Link href="/jobs/privacy" className="hover:underline" style={{ color: '#059669' }}>フクエスワークプライバシーポリシー</Link>
        をご確認ください。
      </p>
    </main>
  );
}
