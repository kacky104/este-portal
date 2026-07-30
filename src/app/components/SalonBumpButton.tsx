'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateTopAndAreas } from '@/app/lib/revalidateTop';
import { bumpBoundaryMs } from '@/app/lib/salons';

const sb = createClient();

// 上位表示（bump）ボタン。/mypage の「店舗」タブに置く。
// 押すと自店カードが TOP・地域ページの先頭に出る（後から押した店が1位、前の店は2位…）。
// 回数は1日20回・フクエスワーク掲載店（jobs_enabled）は40回・毎朝6時リセット・持ち越しなし。
// 実処理はDBの salon_bump RPC（オーナー検証・回数管理）。bump系列の直接UPDATEはトリガで禁止。
// 押下成功後は revalidateTopAndAreas() で TOP・全地域ページの ISR を即時更新する。

// JST 朝6時区切りの「日」キー（YYYY-MM-DD）。SQL側 v_today と同じ式。
function bumpDayKey(nowMs: number = Date.now()): string {
  return new Date(nowMs + 9 * 3600_000 - 6 * 3600_000).toISOString().slice(0, 10);
}

export function SalonBumpButton({ salonId }: { salonId: number }) {
  const [loaded, setLoaded] = useState(false);
  const [used, setUsed] = useState(0);
  const [quota, setQuota] = useState(20);
  const [bumpedAt, setBumpedAt] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // 現在の使用状況を取得（オーナー本人は自店の salons をRLSで読める）。
  const load = useCallback(async () => {
    const { data } = await sb
      .from('salons')
      .select('bumped_at, bump_day, bump_used, jobs_enabled')
      .eq('id', salonId)
      .single();
    if (!data) return;
    const today = bumpDayKey();
    // 日付が違えば未使用扱い（RPC側と同じリセット規則を表示にも適用）。
    setUsed((data.bump_day as string | null) === today ? ((data.bump_used as number) ?? 0) : 0);
    setQuota(20 + ((data.jobs_enabled as boolean) ? 20 : 0));
    setBumpedAt((data.bumped_at as string | null) ?? null);
    setLoaded(true);
  }, [salonId]);

  useEffect(() => {
    load();
  }, [load]);

  const remaining = Math.max(0, quota - used);
  // 上位表示が現在も有効か（今朝6時以降に押している）。
  const activeNow = !!bumpedAt && Date.parse(bumpedAt) >= bumpBoundaryMs();

  const press = async () => {
    if (sending || remaining <= 0) return;
    if (!window.confirm(`上位表示を実行しますか？（本日残り ${remaining}回）`)) return;
    setSending(true);
    setMsg('');
    setError('');
    const { data, error: rpcErr } = await sb.rpc('salon_bump', { p_salon_id: salonId });
    setSending(false);
    const res = (data ?? null) as { ok?: boolean; error?: string; used?: number; quota?: number; remaining?: number; bumped_at?: string } | null;
    if (rpcErr || !res?.ok) {
      setError(res?.error ?? rpcErr?.message ?? '実行できませんでした。時間をおいてお試しください。');
      if (typeof res?.used === 'number') setUsed(res.used);
      if (typeof res?.quota === 'number') setQuota(res.quota);
      return;
    }
    setUsed(res.used ?? used + 1);
    if (typeof res.quota === 'number') setQuota(res.quota);
    setBumpedAt(res.bumped_at ?? new Date().toISOString());
    setMsg(`上位表示しました！（本日残り ${res.remaining ?? Math.max(0, quota - (res.used ?? used + 1))}回）`);
    // TOP・全地域ページの ISR を即時更新（失敗しても操作は成立＝握りつぶし）。
    revalidateTopAndAreas();
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-black text-slate-700">上位表示（TOP・地域ページ）</h2>
        {loaded && (
          <span className="text-xs font-bold text-slate-500 tabular-nums">
            本日残り <span className="text-pink-600 text-base">{remaining}</span> / {quota}回
          </span>
        )}
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        ボタンを押すと、TOP・地域ページの店舗カード一覧であなたのお店が<span className="font-bold text-pink-600">先頭に表示</span>されます。
        あとから他のお店が押すとその店が1位になり、あなたのお店は2位、3位…と順に下がります。
      </p>

      {activeNow && bumpedAt && (
        <p className="text-xs font-bold text-emerald-600">
          ✓ 上位表示 実行中（{new Date(bumpedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })} に実行）
        </p>
      )}

      <button
        type="button"
        onClick={press}
        disabled={!loaded || sending || remaining <= 0}
        className="w-full py-3 rounded-2xl text-sm font-black text-white shadow-md transition-all disabled:opacity-40 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 active:scale-[0.99]"
      >
        {sending ? '実行中…' : remaining <= 0 ? '本日の回数を使い切りました' : '⬆ 今すぐ上位表示する'}
      </button>

      {msg && <p className="text-xs font-bold text-emerald-600">{msg}</p>}
      {error && <p className="text-xs font-bold text-rose-500">{error}</p>}

      <ul className="text-[11px] text-slate-400 leading-relaxed list-disc pl-4 space-y-0.5">
        <li>回数は毎朝6時にリセットされます（1日20回・フクエスワーク掲載店は40回）。未使用分の翌日への持ち越しはありません。</li>
        <li>上位表示の効果も翌朝6時に解除され、通常の表示順（6時間ごとの入れ替え）に戻ります。</li>
        <li>反映まで数分かかる場合があります。</li>
      </ul>
    </div>
  );
}
