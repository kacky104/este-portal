'use server';

import { headers } from 'next/headers';
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';

// キャスト（セラピスト本人）招待・本人化のサーバー専用処理。
// - オーナー操作（招待/再送/紐付け解除）は assertOwner で「その salon のオーナー本人 or 管理者」を検証。
// - therapists.user_id / invited_email の更新と auth.admin.inviteUserByEmail は service_role でのみ実行。
//   service_role キーは Server Action 内に閉じ込め、クライアントへ絶対に露出しない。
// - 本人化（claimCastTherapist）はログイン中の本人が自分のメール一致レコードにのみ紐付け可能。

// 招待リンクの着地先：/auth/callback でセッション確立 → /cast/welcome でパスワード設定＆本人化。
const INVITE_NEXT = '/cast/welcome';

type ActionResult = { ok: true; email?: string; warning?: string } | { ok: false; error: string };
type ClaimResult =
  | { ok: true; therapistName: string | null }
  | { ok: false; error: string; code?: 'no_session' | 'not_found' };

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// 招待メールの戻り先オリジン。本番（プロキシ配下）は x-forwarded-host を優先、ローカルは host。
async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'development' ? 'http' : 'https');
  return host ? `${proto}://${host}` : 'https://fukues.com';
}

type Svc = ReturnType<typeof createServiceClient>;
type OwnerOk = { userId: string };
type OwnerErr = { error: string };

// ログインユーザーがその salon の owner（または管理者UID）かをサーバー側で検証。
async function assertOwner(salonId: number): Promise<OwnerOk | OwnerErr> {
  if (!Number.isFinite(salonId)) return { error: '対象サロンが不正です' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'ログインが必要です' };

  const { data: salon, error } = await supabase
    .from('salons')
    .select('owner_id')
    .eq('id', salonId)
    .maybeSingle();
  if (error || !salon) return { error: 'サロンが見つかりません' };

  const ownerId = (salon.owner_id as string | null) ?? null;
  if (ownerId !== user.id && user.id !== ADMIN_UUID) {
    return { error: 'このサロンの操作権限がありません' };
  }
  return { userId: user.id };
}

// 指定セラピストが指定 salon に属するか service_role で検証して行を返す。
async function getTherapistInSalon(svc: Svc, therapistId: string, salonId: number) {
  const { data } = await svc
    .from('therapists')
    .select('id, name, salon_id, user_id, invited_email')
    .eq('id', therapistId)
    .maybeSingle();
  if (!data || Number(data.salon_id) !== Number(salonId)) return null;
  return data as { id: string; name: string | null; salon_id: number; user_id: string | null; invited_email: string | null };
}

// inviteUserByEmail を実行。既存ユーザー（Auth登録済み）は招待を送れないため warning で返す。
async function sendInvite(svc: Svc, email: string): Promise<ActionResult> {
  const origin = await getOrigin();
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(INVITE_NEXT)}`;
  const { error } = await svc.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) {
    const m = (error.message ?? '').toLowerCase();
    const code = (error as { code?: string }).code;
    if (code === 'email_exists' || m.includes('already been registered') || m.includes('already registered')) {
      return {
        ok: true,
        email,
        warning: 'このメールアドレスは既にアカウント登録済みのため、招待メールは送信されませんでした。本人に /cast/login からログインしてもらってください。',
      };
    }
    return { ok: false, error: `招待メールの送信に失敗しました: ${error.message}` };
  }
  return { ok: true, email };
}

/** 招待する：invited_email を保存し、招待メールを送信。 */
export async function inviteCast(input: { therapistId: string; salonId: number; email: string }): Promise<ActionResult> {
  const auth = await assertOwner(input.salonId);
  if ('error' in auth) return { ok: false, error: auth.error };

  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) return { ok: false, error: 'メールアドレスの形式が正しくありません' };

  const svc = createServiceClient();
  const t = await getTherapistInSalon(svc, input.therapistId, input.salonId);
  if (!t) return { ok: false, error: 'セラピストが見つかりません' };
  if (t.user_id) return { ok: false, error: 'このセラピストは既に本人ログイン済みです' };

  const { error: upErr } = await svc.from('therapists').update({ invited_email: email }).eq('id', input.therapistId);
  if (upErr) return { ok: false, error: `招待先の保存に失敗しました: ${upErr.message}` };

  return sendInvite(svc, email);
}

/** 招待を再送：既存の invited_email に対して招待メールを再送。 */
export async function resendCastInvite(input: { therapistId: string; salonId: number }): Promise<ActionResult> {
  const auth = await assertOwner(input.salonId);
  if ('error' in auth) return { ok: false, error: auth.error };

  const svc = createServiceClient();
  const t = await getTherapistInSalon(svc, input.therapistId, input.salonId);
  if (!t) return { ok: false, error: 'セラピストが見つかりません' };
  if (t.user_id) return { ok: false, error: '既に本人ログイン済みです' };

  const email = (t.invited_email ?? '').trim();
  if (!email) return { ok: false, error: '招待先メールアドレスがありません。先に招待してください' };

  return sendInvite(svc, email);
}

/**
 * 紐付け解除：therapists.user_id を null に戻し、invited_email もクリアする（Authユーザーは削除しない）。
 *
 * invited_email も消すのが重要：claimCastTherapist は「invited_email 一致 かつ user_id=null」の
 * レコードに自動で本人化（user_id 再セット）する。invited_email を残すと、解除されたアカウントが
 * /cast/login で再ログインした瞬間に自動で紐付け直され、/cast に入れてしまう（セキュリティホール）。
 * 解除＝完全失効とし、再び入れるにはオーナーが明示的に再招待する運用にする。
 * （DB列を増やさずに「初回ログイン待ちの招待者」と「解除済み元キャスト」を区別する唯一の方法）
 */
export async function unlinkCast(input: { therapistId: string; salonId: number }): Promise<ActionResult> {
  const auth = await assertOwner(input.salonId);
  if ('error' in auth) return { ok: false, error: auth.error };

  const svc = createServiceClient();
  const t = await getTherapistInSalon(svc, input.therapistId, input.salonId);
  if (!t) return { ok: false, error: 'セラピストが見つかりません' };

  const { error } = await svc
    .from('therapists')
    .update({ user_id: null, invited_email: null })
    .eq('id', input.therapistId);
  if (error) return { ok: false, error: `紐付け解除に失敗しました: ${error.message}` };
  return { ok: true };
}

/**
 * 本人化：ログイン中ユーザーのメールと invited_email が一致し かつ user_id=null の
 * therapists レコードに、本人の user_id を紐付ける。冪等（既に本人化済みなら ok）。
 */
export async function claimCastTherapist(): Promise<ClaimResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です', code: 'no_session' };

  const email = (user.email ?? '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'メールアドレスが取得できません' };

  const svc = createServiceClient();

  // 既にこのユーザーへ紐付くレコードがあれば冪等にOK。
  const { data: existing } = await svc
    .from('therapists')
    .select('id, name')
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing) return { ok: true, therapistName: (existing.name as string | null) ?? null };

  // invited_email 一致 かつ 未紐付け のレコードを探す。
  const { data: match } = await svc
    .from('therapists')
    .select('id, name')
    .ilike('invited_email', email)
    .is('user_id', null)
    .maybeSingle();
  if (!match) {
    return {
      ok: false,
      code: 'not_found',
      error: 'この招待に対応するセラピストが見つかりません。オーナーに招待先メールアドレスをご確認ください。',
    };
  }

  // user_id をセット（user_id=null 条件付きで競合を防止。UNIQUE制約が二重紐付けを最終的に防ぐ）。
  const { error: upErr } = await svc
    .from('therapists')
    .update({ user_id: user.id })
    .eq('id', match.id)
    .is('user_id', null);
  if (upErr) return { ok: false, error: `本人化に失敗しました: ${upErr.message}` };

  return { ok: true, therapistName: (match.name as string | null) ?? null };
}
