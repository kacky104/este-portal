'use client';

import { useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { normalizeLinkUrl } from './xLink';
import type { XProfile } from './xProfile';
import type { XPost } from './xPosts';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';

const supabase = createClient();
const BODY_MAX = 500;
const MAX_IMAGES = 4;

function validateImageFile(file: File): string | null {
  if (file.size > 5 * 1024 * 1024) return '5MB以下の画像を選択してください';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'JPEG・PNG・WebPのみ対応しています';
  return null;
}

// 投稿コンポーザ。表示条件（approved の therapist/shop）は親で判定済み＝ここでは出ている時点で投稿可能。
// myAffiliatedShop: 自分（セラピスト）の所属先（あれば）。投稿直後の楽観カードに所属バッジを出すために使う。
export function XComposer({
  me,
  myAffiliatedShop,
  onPosted,
  parentPostId,
  editPost,
}: {
  me: XProfile;
  myAffiliatedShop?: { handle: string; displayName: string } | null;
  onPosted: (post: XPost) => void;
  // 指定時はリプライ作成モード（parent_post_id をセット・リプライ不可トグルは出さない）。
  parentPostId?: string;
  // 指定時は編集モード（新規 insert ではなく対象投稿を update・各値を初期表示）。
  editPost?: XPost;
}) {
  const isReply = !!parentPostId;
  const isEdit = !!editPost;
  // リプライ不可トグルは「通常投稿/通常投稿の編集」かつ自分が therapist/shop のときだけ表示（user には出さない＝DB側ガードと二重防御）。
  const canToggleReplies = !isReply && (me.kind === 'therapist' || me.kind === 'shop' || me.kind === 'official');

  const [body, setBody] = useState(editPost?.body ?? '');
  const [images, setImages] = useState<string[]>(editPost?.images ?? []);
  const [link, setLink] = useState(editPost?.linkUrl ?? '');
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [repliesDisabled, setRepliesDisabled] = useState(editPost?.repliesDisabled ?? false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      setError(`画像は最大${MAX_IMAGES}枚までです`);
      return;
    }
    setError('');
    setUploading(true);
    const picked = files.slice(0, room);
    for (let i = 0; i < picked.length; i++) {
      const file = picked[i];
      const verr = validateImageFile(file);
      if (verr) {
        setError(verr);
        continue;
      }
      const ext = file.name.split('.').pop() ?? 'jpg';
      // x-images の本人フォルダ配下に固定（RLS が先頭フォルダ = 本人UID を要求）。複数枚は連番で衝突回避。
      const path = `${me.auth_user_id}/${Date.now()}-${i}.${ext}`;
      const { error: upErr } = await supabase.storage.from('x-images').upload(path, file, { cacheControl: STORAGE_CACHE_CONTROL });
      if (upErr) {
        setError(`画像のアップロードに失敗しました: ${upErr.message}`);
        continue;
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from('x-images').getPublicUrl(path);
      setImages((prev) => (prev.length < MAX_IMAGES ? [...prev, publicUrl] : prev));
    }
    setUploading(false);
  };

  const removeImage = (idx: number) => setImages((prev) => prev.filter((_, i) => i !== idx));

  const trimmed = body.trim();
  // 本文空＋画像0 は送信不可（DB制約 x_post_not_empty に一致）。
  const canPost = (trimmed.length > 0 || images.length > 0) && !posting && !uploading;

  const submit = async () => {
    if (!canPost) return;
    // リンク検証（http/https のみ・スキーム無しは https:// 補完・危険スキームは弾く）。空はリンク無し。
    const { url: linkUrl, error: linkErr } = normalizeLinkUrl(link);
    if (linkErr) {
      setError(linkErr);
      return;
    }
    setPosting(true);
    setError('');

    // ── 編集モード：対象投稿を update（edited_at=now）。author/id/createdAt は維持。 ──
    if (editPost) {
      const editedAt = new Date().toISOString();
      const upd: Record<string, unknown> = {
        body: trimmed || null,
        images,
        link_url: linkUrl,
        edited_at: editedAt,
      };
      if (canToggleReplies) upd.replies_disabled = repliesDisabled;
      const { error: upErr } = await supabase.from('x_posts').update(upd).eq('id', editPost.id);
      setPosting(false);
      if (upErr) {
        setError(`編集できませんでした：${upErr.message}`);
        return;
      }
      // 反映用：元の投稿に編集後の値を上書きして親へ返す（author/id/createdAt は不変）。
      onPosted({
        ...editPost,
        body: trimmed || null,
        images,
        linkUrl,
        repliesDisabled: canToggleReplies ? repliesDisabled : editPost.repliesDisabled,
        editedAt,
      });
      return;
    }

    // ── 新規（投稿/リプライ）：insert ──
    // リプライ時は parent_post_id を、通常投稿で therapist/shop のときのみ replies_disabled を付与。
    // reply_count は触らない（DBトリガが親側を自動増減する）。link_url は検証済みのみ（空は null）。
    const payload: Record<string, unknown> = {
      author_profile_id: me.id,
      body: trimmed || null,
      images,
      link_url: linkUrl,
    };
    if (isReply) payload.parent_post_id = parentPostId;
    else if (canToggleReplies) payload.replies_disabled = repliesDisabled;

    const { data, error: insErr } = await supabase
      .from('x_posts')
      .insert(payload)
      .select('id, like_count, reply_count, replies_disabled, created_at')
      .single();
    setPosting(false);

    if (insErr) {
      // RLS違反（未承認shop／親がリプライ不可になっていた等）も握りつぶさずメッセージ化。
      setError(
        isReply
          ? `リプライできませんでした：${insErr.message}`
          : `投稿できませんでした：${insErr.message}`
      );
      return;
    }

    // 成功：一覧へ反映するための XPost を組み立てて親へ。
    onPosted({
      id: String(data?.id),
      body: trimmed || null,
      images,
      likeCount: (data?.like_count as number) ?? 0,
      replyCount: (data?.reply_count as number) ?? 0,
      repliesDisabled: Boolean(data?.replies_disabled),
      linkUrl,
      editedAt: null,
      createdAt: (data?.created_at as string) ?? new Date().toISOString(),
      author: {
        id: me.id,
        handle: me.handle,
        displayName: me.display_name,
        kind: me.kind,
        avatarUrl: me.avatar_url,
        isVerified: me.is_verified,
        address: me.address,
        // 自分が店舗所属セラピストなら、投稿直後の楽観カードにも所属バッジを出す。
        affiliatedShop: myAffiliatedShop ?? null,
      },
    });
    setBody('');
    setImages([]);
    setLink('');
  };

  return (
    <div className="pt-2 pb-4 border-b border-[color:var(--x-border)]">
      {error && (
        <div className="mb-2 p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 text-[12px] font-medium">
          ⚠️ {error}
        </div>
      )}
      <textarea
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={isReply ? '返信を入力' : 'いまどうしてる？'}
        maxLength={BODY_MAX}
        className="w-full px-3 py-2.5 rounded-xl border border-[color:var(--x-border-strong)] text-sm bg-[color:var(--x-inset)] text-[color:var(--x-text-primary)] placeholder:text-[color:var(--x-text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent resize-none"
      />

      {/* 画像プレビュー（個別削除） */}
      {images.length > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-2">
          {images.map((src, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-[color:var(--x-border)] bg-[color:var(--x-inset)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                aria-label="画像を削除"
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/55 text-white text-xs flex items-center justify-center hover:bg-black/75"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* リンク（任意・http/https のみ）。text-base(16px) で iOS 自動ズーム抑止。 */}
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] px-3 focus-within:ring-2 focus-within:ring-indigo-300 focus-within:border-transparent">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[color:var(--x-text-muted)] flex-shrink-0">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <input
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="リンク（任意）https://example.com"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 py-2.5 text-base bg-transparent text-[color:var(--x-text-primary)] placeholder:text-[color:var(--x-text-muted)] focus:outline-none"
        />
      </div>

      {/* リプライ不可トグル（通常投稿・therapist/shop のみ） */}
      {canToggleReplies && (
        <label className="mt-2 flex items-center gap-2 text-[12px] font-medium text-[color:var(--x-text-secondary)] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={repliesDisabled}
            onChange={(e) => setRepliesDisabled(e.target.checked)}
            className="accent-indigo-500"
          />
          リプライを許可しない
        </label>
      )}

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label
            className={`inline-flex items-center gap-1 text-xs font-bold cursor-pointer transition-colors ${
              images.length >= MAX_IMAGES ? 'text-[color:var(--x-text-muted)] cursor-not-allowed' : 'text-indigo-500 hover:text-[color:var(--x-accent)]'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            {uploading ? 'アップ中...' : `画像（${images.length}/${MAX_IMAGES}）`}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={onPick}
              disabled={uploading || images.length >= MAX_IMAGES}
              className="hidden"
            />
          </label>
          <span className="text-[11px] text-[color:var(--x-text-muted)] tabular-nums">
            残り{BODY_MAX - body.length}
          </span>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!canPost}
          className="px-5 py-2 rounded-full text-white font-bold text-sm shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
        >
          {posting
            ? isEdit
              ? '保存中...'
              : isReply
                ? '送信中...'
                : '投稿中...'
            : isEdit
              ? '保存する'
              : isReply
                ? '返信する'
                : '投稿する'}
        </button>
      </div>
    </div>
  );
}
