'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { submitOwnerInquiry } from '@/app/actions/ownerInquiry';

const supabase = createClient();

// /mypage「運営から」タブ。
//  - 上段: 運営からのお知らせ一覧（owner_notices・一斉＋自店舗個別を RLS が絞る）
//  - 下段: 運営へのお問い合わせフォーム（Server Action submitOwnerInquiry）＋送信履歴
// 未読管理: owner_notice_reads に既読行が無いお知らせを未読とし、件数を onUnreadChange で
// 親（page.tsx のタブバッジ）へ通知。タブが開かれたら（active=true）未読ぶんを一括既読化する。
// パネルは page.tsx の hidden 切替方式で常時マウントされるため、読み込みは mount 時に1回行う。

type OwnerNotice = {
  id: string;
  salon_id: number | null; // null = 全店舗一斉
  title: string;
  body: string;
  created_at: string;
};

type OwnerInquiry = {
  id: string;
  subject: string;
  body: string;
  status: 'open' | 'done';
  created_at: string;
};

function formatDateJST(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric',
  }).format(d);
}

export function SupportTab({
  salonId,
  active,
  onUnreadChange,
  onToast,
}: {
  salonId: number | null;
  active: boolean;
  onUnreadChange: (count: number) => void;
  onToast: (msg: string) => void;
}) {
  const [notices, setNotices] = useState<OwnerNotice[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [noticesLoading, setNoticesLoading] = useState(true);
  const [inquiries, setInquiries] = useState<OwnerInquiry[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  // 既読化の多重実行防止（active の再切替やレンダー中の連続呼び出し対策）。
  const markingRef = useRef(false);

  // 初回読み込み（salonId 確定後に1回）。
  // お知らせは配信から6ヶ月以内のみ表示（古いものは自動非表示＝溜まり続けない）。
  // 未読バッジもこの取得結果ベースなので、6ヶ月超の未読が残ってもバッジには数えられない。
  useEffect(() => {
    if (salonId == null) return;
    (async () => {
      setNoticesLoading(true);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const [{ data: noticeData }, { data: readData }, { data: inquiryData }] = await Promise.all([
        supabase
          .from('owner_notices')
          .select('id, salon_id, title, body, created_at')
          .gte('created_at', sixMonthsAgo.toISOString())
          .order('created_at', { ascending: false }),
        supabase
          .from('owner_notice_reads')
          .select('notice_id')
          .eq('salon_id', salonId),
        supabase
          .from('owner_inquiries')
          .select('id, subject, body, status, created_at')
          .eq('salon_id', salonId)
          .order('created_at', { ascending: false }),
      ]);
      setNotices((noticeData ?? []) as OwnerNotice[]);
      setReadIds(new Set((readData ?? []).map(r => String(r.notice_id))));
      setInquiries((inquiryData ?? []) as OwnerInquiry[]);
      setNoticesLoading(false);
    })();
  }, [salonId]);

  // 未読件数を親（タブバッジ）へ通知。
  const unreadIds = notices.filter(n => !readIds.has(n.id)).map(n => n.id);
  useEffect(() => {
    onUnreadChange(unreadIds.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadIds.length]);

  // タブが開かれたら未読を一括既読化。
  // ignoreDuplicates:true ＝ ON CONFLICT DO NOTHING。オーナーには UPDATE ポリシーが無いため、
  // DO UPDATE になる通常の upsert は既存行との競合時に RLS で失敗する（INSERT のみで完結させる）。
  useEffect(() => {
    if (!active || salonId == null || unreadIds.length === 0 || markingRef.current) return;
    markingRef.current = true;
    (async () => {
      const { error } = await supabase
        .from('owner_notice_reads')
        .upsert(unreadIds.map(id => ({ notice_id: id, salon_id: salonId })), { onConflict: 'notice_id,salon_id', ignoreDuplicates: true });
      if (!error) setReadIds(prev => new Set([...prev, ...unreadIds]));
      markingRef.current = false;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, salonId, unreadIds.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendError('');
    setSending(true);
    try {
      const res = await submitOwnerInquiry({ subject, body });
      if (!res.ok) {
        setSendError(res.error ?? '送信に失敗しました');
        return;
      }
      onToast('お問い合わせを送信しました');
      setSubject('');
      setBody('');
      // 履歴を再取得（IDや created_at をサーバー値で揃える）。
      if (salonId != null) {
        const { data } = await supabase
          .from('owner_inquiries')
          .select('id, subject, body, status, created_at')
          .eq('salon_id', salonId)
          .order('created_at', { ascending: false });
        setInquiries((data ?? []) as OwnerInquiry[]);
      }
    } finally {
      setSending(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100';

  return (
    <div className="space-y-6">
      {/* ── 運営からのお知らせ ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-black text-slate-700">運営からのお知らせ</h2>
        <p className="text-[11px] text-slate-400">※ お知らせは配信から6ヶ月間表示されます。それより古いものは自動的に非表示になります。</p>
        {noticesLoading ? (
          <p className="text-xs text-slate-400">読み込み中…</p>
        ) : notices.length === 0 ? (
          <p className="text-xs text-slate-400">現在お知らせはありません。</p>
        ) : (
          <div className="space-y-3">
            {notices.map(n => (
              <div key={n.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400">{formatDateJST(n.created_at)}</span>
                  {n.salon_id != null && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-200">
                      あなたの店舗宛
                    </span>
                  )}
                  {!readIds.has(n.id) && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-500 text-white">
                      NEW
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">{n.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap break-words">{n.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 運営へのお問い合わせ ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-black text-slate-700">運営へのお問い合わせ</h2>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          掲載内容の変更依頼・不具合のご報告・その他のご相談はこちらから送信してください。
          返信が必要な内容は、ご登録のログインメールアドレス宛にご連絡します。
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[11px] font-bold text-slate-400 block mb-1">
              件名 <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              maxLength={100}
              required
              placeholder="例：店舗情報の変更について"
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 block mb-1">
              お問い合わせ内容 <span className="text-rose-400">*</span>
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              maxLength={4000}
              required
              rows={5}
              placeholder="お問い合わせの内容をご記入ください"
              className={inputClass}
            />
          </div>
          {sendError && <p className="text-xs text-rose-500">{sendError}</p>}
          <button
            type="submit"
            disabled={sending || subject.trim() === '' || body.trim() === ''}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-pink-500/20"
          >
            {sending ? '送信中…' : '送信する'}
          </button>
        </form>

        {/* 送信履歴 */}
        {inquiries.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-500 mb-2">送信履歴</h3>
            <div className="space-y-2">
              {inquiries.map(q => (
                <div key={q.id} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[11px] text-slate-400">{formatDateJST(q.created_at)}</span>
                    {q.status === 'done' ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">対応済み</span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">受付済み</span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-700">{q.subject}</p>
                  <p className="text-[11px] text-slate-500 whitespace-pre-wrap break-words mt-0.5 line-clamp-3">{q.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
