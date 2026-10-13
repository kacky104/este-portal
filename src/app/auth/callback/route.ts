import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ensureSignupPoints } from '@/app/lib/points/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/app/lib/supabase/server';

// メール確認リンクの着地点。確認と同時にセッションを確立（＝自動ログイン）し、
// 成功すれば next（既定 /）へ、失敗すれば /login?error=... へ。無言でトップに飛ばさない。
//
// @supabase/ssr は PKCE 既定のため、デフォルトの確認メール（ConfirmationURL）から
// `?code=...` で着地する → exchangeCodeForSession でセッション交換（テンプレ変更不要）。
// token_hash 形式のテンプレートに切替えた場合に備え verifyOtp も処理する。

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

// ★ 第1450便: 会員登録のポイント（キャンペーン・これからの会員だけ・1人1回）。確認メールのリンクで登録が終わったとき。
//   ★ 何があってもログインの流れは止めない（失敗は無視。会員ページを開いたときにも付け直す）。
async function grantSignup(supabase: Awaited<ReturnType<typeof createClient>>): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await ensureSignupPoints(createServiceClient(), user);
  } catch { /* 何もしない */ }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const code = params.get('code');
  const tokenHash = params.get('token_hash');
  const type = params.get('type') as EmailOtpType | null;
  const errParam = params.get('error');
  const errDesc = params.get('error_description');
  const next = safeNext(params.get('next'));

  // 本番（プロキシ配下）では x-forwarded-host を優先。ローカルは request の origin を使う。
  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocal = process.env.NODE_ENV === 'development';
  const base = !isLocal && forwardedHost ? `https://${forwardedHost}` : url.origin;

  // 失敗時の誘導先：キャスト招待（type=invite / next=/cast 配下）は /cast/login、
  // リカバリー（パスワード再設定）は /forgot-password、それ以外は /login。
  const isCast = type === 'invite' || next.startsWith('/cast');
  const isRecovery = type === 'recovery' || next.startsWith('/reset-password');
  const failBase = isCast ? '/cast/login' : isRecovery ? '/forgot-password' : '/login';
  const fail = (reason: string) =>
    NextResponse.redirect(`${base}${failBase}?error=${encodeURIComponent(reason)}`);

  // Supabase 側でのエラー（期限切れ・不正トークン等）はそのまま案内へ。
  if (errParam) return fail(errDesc || errParam);

  const supabase = await createClient();

  // PKCE: code → セッション交換
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail('verification_failed');
    if (!isCast && !isRecovery) await grantSignup(supabase);
    return NextResponse.redirect(`${base}${next}`);
  }

  // token_hash テンプレート: verifyOtp でセッション確立
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return fail('verification_failed');
    if (!isCast && !isRecovery) await grantSignup(supabase);
    return NextResponse.redirect(`${base}${next}`);
  }

  // code も token_hash も無い不正なアクセス
  return fail('invalid_link');
}
