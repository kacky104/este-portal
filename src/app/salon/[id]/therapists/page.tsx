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
import { SalonAllTherapists } from "@/components/SalonTherapists";
import { fetchSalonTherapists } from "@/app/lib/salonTherapists";
import type { Metadata } from "next";
import { buildSalonSubpageMetadata } from "../subpageMetadata";
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { buildBreadcrumbJsonLd, toJsonLdString } from '@/app/lib/jsonLd';

// 自己参照 canonical＋固有 title（root の canonical '/' 継承による重複扱いを防ぐ）。詳細は ../subpageMetadata.ts。
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return buildSalonSubpageMetadata(id, "therapists", "在籍セラピスト一覧");
}

// ISR：10分ごとに再生成（保存時は /api/revalidate で即時無効化）。
export const revalidate = 600;

// 事前生成はせず、初回アクセス時にその場生成→以降キャッシュ（ランタイムISR）。
// Next 16 では revalidate を効かせるため generateStaticParams（空配列）が必須。dynamicParams は既定 true。
export async function generateStaticParams() {
  return [];
}

export default async function SalonTherapistsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createPublicClient();

  const { data: salonRow, error } = await supabase
    .from('salons')
    .select('id, name, theme')
    .eq('id', Number(id))
    .single();

  if (error || !salonRow) notFound();

  const theme = getTheme(salonRow.theme as string | null);

  // 在籍セラピストは壁紙と並列でサーバー取得する。props で渡すことで初期HTMLに
  // <a href="/therapist/[id]"> が載り、クローラが各セラピスト詳細へ辿れる（SEO対応 2026-07-28）。
  const [{ data: wallpaperRow }, therapists] = await Promise.all([
    supabase
      .from('theme_wallpapers')
      .select('image_url')
      .eq('theme_key', theme.key)
      .maybeSingle(),
    fetchSalonTherapists(Number(id), supabase),
  ]);
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

        {/* ─── パンくずリスト：トップ › サロン名 › セラピスト一覧（他ページと同形式） ─── */}
        {/* BreadcrumbList 構造化データ（可視パンくずと同一内容。2026-08-05） */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(buildBreadcrumbJsonLd([
          { name: 'トップ', path: '/' },
          { name: salonName || '店舗', path: `/salon/${id}` },
          { name: 'セラピスト一覧', path: `/salon/${id}/therapists` },
        ])) }} />
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#ec4899' }}>
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link href={`/salon/${id}`} className="hover:opacity-80 transition-opacity inline-block max-w-[45%] truncate align-middle" style={{ color: '#ec4899' }}>
            {salonName || '店舗'}
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <span aria-current="page" className="flex-shrink-0 whitespace-nowrap" style={{ color: breadcrumbCurrentColor(theme.key), fontWeight: 600 }}>セラピスト一覧</span>
        </nav>

        {/* タイトル */}
        <div className="mb-6 text-center">
          <h1 className="font-bold whitespace-nowrap overflow-hidden" style={{ fontSize: 'clamp(16px, 4vw, 24px)', textOverflow: 'ellipsis', color: theme.heading }}>
            {salonName}
          </h1>
          <p className="text-sm mt-1" style={{ color: theme.body }}>在籍セラピスト一覧</p>
        </div>

        {/* 全在籍セラピスト（写真・名前・今すぐ・NEW・出勤ステータス付きカード） */}
        <SalonAllTherapists salonId={Number(id)} from="therapists" showSaveButton initialList={therapists} />
      </main>
    </div>
  );
}
