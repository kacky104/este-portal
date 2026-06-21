// メール＋パスワード認証（Supabase Auth）の薄いラッパ。
// オーナーログインで使用中のブラウザクライアントを再利用する。
// エラーは日本語メッセージに整形して返す。
import { createClient } from '@/app/lib/supabase/client';
import type { Session } from '@supabase/supabase-js';

function jpAuthError(message: string): string {
  const m = (message || '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'メールアドレスまたはパスワードが正しくありません。';
  if (m.includes('email not confirmed')) return 'メール確認が完了していません。届いた確認メールのリンクから登録を完了してください。';
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already')) return 'このメールアドレスは既に登録されています。ログインをお試しください。';
  // パスワードポリシー違反（弱いパスワード）。実ポリシー＝英字＋数字を含む8文字以上。
  if (m.includes('weak password') || m.includes('password is too') || m.includes('password should') || m.includes('should contain')) {
    return 'パスワードは英字と数字を含む8文字以上で入力してください。';
  }
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'メールアドレスの形式が正しくありません。';
  if (m.includes('signups not allowed')) return '現在、新規登録は受け付けていません。';
  if (m.includes('rate limit') || m.includes('too many')) return '試行回数が多すぎます。しばらく時間をおいてからお試しください。';
  if (m.includes('email rate limit')) return 'メール送信の上限に達しました。しばらく待ってからお試しください。';
  return 'エラーが発生しました。時間をおいて再度お試しください。';
}

/** 新規登録。Confirm email が ON のとき session は返らない（needsConfirm=true）。 */
export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{ ok: boolean; needsConfirm?: boolean; alreadyRegistered?: boolean; error?: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { ok: false, error: jpAuthError(error.message) };
  // メール確認ON＋列挙対策により、既存メールでの signUp は user は返るが identities が空配列になる。
  // これを「登録済み」とみなす（実際には確認メールは送られない）。
  const alreadyRegistered = !!data.user && (data.user.identities?.length ?? 0) === 0;
  return { ok: true, alreadyRegistered, needsConfirm: !data.session };
}

/** ログイン。 */
export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: jpAuthError(error.message) };
  return { ok: true };
}

/** ログアウト。 */
export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
}

/** 現在のセッション取得。 */
export async function getSession(): Promise<Session | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** 認証状態の購読。返り値で解除。 */
export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const supabase = createClient();
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
