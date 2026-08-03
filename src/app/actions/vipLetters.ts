'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';

// VIPレターの配信（サーバー専用）。
// - 送信者がその salon の owner 本人（または管理者）であることをサーバー側で検証。
// - vip_letters / vip_letter_recipients への書き込みは service_role でのみ行う（クライアント insert 不可）。

type SendInput = {
  salonId: number;
  title: string;
  body: string;
  couponEnabled: boolean;
  couponDiscount: string;
  couponTerms: string;
  couponExpiresAt: string; // 'YYYY-MM-DD' or ''
  couponColor: string;     // couponColors のキー
};

type OwnerOk = { userId: string };
type OwnerErr = { error: string };

// ログインユーザーがその salon の owner（または管理者UID）かをサーバー側で検証。
async function assertOwner(salonId: number): Promise<OwnerOk | OwnerErr> {
  if (!Number.isFinite(salonId)) return { error: '対象店舗が不正です' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'ログインが必要です' };

  const { data: salon, error } = await supabase
    .from('salons')
    .select('owner_id')
    .eq('id', salonId)
    .maybeSingle();
  if (error || !salon) return { error: '店舗が見つかりません' };

  const ownerId = (salon.owner_id as string | null) ?? null;
  if (ownerId !== user.id && user.id !== ADMIN_UUID) {
    return { error: 'この店舗の送信権限がありません' };
  }
  return { userId: user.id };
}

/** 送信前に「このお店を保存している会員数」を返す（owner検証必須・service_roleで集計）。 */
export async function getSavedSalonMemberCount(
  salonId: number,
): Promise<{ count: number } | { error: string }> {
  const auth = await assertOwner(salonId);
  if ('error' in auth) return { error: auth.error };

  const svc = createServiceClient();
  const { count, error } = await svc
    .from('saved_items')
    .select('user_id', { count: 'exact', head: true })
    .eq('item_type', 'salon')
    .eq('item_id', salonId);
  if (error) return { error: error.message };
  return { count: count ?? 0 };
}

/** VIPレターを送信（スナップショット型）。letter作成→保存者のuser_idをrecipientsへ一括登録。 */
export async function sendVipLetter(
  input: SendInput,
): Promise<{ ok: true; recipientCount: number } | { ok: false; error: string }> {
  const auth = await assertOwner(input.salonId);
  if ('error' in auth) return { ok: false, error: auth.error };

  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) return { ok: false, error: 'タイトルと本文は必須です' };

  const svc = createServiceClient();

  // 保存者（item_type='salon' かつ item_id=salonId）の user_id を全件取得（RLS越え）。
  const { data: savedRows, error: savedErr } = await svc
    .from('saved_items')
    .select('user_id')
    .eq('item_type', 'salon')
    .eq('item_id', input.salonId);
  if (savedErr) return { ok: false, error: savedErr.message };

  const userIds = [...new Set((savedRows ?? []).map(r => r.user_id as string))];
  if (userIds.length === 0) {
    return { ok: false, error: 'このお店を保存している会員がいないため送信できません' };
  }

  // クーポン同梱は「クーポンを付ける」かつ割引内容ありのときのみ。
  const hasCoupon = input.couponEnabled && input.couponDiscount.trim() !== '';

  const { data: letter, error: letterErr } = await svc
    .from('vip_letters')
    .insert({
      salon_id: input.salonId,
      title,
      body,
      coupon_discount: hasCoupon ? input.couponDiscount.trim() : null,
      coupon_terms: hasCoupon ? (input.couponTerms.trim() || null) : null,
      coupon_expires_at: hasCoupon ? (input.couponExpiresAt || null) : null,
      coupon_color: hasCoupon ? input.couponColor : 'pink',
    })
    .select('id')
    .single();
  if (letterErr || !letter) {
    return { ok: false, error: letterErr?.message ?? 'レターの作成に失敗しました' };
  }

  // recipients を一括 insert（read_at は default null）。
  const rows = userIds.map(uid => ({ letter_id: letter.id as string, user_id: uid }));
  const { error: recErr } = await svc.from('vip_letter_recipients').insert(rows);
  if (recErr) return { ok: false, error: recErr.message };

  return { ok: true, recipientCount: userIds.length };
}

// ─────────────────────────────────────────────────────────────
// オープン記念キャンペーン用：口コミ投稿者への個別VIPレター（運営専用）
//
// 通常のVIPレター（sendVipLetter）は「その店を保存している会員全員」への一斉配信だが、
// キャンペーンでは「その店に口コミを書いた会員のうち、抽選で選んだ人」だけに届ける必要がある。
// 宛先が保存者に限られない＝送信条件が緩むため、実行できるのは ADMIN_UUID のみに絞る。
// 安全弁として、宛先は「その店舗のセラピストへ承認済み口コミを書いた実績がある会員」に限定する
// （任意の会員へ運営から自由にメッセージを送れる仕組みにはしない）。
// ─────────────────────────────────────────────────────────────

export type CampaignAuthor = {
  userId: string;
  nickname: string;   // 未設定なら「ゲスト」
  reviewCount: number; // その店舗に書いた承認済み口コミの件数
  latestAt: string;    // 最新投稿日時（ISO）
};

export type CampaignSalon = {
  salonId: number;
  salonName: string;
  authors: CampaignAuthor[]; // 件数の多い順→最新が新しい順
};

const CAMPAIGN_PAGE = 1000; // therapist_reviews のページング単位（getTherapistReviewRanking と同方式）
const CAMPAIGN_MAX_RECIPIENTS = 50; // 1通あたりの宛先上限（誤操作で大量送信されないための安全弁）

/** ログインユーザーが運営（ADMIN_UUID）本人かを検証。 */
async function assertAdmin(): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'ログインが必要です' };
  if (user.id !== ADMIN_UUID) return { error: '権限がありません' };
  return { userId: user.id };
}

/** 承認済み口コミの投稿者を店舗別に集計して返す（運営専用）。退会済み（user_id=null）は除外。 */
export async function getReviewCampaignTargets(): Promise<{ salons: CampaignSalon[] } | { error: string }> {
  const auth = await assertAdmin();
  if ('error' in auth) return { error: auth.error };

  const svc = createServiceClient();

  type Row = { user_id: string | null; therapist_id: number; created_at: string };
  const rows: Row[] = [];
  for (let from = 0; ; from += CAMPAIGN_PAGE) {
    const { data, error } = await svc
      .from('therapist_reviews')
      .select('user_id, therapist_id, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .range(from, from + CAMPAIGN_PAGE - 1);
    if (error) return { error: error.message };
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < CAMPAIGN_PAGE) break;
  }

  // 退会済み会員の口コミ（user_id が NULL）は宛先にできないので落とす。
  const valid = rows.filter((r): r is Row & { user_id: string } => !!r.user_id);
  if (valid.length === 0) return { salons: [] };

  // therapist_id → salon_id
  const therapistIds = [...new Set(valid.map((r) => Number(r.therapist_id)))];
  const { data: therapistRows, error: thErr } = await svc
    .from('therapists')
    .select('id, salon_id')
    .in('id', therapistIds);
  if (thErr) return { error: thErr.message };
  const salonIdByTherapist = new Map<number, number>();
  ((therapistRows ?? []) as Record<string, unknown>[]).forEach((t) => {
    salonIdByTherapist.set(Number(t.id), Number(t.salon_id));
  });

  // salon_id → 店名
  const salonIds = [...new Set([...salonIdByTherapist.values()])];
  const { data: salonRows, error: sErr } = await svc.from('salons').select('id, name').in('id', salonIds);
  if (sErr) return { error: sErr.message };
  const salonNameById = new Map<number, string>();
  ((salonRows ?? []) as Record<string, unknown>[]).forEach((s) => {
    salonNameById.set(Number(s.id), (s.name as string) ?? '');
  });

  // user_id → nickname（未設定は「ゲスト」）
  const userIds = [...new Set(valid.map((r) => r.user_id))];
  const { data: profileRows, error: pErr } = await svc.from('profiles').select('id, nickname').in('id', userIds);
  if (pErr) return { error: pErr.message };
  const nicknameById = new Map<string, string>();
  ((profileRows ?? []) as Record<string, unknown>[]).forEach((p) => {
    const nn = (p.nickname as string | null)?.trim();
    if (nn) nicknameById.set(p.id as string, nn);
  });

  // 店舗 × 会員で集計。
  const bucket = new Map<number, Map<string, { count: number; latestAt: string }>>();
  for (const r of valid) {
    const salonId = salonIdByTherapist.get(Number(r.therapist_id));
    if (salonId === undefined) continue; // セラピストが消えている口コミは対象外
    if (!bucket.has(salonId)) bucket.set(salonId, new Map());
    const perUser = bucket.get(salonId)!;
    const cur = perUser.get(r.user_id);
    const at = String(r.created_at);
    if (cur) {
      cur.count += 1;
      if (at > cur.latestAt) cur.latestAt = at;
    } else {
      perUser.set(r.user_id, { count: 1, latestAt: at });
    }
  }

  const salons: CampaignSalon[] = [...bucket.entries()]
    .map(([salonId, perUser]) => ({
      salonId,
      salonName: salonNameById.get(salonId) ?? `店舗#${salonId}`,
      authors: [...perUser.entries()]
        .map(([userId, v]) => ({
          userId,
          nickname: nicknameById.get(userId) ?? 'ゲスト',
          reviewCount: v.count,
          latestAt: v.latestAt,
        }))
        .sort((a, b) => b.reviewCount - a.reviewCount || (a.latestAt < b.latestAt ? 1 : -1)),
    }))
    .sort((a, b) => b.authors.length - a.authors.length || a.salonName.localeCompare(b.salonName, 'ja'));

  return { salons };
}

/** 指定した会員だけにVIPレターを送る（運営専用・宛先はその店の口コミ投稿者に限定）。 */
export async function sendCampaignVipLetter(
  input: SendInput & { recipientUserIds: string[] },
): Promise<{ ok: true; recipientCount: number } | { ok: false; error: string }> {
  const auth = await assertAdmin();
  if ('error' in auth) return { ok: false, error: auth.error };

  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) return { ok: false, error: 'タイトルと本文は必須です' };
  if (!Number.isFinite(input.salonId)) return { ok: false, error: '対象店舗が不正です' };

  const recipients = [...new Set((input.recipientUserIds ?? []).filter(Boolean))];
  if (recipients.length === 0) return { ok: false, error: '送信先の会員を選んでください' };
  if (recipients.length > CAMPAIGN_MAX_RECIPIENTS) {
    return { ok: false, error: `一度に送れるのは${CAMPAIGN_MAX_RECIPIENTS}人までです` };
  }

  const svc = createServiceClient();

  // 店舗の実在確認。
  const { data: salon, error: salonErr } = await svc
    .from('salons')
    .select('id')
    .eq('id', input.salonId)
    .maybeSingle();
  if (salonErr || !salon) return { ok: false, error: '店舗が見つかりません' };

  // 安全弁：宛先が「この店舗のセラピストへ承認済み口コミを書いた会員」であることを確認する。
  const { data: therapistRows, error: thErr } = await svc
    .from('therapists')
    .select('id')
    .eq('salon_id', input.salonId);
  if (thErr) return { ok: false, error: thErr.message };
  const therapistIds = ((therapistRows ?? []) as Record<string, unknown>[]).map((t) => Number(t.id));
  if (therapistIds.length === 0) return { ok: false, error: 'この店舗にセラピストが登録されていません' };

  const { data: reviewRows, error: rvErr } = await svc
    .from('therapist_reviews')
    .select('user_id')
    .eq('status', 'approved')
    .in('therapist_id', therapistIds)
    .in('user_id', recipients);
  if (rvErr) return { ok: false, error: rvErr.message };
  const allowed = new Set(
    ((reviewRows ?? []) as Record<string, unknown>[])
      .map((r) => r.user_id as string | null)
      .filter((v): v is string => !!v),
  );
  const rejected = recipients.filter((uid) => !allowed.has(uid));
  if (rejected.length > 0) {
    return { ok: false, error: 'この店舗に口コミを書いていない会員が含まれています。選び直してください' };
  }

  const hasCoupon = input.couponEnabled && input.couponDiscount.trim() !== '';

  const { data: letter, error: letterErr } = await svc
    .from('vip_letters')
    .insert({
      salon_id: input.salonId,
      title,
      body,
      coupon_discount: hasCoupon ? input.couponDiscount.trim() : null,
      coupon_terms: hasCoupon ? (input.couponTerms.trim() || null) : null,
      coupon_expires_at: hasCoupon ? (input.couponExpiresAt || null) : null,
      coupon_color: hasCoupon ? input.couponColor : 'pink',
    })
    .select('id')
    .single();
  if (letterErr || !letter) {
    return { ok: false, error: letterErr?.message ?? 'レターの作成に失敗しました' };
  }

  const rows = recipients.map((uid) => ({ letter_id: letter.id as string, user_id: uid }));
  const { error: recErr } = await svc.from('vip_letter_recipients').insert(rows);
  if (recErr) return { ok: false, error: recErr.message };

  return { ok: true, recipientCount: recipients.length };
}
