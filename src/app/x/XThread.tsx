'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { loadXThread, listXMessages, sendXMessage, markXConversationRead } from './xDmActions';
import { XTimeAgo } from './XTimeAgo';
import { VerifiedBadge } from './VerifiedBadge';
import { XListSkeleton } from './XSkeleton';
import { useMe } from './XMeProvider';
import { DM_READ_EVENT, type DmOtherProfile } from './xDmShared';

const POLL_MS = 8000; // 軽いポーリング（Realtimeは将来）。離脱時にクリア。

type Msg = { id: string; body: string; createdAt: string; mine: boolean };

export function XThread({ conversationId }: { conversationId: string }) {
  const convNum = Number(conversationId);

  const { me, userId, loading: meLoading } = useMe(); // 自分は共通Contextから（重複取得を排除）
  const [loading, setLoading] = useState(true);
  const [accessible, setAccessible] = useState<boolean | null>(null); // null=判定前
  const [other, setOther] = useState<DmOtherProfile | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const myIdRef = useRef<string | null>(null);
  const countRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // ★ 第985便: 会話の読み込み・送信・既読化はサーバー経由（アプリ内ブラウザで送る前に止まる事故の対策）
  const markRead = async () => {
    try {
      await markXConversationRead(convNum);
      window.dispatchEvent(new Event(DM_READ_EVENT)); // ヘッダーのDM未読を再取得
    } catch {
      /* 既読化失敗は致命的でない */
    }
  };

  const fetchMessages = async (): Promise<Msg[] | null> => {
    try {
      const r = await listXMessages(convNum);
      return r.ok ? r.messages : null;
    } catch {
      return null;
    }
  };

  // 初回ロード：会話（RLSで非メンバーは0件）→ 相手解決 → メッセージ → 既読化（まとめてサーバーで）。
  useEffect(() => {
    if (meLoading) return;
    if (!me) {
      setLoading(false);
      return;
    }
    let alive = true;
    (async () => {
      myIdRef.current = me.id;
      let r: Awaited<ReturnType<typeof loadXThread>>;
      try { r = await loadXThread(convNum); } catch { r = { ok: false, error: '読み込めませんでした。電波のよい場所で、ページを開き直してください。' }; }
      if (!alive) return;
      if (!r.ok) {
        setError(r.error);
        setLoading(false);
        return;
      }
      if (!r.accessible) {
        setAccessible(false);
        setLoading(false);
        return;
      }
      setAccessible(true);
      if (r.other) setOther(r.other);
      setMessages(r.messages);
      countRef.current = r.messages.length;
      setLoading(false);
      markRead();
    })();
    return () => {
      alive = false;
    };
  }, [convNum, me, meLoading]);

  // 軽いポーリング：新着があれば反映。相手からの新着が来たら既読化。
  useEffect(() => {
    if (accessible !== true) return;
    let alive = true;
    const tick = async () => {
      if (!myIdRef.current) return;
      const msgs = await fetchMessages();
      if (!alive || !msgs) return;
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
    let res: Awaited<ReturnType<typeof sendXMessage>>;
    try { res = await sendXMessage(convNum, body); } catch { res = { ok: false, error: '通信できませんでした。電波のよい場所で、もう一度押してください。' }; }
    setSending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    const data = { id: res.id, created_at: res.createdAt };
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

  // DM受付オフ：どちらか一方でも true なら新規送信不可（過去メッセージの閲覧・既読化は従来どおり）。
  const dmSelfOff = !!me?.dm_disabled;
  const dmOtherOff = !!other?.dmDisabled;
  const dmBlocked = dmSelfOff || dmOtherOff;

  return (
    <div className="py-3">
      {/* 戻る */}
      <Link
        href="/x/messages"
        className="x-rescue-muted inline-flex items-center gap-1 text-sm font-bold text-white/90 drop-shadow-sm mb-2"
      >
        ← メッセージ一覧
      </Link>

      {meLoading || loading ? (
        <XListSkeleton rows={5} variant="row" />
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
      ) : accessible === false ? (
        <div className="x-card rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-6 text-center">
          <p className="text-sm text-[color:var(--x-text-secondary)] leading-relaxed">この会話は見つからないか、表示する権限がありません。</p>
        </div>
      ) : (
        <>
          {/* 相手ヘッダー */}
          {other && (
            <Link
              href={`/x/u/${other.handle}`}
              className="x-card flex items-center gap-3 rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-3 mb-3 hover:brightness-[0.98] transition"
            >
              <span className="relative w-10 h-10 rounded-full overflow-hidden border border-[color:var(--x-border)] bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
                {other.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={other.avatarUrl} alt={other.displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold text-sm">{other.displayName.charAt(0) || '?'}</span>
                )}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-bold text-sm text-[color:var(--x-text-primary)] truncate">{other.displayName || '（不明なユーザー）'}</span>
                  {(other.kind === 'official' || ((other.kind === 'shop' || other.kind === 'therapist') && other.isVerified)) && <VerifiedBadge kind={other.kind} />}
                </div>
                <p className="text-xs text-[color:var(--x-text-muted)] truncate">@{other.handle}</p>
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
                          : 'bg-[color:var(--x-surface)] border border-[color:var(--x-border)] text-[color:var(--x-text-primary)] rounded-bl-sm'
                      }`}
                      style={m.mine ? { background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' } : undefined}
                    >
                      {m.body}
                    </div>
                    <XTimeAgo iso={m.createdAt} className="x-rescue-muted text-[10px] text-white/70 mt-0.5 px-1 drop-shadow-sm" />
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* 送信フォーム（DM受付オフのときは案内カードに差し替え。過去メッセージの閲覧は上のとおり可能）。 */}
          {dmBlocked ? (
            <div className="x-card rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-4 text-center">
              {dmOtherOff ? (
                <p className="text-sm text-[color:var(--x-text-secondary)] leading-relaxed">このアカウントはメッセージを受け付けていません。</p>
              ) : (
                <p className="text-sm text-[color:var(--x-text-secondary)] leading-relaxed">
                  DM受付をオフにしているため送信できません。
                  <Link href="/x/settings" className="text-[color:var(--x-accent)] font-bold underline underline-offset-2">
                    設定
                  </Link>
                  から変更できます。
                </p>
              )}
            </div>
          ) : (
            <div className="x-card rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-2">
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
                  className="flex-1 px-3 py-2.5 rounded-xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] text-base focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
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
          )}
        </>
      )}
    </div>
  );
}
