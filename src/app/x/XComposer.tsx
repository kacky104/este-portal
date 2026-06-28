'use client';

import { useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import type { XProfile } from './xProfile';
import type { XPost } from './xPosts';

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
}: {
  me: XProfile;
  myAffiliatedShop?: { handle: string; displayName: string } | null;
  onPosted: (post: XPost) => void;
}) {
  const [body, setBody] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

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
      const { error: upErr } = await supabase.storage.from('x-images').upload(path, file);
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
    setPosting(true);
    setError('');
    const { data, error: insErr } = await supabase
      .from('x_posts')
      .insert({
        author_profile_id: me.id,
        body: trimmed || null,
        images,
      })
      .select('id, like_count, created_at')
      .single();
    setPosting(false);

    if (insErr) {
      // RLS違反（未承認shop等）も握りつぶさずメッセージ化。
      setError(`投稿できませんでした：${insErr.message}`);
      return;
    }

    // 成功：タイムライン先頭へ反映するための XPost を組み立てて親へ。
    onPosted({
      id: String(data?.id),
      body: trimmed || null,
      images,
      likeCount: (data?.like_count as number) ?? 0,
      createdAt: (data?.created_at as string) ?? new Date().toISOString(),
      author: {
        id: me.id,
        handle: me.handle,
        displayName: me.display_name,
        kind: me.kind,
        avatarUrl: me.avatar_url,
        isVerified: me.is_verified,
        // 自分が店舗所属セラピストなら、投稿直後の楽観カードにも所属バッジを出す。
        affiliatedShop: myAffiliatedShop ?? null,
      },
    });
    setBody('');
    setImages([]);
  };

  return (
    <div className="pt-2 pb-4 border-b border-slate-100">
      {error && (
        <div className="mb-2 p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 text-[12px] font-medium">
          ⚠️ {error}
        </div>
      )}
      <textarea
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="いまどうしてる？"
        maxLength={BODY_MAX}
        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent resize-none"
      />

      {/* 画像プレビュー（個別削除） */}
      {images.length > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-2">
          {images.map((src, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-100 bg-slate-50">
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

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label
            className={`inline-flex items-center gap-1 text-xs font-bold cursor-pointer transition-colors ${
              images.length >= MAX_IMAGES ? 'text-slate-300 cursor-not-allowed' : 'text-indigo-500 hover:text-indigo-600'
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
          <span className="text-[11px] text-slate-400 tabular-nums">
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
          {posting ? '投稿中...' : '投稿する'}
        </button>
      </div>
    </div>
  );
}
