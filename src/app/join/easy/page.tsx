import type { Metadata } from 'next';
import Link from 'next/link';
import { POINT_FIRST_REVIEW, POINT_SIGNUP, POINT_USE_UNIT, POINT_USE_YEN, POINT_VISIT, POINT_VISIT_NOTE } from '@/lib/points';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { SiteFooter } from '@/app/components/SiteFooter';
import { JoinCta } from '../JoinCta';

// ★ 第1618便: フクエス会員募集の「短い説明ページ」。TOP の左下ポップアップ（MemberJoinPopup）の行き先。
//  くわしい案内は /join（検索から来る正式なページ）。こちらは要点だけ・noindex（/join と内容がかぶるため）。
//  数字は lib/points.ts の値から（ポイントを変えるとここも変わる）。
//  データ取得なし＝静的ページ。CTA だけ JoinCta がログイン状態で差し替える。

const TITLE = 'フクエス会員募集中！登録は約1分・メールアドレスだけ｜フクエス';
const DESCRIPTION = `フクエスの会員登録は無料・約1分。必要なのはメールアドレスだけ。登録で${POINT_SIGNUP}pt、${POINT_USE_UNIT.toLocaleString()}ptで${POINT_USE_YEN.toLocaleString()}円引き。貯めたポイントは加盟店で共通で使えます。`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/join/easy' },
  robots: { index: false, follow: true },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/join/easy',
    siteName: 'フクエス',
    type: 'website',
    images: [{ url: '/ogp.png', width: 1200, height: 630 }],
  },
};

const GRAD = 'linear-gradient(95deg,#FB923C,#DB2777)';

const POINTS: { no: string; title: React.ReactNode; body: React.ReactNode }[] = [
  {
    no: '1',
    title: <>登録にかかる時間は<span className="text-pink-600">約1分</span></>,
    body: <>メールアドレスとパスワードを入れて、届いた確認メールのリンクを開くだけ。登録も利用も無料です。</>,
  },
  {
    no: '2',
    title: <>必要なのは<span className="text-pink-600">メールアドレスだけ</span></>,
    body: (
      <>
        本名や電話番号はいりません。メールアドレスはアカウント（ログイン）に使うだけで、
        <b className="text-slate-800">お店にもほかの会員にも知られることはありません。</b>
        <br />
        <b className="text-slate-800">宣伝のメールも届かない</b>ので、安心してください。
      </>
    ),
  },
  {
    no: '3',
    title: <>フクエスポイントが<span className="text-pink-600">貯まる</span></>,
    body: (
      <>
        登録で<b className="text-pink-600">{POINT_SIGNUP}pt</b>・はじめての口コミで<b className="text-pink-600">{POINT_FIRST_REVIEW}pt</b>・加盟店のご来店1回で<b className="text-pink-600">{POINT_VISIT}pt</b>（{POINT_VISIT_NOTE}）。
        <br />
        <b className="text-slate-800">{POINT_USE_UNIT.toLocaleString()}ptで{POINT_USE_YEN.toLocaleString()}円引き</b>。お店のクーポンとも併用できます。
      </>
    ),
  },
  {
    no: '4',
    title: <>加盟店で<span className="text-pink-600">共通で使える</span></>,
    body: (
      <>
        貯めたポイントは、どのフクエスポイント加盟店でも使えます。
        <br />
        <b className="text-slate-800">加盟店はこれから続々と増えていきます。</b>
        <Link href="/points" className="ml-1 font-bold text-pink-600 underline">加盟店を見る</Link>
      </>
    ),
  },
];

export default function JoinEasyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 via-white to-white text-slate-900">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2 sm:gap-2.5">
            <SavedSalonsMenu />
            <VipLetterIcon /><AccountMenu /><HamburgerMenu />
          </div>
        </div>
      </header>
      <SiteNoticeBanner />

      <main className="max-w-xl mx-auto px-4 pt-8 pb-12">
        {/* 見出し */}
        <div className="text-center">
          <p className="text-[11px] font-bold tracking-[0.35em] text-pink-500">FUKUES MEMBER</p>
          <h1 className="mt-2 text-[28px] sm:text-4xl font-black leading-tight">
            <span style={{ background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>フクエス会員</span>
            <br className="sm:hidden" />
            <span className="text-slate-800">を募集しています！</span>
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            福岡のメンズエステを、もっとおトクに。
          </p>
        </div>

        {/* 要点4つ */}
        <ol className="mt-7 space-y-3">
          {POINTS.map((p) => (
            <li key={p.no} className="flex gap-3 rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
              <span
                className="flex-shrink-0 w-8 h-8 rounded-full text-white font-black text-sm flex items-center justify-center"
                style={{ background: GRAD }}
                aria-hidden
              >
                {p.no}
              </span>
              <div className="min-w-0">
                <h2 className="text-[16px] sm:text-[17px] font-black text-slate-800 leading-snug">{p.title}</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{p.body}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* 登録ボタン（ログイン中はマイページへ） */}
        <div className="mt-8">
          <JoinCta variant="footer" />
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          会員になるとできること・よくある質問は
          <Link href="/join" className="mx-1 font-bold text-pink-600 underline">会員登録のご案内</Link>
          へ
        </p>
      </main>

      <SiteFooter inner="max-w-5xl" />
    </div>
  );
}
