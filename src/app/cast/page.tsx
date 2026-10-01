import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/app/lib/supabase/server';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import { CastSignOutButton } from './CastSignOutButton';
import { CastHintPopover } from './CastHintPopover';
import { CastThemeProvider } from './CastTheme';
import { CastTabs } from './CastTabs';
import { getLinkedXProfileForTherapist } from '@/app/lib/xLink';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { IMASUGU_COLUMNS } from '@/lib/therapistColumns';
import { getRecordMonth } from '@/app/actions/castCustomers';
import { isCastScheduleEnabled } from '@/app/actions/castSchedule';
import { CastXIcon } from './CastXIcon';
import { fetchTherapistWeeklyRanking } from '@/app/lib/ranking';
import { getTherapistReviewRanking } from '@/app/lib/reviews';

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
  let xVerified = false; // ★ 第1058便: 赤い認証バッジ（is_verified）。開設済みで未取得の子にだけ加点の案内を出す
  if (therapist) {
    const linked = await getLinkedXProfileForTherapist(user.id);
    xProfileId = linked?.profileId ?? null;
    xHandle = linked?.handle ?? null;
    xVerified = linked?.isVerified ?? false;
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

  // ★ 第524便: 今日のまとめ（報酬・日記）。★ 読めなくてもページは出す（0 のまま）
  const businessDate = getBusinessDateJST();
  let todayReward = 0;
  let todayRewardCount = 0;
  let diaryToday = 0;
  if (therapist?.id != null) {
    const [month, diary] = await Promise.all([
      getRecordMonth(businessDate.slice(0, 7)),
      supabase
        .from('diary_posts')
        .select('id', { count: 'exact', head: true })
        .eq('therapist_id', therapist.id)
        .gte('created_at', new Date(`${businessDate}T06:00:00+09:00`).toISOString()),
    ]);
    if (month.ok) {
      todayReward = month.days[businessDate]?.total ?? 0;
      todayRewardCount = month.days[businessDate]?.count ?? 0;
    }
    diaryToday = diary.count ?? 0;
  }

  // ★ 第916便（カッキーさん）: セラピストランキング（/ranking と同じ今週の順位・TOP200 ※第1070便で150→200）。圏外は null＝何も出さない。
  //   ★ 読めなくてもページは出す。
  // ★ 第917便: 口コミ数ランキング（/reviews のセラピストタブ・TOP50）と殿堂入り（口コミ21件以上）も。
  //   ★ 殿堂入りの人はランキングから外れる（/reviews と同じ）＝どちらか一方だけが出る。圏外・口コミなしは出さない。
  let weeklyRank: number | null = null;
  let reviewRank: number | null = null;
  let hallOfFameCount: number | null = null;
  if (therapist?.id != null) {
    const tid = Number(therapist.id);
    const [pop, rev] = await Promise.all([
      fetchTherapistWeeklyRanking(200).catch(() => null),
      getTherapistReviewRanking().catch(() => null),
    ]);
    weeklyRank = pop?.find((t) => t.id === tid)?.rank ?? null;
    reviewRank = rev?.ranking.find((t) => t.id === tid)?.rank ?? null;
    hallOfFameCount = rev?.hallOfFame.find((t) => t.id === tid)?.reviewCount ?? null;
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
      <header className="sticky top-0 z-30 bg-white/75 backdrop-blur-md border-b border-white/60">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="flex items-baseline gap-1 shrink-0">
            <span className="font-bold text-[20px] tracking-wide leading-none inline-block" style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>フクエス</span>
          </span>
          <div className="flex items-center gap-2">
            {/* ★ 第1061便（カッキーさん）: fukuX の加点の案内は「？」アイコンから。
                未開設の子＝「サイトを見る」の左（紫・開設+10）／開設済みで赤バッジがまだの子＝fukuX アイコンの左（赤・赤バッジ+5）。
                赤バッジを取ったら「？」は出ない。 */}
            {therapist && !xHandle && <CastHintPopover kind="open" />}
            {xHandle && !xVerified && <CastHintPopover kind="badge" />}
            {/* ★ 第516便: fukuX はタブから外してヘッダーの丸いアイコンに（スマホの下タブを5つに収めるため）。連携 handle があるときだけ */}
            {xHandle && <CastXIcon handle={xHandle} profileId={xProfileId} />}
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
        {/* ★ 第883便（カッキーさん）: fukuX のアカウントを持っている人（連携 handle あり）にはバナーを出さない。★ 行き先はヘッダーの丸いアイコン */}
        {therapist && !xHandle && (
          <Link
            href="/x"
            aria-label="fukuX（フクエックス）メンズエステ専用SNS"
            className="hidden xl:block absolute top-8 left-full ml-6 w-[280px] rounded-2xl overflow-hidden shadow-md ring-1 ring-black/5 transition-transform hover:-translate-y-0.5"
          >
            <Image src="/fukux-cast-banner.webp" alt="fukuX（フクエックス）メンズエステ専用SNS" width={1200} height={630} sizes="280px" className="block w-full h-auto" />
          </Link>
        )}
        {therapist ? (
          <div className="space-y-5">
            {/* ★ 第1061便: fukuX の加点の案内カード（開設+10／赤バッジ+5）は、本文からヘッダーの「？」（CastHintPopover）へ移した。 */}
            {/* ★ 第516便: 挨拶カードを横長にして高さを約1/3に（スマホの1画面目にタブの中身まで入るように）。
                左に写真・右に名前と店名。★ 第524便: 本日の出勤の札は「今日のまとめ」へ移した。 */}
            <div className="bg-white/90 backdrop-blur rounded-3xl border border-pink-100 shadow-sm px-2 py-3.5 flex items-center gap-3.5">
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
              </div>
              {/* ★ 第916便: セラピストランキングの順位（TOP200 に入っているときだけ）。押すと /ranking のセラピストタブ
                  ★ 第917便: 右に口コミ数ランキング（TOP50）か殿堂入り。★ どれも該当しないときは何も出さない */}
              {(weeklyRank != null || reviewRank != null || hallOfFameCount != null) && (
                <div className="shrink-0 flex items-stretch gap-1">
                  {weeklyRank != null && (
                    <RankChip
                      href="/ranking#therapist"
                      label={(weeklyRank <= 3 ? '👑 ' : '') + '人気'}
                      value={String(weeklyRank)}
                      unit="位"
                      ariaLabel={`セラピストランキング 今週${weeklyRank}位`}
                      style={medalStyle(weeklyRank, { background: '#FDF2F8', borderColor: '#FBCFE8', color: '#DB2777' })}
                    />
                  )}
                  {reviewRank != null && (
                    <RankChip
                      href="/reviews#therapist"
                      label={(reviewRank <= 3 ? '👑 ' : '') + '口コミ数'}
                      value={String(reviewRank)}
                      unit="位"
                      ariaLabel={`口コミ数ランキング ${reviewRank}位`}
                      style={medalStyle(reviewRank, { background: '#F8FAFC', borderColor: '#CBD5E1', color: '#475569' })}
                    />
                  )}
                  {hallOfFameCount != null && (
                    <RankChip
                      href="/reviews#hall"
                      label="👑 口コミ"
                      value="殿堂入り"
                      unit=""
                      small
                      ariaLabel={`口コミ殿堂入り（口コミ${hallOfFameCount}件）`}
                      style={{ background: 'linear-gradient(135deg,#7F1D1D,#1C1917)', borderColor: '#D4A017', color: '#F7C948' }}
                    />
                  )}
                </div>
              )}
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
              businessDate={businessDate}
              todayReward={todayReward}
              todayRewardCount={todayRewardCount}
              diaryToday={diaryToday}
              castScheduleEnabled={await isCastScheduleEnabled()}
            />

            {/* ★ 第495便: fukuX のバナー（スマホ・タブレット）。★ 第522便: 遷移先は本人の fukuX（連携が無ければ /x）。★ タブの中身の下に少し空けて置く。PC（xl 以上）は右横に出すので隠す */}
            {/* ★ 第883便: fukuX のアカウントを持っている人には出さない（PC と同じ） */}
            {!xHandle && (
              <Link
                href="/x"
                aria-label="fukuX（フクエックス）メンズエステ専用SNS"
                className="xl:hidden block mt-8 rounded-2xl overflow-hidden shadow-md ring-1 ring-black/5"
              >
                <Image src="/fukux-cast-banner.webp" alt="fukuX（フクエックス）メンズエステ専用SNS" width={1200} height={630} sizes="(max-width: 672px) 100vw, 640px" className="block w-full h-auto" />
              </Link>
            )}
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

// ★ 第917便: /cast の挨拶カード右の小さな札（人気・口コミ数・殿堂入り）。
function medalStyle(rank: number, fallback: React.CSSProperties): React.CSSProperties {
  if (rank === 1) return { background: 'linear-gradient(135deg,#FFF7D6,#F7C948)', borderColor: '#E8A317', color: '#5A3E00' };
  if (rank === 2) return { background: 'linear-gradient(135deg,#F8F9FA,#C9CDD3)', borderColor: '#9AA0A6', color: '#3A3F45' };
  if (rank === 3) return { background: 'linear-gradient(135deg,#FBE7D3,#D89C66)', borderColor: '#B87333', color: '#4A2A10' };
  return fallback;
}

function RankChip({ href, label, value, unit, ariaLabel, style, small = false }: {
  href: string; label: string; value: string; unit: string; ariaLabel: string; style: React.CSSProperties; small?: boolean;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className="flex flex-col items-center justify-center w-[60px] px-0 py-1.5 rounded-xl border shadow-sm hover:opacity-90 transition-opacity"
      style={style}
    >
      <span className="text-[9px] font-bold leading-none whitespace-nowrap">{label}</span>
      <span className="mt-1 leading-none font-black whitespace-nowrap">
        <span className={small ? 'text-[12px]' : 'text-[22px]'}>{value}</span>
        {unit && <span className="text-[11px] ml-0.5">{unit}</span>}
      </span>
    </Link>
  );
}
