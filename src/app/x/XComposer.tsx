'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import { normalizeLinkUrl } from './xLink';
import type { XProfile } from './xProfile';
import type { XPost } from './xPosts';
import type { XDraft } from './xDrafts';
import { XDraftsPanel } from './XDraftsPanel';
import { refreshXPostLinkPreview } from './xLinkPreviewActions';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';

const supabase = createClient();
const BODY_MAX = 500;
const MAX_IMAGES = 4;

function validateImageFile(file: File): string | null {
  if (file.size > 5 * 1024 * 1024) return '5MB以下の画像を選択してください';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'JPEG・PNG・WebPのみ対応しています';
  return null;
}

// 親（XComposeFab）が「閉じる時確認」で使う命令ハンドル。
// hasUnsavedDraftableContent: 下書き化できる未送信内容があるか（本文 or 画像）。
// saveDraft: 現在の内容を下書きに保存し、成否を返す（フィールドは成功時に空へ戻す）。
export type XComposerHandle = {
  hasUnsavedDraftableContent: () => boolean;
  saveDraft: () => Promise<boolean>;
};

type XComposerProps = {
  me: XProfile;
  myAffiliatedShop?: { handle: string; displayName: string } | null;
  onPosted: (post: XPost) => void;
  // 指定時はリプライ作成モード（parent_post_id をセット・リプライ不可トグルは出さない）。
  parentPostId?: string;
  // 指定時は編集モード（新規 insert ではなく対象投稿を update・各値を初期表示）。編集は下書き対象外。
  editPost?: XPost;
  // 下書き保存が成功したときに親へ通知（FABはこれでモーダルを閉じてトースト表示）。
  // 未指定（インラインのリプライ欄など）ではコンポーザ内に緑の通知を出す。
  onDraftSaved?: () => void;
};

// 投稿コンポーザ。表示条件（approved の therapist/shop）は親で判定済み＝ここでは出ている時点で投稿可能。
// myAffiliatedShop: 自分（セラピスト）の所属先（あれば）。投稿直後の楽観カードに所属バッジを出すために使う。
export const XComposer = forwardRef<XComposerHandle, XComposerProps>(function XComposer(
  { me, myAffiliatedShop, onPosted, parentPostId, editPost, onDraftSaved },
  ref
) {
  const isReply = !!parentPostId;
  const isEdit = !!editPost;
  const router = useRouter();
  // リプライ不可トグルは「通常投稿/通常投稿の編集」かつ自分が therapist/shop のときだけ表示（user には出さない＝DB側ガードと二重防御）。
  const canToggleReplies = !isReply && (me.kind === 'therapist' || me.kind === 'shop' || me.kind === 'official');

  const [body, setBody] = useState(editPost?.body ?? '');
  const [images, setImages] = useState<string[]>(editPost?.images ?? []);
  const [link, setLink] = useState(editPost?.linkUrl ?? '');
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [repliesDisabled, setRepliesDisabled] = useState(editPost?.repliesDisabled ?? false);

  // ── 下書き関連 ──
  // activeDraftId: いま編集中の下書きの id（null=下書き由来ではない新規作成）。
  //   保存時は id 有りなら update、無しなら insert。投稿成功時に id 有りならその下書きを削除する。
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftNotice, setDraftNotice] = useState('');
  const [showDrafts, setShowDrafts] = useState(false);

  // 下書き化できる内容があるか（DB制約 x_post_not_empty と同じく本文 or 画像が要る。リンクのみは不可）。
  const hasDraftableContent = body.trim().length > 0 || images.length > 0;

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

  // ── 下書き保存の実体：成功で true。フィールドは空へ戻す（内容は下書きに退避済み）。 ──
  // ボタン経由・親からの命令（閉じる時確認）双方でこれを使う。フィードバックは呼び出し側で出す。
  const doSaveDraft = async (): Promise<boolean> => {
    if (isEdit) return false; // 既存投稿の編集は下書き対象外
    if (!hasDraftableContent || savingDraft || posting || uploading) return false;
    const { url: linkUrl, error: linkErr } = normalizeLinkUrl(link);
    if (linkErr) {
      setError(linkErr);
      return false;
    }
    setSavingDraft(true);
    setError('');
    const row: Record<string, unknown> = {
      body: trimmed || null,
      images,
      link_url: linkUrl,
      replies_disabled: canToggleReplies ? repliesDisabled : false,
    };
    let ok = false;
    if (activeDraftId) {
      // 既存下書きの上書き（updated_at はトリガで自動更新）。
      const { error: upErr } = await supabase.from('x_drafts').update(row).eq('id', activeDraftId);
      ok = !upErr;
      if (upErr) setError(`下書きを保存できませんでした：${upErr.message}`);
    } else {
      // 新規下書き。リプライ下書きは parent_post_id を付与（x_posts.id は bigint＝文字列でも自動変換）。
      const { error: insErr } = await supabase
        .from('x_drafts')
        .insert({ ...row, author_profile_id: me.id, parent_post_id: parentPostId ?? null });
      ok = !insErr;
      if (insErr) setError(`下書きを保存できませんでした：${insErr.message}`);
    }
    setSavingDraft(false);
    if (ok) {
      setBody('');
      setImages([]);
      setLink('');
      setRepliesDisabled(false);
      setActiveDraftId(null);
    }
    return ok;
  };

  // ボタン「下書き保存」：保存後、親があれば通知（FABは閉じる）、無ければ緑の通知を出す。
  const onClickSaveDraft = async () => {
    const ok = await doSaveDraft();
    if (!ok) return;
    if (onDraftSaved) onDraftSaved();
    else setDraftNotice('下書きに保存しました');
  };

  // 一覧で選んだ下書きをコンポーザに読み込む（以後の保存は上書き＝update）。
  const loadDraft = (d: XDraft) => {
    setBody(d.body ?? '');
    setImages(d.images);
    setLink(d.linkUrl ?? '');
    setRepliesDisabled(canToggleReplies ? d.repliesDisabled : false);
    setActiveDraftId(d.id);
    setShowDrafts(false);
    setError('');
    setDraftNotice('');
  };

  // 親（XComposeFab）へ命令ハンドルを公開（閉じる時確認で使用）。
  useImperativeHandle(ref, () => ({
    hasUnsavedDraftableContent: () => hasDraftableContent,
    saveDraft: doSaveDraft,
  }));

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
      // リンクが変わった/消えた/付いた場合は OGPカードを取り直し、反映のため再フェッチ（取得は fukues.com のみ）。
      if ((editPost.linkUrl ?? '') !== (linkUrl ?? '')) {
        void refreshXPostLinkPreview(editPost.id, linkUrl).then(() => router.refresh());
      }
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
    // 下書きから起こした投稿なら、その下書きを削除（投稿できたので不要）。
    if (activeDraftId) {
      await supabase.from('x_drafts').delete().eq('id', activeDraftId);
      setActiveDraftId(null);
    }
    setBody('');
    setImages([]);
    setLink('');
    // fukues.com のリンクなら OGPカードをサーバー側で取得→反映のため再フェッチ。
    if (linkUrl && data?.id) {
      void refreshXPostLinkPreview(String(data.id), linkUrl).then(() => router.refresh());
    }
  };

  return (
    <div className="pt-2 pb-4 border-b border-[color:var(--x-border)]">
      {error && (
        <div className="mb-2 p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 text-[12px] font-medium">
          ⚠️ {error}
        </div>
      )}
      {draftNotice && (
        <div className="mb-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 text-[12px] font-medium">
          ✓ {draftNotice}
        </div>
      )}
      <textarea
        rows={isReply ? 3 : 6}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (draftNotice) setDraftNotice('');
        }}
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

          {/* 下書き一覧（編集モード以外）。通常投稿=通常下書き / リプライ=このスレッドのリプライ下書き。 */}
          {!isEdit && (
            <button
              type="button"
              onClick={() => setShowDrafts(true)}
              className="inline-flex items-center gap-1 text-xs font-bold text-indigo-500 hover:text-[color:var(--x-accent)] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M8 13h8M8 17h6" />
              </svg>
              下書き
            </button>
          )}

          <span className="text-[11px] text-[color:var(--x-text-muted)] tabular-nums">
            残り{BODY_MAX - body.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 下書き保存（編集モード以外・内容があるときのみ有効） */}
          {!isEdit && (
            <button
              type="button"
              onClick={onClickSaveDraft}
              disabled={!hasDraftableContent || savingDraft || posting || uploading}
              className="px-4 py-2 rounded-full font-bold text-sm border border-[color:var(--x-border-strong)] text-[color:var(--x-text-secondary)] hover:bg-[color:var(--x-inset)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {savingDraft ? '保存中...' : '下書き保存'}
            </button>
          )}
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

      {/* 下書き一覧モーダル（fixed オーバーレイ＝コンポーザの配置文脈に依らず最前面） */}
      {showDrafts && (
        <XDraftsPanel
          me={me}
          parentPostId={parentPostId ?? null}
          onPick={loadDraft}
          onClose={() => setShowDrafts(false)}
        />
      )}
    </div>
  );
});
