'use client';

import Link from 'next/link';
import { ConecfShell } from './ConecfShell';
import { ConecfHome } from './ConecfHome';
import { useConecfHref } from './ConecfBase';
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

  if (done) {
    const d = new Date(done);
    const label = Number.isFinite(d.getTime())
      ? new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' }).format(d)
      : '';
    return (
      <div className="bg-white border border-emerald-200 px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[12.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5">コネックエフに切り替え済み{label ? `（${label}）` : ''}</span>
        <span className="text-[13px] text-slate-500">セラピストと出勤は、コネックエフで編集します。</span>
      </div>
    );
  }

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
            <li>キャッチ・紹介文・特徴バッジ、写メ日記・クーポン・ネット予約などは、これまでどおりマイページで編集します。</li>
            <li>元に戻したいときは、運営までご連絡ください。</li>
          </ul>
          {reading && (
            <div className="border border-rose-300 bg-rose-50 px-3 py-2.5 text-[13.5px] text-rose-800 leading-relaxed">
              いま <b>{reading.join('・')}</b> から出勤などを取り込んでいます。このままだとコネックエフで入れた出勤が上書きされるため、
              <b>取り込みを止めてから</b>切り替えます（ID・PASSはそのまま残ります）。
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setAsk(false); setReading(null); }} disabled={busy} className="px-4 py-2 border border-slate-300 bg-white text-[14px] font-bold text-slate-600">やめる</button>
            <button type="button" onClick={() => void onGo(reading !== null)} disabled={busy} className="px-5 py-2 bg-indigo-600 text-white text-[14px] font-bold disabled:opacity-50">
              {busy ? '切り替えています…' : reading ? '取り込みを止めて切り替える' : '切り替える'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConecfHomePage() {
  const href = useConecfHref();
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="home" title="ホーム" toast={toast}>
      {(access) => (
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-[17px] font-black text-slate-800 break-words">{access.salonName || access.email} 様</p>
            <Link href={href('/guide')} className="ml-auto text-[13.5px] font-bold text-indigo-600 underline underline-offset-4">はじめての方へ ›</Link>
          </div>
          <SwitchCard enabledAt={access.enabledAt} onToast={showToast} />
          <ConecfHome salonId={access.salonId} onToast={showToast} />
        </div>
      )}
    </ConecfShell>
  );
}
