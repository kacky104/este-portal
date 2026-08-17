import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { ListingInquiryForm } from './ListingInquiryForm';
import { ListingAbout } from './ListingAbout';
import { ListingFeatures } from './ListingFeatures';
import { ListingHpPromo } from './ListingHpPromo';
import { ListingContactHeading } from './ListingContactHeading';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { SiteFooter } from '@/app/components/SiteFooter';
import { getTheme } from '@/app/lib/themes';
import { fetchThemeWallpapers } from '@/app/lib/ranking';
import { fetchPageHero } from '@/app/lib/pageHero';
import { PageHero } from '@/app/components/PageHero';

export const metadata: Metadata = {
  title: '掲載について｜フクエス',
  description: '福岡メンズエステポータル「フクエス」への店舗掲載をご希望の店舗様へのご案内です。',
  alternates: { canonical: '/listing' },
};

// テーマ壁紙を取得するため ISR にする（他の公開ページと同じ10分）。
export const revalidate = 600;

export default async function ListingPage() {
  // 背景はホワイトテーマ＋テーマ壁紙（white）。/salons のシルバーと同方式・可読性用に D9 を重ねる（2026-08-07）。
  const theme = getTheme('white');
  const [wallpapers, hero] = await Promise.all([
    fetchThemeWallpapers(),
    fetchPageHero('listing'),
  ]);
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
    <div className="min-h-screen text-slate-900" style={bgStyle}>

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu /><HamburgerMenu />
          </div>
        </div>
      </header>
      <SiteNoticeBanner />

      {/* ★ <main> 自体は幅を持たせず、内側のラッパーで幅を決める（2026-08-17 / 第19便）。
          「掲載について」〜「掲載店舗様でできること」の装飾セクション（ListingAbout）だけ
          1280px にしたいため。従来の max-w-3xl / px-4 / py-10 はそのまま内側のラッパーへ移してあり、
          セクション以外の見た目は変わらない。
          ★ 100vw で親からはみ出させる手法は使わないこと。Windows のスクロールバー幅ぶん
            （約15px）横スクロールが出る。帯そのものを全幅に置く今の形なら起きない。 */}
      <main>
        {/* ページ別ヒーロー画像（/admin「ページ別ヒーロー画像設定」の listing 枠・2026-08-08 追加）。
            未設定なら何も描画しない。
            ★ 2026-08-17（第19便）に【画面幅いっぱい】へ変更した（オーナー要望）。
              そのため本文ラッパー（max-w-3xl px-4）の【外】に置いてある。
              中に戻すと左右16pxの余白が付いて全幅にならないので、動かすときは注意。 */}
        <PageHero url={hero} alt="掲載について" fullBleed />

        {/* 「掲載について」＋「掲載店舗様でできること」（オーナー作成のデザイン画像・全幅）。
            ★ 文章は sr-only で ListingAbout の中に持っている。 */}
        <ListingAbout />

        {/* 「お店の成長を支える10の機能」（2026-08-17 / 第19便でカード8枚から画像へ差し替え）。
            ★ 09 予約ボード・10 公式ホームページ制作 が増えて 8 → 10 機能になった。
            ★ 文章は sr-only で ListingFeatures の中に持っている。 */}
        <ListingFeatures />

        {/* 「公式ホームページ制作 0円」の案内バナー（2026-08-17 / 第20便）。
            ★ 帯まるごとが /hp/templates へのリンク。ボタンは画像に描き込まれている。
            ★ 10機能の「10 公式ホームページ制作」の直後に置いている。
              機能紹介 → その料金、の順になるので、位置を動かすと話の流れが切れる。
            ★ 本文ラッパー（max-w-3xl px-4）の【外】。中に入れると全幅にならない。 */}
        <ListingHpPromo />

        {/* 「掲載をご希望の店舗様へ」の見出しブロック（2026-08-17 / 第20便でデザイン画像に差し替え）。
            ★ 本文ラッパー（max-w-3xl px-4）の【外】＝画面いっぱい（2026-08-17 オーナー判断）。
              いったんラッパーの中に入れてフォームと幅を揃えたが、全幅のほうが見栄えが良いと判断して外へ出した。
              中に戻すと左右16pxの余白が付いて全幅にならない。
            ★ すぐ上の ListingHpPromo と黒がつながって見えないよう、
              コンポーネント側で 40px の黒い隔たり（pt-10）を持たせている。
            ★ h2 と説明文は ListingContactHeading の中に sr-only で残してある。 */}
        <ListingContactHeading />

        <div className="max-w-3xl mx-auto px-4 pt-10 pb-10">

        {/* 掲載案内PDF（public/docs/fukues-listing-guide.pdf・2026-08-07 追加）。
            料金を問い合わせ前に知りたいオーナーが多いため、フォームより先に置く。 */}
        <a
          href="/docs/fukues-listing-guide.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-2xl border border-pink-200 bg-pink-50/50 px-4 py-3 mb-4 hover:border-pink-300 hover:bg-pink-50 transition-colors"
        >
          <span className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white border border-pink-200 text-pink-500 text-[10px] font-black">
            PDF
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-pink-600">掲載店舗募集のご案内（PDF）</span>
            <span className="block text-xs text-slate-500 mt-0.5">
              料金体系など詳しく知りたい方は、こちらのご案内資料をご覧ください。
            </span>
          </span>
        </a>

        {/* 掲載お問い合わせフォーム（未ログインで送信可・運営宛メール通知＋listing_inquiriesに保存） */}
        <ListingInquiryForm />

        <p className="text-xs text-slate-500 leading-relaxed mt-3">
          メールでのお問い合わせも受け付けています：<a href="mailto:info@fukues.com" className="text-pink-600 hover:underline">info@fukues.com</a>
        </p>

        {/* ── 無料掲載（テキスト掲載）の案内（2026-08-07 追加）──
            条件＝公式HPに3サイトのリンクバナー設置。確認後 /admin の「無料掲載枠」に手入力で
            /salons のテキスト一覧へ掲載する運用（free_salon_listings）。 */}
        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">無料掲載について</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-3">
          店舗様の公式ホームページに、フクエス・フクエスワーク・fukuX（フクエックス）の3つの
          <a href="/banner" className="text-pink-600 hover:underline">リンクバナー</a>
          を設置いただいた店舗様は、<strong className="text-slate-800">無料で店舗一覧に掲載</strong>できます。
        </p>
        <div className="rounded-2xl border border-pink-100 bg-pink-50/50 px-4 py-3 mb-3">
          <p className="text-xs font-bold text-slate-700 mb-1.5">無料掲載の流れ</p>
          <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-600 leading-relaxed">
            <li>
              <a href="/banner" className="text-pink-600 hover:underline">リンクバナーのページ</a>
              から3つのバナータグを取得し、公式ホームページに設置
            </li>
            <li>
              <a href="/banner/report" className="text-pink-600 hover:underline">設置報告フォーム</a>
              または上記フォーム・メールで、設置したページのURLをご連絡
            </li>
            <li>当事務局で設置を確認できましたら、店舗一覧に掲載いたします</li>
          </ol>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed mb-2">
          無料掲載では、<a href="/salons" className="text-pink-600 hover:underline">店舗一覧</a>
          に店名・地域・電話番号・公式ホームページへのリンクをテキストで掲載します
          （店舗ページの開設や上記「掲載店舗様でできること」の機能は含まれません）。
        </p>
        <p className="text-xs text-slate-500 leading-relaxed mb-2">
          ※ 掲載期間中はバナーの設置継続をお願いします。バナーが確認できなくなった場合、掲載を終了することがあります。
        </p>

        <h2 className="text-lg font-bold text-slate-800 mt-8 mb-3">掲載できる店舗について</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-2">
          以下に該当する店舗様の掲載はお断りしています。
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600 leading-relaxed">
          <li>法令に違反する営業を行っている、またはその疑いがある場合</li>
          <li>提供情報に虚偽がある場合</li>
          <li>その他、当事務局が掲載にふさわしくないと判断した場合</li>
        </ul>

        <div className="mt-10 text-sm text-slate-500 leading-relaxed">
          <p>フクエス運営事務局</p>
        </div>
        </div>
      </main>

      {/* ─── Footer ──────────────────────────────────────── */}
      <SiteFooter inner="max-w-3xl" />
    </div>
  );
}
