'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { getSession } from '@/lib/auth';
import { XTimeAgo } from './XTimeAgo';
import { VerifiedBadge } from './VerifiedBadge';
import { XListSkeleton } from './XSkeleton';
import { DM_READ_EVENT, type DmOtherProfile } from './xDmShared';

const sb = createClient();
const POLL_MS = 8000; // 軽いポーリング（Realtimeは将来）。離脱時にクリア。

type Msg = { id: string; body: string; createdAt: string; mine: boolean };

export function XThread({ conversationId }: { conversationId: string }) {
  const convNum = Number(conversationId);

  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [accessible, setAccessible] = useState<boolean | null>(null); // null=判定前
  const [other, setOther] = useState<DmOtherProfile | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const myIdRef = useRef<string | null>(null);
  const countRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const markRead = async () => {
    try {
      await sb.rpc('x_mark_conversation_read', { p_conversation_id: convNum });
      window.dispatchEvent(new Event(DM_READ_EVENT)); // ヘッダーのDM未読を再取得
    } catch {
      /* 既読化失敗は致命的でない */
    }
  };

  const fetchMessages = async (myId: string): Promise<Msg[]> => {
    const { data } = await sb
      .from('x_messages')
      .select('id, body, created_at, sender_profile_id')
      .eq('conversation_id', convNum)
      .order('created_at', { ascending: true });
    return (data ?? []).map((m) => ({
      id: String(m.id),
      body: (m.body as string) ?? '',
      createdAt: m.created_at as string,
      mine: (m.sender_profile_id as string) === myId,
    }));
  };

  // 初回ロード：viewer → 会話（RLSで非メンバーは0件）→ 相手解決 → メッセージ → 既読化。
  useEffect(() => {
    let alive = true;
    (async () => {
      const session = await getSession();
      const uid = session?.user.id;
      if (!uid) {
        if (alive) {
          setLoggedIn(false);
          setLoading(false);
        }
        return;
      }
      const { data: prof } = await sb.from('x_profiles').select('id').eq('auth_user_id', uid).maybeSingle();
      const myId = (prof?.id as string | undefined) ?? null;
      if (!alive) return;
      setLoggedIn(true);
      if (!myId) {
        setLoading(false);
        return;
      }
      myIdRef.current = myId;

      // RLS：自分が参加者でない会話は返らない（=他人の会話IDを叩いてもデータは出ない）。
      const { data: conv } = await sb
        .from('x_conversations')
        .select('id, participant_a, participant_b')
        .eq('id', convNum)
        .maybeSingle();
      if (!alive) return;
      if (!conv) {
        setAccessible(false);
        setLoading(false);
        return;
      }
      setAccessible(true);

      const otherId = (conv.participant_a as string) === myId ? (conv.participant_b as string) : (conv.participant_a as string);
      const { data: op } = await sb
        .from('x_profiles')
        .select('id, handle, display_name, avatar_url, kind, is_verified, status')
        .eq('id', otherId)
        .maybeSingle();
      if (alive && op) {
        setOther({
          id: op.id as string,
          handle: (op.handle as string) ?? '',
          displayName: (op.display_name as string) ?? '',
          avatarUrl: (op.avatar_url as string | null) ?? null,
          kind: ((op.kind as string) ?? 'user') as DmOtherProfile['kind'],
          isVerified: Boolean(op.is_verified),
          status: (op.status as string) ?? 'approved',
        });
      }

      const msgs = await fetchMessages(myId);
      if (!alive) return;
      setMessages(msgs);
      countRef.current = msgs.length;
      setLoading(false);
      markRead();
    })();
    return () => {
      alive = false;
    };
  }, [convNum]);

  // 軽いポーリング：新着があれば反映。相手からの新着が来たら既読化。
  useEffect(() => {
    if (accessible !== true) return;
    let alive = true;
    const tick = async () => {
      const myId = myIdRef.current;
      if (!myId) return;
      const msgs = await fetchMessages(myId);
      if (!alive) return;
      if (msgs.length !== countRef.current) {
        const grewWithIncoming = msgs.length > countRef.current && msgs[msgs.length - 1] && !msgs[msgs.length - 1].mine;
        countRef.current = msgs.length;
        setMessages(msgs);
        if (grewWithIncoming) markRead();
      }
    };
    const iv = window.setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [accessible]);

  // 新着で最下部へスクロール。
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = async () => {
    const body = input.trim();
    const myId = myIdRef.current;
    if (!body || sending || !myId) return;
    setSending(true);
    setError('');
    const { data, error: insErr } = await sb
      .from('x_messages')
      .insert({ conversation_id: convNum, sender_profile_id: myId, body })
      .select('id, body, created_at, sender_profile_id')
      .single();
    setSending(false);
    if (insErr) {
      setError(`送信できませんでした：${insErr.message}`);
      return;
    }
    // 楽観反映（last_message_at はトリガが更新するのでアプリは触らない）。
    setMessages((prev) => {
      const next = [
        ...prev,
        { id: String(data?.id), body, createdAt: (data?.created_at as string) ?? new Date().toISOString(), mine: true },
      ];
      countRef.current = next.length;
      return next;
    });
    setInput('');
  };

  return (
    <div className="py-3">
      {/* 戻る */}
      <Link
        href="/x/messages"
        className="x-rescue-muted inline-flex items-center gap-1 text-sm font-bold text-white/90 drop-shadow-sm mb-2"
      >
        ← メッセージ一覧
      </Link>

      {loading ? (
        <XListSkeleton rows={5} variant="row" />
      ) : !loggedIn ? (
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
      ) : accessible === false ? (
        <div className="x-card rounded-2xl bg-white/[0.94] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-6 text-center">
          <p className="text-sm text-slate-600 leading-relaxed">この会話は見つからないか、表示する権限がありません。</p>
        </div>
      ) : (
        <>
          {/* 相手ヘッダー */}
          {other && (
            <Link
              href={`/x/u/${other.handle}`}
              className="x-card flex items-center gap-3 rounded-2xl bg-white/[0.94] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-3 mb-3 hover:brightness-[0.98] transition"
            >
              <span className="relative w-10 h-10 rounded-full overflow-hidden border border-slate-100 bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
                {other.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={other.avatarUrl} alt={other.displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold text-sm">{other.displayName.charAt(0) || '?'}</span>
                )}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-sm text-slate-900 truncate">{other.displayName || '（不明なユーザー）'}</span>
                  {other.kind === 'shop' && other.isVerified && <VerifiedBadge />}
                </div>
                <p className="text-xs text-slate-400 truncate">@{other.handle}</p>
              </div>
            </Link>
          )}

          {/* メッセージ列 */}
          <div className="space-y-2 mb-3">
            {messages.length === 0 ? (
              <p className="x-rescue-muted text-sm text-white/90 text-center py-8 drop-shadow-sm">
                まだメッセージはありません。最初の一言を送ってみましょう。
              </p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[78%] ${m.mine ? 'items-end' : 'items-start'} flex flex-col`}>
                    <div
                      className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                        m.mine
                          ? 'text-white rounded-br-sm'
                          : 'bg-white border border-slate-100 text-slate-800 rounded-bl-sm'
                      }`}
                      style={m.mine ? { background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' } : undefined}
                    >
                      {m.body}
                    </div>
                    <XTimeAgo iso={m.createdAt} className="text-[10px] text-white/70 mt-0.5 px-1 drop-shadow-sm" />
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* 送信フォーム */}
          <div className="x-card rounded-2xl bg-white/[0.94] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-2">
            {error && <p className="text-[12px] text-rose-500 font-medium px-2 pb-1">⚠️ {error}</p>}
            <div className="flex items-end gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="メッセージを入力"
                className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-base focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
              />
              <button
                type="button"
                onClick={send}
                disabled={sending || !input.trim()}
                className="px-4 py-2.5 rounded-xl text-white font-bold text-sm shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
              >
                {sending ? '送信中' : '送信'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
