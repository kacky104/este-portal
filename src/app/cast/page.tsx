import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/app/lib/supabase/server';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import { CastSignOutButton } from './CastSignOutButton';
import { CastThemeProvider } from './CastTheme';
import { CastTabs } from './CastTabs';
import { getLinkedXProfileForTherapist } from '@/app/lib/xLink';

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
    .select('id, name, salon_id, profile_image_url, cast_theme, is_available_now_cast, available_until_cast, is_available_now, available_until')
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

  return (
    <CastThemeProvider initialTheme={(therapist?.cast_theme as string | null) ?? null}>
      <header className="bg-white border-b border-slate-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <span className="flex items-baseline gap-1">
            <span className="font-bold text-[20px] tracking-wide leading-none inline-block" style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>フクエス</span>
            <span className="text-[12px] font-normal leading-none text-slate-400">セラピスト</span>
          </span>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold hover:border-pink-300 hover:text-pink-600 transition-colors"
            >
              サイトを見る
            </Link>
            <CastSignOutButton />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {therapist ? (
          <div className="space-y-5">
            <div className="bg-white rounded-3xl border border-pink-100 shadow-sm p-6 space-y-2 text-center">
              {/* 円形プロフィール画像（スタイルはピックアップサロンのセラピスト円形サムネを踏襲：白枠＋影） */}
              {therapist.profile_image_url ? (
                <div className="relative w-24 h-24 mx-auto rounded-full border-2 border-white overflow-hidden shadow-md ring-1 ring-pink-100">
                  <Image
                    src={therapist.profile_image_url}
                    alt={therapist.name ?? 'セラピスト'}
                    fill
                    className="object-cover"
                    sizes="96px"
                  />
                </div>
              ) : (
                // 画像未設定時の控えめなプレースホルダー（淡ピンク円＋イニシャル）
                <div className="w-24 h-24 mx-auto rounded-full border-2 border-white shadow-md ring-1 ring-pink-100 bg-pink-50 flex items-center justify-center">
                  <span className="text-2xl font-black text-pink-300">
                    {(therapist.name ?? '').charAt(0) || '♡'}
                  </span>
                </div>
              )}
              <p className="text-xs font-bold text-pink-500 pt-1">こんにちは</p>
              <h1 className="text-xl font-black text-slate-800">{therapist.name ?? '(名前未設定)'} さん</h1>
              {salonName && <p className="text-xs text-slate-400 font-medium">{salonName}</p>}
            </div>

            {/* 3タブ（写メ日記／着せ替え／今すぐ）。挨拶ブロックは上に常時表示のまま。 */}
            <CastTabs
              therapistId={String(therapist.id)}
              therapistName={therapist.name ?? ''}
              salonId={Number(therapist.salon_id)}
              xProfileId={xProfileId}
              xHandle={xHandle}
              imasuguOn={Boolean(therapist.is_available_now_cast)}
              imasuguUntil={(therapist.available_until_cast as string | null) ?? null}
              ownerImasuguOn={Boolean(therapist.is_available_now)}
              ownerImasuguUntil={(therapist.available_until as string | null) ?? null}
              today={today}
            />
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
