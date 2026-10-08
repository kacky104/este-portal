'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getConecfDiaryMixed, extendConecfDiaryMixed } from '@/app/actions/conecfDiaryMixed';

// コネックエフ「写メ日記転送」の、移行期間の枠（第1265便・2026-10-07・カッキーさんの決定）。
//   切り替えてから30日間は、セラピストがフクエスで1度写メ日記を投稿するまで、駅ちかに書いた写メ日記もフクエスに載せる。
//   期限を過ぎたら載せない（駅ちかへ見に行かない）。救済として、店舗様が「14日間延長する」を何回でも押せる。
// ★ 決めごとは src/lib/diaryMixedPeriod.ts。★ 「載せています」は、取り込みが実際に回る状態のときだけ言う（サーバーが running で返す）。
// ★ 延長は押す前に必ず確かめる（1回押すと14日のびる・連携の記録に残る）。

type State = {
  switched: boolean;
  lastDay: string | null;
  open: boolean;
  daysLeft: number | null;
  running: boolean;
  why: 'not_switched' | 'not_started' | 'expired' | 'no_key' | 'not_write' | 'unreadable' | null;
};

export function DiaryMixedPanel({ onToast, sitesHref, homeHref }: {
  onToast: (m: string) => void;
  /** コネックエフ「各サイトのログイン」 */
  sitesHref: string;
  /** コネックエフのホーム */
  homeHref: string;
}) {
  const [st, setSt] = useState<State | null>(null);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void getConecfDiaryMixed().then((r) => { if (alive && r.ok) setSt(r.data); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!st) return null;

  const onExtend = async () => {
    setBusy(true);
    const r = await extendConecfDiaryMixed();
    setBusy(false);
    if (!r.ok) { onToast(r.error); return; }
    setSt(r.data); setAsk(false);
    onToast(r.data.lastDay ? `移行期間を ${r.data.lastDay} まで延長しました` : '移行期間を延長しました');
  };

  const left = st.daysLeft === null ? '' : st.daysLeft <= 0 ? '今日まで' : `あと${st.daysLeft}日`;

  return (
    <div className="bg-white border border-slate-200 px-4 py-3 space-y-2 text-[13.5px] leading-relaxed text-slate-600">
      <p className="text-[13px] font-bold text-slate-400">写メ日記の移行期間（駅ちかに書いた写メ日記の取り込み）</p>

      {st.why === 'unreadable' && <p>移行期間の状態を読めませんでした。時間をおいて、画面を開き直してください。</p>}

      {st.why === 'not_switched' && (
        <p>
          コネックエフに切り替えると、30日間の移行期間が始まります。期間中は、セラピストがフクエスで1度写メ日記を投稿するまで、
          駅ちかに書いた写メ日記もフクエスに載ります。
        </p>
      )}

      {st.switched && st.open && (
        <>
          <p className="text-[15px] font-bold text-slate-800">
            移行期間：{st.lastDay} まで{left && <span className="ml-1.5 text-[13px] font-bold text-amber-700">（{left}）</span>}
          </p>
          <p>
            セラピストがフクエスで1度写メ日記を投稿するまでは、<b className="font-bold text-slate-800">駅ちかに書いた写メ日記もフクエスに載ります</b>（15分以内）。
            期間中に、<b className="font-bold text-slate-800">フクエスからの投稿への切り替え</b>をお願いします。
          </p>
          <p>期間を過ぎると、駅ちかに書いた写メ日記はフクエスに載らなくなります。</p>
          {st.why === 'no_key' && (
            <p className="text-rose-600">
              いまは載せていません。駅ちかのID・PWが未登録か、停止中です（
              <Link href={sitesHref} className="underline">各サイトのログイン</Link>でご登録ください）。
            </p>
          )}
          {st.why === 'not_write' && (
            <p className="text-rose-600">
              いまは載せていません。<Link href={homeHref} className="underline">ホーム</Link>で駅ちかを「フクエスから反映」にすると載せます。
            </p>
          )}
        </>
      )}

      {st.switched && st.why === 'expired' && (
        <>
          <p className="text-[15px] font-bold text-slate-800">移行期間は {st.lastDay} で終わりました</p>
          <p>駅ちかに書いた写メ日記は、フクエスに載りません。写メ日記は、フクエスから投稿してください。</p>
          <p>延長すると、押した日から14日間、駅ちかに書いた写メ日記をもう一度載せます（止まっていた間の分は、新しいものだけ載ります）。</p>
        </>
      )}

      {st.switched && st.why === 'not_started' && (
        <>
          <p className="text-[15px] font-bold text-slate-800">移行期間は設定されていません</p>
          <p>駅ちかに書いた写メ日記は、フクエスに載りません。下のボタンを押すと、押した日から14日間、フクエスでまだ投稿していない方の分を載せます。</p>
        </>
      )}

      {st.switched && st.why !== 'unreadable' && !ask && (
        <button type="button" onClick={() => setAsk(true)} disabled={busy}
          className="px-4 py-2 border border-amber-500 bg-white text-[14px] font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50">
          14日間延長する
        </button>
      )}

      {st.switched && ask && (
        <div className="border border-amber-300 bg-amber-50 px-4 py-3 space-y-2.5">
          <p className="text-[14px] font-bold text-amber-900">移行期間を14日間延長しますか？</p>
          <ul className="text-[13px] text-amber-900/90 leading-relaxed list-disc pl-5 space-y-0.5">
            {st.open
              ? <li>いまの期限（{st.lastDay} まで）に、14日を足します。</li>
              : <li>今日から14日間、駅ちかに書いた写メ日記をもう一度フクエスに載せます。</li>}
            <li>フクエスで1度投稿した方の分は、駅ちかからは載せません（同じ日記が2つ並ばないため）。</li>
          </ul>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAsk(false)} disabled={busy} className="px-4 py-2 border border-slate-300 bg-white text-[14px] font-bold text-slate-600">やめる</button>
            <button type="button" onClick={() => void onExtend()} disabled={busy} className="px-5 py-2 bg-amber-600 text-white text-[14px] font-bold disabled:opacity-50">
              {busy ? '延長しています…' : '延長する'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
