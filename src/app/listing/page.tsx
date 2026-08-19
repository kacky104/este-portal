import type { Metadata } from 'next';
import Link from 'next/link';
import { buildBreadcrumbJsonLd, toJsonLdString } from '@/app/lib/jsonLd';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { ListingInquiryForm } from './ListingInquiryForm';
import { ListingAbout } from './ListingAbout';
import { ListingFeatures } from './ListingFeatures';
import { ListingPricePlans } from './ListingPricePlans';
import { ListingHpPromo } from './ListingHpPromo';
import { ListingContactHeading } from './ListingContactHeading';
import { ListingGuidePdfLink } from './ListingGuidePdfLink';
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
        {/* ── パンくず＋可視の h1（2026-08-18 第23便）─────────────────────
            それまで h1 は ListingAbout の中の sr-only だけで、このページには
            【見える見出しが1本も無かった】（見出し10本のうち8本が sr-only）。
            店舗様向けの入口ページなので、他の公開ページ（/salon/… /news）と同じ作法で
            パンくず＋見出しをヒーロー画像の上に置く。パンくずの構造化データ
            （BreadcrumbList）もこのページには無かったので一緒に足した。
            ★ h1 はページに1本。ListingAbout 側の sr-only h1 は削除済み（二重にしない）。
            ★ デザイン画像には一切触っていない。 */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(buildBreadcrumbJsonLd([
          { name: 'トップ', path: '/' },
          { name: '掲載について', path: '/listing' },
        ])) }} />
        <div className="max-w-3xl mx-auto px-4 pt-4 pb-4">
          <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
            <Link href="/" className="text-pink-600 hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap">
              トップ
            </Link>
            <span aria-hidden className="flex-shrink-0 text-slate-400">›</span>
            <span aria-current="page" className="flex-shrink-0 whitespace-nowrap font-semibold text-slate-600">
              掲載について
            </span>
          </nav>
          {/* ── 見出し・説明文は中央寄せ（2026-08-19 第25便・オーナー要望）──────────
              英字のアイブロウ → グラデーションの大見出し → 細い罫線 → 説明文。
              ＝ /column（ColumnHeading）・/news・/reviews と【同じ作法】。
              ★ この形はサイト共通。数値（tracking-[0.35em] / w-24 の罫線 / max-w-xl の説明文）を
                動かすと /listing だけ揃わなくなる。変えるなら ColumnHeading 側と一緒に。
              ★ 文字色は実測でコントラスト比を取っている（白 #ffffff 上・ブラウザで実測）。
                アイブロウ pink-700 = 5.91:1（小文字なので 4.5:1 以上が必要・OK）／
                説明文 slate-600 = 7.58:1（旧 slate-500 は 4.76:1 だった＝濃くした）／
                見出しのグラデーション最明部 rose-500 = 3.75:1。
                ★ 見出しは 24px 以上の太字＝大きい文字の基準（3:1）で判定している。
                  ここを小さい文字に落とすと 3.75:1 では足りなくなるので、
                  文字サイズを下げるときは色も濃くすること。
                明るい側（pink-500 / rose-400 など）へ動かすと基準を割るので必ず測り直すこと。
                罫線の pink-400 は 2.76:1 だが aria-hidden の装飾なので対象外。
              ★ パンくずは左寄せのまま（/column・/news と同じ）。ここだけ中央にしない。
              ★ text-balance は説明文の行末が「す。」だけになるのを防ぐため。
                外すと PC で最終行が1〜2文字だけの見た目になる。 */}
          <header className="mb-2 text-center">
            <p className="text-[11px] font-semibold tracking-[0.35em] text-pink-700">LISTING</p>
            <h1 className="mt-2 bg-gradient-to-r from-pink-700 via-rose-500 to-pink-700 bg-clip-text text-2xl sm:text-4xl font-black tracking-[0.04em] text-transparent drop-shadow-[0_1px_10px_rgba(236,72,153,0.18)]">
              掲載について
            </h1>
            <div aria-hidden className="mx-auto mt-4 h-px w-24 bg-gradient-to-r from-transparent via-pink-400 to-transparent" />
            <p className="mx-auto mt-4 max-w-xl text-xs sm:text-sm leading-relaxed text-balance text-slate-600">
              福岡のメンズエステポータル「フクエス」への店舗掲載をご検討の店舗様へのご案内です。
            </p>
          </header>
        </div>

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

        {/* 料金プラン（2026-08-17 / 第20便で追加）。
            ★ それまで金額は掲載案内PDFの中にしか無く、ページ上には割引（→0円）だけが出ていた。
              その割引の条件がいくらなのかが分からない状態だったので、定価をページに出した。
            ★ 順番が重要。10機能 → 料金 → 公式HP 0円 → 問い合わせ。
              料金を先に見せることで、下の 0円 が「既知の価格に乗る特典」として読める。
              入れ替えると 0円 が何に対する割引なのか分からなくなる。
            ★ 上下（10機能・公式HP）が暗い画像なのに対しここはクリーム。
              色が交互になるので、帯どうしがつながって見えず隔たりは要らない。 */}
        <ListingPricePlans />

        {/* 「公式ホームページ制作 0円」の案内バナー（2026-08-17 / 第20便）。
            ★ 帯まるごとが /hp/templates へのリンク。ボタンは画像に描き込まれている。
            ★ 料金プランの直後。「66,000円/33,000円 → その掲載店なら公式HPは0円」と続ける。
            ★ 本文ラッパー（max-w-3xl px-4）の【外】。中に入れると全幅にならない。 */}
        <ListingHpPromo />

        {/* 掲載案内PDF（public/docs/fukues-listing-guide.pdf・2026-08-07 追加）。
            ★ 2026-08-17（第20便）にHTMLのピンクのカードからデザイン画像へ差し替え、
              あわせて【フォームの直前 → CONTACTの直前】へ移動した（オーナー判断）。
              移動前は、CONTACT画像に描かれた「下のフォームから相談する↓」のすぐ下が
              この資料バナーで、矢印の指す先とページの中身が食い違っていた。
            ★ 並びは 10機能 → 料金 → 公式HP 0円 → 資料(PDF) → CONTACT↓ → フォーム。
              資料は「まだ問い合わせる前に読みたい人」の出口として情報セクションの最後に置く。
              フォームの後ろへ動かすと、問い合わせ前に資料を見たい人が気づけなくなる。
            ★ 本文ラッパー（max-w-3xl px-4）の【外】＝画面いっぱい。
            ★ 説明文は ListingGuidePdfLink の中に sr-only で残してある。 */}
        <ListingGuidePdfLink />

        {/* 「掲載をご希望の店舗様へ」の見出しブロック（2026-08-17 / 第20便でデザイン画像に差し替え）。
            ★ 本文ラッパー（max-w-3xl px-4）の【外】＝画面いっぱい（2026-08-17 オーナー判断）。
              いったんラッパーの中に入れてフォームと幅を揃えたが、全幅のほうが見栄えが良いと判断して外へ出した。
              中に戻すと左右16pxの余白が付いて全幅にならない。
            ★ 直下がフォーム。画像の「下のフォームから相談する↓」の矢印が指す先なので、
              この2つの間に別の要素を挟まないこと。
            ★ h2 と説明文は ListingContactHeading の中に sr-only で残してある。 */}
        <ListingContactHeading />

        {/* ── お問い合わせフォームの帯（2026-08-17 / 第20便で追加）──────────────
            ★ なぜ帯にしたか。PCではCONTACT画像が全幅（1521px）なのに対しフォームは768pxで、
              淡いページ背景の上に左右約390pxの空白を作って浮いて見えていた。
              フォームの幅を広げても直らない（入力欄が間延びするだけ）。
              直し方は「フォームを載せる土台を全幅で敷く」。中身は768pxのまま動かさない。

            ★ 背景色 #1f1f1e は CONTACT画像の【下端の実測色】。同じ色を下へ続けているので
              画像と帯のあいだに継ぎ目が出ず、画像＋フォームが1つのセクションとして読める。
              ★ CONTACT の画像を差し替えたら、下端の色を測り直してここも合わせること。
                ずれると帯の始まりに横線が1本入る。

            ★ 暗い面なので、この中のテキスト色は通常のページと変える必要がある。
              slate-500 のままだと読めない。下の注記は #cbb89a、リンクは #f0b27a。
              ★ この帯の中に要素を足すときは色を必ず確認すること。

            ★ 帯はフォームと注記まで。「無料掲載について」以降は明るい背景に戻す。 */}
        <section className="w-full bg-[#1f1f1e]">
          <div className="max-w-3xl mx-auto px-4 pt-10 pb-12">
            <p className="text-sm font-black text-[#f5ead6] text-center mb-3.5">下記フォームよりお問い合わせください</p>

            {/* 掲載お問い合わせフォーム（未ログインで送信可・運営宛メール通知＋listing_inquiriesに保存） */}
            <ListingInquiryForm />

            <p className="text-xs text-[#cbb89a] leading-relaxed mt-3">
              メールでのお問い合わせも受け付けています：<a href="mailto:info@fukues.com" className="text-[#f0b27a] hover:underline">info@fukues.com</a>
            </p>
          </div>
        </section>

        <div className="max-w-3xl mx-auto px-4 pt-10 pb-10">

        {/* ── 無料掲載（テキスト掲載）の案内（2026-08-07 追加）──
            条件＝公式HPに3サイトのリンクバナー設置。確認後 /admin の「無料掲載枠」に手入力で
            /salons のテキスト一覧へ掲載する運用（free_salon_listings）。 */}
        <h2 className="text-lg font-bold text-slate-800 text-center mt-8 mb-3">無料掲載について</h2>
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

        <h2 className="text-lg font-bold text-slate-800 text-center mt-8 mb-3">掲載できる店舗について</h2>
        <p className="text-sm text-slate-600 leading-relaxed mb-2">
          以下に該当する店舗様の掲載はお断りしています。
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600 leading-relaxed">
          <li>法令に違反する営業を行っている、またはその疑いがある場合</li>
          <li>提供情報に虚偽がある場合</li>
          <li>その他、当事務局が掲載にふさわしくないと判断した場合</li>
        </ul>

        <div className="mt-10 text-sm text-slate-500 leading-relaxed text-right">
          <p>フクエス運営事務局</p>
        </div>
        </div>
      </main>

      {/* ─── Footer ──────────────────────────────────────── */}
      <SiteFooter inner="max-w-3xl" />
    </div>
  );
}
