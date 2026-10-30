'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { placeBookingCall, voiceEnabled } from '@/app/lib/booking/bookingCall';
import { normalizeCallTel, formatE164Jp, CALL_HOUR_OPTIONS } from '@/app/lib/booking/callTel';

// ── 予約の電話通知：マイページの設定・テスト発信・最近の発信（第1703便・2026-10-30）──────────
// ★ 読み書きはサーバー側（service_role）で、オーナー本人か運営のときだけ。
// ★ 第1704便: 設定は salon_call_settings（service_role 専用）。salons は表ごと公開 API から読めるため、番号を置かない。
//   行が無い店は「使っていない」（既定値）として扱い、保存のときに upsert で作る。
// ★ TWILIO_VOICE_ENABLED が無いあいだは available:false を返し、画面は「準備中」の枠のまま。

export type BookingCallSettings = {
  enabled: boolean;
  tel: string;        // 数字のみ（空なら ''）
  start: string;      // 'HH:MM' か ''（いつでも）
  end: string;
  retry: boolean;
};

export type BookingCallLog = {
  id: number;
  createdAt: string;
  kind: 'booking' | 'test';
  attempt: number;
  status: string;
  skipReason: string | null;
  durationSec: number | null;
};

export type BookingCallInfo =
  | { ok: true; available: false }
  | { ok: true; available: true; fromNumber: string; settings: BookingCallSettings; calls: BookingCallLog[] }
  | { ok: false; error: string };

async function assertOwner(salonId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(salonId)) return { ok: false, error: '対象店舗が不正です' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  const { data: salon, error } = await supabase.from('salons').select('owner_id').eq('id', salonId).maybeSingle();
  if (error || !salon) return { ok: false, error: '店舗が見つかりません' };
  if ((salon.owner_id as string | null) !== user.id && user.id !== ADMIN_UUID) {
    return { ok: false, error: 'この店舗の設定を変える権限がありません' };
  }
  return { ok: true };
}

const hm = (t: unknown) => (typeof t === 'string' && /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : '');

export async function getBookingCallInfo(salonId: number): Promise<BookingCallInfo> {
  const auth = await assertOwner(salonId);
  if (!auth.ok) return auth;
  if (!voiceEnabled()) return { ok: true, available: false };

  const svc = createServiceClient();
  const { data: row, error } = await svc
    .from('salon_call_settings')
    .select('booking_call_enabled, booking_call_tel, booking_call_start, booking_call_end, booking_call_retry')
    .eq('salon_id', salonId)
    .maybeSingle();
  if (error) return { ok: false, error: '設定を読めませんでした' };
  const s = row ?? { booking_call_enabled: false, booking_call_tel: null, booking_call_start: null, booking_call_end: null, booking_call_retry: false };

  const { data: rows } = await svc
    .from('booking_calls')
    .select('id, created_at, kind, attempt, status, skip_reason, duration_sec')
    .eq('salon_id', salonId)
    .order('created_at', { ascending: false })
    .limit(5);

  return {
    ok: true,
    available: true,
    fromNumber: formatE164Jp(process.env.TWILIO_FROM_NUMBER),
    settings: {
      enabled: !!s.booking_call_enabled,
      tel: (s.booking_call_tel as string | null) ?? '',
      start: hm(s.booking_call_start),
      end: hm(s.booking_call_end),
      retry: !!s.booking_call_retry,
    },
    calls: (rows ?? []).map((r) => ({
      id: Number(r.id),
      createdAt: String(r.created_at),
      kind: r.kind === 'test' ? 'test' : 'booking',
      attempt: Number(r.attempt ?? 1),
      status: String(r.status),
      skipReason: (r.skip_reason as string | null) ?? null,
      durationSec: r.duration_sec == null ? null : Number(r.duration_sec),
    })),
  };
}

export async function saveBookingCallSettings(
  salonId: number,
  input: BookingCallSettings,
): Promise<{ ok: true; settings: BookingCallSettings } | { ok: false; error: string }> {
  const auth = await assertOwner(salonId);
  if (!auth.ok) return auth;
  if (!voiceEnabled()) return { ok: false, error: '電話通知はまだ準備中です' };

  const rawTel = String(input.tel ?? '').trim();
  const tel = rawTel ? normalizeCallTel(rawTel) : null;
  if (rawTel && !tel) return { ok: false, error: '電話番号の形が正しくありません（0から始まる10〜11桁。0120・0570 などは使えません）' };
  const enabled = !!input.enabled;
  if (enabled && !tel) return { ok: false, error: '電話通知を使うには、かける電話番号を入力してください' };

  const start = CALL_HOUR_OPTIONS.includes(input.start) ? input.start : '';
  const end = CALL_HOUR_OPTIONS.includes(input.end) ? input.end : '';
  if ((start === '') !== (end === '')) return { ok: false, error: '鳴らす時間帯は「始め」と「終わり」を両方選んでください（いつでもよい場合は両方「指定しない」）' };
  if (start && start === end) return { ok: false, error: '鳴らす時間帯の「始め」と「終わり」が同じです' };

  const svc = createServiceClient();
  const { error } = await svc
    .from('salon_call_settings')
    .upsert(
      {
        salon_id: salonId,
        booking_call_enabled: enabled,
        booking_call_tel: tel,
        booking_call_start: start || null,
        booking_call_end: end || null,
        booking_call_retry: !!input.retry,
      },
      { onConflict: 'salon_id' },
    );
  if (error) return { ok: false, error: '保存に失敗しました' };
  return { ok: true, settings: { enabled, tel: tel ?? '', start, end, retry: !!input.retry } };
}

/** 保存済みの番号へテスト発信（1分に1回・1日5回まで）。★ 番号は画面から受け取らない（踏み台にしない）。 */
export async function sendBookingTestCall(salonId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertOwner(salonId);
  if (!auth.ok) return auth;
  const res = await placeBookingCall({ svc: createServiceClient(), salonId, kind: 'test' });
  if (res.ok) return { ok: true };
  const msg: Record<string, string> = {
    disabled: '電話通知はまだ準備中です',
    no_tel: 'かける電話番号が保存されていません。先に入力して保存してください',
    limit: 'テスト発信は1分に1回・1日5回までです。少し時間をおいてお試しください',
    twilio: '電話をかけられませんでした。番号をご確認のうえ、もう一度お試しください',
  };
  return { ok: false, error: msg[res.reason] ?? 'テスト発信に失敗しました。時間をおいてお試しください' };
}
