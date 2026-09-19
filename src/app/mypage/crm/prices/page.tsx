'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  deleteCrmPriceItem,
  importCrmCoursesFromMenu,
  listCrmPriceItems,
  saveCrmPriceItem,
} from '@/app/actions/crm';
import {
  CRM_PRICE_KINDS,
  CRM_PRICE_KIND_LABEL,
  type CrmPriceItem,
  type CrmPriceKind,
} from '@/app/lib/crm/types';
import { CrmShell, useCrmAccess } from '../CrmShell';

// フクエスCRM「料金設定」（第536便・2026-09-19）。
// ★ 料金表＝項目ごとに「料金」と「女子報酬」（カッキーさんの決定：報酬は項目ごとに金額）。
// ★ お店の内部情報（報酬が入る）。公開のコースメニューとは別。★ 予約は選んだ項目を写して持つので、
//   ここを直しても過去の予約の金額は変わらない。

const HINT: Record<CrmPriceKind, string> = {
  course: '1つだけ選ぶ。分数が予約の時間になります。',
  nomination: '1つだけ選ぶ（フリー・ネット指名・本指名など）。',
  extension: 'いくつでも。分数が予約の時間に足されます。',
  option: 'いくつでも。',
  discount: 'いくつでも。「料金」はお客様の料金から引く額、「報酬」は女子報酬から引く額（引かないなら0）。',
};
const USES_MINUTES: Record<CrmPriceKind, boolean> = {
  course: true, nomination: false, extension: true, option: false, discount: false,
};

export default function CrmPricesPage() {
  const { access, adminSalonQuery } = useCrmAccess();
  return (
    <CrmShell access={access} adminSalonQuery={adminSalonQuery} current="prices">
      {(a) => <PricesBody salonId={a.salonId} />}
    </CrmShell>
  );
}

type Draft = { id: number | null; kind: CrmPriceKind; name: string; minutes: string; price: string; pay: string; sort: string; isActive: boolean };

function toDraft(p: CrmPriceItem): Draft {
  return { id: p.id, kind: p.kind, name: p.name, minutes: String(p.minutes || ''), price: String(p.price), pay: String(p.pay), sort: String(p.sort), isActive: p.isActive };
}
function emptyDraft(kind: CrmPriceKind, sort: number): Draft {
  return { id: null, kind, name: '', minutes: '', price: '', pay: '', sort: String(sort), isActive: true };
}

function PricesBody({ salonId }: { salonId: number }) {
  const [items, setItems] = useState<CrmPriceItem[] | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    listCrmPriceItems(salonId).then((r) => {
      if (!alive) return;
      if (!r.ok) { setErr(r.error); return; }
      setErr('');
      setItems(r.items);
    });
    return () => { alive = false; };
  }, [salonId, tick]);

  const reload = useCallback(() => setTick((v) => v + 1), []);

  const importMenu = async () => {
    setMsg('');
    const r = await importCrmCoursesFromMenu(salonId);
    if (!r.ok) { setErr(r.error); return; }
    setMsg(r.added > 0 ? `コースメニューから ${r.added} 件取り込みました。報酬を入れて保存してください。` : '取り込めるコースはありませんでした（もう入っているか、コースメニューが空です）。');
    reload();
  };

  return (
    <div className="mx-auto max-w-4xl px-3 py-4">
      <div className="mb-4 border border-slate-200 bg-white p-4">
        <h2 className="text-[17px] font-black text-slate-800">料金表（料金と女子報酬）</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
          予約を受け付けるときに、ここの項目を押して選ぶと、料金と女子報酬が自動で計算されます。
          お店の中だけの表です（お客様には見えません）。ここを直しても、もう入っている予約の金額は変わりません。
        </p>
        <button type="button" onClick={importMenu} className="mt-3 border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-[13px] font-bold text-indigo-700">
          いまのコースメニューからコースを取り込む
        </button>
        {msg && <p className="mt-2 text-[13px] font-bold text-emerald-700">{msg}</p>}
        {err && <p className="mt-2 text-[13px] font-bold text-rose-600">{err}</p>}
      </div>

      {!items ? (
        <p className="p-6 text-center text-[14px] text-slate-400">読み込み中です…</p>
      ) : (
        CRM_PRICE_KINDS.map((kind) => {
          const list = items.filter((i) => i.kind === kind);
          return (
            <section key={kind} className="mb-4 border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
                <h3 className="text-[15px] font-black text-slate-800">{CRM_PRICE_KIND_LABEL[kind]}</h3>
                <p className="text-[12px] text-slate-500">{HINT[kind]}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] font-bold text-slate-400">
                      <th className="px-2 py-1.5">名前</th>
                      {USES_MINUTES[kind] && <th className="w-20 px-2">分数</th>}
                      <th className="w-28 px-2">{kind === 'discount' ? '料金から引く' : '料金'}</th>
                      <th className="w-28 px-2">{kind === 'discount' ? '報酬から引く' : '女子報酬'}</th>
                      <th className="w-16 px-2">並び</th>
                      <th className="w-14 px-2">使う</th>
                      <th className="w-36 px-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p) => (
                      <Row key={p.id} salonId={salonId} initial={toDraft(p)} onSaved={reload} />
                    ))}
                    <Row key={`new-${kind}-${list.length}-${tick}`} salonId={salonId} initial={emptyDraft(kind, list.length)} onSaved={reload} />
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

const cell = 'w-full border border-slate-300 bg-white px-2 py-1.5 text-[13px] focus:border-indigo-400 focus:outline-none';

function Row({ salonId, initial, onSaved }: { salonId: number; initial: Draft; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const isNew = d.id == null;
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const numOnly = (v: string) => v.replace(/[^0-9]/g, '');

  const save = async () => {
    setBusy(true);
    setErr('');
    const r = await saveCrmPriceItem({
      salonId, id: d.id, kind: d.kind, name: d.name,
      minutes: Number(d.minutes) || 0, price: Number(d.price) || 0, pay: Number(d.pay) || 0,
      sort: Number(d.sort) || 0, isActive: d.isActive,
    });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onSaved();
  };
  const del = async () => {
    if (!d.id) return;
    setBusy(true);
    const r = await deleteCrmPriceItem(salonId, d.id);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onSaved();
  };

  return (
    <tr className={`border-t border-slate-100 ${isNew ? 'bg-slate-50/60' : ''} ${!d.isActive ? 'opacity-50' : ''}`}>
      <td className="px-2 py-1.5">
        <input className={cell} value={d.name} maxLength={40} onChange={(e) => set('name', e.target.value)} placeholder={isNew ? '＋ 新しい項目の名前' : ''} />
        {err && <p className="mt-0.5 text-[12px] font-bold text-rose-600">{err}</p>}
      </td>
      {USES_MINUTES[d.kind] && (
        <td className="px-2"><input className={cell} inputMode="numeric" value={d.minutes} onChange={(e) => set('minutes', numOnly(e.target.value))} placeholder="分" /></td>
      )}
      <td className="px-2"><input className={cell} inputMode="numeric" value={d.price} onChange={(e) => set('price', numOnly(e.target.value))} placeholder="円" /></td>
      <td className="px-2"><input className={cell} inputMode="numeric" value={d.pay} onChange={(e) => set('pay', numOnly(e.target.value))} placeholder="円" /></td>
      <td className="px-2"><input className={cell} inputMode="numeric" value={d.sort} onChange={(e) => set('sort', numOnly(e.target.value))} /></td>
      <td className="px-2 text-center"><input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={d.isActive} onChange={(e) => set('isActive', e.target.checked)} /></td>
      <td className="whitespace-nowrap px-2">
        <button
          type="button"
          disabled={busy || !d.name.trim() || (!dirty && !isNew)}
          onClick={save}
          className="bg-indigo-600 px-2.5 py-1 text-[12px] font-bold text-white disabled:opacity-40"
        >
          {isNew ? '追加' : '保存'}
        </button>
        {!isNew && (
          confirmDel ? (
            <button type="button" disabled={busy} onClick={del} className="ml-1 bg-rose-600 px-2 py-1 text-[12px] font-bold text-white">本当に削除</button>
          ) : (
            <button type="button" disabled={busy} onClick={() => setConfirmDel(true)} className="ml-1 px-1 text-[12px] font-bold text-slate-400 underline">削除</button>
          )
        )}
      </td>
    </tr>
  );
}
