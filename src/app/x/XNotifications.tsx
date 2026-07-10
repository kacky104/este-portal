'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { XTimeAgo } from './XTimeAgo';
import { VerifiedBadge } from './VerifiedBadge';
import { XListSkeleton } from './XSkeleton';
import { SukiIcon } from './SukiIcon';
import { useMe } from './XMeProvider';
import {
  NOTIF_READ_EVENT,
  notificationHref,
  notificationSuffix,
  type XNotification,
  type XNotificationActor,
  type XNotificationType,
} from './xNotificationsShared';

const sb = createClient();
const LIMIT = 50; // まずは最新50件（無限スクロールは将来拡張）

type NotifRow = {
  id: string | number;
  type: XNotificationType;
  post_id: string | number | null;
  reply_post_id: string | number | null;
  is_read: boolean;
  created_at: string;
  actor_profile_id: string;
};

// type 別の小アイコン（アバター右下に重ねる）。like=ハート / reply=吹き出し / follow=人＋ / suki=唇 / post=ベル。
function TypeIcon({ type }: { type: XNotificationType }) {
  const base = 'absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white shadow-sm';
  if (type === 'post')
    return (
      <span className={`${base} bg-indigo-500`}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2a6 6 0 0 0-6 6c0 3.6-1 5.3-1.7 6.2-.4.5-.6.8-.6 1.3 0 .7.6 1.2 1.5 1.2h13.6c.9 0 1.5-.5 1.5-1.2 0-.5-.2-.8-.6-1.3C18.9 13.3 18 11.6 18 8a6 6 0 0 0-6-6z" />
          <path d="M10 19a2 2 0 0 0 4 0z" />
        </svg>
      </span>
    );
  if (type === 'suki')
    return (
      <span className={`${base} bg-pink-500`}>
        <SukiIcon className="w-3 h-3" />
      </span>
    );
  if (type === 'like')
    return (
      <span className={`${base} bg-rose-500`}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </span>
    );
  if (type === 'reply')
    return (
      <span className={`${base} bg-indigo-500`}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </span>
    );
  return (
    <span className={`${base} bg-emerald-500`}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M19 8v6M22 11h-6" />
      </svg>
    </span>
  );
}

function NotifAvatar({ actor }: { actor: XNotificationActor }) {
  return (
    <span className="relative w-11 h-11 rounded-full overflow-hidden border border-[color:var(--x-border)] bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
      {actor.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={actor.avatarUrl} alt={actor.displayName} className="w-full h-full object-cover" />
      ) : (
        <span className="text-white font-bold">{actor.displayName.charAt(0) || '?'}</span>
      )}
    </span>
  );
}

// 通知一覧（要ログイン）。本人依存・動的なので全てクライアントでマウント時取得。
// 取得時点の is_read をスナップショットとして未読ハイライトに使い、裏で一括既読RPCを叩く（バッジは即クリア）。
export function XNotifications() {
  const router = useRouter();
  const { me, userId, loading: meLoading } = useMe(); // 自分は共通Contextから（重複取得を排除）
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<XNotification[]>([]);

  useEffect(() => {
    if (meLoading) return; // me 取得中は待つ（未ログインと断定しない）
    if (!me) {
      // 未ログイン or 未開設（通知の受信者になり得ない）。
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      const myId = me.id;

      // 自分宛・新しい順・上限取得。
      const { data: rows } = await sb
        .from('x_notifications')
        .select('id, type, post_id, reply_post_id, is_read, created_at, actor_profile_id')
        .eq('recipient_profile_id', myId)
        .order('created_at', { ascending: false })
        .limit(LIMIT);
      const list = (rows ?? []) as NotifRow[];

      // actor を1クエリで合流し、rejected(凍結) actor の通知は表示から除外（トリガーは rejected でも作るため）。
      const actorIds = [...new Set(list.map((r) => r.actor_profile_id).filter(Boolean))];
      const dict = new Map<string, XNotificationActor & { status: string }>();
      if (actorIds.length > 0) {
        const { data: profs } = await sb
          .from('x_profiles')
          .select('id, handle, display_name, avatar_url, kind, is_verified, status')
          .in('id', actorIds);
        (profs ?? []).forEach((p) =>
          dict.set(p.id as string, {
            id: p.id as string,
            handle: (p.handle as string) ?? '',
            displayName: (p.display_name as string) ?? '',
            avatarUrl: (p.avatar_url as string | null) ?? null,
            kind: ((p.kind as string) ?? 'user') as XNotificationActor['kind'],
            isVerified: Boolean(p.is_verified),
            status: (p.status as string) ?? 'approved',
          })
        );
      }

      const built: XNotification[] = [];
      for (const r of list) {
        const a = dict.get(r.actor_profile_id);
        if (!a || a.status === 'rejected') continue;
        built.push({
          id: String(r.id),
          type: r.type,
          postId: r.post_id != null ? String(r.post_id) : null,
          replyPostId: r.reply_post_id != null ? String(r.reply_post_id) : null,
          isRead: Boolean(r.is_read),
          createdAt: r.created_at,
          actor: {
            id: a.id,
            handle: a.handle,
            displayName: a.displayName,
            avatarUrl: a.avatarUrl,
            kind: a.kind,
            isVerified: a.isVerified,
          },
        });
      }
      if (!alive) return;
      setItems(built);
      setLoading(false);

      // 一括既読化（裏で）。表示ハイライトは built の isRead スナップショットを保持＝どれが新着だったか分かる。
      // ヘッダーの未読バッジは即時クリア（遷移を待たない）。
      await sb.rpc('x_mark_all_notifications_read');
      if (alive) window.dispatchEvent(new Event(NOTIF_READ_EVENT));
    })();
    return () => {
      alive = false;
    };
  }, [me, meLoading]);

  // 行タップ：個別既読RPC（冪等）→ 遷移。
  const onRowClick = async (n: XNotification) => {
    try {
      await sb.rpc('x_mark_notification_read', { p_id: Number(n.id) });
    } catch {
      /* 既読化の失敗は遷移を妨げない */
    }
    router.push(notificationHref(n));
  };

  return (
    <div className="py-3">
      <h1 className="x-rescue-muted text-lg font-black text-white drop-shadow-sm mb-3 px-1">通知</h1>

      {meLoading || loading ? (
        <XListSkeleton rows={6} variant="row" />
      ) : !userId ? (
        <div className="x-card rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-6 text-center">
          <p className="text-sm text-[color:var(--x-text-secondary)] mb-4 leading-relaxed">通知を見るにはログインしてください。</p>
          <Link
            href="/x/login"
            className="inline-block px-6 py-2.5 rounded-xl text-white font-bold text-sm shadow-md hover:opacity-95 transition-opacity"
            style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
          >
            ログイン / 新規登録
          </Link>
        </div>
      ) : items.length === 0 ? (
        <p className="x-rescue-muted text-sm text-white/90 text-center py-12 drop-shadow-sm">通知はまだありません</p>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onRowClick(n)}
              className={`x-card w-full text-left rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-3 flex items-center gap-3 hover:brightness-[0.98] transition ${
                n.isRead ? '' : 'ring-1 ring-indigo-300'
              }`}
            >
              {/* 未読ドット（左） */}
              <span className="w-2 flex-shrink-0 flex justify-center">
                {!n.isRead && <span className="w-2 h-2 rounded-full bg-indigo-500" aria-label="未読" />}
              </span>

              <div className="relative flex-shrink-0">
                <NotifAvatar actor={n.actor} />
                <TypeIcon type={n.type} />
              </div>

              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-snug break-words ${n.isRead ? 'text-[color:var(--x-text-secondary)]' : 'text-[color:var(--x-text-primary)] font-medium'}`}>
                  <span className="font-bold">{n.actor.displayName || `@${n.actor.handle}`}</span>
                  {(n.actor.kind === 'official' || ((n.actor.kind === 'shop' || n.actor.kind === 'therapist') && n.actor.isVerified)) && (
                    <span className="inline-flex align-middle mx-0.5">
                      <VerifiedBadge kind={n.actor.kind} />
                    </span>
                  )}
                  <span>{notificationSuffix(n.type)}</span>
                </p>
                <XTimeAgo iso={n.createdAt} className="text-xs text-[color:var(--x-text-muted)]" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
