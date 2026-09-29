'use server';

import { createClient } from '@/app/lib/supabase/server';
import { mapDraftRow, type XDraft, type XDraftRow } from '@/app/x/xDrafts';

// ★★ 第984便（2026-09-29・カッキーさん）: fukuX の投稿まわり（投稿・リプライ・編集・削除・固定・下書き・ストーリー）を
//   【サーバー側】で行う（第980〜983便と同じ、アプリ内ブラウザで送る前に止まる事故の対策）。
// ★ すべて【本人のログインのまま】（service_role ではない）＝x_posts / x_drafts / x_stories の RLS とトリガーはそのまま効く。
// ★ 「画面のプロフィールと、実際のログインが同じ人か」（別タブで別アカウントに入った事故）の確認も、サーバーで行う。

type Fail = { ok: false; error: string };
const NO_LOGIN: Fail = { ok: false, error: 'ログインが切れています。ページを開き直すか、ログインし直してください。' };
const MISMATCH: Fail = { ok: false, error: 'アカウントが切り替わっています。ページを再読み込みしてください' };
const RETRY = 'ページを開き直してから、もう一度お試しください。';

function jpOr(message: string | undefined, fallback: string): string {
  // ★ DB のトリガー・ポリシーが日本語で理由を返すときはそれを出す。英語の生エラーは出さない。
  return message && /[ぁ-んァ-ン一-龥]/.test(message) ? message : fallback;
}

async function me(expectUid?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, fail: NO_LOGIN };
  if (expectUid && expectUid !== user.id) return { supabase, user: null, fail: MISMATCH };
  return { supabase, user, fail: null };
}

// ── 画像のアップロード先（x-images/本人UID/） ──
const EXT_OK = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
export async function createMyXPostImageUploadUrl(
  expectUid: string, ext: string,
): Promise<{ ok: true; signedUrl: string; publicUrl: string } | Fail> {
  const e = String(ext || 'jpg').toLowerCase();
  if (!EXT_OK.has(e)) return { ok: false, error: 'この形式の画像には対応していません' };
  const { supabase, user, fail } = await me(expectUid);
  if (!user) return fail!;
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${e}`;
  const { data, error } = await supabase.storage.from('x-images').createSignedUploadUrl(path);
  if (error || !data?.signedUrl) {
    console.error('[x] 投稿画像のアップロード先を作れなかった', user.id, error?.message);
    return { ok: false, error: '画像を送る準備ができませんでした。' + RETRY };
  }
  const { data: { publicUrl } } = supabase.storage.from('x-images').getPublicUrl(path);
  return { ok: true, signedUrl: data.signedUrl, publicUrl };
}

// ── 新規投稿・リプライ ──
export async function createMyXPost(input: {
  expectUid: string;
  authorProfileId: string;
  body: string | null;
  images: string[];
  linkUrl: string | null;
  parentPostId: string | null;
  repliesDisabled: boolean | null; // null＝送らない
  draftId: string | null;          // 下書きから起こした投稿なら、投稿後にその下書きを消す
}): Promise<{ ok: true; row: { id: string; like_count: number; reply_count: number; replies_disabled: boolean; created_at: string } } | Fail> {
  const { supabase, user, fail } = await me(input.expectUid);
  if (!user) return fail!;
  const payload: Record<string, unknown> = {
    author_profile_id: input.authorProfileId,
    body: input.body || null,
    images: Array.isArray(input.images) ? input.images.slice(0, 4) : [],
    link_url: input.linkUrl || null,
  };
  if (input.parentPostId) payload.parent_post_id = input.parentPostId;
  else if (input.repliesDisabled !== null) payload.replies_disabled = !!input.repliesDisabled;
  const { data, error } = await supabase
    .from('x_posts')
    .insert(payload)
    .select('id, like_count, reply_count, replies_disabled, created_at')
    .single();
  if (error || !data) {
    console.error('[x] 投稿できなかった', user.id, error?.code, error?.message);
    const what = input.parentPostId ? 'リプライできませんでした。' : '投稿できませんでした。';
    return { ok: false, error: jpOr(error?.message, what + RETRY) };
  }
  if (input.draftId) await supabase.from('x_drafts').delete().eq('id', input.draftId);
  return {
    ok: true,
    row: {
      id: String(data.id),
      like_count: Number(data.like_count ?? 0),
      reply_count: Number(data.reply_count ?? 0),
      replies_disabled: Boolean(data.replies_disabled),
      created_at: String(data.created_at ?? new Date().toISOString()),
    },
  };
}

// ── 投稿の編集 ──
export async function editMyXPost(input: {
  expectUid: string;
  postId: string;
  body: string | null;
  images: string[];
  linkUrl: string | null;
  editedAt: string;
  repliesDisabled: boolean | null; // null＝触らない
}): Promise<{ ok: true } | Fail> {
  const { supabase, user, fail } = await me(input.expectUid);
  if (!user) return fail!;
  const upd: Record<string, unknown> = {
    body: input.body || null,
    images: Array.isArray(input.images) ? input.images.slice(0, 4) : [],
    link_url: input.linkUrl || null,
    edited_at: input.editedAt,
  };
  if (input.repliesDisabled !== null) upd.replies_disabled = !!input.repliesDisabled;
  const { data, error } = await supabase.from('x_posts').update(upd).eq('id', input.postId).select('id');
  if (error || !data || data.length === 0) {
    console.error('[x] 編集できなかった', user.id, error?.message);
    return { ok: false, error: jpOr(error?.message, '編集できませんでした。' + RETRY) };
  }
  return { ok: true };
}

// ── 投稿の削除 ──
export async function deleteMyXPost(postId: string): Promise<{ ok: true } | Fail> {
  const { supabase, user, fail } = await me();
  if (!user) return fail!;
  const { error } = await supabase.from('x_posts').delete().eq('id', postId);
  if (error) {
    console.error('[x] 削除できなかった', user.id, error?.message);
    return { ok: false, error: jpOr(error?.message, '削除できませんでした。' + RETRY) };
  }
  return { ok: true };
}

// ── プロフィール固定（1人1件） ──
export async function pinMyXPost(authorProfileId: string, postId: string, pin: boolean): Promise<{ ok: true; pinnedAt: string | null } | Fail> {
  const { supabase, user, fail } = await me();
  if (!user) return fail!;
  if (pin) {
    // 既存の固定を解除（RLS により自分の投稿以外は更新されない）
    await supabase.from('x_posts').update({ pinned_at: null }).eq('author_profile_id', authorProfileId).not('pinned_at', 'is', null);
  }
  const at = pin ? new Date().toISOString() : null;
  const { data, error } = await supabase.from('x_posts').update({ pinned_at: at }).eq('id', postId).select('id');
  if (error || !data || data.length === 0) {
    console.error('[x] 固定を更新できなかった', user.id, error?.message);
    return { ok: false, error: jpOr(error?.message, '固定を更新できませんでした。' + RETRY) };
  }
  return { ok: true, pinnedAt: at };
}

// ── 下書き ──
export async function saveMyXDraft(input: {
  expectUid: string;
  draftId: string | null;
  authorProfileId: string;
  parentPostId: string | null;
  body: string | null;
  images: string[];
  linkUrl: string | null;
  repliesDisabled: boolean;
}): Promise<{ ok: true } | Fail> {
  const { supabase, user, fail } = await me(input.expectUid);
  if (!user) return fail!;
  const row: Record<string, unknown> = {
    body: input.body || null,
    images: Array.isArray(input.images) ? input.images.slice(0, 4) : [],
    link_url: input.linkUrl || null,
    replies_disabled: !!input.repliesDisabled,
  };
  const { error } = input.draftId
    ? await supabase.from('x_drafts').update(row).eq('id', input.draftId)
    : await supabase.from('x_drafts').insert({ ...row, author_profile_id: input.authorProfileId, parent_post_id: input.parentPostId ?? null });
  if (error) {
    console.error('[x] 下書きを保存できなかった', user.id, error.message);
    return { ok: false, error: jpOr(error.message, '下書きを保存できませんでした。' + RETRY) };
  }
  return { ok: true };
}

export async function listMyXDrafts(authorProfileId: string, parentPostId: string | null): Promise<{ ok: true; drafts: XDraft[] } | Fail> {
  const { supabase, user, fail } = await me();
  if (!user) return fail!;
  let q = supabase
    .from('x_drafts')
    .select('id, body, images, link_url, replies_disabled, parent_post_id, updated_at')
    .eq('author_profile_id', authorProfileId)
    .order('updated_at', { ascending: false })
    .limit(50);
  q = parentPostId ? q.eq('parent_post_id', parentPostId) : q.is('parent_post_id', null);
  const { data, error } = await q;
  if (error) return { ok: false, error: '下書きを読み込めませんでした' };
  return { ok: true, drafts: ((data ?? []) as XDraftRow[]).map(mapDraftRow) };
}

export async function deleteMyXDraft(draftId: string): Promise<{ ok: true } | Fail> {
  const { supabase, user, fail } = await me();
  if (!user) return fail!;
  const { error } = await supabase.from('x_drafts').delete().eq('id', draftId);
  if (error) return { ok: false, error: '削除できませんでした' };
  return { ok: true };
}

// ── ストーリー ──
export async function createMyXStory(input: {
  expectUid: string; authorProfileId: string; imageUrl: string; caption: string;
}): Promise<{ ok: true } | Fail> {
  const { supabase, user, fail } = await me(input.expectUid);
  if (!user) return fail!;
  const { error } = await supabase.from('x_stories').insert({
    author_profile_id: input.authorProfileId,
    image_url: input.imageUrl,
    caption: String(input.caption ?? '').trim() || null,
  });
  if (error) {
    console.error('[x] ストーリーを投稿できなかった', user.id, error.message);
    return { ok: false, error: jpOr(error.message, 'ストーリーを投稿できませんでした。' + RETRY) };
  }
  return { ok: true };
}

export async function deleteMyXStory(storyId: string): Promise<{ ok: true } | Fail> {
  const { supabase, user, fail } = await me();
  if (!user) return fail!;
  const { error } = await supabase.from('x_stories').delete().eq('id', storyId);
  if (error) return { ok: false, error: '削除できませんでした' };
  return { ok: true };
}
