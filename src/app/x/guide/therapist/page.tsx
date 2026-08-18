import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';

// セラピスト向け使い方ガイド。静的コンテンツのみ・データ取得なし。
// SNSに不慣れな方も読める「登録→開設→プロフィール→所属→投稿…」のステップ形式。
// 機能仕様と齟齬が出ないよう、数値（文字数・枚数等）は実装の定数に合わせている:
//   @ID=3〜20字（OnboardingForm）/ 表示名=30字・自己紹介=160字（XSettingsForm）/
//   投稿=500字・画像4枚（XComposer）/ オファーPR文=300字 / ストーリー=24時間・所属セラピスト限定
//
// ★ 2026-08-18（第22便）画像装飾:
//   STEP1〜10 が1枚の長いカードに続いていたのを、内容別の4グループカードへ分けて先頭に説明画像を置いた。
//   文章・リンク・STEPの番号と順番は1文字も変えていない（レイアウトのために短くもしていない）。
//   画像は public/x/guide/therapist/ の5枚。渡された元PNGは計8.1MBあったので WebP(q88) に変換し計402KBにした。
//   ★ 画像に文字は焼き込まない。見出し・説明文は必ずHTMLで出すこと（差し替え時も同じ）。
//
// ★ このページの最重要は STEP4（お店への所属）と、その中の「赤い認証バッジ」。
//   STEP4 だけ独立したカードにして、ピンク〜紫の枠で他より一段強く見せている。
//   赤は認証バッジと重要語だけに使う（x-theme.css の .x-guide-red / .x-guide-red-box）。
//   ★ 赤を他の箇所へ広げないこと。ページ全体の紫の統一感が壊れる。
//
// ★ 幅について: /x の <main> は layout.tsx の max-w-2xl（672px）が全ページ共通。
//   いちばん外の <div className="x-main-wide"> を目印に、x-theme.css 側で 900px まで広げている（opt-in）。
//   お店向けガイド（/x/guide/shop）と同じ仕組み。layout.tsx は触っていない。
export const metadata: Metadata = {
  title: 'セラピスト向け使い方ガイド｜fukuX(フクエックス)',
  description:
    '福岡メンズエステ専用SNS「fukuX(フクエックス)」のセラピスト向け使い方ガイド。登録からプロフィール設定、お店への所属、投稿・ストーリー・出勤スケジュール・求人オファーの受け取り方まで、初めての方にもわかりやすく説明します。',
  alternates: { canonical: '/x/guide/therapist' },
};

// ── 本文まわりの共通クラス ───────────────────────────────────────────
// 本文は PC 16px / スマホ 15px、行間 1.85（指示: 本文15〜16px・行間1.75〜1.9）。
// ★ 補足文（NOTE）に --x-text-muted は使わない。薄いグレー紫の小さい文字を減らすため
//   secondary（グラデ #cfc3f2 / 白 slate-500）に統一してある。
const P = 'text-[15px] sm:text-base text-[color:var(--x-text-secondary)] leading-[1.85]';
const P_SM = 'text-[14.5px] sm:text-[15px] text-[color:var(--x-text-secondary)] leading-[1.8]';
const OL = `list-decimal pl-5 space-y-2.5 ${P}`;
const UL = `list-disc pl-5 space-y-2 ${P}`;
const A = 'text-[color:var(--x-accent)] font-bold underline underline-offset-2 decoration-1 hover:no-underline';
const NOTE = 'text-sm text-[color:var(--x-text-secondary)] leading-[1.8] mt-3';
const STRONG = 'font-bold text-[color:var(--x-text-primary)]';
// STEP同士の間隔（指示: 見出しと本文、STEP同士の間隔を現在より広げる）。
const STEP_GAP = 'mt-9 sm:mt-10';

function GroupCard({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <section
      id={id}
      className="x-card mt-8 sm:mt-10 p-5 sm:p-7 rounded-[22px] bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)] scroll-mt-20"
    >
      {children}
    </section>
  );
}

// グループ先頭の説明画像。幅100%・高さ自動・角丸18px・薄い枠線と控えめな影（指示の共通仕様）。
// sizes は実寸から逆算: 932px以上=812px（main 900 − px-4の32 − カード p-7 の56）／
//   640〜931px=100vw−88px／639px以下=100vw−72px（カードが p-5 になるぶん狭い）。
// loading は既定のまま＝遅延読み込み（先読みはヒーローだけ）。
function GuideImage({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) {
  return (
    <div className="x-guide-figure mb-6 overflow-hidden rounded-[18px] border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)]">
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes="(min-width: 932px) 812px, (min-width: 640px) calc(100vw - 88px), calc(100vw - 72px)"
        className="block w-full h-auto"
      />
    </div>
  );
}

function Step({ n, title, accent = false }: { n: number; title: string; accent?: boolean }) {
  return (
    <h2
      className={`flex items-start gap-2.5 font-bold text-[color:var(--x-text-primary)] ${
        accent ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg'
      }`}
    >
      <span
        className={`inline-flex items-center justify-center rounded-full text-white font-black shrink-0 ${
          accent ? 'w-9 h-9 text-base mt-0.5' : 'w-7 h-7 text-sm mt-0.5'
        }`}
        style={{
          background: accent ? 'linear-gradient(100deg,#EC4899,#8B5CF6)' : 'linear-gradient(100deg,#6366F1,#8B5CF6)',
        }}
      >
        {n}
      </span>
      <span>{title}</span>
    </h2>
  );
}

// 実物と同じ認証バッジ（VerifiedBadge.tsx の形。kind='therapist' の赤 #EF4444）。
// ★ 実装の色を変えたらここも合わせること。ガイドと実物で色が違うと問い合わせのもとになる。
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

// 見出しの横に添える小さなラベル（所属者限定・未所属の方向け など）。
function Tag({ children, tone = 'pink' }: { children: React.ReactNode; tone?: 'pink' | 'indigo' }) {
  return (
    <span
      className={`${
        tone === 'pink' ? 'x-guide-tag' : 'border-indigo-300/70 bg-indigo-500/15 text-[color:var(--x-accent)]'
      } ml-2 mt-1 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold whitespace-nowrap`}
    >
      {children}
    </span>
  );
}

// 手順の小カード（PC 横並び / スマホ 縦並び）。
function FlowCard({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] p-4">
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-black mb-2"
        style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
      >
        {n}
      </span>
      <p className={P_SM}>{children}</p>
    </li>
  );
}

// 補足・注意ボックス（本文とは分けたいもの）。
function InfoBox({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] p-4">
      <span className="mt-0.5 shrink-0 text-[color:var(--x-accent)]">{icon}</span>
      <p className={P_SM}>{children}</p>
    </div>
  );
}

const ICON = 'w-5 h-5 shrink-0';

function IconMail() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2 7l10 6 10-6" />
    </svg>
  );
}
function IconPhoto() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.8" />
      <path d="M21 16l-5-5-6 6" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden>
      <path d="M12 2.5l7.5 3v6c0 4.6-3.1 8.7-7.5 10-4.4-1.3-7.5-5.4-7.5-10v-6l7.5-3z" />
      <path d="M9.2 12.2l2 2 3.6-4" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M8 2v4M16 2v4M3 10h18" />
    </svg>
  );
}

export default function XTherapistGuidePage() {
  return (
    // ★ この目印（x-main-wide）で main が 900px に広がる。x-theme.css の #x-root main:has(.x-main-wide) 参照。
    <div className="x-main-wide pb-2">
      {/* ───────────────── ヒーロー ─────────────────
          PC: 画像を 5:2（元画像 1983×793 がちょうど 5:2）で大きく出し、左の余白に見出しと冒頭文を重ねる。
              ★ この写真は左から36%までが無地で、そこから小物アイコン、56%以降が人物。
                （列ごとのばらつきを実測して確認）文字は48%までに収め、オーバーレイで64%まで暗く落としてある。
          SP: 重ねると人物と文字がぶつかるので、画像を切らずに丸ごと出し、その下に見出しと冒頭文を置く。
          ★ 文字色は md 以上だけ白で固定する。テーマ変数のままだと白テーマで黒文字になり画像上で読めない。
          ★ h1「セラピスト向け使い方ガイド」は13文字ある。md で 26px のままだと左カラム(291px)に入らず
            変な位置で改行するので、md だけ 21px に落としてある（実測して決めた値）。 */}
      <section className="relative mt-5">
        <div className="x-guide-hero relative overflow-hidden rounded-[22px] border border-indigo-400/45">
          <Image
            src="/x/guide/therapist/therapist-guide-hero.webp"
            alt="スマートフォンでfukuXを利用するセラピスト"
            width={1983}
            height={793}
            priority
            sizes="(min-width: 932px) 868px, calc(100vw - 32px)"
            className="block w-full h-auto"
          />
          <div
            aria-hidden
            className="hidden md:block absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, rgba(23,10,54,0.92) 0%, rgba(23,10,54,0.84) 28%, rgba(23,10,54,0.55) 50%, rgba(23,10,54,0) 64%)',
            }}
          />
        </div>

        <div className="mt-4 md:mt-0 md:absolute md:inset-y-0 md:left-0 md:z-10 md:flex md:w-[48%] md:flex-col md:justify-center md:pl-8 md:pr-4 lg:pl-11">
          <h1 className="text-2xl sm:text-3xl md:text-[21px] lg:text-[25px] font-bold text-[color:var(--x-text-primary)] md:text-white md:drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">
            セラピスト向け使い方ガイド
          </h1>
          <p className="mt-3 text-[15px] sm:text-base md:text-[14px] lg:text-[15px] leading-[1.85] text-[color:var(--x-text-secondary)] md:text-white/90 md:drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]">
            fukuX（フクエックス）は、福岡のメンズエステ専用SNSです。セラピストのあなたが投稿やストーリーでお客様とつながり、出勤情報やお店の情報を届けられます。利用は無料。このガイドでは、登録から日々の使い方までを順番に説明します。
          </p>
        </div>
      </section>

      {/* ヒーロー直下の強調ボックス（もとは冒頭の2段落目）。STEP4 へページ内移動できるようにしてある。 */}
      <div className="x-guide-hilite mt-5 rounded-2xl border bg-[color:var(--x-surface)] p-4 sm:p-5">
        <p className={P}>
          fukuXでは、運営に承認されたお店と、お店に所属しているセラピストを優遇して表示しています。
          <span className={STRONG}>お店への所属が圧倒的に有利</span>です（くわしくは
          <a href="#step4" className={A}>STEP4</a>）。
        </p>
      </div>

      {/* ───────────────── STEP1〜3：アカウント準備 ───────────────── */}
      <GroupCard>
        <GuideImage
          src="/x/guide/therapist/therapist-guide-onboarding.webp"
          alt="セラピスト登録からプロフィール完成までの流れ"
          width={1621}
          height={970}
        />
        {/* 画像と文章の両方から順序が分かるように、画像の直下に流れを一行で置く（画像には焼き込まない）。 */}
        <p className="mb-7 text-[15px] sm:text-base font-bold text-[color:var(--x-text-primary)] leading-[1.7]">
          登録 <span className="text-[color:var(--x-accent)]">→</span> セラピスト種別・@ID設定{' '}
          <span className="text-[color:var(--x-accent)]">→</span> プロフィール完成
        </p>

        <Step n={1} title="アカウントを登録する" />
        <ol className={`${OL} mt-3`}>
          <li>
            <Link href="/x/signup" className={A}>新規登録ページ</Link>
            で、メールアドレスとパスワード（8文字以上）を入力して登録します。
          </li>
          <li>登録したメールアドレスとパスワードでログインします。</li>
        </ol>
        <InfoBox icon={<IconMail />}>※メールアドレスは他のユーザーに公開されません。</InfoBox>

        <div className={STEP_GAP}>
          <Step n={2} title="アカウントを開設する（種別・@ID・表示名）" />
          <ol className={`${OL} mt-3`}>
            <li>ログイン後の「アカウントを開設」で、種別は<span className={STRONG}>「セラピスト」</span>を選びます。</li>
            <li>
              <span className={STRONG}>@ID</span>（英数字とアンダースコア、3〜20文字）を決めます。
              <span className={STRONG}>あとから変更できない</span>
              <Tag>変更不可</Tag>
              ので、源氏名など分かりやすいものがおすすめです。
            </li>
            <li>表示名（30文字まで・あとから変更可）とアバター画像（任意）を設定して開設完了です。</li>
          </ol>
        </div>

        <div className={STEP_GAP}>
          <Step n={3} title="プロフィールを整える" />
          <p className={`${P} mt-3`}>
            左上の自分のアイコン →「マイプロフィール」→ 編集（または設定）から、いつでも変更できます。
          </p>
          <ul className={`${UL} mt-3`}>
            <li>アバター画像・ヘッダー画像（横長にクロップされます）</li>
            <li>自己紹介（160文字まで）・外部リンク（お店のホームページ等）</li>
            <li>年齢・スリーサイズ（すべて任意。入力したものだけプロフィールに表示されます）</li>
          </ul>
          <InfoBox icon={<IconPhoto />}>
            ※写真は自分に権利があるもの（お店から許可を得たもの）だけを使ってください。
          </InfoBox>
        </div>
      </GroupCard>

      {/* ───────────────── STEP4：お店への所属と赤い認証バッジ（このページの最重要） ─────────────────
          ★ 独立したカードにして、ピンク〜紫の枠で他のグループより一段強く見せている。
            id="step4" は冒頭の強調ボックスからのページ内リンク先。 */}
      <section
        id="step4"
        className="x-card x-guide-hilite mt-8 sm:mt-10 p-5 sm:p-7 rounded-[22px] border-2 bg-[color:var(--x-surface)] scroll-mt-20"
      >
        <GuideImage
          src="/x/guide/therapist/therapist-guide-affiliation.webp"
          alt="店舗への所属申請から赤い認証バッジ取得までの流れ"
          width={1619}
          height={971}
        />

        <div className="flex items-center gap-2 mb-3">
          <span className="x-guide-pink text-xs font-black tracking-wider">このページで最重要</span>
        </div>
        <Step n={4} title="お店に所属する（所属すると断然有利！）" accent />

        <p className={`${P} mt-4`}>
          所属申請を送れるのは、<span className={STRONG}>フクエス運営の審査で承認されたお店だけ</span>です。fukuXでは、なりすましでないことが確認・承認されたお店と、お店に所属しているセラピストを優遇して表示しています。ぜひお店に所属してfukuXをご利用ください。
        </p>
        <p className={`${P} mt-3`}>
          所属はお店側からの申請で成立します。流れは次のとおりです。
        </p>
        {/* 所属成立の3段階。PCは横並び・スマホは縦並び。文言はもとの箇条書きのまま。 */}
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          <FlowCard n={1}>
            自分の<span className={STRONG}>@ID</span>を在籍するお店に伝えます。
          </FlowCard>
          <FlowCard n={2}>お店が@IDを検索して所属申請を送ります。</FlowCard>
          <FlowCard n={3}>
            あなたのタイムライン上部に「所属申請が届いています」バナーが表示されるので、内容を確認して
            <span className={STRONG}>承認</span>します。
          </FlowCard>
        </ol>

        {/* 承認後のメリットは独立した欄にする（指示）。 */}
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-indigo-300/60 bg-[color:var(--x-inset)] p-4">
          <IconShield />
          <p className={P}>承認すると、プロフィールに「◯◯所属」バッジが表示されます。</p>
        </div>

        <ul className={`${UL} mt-5`}>
          <li>退店したときは、設定の「所属を解除する」から解除してください（お店側からも解除できます）。</li>
          <li>実際に在籍しているお店以外への所属は禁止です。</li>
        </ul>

        {/* 所属×投稿のメリット訴求（赤バッジ→おすすめ露出アップ）。ガイドの最重要アピールポイント。
            ★ 赤はこのサブカードの中だけ。点滅や強すぎる警告色は使わない。 */}
        <div className="x-guide-red-box mt-6 rounded-[20px] border p-4 sm:p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <VerifiedBadgeRed size={26} />
            <p className="x-guide-red text-base sm:text-lg font-bold">赤いバッジを目指そう</p>
          </div>

          {/* 所属＋投稿 → 赤バッジ → おすすめタイムラインでの露出、を図で見せる。 */}
          <div className="mb-4 flex items-center gap-2 sm:gap-3">
            <div className="flex-1 rounded-xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-surface)] p-3 text-center">
              <p className="text-xs font-bold text-[color:var(--x-text-secondary)]">お店に所属</p>
              <p className="text-xs font-bold text-[color:var(--x-text-secondary)]">＋ 投稿</p>
            </div>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden className="shrink-0 text-[color:var(--x-accent)]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            <div className="flex-1 rounded-xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-surface)] p-3 text-center">
              <span className="inline-flex items-center justify-center">
                <VerifiedBadgeRed size={22} />
              </span>
              <p className="x-guide-red text-xs font-bold mt-1">赤いバッジ</p>
            </div>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden className="shrink-0 text-[color:var(--x-accent)]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            <div className="flex-1 rounded-xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-surface)] p-3 text-center">
              {/* 右上に伸びる矢印＝おすすめでの露出が増えるイメージ */}
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden className="mx-auto text-[color:var(--x-accent)]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 17 9 11 13 15 21 7" />
                <polyline points="14 7 21 7 21 14" />
              </svg>
              <p className="text-xs font-bold text-[color:var(--x-text-secondary)] mt-1">おすすめに出やすく</p>
            </div>
          </div>

          <p className={P}>
            お店に所属して投稿をがんばると、<span className={STRONG}>認証の赤いバッジ</span>が表示されるようになります。バッジが表示されると、おすすめタイムラインにあなたの投稿が表示される確率が<span className="x-guide-red font-bold">大幅にアップ</span>します。お客様の目に留まるチャンスが大きく増えるので、まずはお店に所属して投稿を続けてみてください。
          </p>
        </div>
      </section>

      {/* ───────────────── STEP5〜7：投稿・ストーリー・出勤情報 ───────────────── */}
      <GroupCard>
        <GuideImage
          src="/x/guide/therapist/therapist-guide-posting-schedule.webp"
          alt="投稿、ストーリー、出勤スケジュールの利用イメージ"
          width={1619}
          height={972}
        />

        <Step n={5} title="投稿してみよう" />
        <ul className={`${UL} mt-3`}>
          <li>画面右下の「＋」ボタンから投稿できます。本文は500文字まで、画像は4枚まで（JPEG・PNG・WebP、各5MB以下）。</li>
          <li>「#ハッシュタグ」を付けると、同じタグの投稿から見つけてもらいやすくなります。</li>
          <li>ほかの人の投稿には、スキ（いいね）・リポスト（自分のフォロワーへの再共有）・保存ができます。</li>
        </ul>

        {/* 3機能が地続きに見えないよう、STEP の間に薄い区切り線と広い余白を入れる。 */}
        <hr className="my-9 h-px border-0 bg-[color:var(--x-border-strong)]" />

        <div className="flex flex-wrap items-start">
          <Step n={6} title="ストーリー（24時間で消える投稿）" />
          <Tag>所属セラピスト限定</Tag>
        </div>
        {/* ★ 文章は足さず、アイコンだけで「所属者限定」と「24時間で消える」を目立たせる。
            もとの箇条書き2点をそのままアイコン付きの行にしただけ。 */}
        <ul className="mt-4 space-y-3">
          <li className="flex items-start gap-3 rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] p-4">
            <span className="mt-0.5 shrink-0 text-[color:var(--x-accent)]">
              <IconShield />
            </span>
            <p className={P}>お店に所属しているセラピストだけが投稿できます（タイムライン上部のストーリーバーの「＋」から）。</p>
          </li>
          <li className="flex items-start gap-3 rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] p-4">
            <span className="mt-0.5 shrink-0 text-[color:var(--x-accent)]">
              <IconClock />
            </span>
            <p className={P}>投稿から24時間で自動的に見えなくなります。「今日出勤しています」等の気軽な発信に便利です。</p>
          </li>
        </ul>

        <hr className="my-9 h-px border-0 bg-[color:var(--x-border-strong)]" />

        <div className="flex flex-wrap items-start">
          <Step n={7} title="出勤スケジュールの表示" />
          <Tag tone="indigo">設定不要</Tag>
        </div>
        <div className="mt-3 flex items-start gap-3 rounded-2xl border border-indigo-300/60 bg-[color:var(--x-inset)] p-4">
          <IconCalendar />
          <p className={P}>
            お店に所属していると、フクエス掲載店なら出勤情報と連動して、あなたのプロフィールに
            <span className={STRONG}>7日分の出勤スケジュールが自動で表示</span>されます。
            <span className={STRONG}>fukuX側での設定は不要です</span>（出勤情報はお店がフクエスで登録します）。
          </p>
        </div>
      </GroupCard>

      {/* ───────────────── STEP8〜10：求人オファー・DM・通知 ───────────────── */}
      <GroupCard>
        <GuideImage
          src="/x/guide/therapist/therapist-guide-offer-dm-notification.webp"
          alt="求人オファー、DM、通知を受け取る流れ"
          width={1620}
          height={971}
        />

        <div className="flex flex-wrap items-start">
          <Step n={8} title="求人オファーを受け取る（未所属の方向け）" />
          <Tag tone="indigo">未所属の方向け</Tag>
        </div>
        <p className={`${P} mt-3`}>
          お店に所属していない間は、お店からの求人スカウト（オファー）を受け取れます。
        </p>
        {/* 受け取るまでの流れを3段階で見せる（本文はこの下の箇条書きのまま残してある）。 */}
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          <FlowCard n={1}>オファー受付をオンにする</FlowCard>
          <FlowCard n={2}>PR文・希望エリアを設定する</FlowCard>
          <FlowCard n={3}>認証済みのお店から連絡を受け取る</FlowCard>
        </ol>
        <ul className={`${UL} mt-5`}>
          <li>設定の「オファー受付」をオンにして、PR文（300文字まで）と希望エリアを設定します。</li>
        </ul>
        {/* 誰に見えるかは不安になりやすい部分なので、盾アイコン付きの独立ボックスにする。 */}
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-indigo-300/60 bg-[color:var(--x-inset)] p-4">
          <IconShield />
          <div>
            <p className={P}>
              オンにすると、認証済みのお店・運営だけが見られるオファー一覧に表示され、フォローされていなくてもメッセージを受け取れます。
            </p>
            <p className={`${P} mt-2`}>
              <span className={STRONG}>一般のユーザーには表示されません。</span>所属が決まると自動で一覧から外れます。
            </p>
          </div>
        </div>

        <hr className="my-9 h-px border-0 bg-[color:var(--x-border-strong)]" />

        <Step n={9} title="DM（ダイレクトメッセージ）" />
        <ul className={`${UL} mt-3`}>
          <li>どちらか一方がフォローしている相手と、プロフィールのメッセージボタンからDMできます。</li>
          <li>DMを受け取りたくない場合は、設定の「DM受付オフ」をオンにしてください（新しいやり取りが止まります。過去のメッセージは見られます）。</li>
        </ul>

        <hr className="my-9 h-px border-0 bg-[color:var(--x-border-strong)]" />

        <Step n={10} title="通知" />
        {/* ベルと封筒は取り違えやすいので、並べた比較カードにする（文言はもとの2文のまま）。 */}
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          <li className="rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] p-4">
            <span className="inline-flex items-center gap-2 text-[color:var(--x-accent)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden>
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
              <span className="text-sm font-bold text-[color:var(--x-text-primary)]">ベル</span>
            </span>
            <p className={`${P_SM} mt-2`}>画面右上のベルに、スキ・フォロー等の通知が届きます。</p>
          </li>
          <li className="rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] p-4">
            <span className="inline-flex items-center gap-2 text-[color:var(--x-accent)]">
              <IconMail />
              <span className="text-sm font-bold text-[color:var(--x-text-primary)]">封筒</span>
            </span>
            <p className={`${P_SM} mt-2`}>封筒アイコンにはDMの未読件数が表示されます。</p>
          </li>
        </ul>
      </GroupCard>

      {/* ───────────────── 守っていただきたいこと（独立カード） ───────────────── */}
      <GroupCard>
        <h2 className="flex items-center gap-2.5 text-lg sm:text-xl font-bold text-[color:var(--x-text-primary)]">
          <span className="x-guide-hilite inline-flex items-center justify-center w-8 h-8 rounded-full border shrink-0">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="x-guide-pink"
              style={{ width: 18, height: 18 }}
              aria-hidden
            >
              <path d="M10.3 3.9L1.8 18.1A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
          </span>
          守っていただきたいこと
        </h2>
        {/* ★ 年齢条件は最初にはっきり出す（指示）。PCでも1行まるごと使う。 */}
        <div className="x-guide-hilite mt-4 rounded-2xl border-2 bg-[color:var(--x-inset)] p-4">
          <p className="text-base sm:text-lg font-bold text-[color:var(--x-text-primary)]">18歳未満の方は利用できません。</p>
        </div>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            '実在しないお店への所属申請の承認、他人へのなりすましは禁止です。',
            '規定外のサービスを連想させる投稿・DMはできません。',
            '他人が撮影した画像の無断転載、DMの内容を相手の同意なく公開することも禁止です。',
          ].map((t) => (
            <li key={t} className="x-guide-hilite rounded-2xl border bg-[color:var(--x-inset)] p-4">
              <p className={P_SM}>{t}</p>
            </li>
          ))}
        </ul>
        <p className={NOTE}>
          詳しくは
          <Link href="/x/terms" className={A}>fukuX利用規約</Link>
          ・
          <Link href="/x/privacy" className={A}>fukuXプライバシーポリシー</Link>
          をご覧ください。
        </p>
      </GroupCard>

      {/* ───────────────── 困ったときは（独立カード） ───────────────── */}
      <GroupCard>
        <h2 className="text-lg sm:text-xl font-bold text-[color:var(--x-text-primary)]">困ったときは</h2>
        <p className={`${P} mt-3`}>
          フクエス運営事務局（
          <a href="mailto:info@fukues.com" className={A}>info@fukues.com</a>
          ）までお気軽にご連絡ください。
        </p>
      </GroupCard>
    </div>
  );
}
