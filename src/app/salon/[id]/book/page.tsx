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
import { getBookableTherapists } from "@/app/actions/booking";
import { BookingFlow } from "./BookingFlow";
import type { BookingCourse } from "@/app/actions/booking";
import type { Metadata } from "next";
import { buildSalonSubpageMetadata } from "../subpageMetadata";

// 予約フォームはインデックス対象外（noindex）。root の canonical '/' 継承による重複扱いも防ぐ。
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return buildSalonSubpageMetadata(id, "book", "ネット予約", { noindex: true });
}

// 予約枠は時刻に依存するため常に動的レンダリング（ISRキャッシュしない）。
export const dynamic = 'force-dynamic';

// salons.booking_courses(JSON) → 型付き配列（page 側でも同じ整形をして client に渡す）。
function parseBookingCourses(raw: unknown): BookingCourse[] {
  if (!Array.isArray(raw)) return [];
  const out: BookingCourse[] = [];
  for (const c of raw as Record<string, unknown>[]) {
    const name = String(c?.name ?? '').trim();
    const durationMin = Number(c?.duration_min);
    if (!name || !Number.isInteger(durationMin) || durationMin <= 0) continue;
    out.push({ name, durationMin, price: String(c?.price ?? '') });
  }
  return out;
}

export default async function SalonBookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const salonId = Number(id);
  const supabase = createPublicClient();

  const { data: salonRow, error } = await supabase
    .from('salons')
    .select('id, name, theme, phone, booking_enabled, booking_courses, is_hidden')
    .eq('id', salonId)
    .single();

  // 非表示サロンは予約ページも404（RLSに加え明示チェックで多重防御）。
  if (error || !salonRow || salonRow.is_hidden) notFound();

  const theme = getTheme(salonRow.theme as string | null);
  const salonName = (salonRow.name as string) ?? '';
  const phone = (salonRow.phone as string | null) ?? null;
  const bookingEnabled = Boolean(salonRow.booking_enabled);
  const courses = parseBookingCourses(salonRow.booking_courses);

  const { data: wallpaperRow } = await supabase
    .from('theme_wallpapers')
    .select('image_url')
    .eq('theme_key', theme.key)
    .maybeSingle();
  const wallpaperUrl = (wallpaperRow?.image_url as string | undefined) ?? null;

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

  // 受付可能なら在籍セラピスト（指名候補）を取得。
  const therapists = bookingEnabled && courses.length > 0
    ? await getBookableTherapists(salonId)
    : [];

  const canBook = bookingEnabled && courses.length > 0 && therapists.length > 0;

  return (
    <div className="relative min-h-screen overflow-x-clip" style={{ color: theme.text }}>
      <div aria-hidden className="fixed inset-0 -z-10" style={bgLayerStyle} />

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b shadow-sm" style={{ backgroundColor: `${theme.card}E6`, borderColor: theme.cardBorder }}>
        <div className="max-w-4xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2"><SavedSalonsMenu /><VipLetterIcon /><NotificationBell /><AccountMenu /><HamburgerMenu /></div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">

        {/* ─── パンくずリスト：トップ › サロン名 › ネット予約 ─── */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#ec4899' }}>
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link href={`/salon/${id}`} className="hover:opacity-80 transition-opacity inline-block max-w-[45%] truncate align-middle" style={{ color: '#ec4899' }}>
            {salonName || '店舗'}
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <span aria-current="page" className="flex-shrink-0 whitespace-nowrap" style={{ color: breadcrumbCurrentColor(theme.key), fontWeight: 600 }}>ネット予約</span>
        </nav>

        {/* タイトル */}
        <div className="mb-6 text-center">
          <h1 className="font-bold whitespace-nowrap overflow-hidden" style={{ fontSize: 'clamp(16px, 4vw, 24px)', textOverflow: 'ellipsis', color: theme.heading }}>
            {salonName}
          </h1>
          <p className="text-sm mt-1" style={{ color: theme.body }}>ネット予約（指名）</p>
        </div>

        {canBook ? (
          <BookingFlow
            salonId={salonId}
            salonName={salonName}
            phone={phone}
            courses={courses}
            therapists={therapists}
          />
        ) : (
          <div className="rounded-2xl border shadow-sm p-6 bg-white text-center space-y-3">
            <p className="text-sm font-bold text-slate-700">
              この店舗は現在ネット予約を受け付けていません
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              ご予約はお電話にてお問い合わせください。
              {phone && (
                <>
                  <br />
                  <a href={`tel:${phone}`} className="font-bold text-pink-600 underline">{phone}</a>
                </>
              )}
            </p>
            <Link
              href={`/salon/${id}`}
              className="inline-block text-sm font-bold text-pink-600 hover:opacity-80 transition-opacity"
            >
              ← 店舗ページへ戻る
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
