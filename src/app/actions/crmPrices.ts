'use server';

import { dbMessage } from '@/app/lib/crm/dbError';
import { type CrmBookingItem, type CrmPriceItem, priceForTherapist, isFixedNomination, sumCrmItems, type CrmPaymentSplit, CRM_PAYMENT_METHODS, parsePaymentSplit } from '@/app/lib/crm/types';
import { assertCrm, toKind, parseItems, readPriceItems, readFail } from '@/app/lib/crm/server/core';

/** 料金表を全部（使っていないものも）返す（料金設定の画面用） */
export async function listCrmPriceItems(
  salonId: number,
): Promise<{ ok: true; items: CrmPriceItem[] } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  try {
    return { ok: true, items: await readPriceItems(auth.svc, salonId) };
  } catch (e) {
    return readFail(e); // ★ 点検#6
  }
}

export type CrmPriceItemInput = {
  salonId: number;
  id: number | null; // null＝追加
  kind: string;
  name: string;
  minutes: number;
  price: number;
  pay: number;
  sort: number;
  isActive: boolean;
};

export async function saveCrmPriceItem(
  input: CrmPriceItemInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const salonId = Number(input.salonId);
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const kind = toKind(input.kind);
  const name = String(input.name ?? '').trim();
  const num = (v: unknown) => Math.round(Number(v) || 0);
  const minutes = num(input.minutes);
  const price = num(input.price);
  const pay = num(input.pay);
  if (!kind) return { ok: false, error: '種類が不正です' };
  if (!name || name.length > 40) return { ok: false, error: '名前は1〜40文字で入れてください' };
  if (minutes < 0 || minutes > 720) return { ok: false, error: '分数は0〜720で入れてください' };
  if (price < 0 || price > 1000000 || pay < 0 || pay > 1000000) return { ok: false, error: '金額は0〜1,000,000で入れてください' };
  // ★ 固定の指名は名前・種類を変えられない。ほかの項目に同じ名前も付けられない（第546便）
  if (input.id) {
    const { data: cur } = await auth.svc
      .from('crm_price_items').select('kind, name').eq('salon_id', salonId).eq('id', input.id).maybeSingle();
    if (!cur) return { ok: false, error: '項目が見つかりません' };
    const wasFixed = isFixedNomination(String(cur.kind), String(cur.name));
    if (wasFixed && (kind !== cur.kind || name !== cur.name)) {
      return { ok: false, error: `「${cur.name}」は最初から用意されている項目なので、名前は変えられません` };
    }
    if (!wasFixed && isFixedNomination(kind, name)) return { ok: false, error: `「${name}」は最初から用意されています` };
  } else if (isFixedNomination(kind, name)) {
    return { ok: false, error: `「${name}」は最初から用意されています` };
  }
  const row = {
    kind, name, minutes, price, pay,
    sort: num(input.sort),
    is_active: Boolean(input.isActive),
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { data, error } = await auth.svc
      .from('crm_price_items').update(row).eq('salon_id', salonId).eq('id', input.id).select('id');
    if (error) return { ok: false, error: dbMessage(error) };
    if (!data || data.length === 0) return { ok: false, error: '項目が見つかりません' };
  } else {
    const { error } = await auth.svc.from('crm_price_items').insert({ salon_id: salonId, ...row });
    if (error) return { ok: false, error: dbMessage(error) };
  }
  return { ok: true };
}

export async function deleteCrmPriceItem(
  salonId: number,
  id: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const { data: cur, error: curErr } = await auth.svc
    .from('crm_price_items').select('kind, name').eq('salon_id', salonId).eq('id', id).maybeSingle();
  // ★ 第1987便（点検 §3）: 読めなければ消さない（最初から用意されている指名まで消せてしまう）
  if (curErr) return { ok: false, error: '項目を確かめられませんでした。もう一度お試しください' };
  if (cur && isFixedNomination(String(cur.kind), String(cur.name))) {
    return { ok: false, error: '最初から用意されている項目は消せません（要らなければ「使う」を外してください）' };
  }
  // ★ 予約は項目を写して持っているので、消しても過去の予約の金額は変わらない
  const { error } = await auth.svc.from('crm_price_items').delete().eq('salon_id', salonId).eq('id', id);
  if (error) return { ok: false, error: dbMessage(error) };
  return { ok: true };
}

// ── 女の子別の料金（第1782便・2026-11-08・カッキーさん／店舗様のご要望）──────────
// ★ 基本の料金表の項目ごとに、女の子ごとの「料金」「女子報酬」を上書きする（null は基本と同じ）。全部の種類が対象。
// ★ 予約の料金を保存するとき、担当がその女の子なら、こちらの金額で写す（setCrmBookingPricing）。

export type CrmPriceOverrideInput = { priceItemId: number; price: number | null; pay: number | null };

/** その女の子の個別の料金を、まとめて保存する（rows に無い項目は変えない。料金・報酬とも null の項目は消す＝基本に戻す） */
export async function saveCrmPriceOverrides(input: {
  salonId: number;
  therapistId: number;
  rows: CrmPriceOverrideInput[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const salonId = Number(input.salonId);
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;
  const tid = Number(input.therapistId);
  const { data: t } = await svc.from('therapists').select('id').eq('salon_id', salonId).eq('id', tid).maybeSingle();
  if (!t) return { ok: false, error: '女子が見つかりません' };
  const { data: own } = await svc.from('crm_price_items').select('id').eq('salon_id', salonId);
  const ownIds = new Set((own ?? []).map((r) => Number(r.id)));
  const norm = (v: unknown): number | null | 'bad' => {
    if (v == null || v === '') return null;
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 && n <= 1000000 ? n : 'bad';
  };
  const ups: Array<{ salon_id: number; therapist_id: number; price_item_id: number; price: number | null; pay: number | null; updated_at: string }> = [];
  const dels: number[] = [];
  const now = new Date().toISOString();
  for (const r of input.rows ?? []) {
    const pid = Number(r.priceItemId);
    if (!ownIds.has(pid)) return { ok: false, error: '料金表の項目が見つかりません（画面を読み直してください）' };
    const price = norm(r.price);
    const pay = norm(r.pay);
    if (price === 'bad' || pay === 'bad') return { ok: false, error: '金額は0〜1,000,000円の数字で入れてください' };
    if (price == null && pay == null) dels.push(pid);
    else ups.push({ salon_id: salonId, therapist_id: tid, price_item_id: pid, price, pay, updated_at: now });
  }
  if (dels.length > 0) {
    const { error } = await svc.from('crm_price_overrides').delete().eq('salon_id', salonId).eq('therapist_id', tid).in('price_item_id', dels);
    if (error) return { ok: false, error: dbMessage(error) };
  }
  if (ups.length > 0) {
    const { error } = await svc.from('crm_price_overrides').upsert(ups, { onConflict: 'therapist_id,price_item_id' });
    if (error) return { ok: false, error: dbMessage(error) };
  }
  return { ok: true };
}

export type CrmBookingPricingInput = {
  salonId: number;
  bookingId: string;
  /** 料金表から選んだ項目の id（いまの料金表の金額で写す） */
  priceItemIds: number[];
  /** もう料金表に無い（消した・直した）けれど、この予約に残しておく項目（今の予約の中身と同じものだけ受け付ける） */
  keepItems: CrmBookingItem[];
  priceAdjust: number;
  payAdjust: number;
  paymentMethod: string;
  /** ★ 第1363便: 支払いの内訳（方法と金額）。空なら paymentMethod だけ。合計は料金と同じでないと受けない */
  paymentSplit?: CrmPaymentSplit[];
};

/**
 * 予約の料金・報酬を保存する。★ 合計はサーバーで計算する（画面の数字は信用しない）。
 */
export async function setCrmBookingPricing(
  input: CrmBookingPricingInput,
): Promise<{ ok: true; priceTotal: number; payTotal: number } | { ok: false; error: string }> {
  const salonId = Number(input.salonId);
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;

  const { data: b } = await svc
    .from('salon_bookings').select('id, crm_items, therapist_id').eq('salon_id', salonId).eq('id', input.bookingId).maybeSingle();
  if (!b) return { ok: false, error: '予約が見つかりません' };

  let priceItems: CrmPriceItem[];
  try { priceItems = await readPriceItems(svc, salonId); } catch (e) { return readFail(e); } // ★ 点検#6・#7: 料金表を読めなかった回は保存しない
  const byId = new Map(priceItems.map((p) => [p.id, p]));
  // ★ 第1782便: 担当の女の子に個別の料金があれば、その金額で写す（フリーは基本のまま）
  const tid = b.therapist_id == null ? null : Number(b.therapist_id);
  const items: CrmBookingItem[] = [];
  for (const id of input.priceItemIds ?? []) {
    const p = byId.get(Number(id));
    if (!p) return { ok: false, error: '料金表の項目が見つかりません（画面を読み直してください）' };
    const eff = priceForTherapist(p, tid);
    items.push({ kind: p.kind, name: p.name, minutes: p.minutes, price: eff.price, pay: eff.pay, priceItemId: p.id });
  }
  // 残す項目は、今の予約に入っているものと同じときだけ（勝手な金額は入れさせない）
  const current = parseItems(b.crm_items);
  const key = (i: CrmBookingItem) => `${i.kind}|${i.name}|${i.minutes}|${i.price}|${i.pay}`;
  const pool = current.map(key);
  for (const k of input.keepItems ?? []) {
    const idx = pool.indexOf(key(k));
    if (idx < 0) continue;
    pool.splice(idx, 1);
    items.push(current.find((c) => key(c) === key(k))!);
  }
  // コース・指名は1つまで
  for (const kind of ['course', 'nomination'] as const) {
    if (items.filter((i) => i.kind === kind).length > 1) {
      return { ok: false, error: kind === 'course' ? 'コースは1つだけ選んでください' : '指名は1つだけ選んでください' };
    }
  }
  const clamp = (v: unknown) => Math.max(-1000000, Math.min(1000000, Math.round(Number(v) || 0)));
  const priceAdjust = clamp(input.priceAdjust);
  const payAdjust = clamp(input.payAdjust);
  const sum = sumCrmItems(items);
  const hasAny = items.length > 0 || priceAdjust !== 0 || payAdjust !== 0;
  const priceTotal = hasAny ? sum.price + priceAdjust : null;
  const payTotal = hasAny ? sum.pay + payAdjust : null;
  // ★ 第1363便: 支払いの内訳。方法は決まった4つだけ・金額は正の整数・合計は料金と同じ。1つだけなら payment_method にその名前、複数なら「カード＋現金」
  const split = parsePaymentSplit(input.paymentSplit ?? []);
  let paymentMethod = String(input.paymentMethod ?? '').trim().slice(0, 20);
  if (split.length > 0) {
    for (const s of split) {
      if (!(CRM_PAYMENT_METHODS as readonly string[]).includes(s.method)) return { ok: false, error: `支払いの方法が不正です（${s.method}）` };
      if (s.amount > 10000000) return { ok: false, error: '支払いの金額が大きすぎます' };
    }
    if (new Set(split.map((s) => s.method)).size !== split.length) return { ok: false, error: '支払いの方法が重なっています' };
    const splitSum = split.reduce((a, s) => a + s.amount, 0);
    if (priceTotal == null || splitSum !== priceTotal) {
      return { ok: false, error: `支払いの合計（${splitSum.toLocaleString()}円）が料金（${(priceTotal ?? 0).toLocaleString()}円）と合いません` };
    }
    paymentMethod = split.length === 1 ? split[0].method : split.map((s) => s.method).join('＋');
  }

  const { error } = await svc
    .from('salon_bookings')
    .update({
      crm_items: items,
      price_adjust: priceAdjust,
      pay_adjust: payAdjust,
      price_total: priceTotal,
      pay_total: payTotal,
      payment_method: paymentMethod,
      payment_split: split.length > 1 ? split : null, // ★ 1つだけなら内訳は持たない（payment_method で足りる）
    })
    .eq('salon_id', salonId)
    .eq('id', input.bookingId);
  if (error) return { ok: false, error: dbMessage(error) };
  return { ok: true, priceTotal: priceTotal ?? 0, payTotal: payTotal ?? 0 };
}
