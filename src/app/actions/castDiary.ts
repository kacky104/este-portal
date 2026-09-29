'use server';

import { createClient } from '@/app/lib/supabase/server';

// ★★ 第981便（2026-09-29・カッキーさん）: セラピスト本人の写メ日記（/cast の CastDiary）を【サーバー側】で読み書きする。
// ★ 起きたこと（第962便パスワード・第980便ニックネームと同じ形）: LINE やメールアプリの中のブラウザでは、
//   ブラウザの supabase-js が「誰なのか」を付けて送る前に止まり、保存や投稿が失敗する。
// ★ ここでは【本人のログインのまま】（service_role ではない）サーバーの supabase で動かす。
//   ★ だから今までと同じ RLS（本人の日記・本人フォルダだけ）がそのまま効く。守りは弱くならない。
// ★ 画像は Vercel の受け取り上限（約4.5MB）があるのでサーバーを通さない:
//   サーバーが「本人フォルダにだけ入れられる一回限りのアップロード先」を作り、ブラウザはそこへ直接送る。

export type CastDiaryRow = {
  id: string;
  images: string[];
  title: string | null;
  content: string | null;
  createdAt: string;
};

type Fail = { ok: false; error: string };
const NO_LOGIN: Fail = { ok: false, error: 'ログインが切れています。ページを開き直すか、ログインし直してください。' };
const PAGE_SIZE = 30;

async function me() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

function toId(v: string | number): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── 一覧 ──
export async function listMyDiaries(
  therapistId: string, page: number,
): Promise<{ ok: true; total: number; posts: CastDiaryRow[] } | Fail> {
  const tid = toId(therapistId);
  if (!tid) return { ok: false, error: '日記を読み込めませんでした。' };
  const { supabase, user } = await me();
  if (!user) return NO_LOGIN;
  const { count } = await supabase
    .from('diary_posts')
    .select('id', { count: 'exact', head: true })
    .eq('therapist_id', tid);
  const total = count ?? 0;
  const p = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const from = (p - 1) * PAGE_SIZE;
  const { data, error } = await supabase
    .from('diary_posts')
    .select('id, images, title, content, created_at')
    .eq('therapist_id', tid)
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (error) {
    console.error('[cast] 日記一覧を読めなかった', user.id, error.message);
    return { ok: false, error: '日記を読み込めませんでした。ページを開き直してください。' };
  }
  const posts = ((data ?? []) as Array<{
    id: string | number; images: string[] | null; title: string | null; content: string | null; created_at: string;
  }>).map((r) => ({
    id: String(r.id), images: r.images ?? [], title: r.title ?? null, content: r.content ?? null, createdAt: r.created_at,
  }));
  return { ok: true, total, posts };
}

// ── 画像: 本人フォルダへの一回限りのアップロード先を作る ──
const EXT_OK = new Set(['jpg', 'jpeg', 'png', 'webp']);
export async function createMyDiaryUploadUrl(
  therapistId: string, ext: string,
): Promise<{ ok: true; signedUrl: string; publicUrl: string } | Fail> {
  const tid = toId(therapistId);
  const e = String(ext || 'jpg').toLowerCase();
  if (!tid || !EXT_OK.has(e)) return { ok: false, error: 'JPEG・PNG・WebPのみ対応しています' };
  const { supabase, user } = await me();
  if (!user) return NO_LOGIN;
  const path = `${tid}/${Date.now()}.${e}`;
  // ★ 本人のログインで作る＝Storage の RLS（本人フォルダだけ）でここで弾かれる
  const { data, error } = await supabase.storage.from('diary-images').createSignedUploadUrl(path);
  if (error || !data?.signedUrl) {
    console.error('[cast] 日記画像のアップロード先を作れなかった', user.id, error?.message);
    return { ok: false, error: '画像を送る準備ができませんでした。ページを開き直してから、もう一度選んでください。' };
  }
  const { data: { publicUrl } } = supabase.storage.from('diary-images').getPublicUrl(path);
  return { ok: true, signedUrl: data.signedUrl, publicUrl };
}

// ── 投稿（＋fukuX 同時投稿） ──
export async function postMyDiary(input: {
  therapistId: string;
  salonId: number;
  image: string | null;
  title: string;
  content: string;
  crosspostX: boolean;
  xProfileId: string | null;
  xNoReplies: boolean;
}): Promise<{ ok: true; id: string; xFailed: boolean } | Fail> {
  const tid = toId(input.therapistId);
  const sid = toId(input.salonId);
  if (!tid || !sid) return { ok: false, error: '投稿できませんでした。ページを開き直してください。' };
  const title = (input.title ?? '').trim();
  const content = (input.content ?? '').trim();
  const image = typeof input.image === 'string' && input.image ? input.image : null;
  if (!image && !title && !content) return { ok: false, error: '画像・タイトル・本文のいずれかを入力してください' };
  const { supabase, user } = await me();
  if (!user) return NO_LOGIN;

  const { data: posted, error } = await supabase.from('diary_posts').insert({
    therapist_id: tid,
    salon_id: sid,
    images: image ? [image] : [],
    title: title || null,
    content: content || null,
  }).select('id').single();
  if (error || !posted) {
    console.error('[cast] 日記を投稿できなかった', user.id, (error as { code?: string } | null)?.code, error?.message);
    return { ok: false, error: '投稿できませんでした。ページを開き直してから、もう一度お試しください。' };
  }

  // ★ fukuX 同時投稿は付随処理（失敗しても日記は投稿済み）。★ 本人のログインで入れる＝x_posts の INSERT ポリシーを正規に通る
  let xFailed = false;
  if (input.crosspostX && input.xProfileId) {
    const body = title && content ? `${title}\n\n${content}` : (title || content);
    const xImages = image ? [image] : [];
    if (body.length > 0 || xImages.length > 0) {
      const { error: xErr } = await supabase.from('x_posts').insert({
        author_profile_id: input.xProfileId,
        body: body || null,
        images: xImages,
        replies_disabled: !!input.xNoReplies,
      });
      if (xErr) { xFailed = true; console.error('[cast] fukuX 同時投稿に失敗', user.id, xErr.message); }
    }
  }
  return { ok: true, id: String(posted.id), xFailed };
}

// ── 編集 ──
export async function updateMyDiary(
  id: string, input: { title: string; content: string; image: string | null },
): Promise<{ ok: true } | Fail> {
  const { supabase, user } = await me();
  if (!user) return NO_LOGIN;
  const { data, error } = await supabase
    .from('diary_posts')
    .update({
      title: (input.title ?? '').trim() || null,
      content: (input.content ?? '').trim() || null,
      images: input.image ? [input.image] : [],
    })
    .eq('id', id)
    .select('id');
  if (error) {
    console.error('[cast] 日記を保存できなかった', user.id, error.message);
    return { ok: false, error: '保存できませんでした。ページを開き直してから、もう一度お試しください。' };
  }
  if (!data || data.length === 0) return { ok: false, error: 'この日記は保存できませんでした（ご本人の日記ではない可能性があります）。' };
  return { ok: true };
}

// ── 削除（画像も片付ける） ──
function storagePathFromUrl(url: string): string | null {
  const marker = '/diary-images/';
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}

export async function deleteMyDiary(id: string, images: string[]): Promise<{ ok: true } | Fail> {
  const { supabase, user } = await me();
  if (!user) return NO_LOGIN;
  const { error } = await supabase.from('diary_posts').delete().eq('id', id);
  if (error) {
    console.error('[cast] 日記を削除できなかった', user.id, error.message);
    return { ok: false, error: '削除できませんでした。ページを開き直してから、もう一度お試しください。' };
  }
  const paths = (Array.isArray(images) ? images : []).map(storagePathFromUrl).filter((p): p is string => !!p);
  if (paths.length > 0) await supabase.storage.from('diary-images').remove(paths); // ★ 失敗しても削除は成立済み
  return { ok: true };
}
