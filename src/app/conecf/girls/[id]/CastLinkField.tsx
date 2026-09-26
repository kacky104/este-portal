'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  getCastLinkStatus, inviteCast, resendCastInvite, cancelCastInvite, unlinkCast,
} from '@/app/actions/castInvite';

// ★ 第868便（カッキーさん）: コネックエフのセラピスト編集「基本情報」に /cast 連携用のメールアドレス。
// ★ 中身はマイページのセラピスト一覧の「セラピストアカウントに招待」と同じ（★ 同じ server action を使う）。
//   未招待 → メールを入れて「招待メールを送る」／招待中 → 再送・取り消し・別のメールで招待し直す／本人ログイン済み → 紐付け解除。
// ★ 下の「保存」とは別（★ このボタンを押した時点で招待メールが飛ぶ）。

const INPUT = 'w-full border border-slate-200 bg-white px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-indigo-200 placeholder:text-slate-300';
const BTN = 'h-9 px-4 text-[13px] font-bold border disabled:opacity-50 whitespace-nowrap flex-none';

type Status = { status: 'linked' | 'invited' | 'none'; email: string | null };

// ★ 第871便: note を渡すと下の説明文を差し替える（写メ日記タブでは写メ日記向けの説明）
export function CastLinkField({ therapistId, salonId, onToast, note }: { therapistId: number; salonId: number; onToast: (m: string) => void; note?: ReactNode }) {
  const [st, setSt] = useState<Status | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const tid = String(therapistId);

  const load = useCallback(async () => {
    const res = await getCastLinkStatus({ therapistId: tid, salonId });
    if (!res.ok) { setLoadErr(res.error); return; }
    setLoadErr('');
    setSt({ status: res.status, email: res.email });
  }, [tid, salonId]);

  useEffect(() => { void load(); }, [load]);

  const onInvite = async () => {
    const v = email.trim();
    if (!v) { onToast('メールアドレスを入力してください'); return; }
    setBusy(true);
    const res = await inviteCast({ therapistId: tid, salonId, email: v });
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    setEmail('');
    await load();
    onToast(res.warning ?? '招待メールを送りました（本人がメールのリンクからパスワードを決めると /cast に入れます）');
  };

  const onResend = async () => {
    setBusy(true);
    const res = await resendCastInvite({ therapistId: tid, salonId });
    setBusy(false);
    onToast(res.ok ? (res.warning ?? '招待メールを送り直しました') : res.error);
  };

  const onCancel = async () => {
    if (!st?.email) return;
    if (!window.confirm(`招待を取り消します（${st.email}）。\nよろしいですか？`)) return;
    setBusy(true);
    const res = await cancelCastInvite({ therapistId: tid, salonId });
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    await load();
    onToast(res.warning ?? '招待を取り消しました');
  };

  const onUnlink = async () => {
    if (!window.confirm('このセラピストの本人ログイン（/cast）の連携を解除しますか？\n（アカウント自体は消えません。公開・出勤には影響しません）')) return;
    setBusy(true);
    const res = await unlinkCast({ therapistId: tid, salonId });
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    await load();
    onToast('本人ログインの連携を解除しました');
  };

  if (loadErr) return <p className="pt-2 text-[13px] text-slate-400">{loadErr}</p>;
  if (!st) return <p className="pt-2 text-[13px] text-slate-400">読み込み中…</p>;

  const inviteRow = (placeholder: string, label: string) => (
    <div className="flex items-center gap-2">
      <input type="email" inputMode="email" autoComplete="off" className={INPUT} placeholder={placeholder}
        value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="button" disabled={busy} onClick={() => void onInvite()}
        className={`${BTN} border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700`}>
        {busy ? '送っています…' : label}
      </button>
    </div>
  );

  return (
    <div className="space-y-1.5">
      {st.status === 'linked' && (
        <div className="flex flex-wrap items-center gap-3 pt-1.5">
          <span className="text-[14px] font-bold text-emerald-600">✓ 連携済み</span>
          {st.email && <span className="text-[14px] text-slate-700 break-all">{st.email}</span>}
          <button type="button" disabled={busy} onClick={() => void onUnlink()}
            className={`${BTN} ml-auto border-slate-300 bg-white text-slate-500 hover:border-rose-300 hover:text-rose-600`}>
            {busy ? '処理中…' : '連携を解除'}
          </button>
        </div>
      )}

      {st.status === 'invited' && (
        <>
          <div className="flex flex-wrap items-center gap-2 pt-1.5">
            <span className="text-[14px] font-bold text-amber-600">招待中</span>
            <span className="text-[14px] text-slate-700 break-all">{st.email}</span>
            <span className="text-[12.5px] text-slate-400">（本人のログイン待ち）</span>
            <div className="ml-auto flex gap-2">
              <button type="button" disabled={busy} onClick={() => void onResend()}
                className={`${BTN} border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50`}>
                {busy ? '処理中…' : '招待を再送'}
              </button>
              <button type="button" disabled={busy} onClick={() => void onCancel()}
                className={`${BTN} border-rose-200 bg-white text-rose-600 hover:bg-rose-50`}>
                招待を取り消す
              </button>
            </div>
          </div>
          {inviteRow('別のメールアドレスで招待し直す', '招待し直す')}
        </>
      )}

      {st.status === 'none' && inviteRow('例）sample@example.com', '招待メールを送る')}

      {note ?? (
        <p className="text-[12.5px] text-slate-400 leading-relaxed">
          セラピストページと連携するためのメールアドレスです。「招待メールを送る」を押すと、本人に招待メールが届きます。
          {/* ★ 第874便（カッキーさん）: どのメールを入れるのか */}
          <span className="block font-bold text-slate-500">入力するのは、セラピストさんがふだん使っているメールアドレスです。ご本人に教えてもらって入力し、連携してください。</span>
          <span className="block">※ 下の「保存」とは別です（このボタンだけで送られます）。</span>
        </p>
      )}
    </div>
  );
}
