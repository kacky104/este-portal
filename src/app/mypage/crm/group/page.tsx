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
  // 開いている行（1件だけ）
  const [openId, setOpenId] = useState<number | null>(null);
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
        {/* ★ 第1326便（カッキーさん）: 説明は1行だけ（使い方の3行は消した） */}
        <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">この内容を、{CRM_GROUP_ALERT_SOURCE_LABEL}の外に伝えたり、セラピストを守る目的のほかに使ったりしないでください。</p>

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
        // ★ 第1326便（カッキーさん）: 1件を1行に（前はカードが下へ並んで、件数が増えると長くなった）。行を押すと「何をされたか」が開く
        <div className="mt-3 border border-slate-200 bg-white">
          <div className="hidden items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-400 md:flex">
            <span className="w-[52px] flex-none">段</span>
            <span className="w-[9.5em] flex-none">分類</span>
            <span className="w-[6.5em] flex-none">起きた日</span>
            <span className="w-[9.5em] flex-none">電話番号</span>
            <span className="flex-1">名前</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const open = openId === r.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => { setOpenId(open ? null : r.id); setSureId(null); }}
                    className={`flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-left hover:bg-indigo-50 ${open ? 'bg-indigo-50' : ''}`}
                  >
                    <span className="w-[52px] flex-none">
                      <span className={`px-1.5 py-0.5 text-[11px] font-bold ${r.level === 'ng' ? 'bg-rose-600 text-white' : 'bg-amber-400 text-slate-900'}`}>{crmGroupLevelLabel(r.level)}</span>
                    </span>
                    <span className="w-[9.5em] flex-none truncate text-[13px] font-bold text-slate-700">{crmGroupKindLabel(r.kind)}</span>
                    <span className="w-[6.5em] flex-none text-[13px] text-slate-600">{crmGroupDateLabel(r.happenedOn)}</span>
                    <span className="w-[9.5em] flex-none text-[14px] font-black text-slate-800">
                      {r.phones[0] ? fmtGroupPhone(r.phones[0]) : '(番号なし)'}
                      {r.phones.length > 1 && <span className="ml-1 text-[11px] font-bold text-slate-400">ほか{r.phones.length - 1}</span>}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-slate-600">{r.shownName}</span>
                    {r.certainty === 'suspected' && <span className="flex-none bg-slate-200 px-1.5 py-0.5 text-[11px] font-bold text-slate-700">疑い</span>}
                    {r.mine && <span className="flex-none bg-indigo-100 px-1.5 py-0.5 text-[11px] font-bold text-indigo-700">自店</span>}
                    <span className="flex-none text-[11px] text-slate-400" aria-hidden>{open ? '▲' : '▼'}</span>
                  </button>
                  {open && (
                    <div className={`border-l-4 px-3 pb-3 pt-1 ${r.level === 'ng' ? 'border-rose-400' : 'border-amber-400'}`}>
                      <p className="whitespace-pre-line text-[14px] leading-relaxed text-slate-800">{r.what}</p>
                      <dl className="mt-2 grid grid-cols-[6em_1fr] gap-y-0.5 text-[12px] text-slate-600">
                        <dt className="font-bold text-slate-400">確かさ</dt>
                        <dd>{crmGroupCertaintyLabel(r.certainty)}</dd>
                        {r.phones.length > 1 && (
                          <>
                            <dt className="font-bold text-slate-400">電話番号</dt>
                            <dd>{r.phones.map(fmtGroupPhone).join('／')}</dd>
                          </>
                        )}
                        {r.checkedHow && (
                          <>
                            <dt className="font-bold text-slate-400">確かめ方</dt>
                            <dd>{r.checkedHow}</dd>
                          </>
                        )}
                        <dt className="font-bold text-slate-400">共有した日</dt>
                        <dd>{dateTimeJST(r.createdAt)}</dd>
                      </dl>
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
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
