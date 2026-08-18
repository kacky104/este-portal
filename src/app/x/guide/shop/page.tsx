import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';

// お店向け使い方ガイド。静的コンテンツのみ・データ取得なし。
// 目的: 基本操作の説明に加え、認証バッジ→フクエス掲載の順で自然に掲載申込へ誘導する（非掲載店を否定しないトーン）。
// 数値は実装の定数と一致: @ID=3〜20字 / 表示名30字・自己紹介160字・地域バッジ最大2 /
//   投稿=500字・画像4枚 / お店カード画像=認証+4・バナー設置+4（0/4/8） / ストーリー=24時間
//
// ★ 2026-08-18（第22便）画像装飾:
//   STEP1〜10 が1枚の長いカードに続いていたのを、内容別の4グループカードへ分けて先頭に説明画像を置いた。
//   文章・リンク・STEPの番号と順番は1文字も変えていない（レイアウトのために短くもしていない）。
//   画像は public/x/guide/shop/ の5枚。渡された元PNGは計8.3MBあったので WebP(q88) に変換し計0.41MBにした。
//   ★ 画像に文字は焼き込まない。見出し・説明文は必ずHTMLで出すこと（差し替え時も同じ）。
//
// ★ 幅について: /x の <main> は layout.tsx の max-w-2xl（672px）が全ページ共通。
//   このページだけ画像を大きく見せたいので、いちばん外の <div className="x-main-wide"> を目印にして
//   x-theme.css 側で 900px まで広げている（opt-in）。この目印を消すと 672px に戻る。
//   ★ layout.tsx は触っていない。他の /x ページ（タイムライン・プロフィール・DM 等）は 672px のまま。
//
// ★ 色について: ピンクの差し色は Tailwind の text-pink-300 等を直接使わず、x-theme.css の
//   .x-guide-pink / .x-guide-tag / .x-guide-hilite を使う。白テーマ（背景が白）に切り替えたとき、
//   明るいピンクのままだと本文も枠線もほとんど見えなくなるため、CSS側で濃いピンクへ差し替えている。
export const metadata: Metadata = {
  title: 'お店向け使い方ガイド｜fukuX(フクエックス)',
  description:
    '福岡メンズエステ専用SNS「fukuX(フクエックス)」のお店向け使い方ガイド。アカウント開設から認証バッジ、セラピストの所属管理、お店カード画像、求人オファーの送り方、フクエス掲載店だけの連携機能まで、わかりやすく説明します。',
  alternates: { canonical: '/x/guide/shop' },
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

// グループカード。従来の .x-card（白テーマで白面＋淡枠・影なしに戻る）をそのまま使う。
function GroupCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="x-card mt-8 sm:mt-10 p-5 sm:p-7 rounded-[22px] bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)]">
      {children}
    </section>
  );
}

// グループ先頭の説明画像。幅100%・高さ自動・角丸18px・薄い枠線と控えめな影（指示の共通仕様）。
// sizes は実寸から逆算: 932px以上=812px（main 900 − px-4の32 − カード p-7 の56）／
//   640〜931px=100vw−88px／639px以下=100vw−72px（カードが p-5 になるぶん狭い）。
// loading は既定のまま＝遅延読み込み（先読みはヒーローだけ）。
function GuideImage({
  src,
  alt,
  width,
  height,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
}) {
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
        accent ? 'text-lg sm:text-xl' : 'text-base sm:text-lg'
      }`}
    >
      <span
        className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-sm font-black shrink-0 mt-0.5"
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

// 認証バッジを連想させるチェック丸。STEP4 の見出し横と、STEP10 のメリット一覧で使う。
function CheckMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`w-5 h-5 shrink-0 ${className}`} fill="currentColor">
      <path d="M12 1.6l2.6 2 3.2-.3 1 3.1 2.8 1.6-1.2 3 1.2 3-2.8 1.6-1 3.1-3.2-.3-2.6 2-2.6-2-3.2.3-1-3.1L2.4 15l1.2-3-1.2-3 2.8-1.6 1-3.1 3.2.3 2.6-2z" />
      <path d="M10.7 15.6l-3.1-3.1 1.3-1.3 1.8 1.8 4.4-4.4 1.3 1.3-5.7 5.7z" fill="#fff" />
    </svg>
  );
}

// 認証店だけが使える機能につける色付きラベル。色は x-theme.css の .x-guide-tag（両テーマ対応）。
function OnlyVerified() {
  return (
    <span className="x-guide-tag ml-2 mt-1 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold whitespace-nowrap">
      認証店のみ
    </span>
  );
}

// STEP10 のメリット小カード（PC 2列 / スマホ 1列）。
function Merit({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] p-4">
      <span className="mt-0.5 shrink-0 text-[color:var(--x-accent)]">{icon}</span>
      <span className={P_SM}>{children}</span>
    </li>
  );
}

const ICON = 'w-5 h-5 shrink-0';

export default function XShopGuidePage() {
  return (
    // ★ この目印（x-main-wide）で main が 900px に広がる。x-theme.css の #x-root main:has(.x-main-wide) 参照。
    <div className="x-main-wide pb-2">
      {/* ───────────────── ヒーロー ─────────────────
          PC: 画像を 5:2（元画像 1983×793 がちょうど 5:2）で大きく出し、人物のいない左側に
              見出しと冒頭文を重ねる。文字が埋もれないよう左側だけに黒紫のグラデを敷く。
          SP: 重ねると人物と文字がぶつかるので、画像を切らずに丸ごと出し、その下に見出しと冒頭文を置く。
          ★ 文字色は md 以上だけ白で固定する。オーバーレイの上なのでテーマ変数のままだと
            白テーマで黒文字になり、紫の画像の上で読めなくなる（md 未満はテーマ変数のまま）。
          ★ h1 はDOM上に1つだけ。CSSで位置を変えているので、見出しが二重に出ることはない。 */}
      <section className="relative mt-5">
        <div className="x-guide-hero relative overflow-hidden rounded-[22px] border border-indigo-400/45">
          <Image
            src="/x/guide/shop/shop-guide-hero.webp"
            alt="スマートフォンでfukuXを操作する店舗スタッフ"
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
                'linear-gradient(90deg, rgba(23,10,54,0.90) 0%, rgba(23,10,54,0.78) 24%, rgba(23,10,54,0.42) 46%, rgba(23,10,54,0) 64%)',
            }}
          />
        </div>

        <div className="mt-4 md:mt-0 md:absolute md:inset-y-0 md:left-0 md:z-10 md:flex md:w-[47%] md:flex-col md:justify-center md:pl-8 md:pr-4 lg:pl-11">
          {/* ★ md（768〜1023px）だけ 26px に落とす。30px のままだと「お店向け使い方ガイド」10文字＝300px が
              左カラムの実寸298pxをわずかに超えて「ガイ／ド」と割れる（768px で実測）。 */}
          <h1 className="text-2xl sm:text-3xl md:text-[26px] lg:text-[30px] font-bold text-[color:var(--x-text-primary)] md:text-white md:drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">
            お店向け使い方ガイド
          </h1>
          <p className="mt-3 text-[15px] sm:text-base md:text-[14.5px] lg:text-[15px] leading-[1.85] text-[color:var(--x-text-secondary)] md:text-white/90 md:drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]">
            fukuX（フクエックス）は、福岡のメンズエステ専用SNSです。お店の最新情報やセラピストの魅力をタイムラインで発信し、お客様と直接つながれます。利用は無料。このガイドでは、アカウント開設から店舗運用のコツまでを順番に説明します。
          </p>
        </div>
      </section>

      {/* ヒーロー直下の強調ボックス（もとは冒頭の2段落目）。 */}
      <div className="x-guide-hilite mt-5 rounded-2xl border bg-[color:var(--x-surface)] p-4 sm:p-5">
        <p className={P}>
          fukuXでは、運営の認証を受けたお店と、そのお店に所属するセラピストを優遇して表示しています。
          <span className={STRONG}>認証バッジの取得（STEP4）が店舗運用のカギ</span>です。
        </p>
      </div>

      {/* ───────────────── STEP1〜3：アカウント準備 ───────────────── */}
      <GroupCard>
        <GuideImage
          src="/x/guide/shop/shop-guide-onboarding.webp"
          alt="店舗アカウント登録からプロフィール完成までの流れ"
          width={1619}
          height={972}
        />
        {/* 画像と文章の両方から順序が分かるように、画像の直下に流れを一行で置く（画像には焼き込まない）。 */}
        <p className="mb-7 text-[15px] sm:text-base font-bold text-[color:var(--x-text-primary)] leading-[1.7]">
          登録 <span className="text-[color:var(--x-accent)]">→</span> 店舗種別・@ID設定{' '}
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
        <p className={NOTE}>※メールアドレスは他のユーザーに公開されません。</p>

        <div className={STEP_GAP}>
          <Step n={2} title="アカウントを開設する（種別・@ID・表示名）" />
          <ol className={`${OL} mt-3`}>
            <li>ログイン後の「アカウントを開設」で、種別は<span className={STRONG}>「お店」</span>を選びます。</li>
            <li>
              <span className={STRONG}>@ID</span>（英数字とアンダースコア、3〜20文字）を決めます。
              <span className={STRONG}>あとから変更できない</span>ので、店名にちなんだ分かりやすいものがおすすめです。
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
            <li>アバター画像（店舗ロゴ等）・ヘッダー画像（横長にクロップされます）</li>
            <li>自己紹介（160文字まで）・外部リンク（お店のホームページ等）</li>
            <li>地域バッジ（最大2つ）。プロフィールの@ID横とお店タブのカードに表示されます。</li>
          </ul>
        </div>
      </GroupCard>

      {/* ───────────────── STEP4〜6：認証と店舗運用 ───────────────── */}
      <GroupCard>
        <GuideImage
          src="/x/guide/shop/shop-guide-verification.webp"
          alt="認証バッジから所属管理と店舗カード機能へ広がるイメージ"
          width={1619}
          height={972}
        />

        {/* STEP4 はこのページで最重要。ピンク〜紫の細枠で囲み、チェックアイコンを添えて他より強く見せる。 */}
        <div className="x-guide-hilite rounded-[20px] border bg-[color:var(--x-inset)] p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <CheckMark className="x-guide-pink" />
            <span className="x-guide-pink text-xs font-black tracking-wider">このページで最重要</span>
          </div>
          <Step n={4} title="認証バッジを受ける（店舗運用のカギ）" accent />
          <p className={`${P} mt-3`}>
            運営の審査で認証されたお店には<span className={STRONG}>認証バッジ</span>が付き、次の機能が使えるようになります。
          </p>
          <ul className={`${UL} mt-3`}>
            <li>セラピストの所属管理（@ID検索で所属申請 → STEP5）</li>
            <li>お店カード画像の設定（お店タブに表示 → STEP6）</li>
            <li>求人オファーの送信（→ STEP8）</li>
          </ul>
          {/* 掲載店誘導の核心部分。非掲載店を否定せず「掲載店はスムーズ」の対比で伝える。
              ★ 通常本文と混ざらないよう、独立した情報ボックスに分けてある。 */}
          <div className="mt-5 rounded-2xl border border-indigo-300/60 bg-[color:var(--x-surface)] p-4">
            <p className="text-sm sm:text-base font-bold text-[color:var(--x-accent)] mb-1.5">💡 認証をスムーズに受けるには</p>
            <p className={P}>
              <span className={STRONG}>フクエス掲載店は、実在確認が済んでいるため原則スムーズに認証されます。</span>
              フクエスに掲載のないお店も認証をお受けしていますが、なりすまし防止のため個別の実在確認が必要となり、お時間をいただきます。フクエスへの掲載は
              <Link href="/listing" className={A}>掲載について</Link>
              または
              <a href="mailto:info@fukues.com" className={A}>info@fukues.com</a>
              までお気軽にお問い合わせください。
            </p>
          </div>
        </div>

        <div className={STEP_GAP}>
          <Step n={5} title="セラピストの所属管理" />
          <p className={`${P} mt-3`}>
            認証後、ドロワーメニューの「店舗管理」から所属申請ができます。
          </p>
          <ol className={`${OL} mt-3`}>
            <li>在籍セラピストにfukuXのアカウント（セラピスト種別）を作ってもらい、@IDを教えてもらいます。</li>
            <li>店舗管理ページで@IDを検索し、所属申請を送ります。</li>
            <li>セラピスト本人が承認すると所属が成立し、プロフィールに「◯◯所属」バッジが表示されます。</li>
          </ol>
          <ul className={`${UL} mt-3`}>
            <li>所属したセラピストはストーリーを投稿できるようになり、優遇表示の対象になります。</li>
            <li>退店時は店舗管理から所属を解除できます（セラピスト側からも解除できます）。</li>
            <li>実際に在籍していないセラピストへの所属申請は禁止です。</li>
          </ul>
        </div>

        <div className={STEP_GAP}>
          <Step n={6} title="お店タブとお店カード画像" />
          <p className={`${P} mt-3`}>
            タイムラインの「お店」タブには、fukuXに登録したお店のカードが表示されます。カードに画像（主にセラピスト画像）を設定できる枚数は次のとおりです。
          </p>
          {/* 枚数は問い合わせの多い数字なので、比較カードにして探しやすくした（文言は本文のまま）。 */}
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            <li className="rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] p-4">
              <p className="text-3xl font-black leading-none text-[color:var(--x-accent)]">
                4<span className="text-base font-bold ml-0.5">枚</span>
              </p>
              <p className={`${P_SM} mt-2`}>認証バッジのあるお店：4枚（4列×1段）</p>
            </li>
            <li className="x-guide-hilite rounded-2xl border bg-[color:var(--x-inset)] p-4">
              <p className="x-guide-pink text-3xl font-black leading-none">
                8<span className="text-base font-bold ml-0.5">枚</span>
              </p>
              <p className={`${P_SM} mt-2`}>
                さらに貴店サイトに
                <Link href="/x/banner" className={A}>リンクバナー</Link>
                を設置いただくと＋4枚の<span className={STRONG}>合計8枚（4列×2段）</span>に拡大できます（設置後に
                <Link href="/x/banner/report" className={A}>報告フォーム</Link>
                からご連絡ください）。
              </p>
            </li>
          </ul>
          <p className={NOTE}>※画像の設定は設定ページの「お店カード画像」から。表示順はお店タブで30分ごとに入れ替わります。</p>
        </div>
      </GroupCard>

      {/* ───────────────── STEP7〜9：発信・求人・DM ───────────────── */}
      <GroupCard>
        <GuideImage
          src="/x/guide/shop/shop-guide-communication.webp"
          alt="投稿、求人オファー、DMでユーザーとつながる流れ"
          width={1683}
          height={935}
        />

        <Step n={7} title="投稿・ストーリーで発信する" />
        <ul className={`${UL} mt-3`}>
          <li>画面右下の「＋」ボタンから投稿できます。本文は500文字まで、画像は4枚まで（JPEG・PNG・WebP、各5MB以下）。「#ハッシュタグ」も使えます。</li>
          <li>ストーリー（24時間で消える投稿）も利用できます。イベントや空き枠のお知らせ等、気軽な発信に便利です。</li>
          <li>新規入店・イベント・割引情報などをこまめに発信すると、フォロワーとの接点が増えます。</li>
        </ul>

        {/* 3機能が地続きに見えないよう、STEP の間に薄い区切り線と広い余白を入れる。 */}
        <hr className="my-9 h-px border-0 bg-[color:var(--x-border-strong)]" />

        <div className="flex flex-wrap items-start">
          <Step n={8} title="求人オファーを送る（認証店のみ）" />
          <OnlyVerified />
        </div>
        <p className={`${P} mt-3`}>
          ドロワーメニューの「求人オファーリスト」から、オファー受付中の未所属セラピストの一覧を見られます。気になるセラピストには、フォロー関係がなくても直接メッセージを送れます。PR文や希望エリアを参考に、貴店に合う人材へアプローチしてください。
        </p>

        <hr className="my-9 h-px border-0 bg-[color:var(--x-border-strong)]" />

        <Step n={9} title="DM・通知" />
        <ul className={`${UL} mt-3`}>
          <li>どちらか一方がフォローしている相手と、プロフィールのメッセージボタンからDMできます。</li>
          <li>画面右上のベルに通知が、封筒アイコンにDMの未読件数が表示されます。</li>
          <li>DMを受け取りたくない場合は、設定の「DM受付オフ」をオンにできます。</li>
        </ul>
      </GroupCard>

      {/* ───────────────── STEP10：フクエス連携（独立カード） ───────────────── */}
      <GroupCard>
        <GuideImage
          src="/x/guide/shop/shop-guide-integration.webp"
          alt="フクエス店舗ページとfukuXプロフィールの連携イメージ"
          width={1619}
          height={971}
        />

        <Step n={10} title="フクエス掲載店なら、さらに広がります" />
        <p className={`${P} mt-3`}>
          fukuXはどのお店も無料でご利用いただけますが、ポータルサイト「フクエス」に掲載中のお店は、fukuXとの連携でさらに多くの機能をご利用いただけます。
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          <Merit
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 9h18M8 14h8" />
              </svg>
            }
          >
            店舗ページ（店舗情報・料金・コース・写真・口コミ）でお店の魅力をしっかり紹介
          </Merit>
          <Merit
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden>
                <rect x="3" y="4" width="18" height="17" rx="2" />
                <path d="M8 2v4M16 2v4M3 10h18M12 14v3" />
              </svg>
            }
          >
            フクエスで登録した出勤情報が、所属セラピストのfukuXプロフィールに7日分自動表示
          </Merit>
          <Merit
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden>
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
            }
          >
            写メ日記・お知らせの配信（お知らせはフクエスTOPの「店舗新着情報」にも掲載）・クーポン発行
          </Merit>
          <Merit
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden>
                <rect x="2" y="7" width="20" height="14" rx="2" />
                <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            }
          >
            求人情報の掲載（フクエスワーク）
          </Merit>
          <Merit icon={<CheckMark className={ICON} />}>
            実在確認済みとなるため、fukuXの認証バッジも原則スムーズに付与
          </Merit>
        </ul>

        <div className="x-guide-hilite mt-6 rounded-2xl border bg-[color:var(--x-inset)] p-4 sm:p-5">
          <p className="x-guide-pink text-base sm:text-lg font-bold mb-1.5">🌸 掲載のご相談はお気軽に</p>
          <p className={P}>
            掲載内容・条件のご案内は
            <Link href="/listing" className={A}>掲載について</Link>
            をご覧いただくか、フクエス運営事務局（
            <a href="mailto:info@fukues.com" className={A}>info@fukues.com</a>
            ）までお問い合わせください。
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
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            '虚偽の情報での登録・運用、他店へのなりすましは禁止です。',
            '実際に在籍していないセラピストへの所属申請・承認は禁止です。',
            '規定外のサービスを連想させる投稿・DMはできません。',
            '権利のない画像（他店・他人の画像等）の使用は禁止です。',
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
