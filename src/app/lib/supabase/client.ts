import { createBrowserClient } from "@supabase/ssr";

// 非ジェネリックなビルダー（戻り型を従来の createClient と完全一致させ、下流の型推論を変えない）。
function buildClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ブラウザでは単一インスタンスを共有する（シングルトン）。
// これにより、どこで createClient() を呼んでも同じ GoTrueClient を使うため、
// ログイン/ログアウト時の onAuthStateChange が全箇所（保存ストア含む）で確実に発火する。
// SSR（window 不在）では共有しない（リクエスト間汚染を避けるため毎回新規）。
let browserClient: ReturnType<typeof buildClient> | undefined;

export function createClient() {
  if (typeof window === "undefined") return buildClient();
  if (!browserClient) browserClient = buildClient();
  return browserClient;
}
