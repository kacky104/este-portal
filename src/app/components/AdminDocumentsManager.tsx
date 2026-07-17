'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';

// /admin「書類」タブの書類置き場（PDF・Word）。管理者専用（RLS：admin UUID のみ）。
// 実ファイルは非公開バケット admin-documents に `{uuid}.{ext}` で保存し、元のファイル名は
// admin_documents テーブルで持つ（日本語ファイル名によるストレージキー問題の回避）。
// ダウンロードは storage.download() で blob を取得し、元のファイル名で保存させる。
const BUCKET = 'admin-documents';
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

const ACCEPT_MIMES: Record<string, 'pdf' | 'word'> = {
  'application/pdf': 'pdf',
  'application/msword': 'word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
};

type Doc = {
  id: string;
  filename: string;
  storage_path: string;
  mime: string | null;
  size: number | null;
  created_at: string;
};

function kindOf(doc: Doc): 'pdf' | 'word' | null {
  if (doc.mime && ACCEPT_MIMES[doc.mime]) return ACCEPT_MIMES[doc.mime];
  const ext = doc.filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'doc' || ext === 'docx') return 'word';
  return null;
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

export default function AdminDocumentsManager({ onToast }: { onToast: (msg: string) => void }) {
  const supabase = createClient();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  // 種類サブタブ（PDF / WORD）。アップロードは両タブ共通で、一覧のみ絞り込む。
  const [subTab, setSubTab] = useState<'pdf' | 'word'>('pdf');
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
    setDocs((data ?? []) as Doc[]);
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
      const okType = ACCEPT_MIMES[file.type] || ['pdf', 'doc', 'docx'].includes(ext);
      if (!okType) { onToast(`${file.name}: PDF・Word（.pdf / .doc / .docx）のみアップロードできます`); continue; }
      if (file.size > MAX_SIZE) { onToast(`${file.name}: 20MB以下のファイルのみアップロードできます`); continue; }
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
      const k = ACCEPT_MIMES[file.type] ?? (ext === 'pdf' ? 'pdf' : 'word');
      setSubTab(k);
    }
    setBusy(false);
    await fetchList();
  };

  const handleDownload = async (doc: Doc) => {
    setBusy(true);
    const { data, error } = await supabase.storage.from(BUCKET).download(doc.storage_path);
    setBusy(false);
    if (error || !data) { onToast(`ダウンロードに失敗しました${error ? `（${error.message}）` : ''}`); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (doc: Doc) => {
    if (!window.confirm(`「${doc.filename}」を削除しますか？\nこの操作は取り消せません。`)) return;
    setBusy(true);
    const { data: deleted, error } = await supabase.from('admin_documents').delete().eq('id', doc.id).select('id');
    if (error || !deleted || deleted.length === 0) {
      setBusy(false);
      onToast(error ? `削除に失敗しました: ${error.message}` : '削除できませんでした（権限エラーの可能性があります）');
      return;
    }
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove([doc.storage_path]);
    if (rmErr) console.error('[AdminDocuments] ストレージファイルの削除に失敗:', doc.storage_path, rmErr);
    setBusy(false);
    setDocs(prev => prev.filter(d => d.id !== doc.id));
    onToast('書類を削除しました');
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          PDF・Word（.pdf / .doc / .docx・20MBまで）の保管庫です。運営・審査スタッフのみ利用できます（オーナー・一般には公開されません）。
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex-shrink-0 px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          ＋ ファイルをアップロード
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        multiple
        className="hidden"
        onChange={handleUpload}
      />

      {/* ── 種類サブタブ（PDF / WORD・件数付き） ── */}
      <div className="flex gap-1.5 mb-4">
        {([
          ['pdf', 'PDF', docs.filter(d => kindOf(d) === 'pdf').length],
          ['word', 'WORD', docs.filter(d => kindOf(d) === 'word').length],
        ] as const).map(([key, label, count]) => {
          const selected = subTab === key;
          return (
            <button
              key={key}
              onClick={() => setSubTab(key)}
              aria-pressed={selected}
              className={`inline-flex items-center gap-1 px-4 py-1.5 rounded-full border text-[11px] font-bold transition-colors ${
                selected
                  ? 'bg-pink-50 text-pink-600 border-pink-300'
                  : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
              }`}
            >
              {label}
              <span className={`text-[10px] rounded-full px-1.5 py-px font-bold ${selected ? 'bg-pink-100 text-pink-600' : 'bg-slate-100 text-slate-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-xs text-slate-400 text-center py-6">読み込み中...</p>
      ) : errorMsg ? (
        <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-xs text-rose-500 leading-relaxed">⚠ {errorMsg}</div>
      ) : docs.filter(d => kindOf(d) === subTab).length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-8 text-center text-xs text-slate-400">
          {subTab === 'pdf' ? 'PDF' : 'Word'}の書類がありません。「ファイルをアップロード」から追加してください。
        </div>
      ) : (
        <div className="space-y-2">
          {docs.filter(d => kindOf(d) === subTab).map(doc => {
            const kind = kindOf(doc);
            return (
              <div key={doc.id} className="rounded-2xl border border-slate-100 bg-slate-50/40 p-3.5 flex items-center gap-3 flex-wrap">
                {kind === 'pdf' ? (
                  <span className="flex-shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200">PDF</span>
                ) : kind === 'word' ? (
                  <span className="flex-shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">WORD</span>
                ) : (
                  <span className="flex-shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">FILE</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-700 break-all">{doc.filename}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{formatDateJST(doc.created_at)}{doc.size != null ? `・${formatSize(doc.size)}` : ''}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                  <button
                    onClick={() => handleDownload(doc)}
                    disabled={busy}
                    className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-pink-200 text-pink-600 hover:bg-pink-50 disabled:opacity-50 transition-colors"
                  >
                    ダウンロード
                  </button>
                  <button
                    onClick={() => handleDelete(doc)}
                    disabled={busy}
                    className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-rose-200 text-rose-500 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 transition-colors"
                  >
                    削除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
