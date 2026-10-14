import { redirect } from 'next/navigation';
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
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ensureSignupPoints, readMyPoints } from '@/app/lib/points/server';
import { POINT_FIRST_REVIEW, POINT_SIGNUP, POINT_USE_UNIT, POINT_USE_YEN, POINT_VISIT, POINT_VISIT_NOTE, REVIEW_BODY_MIN, pointsToNextUse } from '@/lib/points';
import { PendingPointsBanner } from '../PendingPointsBanner';

// 会員の「フクエスポイント」（第1444便・2026-10-14）。★ 本人の残高・期限・履歴だけ（ログイン必須・ISR なし）。
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'フクエスポイント', robots: { index: false, follow: false } };

const KIND_LABEL: Record<string, string> = { visit: '来店ポイント', signup: '会員登録', review: 'はじめての口コミ', use: 'ご利用（割引）', refund: 'ご利用の取り消し', expire: '有効期限', revoke: '取り消し', adjust: '調整' };

function day(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(iso));
}

export default async function MemberPointsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/member/points');
  await ensureSignupPoints(createServiceClient(), user); // ★ 第1450便
  const p = await readMyPoints(createServiceClient(), user.id);
  const balance = p?.balance ?? 0;
  const toNext = pointsToNextUse(balance);
  const usable = Math.floor(balance / POINT_USE_UNIT);

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
        <nav className="flex items-center gap-1.5 text-[13px] text-slate-400 mb-3" aria-label="パンくずリスト">
          <Link href="/member" className="hover:text-pink-600 transition-colors">マイページ</Link>
          <span className="text-slate-300">›</span>
          <span className="text-slate-600 font-medium">フクエスポイント</span>
        </nav>
        <h1
          className="text-2xl font-bold leading-tight inline-block mb-6"
          style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}
        >
          フクエスポイント
        </h1>

        <PendingPointsBanner />

        {!p ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">いまはポイントを読み込めません。少し時間をおいてお試しください。</p>
        ) : (
          <>
            <section className="rounded-3xl border border-pink-100 bg-white p-6 text-center shadow-sm">
              <p className="text-xs font-bold text-slate-400">いまのポイント</p>
              <p className="mt-1 text-5xl font-black tracking-tight text-slate-800">{balance.toLocaleString()}<span className="ml-1 text-xl">pt</span></p>
              <p className="mt-3 text-sm font-bold text-pink-600">
                {usable > 0
                  ? `${(usable * POINT_USE_YEN).toLocaleString()}円ぶん使えます（1回の来店で ${POINT_USE_YEN.toLocaleString()}円まで）`
                  : `あと ${toNext.toLocaleString()}pt で ${POINT_USE_YEN.toLocaleString()}円引き`}
              </p>
              <div className="mx-auto mt-3 h-2 w-full max-w-xs overflow-hidden rounded-full bg-pink-100">
                <div className="h-full rounded-full" style={{ width: `${usable > 0 ? 100 : Math.max(0, Math.min(100, (balance / POINT_USE_UNIT) * 100))}%`, background: 'linear-gradient(90deg,#FB923C,#DB2777)' }} />
              </div>
              {p.expiresAt && <p className="mt-3 text-xs text-slate-500">有効期限：{day(p.expiresAt)}（最後に貯めた日から1年）</p>}
            </section>

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-600">
              <h2 className="mb-2 text-base font-bold text-slate-700">貯め方・使い方</h2>
              <ul className="space-y-1.5">
                <li>・<b>フクエスポイント加盟店</b>で、お部屋の QR コードから同意書を送ると、来店ポイント <b>{POINT_VISIT}pt</b>{POINT_VISIT_NOTE ? `（${POINT_VISIT_NOTE}）` : ''} を受け取れます（1日1回まで）。</li>
                <li>・<b>{POINT_USE_UNIT.toLocaleString()}pt で {POINT_USE_YEN.toLocaleString()}円引き</b>（税込）。加盟店で、ご予約のときにお伝えください。当日は同意書を送ったあとの画面で「{POINT_USE_UNIT.toLocaleString()}pt 使う」を押し、お支払いの前にその画面をセラピストにお見せください（1回の来店で {POINT_USE_YEN.toLocaleString()}円まで）。</li>
                <li>・キャンペーン中：<b>会員登録で {POINT_SIGNUP}pt</b>・<b>はじめての口コミで {POINT_FIRST_REVIEW}pt</b>（{REVIEW_BODY_MIN}文字以上・運営の承認後）。</li>
                <li>・有効期限は、最後に貯めた日から1年です。</li>
              </ul>
              <Link href="/points" className="mt-3 inline-block font-bold text-pink-600 hover:underline">加盟店を見る →</Link>
            </section>

            <section className="mt-6">
              <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-700">
                <span className="w-1 h-5 rounded-full" style={{ background: '#EC4899' }} />
                履歴
              </h2>
              {p.rows.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-white/40 py-10 text-center text-sm text-slate-400">まだありません</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
                  {p.rows.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <span className="w-24 flex-none text-xs text-slate-400">{day(r.createdAt)}</span>
                      {/* ★ 第1448便: 店名を2行目に（スマホで見切れていた）。★ 第1449便: 店名は1行に収め、はみ出す分は「…」（3行目に行かない） */}
                      <span className="min-w-0 flex-1 text-slate-700">
                        <span className="block">{KIND_LABEL[r.kind] ?? r.kind}</span>
                        {r.salonName && <span className="block truncate text-xs text-slate-500" title={r.salonName}>{r.salonName}</span>}
                      </span>
                      <span className={`flex-none font-bold ${r.delta > 0 ? 'text-pink-600' : 'text-slate-500'}`}>
                        {r.delta > 0 ? '+' : ''}{r.delta.toLocaleString()}pt
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
      <SiteFooter inner="max-w-3xl" />
    </div>
  );
}
