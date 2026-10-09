'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { listCrmGroupAlerts, withdrawCrmGroupAlert, type CrmGroupListRow } from '@/app/actions/crmGroupShare';
import {
  CRM_GROUP_ALERT_SOURCE_LABEL,
  CRM_GROUP_KINDS,
  CRM_GROUP_LEVELS,
  crmGroupCertaintyLabel,
  crmGroupDateLabel,
  crmGroupKindLabel,
  crmGroupLevelLabel,
  type CrmGroupKind,
  type CrmGroupLevel,
} from '@/lib/crmGroup';
import { useCrmLinks } from '../CrmBase';
import { CrmShell, useCrmAccess } from '../CrmShell';
import { fmtGroupPhone } from '../GroupShare';

// フクエスCRM「グループ共有」＝グループ・提携店で共有している NG・要注意リスト（第1325便・2026-10-09・カッキーさん）。
//
// ★★★ この画面にも、出した店の名前・グループの店の名前は出さない（サーバーが返していない）。出るのは「自店が共有した分か」だけ。
//   フクエスCRM のログインは店ごとに1つで、受付のスタッフも同じ画面を使うため（カッキーさんの決定）。
//   どの店が出したかを知りたいときは、オーナー様どうしで聞いてもらう。
// ★ グループに入っている店にだけタブが出る。入っていない店がアドレスを直接開いても、サーバーは中身を返さない。
// ★ 共有を足す・直すのは、顧客台帳から（自店の台帳にいるお客様の、台帳に載っている電話番号だけ）。ここでは、見る・自店の分を取り下げる。

const inputCls = 'border border-slate-300 bg-white px-2.5 py-2 text-[14px] focus:border-indigo-400 focus:outline-none';

function dateTimeJST(iso: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(iso));
}

export default function CrmGroupPage() {
  const { access, adminSalonQuery } = useCrmAccess();
  return (
    <CrmShell access={access} adminSalonQuery={adminSalonQuery} current="group">
      {(a) => <GroupBody salonId={a.salonId} adminSalonQuery={adminSalonQuery} />}
    </CrmShell>
  );
}

type Loaded = { inGroup: false } | { inGroup: true; memberCount: number; rows: CrmGroupListRow[]; more: boolean };

function GroupBody({ salonId, adminSalonQuery }: { salonId: number; adminSalonQuery: string }) {
  const crm = useCrmLinks();
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState('');
  const [level, setLevel] = useState<CrmGroupLevel | ''>('');
  const [kind, setKind] = useState<CrmGroupKind | ''>('');
  const [mineOnly, setMineOnly] = useState(false);
  const [sureId, setSureId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    listCrmGroupAlerts(salonId).then((res) => {
      if (!alive) return;
      if (!res.ok) { setErr(res.error); return; }
      setErr('');
      setData(res.inGroup ? { inGroup: true, memberCount: res.memberCount, rows: res.rows, more: res.more } : { inGroup: false });
    }).catch(() => { if (alive) setErr('読み込めませんでした（通信を確認してください）'); });
    return () => { alive = false; };
  }, [salonId, tick]);

  const rows = useMemo(() => {
    if (!data || !data.inGroup) return [];
    const word = q.trim();
    const digits = word.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[^0-9]/g, '');
    return data.rows.filter((r) => {
      if (level && r.level !== level) return false;
      if (kind && r.kind !== kind) return false;
      if (mineOnly && !r.mine) return false;
      if (word === '') return true;
      // 数字が4桁以上あれば電話番号（途中一致）。そうでなければ名前・内容の言葉
      if (digits.length >= 4 && r.phones.some((p) => p.includes(digits))) return true;
      return r.shownName.includes(word) || r.what.includes(word);
    });
  }, [data, q, level, kind, mineOnly]);

  const withdraw = async (id: number) => {
    setBusy(true); setErr('');
    const r = await withdrawCrmGroupAlert(salonId, id);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setSureId(null);
    setTick((n) => n + 1);
  };

  if (!data) {
    return <p className="p-10 text-center text-[14px] text-slate-400">{err || '読み込み中です…'}</p>;
  }
  if (!data.inGroup) {
    return <p className="p-10 text-center text-[14px] leading-relaxed text-slate-500">この機能は、グループ・提携店での共有をお申し込みのお店だけが使えます。</p>;
  }

  return (
    <div className="mx-auto max-w-4xl p-3 md:p-4">
      <div className="border border-slate-200 bg-white p-3 md:p-4">
        <h1 className="text-[17px] font-black text-slate-800">
          {CRM_GROUP_ALERT_SOURCE_LABEL}で共有しているNG・要注意
          <span className="ml-2 text-[12px] font-bold text-slate-400">自店をふくむ{data.memberCount}店</span>
        </h1>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[12px] leading-relaxed text-slate-600">
          <li>ここに載っている電話番号から予約が入ると、スケジュールと受付の画面に「{CRM_GROUP_ALERT_SOURCE_LABEL}でNG」などと出ます。予約は自動では断りません。受けるかどうかはお店で決めてください。</li>
          <li>共有を足す・直すときは、顧客台帳でお客様を開き、「{CRM_GROUP_ALERT_SOURCE_LABEL}との共有」の欄から行います。</li>
          <li>どのお店が共有したかは、この画面には出ません。</li>
          <li>この内容を、{CRM_GROUP_ALERT_SOURCE_LABEL}の外に伝えたり、セラピストを守る目的のほかに使ったりしないでください。</li>
        </ul>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className={`${inputCls} w-full sm:w-[260px]`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="電話（下4桁でも）・名前・内容の言葉" inputMode="search" />
          <select className={inputCls} value={level} onChange={(e) => setLevel(e.target.value as CrmGroupLevel | '')}>
            <option value="">NG・要注意</option>
            {CRM_GROUP_LEVELS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as CrmGroupKind | '')}>
            <option value="">分類すべて</option>
            {CRM_GROUP_KINDS.map((k) => <option key={k.key} value={k.key}>{crmGroupKindLabel(k.key)}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-[13px] font-bold text-slate-600">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            自店が共有した分だけ
          </label>
          <span className="ml-auto text-[12px] text-slate-400">{rows.length}件{rows.length !== data.rows.length ? `（全${data.rows.length}件）` : ''}</span>
        </div>
        {data.more && <p className="mt-2 text-[12px] font-bold text-amber-700">新しい順に500件までを出しています。</p>}
        {err && <p className="mt-2 text-[13px] font-bold text-rose-600">{err}</p>}
      </div>

      {rows.length === 0 ? (
        <p className="p-8 text-center text-[14px] text-slate-400">{data.rows.length === 0 ? 'まだ共有はありません' : '当てはまる共有はありません'}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.id} className={`border bg-white p-3 ${r.level === 'ng' ? 'border-rose-300' : 'border-amber-300'}`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`px-1.5 py-0.5 text-[12px] font-bold ${r.level === 'ng' ? 'bg-rose-600 text-white' : 'bg-amber-400 text-slate-900'}`}>{crmGroupLevelLabel(r.level)}</span>
                <span className="border border-slate-300 px-1.5 py-0.5 text-[12px] font-bold text-slate-700">{crmGroupKindLabel(r.kind)}</span>
                <span className={`px-1.5 py-0.5 text-[12px] font-bold ${r.certainty === 'confirmed' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'}`}>{crmGroupCertaintyLabel(r.certainty)}</span>
                <span className="text-[13px] font-bold text-slate-700">{crmGroupDateLabel(r.happenedOn)}</span>
                {r.mine && <span className="bg-indigo-100 px-1.5 py-0.5 text-[12px] font-bold text-indigo-700">自店が共有</span>}
              </div>
              <p className="mt-1.5 text-[15px] font-black text-slate-800">
                {r.phones.map(fmtGroupPhone).join('／') || '(電話番号なし)'}
                {r.shownName && <span className="ml-2 text-[13px] font-bold text-slate-500">{r.shownName}</span>}
              </p>
              <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-slate-800">{r.what}</p>
              <p className="mt-1 text-[12px] text-slate-500">
                {r.checkedHow ? `確かめ方：${r.checkedHow}　` : ''}共有した日：{dateTimeJST(r.createdAt)}
              </p>
              {r.mine && (
                sureId === r.id ? (
                  <div className="mt-2 border border-rose-300 bg-rose-50 p-2.5 text-[13px] text-rose-800">
                    <p className="font-bold">この共有を取り下げます。ほかのお店の画面から、すぐに見えなくなります。</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" disabled={busy} onClick={() => withdraw(r.id)} className="bg-rose-600 px-3 py-1.5 font-bold text-white disabled:opacity-50">{busy ? '取り下げ中…' : '取り下げる'}</button>
                      <button type="button" disabled={busy} onClick={() => setSureId(null)} className="border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-600">やめる</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.customerId != null && (
                      <Link
                        href={`${crm.href('/customers')}${adminSalonQuery ? `${adminSalonQuery}&` : '?'}customer=${r.customerId}`}
                        className="border border-indigo-300 bg-white px-3 py-1 text-[13px] font-bold text-indigo-600"
                      >
                        顧客台帳で開く（直す）
                      </Link>
                    )}
                    <button type="button" onClick={() => setSureId(r.id)} className="border border-slate-300 bg-white px-3 py-1 text-[13px] font-bold text-slate-600">取り下げる</button>
                  </div>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
