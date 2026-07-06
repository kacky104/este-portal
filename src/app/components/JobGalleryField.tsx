'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { MAX_JOB_GALLERY_IMAGES, MAX_GALLERY_CAPTION_LEN, type JobGalleryItem } from '@/app/lib/jobs';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';

// 「お店の雰囲気」ギャラリー画像（正方形・salon_jobs.gallery_images jsonb・最大6枚）のアップロード欄。
// mypage求人フォーム／admin代理編集フォームで共用。JobHeroImageField のパターンを踏襲。
// 各画像に一言キャプション（1行・30字・任意）を付けられる。
//
// ストレージ: job-hero-images バケット（public）を流用。パス {salon_id}/gallery/{timestamp}.{ext}。
// 既存の書き込みRLS（is_salon_owner_by_path＝先頭フォルダ=salon_id 照合）はパスの先頭が salon_id の
// ままなので追加のポリシー変更なしで「自サロンのオーナー or 運営」だけ書き込み可。
const BUCKET = 'job-hero-images';
const supabase = createClient();

function validateImageFile(file: File): string | null {
  if (file.size > 5 * 1024 * 1024) return '5MB以下の画像を選択してください';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'JPEG・PNG・WebPのみ対応しています';
  return null;
}

// public URL から bucket 内のストレージパスを取り出す（削除用）。
function storagePathFromUrl(url: string): string | null {
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}

export function JobGalleryField({
  salonId,
  value,
  onChange,
}: {
  salonId: number | null;
  value: JobGalleryItem[];
  onChange: (items: JobGalleryItem[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const atMax = value.length >= MAX_JOB_GALLERY_IMAGES;

  // 追加アップロード（末尾に足す）。上限に達している場合は何もしない（ボタン非表示だが二重防御）。
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 同じファイルの再選択も拾えるようクリア
    if (!file) return;
    if (salonId == null) { setErr('先に対象サロンを選択してください'); return; }
    if (atMax) { setErr(`お店の雰囲気の画像は最大${MAX_JOB_GALLERY_IMAGES}枚までです`); return; }
    const v = validateImageFile(file);
    if (v) { setErr(v); return; }

    setErr('');
    setBusy(true);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    // タイムスタンプで一意化（featuredキャッシュバグの教訓＝同名上書きによるCDN残り防止）。
    const path = `${salonId}/gallery/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: STORAGE_CACHE_CONTROL });
    if (upErr) {
      setBusy(false);
      setErr(`アップロードに失敗しました: ${upErr.message}`);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    setBusy(false);
    onChange([...value, { url: publicUrl, caption: '' }]);
  };

  // 個別削除：ストレージファイルを消し、配列から除去（保存で gallery_images が更新される）。
  const handleDelete = async (index: number) => {
    const target = value[index];
    if (!target) return;
    if (!window.confirm('この画像を削除しますか？（保存すると反映されます）')) return;
    setBusy(true);
    const oldPath = storagePathFromUrl(target.url);
    if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
    setBusy(false);
    onChange(value.filter((_, i) => i !== index));
  };

  // 並び替え（↑↓で隣と入れ替え）。表示順＝この配列順。
  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
  };

  // キャプション更新（30字上限は maxLength＋ここでも二重に切り詰め）。
  const setCaption = (index: number, caption: string) => {
    const next = value.map((it, i) => (i === index ? { ...it, caption: caption.slice(0, MAX_GALLERY_CAPTION_LEN) } : it));
    onChange(next);
  };

  return (
    <div>
      <label className="text-[11px] font-bold text-slate-400 block mb-1">
        お店の雰囲気（最大{MAX_JOB_GALLERY_IMAGES}枚）
      </label>
      <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">
        推奨サイズ：正方形（800×800px推奨）。求人詳細の「お店の雰囲気」スライダーに掲載されます。
        <span className="block">各画像に一言キャプション（例：「講習は女性講師」）を付けられます（任意・{MAX_GALLERY_CAPTION_LEN}字まで・↑↓で並び替え）。</span>
        {salonId == null && <span className="block text-amber-600">※ 先に対象サロンを選択してください。</span>}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />

      {/* サムネイル一覧（配列順）。各画像に並び替え・削除・キャプション入力。 */}
      {value.length > 0 && (
        <div className="space-y-2 mb-2">
          {value.map((item, i) => (
            <div key={item.url} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-2">
              {/* プレビュー（正方形）。フォーム内は軽量に素の img を使用。 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={`お店の雰囲気${i + 1}枚目`}
                className="w-20 flex-shrink-0 aspect-square object-cover rounded-lg border border-slate-200"
              />
              <div className="flex-1 min-w-0">
                <span className="text-[10px] text-slate-400">{i + 1}枚目</span>
                <input
                  type="text"
                  value={item.caption}
                  maxLength={MAX_GALLERY_CAPTION_LEN}
                  onChange={(e) => setCaption(i, e.target.value)}
                  placeholder="一言キャプション（任意）"
                  className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
                <span className="block text-[10px] text-slate-300 text-right mt-0.5">{item.caption.length}/{MAX_GALLERY_CAPTION_LEN}</span>
              </div>
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={busy || i === 0}
                    aria-label="上へ"
                    className="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 text-xs flex items-center justify-center hover:border-emerald-300 hover:text-emerald-500 disabled:opacity-30 transition-colors"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={busy || i === value.length - 1}
                    aria-label="下へ"
                    className="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 text-xs flex items-center justify-center hover:border-emerald-300 hover:text-emerald-500 disabled:opacity-30 transition-colors"
                  >
                    ↓
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(i)}
                  disabled={busy}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 disabled:opacity-40 transition-colors"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 追加ボタン（上限未満のときのみ） */}
      {!atMax && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || salonId == null}
          className="w-full py-4 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 font-semibold hover:border-emerald-300 hover:text-emerald-600 disabled:opacity-40 transition-colors"
        >
          {busy ? 'アップロード中...' : value.length === 0 ? '📷 お店の雰囲気を追加' : '＋ 画像を追加'}
        </button>
      )}

      {err && <p className="text-[10px] text-rose-500 mt-1">{err}</p>}
    </div>
  );
}
