import Link from 'next/link';
import type { Metadata } from 'next';
import { WorkMatchForm } from './WorkMatchForm';
import { MatchingFlow } from './MatchingFlow';
import { PageHero } from '@/app/components/PageHero';
import { fetchPageHero } from '@/app/lib/pageHero';
import { buildBreadcrumbJsonLd, toJsonLdString } from '@/app/lib/jsonLd';

// フクエスワーク「求職マッチング」エントリー（女の子＝求職者の希望入力フォーム）。
// 女の子が希望条件と連絡先を入力 → 運営が条件に合う掲載店舗を数店ピック → その店舗から本人へ連絡してもらう斡旋。
// 「運営からのおすすめ店舗ピックアップ（メール案内）」は希望制（希望時はメール必須）。
// ログイン不要の公開フォーム（送信は Server Action 経由・work_match_entries に保存＋運営メール通知）。
// ヘッダー/フッター/背景は jobs/layout.tsx を継承。SEO対象（求職者向けの入口ページ）。
const SITE_URL = 'https://fukues.com';
const PAGE_TITLE = 'お仕事マッチング｜あなたに合うお店を運営が無料でご紹介';
const PAGE_DESC =
  '希望のエリア・働き方・条件を入力するだけ。福岡のメンズエステ求人の中から、あなたの希望に合うお店を運営が無料でお探しします。条件に合うお店からご希望の連絡先にご連絡が届きます。未経験の方も大歓迎です。';

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

// ISR：10分ごとに再生成（ヒーロー画像の反映用。admin保存時は /api/revalidate で即時無効化もされる）。
export const revalidate = 600;

export default async function JobMatchingPage() {
  // ページ別ヒーロー画像（admin求人タブ「求人ページ別ヒーロー画像設定」で設定。未設定なら非表示）。
  const hero = await fetchPageHero('jobs-matching');
  return (
    // ★ 第975便: 3ステップ（MatchingFlow）を画面の横幅いっぱいに出すため、main は幅を持たず、
    //   上（パンくず・ヒーロー）と下（フォーム）をそれぞれ max-w-3xl の箱に入れる。
    <main>
      <div className="max-w-3xl mx-auto px-4 pt-8">
      {/* パンくず：フクエスワーク › お仕事マッチング */}
      {/* BreadcrumbList 構造化データ（可視パンくずと同一内容。2026-08-05） */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(buildBreadcrumbJsonLd([
        { name: 'フクエスワーク', path: '/jobs' },
        { name: 'お仕事マッチング', path: '/jobs/matching' },
      ])) }} />
      <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
        <Link href="/jobs" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#059669' }}>
          フクエスワーク
        </Link>
        <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
        <span aria-current="page" className="font-semibold" style={{ color: '#4D7C0F' }}>
          お仕事マッチング
        </span>
      </nav>

      {/* ヒーロー画像（未設定なら何も出ない）。他ページ（口コミ等）と同じくパンくず直下・見出しの上。 */}
      <PageHero url={hero} alt="お仕事マッチング｜フクエスワーク" fullBleedMobile contentMax={768} />

      </div>

      {/* ★ 第975便: 見出し（h1）・説明・3ステップは MatchingFlow（いただいた実装用 ZIP のデザイン）。直後に入力フォーム。 */}
      <MatchingFlow />

      <div className="max-w-3xl mx-auto px-4 pt-6 pb-8">
      <WorkMatchForm />

      <p className="text-[11px] text-slate-400 leading-relaxed mt-4">
        ・ご入力内容はお店探しと、ご紹介先のお店からのご連絡のためだけに利用します。無理な勧誘は行いません。<br />
        ・掲載店舗への就業をお手伝いする無料のサービスです（お祝い金がもらえるお店もあります）。<br />
        ・個人情報の取り扱いは
        <Link href="/jobs/privacy" className="hover:underline" style={{ color: '#059669' }}>フクエスワークプライバシーポリシー</Link>
        をご確認ください。
      </p>
      </div>
    </main>
  );
}
