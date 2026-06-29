'use client';

// セラピスト本人用の写メ日記セクション（フェーズ2）。
// オーナー版（/mypage の handleDiaryPost / handleDiaryImageUpload と MyDiaryList）を流用しつつ、
// 最大の違いは「セラピストを選択させない＝本人の therapist.id に固定する」こと。
// therapist_id / salon_id は props で受け取った本人の値のみを使い、クライアント入力やURLからは受け取らない
// （改ざん経路を作らない＝二重防御。最終的な権限は本人用 RLS が保証する）。
// クライアント直叩き（ブラウザの supabase＝anon＋本人セッション）。本人用 RLS により自分の日記のみ操作可能。

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateSalon } from '@/app/lib/revalidateTop';

const supabase = createClient();
const TITLE_MAX = 10;
const PAGE_SIZE = 30; // 1ページあたりの投稿数（DBから range で30件だけ取得）

type CastDiaryPost = {
  id: string;
  images: string[];
  title: string | null;
  content: string | null;
  createdAt: string;
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

// diary-images の公開URLからバケット内パスを取り出す（オーナー版と同じ）
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

export function CastDiary({
  therapistId,
  therapistName,
  salonId,
  xProfileId,
}: {
  therapistId: string; // 本人の therapist.id（固定）
  therapistName: string;
  salonId: number;
  xProfileId: string | null; // 連携 fukuX プロフィール id（非連携は null＝同時投稿UIを出さない）
}) {
  // ── 簡易トースト（/cast はサーバーコンポーネントで showToast が無いためローカルで持つ） ──
  const [toast, setToast] = useState('');
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 3000);
  }, []);

  // ── 投稿フォーム ──
  const [diaryImage, setDiaryImage] = useState<string | null>(null);
  const [diaryTitle, setDiaryTitle] = useState('');
  const [diaryBody, setDiaryBody] = useState('');
  const [diaryUploading, setDiaryUploading] = useState(false);
  const [diaryPosting, setDiaryPosting] = useState(false);
  const [crosspostX, setCrosspostX] = useState(false); // fukuX 同時投稿（デフォルトOFF・連携時のみ表示）

  // ── 一覧 ──
  const [posts, setPosts] = useState<CastDiaryPost[]>([]);
  const [total, setTotal] = useState(0);

  // ── 編集中の状態（オーナー版 MyDiaryList と同じ） ──
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editImage, setEditImage] = useState<string | null>(null);
  const [editUploading, setEditUploading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── ページネーション（?page= とURL同期。MyDiaryList と同じ操作感） ──
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rawPage = Number(searchParams.get('page'));
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const goTo = useCallback((n: number, pages: number) => {
    const target = Math.min(Math.max(1, n), pages);
    router.replace(target === 1 ? pathname : `${pathname}?page=${target}`, { scroll: false });
  }, [router, pathname]);

  const loadPosts = useCallback(async () => {
    // 総件数（本人の therapist_id で絞る）
    const { count } = await supabase
      .from('diary_posts')
      .select('id', { count: 'exact', head: true })
      .eq('therapist_id', Number(therapistId));
    const totalCount = count ?? 0;
    setTotal(totalCount);

    const pages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    if (page > pages) { goTo(pages, pages); return; }

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data } = await supabase
      .from('diary_posts')
      .select('id, images, title, content, created_at')
      .eq('therapist_id', Number(therapistId))
      .order('created_at', { ascending: false })
      .range(from, to);

    setPosts(
      ((data ?? []) as unknown as Array<{
        id: string | number; images: string[] | null; title: string | null;
        content: string | null; created_at: string;
      }>).map((r) => ({
        id: String(r.id),
        images: r.images ?? [],
        title: r.title ?? null,
        content: r.content ?? null,
        createdAt: r.created_at,
      }))
    );
  }, [therapistId, page, goTo]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  // ── 投稿フォーム：画像アップロード（パスは必ず本人の therapist_id 配下に固定） ──
  const handleDiaryImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { showToast(err); return; }
    setDiaryUploading(true);
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${therapistId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('diary-images').upload(path, file);
    if (error) {
      showToast(`アップロードに失敗しました: ${error.message}`);
      setDiaryUploading(false); e.target.value = ''; return;
    }
    const { data: { publicUrl } } = supabase.storage.from('diary-images').getPublicUrl(path);
    setDiaryImage(publicUrl);
    setDiaryUploading(false); e.target.value = '';
  };

  // ── 投稿（therapist_id / salon_id は本人固定） ──
  const handleDiaryPost = async () => {
    if (!diaryImage && !diaryTitle.trim() && !diaryBody.trim()) {
      showToast('画像・タイトル・本文のいずれかを入力してください');
      return;
    }
    setDiaryPosting(true);
    const { error } = await supabase.from('diary_posts').insert({
      therapist_id: Number(therapistId),
      salon_id:     salonId,
      images:       diaryImage ? [diaryImage] : [],
      title:        diaryTitle.trim() || null,
      content:      diaryBody.trim() || null,
    });
    if (error) { setDiaryPosting(false); showToast(`投稿に失敗しました: ${error.message}`); return; }

    // ── fukuX 同時投稿（チェックON かつ連携あり時のみ・ワンタイムのフォーク）──
    // 日記の保存は上で成功済み。fukuX への投稿は付随処理＝失敗しても日記投稿は成功扱い（best-effort）。
    // 同じ認証クライアントで insert＝x_posts の INSERT ポリシー(author_profile_id = x_my_profile_id())を
    // 正規に通る（service_role 不使用＝なりすまし不能）。編集・削除は同期しない。
    if (crosspostX && xProfileId) {
      const titlePart = diaryTitle.trim();
      const contentPart = diaryBody.trim();
      // body = タイトル行 + 改行 + 本文（片方のみ・両方空も許容）
      const body =
        titlePart && contentPart ? `${titlePart}\n\n${contentPart}` : (titlePart || contentPart);
      const xImages = diaryImage ? [diaryImage] : [];
      if (body.length > 0 || xImages.length > 0) {
        const { error: xErr } = await supabase.from('x_posts').insert({
          author_profile_id: xProfileId, // 本人の fukuX プロフィール id（uuid）
          body: body || null,            // 空なら null（fukuX の画像のみ投稿と同じ作法）
          images: xImages,               // diary と同じフルURL配列をそのままコピー
        });
        if (xErr) console.error('crosspost to x_posts failed:', xErr); // 握りつぶしてログのみ
      }
    }

    setDiaryPosting(false);
    setDiaryImage(null);
    setDiaryTitle('');
    setDiaryBody('');
    setCrosspostX(false); // 毎回デフォルトOFFに戻す（都度オプトイン）
    revalidateSalon(salonId, { top: false }); // 公開側（サロン詳細・セラピスト日記）を更新（best-effort）
    showToast('写メ日記を投稿しました');
    loadPosts();
  };

  // ── 編集 ──
  const startEdit = (post: CastDiaryPost) => {
    setEditingId(post.id);
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
    if (err) { showToast(err); return; }
    setEditUploading(true);
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${therapistId}/${Date.now()}.${ext}`; // 本人フォルダ固定
    const { error } = await supabase.storage.from('diary-images').upload(path, file);
    if (error) {
      showToast(`アップロードに失敗しました: ${error.message}`);
      setEditUploading(false); e.target.value = ''; return;
    }
    const { data: { publicUrl } } = supabase.storage.from('diary-images').getPublicUrl(path);
    setEditImage(publicUrl);
    setEditUploading(false); e.target.value = '';
  };

  const handleSave = async (id: string) => {
    setSavingId(id);
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
    if (error) { showToast(`保存に失敗しました: ${error.message}`); return; }
    if (!updated || updated.length === 0) {
      showToast('保存できませんでした（権限エラーの可能性があります）');
      return;
    }
    cancelEdit();
    revalidateSalon(salonId, { top: false });
    showToast('日記を更新しました');
    loadPosts();
  };

  const handleDelete = async (post: CastDiaryPost) => {
    if (!window.confirm('この投稿を削除しますか？\nこの操作は取り消せません。')) return;
    setDeletingId(post.id);

    // 先にDB削除
    const { error } = await supabase.from('diary_posts').delete().eq('id', post.id);
    if (error) {
      setDeletingId(null);
      showToast(`削除に失敗しました: ${error.message}`);
      return;
    }
    // ストレージ画像も削除（失敗しても投稿削除は成立済み）
    const paths = post.images.map(storagePathFromUrl).filter((p): p is string => !!p);
    if (paths.length > 0) await supabase.storage.from('diary-images').remove(paths);

    setDeletingId(null);
    revalidateSalon(salonId, { top: false });
    showToast('投稿を削除しました');
    loadPosts();
  };

  const btnClass =
    'px-4 py-2 rounded-xl border border-pink-300 text-pink-600 text-sm font-bold hover:bg-pink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

  return (
    <div className="space-y-5">
      {/* ── 投稿フォーム ── */}
      <div className="bg-white rounded-3xl border border-pink-100 shadow-sm p-5 space-y-3">
        <p className="text-[11px] font-bold text-slate-400">写メ日記を投稿（{therapistName}）</p>

        {/* 画像（1枚） */}
        <div>
          <label className="text-[11px] font-bold text-slate-500 block mb-1">画像（1枚）</label>
          <p className="text-[10px] text-slate-400 mb-1.5">推奨：800×450px（横長）／ JPEG・PNG・WebP・5MB以下</p>
          {diaryImage ? (
            <div className="relative w-32 h-32 rounded-xl overflow-hidden border border-pink-100 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={diaryImage} alt="投稿画像" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setDiaryImage(null)}
                aria-label="削除"
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 text-white text-xs flex items-center justify-center hover:bg-black/75"
              >×</button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-32 h-32 rounded-xl border-2 border-dashed border-pink-200 bg-pink-50/40 text-pink-400 cursor-pointer hover:bg-pink-50 transition-colors">
              {diaryUploading ? (
                <span className="text-[10px] font-bold">アップ中...</span>
              ) : (
                <>
                  <span className="text-2xl leading-none">＋</span>
                  <span className="text-[10px] font-bold mt-0.5">画像を追加</span>
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleDiaryImageUpload}
                disabled={diaryUploading}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* タイトル（最大10文字） */}
        <div>
          <label className="text-[11px] font-bold text-slate-500 block mb-1">タイトル（最大{TITLE_MAX}文字）</label>
          <input
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
            placeholder="タイトルを入力"
            maxLength={TITLE_MAX}
            value={diaryTitle}
            onChange={(e) => setDiaryTitle(e.target.value)}
          />
          <p className="text-[10px] text-slate-400 text-right mt-0.5">{diaryTitle.length} / {TITLE_MAX}</p>
        </div>

        {/* 本文 */}
        <div>
          <label className="text-[11px] font-bold text-slate-500 block mb-1">本文</label>
          <textarea
            rows={5}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200 resize-none"
            placeholder="本文を入力"
            value={diaryBody}
            onChange={(e) => setDiaryBody(e.target.value)}
          />
        </div>

        {/* fukuX 同時投稿（連携 approved セラピストのみ表示・デフォルトOFF） */}
        {xProfileId && (
          <label className="flex items-center gap-2 cursor-pointer select-none pt-0.5">
            <input
              type="checkbox"
              checked={crosspostX}
              onChange={(e) => setCrosspostX(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-pink-500 focus:ring-pink-200"
            />
            <span className="text-[12px] font-bold text-slate-600">
              fukuX にも投稿する
            </span>
          </label>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleDiaryPost}
            disabled={diaryPosting || diaryUploading}
            className="px-6 py-2 rounded-xl text-white font-bold text-xs shadow-sm disabled:opacity-50"
            style={{ background: 'linear-gradient(to right, #ec4899, #f97316)' }}
          >
            {diaryPosting ? '投稿中...' : '投稿する'}
          </button>
        </div>
      </div>

      {/* ── 投稿済み日記一覧（自分の分のみ） ── */}
      <div className="bg-white rounded-3xl border border-pink-100 shadow-sm p-5">
        <p className="text-[11px] font-bold text-slate-400">投稿済み日記（{total}件）</p>

        <div className="mt-3 space-y-3">
          {total === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">まだ投稿がありません</p>
          ) : (
            posts.map((post) => (
              <div key={post.id} className="border border-slate-100 rounded-2xl p-3">
                {editingId === post.id ? (
                  /* ── 編集フォーム（インライン） ── */
                  <div className="space-y-3">
                    <p className="text-[11px] font-bold text-pink-500">編集中</p>

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
                          {therapistName.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
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

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-2">
              <button type="button" onClick={() => goTo(page - 1, totalPages)} disabled={page <= 1} className={btnClass}>
                ← 前へ
              </button>
              <span className="text-sm font-bold text-slate-500 tabular-nums">
                {page} / {totalPages}
              </span>
              <button type="button" onClick={() => goTo(page + 1, totalPages)} disabled={page >= totalPages} className={btnClass}>
                次へ →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── トースト ── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
