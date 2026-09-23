'use client';

import { ConecfShell } from './ConecfShell';
import { ConecfHome } from './ConecfHome';
import { useToast } from '@/app/components/useToast';
import { useState } from 'react';
import { enableConecf } from '@/app/actions/conecf';

// コネックエフのホーム（第395便 1a → 第396便 1b で連携の状態を足した）。

// ★★ 「コネックエフに切り替える」（第399便・カッキーさんの決定）。★ 押す前に、何が変わるかを言う。
function SwitchCard({ enabledAt, onToast }: { enabledAt: string | null; onToast: (m: string) => void }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(enabledAt);
  // ★ 第400便: 駅ちかから反映が残っているとき、止めてよいかを聞く
  const [reading, setReading] = useState<string[] | null>(null);

  // ★ 第411便（カッキーさん）: 切り替え済みの帯は出さない（★ ベンリーに寄せて上をすっきり）。★ 切り替え前の案内だけ残す
  if (done) return null;

  const onGo = async (stopRead = false) => {
    setBusy(true);
    const res = await enableConecf({ stopRead });
    setBusy(false);
    if (!res.ok) {
      if (res.readingSites && res.readingSites.length > 0) { setReading(res.readingSites); return; }
      onToast(res.error); return;
    }
    setDone(res.enabledAt); setAsk(false);
    onToast('コネックエフに切り替えました');
    window.location.reload();
  };

  return (
    <div className="bg-white border-2 border-indigo-300 px-5 py-4 space-y-3">
      <p className="text-[16px] font-black text-indigo-800">コネックエフに切り替えましょう</p>
      <p className="text-[14px] text-slate-600 leading-relaxed">
        いまは見るだけです。切り替えると、セラピストの追加・写真・年齢・サイズ・公開と出勤を、コネックエフで保存できるようになります。
      </p>
      {!ask ? (
        <button type="button" onClick={() => setAsk(true)} className="px-5 py-2.5 bg-gradient-to-r from-indigo-700 to-indigo-500 text-white text-[15px] font-bold">
          コネックエフに切り替える
        </button>
      ) : (
        <div className="border border-amber-300 bg-amber-50 px-4 py-3 space-y-2.5">
          <p className="text-[14px] font-bold text-amber-900">切り替えますか？</p>
          <ul className="text-[13.5px] text-amber-900/90 leading-relaxed list-disc pl-5 space-y-0.5">
            <li>セラピストの追加・写真・年齢・サイズ・公開と出勤は、フクエスのマイページではなくコネックエフで編集するようになります。</li>
            {/* ★ 第470便: キャッチ・紹介文はコネックエフの「コメント」タブでも編集できる（★ フクエスと同じ列・駅ちか・エステ魂へも送れる） */}
            <li>キャッチ・紹介文は、マイページとコネックエフのどちらでも編集できます（同じ内容です）。</li>
            <li>クーポン・ネット予約などは、これまでどおりマイページで編集します。</li>
            <li>フクエスのマイページでの編集に戻したいときは、運営までご連絡ください。</li>
          </ul>
          {reading && (
            <div className="border border-rose-300 bg-rose-50 px-3 py-2.5 text-[13.5px] text-rose-800 leading-relaxed">
              いまは<b>{reading.join('・')}</b>から出勤などを反映させています。このままだとコネックエフで入れた出勤が上書きされるため、
              <b>反映を止めてから</b>切り替えます（ID・PASSはそのまま残ります）。
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setAsk(false); setReading(null); }} disabled={busy} className="px-4 py-2 border border-slate-300 bg-white text-[14px] font-bold text-slate-600">やめる</button>
            <button type="button" onClick={() => void onGo(reading !== null)} disabled={busy} className="px-5 py-2 bg-indigo-600 text-white text-[14px] font-bold disabled:opacity-50">
              {busy ? '切り替えています…' : reading ? '反映を止めて切り替える' : '切り替える'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConecfHomePage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="home" title="ホーム" toast={toast}>
      {(access) => (
        <div className="space-y-3">
          {/* ★ 第411便: 「◯◯ 様」の帯は外した（★ 店舗名はサイドバーに出ている。★ はじめての方へはサイドバーから） */}
          <SwitchCard enabledAt={access.enabledAt} onToast={showToast} />
          <ConecfHome salonId={access.salonId} onToast={showToast} />
        </div>
      )}
    </ConecfShell>
  );
}
