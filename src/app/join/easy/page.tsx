import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
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

// ★ 第1621便: 要点4つは画像（public/join/easy-hero.webp・カッキーさん作成）で見せる。
//   画像に入っていない「安心して登録できる理由」と細かい条件は、画像の下に文字で補う。
const NOTES: React.ReactNode[] = [
  <>メールアドレスは<b className="text-slate-800">アカウント（ログイン）に使うだけ</b>。お店にもほかの会員にも知られることはありません。</>,
  <><b className="text-slate-800">宣伝のメールは届きません。</b>安心して登録してください。</>,
  <>はじめての口コミで<b className="text-pink-600">{POINT_FIRST_REVIEW}pt</b>・加盟店のご来店1回で<b className="text-pink-600">{POINT_VISIT}pt</b>（{POINT_VISIT_NOTE}）。お店のクーポンとも併用できます。</>,
  <>貯めたポイントは、どのフクエスポイント加盟店でも使えます。<b className="text-slate-800">加盟店はこれから続々と増えていきます。</b><Link href="/points" className="ml-1 font-bold text-pink-600 underline">加盟店を見る</Link></>,
];

export default function JoinEasyPage() {
  return (
    <div className="min-h-screen text-slate-900" style={{ background: 'linear-gradient(#FDF3F6, #FFF8FA)' }}>
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

      <main className="max-w-xl mx-auto px-4 pb-12">
        {/* 見出し＋要点4つ＝画像。背景色を画像のふちの色（#FDF3F6→#FFF8FA）に合わせて、ページとつながって見えるようにする。
            スマホは左右いっぱい（-mx-4）。h1 は画像の文字と同じ内容を読み上げ・検索用に持つ。 */}
        <h1 className="sr-only">フクエス会員を募集しています！</h1>
        <Image
          src="/join/easy-hero.webp"
          alt={`フクエス会員を募集しています！福岡のメンズエステを、もっとおトクに。1 登録にかかる時間は約1分（登録も利用も無料）2 必要なのはメールアドレスだけ（本名や電話番号はいりません）3 フクエスポイントが貯まる（登録で${POINT_SIGNUP}pt・${POINT_USE_UNIT.toLocaleString()}ptで${POINT_USE_YEN.toLocaleString()}円引き）4 加盟店で共通で使える`}
          width={941}
          height={1672}
          priority
          sizes="(max-width: 640px) 100vw, 576px"
          className="block -mx-4 w-[calc(100%+2rem)] max-w-none sm:mx-0 sm:w-full h-auto"
        />

        {/* 登録ボタン（ログイン中はマイページへ） */}
        <div className="mt-2">
          <JoinCta variant="footer" />
        </div>

        {/* 画像に入っていない補足 */}
        <section className="mt-5 rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
          <h2 className="text-[15px] font-black text-slate-800">安心してご登録ください</h2>
          <ul className="mt-2 space-y-2">
            {NOTES.map((n, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-slate-600">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-pink-400" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </section>

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
