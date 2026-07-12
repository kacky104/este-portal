'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/app/lib/supabase/server';
import { ADMIN_UUID } from '@/app/lib/admin';
import { isValidMainArticleCategory } from '@/app/lib/mainArticleCategories';

// 本体コラム記事（main_articles）の admin 用サーバーアクション。
// ワーク側 actions/workArticles.ts と同一方針:
//  - 書き込み・読み取りともに認証ユーザークライアント（RLS経由）。admin_all ポリシーで全操作。
//  - requireAdmin() で早期エラー（RLSは最終防衛として二重に効く）。
//  - 更新は undefined オーバーライトガード必須（送ってこなかったフィールドは既存値温存）。
//  - 公開ページ（/column 配下）とsitemapを成功時に revalidate。

const SLUG_RE = /^[a-z0-9-]+$/; // 英数字（小文字）とハイフンのみ

export type MainArticle = {
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

export type MainArticleInput = {
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

function mapArticle(row: Record<string, unknown>): MainArticle {
  return {
    id: String(row.id),
    slug: (row.slug as string | null) ?? '',
    title: (row.title as string | null) ?? '',
    body: (row.body as string | null) ?? '',
    excerpt: (row.excerpt as string | null) ?? '',
    hero_image_url: (row.hero_image_url as string | null) ?? null,
    category: (row.category as string | null) ?? 'howto',
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

// 公開ページのISRを即時再検証する（作成・更新・削除の成功時に呼ぶ）。
function revalidateColumnPublic(): void {
  revalidatePath('/column');
  revalidatePath('/column/[slug]', 'page');
  revalidatePath('/column/category/[key]', 'page');
  // sitemap にもコラムURL（一覧・カテゴリ・詳細）が含まれるため、公開/更新/削除で即再生成する。
  revalidatePath('/sitemap.xml');
}

function validateSlug(raw: string | undefined | null): { ok: true; value: string } | Err {
  const slug = (raw ?? '').trim();
  if (slug === '') return { ok: false, error: 'slug（URL）は必須です' };
  if (!SLUG_RE.test(slug)) {
    return { ok: false, error: 'slug は英数字（小文字）とハイフンのみで入力してください' };
  }
  return { ok: true, value: slug };
}

// ── 一覧（draft含む・updated_at降順） ──
export async function adminListMainArticles(): Promise<{ ok: true; articles: MainArticle[] } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const { data, error } = await auth.supabase
    .from('main_articles')
    .select(ARTICLE_COLUMNS)
    .order('updated_at', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, articles: (data ?? []).map(mapArticle) };
}

// ── 作成 ──
export async function adminCreateMainArticle(
  input: MainArticleInput,
): Promise<{ ok: true; article: MainArticle } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const slugRes = validateSlug(input.slug);
  if (!slugRes.ok) return slugRes;

  const title = (input.title ?? '').trim();
  if (title === '') return { ok: false, error: 'タイトルは必須です' };

  const category = input.category ?? 'howto';
  if (!isValidMainArticleCategory(category)) return { ok: false, error: 'カテゴリが不正です' };

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
  if (input.id) payload.id = input.id;

  const { data, error } = await auth.supabase
    .from('main_articles')
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
// published_at ルール：draft→published で未設定なら now。published→draft に戻しても保持。
export async function adminUpdateMainArticle(
  id: string,
  input: MainArticleInput,
): Promise<{ ok: true; article: MainArticle } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!id) return { ok: false, error: '対象記事が不正です' };

  const { data: existing, error: exErr } = await auth.supabase
    .from('main_articles')
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
    if (!isValidMainArticleCategory(input.category)) return { ok: false, error: 'カテゴリが不正です' };
    payload.category = input.category;
  }
  if (input.status !== undefined) {
    const nextStatus: 'draft' | 'published' = input.status === 'published' ? 'published' : 'draft';
    payload.status = nextStatus;
    if (nextStatus === 'published' && existing.published_at == null) {
      payload.published_at = new Date().toISOString();
    }
  }

  if (Object.keys(payload).length === 0) {
    return { ok: false, error: '更新する項目がありません' };
  }

  const { data, error } = await auth.supabase
    .from('main_articles')
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
// 行を削除。hero画像の Storage 掃除は呼び出し側（クライアント）が行う。
export async function adminDeleteMainArticle(
  id: string,
): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!id) return { ok: false, error: '対象記事が不正です' };

  const { error } = await auth.supabase.from('main_articles').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidateColumnPublic();
  return { ok: true };
}
