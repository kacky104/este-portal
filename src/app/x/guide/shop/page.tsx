import Link from 'next/link';
import type { Metadata } from 'next';

// お店向け使い方ガイド。静的コンテンツのみ・データ取得なし。
//
// ★ 第1652便（2026-10-24・カッキーさん）: 「端的に分かりやすく」作り直し（セラピスト向け第1641便・ユーザー向け第1648便と同じ作り）。
//   長い STEP1〜9 をやめ、「使い方4つ」＋「認証バッジ」＋「お店カード」＋「フクエス掲載店なら」＋「守ること」だけにした。
//   ・求人オファーは第1649便で廃止したので書かない。
//   ・自動所属の条件（第994便）: お店の fukuX がフクエスのマイページと同じログインで開設・認証済み、
//     セラピストがフクエスのセラピストページと結びついていて公開中。
//   ・説明画像（public/x/guide/shop/*.webp）は本文では使わなくなった（ヒーローはサイドバーのバナーで使用中）。
export const metadata: Metadata = {
  title: 'お店向け使い方ガイド｜fukuX(フクエックス)',
  description:
    '福岡メンズエステ専用SNS「fukuX(フクエックス)」のお店向け使い方ガイド。アカウント開設、認証バッジ、セラピストの所属、お店カード画像、フクエス掲載店だけの連携機能をかんたんに説明します。',
  alternates: { canonical: '/x/guide/shop' },
};

const CARD = 'x-card mt-5 p-5 sm:p-6 rounded-[22px] bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)]';
const H2 = 'text-lg sm:text-xl font-bold text-[color:var(--x-text-primary)]';
const P = 'text-[15px] sm:text-base text-[color:var(--x-text-secondary)] leading-[1.8]';
const STRONG = 'font-bold text-[color:var(--x-text-primary)]';
const A = 'text-[color:var(--x-accent)] font-bold underline underline-offset-2 decoration-1 hover:no-underline';

function Num({ n }: { n: number }) {
  return (
    <span
      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-black shrink-0"
      style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
    >
      {n}
    </span>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden className="mt-1 shrink-0 text-[color:var(--x-accent)]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'アカウントを開設',
    body: (
      <>
        <Link href="/x/signup" className={A}>新規登録</Link>
        から「お店」を選んで開設します。フクエス掲載店は、<span className={STRONG}>フクエスのマイページと同じログイン</span>で開設してください。@ID はあとから変更できません。
      </>
    ),
  },
  {
    title: '認証バッジを受ける',
    body: (
      <>
        運営の審査で認証されると<span className={STRONG}>認証バッジ</span>が付きます。フクエス掲載店は原則スムーズに認証されます。
      </>
    ),
  },
  {
    title: 'セラピストが所属',
    body: (
      <>
        フクエスのセラピストページと結びついている子は、フクエックスを開設すると<span className={STRONG}>自動でお店に所属</span>します。それ以外の子は、サイドバーの「店舗管理」から @ID で所属申請 → 本人が承認で所属します。
      </>
    ),
  },
  {
    title: '投稿で発信',
    body: (
      <>
        右下の「＋」から投稿できます（本文500文字・画像4枚まで）。24時間で消える<span className={STRONG}>ストーリー</span>も使えます。新人入店・イベント・割引のお知らせにどうぞ。
      </>
    ),
  },
];

const FUKUES_MERITS: string[] = [
  'フクエックスの認証バッジが原則スムーズに付く',
  'セラピストが自動でお店に所属する',
  'フクエスの出勤情報が、所属セラピストのプロフィールに7日分自動で表示される',
  'お店カードにセラピストの写真が自動で入る',
];

const RULES: string[] = [
  '虚偽の情報での登録・運用、他店へのなりすましは禁止です',
  '在籍していないセラピストへの所属申請・承認は禁止です',
  '規定外のサービスを連想させる投稿・メッセージはできません',
  '権利のない画像（他店・他人の画像など）は使えません',
];

export default function XShopGuidePage() {
  return (
    <div className="pb-2">
      {/* ── 見出し ── */}
      <section className="mt-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-[color:var(--x-text-primary)]">お店向け使い方ガイド</h1>
        <p className={`${P} mt-3`}>
          フクエックスは、福岡のメンズエステ専用SNSです。<span className={STRONG}>利用は無料。</span>お店やセラピストの情報を発信して、お客様とつながれます。
        </p>
      </section>

      {/* ── 使い方（4つ） ── */}
      <section className={CARD}>
        <h2 className={H2}>使い方はこれだけ</h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3 rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] p-4">
              <Num n={i + 1} />
              <div className="min-w-0">
                <p className="text-base font-bold text-[color:var(--x-text-primary)]">{s.title}</p>
                <p className={`${P} mt-1`}>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── お店カード（枚数） ── */}
      <section className={CARD}>
        <h2 className={H2}>「お店」タブのカード写真</h2>
        <p className={`${P} mt-3`}>
          認証バッジのあるお店は、セラピストの写真が自動で入ります（設定は不要・開くたびに入れ替わります）。
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          <li className="rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] p-4">
            <p className="text-3xl font-black leading-none text-[color:var(--x-accent)]">
              4<span className="text-base font-bold ml-0.5">枚</span>
            </p>
            <p className={`${P} mt-2`}>認証バッジのあるお店</p>
          </li>
          <li className="x-guide-hilite rounded-2xl border bg-[color:var(--x-inset)] p-4">
            <p className="x-guide-pink text-3xl font-black leading-none">
              8<span className="text-base font-bold ml-0.5">枚</span>
            </p>
            <p className={`${P} mt-2`}>
              さらに貴店サイトに<Link href="/x/banner" className={A}>リンクバナー</Link>を設置（設置後に
              <Link href="/x/banner/report" className={A}>報告フォーム</Link>からご連絡ください）
            </p>
          </li>
        </ul>
      </section>

      {/* ── フクエス掲載店なら ── */}
      <section className="x-guide-hilite mt-5 rounded-[22px] border-2 bg-[color:var(--x-surface)] p-5 sm:p-6">
        <h2 className={H2}>フクエス掲載店なら、もっとかんたん</h2>
        <ul className="mt-4 space-y-2.5">
          {FUKUES_MERITS.map((t) => (
            <li key={t} className={`flex items-start gap-2.5 ${P}`}>
              <Check />
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <p className={`${P} mt-4`}>
          掲載のご相談は<Link href="/listing" className={A}>掲載について</Link>か、
          <a href="mailto:info@fukues.com" className={A}>info@fukues.com</a>までお気軽にどうぞ。
        </p>
      </section>

      {/* ── 守ること ── */}
      <section className={CARD}>
        <h2 className={H2}>守っていただきたいこと</h2>
        <ul className={`mt-3 list-disc pl-5 space-y-1.5 ${P}`}>
          {RULES.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="text-sm text-[color:var(--x-text-secondary)] leading-[1.8] mt-3">
          くわしくは
          <Link href="/x/terms" className={A}>利用規約</Link>
          ・
          <Link href="/x/privacy" className={A}>プライバシーポリシー</Link>
          をご覧ください。
        </p>
      </section>

      {/* ── 困ったときは ── */}
      <section className={CARD}>
        <h2 className={H2}>困ったときは</h2>
        <p className={`${P} mt-3`}>
          フクエス運営事務局（
          <a href="mailto:info@fukues.com" className={A}>info@fukues.com</a>
          ）までご連絡ください。
        </p>
      </section>
    </div>
  );
}
