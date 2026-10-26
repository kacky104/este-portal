import Link from 'next/link';
import type { Metadata } from 'next';

// ユーザー向け使い方ガイド。静的コンテンツのみ・データ取得なし。
//
// ★ 第1648便（2026-10-24・カッキーさん）: 「簡単に分かりやすく」作り直し（セラピスト向けガイド第1641便と同じ作り）。
//   長い STEP1〜8 をやめ、「登録なしでも／登録すると」＋「使い方3つ」＋「知っておいてほしいこと」＋「守ること」だけにした。
//   ・ユーザー種別は投稿できない（見る・応援する専用）。投稿を促す表現は足さないこと。
//   ・コメント・メッセージに URL は書けない（第1647便）。
//   ・説明画像（public/x/guide/user/*.webp）は本文では使わなくなった（ヒーローはサイドバーのバナーで使用中）。
export const metadata: Metadata = {
  title: 'ユーザー向け使い方ガイド｜fukuX(フクエックス)',
  description:
    '福岡メンズエステ専用SNS「fukuX(フクエックス)」のユーザー向け使い方ガイド。登録なしでも見られます。登録するとフォロー・スキ・保存・コメントで推しを応援できます。',
  alternates: { canonical: '/x/guide/user' },
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

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: '推しを見つける',
    body: (
      <>
        「新着」「おすすめ」のタイムラインや、右上の🔍の検索、「お店」タブから、気になるセラピストやお店を探せます。
      </>
    ),
  },
  {
    title: 'フォローして応援',
    body: (
      <>
        プロフィールの「フォロー」で、その人の投稿が<span className={STRONG}>「フォロー中」タブ</span>に流れます。ハートの<span className={STRONG}>スキ</span>や、あとで見返せる<span className={STRONG}>保存</span>もできます。
      </>
    ),
  },
  {
    title: '出勤やストーリーをチェック',
    body: (
      <>
        セラピストのプロフィールでは出勤スケジュールが見られることがあります。上の丸いアイコンは<span className={STRONG}>24時間で消えるストーリー</span>です（見るにはログインが必要）。
      </>
    ),
  },
];

const NOTES: string[] = [
  'ユーザーアカウントは「見る・応援する」専用です（投稿はできません）',
  'コメントやメッセージ（DM）は、相手が受け付けている場合だけ送れます',
  'コメント・メッセージに URL（リンク）は書けません（運営へのお問い合わせだけは書けます）',
  '本名は不要、メールアドレスは公開されません',
];

const RULES: string[] = [
  '18歳未満の方は利用できません',
  '誹謗中傷・いやがらせはおやめください',
  '規定外のサービスを求めるメッセージは禁止です',
  '画像の無断転載・スクリーンショットの拡散はおやめください',
];

export default function XUserGuidePage() {
  return (
    <div className="pb-2">
      {/* ── 見出し ── */}
      <section className="mt-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-[color:var(--x-text-primary)]">ユーザー向け使い方ガイド</h1>
        <p className={`${P} mt-3`}>
          フクエックスは、福岡のメンズエステ専用SNSです。<span className={STRONG}>利用は無料。</span>セラピストやお店の投稿・出勤情報をチェックして、推しを応援できます。
        </p>
      </section>

      {/* ── 登録なしでも／登録すると ── */}
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        <li className="x-card rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-surface)] p-4">
          <p className="text-sm font-bold text-[color:var(--x-text-primary)]">登録なしでも</p>
          <p className={`${P} mt-1`}>投稿を見られます。</p>
        </li>
        <li className="x-guide-hilite rounded-2xl border bg-[color:var(--x-surface)] p-4">
          <p className="text-sm font-bold text-[color:var(--x-text-primary)]">登録すると</p>
          <p className={`${P} mt-1`}>
            フォロー・スキ・保存・コメントで応援できます。
            <Link href="/x/signup" className={A}>無料で登録</Link>
          </p>
        </li>
      </ul>

      {/* ── 使い方（3つ） ── */}
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

      {/* ── 知っておいてほしいこと ── */}
      <section className={CARD}>
        <h2 className={H2}>知っておいてほしいこと</h2>
        <ul className="mt-4 space-y-2.5">
          {NOTES.map((t) => (
            <li key={t} className={`flex items-start gap-2.5 ${P}`}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden className="mt-1 shrink-0 text-[color:var(--x-accent)]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              <span>{t}</span>
            </li>
          ))}
        </ul>
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
