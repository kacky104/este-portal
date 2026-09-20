'use server';

// フクエスCRM：来店時の同意書の【公開側】（第560便・2026-09-20）。部屋の QR（/g/[token]）から使う。
// ★ ログイン不要。token（部屋ごとの合言葉）だけで入れるので、ここでは次を必ず守る：
//   ・お店が同意書を使う設定（crm_settings.consent_enabled）で、CRM が契約中のときだけ
//   ・その部屋にいま予約がある時間だけ（consentCandidates）。送信のときもサーバーで選び直す
//   ・お客様の名前・電話などは返さない（時刻だけ）
//   ・短い時間に何度も送れないように（部屋ごとに10分で10件まで）
// ★ 読み書きは service_role（テーブルは RLS 全閉）。

import { headers } from 'next/headers';
import { createServiceClient } from '@/app/lib/supabase/service';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { consentCandidates, roomOfToken, businessDateNowJST } from '@/app/lib/crm/consentMatch';

export type ConsentPageData =
  | { ok: false; reason: 'invalid' | 'off' | 'no_booking' }
  | {
      ok: true;
      title: string;
      body: string;
      candidates: { bookingId: string; timeLabel: string; agreed: boolean }[];
    };

async function loadSalonConsent(svc: ReturnType<typeof createServiceClient>, salonId: number) {
  const [{ data: salon }, { data: st }] = await Promise.all([
    svc.from('salons').select('crm_until').eq('id', salonId).maybeSingle(),
    svc.from('crm_settings').select('consent_enabled, consent_title, consent_body').eq('salon_id', salonId).maybeSingle(),
  ]);
  const active = !!salon?.crm_until && String(salon.crm_until).slice(0, 10) >= getCalendarDateJST();
  if (!active || !st?.consent_enabled || !String(st.consent_body ?? '').trim()) return null;
  return { title: String(st.consent_title ?? ''), body: String(st.consent_body ?? '') };
}

export async function getConsentPage(token: string): Promise<ConsentPageData> {
  const svc = createServiceClient();
  const room = await roomOfToken(svc, String(token ?? ''));
  if (!room) return { ok: false, reason: 'invalid' };
  const text = await loadSalonConsent(svc, room.salonId);
  if (!text) return { ok: false, reason: 'off' };
  const cands = await consentCandidates(svc, room.salonId, room.room);
  if (cands.length === 0) return { ok: false, reason: 'no_booking' };
  const { data: done } = await svc
    .from('crm_consents').select('booking_id')
    .eq('salon_id', room.salonId).is('superseded_at', null)
    .in('booking_id', cands.map((c) => c.bookingId));
  const agreed = new Set((done ?? []).map((d) => String(d.booking_id)));
  return {
    ok: true,
    title: text.title,
    body: text.body,
    candidates: cands.map((c) => ({ bookingId: c.bookingId, timeLabel: c.timeLabel, agreed: agreed.has(c.bookingId) })),
  };
}

export async function submitConsent(
  token: string,
  bookingId: string,
  agreed: boolean,
  signaturePng: string,
): Promise<{ ok: true; timeLabel: string } | { ok: false; error: string }> {
  if (agreed !== true) return { ok: false, error: '「すべて了承します」に☑を入れてください' };
  const sig = String(signaturePng ?? '');
  // サインは PNG か WebP（第567便：縮めて WebP に。WebP を書き出せない端末は PNG）
  if (!/^data:image\/(png|webp);base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length < 300 || sig.length > 400000) {
    return { ok: false, error: 'サインを書いてください' };
  }
  const svc = createServiceClient();
  const room = await roomOfToken(svc, String(token ?? ''));
  if (!room) return { ok: false, error: 'このQRコードは使えません。お店のスタッフにお声がけください' };
  const text = await loadSalonConsent(svc, room.salonId);
  if (!text) return { ok: false, error: 'いまは受け付けていません。お店のスタッフにお声がけください' };
  const cands = await consentCandidates(svc, room.salonId, room.room);
  const target = cands.find((c) => c.bookingId === String(bookingId));
  if (!target) return { ok: false, error: '予約が見つかりません。お店のスタッフにお声がけください' };

  // 連続送信の見張り（部屋ごとに10分で10件まで）
  const { count } = await svc
    .from('crm_consents').select('id', { count: 'exact', head: true })
    .eq('salon_id', room.salonId).eq('room', room.room)
    .gte('created_at', new Date(Date.now() - 10 * 60000).toISOString());
  if ((count ?? 0) >= 10) return { ok: false, error: '送信が多すぎます。少し待ってからもう一度お試しください' };

  const ua = ((await headers()).get('user-agent') ?? '').slice(0, 300);
  // サインし直し：前のものは消さずに古くする
  await svc.from('crm_consents')
    .update({ superseded_at: new Date().toISOString() })
    .eq('salon_id', room.salonId).eq('booking_id', target.bookingId).is('superseded_at', null);
  const { error } = await svc.from('crm_consents').insert({
    salon_id: room.salonId,
    booking_id: target.bookingId,
    room: room.room,
    therapist_id: target.therapistId,
    business_date: businessDateNowJST(),
    agreed_title: text.title,
    agreed_body: text.body,
    signature_png: sig,
    user_agent: ua,
  });
  if (error) return { ok: false, error: '送信できませんでした。もう一度お試しください' };
  return { ok: true, timeLabel: target.timeLabel };
}
