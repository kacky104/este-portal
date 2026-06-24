'use client';

import { useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { getCouponColor } from '@/app/lib/couponColors';
import type { MemberVipLetter, VipLetterCoupon } from '@/app/lib/vipLetters';

// 受信日時表示（JST・"6月20日 19:12"）。
function formatAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}
function formatExpiry(d: string): string {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
}

// 同梱クーポン券（公開クーポンページ /salon/[id]/coupon と同じ見た目）。
function CouponCard({ coupon, title }: { coupon: VipLetterCoupon; title: string }) {
  const cc = getCouponColor(coupon.color);
  return (
    <div className="rounded-[20px] bg-white shadow-md overflow-hidden flex flex-col border border-slate-100">
      <div
        className="relative flex items-center px-5 min-h-[64px] py-3"
        style={{ background: `linear-gradient(135deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.36) 100%), ${cc.background}` }}
      >
        <h3 className="font-bold text-white text-base break-words pr-20" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
          {title}
        </h3>
        <div
          className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-2 border-dashed flex flex-col items-center justify-center text-white text-center leading-none"
          style={{ borderColor: 'rgba(255,255,255,0.85)', textShadow: '0 1px 2px rgba(0,0,0,0.45)' }}
        >
          <span className="text-[9px] font-bold">フクエス</span>
          <span className="text-[9px] font-bold mt-0.5">を見た！</span>
        </div>
      </div>
      <div className="p-5 flex flex-col gap-2">
        <p className="text-2xl font-extrabold leading-tight break-words" style={{ color: cc.accent }}>{coupon.discount}</p>
        {coupon.terms && (
          <p className="text-sm text-slate-500 leading-relaxed break-words whitespace-pre-wrap">{coupon.terms}</p>
        )}
        {coupon.expiresAt && (
          <p className="text-xs text-slate-400">有効期限：{formatExpiry(coupon.expiresAt)}まで</p>
        )}
        <div className="mt-1 border-t border-dashed border-slate-200" />
        <p className="text-xs text-slate-500 leading-relaxed">
          ご利用の際は
          <span className="font-bold" style={{ color: cc.accent }}>『フクエスを見た！』</span>
          とお伝えください
        </p>
      </div>
    </div>
  );
}

export function VipLetterList({ letters }: { letters: MemberVipLetter[] }) {
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
                  {l.coupon && <CouponCard coupon={l.coupon} title={l.title} />}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
