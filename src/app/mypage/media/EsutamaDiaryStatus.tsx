'use client';

import { useCallback, useEffect, useState } from 'react';
import { getEsutamaDiaryStatus } from '@/app/actions/diaryForward';

// エステ魂の写メ日記の状況（第141便・2026-09-04）。★ 数だけ出す。
//
// ★★★ なぜ要るか
//   2026-09-04 に自動反映が動きはじめたが、店舗様が結果を見られるのは
//   「連携の記録」の細かい行だけだった。★ 1回の送信で7行並ぶので、そこから探せない。
//
// ★★★ ここで【出さない】と決めたもの
//   ・相手側の利用状況 … 知るにはログインが要る。★ 画面を開くたびに相手を叩かない
//   ・誰が送れないかの名前 … 「数だけ」と決めた（★ 人ごとの一覧は次の便）
//   → だから「お送りできる【見込み】」と書く。★ 言い切らない。

type Status = {
  送れた: number;
  送れていない: number;
  判定できず: number;
  最後に送れた: string | null;
  人: { 在籍: number; 送れる見込み: number; 了承がまだ: number; 名簿が未結び: number };
};

function fmt(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  }).format(new Date(t));
}

export function EsutamaDiaryStatus({ salonId }: { salonId: number | null }) {
  const [data, setData] = useState<{ status: Status; line: string; sentLine: string; nextStep: string | null } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (salonId == null) return;
    const r = await getEsutamaDiaryStatus({ salonId });
    if (!r.ok) { setError(r.error); setLoading(false); return; }
    setData(r.data as { status: Status; line: string; sentLine: string; nextStep: string | null });
    setLoading(false);
  }, [salonId]);

  useEffect(() => { void load(); }, [load]);

  if (salonId == null) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-base font-bold text-slate-900">エステ魂へお送りした写メ日記</h2>
      <p className="mt-1 text-sm text-slate-600">
        エステ魂はメールで投稿できないため、<b>ご本人のアカウントに代わってお送りします</b>。
        フクエスで写メ日記を書くと、数分後に反映されます。
      </p>

      {loading && <p className="mt-3 text-sm text-slate-500">読み込んでいます…</p>}
      {/* ★ 読めなかったことを「0件」と見せない（引き継ぎメモ 3-5） */}
      {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

      {!loading && !error && data && (
        <div className="mt-3 space-y-2">
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-sm font-bold text-slate-900">{data.sentLine}</div>
            {data.status.最後に送れた && (
              <div className="mt-1 text-xs text-slate-500">
                最後にお送りした {fmt(data.status.最後に送れた)}
              </div>
            )}
          </div>

          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-sm text-slate-800">{data.line}</div>
            {/* ★★ 分からないことを分からないと書く。★ 「送れます」と言い切らない理由 */}
            <div className="mt-1 text-xs text-slate-500">
              ★ ご本人がエステ魂を利用中かどうかは、お送りするときに確かめます。
            </div>
          </div>

          {/* ★ 何もなければ出さない（「異常なし」の行を作らない） */}
          {data.nextStep && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {data.nextStep}
            </p>
          )}

          {/* ★★★ 店舗様に必ず伝えること。★ ここを外すと本当に二重投稿になる */}
          <p className="text-xs text-slate-600">
            ★ セラピストさんには「エステ魂へ直接書かず、フクエスに書く」とお伝えください。
            両方から書くと、同じ日記が2本並びます（エステ魂は店舗側から消せません）。
          </p>
        </div>
      )}
    </section>
  );
}
