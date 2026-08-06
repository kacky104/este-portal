'use client';

import { useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';

const sb = createClient();

// 運営(official)アカウントのプロフィールで「メッセージ」を押したときに開くお問い合わせフォーム。
// 通常のDM（スレッドへ遷移）ではなく、この中で完結させる：
//   x_start_conversation(運営) で会話を作り、本文を x_messages に1件 insert するだけ。
//   → 運営側には通常のDMスレッドとして届き、返信したいものだけ fukuX 上で返信できる。
// アカウントIDはログイン中の handle を自動で入れ、編集不可にする（なりすまし防止）。
// ※ 運営宛の会話開始・送信は dm_disabled の影響を受けない（DB側で運営を免除済み）。

const NOTE =
  'いただいたお問い合わせすべてにご返信できるわけではありません。あらかじめご了承ください。ご返信する場合は、fukuXのメッセージ（DM）にお送りします。';

const BODY_MAX = 1000;

// 運営に届く本文の先頭に付ける目印（通常のDMと見分けるため）。
const BODY_PREFIX = '【お問い合わせ】';

export function XOfficialContactModal({
  open,
  onClose,
  officialProfileId,
  myProfileId,
  myHandle,
}: {
  open: boolean;
  onClose: () => void;
  officialProfileId: string; // 送信先＝運営アカウントの x_profiles.id
  myProfileId: string; // ログイン中の自分の x_profiles.id（送信者）
  myHandle: string; // ログイン中の自分の handle（@なし）
}) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const canSubmit = body.trim().length > 0 && !sending;

  // 閉じるときは入力・状態をリセット（次に開いたとき前回の残りが出ないように）。
  const close = () => {
    setBody('');
    setError('');
    setDone(false);
    setSending(false);
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSending(true);
    setError('');

    // 1) 運営との会話を取得（無ければ作成）。運営宛はフォロー不要（DB側で免除）。
    const { data: convId, error: convErr } = await sb.rpc('x_start_conversation', {
      p_other: officialProfileId,
    });
    if (convErr || convId == null) {
      setSending(false);
      setError(convErr?.message ?? '送信できませんでした。時間をおいてお試しください。');
      return;
    }

    // 2) 本文を1件送信。sender_profile_id は RLS 側でも本人チェックされる。
    const { error: msgErr } = await sb.from('x_messages').insert({
      conversation_id: convId,
      sender_profile_id: myProfileId,
      body: `${BODY_PREFIX}\n${body.trim()}`,
    });
    setSending(false);
    if (msgErr) {
      setError(msgErr.message ?? '送信できませんでした。時間をおいてお試しください。');
      return;
    }
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={close} aria-hidden />
      <div className="relative w-full max-w-md rounded-3xl bg-[color:var(--x-surface)] shadow-2xl border border-[color:var(--x-border)] p-6 max-h-[85vh] overflow-y-auto">
        <button
          type="button"
          onClick={close}
          aria-label="閉じる"
          className="absolute top-3 right-3 w-8 h-8 rounded-full text-[color:var(--x-text-muted)] hover:bg-[color:var(--x-inset)] flex items-center justify-center"
        >
          ✕
        </button>

        {done ? (
          // ── 送信完了 ──
          <div className="text-center py-6">
            <p className="text-base font-bold text-[color:var(--x-text-primary)]">
              貴重なご意見、参考にさせていただきます
            </p>
            <p className="text-sm text-[color:var(--x-text-secondary)] mt-3 leading-relaxed">
              お問い合わせを受け付けました。
              <br />
              ご返信する場合は、fukuXのメッセージ（DM）にお送りします。
            </p>
            <button
              type="button"
              onClick={close}
              className="mt-6 text-sm font-bold px-5 py-2 rounded-full text-white"
              style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
            >
              閉じる
            </button>
          </div>
        ) : (
          // ── 入力フォーム ──
          <form onSubmit={submit} className="space-y-4">
            <h2 className="text-base font-black text-[color:var(--x-text-primary)] pr-8">
              運営へのお問い合わせ
            </h2>

            <div>
              <label htmlFor="xoc-handle" className="block text-[11px] font-bold text-[color:var(--x-text-muted)] mb-1.5 px-1">
                アカウントID
              </label>
              {/* ログイン中の handle を自動表示・編集不可（なりすまし防止） */}
              <input
                id="xoc-handle"
                type="text"
                value={`@${myHandle}`}
                readOnly
                aria-readonly
                className="w-full rounded-xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] px-3 py-2.5 text-base text-[color:var(--x-text-secondary)] cursor-not-allowed"
              />
            </div>

            <div>
              <label htmlFor="xoc-body" className="block text-[11px] font-bold text-[color:var(--x-text-muted)] mb-1.5 px-1">
                お問い合わせ内容（必須）
              </label>
              <textarea
                id="xoc-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                maxLength={BODY_MAX}
                placeholder="不具合のご報告・ご要望・ご質問など"
                className="w-full rounded-xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] px-3 py-2.5 text-base text-[color:var(--x-text-primary)] placeholder:text-[color:var(--x-text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              />
              <p className="text-[11px] text-[color:var(--x-text-muted)] text-right mt-1 tabular-nums">
                {body.length}/{BODY_MAX}
              </p>
            </div>

            {/* 注意書き：全件返信ではない旨 */}
            <div className="rounded-xl bg-[color:var(--x-inset)] border border-[color:var(--x-border)] p-3">
              <p className="text-[11px] leading-relaxed text-[color:var(--x-text-secondary)]">{NOTE}</p>
            </div>

            {error && <p className="text-xs font-bold text-rose-400">{error}</p>}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full text-sm font-bold px-4 py-2.5 rounded-full text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
            >
              {sending ? '送信中…' : '送信する'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
