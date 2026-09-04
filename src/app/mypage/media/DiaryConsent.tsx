'use client';

import { useEffect, useState } from 'react';
import { getSalonDiaryConsents, setDiaryConsent } from '@/app/actions/diaryForward';
import {
  toConsentState, consentLabel, consentNextStep, tallyConsents, consentSummary,
  type ConsentState,
} from '@/lib/therapistMediaConsent';

// エステ魂の写メ日記：セラピスト本人の了承（第118便・2026-09-03）。
//
// ★★★ なぜこの画面が要るか
//   エステ魂の写メ日記は【本人のアカウント】から投稿する（店舗の管理画面からは投稿できない・9/3 実測）。
//   ★ 店舗が繋いだからといって全員ぶん送ると、了承していない人の日記が本人のアカウントから出る。
//   → 送る相手を1人ずつ決める。★ 既定は【送らない】。
//
// ★★ この画面は【記録するだけ】。★ まだ1件も送らない（送る仕組みは第119便以降）。
//   ★ 先に作る理由: 店舗様がいまのうちからセラピストさんに了承を取り始められる。

const PROVIDER = 'esutama';
const SITE_NAME = 'エステ魂';

type Row = { id: string; name: string; isActive: boolean; state: ConsentState };

export function DiaryConsent({ salonId, onToast }: { salonId: number | null; onToast: (m: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (salonId == null) return;
    let live = true;
    void (async () => {
      const res = await getSalonDiaryConsents({ salonId, provider: PROVIDER });
      if (!live) return;
      if (!res.ok) { setError(res.error); setLoading(false); return; }
      const of = new Map(res.data.consents.map((c) => [c.therapistId, toConsentState(c.state)]));
      setRows(res.data.therapists.map((t) => ({
        id: t.id, name: t.name, isActive: t.isActive,
        // ★ 記録が無い人は「まだ確認していません」。★ 送らない側の既定
        state: of.get(t.id) ?? 'unknown',
      })));
      setError('');
      setLoading(false);
    })();
    return () => { live = false; };
  }, [salonId, reloadKey]);

  const onSet = async (r: Row, state: ConsentState) => {
    setBusy(r.id);
    try {
      const res = await setDiaryConsent({ therapistId: r.id, provider: PROVIDER, state });
      if (!res.ok) { onToast(res.error); return; }
      onToast(
        state === 'agreed' ? `${r.name}さんを「了承あり」にしました`
        : state === 'declined' ? `${r.name}さんを「送らない」にしました`
        : `${r.name}さんを「まだ確認していません」に戻しました`,
      );
      setReloadKey((k) => k + 1);
    } finally { setBusy(''); }
  };

  if (salonId == null) return null;

  // ★ 非公開の方は既定で出さない（送る相手ではない）。★ 隠した数は必ず言う
  const visible = rows.filter((r) => showHidden || r.isActive);
  const hiddenCount = rows.filter((r) => !r.isActive).length;
  const shown = showAll ? visible : visible.slice(0, 10);
  const tally = tallyConsents(
    rows.filter((r) => r.isActive).map((r) => Number(r.id)),
    rows.filter((r) => r.isActive).map((r) => ({ therapistId: Number(r.id), state: r.state })),
  );

  return (
    <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-4">
      <h3 className="text-[15.5px] font-bold text-slate-700">{SITE_NAME}へ日記を送ってよい方</h3>
      <p className="mt-0.5 text-[13.5px] text-slate-500 leading-relaxed">
        {SITE_NAME}の写メ日記は、<b className="text-slate-700">セラピストご本人のアカウント</b>から投稿する仕組みです。
        そのため、<b className="text-slate-700">ご本人の了承を得た方だけ</b>にお送りします。
      </p>

      {/* ★★ 何を預かるのかを、はっきり書く。★ 本人の署名ではない */}
      <div className="mt-2.5 border border-sky-200 bg-sky-50 px-3 py-2.5">
        <p className="text-[13.5px] leading-relaxed text-slate-600">
          ここに記録されるのは<b className="font-bold text-sky-700">店舗様が「ご本人の了承を得た」と申告された内容</b>です。
          ご本人に確認のうえでお選びください。あとから変更できます。
        </p>
      </div>

      {loading ? (
        <p className="mt-3 text-[14px] text-slate-400">読み込み中…</p>
      ) : error ? (
        <p className="mt-3 text-[14px] text-rose-600 leading-relaxed">
          了承の記録を読み込めませんでした（{error}）。しばらくしてから開き直してください。
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-[14px] font-bold text-slate-700">{consentSummary(tally)}</p>
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

          <ul className="mt-2 border border-slate-200 divide-y divide-slate-100">
            {shown.map((r) => (
              <li key={r.id} className="px-3 py-2.5 flex items-start justify-between gap-3 flex-wrap">
                <span className="min-w-0">
                  <b className="text-[15px] font-bold text-slate-800 break-words">{r.name || '（名前なし）'}</b>
                  {!r.isActive && (
                    <span className="ml-1.5 text-[12px] font-bold px-1.5 py-px border border-slate-200 bg-slate-50 text-slate-400">
                      非公開
                    </span>
                  )}
                  <span className={`block text-[13px] mt-0.5 ${
                    r.state === 'agreed' ? 'text-emerald-700'
                    : r.state === 'declined' ? 'text-slate-500' : 'text-amber-700'
                  }`}>
                    {consentLabel(r.state)}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 flex-wrap justify-end">
                  {/* ★ 3つとも押せる。★ 「戻す」も含めて、いつでも選び直せる */}
                  {([
                    ['agreed', '了承あり'],
                    ['declined', '送らない'],
                    ['unknown', 'まだ確認していない'],
                  ] as Array<[ConsentState, string]>).map(([s, label]) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onSet(r, s)}
                      disabled={busy !== '' || r.state === s}
                      aria-pressed={r.state === s}
                      className={`text-[13px] font-bold px-2.5 py-1 border disabled:opacity-40 ${
                        r.state === s
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>

          {visible.length > shown.length && (
            <button onClick={() => setShowAll(true)} className="mt-2 text-[14px] font-bold text-slate-500 underline">
              残り{visible.length - shown.length}名を見る
            </button>
          )}

          {visible.length === 0 && (
            <p className="mt-2 text-[14px] text-slate-500">公開中のセラピストがいません。</p>
          )}

          {/* ★ いま選んでいる状態が、次に何を意味するか */}
          <p className="mt-3 text-[13.5px] text-slate-400 leading-relaxed">
            {consentNextStep('unknown')}
          </p>

          {/*
            ★★★ 2026-09-04（第141便）: 文言を書き直した。
              ★ 以前は「いまはまだ、日記は送りません」だった（第118便・そのときは本当だった）。
              ★★ 2026-09-04 18:01 に**自動で送れるようになった**のに、この文が残っていた。
                ★ すぐ上に「お送りしました 2件」と出ているのに、下で「まだ送りません」。
                ★★★ **できるようになったら、できないと書いた文を消す。**
                  ★ 「できないことを、できないと書く」（§185）の裏返し。★ 同じくらい大事。
          */}
          <div className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="text-[14px] leading-relaxed text-slate-600">
              <b className="font-bold text-amber-800">「了承あり」の方から順にお送りします。</b>{' '}
              フクエスで写メ日記を書くと、数分後に{SITE_NAME}へ反映されます。
              なお、ご本人が{SITE_NAME}の「魂セラピスト」を始めていない場合は、了承をいただいていてもお送りできません。
              {' '}
              <b className="font-bold text-amber-800">
                セラピストさんには「{SITE_NAME}へ直接書かず、フクエスに書く」とお伝えください。
              </b>{' '}
              両方から書くと、同じ日記が2本並びます。
            </p>
          </div>
        </>
      )}
    </div>
  );
}
