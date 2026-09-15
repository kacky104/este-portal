'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateTopAndAreas } from '@/app/lib/revalidateTop';
import { bumpBoundaryMs } from '@/app/lib/salons';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import {
  BUMP_QUOTA_BASE,
  BUMP_AUTO_INTERVALS,
  BUMP_AUTO_DEFAULT_START_MIN,
  BUMP_AUTO_DEFAULT_END_MIN,
  BUMP_AUTO_DEFAULT_INTERVAL_MIN,
  bumpQuota,
  minuteLabel,
  minuteFromLabel,
} from '@/lib/bumpAuto';

const sb = createClient();

// 上位表示（bump）ボタン。/mypage の「店舗」タブに置く。
// 押すと自店カードが TOP・地域ページの先頭に出る（後から押した店が1位、前の店は2位…）。
// 回数は1日20回・フクエスワーク掲載店（jobs_enabled）は40回・毎朝6時リセット・持ち越しなし。
// 実処理はDBの salon_bump RPC（オーナー検証・回数管理）。bump系列の直接UPDATEはトリガで禁止。
// 押下成功後は revalidateTopAndAreas() で TOP・全地域ページの ISR を即時更新する。
//
// ★★★ 第385便（2026-09-15）: 【自動実行】の設定をこの中に足した。
//   時間帯 〇〇:〇〇〜〇〇:〇〇 のあいだ、〇〇分ごとに自動で押す。★ 手動のボタンは今までどおり。
//   ★ 押すのは VPS の周（/api/admin/bump-auto）で、この画面は【設定を預かるだけ】。
//   ★ 回数は手動と同じ財布。残り0になったら、その日は自動も止まる（翌朝6時に戻る）。
//   ★★ 文言を画面で組み立てない（第167便）。★ 1行の案内は 2026-09-15 に画面から外した

// JST 朝6時区切りの「日」キー（YYYY-MM-DD）。SQL側 v_today と同じ区切り。
// ★ 2026-09-09（第224便）: 式の直書き（+9h -6h）をやめ、営業日の正本 dutyStatus に寄せた。
//   ★ 6時区切りの決めごとを2か所に書かない（第150便の1本化）。★ SQL側 v_today を変えるときは両方。

export function SalonBumpButton({ salonId }: { salonId: number }) {
  const [loaded, setLoaded] = useState(false);
  const [used, setUsed] = useState(0);
  const [quota, setQuota] = useState(BUMP_QUOTA_BASE);
  const [bumpedAt, setBumpedAt] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  // ★ 説明文の続きと注意書きの開閉（既定は閉じる・2026-09-06）。
  const [detailOpen, setDetailOpen] = useState(false);

  // ★★★ 自動実行の設定（第385便）。★ 開閉は既定で閉じる（★ 押す人の邪魔をしない）。
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoStart, setAutoStart] = useState(minuteLabel(BUMP_AUTO_DEFAULT_START_MIN));
  const [autoEnd, setAutoEnd] = useState(minuteLabel(BUMP_AUTO_DEFAULT_END_MIN));
  const [autoInterval, setAutoInterval] = useState<number>(BUMP_AUTO_DEFAULT_INTERVAL_MIN);
  // ★ 保存済みの控え。★ これと違うあいだは「未保存」を出す（黙って消えない）
  const [autoSaved, setAutoSaved] = useState<{ enabled: boolean; start: string; end: string; interval: number } | null>(null);
  // ★★ 自動実行の列が読めたか。★ SQL を当てる前は false ＝ 節そのものを出さない
  const [autoReady, setAutoReady] = useState(false);
  // ★ 最後に「自動で」押した時刻。★ 手動では入らない（動いている証拠として出す）
  const [autoLastAt, setAutoLastAt] = useState<string | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoMsg, setAutoMsg] = useState('');
  const [autoError, setAutoError] = useState('');

  // 現在の使用状況を取得（オーナー本人は自店の salons をRLSで読める）。
  //
  // ★★★ 読みを【2つに分ける】（第385便で1回踏んだ・2026-09-15）
  //   自動実行の列を同じ select に足したら、SQL を当てる前の環境で
  //   **select がまるごと失敗して data が null → 残り回数の表示ごと消えた**。
  //   ★ 回数とボタンは、自動実行とは関係なく必ず出る。★ 新しい機能で古い機能を道連れにしない。
  //   ★ salon_bump.sql が最初から言っていたこと（「未適用でも落ちない」）を、そのまま守る。
  const load = useCallback(async () => {
    const { data } = await sb
      .from('salons')
      .select('bumped_at, bump_day, bump_used, jobs_enabled')
      .eq('id', salonId)
      .single();
    if (!data) return;
    const today = getBusinessDateJST();
    // 日付が違えば未使用扱い（RPC側と同じリセット規則を表示にも適用）。
    setUsed((data.bump_day as string | null) === today ? ((data.bump_used as number) ?? 0) : 0);
    setQuota(bumpQuota((data.jobs_enabled as boolean) === true));
    setBumpedAt((data.bumped_at as string | null) ?? null);
    setLoaded(true);

    // ★ 自動実行の設定は別に読む。★ ここだけが失敗しても、上の表示は残る
    const { data: auto, error: autoErr } = await sb
      .from('salons')
      .select('bump_auto_enabled, bump_auto_start_min, bump_auto_end_min, bump_auto_interval_min, bump_auto_at')
      .eq('id', salonId)
      .single();
    // ★★ 列がまだ無い（SQL 未適用）＝この機能は出さない。★ 触らせて保存だけ失敗する形にしない
    if (autoErr || !auto) { setAutoReady(false); return; }
    const enabled = (auto.bump_auto_enabled as boolean | null) === true;
    const start = minuteLabel((auto.bump_auto_start_min as number | null) ?? BUMP_AUTO_DEFAULT_START_MIN)
      || minuteLabel(BUMP_AUTO_DEFAULT_START_MIN);
    const end = minuteLabel((auto.bump_auto_end_min as number | null) ?? BUMP_AUTO_DEFAULT_END_MIN)
      || minuteLabel(BUMP_AUTO_DEFAULT_END_MIN);
    const interval = (auto.bump_auto_interval_min as number | null) ?? BUMP_AUTO_DEFAULT_INTERVAL_MIN;
    setAutoEnabled(enabled);
    setAutoStart(start);
    setAutoEnd(end);
    setAutoInterval(interval);
    setAutoSaved({ enabled, start, end, interval });
    setAutoLastAt((auto.bump_auto_at as string | null) ?? null);
    setAutoReady(true);
  }, [salonId]);

  useEffect(() => {
    load();
  }, [load]);

  const remaining = Math.max(0, quota - used);
  // ★ 設定を触ったのに保存していない状態。★ ここを黙っていると「入れたつもり」が生まれる
  //   ★ 入切はボタンで決まるので、ここでは見ない（触れるのは時間帯と間隔だけ）
  const autoDirty = !!autoSaved && (
    autoSaved.start !== autoStart
    || autoSaved.end !== autoEnd
    || autoSaved.interval !== autoInterval
  );
  // ★★ 1行の案内（bumpAutoNote）は画面から外した（カッキーさんの指示・2026-09-15）。
  //   ★ 入力そのものが「11:00 〜 02:00 の間 60分ごと」と読めるので、言い直しになっていた。
  //   ★ 関数と番人は src/lib/bumpAuto.ts に残す（第372便の作法: 消すのは画面だけ）。
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

  // ★★★ 自動上位設定を保存する（第385便）。
  //   ★ 触るのは設定の4列だけ。★ 回数の列（bumped_at / bump_day / bump_used）はトリガが弾く
  //   ★★ nextEnabled で入切を渡す（カッキーさんの指示・2026-09-15）。
  //     「設定を保存する」= 入れる／「設定解除」= 止める。★ チェックボックスは置かない——
  //     チェックを入れただけで動いていると思われる形（＝保存し忘れ）を作らないため。
  const saveAuto = async (nextEnabled: boolean) => {
    if (autoSaving) return;
    const startMin = minuteFromLabel(autoStart);
    const endMin = minuteFromLabel(autoEnd);
    setAutoMsg('');
    setAutoError('');
    // ★★ 読めない時刻を既定値で埋めない。★ 黙って別の時間帯で回りはじめるのが、いちばん怖い
    if (startMin === null || endMin === null) {
      setAutoError('時刻の形が読み取れません（例: 10:00）。');
      return;
    }
    if (startMin === endMin) {
      setAutoError('開始と終了が同じ時刻です。1分以上の幅をとってください。');
      return;
    }
    setAutoSaving(true);
    const { error: upErr } = await sb
      .from('salons')
      .update({
        bump_auto_enabled: nextEnabled,
        bump_auto_start_min: startMin,
        bump_auto_end_min: endMin,
        bump_auto_interval_min: autoInterval,
      })
      .eq('id', salonId);
    setAutoSaving(false);
    if (upErr) { setAutoError(`保存に失敗しました: ${upErr.message}`); return; }
    setAutoEnabled(nextEnabled);
    setAutoSaved({ enabled: nextEnabled, start: autoStart, end: autoEnd, interval: autoInterval });
    setAutoMsg(nextEnabled ? '自動上位設定を保存しました。' : '自動表示を停止しました。');
  };

  return (
    <>
    <div className="bg-white rounded-none border border-slate-100 shadow-sm p-5 space-y-3">
      {/* ★ 見出しの右隣に「※ 00:10 に実行」（2026-09-06・カッキーさんの指示）。
          ★ もとはボタンの上に「✓ 上位表示 実行中（… に実行）」として出していた。 */}
      <div className="flex items-baseline justify-center gap-2 flex-wrap">
        <h2 className="text-sm font-black text-slate-700">上位表示（TOP・地域ページ）</h2>
        {activeNow && bumpedAt && (
          <span className="text-xs font-bold text-emerald-600">
            ※ {new Date(bumpedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })} に実行
          </span>
        )}
      </div>

      {/* ★ 本日の残り回数。説明文の下・中央に大きく（2026-09-06・カッキーさんの指示）。
          ★ 見出し右の小さな表示から移した。 */}
      {loaded && (
        <p className="flex items-baseline justify-center gap-1 text-lg font-bold text-slate-500 tabular-nums py-1">
          <span>本日残り</span>
          <span className="text-pink-600 text-6xl font-black leading-none">{remaining}</span>
          <span>/ {quota}回</span>
        </p>
      )}

      <button
        type="button"
        onClick={press}
        disabled={!loaded || sending || remaining <= 0}
        className="w-full py-3 rounded-none text-sm font-black text-white shadow-md transition-all disabled:opacity-40 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 active:scale-[0.99]"
      >
        {sending ? '実行中…' : remaining <= 0 ? '本日の回数を使い切りました' : '⬆ 上位表示する'}
      </button>

      {msg && <p className="text-xs font-bold text-emerald-600">{msg}</p>}
      {error && <p className="text-xs font-bold text-rose-500">{error}</p>}

      {/* ★ 説明文はボタンの下（2026-09-06・カッキーさんの指示）。
          ★ 1文目だけ常に見せ、続きと注意書きは押して開く（既定は閉じる）。 */}
      <p className="text-xs text-slate-500 leading-relaxed text-center">
        TOP・地域ページでお店が<span className="font-bold text-pink-600">先頭に表示</span>されます。
        {' '}
        <button
          type="button"
          onClick={() => setDetailOpen(v => !v)}
          aria-expanded={detailOpen}
          aria-label={detailOpen ? '説明を閉じる' : '説明をひらく'}
          className="text-pink-500 hover:text-pink-600 transition-colors align-baseline"
        >
          {detailOpen ? '▲' : '▼'}
        </button>
      </p>

      {detailOpen && (
        <div className="space-y-2">
          <ul className="text-[11px] text-slate-500 leading-relaxed list-disc pl-4 space-y-0.5">
            <li>あとから他のお店が押すとその店が1位になり、あなたのお店は2位、3位…と順に下がります。</li>
            <li>回数は毎朝6時にリセットされます（1日20回・フクエスワーク掲載店は40回）。</li>
            <li>上位表示の効果も翌朝6時に解除され、通常の表示順（6時間ごとにシャッフル）に戻ります。</li>
            <li>反映まで数分かかる場合があります。</li>
          </ul>
        </div>
      )}
    </div>

    {/* ── ★★★ 自動上位設定（第385便・2026-09-15）──
        ★★ 上位表示カードとは【別のブロック】にした（カッキーさんの指示・同日）。
          ★ 手で押す場所と、設定する場所を、1枚のカードに同居させない。
        ★ 既定は閉じる。★ 列がまだ無い環境では、ブロックごと出さない
          （★ 触らせて保存だけ失敗する形にしない）。 */}
    {autoReady && (
      <div className="bg-white rounded-none border border-slate-100 shadow-sm p-5 mt-6">
        <button
          type="button"
          onClick={() => setAutoOpen(v => !v)}
          aria-expanded={autoOpen}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <span className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-black text-slate-700">自動上位設定</h2>
            <span className={
              'text-[11px] font-bold px-1.5 py-0.5 border '
              + (autoEnabled
                ? 'text-emerald-700 border-emerald-200 bg-emerald-50'
                : 'text-slate-400 border-slate-200 bg-slate-50')
            }>
              {autoEnabled ? '自動実行中' : '未使用'}
            </span>
            {autoDirty && (
              <span className="text-[11px] font-bold text-rose-500">未保存</span>
            )}
          </span>
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`flex-shrink-0 text-slate-400 transition-transform duration-200 ${autoOpen ? 'rotate-180' : ''}`}
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {autoOpen && (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-1.5 flex-wrap text-[13px] text-slate-600">
              <input
                type="time"
                value={autoStart}
                onChange={(e) => setAutoStart(e.target.value)}
                className="px-2 py-1.5 border border-slate-200 bg-white text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-pink-200"
              />
              <span className="font-bold">〜</span>
              <input
                type="time"
                value={autoEnd}
                onChange={(e) => setAutoEnd(e.target.value)}
                className="px-2 py-1.5 border border-slate-200 bg-white text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-pink-200"
              />
              <span className="font-bold">の間</span>
              <select
                value={autoInterval}
                onChange={(e) => setAutoInterval(Number(e.target.value))}
                className="px-2 py-1.5 border border-slate-200 bg-white text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-pink-200"
              >
                {BUMP_AUTO_INTERVALS.map((m) => (
                  <option key={m} value={m}>{m}分</option>
                ))}
              </select>
              <span className="font-bold">ごと</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => saveAuto(true)}
                disabled={autoSaving || !loaded}
                className="px-4 py-2 text-[13px] font-black text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >
                {autoSaving ? '保存中…' : '設定を保存する'}
              </button>
              {/* ★ 止めるボタン。★ すでに止まっているときは押せない（押しても何も変わらないので） */}
              <button
                type="button"
                onClick={() => saveAuto(false)}
                disabled={autoSaving || !loaded || !autoEnabled}
                className="px-4 py-2 text-[13px] font-black text-slate-500 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                設定解除
              </button>
              {autoLastAt && (
                <span className="text-[11px] text-slate-400 tabular-nums">
                  最後の自動実行 {new Date(autoLastAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })}
                </span>
              )}
            </div>

            {autoMsg && <p className="text-xs font-bold text-emerald-600">{autoMsg}</p>}
            {autoError && <p className="text-xs font-bold text-rose-500">{autoError}</p>}

            <ul className="text-[11px] text-slate-500 leading-relaxed list-disc pl-4 space-y-0.5">
              <li>手動のボタンはいつでも押せます。</li>
              <li>本日の回数は翌朝6時に戻ります。</li>
              <li>反映まで数分かかる場合があります。</li>
            </ul>
          </div>
        )}
      </div>
    )}
    </>
  );
}
