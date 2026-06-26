'use client';

// /cast「今すぐ」タブ：セラピスト本人がキャスト専用枠（is_available_now_cast / available_until_cast）を
// 自分で ON/OFF する。ON で30分有効・自動失効。判定はマウント時＋1分ごとの現在時刻で行う（ISR焼き付き回避）。
// このタブはキャスト枠のみを扱う（オーナー枠 is_available_now は考慮しない。公開側の和集合は次ステップ）。

import { useEffect, useState } from 'react';
import { setCastImasugu } from '@/app/actions/castImasugu';
import { isFrameLive } from '@/lib/imasugu';
import { getScheduleStatus } from '@/app/components/TherapistScroller';

type TodaySchedule = { is_active: boolean; start_time: string | null; end_time: string | null };

// 受付中か（キャスト枠が有効か）：フラグON かつ 期限が未来。
function isCastImasuguLive(on: boolean, until: string | null): boolean {
  return on && until != null && new Date(until).getTime() > Date.now();
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export function CastImasugu({
  initialOn,
  initialUntil,
  ownerOn,
  ownerUntil,
  today,
}: {
  initialOn: boolean;
  initialUntil: string | null;
  ownerOn: boolean;
  ownerUntil: string | null;
  today: TodaySchedule;
}) {
  // until を真実の状態として持つ（ON/OFFは until の有無＋未来かで判定）。
  const [until, setUntil] = useState<string | null>(
    isCastImasuguLive(initialOn, initialUntil) ? initialUntil : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // 現在時刻（残り時間・自動失効の再評価用）。1分ごとに更新。
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const live = until != null && new Date(until).getTime() > now;
  const remainingMin = live
    ? Math.min(30, Math.max(0, Math.ceil((new Date(until!).getTime() - now) / 60000)))
    : 0;
  // 排他制御：オーナー枠がライブなら本人は設定できない（お店が設定中）。
  const ownerLive = isFrameLive(ownerOn, ownerUntil, new Date(now));
  // 出勤中判定：オーナー側と同じ getScheduleStatus(today).status === 'onDuty'。
  // getScheduleStatus は内部で現在JST時刻を参照するため、now（1分ごと更新）の再描画で再評価される。
  void now;
  const onDuty = getScheduleStatus(today).status === 'onDuty';
  // 新規にONできる条件：出勤中 かつ オーナー枠が設定中でない。
  const canTurnOn = onDuty && !ownerLive;

  const handle = async (on: boolean) => {
    // 出勤時間外・オーナー設定中のときは ON を呼ばせない（OFF＝自分の枠の解除は常に許可）。
    if (on && !canTurnOn) return;
    setLoading(true);
    setError('');
    try {
      const res = await setCastImasugu(on);
      if (!res.ok) { setError(res.error); return; }
      setUntil(res.availableUntil);
      setNow(Date.now());
    } catch {
      setError('通信エラーが発生しました。時間をおいて再度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-pink-100 shadow-sm p-6 space-y-4">
      {live ? (
        <div className="space-y-4 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-50 border border-pink-200">
            <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
            <span className="text-sm font-bold text-pink-600">今すぐ受付中です</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="font-bold text-slate-700">{formatTime(until!)}</span> まで有効
            <span className="mx-1 text-slate-300">/</span>
            あと <span className="font-bold text-slate-700">{remainingMin}</span> 分
          </p>
          <button
            type="button"
            onClick={() => handle(false)}
            disabled={loading}
            className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold hover:border-rose-300 hover:text-rose-500 transition-colors disabled:opacity-50"
          >
            {loading ? '処理中...' : '受付を終了する'}
          </button>
        </div>
      ) : ownerLive ? (
        // オーナーが今すぐ設定中：本人は操作不可（相手の枠は本人が解除しない）。
        <div className="space-y-3 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span className="text-sm font-bold text-slate-500">お店が「今すぐ」を設定中です</span>
          </div>
          <p className="text-[12px] text-slate-400 leading-relaxed">
            お店が設定した「今すぐ」が有効な間は、本人からの設定はできません。<br />
            お店の設定は時間が経つと自動で解除されます。
          </p>
        </div>
      ) : !onDuty ? (
        // 出勤時間外（出勤前・退勤後・本日出勤なし）：本人は設定できない。
        <div className="space-y-3 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span className="text-sm font-bold text-slate-500">出勤時間外です</span>
          </div>
          <p className="text-[12px] text-slate-400 leading-relaxed">
            出勤時間内のみ「今すぐ」を受付できます。<br />
            出勤予定の時間になってから設定してください。
          </p>
          <button
            type="button"
            disabled
            className="w-full py-3 rounded-xl text-white text-sm font-bold shadow-sm opacity-50 cursor-not-allowed"
            style={{ background: 'linear-gradient(to right, #ec4899, #f97316)' }}
          >
            今すぐ受付中にする
          </button>
        </div>
      ) : (
        <div className="space-y-4 text-center">
          <p className="text-sm font-bold text-slate-600">今すぐ受付中ではありません</p>
          <button
            type="button"
            onClick={() => handle(true)}
            disabled={loading}
            className="w-full py-3 rounded-xl text-white text-sm font-bold shadow-sm disabled:opacity-50"
            style={{ background: 'linear-gradient(to right, #ec4899, #f97316)' }}
          >
            {loading ? '処理中...' : '今すぐ受付中にする'}
          </button>
        </div>
      )}

      {error && (
        <p className="text-[12px] text-rose-500 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2 text-center">
          {error}
        </p>
      )}

      <p className="text-[11px] text-slate-400 leading-relaxed">
        「今すぐ受付中」にすると、30分間サイトに「今すぐ」と表示されます。30分後に自動で解除されます。
      </p>
    </div>
  );
}
