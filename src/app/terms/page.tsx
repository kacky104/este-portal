import Link from 'next/link';
import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';

export const metadata: Metadata = {
  title: '利用規約｜フクエス',
  description: '福岡メンズエステポータル「フクエス」の利用規約です。',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">利用規約</h1>

        <p className="text-sm text-slate-600 leading-relaxed">
          この利用規約（以下「本規約」）は、フクエス運営事務局（以下「当事務局」）が運営するウェブサイト「フクエス」（以下「本サイト」）の利用条件を定めるものです。利用者の皆さま（以下「ユーザー」）は、本サイトを利用することにより本規約に同意したものとみなします。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">第1条（適用）</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          本規約は、ユーザーと当事務局との間の本サイトの利用に関わる一切の関係に適用されます。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">第2条（利用資格）</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          本サイトは、福岡県内のメンズエステ店舗の情報を掲載するポータルサイトです。18歳未満の方は本サイトを利用できません。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">第3条（会員登録）</h2>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-600 leading-relaxed">
          <li>会員機能（お気に入り登録、口コミ投稿等）の利用を希望する方は、本規約に同意のうえ、当事務局の定める方法によって登録を行うものとします。</li>
          <li>
            当事務局は、登録希望者に以下の事由があると判断した場合、登録を承認しないことがあります。
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li>虚偽の情報を届け出た場合</li>
              <li>過去に本規約違反等によりアカウント停止処分を受けたことがある場合</li>
              <li>その他、当事務局が登録を相当でないと判断した場合</li>
            </ul>
          </li>
        </ol>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">第4条（アカウント管理）</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          ユーザーは、自己の責任においてアカウント情報（メールアドレス・パスワード等）を適切に管理するものとします。アカウントの管理不十分、第三者の使用等による損害の責任はユーザーが負うものとします。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">第5条（禁止事項）</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-2">
          ユーザーは、本サイトの利用にあたり、以下の行為をしてはなりません。
        </p>
        <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-600 leading-relaxed">
          <li>法令または公序良俗に違反する行為</li>
          <li>虚偽の内容、体験に基づかない内容の口コミを投稿する行為</li>
          <li>掲載店舗、セラピスト、他のユーザーその他第三者を誹謗中傷し、または名誉・信用を毀損する行為</li>
          <li>特定の個人を識別できる情報（本名、私的な連絡先等）を本人の同意なく投稿する行為</li>
          <li>店舗またはセラピストに対し、本サイトの趣旨を逸脱した行為（規定外のサービスの要求等）を行い、またはこれを助長する行為</li>
          <li>営業妨害、いやがらせ、スパム行為</li>
          <li>本サイトのコンテンツを無断で複製、転載、スクレイピングする行為</li>
          <li>本サイトの運営を妨害する行為、不正アクセス行為</li>
          <li>その他、当事務局が不適切と判断する行為</li>
        </ol>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">第6条（投稿コンテンツ）</h2>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-600 leading-relaxed">
          <li>口コミ・レビュー等の投稿コンテンツの著作権は投稿したユーザーに帰属します。ただし、ユーザーは当事務局に対し、本サイトの運営・宣伝に必要な範囲で投稿コンテンツを無償で利用（複製、公開、翻案等）する権利を許諾するものとします。</li>
          <li>当事務局は、投稿コンテンツが本規約に違反すると判断した場合、事前の通知なくこれを削除できるものとします。</li>
          <li>投稿コンテンツに関する責任は、投稿したユーザーが負うものとします。</li>
        </ol>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">第7条（掲載情報について）</h2>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-600 leading-relaxed">
          <li>本サイトに掲載される店舗情報、料金、出勤情報等は各店舗から提供された情報等に基づいています。当事務局はその正確性、最新性、完全性を保証しません。</li>
          <li>実際のサービス内容・料金等は、必ず各店舗に直接ご確認ください。</li>
        </ol>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">第8条（免責事項）</h2>
        <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-600 leading-relaxed">
          <li>ユーザーと掲載店舗その他第三者との間で生じた取引、連絡、紛争等については、当事者間で解決するものとし、当事務局は一切の責任を負いません。</li>
          <li>当事務局は、本サイトの利用により生じたユーザーの損害について、当事務局に故意または重過失がある場合を除き、責任を負わないものとします。</li>
        </ol>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">第9条（サービスの変更・停止）</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          当事務局は、ユーザーへの事前の通知なく、本サイトの内容の変更、提供の中断または終了をすることができます。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">第10条（アカウント停止・削除）</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          当事務局は、ユーザーが本規約に違反した場合、事前の通知なく、投稿の削除、アカウントの停止または削除の措置をとることができます。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">第11条（規約の変更）</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          当事務局は、必要と判断した場合、本規約を変更することができます。変更後の規約は本サイトに掲載した時点から効力を生じるものとします。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">第12条（準拠法・裁判管轄）</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          本規約の解釈には日本法を準拠法とします。本サイトに関して紛争が生じた場合には、福岡地方裁判所を第一審の専属的合意管轄裁判所とします。
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
