'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getJobLineTaps, type JobLineTap } from '@/app/actions/jobs';
import { useJobsGate } from '../useJobsGate';
import { useMyJob } from '../useMyJob';
import { WorkShell } from '../WorkShell';
import { useToast } from '@/app/components/useToast';

// LINE の履歴（第2012便・2026-11-13・オイルクエスト様のご要望・全店）。
// ★ 求人ページの「LINEで応募する」ボタンが押された・LINE の QR が読み取られた日時と件数。
// ★ エステラブワークの「電話・LINE履歴」と同じく、期間は前月1日〜今。

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const ymd = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric' }).format(d);
  const wd = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(d);
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${ymd}(${wd}) ${hm}`;
}

// 日本時間の「年月」（例 202611）
function ym(iso: string): number {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return d.getUTCFullYear() * 100 + d.getUTCMonth() + 1;
}

export default function WorkLinePage() {
  const { decision, salon, loadError } = useJobsGate();
  const { toast } = useToast();
  const salonId = salon ? salon.id : null;
  const { job, loading, loadError: jobError } = useMyJob(salonId);

  const [taps, setTaps] = useState<JobLineTap[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (salonId == null) return;
    let alive = true;
    getJobLineTaps(salonId).then((r) => {
      if (!alive) return;
      if (r.ok) setTaps(r.taps);
      else setErr(r.error);
    });
    return () => {
      alive = false;
    };
  }, [salonId]);

  const counts = useMemo(() => {
    const now = ym(new Date().toISOString());
    const prev = now % 100 === 1 ? now - 100 + 11 : now - 1;
    const c = { now: { btn: 0, qr: 0 }, prev: { btn: 0, qr: 0 } };
    for (const t of taps ?? []) {
      const k = ym(t.created_at);
      if (k === now) c.now[t.via] += 1;
      else if (k === prev) c.prev[t.via] += 1;
    }
    return c;
  }, [taps]);

  const hasLine = !!job?.apply_line_url;

  return (
    <WorkShell
      decision={decision}
      loadError={loadError}
      salonName={salon?.name ?? null}
      salonId={salonId}
      title="LINEの履歴"
      current="line"
      toast={toast}
    >
      {loading ? (
        <div className="bg-white border border-slate-200 shadow-sm p-5">
          <p className="text-[14px] text-slate-400">読み込み中です…</p>
        </div>
      ) : jobError ? (
        <div className="bg-white border border-rose-200 shadow-sm p-5">
          <p className="text-[14px] text-rose-600">求人情報の取得に失敗しました：{jobError}</p>
        </div>
      ) : (
        <>
          {!hasLine && (
            <div className="bg-amber-50 border border-amber-200 p-4 mb-4">
              <p className="text-[14px] text-amber-800 leading-relaxed">
                いまは求人ページに LINE のボタンが出ていません。「求人内容」の「応募用LINE URL」に、お店の LINE の友だち追加 URL を入れると、
                求人ページに「LINEで応募する」ボタンと（パソコンで見たときは）QRコードが出ます。
              </p>
              <Link href="/mypage/jobs/edit" className="mt-2 inline-block text-[13.5px] font-bold text-emerald-700 underline">
                求人内容を開く →
              </Link>
            </div>
          )}

          {/* 件数 */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: '今月', v: counts.now },
              { label: '先月', v: counts.prev },
            ].map((b) => (
              <div key={b.label} className="bg-white border border-slate-200 shadow-sm p-4">
                <p className="text-[13px] font-bold text-slate-500">{b.label}</p>
                <p className="mt-1 text-[26px] font-black text-slate-800 leading-none">
                  {taps == null ? '–' : b.v.btn + b.v.qr}
                  <span className="ml-1 text-[13px] font-bold text-slate-400">件</span>
                </p>
                <p className="mt-2 text-[12.5px] text-slate-500">
                  ボタン {taps == null ? '–' : b.v.btn}件 ／ QR {taps == null ? '–' : b.v.qr}件
                </p>
              </div>
            ))}
          </div>

          {/* 一覧 */}
          <div className="mt-4 bg-white border border-slate-200 shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <p className="text-[14px] font-black text-slate-700">履歴（先月1日〜今日）</p>
              {taps && <p className="text-[13px] text-slate-400">全{taps.length}件</p>}
            </div>
            {err ? (
              <p className="p-4 text-[14px] text-rose-600">読み込めませんでした：{err}</p>
            ) : taps == null ? (
              <p className="p-4 text-[14px] text-slate-400">読み込み中です…</p>
            ) : taps.length === 0 ? (
              <p className="p-4 text-[14px] text-slate-400">まだ記録がありません。</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {taps.map((t) => (
                  <li key={t.id} className="px-4 py-2.5 flex items-center gap-3 text-[14px]">
                    <span className="flex-none w-[150px] text-slate-500 tabular-nums">{fmt(t.created_at)}</span>
                    <span
                      className="flex-none px-2 py-0.5 text-[12px] font-bold rounded border"
                      style={t.via === 'qr' ? { color: '#0F766E', borderColor: '#99F6E4', background: '#F0FDFA' } : { color: '#047857', borderColor: '#A7F3D0', background: '#ECFDF5' }}
                    >
                      {t.via === 'qr' ? 'QR' : 'ボタン'}
                    </span>
                    <span className="min-w-0 text-slate-700">
                      {t.via === 'qr' ? 'LINEのQRコードが読み取られました' : '「LINEで応募する」ボタンが押されました'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <ul className="mt-4 text-[12.5px] text-slate-400 leading-relaxed space-y-1 list-disc pl-4">
            <li>求人ページの「LINEで応募する」ボタンが押された時と、パソコン画面に出る LINE の QRコードがスマホで読み取られた時を記録しています。</li>
            <li>LINE が開いたあと、実際に友だち追加やメッセージをしなかった場合も記録されます。</li>
            <li>検索エンジンなどの機械による読み込みは数えていません。</li>
          </ul>
        </>
      )}
    </WorkShell>
  );
}
