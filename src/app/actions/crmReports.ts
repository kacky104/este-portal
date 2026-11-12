'use server';

import { dbMessage } from '@/app/lib/crm/dbError';
import { type CrmDailyReport, CRM_RECEIVED, nominationBadge, CRM_PAYMENT_METHODS, parsePaymentSplit } from '@/app/lib/crm/types';
import { assertCrm, parseItems, readFail, toReport } from '@/app/lib/crm/server/core';

/** 日報の一覧（月ごと・ym は YYYY-MM） */
export async function listCrmReports(
  salonId: number,
  ym: string,
): Promise<{ ok: true; reports: CrmDailyReport[] } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!/^\d{4}-\d{2}$/.test(ym)) return { ok: false, error: '月が不正です' };
  const [y, m] = ym.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const { data, error } = await auth.svc
    .from('crm_daily_reports').select('*')
    .eq('salon_id', salonId)
    .gte('business_date', `${ym}-01`)
    .lt('business_date', `${next}-01`)
    .order('business_date', { ascending: true });
  if (error) return { ok: false, error: dbMessage(error) };
  return { ok: true, reports: (data ?? []).map((r) => toReport(r as Record<string, unknown>)) };
}

// ── レポート（第540便）──────────────────────────────
/**
 * 月のレポート。★ DB は増やさず、その月の営業日（各日 6:00〜翌6:00 に始まる予約）を数える。
 * ★ 売上・報酬は予約の price_total / pay_total（料金を入れていない予約は 0 として数え、件数を unpriced に出す）。
 * ★ 手当は報酬確定（crm_pay_confirms）の allowance を月で足す。
 */
export async function getCrmMonthStats(
  salonId: number,
  ym: string,
): Promise<{ ok: true; stats: import('@/app/lib/crm/types').CrmMonthStats } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!/^\d{4}-\d{2}$/.test(ym)) return { ok: false, error: '月が不正です' };
  const svc = auth.svc;
  const [y, m] = ym.split('-').map(Number);
  const nextYm = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const startMs = new Date(`${ym}-01T06:00:00+09:00`).getTime();
  const endMs = new Date(`${nextYm}-01T06:00:00+09:00`).getTime();

  const { data: rows, error } = await svc
    .from('salon_bookings')
    .select('slot_start, therapist_id, status, cancel_bad, price_total, pay_total, source, customer_id, crm_items, payment_method, payment_split')
    .eq('salon_id', salonId)
    .gte('slot_start', new Date(startMs).toISOString())
    .lt('slot_start', new Date(endMs).toISOString())
    .order('slot_start', { ascending: true })
    .limit(20000);
  if (error) return { ok: false, error: dbMessage(error) };
  const list = rows ?? [];

  const { data: conf, error: confErr } = await svc
    .from('crm_pay_confirms').select('allowance')
    .eq('salon_id', salonId).gte('business_date', `${ym}-01`).lt('business_date', `${nextYm}-01`);
  if (confErr) return readFail(new Error(confErr.message)); // ★ 2026-11-12 点検#8: 読めなかった回に「手当 0円」で出さない
  const allowance = (conf ?? []).reduce((a, c) => a + (Number(c.allowance) || 0), 0);

  // セラピスト名
  const tIds = [...new Set(list.map((b) => b.therapist_id).filter((v) => v != null).map(Number))];
  const tName = new Map<number, string>();
  if (tIds.length > 0) {
    const { data: ts } = await svc.from('therapists').select('id, name').in('id', tIds);
    (ts ?? []).forEach((t) => tName.set(Number(t.id), String(t.name ?? '')));
  }

  type Row = import('@/app/lib/crm/types').CrmStatRow;
  const maps = { day: new Map<string, Row>(), th: new Map<string, Row>(), src: new Map<string, Row>(), hour: new Map<string, Row>(), nom: new Map<string, Row>(), nr: new Map<string, Row>(), pay: new Map<string, Row>() };
  const bump = (map: Map<string, Row>, key: string, label: string, b: { cancelled: boolean; price: number; pay: number }) => {
    const r = map.get(key) ?? { key, label, count: 0, cancels: 0, sales: 0, pay: 0 };
    if (b.cancelled) r.cancels += 1;
    else { r.count += 1; r.sales += b.price; r.pay += b.pay; }
    map.set(key, r);
  };

  const total = { count: 0, cancels: 0, badCancels: 0, sales: 0, pay: 0, allowance, unpriced: 0 };
  const custInMonth: number[] = [];
  let noTel = 0;
  for (const b of list) {
    const ms = new Date(String(b.slot_start)).getTime();
    const bizDate = new Date(ms + 9 * 3600_000 - 6 * 3600_000).toISOString().slice(0, 10);
    const jstHour = new Date(ms + 9 * 3600_000).getUTCHours();
    const hour = jstHour < 6 ? jstHour + 24 : jstHour;
    const cancelled = b.status === 'cancelled';
    const price = Number(b.price_total) || 0;
    const pay = Number(b.pay_total) || 0;
    const v = { cancelled, price, pay };
    if (cancelled) { total.cancels += 1; if (b.cancel_bad) total.badCancels += 1; }
    else {
      total.count += 1; total.sales += price; total.pay += pay;
      if (b.price_total == null) total.unpriced += 1;
      if (b.customer_id != null) custInMonth.push(Number(b.customer_id)); else noTel += 1;
    }
    const d = new Date(`${bizDate}T12:00:00Z`);
    bump(maps.day, bizDate, `${Number(bizDate.slice(8, 10))}日（${'日月火水木金土'[d.getUTCDay()]}）`, v);
    const tk = b.therapist_id == null ? 'free' : String(b.therapist_id);
    bump(maps.th, tk, b.therapist_id == null ? 'フリー（担当未定）' : (tName.get(Number(b.therapist_id)) || '(不明)'), v);
    const sk = String(b.source ?? '') === 'web' ? 'web' : 'manual';
    bump(maps.src, sk, sk === 'web' ? 'ネット予約（フクエス）' : '予約ボード・CRM（電話など）', v);
    // ★ 第1363便: 支払い別。分けた予約は金額ごとに振り分ける（報酬は最初の方法に寄せる）。キャンセルは数えない
    if (!cancelled) {
      const sp = parsePaymentSplit(b.payment_split);
      if (sp.length > 1) {
        sp.forEach((s, i) => bump(maps.pay, s.method, s.method, { cancelled: false, price: s.amount, pay: i === 0 ? pay : 0 }));
      } else {
        const pm = String(b.payment_method ?? '').trim();
        bump(maps.pay, pm || 'none', pm || '未設定', v);
      }
    }
    bump(maps.hour, String(hour), hour >= 24 ? `翌${hour - 24}時台` : `${hour}時台`, v);
    // ★ 指名別（第644便）：料金表の「指名」の項目の名前で分ける（本／ネット／フリー／その他の指名／指名なし）
    const nomItem = parseItems(b.crm_items).find((i) => i.kind === 'nomination');
    const nb = nomItem ? nominationBadge([nomItem]) : null;
    const nk = !nomItem ? 'none' : nb === '本' ? 'hon' : nb === 'ﾈｯﾄ' ? 'net' : nb === 'ﾌﾘｰ' ? 'free' : 'other';
    bump(maps.nom, nk, { hon: '本指名', net: 'ネット指名', free: 'フリー', other: 'その他の指名', none: '指名なし（料金表で選んでいない）' }[nk], v);
  }

  // 新規／リピート（人数）：その月より前に利用（キャンセル以外）があればリピート
  const people = [...new Set(custInMonth)];
  let repeatPeople = 0;
  if (people.length > 0) {
    const before = new Set<number>();
    // ★ 2026-11-12 点検#8: 読めなかった回は止める（リピートの人を「新規」に数えない）。
    //   1回に見る人数を 300 → 50 に（1回 5,000行までなので、通いの長いお客様が多いと途中で切れて「新規」に数えられていた）
    for (let i = 0; i < people.length; i += 50) {
      const chunk = people.slice(i, i + 50);
      const { data, error: bErr } = await svc
        .from('salon_bookings').select('customer_id')
        .eq('salon_id', salonId).in('customer_id', chunk)
        .neq('status', 'cancelled').lt('slot_start', new Date(startMs).toISOString()).limit(5000);
      if (bErr) return readFail(new Error(bErr.message));
      (data ?? []).forEach((r) => before.add(Number(r.customer_id)));
    }
    // 月の中で2回以上来た人もリピート
    const cnt = new Map<number, number>();
    custInMonth.forEach((c) => cnt.set(c, (cnt.get(c) ?? 0) + 1));
    repeatPeople = people.filter((p) => before.has(p) || (cnt.get(p) ?? 0) >= 2).length;
    // ★ 新規／リピート（本数・第644便）：その人の初回（その月より前に利用が無く、月の中で最初の1本）＝新規、2本目からリピート
    const seen = new Set<number>();
    for (const b of list) {
      const cancelled = b.status === 'cancelled';
      const v = { cancelled, price: Number(b.price_total) || 0, pay: Number(b.pay_total) || 0 };
      if (b.customer_id == null) { bump(maps.nr, 'notel', '電話番号なし（分けられない）', v); continue; }
      const cid = Number(b.customer_id);
      const isNew = !before.has(cid) && !seen.has(cid);
      if (!cancelled) seen.add(cid);
      bump(maps.nr, isNew ? 'new' : 'repeat', isNew ? '新規' : 'リピート', v);
    }
  } else {
    for (const b of list) {
      if (b.customer_id != null) continue;
      bump(maps.nr, 'notel', '電話番号なし（分けられない）', { cancelled: b.status === 'cancelled', price: Number(b.price_total) || 0, pay: Number(b.pay_total) || 0 });
    }
  }

  const sortSales = (a: Row, b: Row) => b.sales - a.sales || b.count - a.count;
  return {
    ok: true,
    stats: {
      ym,
      total,
      customers: { people: people.length, newPeople: people.length - repeatPeople, repeatPeople, noTel },
      byDay: [...maps.day.values()].sort((a, b) => a.key.localeCompare(b.key)),
      byTherapist: [...maps.th.values()].sort(sortSales),
      bySource: [...maps.src.values()].sort(sortSales),
      byHour: [...maps.hour.values()].sort((a, b) => Number(a.key) - Number(b.key)),
      byNomination: ['hon', 'net', 'free', 'other', 'none'].map((k) => maps.nom.get(k)).filter((r): r is Row => !!r),
      byNewRepeat: ['new', 'repeat', 'notel'].map((k) => maps.nr.get(k)).filter((r): r is Row => !!r),
      byPayment: [...CRM_PAYMENT_METHODS, 'none'].map((k) => maps.pay.get(k)).filter((r): r is Row => !!r),
    },
  };
}

/** プレイ状況を変える（'' ＝ 予約だけ／address_sent ＝ 住所送済／entered ＝ 入室済）（第544便） */
export async function setCrmPlayStatus(
  salonId: number,
  bookingId: string,
  playStatus: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!['', 'address_sent', 'entered'].includes(String(playStatus))) return { ok: false, error: '状況が不正です' };
  const { data, error } = await auth.svc
    .from('salon_bookings').update({ play_status: playStatus })
    .eq('salon_id', salonId).eq('id', bookingId).select('id');
  if (error) return { ok: false, error: dbMessage(error) };
  if (!data || data.length === 0) return { ok: false, error: '予約が見つかりません' };
  return { ok: true };
}

/** 受領を変える（'' ＝ 未受領／therapist ＝ 女子が受領／shop ＝ お店が受領）（第554便） */
export async function setCrmReceived(
  salonId: number,
  bookingId: string,
  receivedBy: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!(CRM_RECEIVED as readonly string[]).includes(String(receivedBy))) return { ok: false, error: '受領の値が不正です' };
  const { data, error } = await auth.svc
    .from('salon_bookings')
    .update({ received_by: receivedBy, received_at: receivedBy ? new Date().toISOString() : null })
    .eq('salon_id', salonId).eq('id', bookingId).neq('status', 'cancelled').select('id');
  if (error) return { ok: false, error: dbMessage(error) };
  if (!data || data.length === 0) return { ok: false, error: '予約が見つかりません（キャンセルの予約は受領にできません）' };
  return { ok: true };
}
