'use client';

// fukuX 開設のご案内の「開設を依頼する」ボタン（第1751便・2026-11-06・カッキーさん）。
// ★ 第1665便までは /mypage?tab=support へ飛ぶだけで、店舗様が自分で本文を書いて送る必要があった。
//   コネクト様が押しても「何も起きない」ように見え、運営にもメールが届かなかった。
// ★ ここで押した瞬間に、お問い合わせ（submitOwnerInquiry）として運営へ送る＝運営にメール・/admin「オーナー連絡」にも残る。
//   送れたら「運営に連絡しました」をこの場に出す（ページは動かさない）。二度押しは止める。

import { useState } from 'react';
import { submitOwnerInquiry } from '@/app/actions/ownerInquiry';

export function FukuxRequestButton() {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const onClick = async () => {
    if (state === 'sending' || state === 'done') return;
    setState('sending');
    setError('');
    const res = await submitOwnerInquiry({
      subject: '【fukuX】開設の依頼',
      body: [
        'fukuX（フクエックス）の店舗アカウントの開設をお願いします。',
        '',
        '（マイページ「fukuX 開設のご案内」の「開設を依頼する」から送信）',
      ].join('\n'),
    }).catch(() => ({ ok: false, error: '送信に失敗しました。時間をおいてお試しください' }));
    if (!res.ok) { setState('error'); setError(res.error ?? '送信に失敗しました'); return; }
    setState('done');
  };

  if (state === 'done') {
    return (
      <div className="flex-1 text-center py-5 bg-violet-50 border-2 border-[#6d45c4] text-[#5b34ad] text-[17px] font-black">
        運営に連絡しました。ID・パスワードをお渡しするまでお待ちください。
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={state === 'sending'}
        className="w-full text-center py-5 bg-gradient-to-r from-[#5b34ad] to-[#7c4ddb] text-white text-[19px] font-black tracking-wide shadow-lg hover:opacity-95 disabled:opacity-60"
      >
        {state === 'sending' ? '送信しています…' : '開設を依頼する →'}
      </button>
      {state === 'error' && <p className="text-center text-[13px] font-bold text-rose-600">{error}</p>}
    </div>
  );
}
