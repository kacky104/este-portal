import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { ListingInquiryForm } from './ListingInquiryForm';

export const metadata: Metadata = {
  title: '掲載について｜フクエス',
  description: '福岡メンズエステポータル「フクエス」への店舗掲載をご希望の店舗様へのご案内です。',
  alternates: { canonical: '/listing' },
};

export default function ListingPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">掲載について</h1>

        <p className="text-sm text-slate-600 leading-relaxed">
          フクエスは、福岡県のメンズエステ専門ポータルサイトです。博多・天神・北九州・久留米など福岡全域の店舗様の情報を掲載しています。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">掲載をご希望の店舗様へ</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">
          本サイトへの掲載をご希望の店舗様は、下記フォームからお気軽にお問い合わせください。掲載内容・条件等の詳細をご案内いたします。
        </p>

        {/* 掲載お問い合わせフォーム（未ログインで送信可・運営宛メール通知＋listing_inquiriesに保存） */}
        <ListingInquiryForm />

        <p className="text-xs text-slate-500 leading-relaxed mt-3">
          メールでのお問い合わせも受け付けています：<a href="mailto:info@fukues.com" className="text-pink-600 hover:underline">info@fukues.com</a>
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">掲載できる店舗について</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-2">
          以下に該当する店舗様の掲載はお断りしています。
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600 leading-relaxed">
          <li>法令に違反する営業を行っている、またはその疑いがある場合</li>
          <li>提供情報に虚偽がある場合</li>
          <li>その他、当事務局が掲載にふさわしくないと判断した場合</li>
        </ul>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">掲載店舗様向け機能</h2>
        <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600 leading-relaxed">
          <li>店舗ページ（店舗情報・料金・コース・写真の掲載）</li>
          <li>セラピストのプロフィール・出勤スケジュール管理</li>
          <li>写メ日記・お知らせ・クーポンの配信</li>
          <li>求人情報の掲載（フクエスワーク）</li>
        </ul>

        <div className="mt-10 text-sm text-slate-500 leading-relaxed">
          <p>フクエス運営事務局</p>
        </div>
      </main>

      {/* ─── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-3xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
