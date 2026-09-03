'use client';

import { useEffect, useState } from 'react';
import {
  getMediaOverview,
  getMediaLinkPairs,
  linkTherapistMediaId,
  unlinkTherapistMediaId,
  startMediaRosterRead,
} from '@/app/actions/mediaCredentials';
import { canLink, strengthLabel, pairsSummary, type LinkPairs } from '@/lib/mediaLinkPairs';

// 名簿の結び（第115便・2026-09-03）。★ これまで運営が SQL で入れていたものを画面から。
//
// ★★★ なぜ要るか
//   フクエス「レミ」／エステ魂「れみ」のように表記が違うと、送るときの突き合わせで
//   「まだ登録されていない」と判定されて送られない（第109便で20人）。
//   ★ 突き合わせを緩めない（他人の欄に書く事故のほうが取り返しがつかない）ので、人が結ぶ。
//
// ★★ 画面の決めごと
//   ・まとめて結ぶボタンは置かない。★ 1人ずつ、見て押す
//   ・番号は【選ぶ】もので、打つものではない（打ち間違いは他人の欄への書き込みになる）
//   ・結んだものは必ず外せる（「戻せます」と書いた画面には戻すボタンがあること）
//   ・名簿を読めていないときに「0人」「いません」と書かない

type Site = { provider: string; slot: number; label: string; direction: string; hasCredential: boolean };

function fmtAt(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  }).format(new Date(t));
}

export function RosterLinkBoard({ salonId, onToast }: { salonId: number | null; onToast: (m: string) => void }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [target, setTarget] = useState<Site | null>(null);
  const [pairs, setPairs] = useState<LinkPairs | null>(null);
  const [readAt, setReadAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pick, setPick] = useState<Record<number, string>>({});
  const [onlyCandidates, setOnlyCandidates] = useState(false);
  /**
   * ★★★ 非公開の方を出すか（第116便）。★ 既定は出さない。
   *   ★ 出勤を送る相手は is_active=true の人だけ（relayFlow）。★ 非公開の方は送らない＝結ぶ必要もない。
   *   ★ 既定で出すと「まだ14名」と大きく出て、手当てが要る人が埋もれる（2026-09-03 実物で確認）。
   *   ★ ただし【隠すだけ】。★ チェック1つで出せる（数えたものを黙って捨てない）。
   */
  const [showHidden, setShowHidden] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // ★ 枠の一覧。★ 設定のある枠だけが返る（無い枠に「0人」と出さないため）
  useEffect(() => {
    if (salonId == null) return;
    void (async () => {
      const ov = await getMediaOverview({ salonId });
      if (!ov.ok) { setError(ov.error); setLoading(false); return; }
      const list = ov.data.sites as Site[];
      setSites(list);
      setTarget((prev) => prev ?? list[0] ?? null);
      if (list.length === 0) setLoading(false);
    })();
  }, [salonId]);

  // ★ 読み直しは【数を増やす】ことで起こす。★ effect の中で同期に state を触らない形にしてある
  //   （結んだあと・外したあとに reload() を呼ぶ）
  useEffect(() => {
    if (salonId == null || !target) return;
    let live = true;
    void (async () => {
      const r = await getMediaLinkPairs({ salonId, provider: target.provider, slot: target.slot });
      // ★ 枠を切り替えたあとに古い返事が届くことがある。★ 古いほうで上書きしない
      if (!live) return;
      if (!r.ok) { setError(r.error); setPairs(null); setLoading(false); return; }
      setError('');
      setPairs(r.data.pairs);
      setReadAt(r.data.readAtISO);
      setPick({});
      setShowAll(false);
      setLoading(false);
    })();
    return () => { live = false; };
  }, [salonId, target, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const onRead = async () => {
    if (salonId == null || !target) return;
    setBusy(true);
    try {
      const res = await startMediaRosterRead({ salonId, provider: target.provider, slot: target.slot });
      if (!res.ok) { onToast(res.error); return; }
      onToast('名簿を読みに行きました。数分後にこの画面を開き直すと反映されます');
    } finally { setBusy(false); }
  };

  const onLink = async (therapistId: number, castId: string) => {
    if (salonId == null || !target || !pairs) return;
    // ★★ 押す前にも同じ関数で確かめる（サーバでも必ずもう一度確かめている）
    const verdict = canLink(pairs, therapistId, castId);
    if (!verdict.ok) { onToast(verdict.error); return; }
    setBusy(true);
    try {
      const res = await linkTherapistMediaId({
        salonId, provider: target.provider, slot: target.slot, therapistId, castId,
      });
      if (!res.ok) { onToast(res.error); return; }
      onToast('結びつけました。次に送るときから、この登録へ反映します');
      reload();
    } finally { setBusy(false); }
  };

  const onUnlink = async (therapistId: number, name: string) => {
    if (salonId == null || !target) return;
    setBusy(true);
    try {
      const res = await unlinkTherapistMediaId({
        salonId, provider: target.provider, slot: target.slot, therapistId,
      });
      if (!res.ok) { onToast(res.error); return; }
      onToast(name + 'さんの結びつきを外しました');
      reload();
    } finally { setBusy(false); }
  };

  if (salonId == null) return null;
  if (sites.length === 0 && !loading) return null;

  // ★ 既定は【公開中の方】だけ。★ 非公開の方は送る相手ではないので、既定では出さない
  const visible = pairs ? pairs.unlinked.filter((p) => showHidden || p.isActive) : [];
  const hiddenCount = pairs ? pairs.unlinked.filter((p) => !p.isActive).length : 0;
  const unlinked = visible.filter((p) => (onlyCandidates ? p.candidates.length > 0 : true));
  const shown = showAll ? unlinked : unlinked.slice(0, 10);

  return (
    <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[15.5px] font-bold text-slate-700">媒体側の登録と結びつける</h3>
          <p className="mt-0.5 text-[13.5px] text-slate-500 leading-relaxed">
            名前の書き方が違う方（例: レミ ／ れみ）は、そのままでは送れません。ここで結びつけると送れるようになります。
          </p>
        </div>
        {target && (
          <button
            onClick={onRead}
            disabled={busy}
            className="flex-none text-[13px] font-bold px-3 py-1.5 border border-slate-200 text-slate-600 disabled:opacity-50"
          >
            {target.label}の名簿を読み直す
          </button>
        )}
      </div>

      {/* ── どの枠か ─────────────────────────────── */}
      {sites.length > 1 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {sites.map((s) => {
            const on = target?.provider === s.provider && target?.slot === s.slot;
            return (
              <button
                key={s.provider + '#' + s.slot}
                onClick={() => setTarget(s)}
                aria-pressed={on}
                className={`px-3 py-1.5 border text-[14px] font-bold transition-colors ${
                  on ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-400 border-slate-200'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <p className="mt-3 text-[14px] text-slate-400">読み込み中…</p>
      ) : error ? (
        <p className="mt-3 text-[14px] text-rose-600 leading-relaxed">
          結びつきを読み込めませんでした（{error}）。しばらくしてから開き直してください。
        </p>
      ) : !pairs ? null : !pairs.known ? (
        /* ★★★ 読めていないことを「0人」「いません」と書かない */
        <div className="mt-3 border border-sky-200 bg-sky-50 px-3 py-2.5">
          <p className="text-[14px] leading-relaxed text-slate-600">
            <b className="font-bold text-sky-700">{target?.label}の名簿をまだ読めていません。</b>{' '}
            上の「{target?.label}の名簿を読み直す」を押すと読みに行きます（数分かかります）。
            読めるまでは、誰が結びついているか分かりません。
          </p>
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="text-[14px] font-bold text-slate-700">{pairsSummary(pairs)}</p>
              {/* ★★ 隠した数は必ず言う。★ 黙って減らすと「もう無い」と読まれる */}
              {!showHidden && hiddenCount > 0 && (
                <p className="text-[13px] text-slate-400 mt-0.5">
                  うち非公開の{hiddenCount}名は出していません（出勤を送る相手ではありません）
                </p>
              )}
            </div>
            <span className="text-[13px] text-slate-400">
              {target?.label}の登録 {pairs.free.length + pairs.takenCastIds.length}件
              {readAt && <>／読んだのは {fmtAt(readAt)}</>}
            </span>
          </div>

          {/* ── まだ結びついていない方 ───────────────── */}
          {pairs.unlinked.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <h4 className="text-[14.5px] font-bold text-slate-700">まだ結びついていない方</h4>
                <div className="flex items-center gap-3 flex-wrap">
                  <label className="text-[13px] text-slate-500 flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={onlyCandidates}
                      onChange={(e) => { setOnlyCandidates(e.target.checked); setShowAll(false); }}
                    />
                    候補がある方だけ
                  </label>
                  {/* ★ 隠しているだけ。★ いつでも出せる */}
                  {hiddenCount > 0 && (
                    <label className="text-[13px] text-slate-500 flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={showHidden}
                        onChange={(e) => { setShowHidden(e.target.checked); setShowAll(false); }}
                      />
                      非公開の方も出す（{hiddenCount}名）
                    </label>
                  )}
                </div>
              </div>

              <ul className="border border-slate-200 divide-y divide-slate-100">
                {shown.map((p) => (
                  <li key={p.therapistId} className="px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <b className="text-[15px] font-bold text-slate-800 break-words">
                        {p.name || '（名前なし）'}
                        {!p.isActive && (
                          <span className="ml-1.5 text-[12px] font-bold px-1.5 py-px border border-slate-200 bg-slate-50 text-slate-400">
                            非公開
                          </span>
                        )}
                      </b>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {/* ★ 候補は強い順。★ 「読みが同じ」は弱い根拠だと分かるように書く */}
                        {p.candidates.map((c) => (
                          <button
                            key={c.castId}
                            onClick={() => onLink(p.therapistId, c.castId)}
                            disabled={busy}
                            className="text-[13px] font-bold px-2.5 py-1 border border-emerald-200 bg-emerald-50 text-emerald-700 disabled:opacity-50"
                          >
                            「{c.mediaName}」と結ぶ
                            <span className="ml-1 font-bold text-[11.5px] text-emerald-600">
                              {strengthLabel(c.strength)}
                            </span>
                          </button>
                        ))}
                        {/* ★ 番号は選ぶもの。★ 手で打たせない */}
                        <select
                          value={pick[p.therapistId] ?? ''}
                          onChange={(e) => setPick({ ...pick, [p.therapistId]: e.target.value })}
                          className="text-[13px] border border-slate-200 px-2 py-1 max-w-[190px]"
                        >
                          <option value="">一覧から選ぶ…</option>
                          {pairs.free.map((e) => (
                            <option key={e.castId} value={e.castId}>{e.name || '（名前なし）'}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => onLink(p.therapistId, pick[p.therapistId] ?? '')}
                          disabled={busy || !pick[p.therapistId]}
                          className="text-[13px] font-bold px-2.5 py-1 border border-slate-200 text-slate-600 disabled:opacity-40"
                        >
                          結ぶ
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {unlinked.length > shown.length && (
                <button onClick={() => setShowAll(true)} className="mt-2 text-[14px] font-bold text-slate-500 underline">
                  残り{unlinked.length - shown.length}名を見る
                </button>
              )}

              {/* ★★ 空の理由を言い分ける。★ 「いません」だけだと、隠しただけなのか本当に居ないのか分からない */}
              {unlinked.length === 0 && (
                <p className="text-[14px] text-slate-500">
                  {visible.length === 0
                    ? '公開中の方は、全員が結びついています。'
                    : '候補がある方はいません。一覧から選んで結んでください。'}
                </p>
              )}
            </div>
          )}

          {/* ── 結びついている方 ─────────────────────── */}
          {pairs.linked.length > 0 && (
            <div className="mt-4">
              <h4 className="text-[14.5px] font-bold text-slate-700 mb-2">結びついている方（{pairs.linked.length}名）</h4>
              <ul className="border border-slate-200 divide-y divide-slate-100">
                {pairs.linked.map((p) => (
                  <li key={p.therapistId} className="px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-[14.5px] text-slate-700">
                      <b className="font-bold text-slate-800">{p.name || '（名前なし）'}</b>
                      <span className="mx-1.5 text-slate-300">→</span>
                      {p.onMedia ? (
                        <span className="text-slate-600">{p.mediaName || '（名前なし）'}</span>
                      ) : (
                        /* ★★ 番号は知っているのに名簿に無い。★ 「いません」と言い切らない */
                        <span className="text-rose-600">いまの名簿に見つかりません</span>
                      )}
                    </span>
                    <button
                      onClick={() => onUnlink(p.therapistId, p.name)}
                      disabled={busy}
                      className="flex-none text-[13px] font-bold px-2.5 py-1 border border-slate-200 text-slate-500 disabled:opacity-50"
                    >
                      外す
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[13.5px] text-slate-400 leading-relaxed">
                外すと、送るときは名前で探す形に戻ります。消えるのは結びつきだけで、セラピストの登録は何も変わりません。
              </p>
            </div>
          )}

          <div className="mt-3 border border-sky-200 bg-sky-50 px-3 py-2.5">
            <p className="text-[14px] leading-relaxed text-slate-600">
              <b className="font-bold text-sky-700">「読みが同じ」は候補にすぎません。</b>{' '}
              別の方が同じ読みのこともあるので、{target?.label}の管理画面で確かめてから結んでください。
              間違えて結ぶと、その方の出勤が別の方の欄に入ります。
            </p>
          </div>
        </>
      )}
    </div>
  );
}
