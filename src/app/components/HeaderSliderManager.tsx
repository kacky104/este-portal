'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateTop } from '@/app/lib/revalidateTop';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';

type SliderImage = {
  id: string;
  image_url: string;
  /** SP用画像URL。null なら PC 用画像がスマホでも表示される（フォールバック）。 */
  image_url_sp: string | null;
  display_order: number;
};

/** header-slider バケット内の公開URLから storage パス（ファイル名）を取り出す。無効なら null。 */
function storagePathFromUrl(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/header-slider/');
    return parts[1] || null;
  } catch {
    return null;
  }
}

export default function HeaderSliderManager() {
  const supabase = createClient();
  const [images, setImages] = useState<SliderImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  // SP用アップロード中のスライドID（カード単位でボタンを無効化するため）。
  const [spBusyId, setSpBusyId] = useState<string | null>(null);

  const fetchImages = useCallback(async () => {
    const { data, error } = await supabase
      .from('header_slider_images')
      .select('*')
      .order('display_order', { ascending: true });

    if (!error && data) setImages(data);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('header-slider')
      .upload(fileName, file, { cacheControl: STORAGE_CACHE_CONTROL });

    if (uploadError) {
      alert('アップロードに失敗しました: ' + uploadError.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('header-slider')
      .getPublicUrl(fileName);

    const nextOrder = images.length > 0
      ? Math.max(...images.map((img) => img.display_order)) + 1
      : 0;

    const { error: insertError } = await supabase
      .from('header_slider_images')
      .insert({
        image_url: urlData.publicUrl,
        display_order: nextOrder,
      });

    if (insertError) {
      alert('登録に失敗しました: ' + insertError.message);
    } else {
      revalidateTop(); // 成功時：トップのISRを即時更新
      await fetchImages();
    }

    setUploading(false);
    e.target.value = '';
  };

  const handleDelete = async (image: SliderImage) => {
    if (!confirm('この画像を削除しますか?')) return;

    // ストレージから PC 用・SP 用ファイルをそれぞれ独立して削除。
    const pcPath = storagePathFromUrl(image.image_url);
    const spPath = image.image_url_sp ? storagePathFromUrl(image.image_url_sp) : null;
    const paths = [pcPath, spPath].filter((p): p is string => Boolean(p));
    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('header-slider')
        .remove(paths);
      if (storageError) {
        console.error('Storage delete error:', storageError);
      }
    }

    // DBレコードを削除（count: 'exact' でサイレント失敗を検出）
    const { error, count } = await supabase
      .from('header_slider_images')
      .delete({ count: 'exact' })
      .eq('id', image.id);

    if (error) {
      alert('削除に失敗しました: ' + error.message);
    } else if (count === 0) {
      alert('削除できませんでした。権限が不足している可能性があります。\nSupabaseのRLSポリシーを確認してください。');
    } else {
      revalidateTop();
      await fetchImages();
    }
  };

  // SP 用画像をアップロード（対象スライドの image_url_sp のみ更新）。
  const handleUploadSp = async (image: SliderImage, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSpBusyId(image.id);

    const ext = file.name.split('.').pop();
    // PC 用（{timestamp}.{ext}）と衝突しないよう _sp サフィックスで分離。
    const fileName = `${Date.now()}_sp.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('header-slider')
      .upload(fileName, file, { cacheControl: STORAGE_CACHE_CONTROL });

    if (uploadError) {
      alert('SP用画像のアップロードに失敗しました: ' + uploadError.message);
      setSpBusyId(null);
      e.target.value = '';
      return;
    }

    const { data: urlData } = supabase.storage
      .from('header-slider')
      .getPublicUrl(fileName);

    // image_url_sp のみ更新（image_url には触れない＝undefinedオーバーライドガード）。
    const { error: updateError, count } = await supabase
      .from('header_slider_images')
      .update({ image_url_sp: urlData.publicUrl }, { count: 'exact' })
      .eq('id', image.id);

    if (updateError || count === 0) {
      alert('SP用画像の登録に失敗しました: ' + (updateError?.message ?? '権限不足の可能性があります'));
    } else {
      // 差し替え時は旧SPファイルを独立して削除（PC用は消さない）。
      const oldSpPath = image.image_url_sp ? storagePathFromUrl(image.image_url_sp) : null;
      if (oldSpPath) {
        await supabase.storage.from('header-slider').remove([oldSpPath]);
      }
      revalidateTop();
      await fetchImages();
    }

    setSpBusyId(null);
    e.target.value = '';
  };

  // SP 用画像だけを外して PC 用フォールバックに戻す（image_url_sp を null 化）。
  const handleRemoveSp = async (image: SliderImage) => {
    if (!image.image_url_sp) return;
    if (!confirm('SP用画像を削除して、スマホでもPC用画像を表示しますか?')) return;

    setSpBusyId(image.id);

    const { error: updateError, count } = await supabase
      .from('header_slider_images')
      .update({ image_url_sp: null }, { count: 'exact' })
      .eq('id', image.id);

    if (updateError || count === 0) {
      alert('SP用画像の削除に失敗しました: ' + (updateError?.message ?? '権限不足の可能性があります'));
    } else {
      // DB更新成功後にSPファイルのみ物理削除（PC用は残す）。
      const spPath = storagePathFromUrl(image.image_url_sp);
      if (spPath) {
        await supabase.storage.from('header-slider').remove([spPath]);
      }
      revalidateTop();
      await fetchImages();
    }

    setSpBusyId(null);
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;

    const current = images[index];
    const target = images[targetIndex];

    await supabase
      .from('header_slider_images')
      .update({ display_order: target.display_order })
      .eq('id', current.id);

    await supabase
      .from('header_slider_images')
      .update({ display_order: current.display_order })
      .eq('id', target.id);

    revalidateTop();
    await fetchImages();
  };

  if (loading) return <p>読み込み中...</p>;

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <div>
        <label className="inline-block bg-blue-600 text-white px-4 py-2 rounded cursor-pointer">
          {uploading ? 'アップロード中...' : 'PC用画像を追加'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
        <p className="text-sm text-gray-500 mt-1">JPEG / PNG / WebP、5MBまで</p>
        <p className="text-sm text-gray-500">
          PC用推奨サイズ: <span className="font-medium">4:3（例 1448×1086）</span>
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {images.map((img, index) => (
          <div key={img.id} className="border rounded p-2 space-y-2">
            {/* PC用プレビュー */}
            <div>
              <p className="text-[11px] text-gray-400 mb-0.5">PC用</p>
              <img src={img.image_url} alt="" className="w-full h-24 object-cover rounded" />
            </div>

            {/* SP用プレビュー／アップロード */}
            <div className="border-t pt-2">
              <p className="text-[11px] text-gray-400 mb-0.5">
                SP用（任意・4:3 例 1086×815）
              </p>
              {img.image_url_sp ? (
                <img src={img.image_url_sp} alt="" className="w-full h-24 object-cover rounded" />
              ) : (
                <div className="w-full h-24 flex items-center justify-center rounded bg-gray-50 text-[11px] text-gray-400 text-center px-1">
                  未設定<br />スマホでもPC用を表示
                </div>
              )}
              <div className="flex items-center justify-between mt-1 text-xs">
                <label className="text-blue-600 cursor-pointer">
                  {spBusyId === img.id ? '処理中...' : img.image_url_sp ? 'SP差替' : 'SP追加'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => handleUploadSp(img, e)}
                    disabled={spBusyId === img.id}
                    className="hidden"
                  />
                </label>
                {img.image_url_sp && (
                  <button
                    onClick={() => handleRemoveSp(img)}
                    disabled={spBusyId === img.id}
                    className="text-red-500 disabled:opacity-30"
                  >
                    SP削除
                  </button>
                )}
              </div>
            </div>

            <div className="flex justify-between text-sm border-t pt-2">
              <button
                onClick={() => handleMove(index, 'up')}
                disabled={index === 0}
                className="disabled:opacity-30"
              >
                ↑
              </button>
              <button
                onClick={() => handleMove(index, 'down')}
                disabled={index === images.length - 1}
                className="disabled:opacity-30"
              >
                ↓
              </button>
              <button
                onClick={() => handleDelete(img)}
                className="text-red-600"
              >
                削除
              </button>
            </div>
          </div>
        ))}
      </div>

      {images.length === 0 && (
        <p className="text-gray-500">まだ画像が登録されていません。</p>
      )}
    </div>
  );
}