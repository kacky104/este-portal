import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';

// 一般ユーザー向け使い方ガイド。静的コンテンツのみ・データ取得なし。
// ユーザー種別は「見る・応援する」専用（投稿・ストーリー投稿は不可）である点を明るいトーンで説明する。
// 数値は実装の定数と一致: @ID=3〜20字 / 表示名30字 / ストーリー24時間。
// フォローは therapist/shop/official に対してのみ可（ユーザー同士は不可）＝「推しをフォロー」の表現に留める。
//
// ★ 2026-08-18（第22便）画像装飾:
//   STEP1〜8 が1枚の長いカードに続いていたのを、内容別の4グループカードへ分けて先頭に説明画像を置いた。
//   文章・リンク・STEPの番号と順番は1文字も変えていない（レイアウトのために短くもしていない）。
//   画像は public/x/guide/user/ の5枚。渡された元PNGは計8.6MBあったので WebP(q88) に変換し計434KBにした。
//   ★ 画像に文字は焼き込まない。見出し・説明文は必ずHTMLで出すこと（差し替え時も同じ）。
//
// ★ お店向け（/x/guide/shop）・セラピスト向け（/x/guide/therapist）と同じ作りに揃えてある。
//   共通クラス（P / P_SM / UL / A / NOTE / STRONG）、GroupCard・GuideImage・Step・Tag・
//   FlowCard・InfoBox の作り、ヒーローの重ね方、x-theme.css の x-main-wide / x-guide-* まで同じ。
//   ★ 3本のうち1本だけ直すと見た目がずれる。文字サイズや余白を変えるときは3本まとめて変えること。
//
// ★ このページ特有の注意:
//   ・ユーザー種別は投稿できない。投稿ボタンや投稿を促す表現をここに足さないこと。
//   ・出勤スケジュールは「表示されることがあります（フクエス掲載店の所属セラピストの場合）」。
//     「必ず表示されます」のような断定へ書き換えないこと。
//   ・ストーリーの閲覧にはログインが必要。ここも条件を落とさないこと。
export const metadata: Metadata = {
  title: 'ユーザー向け使い方ガイド｜fukuX(フクエックス)',
  description:
    '福岡メンズエステ専用SNS「fukuX(フクエックス)」のユーザー向け使い方ガイド。登録から推しセラピスト・お店の見つけ方、フォロー・スキ・保存・通知の使い方まで、初めての方にもわかりやすく説明します。',
  alternates: { canonical: '/x/guide/user' },
};

// ── 本文まわりの共通クラス（3ガイド共通の値）───────────────────────────
const P = 'text-[15px] sm:text-base text-[color:var(--x-text-secondary)] leading-[1.85]';
const P_SM = 'text-[14.5px] sm:text-[15px] text-[color:var(--x-text-secondary)] leading-[1.8]';
const UL = `list-disc pl-5 space-y-2 ${P}`;
const A = 'text-[color:var(--x-accent)] font-bold underline underline-offset-2 decoration-1 hover:no-underline';
const NOTE = 'text-sm text-[color:var(--x-text-secondary)] leading-[1.8] mt-3';
const STRONG = 'font-bold text-[color:var(--x-text-primary)]';

function GroupCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="x-card mt-8 sm:mt-10 p-5 sm:p-7 rounded-[22px] bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)]">
      {children}
    </section>
  );
}

// グループ先頭の説明画像。幅100%・高さ自動・角丸18px・薄い枠線と控えめな影（3ガイド共通）。
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

function Step({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-start gap-2.5 font-bold text-[color:var(--x-text-primary)] text-base sm:text-lg">
      <span
        className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-sm font-black shrink-0 mt-0.5"
        style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
      >
        {n}
      </span>
      <span>{title}</span>
    </h2>
  );
}

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

// アイコン付きの小カード（タイムラインの3タブ・推しの探し方・応援機能）。
function IconCard({ icon, title, children }: { icon: React.ReactNode; title?: string; children: React.ReactNode }) {
  return (
    <li className="rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] p-4">
      <span className="inline-flex items-center gap-2 text-[color:var(--x-accent)]">
        {icon}
        {title && <span className="text-sm font-bold text-[color:var(--x-text-primary)]">{title}</span>}
      </span>
      <p className={`${P_SM} mt-2`}>{children}</p>
    </li>
  );
}

// 補足・注意ボックス（本文とは分けたいもの）。
function InfoBox({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-indigo-300/60 bg-[color:var(--x-inset)] p-4">
      <span className="mt-0.5 shrink-0 text-[color:var(--x-accent)]">{icon}</span>
      <div>{children}</div>
    </div>
  );
}

const ICON = 'w-5 h-5 shrink-0';
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function IconEye() {
  return (
    <svg viewBox="0 0 24 24" {...S} className={ICON} aria-hidden>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}
function IconHeart() {
  return (
    <svg viewBox="0 0 24 24" {...S} className={ICON} aria-hidden>
      <path d="M12 20.5S3.5 15.4 3.5 9.6A4.6 4.6 0 0 1 12 7.2a4.6 4.6 0 0 1 8.5 2.4c0 5.8-8.5 10.9-8.5 10.9z" />
    </svg>
  );
}
function IconShield() {
  return (
    <svg viewBox="0 0 24 24" {...S} className={ICON} aria-hidden>
      <path d="M12 2.5l7.5 3v6c0 4.6-3.1 8.7-7.5 10-4.4-1.3-7.5-5.4-7.5-10v-6l7.5-3z" />
      <path d="M9.2 12.2l2 2 3.6-4" />
    </svg>
  );
}
function IconSparkles() {
  return (
    <svg viewBox="0 0 24 24" {...S} className={ICON} aria-hidden>
      <path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
      <path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" {...S} className={ICON} aria-hidden>
      <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
      <circle cx="9" cy="7.5" r="3.5" />
      <path d="M22 20v-1.5a4 4 0 0 0-3-3.9M16.5 4.1a3.5 3.5 0 0 1 0 6.8" />
    </svg>
  );
}
function IconStore() {
  return (
    <svg viewBox="0 0 24 24" {...S} className={ICON} aria-hidden>
      <path d="M3.5 9h17l-1-4.5h-15L3.5 9z" />
      <path d="M4.5 9v10.5h15V9" />
      <path d="M9.5 19.5V13h5v6.5" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" {...S} className={ICON} aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.3-4.3" />
    </svg>
  );
}
function IconHash() {
  return (
    <svg viewBox="0 0 24 24" {...S} className={ICON} aria-hidden>
      <path d="M9 3.5L7 20.5M17 3.5l-2 17M3.5 8.5h17M3 15.5h17" />
    </svg>
  );
}
function IconUserPlus() {
  return (
    <svg viewBox="0 0 24 24" {...S} className={ICON} aria-hidden>
      <path d="M15 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
      <circle cx="8.5" cy="7.5" r="3.5" />
      <path d="M18.5 8v6M21.5 11h-6" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg viewBox="0 0 24 24" {...S} className={ICON} aria-hidden>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}
function IconRepost() {
  return (
    <svg viewBox="0 0 24 24" {...S} className={ICON} aria-hidden>
      <path d="M4 8.5A3.5 3.5 0 0 1 7.5 5H17l-2.5-2.5M20 15.5A3.5 3.5 0 0 1 16.5 19H7l2.5 2.5" />
      <path d="M17 5l-2.5 2.5M7 19l2.5-2.5" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg viewBox="0 0 24 24" {...S} className={ICON} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" {...S} className={ICON} aria-hidden>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M8 2v4M16 2v4M3 10h18" />
    </svg>
  );
}
function IconMail() {
  return (
    <svg viewBox="0 0 24 24" {...S} className={ICON} aria-hidden>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2 7l10 6 10-6" />
    </svg>
  );
}
function IconChat() {
  return (
    <svg viewBox="0 0 24 24" {...S} className={ICON} aria-hidden>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z" />
    </svg>
  );
}

export default function XUserGuidePage() {
  return (
    // ★ この目印（x-main-wide）で main が 900px に広がる。x-theme.css の #x-root main:has(.x-main-wide) 参照。
    <div className="x-main-wide pb-2">
      {/* ───────────────── ヒーロー ─────────────────
          PC: 画像を 5:2（元画像 1983×793 がちょうど 5:2）で大きく出し、左の余白に見出しと冒頭文を重ねる。
              ★ この写真は左から35%までが無地で、そこから小物アイコン、55%以降が人物。
                （列ごとのばらつきを実測して確認）文字は48%までに収め、オーバーレイで64%まで暗く落としてある。
          SP: 重ねると人物と文字がぶつかるので、画像を切らずに丸ごと出し、その下に見出しと冒頭文を置く。
          ★ 文字色は md 以上だけ白で固定する。テーマ変数のままだと白テーマで黒文字になり画像上で読めない。
          ★ h1 の文字サイズは3ガイドで揃えてある（md=21px / lg=25px）。 */}
      <section className="relative mt-5">
        <div className="x-guide-hero relative overflow-hidden rounded-[22px] border border-indigo-400/45">
          <Image
            src="/x/guide/user/user-guide-hero.webp"
            alt="スマートフォンでfukuXを利用する一般ユーザー"
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
            ユーザー向け使い方ガイド
          </h1>
          <p className="mt-3 text-[15px] sm:text-base md:text-[13.5px] lg:text-[14.5px] leading-[1.85] text-[color:var(--x-text-secondary)] md:text-white/90 md:drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]">
            fukuX（フクエックス）は、福岡のメンズエステ専用SNSです。セラピストやお店の最新投稿・出勤情報をタイムラインでチェックして、お気に入り（推し）を見つけて応援できます。利用は無料。登録しなくても閲覧できますが、登録するとフォロー・スキ・保存などの応援機能が使えるようになります。
          </p>
        </div>
      </section>

      {/* ★ 冒頭の「登録なしでも見られる／登録すると応援できる」を一目で分かるようにした比較カード。
          文言は上の冒頭文の一節をそのまま使っている（意味は足していない）。 */}
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        <li className="rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-surface)] p-4 sm:p-5 x-card">
          <span className="inline-flex items-center gap-2 text-[color:var(--x-accent)]">
            <IconEye />
            <span className="text-sm font-bold text-[color:var(--x-text-primary)]">登録なしでも</span>
          </span>
          <p className={`${P} mt-2`}>登録しなくても閲覧できます。</p>
        </li>
        <li className="x-guide-hilite rounded-2xl border bg-[color:var(--x-surface)] p-4 sm:p-5">
          <span className="x-guide-pink inline-flex items-center gap-2">
            <IconHeart />
            <span className="text-sm font-bold text-[color:var(--x-text-primary)]">登録すると</span>
          </span>
          <p className={`${P} mt-2`}>
            <span className={STRONG}>フォロー・スキ・保存などの応援機能</span>が使えるようになります。
          </p>
        </li>
      </ul>

      {/* ───────────────── STEP1：アカウント登録 ───────────────── */}
      <GroupCard>
        <GuideImage
          src="/x/guide/user/user-guide-registration.webp"
          alt="一般ユーザーのアカウント登録から開始までの流れ"
          width={1619}
          height={971}
        />

        <Step n={1} title="アカウントを登録する" />
        {/* 登録の3段階。もとの箇条書き3点をそのまま小カードにしただけ（文言は変えていない）。 */}
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          <FlowCard n={1}>
            <Link href="/x/signup" className={A}>新規登録ページ</Link>
            で、メールアドレスとパスワード（8文字以上）を入力して登録します。
          </FlowCard>
          <FlowCard n={2}>
            ログイン後の「アカウントを開設」で、種別は<span className={STRONG}>「ユーザー」</span>を選びます。
          </FlowCard>
          <FlowCard n={3}>
            @ID（英数字とアンダースコア、3〜20文字・<span className={STRONG}>あとから変更不可</span>
            <Tag>変更不可</Tag>）と表示名（30文字まで）を決めて完了です。
          </FlowCard>
        </ol>

        {/* 「本名不要・メール非公開・ニックネームでOK」は不安を減らす情報なので、盾アイコン付きの安心ボックスに。 */}
        <InfoBox icon={<IconShield />}>
          <p className={P_SM}>
            ※本名の登録は不要です。メールアドレスは他のユーザーに公開されません。ニックネームで気軽に始められます。
          </p>
        </InfoBox>
      </GroupCard>

      {/* ───────────────── STEP2〜3：タイムラインと推し探し ───────────────── */}
      <GroupCard>
        <GuideImage
          src="/x/guide/user/user-guide-discovery.webp"
          alt="タイムラインや検索からセラピストとお店を探す流れ"
          width={1586}
          height={992}
        />

        <Step n={2} title="タイムラインの見方" />
        {/* 3つのタブ。PCは3列・スマホは1列。文言はもとの箇条書きのまま。 */}
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          <IconCard icon={<IconSparkles />} title="おすすめ">
            fukuX全体の投稿が流れるメインのタイムラインです。
          </IconCard>
          <IconCard icon={<IconUsers />} title="フォロー中">
            あなたがフォローした相手の投稿だけが流れます。
          </IconCard>
          <IconCard icon={<IconStore />} title="お店">
            登録店舗の一覧です。カードをタップするとお店のプロフィールへ移動します。
          </IconCard>
        </ul>

        <hr className="my-9 h-px border-0 bg-[color:var(--x-border-strong)]" />

        <Step n={3} title="推しを見つける" />
        {/* 3つの探し方。アイコンで見分けられるようにする。 */}
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          <IconCard icon={<IconSearch />} title="検索">
            右上の🔍から、名前や@IDでセラピスト・お店を検索できます。
          </IconCard>
          <IconCard icon={<IconHash />} title="ハッシュタグ">
            投稿の「#ハッシュタグ」をタップすると、同じタグの投稿を一覧できます。
          </IconCard>
          <IconCard icon={<IconStore />} title="お店タブ">
            「お店」タブから気になるお店を見つけて、所属セラピストをチェックするのもおすすめです。
          </IconCard>
        </ul>
      </GroupCard>

      {/* ───────────────── STEP4〜6：フォロー・応援・ストーリー・出勤確認 ───────────────── */}
      <GroupCard>
        <GuideImage
          src="/x/guide/user/user-guide-support-schedule.webp"
          alt="セラピストをフォローして応援し出勤情報を確認する流れ"
          width={1693}
          height={929}
        />

        <Step n={4} title="フォロー・応援機能を使う" />
        {/* 4つの応援機能。意味が区別できるようアイコンを分ける。文言はもとの箇条書きのまま。 */}
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          <IconCard icon={<IconUserPlus />} title="フォロー">
            プロフィールの「フォロー」ボタンで、投稿を「フォロー中」タブで追えるようになります。
          </IconCard>
          <IconCard icon={<IconBell />} title="投稿通知">
            フォロー中に表示されるベルをオンにすると、その人の新しい投稿を通知でお知らせします。
          </IconCard>
          <IconCard icon={<IconHeart />} title="スキ">
            投稿のハートで「いいね」を送れます。あなたのスキが推しの励みになります。
          </IconCard>
          <IconCard icon={<IconRepost />} title="リポスト・保存">
            気に入った投稿を再共有したり、あとで見返せるように保存できます（保存した投稿はメニューの「保存した投稿」から）。
          </IconCard>
        </ul>
        {/* ★ ユーザー種別は投稿できない。ここは独立したボックスで必ず目立たせること。
            このページに投稿ボタンや投稿を促す表現を足さないこと。 */}
        <InfoBox icon={<IconEye />}>
          <p className={P}>
            ※ユーザー種別は<span className={STRONG}>「見る・応援する」専用</span>です。投稿やストーリーの発信はセラピスト・お店のアカウントで行われます。
          </p>
        </InfoBox>

        <hr className="my-9 h-px border-0 bg-[color:var(--x-border-strong)]" />

        <div className="flex flex-wrap items-start">
          <Step n={5} title="ストーリーを見る" />
          <Tag tone="indigo">24時間限定</Tag>
          <Tag>閲覧にはログインが必要</Tag>
        </div>
        <div className="mt-3 flex items-start gap-3 rounded-2xl border border-indigo-300/60 bg-[color:var(--x-inset)] p-4">
          <span className="mt-0.5 shrink-0 text-[color:var(--x-accent)]">
            <IconClock />
          </span>
          <p className={P}>
            タイムライン上部のストーリーバーに、セラピスト・お店の<span className={STRONG}>24時間限定</span>の投稿が並びます（
            <span className={STRONG}>閲覧にはログインが必要です</span>）。「今日出勤しています」などのリアルタイムな情報をチェックできます。
          </p>
        </div>

        <hr className="my-9 h-px border-0 bg-[color:var(--x-border-strong)]" />

        <div className="flex flex-wrap items-start">
          <Step n={6} title="出勤情報をチェックする" />
          {/* ★「必ず表示される」と読ませないためのラベル。断定表現に変えないこと。 */}
          <Tag tone="indigo">掲載店の所属セラピストの場合</Tag>
        </div>
        <div className="mt-3 flex items-start gap-3 rounded-2xl border border-indigo-300/60 bg-[color:var(--x-inset)] p-4">
          <span className="mt-0.5 shrink-0 text-[color:var(--x-accent)]">
            <IconCalendar />
          </span>
          <p className={P}>
            セラピストのプロフィールには、<span className={STRONG}>7日分の出勤スケジュール</span>が表示されることがあります（フクエス掲載店の所属セラピストの場合）。気になるセラピストの出勤日をチェックしてみてください。
          </p>
        </div>
      </GroupCard>

      {/* ───────────────── STEP7〜8：DM・通知・テーマ切り替え ───────────────── */}
      <GroupCard>
        <GuideImage
          src="/x/guide/user/user-guide-dm-theme.webp"
          alt="DM、通知、背景テーマ切り替えの利用イメージ"
          width={1717}
          height={916}
        />

        <Step n={7} title="DM（ダイレクトメッセージ）" />
        <ul className={`${UL} mt-3`}>
          <li>フォローしている相手とは、プロフィールのメッセージボタンからDMでやり取りできます（相手の設定によっては送れない場合があります）。</li>
          <li>DMを受け取りたくない場合は、設定の「DM受付オフ」をオンにできます。</li>
        </ul>

        <hr className="my-9 h-px border-0 bg-[color:var(--x-border-strong)]" />

        <Step n={8} title="通知・テーマ切替" />
        {/* ベルと封筒は取り違えやすいので、並べた比較カードにする（もとの1文を2つに分けただけ）。 */}
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          <IconCard icon={<IconBell />} title="ベル">
            画面右上のベルに、スキした投稿への反応や新着投稿などの通知が届きます。
          </IconCard>
          <IconCard icon={<IconMail />} title="封筒">
            封筒アイコンにはDMの未読件数が表示されます。
          </IconCard>
        </ul>
        {/* 背景テーマは実物と同じ2色を小さく並べて見せる。切り替え機能そのものは触っていない。 */}
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] p-4">
          <span className="mt-0.5 flex shrink-0 gap-1.5" aria-hidden>
            <span
              className="block w-6 h-6 rounded-lg border border-white/25"
              style={{ background: 'linear-gradient(160deg,#2a1760 0%,#4c1d95 55%,#7c3aed 100%)' }}
            />
            <span className="block w-6 h-6 rounded-lg border border-slate-300 bg-white" />
          </span>
          <p className={P}>
            メニュー下部の切替で、背景を<span className={STRONG}>「グラデーション⇄白」</span>のお好みのテーマに変更できます。
          </p>
        </div>
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
            'セラピスト・お店・他のユーザーへの誹謗中傷、いやがらせはおやめください。',
            '規定外のサービスを求めるDM等の送信は禁止です。',
            '投稿画像の無断転載・スクリーンショットの拡散はおやめください。',
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
        <h2 className="flex items-center gap-2.5 text-lg sm:text-xl font-bold text-[color:var(--x-text-primary)]">
          <span className="text-[color:var(--x-accent)]">
            <IconChat />
          </span>
          困ったときは
        </h2>
        <p className={`${P} mt-3`}>
          フクエス運営事務局（
          <a href="mailto:info@fukues.com" className={A}>info@fukues.com</a>
          ）までお気軽にご連絡ください。
        </p>
      </GroupCard>
    </div>
  );
}
