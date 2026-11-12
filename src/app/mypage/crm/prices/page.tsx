'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteCrmPriceItem,
  getCrmTherapists,
  listCrmPriceItems,
  saveCrmPriceItem,
  saveCrmPriceOverrides,
} from '@/app/actions/crm';
import {
  CRM_PRICE_KINDS,
  CRM_PRICE_KIND_LABEL,
  isFixedNomination,
  type CrmPriceItem,
  type CrmPriceKind,
} from '@/app/lib/crm/types';
import { CrmShell, useCrmAccess } from '../CrmShell';
import { safeAction } from '../CrmBase';

// フクエスCRM「料金設定」（第536便・2026-09-19）。
// ★ 料金表＝項目ごとに「料金」と「女子報酬」（カッキーさんの決定：報酬は項目ごとに金額）。
// ★ お店の内部情報（報酬が入る）。公開のコースメニューとは別。★ 予約は選んだ項目を写して持つので、
//   ここを直しても過去の予約の金額は変わらない。

const HINT: Record<CrmPriceKind, string> = {
  course: '1つだけ選ぶ。分数が予約の時間になります。',
  nomination: '1つだけ選ぶ。フリー・ネット指名・本指名は最初から用意してあり、名前は変えられません（要らなければ「使う」を外す）。ほかの指名は追加できます。',
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
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    safeAction(listCrmPriceItems(salonId)).then((r) => {
      if (!alive) return;
      if (!r.ok) { setErr(r.error); return; }
      setErr('');
      setItems(r.items);
    });
    return () => { alive = false; };
  }, [salonId, tick]);

  const reload = useCallback(() => setTick((v) => v + 1), []);

  return (
    <div className="mx-auto max-w-4xl px-3 py-4">
      <div className="mb-4 border border-slate-200 bg-white p-4">
        <h2 className="text-[17px] font-black text-slate-800">料金表（料金と女子報酬）</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
          予約を受け付けるときに、ここの項目を押して選ぶと、料金と女子報酬が自動で計算されます。
          内容変更をしてもすでに入っている予約の金額は変わりません。
        </p>
        {err && <p className="mt-2 text-[13px] font-bold text-rose-600">{err}</p>}
      </div>

      {!items ? (
        <p className="p-6 text-center text-[14px] text-slate-400">読み込み中です…</p>
      ) : (
        CRM_PRICE_KINDS.map((kind) => {
          const list = items.filter((i) => i.kind === kind);
          return (
            // ★ 第1783便（カッキーさん）: ページが縦に長くなったので、種類ごとにアコーディオン（見出しを押すと開閉・既定は閉じる）
            <details key={kind} className="group mb-3 border border-slate-200 bg-white">
              <summary className="flex cursor-pointer list-none items-center gap-3 bg-slate-50 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">
                  <span className="text-[15px] font-black text-slate-800">{CRM_PRICE_KIND_LABEL[kind]}</span>
                  <span className="ml-2 text-[12px] font-bold text-slate-500">{list.length}件{list.some((p) => !p.isActive) ? `（使う ${list.filter((p) => p.isActive).length}件）` : ''}</span>
                </span>
                <svg className="h-4 w-4 flex-none text-slate-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </summary>
              <p className="border-y border-slate-200 bg-slate-50 px-4 pb-2 text-[12px] text-slate-500">{HINT[kind]}</p>
              {/* ★ 第1231便（カッキーさん）: スマホはカード型（1件ずつ縦に・「保存」が右端に隠れない）。PC は今までの表。 */}
              <div className="divide-y divide-slate-100 md:hidden">
                {list.map((p) => (
                  <RowCard key={p.id} salonId={salonId} initial={toDraft(p)} onSaved={reload} />
                ))}
                {/* ★ 2026-10-09 点検#23: 新規行の key を固定（前は tick 入りで、別の行を保存するたびに入力途中の新規行が作り直されて消えた） */}
                <RowCard key={`new-${kind}`} salonId={salonId} initial={emptyDraft(kind, list.length)} onSaved={reload} />
              </div>
              <div className="hidden overflow-x-auto md:block">
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
                    <Row key={`new-${kind}`} salonId={salonId} initial={emptyDraft(kind, list.length)} onSaved={reload} />
                  </tbody>
                </table>
              </div>
            </details>
          );
        })
      )}

      {/* ★ 第1782便（カッキーさん・店舗様のご要望）: 女の子別の料金 */}
      {items && items.some((i) => i.isActive) && <TherapistPrices salonId={salonId} items={items.filter((i) => i.isActive)} onSaved={reload} />}
    </div>
  );
}

// ── 女の子別の料金（第1782便・2026-11-08）──────────────────────
// ★ 基本の料金表の項目ごとに、女の子ごとの「料金」「女子報酬」を入れられる。空欄は基本と同じ。全部の種類が対象。
// ★ 予約の担当をその女の子にすると、料金のボタンと合計がこの金額になる（保存のときはサーバーが同じ計算をする）。
type OvDraft = Record<number, { price: string; pay: string }>;

function ovDraftOf(items: CrmPriceItem[], tid: number | null): OvDraft {
  const out: OvDraft = {};
  for (const p of items) {
    const o = tid != null ? p.byTherapist?.[String(tid)] : undefined;
    out[p.id] = { price: o?.price != null ? String(o.price) : '', pay: o?.pay != null ? String(o.pay) : '' };
  }
  return out;
}

function TherapistPrices({ salonId, items, onSaved }: { salonId: number; items: CrmPriceItem[]; onSaved: () => void }) {
  const [therapists, setTherapists] = useState<Array<{ id: number; name: string; isActive: boolean }> | null>(null);
  const [tid, setTid] = useState<number | null>(null);
  const [draft, setDraft] = useState<OvDraft>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    safeAction(getCrmTherapists(salonId)).then((r) => {
      if (!alive) return;
      if (r.ok) setTherapists(r.therapists); else setErr(r.error);
    });
    return () => { alive = false; };
  }, [salonId]);

  // ★ 女の子を選び直したとき・読み直したとき（保存のあと）は、今の内容で入れ直す
  const itemsKey = JSON.stringify(items.map((p) => [p.id, p.byTherapist ?? null]));
  useEffect(() => { setDraft(ovDraftOf(items, tid)); setMsg(''); setErr('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tid, itemsKey]);

  // 個別の料金がある女の子
  const withCustom = new Set<number>();
  for (const p of items) for (const k of Object.keys(p.byTherapist ?? {})) withCustom.add(Number(k));
  const nameOf = (id: number) => therapists?.find((t) => t.id === id)?.name ?? `#${id}`;
  const sorted = (therapists ?? []).slice().sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, 'ja'));

  const numOnly = (v: string) => v.replace(/[^0-9]/g, '');
  const setCell = (id: number, k: 'price' | 'pay', v: string) => setDraft((d) => ({ ...d, [id]: { ...(d[id] ?? { price: '', pay: '' }), [k]: numOnly(v) } }));
  const dirty = tid != null && JSON.stringify(draft) !== JSON.stringify(ovDraftOf(items, tid));

  const save = async () => {
    if (tid == null) return;
    setBusy(true); setErr(''); setMsg('');
    const rows = items.map((p) => ({
      priceItemId: p.id,
      price: draft[p.id]?.price === '' || draft[p.id] == null ? null : Number(draft[p.id].price),
      pay: draft[p.id]?.pay === '' || draft[p.id] == null ? null : Number(draft[p.id].pay),
    }));
    const r = await safeAction(saveCrmPriceOverrides({ salonId, therapistId: tid, rows }));
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setMsg(`${nameOf(tid)}さんの料金を保存しました`);
    onSaved();
  };
  const clearAll = () => setDraft(ovDraftOf(items, null)); // ★ 保存を押すまでは変わらない

  return (
    <details className="group mb-3 border border-emerald-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-3 bg-emerald-50 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="text-[15px] font-black text-slate-800">女の子別の料金</span>
          {withCustom.size > 0 && <span className="ml-2 text-[12px] font-bold text-emerald-700">個別の料金あり {withCustom.size}人</span>}
        </span>
        <svg className="h-4 w-4 flex-none text-slate-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </summary>
      <div className="border-y border-emerald-200 bg-emerald-50 px-4 pb-2">
        <p className="text-[12px] leading-relaxed text-slate-600">
          女の子によって料金・女子報酬が違うときに使います。変えたい項目だけ入れてください（空欄は上の基本の料金と同じ）。
          予約の担当をその女の子にすると、その子の料金で計算されます。すでに入っている予約の金額は変わりません。
        </p>
      </div>
      <div className="space-y-3 px-4 py-3">
        {withCustom.size > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="font-bold text-slate-500">個別の料金あり：</span>
            {[...withCustom].map((id) => (
              <button key={id} type="button" onClick={() => setTid(id)}
                className={`border px-2 py-1.5 font-bold ${tid === id ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-emerald-300 bg-white text-emerald-700'}`}>
                {nameOf(id)}
              </button>
            ))}
          </div>
        )}
        <label className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-slate-600">
          女の子を選ぶ
          <select value={tid ?? ''} onChange={(e) => setTid(e.target.value ? Number(e.target.value) : null)}
            className="min-w-[200px] border border-slate-300 bg-white px-2 py-1.5 text-[14px] font-bold text-slate-700">
            <option value="">（選んでください）</option>
            {sorted.map((t) => (
              <option key={t.id} value={t.id}>{t.name}{withCustom.has(t.id) ? '（個別の料金あり）' : ''}{t.isActive ? '' : '（非公開）'}</option>
            ))}
          </select>
        </label>
        {err && <p className="text-[13px] font-bold text-rose-600">{err}</p>}

        {tid != null && (
          <>
            <div className="divide-y divide-slate-100 border border-slate-200">
              {CRM_PRICE_KINDS.map((kind) => {
                const list = items.filter((p) => p.kind === kind);
                if (list.length === 0) return null;
                return (
                  <div key={kind}>
                    <p className="bg-slate-50 px-3 py-1 text-[12px] font-black text-slate-600">{CRM_PRICE_KIND_LABEL[kind]}</p>
                    {list.map((p) => {
                      const v = draft[p.id] ?? { price: '', pay: '' };
                      return (
                        <div key={p.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-t border-slate-100 px-3 py-1.5 sm:grid-cols-[1fr_170px_170px]">
                          <span className="min-w-0 truncate text-[13px] font-bold text-slate-700">{p.name}{p.minutes && kind !== 'discount' ? ` ${p.minutes}分` : ''}</span>
                          <label className="text-[11px] font-bold text-slate-400">
                            {kind === 'discount' ? '料金から引く' : '料金'}（基本 {p.price.toLocaleString()}）
                            <input className={`${cell} w-[110px] sm:w-full ${v.price !== '' ? 'border-emerald-500 bg-emerald-50' : ''}`} inputMode="numeric"
                              value={v.price} placeholder={String(p.price)} onChange={(e) => setCell(p.id, 'price', e.target.value)} />
                          </label>
                          <label className="text-[11px] font-bold text-slate-400">
                            {kind === 'discount' ? '報酬から引く' : '女子報酬'}（基本 {p.pay.toLocaleString()}）
                            <input className={`${cell} w-[110px] sm:w-full ${v.pay !== '' ? 'border-emerald-500 bg-emerald-50' : ''}`} inputMode="numeric"
                              value={v.pay} placeholder={String(p.pay)} onChange={(e) => setCell(p.id, 'pay', e.target.value)} />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy || !dirty} onClick={() => void save()}
                className="bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40">
                {busy ? '保存しています…' : `${nameOf(tid)}さんの料金を保存`}
              </button>
              <button type="button" disabled={busy} onClick={clearAll} className="px-2 py-1.5 text-[12px] font-bold text-slate-500 underline">
                全部空欄にする（基本の料金に戻す）
              </button>
              {msg && <span className="text-[13px] font-bold text-emerald-700">{msg}</span>}
            </div>
          </>
        )}
      </div>
    </details>
  );
}

const cell = 'w-full border border-slate-300 bg-white px-2 py-1.5 text-[13px] focus:border-indigo-400 focus:outline-none';

/** ★ 第1231便: 行の状態と保存・削除（表の行とカードで共通） */
function useDraftRow(salonId: number, initial: Draft, onSaved: () => void) {
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const isNew = d.id == null;
  // ★ 固定の指名（フリー・ネット指名・本指名）は名前を変えられない・消せない（第546便）
  const fixed = !isNew && isFixedNomination(initial.kind, initial.name);
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  // ★ 2026-10-09 点検#23: 読み直しで initial が変わったとき、行が触られていなければ（前の initial と同じなら）新しい initial に合わせる。
  //   前は useState の初期値だけだったので、保存→読み直しのあとも古い値を持ち、何も変えていないのに「保存」が押せる状態が残った。
  const initialKey = JSON.stringify(initial);
  const prevInitialKey = useRef(initialKey);
  useEffect(() => {
    if (prevInitialKey.current === initialKey) return;
    const wasClean = JSON.stringify(d) === prevInitialKey.current;
    prevInitialKey.current = initialKey;
    if (wasClean) setD(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const numOnly = (v: string) => v.replace(/[^0-9]/g, '');

  const save = async () => {
    setBusy(true);
    setErr('');
    const r = await safeAction(saveCrmPriceItem({
      salonId, id: d.id, kind: d.kind, name: d.name,
      minutes: Number(d.minutes) || 0, price: Number(d.price) || 0, pay: Number(d.pay) || 0,
      sort: Number(d.sort) || 0, isActive: d.isActive,
    }));
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    // ★ 2026-10-09 点検#23: 保存したら、読み直し後の initial と同じ形に（新規行は空に戻す・既存行は数字をそろえる）
    if (isNew) setD(initial);
    else setD({ ...d, minutes: String(Number(d.minutes) || ''), price: String(Number(d.price) || 0), pay: String(Number(d.pay) || 0), sort: String(Number(d.sort) || 0) });
    onSaved();
  };
  const del = async () => {
    if (!d.id) return;
    setBusy(true);
    const r = await safeAction(deleteCrmPriceItem(salonId, d.id));
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onSaved();
  };
  return { d, set, busy, err, confirmDel, setConfirmDel, isNew, fixed, dirty, numOnly, save, del };
}

function RowCard({ salonId, initial, onSaved }: { salonId: number; initial: Draft; onSaved: () => void }) {
  const { d, set, busy, err, confirmDel, setConfirmDel, isNew, fixed, dirty, numOnly, save, del } = useDraftRow(salonId, initial, onSaved);
  const lab = 'block text-[11px] font-bold text-slate-400';
  return (
    <div className={`px-3 py-2 ${isNew ? 'bg-slate-50/60' : ''} ${!d.isActive ? 'opacity-50' : ''}`}>
      {fixed ? (
        <div className="flex items-center gap-2 py-1">
          <span className="text-[14px] font-bold text-slate-800">{d.name}</span>
          <span className="bg-slate-200 px-1.5 text-[11px] font-bold text-slate-600">固定</span>
        </div>
      ) : (
        <input className={cell} value={d.name} maxLength={40} onChange={(e) => set('name', e.target.value)} placeholder={isNew ? '＋ 新しい項目の名前' : ''} aria-label="名前" />
      )}
      <div className="mt-1.5 grid grid-cols-4 gap-1.5">
        {USES_MINUTES[d.kind] && (
          <label><span className={lab}>分数</span><input className={cell} inputMode="numeric" value={d.minutes} onChange={(e) => set('minutes', numOnly(e.target.value))} placeholder="分" /></label>
        )}
        <label><span className={lab}>{d.kind === 'discount' ? '料金から引く' : '料金'}</span><input className={cell} inputMode="numeric" value={d.price} onChange={(e) => set('price', numOnly(e.target.value))} placeholder="円" /></label>
        <label><span className={lab}>{d.kind === 'discount' ? '報酬から引く' : '女子報酬'}</span><input className={cell} inputMode="numeric" value={d.pay} onChange={(e) => set('pay', numOnly(e.target.value))} placeholder="円" /></label>
        <label><span className={lab}>並び</span><input className={cell} inputMode="numeric" value={d.sort} onChange={(e) => set('sort', numOnly(e.target.value))} /></label>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <label className="flex items-center gap-1 text-[12px] font-bold text-slate-600">
          <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={d.isActive} onChange={(e) => set('isActive', e.target.checked)} />使う
        </label>
        <button
          type="button"
          disabled={busy || !d.name.trim() || (!dirty && !isNew)}
          onClick={save}
          className="ml-auto bg-indigo-600 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40"
        >
          {isNew ? '追加' : '保存'}
        </button>
        {!isNew && !fixed && (
          confirmDel ? (
            <button type="button" disabled={busy} onClick={del} className="bg-rose-600 px-2 py-1.5 text-[12px] font-bold text-white">本当に削除</button>
          ) : (
            <button type="button" disabled={busy} onClick={() => setConfirmDel(true)} className="px-1.5 py-1.5 text-[12px] font-bold text-slate-400 underline">削除</button>
          )
        )}
      </div>
      {err && <p className="mt-0.5 text-[12px] font-bold text-rose-600">{err}</p>}
    </div>
  );
}

function Row({ salonId, initial, onSaved }: { salonId: number; initial: Draft; onSaved: () => void }) {
  const { d, set, busy, err, confirmDel, setConfirmDel, isNew, fixed, dirty, numOnly, save, del } = useDraftRow(salonId, initial, onSaved);
  return (
    <tr className={`border-t border-slate-100 ${isNew ? 'bg-slate-50/60' : ''} ${!d.isActive ? 'opacity-50' : ''}`}>
      <td className="px-2 py-1.5">
        {fixed ? (
          <div className="flex items-center gap-2 px-1 py-1.5">
            <span className="text-[14px] font-bold text-slate-800">{d.name}</span>
            <span className="bg-slate-200 px-1.5 text-[11px] font-bold text-slate-600">固定</span>
          </div>
        ) : (
          <input className={cell} value={d.name} maxLength={40} onChange={(e) => set('name', e.target.value)} placeholder={isNew ? '＋ 新しい項目の名前' : ''} />
        )}
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
          className="bg-indigo-600 px-2.5 py-1.5 text-[12px] font-bold text-white disabled:opacity-40"
        >
          {isNew ? '追加' : '保存'}
        </button>
        {!isNew && !fixed && (
          confirmDel ? (
            <button type="button" disabled={busy} onClick={del} className="ml-1 bg-rose-600 px-2 py-1.5 text-[12px] font-bold text-white">本当に削除</button>
          ) : (
            <button type="button" disabled={busy} onClick={() => setConfirmDel(true)} className="ml-1 px-1.5 py-1.5 text-[12px] font-bold text-slate-400 underline">削除</button>
          )
        )}
      </td>
    </tr>
  );
}
