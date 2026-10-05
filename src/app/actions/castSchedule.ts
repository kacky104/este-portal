'use server';

// /cast の「スケジュール」（第599便・2026-09-20）。★ セラピスト本人の、その営業日の出勤と予約をタイムラインで見る。
// ★ 第572便の「報酬明細」を置き換えた（報酬はセラピストが記録帳で自分で入れるため・カッキーさんの決定）。
// ★ 見せるのは、お店が CRM 契約中で、設定「セラピストへの公開」（crm_settings.cast_pay_enabled・列名は第572便のまま）が ON のときだけ。
// ★ 返すのは本人の行だけ：出勤の時間・休憩・待機場所（部屋）・予約の時間／コース／お客様の名前。
//   ★ 第630便: ニックネーム（cast_customer_nicknames・本人だけ）と「あなたの接客 ◯回目」を足した。★ 鍵の customer_id は画面に渡さない。
//   ★ 第628便: ポップアップ用に 指名の名前・延長とオプションの名前 を足した（どれも料金なし）。
//   ★ 電話番号・料金・報酬・お店のメモ・ほかのセラピストの予定は返さない。
// ★ ログイン中の user_id → therapists.id を確かめてから service_role で読む（castCustomers と同じ流儀・旧 castPay も同じだった）。

import { nominationBadge, type CrmBookingItem, type CrmNominationBadge } from '@/app/lib/crm/types';
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { getCalendarDateJST } from '@/lib/dutyStatus';

type Svc = ReturnType<typeof createServiceClient>;

export type CastScheduleBooking = {
  startMin: number; // その日 0:00（JST）からの分。翌日にまたぐと 1440 を超える
  endMin: number;
  course: string;
  customerName: string;
  /** 指名の種類（第614便）：本＝本指名／ﾌﾘｰ＝フリー／ﾈｯﾄ＝ネット指名。お店が指名を入れていない・ほかの指名のときは null */
  nomination: CrmNominationBadge | null;
  // ── ここから下はポップアップ用（第628便）。★ 料金・報酬・電話番号・お店のメモは返さない ──
  /** 指名の名前そのまま（「本指名」「ネット指名」、お店が足した指名名も）。無ければ '' */
  nominationName: string;
  /** 延長の名前（料金なし） */
  extensions: string[];
  /** オプションの名前（料金なし） */
  options: string[];
  // ── ニックネームと接客回数（第630便）。★ customer_id・電話番号は返さない ──
  /** 予約の id（ニックネームを保存するときにこれを指す） */
  bookingId: string;
  /** お店の顧客台帳にひも付いている予約か（電話番号が無い手入力の予約は false＝ニックネームを付けられない） */
  canNickname: boolean;
  /** このセラピストがそのお客様に付けたニックネーム（無ければ ''） */
  nickname: string;
  /** このセラピストの接客として何回目か（キャンセル以外を日時順に数える）。台帳にひも付かない予約は null */
  visitNo: number | null;
};
export type CastScheduleDay = {
  date: string;
  dayStartMin: number;
  dayEndMin: number;
  room: string;
  shifts: Array<{ startMin: number; endMin: number }>;
  breakStartMin: number | null;
  breakEndMin: number | null;
  bookings: CastScheduleBooking[];
};

/** 予約の crm_items（jsonb）から、指名・延長・オプションの【名前だけ】拾う。★ 料金・報酬は読まない（/cast には出さないため） */
function itemsOf(raw: unknown): { nomination: CrmNominationBadge | null; nominationName: string; extensions: string[]; options: string[] } {
  const out = { nomination: null as CrmNominationBadge | null, nominationName: '', extensions: [] as string[], options: [] as string[] };
  if (!Array.isArray(raw)) return out;
  const noms: CrmBookingItem[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const kind = String(r?.kind ?? '');
    const name = String(r?.name ?? '').trim();
    if (!name) continue;
    if (kind === 'nomination') noms.push({ kind: 'nomination', name, minutes: 0, price: 0, pay: 0 });
    else if (kind === 'extension') out.extensions.push(name);
    else if (kind === 'option') out.options.push(name);
  }
  out.nomination = nominationBadge(noms);
  out.nominationName = noms[0]?.name ?? '';
  return out;
}

async function me(): Promise<{ svc: Svc; therapistId: number; salonId: number } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const svc = createServiceClient();
  const { data } = await svc.from('therapists').select('id, salon_id').eq('user_id', user.id).maybeSingle();
  if (!data?.id || data.salon_id == null) return null;
  return { svc, therapistId: Number(data.id), salonId: Number(data.salon_id) };
}

async function readEnabled(svc: Svc, salonId: number): Promise<{ on: boolean; dayStartMin: number; dayEndMin: number }> {
  const [{ data: salon }, { data: st }] = await Promise.all([
    svc.from('salons').select('crm_until').eq('id', salonId).maybeSingle(),
    svc.from('crm_settings').select('cast_pay_enabled, day_start_min, day_end_min').eq('salon_id', salonId).maybeSingle(),
  ]);
  const active = !!salon?.crm_until && String(salon.crm_until).slice(0, 10) >= getCalendarDateJST();
  return {
    on: active && !!st?.cast_pay_enabled,
    dayStartMin: Number(st?.day_start_min) || 600,
    dayEndMin: Number(st?.day_end_min) || 1740,
  };
}

/** /cast で「スケジュール」タブを出すかどうか */
export async function isCastScheduleEnabled(): Promise<boolean> {
  const m = await me();
  if (!m) return false;
  return (await readEnabled(m.svc, m.salonId)).on;
}

function hmToMin(t: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** その営業日（朝6時区切り）の本人の出勤と予約 */
export async function getCastScheduleDay(
  date: string,
): Promise<{ ok: true; day: CastScheduleDay } | { ok: false; error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: '日付が正しくありません' };
  const m = await me();
  if (!m) return { ok: false, error: 'ログインしてください' };
  const en = await readEnabled(m.svc, m.salonId);
  if (!en.on) return { ok: false, error: 'お店がスケジュールを公開していません' };

  const base = new Date(`${date}T00:00:00+09:00`).getTime();
  const from = new Date(base + 6 * 3600_000).toISOString();
  const to = new Date(base + 30 * 3600_000).toISOString();

  const [{ data: sch }, { data: wd }, { data: bs, error: bErr }] = await Promise.all([
    m.svc.from('therapist_schedules').select('start_time, end_time')
      .eq('therapist_id', m.therapistId).eq('schedule_date', date).eq('is_active', true),
    m.svc.from('crm_work_days').select('room, break_start_min, break_end_min')
      .eq('salon_id', m.salonId).eq('therapist_id', m.therapistId).eq('business_date', date).maybeSingle(),
    m.svc.from('salon_bookings').select('id, customer_id, slot_start, slot_end, course_name, customer_name, crm_items')
      .eq('salon_id', m.salonId).eq('therapist_id', m.therapistId).neq('status', 'cancelled')
      .gte('slot_start', from).lt('slot_start', to).order('slot_start'),
  ]);
  if (bErr) return { ok: false, error: '読み込めませんでした' };

  const shifts: Array<{ startMin: number; endMin: number }> = [];
  for (const r of sch ?? []) {
    const s = hmToMin(r.start_time);
    let e = hmToMin(r.end_time);
    if (s == null || e == null) continue;
    if (e <= s) e += 1440; // 翌日にまたぐ
    shifts.push({ startMin: s, endMin: e });
  }
  // ★ 第630便: 台帳にひも付く予約のお客様について、本人のニックネームと、本人の接客の順番を引く
  const custIds = [...new Set((bs ?? []).map((b) => b.customer_id).filter((v) => v != null).map(Number))];
  const nick = new Map<number, string>();
  const order = new Map<number, string[]>(); // customer_id → この人の本人の予約 id（日時順）
  if (custIds.length > 0) {
    const [{ data: nk }, { data: hist }] = await Promise.all([
      m.svc.from('cast_customer_nicknames').select('customer_id, nickname')
        .eq('therapist_id', m.therapistId).in('customer_id', custIds),
      m.svc.from('salon_bookings').select('id, customer_id, slot_start')
        .eq('salon_id', m.salonId).eq('therapist_id', m.therapistId).neq('status', 'cancelled')
        .in('customer_id', custIds).order('slot_start').order('id'),
    ]);
    for (const r of nk ?? []) nick.set(Number(r.customer_id), String(r.nickname ?? ''));
    for (const r of hist ?? []) {
      const k = Number(r.customer_id);
      const arr = order.get(k) ?? [];
      arr.push(String(r.id));
      order.set(k, arr);
    }
  }

  const bookings: CastScheduleBooking[] = (bs ?? []).map((b) => {
    const s = Math.round((new Date(String(b.slot_start)).getTime() - base) / 60000);
    const e = b.slot_end ? Math.round((new Date(String(b.slot_end)).getTime() - base) / 60000) : s + 60;
    const it = itemsOf(b.crm_items);
    const cid = b.customer_id == null ? null : Number(b.customer_id);
    return {
      startMin: s,
      endMin: Math.max(e, s + 10),
      course: String(b.course_name ?? ''),
      customerName: String(b.customer_name ?? ''),
      nomination: it.nomination,
      nominationName: it.nominationName,
      extensions: it.extensions,
      options: it.options,
      bookingId: String(b.id),
      canNickname: cid != null,
      nickname: cid != null ? (nick.get(cid) ?? '') : '',
      visitNo: cid != null ? ((order.get(cid) ?? []).indexOf(String(b.id)) + 1 || null) : null,
    };
  });

  return {
    ok: true,
    day: {
      date,
      dayStartMin: en.dayStartMin,
      dayEndMin: en.dayEndMin,
      room: String(wd?.room ?? ''),
      shifts,
      breakStartMin: wd?.break_start_min == null ? null : Number(wd.break_start_min),
      breakEndMin: wd?.break_end_min == null ? null : Number(wd.break_end_min),
      bookings,
    },
  };
}

// ── これからの予約（第1211便・2026-10-06・カッキーさん） ─────────────────────────
// ★ 「スケジュール」タブのバッジ（まだ見ていない新しい予約の数）と、スケジュールの下の「これからの予約」の一覧に使う。
// ★ ねらい: 3日後・3週間後の事前予約を見落とさない。1日ずつ「翌日 ▶」を押さなくても、先の予約が1か所で分かる。
// ★★ 何日先まで、の期限は置かない（カッキーさんの確認: 3週間先の予約が2週間の窓に入るまで出ない、を避ける）。
//   代わりに件数で頭打ち（近い順に UPCOMING_LIMIT 件）。1人のセラピストの先の予約がこれを超えることは、まず無い。
// ★ 返すのは本人の、まだ終わっていない予約だけ。時間・コース・お客様の名前・指名のバッジ。電話番号・料金・報酬は返さない。
// ★ キャンセルされた予約は出ない（一覧から消えるだけ。「キャンセルされました」のお知らせは作っていない）。
export type CastUpcomingBooking = {
  bookingId: string;
  /** 「見た」の印に使う値＝予約 id＋開始時刻。★ 時間が変わると別の値になる＝もう一度「新しい」になる */
  sig: string;
  /** その予約の営業日（朝6時区切り）YYYY-MM-DD。一覧で押したときに開く日 */
  date: string;
  /** その営業日 0:00（JST）からの分。翌日にまたぐと 1440 を超える */
  startMin: number;
  endMin: number;
  course: string;
  customerName: string;
  nomination: CrmNominationBadge | null;
};

const UPCOMING_LIMIT = 50;

export async function getCastUpcomingBookings(): Promise<{ ok: true; items: CastUpcomingBooking[] } | { ok: false; error: string }> {
  const m = await me();
  if (!m) return { ok: false, error: 'ログインしてください' };
  const en = await readEnabled(m.svc, m.salonId);
  // ★ お店がスケジュールを公開していないときは「0件」（タブ自体が出ないので、バッジも一覧も出ない）
  if (!en.on) return { ok: true, items: [] };

  const now = Date.now();
  // ★ いま接客中の予約も「これから」に入れる（始まりが少し前でも、終わりがまだ先なら残す）ので、6時間前から読んで下で絞る
  const { data: bs, error } = await m.svc
    .from('salon_bookings')
    .select('id, slot_start, slot_end, course_name, customer_name, crm_items')
    .eq('salon_id', m.salonId)
    .eq('therapist_id', m.therapistId)
    .neq('status', 'cancelled')
    .gte('slot_start', new Date(now - 6 * 3600_000).toISOString())
    .order('slot_start')
    .order('id')
    .limit(UPCOMING_LIMIT + 10);
  if (error) return { ok: false, error: '読み込めませんでした' };

  const items: CastUpcomingBooking[] = [];
  for (const b of bs ?? []) {
    const s = new Date(String(b.slot_start)).getTime();
    if (!Number.isFinite(s)) continue;
    const eRaw = b.slot_end ? new Date(String(b.slot_end)).getTime() : NaN;
    const e = Number.isFinite(eRaw) ? eRaw : s + 60 * 60_000;
    if (e <= now) continue; // もう終わった予約
    // 営業日（朝6時区切り・JST）: 0:00〜5:59 に始まる予約は前の日のぶん
    const date = new Date(s + 9 * 3600_000 - 6 * 3600_000).toISOString().slice(0, 10);
    const base = new Date(`${date}T00:00:00+09:00`).getTime();
    const startMin = Math.round((s - base) / 60000);
    items.push({
      bookingId: String(b.id),
      sig: `${String(b.id)}:${s}`,
      date,
      startMin,
      endMin: Math.max(Math.round((e - base) / 60000), startMin + 10),
      course: String(b.course_name ?? ''),
      customerName: String(b.customer_name ?? ''),
      nomination: itemsOf(b.crm_items).nomination,
    });
    if (items.length >= UPCOMING_LIMIT) break;
  }
  return { ok: true, items };
}

/**
 * 予約のお客様に、本人だけのニックネームを付ける／変える／消す（第630便）。
 * ★ 画面からは予約 id だけ受け取り、サーバーで「本人の予約か」を確かめてから customer_id を引く（customer_id は画面に出さない）。
 * ★ 空文字で消す。30文字まで。
 */
export async function setCastCustomerNickname(
  bookingId: string,
  nickname: string,
): Promise<{ ok: true; nickname: string } | { ok: false; error: string }> {
  const m = await me();
  if (!m) return { ok: false, error: 'ログインしてください' };
  const en = await readEnabled(m.svc, m.salonId);
  if (!en.on) return { ok: false, error: 'お店がスケジュールを公開していません' };
  const name = String(nickname ?? '').replace(/\s+/g, ' ').trim();
  if ([...name].length > 30) return { ok: false, error: 'ニックネームは30文字までです' };
  if (!bookingId) return { ok: false, error: '予約が見つかりません' };

  const { data: bk } = await m.svc.from('salon_bookings').select('customer_id')
    .eq('id', bookingId).eq('salon_id', m.salonId).eq('therapist_id', m.therapistId).maybeSingle();
  if (!bk) return { ok: false, error: '予約が見つかりません' };
  if (bk.customer_id == null) return { ok: false, error: '電話番号が無い予約には付けられません' };
  const customerId = Number(bk.customer_id);

  if (!name) {
    const { error } = await m.svc.from('cast_customer_nicknames').delete()
      .eq('therapist_id', m.therapistId).eq('customer_id', customerId);
    if (error) return { ok: false, error: '保存できませんでした' };
    return { ok: true, nickname: '' };
  }
  const { error } = await m.svc.from('cast_customer_nicknames').upsert(
    { therapist_id: m.therapistId, customer_id: customerId, nickname: name, updated_at: new Date().toISOString() },
    { onConflict: 'therapist_id,customer_id' },
  );
  if (error) return { ok: false, error: '保存できませんでした' };
  return { ok: true, nickname: name };
}
