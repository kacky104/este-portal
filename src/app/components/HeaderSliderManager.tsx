'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/app/lib/supabase/client';

type SliderImage = {
  id: string;
  image_url: string;
  display_order: number;
};

export default function HeaderSliderManager() {
  const supabase = createClient();
  const [images, setImages] = useState<SliderImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

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
      .upload(fileName, file);

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
      await fetchImages();
    }

    setUploading(false);
    e.target.value = '';
  };

  const handleDelete = async (image: SliderImage) => {
    if (!confirm('この画像を削除しますか?')) return;

    // ストレージからファイルを削除
    const url = new URL(image.image_url);
    const pathParts = url.pathname.split('/header-slider/');
    const storagePath = pathParts[1];
    if (storagePath) {
      const { error: storageError } = await supabase.storage
        .from('header-slider')
        .remove([storagePath]);
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
      await fetchImages();
    }
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

    await fetchImages();
  };

  if (loading) return <p>読み込み中...</p>;

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <h2 className="text-lg font-bold">トップページ画像スライダー</h2>

      <div>
        <label className="inline-block bg-blue-600 text-white px-4 py-2 rounded cursor-pointer">
          {uploading ? 'アップロード中...' : '画像を追加'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
        <p className="text-sm text-gray-500 mt-1">JPEG / PNG / WebP、5MBまで</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {images.map((img, index) => (
          <div key={img.id} className="border rounded p-2 space-y-2">
            <img src={img.image_url} alt="" className="w-full h-24 object-cover rounded" />
            <div className="flex justify-between text-sm">
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