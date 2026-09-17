'use client';

import { useEffect, useRef, useState } from 'react';
import { startConecfEkichikaEdit, getConecfEkichikaEditStatus, type EkichikaEditStatus } from '@/app/actions/conecfGirlEdit';

// 「駅ちかへ反映」（第418便）。★ ①確かめる → ②「◯欄が変わります」→ ③送る → 結果。
// ★ 中継は1分ごとなので、5秒おきに結果を聞く（最大6分）。★ 画面を閉じても処理は進む。

type Phase = 'idle' | 'checking' | 'checked' | 'sending' | 'sent' | 'error';

export function EkichikaEditPanel({ id, enabled, onToast }: { id: number; enabled: boolean; onToast: (m: string) => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [res, setRes] = useState<Extract<EkichikaEditStatus, { state: 'done' }> | null>(null);
  const [msg, setMsg] = useState('');
  const timer = useRef<number | null>(null);

  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current); }, []);

  const watch = (flowId: string, next: Phase) => {
    const started = Date.now();
    if (timer.current) window.clearInterval(timer.current);
    timer.current = window.setInterval(async () => {
      const s = await getConecfEkichikaEditStatus({ flowId });
      if (s.ok && s.data.state === 'done') {
        if (timer.current) window.clearInterval(timer.current);
        setRes(s.data);
        setPhase(next);
        return;
      }
      if (Date.now() - started > 6 * 60 * 1000) {
        if (timer.current) window.clearInterval(timer.current);
        setMsg('時間がかかっています。少し経ってから「更新結果」をご確認ください');
        setPhase('error');
      }
    }, 5000);
  };

  const start = async (apply: boolean) => {
    if (!enabled) { onToast('反映するには、ホームで「コネックエフに切り替える」を押してください'); return; }
    setMsg(''); setRes(null);
    setPhase(apply ? 'sending' : 'checking');
    const r = await startConecfEkichikaEdit({ id, apply });
    if (!r.ok) { setMsg(r.error); setPhase('error'); return; }
    watch(r.data.flowId, apply ? 'sent' : 'checked');
  };

  const busy = phase === 'checking' || phase === 'sending';
  const canSend = phase === 'checked' && res && res.dryRun && res.changes > 0;

  return (
    <div className="bg-white border border-slate-200 px-4 py-3 space-y-2 text-[14px] text-[#212121]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-bold">駅ちかへ反映</span>
        <span className="text-[12px] text-slate-500">コメント・各サイト項目・Q&A・年齢サイズを駅ちかへ送ります（名前は送りません／空の欄は駅ちかのまま）</span>
        <button type="button" disabled={busy} onClick={() => void start(false)}
          className="ml-auto h-8 px-4 rounded border border-[#1e88e5] text-[#1558d6] text-[12px] disabled:opacity-40">
          {phase === 'checking' ? '駅ちかを確かめています…' : '変わる内容を確かめる'}
        </button>
      </div>

      {busy && <p className="text-[12px] text-slate-500">1〜2分ほどかかります。この画面を閉じても処理は続きます。</p>}
      {phase === 'error' && msg && <p className="text-[13px] text-rose-600">{msg}</p>}

      {phase === 'checked' && res && (
        res.dryRun && res.changes > 0 ? (
          <div className="border border-[#b9d2e8] bg-[#f5faff] px-3 py-2.5 space-y-2">
            <p><b>{res.changes}欄</b>が変わります：{res.labels}</p>
            {res.skipped && <p className="text-[12px] text-amber-700">送らない欄：{res.skipped}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setPhase('idle'); setRes(null); }} className="h-8 px-4 rounded bg-black/[0.07] text-[12px]">やめる</button>
              <button type="button" disabled={!canSend} onClick={() => void start(true)} className="h-8 px-4 rounded bg-[#218925] text-white text-[12px] disabled:opacity-40">駅ちかへ送る</button>
            </div>
          </div>
        ) : (
          <p className={`text-[13px] ${res.outcome === 'failed' ? 'text-rose-600' : 'text-slate-600'}`}>{res.summary}</p>
        )
      )}
      {phase === 'sending' && <p className="text-[12px] text-slate-500">送ったあと、駅ちかを読み直して確かめます。</p>}
      {phase === 'sent' && res && (
        <p className={`text-[13px] ${res.outcome === 'ok' ? 'text-[#218925]' : res.outcome === 'failed' ? 'text-rose-600' : 'text-slate-600'}`}>{res.summary}</p>
      )}
    </div>
  );
}
