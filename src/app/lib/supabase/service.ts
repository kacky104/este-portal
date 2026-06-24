import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// service_role キーで RLS を越えて読み書きするサーバー専用クライアント。
// VIPレターの配信処理（vip_letters の作成・vip_letter_recipients の一括登録・
// saved_items の保存者集計）でのみ使用する。
//
// ⚠ SUPABASE_SERVICE_ROLE_KEY は NEXT_PUBLIC を付けないサーバー専用環境変数。
// このファイルは Server Action（src/app/actions/vipLetters.ts）からのみ import し、
// クライアントバンドルに絶対に含めないこと。
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
