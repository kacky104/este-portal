'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { changeMyAutoXHandle } from '@/app/actions/xProfile';

// ★ 第1596便（2026-10-21・カッキーさん）: 自動で付けた ID（fx_ で始まる）のときだけ出す「IDを1回だけ変更」。
//   /cast のワンタップ開設（第1595便）で付いた ID を、好きな ID に1回だけ変えられる。
const HANDLE_RE = /^[A-Za-z0-9_]{3,20}$/;

export function AutoHandleChange({ handle }: { handle: string }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [doneHandle, setDoneHandle] = useState<string | null>(null);

  const v = value.trim().replace(/^@/, '');
  const formatOk = HANDLE_RE.test(v) && !/^fx_/i.test(v);
  const hint = !v ? '英数字と _ の3〜20文字' : !HANDLE_RE.test(v) ? '英数字と _ の3〜20文字で入力してください' : /^fx_/i.test(v) ? '「fx_」で始まるIDは使えません' : `@${v} に変更します`;

  const submit = async () => {
    if (!formatOk || busy) return;
    setBusy(true);
    setErr('');
    let res: Awaited<ReturnType<typeof changeMyAutoXHandle>>;
    try {
      res = await changeMyAutoXHandle(v);
    } catch {
      setBusy(false);
      setErr('通信できませんでした。電波のよい場所で、もう一度押してください。');
      return;
    }
    setBusy(false);
    if (!res.ok) { setErr(res.error); setConfirming(false); return; }
    setDoneHandle(res.handle);
    router.refresh();
  };

  if (doneHandle) {
    return (
      <div>
        <p className="text-[11px] font-bold text-[color:var(--x-text-muted)]">ID（@ユーザー名）</p>
        <p className="text-sm text-[color:var(--x-text-secondary)] break-all mt-0.5">@{doneHandle}</p>
        <p className="text-[10px] text-emerald-600 font-bold mt-0.5">IDを変更しました（これ以上は変更できません）</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] font-bold text-[color:var(--x-text-muted)]">ID（@ユーザー名）</p>
      <p className="text-sm text-[color:var(--x-text-secondary)] break-all mt-0.5">@{handle}</p>
      <p className="text-[10px] text-[color:var(--x-text-muted)] mt-0.5">自動で付いたIDです。<span className="font-bold text-indigo-600">1回だけ</span>好きなIDに変更できます。</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-sm text-[color:var(--x-text-muted)]">@</span>
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value); setConfirming(false); setErr(''); }}
          placeholder="new_id"
          inputMode="text"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={21}
          className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-[color:var(--x-border-strong)] text-base text-[color:var(--x-text-primary)] bg-[color:var(--x-inset)] focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
        />
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} disabled={!formatOk}
            className="flex-shrink-0 px-3 py-2 rounded-xl border border-indigo-300 text-indigo-600 text-xs font-bold disabled:opacity-40">
            変更する
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={busy}
            className="flex-shrink-0 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:opacity-60">
            {busy ? '変更中...' : 'これで決定'}
          </button>
        )}
      </div>
      <p className={`text-[11px] mt-1 ${formatOk ? 'text-[color:var(--x-text-muted)]' : v ? 'text-rose-500' : 'text-[color:var(--x-text-muted)]'}`}>
        {confirming ? `@${v} にします。変更は1回だけで、あとから戻せません。よければ「これで決定」を押してください。` : hint}
      </p>
      {err && <p className="text-[11px] mt-1 font-bold text-rose-600">{err}</p>}
    </div>
  );
}
