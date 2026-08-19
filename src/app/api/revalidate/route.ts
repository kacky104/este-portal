import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/app/lib/supabase/server";
import { areaHref } from "@/app/lib/areas";
import { PAGE_HERO_PATHS, PAGE_HERO_LAYOUT_PATHS } from '@/app/lib/pageHero';
import { hpSitePaths } from '@/app/lib/hpSite';

// ISR キャッシュを即時更新するエンドポイント。
// 認証で保護：cookie のログインセッションから getUser し、認証済みユーザー（オーナー/管理者）
// のときだけ revalidate する。未認証は 401。共有シークレットは使わない。
//
// リクエストボディ（任意・JSON）:
//   { salonId?: number | string, therapistId?: number | string, top?: boolean }
//   - salonId 指定時：/salon/[salonId] 配下（本体＋サブページ）をまとめて無効化（'layout' 指定）。
//   - therapistId 指定時：/therapist/[therapistId] 配下（本体＋/diary・/reviews）をまとめて無効化（'layout' 指定）。
//     出勤保存後の公開セラピストページ即時反映に使う。salonId と併用可（どちらか一方でも両方でも動く）。
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
  let therapistId: number | string | undefined;
  let area: string | undefined;
  let areasAll = false;
  let ranking = false;
  let pageHeroes = false;
  let adBanners = false;
  let top = true;
  try {
    const body = (await req.json()) as { salonId?: number | string; therapistId?: number | string; top?: boolean; area?: string; areasAll?: boolean; ranking?: boolean; pageHeroes?: boolean; adBanners?: boolean } | null;
    if (body && typeof body === "object") {
      if (body.salonId != null) salonId = body.salonId;
      if (body.therapistId != null) therapistId = body.therapistId;
      if (body.area != null) area = body.area;
      if (body.areasAll === true) areasAll = true;
      if (body.ranking === true) ranking = true;
      if (body.pageHeroes === true) pageHeroes = true;
      if (body.adBanners === true) adBanners = true;
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
    // サロン新着情報の横断一覧（/news）もお知らせ保存の即時反映対象にする（トップの5件ブロックは top で反映）。
    revalidatePath("/news");
    revalidated.push("/news");

    // ── 店舗の公式ホームページ（/hp/…）も無効化する（2026-08-18 第23便）──
    //
    // ★★ ここが抜けていたため、出勤・セラピスト情報を保存しても公式HPだけは
    //   revalidate=600 の時間切れ（最大10分）まで古いままだった。
    //   公式HPはフクエス本体と同じ salons / therapists / therapist_schedules を読んでいるので、
    //   本体を無効化するときは必ず公式HPも一緒に無効化しなければならない。
    //
    // ★ 対象パスは lib/hpSite.ts の hpSitePaths() 一本に任せる（表示条件で絞らない）。
    //   絞ると「今は404のページ」が対象から外れ、200を返していた頃のキャッシュが居座る
    //   （hpSitePaths のコメント参照）。下層ページを増やしたときも直しが要らない。
    // ★ salon_sites の slug / domain は anon にも select 権限がある列なので、
    //   service_role を持ち出さずログイン中のクライアントでそのまま引ける
    //   （20260809_salon_sites_admin_lock.sql の列単位 grant）。
    // ★ サイトを持たない店（salon_sites に行が無い）では何もしない。
    const { data: siteRow } = await supabase
      .from("salon_sites")
      .select("slug, domain")
      .eq("salon_id", Number(salonId))
      .maybeSingle();
    if (siteRow?.slug) {
      for (const path of hpSitePaths({
        slug: String(siteRow.slug),
        domain: siteRow.domain ? String(siteRow.domain) : null,
      })) {
        revalidatePath(path);
        revalidated.push(path);
      }
    }
  }

  if (therapistId != null && String(therapistId).trim() !== "") {
    // 公開セラピストページ本体＋配下サブページ（/diary・/reviews）を一括無効化。
    // 出勤保存後の即時反映用。salon の作法（'layout' 指定）に合わせる。
    revalidatePath(`/therapist/${therapistId}`, "layout");
    revalidated.push(`/therapist/${therapistId}`);
  }

  if (area != null && area.trim() !== "") {
    // 該当の地域ページ（/area/<slug>）を無効化。
    const path = areaHref(area);
    revalidatePath(path);
    revalidated.push(path);
  }

  if (areasAll) {
    // 全 /area/<slug> ページ（出張含む）をまとめて無効化（動的ルート単位）。
    revalidatePath("/area/[slug]", "page");
    revalidated.push("/area/[slug]");
  }

  if (ranking) {
    // 週間ランキング（/ranking）。下駄設定の保存後などに即時反映する。
    revalidatePath("/ranking");
    revalidated.push("/ranking");
  }

  if (pageHeroes) {
    // ページ別ヒーロー画像の設定後、全対象ページを無効化する。
    // 対象は lib/pageHero.ts の PAGE_HERO_PATHS に一元化（キー追加時にここの直しを不要にする）。
    for (const path of Object.values(PAGE_HERO_PATHS)) {
      revalidatePath(path);
      revalidated.push(path);
    }
    // 配下の動的ルートにも同じ画像を出しているページ（コラムのカテゴリ別一覧）は
    // 'layout' 指定でまとめて作り直す。パス1本の revalidatePath では
    // /column/category/[key] のような動的ルートに届かないため（2026-08-18 第23便）。
    for (const path of PAGE_HERO_LAYOUT_PATHS) {
      revalidatePath(path, 'layout');
      revalidated.push(`${path} (layout)`);
    }
  }

  if (adBanners) {
    // 細い広告バナー（ad_banners）の設定後、差し込み先ページを無効化する。
    // ★★ AdBanner を置くページを増やしたら、必ずこの一覧にも足すこと。
    //   ここに無いISRページは、バナーを保存しても revalidate の時間切れ（最大10分）まで
    //   古いままになる（公式HPの反映漏れ・禁則142と同種のバグになる）。
    //   /member は force-dynamic なので不要。
    // 2026-08-19 第24便: コラム（/column・/jobs/column）を追加。あわせて、AdBanner を
    //   表示しているのに従来この一覧から漏れていた /news・/salons・/join・/working も追加した。
    for (const path of [
      "/therapists", "/diary", "/reviews", "/therapist/new", "/x-shops", "/ranking",
      "/news", "/salons", "/join", "/working",
      "/column", "/jobs/column",
    ]) {
      revalidatePath(path);
      revalidated.push(path);
    }
    // コラムのカテゴリ別一覧（動的ルート）はルート単位で無効化（areasAll の /area/[slug] と同じ作法）。
    for (const route of ["/column/category/[key]", "/jobs/column/category/[key]"]) {
      revalidatePath(route, "page");
      revalidated.push(route);
    }
  }

  if (top) {
    revalidatePath("/");
    revalidated.push("/");
  }

  return NextResponse.json({ ok: true, revalidated });
}
