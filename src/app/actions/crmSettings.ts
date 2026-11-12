'use server';

import { scheduleWindowUtc } from '@/app/lib/booking/slots';
import { dbMessage } from '@/app/lib/crm/dbError';
import { businessDateNowJST } from '@/app/lib/crm/consentMatch';
import { partnerRoomOptions } from '@/app/lib/crm/roomShare';
import { CRM_ROOM_COLORS, normalizeCrmAlarms, normalizeCrmToggles, CRM_TOGGLE_MAX, CRM_TOGGLE_TITLE_LEN, CRM_TOGGLE_OPTION_MAX, CRM_TOGGLE_OPTION_LEN, type CrmSettings, type CrmEndType, type CrmWorkDay, CRM_ROOM_NOTE_MAX, type CrmRoomNote } from '@/app/lib/crm/types';
import { type Svc, assertCrm, validDate, readFail, readMoneyOpts, readSettings } from '@/app/lib/crm/server/core';

/**
 * ★★ 第1232便（カッキーさん）: 待機場所（部屋）の名前を変える。
 *   それまでは「削除→再追加」しかなく、色が初期に戻り、QR が別のトークンになり（印刷した QR が無効に）、過去の出勤情報・同意書は古い名前のまま残っていた。
 *   ★ 1つの処理で4つの表をそろえて書き換える（順番: 設定 → 出勤情報 → QR トークン → 同意書）。
 *   ★ QR トークンは主キー (salon_id, room) の room を書き換えるだけ＝トークンそのものは変わらない＝印刷した QR はそのまま使える。
 *   ★ 途中で失敗したら、そこまでの分は戻せない（RPC にしていない）ので、どこまで変わったかを正直に返す。
 */
export async function renameCrmRoom(
  salonId: number,
  from: string,
  to: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;
  const f = String(from ?? '').trim();
  const t = String(to ?? '').trim();
  if (!f) return { ok: false, error: '元の部屋が不正です' };
  if (!t) return { ok: false, error: '新しい名前を入れてください' };
  if (t.length > 30) return { ok: false, error: '待機場所の名前は30文字までです' };
  if (t === f) return { ok: true };
  let st: CrmSettings;
  try { st = await readSettings(svc, salonId); } catch (e) { return readFail(e); }
  if (!st.rooms.includes(f)) return { ok: false, error: 'その部屋は設定にありません（保存してからもう一度）' };
  if (st.rooms.includes(t)) return { ok: false, error: `「${t}」はもうあります` };
  // 1) 設定（名前の一覧と色）
  const rooms = st.rooms.map((r) => (r === f ? t : r));
  const roomColors: Record<string, string> = {};
  for (const [k, v] of Object.entries(st.roomColors)) roomColors[k === f ? t : k] = v;
  const r1 = await svc.from('crm_settings').update({ rooms, room_colors: roomColors, updated_at: new Date().toISOString() }).eq('salon_id', salonId);
  if (r1.error) return { ok: false, error: `設定の書き換えに失敗しました: ${dbMessage(r1.error, '書き換え')}` };
  // 2) 出勤情報の待機場所（過去の分も・その店の分だけ）
  const r2 = await svc.from('crm_work_days').update({ room: t }).eq('salon_id', salonId).eq('room', f);
  if (r2.error) return { ok: false, error: `出勤情報の書き換えに失敗しました（設定は変わっています）: ${dbMessage(r2.error, '書き換え')}` };
  // 2') ★ 2026-11-12 点検#4: この部屋を【借りている提携店】の出勤情報（room_salon_id＝この店）も新しい名前へ。
  //   前は自店の分だけ書き換えていたので、提携店側は古い名前のまま残り、部屋の鍵（部屋の店, 部屋名）が合わなくなって
  //   相手の予約の帯が出ない・相手の予約が QR の同意書の候補に出ない、になっていた（部屋共有・roomShare.ts）。
  //   ★ 書き換えるのは「この店の部屋を借りている」行の部屋名だけ。提携店のほかの項目・提携店自身の部屋には触らない
  const r2b = await svc.from('crm_work_days').update({ room: t }).eq('room_salon_id', salonId).eq('room', f);
  if (r2b.error) return { ok: false, error: `提携店の出勤情報の書き換えに失敗しました（設定と、このお店の出勤情報は変わっています）: ${dbMessage(r2b.error, '書き換え')}` };
  // 3) QR のトークン（トークンはそのまま・部屋名だけ）
  const r3 = await svc.from('crm_room_tokens').update({ room: t }).eq('salon_id', salonId).eq('room', f);
  if (r3.error) return { ok: false, error: `QR の書き換えに失敗しました（設定・出勤情報は変わっています）: ${dbMessage(r3.error, '書き換え')}` };
  // 4) 同意書の履歴の部屋名
  const r4 = await svc.from('crm_consents').update({ room: t }).eq('salon_id', salonId).eq('room', f);
  if (r4.error) return { ok: false, error: `同意書の書き換えに失敗しました（設定・出勤情報・QR は変わっています）: ${dbMessage(r4.error, '書き換え')}` };
  // 5) ★ 第1443便: 部屋メモも新しい名前へ（列がまだ無い・読めないときは何もしない＝名前の変更そのものは済んでいる）
  const n1 = await svc.from('crm_settings').select('room_notes').eq('salon_id', salonId).maybeSingle();
  if (!n1.error) {
    const notes = parseRoomNotes(n1.data?.room_notes);
    if (notes[f] && !notes[t]) {
      notes[t] = notes[f];
      delete notes[f];
      await svc.from('crm_settings').update({ room_notes: notes }).eq('salon_id', salonId);
    }
  }
  return { ok: true };
}

// ── 部屋メモ（第1443便・2026-10-13・店舗様の要望）──
// ★ 部屋ごとに1つ、ずっと残るメモ（「G401 タオルたたむ」「G1011 オイル補充」）。お店だけ（/cast には出さない）。
// ★ 置き場所は crm_settings.room_notes（jsonb: { 部屋名: { text, at } }）。追加SQL_第1443便。
// ★ 列がまだ無い（SQL 前）ときは、読むと空・保存は「準備中」で断る（CRM のほかの画面には影響しない）。
const ROOM_NOTES_NOT_READY = '部屋メモの準備がまだです（運営に「追加SQL_第1443便」を流してもらってください）';

function parseRoomNotes(raw: unknown): Record<string, CrmRoomNote> {
  const out: Record<string, CrmRoomNote> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    out[k] = { text: String(o.text ?? ''), at: typeof o.at === 'string' ? o.at : null };
  }
  return out;
}

/** 列が無い（SQL 前）ときのエラーか */
function isMissingRoomNotes(e: { message?: string | null; code?: string | null } | null | undefined): boolean {
  const m = String(e?.message ?? '');
  return e?.code === '42703' || e?.code === 'PGRST204' || /room_notes/.test(m);
}

export async function getCrmRoomNotes(
  salonId: number,
): Promise<{ ok: true; rooms: string[]; roomColors: Record<string, string>; notes: Record<string, CrmRoomNote>; ready: boolean } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  let st: CrmSettings;
  try { st = await readSettings(auth.svc, salonId); } catch (e) { return readFail(e); }
  const { data, error } = await auth.svc.from('crm_settings').select('room_notes').eq('salon_id', salonId).maybeSingle();
  if (error) {
    if (isMissingRoomNotes(error)) return { ok: true, rooms: st.rooms, roomColors: st.roomColors, notes: {}, ready: false };
    return readFail(new Error(error.message));
  }
  return { ok: true, rooms: st.rooms, roomColors: st.roomColors, notes: parseRoomNotes(data?.room_notes), ready: true };
}

/** 1部屋ぶんのメモを保存（空にすると消える）。★ ほかの部屋のメモは読み直してから書く（別の端末で書いた分を消さない） */
export async function saveCrmRoomNote(
  salonId: number,
  room: string,
  text: string,
): Promise<{ ok: true; note: CrmRoomNote } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const r = String(room ?? '').trim();
  const t = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (t.length > CRM_ROOM_NOTE_MAX) return { ok: false, error: `メモは${CRM_ROOM_NOTE_MAX}文字までです` };
  let st: CrmSettings;
  try { st = await readSettings(auth.svc, salonId); } catch (e) { return readFail(e); }
  if (!st.rooms.includes(r)) return { ok: false, error: 'この部屋は設定にありません（設定の「待機場所（部屋）」を確かめてください）' };
  const { data, error } = await auth.svc.from('crm_settings').select('room_notes').eq('salon_id', salonId).maybeSingle();
  if (error) return { ok: false, error: isMissingRoomNotes(error) ? ROOM_NOTES_NOT_READY : dbMessage(error, '読み込み') };
  const notes = parseRoomNotes(data?.room_notes);
  const note: CrmRoomNote = { text: t, at: new Date().toISOString() };
  if (t === '') delete notes[r]; else notes[r] = note;
  const up = await auth.svc.from('crm_settings').update({ room_notes: notes }).eq('salon_id', salonId);
  if (up.error) return { ok: false, error: isMissingRoomNotes(up.error) ? ROOM_NOTES_NOT_READY : dbMessage(up.error, '保存') };
  return { ok: true, note: t === '' ? { text: '', at: null } : note };
}

export async function getCrmSettings(
  salonId: number,
): Promise<{ ok: true; settings: CrmSettings } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  try {
    return { ok: true, settings: await readSettings(auth.svc, salonId) };
  } catch (e) {
    return readFail(e); // ★ 第1219便
  }
}

export async function saveCrmSettings(
  salonId: number,
  settings: CrmSettings,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const start = Math.round(Number(settings.dayStartMin));
  const end = Math.round(Number(settings.dayEndMin));
  if (!(start >= 360 && start <= 1800)) return { ok: false, error: '開始時刻は 6:00〜翌6:00 で選んでください' };
  if (!(end >= 420 && end <= 1860)) return { ok: false, error: '終了時刻は 7:00〜翌7:00 で選んでください' };
  if (end <= start) return { ok: false, error: '終了時刻は開始時刻より後にしてください' };
  const rooms = [...new Set((settings.rooms ?? []).map((r) => String(r).trim()).filter(Boolean))];
  if (rooms.length > 50) return { ok: false, error: '待機場所は50件までです' };
  if (rooms.some((r) => r.length > 30)) return { ok: false, error: '待機場所の名前は30文字までです' };
  const rawAlarms = Array.isArray(settings.alarms) ? settings.alarms : [];
  if (rawAlarms.length > 10) return { ok: false, error: 'アラームは10件までです' };
  if (rawAlarms.some((a) => !(Number(a.sec) >= 5 && Number(a.sec) <= 300))) return { ok: false, error: 'アラームの秒数は5〜300秒で入れてください' };
  if (rawAlarms.some((a) => !(Number(a.min) >= 0 && Number(a.min) <= 120))) return { ok: false, error: 'アラームの「○分前」は0〜120分で入れてください' };
  const consentTitle = String(settings.consentTitle ?? '').trim();
  const consentBody = String(settings.consentBody ?? '').replace(/\r\n/g, '\n');
  if (consentTitle.length > 60) return { ok: false, error: '同意書の題名は60文字までです' };
  if (consentBody.length > 8000) return { ok: false, error: '同意書の本文は8000文字までです' };
  if (settings.consentEnabled && !consentBody.trim()) return { ok: false, error: '同意書を使うときは本文を入れてください' };
  // 自由項目（第597便）
  const rawToggles = Array.isArray(settings.customToggles) ? settings.customToggles : [];
  if (rawToggles.length > CRM_TOGGLE_MAX) return { ok: false, error: `出勤情報の項目は${CRM_TOGGLE_MAX}つまでです` };
  for (const t of rawToggles) {
    const title = String(t?.title ?? '').trim();
    const opts = (Array.isArray(t?.options) ? t.options : []).map((x) => String(x).trim()).filter(Boolean);
    if (!title) return { ok: false, error: '出勤情報の項目に題名を入れてください' };
    if (title.length > CRM_TOGGLE_TITLE_LEN) return { ok: false, error: `項目の題名は${CRM_TOGGLE_TITLE_LEN}文字までです` };
    if (opts.length === 0) return { ok: false, error: `「${title}」に選択肢を1つ以上入れてください` };
    if (opts.length > CRM_TOGGLE_OPTION_MAX) return { ok: false, error: `選択肢は1つの項目に${CRM_TOGGLE_OPTION_MAX}個までです` };
    if (opts.some((o) => o.length > CRM_TOGGLE_OPTION_LEN)) return { ok: false, error: `選択肢は${CRM_TOGGLE_OPTION_LEN}文字までです` };
  }
  const customToggles = normalizeCrmToggles(rawToggles);
  const allowed = new Set(CRM_ROOM_COLORS.map((c) => c.key));
  const roomColors: Record<string, string> = {};
  for (const r of rooms) {
    const c = settings.roomColors?.[r];
    if (c && allowed.has(c)) roomColors[r] = c;
  }
  const { error } = await auth.svc.from('crm_settings').upsert({
    salon_id: salonId,
    day_start_min: start,
    day_end_min: end,
    default_end_type: settings.defaultEndType === 'accept' ? 'accept' : 'finish',
    rooms,
    room_colors: roomColors,
    alarms: normalizeCrmAlarms(rawAlarms),
    consent_enabled: !!settings.consentEnabled,
    consent_title: consentTitle,
    consent_body: consentBody,
    cast_pay_enabled: !!settings.castPayEnabled,
    custom_toggles: customToggles,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: dbMessage(error) };
  // ★ 第1415便: 金銭授受の設定は別に書く（列が無い＝追加SQL_第1415便がまだのときも、ほかの設定の保存は止めない）
  {
    const cur = await readMoneyOpts(auth.svc, salonId);
    const wantAuto = !!settings.autoReceivedFrom;
    // ★ 受領の自動は、ON にした日（今日の営業日）から先だけ。すでに ON なら日付は動かさない（過去の残高を変えない）
    const autoFrom = wantAuto ? (cur.autoReceivedFrom ?? businessDateNowJST()) : null;
    const { error: mErr } = await auth.svc.from('crm_settings')
      .update({ money_enabled: settings.moneyEnabled !== false, auto_received_from: autoFrom })
      .eq('salon_id', salonId);
    if (mErr) {
      if (settings.moneyEnabled === false || wantAuto) {
        return { ok: false, error: 'ほかの設定は保存しました。金銭授受の設定は、まだ保存先が用意されていません（運営事務局までご連絡ください）' };
      }
    }
  }
  return { ok: true };
}

/** その日のそのセラピストの「受まで／上がり」を決める */
export async function setCrmWorkEnd(
  salonId: number,
  therapistId: number,
  dateISO: string,
  endType: CrmEndType,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!validDate(dateISO)) return { ok: false, error: '日付が不正です' };
  if (endType !== 'accept' && endType !== 'finish') return { ok: false, error: '種類が不正です' };
  const { data: t } = await auth.svc.from('therapists').select('salon_id').eq('id', therapistId).maybeSingle();
  if (!t || Number(t.salon_id) !== salonId) return { ok: false, error: '女子が見つかりません' };
  const { error } = await auth.svc.from('crm_work_ends').upsert({
    salon_id: salonId, therapist_id: therapistId, business_date: dateISO, end_type: endType,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: dbMessage(error) };
  return { ok: true };
}

export async function saveCrmWorkDay(
  salonId: number,
  therapistId: number,
  dateISO: string,
  wd: CrmWorkDay,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  if (!validDate(dateISO)) return { ok: false, error: '日付が不正です' };
  const { data: t } = await auth.svc.from('therapists').select('salon_id').eq('id', therapistId).maybeSingle();
  if (!t || Number(t.salon_id) !== salonId) return { ok: false, error: '女子が見つかりません' };
  const bs = wd.breakStartMin == null ? null : Math.round(Number(wd.breakStartMin));
  const be = wd.breakEndMin == null ? null : Math.round(Number(wd.breakEndMin));
  if ((bs == null) !== (be == null)) return { ok: false, error: '休憩は開始と終了の両方を選んでください' };
  if (bs != null && be != null) {
    if (bs < 0 || be > 1860) return { ok: false, error: '休憩の時刻が不正です' };
    if (be <= bs) return { ok: false, error: '休憩の終了は開始より後にしてください' };
  }
  const memo = String(wd.breakMemo ?? '').trim();
  const room = String(wd.room ?? '').trim();
  const transport = Math.round(Number(wd.transport) || 0);
  if (memo.length > 100) return { ok: false, error: '休憩メモは100文字までです' };
  if (room.length > 30) return { ok: false, error: '待機場所が長すぎます' };
  if (transport < 0 || transport > 100000) return { ok: false, error: '交通費は0〜100,000円で入れてください' };
  const attendance = ['late', 'absent', 'sent_home'].includes(String(wd.attendance)) ? wd.attendance : '';
  // 自由項目（第597便）：いまの設定にある項目・選択肢だけを保存する
  // ★ 第1219便: 設定が読めなかったら保存しない（自由項目が全部落ちたまま保存されないように）
  let toggleDefs: CrmSettings['customToggles'];
  try { toggleDefs = (await readSettings(auth.svc, salonId)).customToggles; } catch (e) { return readFail(e); }
  const toggleValues: Record<string, string> = {};
  for (const t of toggleDefs) {
    const v = wd.toggles?.[t.id];
    if (v && t.options.includes(v)) toggleValues[t.id] = v;
  }
  // ★ 第1669便: 提携店の部屋（借りた部屋）。部屋共有のグループの相手の店の部屋だけ受け付ける
  let roomSalonId: number | null = wd.roomSalonId == null ? null : Math.round(Number(wd.roomSalonId));
  if (roomSalonId != null && (!Number.isFinite(roomSalonId) || roomSalonId === salonId)) roomSalonId = null;
  if (room && roomSalonId != null) {
    const options = await partnerRoomOptions(auth.svc, salonId);
    if (!options.some((o) => o.salonId === roomSalonId && o.room === room)) return { ok: false, error: '提携店のその部屋はいま選べません（部屋の名前が変わったか、部屋共有が止まっています）' };
  }
  // ★ 同じ部屋で、出勤の時間がほかの人と重なるなら保存しない（第553便）
  //   ★ 第1669便: 比べるのは【自店の中】だけ（借りた部屋も、自店で同じ借り部屋を選んだ人とだけ比べる）。
  //     提携店の人（きほ＝かるあのような同一人物）とは比べない＝重なるのが前提なので止めない
  if (room) {
    const clash = await roomClash(auth.svc, salonId, therapistId, dateISO, room, roomSalonId);
    if (clash) return { ok: false, error: clash };
  }
  const { error } = await auth.svc.from('crm_work_days').upsert({
    salon_id: salonId, therapist_id: therapistId, business_date: dateISO,
    break_start_min: bs, break_end_min: be, break_memo: memo, room, room_salon_id: roomSalonId, attendance, transport,
    toggle_values: toggleValues,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: dbMessage(error) };
  return { ok: true };
}

/**
 * 同じ部屋を同じ時間に使う人がいないか（第553便）。
 * ★ その営業日にその部屋を選んでいるほかのセラピストの出勤（therapist_schedules）と、この人の出勤が重なれば文を返す。
 * ★ 出勤が無い人どうしは比べられないので止めない。
 */
async function roomClash(svc: Svc, salonId: number, therapistId: number, dateISO: string, room: string, roomSalonId: number | null): Promise<string | null> {
  let q = svc
    .from('crm_work_days').select('therapist_id')
    .eq('salon_id', salonId).eq('business_date', dateISO).eq('room', room)
    .neq('therapist_id', therapistId);
  q = roomSalonId == null ? q.is('room_salon_id', null) : q.eq('room_salon_id', roomSalonId);
  // ★ 第1987便（点検 §3）: 読めなければ保存しない（重なりを見落として通さない）
  const CLASH_READ_FAIL = '部屋の重なりを確かめられませんでした。もう一度お試しください';
  const { data: others, error: oErr } = await q;
  if (oErr) return CLASH_READ_FAIL;
  const otherIds = (others ?? []).map((o) => Number(o.therapist_id));
  if (otherIds.length === 0) return null;
  const ids = [therapistId, ...otherIds];
  const { data: sch, error: sErr } = await svc
    .from('therapist_schedules')
    .select('therapist_id, start_time, end_time')
    .in('therapist_id', ids).eq('schedule_date', dateISO).eq('is_active', true);
  if (sErr) return CLASH_READ_FAIL;
  const win = new Map<number, Array<{ s: number; e: number; label: string }>>();
  for (const r of sch ?? []) {
    if (!r.start_time || !r.end_time) continue;
    const start = String(r.start_time).slice(0, 5);
    const end = String(r.end_time).slice(0, 5);
    const { startUtc, endUtc } = scheduleWindowUtc(dateISO, start, end);
    const list = win.get(Number(r.therapist_id)) ?? [];
    list.push({ s: startUtc.getTime(), e: endUtc.getTime(), label: `${start}-${end}` });
    win.set(Number(r.therapist_id), list);
  }
  const mine = win.get(therapistId) ?? [];
  if (mine.length === 0) return null;
  for (const oid of otherIds) {
    for (const o of win.get(oid) ?? []) {
      if (mine.some((m) => m.s < o.e && m.e > o.s)) {
        const { data: t } = await svc.from('therapists').select('name').eq('id', oid).maybeSingle();
        return `${room} は ${String(t?.name ?? 'ほかの人')} さん（${o.label}）が使っています。時間が重なるので選べません`;
      }
    }
  }
  return null;
}
