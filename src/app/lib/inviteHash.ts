'use client';

import { createClient } from '@/app/lib/supabase/client';

// 招待リンクが implicit（ハッシュ）形式で着地したケースを拾うクライアント専用ユーティリティ。
// Supabase は invite を #access_token=...&refresh_token=...&type=invite で返すことがある。
// ハッシュ（# 以降）はサーバーに送信されないため、/auth/callback（サーバー）では拾えない。
// → クライアントで window.location.hash を読み、setSession でセッションを確立する。
// トークンを URL/履歴/サーバー/ログに残さないよう、確立後は必ず clearAuthHash() で消すこと。

export type InviteHash = { accessToken: string; refreshToken: string; type: string | null };

/** URL ハッシュからトークン一式を読む。access_token と refresh_token が揃っていなければ null。 */
export function readInviteHash(): InviteHash | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash;
  if (!raw || raw.length < 2) return null;
  const params = new URLSearchParams(raw.slice(1)); // 先頭の # を除去
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken, type: params.get('type') };
}

/** URL からトークン痕跡（ハッシュ＋クエリ）を消す。履歴にも残さない（replaceState）。 */
export function clearAuthHash(): void {
  if (typeof window === 'undefined') return;
  // search（?error= 等）も含めパスのみへ。ブラウザ履歴にトークンを残さない。
  window.history.replaceState(null, '', window.location.pathname);
}

/** ハッシュのトークンでセッションを確立。成功で true。失敗（期限切れ等）で false。 */
export async function establishSessionFromHash(h: InviteHash): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.auth.setSession({
    access_token: h.accessToken,
    refresh_token: h.refreshToken,
  });
  return !error;
}
