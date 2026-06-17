'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { SALON_THEMES } from '@/app/lib/themes';

const supabase = createClient();
const BUCKET = 'theme-wallpapers';

type Wallpaper = {
  id:        number;
  theme_key: string;
  image_url: string;
};

const validateImageFile = (file: File): string | null => {
  if (file.size > 5 * 1024 * 1024) return '5MB以下の画像を選択してください';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'JPEG・PNG・WebPのみ対応しています';
  return null;
};

const storagePathFromUrl = (url: string): string | null => {
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
};

export default function ThemeWallpaperManager({ onToast }: { onToast: (msg: string) => void }) {
  const [byKey, setByKey] = useState<Record<string, Wallpaper>>({});
  const [loading, setLoading] = useState(true);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const fetchWallpapers = useCallback(async () => {
    const { data, error } = await supabase
      .from('theme_wallpapers')
      .select('id, theme_key, image_url');
    if (!error && data) {
      const map: Record<string, Wallpaper> = {};
      (data as Wallpaper[]).forEach(w => { map[w.theme_key] = w; });
      setByKey(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchWallpapers(); }, [fetchWallpapers]);

  const handleUpload = async (themeKey: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { onToast(err); e.target.value = ''; return; }

    setUploadingKey(themeKey);
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${themeKey}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
    if (uploadError) {
      onToast(`アップロードに失敗しました: ${uploadError.message}`);
      setUploadingKey(null); e.target.value = ''; return;
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const oldUrl = byKey[themeKey]?.image_url ?? null;

    const { error: dbErr } = await supabase
      .from('theme_wallpapers')
      .upsert({ theme_key: themeKey, image_url: publicUrl }, { onConflict: 'theme_key' });

    setUploadingKey(null); e.target.value = '';
    if (dbErr) {
      onToast(`保存に失敗しました: ${dbErr.message}`);
      await supabase.storage.from(BUCKET).remove([path]); return;
    }

    // 旧ファイルを削除（差し替え時）
    if (oldUrl) {
      const oldPath = storagePathFromUrl(oldUrl);
      if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
    }
    await fetchWallpapers();
    onToast('壁紙を設定しました');
  };

  const handleDelete = async (themeKey: string) => {
    const wp = byKey[themeKey];
    if (!wp) return;
    if (!confirm('この壁紙を削除しますか？')) return;

    const path = storagePathFromUrl(wp.image_url);
    if (path) await supabase.storage.from(BUCKET).remove([path]);

    const { error, count } = await supabase
      .from('theme_wallpapers')
      .delete({ count: 'exact' })
      .eq('id', wp.id);

    if (error) {
      onToast(`削除に失敗しました: ${error.message}`);
    } else if (count === 0) {
      onToast('削除できませんでした（権限エラーの可能性があります）');
    } else {
      await fetchWallpapers();
      onToast('壁紙を削除しました');
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-black text-slate-700">テーマ壁紙設定</h2>
        <span className="text-[11px] text-slate-400">{Object.keys(byKey).length} / {SALON_THEMES.length} 設定済み</span>
      </div>
      <p className="text-[11px] text-slate-400 mb-1">各テーマの背景に使う壁紙画像を設定します（JPEG / PNG / WebP・最大5MB）。サロン詳細ページで薄く敷かれます。</p>
      <p className="text-[11px] text-slate-400 mb-5">推奨サイズ：横 1920px × 縦 1080px（16:9 の横長画像）</p>

      {loading ? (
        <p className="text-xs text-slate-400">読み込み中...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SALON_THEMES.map(theme => {
            const wp = byKey[theme.key];
            const isUploading = uploadingKey === theme.key;
            return (
              <div key={theme.key} className="rounded-2xl border border-slate-200 p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: theme.bg, border: `1px solid ${theme.swatchBorder}` }}
                  />
                  <span className="text-xs font-bold text-slate-700">{theme.label}</span>
                  <span className="text-[10px] text-slate-300 font-mono ml-auto">{theme.key}</span>
                </div>

                {/* プレビュー */}
                <div
                  className="relative rounded-xl overflow-hidden border border-slate-200"
                  style={{ aspectRatio: '16/9', backgroundColor: theme.bg }}
                >
                  {wp ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={wp.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-400">
                      壁紙なし
                    </div>
                  )}
                </div>

                {/* 操作 */}
                <div className="flex gap-1.5">
                  <label className={`flex-1 flex items-center justify-center cursor-pointer py-1.5 px-2 rounded-lg border text-[11px] font-bold transition-colors ${
                    isUploading
                      ? 'border-pink-100 text-pink-300 cursor-not-allowed'
                      : 'border-pink-200 text-pink-500 hover:bg-pink-50'
                  }`}>
                    <input
                      type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                      disabled={isUploading}
                      onChange={(e) => handleUpload(theme.key, e)}
                    />
                    {isUploading ? 'アップロード中...' : wp ? '変更' : 'アップロード'}
                  </label>
                  {wp && (
                    <button
                      type="button"
                      onClick={() => handleDelete(theme.key)}
                      className="py-1.5 px-3 rounded-lg border border-rose-200 text-rose-500 text-[11px] font-bold bg-rose-50 hover:bg-rose-100 transition-colors"
                    >
                      削除
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
