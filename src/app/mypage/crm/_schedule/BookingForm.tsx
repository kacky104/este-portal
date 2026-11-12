'use client';

import { appConfirm } from '@/app/components/AppConfirm';
import { useEffect, useState } from 'react';
import { lookupCrmCustomerByPhone } from '@/app/actions/crmSchedule';
import { setCrmBookingPricing } from '@/app/actions/crmPrices';
import { createManualBooking, moveBooking, updateBookingDetails } from '@/app/actions/booking';
import { CRM_CATEGORY_CLASS, CRM_CATEGORY_LABEL, CRM_PAYMENT_METHODS, CRM_PRICE_KINDS, CRM_PRICE_KIND_LABEL, CRM_PRICE_SINGLE, type CrmRoomBand, sumCrmItems, priceForTherapist, yen, type CrmBookingItem, type CrmPriceItem, type CrmScheduleBooking, type CrmScheduleCustomer, type CrmScheduleData, type CrmScheduleTherapist } from '@/app/lib/crm/types';
import { FREE_LANE_MAX } from '@/app/lib/booking/freeLane';
import { GroupHitBand } from '../GroupShare';
import { type CrmGroupHit } from '@/lib/crmGroup';
import { safeCall, PARTY_MAX, FORM_STEP_MIN, intervalOptionsWith, hourLabel, hm, useDialogFocus, useDragMove } from './shared';

// ── 受付・変更フォーム ─────────────────────────────────
export type BookingFormState = {
  mode: 'new' | 'edit';
  bookingId?: string;
  origTherapistKey?: string;
  origStartMin?: number;
  origSpan?: number;      // 変更前の枠の長さ（コース＋インターバル・分）
  therapistKey: string;   // 'free' か セラピストID
  startMin: number;       // その日 0:00 からの分
  courseName: string;
  courseMin: number;
  intervalMin: number;
  customerName: string;
  customerTel: string;
  note: string;
  // 料金と報酬（第536便）
  selIds: number[];               // 料金表から選んだ項目
  keepItems: CrmBookingItem[];    // 料金表にもう無いが、この予約に残っている項目
  priceAdjust: string;
  payAdjust: string;
  paymentMethod: string;
  /** ★ 第1363便: 支払いの内訳（方法 → 金額の文字）。全部空なら paymentMethod（古い値）だけを送る */
  payAmounts: Record<string, string>;
};

/** ★ 第1363便: 予約の支払い（内訳か1つの方法）→ フォームの金額欄 */
export function payAmountsOf(b: { paymentMethod: string; paymentSplit: { method: string; amount: number }[]; priceTotal: number | null }): Record<string, string> {
  if (b.paymentSplit.length > 1) return Object.fromEntries(b.paymentSplit.map((s) => [s.method, String(s.amount)]));
  if (b.paymentMethod && (CRM_PAYMENT_METHODS as readonly string[]).includes(b.paymentMethod) && b.priceTotal != null) return { [b.paymentMethod]: String(b.priceTotal) };
  return {};
}

/** 予約の項目 → 今の料金表と同じもの（選択）と、表に無いもの（残す）に分ける */
// ★ 第1782便: 女の子別の料金で写した項目も「今の料金表と同じ」とみなす（その予約の担当の金額と同じなら）
export function splitItems(items: CrmBookingItem[], priceItems: CrmPriceItem[], therapistId: number | null): { selIds: number[]; keepItems: CrmBookingItem[] } {
  const selIds: number[] = [];
  const keepItems: CrmBookingItem[] = [];
  for (const it of items) {
    const p = priceItems.find((x) => {
      if (!(x.id === it.priceItemId && x.kind === it.kind && x.name === it.name && x.minutes === it.minutes)) return false;
      if (x.price === it.price && x.pay === it.pay) return true;
      const eff = priceForTherapist(x, therapistId);
      return eff.price === it.price && eff.pay === it.pay;
    });
    if (p && !selIds.includes(p.id)) selIds.push(p.id);
    else keepItems.push(it);
  }
  return { selIds, keepItems };
}

export const fieldCls = 'w-full border border-slate-300 bg-white px-2.5 py-2 text-[14px] focus:border-indigo-400 focus:outline-none';
export const labCls = 'mb-1 block text-[12px] font-bold text-slate-500';

export function BookingForm({
  initial, salonId, baseMs, therapists, courses, priceItems, dayBookings, roomBandsOf, onClose, onSaved, onSavedKeepOpen,
}: {
  initial: BookingFormState;
  salonId: number;
  baseMs: number;
  therapists: CrmScheduleTherapist[];
  courses: CrmScheduleData['courses'];
  priceItems: CrmPriceItem[];
  /** この日の予約（同じお客様の二重受付に気づけるように） */
  dayBookings: CrmScheduleBooking[];
  /** ★ 第1672便: 提携店の予約の帯（同じ部屋）。保存前に、開始〜終わり（インターバル込み）が重なれば一度だけ確認 */
  roomBandsOf: (therapistId: number) => CrmRoomBand[];
  onClose: () => void;
  onSaved: () => void;
  /** ★ 第1787便: グループの一部だけ入ったとき、フォームを開いたまま表を読み直す */
  onSavedKeepOpen?: () => void;
}) {
  const dlgRef = useDialogFocus<HTMLElement>();
  const drag = useDragMove(); // ★ 第1790便: 見出しの帯をつかんで動かす
  const [f, setF] = useState<BookingFormState>(initial);
  // ★★ 第1787便（アロマメイ様のご要望・カッキーさん 11/8）: 2名様・3名様などのグループ予約を1回で受け付ける（新しい受付のときだけ）。
  //   ・人数を選ぶと「◯人目の担当」が増える。名前・電話・開始・時間・コース・料金は1人目と同じものが入る。
  //   ・指名だけ人ごとに変えられる（空＝1人目と同じ）。女の子別の料金はサーバーがその子の金額で計算する。
  //   ・2人目からは「◯◯（お連れ様）」・電話番号なし（顧客台帳には代表の方だけ結ぶ＝利用回数が人数分ふえない）。
  //   ・予約は1件ずつ別々（あとからの変更・キャンセルも1件ずつ）。DB は変えていない。
  const [party, setParty] = useState(1);
  const [comps, setComps] = useState<Array<{ tKey: string; nomId: string }>>([]);
  const setPartySize = (n: number) => {
    setParty(n);
    setComps((prev) => Array.from({ length: Math.max(0, n - 1) }, (_, i) => prev[i] ?? { tKey: '', nomId: '' }));
  };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [found, setFound] = useState<CrmScheduleCustomer | null | 'none'>(null); // null＝まだ引いていない
  // ★ 第1325便: その電話番号が、グループ・提携店の共有リストに当たった分（★ 自店の台帳にいない、初めての電話でも当たる）
  const [group, setGroup] = useState<{ hits: CrmGroupHit[]; failed: boolean }>({ hits: [], failed: false });
  const [lookupErr, setLookupErr] = useState(''); // ★ 2026-10-09 点検#18: 台帳を引けなかったとき
  // ★ かんたん受付（第640便・カッキーさんの指示）。風俗CTIv2 でアイリス様が「時間メモ」に時刻・金額・名前だけ書いて回していたのに合わせる。
  //   ★ 新規のときだけ。出すのは 電話・名前・担当・開始・時間・料金・女子報酬・備考。コース・料金表・インターバルは隠す（既定のまま）。
  //   ★ 料金・女子報酬は「補正」の欄に入れる（料金表の項目を選ばない＝合計＝入れた数字）。あとから詳細の「変更する」で料金表から選び直せる。
  //   ★ どちらで開くかはこの端末で覚える（crm_form_quick）。
  const [quick, setQuick] = useState<boolean>(() => {
    if (initial.mode !== 'new') return false;
    try { return localStorage.getItem('crm_form_quick') !== '0'; } catch { return true; }
  });
  const switchQuick = (v: boolean) => {
    setQuick(v);
    try { localStorage.setItem('crm_form_quick', v ? '1' : '0'); } catch { /* 何もしない */ }
  };
  const set = <K extends keyof BookingFormState>(k: K, v: BookingFormState[K]) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  // 電話番号を入れたら台帳を引く（0.4秒止まったら）
  const telDigits = f.customerTel.replace(/[^0-9０-９]/g, '');
  useEffect(() => {
    if (telDigits.length < 10) return;
    let alive = true;
    const t = setTimeout(() => {
      // ★ 2026-10-09 点検#18: 引けなかったときは無言にしない（NG・要注意が出ないまま受け付けてしまう）
      safeCall(() => lookupCrmCustomerByPhone(salonId, f.customerTel)).then((res) => {
        if (!alive) return;
        if (!res.ok) { setLookupErr('台帳を引けませんでした（NG・要注意の印が出ません）'); return; }
        setLookupErr('');
        setFound(res.customer ?? 'none');
        setGroup({ hits: res.groupHits, failed: res.groupFailed });
        const c = res.customer;
        if (c?.name) setF((p) => (p.customerName.trim() ? p : { ...p, customerName: c.name }));
      });
    }, 400);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telDigits, salonId]);

  const customer = found && found !== 'none' && telDigits.length >= 10 ? found : null;
  // ★ 同じお客様（台帳の人 or 同じ電話番号）が、この日すでに予約を持っていないか。
  //   第531便の確認で「変更」のつもりが新しい受付になり、同じ人の予約が2本になった（2026-09-19）。
  const telKey = telDigits.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const sameDay = dayBookings.filter((b) =>
    b.id !== f.bookingId &&
    b.status !== 'cancelled' &&
    ((customer && b.customer?.id === customer.id) ||
      (telKey.length >= 10 && b.customerTel.replace(/[^0-9]/g, '') === telKey)),
  );
  const tid = f.therapistKey === 'free' ? null : Number(f.therapistKey);
  const ng = tid != null && (customer?.ngTherapistIds.includes(tid) ?? false);

  // ── 料金と報酬 ──
  const selItems: CrmBookingItem[] = f.selIds
    .map((id) => priceItems.find((p) => p.id === id))
    .filter((p): p is CrmPriceItem => !!p)
    // ★ 第1782便: 担当の女の子に個別の料金があれば、その金額（保存のときはサーバーが同じ計算をする）
    .map((p) => { const e = priceForTherapist(p, tid); return { kind: p.kind, name: p.name, minutes: p.minutes, price: e.price, pay: e.pay, priceItemId: p.id }; });
  // ★ 第1782便: この女の子の個別の料金が料金表にあるか（「◯◯さんの料金で計算しています」を出す）
  const customPricing = tid != null && priceItems.some((p) => priceForTherapist(p, tid).custom);
  const tName = tid != null ? therapists.find((t) => t.id === tid)?.name ?? '' : '';
  const allItems = [...selItems, ...f.keepItems];
  const sums = sumCrmItems(allItems);
  const priceAdj = Math.round(Number(f.priceAdjust) || 0);
  const payAdj = Math.round(Number(f.payAdjust) || 0);
  const hasPricing = allItems.length > 0 || priceAdj !== 0 || payAdj !== 0;
  // ★ 第1363便: 支払いの内訳（金額の入った方法だけ）。合計が料金と違えば赤字（サーバーでも止める）
  const paySplit = CRM_PAYMENT_METHODS
    .map((m) => ({ method: m, amount: Math.round(Number(f.payAmounts[m]) || 0) }))
    .filter((s) => s.amount > 0);
  const paySum = paySplit.reduce((a, s) => a + s.amount, 0);
  const payMismatch = paySplit.length > 0 && hasPricing && paySum !== sums.price + priceAdj;
  // ★ 第1454便: このご予約でお客様が使ったフクエスポイント（円）
  const formPointsYen = initial.bookingId ? (dayBookings.find((x) => x.id === initial.bookingId)?.pointsYen ?? 0) : 0;
  const setPayAmount = (m: string, v: string) => setF((p) => ({ ...p, paymentMethod: '', payAmounts: { ...p.payAmounts, [m]: v.replace(/[^0-9]/g, '') } }));
  const setPayAll = (m: string) => setF((p) => ({ ...p, paymentMethod: '', payAmounts: { [m]: String(Math.max(0, sums.price + priceAdj)) } }));

  /** 項目を押した：コース・指名は入れ替え、他は付け外し。コース・延長を選んだら時間とコース名も合わせる */
  // ★ 第1441便（店舗様の要望）: かんたん受付の割引は【1つだけ】選ぶ（-1,000〜-5,000 から1つ）。押し直すと外れる。
  //   ★ くわしく入れるほうは今までどおり、いくつでも（CRM_PRICE_SINGLE.discount は false のまま）。
  const pickQuickDiscount = (p: CrmPriceItem) => {
    setF((prev) => {
      const discountIds = priceItems.filter((x) => x.kind === 'discount').map((x) => x.id);
      const on = prev.selIds.includes(p.id);
      const ids = prev.selIds.filter((id) => !discountIds.includes(id));
      return { ...prev, selIds: on ? ids : [...ids, p.id] };
    });
  };
  const togglePrice = (p: CrmPriceItem) => {
    setF((prev) => {
      let ids = prev.selIds;
      let keep = prev.keepItems;
      if (CRM_PRICE_SINGLE[p.kind]) {
        const others = priceItems.filter((x) => x.kind === p.kind).map((x) => x.id);
        const on = ids.includes(p.id);
        ids = ids.filter((id) => !others.includes(id));
        keep = keep.filter((k) => k.kind !== p.kind);
        if (!on) ids = [...ids, p.id];
      } else {
        ids = ids.includes(p.id) ? ids.filter((id) => id !== p.id) : [...ids, p.id];
      }
      const next = { ...prev, selIds: ids, keepItems: keep };
      const course = priceItems.find((x) => x.kind === 'course' && ids.includes(x.id));
      if (course) {
        const ext = priceItems.filter((x) => x.kind === 'extension' && ids.includes(x.id)).reduce((a, x) => a + x.minutes, 0)
          + keep.filter((k) => k.kind === 'extension').reduce((a, k) => a + k.minutes, 0);
        if (course.minutes > 0) next.courseMin = course.minutes + ext;
        next.courseName = course.name;
      }
      return next;
    });
  };

  // 開始時刻の候補（6:00〜翌6:55）
  const hourOptions: number[] = [];
  for (let h = 6; h <= 30; h++) hourOptions.push(h);
  const startH = Math.floor(f.startMin / 60);
  const startM = f.startMin % 60;
  const durationOptions: number[] = [];
  for (let m = 15; m <= 360; m += 5) durationOptions.push(m);
  if (!durationOptions.includes(f.courseMin)) durationOptions.push(f.courseMin);
  durationOptions.sort((a, b) => a - b);

  const endLabel = (() => {
    const e = f.startMin + f.courseMin;
    const h = Math.floor(e / 60);
    return `${h >= 24 ? `翌${h - 24}` : h}:${String(e % 60).padStart(2, '0')}`;
  })();

  // ★ かんたん受付（第645便 → 第646便で変更・カッキーさんの指示）：料金・女子報酬の欄は「指名を除いた額」。
  //   入れた数字がそのまま補正に入り、指名の料金はその上に足される（10,000 と入れて本指名1,000 → 料金 11,000）。
  //   ★ 電話口では「コース料金＋指名料」と分けて言うので、その感覚に合わせた。
  const savePricing = (bookingId: string) =>
    setCrmBookingPricing({
      salonId,
      bookingId,
      priceItemIds: f.selIds,
      keepItems: f.keepItems,
      priceAdjust: priceAdj,
      payAdjust: payAdj,
      paymentMethod: paySplit.length === 0 ? f.paymentMethod : '',
      paymentSplit: paySplit,
    });

  const submit = async () => {
    // ★ 第1787便: グループ（2名様以上）の確かめ（担当が選ばれているか・同じ担当が重なっていないか）
    if (f.mode === 'new' && party > 1) {
      if (comps.some((c) => !c.tKey)) { setErr('2人目からの担当を全部選んでください'); return; }
      const keys = [f.therapistKey, ...comps.map((c) => c.tKey)].filter((k) => k !== 'free');
      if (new Set(keys).size !== keys.length) { setErr('同じ担当が重なっています（1人に1人の担当を選んでください）'); return; }
      // ★ 第1789便: フリーは同じ時間に3件まで（すでに入っているフリーの予約はサーバーが数える）
      const frees = [f.therapistKey, ...comps.map((c) => c.tKey)].filter((k) => k === 'free').length;
      if (frees > FREE_LANE_MAX) { setErr(`フリー（担当未定）は同じ時間に${FREE_LANE_MAX}件までです。${frees - FREE_LANE_MAX}人は担当を選んでください`); return; }
    }
    // ★ 第1672便（カッキーさん）: 開始を押した所が空いていても、コースの終わりが提携店の予約にかかることがある
    //   （例: ラビで20:00から予約があるのに、enju で19:00から90分）。保存の前に、開始〜終わり（インターバル込み）で見て一度だけ確認する。止めはしない
    if (tid != null) {
      const s0 = f.startMin, e0 = f.startMin + f.courseMin + (f.intervalMin || 0);
      const hit = roomBandsOf(tid).find((bd) => {
        const bs = Math.round((new Date(bd.startISO).getTime() - baseMs) / 60000);
        const be = Math.round((new Date(bd.endISO).getTime() - baseMs) / 60000);
        return s0 < be && e0 > bs;
      });
      if (hit) {
        const hm = (m: number) => `${m >= 1440 ? '翌' : ''}${Math.floor(m / 60) % 24}:${String(m % 60).padStart(2, '0')}`;
        const bs = Math.round((new Date(hit.startISO).getTime() - baseMs) / 60000);
        const be = Math.round((new Date(hit.endISO).getTime() - baseMs) / 60000);
        if (!(await appConfirm(`この予約（${hm(s0)}〜${hm(e0)}）は、${hit.room} の ${hit.salonName} の予約（${hm(bs)}〜${hm(be)}）と重なります。このまま保存しますか？`, { ok: '保存する' }))) return;
      }
    }
    setBusy(true);
    setErr('');
    const slotStartISO = new Date(baseMs + f.startMin * 60000).toISOString();
    if (f.mode === 'new') {
      const res = await safeCall(() => createManualBooking({
        salonId,
        therapistId: tid,
        slotStartISO,
        durationMin: f.courseMin,
        intervalMin: f.intervalMin,
        courseName: f.courseName,
        customerName: f.customerName,
        customerTel: f.customerTel,
        note: f.note,
      }));
      if (!res.ok) { setBusy(false); setErr(res.error ?? '保存できませんでした'); return; }
      if (hasPricing || f.paymentMethod || paySplit.length > 0) {
        const newId = res.bookingId;
        if (!newId) { setBusy(false); setErr('予約は入りましたが、料金を保存できませんでした（カードを押して「変更する」から入れてください）'); return; }
        const pr = await safeCall(() => savePricing(newId));
        if (!pr.ok) {
          // ★ 2026-10-09 点検#17: 予約はもう入っている。フォームを「変更」に切り替え、もう一度押すと料金だけ保存する（前は new のまま → 再送で「既に予約が入っています」）
          setF((p) => ({ ...p, mode: 'edit', bookingId: newId, origTherapistKey: p.therapistKey, origStartMin: p.startMin, origSpan: p.courseMin + p.intervalMin }));
          setBusy(false);
          setErr(`予約は入りました。料金だけ保存できませんでした：${pr.error}（もう一度「保存」を押すと料金だけ保存します）`);
          return;
        }
      }
      // ★ 第1787便: 2人目から（お連れ様）。1件ずつ入れて、入らなかった人は名前を並べて知らせる（入った分は残す）
      if (party > 1) {
        const nomIds = new Set(priceItems.filter((p) => p.kind === 'nomination').map((p) => p.id));
        const mainNom = f.selIds.find((id) => nomIds.has(id));
        const baseIds = f.selIds.filter((id) => !nomIds.has(id));
        const compMethod = paySplit.length === 1 ? paySplit[0].method : paySplit.length === 0 ? f.paymentMethod : '';
        const failed: string[] = [];
        for (let i = 0; i < comps.length; i++) {
          const c = comps[i];
          const ctid = c.tKey === 'free' ? null : Number(c.tKey);
          const who = `${i + 2}人目（${ctid == null ? 'フリー' : therapists.find((t) => t.id === ctid)?.name ?? ''}）`;
          const r = await safeCall(() => createManualBooking({
            salonId,
            therapistId: ctid,
            slotStartISO,
            durationMin: f.courseMin,
            intervalMin: f.intervalMin,
            courseName: f.courseName,
            customerName: `${f.customerName.trim()}（お連れ様）`.slice(0, 40),
            customerTel: '',
            note: f.note,
          }));
          if (!r.ok || !r.bookingId) { failed.push(`${who}：${r.error ?? '入れられませんでした'}`); continue; }
          const nom = c.nomId ? Number(c.nomId) : mainNom;
          const ids = nom != null ? [...baseIds, nom] : baseIds;
          if (ids.length > 0 || priceAdj !== 0 || payAdj !== 0 || compMethod) {
            const newId = r.bookingId;
            const pr = await safeCall(() => setCrmBookingPricing({
              salonId, bookingId: newId, priceItemIds: ids, keepItems: [],
              priceAdjust: priceAdj, payAdjust: payAdj, paymentMethod: compMethod, paymentSplit: [],
            }));
            if (!pr.ok) failed.push(`${who}：予約は入りました。料金だけ保存できませんでした（${pr.error}）`);
          }
        }
        if (failed.length > 0) {
          setBusy(false);
          setErr(`1人目の予約は入りました。次の方は入れられませんでした：\n${failed.join('\n')}`);
          // ★ 1人目はもう入っているので、もう一度押して二重にならないように閉じる準備（画面は読み直す）
          setParty(1); setComps([]);
          setF((p) => ({ ...p, mode: 'edit', bookingId: res.bookingId, origTherapistKey: p.therapistKey, origStartMin: p.startMin, origSpan: p.courseMin + p.intervalMin }));
          onSavedKeepOpen?.();
          return;
        }
      }
      setBusy(false);
      onSaved();
      return;
    }
    // 変更：移動（担当・開始）と内容（コース・インターバル・名前など）は別の処理。
    // ★ 2026-10-09 点検#16: 移動は【今の枠の長さ】で重なりを見るので、枠が縮む変更（90→60分）を伴う移動は、先に内容（縮める）→ 移動。
    //   枠が伸びる変更は今までどおり 移動 → 内容（内容の側が新しい長さで重なりを見る）。
    //   どちらも、片方だけ成功したときは「何が変わって何が残っているか」を文で出し、フォームの orig を進めて再送で二重に動かさない。
    const moved = f.therapistKey !== f.origTherapistKey || f.startMin !== f.origStartMin;
    const newSpan = f.courseMin + f.intervalMin;
    const shrink = f.origSpan != null && newSpan < f.origSpan;
    const details = () => safeCall(() => updateBookingDetails({
      bookingId: f.bookingId!,
      courseName: f.courseName,
      courseMin: f.courseMin,
      intervalMin: f.intervalMin,
      customerName: f.customerName,
      customerTel: f.customerTel,
      note: f.note,
    }));
    const move = () => safeCall(() => moveBooking(f.bookingId!, tid, slotStartISO));
    if (moved && shrink) {
      const up = await details();
      if (!up.ok) { setBusy(false); setErr(up.error ?? '保存できませんでした'); return; }
      setF((p) => ({ ...p, origSpan: newSpan }));
      const mv = await move();
      if (!mv.ok) { setBusy(false); setErr(`内容（時間・名前など）は保存しました。移動だけできませんでした：${mv.error ?? ''}`); return; }
      setF((p) => ({ ...p, origTherapistKey: p.therapistKey, origStartMin: p.startMin }));
    } else {
      if (moved) {
        const mv = await move();
        if (!mv.ok) { setBusy(false); setErr(mv.error ?? '移動できませんでした'); return; }
        setF((p) => ({ ...p, origTherapistKey: p.therapistKey, origStartMin: p.startMin }));
      }
      const up = await details();
      if (!up.ok) {
        setBusy(false);
        setErr(moved ? `時間・担当は変わりました。内容の保存だけできませんでした：${up.error ?? ''}（もう一度「保存」）` : (up.error ?? '保存できませんでした'));
        return;
      }
      setF((p) => ({ ...p, origSpan: newSpan }));
    }
    const pr = await safeCall(() => savePricing(f.bookingId!));
    setBusy(false);
    if (!pr.ok) { setErr(`料金を保存できませんでした：${pr.error}`); return; }
    onSaved();
  };

  return (
    <>
      {/* ★ 受付フォームは画面の中央に出す（2026-09-19・カッキーさんの指示）。詳細も同日に中央へ。 */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={busy ? undefined : onClose} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3">
      <aside ref={dlgRef} role="dialog" aria-modal="true" aria-label={f.mode === 'new' ? '予約を受け付ける' : '予約を変更する'} tabIndex={-1} style={drag.style} className="pointer-events-auto flex max-h-[92dvh] w-full max-w-[560px] flex-col bg-white shadow-2xl outline-none">
        <div {...drag.handle} className={`flex items-center bg-[#3f51b5] px-4 py-2.5 text-white ${drag.handleCls}`}>
          <span className="text-[15px] font-black">{f.mode === 'new' ? (quick ? 'かんたん受付' : '予約を受け付ける') : '予約を変更する'}</span>
          {f.mode === 'new' && (
            <button type="button" onClick={() => switchQuick(!quick)} className="ml-3 border border-white/60 px-2 py-0.5 text-[12px] font-bold">
              {quick ? 'くわしく入れる' : 'かんたんにする'}
            </button>
          )}
          <button type="button" onClick={onClose} className="ml-auto px-2 text-[20px] font-bold" aria-label="閉じる">×</button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* お客様（電話 → 台帳） */}
          <div>
            <label className={labCls}>電話番号（入れると台帳からお客様を出します）</label>
            <input className={fieldCls} value={f.customerTel} inputMode="tel" autoComplete="tel" autoFocus={f.mode === 'new'} onChange={(e) => { set('customerTel', e.target.value); setFound(null); setGroup({ hits: [], failed: false }); }} placeholder="090-1234-5678" />
            {lookupErr && <p className="mt-1 text-[12px] font-bold text-rose-600">{lookupErr}</p>}
            {telDigits.length >= 10 && found === 'none' && (
              <p className="mt-1 text-[12px] text-slate-500">台帳にない番号です（新しいお客様として台帳に入ります）</p>
            )}
            {sameDay.length > 0 && (
              <div className="mt-2 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-800">
                このお客様は、この日すでに予約があります：
                {sameDay.map((b) => {
                  const t = b.therapistId == null ? 'フリー' : therapists.find((x) => x.id === b.therapistId)?.name ?? '';
                  return <span key={b.id} className="ml-1">{hm(b.slotStartISO)}〜 {t}</span>;
                })}
                {f.mode === 'new' && <p className="mt-1 text-[12px] font-normal">時間や担当を変えたいときは、その予約のカードを押して「変更する」を使ってください。</p>}
              </div>
            )}
            {customer && (
              <div className="mt-2 border border-indigo-200 bg-indigo-50 p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`border px-1.5 py-0.5 text-[11px] font-bold leading-none ${CRM_CATEGORY_CLASS[customer.category]}`}>{CRM_CATEGORY_LABEL[customer.category]}</span>
                  <span className="text-[15px] font-black text-slate-800">{customer.name || '(名前なし)'}</span>
                  <span className="text-[12px] text-slate-500">
                    利用{customer.stats.visits}・予約中{customer.stats.upcoming}・ｷｬﾝｾﾙ{customer.stats.cancels}
                    {customer.stats.badCancels > 0 && <span className="font-bold text-rose-600">（悪質{customer.stats.badCancels}）</span>}
                  </span>
                </div>
                {customer.cautionMemo && <p className="mt-1.5 whitespace-pre-line text-[13px] font-bold text-rose-700">要注意：{customer.cautionMemo}</p>}
                {customer.category === 'ng' && <p className="mt-1.5 bg-rose-600 px-2 py-1 text-[13px] font-bold text-white">このお客様は「出禁」です</p>}
              </div>
            )}
            {/* ★ 第1325便: グループ・提携店の共有リストに当たったとき（★ 出すだけ。受付は止めない） */}
            {telDigits.length >= 10 && <GroupHitBand hits={group.hits} failed={group.failed} className="mt-2" />}
          </div>
          <div>
            <label className={labCls}>お客様の名前 <span className="text-rose-500">必須</span>{f.mode === 'new' && <span className="ml-2 font-normal text-slate-400">2名様以上は右の人数で</span>}</label>
            <div className="flex gap-2">
              <input className={fieldCls} value={f.customerName} maxLength={40} onChange={(e) => set('customerName', e.target.value)} />
              {/* ★ 第1787便: 人数（新しい受付のときだけ） */}
              {f.mode === 'new' && (
                <select className={`${fieldCls} !w-[96px] flex-none`} value={party} onChange={(e) => setPartySize(Number(e.target.value))} aria-label="人数">
                  {Array.from({ length: PARTY_MAX }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}名</option>)}
                </select>
              )}
            </div>
          </div>

          {/* 担当と時間 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labCls}>担当</label>
              <select className={fieldCls} value={f.therapistKey} onChange={(e) => set('therapistKey', e.target.value)}>
                {/* ★ フリー（担当未定）は選べない（第553便）。前に入れた担当未定の予約を直すときだけ出す */}
                {initial.therapistKey === 'free' && <option value="free">フリー（担当未定）</option>}
                {therapists.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.name}{customer?.ngTherapistIds.includes(t.id) ? '（女子NG）' : ''}
                  </option>
                ))}
              </select>
              {ng && <p className="mt-1 bg-rose-600 px-2 py-1 text-[13px] font-bold text-white">この担当は、このお客様の女子NGです</p>}
            </div>
            {/* ★ 第1787便: 2人目からの担当と指名（指名の空欄は1人目と同じ） */}
            {f.mode === 'new' && party > 1 && (
              <div className="col-span-2 space-y-1.5 border border-indigo-200 bg-indigo-50/40 p-2.5">
                <p className="text-[12px] font-bold text-slate-600">{party}名様：2人目からの担当を選んでください（時間・コース・料金は1人目と同じ。名前は「{f.customerName.trim() || 'お客様'}（お連れ様）」で入ります）</p>
                {comps.map((c, i) => {
                  // ★ 第1789便: フリー（担当未定）は何人選んでも「重なり」にしない（同じ時間に3件まで・サーバーで数える）
                  const dup = c.tKey !== '' && c.tKey !== 'free' && (c.tKey === f.therapistKey || comps.some((o, j) => j !== i && o.tKey === c.tKey));
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-1.5">
                      <span className="w-[52px] flex-none text-[12px] font-bold text-slate-500">{i + 2}人目</span>
                      <select className={`${fieldCls} !w-auto min-w-[140px] flex-1`} value={c.tKey}
                        onChange={(e) => setComps((p) => p.map((x, j) => (j === i ? { ...x, tKey: e.target.value } : x)))}>
                        <option value="">担当を選ぶ</option>
                        {/* ★ 第1789便（カッキーさん・A案）: お連れ様もフリー（担当未定）で受けられる。フリーは同じ時間に3件まで */}
                        <option value="free">フリー（担当未定）</option>
                        {therapists.map((t) => (
                          <option key={t.id} value={String(t.id)}>{t.name}{customer?.ngTherapistIds.includes(t.id) ? '（女子NG）' : ''}</option>
                        ))}
                      </select>
                      {priceItems.some((p) => p.kind === 'nomination') && (
                        <select className={`${fieldCls} !w-auto min-w-[130px]`} value={c.nomId} aria-label={`${i + 2}人目の指名`}
                          onChange={(e) => setComps((p) => p.map((x, j) => (j === i ? { ...x, nomId: e.target.value } : x)))}>
                          <option value="">指名：1人目と同じ</option>
                          {priceItems.filter((p) => p.kind === 'nomination').map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
                        </select>
                      )}
                      {dup && <span className="text-[12px] font-bold text-rose-600">同じ担当が重なっています</span>}
                    </div>
                  );
                })}
              </div>
            )}
            <div>
              <label className={labCls}>開始</label>
              <div className="flex gap-1">
                <select className={fieldCls} value={startH} onChange={(e) => set('startMin', Number(e.target.value) * 60 + startM)}>
                  {hourOptions.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                </select>
                <select className={fieldCls} value={startM - (startM % FORM_STEP_MIN)} onChange={(e) => set('startMin', startH * 60 + Number(e.target.value))}>
                  {Array.from({ length: 60 / FORM_STEP_MIN }, (_, i) => i * FORM_STEP_MIN).map((m) => (
                    <option key={m} value={m}>{String(m).padStart(2, '0')}分</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labCls}>時間（終わり {endLabel}）</label>
              <select
                className={fieldCls}
                value={f.courseMin}
                onChange={(e) => {
                  const m = Number(e.target.value);
                  // ★ かんたん受付では、時間に合うコース名を自動で付ける（合うものが無ければ「電話予約」）（第640便）
                  if (quick) {
                    const c = courses.find((x) => x.durationMin === m);
                    setF((p) => ({ ...p, courseMin: m, courseName: c?.name ?? '' }));
                  } else set('courseMin', m);
                }}
              >
                {durationOptions.map((m) => <option key={m} value={m}>{m}分</option>)}
              </select>
            </div>
          </div>

          {/* かんたん受付：料金と女子報酬を数字だけ（第640便） */}
          {quick && (
            <div className="grid grid-cols-2 gap-3">
              {/* ★ 指名だけは押してもらう（第645便）：レポートの「指名別」に乗るように。料金表の「指名」の項目を並べる */}
              {priceItems.some((p) => p.kind === 'nomination') && (
                <div className="col-span-2">
                  <label className={labCls}>指名（1つ押す）</label>
                  <div className="flex flex-wrap gap-1.5">
                    {priceItems.filter((p) => p.kind === 'nomination').map((p) => {
                      const on = f.selIds.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => togglePrice(p)}
                          className={`border px-3 py-1.5 text-[13px] font-bold ${on ? 'border-[#3f51b5] bg-[#3f51b5] text-white' : 'border-slate-300 bg-white text-slate-700'}`}
                        >
                          {p.name}{priceForTherapist(p, tid).price ? <span className={on ? 'text-indigo-100' : 'text-slate-400'}> {priceForTherapist(p, tid).price.toLocaleString()}</span> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* ★ 第1441便（店舗様の要望）: 割引も押して選ぶ（料金設定の「割引」の項目。1つだけ） */}
              {priceItems.some((p) => p.kind === 'discount') && (
                <div className="col-span-2">
                  <label className={labCls}>割引（1つ押す）</label>
                  <div className="flex flex-wrap gap-1.5">
                    {/* ★ 第1442便（カッキーさん）: 「なし」のボタン。割引を1つも選んでいないときは押された見た目。押すと割引を外す */}
                    {(() => {
                      const discountIds = priceItems.filter((x) => x.kind === 'discount').map((x) => x.id);
                      const none = !f.selIds.some((id) => discountIds.includes(id));
                      return (
                        <button
                          type="button"
                          onClick={() => setF((prev) => ({ ...prev, selIds: prev.selIds.filter((id) => !discountIds.includes(id)) }))}
                          className={`border px-3 py-1.5 text-[13px] font-bold ${none ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'}`}
                        >
                          なし
                        </button>
                      );
                    })()}
                    {priceItems.filter((p) => p.kind === 'discount').map((p) => {
                      const on = f.selIds.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => pickQuickDiscount(p)}
                          className={`border px-3 py-1.5 text-[13px] font-bold ${on ? 'border-rose-600 bg-rose-600 text-white' : 'border-slate-300 bg-white text-slate-700'}`}
                        >
                          {p.name}<span className={on ? 'text-rose-100' : 'text-slate-400'}> -{priceForTherapist(p, tid).price.toLocaleString()}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <label className={labCls}>料金（円・指名を除く）</label>
                <input className={fieldCls} inputMode="numeric" value={f.priceAdjust} onChange={(e) => set('priceAdjust', e.target.value.replace(/[^0-9]/g, ''))} placeholder="例）16000" />
              </div>
              <div>
                <label className={labCls}>女子報酬（円・指名を除く）</label>
                <input className={fieldCls} inputMode="numeric" value={f.payAdjust} onChange={(e) => set('payAdjust', e.target.value.replace(/[^0-9]/g, ''))} placeholder="空欄だと 0円で入ります" />
                {/* ★ 2026-10-09 点検#15: 料金だけ入れて報酬が空だと、報酬 0円が【確定値】として入る（日報・金銭授受に乗る）。見えるようにする */}
                {priceAdj > 0 && sums.pay + payAdj === 0 && <p className="mt-0.5 text-[11px] font-bold text-amber-700">女子報酬が 0円で入ります</p>}
              </div>
              <p className="col-span-2 -mt-1 text-[12px] text-slate-500">
                {allItems.length > 0
                  ? `${allItems.some((it) => it.kind === 'discount') ? '指名・割引' : '指名'}の分（料金 ${sums.price.toLocaleString()}円・報酬 ${sums.pay.toLocaleString()}円）をこの数字に足し引きします → 料金 ${(sums.price + priceAdj).toLocaleString()}円・女子報酬 ${(sums.pay + payAdj).toLocaleString()}円`
                  : '指名を押すと、その料金がこの上に足されます。'}
                コースなどは、あとでカードを押して「変更する」から料金表で選び直せます。
              </p>
            </div>
          )}

          {/* 料金と報酬（料金表から選ぶ） */}
          {quick ? null : priceItems.length > 0 ? (
            <div className="border border-indigo-200 bg-indigo-50/40 p-3">
              <p className="mb-2 text-[13px] font-black text-slate-700">料金（押して選ぶ）</p>
              {/* ★ 第1782便: 女の子別の料金を使っているとき */}
              {customPricing && <p className="-mt-1 mb-2 text-[12px] font-bold text-emerald-700">{tName || 'この女子'}さんの料金で計算しています</p>}
              {CRM_PRICE_KINDS.map((kind) => {
                const list = priceItems.filter((p) => p.kind === kind);
                const kept = f.keepItems.filter((k) => k.kind === kind);
                if (list.length === 0 && kept.length === 0) return null;
                return (
                  <div key={kind} className="mb-2">
                    <p className="mb-1 text-[11px] font-bold text-slate-500">{CRM_PRICE_KIND_LABEL[kind]}{CRM_PRICE_SINGLE[kind] ? '（1つ）' : ''}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {list.map((p) => {
                        const on = f.selIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => togglePrice(p)}
                            className={`border px-2 py-1 text-[12px] font-bold ${on ? 'border-[#3f51b5] bg-[#3f51b5] text-white' : 'border-slate-300 bg-white text-slate-700'}`}
                          >
                            {p.name}{p.minutes && kind !== 'discount' ? ` ${p.minutes}分` : ''}
                            <span className={on ? 'text-indigo-100' : 'text-slate-400'}> {kind === 'discount' ? '-' : ''}{priceForTherapist(p, tid).price.toLocaleString()}</span>
                          </button>
                        );
                      })}
                      {kept.map((k, i) => (
                        <button
                          key={`keep-${i}`}
                          type="button"
                          title="料金表にもう無い項目です（押すと外します）"
                          onClick={() => setF((prev) => ({ ...prev, keepItems: prev.keepItems.filter((x) => x !== k) }))}
                          className="border border-amber-400 bg-amber-50 px-2 py-1 text-[12px] font-bold text-amber-800"
                        >
                          {k.name} {k.kind === 'discount' ? '-' : ''}{k.price.toLocaleString()} ×
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <label className={labCls}>料金補正（±円）</label>
                  <input className={fieldCls} inputMode="numeric" value={f.priceAdjust} onChange={(e) => set('priceAdjust', e.target.value.replace(/[^0-9-]/g, ''))} placeholder="0" />
                </div>
                <div>
                  <label className={labCls}>報酬補正（±円）</label>
                  <input className={fieldCls} inputMode="numeric" value={f.payAdjust} onChange={(e) => set('payAdjust', e.target.value.replace(/[^0-9-]/g, ''))} placeholder="0" />
                </div>
              </div>
              {/* ★ 第1363便（店舗様の要望）: 支払いは方法ごとの金額欄に（カード 20,000＋現金 5,000 のように分けられる）。
                  「全額を…」を押すと料金の全額がその欄に入る（＝前のプルダウンと同じ1タップ）。合計が料金と違えば赤字 */}
              <div className="mt-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`${labCls} mb-0`}>支払い</span>
                  <span className="text-[11px] text-slate-400">全額を：</span>
                  {CRM_PAYMENT_METHODS.map((m) => (
                    <button key={m} type="button" onClick={() => setPayAll(m)} className="border border-slate-300 bg-white px-2 py-0.5 text-[12px] font-bold text-slate-700 hover:bg-indigo-50">{m}</button>
                  ))}
                  {(paySplit.length > 0 || f.paymentMethod) && (
                    <button type="button" onClick={() => setF((p) => ({ ...p, paymentMethod: '', payAmounts: {} }))} className="text-[11px] font-bold text-slate-400 underline">消す</button>
                  )}
                </div>
                <div className="mt-1 grid grid-cols-4 gap-2">
                  {CRM_PAYMENT_METHODS.map((m) => (
                    <label key={m} className="block">
                      <span className="block text-[10px] font-bold text-slate-400">{m}</span>
                      <input className={fieldCls} inputMode="numeric" value={f.payAmounts[m] ?? ''} onChange={(e) => setPayAmount(m, e.target.value)} placeholder="0" aria-label={`${m}で払った金額`} />
                    </label>
                  ))}
                </div>
                {payMismatch && (
                  <p className="mt-1 text-[12px] font-bold text-rose-600">支払いの合計 {yen(paySum)} が料金 {yen(sums.price + priceAdj)} と合いません</p>
                )}
                {f.paymentMethod && paySplit.length === 0 && (
                  <p className="mt-1 text-[11px] text-slate-500">いまの支払い：{f.paymentMethod}（金額欄に入れ直すと内訳になります）</p>
                )}
                {formPointsYen > 0 && (
                  <p className="mt-1 border-l-4 border-orange-400 bg-orange-50 px-2 py-1 text-[12px] font-bold leading-relaxed text-orange-800">
                    このご予約はフクエスポイント −{formPointsYen.toLocaleString()}円（フクエス負担）。支払いは料金の全額で入れてください（お客様から受け取るのは{hasPricing ? ` ${yen(Math.max(0, sums.price + priceAdj - formPointsYen))}` : `料金 −${formPointsYen.toLocaleString()}円`}。差の分は自動で引きます）。
                  </p>
                )}
              </div>
              <div className="mt-3 flex gap-4 border-t border-indigo-200 pt-2 text-[15px] font-black">
                <span className="text-slate-800">料金 {hasPricing ? yen(sums.price + priceAdj) : '—'}</span>
                <span className="text-[#3f51b5]">女子報酬 {hasPricing ? yen(sums.pay + payAdj) : '—'}</span>
              </div>
            </div>
          ) : (
            <p className="border border-dashed border-slate-300 px-3 py-2 text-[12px] text-slate-500">
              料金表がまだありません。上の「料金設定」で作ると、ここで料金と女子報酬を選べるようになります。
            </p>
          )}

          {/* コース */}
          {!quick && (
          <div>
            <label className={labCls}>コース</label>
            {courses.length > 0 && !priceItems.some((p) => p.kind === 'course') && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {courses.map((c) => (
                  <button
                    key={`${c.name}-${c.durationMin}`}
                    type="button"
                    onClick={() => setF((p) => ({ ...p, courseName: c.name, courseMin: c.durationMin }))}
                    className={`border px-2 py-1 text-[12px] font-bold ${
                      f.courseName === c.name && f.courseMin === c.durationMin
                        ? 'border-[#3f51b5] bg-[#3f51b5] text-white'
                        : 'border-slate-300 bg-white text-slate-600'
                    }`}
                  >
                    {c.name}（{c.durationMin}分{c.price ? `・${c.price}` : ''}）
                  </button>
                ))}
              </div>
            )}
            <input className={fieldCls} value={f.courseName} onChange={(e) => set('courseName', e.target.value)} placeholder="空欄なら「電話予約」" />
          </div>
          )}
          {!quick && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labCls}>インターバル（次の予約まで空ける）</label>
              <select className={fieldCls} value={f.intervalMin} onChange={(e) => set('intervalMin', Number(e.target.value))}>
                {intervalOptionsWith(f.intervalMin).map((m) => <option key={m} value={m}>{m === 0 ? 'なし' : `${m}分`}</option>)}
              </select>
            </div>
          </div>
          )}
          <div>
            <label className={labCls}>備考</label>
            <textarea className={`${fieldCls} min-h-[64px]`} value={f.note} onChange={(e) => set('note', e.target.value)} />
          </div>
        </div>

        <div className="border-t border-slate-200 p-3">
          {err && <p className="mb-2 whitespace-pre-line text-[13px] font-bold text-rose-600">{err}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={busy || !f.customerName.trim() || payMismatch} onClick={submit} className="flex-1 bg-[#3f51b5] py-2.5 text-[15px] font-bold text-white disabled:opacity-50">
              {busy ? '保存中…' : f.mode === 'new' ? 'この内容で受け付ける' : '変更を保存する'}
            </button>
            <button type="button" disabled={busy} onClick={onClose} className="border border-slate-300 bg-white px-4 text-[14px] font-bold text-slate-600">
              やめる
            </button>
          </div>
        </div>
      </aside>
      </div>
    </>
  );
}
