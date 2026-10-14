import Link from 'next/link';
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
import { POINT_CLAIM_HOURS, POINT_FIRST_REVIEW, POINT_SIGNUP, POINT_USE_UNIT, POINT_USE_YEN, POINT_VISIT, POINT_VISIT_NOTE, REVIEW_BODY_MIN } from '@/lib/points';

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

const GRAD = 'linear-gradient(95deg,#FB923C,#DB2777)';

export default async function PointsPage() {
  const shops = await loadShops();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
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

      <main className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
        <h1 className="text-2xl font-bold leading-tight inline-block" style={{ background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>
          フクエスポイント
        </h1>
        <p className="mt-2 text-sm text-slate-600">フクエスポイント加盟店に行くと貯まる、フクエス会員（無料）のポイントです。</p>

        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-pink-100 bg-white p-5 text-center shadow-sm">
            <p className="text-xs font-bold text-slate-400">貯まる</p>
            <p className="mt-1 text-lg font-black text-slate-800">ご来店1回で <span className="text-3xl" style={{ background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{POINT_VISIT}pt</span></p>
            {POINT_VISIT_NOTE && <p className="mt-0.5 text-xs font-bold text-pink-600">（{POINT_VISIT_NOTE}）</p>}
          </div>
          <div className="rounded-3xl border border-pink-100 bg-white p-5 text-center shadow-sm">
            <p className="text-xs font-bold text-slate-400">使える</p>
            <p className="mt-1 text-lg font-black text-slate-800"><span className="text-3xl" style={{ background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{POINT_USE_UNIT.toLocaleString()}pt</span> で {POINT_USE_YEN.toLocaleString()}円引き</p>
            <p className="mt-0.5 text-xs text-slate-500">税込・1回のご来店で{POINT_USE_YEN.toLocaleString()}円まで</p>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-600">
          <h2 className="mb-2 text-base font-bold text-slate-700">キャンペーン中</h2>
          <ul className="mb-4 space-y-1.5">
            <li>・<b>会員登録で {POINT_SIGNUP}pt</b>（これから登録する方・確認メールのリンクで登録が終わったとき）</li>
            <li>・<b>はじめての口コミで {POINT_FIRST_REVIEW}pt</b>（{REVIEW_BODY_MIN}文字以上・運営の承認後に付きます）</li>
          </ul>
          <h2 className="mb-2 text-base font-bold text-slate-700">貯め方（ご来店）</h2>
          <ol className="space-y-1.5">
            <li>1. 加盟店のお部屋にある QR コードをスマホで読み、同意書を送ります。</li>
            <li>2. 最後の画面の「{POINT_VISIT}pt を受け取る」を押します（フクエスにログインしてください）。</li>
            <li>3. その場で受け取れなかったときも、{POINT_CLAIM_HOURS}時間以内なら、同じスマホでフクエスの会員ページから受け取れます。</li>
          </ol>
          <h2 className="mb-2 mt-5 text-base font-bold text-slate-700">使い方</h2>
          <ul className="space-y-1.5">
            <li>・ご予約のときに「フクエスポイントを使います」とお伝えください。</li>
            <li>・当日、お部屋の QR コードから同意書を送ったあとの画面で「{POINT_USE_UNIT.toLocaleString()}pt 使って {POINT_USE_YEN.toLocaleString()}円引きにする」を押し、お支払いの前にその画面をセラピストにお見せください（{POINT_USE_UNIT.toLocaleString()}pt 以上お持ちの方・1回のご来店で {POINT_USE_YEN.toLocaleString()}円まで・お店のクーポンと一緒に使えます）。</li>
            <li>・来店ポイントは1日1回まで。有効期限は、最後に貯めた日から1年です。</li>
          </ul>
          <Link href="/member/points" className="mt-3 inline-block font-bold text-pink-600 hover:underline">自分のポイントを見る →</Link>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-700">
            <span className="w-1 h-5 rounded-full" style={{ background: '#EC4899' }} />
            フクエスポイント加盟店
          </h2>
          {shops.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white/40 py-10 text-center text-sm text-slate-400">加盟店は準備中です</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {shops.map((s) => (
                <li key={s.id}>
                  <Link href={`/salon/${s.id}`} className="flex items-center gap-3 rounded-2xl border border-pink-100 bg-white px-4 py-3 shadow-sm transition-all hover:border-pink-300 hover:shadow-md">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-800">{s.name}</span>
                      {s.area && <span className="text-xs text-slate-400">{areaLabel(s.area)}</span>}
                    </span>
                    <span className="flex-none text-xs font-bold text-pink-600">見る →</span>
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
