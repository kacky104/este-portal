'use client';

import { useEffect, useState } from 'react';
import { getSalonDiaryConsents, setDiaryConsent } from '@/app/actions/diaryForward';
import {
  // ★ 第372便: consentNextStep は使わなくなった（いちばん下の1行を消したため）。lib には残っている
  toConsentState, consentLabel, tallyConsents, consentSummary,
  type ConsentState,
} from '@/lib/therapistMediaConsent';
// ★ 第372便: 名前の左の顔バッジ（投稿先の一覧と同じ部品）
import { TherapistBadge } from './TherapistBadge';
// ★ 第873便: 「連携」列
import { CastLinkMark, useCastLinked } from './CastLinkMark';

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
// ★ 第372便: SITE_NAME は消した（使っていた黄色い帯を外し、残る文は「魂セラピスト」と直接書いている）

type Row = { id: string; name: string; isActive: boolean; imageUrl: string | null; state: ConsentState };

export function DiaryConsent({ salonId, onToast, onChanged, showCastLink = false }: {
  salonId: number | null;
  /** ★ 第873便: true なら「連携」列（〇／✕）を出す（コネックエフだけ） */
  showCastLink?: boolean;
  onToast: (m: string) => void;
  /** ★ 第370便: 了承を変えたあとに呼ぶ。★ 上の「どのサイト」タブの人数を読み直すため（DiaryTargets） */
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const castLinked = useCastLinked(salonId, showCastLink);

  useEffect(() => {
    if (salonId == null) return;
    let live = true;
    void (async () => {
      const res = await getSalonDiaryConsents({ salonId, provider: PROVIDER });
      if (!live) return;
      if (!res.ok) { setError(res.error); setLoading(false); return; }
      const of = new Map(res.data.consents.map((c) => [c.therapistId, toConsentState(c.state)]));
      setRows(res.data.therapists.map((t) => ({
        id: t.id, name: t.name, isActive: t.isActive, imageUrl: t.imageUrl,
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
      onChanged?.();
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
      {/* ★ 第372便（2026-09-15・カッキーさん）: 見出し「◯◯へ日記を送ってよい方」を外し、
          本文を1文にした。★ 送れる条件を2つとも先に言う——
          ①ご本人が「魂セラピスト」を始めていること ②個人アカウントなので了承が要ること。
          ★ もとは②だけを2文で説明しており、①（相手側の状態）はずっと下の帯まで出てこなかった。 */}
      <p className="text-[13.5px] text-slate-500 leading-relaxed">
        写メ日記の転送はセラピストが「魂セラピスト」を始めていること。また個人アカウントなので了承を得る必要があります。
      </p>

      {/* ★★ 第372便（2026-09-15・カッキーさん）: 「何を預かるか」の説明から、
          【押すと何が起きるか】に書き換えた。★ 押した先（転送が始まる）と、
          押しても始まらない場合（魂セラピスト未開始）を、押す前に読める場所で言う。 */}
      <div className="mt-2.5 border border-sky-200 bg-sky-50 px-3 py-2.5">
        <p className="text-[13.5px] leading-relaxed text-slate-600">
          了承を得たセラピストのみ<b className="font-bold text-sky-700">了承あり</b>を押してください。投稿したら数分後に反映します。
          了承ありを押しても「魂セラピスト」を始めていないと転送できません。
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

          {/* ★ 第873便: 「連携」列の見出し（名前の欄を固定幅にして、下の〇／✕とそろえる） */}
          {castLinked && (
            <div className="mt-2 hidden sm:flex px-3 text-[13px] text-slate-400">
              <span className="w-[260px] flex-none">セラピスト</span>
              <span className="w-[60px] flex-none text-center">連携</span>
            </div>
          )}
          <ul className={`${castLinked ? 'mt-1' : 'mt-2'} border border-slate-200 divide-y divide-slate-100`}>
            {shown.map((r) => (
              <li key={r.id} className="px-3 py-2.5 flex items-start justify-between gap-3 flex-wrap">
                {/* ★ 第372便: 名前の左に顔バッジ（投稿先の一覧と揃える） */}
                <span className={`min-w-0 flex items-start gap-2 ${castLinked ? 'sm:w-[260px] sm:flex-none' : ''}`}>
                  <TherapistBadge url={r.imageUrl} name={r.name || ''} />
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
                </span>
                {castLinked && (
                  <span className="sm:w-[60px] sm:flex-none text-center pt-0.5">
                    <span className="sm:hidden text-[12px] text-slate-400 mr-1">連携</span>
                    <CastLinkMark linked={castLinked.has(String(r.id))} />
                  </span>
                )}
                <span className={`flex items-center gap-1.5 flex-wrap justify-end ${castLinked ? 'sm:ml-auto' : ''}`}>
                  {/* ★ 3つとも押せる。★ 「戻す」も含めて、いつでも選び直せる */}
                  {([
                    ['agreed', '了承あり'],
                    ['declined', '送らない'],
                    // ★ 第372便: ボタンの名前を「まだ確認していない」→「未確認」に短く（3つのボタンの幅を揃える）
                    ['unknown', '未確認'],
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

          {/* ★ 第372便（2026-09-15・カッキーさん）: いちばん下の
              「ご本人に確認してから、「了承あり」または「送らない」を選んでください。」を消した。
              ★ 上の水色の箱が同じこと（誰に押すか）を、押す前の位置で言っている。
              ★ 文そのもの（consentNextStep）と番人（check:consent）は lib に残してある。 */}

          {/* ★★★ 第372便（2026-09-15・カッキーさん）: 黄色い帯をブロックごと外した。
              ★ 中身は「「了承あり」の方から順にお送りします／数分後に反映／魂セラピストを
                始めていない方には送れない／セラピストさんには『エステ魂へ直接書かず、フクエスに書く』
                とお伝えください（両方から書くと日記が2本並ぶ）」の4点だった。
              ★★ 上の1文（魂セラピストを始めていること・了承が要ること）と重なっていた部分がある。
              ★ 戻すときは git log でこの便を引く。★ 判断そのもの（canSendDiary）は触っていない。 */}

        </>
      )}
    </div>
  );
}
