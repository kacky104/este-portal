'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/app/lib/supabase/client';

const supabase = createClient();
const MAX_DIARY_IMAGES = 5;

type DiaryPost = {
  id: number;
  images: string[];
  comment: string | null;
  created_at: string;
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export function DiaryEditor({ therapistId }: { therapistId: string }) {
  const [posts, setPosts] = useState<DiaryPost[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const loadPosts = useCallback(async () => {
    const { data } = await supabase
      .from('diary_posts')
      .select('id, images, content, created_at')
      .eq('therapist_id', Number(therapistId))
      .order('created_at', { ascending: false });
    setPosts(
      (data ?? []).map((p) => ({
        id: p.id as number,
        images: (p.images as string[] | null) ?? [],
        comment: (p.content as string | null) ?? null,
        created_at: String(p.created_at),
      }))
    );
  }, [therapistId]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (images.length >= MAX_DIARY_IMAGES) {
      showToast(`画像は最大${MAX_DIARY_IMAGES}枚までです`);
      e.target.value = '';
      return;
    }
    setUploading(true);
    const ext = file.name.split('.').pop();
    const fileName = `${therapistId}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from('diary-images').upload(fileName, file);
    if (error) {
      showToast('アップロードに失敗しました: ' + error.message);
      setUploading(false);
      e.target.value = '';
      return;
    }
    const { data: urlData } = supabase.storage.from('diary-images').getPublicUrl(fileName);
    setImages((prev) => [...prev, urlData.publicUrl].slice(0, MAX_DIARY_IMAGES));
    setUploading(false);
    e.target.value = '';
  };

  const removeNewImage = (i: number) => setImages((prev) => prev.filter((_, idx) => idx !== i));

  const handlePost = async () => {
    if (images.length === 0 && !comment.trim()) {
      showToast('画像かコメントを入力してください');
      return;
    }
    setPosting(true);
    const { error } = await supabase.from('diary_posts').insert({
      therapist_id: Number(therapistId),
      images,
      content: comment.trim() || null,
    });
    setPosting(false);
    if (error) {
      showToast('投稿に失敗しました: ' + error.message);
      return;
    }
    setImages([]);
    setComment('');
    showToast('投稿しました');
    loadPosts();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('この投稿を削除しますか？')) return;
    setDeletingId(id);
    const { error } = await supabase.from('diary_posts').delete().eq('id', id);
    setDeletingId(null);
    if (error) {
      showToast('削除に失敗しました');
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== id));
    showToast('削除しました');
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-pink-200 shadow-lg rounded-2xl px-6 py-3 text-sm font-bold text-pink-600">
          {toast}
        </div>
      )}

      <h2 className="text-sm font-black text-slate-700">📷 写メ日記</h2>

      {/* 投稿フォーム */}
      <div className="space-y-3 border border-pink-100 rounded-2xl p-4 bg-pink-50/20">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500">画像（最大{MAX_DIARY_IMAGES}枚）</span>
          <span className="text-[10px] text-slate-400">{images.length} / {MAX_DIARY_IMAGES}枚</span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {images.map((url, i) => (
            <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-pink-100 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`画像${i + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeNewImage(i)}
                aria-label="削除"
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/55 text-white text-xs flex items-center justify-center hover:bg-black/75"
              >
                ×
              </button>
            </div>
          ))}
          {images.length < MAX_DIARY_IMAGES && (
            <label className="flex flex-col items-center justify-center aspect-square rounded-xl border-2 border-dashed border-pink-200 bg-white text-pink-400 cursor-pointer hover:bg-pink-50 transition-colors">
              {uploading ? (
                <span className="text-[10px] font-bold">アップ中...</span>
              ) : (
                <>
                  <span className="text-2xl leading-none">＋</span>
                  <span className="text-[10px] font-bold mt-0.5">追加</span>
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
          )}
        </div>

        <textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="コメント（任意）"
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-200 resize-none"
        />

        <div className="text-right">
          <button
            type="button"
            onClick={handlePost}
            disabled={posting || uploading}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm disabled:opacity-50"
          >
            {posting ? '投稿中...' : '投稿する'}
          </button>
        </div>
      </div>

      {/* 過去の投稿一覧 */}
      <div className="space-y-3">
        <p className="text-[11px] font-bold text-slate-400">投稿一覧（{posts.length}件）</p>
        {posts.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">まだ投稿がありません</p>
        ) : (
          posts.map((post) => (
            <div key={post.id} className="border border-slate-100 rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400">📅 {formatDateTime(post.created_at)}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(post.id)}
                  disabled={deletingId === post.id}
                  className="text-[10px] font-bold text-rose-400 hover:text-rose-600 disabled:opacity-50"
                >
                  {deletingId === post.id ? '削除中...' : '削除'}
                </button>
              </div>
              {post.images.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {post.images.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt={`投稿画像${i + 1}`}
                      className="w-20 h-20 rounded-lg object-cover flex-shrink-0 border border-slate-100"
                    />
                  ))}
                </div>
              )}
              {post.comment && (
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{post.comment}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
