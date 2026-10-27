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
import { consentCandidates, roomOfToken, businessDateNowJST, type ConsentCandidate } from '@/app/lib/crm/consentMatch';
import { createVisitClaim } from '@/app/lib/points/server';

export type ConsentPageData =
  | { ok: false; reason: 'invalid' | 'off' | 'no_booking' }
  | {
      ok: true;
      /** 同意書の文面（★ 第1669便: 提携店の予約は【その店】の文面。候補の textIdx で引く。1件目が既定） */
      texts: { title: string; body: string }[];
      candidates: { bookingId: string; timeLabel: string; agreed: boolean; textIdx: number }[];
    };

type ConsentText = { title: string; body: string; salonPublic: boolean };

/**
 * 候補の店ごとに同意書の文面を読み、使えない店（CRM が切れている・同意書オフ）の候補を落とす。
 * ★ 第1669便: 提携店の予約は、その店の同意書・CRM契約で判断する。QR の店の設定で代用しない。
 */
async function textsForCandidates(svc: ReturnType<typeof createServiceClient>, cands: ConsentCandidate[]) {
  const bySalon = new Map<number, ConsentText | null>();
  for (const sid of new Set(cands.map((c) => c.salonId))) bySalon.set(sid, await loadSalonConsent(svc, sid));
  return { bySalon, usable: cands.filter((c) => bySalon.get(c.salonId)) };
}

async function loadSalonConsent(svc: ReturnType<typeof createServiceClient>, salonId: number) {
  const [{ data: salon }, { data: st }] = await Promise.all([
    svc.from('salons').select('crm_until, is_hidden').eq('id', salonId).maybeSingle(), // is_hidden は第1404便（完了画面からフクエスのお店ページへ案内してよいか）
    svc.from('crm_settings').select('consent_enabled, consent_title, consent_body').eq('salon_id', salonId).maybeSingle(),
  ]);
  const active = !!salon?.crm_until && String(salon.crm_until).slice(0, 10) >= getCalendarDateJST();
  if (!active || !st?.consent_enabled || !String(st.consent_body ?? '').trim()) return null;
  return { title: String(st.consent_title ?? ''), body: String(st.consent_body ?? ''), salonPublic: !!salon && salon.is_hidden !== true };
}

export async function getConsentPage(token: string): Promise<ConsentPageData> {
  const svc = createServiceClient();
  const room = await roomOfToken(svc, String(token ?? ''));
  if (!room) return { ok: false, reason: 'invalid' };
  // ★ QR の店が CRM 契約中でなければ使わない（部屋を貸している側の契約が切れたら、その QR も止まる）
  const { data: host } = await svc.from('salons').select('crm_until').eq('id', room.salonId).maybeSingle();
  if (!host?.crm_until || String(host.crm_until).slice(0, 10) < getCalendarDateJST()) return { ok: false, reason: 'off' };
  const all = await consentCandidates(svc, room.salonId, room.room);
  const hostText = await loadSalonConsent(svc, room.salonId);
  if (all.length === 0) return { ok: false, reason: hostText ? 'no_booking' : 'off' };
  const { bySalon, usable } = await textsForCandidates(svc, all);
  if (usable.length === 0) return { ok: false, reason: 'off' };
  const { data: done } = await svc
    .from('crm_consents').select('booking_id')
    .is('superseded_at', null)
    .in('booking_id', usable.map((c) => c.bookingId));
  const agreed = new Set((done ?? []).map((d) => String(d.booking_id)));
  const texts: { title: string; body: string }[] = [];
  const idxOf = new Map<number, number>();
  for (const c of usable) {
    if (idxOf.has(c.salonId)) continue;
    const t = bySalon.get(c.salonId)!;
    idxOf.set(c.salonId, texts.length);
    texts.push({ title: t.title, body: t.body });
  }
  return {
    ok: true,
    texts,
    candidates: usable.map((c) => ({ bookingId: c.bookingId, timeLabel: c.timeLabel, agreed: agreed.has(c.bookingId), textIdx: idxOf.get(c.salonId) ?? 0 })),
  };
}

export async function submitConsent(
  token: string,
  bookingId: string,
  agreed: boolean,
  signaturePng: string,
): Promise<{ ok: true; timeLabel: string; salonId: number | null; therapistId: number | null; pointToken: string | null } | { ok: false; error: string }> {
  if (agreed !== true) return { ok: false, error: '「すべて了承します」に☑を入れてください' };
  const sig = String(signaturePng ?? '');
  // サインは PNG か WebP（第567便：縮めて WebP に。WebP を書き出せない端末は PNG）
  if (!/^data:image\/(png|webp);base64,[A-Za-z0-9+/=]+$/.test(sig) || sig.length < 300 || sig.length > 400000) {
    return { ok: false, error: 'サインを書いてください' };
  }
  const svc = createServiceClient();
  const room = await roomOfToken(svc, String(token ?? ''));
  if (!room) return { ok: false, error: 'このQRコードは使えません。お店のスタッフにお声がけください' };
  const { data: host } = await svc.from('salons').select('crm_until').eq('id', room.salonId).maybeSingle();
  if (!host?.crm_until || String(host.crm_until).slice(0, 10) < getCalendarDateJST()) return { ok: false, error: 'いまは受け付けていません。お店のスタッフにお声がけください' };
  const cands = await consentCandidates(svc, room.salonId, room.room);
  const target = cands.find((c) => c.bookingId === String(bookingId));
  if (!target) return { ok: false, error: '予約が見つかりません。お店のスタッフにお声がけください' };
  // ★ 第1669便: 文面・保存先・完了画面は【予約の店】（提携店が部屋を借りているときは、その提携店）
  const text = await loadSalonConsent(svc, target.salonId);
  if (!text) return { ok: false, error: 'いまは受け付けていません。お店のスタッフにお声がけください' };
  const roomLabel = target.salonId === room.salonId ? room.room : await borrowedRoomLabel(svc, room.salonId, room.room);

  // 連続送信の見張り（部屋ごとに10分で10件まで）
  const { count } = await svc
    .from('crm_consents').select('id', { count: 'exact', head: true })
    .eq('salon_id', target.salonId).eq('room', roomLabel)
    .gte('created_at', new Date(Date.now() - 10 * 60000).toISOString());
  if ((count ?? 0) >= 10) return { ok: false, error: '送信が多すぎます。少し待ってからもう一度お試しください' };

  const ua = ((await headers()).get('user-agent') ?? '').slice(0, 300);
  // サインし直し：前のものは消さずに古くする。
  // ★ 2026-10-09 点検#12: 【先に新しいサインを入れて、成功したら前のを古くする】（前は 古くする→入れる で、入れるのが失敗すると
  //   有効なサインが1つも無い状態になった＝サインし直しの失敗で元のサインまで失う）。
  const { data: ins, error } = await svc.from('crm_consents').insert({
    salon_id: target.salonId,
    booking_id: target.bookingId,
    room: roomLabel,
    therapist_id: target.therapistId,
    business_date: businessDateNowJST(),
    agreed_title: text.title,
    agreed_body: text.body,
    signature_png: sig,
    user_agent: ua,
  }).select('id').single();
  if (error || !ins) return { ok: false, error: '送信できませんでした。もう一度お試しください' };
  const { error: supErr } = await svc.from('crm_consents')
    .update({ superseded_at: new Date().toISOString() })
    .eq('salon_id', target.salonId).eq('booking_id', target.bookingId).is('superseded_at', null).neq('id', ins.id);
  if (supErr) console.error('[consent] 前のサインを古くできなかった', target.bookingId, supErr.message); // ★ 新しいサインは入っている。画面側は最新を使う
  // ★ 第1404便: 完了画面に「このお店のフクエスのページ」への案内を出すため、お店の番号だけ返す（★ フクエスで非表示のお店は返さない＝案内を出さない）。お客様の情報は返さない
  // ★ 第1444便: フクエスポイント加盟店なら、この予約の来店ポイントの受け取り券（予約1件に1枚・24時間）。★ 失敗しても同意は済んでいる（null＝欄を出さない）
  const pointToken = await createVisitClaim(svc, target.salonId, target.bookingId, businessDateNowJST());
  // ★ 第1655便: 完了画面の「本日のセラピスト」用に、担当セラピストの番号も返す（★ お店が公開のときだけ。在籍・所属は完了画面で確かめ直す）
  const therapistId = text.salonPublic && target.therapistId != null && target.therapistId > 0 ? target.therapistId : null;
  return { ok: true, timeLabel: target.timeLabel, salonId: text.salonPublic ? target.salonId : null, therapistId, pointToken };
}

/** 借りた部屋の記録名「ラビリンス 部屋A」（★ 30文字に収める。店名は貸している店の名前） */
async function borrowedRoomLabel(svc: ReturnType<typeof createServiceClient>, hostSalonId: number, room: string): Promise<string> {
  const { data } = await svc.from('salons').select('name').eq('id', hostSalonId).maybeSingle();
  const name = String(data?.name ?? '').trim();
  const label = name ? `${name} ${room}` : room;
  return label.length > 30 ? label.slice(0, 30) : label;
}
