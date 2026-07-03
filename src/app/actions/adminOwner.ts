'use server';

import { headers } from 'next/headers';
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { createPublicClient } from '@/app/lib/supabase/public';
import { ADMIN_UUID } from '@/app/lib/admin';

// オーナー交代運用：既存アカウントを引き継ぎ、ログインメールだけを新オーナーへ差し替える。
// auth.users の操作を含むため service_role 専用。すべて requireAdmin（認証→ADMIN_UUID照合）で保護し、
// service_role キーはこのサーバーモジュール内に閉じ込める（クライアントへ絶対に露出しない）。
// サロンの owner_uuid 自体は自動変更しない（UUID欄の手動編集は従来どおり）。

type Err = { ok: false; error: string };

async function requireAdmin(): Promise<{ ok: true } | Err> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  if (user.id !== ADMIN_UUID) return { ok: false, error: '管理者専用です' };
  return { ok: true };
}

// 簡易メール形式チェック（サーバー側の最終防衛。UI 側でも同等の確認をする）。
function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// ── 現在のログインメール取得 ──
// owner_uuid に対応する auth.users の email を返す。未設定・該当ユーザー無しは linked:false。
export async function adminGetOwnerEmail(
  ownerUuid: string | null,
): Promise<{ ok: true; email: string | null; linked: boolean } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const uid = (ownerUuid ?? '').trim();
  if (!uid) return { ok: true, email: null, linked: false };

  const svc = createServiceClient();
  const { data, error } = await svc.auth.admin.getUserById(uid);
  if (error || !data?.user) return { ok: true, email: null, linked: false };
  return { ok: true, email: data.user.email ?? null, linked: true };
}

// ── ログインメール変更 ──
// updateUserById(uid, { email, email_confirm: true }) で確認メール無しに即時反映する。
// 変更前後が同一なら何もしない。既に他アカウントで使用中などは Supabase のエラーをそのまま返す。
export async function adminUpdateOwnerEmail(
  ownerUuid: string,
  newEmail: string,
): Promise<{ ok: true; email: string } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const uid = (ownerUuid ?? '').trim();
  const email = (newEmail ?? '').trim();
  if (!uid) return { ok: false, error: 'オーナーUUIDが未設定です' };
  if (!isValidEmail(email)) return { ok: false, error: 'メールアドレスの形式が正しくありません' };

  const svc = createServiceClient();

  // 現在のメールを取得（存在確認＋同一チェック）。
  const { data: current, error: getErr } = await svc.auth.admin.getUserById(uid);
  if (getErr || !current?.user) return { ok: false, error: '対象アカウントが見つかりません' };
  if ((current.user.email ?? '').toLowerCase() === email.toLowerCase()) {
    return { ok: false, error: '新しいメールが現在のメールと同じです' };
  }

  // email_confirm: true ＝ 確認メール無しで即時確定（オーナー交代の即時運用のため）。
  const { data, error } = await svc.auth.admin.updateUserById(uid, {
    email,
    email_confirm: true,
  });
  if (error || !data?.user) {
    // 「既に使用中のメール」等は Supabase のメッセージをそのまま提示する。
    return { ok: false, error: error?.message ?? 'ログインメールの変更に失敗しました' };
  }
  return { ok: true, email: data.user.email ?? email };
}

// ── パスワード再設定メール送信（任意機能） ──
// 指定メール宛に再設定リンクを送る。新オーナーがパスワードを知らない引き継ぎを完結させる用途。
// resetPasswordForEmail は anon クライアントの公開エンドポイント（Supabase がメール送信を担う）。
export async function adminSendOwnerPasswordReset(
  email: string,
): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const to = (email ?? '').trim();
  if (!isValidEmail(to)) return { ok: false, error: 'メールアドレスの形式が正しくありません' };

  // 着地先はローカル/本番の実オリジンを使う（会員用の再設定ルートを共有：/auth/callback→/reset-password）。
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const redirectTo = host ? `${proto}://${host}/auth/callback?next=/reset-password` : undefined;

  const pub = createPublicClient();
  const { error } = await pub.auth.resetPasswordForEmail(to, redirectTo ? { redirectTo } : undefined);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
