'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getMediaLinkAlerts } from '@/app/actions/mediaCredentials';
import type { MediaLinkAlert } from '@/lib/mediaLinkStall';
import type { MediaPageDecision } from '@/lib/mediaVisibility';

// 媒体連携のページの外枠（第56便）。見出し・戻る導線・見張りの赤い箱・トースト。
//
// ★★ 'show' 以外では【そもそも描かない】。hidden で隠すとページの中身から読めてしまう。
// ★ 見張りはページの先頭に出す。★ 直接ここを開いた人にも見えるようにするため。

export function MediaShell({
  decision, loadError, salonId, title, backHref, backLabel, toast, children,
}: {
  decision: MediaPageDecision;
  loadError: string;
  salonId: number | null;
  title: string;
  backHref: string;
  backLabel: string;
  toast?: string;
  children: React.ReactNode;
}) {
  const [alerts, setAlerts] = useState<MediaLinkAlert[]>([]);

  // ★ 出す相手にしか取りに行かない（取りに行くこと自体が媒体連携の存在を明かすため）。
  //   ★ 失敗しても画面は止めない。警告が出せないことを「異常なし」と見せないだけ。
  useEffect(() => {
    if (decision !== 'show' || salonId == null) { setAlerts([]); return; }
    let alive = true;
    (async () => {
      const res = await getMediaLinkAlerts({ salonId });
      if (alive && res.ok) setAlerts(res.data);
    })();
    return () => { alive = false; };
  }, [decision, salonId]);

  if (decision === 'leave') return null;

  if (loadError) {
    return (
      <div className="min-h-screen bg-pink-50/30 flex items-center justify-center">
        <p className="text-slate-500 text-sm whitespace-pre-line text-center leading-relaxed px-6">{loadError}</p>
      </div>
    );
  }

  if (decision !== 'show') {
    return (
      <div className="min-h-screen bg-pink-50/30 flex items-center justify-center">
        <p className="text-slate-400 text-sm">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pink-50/30">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-pink-200 shadow-lg rounded-2xl px-6 py-3 text-sm font-bold text-pink-600">
          {toast}
        </div>
      )}

      <div className="sticky top-0 z-40 bg-white shadow-sm">
        <header className="border-b border-slate-100">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <h1 className="text-base font-black text-slate-800 tracking-wide">{title}</h1>
            <Link href={backHref} className="text-xs text-slate-400 hover:text-pink-600 font-medium transition-colors">
              {backLabel}
            </Link>
          </div>
        </header>

        {alerts.length > 0 && (
          <div className="max-w-2xl mx-auto px-3 pt-2 pb-1">
            {alerts.map((a) => (
              <div
                key={a.watch + ':' + a.reason + ':' + a.provider + '#' + a.slot}
                className="mb-2 rounded-xl border-2 border-rose-300 bg-rose-50 px-3 py-2.5"
              >
                <p className="text-[12px] font-bold text-rose-700">
                  {a.watch === 'import' ? '駅ちかからの取り込みが止まっています' : '媒体連携が止まっています'}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-rose-900">{a.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <main className="max-w-2xl px-4 mx-auto py-6">{children}</main>
    </div>
  );
}
