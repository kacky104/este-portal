'use client';

import { useEffect, useState } from 'react';
import {
  getCrmCustomerGroupShare,
  saveCrmGroupAlert,
  withdrawCrmGroupAlert,
  type CrmGroupMyAlert,
} from '@/app/actions/crmGroupShare';
import {
  CRM_GROUP_ALERT_SOURCE_LABEL,
  CRM_GROUP_CERTAINTIES,
  CRM_GROUP_CHECKED_HOW_MAX,
  CRM_GROUP_KINDS,
  CRM_GROUP_LEVELS,
  CRM_GROUP_WHAT_MAX,
  crmGroupHitTitle,
  type CrmGroupCertainty,
  type CrmGroupHit,
  type CrmGroupKind,
  type CrmGroupLevel,
} from '@/lib/crmGroup';

// フクエスCRM：グループ・提携店で共有するNG・要注意リストの、画面の部品（第1325便・2026-10-09・カッキーさん）。
//   ・GroupHitBand … 受付フォーム・予約の詳細・顧客台帳に出す帯（「グループ・提携店でNG（盗み・2026/10/8・確認済み）」＋何をされたか）
//   ・GroupShareBox … 顧客台帳の1人に出す「グループ・提携店に共有する」の欄
// ★★★ 出した店の名前は、どこにも出さない（サーバーが返していない）。受付のスタッフも同じ画面を使うため。
// ★ 当たっても予約は止めない。出すだけ（電話番号の持ち主が変わった別人のことがある）。

/** 09012345678 → 090-1234-5678（見やすさだけ） */
export function fmtGroupPhone(p: string): string {
  if (/^0[789]0\d{8}$/.test(p)) return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`;
  if (/^0\d{9}$/.test(p)) return `${p.slice(0, 2)}-${p.slice(2, 6)}-${p.slice(6)}`;
  return p;
}

function todayJST(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** 共有リストに当たったときの帯。★ hits が空で failed でもなければ、何も出さない */
export function GroupHitBand({ hits, failed = false, className = '' }: { hits: CrmGroupHit[]; failed?: boolean; className?: string }) {
  if (hits.length === 0 && !failed) return null;
  return (
    <div className={`space-y-1.5 ${className}`}>
      {hits.map((h) => (
        <div
          key={h.id}
          className={`border-l-4 px-3 py-2 text-[13px] ${
            h.mine ? 'border-slate-400 bg-slate-100 text-slate-700'
              : h.level === 'ng' ? 'border-rose-900 bg-rose-600 text-white'
              : 'border-amber-500 bg-amber-50 text-amber-900'
          }`}
        >
          <p className="font-bold">{crmGroupHitTitle(h)}</p>
          <p className="mt-0.5 whitespace-pre-line">{h.what}</p>
          {h.shownName && <p className="mt-0.5 text-[12px] opacity-80">共有されたときのお名前：{h.shownName}</p>}
        </div>
      ))}
      {hits.some((h) => !h.mine) && (
        <p className="text-[11px] leading-relaxed text-slate-500">
          電話番号が同じというだけで、別の方のこともあります。お名前などを確かめて、受けるかどうかはお店で決めてください。
        </p>
      )}
      {failed && (
        <p className="border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-800">
          {CRM_GROUP_ALERT_SOURCE_LABEL}の共有リストを確認できませんでした。何も出ていなくても、NG ではないとは限りません。「画面を更新」でもう一度お試しください。
        </p>
      )}
    </div>
  );
}

const inputCls = 'w-full border border-slate-300 bg-white px-2.5 py-2 text-[14px] focus:border-indigo-400 focus:outline-none';
const labelCls = 'mb-1 block text-[12px] font-bold text-slate-500';

type FormState = {
  level: CrmGroupLevel; kind: CrmGroupKind | ''; certainty: CrmGroupCertainty;
  happenedOn: string; what: string; checkedHow: string; phones: string[];
};

function AlertForm({
  salonId, customerId, phones, mine, memberCount, onSaved, onCancel,
}: {
  salonId: number;
  customerId: number;
  /** このお客様の台帳に載っている電話番号 */
  phones: string[];
  mine: CrmGroupMyAlert | null;
  memberCount: number;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<FormState>(() => ({
    level: mine?.level ?? 'ng',
    kind: mine?.kind ?? '',
    certainty: mine?.certainty ?? 'confirmed',
    happenedOn: mine?.happenedOn ?? todayJST(),
    what: mine?.what ?? '',
    checkedHow: mine?.checkedHow ?? '',
    // 直すとき: いま共有している番号（台帳に残っているものだけ）。新しく共有するとき: 台帳の番号を全部
    phones: mine ? mine.phones.filter((p) => phones.includes(p)) : phones,
  }));
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => { setF((p) => ({ ...p, [k]: v })); setSure(false); };

  const submit = async () => {
    setBusy(true); setErr('');
    const res = await saveCrmGroupAlert({
      salonId, customerId, alertId: mine?.id ?? null,
      level: f.level, kind: f.kind, certainty: f.certainty, happenedOn: f.happenedOn, what: f.what, checkedHow: f.checkedHow, phones: f.phones,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); setSure(false); return; }
    onSaved();
  };

  return (
    <div className="space-y-3">
      <div className="border-l-4 border-indigo-300 bg-indigo-50 px-3 py-2 text-[12px] leading-relaxed text-slate-700">
        <p>共有できるのは、セラピストやお店への危害だけです。無断キャンセル・料金のもめごとは共有できません（自店の台帳にだけ残してください）。</p>
        <p className="mt-1">書くのは、起きた事実だけにしてください。セラピストの名前、お客様の住所・勤務先など、関係のないことは書かないでください。</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <span className={labelCls}>段</span>
          <div className="flex gap-1.5">
            {CRM_GROUP_LEVELS.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => set('level', l.key)}
                className={`border px-3 py-1.5 text-[13px] font-bold ${f.level === l.key ? (l.key === 'ng' ? 'border-rose-600 bg-rose-600 text-white' : 'border-amber-500 bg-amber-500 text-white') : 'border-slate-300 bg-white text-slate-600'}`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">NG＝受けない ／ 要注意＝受けるが気をつける</p>
        </div>
        <div>
          <label className={labelCls}>分類 <span className="text-rose-500">必須</span></label>
          <select className={inputCls} value={f.kind} onChange={(e) => set('kind', e.target.value as CrmGroupKind | '')}>
            <option value="">選んでください</option>
            {CRM_GROUP_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>起きた日 <span className="text-rose-500">必須</span></label>
          <input type="date" className={inputCls} value={f.happenedOn} max={todayJST()} onChange={(e) => set('happenedOn', e.target.value)} />
        </div>
        <div>
          <span className={labelCls}>確かさ</span>
          <div className="flex gap-1.5">
            {CRM_GROUP_CERTAINTIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => set('certainty', c.key)}
                className={`border px-3 py-1.5 text-[13px] font-bold ${f.certainty === c.key ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-600'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">はっきり確かめられていないときは「疑い」にしてください</p>
        </div>
      </div>
      <div>
        <label className={labelCls}>何をされたか <span className="text-rose-500">必須</span>（{CRM_GROUP_WHAT_MAX}字・ほかのお店の受付にも、そのまま出ます）</label>
        <textarea className={`${inputCls} min-h-[72px]`} maxLength={CRM_GROUP_WHAT_MAX} value={f.what} onChange={(e) => set('what', e.target.value)} placeholder="例：施術のあと、セラピストの財布から現金がなくなっていた。" />
      </div>
      <div>
        <label className={labelCls}>確かめ方（{CRM_GROUP_CHECKED_HOW_MAX}字）</label>
        <input className={inputCls} maxLength={CRM_GROUP_CHECKED_HOW_MAX} value={f.checkedHow} onChange={(e) => set('checkedHow', e.target.value)} placeholder="例：セラピストの申告と、入室の記録で確認" />
      </div>
      <div>
        <span className={labelCls}>共有する電話番号（台帳に載っている番号から選びます）</span>
        <div className="flex flex-wrap gap-1.5">
          {phones.map((p) => {
            const on = f.phones.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => set('phones', on ? f.phones.filter((x) => x !== p) : [...f.phones, p])}
                className={`border px-2 py-1 text-[13px] font-bold ${on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-500'}`}
              >
                {fmtGroupPhone(p)}
              </button>
            );
          })}
        </div>
      </div>
      {err && <p className="whitespace-pre-line text-[13px] font-bold text-rose-600">{err}</p>}
      {sure ? (
        <div className="border border-rose-300 bg-rose-50 p-3 text-[13px] text-rose-800">
          <p className="font-bold">{CRM_GROUP_ALERT_SOURCE_LABEL}（自店をふくむ{memberCount}店）に共有されます。</p>
          <p className="mt-1 leading-relaxed">この電話番号からほかのお店に予約が入ると、受付の画面に上の内容が出ます。書いてあるのは、事実だけですか？</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} onClick={submit} className="bg-rose-600 px-3 py-1.5 font-bold text-white disabled:opacity-50">{busy ? '保存中…' : mine ? 'この内容に直す' : 'この内容で共有する'}</button>
            <button type="button" disabled={busy} onClick={() => setSure(false)} className="border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-600">もどる</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => { setErr(''); setSure(true); }} className="bg-indigo-600 px-5 py-2 text-[14px] font-bold text-white">
            {mine ? '直す内容を確かめる' : '共有する内容を確かめる'}
          </button>
          <button type="button" onClick={onCancel} className="border border-slate-300 bg-white px-4 py-2 text-[14px] font-bold text-slate-600">やめる</button>
        </div>
      )}
    </div>
  );
}

type ShareData = { memberCount: number; phones: string[]; mine: CrmGroupMyAlert | null; others: CrmGroupHit[]; othersFailed: boolean };

/**
 * 顧客台帳の1人に出す欄。★ グループに入っている店にだけ、親が出す（入っていない店では、サーバーも inGroup: false しか返さない）。
 * ★ お客様の電話番号を直したら、親が key を変えて作り直す。
 */
export function GroupShareBox({ salonId, customerId }: { salonId: number; customerId: number }) {
  const [data, setData] = useState<ShareData | null | 'out'>(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    getCrmCustomerGroupShare(salonId, customerId).then((res) => {
      if (!alive) return;
      if (!res.ok) { setErr(res.error); return; }
      setErr('');
      setData(res.inGroup ? { memberCount: res.memberCount, phones: res.phones, mine: res.mine, others: res.others, othersFailed: res.othersFailed } : 'out');
    }).catch(() => { if (alive) setErr('読み込めませんでした（通信を確認してください）'); });
    return () => { alive = false; };
  }, [salonId, customerId, tick]);

  const withdraw = async (alertId: number) => {
    setBusy(true); setErr('');
    const r = await withdrawCrmGroupAlert(salonId, alertId);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setSure(false);
    setTick((n) => n + 1);
  };

  if (data === 'out') return null;
  return (
    <section className="mt-5 border border-slate-300 bg-white">
      <h3 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[14px] font-black text-slate-700">
        {CRM_GROUP_ALERT_SOURCE_LABEL}との共有{data ? <span className="ml-2 text-[12px] font-bold text-slate-400">自店をふくむ{data.memberCount}店</span> : null}
      </h3>
      <div className="p-3">
        {err && <p className="mb-2 text-[13px] font-bold text-rose-600">{err}</p>}
        {!data ? (
          !err && <p className="text-[13px] text-slate-400">読み込み中です…</p>
        ) : (
          <>
            <GroupHitBand hits={data.others} failed={data.othersFailed} className="mb-3" />
            {editing ? (
              <AlertForm
                salonId={salonId}
                customerId={customerId}
                phones={data.phones}
                mine={data.mine}
                memberCount={data.memberCount}
                onCancel={() => setEditing(false)}
                onSaved={() => { setEditing(false); setTick((n) => n + 1); }}
              />
            ) : data.mine ? (
              <>
                <GroupHitBand hits={[{ ...data.mine, mine: true }]} />
                <dl className="mt-2 grid grid-cols-[7em_1fr] gap-y-1 text-[13px]">
                  <dt className="font-bold text-slate-400">電話番号</dt>
                  <dd className="text-slate-800">{data.mine.phones.map(fmtGroupPhone).join('／') || '—'}</dd>
                  <dt className="font-bold text-slate-400">確かめ方</dt>
                  <dd className="text-slate-800">{data.mine.checkedHow || '—'}</dd>
                </dl>
                {data.phones.some((p) => !data.mine!.phones.includes(p)) && (
                  <p className="mt-2 text-[12px] font-bold text-amber-700">台帳には、共有していない電話番号があります。足すときは「直す」から選んでください。</p>
                )}
                {sure ? (
                  <div className="mt-3 border border-rose-300 bg-rose-50 p-3 text-[13px] text-rose-800">
                    <p className="font-bold">この共有を取り下げます。ほかのお店の画面から、すぐに見えなくなります。</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" disabled={busy} onClick={() => withdraw(data.mine!.id)} className="bg-rose-600 px-3 py-1.5 font-bold text-white disabled:opacity-50">{busy ? '取り下げ中…' : '取り下げる'}</button>
                      <button type="button" disabled={busy} onClick={() => setSure(false)} className="border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-600">やめる</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => setEditing(true)} className="border border-indigo-300 bg-white px-3 py-1 text-[13px] font-bold text-indigo-600">直す</button>
                    <button type="button" onClick={() => setSure(true)} className="border border-slate-300 bg-white px-3 py-1 text-[13px] font-bold text-slate-600">取り下げる</button>
                  </div>
                )}
              </>
            ) : data.phones.length === 0 ? (
              <p className="text-[13px] leading-relaxed text-slate-500">電話番号が台帳に無いお客様は、共有できません（電話番号で照らし合わせるためです）。先に「編集」で電話番号を入れてください。</p>
            ) : (
              <>
                <p className="text-[13px] leading-relaxed text-slate-600">
                  暴力・盗み・つきまといなど、セラピストやお店に危害があったときに、このお客様を{CRM_GROUP_ALERT_SOURCE_LABEL}へ知らせます。
                  共有すると、この電話番号からほかのお店に予約が入ったとき、受付の画面に出ます。
                </p>
                <button type="button" onClick={() => setEditing(true)} className="mt-2 border border-rose-400 bg-white px-3 py-1.5 text-[13px] font-bold text-rose-600">
                  {CRM_GROUP_ALERT_SOURCE_LABEL}に共有する
                </button>
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
