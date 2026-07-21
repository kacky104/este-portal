import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';

export const metadata: Metadata = {
  title: 'お問い合わせ｜フクエス',
  description: '福岡メンズエステポータル「フクエス」へのお問い合わせについてのご案内です。',
  // 検索価値が低いページのため noindex（インデックス対象外なので canonical は付けない）。
  robots: { index: false, follow: false },
};

export default function ContactPage() {
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
        <h1 className="text-2xl font-bold text-slate-900 mb-6">お問い合わせ</h1>

        <p className="text-sm text-slate-600 leading-relaxed">
          フクエスに関するお問い合わせは、下記メールアドレスまでお願いいたします。
        </p>
        <p className="text-sm text-slate-600 leading-relaxed mt-2">
          メール：<a href="mailto:info@fukues.com" className="text-pink-600 hover:underline">info@fukues.com</a>
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">お問い合わせの前に</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600 leading-relaxed">
          <li>店舗のサービス内容・予約・料金に関するご質問は、当事務局ではお答えできません。各店舗へ直接お問い合わせください。</li>
          <li>口コミの削除依頼（掲載店舗様・投稿者様）は、対象の口コミが特定できる情報（店舗名・投稿日等）と削除を希望する理由を添えてご連絡ください。</li>
          <li>返信には数日いただく場合があります。営業目的のご連絡はご遠慮ください。</li>
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
