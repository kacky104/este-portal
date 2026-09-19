import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/app/lib/supabase/server';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import { CastSignOutButton } from './CastSignOutButton';
import { CastThemeProvider } from './CastTheme';
import { CastTabs } from './CastTabs';
import { getLinkedXProfileForTherapist } from '@/app/lib/xLink';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { IMASUGU_COLUMNS } from '@/lib/therapistColumns';

// キャスト管理トップ（フェーズ1：最小実装）。
// ガードはページ内 redirect 方式（proxy.ts は触らない）。
// - 未ログイン → /cast/login。
// - ログイン済みだが user_id に紐づく therapists が無い（会員・オーナー等）→ 案内を表示して弾く。
export default async function CastHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/cast/login');

  const { data: therapist } = await supabase
    .from('therapists')
    .select(`id, name, salon_id, profile_image_url, cast_theme, ${IMASUGU_COLUMNS}`)
    .eq('user_id', user.id)
    .maybeSingle();

  // fukuX 連携：このセラピストの auth に approved な x_profiles(therapist) があれば、
  // 写メ日記を fukuX にも同時投稿できる。連携プロフィールの id（フォーク投稿の author_profile_id 用）を算出。
  // 非連携（user_id に対応する x_profiles が無い／非approved）なら null＝チェックボックス自体を出さない。
  let xProfileId: string | null = null;
  let xHandle: string | null = null; // 連携 fukuX の handle（タブ「fukuX」のリンク先。未連携/未設定は null＝タブを出さない）
  if (therapist) {
    const linked = await getLinkedXProfileForTherapist(user.id);
    xProfileId = linked?.profileId ?? null;
    xHandle = linked?.handle ?? null;
  }

  // 所属サロン名（挨拶ブロックのサブ情報）。本人セッションのクライアントで salons から取得。
  let salonName: string | null = null;
  if (therapist?.salon_id != null) {
    const { data: salon } = await supabase
      .from('salons')
      .select('name')
      .eq('id', therapist.salon_id)
      .maybeSingle();
    salonName = (salon?.name as string | null) ?? null;
  }

  // 本日（営業日基準）の出勤スケジュール。「今すぐ」タブの出勤中判定に使う
  // （オーナー側 getScheduleStatus(today) と同じ {is_active, start_time, end_time} の形）。
  let today: { is_active: boolean; start_time: string | null; end_time: string | null } = {
    is_active: false, start_time: null, end_time: null,
  };
  if (therapist?.id != null) {
    const { data: sched } = await supabase
      .from('therapist_schedules')
      .select('is_active, start_time, end_time')
      .eq('therapist_id', therapist.id)
      .eq('schedule_date', getBusinessDateJST())
      .maybeSingle();
    if (sched) {
      today = {
        is_active:  Boolean(sched.is_active),
        start_time: sched.start_time ? String(sched.start_time).slice(0, 5) : null,
        end_time:   sched.end_time   ? String(sched.end_time).slice(0, 5)   : null,
      };
    }
  }

  // ★ 第493便: 着せ替えに使う店舗テーマの壁紙（管理画面で登録・誰でも読める表）。★ 読めなければ地の色だけ
  const { data: wpRows } = await supabase.from('theme_wallpapers').select('theme_key, image_url');
  const wallpapers: Record<string, string> = {};
  for (const r of wpRows ?? []) {
    const k = String((r as { theme_key?: unknown }).theme_key ?? '');
    const u = String((r as { image_url?: unknown }).image_url ?? '');
    if (k && u) wallpapers[k] = u;
  }

  return (
    <CastThemeProvider initialTheme={(therapist?.cast_theme as string | null) ?? null} wallpapers={wallpapers}>
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="flex items-baseline gap-1 shrink-0">
            <span className="font-bold text-[20px] tracking-wide leading-none inline-block" style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>フクエス</span>
          </span>
          <div className="flex items-center gap-2">
            {/* ★ 第516便: fukuX はタブから外してヘッダーの丸いアイコンに（スマホの下タブを5つに収めるため）。連携 handle があるときだけ */}
            {xHandle && (
              <Link
                href={`/x/u/${xHandle}`}
                aria-label="fukuX の自分のページ"
                title="fukuX"
                className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center hover:border-pink-300 transition-colors"
              >
                <Image src="/fukux-mark.png" alt="" width={18} height={18} className="object-contain" />
              </Link>
            )}
            <Link
              href={therapist?.id != null ? `/therapist/${therapist.id}` : '/'}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 sm:px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold whitespace-nowrap hover:border-pink-300 hover:text-pink-600 transition-colors"
            >
              サイトを見る
            </Link>
            <CastSignOutButton />
          </div>
        </div>
      </header>
      <SiteNoticeBanner />

      <main className="relative max-w-2xl mx-auto px-4 pt-5 md:pt-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8">
        {/* ★ 第495便（カッキーさん）: fukuX のバナー（PC）。★ 本文の右横・上の空いた所に置く（xl 以上＝右に余白がある幅だけ）。
            ★ 第522便: 遷移先は本人の fukuX アカウント（/x/u/[handle]）。連携が無ければ fukuX のトップ（/x）。 */}
        {therapist && (
          <Link
            href={xHandle ? `/x/u/${xHandle}` : '/x'}
            aria-label="fukuX（フクエックス）メンズエステ専用SNS"
            className="hidden xl:block absolute top-8 left-full ml-6 w-[280px] rounded-2xl overflow-hidden shadow-md ring-1 ring-black/5 transition-transform hover:-translate-y-0.5"
          >
            <Image src="/fukux-cast-banner.webp" alt="fukuX（フクエックス）メンズエステ専用SNS" width={1200} height={630} sizes="280px" className="block w-full h-auto" />
          </Link>
        )}
        {therapist ? (
          <div className="space-y-5">
            {/* ★ 第516便: 挨拶カードを横長にして高さを約1/3に（スマホの1画面目にタブの中身まで入るように）。
                左に写真・右に名前と店名・その下に本日の出勤の札。 */}
            <div className="bg-white/90 backdrop-blur rounded-3xl border border-pink-100 shadow-sm px-4 py-3.5 flex items-center gap-3.5">
              {therapist.profile_image_url ? (
                <div className="relative w-16 h-16 shrink-0 rounded-full border-2 border-white overflow-hidden shadow-md ring-1 ring-pink-100">
                  <Image
                    src={therapist.profile_image_url}
                    alt={therapist.name ?? 'セラピスト'}
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                </div>
              ) : (
                // 画像未設定時の控えめなプレースホルダー（淡ピンク円＋イニシャル）
                <div className="w-16 h-16 shrink-0 rounded-full border-2 border-white shadow-md ring-1 ring-pink-100 bg-pink-50 flex items-center justify-center">
                  <span className="text-xl font-black text-pink-300">
                    {(therapist.name ?? '').charAt(0) || '♡'}
                  </span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-pink-500 leading-none">こんにちは</p>
                <h1 className="mt-1 text-lg font-black text-slate-800 leading-tight truncate">{therapist.name ?? '(名前未設定)'} さん</h1>
                {salonName && <p className="mt-0.5 text-[11px] text-slate-400 font-medium truncate">{salonName}</p>}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {today.is_active && today.start_time ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 text-[11px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-pink-500" />
                      本日 {today.start_time}〜{today.end_time ?? ''}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold">
                      本日の出勤なし
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 3タブ（写メ日記／着せ替え／今すぐ）。挨拶ブロックは上に常時表示のまま。 */}
            <CastTabs
              therapistId={String(therapist.id)}
              therapistName={therapist.name ?? ''}
              salonId={Number(therapist.salon_id)}
              xProfileId={xProfileId}
              imasuguOn={Boolean(therapist.is_available_now_cast)}
              imasuguUntil={(therapist.available_until_cast as string | null) ?? null}
              ownerImasuguOn={Boolean(therapist.is_available_now)}
              ownerImasuguUntil={(therapist.available_until as string | null) ?? null}
              importImasuguOn={Boolean(therapist.is_available_now_import)}
              importImasuguUntil={(therapist.available_until_import as string | null) ?? null}
              today={today}
              businessDate={getBusinessDateJST()}
            />

            {/* ★ 第495便: fukuX のバナー（スマホ・タブレット）。★ 第522便: 遷移先は本人の fukuX（連携が無ければ /x）。★ タブの中身の下に少し空けて置く。PC（xl 以上）は右横に出すので隠す */}
            <Link
              href={xHandle ? `/x/u/${xHandle}` : '/x'}
              aria-label="fukuX（フクエックス）メンズエステ専用SNS"
              className="xl:hidden block mt-8 rounded-2xl overflow-hidden shadow-md ring-1 ring-black/5"
            >
              <Image src="/fukux-cast-banner.webp" alt="fukuX（フクエックス）メンズエステ専用SNS" width={1200} height={630} sizes="(max-width: 672px) 100vw, 640px" className="block w-full h-auto" />
            </Link>
          </div>
        ) : (
          // ログインはできたが紐づくキャストが無い別種アカウント
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4 text-center">
            <p className="text-sm text-slate-700 leading-relaxed">
              このアカウントに紐づくセラピスト情報が見つかりません。
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              オーナーからの招待メールに記載のアドレスでログインしているかご確認ください。
            </p>
            <Link
              href="/cast/login"
              className="inline-block px-5 py-2.5 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-700 transition-colors"
            >
              ログインし直す
            </Link>
          </div>
        )}
      </main>
    </CastThemeProvider>
  );
}
