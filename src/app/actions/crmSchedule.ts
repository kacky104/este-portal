'use server';

import { createClient } from '@/app/lib/supabase/server';
import { normalizePhone } from '@/app/lib/validation/phone';
import { loadBookingBoard } from '@/app/lib/booking/boardData';
import { readConecfGirlOrder, isMissingOrderTable } from '@/app/lib/conecf/girlOrder';
import { revalidateSalonTherapistOrder } from '@/app/lib/conecf/girlOrderRevalidate';
import { sortTherapistsByManual, placeSubsetOrder } from '@/lib/therapistOrder';
import { dbMessage } from '@/app/lib/crm/dbError';
import { pointsYenByBooking } from '@/app/lib/points/server';
import { crmGroupHitsForSalon } from '@/app/lib/crm/groupAlerts';
import { sharedRoomBands, partnerRoomOptions } from '@/app/lib/crm/roomShare';
import type { CrmGroupHit } from '@/lib/crmGroup';
import { toCrmCategory, type CrmScheduleData, type CrmScheduleCustomer, type CrmBookingItem, type CrmPriceItem, type CrmPaymentSplit, parsePaymentSplit } from '@/app/lib/crm/types';
import { assertCrm, emptyStats, statsFor, bookingOrdinalsFor, parseItems, readPriceItems, rowsOrThrow, readFail, readConfirms, readReport, readSettings, readWorkEnds, readWorkDays, displayTel } from '@/app/lib/crm/server/core';

/**
 * 本日スケジュール（CRM版）。予約ボードと同じ出勤・予約に、台帳のお客様情報を重ねて返す。
 * ★ 出勤と予約の読み方は予約ボード（getBookingBoardData）をそのまま使う（★ 二重管理しない）。
 *   ボードの窓は「その日 0:00〜翌7:00」。画面側で 6:00 より前（前日営業日の続き）は見せない。
 * ★ 見られる日付もボードと同じ（過去90日〜7日先）。
 */
/**
 * ★ 第1116便（2026-10-03）: 店舗の「変更マーク」（最後に何かが変わった時刻）を読む。
 *   スケジュール画面は60秒ごとに【これだけ】読み、前回と同じなら全量（getCrmSchedule）を読まない。
 *   ★ 店舗様本人の権限（RLS）で読む＝service_role の認証の往復を増やさない。
 *   ★ 読めないとき（表が無い＝SQL を流す前／運営が別の店舗を見ている）は null → 画面側は今までどおり毎回読む。
 */
export async function getCrmChangeMark(salonId: number): Promise<string | null> {
  if (!Number.isInteger(salonId) || salonId <= 0) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('crm_change_marks')
    .select('bumped_at')
    .eq('salon_id', salonId)
    .maybeSingle();
  if (error || !data) return null;
  return String(data.bumped_at);
}

/** ★ 第1113便: 自動更新（lite）で返す形＝設定・料金表を除いたもの。画面側が前回の値と合わせて使う */
export type CrmScheduleLiteData = Omit<CrmScheduleData, 'settings' | 'priceItems'>;

export async function getCrmSchedule(
  salonId: number,
  dateISO: string,
  opts?: { lite?: boolean },
): Promise<
  | { ok: true; lite: false; data: CrmScheduleData }
  | { ok: true; lite: true; data: CrmScheduleLiteData }
  | { ok: false; error: string }
> {
  // ★ 第1113便（2026-10-03）: 読み取りを減らした。
  //   ① 認証は1回（それまで assertCrm ＋ 予約ボードの assertSalonOwner で auth・salons を2回ずつ読んでいた）
  //   ② 予約は1回（それまでボード用と CRM の列用で salon_bookings を2回読んでいた → extraBookingCols で一緒に読む）
  //   ③ 互いに依存しない読み取りは Promise.all で同時に（それまで6本を順番に待っていた＝ソウルまで6往復）
  //   ④ lite: 60秒ごとの自動更新では、滅多に変わらない 設定・料金表 を読まない（★ 画面側が前回の値を使い回す）
  //   ★ lite のときは settings・priceItems を【返さない】（型で分ける＝画面側が前回の値を使うことを忘れられない）。
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return { ok: false, error: '日付が不正です' };
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;
  const lite = opts?.lite === true;

  // 予約 → 顧客のひも付けと悪質・入り口・料金（★ ボードの列に足して1回で読む）
  const board = await loadBookingBoard(svc, salonId, dateISO,
    { bookingCoursesRaw: auth.bookingCoursesRaw, defaultIntervalMin: auth.defaultIntervalMin },
    { extraBookingCols: 'customer_id, cancel_bad, source, crm_items, price_adjust, pay_adjust, price_total, pay_total, payment_method, payment_split, play_status, received_by' },
  );
  if (!board.ok) return board;
  const { therapists, bookings } = board.data;

  type Extra = {
    customerId: number | null; cancelBad: boolean; source: string;
    items: CrmBookingItem[]; priceAdjust: number; payAdjust: number;
    priceTotal: number | null; payTotal: number | null; paymentMethod: string; paymentSplit: CrmPaymentSplit[]; playStatus: string; receivedBy: string;
  };
  const extra = new Map<string, Extra>();
  for (const [id, r] of board.extra) {
    extra.set(id, {
      customerId: r.customer_id == null ? null : Number(r.customer_id),
      cancelBad: Boolean(r.cancel_bad),
      source: String(r.source ?? ''),
      items: parseItems(r.crm_items),
      priceAdjust: Number(r.price_adjust) || 0,
      payAdjust: Number(r.pay_adjust) || 0,
      priceTotal: r.price_total == null ? null : Number(r.price_total),
      payTotal: r.pay_total == null ? null : Number(r.pay_total),
      paymentMethod: String(r.payment_method ?? ''),
      paymentSplit: parsePaymentSplit(r.payment_split),
      playStatus: String(r.play_status ?? ''),
      receivedBy: String(r.received_by ?? ''),
    });
  }

  const bookingIds = bookings.map((b) => b.id);
  const therapistIds = therapists.map((t) => t.id);
  const customerIds = [...new Set([...extra.values()].map((e) => e.customerId).filter((v): v is number => v != null))];

  // ★ ここから先は互いに依存しない → 同時に読む
  // ★ 第1219便: どれかの読み取りが失敗したら ok:false（画面は第1218便で、60秒更新の失敗なら前の表を残す）
  const reads = await Promise.all([
    // 同意書（第560便）：有効な同意の時刻
    bookingIds.length > 0
      ? svc.from('crm_consents').select('booking_id, created_at')
          .eq('salon_id', salonId).is('superseded_at', null).in('booking_id', bookingIds).then(rowsOrThrow)
      : Promise.resolve([] as Array<{ booking_id: unknown; created_at: unknown }>),
    // 女子メモ（crm_therapist_memos・2026-09-19）
    therapistIds.length > 0
      ? svc.from('crm_therapist_memos').select('therapist_id, memo')
          .eq('salon_id', salonId).in('therapist_id', therapistIds).then(rowsOrThrow)
      : Promise.resolve([] as Array<{ therapist_id: unknown; memo: unknown }>),
    customerIds.length > 0
      ? svc.from('salon_customers').select('id, name, category, caution_memo, ng_therapist_ids')
          .eq('salon_id', salonId).in('id', customerIds).then(rowsOrThrow)
      : Promise.resolve([] as Array<Record<string, unknown>>),
    statsFor(svc, salonId, customerIds),
    // ★ lite のときは読まない（画面側が前回の値を使う）
    lite ? Promise.resolve([] as CrmPriceItem[]) : readPriceItems(svc, salonId).then((xs) => xs.filter((p) => p.isActive)),
    readConfirms(svc, salonId, dateISO),
    readReport(svc, salonId, dateISO),
    lite ? Promise.resolve(null) : readSettings(svc, salonId),
    readWorkEnds(svc, salonId, dateISO),
    readWorkDays(svc, salonId, dateISO),
    // ★ 第1325便: 予約の電話番号が、グループ・提携店の共有リストに当たるか（グループに入っていない店・電話番号の無い日は読まない）
    //   ★ 読めなくても表は出す（groupFailed で画面に知らせる）。ここで投げない
    crmGroupHitsForSalon(svc, salonId, bookings.map((b) => normalizePhone(String(b.customerTel ?? ''))))
      .catch((e: unknown) => {
        console.error('[crm] グループ共有を読めなかった', salonId, e instanceof Error ? e.message : String(e));
        return { failed: true, byPhone: new Map<string, CrmGroupHit[]>() };
      }),
    // ★ 第1410便: セラピストの並び（コネックエフと同じ表）。★ 読めなければ []＝今までどおり出勤の早い順（ここで投げない）
    readConecfGirlOrder(svc, salonId),
    // ★ 第1454便: 予約ごとのフクエスポイントの利用額（円）。★ 読めなければ空（ここで投げない）。会員・残高は読まない
    pointsYenByBooking(svc, bookingIds.map(String)),
    // ★ 第1514便: 予約カードの「新規／◯回目」。★ 読めなければ null＝カードに出さない（ここで投げない）
    bookingOrdinalsFor(svc, salonId, customerIds),
    // ★ 第1669便: 提携店の部屋共有＝同じ部屋を使う相手の店の予約の帯（両方向）。★ 読めなければ {}（ここで投げない）
    sharedRoomBands(svc, salonId, dateISO),
    // ★ 第1669便: 出勤情報で選べる提携店の部屋。★ 読めなければ []
    partnerRoomOptions(svc, salonId),
  ]).catch((e: unknown) => readFail(e));
  if (!Array.isArray(reads)) return reads;
  const [consentRows, memoRows, customerRows, stats, priceItems, confirms, report, settings, workEnds, workDays, groupHits, therapistOrder, pointsYen, ordinals, roomBands, partnerRooms] = reads;

  const consentAt = new Map<string, string>();
  for (const c of consentRows) consentAt.set(String(c.booking_id), String(c.created_at));
  const memos = new Map<number, string>();
  for (const m of memoRows) memos.set(Number(m.therapist_id), String(m.memo ?? ''));
  const customers = new Map<number, CrmScheduleCustomer>();
  for (const c of customerRows as Array<Record<string, unknown>>) {
    const id = Number(c.id);
    customers.set(id, {
      id,
      name: (c.name as string | null) ?? '',
      category: toCrmCategory(c.category),
      cautionMemo: (c.caution_memo as string | null) ?? '',
      ngTherapistIds: ((c.ng_therapist_ids as number[] | null) ?? []).map(Number),
      stats: stats.get(id) ?? emptyStats(),
    });
  }

  const base: CrmScheduleLiteData = {
      date: dateISO,
      groupFailed: groupHits.failed,
      courses: board.data.courses,
      confirms,
      report,
      workEnds,
      workDays,
      roomBands,
      partnerRooms,
      defaultIntervalMin: board.data.defaultIntervalMin,
      therapists: therapists.map((t) => ({
        id: t.id,
        name: t.name,
        profileImageUrl: t.profileImageUrl,
        memo: memos.get(t.id) ?? '',
        schedules: t.schedules.map((w) => ({ start: w.start, end: w.end, startISO: w.startISO, endISO: w.endISO })),
      })),
      therapistOrder,
      bookings: bookings.map((b) => {
        const e = extra.get(b.id);
        return {
          id: b.id,
          therapistId: b.therapistId,
          slotStartISO: b.slotStart,
          slotEndISO: b.slotEnd,
          courseName: b.courseName,
          courseMin: b.courseMin,
          customerName: b.customerName,
          customerTel: displayTel(b.customerTel), // ★ 第1220便
          note: b.note ?? '',
          status: b.status,
          cancelBad: e?.cancelBad ?? false,
          source: e?.source ?? '',
          customer: e?.customerId != null ? customers.get(e.customerId) ?? null : null,
          items: e?.items ?? [],
          priceAdjust: e?.priceAdjust ?? 0,
          payAdjust: e?.payAdjust ?? 0,
          priceTotal: e?.priceTotal ?? null,
          payTotal: e?.payTotal ?? null,
          paymentMethod: e?.paymentMethod ?? '',
          paymentSplit: e?.paymentSplit ?? [],
          playStatus: e?.playStatus ?? '',
          receivedBy: e?.receivedBy ?? '',
          consentAt: consentAt.get(String(b.id)) ?? null,
          groupHits: groupHits.byPhone.get(normalizePhone(String(b.customerTel ?? ''))) ?? [],
          pointsYen: pointsYen.get(String(b.id)) ?? 0,
          ordinal: e?.customerId != null && ordinals ? ordinals.get(String(b.id)) ?? null : null,
        };
      }),
  };
  if (lite || settings === null) return { ok: true, lite: true, data: base };
  return { ok: true, lite: false, data: { ...base, settings, priceItems } };
}

/**
 * ★ 第1410便（2026-10-12・ラビリンス様のご要望）: フクエスCRM のタイムラインで並べ替えた順を保存する。
 *   ・保存先はコネックエフのセラピスト一覧と同じ表（conecf_girl_order・店ごとに1行）＝どちらで変えても両方に効く。
 *   ・CRM に出ているのはその日の方だけなので、その方たちの順だけを全体の並びに差し込む（placeSubsetOrder）。ほかの方の位置は動かさない。
 *   ・書けるのは CRM を使える自店だけ（assertCrm）。★ 自店の公開中の方以外の id が混じっていたら保存しない。
 *   ・therapists の行には触らない。フクエスの店舗ページ・各サイトへは送らない（revalidate もしない）。
 */
export async function saveCrmTherapistOrder(salonId: number, ids: number[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;
  const raw = Array.isArray(ids) ? ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
  if (raw.length === 0 || raw.length > 500) return { ok: false, error: '並び順を保存できませんでした' };
  const { data: ths, error: thErr } = await svc.from('therapists').select('id, name, is_active').eq('salon_id', salonId);
  if (thErr) return { ok: false, error: '女子を読み込めませんでした' };
  const all = (ths ?? []).map((t) => ({ id: Number(t.id), name: (t.name as string | null) ?? '', hidden: t.is_active === false }));
  const order = await readConecfGirlOrder(svc, salonId);
  // ★ いまの全体の並び（コネックエフの一覧と同じ並べ方）。公開中の方だけ
  const base = sortTherapistsByManual(all, (t) => t.id, (t) => t.name, (t) => t.hidden, order).filter((t) => !t.hidden).map((t) => t.id);
  const baseSet = new Set(base);
  // ★ 自店の公開中の方だけ（他店の id・非公開の方は入れない＝ placeSubsetOrder も base に無い id は無視する）
  const subset = raw.filter((id) => baseSet.has(id));
  if (subset.length === 0) return { ok: false, error: '並び順を保存できませんでした。画面を更新してから、もう一度お試しください' };
  const next = placeSubsetOrder(base, subset);
  const { error } = await svc
    .from('conecf_girl_order')
    .upsert({ salon_id: salonId, therapist_ids: next, updated_at: new Date().toISOString() }, { onConflict: 'salon_id' });
  if (error) {
    if (isMissingOrderTable(error.code)) return { ok: false, error: '並び順の保存先がまだ用意されていません。運営事務局までご連絡ください' };
    console.error('[crm] 並び順を保存できなかった', salonId, error.code, error.message);
    return { ok: false, error: '並び順を保存できませんでした。時間をおいて、もう一度お試しください' };
  }
  revalidateSalonTherapistOrder(salonId); // ★ 第1555便: フクエスの在籍一覧も同じ順
  return { ok: true };
}

/**
 * 電話番号から台帳のお客様を引く（受付フォームで番号を入れたとき）。見つからなければ customer: null。
 * ★ 番号は完全一致（数字10〜13桁）。★ 途中一致はしない（別の人を出してしまうため）。
 */
export async function lookupCrmCustomerByPhone(
  salonId: number,
  tel: string,
): Promise<{ ok: true; customer: CrmScheduleCustomer | null; groupHits: CrmGroupHit[]; groupFailed: boolean } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const phone = normalizePhone(String(tel ?? ''));
  if (!/^\d{10,13}$/.test(phone)) return { ok: true, customer: null, groupHits: [], groupFailed: false };
  const svc = auth.svc;
  // ★ 第1325便: グループ・提携店の共有リストも引く（★ 自店の台帳にいない、初めての電話でも当たる）。
  //   ★ 出すだけ。予約は断らない（番号の持ち主が変わった別人のことがある）。★ 読めなかったら groupFailed（画面に知らせる）
  const groupP = crmGroupHitsForSalon(svc, salonId, [phone]).catch((e: unknown) => {
    console.error('[crm] グループ共有を読めなかった', salonId, e instanceof Error ? e.message : String(e));
    return { failed: true, byPhone: new Map<string, CrmGroupHit[]>() };
  });
  const { data: ph, error: phErr } = await svc
    .from('salon_customer_phones').select('customer_id')
    .eq('salon_id', salonId).eq('phone', phone).maybeSingle();
  const group = await groupP;
  // ★ 2026-10-09 点検#2: 台帳を引けなかったら「台帳にない」と答えない（NG・要注意を見落として受け付けてしまう）
  if (phErr) return readFail(new Error(phErr.message));
  const groupHits = group.byPhone.get(phone) ?? [];
  if (!ph) return { ok: true, customer: null, groupHits, groupFailed: group.failed };
  const id = Number(ph.customer_id);
  let c: Record<string, unknown> | null;
  let stats: Awaited<ReturnType<typeof statsFor>>;
  try {
    const [cr, st] = await Promise.all([
      svc.from('salon_customers')
        .select('id, name, category, caution_memo, ng_therapist_ids')
        .eq('salon_id', salonId).eq('id', id).maybeSingle(),
      statsFor(svc, salonId, [id]),
    ]);
    if (cr.error) throw new Error(cr.error.message);
    c = cr.data;
    stats = st;
  } catch (e) {
    return readFail(e);
  }
  if (!c) return { ok: true, customer: null, groupHits, groupFailed: group.failed };
  return {
    ok: true,
    customer: {
      id,
      name: (c.name as string | null) ?? '',
      category: toCrmCategory(c.category),
      cautionMemo: (c.caution_memo as string | null) ?? '',
      ngTherapistIds: ((c.ng_therapist_ids as number[] | null) ?? []).map(Number),
      stats: stats.get(id) ?? emptyStats(),
    },
    groupHits,
    groupFailed: group.failed,
  };
}

/**
 * 女子メモを保存する（セラピスト1人1行・空にすると行を消す）。
 * ★ crm_therapist_memos は RLS で全部閉じてある（公開の therapists には置かない）。service_role で書く。
 */
export async function saveCrmTherapistMemo(
  salonId: number,
  therapistId: number,
  memo: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;
  const text = String(memo ?? '').replace(/\r\n/g, '\n').trim();
  if (text.length > 500) return { ok: false, error: '女子メモは500文字までです' };

  // その店のセラピストか確かめる
  const { data: t } = await svc.from('therapists').select('salon_id').eq('id', therapistId).maybeSingle();
  if (!t || Number(t.salon_id) !== salonId) return { ok: false, error: '女子が見つかりません' };

  if (!text) {
    const { error } = await svc.from('crm_therapist_memos').delete().eq('therapist_id', therapistId);
    if (error) return { ok: false, error: dbMessage(error) };
    return { ok: true };
  }
  const { error } = await svc
    .from('crm_therapist_memos')
    .upsert({ therapist_id: therapistId, salon_id: salonId, memo: text, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: dbMessage(error) };
  return { ok: true };
}
