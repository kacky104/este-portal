'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateSalon } from '@/app/lib/revalidateTop';

// フリーページ編集（1店舗 最大3・タイトル＋本文＋画像数枚）。オーナー本人が自店のページを作成/編集/削除。
// 画像は既存の salon-images バケット（free/ 配下）を流用。RLS は salon_free_pages 側で担保。
const supabase = createClient();
const MAX_PAGES = 3;
const FREE_BUCKET = 'salon-images';

type FreePage = { id: number; title: string; body: string; images: string[] };

export default function SalonFreePagesManager({
  salonId,
  onToast,
  onPagesChange,
  bare = false,
}: {
  salonId: number;
  onToast: (m: string) => void;
  onPagesChange?: (pages: { id: number; title: string }[]) => void;
  bare?: boolean;
}) {
  const [pages, setPages] = useState<FreePage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null); // 画像アップロード/削除中
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const emit = useCallback(
    (list: FreePage[]) => onPagesChange?.(list.map((p) => ({ id: p.id, title: p.title }))),
    [onPagesChange],
  );

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('salon_free_pages')
      .select('id, title, body, images')
      .eq('salon_id', salonId)
      .order('display_order', { ascending: true })
      .order('id', { ascending: true });
    const list: FreePage[] = (data ?? []).map((r) => ({
      id: Number(r.id),
      title: (r.title as string) ?? '',
      body: (r.body as string) ?? '',
      images: Array.isArray(r.images) ? (r.images as string[]) : [],
    }));
    setPages(list);
    setLoaded(true);
    emit(list);
  }, [salonId, emit]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (id: number, patch: Partial<FreePage>) =>
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  // 画像の公開URLから salon-images バケット内パスを割り出し、実ファイルを削除する。
  // DB配列から外すだけだと孤児ファイルが溜まるため、削除系で必ず呼ぶ。
  const storageRemove = (url: string) => {
    const marker = `/${FREE_BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx !== -1) supabase.storage.from(FREE_BUCKET).remove([url.slice(idx + marker.length)]);
  };

  const addPage = async () => {
    if (pages.length >= MAX_PAGES) return;
    const { data, error } = await supabase
      .from('salon_free_pages')
      .insert({ salon_id: salonId, title: '', body: '', images: [], display_order: pages.length })
      .select('id, title, body, images')
      .single();
    if (error || !data) { onToast(`追加に失敗しました: ${error?.message ?? ''}`); return; }
    const next = [...pages, { id: Number(data.id), title: '', body: '', images: [] }];
    setPages(next);
    emit(next);
    onToast('ページを追加しました');
  };

  const savePage = async (page: FreePage) => {
    setSavingId(page.id);
    const { error } = await supabase
      .from('salon_free_pages')
      .update({ title: page.title.slice(0, 60), body: page.body, images: page.images, updated_at: new Date().toISOString() })
      .eq('id', page.id);
    setSavingId(null);
    if (error) { onToast(`保存に失敗しました: ${error.message}`); return; }
    revalidateSalon(salonId);
    emit(pages);
    onToast('保存しました');
  };

  const deletePage = async (id: number) => {
    if (!window.confirm('このフリーページを削除しますか？（元に戻せません）')) return;
    const target = pages.find((p) => p.id === id);
    const { error } = await supabase.from('salon_free_pages').delete().eq('id', id);
    if (error) { onToast(`削除に失敗しました: ${error.message}`); return; }
    target?.images.forEach((u) => { if (u) storageRemove(u); }); // ページ内画像の実ファイルも削除
    const next = pages.filter((p) => p.id !== id);
    setPages(next);
    emit(next);
    revalidateSalon(salonId);
    onToast('削除しました');
  };

  const uploadImage = async (page: FreePage, file: File) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { onToast('JPEG / PNG / WebP のみ'); return; }
    if (file.size > 5 * 1024 * 1024) { onToast('画像は5MBまでです'); return; }
    setBusyId(page.id);
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `free/${salonId}/${page.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(FREE_BUCKET).upload(path, file, { upsert: false });
    if (upErr) { setBusyId(null); onToast(`アップロードに失敗しました: ${upErr.message}`); return; }
    const { data: pub } = supabase.storage.from(FREE_BUCKET).getPublicUrl(path);
    const nextImages = [...page.images, pub.publicUrl];
    // 画像はすぐDB保存（本文とは別に確定）
    const { error: dbErr } = await supabase.from('salon_free_pages').update({ images: nextImages, updated_at: new Date().toISOString() }).eq('id', page.id);
    setBusyId(null);
    if (dbErr) { onToast(`保存に失敗しました: ${dbErr.message}`); return; }
    setField(page.id, { images: nextImages });
    const el = fileRefs.current[page.id];
    if (el) el.value = '';
    revalidateSalon(salonId);
    onToast('画像を追加しました');
  };

  const removeImage = async (page: FreePage, idx: number) => {
    const removedUrl = page.images[idx];
    const nextImages = page.images.filter((_, i) => i !== idx);
    const { error } = await supabase.from('salon_free_pages').update({ images: nextImages, updated_at: new Date().toISOString() }).eq('id', page.id);
    if (error) { onToast(`削除に失敗しました: ${error.message}`); return; }
    if (removedUrl) storageRemove(removedUrl); // 実ファイルも削除（孤児防止）
    setField(page.id, { images: nextImages });
    revalidateSalon(salonId);
  };

  return (
    <div className={bare ? 'space-y-4' : 'bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4'}>
      <div>
        {!bare && <h2 className="text-sm font-black text-slate-700">フリーページ（最大3）</h2>}
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
          自由に作れるページです（タイトル＋本文＋画像）。作成したページは、上の「詳細バナー」やポップアップ画像の
          <span className="text-slate-500 font-bold">リンク先</span>に選べます。URL は /salon/{salonId}/p/ページID です。
        </p>
      </div>

      {!loaded ? (
        <div className="py-6 text-center text-sm text-slate-400">読み込み中...</div>
      ) : (
        <>
          {pages.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
              まだフリーページはありません
            </div>
          )}

          {pages.map((page, i) => (
            <div key={page.id} className="rounded-2xl border border-slate-100 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">ページ {i + 1}</span>
                <button type="button" onClick={() => deletePage(page.id)} className="text-[11px] text-slate-400 hover:text-red-500 underline">
                  このページを削除
                </button>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">タイトル（最大60文字）</label>
                <input
                  type="text"
                  maxLength={60}
                  value={page.title}
                  onChange={(e) => setField(page.id, { title: e.target.value.slice(0, 60) })}
                  placeholder="例：8月限定キャンペーンのご案内"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">本文（改行できます）</label>
                <textarea
                  rows={5}
                  value={page.body}
                  onChange={(e) => setField(page.id, { body: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200 resize-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1">画像</label>
                {page.images.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {page.images.map((src, idx) => (
                      <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeImage(page, idx)}
                          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-[11px] leading-none flex items-center justify-center"
                          aria-label="画像を削除"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  ref={(el) => { fileRefs.current[page.id] = el; }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(page, f); }}
                />
                <button
                  type="button"
                  onClick={() => fileRefs.current[page.id]?.click()}
                  disabled={busyId === page.id}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold bg-pink-50 text-pink-600 border border-pink-300 hover:bg-pink-100 disabled:opacity-50"
                >
                  {busyId === page.id ? 'アップロード中…' : '画像を追加'}
                </button>
                <p className="mt-1 text-[10px] text-slate-400">JPEG・PNG・WebP／各5MBまで。画像はページ内に縦に並びます。</p>
              </div>

              <button
                type="button"
                onClick={() => savePage(page)}
                disabled={savingId === page.id}
                className="w-full py-2.5 rounded-full bg-pink-500 text-white text-sm font-bold hover:bg-pink-600 disabled:opacity-50"
              >
                {savingId === page.id ? '保存中…' : 'このページを保存する'}
              </button>

              <a
                href={`/salon/${salonId}/p/${page.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-[11px] text-pink-600 hover:underline"
              >
                このページを表示（別タブ）↗
              </a>
            </div>
          ))}

          {pages.length < MAX_PAGES && (
            <button
              type="button"
              onClick={addPage}
              className="w-full py-2.5 rounded-full border border-pink-300 text-pink-600 text-sm font-bold hover:bg-pink-50"
            >
              ＋ フリーページを追加（あと{MAX_PAGES - pages.length}）
            </button>
          )}
        </>
      )}
    </div>
  );
}
