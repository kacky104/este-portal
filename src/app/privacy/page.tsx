import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';

export const metadata: Metadata = {
  title: 'プライバシーポリシー｜フクエス',
  description: '福岡メンズエステポータル「フクエス」における個人情報の取り扱い（プライバシーポリシー）です。',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu /><HamburgerMenu />
          </div>
        </div>
      </header>
      <SiteNoticeBanner />

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">プライバシーポリシー</h1>

        <p className="text-sm text-slate-600 leading-relaxed">
          フクエス運営事務局（以下「当事務局」）は、ウェブサイト「フクエス」（以下「本サイト」）における個人情報の取り扱いについて、以下のとおりプライバシーポリシーを定めます。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">1. 取得する情報</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-2">
          当事務局は、本サイトの提供にあたり、以下の情報を取得します。
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600 leading-relaxed">
          <li>会員登録時にご提供いただく情報（メールアドレス、ニックネーム等）</li>
          <li>口コミ・レビュー等の投稿内容</li>
          <li>求人への応募時にご提供いただく情報（氏名、連絡先、応募内容等）</li>
          <li>店舗掲載のお申し込み・お問い合わせの際にご提供いただく情報</li>
          <li>本サイトの利用に伴い自動的に取得される情報（Cookie、IPアドレス、閲覧履歴等のアクセスログ）</li>
        </ul>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">2. 利用目的</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-2">
          取得した情報は、以下の目的で利用します。
        </p>
        <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-600 leading-relaxed">
          <li>本サイトのサービス提供・運営、本人確認、認証のため</li>
          <li>口コミ・写メ日記等のコンテンツ掲載のため</li>
          <li>求人応募情報を応募先の店舗へ提供するため（応募という行為の性質上、応募情報は応募先店舗に提供されます）</li>
          <li>お問い合わせへの対応のため</li>
          <li>利用規約に違反する行為への対応、不正利用の防止のため</li>
          <li>本サイトの品質向上、利用状況の分析のため</li>
          <li>重要なお知らせ等の連絡のため</li>
        </ol>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">3. 第三者提供</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-2">
          当事務局は、次の場合を除き、ご本人の同意なく個人情報を第三者に提供しません。
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600 leading-relaxed">
          <li>求人応募情報を応募先店舗に提供する場合（利用目的3）</li>
          <li>法令に基づく場合</li>
          <li>人の生命、身体または財産の保護のために必要がある場合であって、ご本人の同意を得ることが困難であるとき</li>
        </ul>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">4. 業務委託</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          当事務局は、サービス提供に必要な範囲で、個人情報の取り扱いを外部（サーバーホスティング、データベース等のクラウドサービス事業者）に委託することがあります。委託先には適切な管理を求めます。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">5. Cookie・アクセス解析</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          本サイトは、利便性の向上や利用状況の把握のためCookieおよび類似技術を使用します。また、アクセス解析ツールを利用する場合があります。これらにより取得される情報に、特定の個人を識別する情報は含まれません。ブラウザの設定によりCookieを無効にすることができますが、一部機能が利用できなくなる場合があります。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">6. 安全管理</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          当事務局は、個人情報の漏えい、滅失または毀損の防止その他個人情報の安全管理のために必要かつ適切な措置を講じます。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">7. 開示・訂正・削除等の請求</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          ご本人からの個人情報の開示、訂正、利用停止、削除等のご請求には、ご本人であることを確認のうえ、法令に従い速やかに対応します。下記の窓口までご連絡ください。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">8. ポリシーの変更</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          本ポリシーの内容は、法令の改正やサービス内容の変更に応じて改定することがあります。改定後の内容は本サイトに掲載した時点から効力を生じます。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">9. お問い合わせ窓口</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          個人情報の取り扱いに関するお問い合わせ先：
        </p>
        <p className="text-sm text-slate-600 leading-relaxed mt-1">
          フクエス運営事務局<br />
          メール：<a href="mailto:info@fukues.com" className="text-pink-600 hover:underline">info@fukues.com</a>
        </p>

        <div className="mt-10 text-sm text-slate-500 leading-relaxed">
          <p>制定日：2026年7月9日</p>
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
