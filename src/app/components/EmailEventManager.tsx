'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import {
  emailEventLabel,
  emailEventSeverity,
  bounceTypeLabel,
  bounceSubTypeLabel,
} from '@/app/lib/email/eventTypes';

// /admin「メール配信トラブル」一覧（email_events）。
// Resend の Webhook（/api/webhooks/resend）が記録した bounced / complained /
// delivery_delayed / failed を、未対応を先頭にして並べる。
//
// ★ この一覧に行が出る＝【そのメールは相手に届いていない】。
//   予約通知が届いていない店があると、ネット予約をそのまま取りこぼす。
//   だから「店舗管理」タブの最上部に置いてある（2026-08-16 オーナー判断）。
//
// ★ アコーディオンが閉じていても、タブが非表示でもマウントされている
//   （AccordionSection は閉時 display:none にするだけで unmount しない）。
//   だから /admin を開いた瞬間に未対応件数が分かり、タブのチップにバッジが出る。
//   ここを「開いたときだけ読む」に変えるとバッジが出なくなる（禁則78 と同じ）。
type EmailEvent = {
  id: string;
  event_type: string;
  email_id: string | null;
  from_email: string | null;
  to_emails: string[] | null;
  subject: string | null;
  bounce_type: string | null;
  bounce_sub_type: string | null;
  bounce_message: string | null;
  salon_id: number | null;
  salon_name: string | null;
  occurred_at: string;
  resolved: boolean;
};

function formatDateTimeJST(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

// 直近200件だけ読む。ページングは未実装（ネット予約一覧と同じ扱い）。
const LIMIT = 200;

export default function EmailEventManager({
  onToast,
  onOpenCount,
}: {
  onToast: (msg: string) => void;
  /** 未対応件数を親（/admin）へ通知する。タブのチップとアコーディオン見出しのバッジに使う。 */
  onOpenCount?: (n: number) => void;
}) {
  const supabase = createClient();
  const [events, setEvents] = useState<EmailEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('email_events')
      .select('id, event_type, email_id, from_email, to_emails, subject, bounce_type, bounce_sub_type, bounce_message, salon_id, salon_name, occurred_at, resolved')
      .order('occurred_at', { ascending: false })
      .limit(LIMIT);
    if (error) {
      setErrorMsg('email_events テーブルの読み込みに失敗しました。マイグレーションを適用したか確認してください。');
      setLoading(false);
      return;
    }
    setErrorMsg('');
    setEvents((data ?? []) as EmailEvent[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchList(); }, [fetchList]);

  useEffect(() => {
    onOpenCount?.(events.filter((e) => !e.resolved).length);
  }, [events, onOpenCount]);

  const toggleResolved = async (e: EmailEvent) => {
    const next = !e.resolved;
    setBusyId(e.id);
    const { error } = await supabase
      .from('email_events')
      .update({ resolved: next, resolved_at: next ? new Date().toISOString() : null })
      .eq('id', e.id);
    setBusyId(null);
    if (error) { onToast(`更新に失敗しました: ${error.message}`); return; }
    setEvents(prev => prev.map(x => (x.id === e.id ? { ...x, resolved: next } : x)));
  };

  const deleteEvent = async (e: EmailEvent) => {
    if (!window.confirm('この記録を削除しますか？\nこの操作は取り消せません。')) return;
    setBusyId(e.id);
    const { data: deleted, error } = await supabase.from('email_events').delete().eq('id', e.id).select('id');
    setBusyId(null);
    if (error || !deleted || deleted.length === 0) {
      onToast(error ? `削除に失敗しました: ${error.message}` : '削除できませんでした（権限エラーの可能性があります）');
      return;
    }
    setEvents(prev => prev.filter(x => x.id !== e.id));
    onToast('記録を削除しました');
  };

  // 未対応を先頭に（同状態内は取得順＝新しい順のまま）。
  const sorted = [...events].sort((a, b) => (a.resolved === b.resolved ? 0 : a.resolved ? 1 : -1));

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
        フクエスから送ったメールのうち、<strong className="text-slate-500">相手に届かなかったもの</strong>の一覧です（Resend からの通知を自動記録）。
        店舗名が出ているものは、その店の<strong className="text-slate-500">予約通知が届いていません</strong>。
        店舗編集の「予約通知メール」を直し、ネット予約設定の「テスト送信」で疎通を確認してから「対応済み」にしてください。
        {events.length >= LIMIT && <>（表示は直近{LIMIT}件までです）</>}
      </p>

      {loading ? (
        <p className="text-xs text-slate-400 text-center py-6">読み込み中...</p>
      ) : errorMsg ? (
        <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-xs text-rose-500 leading-relaxed">⚠ {errorMsg}</div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-8 text-center text-xs text-slate-400">
          届かなかったメールはありません。
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(e => {
            const severity = emailEventSeverity(e.event_type);
            return (
              <div
                key={e.id}
                className={`rounded-xl border p-3 ${
                  e.resolved ? 'border-slate-100' : severity === 'bad' ? 'border-rose-200 bg-rose-50/40' : 'border-amber-200 bg-amber-50/40'
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[11px] text-slate-400">{formatDateTimeJST(e.occurred_at)}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      severity === 'bad'
                        ? 'bg-rose-100 text-rose-700 border-rose-200'
                        : 'bg-amber-100 text-amber-700 border-amber-200'
                    }`}
                  >
                    {emailEventLabel(e.event_type)}
                  </span>
                  {e.resolved ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">対応済み</span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">未対応</span>
                  )}
                  <button
                    onClick={() => toggleResolved(e)}
                    disabled={busyId === e.id}
                    className="ml-auto flex-shrink-0 text-[11px] font-bold text-slate-400 hover:text-pink-600 disabled:opacity-40 transition-colors"
                  >
                    {busyId === e.id ? '更新中…' : e.resolved ? '未対応に戻す' : '対応済みにする'}
                  </button>
                  <button
                    onClick={() => deleteEvent(e)}
                    disabled={busyId === e.id}
                    className="flex-shrink-0 text-[11px] font-bold text-rose-400 hover:text-rose-500 disabled:opacity-40 transition-colors"
                  >
                    削除
                  </button>
                </div>

                {/* 店が特定できたものは最初に出す。運営が最初に知りたいのは「どの店か」なので。 */}
                {e.salon_name && (
                  <p className="text-xs font-bold text-rose-600">
                    {e.salon_name}
                    {e.salon_id != null && <span className="ml-1 font-mono text-[10px] text-slate-400">ID {e.salon_id}</span>}
                    <span className="ml-2 font-bold text-[11px]">← この店の予約通知が届いていません</span>
                  </p>
                )}

                <p className="text-[11px] text-slate-500 mt-1 break-all">
                  宛先: {(e.to_emails ?? []).join(', ') || '(不明)'}
                  {e.from_email && <>／送信元: {e.from_email}</>}
                </p>
                {e.subject && <p className="text-[11px] text-slate-500 mt-0.5 break-words">件名: {e.subject}</p>}
                {e.bounce_type && (
                  <p className="text-[11px] text-slate-500 mt-0.5">種類: {bounceTypeLabel(e.bounce_type)}</p>
                )}
                {e.bounce_sub_type && (
                  <p className="text-[11px] text-slate-500 mt-0.5">詳細: {bounceSubTypeLabel(e.bounce_sub_type)}</p>
                )}
                {e.bounce_message && (
                  <p className="text-[10px] text-slate-400 mt-0.5 whitespace-pre-wrap break-words font-mono">{e.bounce_message}</p>
                )}
                {e.email_id && (
                  <p className="text-[10px] text-slate-300 mt-0.5 font-mono break-all">Resend ID: {e.email_id}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
