'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateTop } from '@/app/lib/revalidateTop';

const supabase = createClient();
const TITLE_MAX = 10;

type MyDiaryPost = {
  id: string;            // diary_posts.id（UUID/bigint いずれも文字列で扱う）
  images: string[];
  title: string | null;
  content: string | null;
  createdAt: string;
  therapistId: string;
  therapistName: string;
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

// diary-images の公開URLからバケット内パスを取り出す
function storagePathFromUrl(url: string): string | null {
  const marker = '/diary-images/';
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}

function validateImageFile(file: File): string | null {
  if (file.size > 5 * 1024 * 1024) return '5MB以下の画像を選択してください';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'JPEG・PNG・WebPのみ対応しています';
  return null;
}

export function MyDiaryList({
  salonId,
  reloadSignal,
  onToast,
}: {
  salonId: number;
  reloadSignal: number;
  onToast: (msg: string) => void;
}) {
  const [posts, setPosts] = useState<MyDiaryPost[]>([]);

  // 編集中の状態
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTherapistId, setEditTherapistId] = useState<string>('');
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editImage, setEditImage] = useState<string | null>(null);
  const [editUploading, setEditUploading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    const { data } = await supabase
      .from('diary_posts')
      .select('id, images, title, content, created_at, therapist_id, therapists(name)')
      .eq('salon_id', salonId)
      .order('created_at', { ascending: false });

    setPosts(
      ((data ?? []) as unknown as Array<{
        id: string | number; images: string[] | null; title: string | null; content: string | null;
        created_at: string; therapist_id: string | number;
        therapists: { name: string | null } | { name: string | null }[] | null;
      }>).map((r) => {
        const t = Array.isArray(r.therapists) ? r.therapists[0] : r.therapists;
        return {
          id: String(r.id),
          images: r.images ?? [],
          title: r.title ?? null,
          content: r.content ?? null,
          createdAt: r.created_at,
          therapistId: String(r.therapist_id),
          therapistName: t?.name ?? '',
        };
      })
    );
  }, [salonId]);

  useEffect(() => { loadPosts(); }, [loadPosts, reloadSignal]);

  const startEdit = (post: MyDiaryPost) => {
    setEditingId(post.id);
    setEditTherapistId(post.therapistId);
    setEditTitle(post.title ?? '');
    setEditBody(post.content ?? '');
    setEditImage(post.images[0] ?? null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditBody('');
    setEditImage(null);
  };

  const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { onToast(err); return; }
    setEditUploading(true);
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${editTherapistId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('diary-images').upload(path, file);
    if (error) {
      onToast(`アップロードに失敗しました: ${error.message}`);
      setEditUploading(false); e.target.value = ''; return;
    }
    const { data: { publicUrl } } = supabase.storage.from('diary-images').getPublicUrl(path);
    setEditImage(publicUrl);
    setEditUploading(false); e.target.value = '';
  };

  const handleSave = async (id: string) => {
    setSavingId(id);
    // .select() で実際に更新された行を取得。RLSでブロックされると0行が返る。
    const { data: updated, error } = await supabase
      .from('diary_posts')
      .update({
        title: editTitle.trim() || null,
        content: editBody.trim() || null,
        images: editImage ? [editImage] : [],
      })
      .eq('id', id)
      .select('id');
    setSavingId(null);
    if (error) { onToast(`保存に失敗しました: ${error.message}`); return; }
    if (!updated || updated.length === 0) {
      onToast('保存できませんでした（権限エラーの可能性があります）');
      return;
    }
    cancelEdit();
    revalidateTop(); // 成功時：トップのISRを即時更新
    onToast('日記を更新しました');
    loadPosts();
  };

  const handleDelete = async (post: MyDiaryPost) => {
    if (!window.confirm('この投稿を削除しますか？\nこの操作は取り消せません。')) return;
    setDeletingId(post.id);

    // 先にDB削除
    const { error } = await supabase.from('diary_posts').delete().eq('id', post.id);
    if (error) {
      setDeletingId(null);
      onToast(`削除に失敗しました: ${error.message}`);
      return;
    }
    // ストレージ画像も削除（失敗しても投稿削除は成立済み）
    const paths = post.images.map(storagePathFromUrl).filter((p): p is string => !!p);
    if (paths.length > 0) await supabase.storage.from('diary-images').remove(paths);

    setDeletingId(null);
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    revalidateTop(); // 削除成功時：トップのISRを即時更新
    onToast('投稿を削除しました');
  };

  return (
    <div className="border-t border-slate-100 pt-4 space-y-3">
      <p className="text-[11px] font-bold text-slate-400">投稿済み日記（{posts.length}件）</p>

      {posts.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">まだ投稿がありません</p>
      ) : (
        posts.map((post) => (
          <div key={post.id} className="border border-slate-100 rounded-2xl p-3">
            {editingId === post.id ? (
              /* ── 編集フォーム（インライン） ── */
              <div className="space-y-3">
                <p className="text-[11px] font-bold text-pink-500">編集中：{post.therapistName}</p>

                {/* 画像 */}
                <div>
                  {editImage ? (
                    <div className="relative w-28 h-28 rounded-xl overflow-hidden border border-pink-100 bg-slate-50">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={editImage} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setEditImage(null)}
                        aria-label="画像を削除"
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 text-white text-xs flex items-center justify-center hover:bg-black/75"
                      >×</button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-28 h-28 rounded-xl border-2 border-dashed border-pink-200 bg-pink-50/40 text-pink-400 cursor-pointer hover:bg-pink-50 transition-colors">
                      {editUploading ? (
                        <span className="text-[10px] font-bold">アップ中...</span>
                      ) : (
                        <>
                          <span className="text-2xl leading-none">＋</span>
                          <span className="text-[10px] font-bold mt-0.5">画像を追加</span>
                        </>
                      )}
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleEditImageUpload} disabled={editUploading} className="hidden" />
                    </label>
                  )}
                </div>

                {/* タイトル */}
                <div>
                  <input
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
                    placeholder="タイトルを入力"
                    maxLength={TITLE_MAX}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                  <p className="text-[10px] text-slate-400 text-right mt-0.5">{editTitle.length} / {TITLE_MAX}</p>
                </div>

                {/* 本文 */}
                <textarea
                  rows={4}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200 resize-none"
                  placeholder="本文を入力"
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                />

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold hover:border-pink-300 hover:text-pink-500 transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSave(post.id)}
                    disabled={savingId === post.id || editUploading}
                    className="px-5 py-2 rounded-xl text-white font-bold text-xs shadow-sm disabled:opacity-50"
                    style={{ background: 'linear-gradient(to right, #ec4899, #f97316)' }}
                  >
                    {savingId === post.id ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            ) : (
              /* ── 表示カード ── */
              <div className="flex gap-3">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                  {post.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={post.images[0]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300 text-lg font-bold">
                      {post.therapistName.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-pink-600 truncate">{post.therapistName}</p>
                  {post.title && <p className="text-sm font-bold text-slate-800 truncate">{post.title}</p>}
                  <p className="text-[10px] text-slate-400 mt-0.5">📅 {formatDateTime(post.createdAt)}</p>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(post)}
                    className="px-3 py-1 rounded-lg border border-pink-300 text-pink-600 text-[11px] font-bold hover:bg-pink-50 transition-colors"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(post)}
                    disabled={deletingId === post.id}
                    className="px-3 py-1 rounded-lg border border-rose-200 text-rose-500 text-[11px] font-bold bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50"
                  >
                    {deletingId === post.id ? '削除中...' : '削除'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
