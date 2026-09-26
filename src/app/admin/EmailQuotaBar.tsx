'use client';

import { useEffect, useState } from 'react';
import { getEmailSendToday } from '@/app/actions/emailQuota';
import { EMAIL_DAILY_LIMIT, EMAIL_DAILY_WARN } from '@/app/lib/email/sendQuota';

// ★ 第898便（カッキーさん）: 管理画面の上に「今日のメール送信 N/100通」。★ 80通を超えたら赤で「PRO プランへ」。

export function EmailQuotaBar() {
  const [sent, setSent] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void getEmailSendToday().then((r) => { if (alive && r.ok) setSent(r.sent); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (sent == null) return null;
  const over = sent >= EMAIL_DAILY_WARN;
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${over ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-slate-200 bg-white text-slate-600'}`}>
      <span className="font-bold">今日のメール送信（Resend）：</span>
      <span className="tabular-nums font-black">{sent}</span> / {EMAIL_DAILY_LIMIT}通
      {over
        ? <span className="block mt-1 font-bold">{EMAIL_DAILY_WARN}通を超えました。無料プランは1日{EMAIL_DAILY_LIMIT}通までです。Resend を PRO プランに上げてください。</span>
        : <span className="ml-2 text-xs text-slate-400">（無料プランの上限。{EMAIL_DAILY_WARN}通を超えたら運営へメールでお知らせします）</span>}
    </div>
  );
}
