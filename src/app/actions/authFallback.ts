'use server';

import { createClient } from '@/app/lib/supabase/server';

// ★★ 第987便（2026-09-29・カッキーさん）: ログイン・新規登録・再設定メール・ログアウトの【予備の道】。
// ★ ふだんは今まで通りブラウザ（src/lib/auth.ts）から送る。LINE 等のアプリ内ブラウザで 8 秒たっても返事が無いときだけ、
//   ここ（サーバー）から送り直す。
// ★ なぜ全部サーバーにしないか: Supabase は「同じ場所（IP）からのログインは 5 分に 30 回まで」。
//   全員をサーバー（Vercel）から送ると全員が同じ場所扱いになり、人が増えたときにまとめて止まる恐れがあるため。
// ★ エラーの日本語化は呼び出し側（src/lib/auth.ts の jpAuthError）で行う＝ここは生の message を返す。

type R = { ok: true } | { ok: false; message: string };

function safeRedirect(origin: string, path: string): string | undefined {
  // ★ 戻り先は fukues.com か localhost だけ（Supabase 側の許可リストでも弾かれるが二重に）
  try {
    const u = new URL(origin);
    const okHost = u.hostname === 'fukues.com' || u.hostname.endsWith('.fukues.com') || u.hostname === 'localhost' || u.hostname.endsWith('.vercel.app');
    if (!okHost) return undefined;
    return `${u.origin}${path}`;
  } catch {
    return undefined;
  }
}

export async function serverSignIn(email: string, password: string): Promise<
  { ok: true; accessToken: string; refreshToken: string } | { ok: false; message: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: String(email ?? ''), password: String(password ?? '') });
  if (error || !data.session) return { ok: false, message: error?.message ?? 'unknown' };
  return { ok: true, accessToken: data.session.access_token, refreshToken: data.session.refresh_token };
}

export async function serverSignUp(email: string, password: string, origin: string, next?: string): Promise<
  { ok: true; alreadyRegistered: boolean; needsConfirm: boolean } | { ok: false; message: string }
> {
  const supabase = await createClient();
  const emailRedirectTo = safeRedirect(origin, `/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  const { data, error } = await supabase.auth.signUp({
    email: String(email ?? ''),
    password: String(password ?? ''),
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });
  if (error) return { ok: false, message: error.message };
  const alreadyRegistered = !!data.user && (data.user.identities?.length ?? 0) === 0;
  return { ok: true, alreadyRegistered, needsConfirm: !data.session };
}

export async function serverRequestPasswordReset(email: string, origin: string, next: string): Promise<R> {
  const supabase = await createClient();
  const redirectTo = safeRedirect(origin, `/auth/callback?next=${encodeURIComponent(next || '/reset-password')}`);
  const { error } = await supabase.auth.resetPasswordForEmail(String(email ?? ''), redirectTo ? { redirectTo } : undefined);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function serverSignOut(): Promise<R> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
