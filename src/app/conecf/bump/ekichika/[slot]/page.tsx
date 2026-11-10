'use client';

// ★ 第1923便（2026-11-11・カッキーさん・オイルクエスト様「ベンリーと同じに」）: 駅ちかの上位表示を【枠ごとに】設定する画面。
//   ★ ベンリーの「駅ちか人気！風俗ランキング(上位表示)」と同じ形: 上に「自動を始める／止める」と残り回数、
//     タブで「タイマー更新（時間帯＋間隔）」と「時刻指定更新（時刻を1つずつ・最大40）」。保存したタブの方式で押す。
//   ★ 中身の保存は saveConecfBump（times: 配列＝時刻指定／[]＝タイマーに戻す）。押すのは VPS の周（/api/admin/ekichika-bump）

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ConecfShell } from '../../../ConecfShell';
import { useToast } from '@/app/components/useToast';
import { getConecfBump, saveConecfBump, runConecfBumpNow, type ConecfBumpSlot } from '@/app/actions/conecfBump';
import { ScheduleEditor } from '../../ScheduleEditor';
import { EKICHIKA_BUMP_INTERVAL_CHOICES } from '@/lib/ekichikaBump';

function Body({ slotNo, enabled, onToast }: { slotNo: number; enabled: boolean; onToast: (m: string) => void }) {
  const [slot, setSlot] = useState<ConecfBumpSlot | null | undefined>(undefined);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const res = await getConecfBump('ekichika');
    if (!res.ok) { setError(res.error); return; }
    setSlot(res.data.slots.find((x) => x.slot === slotNo) ?? null); setError('');
  }, [slotNo]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <div className="bg-white border border-slate-200 p-5 text-[18px] text-slate-500">読み込めませんでした（{error}）</div>;
  if (slot === undefined) return <div className="bg-white border border-slate-200 p-5 text-[18px] text-slate-400">読み込み中…</div>;
  if (slot === null) return <div className="bg-white border border-slate-200 p-5 text-[18px] text-slate-500">駅ちかの枠{slotNo}は登録されていません。</div>;
  return <ScheduleEditor key={[slot.enabled, slot.startMin, slot.endMin, slot.intervalMin, (slot.times ?? []).join(',')].join('|')} s={slot} enabled={enabled} onToast={onToast} onSaved={load}
    name={`枠${slot.slot}`} siteName="駅ちか" defaultQuota={40} choices={EKICHIKA_BUMP_INTERVAL_CHOICES}
    heading={slot.area ? <>枠{slot.slot}　<span className="text-orange-600">{slot.area}</span></> : undefined}
    save={(i) => saveConecfBump({ provider: 'ekichika', slot: slot.slot, ...i })}
    run={() => runConecfBumpNow({ provider: 'ekichika', slot: slot.slot })} />;
}

export default function ConecfEkichikaBumpSlotPage() {
  const params = useParams<{ slot: string }>();
  const slotNo = Number(params?.slot);
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="bump" title={`駅ちか（枠${Number.isInteger(slotNo) ? slotNo : ''}）の上位表示`} toast={toast}>
      {(a) => (Number.isInteger(slotNo) && slotNo >= 1
        ? <Body slotNo={slotNo} enabled={!!a.enabledAt} onToast={showToast} />
        : <div className="bg-white border border-slate-200 p-5 text-[18px] text-slate-500">枠の指定が正しくありません。</div>)}
    </ConecfShell>
  );
}
