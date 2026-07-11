'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateTopAndAreas } from '@/app/lib/revalidateTop';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';

// 「セラピストピックアップ枠」（therapist_pickup_banners）管理。authenticated クライアント直（RLSで admin UUID のみ許可）。
// 画像は therapist-pickup-banners バケットへ `{banner_id}/{timestamp}.{ext}` で保存（upsert不使用＝差し替えで必ず別URL）。
// 追加は「（任意でリンクURLを入力）→画像選択→新UUIDフォルダにアップロード→そのidで行を insert」の順。
// リンクは URL 手動入力（link_url）で運用する：/therapist/123 等の相対パス、または https:// 絶対URL。
//   空欄はリンクなし画像のみ。旧運用の therapist_id は表示・編集しない（フォールバックのみ表示側で有効）。
// 表示側は横長画像1枚のみ（タイトル・オーバーレイなし）。最大10枠は本UIで制御（DB制約にはしない）。
// TOP＋全エリアページに出るため、保存後は revalidateTopAndAreas（{top,areasAll}）で無効化する。
// 単一カラム更新は該当列のみ送る（他フィールドを undefined で上書きしない＝undefinedオーバーライドガード遵守）。
const BUCKET = 'therapist-pickup-banners';
const MAX_BANNERS = 10;

type Banner = {
  id: string;
  image_url: string;
  mobile_image_url: string | null; // スマホ用（任意）。未設定はスマホでも image_url を表示。
  alt_text: string | null;
  link_url: string | null;
  display_order: number;
  is_active: boolean;
};

function storagePathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}

function validateImageFile(file: File): string | null {
  if (file.size > 5 * 1024 * 1024) return '5MB以下の画像を選択してください';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'JPEG・PNG・WebPのみ対応しています';
  return null;
}

export default function TherapistPickupBannerManager({
  onToast,
}: {
  onToast: (msg: string) => void;
}) {
  const supabase = createClient();
  const [items, setItems] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  // 追加フォームのリンク先URL（任意）。画像選択→アップロード→insert に使う。
  const [addLinkUrl, setAddLinkUrl] = useState('');
  // alt / link_url のローカル編集値（各行「保存」で確定）。
  const [altDrafts, setAltDrafts] = useState<Record<string, string>>({});
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({});

  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetId = useRef<string | null>(null);
  // スマホ用画像の設定/差し替え用（PC用と同じ「hidden input＋対象id」方式）。
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const mobileTargetId = useRef<string | null>(null);

  const atLimit = items.length >= MAX_BANNERS;

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('therapist_pickup_banners')
      .select('id, image_url, mobile_image_url, alt_text, link_url, display_order, is_active')
      .order('display_order', { ascending: true });
    if (error) {
      setErrorMsg('therapist_pickup_banners テーブルの読み込みに失敗しました。マイグレーションを確認してください。');
      setLoading(false);
      return;
    }
    const list = (data ?? []) as Banner[];
    setErrorMsg('');
    setItems(list);
    setAltDrafts(Object.fromEntries(list.map((b) => [b.id, b.alt_text ?? ''])));
    setLinkDrafts(Object.fromEntries(list.map((b) => [b.id, b.link_url ?? ''])));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // 新規追加：（任意でURL入力）→ 画像を選ぶ → 新UUIDフォルダにアップロード → その id で行を insert。
  const triggerAdd = () => {
    if (atLimit) { onToast(`最大${MAX_BANNERS}枠です`); return; }
    addInputRef.current?.click();
  };
  const handleAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (atLimit) { onToast(`最大${MAX_BANNERS}枠です`); return; }
    const err = validateImageFile(file);
    if (err) { onToast(err); return; }
    setBusy(true);
    const id = crypto.randomUUID();
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: STORAGE_CACHE_CONTROL });
    if (upErr) { onToast(`アップロードに失敗しました: ${upErr.message}`); setBusy(false); return; }
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const nextOrder = items.reduce((m, b) => Math.max(m, b.display_order), 0) + 1;
    const { error: insErr } = await supabase
      .from('therapist_pickup_banners')
      .insert({ id, image_url: publicUrl, link_url: addLinkUrl.trim() || null, display_order: nextOrder, is_active: true });
    if (insErr) {
      // 行作成に失敗したらアップロード済みファイルを掃除（孤児を残さない）。
      await supabase.storage.from(BUCKET).remove([path]);
      onToast(insErr.code === '42501'
        ? 'RLSにより追加が拒否されました。admin権限でログインしているか確認してください。'
        : `追加に失敗しました: ${insErr.message}`);
      setBusy(false);
      return;
    }
    setBusy(false);
    setAddLinkUrl('');
    await revalidateTopAndAreas();
    await fetchList();
    onToast('セラピストピックアップ枠を追加しました');
  };

  // 画像差し替え：新ファイルをアップロード → DB更新成功後に旧ファイルを掃除。
  const triggerReplace = (id: string) => { replaceTargetId.current = id; replaceInputRef.current?.click(); };
  const handleReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const id = replaceTargetId.current;
    e.target.value = '';
    replaceTargetId.current = null;
    if (!file || !id) return;
    const err = validateImageFile(file);
    if (err) { onToast(err); return; }
    const target = items.find((b) => b.id === id);
    if (!target) return;
    setBusy(true);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: STORAGE_CACHE_CONTROL });
    if (upErr) { onToast(`アップロードに失敗しました: ${upErr.message}`); setBusy(false); return; }
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const { error: dbErr } = await supabase
      .from('therapist_pickup_banners')
      .update({ image_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (dbErr) { onToast(`保存に失敗しました: ${dbErr.message}`); setBusy(false); return; }
    // DB更新が成功してから旧ファイルを削除（失敗時に画像を失わない順序）。
    const oldPath = storagePathFromUrl(target.image_url);
    if (oldPath && oldPath !== path) {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([oldPath]);
      if (rmErr) console.error('[TherapistPickupBanner] 旧画像の削除に失敗:', oldPath, rmErr);
    }
    setBusy(false);
    await revalidateTopAndAreas();
    await fetchList();
    onToast('画像を差し替えました');
  };

  // スマホ用画像の設定/差し替え：`{id}/sp-{timestamp}.{ext}` にアップロード → DB更新成功後に旧SPファイルを掃除。
  const triggerMobile = (id: string) => { mobileTargetId.current = id; mobileInputRef.current?.click(); };
  const handleMobileReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const id = mobileTargetId.current;
    e.target.value = '';
    mobileTargetId.current = null;
    if (!file || !id) return;
    const err = validateImageFile(file);
    if (err) { onToast(err); return; }
    const target = items.find((b) => b.id === id);
    if (!target) return;
    setBusy(true);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${id}/sp-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: STORAGE_CACHE_CONTROL });
    if (upErr) { onToast(`アップロードに失敗しました: ${upErr.message}`); setBusy(false); return; }
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const { error: dbErr } = await supabase
      .from('therapist_pickup_banners')
      .update({ mobile_image_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (dbErr) { onToast(`保存に失敗しました: ${dbErr.message}`); setBusy(false); return; }
    const oldPath = storagePathFromUrl(target.mobile_image_url);
    if (oldPath && oldPath !== path) {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([oldPath]);
      if (rmErr) console.error('[TherapistPickupBanner] 旧スマホ用画像の削除に失敗:', oldPath, rmErr);
    }
    setBusy(false);
    await revalidateTopAndAreas();
    await fetchList();
    onToast('スマホ用画像を設定しました');
  };

  // スマホ用画像の解除：DBを null に → Storage ファイルを掃除（スマホは PC 用画像の表示に戻る）。
  const handleMobileDelete = async (id: string) => {
    const target = items.find((b) => b.id === id);
    if (!target?.mobile_image_url) return;
    if (!window.confirm('スマホ用画像を削除しますか？\nスマホではPC用画像の表示に戻ります。')) return;
    setBusy(true);
    const { error } = await supabase
      .from('therapist_pickup_banners')
      .update({ mobile_image_url: null, updated_at: new Date().toISOString() })
      .eq('id', id);
    setBusy(false);
    if (error) { onToast(`削除に失敗しました: ${error.message}`); return; }
    const oldPath = storagePathFromUrl(target.mobile_image_url);
    if (oldPath) {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([oldPath]);
      if (rmErr) console.error('[TherapistPickupBanner] スマホ用画像の削除に失敗:', oldPath, rmErr);
    }
    setItems((prev) => prev.map((b) => (b.id === id ? { ...b, mobile_image_url: null } : b)));
    await revalidateTopAndAreas();
    onToast('スマホ用画像を削除しました');
  };

  // リンク先URLを保存（該当行のみ更新）。空欄は null（リンクなし）。
  const handleSaveLink = async (id: string) => {
    const link = (linkDrafts[id] ?? '').trim() || null;
    setBusy(true);
    const { error } = await supabase
      .from('therapist_pickup_banners')
      .update({ link_url: link, updated_at: new Date().toISOString() })
      .eq('id', id);
    setBusy(false);
    if (error) { onToast(`保存に失敗しました: ${error.message}`); return; }
    setItems((prev) => prev.map((b) => (b.id === id ? { ...b, link_url: link } : b)));
    await revalidateTopAndAreas();
    onToast('リンク先を保存しました');
  };

  // alt を保存（該当行のみ更新）。
  const handleSaveAlt = async (id: string) => {
    const alt = (altDrafts[id] ?? '').trim() || null;
    setBusy(true);
    const { error } = await supabase
      .from('therapist_pickup_banners')
      .update({ alt_text: alt, updated_at: new Date().toISOString() })
      .eq('id', id);
    setBusy(false);
    if (error) { onToast(`保存に失敗しました: ${error.message}`); return; }
    setItems((prev) => prev.map((b) => (b.id === id ? { ...b, alt_text: alt } : b)));
    await revalidateTopAndAreas();
    onToast('保存しました');
  };

  // 公開/非公開の切替。
  const handleToggleActive = async (id: string) => {
    const target = items.find((b) => b.id === id);
    if (!target) return;
    const next = !target.is_active;
    setBusy(true);
    const { error } = await supabase
      .from('therapist_pickup_banners')
      .update({ is_active: next, updated_at: new Date().toISOString() })
      .eq('id', id);
    setBusy(false);
    if (error) { onToast(`変更に失敗しました: ${error.message}`); return; }
    setItems((prev) => prev.map((b) => (b.id === id ? { ...b, is_active: next } : b)));
    await revalidateTopAndAreas();
    onToast(next ? '公開にしました' : '非公開にしました');
  };

  // 並び替え（↑↓）：隣の行と display_order を入れ替え。
  const handleMove = async (id: string, dir: 'up' | 'down') => {
    const idx = items.findIndex((b) => b.id === id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= items.length) return;
    const a = items[idx];
    const b = items[swapIdx];
    setBusy(true);
    const [r1, r2] = await Promise.all([
      supabase.from('therapist_pickup_banners').update({ display_order: b.display_order, updated_at: new Date().toISOString() }).eq('id', a.id),
      supabase.from('therapist_pickup_banners').update({ display_order: a.display_order, updated_at: new Date().toISOString() }).eq('id', b.id),
    ]);
    setBusy(false);
    if (r1.error || r2.error) {
      onToast(`並び替えに失敗しました: ${(r1.error ?? r2.error)?.message}`);
      await fetchList();
      return;
    }
    await revalidateTopAndAreas();
    await fetchList();
  };

  // 削除：行削除 → Storage ファイル掃除。
  const handleDelete = async (id: string) => {
    if (!window.confirm('この枠を削除しますか？\nこの操作は取り消せません。')) return;
    const target = items.find((b) => b.id === id);
    setBusy(true);
    const { data: deleted, error } = await supabase.from('therapist_pickup_banners').delete().eq('id', id).select('id');
    setBusy(false);
    if (error) { onToast(`削除に失敗しました: ${error.message}`); return; }
    if (!deleted || deleted.length === 0) {
      onToast('削除できませんでした（権限エラーの可能性があります）');
      return;
    }
    // PC用・スマホ用の両ファイルを掃除。
    const oldPaths = [storagePathFromUrl(target?.image_url ?? null), storagePathFromUrl(target?.mobile_image_url ?? null)]
      .filter((p): p is string => !!p);
    if (oldPaths.length > 0) {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove(oldPaths);
      if (rmErr) console.error('[TherapistPickupBanner] 削除に伴う画像の削除に失敗:', oldPaths, rmErr);
    }
    setItems((prev) => prev.filter((b) => b.id !== id));
    await revalidateTopAndAreas();
    onToast('枠を削除しました');
  };

  const inputClass = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200';

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <div className="mb-4 space-y-1">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          トップ＋全エリアページのサロン一覧（20枚目直下）に、横長バナー画像1枚を表示します（公開中からランダム1枚・リロードで入れ替わり）。リンク先URLを設定するとクリックでそこへ移動します。最大{MAX_BANNERS}枠。
        </p>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          推奨サイズ: PC用は横1240×縦440px（約2.8:1・横長）。スマホ用（任意）は横1000×縦400px（2.5:1）目安。
          スマホ用を設定するとスマホではそちらが表示され、未設定ならPC用が左右トリミングで表示されます。文字や顔は中央寄せの余裕あるデザインにしてください。
        </p>
      </div>

      {/* hidden file inputs（追加／差し替え／スマホ用） */}
      <input ref={addInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAdd} />
      <input ref={replaceInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleReplace} />
      <input ref={mobileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleMobileReplace} />

      {/* 追加フォーム：リンク先URL（任意）→ 画像を選んで追加 */}
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={addLinkUrl}
          onChange={(e) => setAddLinkUrl(e.target.value)}
          placeholder="リンク先URL（任意）例: /therapist/123 または https://..."
          className={`flex-1 min-w-0 ${inputClass}`}
          disabled={atLimit}
        />
        <button
          type="button"
          onClick={triggerAdd}
          disabled={busy || atLimit}
          className="flex-shrink-0 px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          ＋ 画像を選んで追加
        </button>
      </div>
      <p className="text-[10px] text-slate-400 mb-4">
        現在 {items.length} / {MAX_BANNERS} 枠{atLimit ? '（上限に達しています。追加するには既存の枠を削除してください）' : ''}
      </p>

      {loading ? (
        <p className="text-xs text-slate-400 text-center py-6">読み込み中...</p>
      ) : errorMsg ? (
        <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-xs text-rose-500 leading-relaxed">⚠ {errorMsg}</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-8 text-center text-xs text-slate-400">
          枠がありません。「画像を選んで追加」から登録してください。
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((b, i) => (
            <div key={b.id} className="rounded-2xl border border-slate-100 bg-slate-50/40 p-4">
              <div className="flex flex-wrap items-start gap-4">
                {/* プレビュー（PC用31:12＋スマホ用）。object-cover は中央基準。 */}
                <div className="flex-shrink-0">
                  <p className="text-[9px] font-bold text-slate-400 mb-0.5">PC用</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={b.image_url}
                    alt={b.alt_text ?? ''}
                    className="w-48 aspect-[31/12] object-cover rounded-lg border border-slate-200 bg-slate-100"
                  />
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => triggerReplace(b.id)} disabled={busy} className="text-[10px] font-semibold text-pink-600 hover:underline disabled:opacity-40">
                      画像を差し替え
                    </button>
                  </div>

                  {/* スマホ用（任意）。未設定はスマホでもPC用が表示される（トリミングあり）。 */}
                  <p className="text-[9px] font-bold text-slate-400 mt-2 mb-0.5">スマホ用（任意）</p>
                  {b.mobile_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={b.mobile_image_url}
                      alt={`${b.alt_text ?? ''}（スマホ用）`}
                      className="w-48 aspect-[5/2] object-cover rounded-lg border border-slate-200 bg-slate-100"
                    />
                  ) : (
                    <div className="w-48 aspect-[5/2] rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center">
                      <span className="text-[10px] text-slate-400">未設定（PC用を表示）</span>
                    </div>
                  )}
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => triggerMobile(b.id)} disabled={busy} className="text-[10px] font-semibold text-pink-600 hover:underline disabled:opacity-40">
                      {b.mobile_image_url ? 'スマホ用を差し替え' : 'スマホ用を設定'}
                    </button>
                    {b.mobile_image_url && (
                      <button onClick={() => handleMobileDelete(b.id)} disabled={busy} className="text-[10px] font-semibold text-rose-500 hover:underline disabled:opacity-40">
                        スマホ用を削除
                      </button>
                    )}
                  </div>
                </div>

                {/* 設定フィールド */}
                <div className="flex-1 min-w-[220px] space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${b.is_active ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
                      {b.is_active ? '公開中' : '非公開'}
                    </span>
                    <span className="text-[10px] text-slate-400">表示順 {b.display_order}</span>
                    <div className="flex items-center gap-1 ml-auto">
                      <button onClick={() => handleMove(b.id, 'up')} disabled={busy || i === 0} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 text-xs hover:bg-slate-100 disabled:opacity-30" aria-label="上へ">↑</button>
                      <button onClick={() => handleMove(b.id, 'down')} disabled={busy || i === items.length - 1} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 text-xs hover:bg-slate-100 disabled:opacity-30" aria-label="下へ">↓</button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">リンク先URL（任意・空欄はリンクなし）</label>
                    <input
                      className={inputClass}
                      placeholder="/therapist/123 または https://..."
                      value={linkDrafts[b.id] ?? ''}
                      onChange={(e) => setLinkDrafts((prev) => ({ ...prev, [b.id]: e.target.value }))}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">alt（任意）</label>
                    <input
                      className={inputClass}
                      placeholder="画像の説明"
                      value={altDrafts[b.id] ?? ''}
                      onChange={(e) => setAltDrafts((prev) => ({ ...prev, [b.id]: e.target.value }))}
                    />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    <button onClick={() => handleSaveLink(b.id)} disabled={busy} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white shadow-sm disabled:opacity-50 hover:opacity-90 transition-opacity">
                      リンクを保存
                    </button>
                    <button onClick={() => handleSaveAlt(b.id)} disabled={busy} className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                      altを保存
                    </button>
                    <button onClick={() => handleToggleActive(b.id)} disabled={busy} className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                      {b.is_active ? '非公開にする' : '公開にする'}
                    </button>
                    <button onClick={() => handleDelete(b.id)} disabled={busy} className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-rose-200 text-rose-500 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 transition-colors ml-auto">
                      削除
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
