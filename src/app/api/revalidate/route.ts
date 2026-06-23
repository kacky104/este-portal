import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/app/lib/supabase/server";

// トップ(/)の ISR キャッシュを即時更新するエンドポイント。
// 認証で保護：cookie のログインセッションから getUser し、認証済みユーザー（オーナー/管理者）
// のときだけ revalidate する。未認証は 401。共有シークレットは使わない。
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  revalidatePath("/");
  return NextResponse.json({ ok: true, revalidated: "/" });
}
