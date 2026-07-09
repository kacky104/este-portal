'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { XTimeAgo } from './XTimeAgo';
import { VerifiedBadge } from './VerifiedBadge';
import { XListSkeleton } from './XSkeleton';
import { useMe } from './XMeProvider';
import type { DmOtherProfile } from './xDmShared';

const sb = createClient();

type ConvRow = {
  id: string | number;
  participant_a: string;
  participant_b: string;
  last_message_at: string;
};

type ConvItem = {
  id: string;
  other: DmOtherProfile | null;
  preview: string | null;
  lastAt: string;
  unread: boolean;
};

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
      const myId = me.id;

      // 自分の会話（RLSで自分のものだけ）。
      const { data: convRows } = await sb
        .from('x_conversations')
        .select('id, participant_a, participant_b, last_message_at')
        .order('last_message_at', { ascending: false });
      const convs = (convRows ?? []) as ConvRow[];
      if (convs.length === 0) {
        if (alive) {
          setItems([]);
          setLoading(false);
        }
        return;
      }

      const convIds = convs.map((c) => String(c.id));
      const otherIds = [
        ...new Set(convs.map((c) => (c.participant_a === myId ? c.participant_b : c.participant_a))),
      ];

      // 相手プロフィール・自分の既読位置・各会話の最新メッセージをまとめて取得。
      const [profRes, readRes, msgRes] = await Promise.all([
        sb
          .from('x_profiles')
          .select('id, handle, display_name, avatar_url, kind, is_verified, status, dm_disabled')
          .in('id', otherIds),
        sb.from('x_conversation_reads').select('conversation_id, last_read_at').eq('profile_id', myId).in('conversation_id', convIds),
        sb
          .from('x_messages')
          .select('conversation_id, body, created_at, sender_profile_id')
          .in('conversation_id', convIds)
          .order('created_at', { ascending: false })
          .limit(500),
      ]);

      const profDict = new Map<string, DmOtherProfile>();
      (profRes.data ?? []).forEach((p) =>
        profDict.set(p.id as string, {
          id: p.id as string,
          handle: (p.handle as string) ?? '',
          displayName: (p.display_name as string) ?? '',
          avatarUrl: (p.avatar_url as string | null) ?? null,
          kind: ((p.kind as string) ?? 'user') as DmOtherProfile['kind'],
          isVerified: Boolean(p.is_verified),
          status: (p.status as string) ?? 'approved',
          dmDisabled: Boolean(p.dm_disabled),
        })
      );

      const readMap = new Map<string, string>();
      (readRes.data ?? []).forEach((r) => readMap.set(String(r.conversation_id), String(r.last_read_at)));

      // 最新メッセージ（desc 取得済みなので会話ごと最初の1件）。
      const lastMsg = new Map<string, { body: string; created_at: string; sender: string }>();
      (msgRes.data ?? []).forEach((m) => {
        const cid = String(m.conversation_id);
        if (!lastMsg.has(cid)) {
          lastMsg.set(cid, {
            body: (m.body as string) ?? '',
            created_at: m.created_at as string,
            sender: m.sender_profile_id as string,
          });
        }
      });

      const list: ConvItem[] = convs.map((c) => {
        const cid = String(c.id);
        const otherId = c.participant_a === myId ? c.participant_b : c.participant_a;
        const lm = lastMsg.get(cid);
        const readAt = readMap.get(cid) ?? '1970-01-01T00:00:00Z';
        const unread = !!lm && lm.sender !== myId && new Date(lm.created_at).getTime() > new Date(readAt).getTime();
        return {
          id: cid,
          other: profDict.get(otherId) ?? null,
          preview: lm?.body ?? null,
          lastAt: lm?.created_at ?? c.last_message_at,
          unread,
        };
      });

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
        <div className="x-card rounded-2xl bg-white/[0.94] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-6 text-center">
          <p className="text-sm text-slate-600 mb-4 leading-relaxed">メッセージを見るにはログインしてください。</p>
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
              className="x-card flex items-center gap-3 rounded-2xl bg-white/[0.94] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-3 hover:brightness-[0.98] transition"
            >
              <span className="w-2 flex-shrink-0 flex justify-center">
                {it.unread && <span className="w-2 h-2 rounded-full bg-indigo-500" aria-label="未読" />}
              </span>
              <span className="relative w-11 h-11 rounded-full overflow-hidden border border-slate-100 bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
                {it.other?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.other.avatarUrl} alt={it.other.displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold">{it.other?.displayName.charAt(0) || '?'}</span>
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-sm truncate ${it.unread ? 'font-bold text-slate-900' : 'font-bold text-slate-800'}`}>
                    {it.other?.displayName || '（不明なユーザー）'}
                  </span>
                  {(it.other?.kind === 'official' || ((it.other?.kind === 'shop' || it.other?.kind === 'therapist') && it.other?.isVerified)) && (
                    <VerifiedBadge kind={it.other.kind} />
                  )}
                  <XTimeAgo iso={it.lastAt} className="ml-auto text-xs text-slate-400 flex-shrink-0" />
                </div>
                <p className={`text-xs truncate ${it.unread ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
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
