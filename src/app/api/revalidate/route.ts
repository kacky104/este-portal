import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/app/lib/supabase/server";

// ISR キャッシュを即時更新するエンドポイント。
// 認証で保護：cookie のログインセッションから getUser し、認証済みユーザー（オーナー/管理者）
// のときだけ revalidate する。未認証は 401。共有シークレットは使わない。
//
// リクエストボディ（任意・JSON）:
//   { salonId?: number | string, top?: boolean }
//   - salonId 指定時：/salon/[salonId] 配下（本体＋サブページ）をまとめて無効化（'layout' 指定）。
//   - top !== false の場合：トップ（/）も無効化する（後方互換：ボディ無し＝トップのみ）。
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // ボディは任意。無し/不正でも従来どおりトップを無効化する（後方互換）。
  let salonId: number | string | undefined;
  let top = true;
  try {
    const body = (await req.json()) as { salonId?: number | string; top?: boolean } | null;
    if (body && typeof body === "object") {
      if (body.salonId != null) salonId = body.salonId;
      if (body.top === false) top = false;
    }
  } catch {
    // ボディ無し（既存のトップ用呼び出し）はそのままトップ無効化へ。
  }

  const revalidated: string[] = [];

  if (salonId != null && String(salonId).trim() !== "") {
    // 本体＋配下サブページを一括無効化。
    revalidatePath(`/salon/${salonId}`, "layout");
    revalidated.push(`/salon/${salonId}`);
  }

  if (top) {
    revalidatePath("/");
    revalidated.push("/");
  }

  return NextResponse.json({ ok: true, revalidated });
}
