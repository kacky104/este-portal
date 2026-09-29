'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { XTimeAgo } from './XTimeAgo';
import { VerifiedBadge } from './VerifiedBadge';
import { XListSkeleton } from './XSkeleton';
import { useMe } from './XMeProvider';
import { listMyXConversations, type ConvItem } from './xReadActions';




// 会話一覧（要ログイン）。RLS により自分が参加する会話だけが返る。last_message_at 降順。
export function XMessages() {
  const { me, userId, loading: meLoading } = useMe(); // 自分は共通Contextから（重複取得を排除）
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ConvItem[]>([]);

  useEffect(() => {
    if (meLoading) return;
    if (!me) {
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      // ★ 第986便: 会話一覧の読み込みはサーバーで（アプリ内ブラウザで止まる事故の対策）
      let list: ConvItem[] = [];
      try {
        const r = await listMyXConversations();
        list = r.ok ? r.items : [];
      } catch { /* 読めないときは空で表示 */ }
      if (!alive) return;
      setItems(list);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [me, meLoading]);

  return (
    <div className="py-3">
      <h1 className="x-rescue-muted text-lg font-black text-white drop-shadow-sm mb-3 px-1">メッセージ</h1>

      {meLoading || loading ? (
        <XListSkeleton rows={6} variant="row" />
      ) : !userId ? (
        <div className="x-card rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-6 text-center">
          <p className="text-sm text-[color:var(--x-text-secondary)] mb-4 leading-relaxed">メッセージを見るにはログインしてください。</p>
          <Link
            href="/x/login"
            className="inline-block px-6 py-2.5 rounded-xl text-white font-bold text-sm shadow-md hover:opacity-95 transition-opacity"
            style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
          >
            ログイン / 新規登録
          </Link>
        </div>
      ) : items.length === 0 ? (
        <p className="x-rescue-muted text-sm text-white/90 text-center py-12 drop-shadow-sm">
          まだ会話はありません。フォロー中／フォロワーのプロフィールから「メッセージ」で始められます。
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <Link
              key={it.id}
              href={`/x/messages/${it.id}`}
              className="x-card flex items-center gap-3 rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-3 hover:brightness-[0.98] transition"
            >
              <span className="w-2 flex-shrink-0 flex justify-center">
                {it.unread && <span className="w-2 h-2 rounded-full bg-indigo-500" aria-label="未読" />}
              </span>
              <span className="relative w-11 h-11 rounded-full overflow-hidden border border-[color:var(--x-border)] bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
                {it.other?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.other.avatarUrl} alt={it.other.displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold">{it.other?.displayName.charAt(0) || '?'}</span>
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {/* 未読は太字＋primary、既読はやや控えめ（下のプレビュー行の未読/既読差と揃える） */}
                  <span className={`text-sm truncate ${it.unread ? 'font-bold text-[color:var(--x-text-primary)]' : 'font-medium text-[color:var(--x-text-secondary)]'}`}>
                    {it.other?.displayName || '（不明なユーザー）'}
                  </span>
                  {(it.other?.kind === 'official' || ((it.other?.kind === 'shop' || it.other?.kind === 'therapist') && it.other?.isVerified)) && (
                    <VerifiedBadge kind={it.other.kind} />
                  )}
                  <XTimeAgo iso={it.lastAt} className="ml-auto text-xs text-[color:var(--x-text-muted)] flex-shrink-0" />
                </div>
                <p className={`text-xs truncate ${it.unread ? 'text-[color:var(--x-text-primary)] font-medium' : 'text-[color:var(--x-text-muted)]'}`}>
                  {it.preview ?? `@${it.other?.handle ?? ''}`}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
