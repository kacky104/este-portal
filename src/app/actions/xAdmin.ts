'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';

// fukuX 運営パネル限定：表示中アカウントのログインメール（auth.users.email）を取得する。
//
// ⚠ セキュリティ（厳守）:
//  - service_role はこのサーバー専用モジュール内でのみ使用（'use server'）。クライアントへ出さない。
//  - 呼び出しのたびに auth.uid() === ADMIN_UUID を再検証（/x/admin のガードに加えて二重化）。
//    運営以外には何も返さない（空オブジェクト）。
//  - 取得したメールは戻り値として運営にだけ返す。DB（x_profiles 等）には保存・複製しない。
//  - admin API listUsers をページングし、必要な auth_user_id ぶんだけ id→email の辞書にする（N+1回避）。
export async function getXAccountEmails(authUserIds: string[]): Promise<Record<string, string>> {
  // 二重ガード：運営UUIDでなければ取得処理に到達させない。
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== ADMIN_UUID) return {};

  const want = new Set(authUserIds.filter(Boolean));
  if (want.size === 0) return {};

  const svc = createServiceClient();
  const out: Record<string, string> = {};
  const perPage = 200;

  // listUsers をページングして必要分が揃うまで走査（安全のため上限ページ数を設ける）。
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage });
    if (error) break;
    const users = data?.users ?? [];
    for (const u of users) {
      if (want.has(u.id) && u.email) out[u.id] = u.email;
    }
    if (Object.keys(out).length >= want.size) break; // 必要分が揃った
    if (users.length < perPage) break; // 最終ページ
  }
  return out;
}
