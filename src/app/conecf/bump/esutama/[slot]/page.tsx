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
import { APPEAL_WEEK_KEYS, APPEAL_WEEK_LABEL, APPEAL_WEEK_TIMES_MAX, type AppealWeekKey, type AppealWeekTimes } from '@/lib/esutamaAppealWeek';
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
        content: <WeekTimesEditor rowKey={rowKey} week={row.weekTimes} enabled={enabled} onToast={onToast} onSaved={load} />,
      } : undefined} />
    </div>
  );
}

// ★ 第2048便（2026-11-28・オイルクエスト様のご要望）: 曜日ごとの時刻指定（月〜日それぞれ10個まで・朝6時はじまりの1日）
// ★ 第2050便: 入力を「時刻指定更新」と同じ形に（1行に1つの時刻・×で消す・＋時刻を足す）。説明文をタブの位置に合わせる
function WeekTimesEditor({ rowKey, week, enabled, onToast, onSaved }: {
  rowKey: string; week: AppealWeekTimes; enabled: boolean; onToast: (m: string) => void; onSaved: () => void;
}) {
  // ★ 第2051便（カッキーさん）: はじめは「月」。「今日」の印と、今日の曜日へ合わせるのはやめた（保存のあとも開いている曜日のまま）
  const [tab, setTab] = useState<AppealWeekKey>('mon');
  const pad = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const [rows, setRows] = useState<Record<AppealWeekKey, string[]>>(() => Object.fromEntries(APPEAL_WEEK_KEYS.map((k) => [k, (week[k] ?? []).map(pad)])) as Record<AppealWeekKey, string[]>);
  const [busy, setBusy] = useState(false);
  const count = (k: AppealWeekKey) => rows[k].filter((v) => v.trim() !== '').length;
  const cur = rows[tab];
  const setCur = (f: (v: string[]) => string[]) => setRows((p) => ({ ...p, [tab]: f(p[tab]) }));
  const save = async () => {
    setBusy(true);
    const r = await saveEsutamaAppealWeekTimes({ row: rowKey, week: Object.fromEntries(APPEAL_WEEK_KEYS.map((k) => [k, rows[k].filter((v) => v.trim() !== '').join(' ')])) });
    setBusy(false);
    if (!r.ok) { onToast(r.error); return; }
    onToast(r.data.days > 0 ? `曜日ごとの時刻を保存しました（${r.data.days}曜日）` : '曜日ごとの時刻を空にしました（毎日「時刻指定更新」の設定で押します）');
    onSaved();
  };
  return (
    <div className="space-y-3">
      <p className="text-[15px] text-slate-500 leading-relaxed">
        曜日ごとに、押す時刻を{APPEAL_WEEK_TIMES_MAX}個まで入れられます。1日は朝6時はじまりです（月曜の深夜1:00に押すときは「月」に 01:00 を入れます）。
        <br />時刻を入れていない曜日は、「タイマー更新」「時刻指定更新」のタブの設定で押します。
      </p>
      <div className="flex flex-wrap gap-1">
        {APPEAL_WEEK_KEYS.map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`h-10 min-w-[56px] px-3 text-[16px] font-bold border ${k === tab ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-slate-700 border-slate-300'}`}>
            {APPEAL_WEEK_LABEL[k]}{count(k) > 0 ? `（${count(k)}）` : ''}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <span className="text-[16px] font-bold text-slate-700">{APPEAL_WEEK_LABEL[tab]}曜日に押す時刻</span>
        <span className="text-[15px] text-slate-500 tabular-nums">{count(tab)}/{APPEAL_WEEK_TIMES_MAX}個</span>
      </div>
      {cur.length === 0 ? (
        <p className="text-[15px] text-slate-400">この曜日は時刻を入れていません（「タイマー更新」「時刻指定更新」のタブの設定で押します）。</p>
      ) : (
        <ol className="space-y-1.5">
          {cur.map((v, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-6 text-right text-[16px] text-slate-400 tabular-nums">{i + 1}</span>
              <input type="time" step={60} value={v} disabled={!enabled}
                onChange={(e) => { const x = e.target.value; setCur((arr) => arr.map((y, j) => (j === i ? x : y))); }}
                className="w-52 px-3 py-1.5 text-[18px] border border-slate-300 bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-200" />
              <button type="button" aria-label="この時刻を消す" onClick={() => setCur((arr) => arr.filter((_, j) => j !== i))}
                className="px-2 text-[16px] text-slate-400 hover:text-rose-600">×</button>
            </li>
          ))}
        </ol>
      )}
      {cur.length < APPEAL_WEEK_TIMES_MAX && (
        <button type="button" disabled={!enabled} onClick={() => setCur((arr) => [...arr, ''])}
          className="px-3 py-1.5 text-[17px] font-bold text-slate-600 border border-dashed border-slate-300 hover:bg-slate-50 disabled:opacity-40">＋ 時刻を足す</button>
      )}
      <div className="flex items-center gap-3 flex-wrap border-t border-slate-100 pt-3">
        <button type="button" onClick={() => void save()} disabled={busy || !enabled}
          className="px-6 py-2.5 text-[17px] font-black text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40">{busy ? '保存中…' : '曜日ごとの時刻を保存'}</button>
        <span className="text-[16px] text-slate-500">月〜日の7曜日ぶんを、まとめて保存します。</span>
      </div>
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
