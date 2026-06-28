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

// admin API でメールアドレス一致の Auth ユーザー id を特定する。
// supabase-js には getUserByEmail が無いため listUsers をページングし、メール完全一致（小文字比較）で探す。
// 見つからなければ null（既に削除済み等）。一致しないユーザーは絶対に返さない＝誤削除防止。
async function findAuthUserIdByEmail(svc: Svc, email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  const perPage = 1000;
  // 安全のため最大ページ数を制限（perPage=1000 × 50 = 5万ユーザーまで）。
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const users = data?.users ?? [];
    const found = users.find(u => (u.email ?? '').trim().toLowerCase() === target);
    if (found) return found.id;
    if (users.length < perPage) break; // 最終ページ
  }
  return null;
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

  // 同一メールの重複招待ガード：このメールが【自分以外の】セラピスト行で
  // 既に使われていないか確認する。本人ログイン済み(user_id 非null)でも
  // 招待中(invited_email 一致)でも、別人の行で使われていればブロックする。
  // 自分自身(input.therapistId)の行は除外＝同じ行への再招待・上書きは許可。
  const { data: dupRows, error: dupErr } = await svc
    .from('therapists')
    .select('id, user_id, invited_email')
    .or(`user_id.not.is.null,invited_email.ilike.${email}`)
    .neq('id', input.therapistId);

  if (dupErr) {
    return { ok: false, error: `重複確認に失敗しました: ${dupErr.message}` };
  }

  const emailLower = email.toLowerCase();
  const conflict = (dupRows ?? []).some((r) => {
    const invited = (r.invited_email ?? '').trim().toLowerCase();
    // 別人が同じメールで「招待中」または「本人ログイン済み」かを判定。
    // user_id 非null の行は、そのメールで実アカウントを持っている可能性。
    return invited === emailLower;
  });

  if (conflict) {
    return {
      ok: false,
      error: 'このメールアドレスは既に別のセラピストに使われています。別のメールアドレスを指定してください。',
    };
  }

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
 * 招待を取り消す：「招待中・本人未ログイン（invited_email あり かつ user_id=null）」のセラピストのみ対象。
 *
 * - invited_email 一致の Auth ユーザー（パスワード未設定のまま残る招待ユーザー）を admin API で削除し、
 *   同じメールでの再招待時に「既に登録済み」エラーが出ないようにする。
 * - therapists.invited_email を null に戻し、/mypage 表示を「未招待」へ。
 * - 本人ログイン済み（user_id あり）のセラピストには使えない（失効は unlinkCast を使う）。Auth 誤削除防止。
 * - 順序：Auth ユーザー削除 → invited_email クリア。Auth が見つからない/削除失敗でも握って、
 *   invited_email クリアは必ず完了させる（中途半端な「招待中だがユーザー消失」状態を残さない）。
 */
export async function cancelCastInvite(input: { therapistId: string; salonId: number }): Promise<ActionResult> {
  const auth = await assertOwner(input.salonId);
  if ('error' in auth) return { ok: false, error: auth.error };

  const svc = createServiceClient();
  const t = await getTherapistInSalon(svc, input.therapistId, input.salonId);
  if (!t) return { ok: false, error: 'セラピストが見つかりません' };
  // 対象の厳密限定：本人ログイン済みは取り消し不可（Auth削除を絶対にさせない）。
  if (t.user_id) return { ok: false, error: '本人ログイン済みのため取り消せません。失効する場合は「紐付け解除」を使用してください' };
  const email = (t.invited_email ?? '').trim();
  if (!email) return { ok: false, error: '招待先メールアドレスがありません（既に未招待です）' };

  // 1) invited_email 一致の Auth ユーザーを削除（見つからない・失敗しても握って続行）。
  let warning: string | undefined;
  try {
    const uid = await findAuthUserIdByEmail(svc, email);
    if (uid) {
      // fukuX(x_profiles) がこの auth ユーザーを使っているか確認。
      // 使っていれば auth.users を消すと ON DELETE CASCADE で fukuX プロフィールが
      // 道連れに消えるため、削除をスキップして invited_email クリアのみに留める。
      const { count: xCount, error: xErr } = await svc
        .from('x_profiles')
        .select('auth_user_id', { count: 'exact', head: true })
        .eq('auth_user_id', uid);

      if (xErr) {
        // 確認に失敗したら安全側に倒して削除しない（消すより残す方が安全）。
        warning =
          '招待は取り消しましたが、安全確認のためAuthユーザーは削除しませんでした。';
      } else if ((xCount ?? 0) > 0) {
        // fukuX 利用者：絶対に消さない。
        warning =
          'このメールアドレスはfukuXアカウントと共有のため、Authユーザーは削除しませんでした（招待のみ取り消し）。';
      } else {
        // 純粋な招待捨てユーザー：従来通り削除。
        const { error: delErr } = await svc.auth.admin.deleteUser(uid);
        if (delErr) {
          warning = `招待は取り消しましたが、Authユーザーの削除に失敗しました: ${delErr.message}`;
        }
      }
    }
    // uid が無い場合は既に削除済み等。invited_email クリアへ進む。
  } catch {
    warning = '招待は取り消しましたが、Auth処理中にエラーが発生しました。';
  }

  // 2) therapists.invited_email を null に戻す（中途半端な状態を残さない）。
  const { error: upErr } = await svc.from('therapists').update({ invited_email: null }).eq('id', input.therapistId);
  if (upErr) return { ok: false, error: `招待の取り消しに失敗しました: ${upErr.message}` };

  return { ok: true, email, warning };
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
