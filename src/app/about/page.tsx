import Link from 'next/link';
import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';

// 運営者情報・サイトについて（E-E-A-T用の静的ページ。terms/privacy と同じ構成）。
export const metadata: Metadata = {
  title: '運営者情報・フクエスについて｜フクエス',
  description:
    '福岡メンズエステポータル「フクエス」の運営者情報です。サイトの目的、掲載情報・口コミの掲載方針、コラムの編集ポリシー、広告の取り扱いについてご案内します。',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
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
        <h1 className="text-2xl font-bold text-slate-900 mb-6">運営者情報・フクエスについて</h1>

        <p className="text-sm text-slate-600 leading-relaxed">
          「フクエス」は、福岡県内のメンズエステ店舗の情報を掲載する地域特化型のポータルサイトです。
          初めての方でも安心して店舗を選べるよう、店舗情報・料金表・セラピスト情報・口コミ・写メ日記などを、
          分かりやすく比較できる形でお届けすることを目的に運営しています。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">運営者情報</h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              <tr>
                <th className="w-32 shrink-0 bg-slate-50 px-4 py-3 text-left font-medium text-slate-500 align-top">サイト名</th>
                <td className="px-4 py-3 text-slate-700">フクエス ～福岡メンズエステポータル～</td>
              </tr>
              <tr>
                <th className="w-32 bg-slate-50 px-4 py-3 text-left font-medium text-slate-500 align-top">URL</th>
                <td className="px-4 py-3 text-slate-700">https://fukues.com</td>
              </tr>
              <tr>
                <th className="w-32 bg-slate-50 px-4 py-3 text-left font-medium text-slate-500 align-top">運営</th>
                <td className="px-4 py-3 text-slate-700">フクエス運営事務局</td>
              </tr>
              <tr>
                <th className="w-32 bg-slate-50 px-4 py-3 text-left font-medium text-slate-500 align-top">開設</th>
                <td className="px-4 py-3 text-slate-700">2026年</td>
              </tr>
              <tr>
                <th className="w-32 bg-slate-50 px-4 py-3 text-left font-medium text-slate-500 align-top">事業内容</th>
                <td className="px-4 py-3 text-slate-700">
                  メンズエステ店舗情報の掲載・検索サービスの運営／セラピスト求人情報サービス「フクエスワーク」の運営／メンズエステ専用SNS「fukuX」の運営
                </td>
              </tr>
              <tr>
                <th className="w-32 bg-slate-50 px-4 py-3 text-left font-medium text-slate-500 align-top">お問い合わせ</th>
                <td className="px-4 py-3 text-slate-700">
                  <Link href="/contact" className="text-pink-600 hover:underline">お問い合わせフォーム</Link>よりご連絡ください。
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">掲載情報について</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          店舗ページの情報（コースメニュー・料金・セラピスト情報・出勤スケジュール等）は、各掲載店舗から提供された内容にもとづいて掲載しています。
          料金はユーザーが総額で比較できるよう税込表記を基本としています。掲載内容は店舗の運用により変わることがあるため、
          最新の情報は各店舗ページまたは店舗への予約時にご確認ください。
        </p>
        <p className="text-sm text-slate-600 leading-relaxed mt-3">
          本サイトは18歳未満の方はご利用いただけません。掲載をご希望の店舗様は
          <Link href="/listing" className="text-pink-600 hover:underline">掲載について</Link>をご覧ください。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">口コミの掲載方針</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          ユーザーの皆さまから投稿された口コミは、<Link href="/terms" className="text-pink-600 hover:underline">利用規約</Link>のガイドラインに沿って
          運営が内容を確認したうえで掲載しています。誹謗中傷・虚偽・法令や公序良俗に反する内容は掲載しません。
          店舗にとって不利な内容であることだけを理由に非掲載とすることはなく、利用者の店舗選びの参考になる情報を公平に扱います。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">コラムの編集ポリシー</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          <Link href="/column" className="text-pink-600 hover:underline">コラム</Link>および
          <Link href="/jobs/column" className="text-pink-600 hover:underline">フクエスワークのコラム</Link>は、フクエス運営事務局が編集しています。
          初めての方にも分かりやすいことを第一に、実際のサービス内容・料金の仕組みに即した正確な記述を心がけ、誇大な表現や特定店舗への誘導を目的とした記述は行いません。
          記事は公開後も内容を見直し、必要に応じて更新しています（各記事には更新日を表示しています）。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">広告の取り扱い</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          本サイトには、掲載店舗のバナー等の広告枠があります。広告掲載箇所は、通常のコンテンツと区別できる形で表示することを方針としています。
          広告の掲載有無が口コミやコラムの内容・掲載判断に影響することはありません。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">関連ページ</h2>
        <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600 leading-relaxed">
          <li><Link href="/terms" className="text-pink-600 hover:underline">利用規約</Link></li>
          <li><Link href="/privacy" className="text-pink-600 hover:underline">プライバシーポリシー</Link></li>
          <li><Link href="/listing" className="text-pink-600 hover:underline">掲載について</Link></li>
          <li><Link href="/contact" className="text-pink-600 hover:underline">お問い合わせ</Link></li>
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
