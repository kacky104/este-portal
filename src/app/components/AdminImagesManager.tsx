'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';

// /admin「書類」タブの画像フォルダ。管理者・審査スタッフ専用（書類置き場と同じ admin-documents バケット・
// admin_documents テーブルを流用＝DB追加なし）。非公開バケットのためサムネイルは署名URL（1時間有効）で表示。
// 実ファイルは `{uuid}.{ext}` で保存し、元のファイル名は admin_documents.filename に持つ。
const BUCKET = 'admin-documents';
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const SIGNED_TTL = 3600; // 署名URLの有効秒数（1時間）
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

type Img = {
  id: string;
  filename: string;
  storage_path: string;
  mime: string | null;
  size: number | null;
  created_at: string;
};

// admin_documents の行が画像かどうか（mime 優先・無ければ拡張子で判定）。書類（PDF/Word）と同居テーブルのため必須。
function isImageRow(r: { mime: string | null; filename: string }): boolean {
  if (r.mime && r.mime.startsWith('image/')) return true;
  const ext = r.filename.split('.').pop()?.toLowerCase();
  return !!ext && IMAGE_EXTS.includes(ext);
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDateJST(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export default function AdminImagesManager({ onToast }: { onToast: (msg: string) => void }) {
  const supabase = createClient();
  const [images, setImages] = useState<Img[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({}); // storage_path -> 署名URL
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('admin_documents')
      .select('id, filename, storage_path, mime, size, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      setErrorMsg('admin_documents テーブルの読み込みに失敗しました。マイグレーションを適用したか確認してください。');
      setLoading(false);
      return;
    }
    setErrorMsg('');
    const imgs = ((data ?? []) as Img[]).filter(isImageRow);
    setImages(imgs);
    // 署名URL（非公開バケットのためサムネイル表示に必要）をまとめて発行。
    if (imgs.length > 0) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(imgs.map(i => i.storage_path), SIGNED_TTL);
      const map: Record<string, string> = {};
      (signed ?? []).forEach((s) => { if (s.path && s.signedUrl) map[s.path] = s.signedUrl; });
      setUrls(map);
    } else {
      setUrls({});
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setBusy(true);
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const okType = file.type.startsWith('image/') || IMAGE_EXTS.includes(ext);
      if (!okType) { onToast(`${file.name}: 画像（JPEG・PNG・WebP・GIF）のみアップロードできます`); continue; }
      if (file.size > MAX_SIZE) { onToast(`${file.name}: 10MB以下の画像のみアップロードできます`); continue; }
      const id = crypto.randomUUID();
      const path = `${id}.${ext || 'bin'}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined });
      if (upErr) { onToast(`${file.name}: アップロードに失敗しました（${upErr.message}）`); continue; }
      const { error: insErr } = await supabase.from('admin_documents').insert({
        id, filename: file.name, storage_path: path, mime: file.type || null, size: file.size,
      });
      if (insErr) {
        await supabase.storage.from(BUCKET).remove([path]);
        onToast(`${file.name}: 登録に失敗しました（${insErr.message}）`);
        continue;
      }
      onToast(`${file.name} をアップロードしました`);
    }
    setBusy(false);
    await fetchList();
  };

  const handleDownload = async (img: Img) => {
    setBusy(true);
    const { data, error } = await supabase.storage.from(BUCKET).download(img.storage_path);
    setBusy(false);
    if (error || !data) { onToast(`ダウンロードに失敗しました${error ? `（${error.message}）` : ''}`); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = img.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (img: Img) => {
    if (!window.confirm(`「${img.filename}」を削除しますか？\nこの操作は取り消せません。`)) return;
    setBusy(true);
    const { data: deleted, error } = await supabase.from('admin_documents').delete().eq('id', img.id).select('id');
    if (error || !deleted || deleted.length === 0) {
      setBusy(false);
      onToast(error ? `削除に失敗しました: ${error.message}` : '削除できませんでした（権限エラーの可能性があります）');
      return;
    }
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove([img.storage_path]);
    if (rmErr) console.error('[AdminImages] ストレージファイルの削除に失敗:', img.storage_path, rmErr);
    setBusy(false);
    setImages(prev => prev.filter(d => d.id !== img.id));
    onToast('画像を削除しました');
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          画像（JPEG・PNG・WebP・GIF・10MBまで）の保管庫です。運営・審査スタッフのみ利用できます（オーナー・一般には公開されません）。サムネイルをクリックすると原寸で開きます。
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex-shrink-0 px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          ＋ 画像をアップロード
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
        multiple
        className="hidden"
        onChange={handleUpload}
      />

      {loading ? (
        <p className="text-xs text-slate-400 text-center py-6">読み込み中...</p>
      ) : errorMsg ? (
        <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-xs text-rose-500 leading-relaxed">⚠ {errorMsg}</div>
      ) : images.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-8 text-center text-xs text-slate-400">
          画像がありません。「画像をアップロード」から追加してください。
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map(img => (
            <div key={img.id} className="rounded-2xl border border-slate-100 bg-slate-50/40 overflow-hidden flex flex-col">
              <a
                href={urls[img.storage_path] || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-square bg-slate-100"
              >
                {urls[img.storage_path] ? (
                  // 非公開バケットの署名URL＝next/image の許可ドメイン外のため通常の img で表示。
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[img.storage_path]} alt={img.filename} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">読み込み中...</div>
                )}
              </a>
              <div className="p-2 flex flex-col gap-1">
                <p className="text-[10px] font-bold text-slate-600 break-all line-clamp-1" title={img.filename}>{img.filename}</p>
                <p className="text-[9px] text-slate-400">{formatDateJST(img.created_at)}{img.size != null ? `・${formatSize(img.size)}` : ''}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <button
                    onClick={() => handleDownload(img)}
                    disabled={busy}
                    className="flex-1 text-[10px] font-bold px-2 py-1 rounded-lg border border-pink-200 text-pink-600 hover:bg-pink-50 disabled:opacity-50 transition-colors"
                  >
                    DL
                  </button>
                  <button
                    onClick={() => handleDelete(img)}
                    disabled={busy}
                    className="flex-1 text-[10px] font-bold px-2 py-1 rounded-lg border border-rose-200 text-rose-500 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 transition-colors"
                  >
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
