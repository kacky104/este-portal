import type { Metadata } from 'next';
import { MEMBER_EMAIL_NOTE } from '@/lib/castInviteNote';
import { POINT_FIRST_REVIEW, POINT_SIGNUP, POINT_USE_UNIT, POINT_USE_YEN, POINT_VISIT, POINT_VISIT_NOTE } from '@/lib/points';
import Link from 'next/link';
import Image from 'next/image';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { NotificationBell } from '@/app/components/NotificationBell';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { Breadcrumb } from '@/app/components/Breadcrumb';
import { PageHero } from '@/app/components/PageHero';
import { fetchPageHero } from '@/app/lib/pageHero';
import { AdBanner } from '@/app/components/AdBanner';
import { fetchActiveAdBanners } from '@/app/lib/adBanners';
import { fetchThemeWallpapers } from '@/app/lib/ranking';
import { getTheme, breadcrumbCurrentColor } from '@/app/lib/themes';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { JoinCta } from './JoinCta';
import { SiteFooter } from '@/app/components/SiteFooter';

const TITLE = '無料会員登録のご案内｜福岡メンズエステ【フクエス】';
const DESCRIPTION =
  'フクエスの会員登録は無料。今なら登録で50pt・はじめての口コミで50pt・加盟店のご来店1回で50pt。1,000ptで1,000円引き（お店のクーポンと併用OK）。お気に入りの保存・VIPレター・新着通知・口コミ投稿も。メールアドレスとパスワードだけで登録できます。';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/join' },
  // Next の metadata は浅いマージ＝openGraph を部分指定すると root layout の og が丸ごと消える
  // （og:image も消える）。そのため images まで全て明示する。
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/join',
    siteName: 'フクエス',
    type: 'website',
    images: [{ url: '/ogp.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/ogp.png'] },
};

// ISR：ヒーロー画像・テーマ壁紙（pink）・ルックバナーを反映するため定期再生成する。
// ログイン状態でページ内容を出し分けないため（CTA だけクライアント側で差し替え）、動的化は不要。
export const revalidate = 300;

// 会員特典。実装済みの機能だけを載せる（未実装の予告は書かない）。
// リンク先は未ログインでも見られるページ、もしくはログインへリダイレクトされる会員ページ。
// ★ 第1558便（2026-10-18・カッキーさん）: image があるものは、線画のアイコンの代わりに画像のバッジを出す（public/join/）。
const BENEFITS: { title: string; body: string; icon: 'point' | 'bookmark' | 'letter' | 'bell' | 'history' | 'review' | 'user'; image?: string }[] = [
  {
    icon: 'point',
    image: '/join/benefit-point.webp',
    title: 'フクエスポイントが貯まる',
    body: '会員登録・はじめての口コミ・加盟店のご来店でポイントが貯まり、1,000ptで1,000円引き。お店のクーポンとも併用できます。',
  },
  {
    icon: 'bookmark',
    image: '/join/benefit-bookmark.webp',
    title: 'お気に入りの保存',
    body: '気になる店舗とセラピストをまとめて保存。ログインしておけば、スマホでもパソコンでも同じ一覧を開けます。',
  },
  {
    icon: 'letter',
    image: '/join/benefit-letter.webp',
    title: 'VIPレターが届く',
    body: '保存しているお店から、会員だけに届く特別メッセージを受け取れます。受信ボックスはヘッダーのアイコンから。',
  },
  {
    icon: 'bell',
    image: '/join/benefit-bell.webp',
    title: '新着・クーポンの通知',
    body: '保存したお店の新着情報やクーポンをまとめてチェック。気づかないうちに終わっていた、を防げます。',
  },
  {
    icon: 'history',
    image: '/join/benefit-history.webp',
    title: '閲覧履歴が残る',
    body: '最近見た店舗・セラピストを自動で記録。「あのお店なんて名前だったか」を探し直す手間がなくなります。',
  },
  {
    icon: 'review',
    title: '口コミの投稿',
    body: '担当セラピストを指名して口コミを投稿できます。投稿は運営の確認後に公開され、次の人の店選びの参考になります。',
  },
  {
    icon: 'user',
    title: 'ニックネームで参加',
    body: '口コミに表示されるのは自分で決めたニックネームだけ。本名や電話番号の登録は必要ありません。',
  },
];

// 特典カードのアイコン（線画・共通トーン）。
function BenefitIcon({ name }: { name: (typeof BENEFITS)[number]['icon'] }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'point':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.5 16.5V7.5h3.2a2.6 2.6 0 0 1 0 5.2H9.5" /></svg>;
    case 'bookmark':
      return <svg {...common}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>;
    case 'letter':
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>;
    case 'bell':
      return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
    case 'history':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case 'review':
      return <svg {...common}><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z" /></svg>;
    case 'user':
      return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
  }
}

// 登録の流れ（3ステップ）。
const STEPS: { no: string; title: string; body: string }[] = [
  { no: '01', title: 'メールアドレスとパスワードを入力', body: '登録フォームで入力するのはこの2つだけ。パスワードは英字と数字を含む8文字以上でお願いします。メールアドレスは公開されず、宣伝のメールが届くこともありません。' },
  { no: '02', title: '届いた確認メールのリンクを開く', body: '入力したメールアドレス宛に確認メールが届きます。本文のリンクを開くと登録が完了します。' },
  { no: '03', title: 'ニックネームを決めて利用開始', body: '初回ログイン後にニックネームを設定すれば準備完了。保存も口コミ投稿もすぐに使えます。' },
];

// よくある質問。
const FAQS: { q: string; a: string }[] = [
  { q: 'フクエスポイントはどうやって貯まりますか？', a: `会員登録で${POINT_SIGNUP}pt、はじめての口コミ（運営の承認後）で${POINT_FIRST_REVIEW}pt、フクエスポイント加盟店のご来店1回で${POINT_VISIT}pt（お部屋のQRコードを読んで受け取り・1日1回まで）が貯まります（キャンペーン中）。有効期限は最後に貯めた日から1年です。` },
  { q: 'お店のクーポンと一緒に使えますか？', a: `使えます。フクエスポイントの${POINT_USE_YEN.toLocaleString()}円引きは、お店のクーポンとは別の割引です（1回のご来店で${POINT_USE_YEN.toLocaleString()}円まで）。加盟店で、ご予約のときに「フクエスポイントを使います」とお伝えください。` },
  { q: '登録にお金はかかりますか？', a: '一切かかりません。会員登録・利用ともに無料です。有料プランや課金要素はありません。' },
  { q: '本名や電話番号は必要ですか？', a: '必要ありません。登録に使うのはメールアドレスとパスワードだけです。サイト上に表示されるのは自分で決めたニックネームのみで、メールアドレスが他の利用者に見えることはありません。' },
  // ★ 第1470便（カッキーさん）: メールアドレスの扱い（安心して登録してもらう）
  { q: '登録したメールアドレスに宣伝のメールは届きますか？', a: MEMBER_EMAIL_NOTE },
  { q: 'お店に自分の情報が伝わりますか？', a: '伝わりません。店舗側から見えるのは口コミに表示されるニックネームだけで、メールアドレスや保存の状況が店舗に渡ることはありません。' },
  { q: '登録前に保存したお気に入りはどうなりますか？', a: 'そのまま引き継がれます。端末に保存されているお気に入りは、ログインした時点で自動的にアカウントへ移ります。' },
  { q: '退会はできますか？', a: 'できます。マイページの「プロフィール」からご自身の操作でいつでも退会でき、アカウントと保存データは削除されます（元に戻すことはできません）。投稿済みの口コミは他の方の店舗選びの参考情報として残りますが、表示名は「ゲスト」に変わり、あなたのアカウントとは結びつかなくなります。なお、メンズエステ専用SNS「fukuX」のアカウントをお持ちの場合は、ログインが共通のため、先に fukuX 側で削除してから退会してください。' },
  { q: '年齢の制限はありますか？', a: '本サイトは18歳未満の方はご利用いただけません。会員登録も18歳以上の方に限らせていただきます。' },
];

// ★ 第1451便: フクエスポイントのご案内（会員だけの特典）。数字は lib/points.ts の値（変えるとここも変わる）。
const GRAD = 'linear-gradient(95deg,#FB923C,#DB2777)';
function PointsShowcase() {
  const earns: { label: string; pt: number; note: string; tag?: string }[] = [
    { label: '会員登録', pt: POINT_SIGNUP, note: '確認メールのリンクで登録が終わったとき', tag: POINT_VISIT_NOTE },
    { label: 'はじめての口コミ', pt: POINT_FIRST_REVIEW, note: '運営の承認後', tag: POINT_VISIT_NOTE },
    { label: 'ご来店1回ごと', pt: POINT_VISIT, note: 'フクエスポイント加盟店で・1日1回まで', tag: POINT_VISIT_NOTE },
  ];
  const visitsToGo = Math.max(0, Math.ceil((POINT_USE_UNIT - POINT_SIGNUP - POINT_FIRST_REVIEW) / POINT_VISIT));
  return (
    <section aria-label="フクエスポイント" className="mb-6">
      <div className="relative overflow-hidden rounded-3xl p-[2px] shadow-lg shadow-pink-500/10" style={{ background: GRAD }}>
        <div className="rounded-[22px] bg-white px-4 py-6 sm:px-8 sm:py-8">
          <p className="text-center text-[11px] font-bold tracking-[0.3em] text-pink-500">MEMBER ONLY</p>
          <h2 className="mt-1 text-center text-xl font-black text-slate-800 sm:text-2xl">会員だけの「フクエスポイント」</h2>

          {/* いちばん大きく: 1,000pt で 1,000円引き・クーポンと併用OK */}
          <div className="mt-4 text-center">
            <p className="font-black leading-tight">
              <span className="text-[40px] sm:text-[56px]" style={{ background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{POINT_USE_UNIT.toLocaleString()}pt</span>
              <span className="mx-1 text-lg text-slate-700 sm:text-2xl">で</span>
              <span className="text-[40px] sm:text-[56px]" style={{ background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{POINT_USE_YEN.toLocaleString()}円引き</span>
            </p>
            <p className="mt-2 inline-block rounded-full bg-amber-100 px-4 py-1.5 text-[13px] font-black text-amber-800 sm:text-sm">
              お店のクーポンと<span className="text-rose-600">併用OK</span>！ クーポンとは別に {POINT_USE_YEN.toLocaleString()}円引き
            </p>
          </div>

          {/* 貯め方 3つ */}
          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            {earns.map((e) => (
              <li key={e.label} className="rounded-2xl border border-pink-100 bg-gradient-to-b from-pink-50 to-white px-4 py-4 text-center">
                <p className="text-sm font-bold text-slate-700">{e.label}で</p>
                <p className="mt-0.5 font-black leading-none">
                  <span className="text-[40px]" style={{ background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{e.pt}</span>
                  <span className="ml-0.5 text-lg text-pink-600">pt</span>
                </p>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-500">{e.note}</p>
                {e.tag && <p className="mt-1 text-[11px] font-bold text-pink-600">（{e.tag}）</p>}
              </li>
            ))}
          </ul>

          {/* 例 */}
          <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-center text-[13px] leading-relaxed text-slate-600">
            たとえば… <b>登録 {POINT_SIGNUP}pt ＋ 口コミ {POINT_FIRST_REVIEW}pt ＋ ご来店 {visitsToGo}回</b> で <b className="text-pink-600">{POINT_USE_YEN.toLocaleString()}円引き</b>
          </p>

          {/* 定期的なキャンペーン */}
          <p className="mt-4 flex items-center justify-center gap-2 text-center text-[13px] font-bold text-slate-700 sm:text-sm">
            <span aria-hidden className="text-lg">🎉</span>
            ほかにも、ポイントが貯まるキャンペーンを定期的に行います
          </p>

          <p className="mt-4 text-center text-[11.5px] leading-relaxed text-slate-500">
            ご来店のポイントが貯まる・使えるのは「フクエスポイント加盟店」です。使うときは、ご予約のときにお伝えください（1回のご来店で{POINT_USE_YEN.toLocaleString()}円まで）。有効期限は最後に貯めた日から1年。
            <Link href="/points" className="ml-1 font-bold text-pink-600 underline">加盟店・くわしく</Link>
          </p>
        </div>
      </div>
    </section>
  );
}

export default async function JoinPage() {
  const [hero, wallpapers, adBanners] = await Promise.all([
    fetchPageHero('join'),
    fetchThemeWallpapers(),
    fetchActiveAdBanners(),
  ]);

  // /therapists・/reviews と同方式：テーマ壁紙をテーマ色の半透明オーバーレイ越しに敷く。
  // 会員まわりの既存UI（マイページ・ログイン）がピンク系のため pink を使う。
  const theme = getTheme('pink');
  const wallpaperUrl = wallpapers[theme.key] ?? null;
  const bgStyle = {
    backgroundColor: theme.bg,
    ...(wallpaperUrl
      ? {
          backgroundImage: `linear-gradient(${theme.bg}D9, ${theme.bg}D9), url(${wallpaperUrl})`,
          backgroundSize: 'cover' as const,
          backgroundPosition: 'center' as const,
        }
      : {}),
  };

  return (
    <div className="min-h-screen text-slate-900">
      {/* 背景：pink テーマ壁紙を固定レイヤーで敷く（モバイルの fixed 無視対策で -z-10 の固定要素にする）。 */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgStyle} />

      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-1 sm:gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu /><HamburgerMenu />
          </div>
        </div>
      </header>
      <SiteNoticeBanner />

      <main className="max-w-5xl mx-auto px-4 py-6">
        <Breadcrumb current="会員登録について" currentColor={breadcrumbCurrentColor(theme.key)} />
        <PageHero url={hero} alt="会員登録について" fullBleedMobile />

        {/* ─── 大見出し（神秘的レイアウト／/therapists と同流儀） ─── */}
        <div className="my-8 sm:my-10 text-center">
          <p className="text-[11px] tracking-[0.35em] font-semibold text-pink-500/80">FUKUES MEMBER</p>
          <h1 className="mt-2 text-2xl sm:text-4xl font-black tracking-[0.06em] bg-gradient-to-r from-orange-500 via-pink-600 to-fuchsia-600 bg-clip-text text-transparent drop-shadow-[0_1px_10px_rgba(236,72,153,0.25)]">
            フクエスの無料会員登録
          </h1>
          <div className="mx-auto mt-4 h-px w-24 bg-gradient-to-r from-transparent via-pink-400/70 to-transparent" />
          <p className="mx-auto mt-4 max-w-md text-xs sm:text-sm leading-relaxed text-slate-600">
            <b className="text-pink-600">ポイントが貯まって、1,000円引き。</b><br />お気に入りの保存・VIPレター・新着通知・口コミ投稿も、メールアドレスだけで
          </p>
        </div>

        {/* ★ 第1451便: フクエスポイント（会員だけの特典・目立つように CTA の上に） */}
        <PointsShowcase />

        {/* ─── CTA（ログイン状態でボタンだけ差し替わる） ─── */}
        <JoinCta />

        {/* 細い広告バナー（公開中からランダム1枚） */}
        <AdBanner banners={adBanners} />

        {/* ─── 会員特典 ─── */}
        <section className="mt-10 sm:mt-12">
          <h2 className="flex items-center gap-2 text-base sm:text-lg font-bold text-slate-800 mb-4">
            会員になるとできること
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((b) => (
              <div
                key={b.title}
                className="rounded-2xl border border-pink-100 bg-white/90 backdrop-blur-sm p-4 sm:p-5 shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  {b.image ? (
                    <Image src={b.image} alt="" width={40} height={40} className="flex-shrink-0 w-10 h-10 object-contain" />
                  ) : (
                    <span className="flex-shrink-0 w-9 h-9 rounded-xl bg-pink-50 border border-pink-100 text-pink-500 flex items-center justify-center">
                      <BenefitIcon name={b.icon} />
                    </span>
                  )}
                  <p className="text-sm font-bold text-slate-800">{b.title}</p>
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-slate-500">{b.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── 登録の流れ ─── */}
        <section className="mt-10 sm:mt-12">
          <h2 className="flex items-center gap-2 text-base sm:text-lg font-bold text-slate-800 mb-4">
            登録の流れ
          </h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li
                key={s.no}
                className="relative rounded-2xl border border-pink-100 bg-white/90 backdrop-blur-sm p-4 sm:p-5 shadow-sm"
              >
                <span
                  className="text-[26px] font-black leading-none bg-gradient-to-r from-orange-400 to-pink-500 bg-clip-text text-transparent"
                  aria-hidden
                >
                  {s.no}
                </span>
                <p className="mt-1.5 text-sm font-bold text-slate-800">{s.title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{s.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
            確認メールが届かない場合は、迷惑メールフォルダをご確認ください。それでも見当たらないときは
            <Link href="/contact" className="text-pink-600 font-medium hover:underline mx-1">お問い合わせ</Link>
            からご連絡ください。
          </p>
        </section>

        {/* ─── 安心してご利用いただくために ─── */}
        <section className="mt-10 sm:mt-12">
          <h2 className="flex items-center gap-2 text-base sm:text-lg font-bold text-slate-800 mb-4">
            プライバシーについて
          </h2>
          <div className="rounded-2xl border border-pink-100 bg-white/90 backdrop-blur-sm p-5 shadow-sm">
            <ul className="space-y-2.5 text-xs sm:text-sm leading-relaxed text-slate-600">
              <li className="flex gap-2">
                <span aria-hidden className="text-pink-500 flex-shrink-0">●</span>
                登録に必要なのはメールアドレスとパスワードだけ。本名・電話番号・住所はいただきません。
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="text-pink-500 flex-shrink-0">●</span>
                サイト上に表示されるのはニックネームのみで、メールアドレスが他の利用者や店舗に見えることはありません。
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="text-pink-500 flex-shrink-0">●</span>
                保存した店舗・セラピストの内容が店舗側に伝わることはありません。
              </li>
              {/* テキストとリンクは1つの span にまとめる。flex の直下に置くと
                  「文字列」「リンク」「文字列」がそれぞれ別のフレックスアイテムになり、
                  横並びで幅を取り合って不自然な折り返しになるため。 */}
              <li className="flex gap-2">
                <span aria-hidden className="text-pink-500 flex-shrink-0">●</span>
                <span>
                  取得した情報の取り扱いは
                  <Link href="/privacy" className="text-pink-600 font-medium hover:underline mx-0.5 whitespace-nowrap">プライバシーポリシー</Link>
                  をご確認ください。
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* ─── よくある質問 ─── */}
        <section className="mt-10 sm:mt-12">
          <h2 className="flex items-center gap-2 text-base sm:text-lg font-bold text-slate-800 mb-4">
            よくある質問
          </h2>
          <div className="rounded-2xl border border-pink-100 bg-white/90 backdrop-blur-sm shadow-sm divide-y divide-pink-50 overflow-hidden">
            {FAQS.map((f) => (
              <details key={f.q} className="group">
                <summary className="cursor-pointer list-none px-4 sm:px-5 py-3.5 flex items-start gap-2.5 text-sm font-bold text-slate-700 hover:bg-pink-50/40 transition-colors">
                  <span aria-hidden className="flex-shrink-0 text-pink-500 font-black">Q</span>
                  <span className="flex-1">{f.q}</span>
                  <span
                    aria-hidden
                    className="flex-shrink-0 text-pink-400 text-xs mt-0.5 transition-transform group-open:rotate-180"
                  >
                    ▼
                  </span>
                </summary>
                <div className="px-4 sm:px-5 pb-4 flex items-start gap-2.5">
                  <span aria-hidden className="flex-shrink-0 text-slate-300 font-black text-sm">A</span>
                  <p className="flex-1 text-xs sm:text-sm leading-relaxed text-slate-500">{f.a}</p>
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* ─── 下部CTA ─── */}
        <section className="mt-10 sm:mt-12">
          <JoinCta variant="footer" />
        </section>

        {/* ─── 関連ページ（内部リンク） ─── */}
        <nav aria-label="関連ページ" className="mt-10">
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-slate-500">
            <li><Link href="/terms" className="hover:text-pink-600 hover:underline">利用規約</Link></li>
            <li><Link href="/privacy" className="hover:text-pink-600 hover:underline">プライバシーポリシー</Link></li>
            <li><Link href="/about" className="hover:text-pink-600 hover:underline">運営者情報</Link></li>
            <li><Link href="/contact" className="hover:text-pink-600 hover:underline">お問い合わせ</Link></li>
            <li><Link href="/reviews" className="hover:text-pink-600 hover:underline">口コミ一覧</Link></li>
            <li><Link href="/salons" className="hover:text-pink-600 hover:underline">メンズエステ店一覧</Link></li>
          </ul>
        </nav>

        {/* ルックバナー（ページ下部）。上部の枠とは独立にランダム抽選。 */}
        <AdBanner banners={adBanners} />
      </main>

      <SiteFooter inner="max-w-5xl" />
    </div>
  );
}
