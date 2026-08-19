import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/app/lib/supabase/server";
import { PAGE_HERO_PATHS, PAGE_HERO_LAYOUT_PATHS } from '@/app/lib/pageHero';

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
    //
    // ★★ 2026-08-19（第25便）: 実URL指定（`/salon/${salonId}` + 'layout'）→
    //   ルート雛形指定（'/salon/[id]' + 'layout'）に変更。
    //   Next 16.2.9 では、generateStaticParams に載せていない動的ページ
    //   （このサイトの全ページがそう＝空配列のランタイムISR）に対して、
    //   実URLの revalidatePath が【一切効かない】。'layout'・'page'・型無しの全てで効かない。
    //   ミニアプリで実測: 実URL指定＝キャッシュHITのまま古い値／雛形指定＝即MISSで新しい値。
    //   このため /mypage で店舗情報（公式サイトURL等）を保存しても、/salon/[id]/info などが
    //   revalidate=600 の時間切れ（最大10分）まで古いままだった（2026-08-19 オーナー報告で発覚）。
    //
    // ★ 雛形指定は【全店舗ぶん】の無効化になる（1店だけには絞れない）。
    //   ランタイムISRなので次のアクセス時にその場で作り直されるだけ＝ビルドは走らず害は無い。
    //   /area/[slug]・/column/category/[key]（禁則153）と同じ作法に統一。
    revalidatePath("/salon/[id]", "layout");
    revalidated.push("/salon/[id] (layout)");
    // サロン新着情報の横断一覧（/news）もお知らせ保存の即時反映対象にする（トップの5件ブロックは top で反映）。
    revalidatePath("/news");
    revalidated.push("/news");

    // ── 店舗の公式ホームページ（/hp/…）も無効化する（2026-08-18 第23便）──
    //
    // ★★ 公式HPはフクエス本体と同じ salons / therapists / therapist_schedules を読んでいるので、
    //   本体を無効化するときは必ず公式HPも一緒に無効化しなければならない。
    // ★ 2026-08-19（第25便）: hpSitePaths() の実URLループ → 雛形指定に変更（理由は上の salon と同じ。
    //   実URLの revalidatePath は効いていなかった）。暫定URL（/hp/{slug}）も独自ドメイン
    //   （/hp/{domain} への書き換え）も同じ /hp/[slug] ルートなので、この1本で両系統とも消える。
    //   salon_sites を引く必要も無くなった（サイトを持たない店でも無駄が無い＝ただの空振り）。
    revalidatePath("/hp/[slug]", "layout");
    revalidated.push("/hp/[slug] (layout)");
  }

  if (therapistId != null && String(therapistId).trim() !== "") {
    // 公開セラピストページ本体＋配下サブページ（/diary・/reviews）を一括無効化。
    // 出勤保存後の即時反映用。salon と同じく雛形指定（2026-08-19 第25便・理由は上のコメント参照）。
    revalidatePath("/therapist/[id]", "layout");
    revalidated.push("/therapist/[id] (layout)");
  }

  if (area != null && area.trim() !== "") {
    // 該当の地域ページを無効化。実URL指定（areaHref）が効かないため（第25便・上のコメント参照）、
    // 単一エリア指定でも areasAll と同じ雛形指定で全 /area/[slug] を無効化する。
    revalidatePath("/area/[slug]", "page");
    revalidated.push("/area/[slug]");
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
