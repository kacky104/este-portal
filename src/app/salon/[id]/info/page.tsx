import Link from "next/link";
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { notFound } from "next/navigation";
import { createPublicClient } from "@/app/lib/supabase/public";
import { getTheme, breadcrumbCurrentColor } from "@/app/lib/themes";
import { paymentMethodLabel } from "@/app/lib/paymentMethods";
import type { Metadata } from "next";
import { buildSalonSubpageMetadata } from "../subpageMetadata";
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';

// 自己参照 canonical＋固有 title（root の canonical '/' 継承による重複扱いを防ぐ）。詳細は ../subpageMetadata.ts。
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return buildSalonSubpageMetadata(id, "info", "店舗情報");
}

// 個別サロンページ「店舗基本情報」セクションと同じアイコン群
function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81a19.79 19.79 0 01-3.07-8.63A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}
function MapIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function TrainIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="2" width="16" height="16" rx="2" /><path d="M9 18v3M15 18v3M9 21h6M4 10h16" />
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
function WalletIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" />
    </svg>
  );
}

function InfoRow({
  icon, label, value, labelColor, valueColor,
}: {
  icon: React.ReactNode; label: string; value: string; labelColor?: string; valueColor?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <dt className="flex items-start gap-1.5 flex-shrink-0 w-24 text-xs pt-0.5" style={{ color: labelColor ?? '#94a3b8' }}>
        <span className="mt-px">{icon}</span>
        {label}
      </dt>
      <dd className="text-sm leading-relaxed min-w-0 break-words" style={{ color: valueColor ?? '#334155' }}>{value}</dd>
    </div>
  );
}

// ISR：10分ごとに再生成（保存時は /api/revalidate で即時無効化）。
export const revalidate = 600;

// 事前生成はせず、初回アクセス時にその場生成→以降キャッシュ（ランタイムISR）。
// Next 16 では revalidate を効かせるため generateStaticParams（空配列）が必須。dynamicParams は既定 true。
export async function generateStaticParams() {
  return [];
}

export default async function SalonInfoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createPublicClient();

  const { data: salonRow, error } = await supabase
    .from('salons')
    .select('id, name, theme, phone, hours, closed_days, address, access, payment_methods, official_url, fukux_url')
    .eq('id', Number(id))
    .single();

  if (error || !salonRow) notFound();

  const theme = getTheme(salonRow.theme as string | null);

  const { data: wallpaperRow } = await supabase
    .from('theme_wallpapers')
    .select('image_url')
    .eq('theme_key', theme.key)
    .maybeSingle();
  const wallpaperUrl = (wallpaperRow?.image_url as string | undefined) ?? null;

  // 個別サロンページと同じ背景レイヤー（壁紙＋テーマ色オーバーレイ、モバイル対応の固定配置）
  const bgLayerStyle: React.CSSProperties = {
    backgroundColor: theme.bg,
    ...(wallpaperUrl
      ? {
          backgroundImage: `linear-gradient(${theme.bg}D9, ${theme.bg}D9), url(${wallpaperUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : {}),
  };

  const salonName = (salonRow.name as string) ?? '';
  const phone      = (salonRow.phone as string) ?? '';
  const hours      = (salonRow.hours as string) ?? '';
  const closedDays = (salonRow.closed_days as string) ?? '';
  const address    = (salonRow.address as string) ?? '';
  const access     = (salonRow.access as string) ?? '';
  const paymentMethods = (salonRow.payment_methods as string[] | null) ?? [];
  const officialUrl = (salonRow.official_url as string | null) ?? null;
  const fukuxUrl    = (salonRow.fukux_url as string | null) ?? null;

  return (
    <div className="relative min-h-screen overflow-x-clip" style={{ color: theme.text }}>

      {/* 背景レイヤー（個別サロンページと同じテーマ壁紙） */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgLayerStyle} />

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b shadow-sm" style={{ backgroundColor: `${theme.card}E6`, borderColor: theme.cardBorder }}>
        <div className="max-w-4xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2"><SavedSalonsMenu /><VipLetterIcon /><NotificationBell /><AccountMenu /><HamburgerMenu /></div>
        </div>
      </header>
      <SiteNoticeBanner />

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* ─── パンくずリスト：トップ › サロン名 › 店舗情報 ─── */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#ec4899' }}>
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link href={`/salon/${id}`} className="hover:opacity-80 transition-opacity inline-block max-w-[45%] truncate align-middle" style={{ color: '#ec4899' }}>
            {salonName || '店舗'}
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <span aria-current="page" className="flex-shrink-0 whitespace-nowrap" style={{ color: breadcrumbCurrentColor(theme.key), fontWeight: 600 }}>店舗情報</span>
        </nav>

        {/* タイトル */}
        <div className="mb-6 text-center">
          <h1 className="font-bold whitespace-nowrap overflow-hidden" style={{ fontSize: 'clamp(16px, 4vw, 24px)', textOverflow: 'ellipsis', color: theme.heading }}>
            {salonName}
          </h1>
          <p className="text-sm mt-1" style={{ color: theme.body }}>店舗情報</p>
        </div>

        {/* 店舗基本情報（個別サロンページと同項目・同データ源） */}
        <section className="rounded-2xl border shadow-sm p-6" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-1 h-5 rounded-full bg-gradient-to-b from-pink-500 to-pink-700 flex-shrink-0" />
            <h2 className="font-bold" style={{ color: theme.heading }}>店舗基本情報</h2>
          </div>
          <dl className="space-y-3.5 text-sm">
            <InfoRow icon={<PhoneIcon />}    label="電話番号" value={phone}      labelColor={theme.body} valueColor={theme.heading} />
            <InfoRow icon={<ClockIcon />}    label="営業時間" value={hours}      labelColor={theme.body} valueColor={theme.heading} />
            <InfoRow icon={<CalendarIcon />} label="定休日"   value={closedDays} labelColor={theme.body} valueColor={theme.heading} />
            <InfoRow icon={<MapIcon />}      label="住所"     value={address}    labelColor={theme.body} valueColor={theme.heading} />
            <InfoRow icon={<TrainIcon />}    label="アクセス" value={access}     labelColor={theme.body} valueColor={theme.heading} />
            <InfoRow icon={<WalletIcon />}   label="支払い方法" value={paymentMethods.map(paymentMethodLabel).join('・')} labelColor={theme.body} valueColor={theme.heading} />
            {/* 公式サイト：未設定なら行ごと非表示。長いURLでも break-all で折り返して崩れない。 */}
            {officialUrl && (
              <div className="flex gap-3">
                <dt className="flex items-start gap-1.5 flex-shrink-0 w-24 text-xs pt-0.5" style={{ color: theme.body }}>
                  <span className="mt-px"><LinkIcon /></span>
                  公式サイト
                </dt>
                <dd className="text-sm leading-relaxed min-w-0 break-all">
                  <a
                    href={officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-80 break-all"
                    style={{ color: '#ec4899' }}
                  >
                    {officialUrl}
                  </a>
                </dd>
              </div>
            )}
            {/* fukuX：未設定なら行ごと非表示。ブランド紫でリンク表示。 */}
            {fukuxUrl && (
              <div className="flex gap-3">
                <dt className="flex items-start gap-1.5 flex-shrink-0 w-24 text-xs pt-0.5" style={{ color: theme.body }}>
                  <span className="mt-px"><LinkIcon /></span>
                  fukuX
                </dt>
                <dd className="text-sm leading-relaxed min-w-0 break-all">
                  <a
                    href={fukuxUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:opacity-80 break-all"
                    style={{ color: '#7E22CE' }}
                  >
                    {fukuxUrl}
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </section>
      </main>
    </div>
  );
}
