'use client';

import { useCallback, useEffect, useState } from 'react';
import { getMediaSokuhime, startMediaSokuhimeRead, getSokuhimeCandidates, startMediaSokuhimePush, getSokuhimeAuto, setSokuhimeAuto } from '@/app/actions/mediaCredentials';
import type { SokuhimeSnapshotView } from '@/lib/ekichikaSokuhimeParse';
import { sokuhimeSummaryLabel } from '@/lib/ekichikaSokuhimeParse';

// 駅ちかの即ヒメ枠（第213便・2026-09-08）。★ 読むだけ。★ 「出勤を送る」の下に置く。
// ★ 第49便の作法「直す前に、まず見えることを作る」。★ 押す側（今すぐ→即ヒメ）は次の便。
// ★ 写しが無いときは「まだ読んでいません」。★ 「0/0」と出さない（0件と分からないを混ぜない）。
//
// ★★★★ 【第318便】（2026-09-13・カッキーさんの指示）: 【フクエスから反映のときだけ】出す。
//   ★ 駅ちかから反映（read）のあいだ、この箱は**使えない機能の説明だけ**になっていた:
//     ・「駅ちかの即ヒメにする」は押せない灰色
//     ・自動のスイッチは出ず「ホームで『フクエスから反映』にすると使えます」の1行だけ
//     ・★ なのに「試す（送らない）」だけは押せる（★ 送れないのに試せる、という妙な形）
//   ★ その向きのときは、即ヒメは駅ちかの管理画面で操作している。★ 枠の状態もそちらで足りる。
//   ★★ 出さないと決めたので、読みにも行かない（★ 見えない箱のために3本問い合わせない）。

function fmt(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(t));
}
function fmtUnix(sec: number | null): string {
  if (sec === null) return '';
  return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(sec * 1000));
}

type Candidate = { therapistId: number; name: string; castId: string | null; untilISO: string | null; pushedAtISO: string | null };

export function SokuhimeSlots({ salonId, hasCredential, isWrite, onToast }: {
  salonId: number | null;
  /** 駅ちかのログイン情報があるか。★ 無ければこの箱は出さない（読む相手がいない） */
  hasCredential: boolean;
  /** 駅ちかが「フクエスから反映」か。★ 実弾（即ヒメにする）はこのときだけ */
  isWrite: boolean;
  onToast: (m: string) => void;
}) {
  const [snap, setSnap] = useState<SokuhimeSnapshotView | null>(null);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Candidate | null>(null);
  // ★ 第215便: 即ヒメの自動（5分ごとの周）。★ 出勤の自動とは別のスイッチ
  const [auto, setAuto] = useState<{ auto: boolean; canAuto: boolean; why: string | null } | null>(null);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    // ★ 第318便: 出さない場面では読みにも行かない（★ 描かない箱のために問い合わせを増やさない）
    if (salonId == null || !hasCredential || !isWrite) return;
    const [r, c, a] = await Promise.all([getMediaSokuhime({ salonId }), getSokuhimeCandidates({ salonId }), getSokuhimeAuto({ salonId })]);
    if (r.ok) setSnap(r.data);
    if (c.ok) setCands(c.data);
    if (a.ok) setAuto(a.data);
    setLoading(false);
  }, [salonId, hasCredential, isWrite]);

  useEffect(() => { void load(); }, [load]);

  // ★★★ 第318便: 鍵が無いとき（読む相手がいない）と、フクエスから反映でないとき（送れない）は出さない
  if (salonId == null || !hasCredential || !isWrite) return null;

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

  // ★ 第215便: 自動の入切。★ 出勤の「自動にする／自動をやめる」と同じ言葉・同じ形
  const onSwitchAuto = async (on: boolean) => {
    if (salonId == null) return;
    setSwitching(true);
    try {
      const r = await setSokuhimeAuto({ salonId, on });
      if (!r.ok) { onToast(r.error); return; }
      onToast(on
        ? '即ヒメを自動にしました。5分ごとに、いま「今すぐ」の方を1人ずつ駅ちかの即ヒメにします'
        : '即ヒメの自動をやめました。ここから1人ずつ送ることはできます');
      await load();
    } finally { setSwitching(false); }
  };

  // ★ 第214便: 1人だけ送る。★ apply=false は試し打ち（駅ちかを触らない・計画が記録に出る）
  const onPush = async (c: Candidate, apply: boolean) => {
    if (salonId == null) return;
    setBusyId(c.therapistId);
    try {
      const r = await startMediaSokuhimePush({ salonId, therapistId: c.therapistId, apply });
      if (!r.ok) { onToast(r.error); return; }
      onToast(apply
        ? `${c.name}さんを駅ちかの即ヒメにしに行きました。結果は「連携の記録」と、この箱を読み直すと出ます`
        : `${c.name}さんの試し打ちを始めました（駅ちかは触りません）。結果は「連携の記録」に出ます`);
      setConfirm(null);
    } finally { setBusyId(null); }
  };

  return (
    <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h3 className="text-[16px] font-bold text-slate-700">駅ちかの即ヒメ枠</h3>
        {snap && <span className="text-[13px] text-slate-400">{fmt(snap.readAtISO)} に確認</span>}
      </div>
      {/* ★ いまは読むだけ。★ 「今すぐ」→即ヒメ の送信は次の便。★ 嘘を書かない */}
      <p className="text-[13px] text-slate-400 leading-relaxed">
        駅ちかの管理画面「即ヒメ設定」の枠を読んで写します（読むだけ・書き換えません）。
        フクエスの「今すぐ」を駅ちかの即ヒメへ送るのは、下の一覧から1人ずつ（まずは「試す」から）。
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

      {/* ── ★★★ フクエスで「今すぐ」の方（第214便）。★ 1人ずつ・試し打ちが先 ── */}
      {!loading && (
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <p className="text-[14px] font-bold text-slate-700">フクエスで「今すぐ」の方</p>
          <p className="text-[12.5px] text-slate-400 leading-relaxed">
            店舗か本人がフクエスで押した「今すぐ」だけです（駅ちかから取り込んだ即ヒメは除きます）。
            「試す」は駅ちかを触らず、送るとどうなるかを「連携の記録」に残します。
          </p>
          {cands.length === 0 ? (
            <p className="text-[13.5px] text-slate-400">いまフクエスで「今すぐ」の方はいません。</p>
          ) : (
            <ul className="border border-slate-200 divide-y divide-slate-100">
              {cands.map((c) => {
                const onBox = snap?.boxes.some((b) => b.girlId !== null && b.girlId === c.castId && (b.expiresAtUnix === null || b.expiresAtUnix > nowUnix)) === true;
                return (
                  <li key={c.therapistId} className="px-3 py-2 flex items-center gap-3 text-[14px] flex-wrap">
                    <span className="font-bold text-slate-700">{c.name}</span>
                    <span className="text-[12.5px] text-slate-400">
                      {c.untilISO ? `${fmt(c.untilISO)} まで` : ''}
                      {!c.castId && '　駅ちかの登録と結びついていません'}
                      {onBox && '　駅ちかで即ヒメ中'}
                      {!onBox && c.pushedAtISO && `　${fmt(c.pushedAtISO)} に送りました`}
                    </span>
                    <span className="ml-auto flex gap-2">
                      <button
                        type="button"
                        onClick={() => onPush(c, false)}
                        disabled={busyId !== null || !c.castId}
                        className="text-[12.5px] font-bold px-2.5 py-1 border border-slate-200 text-slate-600 disabled:opacity-40"
                      >
                        {busyId === c.therapistId ? '…' : '試す（送らない）'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirm(c)}
                        disabled={busyId !== null || !c.castId || !isWrite || onBox}
                        className="text-[12.5px] font-bold px-2.5 py-1 border border-indigo-600 bg-indigo-600 text-white disabled:opacity-40"
                      >
                        駅ちかの即ヒメにする
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ── ★★★ 自動にする（第215便）。★ 出勤の「自動にする／自動をやめる」と同じ形・同じ言葉 ──
          ★ 出勤の自動（30分ごと）とは別のスイッチ。★ 片方だけ入れられる。
          ★ 使えないときはボタンを消して【理由を書く】。★ 押せないボタンを黙って灰色で置かない。 */}
      {!loading && auto && (
        <div className="border-t border-slate-100 pt-3 space-y-1.5">
          {auto.auto ? (
            <>
              <p className="text-[14px] font-bold text-indigo-700">いまは自動で送っています</p>
              <p className="text-[13px] text-slate-400 leading-relaxed">
                5分ごとに、フクエスで「今すぐ」の方を1人ずつ駅ちかの即ヒメにします。
                45分で消えたら、「今すぐ」が続いているあいだは押し直します。
                「今すぐ」が終わった方は、フクエスが入れた枠だけ外します。
                すでに即ヒメになっている方には触りません。
              </p>
              <button
                type="button"
                onClick={() => onSwitchAuto(false)}
                disabled={switching}
                className="px-3 py-1.5 border border-slate-300 bg-white text-[13.5px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                {switching ? '切り替えています…' : '自動をやめる'}
              </button>
            </>
          ) : auto.canAuto ? (
            <>
              <p className="text-[13px] text-slate-400 leading-relaxed">
                自動にすると、5分ごとに「今すぐ」の方を1人ずつ駅ちかの即ヒメにします。
                空いている枠が無いときは送りません（枠の方を勝手に入れ替えません）。
                ベンリーなどで即ヒメを自動にしている場合は、そちらが優先されます。
              </p>
              <button
                type="button"
                onClick={() => onSwitchAuto(true)}
                disabled={switching}
                className="px-3 py-1.5 border border-slate-300 bg-white text-[13.5px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                {switching ? '切り替えています…' : '自動にする'}
              </button>
            </>
          ) : (
            <p className="text-[13px] text-slate-400 leading-relaxed">
              即ヒメを自動にするには — {auto.why}
            </p>
          )}
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 grid place-items-center p-4" role="dialog" aria-modal="true" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-[380px] bg-white border border-slate-200 shadow-lg p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-[17px] font-black text-slate-800">{confirm.name}さんを駅ちかの即ヒメにしますか？</p>
            <p className="mt-2 text-[14px] text-slate-500 leading-relaxed">
              駅ちかの管理画面で即ヒメに設定します（45分で消えます）。駅ちかで出勤中になっていない場合は、送らずに止まります。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="px-4 py-1.5 border border-slate-200 text-[14px] font-bold text-slate-500 hover:bg-slate-50">やめる</button>
              <button type="button" onClick={() => { const c = confirm; void onPush(c, true); }} disabled={busyId !== null} className="px-4 py-1.5 border border-indigo-600 bg-indigo-600 text-[14px] font-bold text-white hover:bg-indigo-700 disabled:opacity-40">
                即ヒメにする
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
