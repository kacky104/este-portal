'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { getLinkedXProfileForSalon } from '@/app/lib/xLink';
import { revalidateJobsForOwner } from '@/app/actions/jobs';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';

// mypage「求人」タブの新着情報（work_news）管理カード。本体お知らせ（announcements）管理を
// フクエスワーク向けに忠実移植したもの。書き込みはブラウザSupabaseクライアント直（RLSで自店のみ許可）。
// 一覧（自店の work_news・非公開含む・published_at desc）／新規投稿（title必須・content・画像1枚）／
// 編集／削除／公開切替。新規投稿時のみ fukuX へ同時投稿（編集保存では発火しない＝重複ポスト防止）。
//
// announcements との差分：
//  - 配色をフクエスワークのグリーン系（#10B981→#84CC16）に統一。
//  - 画像差し替えを「新upload→DB更新→成功時のみ旧削除」の安全順序にし、remove() の戻り値を検査して
//    console.error する（85ef00e の featured managers パターンを踏襲。旧お知らせは孤児放置だった）。
//  - 再投稿機能は本タスクでは実装しない（初版はシンプルに新規時のみ）。

const BUCKET = 'work-news-images';
const X_BODY_MAX = 500;

type WorkNews = {
  id: string;
  title: string;
  content: string | null;
  is_published: boolean;
  published_at: string;
  image_url: string | null;
};

type NewForm = { title: string; content: string; is_published: boolean; image_url: string | null };
type EditForm = { title: string; content: string; is_published: boolean; image_url: string | null };

function validateImageFile(file: File): string | null {
  if (file.size > 5 * 1024 * 1024) return '5MB以下の画像を選択してください';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'JPEG・PNG・WebPのみ対応しています';
  return null;
}

// work-news-images の public URL からストレージパス（{salon_id}/{ts}.{ext}）を取り出す。該当しなければ null。
function storagePathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}

function formatPublishedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export function JobNewsManager({ salonId }: { salonId: number }) {
  const supabase = createClient();

  const [items, setItems] = useState<WorkNews[]>([]);
  const [forms, setForms] = useState<Record<string, EditForm>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // fukuX 同時投稿用：オーナーの連携fukuX店舗プロフィール（kind='shop'・approved）。未連携は null。
  const [xShopProfileId, setXShopProfileId] = useState<string | null>(null);

  const [newForm, setNewForm] = useState<NewForm>({ title: '', content: '', is_published: true, image_url: null });
  const [newCrosspostX, setNewCrosspostX] = useState(false);
  const [newCrosspostNoReplies, setNewCrosspostNoReplies] = useState(false);

  const [adding, setAdding] = useState(false);
  const [uploadingNew, setUploadingNew] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingEditId, setUploadingEditId] = useState<string | null>(null);

  const rebuildForms = (list: WorkNews[]) => {
    const map: Record<string, EditForm> = {};
    list.forEach((n) => {
      map[n.id] = { title: n.title, content: n.content ?? '', is_published: n.is_published, image_url: n.image_url };
    });
    setForms(map);
  };

  const fetchList = useCallback(async () => {
    const { data, error } = await supabase
      .from('work_news')
      .select('id, title, content, is_published, published_at, image_url')
      .eq('salon_id', salonId)
      .order('published_at', { ascending: false });
    if (error) {
      setMsg({ kind: 'err', text: `新着情報の取得に失敗しました：${error.message}` });
      setItems([]);
      return;
    }
    const list = (data ?? []) as WorkNews[];
    setItems(list);
    rebuildForms(list);
  }, [supabase, salonId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      await fetchList();
      // 連携fukuX店舗プロフィールを解決（best-effort・未連携/失敗は null＝チェック無効表示）。
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        try {
          const p = await getLinkedXProfileForSalon(user.id);
          if (alive) setXShopProfileId(p?.profileId ?? null);
        } catch {
          if (alive) setXShopProfileId(null);
        }
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [fetchList, supabase]);

  // 新着情報→fukuX 同時投稿（best-effort）。お知らせ版 maybeCrosspostAnnouncementToX と同一枠組み。
  // 戻り値: 投稿しなかった（OFF/未連携/中身空）or 成功 → true、送信を試みて失敗 → false。
  const maybeCrosspostWorkNewsToX = async (
    enabled: boolean,
    noReplies: boolean,
    title: string,
    content: string | null,
    imageUrl: string | null,
  ): Promise<boolean> => {
    if (!enabled || !xShopProfileId) return true; // 同時投稿しない＝成功扱い
    const titlePart = (title ?? '').trim();
    const contentPart = (content ?? '').trim();
    // body = タイトル + 空行 + 本文（片方のみ・両方空も許容）。お知らせ／日記側と同一ルール。
    const body = titlePart && contentPart ? `${titlePart}\n\n${contentPart}` : (titlePart || contentPart);
    const xImages = imageUrl ? [imageUrl] : [];
    if (body.length === 0 && xImages.length === 0) return true; // 投稿する中身が無い
    // fukuX本文上限(500字)：501字以上で先頭497字＋「…」=計498字にクランプ（お知らせ経路と同一）。
    const clampedBody = body.length > X_BODY_MAX ? `${body.slice(0, X_BODY_MAX - 3)}…` : body;
    // 同じ認証クライアントで insert＝x_posts の INSERT ポリシー(author_profile_id = x_my_profile_id())を正規通過。
    const { error: xErr } = await supabase.from('x_posts').insert({
      author_profile_id: xShopProfileId,
      body: clampedBody || null,
      images: xImages,
      replies_disabled: noReplies,
    });
    if (xErr) {
      console.error('crosspost work_news to x_posts failed:', xErr);
      return false;
    }
    return true;
  };

  // 新規追加（published_at は DB の default now()）。新規投稿時のみ fukuX 同時投稿。
  const handleAdd = async () => {
    if (!newForm.title.trim()) { setMsg({ kind: 'err', text: 'タイトルは必須です' }); return; }
    setAdding(true);
    setMsg(null);
    const title = newForm.title.trim();
    const content = newForm.content.trim() || null;
    const imageUrl = newForm.image_url || null;
    const { error } = await supabase.from('work_news').insert({
      salon_id: salonId,
      title,
      content,
      is_published: newForm.is_published,
      image_url: imageUrl,
    });
    if (error) {
      setAdding(false);
      setMsg({
        kind: 'err',
        text: error.code === '42501'
          ? 'RLSにより追加が拒否されました。work_news のオーナー用INSERTポリシーを確認してください。'
          : `追加に失敗しました: ${error.message}`,
      });
      return;
    }
    await fetchList();
    // 追加成功後のみ fukuX 同時投稿（失敗しても本体は成功のまま）。
    const xOk = await maybeCrosspostWorkNewsToX(newCrosspostX, newCrosspostNoReplies, title, content, imageUrl);
    setNewForm({ title: '', content: '', is_published: true, image_url: null });
    setNewCrosspostX(false);
    setNewCrosspostNoReplies(false);
    setAdding(false);
    await revalidateJobsForOwner(salonId);
    setMsg({ kind: 'ok', text: xOk ? '新着情報を追加しました' : '新着情報を追加しました（fukuX投稿は失敗しました）' });
  };

  // 編集保存（fukuX へは投稿しない＝重複ポスト防止）。画像差し替え時は DB更新成功後に旧画像を削除。
  const handleSave = async (id: string) => {
    const form = forms[id];
    if (!form) return;
    if (!form.title.trim()) { setMsg({ kind: 'err', text: 'タイトルは必須です' }); return; }
    setSavingId(id);
    setMsg(null);
    const title = form.title.trim();
    const content = form.content.trim() || null;
    const is_published = form.is_published;
    const newImageUrl = form.image_url ?? null;
    // 差し替え／削除判定用に、保存前の永続化済み画像URLを控える。
    const oldImageUrl = items.find((n) => n.id === id)?.image_url ?? null;

    const { error } = await supabase.from('work_news')
      .update({ title, content, is_published, image_url: newImageUrl })
      .eq('id', id);
    if (error) { setSavingId(null); setMsg({ kind: 'err', text: `保存に失敗しました: ${error.message}` }); return; }

    // DB更新が成功してから旧ファイルを削除（失敗時に画像を失わない順序）。remove() の戻り値を検査。
    if (oldImageUrl && oldImageUrl !== newImageUrl) {
      const oldPath = storagePathFromUrl(oldImageUrl);
      if (oldPath) {
        const { error: removeError } = await supabase.storage.from(BUCKET).remove([oldPath]);
        if (removeError) console.error('[WorkNews] 旧画像の削除に失敗:', oldPath, removeError);
      }
    }

    setItems((prev) => prev.map((n) => n.id === id ? { ...n, title, content, is_published, image_url: newImageUrl } : n));
    setSavingId(null);
    await revalidateJobsForOwner(salonId);
    setMsg({ kind: 'ok', text: '新着情報を保存しました' });
  };

  // 公開/非公開のワンタップ切替（即時保存）。
  const handleTogglePublish = async (id: string) => {
    const target = items.find((n) => n.id === id);
    if (!target) return;
    const next = !target.is_published;
    const { error } = await supabase.from('work_news').update({ is_published: next }).eq('id', id);
    if (error) { setMsg({ kind: 'err', text: `変更に失敗しました: ${error.message}` }); return; }
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, is_published: next } : n));
    setForms((prev) => ({ ...prev, [id]: { ...prev[id], is_published: next } }));
    await revalidateJobsForOwner(salonId);
    setMsg({ kind: 'ok', text: next ? '公開にしました' : '非公開にしました' });
  };

  // 削除（確認あり）。行削除成功後に添付画像も削除（remove() 戻り値検査）。
  const handleDelete = async (id: string) => {
    if (!window.confirm('この新着情報を削除しますか？\nこの操作は取り消せません。')) return;
    setDeletingId(id);
    setMsg(null);
    const target = items.find((n) => n.id === id);
    const { data: deleted, error } = await supabase.from('work_news').delete().eq('id', id).select('id');
    setDeletingId(null);
    if (error) { setMsg({ kind: 'err', text: `削除に失敗しました: ${error.message}` }); return; }
    if (!deleted || deleted.length === 0) {
      setMsg({ kind: 'err', text: '削除できませんでした（権限エラーの可能性があります）' });
      return;
    }
    // 行削除に成功したら添付画像も掃除（失敗しても行削除は成立しているのでログのみ）。
    const oldPath = storagePathFromUrl(target?.image_url ?? null);
    if (oldPath) {
      const { error: removeError } = await supabase.storage.from(BUCKET).remove([oldPath]);
      if (removeError) console.error('[WorkNews] 削除に伴う画像の削除に失敗:', oldPath, removeError);
    }
    setItems((prev) => prev.filter((n) => n.id !== id));
    setForms((prev) => { const n = { ...prev }; delete n[id]; return n; });
    await revalidateJobsForOwner(salonId);
    setMsg({ kind: 'ok', text: '新着情報を削除しました' });
  };

  // 新規フォームの画像アップロード。再アップロード時は直前の未保存画像（孤児）を成功後に掃除。
  const handleNewImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { setMsg({ kind: 'err', text: err }); e.target.value = ''; return; }
    setUploadingNew(true);
    const prevUrl = newForm.image_url;
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${salonId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: STORAGE_CACHE_CONTROL });
    if (error) {
      setMsg({ kind: 'err', text: `アップロードに失敗しました: ${error.message}` });
      setUploadingNew(false); e.target.value = ''; return;
    }
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    setNewForm((p) => ({ ...p, image_url: publicUrl }));
    // 新画像アップロード成功後に、直前の未保存アップロード（あれば孤児）を掃除。
    const prevPath = storagePathFromUrl(prevUrl);
    if (prevPath) {
      const { error: removeError } = await supabase.storage.from(BUCKET).remove([prevPath]);
      if (removeError) console.error('[WorkNews] 未保存画像の掃除に失敗:', prevPath, removeError);
    }
    setUploadingNew(false); e.target.value = '';
  };

  // 編集フォームの画像アップロード（保存で image_url が確定・旧画像削除は handleSave で実施）。
  const handleEditImageUpload = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { setMsg({ kind: 'err', text: err }); e.target.value = ''; return; }
    setUploadingEditId(id);
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${salonId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: STORAGE_CACHE_CONTROL });
    if (error) {
      setMsg({ kind: 'err', text: `アップロードに失敗しました: ${error.message}` });
      setUploadingEditId(null); e.target.value = ''; return;
    }
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    setForms((prev) => ({ ...prev, [id]: { ...prev[id], image_url: publicUrl } }));
    setUploadingEditId(null); e.target.value = '';
  };

  // fukuX 同時投稿チェックの共通UI（renderCrosspostChecks 移植・グリーン配色）。
  const renderCrosspostChecks = (
    enabled: boolean,
    setEnabled: (v: boolean) => void,
    noReplies: boolean,
    setNoReplies: (v: boolean) => void,
  ) => (
    <div className="space-y-2 pt-0.5">
      <label className={`flex items-center gap-2 select-none ${xShopProfileId ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>
        <input
          type="checkbox"
          disabled={!xShopProfileId}
          checked={enabled}
          onChange={(e) => { const on = e.target.checked; setEnabled(on); if (!on) setNoReplies(false); }}
          className="w-4 h-4 accent-emerald-500 flex-shrink-0"
        />
        <span className="text-xs font-bold text-slate-600">fukuX にも投稿する</span>
      </label>
      {!xShopProfileId && (
        <p className="text-[10px] text-slate-400 pl-6">fukuX店舗アカウントと連携すると同時投稿できます</p>
      )}
      {xShopProfileId && enabled && (
        <label className="flex items-center gap-2 cursor-pointer select-none pl-6">
          <input
            type="checkbox"
            checked={noReplies}
            onChange={(e) => setNoReplies(e.target.checked)}
            className="w-4 h-4 accent-emerald-500 flex-shrink-0"
          />
          <span className="text-xs font-bold text-slate-600">リプライできないようにする</span>
        </label>
      )}
    </div>
  );

  const inputClass = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-emerald-200';
  const textareaClass = `${inputClass} resize-none`;
  const labelClass = 'text-[11px] font-bold text-slate-400 block mb-1';
  const saveBtn = 'px-5 py-2 rounded-xl text-white font-bold text-xs shadow-sm disabled:opacity-50 hover:opacity-90 transition-opacity';
  const saveBtnStyle = { background: 'linear-gradient(95deg,#10B981,#84CC16)' } as const;

  const imageBox = (url: string | null, onClear: () => void, uploading: boolean, onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void) => (
    url ? (
      <div className="relative w-32 h-32 rounded-xl overflow-hidden border border-emerald-100 bg-slate-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="新着情報画像" className="w-full h-full object-cover" />
        <button
          type="button"
          onClick={onClear}
          aria-label="削除"
          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/55 text-white text-xs flex items-center justify-center hover:bg-black/75"
        >
          ×
        </button>
      </div>
    ) : (
      <label className="flex flex-col items-center justify-center w-32 h-32 rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 text-emerald-500 cursor-pointer hover:bg-emerald-50 transition-colors">
        {uploading ? (
          <span className="text-[10px] font-bold">アップ中...</span>
        ) : (
          <>
            <span className="text-2xl leading-none">＋</span>
            <span className="text-[10px] font-bold mt-0.5">画像を追加</span>
          </>
        )}
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onUpload} disabled={uploading} className="hidden" />
      </label>
    )
  );

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
        <h2 className="text-sm font-black text-slate-700">新着情報（フクエスワーク）</h2>
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        求人の新着情報を投稿できます（一覧は新しい順・非公開分も表示）。
      </p>

      {msg && (
        <p className={`text-xs rounded-xl px-3 py-2 border ${
          msg.kind === 'ok' ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-rose-600 bg-rose-50 border-rose-100'
        }`}>
          {msg.text}
        </p>
      )}

      {/* 新規追加フォーム */}
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-4 space-y-3">
        <h3 className="text-xs font-black" style={{ color: '#059669' }}>新着情報を新規追加</h3>
        <div>
          <label className={labelClass}>タイトル <span className="text-rose-400">*</span></label>
          <input
            className={inputClass}
            placeholder="例: 体験入店キャンペーン実施中"
            value={newForm.title}
            onChange={(e) => setNewForm((p) => ({ ...p, title: e.target.value }))}
          />
        </div>
        <div>
          <label className={labelClass}>本文（任意）</label>
          <textarea
            rows={5}
            className={textareaClass}
            placeholder="新着情報の本文を入力してください。"
            value={newForm.content}
            onChange={(e) => setNewForm((p) => ({ ...p, content: e.target.value }))}
          />
        </div>
        <div>
          <label className={labelClass}>画像（任意・1枚）</label>
          <p className="text-[10px] text-slate-400 mb-1.5">推奨：800×450px（横長）／ JPEG・PNG・WebP・5MB以下</p>
          {imageBox(
            newForm.image_url,
            () => setNewForm((p) => ({ ...p, image_url: null })),
            uploadingNew,
            handleNewImageUpload,
          )}
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-4 h-4 accent-emerald-500 flex-shrink-0"
            checked={newForm.is_published}
            onChange={(e) => setNewForm((p) => ({ ...p, is_published: e.target.checked }))}
          />
          <span className="text-xs font-bold text-slate-600">公開する（オフにすると非公開で保存）</span>
        </label>
        {/* fukuX 同時投稿（新規投稿時のみ有効。編集保存では出さない＝重複ポスト防止）。 */}
        {renderCrosspostChecks(newCrosspostX, setNewCrosspostX, newCrosspostNoReplies, setNewCrosspostNoReplies)}
        <div className="flex justify-end">
          <button className={saveBtn} style={saveBtnStyle} onClick={handleAdd} disabled={adding || !newForm.title.trim()}>
            {adding ? '追加中...' : '＋ 新着情報を追加'}
          </button>
        </div>
      </div>

      {/* 一覧（公開・非公開含む・published_at の新しい順） */}
      {loading ? (
        <p className="text-xs text-slate-400">読み込み中です…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
          <p className="text-xs text-slate-400">登録されている新着情報がありません</p>
        </div>
      ) : (
        items.map((n) => {
          const form = forms[n.id] ?? { title: '', content: '', is_published: true, image_url: null };
          return (
            <div key={n.id} className="rounded-2xl border border-emerald-100 shadow-sm p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${
                    n.is_published ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {n.is_published ? '公開中' : '非公開'}
                  </span>
                  <span className="text-[10px] text-slate-400 truncate">{formatPublishedAt(n.published_at)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => handleTogglePublish(n.id)}
                    className="px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors"
                    style={{ borderColor: '#6EE7B7', color: '#059669' }}
                  >
                    {n.is_published ? '非公開にする' : '公開にする'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(n.id)}
                    disabled={deletingId === n.id}
                    className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-500 text-xs font-bold bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50"
                  >
                    {deletingId === n.id ? '削除中...' : '削除'}
                  </button>
                </div>
              </div>

              <div>
                <label className={labelClass}>タイトル <span className="text-rose-400">*</span></label>
                <input
                  className={inputClass}
                  value={form.title}
                  onChange={(e) => setForms((prev) => ({ ...prev, [n.id]: { ...prev[n.id], title: e.target.value } }))}
                />
              </div>
              <div>
                <label className={labelClass}>本文（任意）</label>
                <textarea
                  rows={5}
                  className={textareaClass}
                  value={form.content}
                  onChange={(e) => setForms((prev) => ({ ...prev, [n.id]: { ...prev[n.id], content: e.target.value } }))}
                />
              </div>
              <div>
                <label className={labelClass}>画像（任意・1枚）</label>
                <p className="text-[10px] text-slate-400 mb-1.5">推奨：800×450px（横長）／ JPEG・PNG・WebP・5MB以下</p>
                {imageBox(
                  form.image_url,
                  () => setForms((prev) => ({ ...prev, [n.id]: { ...prev[n.id], image_url: null } })),
                  uploadingEditId === n.id,
                  (e) => handleEditImageUpload(n.id, e),
                )}
                <p className="text-[10px] text-slate-400 mt-1">※ 画像の差し替え・削除は「保存」で確定します。</p>
              </div>
              <div className="flex justify-end">
                <button className={saveBtn} style={saveBtnStyle} onClick={() => handleSave(n.id)} disabled={savingId === n.id}>
                  {savingId === n.id ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
