import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { IMASUGU_COLUMNS } from '@/lib/therapistColumns';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import { FUKUES_ORIGIN } from '@/lib/crmHost';
import { getRecordMonth } from '@/app/actions/castCustomers';
import { isCastScheduleEnabled } from '@/app/actions/castSchedule';
import { isCastShiftEnabled } from '@/app/actions/shift';
import { CastThemeProvider } from './CastTheme';
import { CastTabs } from './CastTabs';
import { CastViewProvider } from './CastView';

// ★ 第1777便（カッキーさん・2026-11-08）: 店舗オーナー様が、自分の店のセラピストのセラピストページ（/cast）を【見るだけ】で開く画面。
//   入口: コネックエフ（conecf.com/cast-view/ID）とフクエスのマイページ（/mypage/cast-view/ID）。
//   ★ 中身は本人の /cast と同じ部品（CastTabs）。★ 読み取りは viewAs を付けて、サーバーが「その店のオーナー様か運営か」を確かめる（lib/castTarget.ts）。
//   ★ 投稿・記録・保存・今すぐ・ニックネームのボタンは出さない（CastView の readOnly）。★ 書き込みは本人以外サーバーが断る。

function Notice({ title, body, backHref }: { title: string; body: string; backHref: string }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-16">
      <div className="max-w-md mx-auto bg-white border border-slate-200 p-6 space-y-3 text-center">
        <p className="text-[16px] font-bold text-slate-700">{title}</p>
        <p className="text-[14px] text-slate-500 leading-relaxed">{body}</p>
        <Link href={backHref} className="inline-block mt-2 px-5 py-2.5 bg-slate-700 text-white text-[14px] font-bold">戻る</Link>
      </div>
    </div>
  );
}

export async function CastOwnerView({ therapistId, backHref }: { therapistId: string; backHref: string }) {
  const id = Number(therapistId);
  if (!Number.isInteger(id) || id <= 0) return <Notice title="セラピストが見つかりません" body="一覧から開き直してください。" backHref={backHref} />;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <Notice title="ログインしてください" body="店舗オーナー様のアカウントでログインしてから開いてください。" backHref={backHref} />;

  const svc = createServiceClient();
  const { data: therapist } = await svc
    .from('therapists')
    .select(`id, name, salon_id, user_id, profile_image_url, cast_theme, ${IMASUGU_COLUMNS}`)
    .eq('id', id)
    .maybeSingle();
  const salonId = therapist?.salon_id != null ? Number(therapist.salon_id) : null;
  let salonName: string | null = null;
  let allowed = false;
  if (therapist && salonId != null) {
    const { data: salon } = await svc.from('salons').select('name, owner_id').eq('id', salonId).maybeSingle();
    salonName = (salon?.name as string | null) ?? null;
    allowed = user.id === ADMIN_UUID || (!!salon && (salon.owner_id as string | null) === user.id);
  }
  // ★ ほかの店のセラピストは「見つかりません」と同じ答え（在否を答えない）
  if (!therapist || salonId == null || !allowed) {
    return <Notice title="セラピストが見つかりません" body="ご自分の店舗のセラピストだけ開けます。" backHref={backHref} />;
  }
  if (!therapist.user_id) {
    return <Notice title="まだセラピストページと連携していません" body={`${therapist.name ?? 'このセラピスト'}さんが招待からログインすると、ここで見られるようになります。`} backHref={backHref} />;
  }

  const businessDate = getBusinessDateJST();
  const [schedRes, diaryRes, month, wpRes, castScheduleEnabled, castShiftEnabled] = await Promise.all([
    svc.from('therapist_schedules').select('is_active, start_time, end_time').eq('therapist_id', id).eq('schedule_date', businessDate).maybeSingle(),
    svc.from('diary_posts').select('id', { count: 'exact', head: true }).eq('therapist_id', id)
      .gte('created_at', new Date(`${businessDate}T06:00:00+09:00`).toISOString()),
    getRecordMonth(businessDate.slice(0, 7), id),
    supabase.from('theme_wallpapers').select('theme_key, image_url'),
    isCastScheduleEnabled(id),
    isCastShiftEnabled(salonId),
  ]);
  const sched = schedRes.data;
  const today = {
    is_active: Boolean(sched?.is_active),
    start_time: sched?.start_time ? String(sched.start_time).slice(0, 5) : null,
    end_time: sched?.end_time ? String(sched.end_time).slice(0, 5) : null,
  };
  const todayReward = month.ok ? month.days[businessDate]?.total ?? 0 : 0;
  const todayRewardCount = month.ok ? month.days[businessDate]?.count ?? 0 : 0;
  const wallpapers: Record<string, string> = {};
  for (const r of wpRes.data ?? []) {
    const k = String((r as { theme_key?: unknown }).theme_key ?? '');
    const u = String((r as { image_url?: unknown }).image_url ?? '');
    if (k && u) wallpapers[k] = u;
  }
  const name = (therapist.name as string | null) ?? '';

  return (
    <CastThemeProvider initialTheme={(therapist.cast_theme as string | null) ?? null} wallpapers={wallpapers} readOnly>
      <header className="sticky top-0 z-30 bg-amber-400 text-slate-900 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-2.5 flex items-center gap-3">
          <p className="min-w-0 flex-1 text-[13px] leading-snug">
            <b className="text-[14px]">オーナーとして「{name || '（名前なし）'}」さんのセラピストページを見ています</b>
            <span className="block text-[12px]">見るだけです。投稿・記録・保存はできません。</span>
          </p>
          <a href={`${FUKUES_ORIGIN}/therapist/${id}`} target="_blank" rel="noopener noreferrer"
            className="flex-none px-3 py-1.5 border border-slate-900/30 bg-white text-[12px] font-bold whitespace-nowrap">サイトを見る</a>
          <Link href={backHref} className="flex-none px-3 py-1.5 bg-slate-900 text-white text-[12px] font-bold whitespace-nowrap">戻る</Link>
        </div>
      </header>

      <main className="relative max-w-2xl mx-auto px-4 pt-5 md:pt-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8">
        <div className="space-y-5">
          <div className="bg-white/90 backdrop-blur rounded-3xl border border-pink-100 shadow-sm px-2 py-3.5 flex items-center gap-3.5">
            {therapist.profile_image_url ? (
              <div className="relative w-16 h-16 shrink-0 rounded-full border-2 border-white overflow-hidden shadow-md ring-1 ring-pink-100">
                <Image src={therapist.profile_image_url as string} alt={name || 'セラピスト'} fill className="object-cover" sizes="64px" />
              </div>
            ) : (
              <div className="w-16 h-16 shrink-0 rounded-full border-2 border-white shadow-md ring-1 ring-pink-100 bg-pink-50 flex items-center justify-center">
                <span className="text-xl font-black text-pink-300">{name.charAt(0) || '♡'}</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-black text-slate-800 leading-tight truncate">{name || '(名前未設定)'} さん</h1>
              {salonName && <p className="mt-0.5 text-[11px] text-slate-400 font-medium truncate">{salonName}</p>}
            </div>
          </div>

          <CastViewProvider value={{ viewAs: id, readOnly: true }}>
            <CastTabs
              therapistId={String(id)}
              therapistName={name}
              salonId={salonId}
              xProfileId={null}
              imasuguOn={Boolean(therapist.is_available_now_cast)}
              imasuguUntil={(therapist.available_until_cast as string | null) ?? null}
              ownerImasuguOn={Boolean(therapist.is_available_now)}
              ownerImasuguUntil={(therapist.available_until as string | null) ?? null}
              importImasuguOn={Boolean(therapist.is_available_now_import)}
              importImasuguUntil={(therapist.available_until_import as string | null) ?? null}
              today={today}
              businessDate={businessDate}
              todayReward={todayReward}
              todayRewardCount={todayRewardCount}
              diaryToday={diaryRes.count ?? 0}
              castScheduleEnabled={castScheduleEnabled}
              castShiftEnabled={castShiftEnabled}
            />
          </CastViewProvider>
        </div>
      </main>
    </CastThemeProvider>
  );
}
