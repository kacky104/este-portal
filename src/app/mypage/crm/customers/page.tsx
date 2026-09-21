'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCrmCustomer,
  deleteCrmCustomer,
  getCrmTherapists,
  saveCrmCustomer,
  searchCrmCustomers,
  setCrmCancelBad,
} from '@/app/actions/crm';
import {
  CRM_CATEGORIES,
  CRM_CATEGORY_CLASS,
  CRM_CATEGORY_LABEL,
  type CrmBookingRow,
  type CrmCategory,
  type CrmCustomerDetail,
  type CrmCustomerRow,
  type CrmTherapist,
} from '@/app/lib/crm/types';
import { CrmShell, useCrmAccess } from '../CrmShell';
import { ConsentView } from '../ConsentView';

// フクエスCRM（有料）第1段階：顧客台帳（2026-09-19）。
//
// ★ 無料の予約ボード（/mypage）とは別の画面。★ 有料かどうかはサーバー（actions/crm.ts）が判定する。
//   未契約の店には【ご案内だけ】を出す（台帳の中身はサーバーが返さない）。
// ★ PC: 左に検索と一覧・右に1人の詳細。★ スマホ: 一覧 → 押すと詳細（「一覧へ戻る」で戻る）。
// ★ 運営（ADMIN）は ?salon=店舗ID で、その店の台帳を確認できる。

const JST_DATE = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
});
const JST_TIME = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return JST_DATE.format(new Date(iso));
}
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${JST_DATE.format(d)} ${JST_TIME.format(d)}`;
}
/** 09012345678 → 090-1234-5678（見やすさだけ。保存は数字のまま） */
function fmtPhone(p: string): string {
  if (/^0[789]0\d{8}$/.test(p)) return `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}`;
  if (/^0\d{9}$/.test(p)) return `${p.slice(0, 2)}-${p.slice(2, 6)}-${p.slice(6)}`;
  return p;
}

function CategoryBadge({ c }: { c: CrmCategory }) {
  return (
    <span className={`inline-block border px-1.5 py-0.5 text-[11px] font-bold leading-none ${CRM_CATEGORY_CLASS[c]}`}>
      {CRM_CATEGORY_LABEL[c]}
    </span>
  );
}

function StatusBadge({ b, nowMs }: { b: CrmBookingRow; nowMs: number }) {
  if (b.status === 'cancelled') {
    return b.cancelBad
      ? <span className="bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold text-white">悪質キャンセル</span>
      : <span className="bg-slate-200 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">キャンセル</span>;
  }
  if (new Date(b.slotStartISO).getTime() > nowMs) {
    return <span className="bg-sky-100 px-1.5 py-0.5 text-[11px] font-bold text-sky-700">予約中</span>;
  }
  return <span className="bg-emerald-100 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">利用</span>;
}

// ── 編集フォーム ─────────────────────────────────────
type FormState = {
  name: string; nameKana: string; category: CrmCategory; memberNo: string;
  phones: string; ngTherapistIds: number[]; cautionMemo: string; memo: string;
};

function toForm(c: CrmCustomerDetail | null): FormState {
  return {
    name: c?.name ?? '',
    nameKana: c?.nameKana ?? '',
    category: c?.category ?? 'general',
    memberNo: c?.memberNo ?? '',
    phones: (c?.phones ?? []).join('\n'),
    ngTherapistIds: c?.ngTherapistIds ?? [],
    cautionMemo: c?.cautionMemo ?? '',
    memo: c?.memo ?? '',
  };
}

const inputCls = 'w-full border border-slate-300 bg-white px-2.5 py-2 text-[14px] focus:border-indigo-400 focus:outline-none';
const labelCls = 'mb-1 block text-[12px] font-bold text-slate-500';

function CustomerForm({
  salonId, customer, therapists, onSaved, onCancel,
}: {
  salonId: number;
  customer: CrmCustomerDetail | null; // null＝新規
  therapists: CrmTherapist[];
  onSaved: (id: number) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<FormState>(() => toForm(customer));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setErr('');
    const res = await saveCrmCustomer({
      salonId,
      customerId: customer?.id ?? null,
      name: f.name,
      nameKana: f.nameKana,
      category: f.category,
      memberNo: f.memberNo,
      phones: f.phones.split(/\n+/).map((s) => s.trim()).filter(Boolean),
      ngTherapistIds: f.ngTherapistIds,
      cautionMemo: f.cautionMemo,
      memo: f.memo,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onSaved(res.customerId);
  };

  const shown = therapists.filter((t) => t.isActive || f.ngTherapistIds.includes(t.id));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>名前 <span className="text-rose-500">必須</span></label>
          <input className={inputCls} value={f.name} maxLength={40} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>フリガナ</label>
          <input className={inputCls} value={f.nameKana} maxLength={40} onChange={(e) => set('nameKana', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>分類</label>
          <select className={inputCls} value={f.category} onChange={(e) => set('category', e.target.value as CrmCategory)}>
            {CRM_CATEGORIES.map((c) => <option key={c} value={c}>{CRM_CATEGORY_LABEL[c]}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>会員番号</label>
          <input className={inputCls} value={f.memberNo} maxLength={20} onChange={(e) => set('memberNo', e.target.value)} />
        </div>
      </div>
      <div>
        <label className={labelCls}>電話番号（複数あるときは改行で区切る・5件まで）</label>
        <textarea className={`${inputCls} min-h-[64px]`} value={f.phones} onChange={(e) => set('phones', e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>女子NG（このお客様につけない人）</label>
        {shown.length === 0 ? (
          <p className="text-[13px] text-slate-400">セラピストが登録されていません</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {shown.map((t) => {
              const on = f.ngTherapistIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => set('ngTherapistIds', on ? f.ngTherapistIds.filter((x) => x !== t.id) : [...f.ngTherapistIds, t.id])}
                  className={`border px-2 py-1 text-[13px] font-bold ${on ? 'border-rose-500 bg-rose-500 text-white' : 'border-slate-300 bg-white text-slate-600'}`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div>
        <label className={labelCls}>要注意メモ（赤で目立たせて出します・500字）</label>
        <textarea className={`${inputCls} min-h-[64px]`} maxLength={500} value={f.cautionMemo} onChange={(e) => set('cautionMemo', e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>メモ（1000字）</label>
        <textarea className={`${inputCls} min-h-[96px]`} maxLength={1000} value={f.memo} onChange={(e) => set('memo', e.target.value)} />
      </div>
      {err && <p className="whitespace-pre-line text-[13px] font-bold text-rose-600">{err}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={submit} className="bg-indigo-600 px-5 py-2 text-[14px] font-bold text-white disabled:opacity-50">
          {busy ? '保存中…' : '保存する'}
        </button>
        <button type="button" disabled={busy} onClick={onCancel} className="border border-slate-300 bg-white px-4 py-2 text-[14px] font-bold text-slate-600">
          やめる
        </button>
      </div>
    </div>
  );
}

// ── 1人の詳細 ────────────────────────────────────────
function CustomerDetail({
  salonId, customerId, onBack, onChanged, onDeleted,
}: {
  salonId: number;
  customerId: number;
  onBack: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [data, setData] = useState<{ customer: CrmCustomerDetail; bookings: CrmBookingRow[]; therapists: CrmTherapist[] } | null>(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // 「予約中／利用」の境目。読み込んだ時点の時刻で固定する。
  const [nowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    const res = await getCrmCustomer(salonId, customerId);
    if (!res.ok) { setErr(res.error); return; }
    setErr('');
    setData({ customer: res.customer, bookings: res.bookings, therapists: res.therapists });
  }, [salonId, customerId]);

  // ★ お客様が変わったら、親が key で作り直す（ここで state を戻さない）。
  useEffect(() => {
    let alive = true;
    getCrmCustomer(salonId, customerId).then((res) => {
      if (!alive) return;
      if (!res.ok) { setErr(res.error); return; }
      setData({ customer: res.customer, bookings: res.bookings, therapists: res.therapists });
    });
    return () => { alive = false; };
  }, [salonId, customerId]);

  const toggleBad = async (b: CrmBookingRow) => {
    setBusyId(b.id);
    const res = await setCrmCancelBad(salonId, b.id, !b.cancelBad);
    setBusyId(null);
    if (!res.ok) { setErr(res.error); return; }
    await load();
    onChanged();
  };

  if (err && !data) return <p className="p-4 text-[14px] text-rose-600">{err}</p>;
  if (!data) return <p className="p-4 text-[14px] text-slate-400">読み込み中です…</p>;
  const { customer: c, bookings, therapists } = data;
  const ngNames = therapists.filter((t) => c.ngTherapistIds.includes(t.id)).map((t) => t.name);

  return (
    <div className="p-4">
      <button type="button" onClick={onBack} className="mb-3 text-[13px] font-bold text-indigo-600 md:hidden">
        ← 一覧へ戻る
      </button>

      {editing ? (
        <>
          <h2 className="mb-3 text-[17px] font-black text-slate-800">お客様情報を編集</h2>
          <CustomerForm
            salonId={salonId}
            customer={c}
            therapists={therapists}
            onCancel={() => setEditing(false)}
            onSaved={async () => { setEditing(false); await load(); onChanged(); }}
          />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <CategoryBadge c={c.category} />
            <h2 className="text-[20px] font-black text-slate-800">{c.name || '(名前なし)'}</h2>
            {c.nameKana && <span className="text-[13px] text-slate-400">{c.nameKana}</span>}
            <button type="button" onClick={() => setEditing(true)} className="ml-auto border border-indigo-300 bg-white px-3 py-1 text-[13px] font-bold text-indigo-600">
              編集
            </button>
          </div>

          {c.cautionMemo && (
            <p className="mt-3 whitespace-pre-line border-l-4 border-rose-500 bg-rose-50 px-3 py-2 text-[14px] font-bold text-rose-700">
              要注意：{c.cautionMemo}
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-5">
            {[
              ['利用', `${c.stats.visits}回`],
              ['予約中', `${c.stats.upcoming}件`],
              ['キャンセル', `${c.stats.cancels}回`],
              ['うち悪質', `${c.stats.badCancels}回`],
              ['最終利用', fmtDate(c.stats.lastVisitISO)],
            ].map(([k, v]) => (
              <div key={k} className="bg-white px-3 py-2">
                <p className="text-[11px] font-bold text-slate-400">{k}</p>
                <p className={`text-[15px] font-black ${k === 'うち悪質' && c.stats.badCancels > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{v}</p>
              </div>
            ))}
          </div>

          <dl className="mt-3 grid grid-cols-[6.5em_1fr] gap-y-1.5 text-[14px]">
            <dt className="font-bold text-slate-400">電話番号</dt>
            <dd className="text-slate-800">{c.phones.length ? c.phones.map(fmtPhone).join('／') : '—'}</dd>
            <dt className="font-bold text-slate-400">会員番号</dt>
            <dd className="text-slate-800">{c.memberNo || '—'}</dd>
            <dt className="font-bold text-slate-400">女子NG</dt>
            <dd className={ngNames.length ? 'font-bold text-rose-600' : 'text-slate-800'}>{ngNames.length ? ngNames.join('・') : '—'}</dd>
            <dt className="font-bold text-slate-400">メモ</dt>
            <dd className="whitespace-pre-line text-slate-800">{c.memo || '—'}</dd>
          </dl>
        </>
      )}

      <h3 className="mt-6 border-b-2 border-indigo-200 pb-1 text-[15px] font-black text-slate-700">
        予約の履歴 <span className="text-[12px] font-bold text-slate-400">{bookings.length}件</span>
      </h3>
      {err && <p className="mt-2 text-[13px] font-bold text-rose-600">{err}</p>}
      {bookings.length === 0 ? (
        <p className="mt-2 text-[13px] text-slate-400">まだ予約はありません</p>
      ) : (
        <ul className="mt-1 divide-y divide-slate-100">
          {bookings.map((b) => {
            const ng = b.therapistId != null && c.ngTherapistIds.includes(b.therapistId);
            return (
              <li key={b.id} className="py-2 text-[13px]">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusBadge b={b} nowMs={nowMs} />
                  <span className="font-bold text-slate-800">{fmtDateTime(b.slotStartISO)}</span>
                  <span className="text-slate-600">{b.courseName}{b.courseMin ? `（${b.courseMin}分）` : ''}</span>
                  <span className={ng ? 'font-bold text-rose-600' : 'text-slate-600'}>
                    {b.therapistName}{ng ? '（女子NG）' : ''}
                  </span>
                  <span className="text-[11px] text-slate-400">{b.source === 'web' ? 'ネット予約' : '予約ボード'}</span>
                  {b.status === 'cancelled' && (
                    <button
                      type="button"
                      disabled={busyId === b.id}
                      onClick={() => toggleBad(b)}
                      className="ml-auto border border-rose-300 bg-white px-2 py-0.5 text-[12px] font-bold text-rose-600 disabled:opacity-50"
                    >
                      {b.cancelBad ? '悪質を外す' : '悪質にする'}
                    </button>
                  )}
                </div>
                {b.consentAt && (
                  <div className="mt-1 text-[12px]">
                    <ConsentView
                      salonId={salonId}
                      bookingId={b.id}
                      consentAt={b.consentAt}
                      bookingLabel={`${fmtDateTime(b.slotStartISO)} ${b.courseName}`}
                      therapistName={b.therapistName}
                      customerName={c.name || b.customerName}
                    />
                  </div>
                )}
                {(b.note || (b.customerName && b.customerName !== c.name)) && (
                  <p className="mt-0.5 text-[12px] text-slate-500">
                    {b.customerName && b.customerName !== c.name ? `予約時の名前：${b.customerName}　` : ''}
                    {b.note}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!editing && <DeleteCustomer salonId={salonId} customerId={c.id} name={c.name} onDeleted={onDeleted} />}
    </div>
  );
}

// ── 本体 ─────────────────────────────────────────────
export default function CrmCustomersPage() {
  const { access, adminSalonQuery } = useCrmAccess();
  return (
    <CrmShell access={access} adminSalonQuery={adminSalonQuery} current="customers">
      {(a) => <CustomersBody salonId={a.salonId} />}
    </CrmShell>
  );
}

function CustomersBody({ salonId }: { salonId: number }) {
  const [query, setQuery] = useState('');
  const [list, setList] = useState<CrmCustomerRow[]>([]);
  const [listErr, setListErr] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  // ★ スケジュールから「台帳で開く」で来たとき（?customer=ID）は、その人を開いた状態で始める。
  const [selected, setSelected] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const v = Number(new URLSearchParams(window.location.search).get('customer') ?? '');
    return Number.isInteger(v) && v > 0 ? v : null;
  });
  const [creating, setCreating] = useState(false);
  const [therapists, setTherapists] = useState<CrmTherapist[]>([]);
  const seq = useRef(0);

  const runSearch = useCallback(async (q: string) => {
    const my = ++seq.current;
    setLoadingList(true);
    const res = await searchCrmCustomers(salonId, q);
    if (my !== seq.current) return; // 古い検索の結果は捨てる
    setLoadingList(false);
    if (!res.ok) { setListErr(res.error); setList([]); return; }
    setListErr('');
    setList(res.customers);
  }, [salonId]);

  // 入力が止まって0.3秒で検索
  useEffect(() => {
    const t = setTimeout(() => { void runSearch(query); }, 300);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const openCreate = async () => {
    setSelected(null);
    setCreating(true);
    if (therapists.length === 0) {
      const r = await getCrmTherapists(salonId);
      if (r.ok) setTherapists(r.therapists);
    }
  };

  const showDetailOnMobile = selected != null || creating;

  return (
      <div className="mx-auto flex max-w-6xl gap-0 md:gap-4 md:p-4">

        {/* 左：検索と一覧 */}
        <section className={`w-full border-slate-200 bg-white md:block md:w-[380px] md:flex-none md:border ${showDetailOnMobile ? 'hidden' : 'block'}`}>
          <div className="border-b border-slate-200 p-3">
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="名前・電話（下4桁でも）・会員番号"
                className={inputCls}
                inputMode="search"
              />
              <button type="button" onClick={openCreate} className="flex-none bg-indigo-600 px-3 text-[13px] font-bold text-white">
                新規
              </button>

            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              {/* ★ 記入例が欄の幅で切れるので、探せるものはここに書く（第642便） */}
              {query ? (loadingList ? '探しています…' : `${list.length}人見つかりました`) : '名前・フリガナ・電話（下4桁でも）・会員番号・メモの言葉で探せます。いまは最近更新したお客様（50人まで）'}
            </p>
          </div>
          {listErr && <p className="p-3 text-[13px] font-bold text-rose-600">{listErr}</p>}
          <ul className="max-h-none divide-y divide-slate-100 md:max-h-[calc(100vh-170px)] md:overflow-y-auto">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => { setCreating(false); setSelected(c.id); }}
                  className={`block w-full px-3 py-2.5 text-left hover:bg-indigo-50 ${selected === c.id ? 'bg-indigo-50' : ''}`}
                >
                  <div className="flex items-center gap-1.5">
                    <CategoryBadge c={c.category} />
                    <span className="truncate text-[15px] font-bold text-slate-800">{c.name || '(名前なし)'}</span>
                    {c.cautionMemo && <span className="bg-rose-600 px-1 text-[10px] font-bold text-white">要注意</span>}
                    {c.stats.upcoming > 0 && (
                      <span className="ml-auto flex-none bg-sky-100 px-1 text-[11px] font-bold text-sky-700">予約中{c.stats.upcoming}</span>
                    )}
                    <span className={`${c.stats.upcoming > 0 ? '' : 'ml-auto '}flex-none text-[12px] text-slate-500`}>利用{c.stats.visits}</span>
                  </div>
                  {c.memoHit && (
                    <p className={`mt-0.5 truncate text-[12px] ${c.memoHit.kind === 'caution' ? 'font-bold text-rose-600' : 'text-amber-700'}`}>
                      {c.memoHit.kind === 'caution' ? '要注意' : 'メモ'}：{c.memoHit.text}
                    </p>
                  )}
                  <div className="mt-0.5 flex gap-2 text-[12px] text-slate-400">
                    <span>{c.phones[0] ? fmtPhone(c.phones[0]) : '電話なし'}</span>
                    <span>最終 {fmtDate(c.stats.lastVisitISO)}</span>
                    {c.stats.cancels > 0 && (
                      <span className={c.stats.badCancels > 0 ? 'font-bold text-rose-500' : ''}>
                        ｷｬﾝｾﾙ{c.stats.cancels}{c.stats.badCancels > 0 ? `（悪質${c.stats.badCancels}）` : ''}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            ))}
            {!loadingList && list.length === 0 && !listErr && (
              <li className="p-4 text-[13px] leading-relaxed text-slate-400">
                {query ? '見つかりませんでした' : 'まだお客様がいません。予約ボードやネット予約で電話番号つきの予約が入ると、自動でここに増えていきます。'}
              </li>
            )}
          </ul>
        </section>

        {/* 右：詳細 */}
        <section className={`min-h-[60vh] w-full flex-1 bg-white md:block md:border md:border-slate-200 ${showDetailOnMobile ? 'block' : 'hidden'}`}>
          {creating ? (
            <div className="p-4">
              <button type="button" onClick={() => setCreating(false)} className="mb-3 text-[13px] font-bold text-indigo-600 md:hidden">
                ← 一覧へ戻る
              </button>
              <h2 className="mb-3 text-[17px] font-black text-slate-800">お客様を新しく登録</h2>
              <CustomerForm
                salonId={salonId}
                customer={null}
                therapists={therapists}
                onCancel={() => setCreating(false)}
                onSaved={(id) => { setCreating(false); setSelected(id); void runSearch(query); }}
              />
            </div>
          ) : selected != null ? (
            <CustomerDetail
              key={selected}
              salonId={salonId}
              customerId={selected}
              onBack={() => setSelected(null)}
              onChanged={() => void runSearch(query)}
              onDeleted={() => { setSelected(null); void runSearch(query); }}
            />
          ) : (
            <p className="p-8 text-center text-[14px] text-slate-400">左の一覧からお客様を選んでください</p>
          )}
        </section>
      </div>
  );
}

// お客様を台帳から消す（第569便）。★ お客様から削除を頼まれたとき用。2回押しで消す。
function DeleteCustomer({ salonId, customerId, name, onDeleted }: { salonId: number; customerId: number; name: string; onDeleted: () => void }) {
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async () => {
    setBusy(true); setErr('');
    const r = await deleteCrmCustomer(salonId, customerId);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDeleted();
  };
  return (
    <div className="mt-8 border-t border-slate-200 pt-4">
      {!sure ? (
        <button type="button" onClick={() => setSure(true)} className="text-[12px] font-bold text-slate-400 underline">このお客様を台帳から削除する</button>
      ) : (
        <div className="border border-rose-300 bg-rose-50 p-3 text-[13px] text-rose-800">
          <p className="font-bold">「{name || '(名前なし)'}」さんを台帳から削除します。元に戻せません。</p>
          <p className="mt-1 leading-relaxed">電話番号・メモ・分類も消え、このお客様の予約は名前「削除済み」・電話番号なし・備考なしになります（日時・金額は日報やレポートのため残ります）。その予約の同意書も消えます。</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} onClick={run} className="bg-rose-600 px-3 py-1.5 font-bold text-white disabled:opacity-50">{busy ? '削除中…' : '本当に削除する'}</button>
            <button type="button" onClick={() => setSure(false)} className="border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-600">やめる</button>
          </div>
          {err && <p className="mt-1 font-bold">{err}</p>}
        </div>
      )}
    </div>
  );
}
