'use client';

// ★ 第1928便（2026-11-11・カッキーさん「エステ魂も駅ちかみたいに」）: エステ魂の集客アピールの設定画面（枠ごと）。
//   中身は今までの一覧のカード（SlotCard）をそのまま置いた
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useLoadOnMount } from '../../../conecfClientUtil';
import { ConecfShell } from '../../../ConecfShell';
import { useConecfHref } from '../../../ConecfBase';
import { useToast } from '@/app/components/useToast';
import { getConecfBump, getEsutamaAppealRows, saveEsutamaAppealRow, runEsutamaAppealRowNow, type ConecfBumpSlot, type EsutamaAppealRowSlot } from '@/app/actions/conecfBump';
import { esutamaAppealRowFromSlug, esutamaAppealRowLabel, ESUTAMA_APPEAL_INTERVAL_CHOICES } from '@/lib/esutamaAppealRows';
import { ScheduleEditor } from '../../ScheduleEditor';
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
  useLoadOnMount(load);
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

// ★ 第1930便: 行ごと（/bump/esutama/shop・coupon・exp）。タイマー更新／時刻指定更新は駅ちかの枠と同じ部品
function RowBody({ rowKey, enabled, onToast }: { rowKey: string; enabled: boolean; onToast: (m: string) => void }) {
  const href = useConecfHref();
  const [row, setRow] = useState<EsutamaAppealRowSlot | null | undefined>(undefined);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const res = await getEsutamaAppealRows();
    if (!res.ok) { setError(res.error); return; }
    if (!res.data.ready) { setError('準備中です（運営事務局までご連絡ください）'); return; }
    setRow(res.data.rows.find((x) => x.rowKey === rowKey) ?? null); setError('');
  }, [rowKey]);
  useLoadOnMount(load);
  const label = esutamaAppealRowLabel(rowKey);
  if (error) return <div className="bg-white border border-slate-200 p-5 text-[16px] text-slate-500">読み込めませんでした（{error}）</div>;
  if (row === undefined) return <div className="bg-white border border-slate-200 p-5 text-[16px] text-slate-400">読み込み中…</div>;
  if (row === null) return <div className="bg-white border border-slate-200 p-5 text-[16px] text-slate-500">見つかりませんでした。<Link href={href('/bump')} className="underline">一覧へ</Link></div>;
  return (
    <ScheduleEditor key={[row.enabled, row.startMin, row.endMin, row.intervalMin, (row.times ?? []).join(',')].join('|')}
      s={row} enabled={enabled} onToast={onToast} onSaved={load}
      name={label} siteName="エステ魂" defaultQuota={10} choices={ESUTAMA_APPEAL_INTERVAL_CHOICES}
      heading={<>エステ魂　<span className="text-violet-600">集客アピール（{label}）</span></>}
      save={(i) => saveEsutamaAppealRow({ row: rowKey, ...i })}
      run={() => runEsutamaAppealRowNow({ row: rowKey })} what="アピール" />
  );
}

export default function ConecfEsutamaBumpSlotPage() {
  const params = useParams<{ slot: string }>();
  const rowKey = esutamaAppealRowFromSlug(String(params?.slot ?? ''));
  const slotNo = Number(params?.slot);
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="bump" title="エステ魂の集客ワンクリックアピール" toast={toast}>
      {(a) => rowKey ? <RowBody rowKey={rowKey} enabled={!!a.enabledAt} onToast={showToast} /> : (Number.isInteger(slotNo) && slotNo >= 1
        ? <Body slotNo={slotNo} enabled={!!a.enabledAt} onToast={showToast} />
        : <div className="bg-white border border-slate-200 p-5 text-[14px] text-slate-500">枠の指定が正しくありません。</div>)}
    </ConecfShell>
  );
}
