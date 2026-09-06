'use client';

import { useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
// ★ 券の見た目は1か所だけ（公開クーポンページ・/mypage のプレビューと同じ部品）。
//   ★★ ここに写しを持たない（写すと、いつかずれる）。
import { CouponCard } from '@/app/components/CouponCard';
import type { MemberVipLetter } from '@/app/lib/vipLetters';

// 受信日時表示（JST・"6月20日 19:12"）。
function formatAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export function VipLetterList({
  letters,
  error,
}: {
  letters: MemberVipLetter[];
  /** ★ 受信箱を読めなかった理由。★ null なら読めた（第179便） */
  error?: string | null;
}) {
  // 既読状態をローカルでも保持（開いた瞬間に NEW を消すため）。
  const [readSet, setReadSet] = useState<Set<string>>(
    () => new Set(letters.filter(l => l.read).map(l => l.recipientId)),
  );
  const [openId, setOpenId] = useState<string | null>(null);

  const markRead = async (recipientId: string) => {
    if (readSet.has(recipientId)) return;
    setReadSet(prev => new Set(prev).add(recipientId)); // 楽観的に既読化
    try {
      const supabase = createClient();
      await supabase
        .from('vip_letter_recipients')
        .update({ read_at: new Date().toISOString() })
        .eq('id', recipientId); // RLS: 本人のみ update 可
    } catch {
      // 失敗しても表示は妨げない（次回開いたとき再試行される）。
    }
  };

  const toggle = (l: MemberVipLetter) => {
    const next = openId === l.recipientId ? null : l.recipientId;
    setOpenId(next);
    if (next) markRead(l.recipientId); // 開いたら既読
  };

  // ★★ 読めなかったときに「まだありません」と書かない（作法3-3・第179便）。
  //   ★ レターが消えたのではないことも書いておく。
  if (error) {
    return (
      <div className="py-10 px-5 text-center border border-rose-200 bg-rose-50/60 rounded-2xl">
        <p className="text-sm font-bold text-rose-600">VIPレターを読み取れませんでした</p>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          時間をおいてページを開き直してください。<br />
          届いたレターが消えたわけではありません。
        </p>
        <p className="text-[10px] text-slate-400 mt-3 break-words">理由：{error}</p>
      </div>
    );
  }

  if (letters.length === 0) {
    return (
      <p className="text-sm text-slate-400 py-16 text-center border border-dashed border-slate-200 rounded-2xl bg-white/40">
        VIPレターはまだありません
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {letters.map((l) => {
        const isRead = readSet.has(l.recipientId);
        const isOpen = openId === l.recipientId;
        return (
          <li key={l.recipientId}>
            <div
              className={`rounded-2xl border bg-white shadow-sm transition-all ${
                isRead ? 'border-slate-100' : 'border-pink-200 bg-pink-50/40'
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(l)}
                className="w-full text-left p-4 hover:bg-pink-50/30 transition-colors rounded-2xl"
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="flex-shrink-0 text-[10px] font-bold text-white rounded-full px-2 py-0.5" style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)' }}>
                    VIPレター
                  </span>
                  {!isRead && (
                    <span className="flex-shrink-0 text-[10px] font-bold text-pink-600 border border-pink-300 rounded-full px-1.5 py-px">
                      NEW
                    </span>
                  )}
                  {l.coupon && (
                    <span className="flex-shrink-0 text-[10px] font-bold text-pink-600 bg-pink-50 border border-pink-200 rounded-full px-1.5 py-px">
                      クーポン付き
                    </span>
                  )}
                  <span className="text-xs text-slate-400 line-clamp-1">{l.salonName}</span>
                  <span className="ml-auto flex-shrink-0 text-[11px] text-slate-400">{formatAt(l.receivedAt)}</span>
                </div>
                <p className="text-sm font-bold text-slate-700 line-clamp-2">{l.title}</p>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 -mt-1 space-y-4">
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap break-words">{l.body}</p>
                  {l.coupon && (
                    <CouponCard
                      title={l.title}
                      discount={l.coupon.discount}
                      conditions={l.coupon.terms}
                      validUntil={l.coupon.expiresAt}
                      color={l.coupon.color}
                    />
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
