'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ConecfShell } from '../ConecfShell';
import { useConecfHref } from '../ConecfBase';
import { useToast } from '@/app/components/useToast';
import { getConecfBump, saveConecfBump, runConecfBumpNow, type ConecfBumpSlot } from '@/app/actions/conecfBump';
import { bumpSlotsPerDay, EKICHIKA_BUMP_INTERVALS } from '@/lib/ekichikaBump';
import { minuteLabel, minuteFromLabel } from '@/lib/bumpAuto';

// コネックエフ「駅ちか上位表示」（第1305便・2026-10-08・カッキーさん）。
// ★ 駅ちかの管理画面トップの「上位表示する」を、自動（時間帯・間隔）と今すぐの2通りで押す。
// ★ フクエスの自動上位表示（マイページ）と同じ形: ON/OFF・時間帯・間隔（10/15/20/30/60分）。
// ★ 残り回数・最後の上位表示は、押しに行ったときに駅ちかの画面から読んだ値（手で押した分も入る）。

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';

function hm(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(d);
}

function SlotCard({ s, many, enabled, onToast, onSaved }: {
  s: ConecfBumpSlot; many: boolean; enabled: boolean; onToast: (m: string) => void; onSaved: () => Promise<void>;
}) {
  const href = useConecfHref();
  const [on, setOn] = useState(s.enabled);
  const [start, setStart] = useState(minuteLabel(s.startMin));
  const [end, setEnd] = useState(minuteLabel(s.endMin));
  const [interval, setIntervalMin] = useState(s.intervalMin);
  const [busy, setBusy] = useState('');

  const startMin = minuteFromLabel(start);
  const endMin = minuteFromLabel(end);
  const perDay = startMin !== null && endMin !== null ? bumpSlotsPerDay({ startMin, endMin, intervalMin: interval }) : 0;
  const quota = s.quota ?? 40;
  const dirty = on !== s.enabled || startMin !== s.startMin || endMin !== s.endMin || interval !== s.intervalMin;
  const usable = s.hasCredential && !s.linkOff;
  const name = '駅ちか' + (many ? `（枠${s.slot}）` : '');

  const guard = () => {
    if (!enabled) { onToast('保存するには、ホームで「コネックエフに切り替える」を押してください'); return false; }
    if (!usable) { onToast(`${name}のID・パスワードが登録されていないか、止めています。「ID・パスワード登録」をご確認ください`); return false; }
    return true;
  };

  const save = async (nextOn: boolean) => {
    if (!guard()) return;
    if (startMin === null || endMin === null) { onToast('時間帯を「10:00」のような形で入れてください'); return; }
    setBusy('save');
    const res = await saveConecfBump({ slot: s.slot, enabled: nextOn, startMin, endMin, intervalMin: interval });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    setOn(nextOn);
    onToast(nextOn ? `${name}の自動上位表示を保存しました（1日最大${Math.min(res.data.perDay, quota)}回）` : `${name}の自動上位表示を止めました`);
    await onSaved();
  };

  const runNow = async () => {
    if (!guard()) return;
    setBusy('run');
    const res = await runConecfBumpNow({ slot: s.slot });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast(`${name}の上位表示を受け付けました。1〜2分で駅ちかに反映されます。結果は「更新結果」に出ます`);
  };

  return (
    <div className={`${CARD} p-4 space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[16px] font-black text-slate-800">{name}の上位表示</p>
          <p className="mt-1 text-[13px] text-slate-600 tabular-nums">
            {s.remaining !== null
              ? <>本日の残り <b className="text-[15px] text-slate-800">{s.remaining}</b>/{quota}回{s.readAt ? `（${hm(s.readAt)} 時点）` : ''}</>
              : 'まだ駅ちかの残り回数を読んでいません（押しに行ったときに読みます）'}
            {s.lastAt ? `　最後の上位表示 ${hm(s.lastAt)}` : ''}
          </p>
        </div>
        <button type="button" disabled={busy !== ''} onClick={() => void runNow()}
          className="px-4 py-2.5 text-[14px] font-bold border border-rose-400 bg-rose-500 text-white disabled:opacity-40">
          {busy === 'run' ? '受け付けています…' : '今すぐ上位表示する'}
        </button>
      </div>

      {!usable && (
        <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {name}のID・パスワードが登録されていないか、止めています。<Link href={href('/sites')} className="font-bold underline">ID・パスワード登録</Link>をご確認ください。
        </p>
      )}

      <div className="border-t border-slate-100 pt-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[15px] font-black text-slate-800">自動で押す</p>
            <p className="text-[12.5px] text-slate-500">時間帯の中で、決めた間隔ごとに押します。駅ちかで手で押した直後は、自動では押しません。</p>
          </div>
          <span className={`px-2.5 py-1 text-[12.5px] font-bold ${on ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
            {on ? '自動 ON' : '自動 OFF'}
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 text-[14px]">
          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-bold text-slate-600">はじめ</span>
            <input type="time" step={600} value={start} onChange={(e) => setStart(e.target.value)} className="border border-slate-300 px-2 py-1.5 tabular-nums" />
          </label>
          <span className="pb-2 text-slate-400">〜</span>
          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-bold text-slate-600">おわり</span>
            <input type="time" step={600} value={end} onChange={(e) => setEnd(e.target.value)} className="border border-slate-300 px-2 py-1.5 tabular-nums" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12.5px] font-bold text-slate-600">間隔</span>
            <select value={interval} onChange={(e) => setIntervalMin(Number(e.target.value))} className="border border-slate-300 px-2 py-1.5">
              {EKICHIKA_BUMP_INTERVALS.map((m) => <option key={m} value={m}>{m}分ごと</option>)}
            </select>
          </label>
        </div>
        <p className="text-[13px] text-slate-600">
          この設定だと1日に最大 <b className="tabular-nums">{perDay}</b> 回押します（はじめの時刻に1回、あとは間隔ごと）。
          {perDay > quota && <span className="text-rose-700">駅ちかは1日{quota}回までなので、超えた分は押しません。</span>}
          {startMin !== null && endMin !== null && startMin > endMin && <span className="text-slate-500">日をまたぐ時間帯として扱います。</span>}
        </p>

        <div className="flex flex-wrap gap-2">
          {on ? (
            <>
              <button type="button" disabled={busy !== '' || !dirty} onClick={() => void save(true)}
                className="px-4 py-2 text-[14px] font-bold bg-slate-800 text-white disabled:opacity-40">{busy === 'save' ? '保存しています…' : '設定を保存'}</button>
              <button type="button" disabled={busy !== ''} onClick={() => void save(false)}
                className="px-4 py-2 text-[14px] font-bold border border-slate-300 bg-white text-slate-700 disabled:opacity-40">自動を止める</button>
            </>
          ) : (
            <button type="button" disabled={busy !== ''} onClick={() => void save(true)}
              className="px-4 py-2 text-[14px] font-bold bg-emerald-600 text-white disabled:opacity-40">{busy === 'save' ? '保存しています…' : 'この設定で自動を始める'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Body({ enabled, onToast }: { enabled: boolean; onToast: (m: string) => void }) {
  const href = useConecfHref();
  const [data, setData] = useState<{ ready: boolean; slots: ConecfBumpSlot[] } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await getConecfBump();
    if (!res.ok) { setError(res.error); return; }
    setData({ ready: res.data.ready, slots: res.data.slots }); setError('');
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (error) return <div className={`${CARD} p-5 text-[14px] text-slate-500`}>読み込めませんでした（{error}）</div>;
  if (!data) return <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>;
  if (!data.ready) return <div className={`${CARD} p-5 text-[14px] text-slate-500`}>準備中です。もうしばらくお待ちください。</div>;

  return (
    <div className="space-y-3">
      {!enabled && (
        <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-900 leading-relaxed">
          いまは見るだけです。保存するには、<Link href={href('/')} className="font-bold underline">ホーム</Link>で「コネックエフに切り替える」を押してください。
        </div>
      )}
      <p className="text-[13.5px] text-slate-600 leading-relaxed">
        駅ちかの管理画面トップにある「上位表示する」を、コネックエフから押します。押すと1分ほどで、駅ちかのエリア・市区町村・駅の店舗一覧で上位に表示されます。
        結果は<Link href={href('/log')} className="font-bold underline">更新結果</Link>に出ます。
      </p>
      {data.slots.length === 0 && (
        <div className={`${CARD} p-5 text-[14px] text-slate-500`}>駅ちかの店舗ページが登録されていません。運営事務局までご連絡ください。</div>
      )}
      {data.slots.map((s) => (
        <SlotCard key={s.slot + ':' + s.enabled + ':' + s.startMin + ':' + s.endMin + ':' + s.intervalMin} s={s} many={data.slots.length > 1} enabled={enabled} onToast={onToast} onSaved={load} />
      ))}
    </div>
  );
}

export default function ConecfBumpPage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="bump" title="駅ちか上位表示" toast={toast}>
      {(a) => <Body enabled={!!a.enabledAt} onToast={showToast} />}
    </ConecfShell>
  );
}
