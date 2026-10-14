import Link from 'next/link';
import Image from 'next/image';
import { getTheme } from '@/app/lib/themes';
import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { SiteFooter } from '@/app/components/SiteFooter';
import { createServiceClient } from '@/app/lib/supabase/service';
import { areaLabel } from '@/app/lib/areaLabel';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { POINT_CLAIM_HOURS, POINT_FIRST_REVIEW, POINT_SIGNUP, POINT_USE_UNIT, POINT_USE_YEN, POINT_VISIT, POINT_VISIT_NOTE } from '@/lib/points';

// フクエスポイントのご案内と加盟店の一覧（第1444便・2026-10-14・カッキーさん）。
// ★ お客様向けの呼び方は「フクエスポイント加盟店」（「CRM」とは書かない）。
// ★ 加盟店＝運営が /admin/points で ON にした、フクエスCRM 契約中・フクエスで公開中のお店。ON／OFF のときに作り直す（revalidatePath）。
export const revalidate = 300;
export const metadata: Metadata = {
  title: 'フクエスポイント｜来店で貯まる・1,000ptで1,000円引き',
  description: `フクエスポイント加盟店のご来店で${POINT_VISIT}pt。${POINT_USE_UNIT.toLocaleString()}ptで${POINT_USE_YEN.toLocaleString()}円引き。貯め方・使い方と加盟店の一覧。`,
  alternates: { canonical: '/points' },
};

type Shop = { id: number; name: string; area: string };

async function loadShops(): Promise<Shop[]> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc.from('salons').select('id, name, area, crm_until, is_hidden, points_member').eq('points_member', true).eq('is_hidden', false).order('id');
    if (error) return [];
    const today = getCalendarDateJST();
    return (data ?? [])
      .filter((r) => !!r.crm_until && String(r.crm_until).slice(0, 10) >= today)
      .map((r) => ({ id: Number(r.id), name: String(r.name ?? ''), area: String(r.area ?? '') }));
  } catch {
    return [];
  }
}

// ★ 第1460便（カッキーさん）: 店舗ページのテーマ「ブルー」の壁紙と色にそろえる。数字は青のグラデーション
const THEME = getTheme('blue');
const BLUE = '#2563EB';
const GRAD = 'linear-gradient(95deg,#3B82F6,#1D4ED8)';

/** テーマ「ブルー」の壁紙（店舗ページと同じ表 theme_wallpapers）。★ 読めなければ色だけ */
async function loadWallpaper(): Promise<string | null> {
  try {
    const { data } = await createServiceClient().from('theme_wallpapers').select('image_url').eq('theme_key', 'blue').maybeSingle();
    return (data?.image_url as string | undefined) ?? null;
  } catch {
    return null;
  }
}

export default async function PointsPage() {
  const [shops, wallpaperUrl] = await Promise.all([loadShops(), loadWallpaper()]);
  // 店舗ページと同じ: 壁紙をテーマの背景色で薄く覆う（固定のレイヤー・モバイルでも効く）
  const bgLayerStyle: React.CSSProperties = {
    backgroundColor: THEME.bg,
    ...(wallpaperUrl
      ? { backgroundImage: `linear-gradient(${THEME.bg}D9, ${THEME.bg}D9), url(${wallpaperUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : {}),
  };
  return (
    <div className="min-h-screen text-slate-900">
      <div aria-hidden className="fixed inset-0 -z-10" style={bgLayerStyle} />
      <header className="sticky top-0 z-50 backdrop-blur-md border-b shadow-sm" style={{ backgroundColor: `${THEME.card}E6`, borderColor: THEME.cardBorder }}>
        <div className="max-w-5xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu /><HamburgerMenu />
          </div>
        </div>
      </header>
      <SiteNoticeBanner />

      <main className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
        {/* ★ 第1460便: タイトルは店舗詳細ページの加盟店バッジと同じ形（両端が切り込んだ青いリボン・白い文字・左にコイン） */}
        <h1 className="text-center">
          <span
            className="inline-flex h-11 items-center gap-2.5 px-10 text-[22px] font-black tracking-wide text-white whitespace-nowrap"
            style={{ background: BLUE, clipPath: 'polygon(0 0, 100% 0, calc(100% - 18px) 50%, 100% 100%, 0 100%, 18px 50%)' }}
          >
            <Image src="/points/coin.png" alt="" width={34} height={34} className="h-[34px] w-[34px]" priority />
            フクエスポイント
          </span>
        </h1>
        <p className="mt-3 text-center text-sm" style={{ color: THEME.body }}>加盟店のご来店で貯まる、フクエス会員（無料）のポイントです。</p>

        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-blue-100 bg-white p-5 text-center shadow-sm">
            <p className="text-xs font-bold text-slate-400">貯まる</p>
            <p className="mt-1 text-lg font-black text-slate-800">ご来店1回で <span className="text-3xl" style={{ background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{POINT_VISIT}pt</span></p>
            {POINT_VISIT_NOTE && <p className="mt-0.5 text-xs font-bold text-blue-600">（{POINT_VISIT_NOTE}）</p>}
          </div>
          <div className="rounded-3xl border border-blue-100 bg-white p-5 text-center shadow-sm">
            <p className="text-xs font-bold text-slate-400">使える</p>
            <p className="mt-1 text-lg font-black text-slate-800"><span className="text-3xl" style={{ background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{POINT_USE_UNIT.toLocaleString()}pt</span> で {POINT_USE_YEN.toLocaleString()}円引き</p>
            <p className="mt-0.5 text-xs text-slate-500">税込・1回のご来店で{POINT_USE_YEN.toLocaleString()}円まで</p>
          </div>
        </section>

        {/* ★ 第1461便（カッキーさん「もっと端的に短く」）: 説明は箇条書きで短く。細かい決まりは最後の「ご注意」にまとめる */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-600">
          <h2 className="mb-2 text-base font-bold" style={{ color: THEME.heading }}>キャンペーン中</h2>
          <ul className="mb-5 space-y-1">
            <li>・会員登録で <b>{POINT_SIGNUP}pt</b></li>
            <li>・はじめての口コミで <b>{POINT_FIRST_REVIEW}pt</b>（承認後）</li>
          </ul>
          <h2 className="mb-2 text-base font-bold" style={{ color: THEME.heading }}>貯め方</h2>
          <ol className="mb-1 space-y-1">
            <li>1. 加盟店のお部屋の QR コードを読む</li>
            <li>2. 「{POINT_VISIT}pt を受け取る」を押す</li>
          </ol>
          <p className="mb-5 text-xs text-slate-500">※ 押し忘れても、{POINT_CLAIM_HOURS}時間以内なら会員ページで受け取れます</p>
          <h2 className="mb-2 text-base font-bold" style={{ color: THEME.heading }}>使い方</h2>
          <ol className="mb-1 space-y-1">
            <li>1. ご予約のときに「フクエスポイントを使います」と伝える</li>
            <li>2. QR コードを読んだ画面で「{POINT_USE_UNIT.toLocaleString()}pt 使う」を押す</li>
            <li>3. お支払いの前に、その画面をセラピストに見せる</li>
          </ol>
          <p className="mb-5 text-xs text-slate-500">※ お店のクーポンと併用可能です</p>
          <h2 className="mb-2 text-base font-bold" style={{ color: THEME.heading }}>ご注意</h2>
          <ul className="space-y-1">
            <li>・来店ポイントは1日1回まで</li>
            <li>・有効期限は、最後に貯めた日から1年</li>
          </ul>
          <Link href="/member/points" className="mt-4 inline-block font-bold text-blue-600 hover:underline">自分のポイントを見る →</Link>
        </section>

        <section className="mt-8">
          {/* ★ 第1461便: 見出しもタイトルと同じ形のリボン（小さめ・白い文字・左にコイン） */}
          <h2 className="mb-3">
            <span
              className="inline-flex h-8 items-center gap-1.5 px-7 text-[15px] font-bold tracking-wide text-white whitespace-nowrap"
              style={{ background: BLUE, clipPath: 'polygon(0 0, 100% 0, calc(100% - 13px) 50%, 100% 100%, 0 100%, 13px 50%)' }}
            >
              <Image src="/points/coin.png" alt="" width={24} height={24} className="h-6 w-6" />
              フクエスポイント加盟店
            </span>
          </h2>
          {shops.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white/40 py-10 text-center text-sm text-slate-400">加盟店は準備中です</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {shops.map((s) => (
                <li key={s.id}>
                  <Link href={`/salon/${s.id}`} className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-sm transition-all hover:border-blue-300 hover:shadow-md">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-800">{s.name}</span>
                      {s.area && <span className="text-xs text-slate-400">{areaLabel(s.area)}</span>}
                    </span>
                    <span className="flex-none text-xs font-bold text-blue-600">見る →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <SiteFooter inner="max-w-3xl" />
    </div>
  );
}
