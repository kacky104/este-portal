'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import type { XProfile } from './xProfile';
import { XTimeAgo } from './XTimeAgo';
import { mapDraftRow, type XDraft, type XDraftRow } from './xDrafts';

const supabase = createClient();

// 下書き一覧モーダル。XComposer から「下書き」ボタンで開く。
// parentPostId=null → 通常投稿の下書き / parentPostId 指定 → そのスレッドのリプライ下書きのみ。
// 行タップで onPick（コンポーザに読み込み）、ゴミ箱で削除。
export function XDraftsPanel({
  me,
  parentPostId,
  onPick,
  onClose,
}: {
  me: XProfile;
  parentPostId: string | null;
  onPick: (draft: XDraft) => void;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<XDraft[] | null>(null); // null=読み込み中
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // マウント時に本人の下書きを取得（更新の新しい順・最大50件）。
  useEffect(() => {
    let alive = true;
    (async () => {
      let q = supabase
        .from('x_drafts')
        .select('id, body, images, link_url, replies_disabled, parent_post_id, updated_at')
        .eq('author_profile_id', me.id)
        .order('updated_at', { ascending: false })
        .limit(50);
      q = parentPostId ? q.eq('parent_post_id', parentPostId) : q.is('parent_post_id', null);
      const { data, error: err } = await q;
      if (!alive) return;
      if (err) {
        setError('下書きを読み込めませんでした');
        setDrafts([]);
        return;
      }
      setDrafts(((data ?? []) as XDraftRow[]).map(mapDraftRow));
    })();
    return () => {
      alive = false;
    };
  }, [me.id, parentPostId]);

  // 表示中は body スクロールロック＋Escで閉じる。
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

  const remove = async (id: string) => {
    setDeletingId(id);
    const { error: err } = await supabase.from('x_drafts').delete().eq('id', id);
    setDeletingId(null);
    if (err) {
      setError('削除できませんでした');
      return;
    }
    setDrafts((prev) => (prev ?? []).filter((d) => d.id !== id));
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-3xl bg-[color:var(--x-surface)] shadow-2xl border border-[color:var(--x-border)] p-5 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="absolute top-3 right-3 w-8 h-8 rounded-full text-[color:var(--x-text-muted)] hover:bg-[color:var(--x-inset)] flex items-center justify-center"
        >
          ✕
        </button>
        <h2 className="text-sm font-black text-[color:var(--x-text-primary)] mb-3">
          {parentPostId ? 'リプライの下書き' : '下書き'}
        </h2>

        {error && (
          <div className="mb-2 p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 text-[12px] font-medium">
            ⚠️ {error}
          </div>
        )}

        {drafts === null ? (
          <p className="text-[13px] text-[color:var(--x-text-muted)] py-6 text-center">読み込み中...</p>
        ) : drafts.length === 0 ? (
          <p className="text-[13px] text-[color:var(--x-text-muted)] py-6 text-center">下書きはありません</p>
        ) : (
          <ul className="space-y-2">
            {drafts.map((d) => (
              <li key={d.id}>
                <div className="flex items-start gap-2 p-3 rounded-xl border border-[color:var(--x-border)] bg-[color:var(--x-inset)]">
                  <button type="button" onClick={() => onPick(d)} className="flex-1 text-left min-w-0">
                    <p className="text-sm text-[color:var(--x-text-primary)] line-clamp-2 whitespace-pre-wrap break-words">
                      {d.body || (d.images.length > 0 ? '（画像のみ）' : '（空の下書き）')}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-[color:var(--x-text-muted)]">
                      <XTimeAgo iso={d.updatedAt} />
                      {d.images.length > 0 && <span>🖼 {d.images.length}</span>}
                      {d.linkUrl && <span>🔗</span>}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(d.id)}
                    disabled={deletingId === d.id}
                    aria-label="下書きを削除"
                    className="flex-shrink-0 w-7 h-7 rounded-full text-[color:var(--x-text-muted)] hover:bg-rose-50 hover:text-rose-500 flex items-center justify-center disabled:opacity-40 transition-colors"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
