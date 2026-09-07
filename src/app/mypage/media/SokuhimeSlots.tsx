'use client';

import { useCallback, useEffect, useState } from 'react';
import { getMediaSokuhime, startMediaSokuhimeRead } from '@/app/actions/mediaCredentials';
import type { SokuhimeSnapshotView } from '@/lib/ekichikaSokuhimeParse';
import { sokuhimeSummaryLabel } from '@/lib/ekichikaSokuhimeParse';

// 駅ちかの即ヒメ枠（第213便・2026-09-08）。★ 読むだけ。★ 「出勤を送る」の下に置く。
// ★ 第49便の作法「直す前に、まず見えることを作る」。★ 押す側（今すぐ→即ヒメ）は次の便。
// ★ 写しが無いときは「まだ読んでいません」。★ 「0/0」と出さない（0件と分からないを混ぜない）。

function fmt(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(t));
}
function fmtUnix(sec: number | null): string {
  if (sec === null) return '';
  return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(sec * 1000));
}

export function SokuhimeSlots({ salonId, hasCredential, onToast }: {
  salonId: number | null;
  /** 駅ちかのログイン情報があるか。★ 無ければこの箱は出さない（読む相手がいない） */
  hasCredential: boolean;
  onToast: (m: string) => void;
}) {
  const [snap, setSnap] = useState<SokuhimeSnapshotView | null>(null);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);

  const load = useCallback(async () => {
    if (salonId == null) return;
    const r = await getMediaSokuhime({ salonId });
    if (r.ok) setSnap(r.data);
    setLoading(false);
  }, [salonId]);

  useEffect(() => { void load(); }, [load]);

  if (salonId == null || !hasCredential) return null;

  const onRead = async () => {
    if (salonId == null) return;
    setReading(true);
    try {
      const r = await startMediaSokuhimeRead({ salonId });
      if (!r.ok) { onToast(r.error); return; }
      onToast('駅ちかの即ヒメ設定を読みに行きました。数分後にこの画面を開き直すと出ます');
    } finally { setReading(false); }
  };

  const nowUnix = Math.floor(Date.now() / 1000);

  return (
    <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className="text-[16px] font-bold text-slate-700">駅ちかの即ヒメ枠</h3>
        {snap && <span className="text-[13px] text-slate-400">{fmt(snap.readAtISO)} に確認</span>}
      </div>
      {/* ★ いまは読むだけ。★ 「今すぐ」→即ヒメ の送信は次の便。★ 嘘を書かない */}
      <p className="text-[13px] text-slate-400 leading-relaxed">
        駅ちかの管理画面「即ヒメ設定」の枠を読んで写します（読むだけ・書き換えません）。
        フクエスの「今すぐ」を駅ちかの即ヒメへ送る機能は準備中です。
      </p>

      {loading ? (
        <p className="text-[14px] text-slate-400">読み込み中…</p>
      ) : !snap ? (
        <p className="text-[14px] text-slate-500">まだ読んでいません。「読み直す」を押すと、枠の数と設定中の方が出ます。</p>
      ) : (
        <>
          <p className="text-[15px] font-bold text-slate-800">
            {sokuhimeSummaryLabel(snap)}
            {snap.countedPlan && snap.remainingCount !== null && (
              <span className="ml-2 text-[13px] font-medium text-slate-400">今日の残り回数 {snap.remainingCount}回</span>
            )}
          </p>
          <ul className="border border-slate-200 divide-y divide-slate-100">
            {snap.boxes.map((b) => {
              const expired = b.expiresAtUnix !== null && b.expiresAtUnix <= nowUnix;
              return (
                <li key={b.index} className="px-3 py-2 flex items-center gap-3 text-[14px]">
                  <span className="text-[12px] font-bold text-slate-400 w-[42px]">枠{b.index + 1}</span>
                  {b.girlId ? (
                    <>
                      <span className="font-bold text-slate-700">{b.name ?? `番号 ${b.girlId}`}</span>
                      <span className={`text-[12.5px] ${expired ? 'text-slate-400' : 'text-emerald-700 font-bold'}`}>
                        {expired ? `${fmtUnix(b.expiresAtUnix)} に切れました（次に読むと空きになります）` : `${b.untilLabel ?? fmtUnix(b.expiresAtUnix)} まで`}
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-400">空き</span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-[13px] text-slate-400 leading-relaxed">
            出勤中 {snap.working.length}名（駅ちかの「出勤中女の子一覧」）。即ヒメは押してから45分で消えます。
          </p>
        </>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRead}
          disabled={reading}
          className="text-[13px] font-bold px-3 py-1.5 border border-slate-200 text-slate-600 disabled:opacity-50"
        >
          {reading ? '読みに行っています…' : '読み直す'}
        </button>
      </div>
    </div>
  );
}
