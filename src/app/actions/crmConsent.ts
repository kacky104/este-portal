'use server';

import { ADMIN_UUID } from '@/app/lib/admin';
import { dbMessage } from '@/app/lib/crm/dbError';
import { businessDateNowJST } from '@/app/lib/crm/consentMatch';
import { type CrmConsent, type CrmSettings } from '@/app/lib/crm/types';
import { assertCrm, readFail, readSettings } from '@/app/lib/crm/server/core';

// ── 来店時の同意書（第560便・2026-09-20）──────────────────
// ★ 公開側（QR から開くページ）は actions/consent.ts。ここはオーナー（CRM）側。

/**
 * 部屋の QR（第560便・第561便）。使える QR はいつも1つ（token）。一つ前（prev_token）は使えないが戻せる。
 *   get：無ければ作る／regenerate：作り直す（今のを一つ前に）／revert：一つ前と入れ替える
 */
export async function getCrmRoomQr(
  salonId: number,
  room: string,
  action: 'get' | 'regenerate' | 'revert' = 'get',
): Promise<{ ok: true; url: string; createdAt: string; prevCreatedAt: string | null } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const r = String(room ?? '').trim();
  if (!r || r.length > 30) return { ok: false, error: '部屋が不正です' };
  let st: CrmSettings;
  try { st = await readSettings(auth.svc, salonId); } catch (e) { return readFail(e); } // ★ 第1219便
  if (!st.rooms.includes(r)) return { ok: false, error: 'この部屋は設定にありません（保存してからもう一度）' };
  const { data: cur, error: curErr } = await auth.svc
    .from('crm_room_tokens').select('token, created_at, prev_token, prev_created_at')
    .eq('salon_id', salonId).eq('room', r).maybeSingle();
  // ★ 2026-11-12 点検#1: いまの QR を読めなかったら止める。前は「まだ QR が無い」と受け取って新しい QR を作り、上書きしていた
  //   ＝設定で QR を開いただけで、印刷して部屋に貼ってある QR が使えなくなる道があった（一つ前にも残らない）
  if (curErr) return readFail(new Error(curErr.message));
  const newToken = async () => (await import('node:crypto')).randomBytes(18).toString('base64url');
  let row = cur
    ? { token: String(cur.token), created_at: String(cur.created_at), prev_token: cur.prev_token ? String(cur.prev_token) : null, prev_created_at: cur.prev_created_at ? String(cur.prev_created_at) : null }
    : null;

  if (!row || action === 'regenerate') {
    row = {
      token: await newToken(),
      created_at: new Date().toISOString(),
      prev_token: row?.token ?? null,
      prev_created_at: row?.created_at ?? null,
    };
  } else if (action === 'revert') {
    if (!row.prev_token || !row.prev_created_at) return { ok: false, error: '一つ前の QR はありません' };
    row = { token: row.prev_token, created_at: row.prev_created_at, prev_token: row.token, prev_created_at: row.created_at };
  }
  if (!cur || action !== 'get') {
    // 入れ替えのとき unique にぶつからないよう、先に prev を空にしてから書く
    if (cur) await auth.svc.from('crm_room_tokens').update({ prev_token: null }).eq('salon_id', salonId).eq('room', r);
    const { error } = await auth.svc.from('crm_room_tokens').upsert({ salon_id: salonId, room: r, ...row });
    if (error) return { ok: false, error: dbMessage(error) };
  }
  return { ok: true, url: `https://fukues.com/g/${row.token}`, createdAt: row.created_at, prevCreatedAt: row.prev_created_at };
}

/** 予約の同意書（新しい順・サインし直した古いものも含む） */
export async function getCrmBookingConsents(
  salonId: number,
  bookingId: string,
): Promise<{ ok: true; consents: CrmConsent[] } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const { data, error } = await auth.svc
    .from('crm_consents')
    .select('id, created_at, room, agreed_title, agreed_body, signature_png, superseded_at, user_agent')
    .eq('salon_id', salonId).eq('booking_id', bookingId)
    .order('created_at', { ascending: false }).limit(20);
  if (error) return { ok: false, error: dbMessage(error) };
  return {
    ok: true,
    consents: (data ?? []).map((r) => ({
      id: Number(r.id),
      createdAt: String(r.created_at),
      room: String(r.room ?? ''),
      title: String(r.agreed_title ?? ''),
      body: String(r.agreed_body ?? ''),
      signaturePng: String(r.signature_png ?? ''),
      superseded: !!r.superseded_at,
      manual: String(r.user_agent ?? '').startsWith(CONSENT_MANUAL_UA),
      manualByAdmin: String(r.user_agent ?? '') === CONSENT_MANUAL_UA + ':admin',
    })),
  };
}

// ── 同意書を紙でもらったとき（第639便・2026-09-22・カッキーさんの指示）──────────────────
// ★ QR のサインと同じ表（crm_consents）に1行足す。★ 表の形は変えない：signature_png は空・user_agent に目印を入れる。
//   user_agent = 'manual'（店舗）／'manual:admin'（運営が押した）。★ 画面では「手動（紙で受け取り）」と出す。
// ★ 取り消しは消さずに superseded_at を入れる（サインし直しと同じ）。★ 取り消せるのは手動のものだけ（QR のサインは消させない）。
const CONSENT_MANUAL_UA = 'manual';

export async function markCrmConsentManual(
  salonId: number,
  bookingId: string,
): Promise<{ ok: true; consentAt: string } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const { data: b } = await auth.svc
    .from('salon_bookings').select('id, salon_id, slot_start, therapist_id, status')
    .eq('id', bookingId).maybeSingle();
  if (!b || Number(b.salon_id) !== salonId) return { ok: false, error: '予約が見つかりません' };
  if (b.status === 'cancelled') return { ok: false, error: 'キャンセルの予約には付けられません' };
  const { count, error: cntErr } = await auth.svc
    .from('crm_consents').select('id', { count: 'exact', head: true })
    .eq('salon_id', salonId).eq('booking_id', bookingId).is('superseded_at', null);
  // ★ 第1987便（点検 §3）: 読めなければ付けない（同じ予約に了承が2つ付く）
  if (cntErr) return { ok: false, error: '了承済みかを確かめられませんでした。もう一度お試しください' };
  if ((count ?? 0) > 0) return { ok: false, error: 'もう了承済みです（画面を開き直してください）' };
  const { data: st } = await auth.svc.from('crm_settings').select('consent_title, consent_body').eq('salon_id', salonId).maybeSingle();
  // 部屋：その日のセラピストの待機場所（分かれば）
  const businessDate = businessDateNowJST(new Date(String(b.slot_start)).getTime());
  let room = '';
  if (b.therapist_id != null) {
    const { data: wd } = await auth.svc.from('crm_work_days').select('room')
      .eq('salon_id', salonId).eq('therapist_id', b.therapist_id).eq('business_date', businessDate).maybeSingle();
    room = String(wd?.room ?? '');
  }
  const { data: ins, error } = await auth.svc.from('crm_consents').insert({
    salon_id: salonId,
    booking_id: bookingId,
    room,
    therapist_id: b.therapist_id ?? null,
    business_date: businessDate,
    agreed_title: String(st?.consent_title ?? ''),
    agreed_body: String(st?.consent_body ?? ''),
    signature_png: '',
    user_agent: auth.userId === ADMIN_UUID ? CONSENT_MANUAL_UA + ':admin' : CONSENT_MANUAL_UA,
  }).select('created_at').single();
  if (error || !ins) return { ok: false, error: error ? dbMessage(error, '保存') : '保存できませんでした' };
  return { ok: true, consentAt: String(ins.created_at) };
}

export async function revokeCrmConsentManual(
  salonId: number,
  bookingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const { data, error } = await auth.svc.from('crm_consents')
    .update({ superseded_at: new Date().toISOString() })
    .eq('salon_id', salonId).eq('booking_id', bookingId).is('superseded_at', null)
    .like('user_agent', CONSENT_MANUAL_UA + '%')
    .select('id');
  if (error) return { ok: false, error: dbMessage(error) };
  if (!data || data.length === 0) return { ok: false, error: '取り消せる手動の了承がありません（QR のサインは取り消せません）' };
  return { ok: true };
}
