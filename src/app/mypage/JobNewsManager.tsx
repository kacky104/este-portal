'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { getLinkedXProfileForSalon } from '@/app/lib/xLink';
import { revalidateJobsForOwner, enforceWorkNewsLimit, repostMyWorkNews } from '@/app/actions/jobs';
import { WORK_NEWS_MAX } from '@/app/lib/jobs';
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
//  - 再投稿は第289便で実装（サーバー側 repostMyWorkNews 経由。★ 手動の記録 last_manual_at が要るため）。

const BUCKET = 'work-news-images';
const X_BODY_MAX = 500;

type WorkNews = {
  id: string;
  title: string;
  content: string | null;
  is_published: boolean;
  published_at: string;
  image_url: string | null;
  // ★ 「自動で回す」の印（第274便・2026-09-11）。★ 既定 false＝黙って回さない。
  auto_rotate: boolean;
};

type NewForm = { title: string; content: string; is_published: boolean; image_url: string | null };
type EditForm = { title: string; content: string; is_published: boolean; image_url: string | null; auto_rotate: boolean };

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
  const [newCrosspostX, setNewCrosspostX] = useState(true); // fukuX同時投稿デフォルトON（外すのは都度）
  const [newCrosspostNoReplies, setNewCrosspostNoReplies] = useState(false);
  // ★ 新規追加の枠を開いているか（第287便・2026-09-12）。★ 既定は閉じる。
  //   ★ 閉じている間も newForm はここに残るので、開き直せば書きかけがそのまま出る。
  const [newOpen, setNewOpen] = useState(false);

  const [adding, setAdding] = useState(false);
  const [uploadingNew, setUploadingNew] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadingEditId, setUploadingEditId] = useState<string | null>(null);
  // ★ その場で効く操作の最中（第289便）。★ 自動投稿・公開切替＝togglingId／再投稿＝repostingId。
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [repostingId, setRepostingId] = useState<string | null>(null);

  // アコーディオン：展開中の1件のみ（null=全て折りたたみ）。初期表示は最新10件、11件以上は「もっと見る」で全件。
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const INITIAL_VISIBLE = 10;

  // 編集フォームが保存済みの値から変化しているか（未保存の変更の有無）。
  const isDirty = (id: string): boolean => {
    const f = forms[id];
    const it = items.find((n) => n.id === id);
    if (!f || !it) return false;
    return (
      f.title !== it.title ||
      f.content !== (it.content ?? '') ||
      f.is_published !== it.is_published ||
      f.auto_rotate !== it.auto_rotate ||
      f.image_url !== it.image_url
    );
  };

  // 編集フォームを保存済みの値へ戻す（変更破棄）。
  const resetForm = (id: string) => {
    const it = items.find((n) => n.id === id);
    if (!it) return;
    setForms((prev) => ({
      ...prev,
      [id]: { title: it.title, content: it.content ?? '', is_published: it.is_published, image_url: it.image_url, auto_rotate: it.auto_rotate },
    }));
  };

  // 「編集」トグル。同一行なら閉じる。別行を開くとき、展開中の行に未保存変更があれば confirm で警告し、
  // 破棄OKなら前の行のフォームを保存済み値へ戻してから切り替える（同時展開は常に1件）。
  const handleEditToggle = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    if (expandedId !== null && isDirty(expandedId)) {
      if (!window.confirm('編集中の内容が保存されていません。破棄して別の項目を編集しますか？')) return;
      resetForm(expandedId);
    }
    setExpandedId(id);
  };

  const rebuildForms = (list: WorkNews[]) => {
    const map: Record<string, EditForm> = {};
    list.forEach((n) => {
      map[n.id] = { title: n.title, content: n.content ?? '', is_published: n.is_published, image_url: n.image_url, auto_rotate: n.auto_rotate };
    });
    setForms(map);
  };

  const fetchList = useCallback(async () => {
    const { data, error } = await supabase
      .from('work_news')
      .select('id, title, content, is_published, published_at, image_url, auto_rotate')
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
    // 追加成功後のみ fukuX 同時投稿（失敗しても本体は成功のまま）。
    const xOk = await maybeCrosspostWorkNewsToX(newCrosspostX, newCrosspostNoReplies, title, content, imageUrl);
    // ローリング上限（案A・サーバーアクション）：投稿成功後に20件超過分を古い順で自動削除（画像も掃除）。
    // best-effort（失敗しても投稿自体は成立）。成否に関わらず最新状態を再取得して一覧へ反映する。
    let pruned = 0;
    try {
      const res = await enforceWorkNewsLimit(salonId);
      if (res.ok) pruned = res.deleted;
      else console.error('[WorkNews] ローリング削除に失敗:', res.error);
    } catch (e) {
      console.error('[WorkNews] ローリング削除で例外:', e);
    }
    await fetchList();
    setNewForm({ title: '', content: '', is_published: true, image_url: null });
    setNewCrosspostX(true); // 投稿後もデフォルトONへ戻す
    setNewCrosspostNoReplies(false);
    // ★ 追加できたときだけ畳む（第287便）。★ 空のフォームを開いたままにしない＝下の一覧が見える。
    //   ★ 途中で抜けた経路（失敗）はここまで来ないので、開いたまま残る。
    setNewOpen(false);
    setAdding(false);
    await revalidateJobsForOwner();
    const base = xOk ? '新着情報を追加しました' : '新着情報を追加しました（fukuX投稿は失敗しました）';
    setMsg({ kind: 'ok', text: pruned > 0 ? `${base}（古い${pruned}件を自動削除）` : base });
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
    const auto_rotate = form.auto_rotate;
    const newImageUrl = form.image_url ?? null;
    // 差し替え／削除判定用に、保存前の永続化済み画像URLを控える。
    const oldImageUrl = items.find((n) => n.id === id)?.image_url ?? null;

    const { error } = await supabase.from('work_news')
      .update({ title, content, is_published, auto_rotate, image_url: newImageUrl })
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

    setItems((prev) => prev.map((n) => n.id === id ? { ...n, title, content, is_published, auto_rotate, image_url: newImageUrl } : n));
    setSavingId(null);
    setExpandedId(null); // 保存完了でコンパクト表示へ戻す
    await revalidateJobsForOwner();
    setMsg({ kind: 'ok', text: '新着情報を保存しました' });
  };

  // ── 行の上に並ぶ3つの操作（第289便・2026-09-12・カッキーさんの指示）──────────────
  //   ★★ フクエス側のお知らせと同じ形にそろえた（自動投稿／公開・非公開／再投稿）。
  //   ★ どれも【その場で効く】。★ 「保存」を押さないと効かないのは、下のタイトル・本文・画像だけ。

  // 自動投稿の印を、その場で入り切りする。★ 保存を経由しない（押した＝そうなる）。
  const handleToggleAutoRotate = async (id: string) => {
    const target = items.find((n) => n.id === id);
    if (!target) return;
    const next = !target.auto_rotate;
    setTogglingId(id);
    setMsg(null);
    const { error } = await supabase.from('work_news').update({ auto_rotate: next }).eq('id', id);
    setTogglingId(null);
    if (error) { setMsg({ kind: 'err', text: `変更に失敗しました: ${error.message}` }); return; }
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, auto_rotate: next } : n));
    // ★ 開いているフォームの控えも合わせる（保存で古い値に戻さないため）。
    setForms((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], auto_rotate: next } } : prev));
    setMsg({ kind: 'ok', text: next ? '自動投稿にしました' : '自動投稿をやめました' });
  };

  // 公開・非公開を、その場で切り替える。
  const handleTogglePublish = async (id: string) => {
    const target = items.find((n) => n.id === id);
    if (!target) return;
    const next = !target.is_published;
    setTogglingId(id);
    setMsg(null);
    const { error } = await supabase.from('work_news').update({ is_published: next }).eq('id', id);
    setTogglingId(null);
    if (error) { setMsg({ kind: 'err', text: `変更に失敗しました: ${error.message}` }); return; }
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, is_published: next } : n));
    setForms((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], is_published: next } } : prev));
    await revalidateJobsForOwner();
    setMsg({ kind: 'ok', text: next ? '公開にしました' : '非公開にしました' });
  };

  // 再投稿（確認あり）。★ 投稿日時を今にして、求人ページの新着で先頭へ出す。
  //   ★★ サーバー側の口を通す（repostMyWorkNews）。★ 画面から published_at を直に書かない。
  //     理由は「手で出した日」の記録（last_manual_at）が要るため——その表は画面からは書けない。
  const handleRepost = async (id: string) => {
    if (!window.confirm(
      'この新着情報を再投稿しますか？\n投稿日時が現在時刻に更新され、求人ページの新着で先頭に出ます。\n（元の投稿日時は失われます）'
    )) return;
    setRepostingId(id);
    setMsg(null);
    const res = await repostMyWorkNews({ salonId, id });
    setRepostingId(null);
    if (!res.ok) { setMsg({ kind: 'err', text: `再投稿に失敗しました: ${res.error}` }); return; }
    setItems((prev) => prev
      .map((n) => n.id === id ? { ...n, published_at: res.publishedAt } : n)
      .sort((x, y) => new Date(y.published_at).getTime() - new Date(x.published_at).getTime()));
    await revalidateJobsForOwner();
    setMsg({ kind: 'ok', text: '再投稿しました' });
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
    if (expandedId === id) setExpandedId(null);
    await revalidateJobsForOwner();
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
          checked={!!xShopProfileId && enabled}
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

  const inputClass = 'w-full px-3 py-2 rounded-none border border-slate-200 text-sm bg-slate-50/50 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-200';
  const textareaClass = `${inputClass} resize-none`;
  const labelClass = 'text-[11px] font-bold text-slate-400 block mb-1';
  const saveBtn = 'px-5 py-2 rounded-none text-white font-bold text-xs shadow-sm disabled:opacity-50 hover:opacity-90 transition-opacity';
  const saveBtnStyle = { background: 'linear-gradient(95deg,#10B981,#84CC16)' } as const;

  const imageBox = (url: string | null, onClear: () => void, uploading: boolean, onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void) => (
    url ? (
      <div className="relative w-32 h-32 rounded-none overflow-hidden border border-emerald-100 bg-slate-50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="新着情報画像" className="w-full h-full object-cover" />
        <button
          type="button"
          onClick={onClear}
          aria-label="削除"
          className="absolute top-1 right-1 w-6 h-6 rounded-none bg-black/55 text-white text-xs flex items-center justify-center hover:bg-black/75"
        >
          ×
        </button>
      </div>
    ) : (
      <label className="flex flex-col items-center justify-center w-32 h-32 rounded-none border-2 border-dashed border-emerald-200 bg-emerald-50/40 text-emerald-500 cursor-pointer hover:bg-emerald-50 transition-colors">
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
    // ★★ 2枚のカードに分ける（第286便・2026-09-12・カッキーさんの指示）。
    //   ★ 上＝これから書く場所／下＝書いたものを直す場所。★ 用事が違うので枠も分ける。
    //   ★ 結果の知らせ（msg）は2枚の【外の上】に置く。★ 追加も保存も削除もここに出るため、
    //     どちらかの中に入れると、片方の操作のときに画面の外で鳴ることになる。
    <div className="space-y-4">
      {msg && (
        <p className={`text-xs rounded-none px-3 py-2 border ${
          msg.kind === 'ok' ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-rose-600 bg-rose-50 border-rose-100'
        }`}>
          {msg.text}
        </p>
      )}

      {/* ───────── ブロック1：新しく書く（折りたたみ・第287便） ───────── */}
      {/* ★★ 既定は【閉じている】。★ 開けるまで場所を取らない＝下の一覧がすぐ見える。
          ★ 閉じても入力は消えない（newForm は親の状態のまま・描画をやめるだけ）。
          ★ 追加に成功したときだけ自動で閉じる（handleAdd の出口）。★ 失敗時は開いたまま——
            書いたものを見せたまま直させる。 */}
      <div className="bg-white rounded-none border border-slate-100 shadow-sm">
        <button
          type="button"
          onClick={() => setNewOpen((v) => !v)}
          aria-expanded={newOpen}
          className="w-full flex items-center gap-2 p-5 text-left hover:bg-slate-50/60 transition-colors"
        >
          <span className="w-1 h-5 rounded-none flex-shrink-0" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
          <h2 className="text-sm font-black text-slate-700">新着情報を新規追加</h2>
          <span className="ml-auto px-3 py-1.5 rounded-none border text-xs font-bold flex-shrink-0" style={{ borderColor: '#6EE7B7', color: '#059669' }}>
            {newOpen ? '閉じる' : '＋ 新しく書く'}
          </span>
        </button>
        {newOpen && (
        <div className="px-5 pb-5 pt-4 space-y-4 border-t border-slate-100">
        {/* ★ 上限の注意書きは【説明文の位置】に置く（第287便・2026-09-12・カッキーさんの指示）。
            ★ 黄色い枠はやめて、ただの小さい字にした。★ 件数は定数から出す。
            ★ 「求人ページに出るお知らせです」は撤去——見出しで分かるものを二度言わない。 */}
        <p className="text-[11px] text-slate-400 leading-relaxed">
          最新{WORK_NEWS_MAX}件まで保存。それ以降は古い順に自動削除。
        </p>
        {/* ★★ 周期の案内（rotationCycleMessage）はここから撤去（第287便・カッキーさんの指示）。
            ★ 「◯本付けると◯日に1回」は第274便で入れたが、書く場所に出す用事が無い。
            ★ 関数（src/lib/announceAuto.ts）はフクエス側のお知らせで使っているので残っている。 */}
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
          {/* ★ 見える高さを2倍に（第287便・2026-09-12・カッキーさんの指示）。★ 5行 → 10行。
              ★ 編集側（下の一覧の中）も同じ10行に揃えてある。 */}
          <textarea
            rows={10}
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
        )}
      </div>

      {/* ───────── ブロック2：書いたもの ─────────
          ★★ 1件＝1ブロックにする（第287便・2026-09-12・カッキーさんの指示）。
            ★ フクエス側のお知らせ（mypage?tab=news）と同じ形にそろえた。
            ★ 行ぜんぶがボタン＝押すと開く／右端の山形が向きを変える。
            ★★ 「編集」ボタンは無くした（行そのものが編集の入口）。★ 「削除」は開いた中の右上へ。
              ★ 閉じたまま押せる削除を無くす＝取り違えが起きない（第273便と同じ考え方）。
          ★★ 見出しは細いカード1枚で残す。★ フクエス側の「自動でお知らせを回す」と同じ位置づけ。 */}
      <div className="bg-white rounded-none border border-slate-100 shadow-sm p-5 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-1 h-5 rounded-none flex-shrink-0" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
          <h2 className="text-sm font-black text-slate-700">投稿した新着情報{items.length > 0 ? `（${items.length}件）` : ''}</h2>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          自動投稿は1日に1回。順番で投稿します。
        </p>
      </div>

      {loading ? (
        <div className="bg-white rounded-none border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-400">読み込み中です…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-none border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-400">登録されている新着情報がありません</p>
        </div>
      ) : (
        <>
            {(showAll ? items : items.slice(0, INITIAL_VISIBLE)).map((n) => {
              const form = forms[n.id] ?? { title: '', content: '', is_published: true, image_url: null, auto_rotate: false };
              const expanded = expandedId === n.id;
              return (
                <div key={n.id} className="bg-white rounded-none border border-emerald-100 shadow-sm overflow-hidden">
                  {/* 閉じているときのバー：公開バッジ ＋ 自動配信の印 ＋ タイトル ＋ 投稿日時 ＋ 山形 */}
                  <button
                    type="button"
                    onClick={() => handleEditToggle(n.id)}
                    aria-expanded={expanded}
                    className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-emerald-50/40 transition-colors"
                  >
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-none flex-shrink-0 ${
                      n.is_published ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {n.is_published ? '公開中' : '非公開'}
                    </span>
                    {/* ★ 自動配信のローテに乗っているか（第274便・2026-09-11）。
                        ★ 印が付いているだけ＝回る対象。★ 実際に今日出たかは別（記録は周が持つ）。 */}
                    {n.auto_rotate && (
                      <span
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-none flex-shrink-0 border ${
                          n.is_published
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                            : 'bg-white text-emerald-300 border-emerald-100'
                        }`}
                        title={n.is_published ? '自動配信のローテに乗っています' : '印は付いていますが、非公開なので回りません'}
                      >
                        自動投稿中
                      </span>
                    )}
                    <span className="text-sm font-bold text-slate-700 truncate min-w-0">{n.title || '（無題）'}</span>
                    <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                      <span className="hidden sm:inline text-[10px] text-slate-400">{formatPublishedAt(n.published_at)}</span>
                      <svg
                        className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                        style={{ color: '#34D399' }}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        aria-hidden
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </button>

                  {/* 開いたときの中身（★ 同時展開は常に1件・未保存があれば切り替えに confirm） */}
                  {expanded && (
                    <div className="px-5 pb-5 pt-4 space-y-3 border-t border-emerald-100">
                      {/* ── 4つの操作（第289便・2026-09-12・カッキーさんの指示）──
                          ★★ フクエス側のお知らせと同じ並び・同じ振る舞い。★ どれも【その場で効く】。
                          ★ 自動投稿は非公開の左。★ 印が付いているときは「自動投稿中」。 */}
                      <div className="flex flex-wrap items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => handleToggleAutoRotate(n.id)}
                          disabled={togglingId === n.id}
                          title={n.auto_rotate
                            ? '1日1回・順番に1本ずつ自動で出しています。押すとやめます'
                            : '押すと、1日1回・順番に1本ずつ自動で出すようになります'}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-none border text-xs font-bold transition-colors disabled:opacity-50 ${
                            n.auto_rotate
                              ? 'border-emerald-300 text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                              : 'border-slate-200 text-slate-500 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                            <path d="M21 3v5h-5" />
                            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                            <path d="M3 21v-5h5" />
                          </svg>
                          {n.auto_rotate ? '自動投稿中' : '自動投稿にする'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTogglePublish(n.id)}
                          disabled={togglingId === n.id}
                          className="px-3 py-1.5 rounded-none border text-xs font-bold transition-colors disabled:opacity-50 hover:bg-emerald-50"
                          style={{ borderColor: '#6EE7B7', color: '#059669' }}
                        >
                          {n.is_published ? '非公開にする' : '公開にする'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRepost(n.id)}
                          disabled={repostingId === n.id}
                          title="投稿日時を現在時刻に更新して、求人ページの新着で先頭に出します"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-none border border-emerald-300 text-emerald-600 text-xs font-bold bg-emerald-50 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                            <path d="M21 3v5h-5" />
                            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                            <path d="M3 21v-5h5" />
                          </svg>
                          {repostingId === n.id ? '処理中...' : '再投稿'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(n.id)}
                          disabled={deletingId === n.id}
                          className="px-3 py-1.5 rounded-none border border-rose-200 text-rose-500 text-xs font-bold bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50"
                        >
                          {deletingId === n.id ? '削除中...' : '削除'}
                        </button>
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
                        {/* ★ 書くときと同じ10行に揃える（第287便・2026-09-12・カッキーさんの指示）。 */}
                        <textarea
                          rows={10}
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
                      {/* ★★ 「公開する」と「自動で回す」のチェックはここから外した（第289便）。
                          ★ 同じ用事のボタンが上にある——入口を2つ持たない。
                          ★ 上のボタンは押した時点で効く。★ ここに残る「保存」はタイトル・本文・画像だけ。 */}
                      <div className="flex justify-end">
                        <button className={saveBtn} style={saveBtnStyle} onClick={() => handleSave(n.id)} disabled={savingId === n.id}>
                          {savingId === n.id ? '保存中...' : '保存'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* もっと見る／折りたたむ（11件以上のときのみ・クライアント側の表示切替＝追加フェッチ不要） */}
            {items.length > INITIAL_VISIBLE && (
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="text-xs font-bold px-4 py-2 rounded-none border bg-white transition-colors"
                  style={{ borderColor: '#6EE7B7', color: '#059669' }}
                >
                  {showAll ? '折りたたむ' : `もっと見る（残り${items.length - INITIAL_VISIBLE}件）`}
                </button>
              </div>
            )}
        </>
      )}
    </div>
  );
}
