'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ConecfShell } from '../ConecfShell';
import { useConecfHref } from '../ConecfBase';
import { useToast } from '@/app/components/useToast';
import {
  getConecfImasugu, saveConecfImasuguSettings, saveConecfImasuguMembers, setConecfImasuguOne, runConecfImasuguNow,
  type ImasuguRow, type ImasuguSettings,
} from '@/app/actions/conecfImasugu';
import { IMASUGU_BATCH_CHOICES, IMASUGU_RULE_CHOICES } from '@/lib/conecfImasugu';
import { IMASUGU_WINDOW_MIN } from '@/lib/imasugu';
import { shiftLabel } from '@/lib/conecfSchedule';
import { revalidateSalon } from '@/app/lib/revalidateTop';

// コネックエフ「今すぐ一括」（第401便・1e・2026-09-17）。
// ★ ベンリーの「即姫・接客一括更新」に寄せた：上に自動更新の設定、下に今日の出勤の人（対象／除外）。
// ★ 今すぐはフクエスに出て、駅ちかの即ヒメ・エステ魂の即セラへは今の周が送る。

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';

function hm(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(d) : '';
}

function Body({ enabled, onToast }: { enabled: boolean; onToast: (m: string) => void }) {
  const href = useConecfHref();
  const [data, setData] = useState<{ salonId: number; max: number; settings: ImasuguSettings; rows: ImasuguRow[] } | null>(null);
  const [st, setSt] = useState<ImasuguSettings | null>(null);
  const [rows, setRows] = useState<ImasuguRow[]>([]);
  const [orderDirty, setOrderDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await getConecfImasugu();
    if (!res.ok) { setError(res.error); return; }
    setData(res.data); setSt(res.data.settings); setRows(res.data.rows); setOrderDirty(false); setError('');
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (error) return <div className={`${CARD} p-5 text-[14px] text-slate-500`}>読み込めませんでした（{error}）</div>;
  if (!data || !st) return <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>;

  const guard = () => { if (!enabled) { onToast('保存するには、ホームで「コネックエフに切り替える」を押してください'); return false; } return true; };

  const saveSettings = async (next: ImasuguSettings) => {
    if (!guard()) return;
    setSt(next); setBusy('settings');
    const res = await saveConecfImasuguSettings({ enabled: next.enabled, orderMode: next.orderMode, batchSize: next.batchSize, rule: next.rule });
    setBusy('');
    if (!res.ok) { onToast(res.error); await load(); return; }
    onToast(next.enabled !== st.enabled ? (next.enabled ? '自動更新を始めました（10分ごと）' : '自動更新を止めました') : '設定を保存しました');
  };

  const toggleOne = async (r: ImasuguRow) => {
    if (!guard()) return;
    setBusy('one' + r.id);
    const res = await setConecfImasuguOne({ id: r.id, on: !r.ownerLive });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    void revalidateSalon(data.salonId);
    onToast(res.data.on ? `${r.name}さんを今すぐにしました（${IMASUGU_WINDOW_MIN}分）` : `${r.name}さんの今すぐを外しました`);
    await load();
  };

  const move = (i: number, dir: -1 | 1) => {
    setRows((p) => { const j = i + dir; if (j < 0 || j >= p.length) return p; const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n; });
    setOrderDirty(true);
  };
  const setExcluded = (id: number, v: boolean) => { setRows((p) => p.map((x) => (x.id === id ? { ...x, excluded: v } : x))); setOrderDirty(true); };

  const saveMembers = async () => {
    if (!guard()) return;
    setBusy('members');
    const res = await saveConecfImasuguMembers({ order: rows.filter((r) => !r.excluded).map((r) => r.id), excluded: rows.filter((r) => r.excluded).map((r) => r.id) });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast('並び順と除外を保存しました');
    await load();
  };

  const runNow = async () => {
    if (!guard()) return;
    setBusy('run');
    const res = await runConecfImasuguNow();
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    void revalidateSalon(data.salonId);
    onToast(res.data.on.length > 0 ? `${res.data.on.join('・')}さんを今すぐにしました` : '今すぐにできる出勤中の方がいませんでした');
    await load();
  };

  const liveCount = rows.filter((r) => r.ownerLive || r.castLive).length;
  const targets = rows.filter((r) => !r.excluded);
  const excluded = rows.filter((r) => r.excluded);

  const rowView = (r: ImasuguRow, i: number, list: 'target' | 'excluded') => (
    <li key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 ${r.onDuty ? '' : 'opacity-60'}`}>
      {list === 'target' && (
        <span className="flex flex-col">
          <button type="button" onClick={() => move(rows.indexOf(r), -1)} disabled={i === 0} className="text-[11px] leading-none px-1 text-slate-400 disabled:opacity-20">▲</button>
          <button type="button" onClick={() => move(rows.indexOf(r), 1)} disabled={i === targets.length - 1} className="text-[11px] leading-none px-1 text-slate-400 disabled:opacity-20">▼</button>
        </span>
      )}
      <span className="w-9 h-12 flex-none bg-slate-100 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {r.imageUrl && <img src={r.imageUrl} alt="" className="w-full h-full object-cover" />}
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-[15px] font-black text-slate-800 truncate">{r.name}</b>
        <span className="block text-[12.5px] text-slate-500 tabular-nums">
          {r.shift ? shiftLabel({ isActive: true, start: r.shift.start, end: r.shift.end }) : ''}{r.onDuty ? '　出勤中' : '　出勤時間外'}
        </span>
      </span>
      <span className="text-[12.5px] font-bold">
        {r.castLive ? <span className="text-emerald-700">本人が設定中</span>
          : r.ownerLive ? <span className="text-rose-600">設定中（〜{hm(r.ownerUntil)}）</span>
          : r.importLive ? <span className="text-sky-700">駅ちかの即ヒメ中</span>
          : <span className="text-slate-400">待機</span>}
      </span>
      <button type="button" disabled={busy !== '' || r.castLive || (!r.ownerLive && !r.onDuty)} onClick={() => void toggleOne(r)}
        className={`px-3 py-1.5 text-[13px] font-bold border disabled:opacity-40 ${r.ownerLive ? 'border-slate-300 bg-white text-slate-600' : 'border-rose-400 bg-rose-500 text-white'}`}>
        {busy === 'one' + r.id ? '…' : r.ownerLive ? '外す' : '設定する'}
      </button>
      <button type="button" onClick={() => setExcluded(r.id, list === 'target')} className="text-[12.5px] font-bold text-slate-500 underline underline-offset-2">
        {list === 'target' ? '除外へ' : '対象へ戻す'}
      </button>
    </li>
  );

  return (
    <div className="space-y-3">
      {!enabled && (
        <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-900 leading-relaxed">
          いまは見るだけです。保存するには、<Link href={href('/')} className="font-bold underline">ホーム</Link>で「コネックエフに切り替える」を押してください。
        </div>
      )}

      {/* ── 自動更新 ── */}
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[16px] font-black text-slate-800">自動更新</p>
            <p className="text-[12.5px] text-slate-500">10分ごとに、出勤中の方から順番に設定します（1回{IMASUGU_WINDOW_MIN}分・最大{data.max}名）。</p>
          </div>
          <button type="button" disabled={busy !== ''} onClick={() => void saveSettings({ ...st, enabled: !st.enabled })}
            className={`px-4 py-2 text-[14px] font-bold border ${st.enabled ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-300'}`}>
            {st.enabled ? '自動更新中（押すと止める）' : '自動更新を始める'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <select value={st.orderMode} disabled={busy !== ''} onChange={(e) => void saveSettings({ ...st, orderMode: e.target.value as ImasuguSettings['orderMode'] })} className="border border-slate-300 px-2 py-1.5">
            <option value="priority">優先順</option><option value="random">ランダム</option>
          </select>
          <span className="text-slate-500">で</span>
          <select value={st.batchSize} disabled={busy !== ''} onChange={(e) => void saveSettings({ ...st, batchSize: Number(e.target.value) })} className="border border-slate-300 px-2 py-1.5">
            {IMASUGU_BATCH_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {st.orderMode === 'priority' && (
            <>
              <span className="text-slate-500">／ 優先順位</span>
              <select value={st.rule} disabled={busy !== ''} onChange={(e) => void saveSettings({ ...st, rule: e.target.value as ImasuguSettings['rule'] })} className="border border-slate-300 px-2 py-1.5">
                {IMASUGU_RULE_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </>
          )}
          <button type="button" disabled={busy !== ''} onClick={() => void runNow()} className="ml-auto px-3 py-1.5 border border-indigo-300 text-indigo-700 text-[13px] font-bold">
            {busy === 'run' ? '回しています…' : 'いま1回回す'}
          </button>
        </div>
        <p className="text-[12px] text-slate-400">
          設定中 {liveCount}/{data.max}名{st.lastRunAt ? `　／　最後の自動更新 ${hm(st.lastRunAt)}` : ''}。今すぐ・即ヒメ・即セラへ数分以内に反映されます。
        </p>
      </div>

      {/* ── 対象 ── */}
      <div className={CARD}>
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
          <p className="text-[15px] font-black text-slate-800">対象の女性（今日の出勤）{targets.length}名</p>
          {orderDirty && (
            <button type="button" disabled={busy !== ''} onClick={() => void saveMembers()} className="px-4 py-1.5 bg-indigo-600 text-white text-[13px] font-bold">
              {busy === 'members' ? '保存しています…' : '並び順・除外を保存'}
            </button>
          )}
        </div>
        {targets.length === 0
          ? <p className="px-4 pb-4 text-[14px] text-slate-500">今日の出勤の方がいません。<Link href={href('/schedule')} className="font-bold text-indigo-600 underline">週間スケジュール</Link>で出勤を入れてください。</p>
          : <ul className="divide-y divide-slate-100 border-t border-slate-100">{targets.map((r, i) => rowView(r, i, 'target'))}</ul>}
      </div>

      {/* ── 除外 ── */}
      <div className={CARD}>
        <p className="px-4 pt-3.5 pb-1 text-[15px] font-black text-slate-800">更新除外 {excluded.length}名</p>
        <p className="px-4 pb-2 text-[12.5px] text-slate-400">ここの方は自動更新の対象になりません（手で設定はできます）。</p>
        {excluded.length > 0 && <ul className="divide-y divide-slate-100 border-t border-slate-100">{excluded.map((r, i) => rowView(r, i, 'excluded'))}</ul>}
      </div>
    </div>
  );
}

export default function ConecfNowPage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="now" title="今すぐ・即ヒメ・即セラ自動設定" toast={toast}>
      {(a) => <Body enabled={!!a.enabledAt} onToast={showToast} />}
    </ConecfShell>
  );
}
