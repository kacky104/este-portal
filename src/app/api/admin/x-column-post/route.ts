import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { getAllMainColumnFiles } from '@/app/lib/workColumnFiles';
import { mainArticleCategoryLabel } from '@/app/lib/mainArticleCategories';
import { COLUMN_URL_PREFIX, columnSlugFromUrl, orderColumnsForPost } from '@/lib/xColumnRotation';

// ★★ 第1185便（2026-10-05・カッキーさん）: fukuX に「フクエスのメンズエステコラム」を運営（@fukues_info）名義で
//   毎日1本ずつ、順番に自動投稿する周。
//   POST /api/admin/x-column-post  (Authorization: Bearer <CRON_SECRET>)
//   body: { apply?: boolean }
//
// ★ 何を出すか
//   ・コラム＝ src/content/column/*.md（公開ページ /column と同じもの・DB は読まない）。
//   ・本文: 「📖 メンズエステコラム【カテゴリ】」＋題名（「｜」より前）。
//   ・リンクカード: 記事のヘッダー画像＋題名＋要約（excerpt）。押すと https://fukues.com/column/◯◯。
//     ★ カードの中身は md に書いてあるものをそのまま入れる（OGP を取りに行かない）。
// ★ 順番: まだ出していないコラムが先（公開日の古い順）→ ひと回りしたら、最後に出したのがいちばん古いもの。
//   ★ どこまで出したかは、運営アカウントの過去の投稿のリンク（/column/◯◯）から数える＝新しい表は要らない。
//   ★ 手で投稿したコラムも「出した」に数える。判断は src/lib/xColumnRotation.ts。
// ★ 重複防止: その日（JST 0時〜24時）にコラムの投稿がすでにあれば何もしない（周が2回動いても1本）。
// ★ apply 既定 false（試し打ち）: 何を投稿するつもりかだけ返す。x-onduty-post と同じ作法。
// ★★ md を実行時に読むので、next.config.ts の outputFileTracingIncludes でこのルートに src/content/column を同梱している。
//   ★ 外すと本番で 0 本になり、skipped: 'no_columns' が返る（投稿はされない）。
//
//   crontab（VPS・JST・毎日 21:05）:
//   5 21 * * * set -a; . /root/import.env; /usr/bin/curl -s -X POST https://fukues.com/api/admin/x-column-post -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"apply":true}' >> /root/import.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const OFFICIAL_HANDLE = 'fukues_info';
const SITE_URL = 'https://fukues.com';

/** いま（JST）の 'YYYY-MM-DD' */
function todayJST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: { apply?: unknown } = {};
  try { body = (await req.json()) as typeof body; } catch { /* body なしでも動く */ }
  const apply = body.apply === true;

  const columns = getAllMainColumnFiles();
  const today = todayJST();
  if (columns.length === 0) return NextResponse.json({ ok: true, skipped: 'no_columns', today });

  const svc = createServiceClient();

  // 運営アカウント
  const { data: official } = await svc
    .from('x_profiles')
    .select('id, handle, kind, status')
    .eq('handle', OFFICIAL_HANDLE)
    .maybeSingle();
  if (!official || official.kind !== 'official') {
    return NextResponse.json({ ok: false, error: `運営アカウント @${OFFICIAL_HANDLE}（kind=official）が見つかりません` }, { status: 500 });
  }

  // 運営アカウントが今までに出したコラムの投稿（新しい順）。★ 読めなかったときは投稿しない（同じ記事を何度も出さない）
  const { data: past, error: pastErr } = await svc
    .from('x_posts')
    .select('link_url, created_at')
    .eq('author_profile_id', official.id)
    .like('link_url', `${COLUMN_URL_PREFIX}%`)
    .order('created_at', { ascending: false })
    .limit(500);
  if (pastErr) {
    console.error('[x-column-post] 過去の投稿を読めなかった', pastErr.message);
    return NextResponse.json({ ok: false, error: pastErr.message }, { status: 500 });
  }
  const lastPostedAt = new Map<string, string>();
  let latestAt: string | null = null;
  for (const p of (past ?? []) as { link_url: string | null; created_at: string }[]) {
    const slug = columnSlugFromUrl(p.link_url);
    if (!slug) continue;
    if (!latestAt) latestAt = p.created_at;                       // 新しい順なので最初の1件がいちばん新しい
    if (!lastPostedAt.has(slug)) lastPostedAt.set(slug, p.created_at);
  }

  // 重複防止: 今日（JST）すでにコラムを出していれば何もしない
  const dayStart = new Date(`${today}T00:00:00+09:00`).getTime();
  if (latestAt && new Date(latestAt).getTime() >= dayStart) {
    return NextResponse.json({ ok: true, skipped: 'already_posted', today });
  }

  const ordered = orderColumnsForPost(columns, lastPostedAt);
  const col = ordered[0];
  const linkUrl = `${COLUMN_URL_PREFIX}${col.slug}`;
  const hero = col.heroImageUrl;
  const linkImage = hero ? (hero.startsWith('/') ? `${SITE_URL}${hero}` : hero) : null;
  // ★ 題名は「｜」より前だけ（カードに全文が出るので、本文は短く）
  const shortTitle = col.title.split(/[｜|]/)[0].trim() || col.title;
  const cat = mainArticleCategoryLabel(col.category);
  const bodyText = `📖 メンズエステコラム${cat ? `【${cat}】` : ''}\n${shortTitle}`;

  if (!apply) {
    return NextResponse.json({
      ok: true, dryRun: true, today,
      slug: col.slug, body: bodyText, linkUrl, linkImage, linkTitle: col.title, linkDescription: col.excerpt,
      total: columns.length, posted: lastPostedAt.size,
      next: ordered.slice(1, 6).map((c) => c.slug),
    });
  }

  // 投稿（運営名義・service_role）。★ ヘッダー画像が無い記事はカードにならず、文字だけのリンクになる
  const { data: inserted, error } = await svc
    .from('x_posts')
    .insert({
      author_profile_id: official.id,
      body: bodyText,
      images: [],
      link_url: linkUrl,
      link_image: linkImage,
      link_title: linkImage ? col.title : null,
      link_description: linkImage ? col.excerpt : null,
    })
    .select('id')
    .single();
  if (error || !inserted) {
    console.error('[x-column-post] 投稿できなかった', error?.message);
    return NextResponse.json({ ok: false, error: error?.message ?? 'insert failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, today, postId: String(inserted.id), slug: col.slug });
}
