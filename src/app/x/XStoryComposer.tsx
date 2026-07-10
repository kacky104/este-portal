'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';
import type { XProfile } from './xProfile';

const supabase = createClient();

const CAPTION_MAX = 200;

// 画像バリデーション（XSettingsForm と同基準）。
function validateImageFile(file: File): string | null {
  if (file.size > 5 * 1024 * 1024) return '5MB以下の画像を選択してください';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'JPEG・PNG・WebPのみ対応しています';
  return null;
}

// ストーリー投稿モーダル。画像1枚＋任意キャプションを x_stories に insert する。
export function XStoryComposer({ me, onClose }: { me: XProfile; onClose: () => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // body スクロールロック＋Escで閉じる。
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // プレビュー用 ObjectURL は差し替え/破棄時に解放。
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const verr = validateImageFile(f);
    if (verr) {
      setError(verr);
      return;
    }
    setError('');
    setFile(f);
  };

  // 画像アップロード（x-images バケットの本人フォルダ配下＝XSettingsForm と同パターン）。
  const uploadImage = async (f: File): Promise<string | null> => {
    const ext = f.name.split('.').pop() ?? 'jpg';
    const path = `${me.auth_user_id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('x-images').upload(path, f, { cacheControl: STORAGE_CACHE_CONTROL });
    if (upErr) {
      setError(`画像のアップロードに失敗しました: ${upErr.message}`);
      return null;
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from('x-images').getPublicUrl(path);
    return publicUrl;
  };

  const submit = async () => {
    if (busy || !file) return;
    setBusy(true);
    setError('');
    const imageUrl = await uploadImage(file);
    if (!imageUrl) {
      setBusy(false);
      return;
    }
    const { error: insErr } = await supabase.from('x_stories').insert({
      author_profile_id: me.id,
      image_url: imageUrl,
      caption: caption.trim() || null,
    });
    setBusy(false);
    if (insErr) {
      setError(`投稿に失敗しました：${insErr.message}`);
      return;
    }
    router.refresh();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-[color:var(--x-surface)] rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--x-border)]">
          <h2 className="text-base font-black text-[color:var(--x-text-primary)]">ストーリーを投稿</h2>
          <button type="button" onClick={onClose} aria-label="閉じる" className="p-1.5 text-[color:var(--x-text-muted)] hover:text-[color:var(--x-text-primary)] transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 text-[12px] font-medium text-center">⚠️ {error}</div>
          )}

          {/* 画像選択＋プレビュー（9:16想定・黒背景の中に object-contain） */}
          {preview ? (
            <div className="relative rounded-xl overflow-hidden bg-black aspect-[9/16] flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="プレビュー" className="w-full h-full object-contain" />
              <button
                type="button"
                onClick={() => setFile(null)}
                aria-label="画像を外す"
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-slate-900/60 text-white text-sm font-bold flex items-center justify-center hover:bg-rose-500 transition-colors"
              >
                ✕
              </button>
            </div>
          ) : (
            <label className="aspect-[9/16] rounded-xl border-2 border-dashed border-indigo-200 text-indigo-500 flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-50 transition-colors">
              <span className="text-3xl leading-none">＋</span>
              <span className="text-xs font-bold mt-1">画像を選ぶ</span>
              <span className="text-[10px] text-[color:var(--x-text-muted)] mt-0.5">JPEG・PNG・WebP・5MB以下</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onPick} className="hidden" />
            </label>
          )}

          {/* キャプション（任意・最大200文字） */}
          <div>
            <textarea
              rows={2}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="キャプション（任意）"
              maxLength={CAPTION_MAX}
              className="w-full px-4 py-3 rounded-xl border border-[color:var(--x-border-strong)] text-sm bg-[color:var(--x-inset)] focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-none"
            />
            <p className="text-[11px] text-[color:var(--x-text-muted)] mt-1 text-right">
              {caption.length}/{CAPTION_MAX}
            </p>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={busy || !file}
            className="w-full py-3.5 rounded-xl text-white font-bold text-sm shadow-md hover:opacity-95 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
          >
            {busy ? '投稿中...' : 'ストーリーを投稿'}
          </button>
          <p className="text-[10px] text-[color:var(--x-text-muted)] text-center">投稿から24時間で自動的に非表示になります。</p>
        </div>
      </div>
    </div>
  );
}
