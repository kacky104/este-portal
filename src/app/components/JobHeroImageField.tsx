'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { MAX_JOB_HERO_IMAGES } from '@/app/lib/jobs';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';

// 求人バナー画像（16:9・salon_jobs.hero_image_urls text[]・最大3枚）のアップロード欄。
// mypage求人フォーム／admin代理編集フォームで共用。既存のサロン画像アップロードUXを踏襲。
// 保存自体は求人フォームの「保存」（upsertMyJob）が担い、本コンポーネントは
// 画像のアップロード／削除／並び替えとプレビュー、フォーム値（hero_image_urls）の更新のみを行う。
//
// ストレージ: job-hero-images バケット（public）。パス {salon_id}/{timestamp}.{ext}（複数でも衝突しない）。
// RLS で「自サロンのオーナー or 運営」のみ書き込み可（20260703_job_hero_images_storage.sql）。バケット・
// ポリシーはパス単位のため今回変更なし。
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

export function JobHeroImageField({
  salonId,
  value,
  onChange,
}: {
  salonId: number | null;
  value: string[];
  onChange: (urls: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const atMax = value.length >= MAX_JOB_HERO_IMAGES;

  // 追加アップロード（末尾に足す）。3枚に達している場合は何もしない（ボタン非表示だが二重防御）。
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 同じファイルの再選択も拾えるようクリア
    if (!file) return;
    if (salonId == null) { setErr('先に対象サロンを選択してください'); return; }
    if (atMax) { setErr(`バナー画像は最大${MAX_JOB_HERO_IMAGES}枚までです`); return; }
    const v = validateImageFile(file);
    if (v) { setErr(v); return; }

    setErr('');
    setBusy(true);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${salonId}/${Date.now()}.${ext}`;

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
    onChange([...value, publicUrl]);
  };

  // 個別削除：ストレージファイルを消し、配列から除去（保存で hero_image_urls が更新される）。
  const handleDelete = async (index: number) => {
    const target = value[index];
    if (!target) return;
    if (!window.confirm('このバナー画像を削除しますか？（保存すると反映されます）')) return;
    setBusy(true);
    const oldPath = storagePathFromUrl(target);
    if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
    setBusy(false);
    onChange(value.filter((_, i) => i !== index));
  };

  // 並び替え（↑↓で隣と入れ替え）。先頭=メイン画像。
  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
  };

  return (
    <div>
      <label className="text-[11px] font-bold text-slate-400 block mb-1">
        求人バナー画像（最大{MAX_JOB_HERO_IMAGES}枚）
      </label>
      <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">
        推奨サイズ：横1280×縦720px（16:9）。設定すると /jobs トップのバナー枠・求人詳細に掲載されます。
        <span className="block font-bold text-emerald-600">1枚目が一覧・SNSシェアで使われます（↑↓で並び替え）。</span>
        {salonId == null && <span className="block text-amber-600">※ 先に対象サロンを選択してください。</span>}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />

      {/* サムネイル一覧（配列順）。各画像に「メイン」バッジ（先頭）・並び替え・削除。 */}
      {value.length > 0 && (
        <div className="space-y-2 mb-2">
          {value.map((url, i) => (
            <div key={url} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-2">
              {/* プレビュー（16:9）。フォーム内は軽量に素の img を使用。 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`求人バナー${i + 1}枚目`}
                className="w-28 flex-shrink-0 aspect-video object-cover rounded-lg border border-slate-200"
              />
              <div className="flex-1 min-w-0">
                {i === 0 ? (
                  <span className="inline-block text-[10px] font-bold text-white px-2 py-0.5 rounded-full" style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}>
                    メイン（1枚目）
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400">{i + 1}枚目</span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
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

      {/* 追加ボタン（3枚未満のときのみ） */}
      {!atMax && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || salonId == null}
          className="w-full py-4 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 font-semibold hover:border-emerald-300 hover:text-emerald-600 disabled:opacity-40 transition-colors"
        >
          {busy ? 'アップロード中...' : value.length === 0 ? '📷 バナー画像をアップロード' : '＋ 画像を追加'}
        </button>
      )}

      {err && <p className="text-[10px] text-rose-500 mt-1">{err}</p>}
    </div>
  );
}
