import Link from "next/link";
import { areaLabel } from "@/app/lib/areaLabel";
import { toJsonLdString, buildBreadcrumbJsonLd } from "@/app/lib/jsonLd";
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { createPublicClient } from "@/app/lib/supabase/public";
import { getTheme, breadcrumbCurrentColor } from "@/app/lib/themes";
import { paymentMethodLabel } from "@/app/lib/paymentMethods";
import { AutoFitText } from "@/app/components/AutoFitText";
import { InfoTelLink } from "@/app/components/InfoTelLink";
import { Stars } from "@/app/components/Stars";
import { LatestReviewsBlock } from "@/app/components/LatestReviewsBlock";
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { SiteFooter } from '@/app/components/SiteFooter';
import { getFreeSalonReviewStats, getFreeSalonApprovedReviews } from "@/app/lib/reviews";

// ★ 無料掲載枠（第368便）の簡易詳細ページ。店舗基本情報と口コミの2ブロックだけ。
//   画像・クイックナビ・出勤・料金・セラピスト・店舗について・バナー・ポップアップ・保存ボタンは出さない。
//   見た目は本体 page.tsx から必要な部分だけ写して削った（新しい見た目は作らない）。
const FREE_PAGE_HEADINGS = { info: '店舗基本情報', reviews: '口コミ' } as const;

export async function FreeSalonPage({ id, row }: { id: number; row: Record<string, unknown> }) {
  const salon = {
    id,
    name:           (row.name as string) ?? '',
    area:           (row.area as string) ?? '',
    hours:          (row.hours as string) ?? '',
    phone:          (row.phone as string) ?? '',
    address:        (row.address as string) ?? '',
    access:         (row.access as string) ?? '',
    closedDays:     (row.closed_days as string) ?? '',
    paymentMethods: (row.payment_methods as string[] | null) ?? [],
    officialUrl:    (row.official_url as string | null) ?? null,
    dispatchType:   (row.dispatch_type as 'none' | 'available' | 'only' | null) ?? 'none',
  };
  const theme = getTheme(row.theme as string | null);

  const [stats, latest] = await Promise.all([
    getFreeSalonReviewStats(id),
    getFreeSalonApprovedReviews(id, 3),
  ]);

  // パンくず（BreadcrumbList だけ。HealthAndBeautyBusiness は出さない）。
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'トップ', path: '/' },
    { name: salon.name, path: `/salon/${salon.id}` },
  ]);

  // 店名の下の情報行（本体 page.tsx と同じ作り方）。
  const roomOrDispatch = salon.dispatchType === 'only' ? '出張' : 'ルーム（個室）';
  const salonMetaLine1 = ['メンズエステ', areaLabel(salon.area), roomOrDispatch]
    .filter((s) => s && s.trim() !== '')
    .join('／');
  const salonMetaLine2 = `営業時間：${salon.hours || '問い合わせ'}／定休日：${salon.closedDays || '問い合わせ'}`;

  const paymentText = salon.paymentMethods.map(paymentMethodLabel).join('・');

  return (
    <div className="relative min-h-screen overflow-x-clip" style={{ color: theme.text }}>

      {/* BreadcrumbList 構造化データ（トップ › サロン名） */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(breadcrumbJsonLd) }} />

      {/* 背景（テーマ色のみ。壁紙は取らない） */}
      <div aria-hidden className="fixed inset-0 -z-10" style={{ backgroundColor: theme.bg }} />

      {/* ─── Header（本体と同じ Logo＋5アイコン） ─── */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b shadow-sm" style={{ backgroundColor: `${theme.card}E6`, borderColor: theme.cardBorder }}>
        <div className="max-w-4xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2"><SavedSalonsMenu /><VipLetterIcon /><NotificationBell /><AccountMenu /><HamburgerMenu /></div>
        </div>
      </header>
      <SiteNoticeBanner />

      <main className="max-w-2xl mx-auto px-4 py-8">

        {/* ─── パンくずリスト：トップ › サロン名 ─── */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#ec4899' }}>
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <span aria-current="page" className="inline-block max-w-[60%] truncate align-middle" style={{ color: breadcrumbCurrentColor(theme.key), fontWeight: 600 }}>
            {salon.name || '店舗'}
          </span>
        </nav>

        {/* ─── 店名＋情報行（中央寄せ。スマホも同じ表示＝SalonMobileNav は使わない） ─── */}
        <h1 className="px-2">
          <AutoFitText text={salon.name} max={26} min={15} className="text-center font-bold leading-tight" style={{ color: theme.heading }} />
        </h1>
        <div className="text-center mt-1.5 mb-6 leading-relaxed px-2" style={{ color: theme.body }}>
          <p className="text-[12px]">{salonMetaLine1}</p>
          {salonMetaLine2 && <p className="text-[12px]">{salonMetaLine2}</p>}
        </div>

        {/* ─── 店舗基本情報 ─── */}
        <section className="border p-5" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
          <h2 className="font-bold mb-4" style={{ color: theme.heading }}>{FREE_PAGE_HEADINGS.info}</h2>
          <dl className="space-y-3.5 text-sm">
            {/* ★ 電話番号はタップで「フクエスを見た」のポップアップ → 発信 */}
            <InfoRow icon={<PhoneIcon />}    label="電話番号" value={salon.phone}      labelColor={theme.body} valueColor={theme.heading}
              valueNode={salon.phone ? <InfoTelLink salonId={id} phone={salon.phone} color={theme.heading} /> : undefined} />
            <InfoRow icon={<ClockIcon />}    label="営業時間" value={salon.hours}      labelColor={theme.body} valueColor={theme.heading} />
            <InfoRow icon={<CalendarIcon />} label="定休日"   value={salon.closedDays} labelColor={theme.body} valueColor={theme.heading} />
            <InfoRow icon={<MapIcon />}      label="住所"     value={salon.address}    labelColor={theme.body} valueColor={theme.heading} />
            <InfoRow icon={<TrainIcon />}    label="アクセス" value={salon.access}     labelColor={theme.body} valueColor={theme.heading} />
            {/* 支払い方法：空なら行ごと出さない */}
            {paymentText && (
              <InfoRow icon={<WalletIcon />} label="支払い方法" value={paymentText} labelColor={theme.body} valueColor={theme.heading} />
            )}
            {/* 公式サイト：あれば出す（無ければ行ごと非表示）。fukuX の行は出さない */}
            {salon.officialUrl && (
              <div className="flex gap-3">
                <dt className="flex items-start gap-1.5 flex-shrink-0 w-20 text-[11px] pt-0.5" style={{ color: theme.body }}>
                  <span className="mt-px"><LinkIcon /></span>
                  公式サイト
                </dt>
                <dd className="text-[13px] leading-relaxed min-w-0 break-all">
                  <a href={salon.officialUrl} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 break-all" style={{ color: '#ec4899' }}>
                    {salon.officialUrl}
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </section>

        {/* ─── 口コミ ─── */}
        <section className="border p-5 mt-6" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
          <h2 className="font-bold mb-4" style={{ color: theme.heading }}>{FREE_PAGE_HEADINGS.reviews}</h2>

          {/* 評価（0件＝口コミはまだありません／1件以上＝星・平均・件数・3軸・一覧への導線） */}
          {stats.count === 0 || stats.avgOverall === null ? (
            <p className="text-sm" style={{ color: theme.body }}>口コミはまだありません</p>
          ) : (
            <Link
              href={`/salon/${id}/reviews`}
              className="block border p-4 cursor-pointer hover:brightness-[0.97] transition-all"
              style={{ borderColor: theme.cardBorder }}
              aria-label={`${salon.name}の口コミ一覧を見る`}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Stars value={stats.avgOverall} size={18} />
                  <span className="text-pink-600 font-bold text-lg">{stats.avgOverall.toFixed(1)}</span>
                  <span className="text-sm" style={{ color: theme.body }}>（{stats.count}件の口コミ）</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: theme.body }}>
                  {stats.avgService !== null && (
                    <span className="inline-flex items-center gap-1">接客 <Stars value={stats.avgService} size={11} /> {stats.avgService.toFixed(1)}</span>
                  )}
                  {stats.avgTechnique !== null && (
                    <span className="inline-flex items-center gap-1">施術 <Stars value={stats.avgTechnique} size={11} /> {stats.avgTechnique.toFixed(1)}</span>
                  )}
                  {stats.avgReception !== null && (
                    <span className="inline-flex items-center gap-1">受付 <Stars value={stats.avgReception} size={11} /> {stats.avgReception.toFixed(1)}</span>
                  )}
                </div>
                <p className="text-xs font-semibold text-pink-600 text-right">口コミ一覧を見る →</p>
              </div>
            </Link>
          )}

          {/* 新着3件（0件なら LatestReviewsBlock が何も出さない） */}
          <LatestReviewsBlock
            reviews={latest}
            variant="section"
            className="mt-3"
            moreHref={`/salon/${id}/reviews`}
            moreLabel="この店舗の口コミをもっとみる"
            cardStyle={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
          />

          {/* 口コミを書く（ピンク→オレンジ・白文字・直角・中央） */}
          <div className="mt-5 flex justify-center">
            <Link
              href={`/salon/${id}/review/new`}
              className="inline-flex items-center justify-center px-6 py-3 font-bold text-white bg-gradient-to-r from-pink-500 to-orange-500 hover:opacity-90 transition-opacity"
            >
              この店舗の口コミを書く
            </Link>
          </div>
        </section>
      </main>

      {/* ─── Footer ─── */}
      <SiteFooter
        inner="max-w-2xl"
        className="border-t py-8 mt-12"
        style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
        textColor={theme.body}
      />
    </div>
  );
}

/* ── Helper components（本体 page.tsx の非公開関数をコピー。共有化のために page.tsx を書き換えない） ── */

function InfoRow({
  icon,
  label,
  value,
  labelColor,
  valueColor,
  valueNode,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  labelColor?: string;
  valueColor?: string;
  valueNode?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <dt className="flex items-start gap-1.5 flex-shrink-0 w-20 text-[11px] pt-0.5" style={{ color: labelColor ?? '#94a3b8' }}>
        <span className="mt-px">{icon}</span>
        {label}
      </dt>
      <dd className="text-[13px] leading-relaxed min-w-0 break-words" style={{ color: valueColor ?? '#334155' }}>{valueNode ?? value}</dd>
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function TrainIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="2" width="16" height="16" rx="2" /><path d="M9 18v3M15 18v3M9 21h6M4 10h16" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
