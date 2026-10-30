import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyAdmin } from '@/app/lib/notifyAdmin';
import { normalizeCallTel } from '@/app/lib/booking/callTel';

export { normalizeCallTel };

// ── 予約の電話通知（Twilio・050番号）第1702便・2026-10-30 ─────────────────────────
//   設計メモ_2026-10-30_予約の電話通知_Twilio.md／DB は 追加SQL_第1701便（salons.booking_call_*・booking_calls）
//
// ★ ネット予約が入ったら、店舗様の電話に自動音声で「予約が入りました」と知らせる。メールはそのまま（電話は追加の知らせ）。
// ★ この関数たちは【例外を投げない】。予約はすでに INSERT 済みで、電話の失敗で予約を止めない・巻き戻さない（sendBookingMail と同じ）。
// ★ 全体の止めスイッチ：環境変数 TWILIO_VOICE_ENABLED が '1' のときだけ発信する（無ければ DB にも何も書かない）。
//   必要な環境変数：TWILIO_ACCOUNT_SID／TWILIO_AUTH_TOKEN（★ 秘密・チャットやメモに貼らない）／TWILIO_FROM_NUMBER（+8150…）
//   任意：TWILIO_VOICE_NAME（読み上げの声・既定 Polly.Mizuki）／TWILIO_VOICE_CALLBACK_URL（結果の受け口・既定 https://fukues.com/api/webhooks/twilio-voice）
// ★ 決めたこと（カッキーさん 10/30）
//   ・読むのは 日時・セラピスト・コースまで。お客様のお名前と電話番号は読まない
//   ・鳴らす時間帯は店舗様が決める（空ならいつでも・日をまたいでもよい）。時間外は鳴らさない（メールは届く）
//   ・再発信は店舗様が選ぶ（既定オフ）。出ない・話中・失敗 のとき 3分後にもう1回（合計2回まで）
//     ★ 留守電に入った回は Twilio では「つながった（completed）」なので、かけ直さない（携帯に着信履歴は残る）
//   ・留守電判定（AMD）と「1を押してください」は使わない
// ★ 記録（booking_calls）に残すのは「電話通知を使っている店」の回だけ。使っていない店の予約では何も書かない（表が予約の数だけ膨らまないように）。

export const CALL_LIMIT_PER_HOUR = 6;      // 1店・1時間（いたずら予約で電話代がかさまないように）
export const CALL_LIMIT_PER_DAY = 30;      // 1店・24時間
export const CALL_LIMIT_GLOBAL_DAY = 200;  // 全店・24時間（超えたら運営にメール）
export const TEST_LIMIT_PER_DAY = 5;       // テスト発信・1店・24時間
export const TEST_GAP_SEC = 60;            // テスト発信は1分に1回
export const RETRY_DELAY_MIN = 3;
export const MAX_ATTEMPTS = 2;
export const RING_TIMEOUT_SEC = 30;        // 留守電につながらなければ約30秒鳴らして切る

const DEFAULT_CALLBACK_URL = 'https://fukues.com/api/webhooks/twilio-voice';
const RETRY_STATUSES = new Set(['busy', 'no-answer', 'failed']);

export type CallKind = 'booking' | 'test';

export function voiceEnabled(): boolean {
  return (
    process.env.TWILIO_VOICE_ENABLED === '1' &&
    !!process.env.TWILIO_ACCOUNT_SID &&
    !!process.env.TWILIO_AUTH_TOKEN &&
    !!process.env.TWILIO_FROM_NUMBER
  );
}

export function callbackUrl(): string {
  return process.env.TWILIO_VOICE_CALLBACK_URL || DEFAULT_CALLBACK_URL;
}

// ── 番号（normalizeCallTel は画面でも使うので callTel.ts に）────────────────
export function toE164(tel: string): string {
  return '+81' + tel.slice(1);
}

// ── 時間帯（JST）─────────────────────────────────────────
function jstParts(d: Date) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  return { month: Number(p.month), day: Number(p.day), hour, minute: Number(p.minute), weekday: String(p.weekday) };
}
function toMin(t: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? ''));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
/** start/end は 'HH:MM[:SS]'（JST）。両方空ならいつでも true。start > end は日をまたぐ。 */
export function inCallHours(start: string | null | undefined, end: string | null | undefined, now: Date = new Date()): boolean {
  const s = toMin(start);
  const e = toMin(end);
  if (s === null || e === null || s === e) return true;
  const { hour, minute } = jstParts(now);
  const n = hour * 60 + minute;
  return s < e ? n >= s && n < e : n >= s || n < e;
}

// ── 読み上げ文 ─────────────────────────────────────────
const WD: Record<string, string> = { Sun: '日', Mon: '月', Tue: '火', Wed: '水', Thu: '木', Fri: '金', Sat: '土' };
/** 「11月3日、火曜日、午後8時30分」の形（数字の羅列にしない・午前/午後を付ける）。 */
export function speakDateTimeJST(iso: string): string {
  const { month, day, hour, minute, weekday } = jstParts(new Date(iso));
  const ampm = hour < 12 ? '午前' : '午後';
  const h = hour % 12 === 0 && hour >= 12 ? 12 : hour % 12;
  const time = `${ampm}${h}時${minute > 0 ? `${minute}分` : ''}`;
  return `${month}月${day}日、${WD[weekday] ?? ''}曜日、${time}`;
}

export function buildBookingSpeech(i: {
  salonName: string; slotStartISO: string; therapistName: string; courseName: string; courseMin: number;
}): string {
  const salon = i.salonName.trim() || 'お店';
  const therapist = i.therapistName.trim();
  const course = i.courseName.trim();
  return [
    `フクエスです。${salon}様に、新しいネット予約が入りました。`,
    `${speakDateTimeJST(i.slotStartISO)}から、`,
    therapist ? `${therapist}さんご指名、` : '',
    course ? `${course}、` : '',
    `${i.courseMin}分です。`,
    '詳しくは、メールまたはマイページをご確認ください。',
  ].join('');
}

export function buildTestSpeech(salonName: string): string {
  const salon = salonName.trim() || 'お店';
  return `フクエスです。${salon}様、予約の電話通知のテストです。ネット予約が入ると、このように、日時とセラピストとコースをお電話でお知らせします。`;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** 2回読んで切る（留守電に入っても2回目はほぼ録音に残る）。 */
export function buildTwiml(text: string): string {
  const voice = xmlEscape(process.env.TWILIO_VOICE_NAME || 'Polly.Mizuki');
  const say = (t: string) => `<Say language="ja-JP" voice="${voice}">${xmlEscape(t)}</Say>`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${say(text)}<Pause length="1"/>${say('もう一度、くり返します。')}${say(text)}</Response>`;
}

// ── 再発信の予定 ───────────────────────────────────────
export function nextAttemptAt(i: { kind: CallKind; status: string; attempt: number; retryEnabled: boolean; now?: Date }): string | null {
  if (i.kind !== 'booking' || !i.retryEnabled) return null;
  if (!RETRY_STATUSES.has(i.status)) return null;   // completed（留守電を含む）はかけ直さない
  if (i.attempt >= MAX_ATTEMPTS) return null;
  return new Date((i.now ?? new Date()).getTime() + RETRY_DELAY_MIN * 60 * 1000).toISOString();
}

// ── Twilio の署名（X-Twilio-Signature）────────────────────────
//   HMAC-SHA1(AuthToken, URL + 並べ替えたキーと値をつなげたもの) を base64。SDK を入れずに数行で書ける。
export function twilioSignature(url: string, params: Record<string, string>, token: string): string {
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  return crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64');
}
export function verifyTwilioSignature(url: string, params: Record<string, string>, signature: string | null): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  const expected = Buffer.from(twilioSignature(url, params, token));
  const got = Buffer.from(signature);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

// ── 発信 ──────────────────────────────────────────────
async function twilioCreateCall(toTel: string, twiml: string): Promise<{ ok: true; sid: string; status: string } | { ok: false; error: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const body = new URLSearchParams({
    To: toE164(toTel),
    From: process.env.TWILIO_FROM_NUMBER!,
    Twiml: twiml,
    Timeout: String(RING_TIMEOUT_SEC),
    StatusCallback: callbackUrl(),
    StatusCallbackMethod: 'POST',
  });
  body.append('StatusCallbackEvent', 'completed');
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Calls.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; message?: string; code?: number };
    if (!res.ok || !json.sid) return { ok: false, error: `${res.status} ${json.code ?? ''} ${json.message ?? ''}`.trim().slice(0, 500) };
    return { ok: true, sid: json.sid, status: json.status ?? 'queued' };
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : '理由不明').slice(0, 500) };
  }
}

type SalonCallRow = {
  name: string | null;
  booking_call_enabled: boolean | null;
  booking_call_tel: string | null;
  booking_call_start: string | null;
  booking_call_end: string | null;
  booking_call_retry: boolean | null;
};

export type PlaceCallResult =
  | { ok: true; callId: number }
  | { ok: false; reason: string; callId?: number };

async function countCalls(svc: SupabaseClient, f: { salonId?: number; kind: CallKind; sinceMs: number }): Promise<number> {
  let q = svc
    .from('booking_calls')
    .select('id', { count: 'exact', head: true })
    .eq('kind', f.kind)
    .neq('status', 'skipped')
    .gte('created_at', new Date(Date.now() - f.sinceMs).toISOString());
  if (f.salonId !== undefined) q = q.eq('salon_id', f.salonId);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * 予約の電話通知を1回かける（kind='booking'）／テスト発信（kind='test'）。
 * ★ 例外を投げない。★ TWILIO_VOICE_ENABLED が無ければ何もしない（DB にも書かない）。
 * ★ booking は「電話通知を使う」がオフの店では何もしない（記録も残さない）。
 */
export async function placeBookingCall(args: {
  svc: SupabaseClient;
  salonId: number;
  kind: CallKind;
  bookingId?: string | number | null;
  attempt?: number;
}): Promise<PlaceCallResult> {
  const { svc, salonId, kind } = args;
  const attempt = Math.max(1, Math.min(MAX_ATTEMPTS, args.attempt ?? 1));
  if (!voiceEnabled()) return { ok: false, reason: 'disabled' };

  try {
    const { data: salon, error: salonErr } = await svc
      .from('salons')
      .select('name, booking_call_enabled, booking_call_tel, booking_call_start, booking_call_end, booking_call_retry')
      .eq('id', salonId)
      .maybeSingle<SalonCallRow>();
    if (salonErr || !salon) return { ok: false, reason: 'no_salon' };
    if (kind === 'booking' && !salon.booking_call_enabled) return { ok: false, reason: 'off' };

    const tel = normalizeCallTel(salon.booking_call_tel);
    const base = { salon_id: salonId, kind, attempt, booking_id: args.bookingId ?? null, to_tel: tel };
    const skip = async (reason: string): Promise<PlaceCallResult> => {
      const { data } = await svc.from('booking_calls').insert({ ...base, status: 'skipped', skip_reason: reason }).select('id').maybeSingle();
      return { ok: false, reason, callId: data ? Number(data.id) : undefined };
    };

    if (!tel) return await skip('no_tel');

    // 読み上げ文（booking は予約の中身から）
    let text: string;
    if (kind === 'booking') {
      if (args.bookingId == null) return { ok: false, reason: 'no_booking' };
      const { data: b } = await svc
        .from('salon_bookings')
        .select('status, slot_start, course_name, course_min, therapist_id')
        .eq('id', args.bookingId)
        .maybeSingle();
      if (!b) return { ok: false, reason: 'no_booking' };
      // 再発信は、店舗様がまだ「確認済み」「キャンセル」にしていない予約だけ
      if (attempt > 1 && b.status !== 'new') return await skip('not_new');
      if (!inCallHours(salon.booking_call_start, salon.booking_call_end)) return await skip('hours');
      let therapistName = '';
      if (b.therapist_id != null) {
        const { data: t } = await svc.from('therapists').select('name').eq('id', b.therapist_id).maybeSingle();
        therapistName = String(t?.name ?? '');
      }
      text = buildBookingSpeech({
        salonName: String(salon.name ?? ''),
        slotStartISO: String(b.slot_start),
        therapistName,
        courseName: String(b.course_name ?? ''),
        courseMin: Number(b.course_min ?? 0),
      });
    } else {
      text = buildTestSpeech(String(salon.name ?? ''));
    }

    // 上限（数えられないときは、かけない側に倒す）
    try {
      if (kind === 'booking') {
        if ((await countCalls(svc, { salonId, kind, sinceMs: 3600_000 })) >= CALL_LIMIT_PER_HOUR) return await skip('limit');
        if ((await countCalls(svc, { salonId, kind, sinceMs: 86400_000 })) >= CALL_LIMIT_PER_DAY) return await skip('limit');
        const g = await countCalls(svc, { kind, sinceMs: 86400_000 });
        if (g >= CALL_LIMIT_GLOBAL_DAY) {
          if (g === CALL_LIMIT_GLOBAL_DAY) {
            await notifyAdmin('【フクエス】予約の電話通知が全体の上限に達しました', [
              `直近24時間の発信が ${CALL_LIMIT_GLOBAL_DAY} 回に達したため、これより先は電話をかけていません（メールは届いています）。`,
              'いたずら予約の可能性があります。/admin で予約と booking_calls を確認してください。',
            ]);
          }
          return await skip('global_limit');
        }
      } else {
        if ((await countCalls(svc, { salonId, kind, sinceMs: TEST_GAP_SEC * 1000 })) >= 1) return await skip('limit');
        if ((await countCalls(svc, { salonId, kind, sinceMs: 86400_000 })) >= TEST_LIMIT_PER_DAY) return await skip('limit');
      }
    } catch (e) {
      console.error('[bookingCall] 上限を数えられなかった', e instanceof Error ? e.message : e);
      return await skip('error');
    }

    const { data: row, error: insErr } = await svc
      .from('booking_calls')
      .insert({ ...base, status: 'queued' })
      .select('id')
      .single();
    if (insErr || !row) {
      console.error('[bookingCall] 記録を作れなかった', insErr?.message);
      return { ok: false, reason: 'error' };
    }
    const callId = Number(row.id);

    const r = await twilioCreateCall(tel, buildTwiml(text));
    if (!r.ok) {
      console.error('[bookingCall] 発信できなかった', r.error);
      await svc
        .from('booking_calls')
        .update({
          status: 'failed',
          error: r.error,
          next_attempt_at: nextAttemptAt({ kind, status: 'failed', attempt, retryEnabled: !!salon.booking_call_retry }),
        })
        .eq('id', callId);
      return { ok: false, reason: 'twilio', callId };
    }
    await svc.from('booking_calls').update({ call_sid: r.sid, status: r.status }).eq('id', callId);
    return { ok: true, callId };
  } catch (e) {
    console.error('[bookingCall] 落ちた', e instanceof Error ? e.message : e);
    return { ok: false, reason: 'error' };
  }
}
