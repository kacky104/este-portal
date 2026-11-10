'use client';

// ★ 第1928便・第1931便（2026-11-11・カッキーさん）: フクエスの上位表示（TOP・地域ページ）の設定画面。
//   駅ちかの枠・エステ魂の集客アピールと同じ「タイマー更新／時刻指定更新」（ScheduleEditor）。回数は1日40回・朝6時に戻る
import { useCallback, useEffect, useState } from 'react';
import { ConecfShell } from '../../ConecfShell';
import { useToast } from '@/app/components/useToast';
import { getFukuesSchedule, saveFukuesSchedule, runFukuesBumpNow, type ConecfBumpSlot } from '@/app/actions/conecfBump';
import { EKICHIKA_BUMP_INTERVAL_CHOICES } from '@/lib/ekichikaBump';
import { ScheduleEditor } from '../ScheduleEditor';

function Body({ enabled, onToast }: { enabled: boolean; onToast: (m: string) => void }) {
  const [s, setS] = useState<ConecfBumpSlot | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const r = await getFukuesSchedule();
    if (!r.ok) { setError(r.error); return; }
    setS(r.data); setError('');
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (error) return <div className="bg-white border border-slate-200 p-5 text-[16px] text-slate-500">読み込めませんでした（{error}）</div>;
  if (!s) return <div className="bg-white border border-slate-200 p-5 text-[16px] text-slate-400">読み込み中…</div>;
  return (
    <ScheduleEditor key={[s.enabled, s.startMin, s.endMin, s.intervalMin, (s.times ?? []).join(',')].join('|')}
      s={s} enabled={enabled} onToast={onToast} onSaved={load}
      name="TOP・地域ページ" siteName="フクエス" defaultQuota={40} choices={EKICHIKA_BUMP_INTERVAL_CHOICES}
      heading={<>フクエス　<span className="text-rose-600">TOP・地域ページ</span></>}
      save={(i) => saveFukuesSchedule(i)} run={() => runFukuesBumpNow()} />
  );
}

export default function ConecfFukuesBumpPage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="bump" title="フクエスの上位表示" toast={toast}>
      {() => <Body enabled onToast={showToast} />}
    </ConecfShell>
  );
}
