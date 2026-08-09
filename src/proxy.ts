import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ── 掲載店舗の独自ドメイン（公式HP事業・2026-08-09 段階3） ───────────────
//
// 店舗の独自ドメイン（例 example-shop.com）は Vercel のプロジェクトに追加して
// このアプリへ向ける。ここでホスト名を見て /hp/{ホスト名} 配下へ rewrite する。
//   https://example-shop.com/        → /hp/example-shop.com
//   https://example-shop.com/admin   → /hp/example-shop.com/admin
// 受け側（app/hp/[slug]/…）は「. を含むキー = ドメイン、含まないキー = slug」で
// salon_sites を引く（lib/hpSite.ts の isHpDomainKey / hpSiteKeyColumn）。
// → ミドルウェアで DB を引かないので、リクエストごとの追加レイテンシがゼロ。
//
// ※ fukues.com 側では従来どおり /hp/{slug} でも同じページが出る（ドメイン接続前の確認用）。
//   noindex / index の出し分けはページ側（generateMetadata）で行う。

/** フクエス本体として扱うホスト（ここに一致しないホスト＝店舗の独自ドメイン）。 */
const APP_HOSTS = new Set(["fukues.com", "www.fukues.com"]);

/** rewrite しないパス接頭辞。Next の内部・API・認証コールバックは本体のまま動かす。
 *  ※ /hp は意図的に含めない：店舗ドメインで /hp/他店slug を叩かれても
 *     /hp/{自ドメイン}/hp/他店slug になって 404 する（他店のHPを覗けない）。 */
const NO_REWRITE_PREFIXES = ["/_next", "/api", "/auth"];

function normalizeHost(raw: string | null): string {
  const h = (raw ?? "").toLowerCase().split(":")[0].trim();
  // www 有無を吸収（DB の domain 列は www なしで登録する運用）
  return h.startsWith("www.") ? h.slice(4) : h;
}

/** 本体（フクエス）のホストか。localhost・Vercel のプレビューURLも本体扱い。 */
function isAppHost(host: string): boolean {
  if (!host) return true; // ホスト不明時は本体扱い（安全側）
  if (APP_HOSTS.has(host)) return true;
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".vercel.app")) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // セッションを更新してトークンの有効期限を延長
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // /owner/dashboard（旧モック画面）以下はログイン必須
  if (path.startsWith("/owner/dashboard") && !user) {
    return NextResponse.redirect(new URL("/owner/login", request.url));
  }

  // 注: /owner/login はオーナー判定（自店舗の有無）でページ側が /mypage へ振り分けるため、
  // ミドルウェアでの一律リダイレクトは行わない。

  // 店舗の独自ドメイン → /hp/{ホスト名} 配下へ rewrite（公式HP・段階3）
  const host = normalizeHost(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  );
  if (
    !isAppHost(host) &&
    !NO_REWRITE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = path === "/" ? `/hp/${host}` : `/hp/${host}${path}`;
    const rewritten = NextResponse.rewrite(url, { request });
    // セッション更新で発行された Cookie を rewrite レスポンスへ引き継ぐ
    supabaseResponse.cookies.getAll().forEach((c) => rewritten.cookies.set(c));
    return rewritten;
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
