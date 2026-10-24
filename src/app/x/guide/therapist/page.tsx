import Link from 'next/link';
import type { Metadata } from 'next';

// セラピスト向け使い方ガイド。静的コンテンツのみ・データ取得なし。
//
// ★ 第1641便（2026-10-24・カッキーさん）: 「とても簡単に分かりやすく端的に」作り直し。
//   STEP1〜10 の長い説明をやめ、「はじめ方3つ」＋「安心ポイント」＋「赤いバッジ」＋「守ること」だけにした。
//   ・セラピスト向けの案内では「fukuX」を読めない子がいるので「フクエックス」と書く。
//   ・赤バッジの取得条件（件数）は書かない（「所属して投稿をがんばると付く」という伝え方）。
//   ・説明画像（public/x/guide/therapist/*.webp）は使わなくなったが、ファイルは残してある。
//   ・中身が実装とずれないように: 開設は /cast のボタン or 写メ日記の「フクエックスにも投稿する」（第1595便）、
//     ID は自動で1回だけ変更可（第1596便）、DM・コメントは最初オフ、フォロワーは本人だけ（第1633・1636便）、
//     年齢・スリーサイズはフクエスの値（第1631便）、お店の fukuX が認証済みなら自動で所属（第994便）。
export const metadata: Metadata = {
  title: 'セラピスト向け使い方ガイド｜fukuX(フクエックス)',
  description:
    '福岡メンズエステ専用SNS「fukuX(フクエックス)」のセラピスト向け使い方ガイド。開設はボタン1つ、写メ日記と一緒に投稿できます。メッセージとコメントは最初からオフ。',
  alternates: { canonical: '/x/guide/therapist' },
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

// 実物と同じ認証バッジ（VerifiedBadge.tsx の形。kind='therapist' の赤 #EF4444）。
function VerifiedBadgeRed({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0">
      <path
        fill="#EF4444"
        d="M12 1.5l2.5 2.1 3.3-.3.9 3.2 2.8 1.8-1.3 3 1.3 3-2.8 1.8-.9 3.2-3.3-.3L12 22.5l-2.5-2.1-3.3.3-.9-3.2L2.5 15.7l1.3-3-1.3-3 2.8-1.8.9-3.2 3.3.3z"
      />
      <path fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M8.2 12.2l2.6 2.6 5-5.4" />
    </svg>
  );
}

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'ボタン1つで開設',
    body: (
      <>
        セラピストページの「開設する」ボタンを押すだけ。名前と写真はセラピストページと同じものが入り、IDは自動で付きます（
        <span className={STRONG}>あとから1回だけ変更</span>できます）。
      </>
    ),
  },
  {
    title: '写メ日記と一緒に投稿',
    body: (
      <>
        フクエスで写メ日記を書くときに<span className={STRONG}>「フクエックスにも投稿する」</span>にチェックするだけ。フクエックスの右下の「＋」からも投稿できます。
      </>
    ),
  },
  {
    title: 'あとは何もしなくてOK',
    body: (
      <>
        在籍しているお店がフクエックスを使っていれば、<span className={STRONG}>自動でお店に所属</span>します。出勤スケジュールや年齢・スリーサイズも、フクエスの情報が自動で表示されます。
      </>
    ),
  },
];

const SAFE: string[] = [
  'メッセージ（DM）とコメントは最初からオフ（設定で変えられます）',
  'あなたをフォローしている人は、ほかの人には表示されません',
  'メールアドレスは公開されません',
];

const RULES: string[] = [
  '18歳未満の方は利用できません',
  '在籍していないお店への所属・なりすましは禁止です',
  '規定外のサービスを連想させる投稿はできません',
  '他人の画像の無断転載は禁止です',
];

export default function XTherapistGuidePage() {
  return (
    <div className="pb-2">
      {/* ── 見出し ── */}
      <section className="mt-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-[color:var(--x-text-primary)]">セラピスト向け使い方ガイド</h1>
        <p className={`${P} mt-3`}>
          フクエックスは、福岡のメンズエステ専用SNSです。<span className={STRONG}>利用は無料、増える作業もありません。</span>
        </p>
      </section>

      {/* ── はじめ方（3つ） ── */}
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

      {/* ── 安心ポイント ── */}
      <section className={CARD}>
        <h2 className={H2}>安心して使えます</h2>
        <ul className="mt-4 space-y-2.5">
          {SAFE.map((t) => (
            <li key={t} className={`flex items-start gap-2.5 ${P}`}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden className="mt-1 shrink-0 text-[color:var(--x-accent)]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── 赤いバッジ（取得条件の件数は書かない） ── */}
      <section className="x-guide-red-box mt-5 rounded-[22px] border p-5 sm:p-6">
        <div className="flex items-center gap-2.5">
          <VerifiedBadgeRed size={26} />
          <h2 className="x-guide-red text-lg sm:text-xl font-bold">赤いバッジを目指そう</h2>
        </div>
        <p className={`${P} mt-3`}>
          お店に所属して投稿をがんばると、<span className={STRONG}>赤い認証バッジ</span>が付きます。バッジが付くと、おすすめに表示されやすくなります。
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
          お店のスタッフか、フクエス運営事務局（
          <a href="mailto:info@fukues.com" className={A}>info@fukues.com</a>
          ）までご連絡ください。
        </p>
      </section>
    </div>
  );
}
