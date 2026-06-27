import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { WorkingTherapists } from './WorkingTherapists';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { createPublicClient } from '@/app/lib/supabase/public';
import { fetchSalons } from '@/app/lib/salons';
import { areaFromSlug, salonInArea, DISPATCH_AREA } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';

export default async function WorkingPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string | string[] }>;
}) {
  // ?area=<slug> 指定時は、そのエリアのサロン所属者だけに絞る（地域ページの「一覧を見る」から遷移）。
  // 未指定（トップの「一覧を見る」）は従来どおり全エリア。判定は地域ページ・スライダーと同じ salonInArea。
  const sp = await searchParams;
  const slug = Array.isArray(sp.area) ? sp.area[0] : sp.area;
  const areaValue = slug ? areaFromSlug(slug) : null;

  let filterSalonIds: number[] | undefined;
  let headingArea: string | null = null;
  if (areaValue) {
    const supabase = createPublicClient();
    const salons = await fetchSalons(supabase);
    filterSalonIds = salons.filter((s) => salonInArea(s, areaValue)).map((s) => s.id);
    headingArea = areaValue === DISPATCH_AREA ? '出張対応' : areaLabel(areaValue);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">

        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-pink-600 transition-colors mb-8"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          トップへ戻る
        </Link>

        {/* Heading（中央寄せ・オレンジ→ピンクのグラデーション文字） */}
        <div className="mb-8 text-center">
          <h1
            className="text-2xl font-bold inline-block"
            style={{
              background: 'linear-gradient(to right, #F59E0B, #EC4899)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
            }}
          >
            {headingArea ? `${headingArea}の本日出勤中のセラピスト` : '本日出勤中のセラピスト'}
          </h1>
        </div>

        <WorkingTherapists filterSalonIds={filterSalonIds} />
      </main>

      {/* ─── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
