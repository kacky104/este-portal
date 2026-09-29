'use client';

// セラピスト本人用の写メ日記セクション（フェーズ2）。
// オーナー版（/mypage の handleDiaryPost / handleDiaryImageUpload と MyDiaryList）を流用しつつ、
// 最大の違いは「セラピストを選択させない＝本人の therapist.id に固定する」こと。
// therapist_id / salon_id は props で受け取った本人の値のみを使い、クライアント入力やURLからは受け取らない
// （改ざん経路を作らない＝二重防御。最終的な権限は本人用 RLS が保証する）。
// ★ 第981便: 読み書きはサーバーアクション（app/actions/castDiary.ts）。本人のログインのままサーバーで動かすので、本人用 RLS はそのまま効く。
//   （LINE 等のアプリ内ブラウザで、ブラウザの supabase-js が送る前に止まって投稿できない事故の対策）

import { CastCardTitle } from './CastCardTitle';
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { listMyDiaries, createMyDiaryUploadUrl, postMyDiary, updateMyDiary, deleteMyDiary } from '@/app/actions/castDiary';
import { revalidateSalon } from '@/app/lib/revalidateTop';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';
import { compressImage } from '@/app/lib/compressImage'; // ★ 第999便: 送る前にスマホ側で縮める
// ★ 取り込んだ日記の印（第98便）。★ セラピスト様が「書いていない日記が載っている」と驚かないように
import { listImportedDiaries } from '@/app/actions/diaryImports';
import { importedDiaryLabel, importedDiaryDeleteConfirm } from '@/lib/mediaOverview';
import { providerLabel } from '@/lib/mediaAudit';


// ★ 第981便: サーバーが作った「本人フォルダ専用・一回限り」のアップロード先へ、画像をブラウザから直接送る。
//   （Vercel はサーバーに送れる大きさに上限があるため、画像だけはサーバーを通さない。supabase-js も通さない）
async function uploadDiaryImage(therapistId: string, file: File): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const c = await compressImage(file); // ★ 第999便: 長辺1600px・WebP に縮めてから送る
  const ext = c.ext;
  let prep: Awaited<ReturnType<typeof createMyDiaryUploadUrl>>;
  try {
    prep = await createMyDiaryUploadUrl(therapistId, ext);
  } catch {
    return { ok: false, error: '通信できませんでした。電波のよい場所で、もう一度選んでください。' };
  }
  if (!prep.ok) return prep;
  try {
    const fd = new FormData();
    fd.append('cacheControl', STORAGE_CACHE_CONTROL);
    fd.append('', c.blob);
    const r = await fetch(prep.signedUrl, {
      method: 'PUT',
      body: fd,
      headers: { 'x-upsert': 'false', apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' },
    });
    if (!r.ok) {
      console.error('diary image upload failed:', r.status, await r.text().catch(() => ''));
      return { ok: false, error: '画像を送れませんでした。もう一度選んでください。' };
    }
  } catch {
    return { ok: false, error: '通信できませんでした。電波のよい場所で、もう一度選んでください。' };
  }
  return { ok: true, url: prep.publicUrl };
}
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

function validateImageFile(file: File): string | null {
  if (file.size > 20 * 1024 * 1024) return '20MB以下の画像を選択してください'; // ★ 第999便: 送る前に縮めるので上限を 5MB→20MB に
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
  const [crosspostX, setCrosspostX] = useState(true); // fukuX 同時投稿（デフォルトON・連携時のみ表示。外したいときだけチェックを外す）
  const [crosspostXNoReplies, setCrosspostXNoReplies] = useState(false); // fukuX投稿のリプライ禁止（fukuX ON時のみ表示・デフォルトOFF）

  // ── 一覧 ──
  const [posts, setPosts] = useState<CastDiaryPost[]>([]);
  // ★ diary_posts.id → 媒体。★ 取り込んだ日記だけが入る（第98便）
  const [importedOf, setImportedOf] = useState<Record<string, string>>({});
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
    let res: Awaited<ReturnType<typeof listMyDiaries>>;
    try {
      res = await listMyDiaries(therapistId, page);
    } catch {
      showToast('日記を読み込めませんでした。電波のよい場所で、ページを開き直してください。');
      return;
    }
    if (!res.ok) { showToast(res.error); return; }
    setTotal(res.total);
    const pages = Math.max(1, Math.ceil(res.total / PAGE_SIZE));
    if (page > pages) { goTo(pages, pages); return; }
    setPosts(res.posts);
  }, [therapistId, page, goTo, showToast]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  // ★★ どれが取り込んだ日記かを別口で引く。★ 引けなくても一覧は出す（印が出ないだけ）
  useEffect(() => {
    let alive = true;
    const ids = posts.map((p) => p.id);
    // ★ 0件のときは呼ばない。★ 印の持ち回しは残るが、出す相手が居ないので害はない
    if (ids.length === 0) return;
    listImportedDiaries({ diaryPostIds: ids })
      .then((r) => { if (alive && r.ok && r.data) setImportedOf(r.data); })
      .catch(() => { /* ★ 印が出ないだけ。黙って進む */ });
    return () => { alive = false; };
  }, [posts]);

  // ── 投稿フォーム：画像アップロード（パスは必ず本人の therapist_id 配下に固定） ──
  const handleDiaryImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { showToast(err); return; }
    setDiaryUploading(true);
    const up = await uploadDiaryImage(therapistId, file);
    setDiaryUploading(false); e.target.value = '';
    if (!up.ok) { showToast(up.error); return; }
    setDiaryImage(up.url);
  };

  // ── 投稿（therapist_id / salon_id は本人固定） ──
  const handleDiaryPost = async () => {
    if (!diaryImage && !diaryTitle.trim() && !diaryBody.trim()) {
      showToast('画像・タイトル・本文のいずれかを入力してください');
      return;
    }
    setDiaryPosting(true);
    // ★ 第981便: 日記の保存と fukuX 同時投稿はサーバーで（本人のログインのまま＝RLS・x_posts のポリシーはそのまま効く）
    let res: Awaited<ReturnType<typeof postMyDiary>>;
    try {
      res = await postMyDiary({
        therapistId,
        salonId,
        image: diaryImage,
        title: diaryTitle,
        content: diaryBody,
        crosspostX,
        xProfileId,
        xNoReplies: crosspostXNoReplies,
      });
    } catch {
      setDiaryPosting(false);
      showToast('通信できませんでした。電波のよい場所で、もう一度押してください。');
      return;
    }
    if (!res.ok) { setDiaryPosting(false); showToast(res.error); return; }
    const posted = { id: res.id };

    // ── 他媒体への転送（第36便・第2弾）────────────────────────────
    // 店舗の salons.diary_source が 'fukues' のときだけ、駅ちか・エスラブの投稿用アドレスへ送る。
    // 既定は 'benry' なので、切り替えていない店舗では何も起きない。
    // ★ 日記の保存は上で成功済み。転送は付随処理＝失敗しても日記投稿は成功扱い（fukuX と同じ）。
    //   結果は diary_forward_log に残るので、あとから再送できる。
    // ★ 即時反映が売りなので await して送る（cron に積むと10分遅れのベンリー経由と変わらなくなる）。
    if (posted?.id) {
      try {
        const fr = await fetch('/api/diary/forward', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ diaryId: posted.id }),
        });
        const fj = (await fr.json().catch(() => null)) as { 宛先?: Array<{ status?: string }> } | null;
        const sent = (fj?.宛先 ?? []).filter((x) => x.status === 'sent').length;
        if (sent > 0) showToast(`他媒体へ ${sent} 件送信しました`);
      } catch (e) {
        console.error('diary forward failed:', e); // 握りつぶしてログのみ
      }
    }

    // ── fukuX 同時投稿は postMyDiary の中で済ませた（第981便）──
    if (res.xFailed) console.error('crosspost to x_posts failed');

    setDiaryPosting(false);
    setDiaryImage(null);
    setDiaryTitle('');
    setDiaryBody('');
    setCrosspostX(true); // 毎回デフォルトONに戻す（外すのは都度オプトアウト）
    setCrosspostXNoReplies(false); // リプライ禁止チェックも都度OFFへ
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
    const up = await uploadDiaryImage(therapistId, file); // 本人フォルダ固定（サーバーが決める）
    setEditUploading(false); e.target.value = '';
    if (!up.ok) { showToast(up.error); return; }
    setEditImage(up.url);
  };

  const handleSave = async (id: string) => {
    setSavingId(id);
    let res: Awaited<ReturnType<typeof updateMyDiary>>;
    try {
      res = await updateMyDiary(id, { title: editTitle, content: editBody, image: editImage });
    } catch {
      setSavingId(null);
      showToast('通信できませんでした。電波のよい場所で、もう一度押してください。');
      return;
    }
    setSavingId(null);
    if (!res.ok) { showToast(res.error); return; }
    cancelEdit();
    revalidateSalon(salonId, { top: false });
    showToast('日記を更新しました');
    loadPosts();
  };

  const handleDelete = async (post: CastDiaryPost) => {
    // ★★★ 取り込んだ日記は、消したら次の反映でも戻ってこない（§369）
    const site = importedOf[post.id];
    const okToDelete = site
      ? window.confirm(importedDiaryDeleteConfirm(providerLabel(site)))
      : window.confirm('この投稿を削除しますか？\nこの操作は取り消せません。');
    if (!okToDelete) return;
    setDeletingId(post.id);

    // 先にDB削除
    // ★ 第981便: 日記と画像の削除はサーバーで（画像の削除に失敗しても、日記の削除は成立）
    let res: Awaited<ReturnType<typeof deleteMyDiary>>;
    try {
      res = await deleteMyDiary(post.id, post.images);
    } catch {
      setDeletingId(null);
      showToast('通信できませんでした。電波のよい場所で、もう一度押してください。');
      return;
    }
    if (!res.ok) {
      setDeletingId(null);
      showToast(res.error);
      return;
    }

    setDeletingId(null);
    revalidateSalon(salonId, { top: false });
    showToast('投稿を削除しました');
    loadPosts();
  };

  const btnClass =
    'px-4 py-2 rounded-xl border border-pink-300 text-pink-600 text-sm font-bold hover:bg-pink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

  return (
    <div className="space-y-5">
      {/* ── 投稿フォーム ──
          ★ 第492便（カッキーさん）: アコーディオン（<details>）。★ 見出しを押すと開閉。既定は閉じる */}
      <details className="group bg-white/85 backdrop-blur-sm rounded-3xl border border-pink-100 shadow-sm overflow-hidden">
        <summary className="flex items-center gap-2 cursor-pointer list-none px-5 py-4 [&::-webkit-details-marker]:hidden">
          <CastCardTitle icon="camera">写メ日記を投稿（{therapistName}）</CastCardTitle>
          <span className="ml-auto"><svg className="w-4 h-4 text-pink-400 transition-transform duration-200 group-open:rotate-180 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg></span>
        </summary>
        <div className="px-5 pb-5 space-y-3">

        {/* 画像（1枚） */}
        <div>
          <label className="text-[11px] font-bold text-slate-500 block mb-1">画像（1枚）</label>
          <p className="text-[10px] text-slate-400 mb-1.5">推奨：800×450px（横長）／ JPEG・PNG・WebP・20MB以下</p>
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
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
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
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200 resize-none"
            placeholder="本文を入力"
            value={diaryBody}
            onChange={(e) => setDiaryBody(e.target.value)}
          />
        </div>

        {/* fukuX 同時投稿（連携 approved セラピストのみ表示・デフォルトOFF）。
            ON のときだけ「リプライできないようにする」を出す（OFFに戻したら隠れた true が残らないようリセット）。 */}
        {xProfileId && (
          <div className="space-y-2 pt-0.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={crosspostX}
                onChange={(e) => {
                  const on = e.target.checked;
                  setCrosspostX(on);
                  if (!on) setCrosspostXNoReplies(false); // fukuX OFF でリプライ禁止もリセット
                }}
                className="w-4 h-4 rounded border-slate-300 text-pink-500 focus:ring-pink-200"
              />
              <span className="text-[12px] font-bold text-slate-600">
                fukuX にも投稿する
              </span>
            </label>

            {crosspostX && (
              <label className="flex items-center gap-2 cursor-pointer select-none pl-6">
                <input
                  type="checkbox"
                  checked={crosspostXNoReplies}
                  onChange={(e) => setCrosspostXNoReplies(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-pink-500 focus:ring-pink-200"
                />
                <span className="text-[12px] font-bold text-slate-600">
                  リプライできないようにする
                </span>
              </label>
            )}
          </div>
        )}

        <div>
          <button
            type="button"
            onClick={handleDiaryPost}
            disabled={diaryPosting || diaryUploading}
            className="w-full py-2.5 rounded-xl text-white font-bold text-sm shadow-sm disabled:opacity-50"
            style={{ background: 'linear-gradient(to right, #ec4899, #f97316)' }}
          >
            {diaryPosting ? '投稿中...' : '投稿する'}
          </button>
        </div>
        </div>
      </details>

      {/* ── 投稿済み日記一覧（自分の分のみ）。★ 第492便: アコーディオン（既定は閉じる） ── */}
      <details className="group bg-white/85 backdrop-blur-sm rounded-3xl border border-pink-100 shadow-sm overflow-hidden">
        <summary className="flex items-center gap-2 cursor-pointer list-none px-5 py-4 [&::-webkit-details-marker]:hidden">
          <CastCardTitle icon="list">投稿済み日記（{total}件）</CastCardTitle>
          <span className="ml-auto"><svg className="w-4 h-4 text-pink-400 transition-transform duration-200 group-open:rotate-180 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg></span>
        </summary>
        <div className="px-5 pb-5">

        <div className="space-y-3">
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
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
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
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200 resize-none"
                      placeholder="本文を入力"
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                    />

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold hover:border-pink-300 hover:text-pink-500 transition-colors"
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSave(post.id)}
                        disabled={savingId === post.id || editUploading}
                        className="flex-1 py-2.5 rounded-xl text-white font-bold text-xs shadow-sm disabled:opacity-50"
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
                      {/* ★ 取り込んだ日記の印（第98便）。★ 自分で書いたものと区別できるように */}
                      {importedOf[post.id] && (
                        <span className="inline-block mb-0.5 px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-bold">
                          {importedDiaryLabel(providerLabel(importedOf[post.id]))}
                        </span>
                      )}
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
      </details>

      {/* ── トースト ── */}
      {toast && (
        <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
