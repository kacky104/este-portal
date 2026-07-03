'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';

// 求人バナー画像（16:9・salon_jobs.hero_image_url）のアップロード欄。
// mypage求人フォーム／admin代理編集フォームで共用。既存のサロン画像アップロードUXを踏襲。
// 保存自体は求人フォームの「保存」（upsertMyJob）が担い、本コンポーネントは
// 画像のアップロード／差し替え／削除とプレビュー、フォーム値（hero_image_url）の更新のみを行う。
//
// ストレージ: job-hero-images バケット（public）。パス {salon_id}/{timestamp}.{ext}。
// RLS で「自サロンのオーナー or 運営」のみ書き込み可（20260703_job_hero_images_storage.sql）。
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
  value: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 同じファイルの再選択も拾えるようクリア
    if (!file) return;
    if (salonId == null) { setErr('先に対象サロンを選択してください'); return; }
    const v = validateImageFile(file);
    if (v) { setErr(v); return; }

    setErr('');
    setBusy(true);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${salonId}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setBusy(false);
      setErr(`アップロードに失敗しました: ${upErr.message}`);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

    // 差し替え時は旧ファイルを掃除（別パスのときのみ）。
    const oldPath = value ? storagePathFromUrl(value) : null;
    if (oldPath && oldPath !== path) {
      await supabase.storage.from(BUCKET).remove([oldPath]);
    }

    setBusy(false);
    onChange(publicUrl);
  };

  // 削除：ストレージファイルを消し、フォーム値を空に（保存で hero_image_url=NULL 化）。
  const handleDelete = async () => {
    if (!value) return;
    if (!window.confirm('求人バナー画像を削除しますか？（保存すると /jobs から外れます）')) return;
    setBusy(true);
    const oldPath = storagePathFromUrl(value);
    if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
    setBusy(false);
    onChange('');
  };

  return (
    <div>
      <label className="text-[11px] font-bold text-slate-400 block mb-1">求人バナー画像</label>
      <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">
        推奨サイズ：横1280×縦720px（16:9）。画像を設定すると /jobs トップのバナー枠に掲載されます。
        {salonId == null && <span className="block text-amber-600">※ 先に対象サロンを選択してください。</span>}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFile}
      />

      {value ? (
        <div className="space-y-2">
          {/* プレビュー（16:9）。フォーム内プレビューは軽量に素の img を使用。 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="求人バナープレビュー"
            className="w-full aspect-video object-cover rounded-xl border border-slate-200"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy || salonId == null}
              className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 transition-colors"
            >
              {busy ? '処理中...' : '画像を差し替え'}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 disabled:opacity-40 transition-colors"
            >
              削除
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || salonId == null}
          className="w-full py-6 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 font-semibold hover:border-emerald-300 hover:text-emerald-600 disabled:opacity-40 transition-colors"
        >
          {busy ? 'アップロード中...' : '📷 バナー画像をアップロード'}
        </button>
      )}

      {err && <p className="text-[10px] text-rose-500 mt-1">{err}</p>}
    </div>
  );
}
