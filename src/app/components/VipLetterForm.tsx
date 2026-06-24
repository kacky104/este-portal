'use client';

import { useEffect, useState } from 'react';
import { COUPON_COLORS, getCouponColor, DEFAULT_COUPON_COLOR_KEY, type CouponColorKey } from '@/app/lib/couponColors';
import { sendVipLetter, getSavedSalonMemberCount } from '@/app/actions/vipLetters';

// /mypage のVIPレタータブ。クーポン新規追加フォームのデザインに揃える。
// 送信は Server Action（service_role）で実行。クライアントから直接 insert はしない。
const inputClass = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200';
const textareaClass = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200 resize-none';
const labelClass = 'text-[11px] font-bold text-slate-400 block mb-1';
const saveBtn = 'px-5 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm disabled:opacity-50';

export function VipLetterForm({ salonId }: { salonId: number }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [couponEnabled, setCouponEnabled] = useState(false);
  const [couponDiscount, setCouponDiscount] = useState('');
  const [couponTerms, setCouponTerms] = useState('');
  const [couponExpiresAt, setCouponExpiresAt] = useState('');
  const [couponColor, setCouponColor] = useState<CouponColorKey>(DEFAULT_COUPON_COLOR_KEY);

  const [count, setCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sentMsg, setSentMsg] = useState('');

  // 送信対象人数（保存している会員数）を取得（owner検証つきサーバーアクション）。
  useEffect(() => {
    let active = true;
    (async () => {
      const res = await getSavedSalonMemberCount(salonId);
      if (!active) return;
      if ('count' in res) setCount(res.count);
    })();
    return () => { active = false; };
  }, [salonId]);

  const handleSend = async () => {
    if (!title.trim() || !body.trim() || sending) return;
    if (count === 0) return;
    setSending(true);
    setError('');
    setSentMsg('');
    const res = await sendVipLetter({
      salonId,
      title,
      body,
      couponEnabled,
      couponDiscount,
      couponTerms,
      couponExpiresAt,
      couponColor,
    });
    setSending(false);
    if (res.ok) {
      setSentMsg(`VIPレターを送信しました（${res.recipientCount}人に配信）`);
      setTitle('');
      setBody('');
      setCouponEnabled(false);
      setCouponDiscount('');
      setCouponTerms('');
      setCouponExpiresAt('');
      setCouponColor(DEFAULT_COUPON_COLOR_KEY);
    } else {
      setError(res.error);
    }
  };

  const canSend = title.trim() !== '' && body.trim() !== '' && count !== 0 && !sending;

  return (
    <div className="bg-white rounded-3xl border border-pink-100 shadow-sm p-5 space-y-3">
      <h3 className="text-xs font-black text-pink-600">VIPレターを新規送信</h3>
      <p className="text-[10px] text-slate-400 leading-relaxed">
        このお店を保存している会員にだけ届く特別なメッセージです。任意で特別クーポンを同梱できます。
      </p>

      {/* 対象人数 */}
      <div className="rounded-xl bg-pink-50/60 border border-pink-100 px-3 py-2 text-[11px] text-slate-600">
        {count === null
          ? '対象人数を確認中…'
          : count === 0
            ? 'このお店を保存している会員はまだいません（送信できません）'
            : <>このお店を保存している会員 <span className="font-bold text-pink-600">{count}人</span> に届きます。</>}
        <span className="block text-[10px] text-slate-400 mt-0.5">※送信は取り消せません。</span>
      </div>

      <div>
        <label className={labelClass}>タイトル <span className="text-rose-400">*</span></label>
        <input
          className={inputClass}
          placeholder="例: 【常連様限定】特別なご案内"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div>
        <label className={labelClass}>本文 <span className="text-rose-400">*</span></label>
        <textarea
          rows={5}
          className={textareaClass}
          placeholder="会員様へのメッセージを入力してください。"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      {/* クーポン同梱トグル */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          className="w-4 h-4 accent-pink-500 flex-shrink-0"
          checked={couponEnabled}
          onChange={(e) => setCouponEnabled(e.target.checked)}
        />
        <span className="text-xs font-bold text-slate-600">特別クーポンを付ける</span>
      </label>

      {couponEnabled && (
        <div className="space-y-3 rounded-2xl border border-pink-100 bg-pink-50/30 p-4">
          <div>
            <label className={labelClass}>割引内容 <span className="text-rose-400">*</span></label>
            <input
              className={inputClass}
              placeholder="例: ¥1,000 OFF"
              value={couponDiscount}
              onChange={(e) => setCouponDiscount(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>利用条件</label>
            <textarea
              rows={2}
              className={textareaClass}
              placeholder="例: 60分以上のコースをご利用の方限定。他クーポンとの併用不可。"
              value={couponTerms}
              onChange={(e) => setCouponTerms(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>有効期限</label>
            <input
              type="date"
              className={inputClass}
              value={couponExpiresAt}
              onChange={(e) => setCouponExpiresAt(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>背景色</label>
            <div className="flex flex-wrap gap-2">
              {COUPON_COLORS.map((cc) => {
                const selected = couponColor === cc.key;
                return (
                  <button
                    key={cc.key}
                    type="button"
                    onClick={() => setCouponColor(cc.key)}
                    aria-label={cc.label}
                    title={cc.label}
                    className={`relative w-10 h-10 rounded-xl border-2 transition-transform ${
                      selected ? 'border-pink-500 ring-2 ring-pink-200 scale-105' : 'border-slate-200 hover:border-pink-300'
                    }`}
                    style={{ background: cc.background }}
                  >
                    {selected && (
                      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color: cc.text }}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">選択中：{getCouponColor(couponColor).label}</p>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>
      )}
      {sentMsg && (
        <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">{sentMsg}</p>
      )}

      <div className="flex flex-col items-end gap-1.5">
        <button className={saveBtn} onClick={handleSend} disabled={!canSend}>
          {sending ? '送信中...' : 'VIPレターを送信'}
        </button>
        <p className="text-[11px] text-slate-400">※送信後は取り消せません。送信時点の保存会員に配信されます。</p>
      </div>
    </div>
  );
}
