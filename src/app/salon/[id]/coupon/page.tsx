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
import { getCouponColor } from "@/app/lib/couponColors";
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
  return buildSalonSubpageMetadata(id, "coupon", "クーポン");
}

// 有効期限の表示整形（"2026-07-31" → "2026年7月31日"）。
function formatValidUntil(d: string): string {
  const dt = new Date(`${d}T00:00:00+09:00`);
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric',
  }).format(dt);
}

// ISR：10分ごとに再生成（保存時は /api/revalidate で即時無効化）。
export const revalidate = 600;

// 事前生成はせず、初回アクセス時にその場生成→以降キャッシュ（ランタイムISR）。
// Next 16 では revalidate を効かせるため generateStaticParams（空配列）が必須。dynamicParams は既定 true。
export async function generateStaticParams() {
  return [];
}

export default async function SalonCouponPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createPublicClient();

  // salons とクーポン一覧は互いに独立なので並列取得。
  const [
    { data: salonRow, error },
    { data: rows },
  ] = await Promise.all([
    supabase
      .from('salons')
      .select('id, name, theme')
      .eq('id', Number(id))
      .single(),
    supabase
      .from('coupons')
      .select('id, title, discount, conditions, valid_until, sort_order, color')
      .eq('salon_id', Number(id))
      .eq('is_published', true)
      .order('sort_order', { ascending: true }),
  ]);

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

  // 今日（JST）の日付文字列。valid_until が過去のものは非表示（NULL は常に表示）。
  const todayJST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());

  const coupons = (rows ?? [])
    .map(r => ({
      id:         String(r.id),
      title:      (r.title as string) ?? '',
      discount:   (r.discount as string) ?? '',
      conditions: (r.conditions as string | null) ?? '',
      validUntil: (r.valid_until as string | null) ?? null,
      color:      (r.color as string | null) ?? null,
    }))
    .filter(c => c.validUntil == null || c.validUntil >= todayJST);

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

        {/* ─── パンくずリスト：トップ › サロン名 › クーポン ─── */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#ec4899' }}>
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link href={`/salon/${id}`} className="hover:opacity-80 transition-opacity inline-block max-w-[45%] truncate align-middle" style={{ color: '#ec4899' }}>
            {salonName || '店舗'}
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <span aria-current="page" className="flex-shrink-0 whitespace-nowrap" style={{ color: breadcrumbCurrentColor(theme.key), fontWeight: 600 }}>クーポン</span>
        </nav>

        {/* タイトル */}
        <div className="mb-6 text-center">
          <h1 className="font-bold whitespace-nowrap overflow-hidden" style={{ fontSize: 'clamp(16px, 4vw, 24px)', textOverflow: 'ellipsis', color: theme.heading }}>
            {salonName}
          </h1>
          <p className="text-sm mt-1" style={{ color: theme.body }}>クーポン</p>
        </div>

        {/* クーポン一覧（案B：グラデ見出し型・縦に並べる） */}
        {coupons.length === 0 ? (
          <div className="text-center py-12 text-sm rounded-2xl border" style={{ color: theme.body, backgroundColor: theme.card, borderColor: theme.cardBorder }}>
            現在ご利用いただけるクーポンはありません
          </div>
        ) : (
          <div className="flex flex-col gap-5 max-w-xl mx-auto">
            {coupons.map(c => {
              // 券の色プリセット（未設定/不明値は pink デフォルトにフォールバック。色は couponColors が唯一のソース）
              const cc = getCouponColor(c.color);
              return (
                <div key={c.id} className="rounded-[20px] bg-white shadow-md overflow-hidden flex flex-col">
                  {/* 上部カラー帯（~60px、プリセット色 → やや暗めの同系グラデ） */}
                  <div
                    className="relative flex items-center px-5 min-h-[64px] py-3"
                    style={{ background: `linear-gradient(135deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.36) 100%), ${cc.background}` }}
                  >
                    <h3
                      className="font-bold text-white text-base break-words pr-20"
                      style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
                    >
                      {c.title}
                    </h3>
                    {/* 点線の丸スタンプ風（右）：フクエス／を見た！ */}
                    <div
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-2 border-dashed flex flex-col items-center justify-center text-white text-center leading-none"
                      style={{ borderColor: 'rgba(255,255,255,0.85)', textShadow: '0 1px 2px rgba(0,0,0,0.45)' }}
                    >
                      <span className="text-[9px] font-bold">フクエス</span>
                      <span className="text-[9px] font-bold mt-0.5">を見た！</span>
                    </div>
                  </div>

                  {/* 本文 */}
                  <div className="p-5 flex flex-col gap-2">
                    {/* 割引額（大きく・濃いトーン） */}
                    <p className="text-2xl font-extrabold leading-tight break-words" style={{ color: cc.accent }}>
                      {c.discount}
                    </p>

                    {/* 説明（条件） */}
                    {c.conditions && (
                      <p className="text-sm text-slate-500 leading-relaxed break-words whitespace-pre-wrap">{c.conditions}</p>
                    )}

                    {/* 有効期限 */}
                    {c.validUntil && (
                      <p className="text-xs text-slate-400">有効期限：{formatValidUntil(c.validUntil)}まで</p>
                    )}

                    {/* 点線区切り＋必須文言（全クーポン共通・固定表示） */}
                    <div className="mt-1 border-t border-dashed border-slate-200" />
                    <p className="text-xs text-slate-500 leading-relaxed">
                      ご利用の際は
                      <span className="font-bold" style={{ color: cc.accent }}>『フクエスを見た！』</span>
                      とお伝えください
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
