'use client';

// ★ 第1928便（2026-11-11・カッキーさん「エステ魂も駅ちかみたいに」）: エステ魂の集客アピールの設定画面（枠ごと）。
//   中身は今までの一覧のカード（SlotCard）をそのまま置いた
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ConecfShell } from '../../../ConecfShell';
import { useConecfHref } from '../../../ConecfBase';
import { useToast } from '@/app/components/useToast';
import { getConecfBump, type ConecfBumpSlot } from '@/app/actions/conecfBump';
import { SITES, SlotCard } from '../../BumpParts';

function Body({ slotNo, enabled, onToast }: { slotNo: number; enabled: boolean; onToast: (m: string) => void }) {
  const href = useConecfHref();
  const [data, setData] = useState<{ slot: ConecfBumpSlot | null; many: boolean } | undefined>(undefined);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const res = await getConecfBump('esutama');
    if (!res.ok) { setError(res.error); return; }
    setData({ slot: res.data.slots.find((x) => x.slot === slotNo) ?? null, many: res.data.slots.length > 1 }); setError('');
  }, [slotNo]);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="space-y-3 pb-40">
      <Link href={href('/bump')} className="inline-flex items-center gap-1 text-[15px] font-bold text-slate-500 hover:text-slate-700">← 上位表示設定の一覧へ</Link>
      {error && <div className="bg-white border border-slate-200 p-5 text-[14px] text-slate-500">読み込めませんでした（{error}）</div>}
      {!error && data === undefined && <div className="bg-white border border-slate-200 p-5 text-[14px] text-slate-400">読み込み中…</div>}
      {!error && data && !data.slot && <div className="bg-white border border-slate-200 p-5 text-[14px] text-slate-500">エステ魂の枠{slotNo}は登録されていません。</div>}
      {!error && data?.slot && (
        <SlotCard key={[data.slot.enabled, data.slot.startMin, data.slot.endMin, data.slot.intervalMin].join(':')}
          site={SITES.esutama} s={data.slot} many={data.many} enabled={enabled} onToast={onToast} onSaved={load} />
      )}
    </div>
  );
}

export default function ConecfEsutamaBumpSlotPage() {
  const params = useParams<{ slot: string }>();
  const slotNo = Number(params?.slot);
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="bump" title="エステ魂の集客アピール" toast={toast}>
      {(a) => (Number.isInteger(slotNo) && slotNo >= 1
        ? <Body slotNo={slotNo} enabled={!!a.enabledAt} onToast={showToast} />
        : <div className="bg-white border border-slate-200 p-5 text-[14px] text-slate-500">枠の指定が正しくありません。</div>)}
    </ConecfShell>
  );
}
