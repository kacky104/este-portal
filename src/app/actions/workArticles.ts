'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/app/lib/supabase/server';
import { ADMIN_UUID } from '@/app/lib/admin';
import { isValidArticleCategory } from '@/app/lib/articleCategories';

// フクエスワーク フェーズ6 段階2：コラム記事（work_articles）の admin 用サーバーアクション。
//
// 方針（jobs.ts / adminOwner.ts の作法を踏襲）:
//  - 書き込み・読み取りともに認証ユーザークライアント（RLS経由）。admin_all ポリシー
//    （auth.uid() = ADMIN_UUID）で draft 含む全件が見える／書ける。service_role は使わない。
//  - requireAdmin() で早期に分かりやすいエラーを返す（RLSは最終防衛として二重に効く）。
//  - エラーは握りつぶさず文言化して返す。
//  - 更新は undefined オーバーライトガード必須：input.xxx === undefined のフィールドは
//    更新ペイロードから除外（gallery_images 事故の再発防止）。validate で undefined を
//    空文字へ正規化しない（＝送ってこなかったフィールドは既存値を温存）。
//  - 公開ページ（/jobs/column 配下）は段階3で実装するため、ここでは revalidate しない。

const SLUG_RE = /^[a-z0-9-]+$/; // 英数字（小文字）とハイフンのみ

export type WorkArticle = {
  id: string;
  slug: string;
  title: string;
  body: string;
  excerpt: string;
  hero_image_url: string | null;
  category: string;
  status: 'draft' | 'published';
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

// 作成・更新の入力。更新時は「送ってきたフィールドだけ」を反映するため全て optional。
export type WorkArticleInput = {
  id?: string;            // 作成時のみ：クライアント生成UUID（hero画像パス {id}/… と行IDを一致させる）
  slug?: string;
  title?: string;
  body?: string;
  excerpt?: string;
  hero_image_url?: string | null;
  category?: string;
  status?: 'draft' | 'published';
};

type Err = { ok: false; error: string };

const ARTICLE_COLUMNS =
  'id, slug, title, body, excerpt, hero_image_url, category, status, published_at, created_at, updated_at';

function mapArticle(row: Record<string, unknown>): WorkArticle {
  return {
    id: String(row.id),
    slug: (row.slug as string | null) ?? '',
    title: (row.title as string | null) ?? '',
    body: (row.body as string | null) ?? '',
    excerpt: (row.excerpt as string | null) ?? '',
    hero_image_url: (row.hero_image_url as string | null) ?? null,
    category: (row.category as string | null) ?? 'work-guide',
    status: (row.status as 'draft' | 'published' | null) ?? 'draft',
    published_at: (row.published_at as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  if (user.id !== ADMIN_UUID) return { ok: false as const, error: '管理者専用です' };
  return { ok: true as const, supabase };
}

// 公開ページ（段階3）のISRを即時再検証する（作成・更新・削除の成功時に呼ぶ）。
// slug/カテゴリ横断で影響しうるため、動的ルートは一括（'page'）で再検証する。
// /jobs トップにも新着コラム3件を出しているためそこも対象。
function revalidateColumnPublic(): void {
  revalidatePath('/jobs/column');
  revalidatePath('/jobs/column/[slug]', 'page');
  revalidatePath('/jobs/column/category/[key]', 'page');
  revalidatePath('/jobs');
}

// slug（必須文脈）を検証して正規化。空・書式違反はエラー。
function validateSlug(raw: string | undefined | null): { ok: true; value: string } | Err {
  const slug = (raw ?? '').trim();
  if (slug === '') return { ok: false, error: 'slug（URL）は必須です' };
  if (!SLUG_RE.test(slug)) {
    return { ok: false, error: 'slug は英数字（小文字）とハイフンのみで入力してください' };
  }
  return { ok: true, value: slug };
}

// ── 一覧（draft含む・updated_at降順） ──
export async function adminListArticles(): Promise<{ ok: true; articles: WorkArticle[] } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase
    .from('work_articles')
    .select(ARTICLE_COLUMNS)
    .order('updated_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, articles: (data ?? []).map(mapArticle) };
}

// ── 単体取得 ──
export async function adminGetArticle(
  id: string,
): Promise<{ ok: true; article: WorkArticle | null } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!id) return { ok: false, error: '対象記事が不正です' };

  const { data, error } = await auth.supabase
    .from('work_articles')
    .select(ARTICLE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, article: data ? mapArticle(data) : null };
}

// ── 作成 ──
// slug・title は必須。status='published' なら published_at=now を初期セット。
export async function adminCreateArticle(
  input: WorkArticleInput,
): Promise<{ ok: true; article: WorkArticle } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const slugRes = validateSlug(input.slug);
  if (!slugRes.ok) return slugRes;

  const title = (input.title ?? '').trim();
  if (title === '') return { ok: false, error: 'タイトルは必須です' };

  const category = input.category ?? 'work-guide';
  if (!isValidArticleCategory(category)) return { ok: false, error: 'カテゴリが不正です' };

  const status: 'draft' | 'published' = input.status === 'published' ? 'published' : 'draft';
  const nowIso = new Date().toISOString();

  const heroRaw = input.hero_image_url;
  const hero = heroRaw === undefined ? null : (heroRaw?.trim() || null);

  const payload: Record<string, unknown> = {
    slug: slugRes.value,
    title,
    body: input.body ?? '',
    excerpt: input.excerpt ?? '',
    hero_image_url: hero,
    category,
    status,
    published_at: status === 'published' ? nowIso : null,
  };
  // クライアント生成UUIDが渡されていれば行IDに採用（hero画像パス {id}/… と一致させるため）。
  if (input.id) payload.id = input.id;

  const { data, error } = await auth.supabase
    .from('work_articles')
    .insert(payload)
    .select(ARTICLE_COLUMNS)
    .maybeSingle();
  if (error || !data) {
    if (error?.code === '23505') return { ok: false, error: 'その slug は既に使われています' };
    return { ok: false, error: error?.message ?? '作成に失敗しました' };
  }
  revalidateColumnPublic();
  return { ok: true, article: mapArticle(data) };
}

// ── 更新 ──
// undefined のフィールドはペイロードから除外（既存値温存）。
// published_at ルール：
//  - draft→published にした時、既存 published_at が null なら now をセット。
//  - published→draft に戻しても published_at は保持（再公開時に日付維持）。
export async function adminUpdateArticle(
  id: string,
  input: WorkArticleInput,
): Promise<{ ok: true; article: WorkArticle } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!id) return { ok: false, error: '対象記事が不正です' };

  // 既存行（status / published_at）を取得。公開遷移時の published_at 判定に使う。
  const { data: existing, error: exErr } = await auth.supabase
    .from('work_articles')
    .select('status, published_at')
    .eq('id', id)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };
  if (!existing) return { ok: false, error: '対象記事が見つかりません' };

  const payload: Record<string, unknown> = {};

  if (input.slug !== undefined) {
    const slugRes = validateSlug(input.slug);
    if (!slugRes.ok) return slugRes;
    payload.slug = slugRes.value;
  }
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (title === '') return { ok: false, error: 'タイトルは必須です' };
    payload.title = title;
  }
  if (input.body !== undefined) payload.body = input.body;
  if (input.excerpt !== undefined) payload.excerpt = input.excerpt;
  if (input.hero_image_url !== undefined) {
    payload.hero_image_url = input.hero_image_url?.trim() || null;
  }
  if (input.category !== undefined) {
    if (!isValidArticleCategory(input.category)) return { ok: false, error: 'カテゴリが不正です' };
    payload.category = input.category;
  }
  if (input.status !== undefined) {
    const nextStatus: 'draft' | 'published' = input.status === 'published' ? 'published' : 'draft';
    payload.status = nextStatus;
    // draft→published かつ published_at 未設定なら now を初期セット。逆方向・再公開では触らない。
    if (nextStatus === 'published' && existing.published_at == null) {
      payload.published_at = new Date().toISOString();
    }
  }

  if (Object.keys(payload).length === 0) {
    return { ok: false, error: '更新する項目がありません' };
  }

  const { data, error } = await auth.supabase
    .from('work_articles')
    .update(payload)
    .eq('id', id)
    .select(ARTICLE_COLUMNS)
    .maybeSingle();
  if (error || !data) {
    if (error?.code === '23505') return { ok: false, error: 'その slug は既に使われています' };
    return { ok: false, error: error?.message ?? '更新に失敗しました' };
  }
  revalidateColumnPublic();
  return { ok: true, article: mapArticle(data) };
}

// ── 削除 ──
// 行を削除。hero画像の Storage 掃除は呼び出し側（クライアント）が戻り値の hero_image_url を使って行う。
export async function adminDeleteArticle(
  id: string,
): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!id) return { ok: false, error: '対象記事が不正です' };

  const { error } = await auth.supabase.from('work_articles').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidateColumnPublic();
  return { ok: true };
}
