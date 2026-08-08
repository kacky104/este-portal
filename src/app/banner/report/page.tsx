import Link from 'next/link';
import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { SiteFooter } from '@/app/components/SiteFooter';
import { BannerReportForm } from './BannerReportForm';

// フクエス本体のリンクバナー設置報告フォーム（2026-08-08 新設）。
// 従来は fukuX 側の /x/banner/report を3サイト共通窓口にしていたが、本体（/listing・/banner）から
// たどると紫テーマの fukuX サイトへ出てしまうため、本体テーマの受付ページを分けた。
// fukuX版（/x/banner/report）は fukuX 特典の報告窓口として従来どおり残す。
// 保存先・Server Action は共通（banner_reports / submitBannerReport）。
// 入力フォームのため検索インデックス対象外（案内は /banner・/listing が担う）。
export const metadata: Metadata = {
  title: 'リンクバナー設置のご報告｜フクエス',
  robots: { index: false, follow: false },
};

export default function BannerReportPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* ─── Header（/banner と同じ簡易版） ─── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-2 h-14 flex items-center">
          <Logo />
        </div>
      </header>
      <SiteNoticeBanner />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        <h1 className="text-xl font-bold text-slate-900 mb-4">リンクバナー設置のご報告</h1>

        <p className="text-sm text-slate-600 leading-relaxed mb-2">
          <Link href="/banner" className="text-pink-600 hover:underline">リンクバナー</Link>
          の設置ありがとうございます。下記フォームからご報告ください。当事務局で設置を確認のうえ、対応いたします。
        </p>
        <p className="text-sm text-slate-600 leading-relaxed mb-2">
          フクエス・フクエスワーク・fukuX の3つすべてを設置いただいた店舗様は、
          <Link href="/listing" className="text-pink-600 hover:underline">無料掲載</Link>
          （<Link href="/salons" className="text-pink-600 hover:underline">店舗一覧</Link>へのテキスト掲載）の対象になります。
        </p>
        <p className="text-xs text-slate-500 leading-relaxed mb-6">
          ※ 確認・掲載には数日いただく場合があります。設置が確認できなかった場合、または返信が必要な内容の場合は、ご記入のメールアドレスへご連絡いたします。
        </p>

        <BannerReportForm />

        <p className="text-xs text-slate-500 leading-relaxed mt-4">
          ご不明な点は{' '}
          <a href="mailto:info@fukues.com" className="text-pink-600 hover:underline">info@fukues.com</a>
          {' '}までお問い合わせください。
        </p>
      </main>

      {/* ─── Footer ─── */}
      <SiteFooter inner="max-w-5xl" />
    </div>
  );
}
