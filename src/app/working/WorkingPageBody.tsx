import { Logo } from '@/app/components/Logo';
import { WorkingTherapists } from './WorkingTherapists';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { Breadcrumb } from '@/app/components/Breadcrumb';
import { createPublicClient } from '@/app/lib/supabase/public';
import { fetchSalons } from '@/app/lib/salons';
import { areaFromSlug, salonInArea, DISPATCH_AREA } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';
import { fetchTherapistPool } from '@/app/lib/therapistPool';
import { thirtyMinSeed } from '@/lib/shuffle';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { SiteFooter } from '@/app/components/SiteFooter';
import { fetchActiveAdBanners } from '@/app/lib/adBanners';
import { AdBanner } from '@/app/components/AdBanner';

// ★ 第1081便（2026-10-01）: /working の本体。/working（全エリア）と /working/[area]（エリア別）の両方から使う。
//   それまでは /working が ?area= を searchParams で読んでいたため、ISR が効かず毎回サーバーで組み立てていた
//   （本番実測: 毎回 MISS・1.9秒）。エリアをパスにしたので、どちらも ISR 60 秒で配れる。
export async function WorkingPageBody({ slug }: { slug?: string }) {
  // slug 指定時（/working/[area]）は、そのエリアのサロン所属者だけに絞る（地域ページの「一覧を見る」から遷移）。
  // 未指定（/working・トップの「一覧を見る」）は全エリア。判定は地域ページ・スライダーと同じ salonInArea。
  const areaValue = slug ? areaFromSlug(slug) : null;

  let filterSalonIds: number[] | undefined;
  let headingArea: string | null = null;
  if (areaValue) {
    const supabase = createPublicClient();
    const salons = await fetchSalons(supabase);
    filterSalonIds = salons.filter((s) => salonInArea(s, areaValue)).map((s) => s.id);
    headingArea = areaValue === DISPATCH_AREA ? '出張対応' : areaLabel(areaValue);
  }

  // 出勤中セラピストをサーバーで取得し、初期HTMLにカード（リンク）を焼き込む（2026-08-05）。
  // ★ 非公開（is_active=false）は出さない（第216便の方針）。★ 本人ページは404なので、出すとリンク切れになる。
  //   ★ /therapists・バッジ一覧と同じ activeOnly:true に揃えた。並び替えはコンポーネント側。
  const [pool, adBanners] = await Promise.all([
    fetchTherapistPool({ activeOnly: true, filterSalonIds }),
    // ルックバナー（ad_banners・公開中からランダム1枚）。一覧ブロックの上下に1枠ずつ表示。
    fetchActiveAdBanners(),
  ]);
  const listSeed = thirtyMinSeed();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

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

      <main className="max-w-5xl mx-auto px-4 py-10">

        {/* Back link */}
        <Breadcrumb current="現在出勤中のセラピスト" />

        {/* Heading（中央寄せ）。?area 指定時はエリア名（ピンク）で改行し2行に分ける。
            未指定（全エリア）は従来どおりオレンジ→ピンクのグラデーション1行。 */}
        <div className="mb-8 text-center">
          {headingArea ? (
            <h1 className="text-2xl font-bold leading-tight">
              <span className="block text-pink-600">{headingArea}</span>
              <span
                className="block"
                style={{
                  background: 'linear-gradient(to right, #F59E0B, #EC4899)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: 'transparent',
                }}
              >
                現在出勤中のセラピスト
              </span>
            </h1>
          ) : (
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
              現在出勤中のセラピスト
            </h1>
          )}
        </div>

        {/* ルックバナー（一覧ブロックの上）。公開中からランダム1枚・ページを開くたびに入れ替わり。 */}
        <AdBanner banners={adBanners} />

        {/* key でエリア切替時に必ず作り直す（initialList が state 初期値のため、prop 変更を確実に反映させる） */}
        <WorkingTherapists key={slug ?? 'all'} filterSalonIds={filterSalonIds} initialList={pool.list} initialSeed={listSeed} />

        {/* ルックバナー（一覧ブロックの下）。上の枠とは独立にランダム抽選（枚数が少ないと同じ枠になることもある）。 */}
        <AdBanner banners={adBanners} />
      </main>

      {/* ─── Footer ──────────────────────────────────────── */}
      <SiteFooter inner="max-w-5xl" />
    </div>
  );
}
