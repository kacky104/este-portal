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
import { getConecfBump, getEsutamaAppealRows, saveEsutamaAppealRow, runEsutamaAppealRowNow, saveEsutamaAppealWeekTimes, type ConecfBumpSlot, type EsutamaAppealRowSlot } from '@/app/actions/conecfBump';
import { APPEAL_WEEK_KEYS, APPEAL_WEEK_LABEL, APPEAL_WEEK_TIMES_MAX, appealBusinessWeekKey, type AppealWeekKey, type AppealWeekTimes } from '@/lib/esutamaAppealWeek';
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
    <div className="space-y-3">
    <ScheduleEditor key={[row.enabled, row.startMin, row.endMin, row.intervalMin, (row.times ?? []).join(',')].join('|')}
      s={row} enabled={enabled} onToast={onToast} onSaved={load}
      name={label} siteName="エステ魂" defaultQuota={10} choices={ESUTAMA_APPEAL_INTERVAL_CHOICES}
      heading={<>エステ魂　<span className="text-violet-600">集客アピール（{label}）</span></>}
      save={(i) => saveEsutamaAppealRow({ row: rowKey, ...i })}
      run={() => runEsutamaAppealRowNow({ row: rowKey })} what="アピール"
      extraTab={row.weekTimes ? {
        label: '曜日ごとの時刻指定',
        content: <WeekTimesEditor key={JSON.stringify(row.weekTimes)} rowKey={rowKey} week={row.weekTimes} enabled={enabled} onToast={onToast} onSaved={load} />,
      } : undefined} />
    </div>
  );
}

const hhmm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

// ★ 第2048便（2026-11-28・オイルクエスト様のご要望）: 曜日ごとの時刻指定（月〜日それぞれ10個まで・朝6時はじまりの1日）
function WeekTimesEditor({ rowKey, week, enabled, onToast, onSaved }: {
  rowKey: string; week: AppealWeekTimes; enabled: boolean; onToast: (m: string) => void; onSaved: () => void;
}) {
  const today = appealBusinessWeekKey(new Date());
  const [tab, setTab] = useState<AppealWeekKey>(today);
  const [text, setText] = useState<Record<AppealWeekKey, string>>(() => Object.fromEntries(APPEAL_WEEK_KEYS.map((k) => [k, (week[k] ?? []).map(hhmm).join(' ')])) as Record<AppealWeekKey, string>);
  const [busy, setBusy] = useState(false);
  const count = (k: AppealWeekKey) => text[k].split(/[\s,、，]+/).filter(Boolean).length;
  const save = async () => {
    setBusy(true);
    const r = await saveEsutamaAppealWeekTimes({ row: rowKey, week: text });
    setBusy(false);
    if (!r.ok) { onToast(r.error); return; }
    onToast(r.data.days > 0 ? `曜日ごとの時刻を保存しました（${r.data.days}曜日）` : '曜日ごとの時刻を空にしました（毎日、上の設定で押します）');
    onSaved();
  };
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-slate-500 leading-relaxed">
        曜日ごとに、押す時刻を{APPEAL_WEEK_TIMES_MAX}個まで入れられます（例 10:04 12:16 17:05）。1日は朝6時はじまりです（月曜の深夜1:00に押すときは「月」に 1:00 と入れます）。
        <br />時刻が空の曜日は、上の設定（タイマー更新／時刻指定更新）で押します。
      </p>
      <div className="flex flex-wrap gap-1">
        {APPEAL_WEEK_KEYS.map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`h-9 min-w-[52px] px-3 text-[14px] font-bold border ${k === tab ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-700 border-slate-300'}`}>
            {APPEAL_WEEK_LABEL[k]}{count(k) > 0 ? `（${count(k)}）` : ''}{k === today ? '・今日' : ''}
          </button>
        ))}
      </div>
      <div className="space-y-1">
        <label className="block text-[13px] font-bold text-slate-600">{APPEAL_WEEK_LABEL[tab]}曜日に押す時刻</label>
        <input value={text[tab]} onChange={(e) => setText((p) => ({ ...p, [tab]: e.target.value }))} disabled={!enabled}
          placeholder="空欄なら上の設定で押します" className="w-full border border-slate-300 px-3 py-2 text-[15px]" />
        <p className={`text-[12px] ${count(tab) > APPEAL_WEEK_TIMES_MAX ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>{count(tab)} / {APPEAL_WEEK_TIMES_MAX}個</p>
      </div>
      <button type="button" onClick={() => void save()} disabled={busy || !enabled}
        className="px-5 py-2 bg-violet-600 text-white text-[14px] font-bold disabled:opacity-50">{busy ? '保存しています…' : '曜日ごとの時刻を保存'}</button>
    </div>
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
