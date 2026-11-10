'use client';

// ★ 第1923便（2026-11-11・カッキーさん・オイルクエスト様「ベンリーと同じに」）: 駅ちかの上位表示を【枠ごとに】設定する画面。
//   ★ ベンリーの「駅ちか人気！風俗ランキング(上位表示)」と同じ形: 上に「自動を始める／止める」と残り回数、
//     タブで「タイマー更新（時間帯＋間隔）」と「時刻指定更新（時刻を1つずつ・最大40）」。保存したタブの方式で押す。
//   ★ 中身の保存は saveConecfBump（times: 配列＝時刻指定／[]＝タイマーに戻す）。押すのは VPS の周（/api/admin/ekichika-bump）

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ConecfShell } from '../../../ConecfShell';
import { useConecfHref } from '../../../ConecfBase';
import { useToast } from '@/app/components/useToast';
import { getConecfBump, saveConecfBump, runConecfBumpNow, type ConecfBumpSlot } from '@/app/actions/conecfBump';
import { bumpSlotsPerDay, EKICHIKA_BUMP_INTERVALS, parseBumpTimesText, BUMP_TIMES_MAX } from '@/lib/ekichikaBump';
import { minuteLabel, minuteFromLabel } from '@/lib/bumpAuto';

function hm(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(d);
}

type Tab = 'timer' | 'times';

function Editor({ s, enabled, onToast, onSaved }: { s: ConecfBumpSlot; enabled: boolean; onToast: (m: string) => void; onSaved: () => Promise<void> }) {
  const href = useConecfHref();
  const [tab, setTab] = useState<Tab>(s.times ? 'times' : 'timer');
  const [start, setStart] = useState(minuteLabel(s.startMin));
  const [end, setEnd] = useState(minuteLabel(s.endMin));
  const [interval, setIntervalMin] = useState(s.intervalMin);
  const [rows, setRows] = useState<string[]>((s.times ?? []).map((t) => minuteLabel(t)));
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState('');
  const [busy, setBusy] = useState('');

  const usable = s.hasCredential && !s.linkOff;
  const quota = s.quota ?? 40;
  const remaining = s.countStale ? quota : s.remaining;
  const startMin = minuteFromLabel(start);
  const endMin = minuteFromLabel(end);
  const filled = rows.map((r) => r.trim()).filter(Boolean);
  const badRows = filled.filter((r) => minuteFromLabel(r) === null);
  const timesMin = [...new Set(filled.map((r) => minuteFromLabel(r)).filter((m): m is number => m !== null))].sort((a, b) => a - b);
  const perDay = tab === 'times' ? timesMin.length
    : startMin !== null && endMin !== null ? bumpSlotsPerDay({ startMin, endMin, intervalMin: interval }) : 0;

  const guard = () => {
    if (!enabled) { onToast('保存するには、ホームで「コネックエフに切り替える」を押してください'); return false; }
    if (!usable) { onToast('この枠のID・パスワードが登録されていないか、止めています。「ID・パスワード登録」をご確認ください'); return false; }
    return true;
  };

  /** いまのタブの方式で保存する。nextOn … 自動のオン・オフ */
  const save = async (nextOn: boolean, label: string) => {
    if (!guard()) return;
    if (startMin === null || endMin === null) { onToast('タイマー更新の時間帯を「10:00」のような形で入れてください'); return; }
    let times: number[] | undefined;
    if (tab === 'times') {
      if (badRows.length > 0) { onToast(`読めない時刻があります: ${badRows.slice(0, 5).join('・')}`); return; }
      if (timesMin.length === 0) { onToast('時刻指定更新の時刻を1つ以上入れてください'); return; }
      if (timesMin.length > BUMP_TIMES_MAX) { onToast(`時刻は${BUMP_TIMES_MAX}個までです（いま ${timesMin.length}個）`); return; }
      times = timesMin;
    } else if (s.times) {
      if (!window.confirm(`タイマー更新に切り替えると、時刻指定更新の${s.times.length}個の時刻は消えます。よろしいですか？`)) return;
      times = [];
    }
    setBusy(label);
    const res = await saveConecfBump({ provider: 'ekichika', slot: s.slot, enabled: nextOn, startMin, endMin, intervalMin: interval, times });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast(nextOn
      ? `枠${s.slot}を${tab === 'times' ? '時刻指定更新' : 'タイマー更新'}で自動更新します（1日最大${Math.min(res.data.perDay, quota)}回）`
      : label === 'stop' ? `枠${s.slot}の自動更新を止めました` : `枠${s.slot}の設定を保存しました（自動更新は止まっています）`);
    await onSaved();
  };

  const runNow = async () => {
    if (!guard()) return;
    if (!window.confirm(`駅ちか（枠${s.slot}）の上位表示をいま1回押しますか？${remaining != null ? `（本日残り ${remaining}回）` : ''}`)) return;
    setBusy('run');
    const res = await runConecfBumpNow({ provider: 'ekichika', slot: s.slot });
    setBusy('');
    onToast(res.ok ? '上位表示を受け付けました。1〜2分で駅ちかに反映されます' : res.error);
  };

  const addBulk = () => {
    const p = parseBumpTimesText(bulk);
    if (p.times.length === 0) { onToast('読める時刻がありませんでした（「9:32 10:08」のように入れてください）'); return; }
    const merged = [...new Set([...timesMin, ...p.times])].sort((a, b) => a - b);
    if (merged.length > BUMP_TIMES_MAX) { onToast(`合わせて${merged.length}個になります。${BUMP_TIMES_MAX}個までです`); return; }
    setRows(merged.map((m) => minuteLabel(m)));
    setBulk(''); setBulkOpen(false);
    onToast(`${p.times.length}個を入れました${p.bad.length ? `（読めなかったもの: ${p.bad.slice(0, 5).join('・')}）` : ''}。「設定を保存」で決まります`);
  };

  const tabBtn = (k: Tab, label: string) => (
    <button type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
      className={`px-6 py-3 text-[15px] font-bold border-t-2 ${tab === k ? 'bg-white border-orange-500 text-slate-800' : 'bg-slate-100 border-transparent text-slate-500 hover:text-slate-700'}`}>
      {label}
    </button>
  );

  return (
    <div className="space-y-4 pb-40">
      <Link href={href('/bump')} className="inline-flex items-center gap-1 text-[15px] font-bold text-slate-500 hover:text-slate-700">← 上位表示設定の一覧へ</Link>
      {s.area && <p className="text-[16px] font-black text-slate-700">枠{s.slot}　<span className="text-orange-600">{s.area}</span></p>}

      {/* ── 上：自動のオン・オフ・残り・今すぐ ── */}
      <div className="flex items-center gap-3 flex-wrap bg-white border border-orange-100 p-4">
        {s.enabled ? (
          <button type="button" disabled={busy !== ''} onClick={() => void save(false, 'stop')}
            className="px-5 py-2.5 text-[15px] font-black text-slate-600 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40">
            {busy === 'stop' ? '止めています…' : '■ 自動更新を止める'}
          </button>
        ) : (
          <button type="button" disabled={busy !== ''} onClick={() => void save(true, 'start')}
            className="px-5 py-2.5 text-[15px] font-black text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40">
            {busy === 'start' ? '始めています…' : `▶ ${tab === 'times' ? '時刻指定' : 'タイマー'}で自動更新を始める`}
          </button>
        )}
        {s.enabled ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-[14px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />自動更新中（{s.times ? `時刻指定・${s.times.length}回` : `タイマー・${minuteLabel(s.startMin)}〜${minuteLabel(s.endMin)}・${s.intervalMin}分ごと`}）
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-[14px] font-bold text-slate-500 bg-slate-50 border border-slate-200">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden />自動更新停止
          </span>
        )}
        <span className="text-[16px] text-slate-600 tabular-nums">残 <b className="text-[26px] font-black text-orange-500">{remaining ?? '—'}</b> 回</span>
        <span className="text-[13px] text-slate-400">{s.lastAt ? `最後 ${hm(s.lastAt)}` : ''}</span>
        <button type="button" disabled={busy !== '' || remaining === 0} onClick={() => void runNow()}
          className="ml-auto px-4 py-2 text-[15px] font-black text-white bg-gradient-to-r from-orange-400 to-amber-500 hover:from-orange-500 hover:to-amber-600 disabled:opacity-40">
          {busy === 'run' ? '受け付けています…' : '⬆ いま1回上位表示する'}
        </button>
      </div>
      {!usable && (
        <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-[15px] text-amber-900">
          この枠のID・パスワードが登録されていないか、止めています。<Link href={href('/sites')} className="font-bold underline">ID・パスワード登録</Link>をご確認ください。
        </p>
      )}

      {/* ── タブ ── */}
      <div>
        <div className="flex gap-0.5">
          {tabBtn('timer', 'タイマー更新')}
          {s.timesReady && tabBtn('times', '時刻指定更新')}
        </div>
        <div className="bg-white border border-slate-200 p-5 space-y-4">
          {tab === 'timer' ? (
            <>
              <div className="flex items-center gap-1.5 flex-wrap text-[16px] text-slate-600">
                <input type="time" step={60} value={start} onChange={(e) => setStart(e.target.value)} className="px-2 py-1.5 border border-slate-300 bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-200" />
                <span className="font-bold">〜</span>
                <input type="time" step={60} value={end} onChange={(e) => setEnd(e.target.value)} className="px-2 py-1.5 border border-slate-300 bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-200" />
                <span className="font-bold">の間</span>
                <select value={interval} onChange={(e) => setIntervalMin(Number(e.target.value))} className="px-2 py-1.5 border border-slate-300 bg-white tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-200">
                  {EKICHIKA_BUMP_INTERVALS.map((m) => <option key={m} value={m}>{m}分</option>)}
                </select>
                <span className="font-bold">間隔で更新</span>
              </div>
              <p className="text-[14px] text-slate-500">
                この設定だと1日に最大 <b className="tabular-nums text-slate-700">{perDay}</b> 回押します。
                {perDay > quota && <span className="text-rose-700">駅ちかは1日{quota}回までなので、超えた分は押しません。</span>}
                {startMin !== null && endMin !== null && startMin > endMin && <span>日をまたぐ時間帯として扱います。</span>}
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-4 flex-wrap text-[15px] font-bold text-blue-600 border-b border-slate-100 pb-3">
                <button type="button" onClick={() => setBulkOpen((v) => !v)} className="underline">🔧 一括登録</button>
                <button type="button" onClick={() => setRows(timesMin.map((m) => minuteLabel(m)))} className="underline">⇅ 時刻順に並べ替え</button>
                <button type="button" onClick={() => { if (window.confirm('時刻をすべて消しますか？（「設定を保存」を押すまでは決まりません）')) setRows([]); }} className="underline">🗑 すべて削除</button>
                <span className="ml-auto text-[14px] font-normal text-slate-500 tabular-nums">{timesMin.length} / {BUMP_TIMES_MAX}個</span>
              </div>
              {bulkOpen && (
                <div className="space-y-2 border border-blue-100 bg-blue-50/40 p-3">
                  <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={3}
                    placeholder="09:32 10:08 10:21 …（空白・改行・読点で区切って、まとめて貼り付け。全角も可）"
                    className="w-full px-2 py-1.5 border border-slate-300 bg-white text-[15px] tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  <button type="button" onClick={addBulk} className="px-4 py-1.5 text-[15px] font-black text-white bg-blue-600 hover:bg-blue-700">入れる</button>
                </div>
              )}
              <ol className="space-y-1.5">
                {rows.map((r, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="w-7 text-right text-[15px] text-slate-400 tabular-nums">{i + 1}</span>
                    <input type="time" step={60} value={r} onChange={(e) => setRows((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                      className={`w-48 px-3 py-2 border bg-white text-[16px] tabular-nums focus:outline-none focus:ring-2 focus:ring-orange-200 ${r && minuteFromLabel(r) === null ? 'border-rose-400' : 'border-slate-300'}`} />
                    <button type="button" onClick={() => setRows((v) => v.filter((_, j) => j !== i))} aria-label={`${i + 1}番目を消す`} className="px-2 text-slate-400 hover:text-rose-600">×</button>
                  </li>
                ))}
              </ol>
              {rows.length < BUMP_TIMES_MAX && (
                <button type="button" onClick={() => setRows((v) => [...v, ''])} className="px-3 py-1.5 text-[15px] font-bold text-slate-600 border border-dashed border-slate-300 hover:bg-slate-50">＋ 時刻を足す</button>
              )}
              <p className="text-[14px] text-slate-500 leading-relaxed">
                1日に <b className="tabular-nums text-slate-700">{perDay}</b> 回押します。見回りは5分ごとなので、実際に押すのは指定の時刻の1〜6分あとです。時刻を30分以上過ぎた回は、あとから押しません。
              </p>
            </>
          )}
          <div className="flex items-center gap-3 flex-wrap border-t border-slate-100 pt-4">
            <button type="button" disabled={busy !== ''} onClick={() => void save(s.enabled, 'save')}
              className="px-6 py-2.5 text-[15px] font-black text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40">
              {busy === 'save' ? '保存中…' : '設定を保存'}
            </button>
            <span className="text-[14px] text-slate-500">
              保存すると、この枠は「{tab === 'times' ? '時刻指定更新' : 'タイマー更新'}」で押します。{s.enabled ? '' : '自動更新は止まったままです（上の「始める」で始まります）。'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Body({ slotNo, enabled, onToast }: { slotNo: number; enabled: boolean; onToast: (m: string) => void }) {
  const [slot, setSlot] = useState<ConecfBumpSlot | null | undefined>(undefined);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const res = await getConecfBump('ekichika');
    if (!res.ok) { setError(res.error); return; }
    setSlot(res.data.slots.find((x) => x.slot === slotNo) ?? null); setError('');
  }, [slotNo]);
  useEffect(() => { void load(); }, [load]);
  if (error) return <div className="bg-white border border-slate-200 p-5 text-[16px] text-slate-500">読み込めませんでした（{error}）</div>;
  if (slot === undefined) return <div className="bg-white border border-slate-200 p-5 text-[16px] text-slate-400">読み込み中…</div>;
  if (slot === null) return <div className="bg-white border border-slate-200 p-5 text-[16px] text-slate-500">駅ちかの枠{slotNo}は登録されていません。</div>;
  return <Editor key={[slot.enabled, slot.startMin, slot.endMin, slot.intervalMin, (slot.times ?? []).join(',')].join('|')} s={slot} enabled={enabled} onToast={onToast} onSaved={load} />;
}

export default function ConecfEkichikaBumpSlotPage() {
  const params = useParams<{ slot: string }>();
  const slotNo = Number(params?.slot);
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="bump" title={`駅ちか（枠${Number.isInteger(slotNo) ? slotNo : ''}）の上位表示`} toast={toast}>
      {(a) => (Number.isInteger(slotNo) && slotNo >= 1
        ? <Body slotNo={slotNo} enabled={!!a.enabledAt} onToast={showToast} />
        : <div className="bg-white border border-slate-200 p-5 text-[16px] text-slate-500">枠の指定が正しくありません。</div>)}
    </ConecfShell>
  );
}
