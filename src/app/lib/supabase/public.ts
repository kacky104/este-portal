import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// cookie を読まない匿名クライアント（公開データの読み取り専用）。
// これを使うサーバーコンポーネントは cookies() を呼ばないため動的化されず、
// revalidate（ISR）が有効になる。anon の SELECT ポリシーで読める公開テーブル専用。
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
