'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getDiaryWritePref, setDiaryWritePref } from '@/app/actions/mediaCredentials';

// ★ 第895便（2026-09-26・カッキーさん）: フクエスリンクのホーム「写メ日記の書き方」。
// ★ 店舗オーナーが選ぶ: 駅ちかで書く（駅ちか → フクエス）／フクエスで書く（フクエス → フクエス・駅ちか）。
// ★ 入口は常に1つ（二重投稿を防ぐ）。★ 押す前に、何が変わるかを必ず出す。

type State = { pref: 'auto' | 'fukues'; source: string; total: number; withAddress: number; backfilling: boolean };

export function DiaryWriteChoice({ salonId, onToast }: { salonId: number; onToast: (m: string) => void }) {
  const [st, setSt] = useState<State | null>(null);
  const [ask, setAsk] = useState<'auto' | 'fukues' | null>(null);
  const [busy, setBusy] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getDiaryWritePref({ salonId }).then((r) => { if (alive && r.ok) setSt(r.data); }).catch(() => {});
    return () => { alive = false; };
  }, [salonId]);

  if (!st) return null;

  const onGo = async (pref: 'auto' | 'fukues') => {
    setBusy(true);
    const r = await setDiaryWritePref({ salonId, pref });
    setBusy(false);
    if (!r.ok) { onToast(r.error); return; }
    setSt(r.data); setAsk(null);
    setImportNote(r.data.addressImport);
    onToast(pref === 'fukues' ? '写メ日記を「フクエスで書く」にしました' : '写メ日記を「駅ちかで書く」に戻しました');
  };

  const opt = (pref: 'auto' | 'fukues', title: string, body: string) => {
    const on = st.pref === pref;
    return (
      <button type="button" disabled={busy} onClick={() => { if (!on) setAsk(pref); }}
        className={`text-left border px-4 py-3 transition-colors ${on ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
        <span className="flex items-center gap-2">
          <span className={`w-4 h-4 rounded-full border-2 flex-none ${on ? 'border-amber-600 bg-amber-500' : 'border-slate-300 bg-white'}`} />
          <b className="text-[15px] text-slate-800">{title}</b>
          {on && <span className="ml-auto text-[11px] font-bold text-amber-700 bg-white border border-amber-300 px-1.5 py-0.5">選択中</span>}
        </span>
        <span className="block mt-1.5 text-[12.5px] text-slate-500 leading-relaxed">{body}</span>
      </button>
    );
  };

  return (
    <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5 space-y-3">
      <p className="text-[13px] font-bold text-slate-400 text-center">写メ日記の書き方</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {opt('auto', '駅ちかで書く', '駅ちかに書いた写メ日記を、フクエスに載せます。')}
        {opt('fukues', 'フクエスで書く', 'セラピストページ（フクエス）で書いた写メ日記を、フクエスと駅ちかに載せます。')}
      </div>

      {ask && (
        <div className="border border-amber-300 bg-amber-50 px-4 py-3 space-y-2.5">
          <p className="text-[14px] font-bold text-amber-900">
            {ask === 'fukues' ? '「フクエスで書く」に切り替えますか？' : '「駅ちかで書く」に戻しますか？'}
          </p>
          <ul className="text-[13px] text-amber-900/90 leading-relaxed list-disc pl-5 space-y-0.5">
            {ask === 'fukues' ? (
              <>
                <li>セラピストは、セラピストページ（フクエス）から写メ日記を書きます。</li>
                <li><b>駅ちかに直接書いた写メ日記は、フクエスに載らなくなります</b>（同じ日記が2つ並ばないため）。</li>
                <li>駅ちかへは、投稿用メールアドレスが登録されているセラピストの分だけ届きます（いま {st.withAddress}/{st.total}名）。</li>
                <li>出勤・セラピスト・即ヒメは、今までどおり駅ちかから反映します。</li>
                {st.backfilling && <li>いま過去の写メ日記をフクエスに載せている途中です。切り替える前に駅ちかで書かれた分は、最後まで載せます。</li>}
              </>
            ) : (
              <>
                <li>駅ちかに書いた写メ日記を、15分ごとにフクエスに載せます。</li>
                <li>フクエスで書いた写メ日記は、駅ちかへ送らなくなります。</li>
              </>
            )}
          </ul>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAsk(null)} disabled={busy} className="px-4 py-2 border border-slate-300 bg-white text-[14px] font-bold text-slate-600">やめる</button>
            <button type="button" onClick={() => void onGo(ask)} disabled={busy} className="px-5 py-2 bg-amber-600 text-white text-[14px] font-bold disabled:opacity-50">
              {busy ? '切り替えています…' : '切り替える'}
            </button>
          </div>
        </div>
      )}

      {st.pref === 'fukues' && !ask && (
        // ★ 第907便（カッキーさん）: 「フクエスで書く」のブロックの下（右の列）に出す
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="sm:col-start-2 text-[13px] text-slate-600 leading-relaxed space-y-1">
          <p>
            駅ちかの投稿用アドレス：<b className="tabular-nums">{st.withAddress}/{st.total}名</b> 登録済み
            {st.withAddress < st.total && <span className="text-rose-600">（未登録の方の写メ日記は、駅ちかへ届きません）</span>}
          </p>
          {importNote === 'started' && <p className="text-slate-500">駅ちかから投稿用アドレスを読み込んでいます（数分かかります）。</p>}
          {importNote === 'no_credential' && (
            <p className="text-slate-500">
              <Link href="/mypage/media/login" className="text-indigo-600 underline">駅ちかのID・PW</Link>を登録すると、投稿用アドレスを読み込めます。
            </p>
          )}
          <Link href="/mypage/media/diary" className="inline-block text-[13px] font-bold text-indigo-600 underline">写メ日記の投稿先を見る →</Link>
        </div>
        </div>
      )}
    </div>
  );
}
