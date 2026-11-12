'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';

// ★ 第1974便: コネックエフ用に作った確認の窓（第1961便・ConecfConfirm.tsx）を、フクエスCRM でも使うので共通の置き場へ移した。
//   名前は appConfirm / appPrompt / AppConfirmHost。コネックエフ側は conecf/ConecfConfirm.tsx が同じものを前の名前で出している（1つの部品・1つの状態）。
//   本体（AppConfirmHost）を置く所: コネックエフの layout.tsx・フクエスCRM の layout.tsx。
// ★ 第1961便（総点検 B-6・カッキーさん）: コネックエフの「確認の窓」を1つの見た目にそろえる。
//   ・今まではブラウザ標準の window.confirm（11画面・16か所）と window.prompt（動画の名前・1か所）。
//     ブラウザごとに見た目が違い、「conecf.com の内容」と出る。
//   ・使い方は window.confirm とほぼ同じ:  if (!(await appConfirm('…しますか？'))) return;
//     ボタンの文字を変えるとき:  appConfirm('…', { ok: '削除する', danger: true })
//   ・窓の本体（AppConfirmHost）は layout.tsx に1つだけ置く。
//   ★ 置いていない画面（マイページ側から同じ部品を使うとき）は、今までどおりブラウザ標準の窓で聞く。
//   ・Esc・外側を押す・「やめる」＝いいえ。Enter は、ふつうの確認では「はい」、消す系（danger）では「やめる」に当たる。

type Ask = {
  id: number;
  kind: 'confirm' | 'prompt';
  message: string;
  ok: string;
  cancel: string;
  danger: boolean;
  initial: string;
  resolve: (v: boolean | string | null) => void;
};

let current: Ask | null = null;
let hosts = 0;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => { listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSnapshot = () => current;
const getServerSnapshot = () => null;

function open(a: Omit<Ask, 'id'>) {
  // 前の窓が開いたままなら「いいえ」で閉じる（2つ同時には出さない）
  if (current) current.resolve(current.kind === 'confirm' ? false : null);
  seq += 1;
  current = { ...a, id: seq };
  emit();
}
function close(v: boolean | string | null) {
  const a = current;
  if (!a) return;
  current = null;
  emit();
  a.resolve(v);
}

export type AppConfirmOptions = { ok?: string; cancel?: string; danger?: boolean };

/** 確認の窓。「はい」で true・それ以外は false。 */
export function appConfirm(message: string, opts: AppConfirmOptions = {}): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (hosts === 0) return Promise.resolve(window.confirm(message));
  return new Promise<boolean>((resolve) => {
    open({
      kind: 'confirm', message, initial: '',
      ok: opts.ok ?? 'はい', cancel: opts.cancel ?? 'やめる', danger: opts.danger === true,
      resolve: (v) => resolve(v === true),
    });
  });
}

/** 1行だけ入力してもらう窓。「決定」で入力した文字・それ以外は null。 */
export function appPrompt(message: string, initial = '', opts: AppConfirmOptions = {}): Promise<string | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (hosts === 0) return Promise.resolve(window.prompt(message, initial));
  return new Promise<string | null>((resolve) => {
    open({
      kind: 'prompt', message, initial,
      ok: opts.ok ?? '決定', cancel: opts.cancel ?? 'やめる', danger: false,
      resolve: (v) => resolve(typeof v === 'string' ? v : null),
    });
  });
}

export function AppConfirmHost() {
  const ask = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const okRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    hosts += 1;
    return () => {
      hosts -= 1;
      if (hosts === 0 && current) close(current.kind === 'confirm' ? false : null);
    };
  }, []);

  const id = ask?.id ?? 0;
  useEffect(() => {
    if (!id) return;
    const a = current;
    if (!a) return;
    if (a.kind === 'prompt') { inputRef.current?.focus(); inputRef.current?.select(); }
    else if (a.danger) cancelRef.current?.focus();
    else okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(a.kind === 'confirm' ? false : null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  if (!ask) return null;
  const no = () => close(ask.kind === 'confirm' ? false : null);
  const yes = () => close(ask.kind === 'confirm' ? true : (inputRef.current?.value ?? ''));

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="alertdialog" aria-modal="true" aria-labelledby="app-confirm-message">
      <div className="absolute inset-0 bg-black/40" onClick={no} aria-hidden />
      <form
        onSubmit={(e) => { e.preventDefault(); yes(); }}
        className="relative w-full bg-white p-5 shadow-2xl sm:w-[440px] sm:rounded-lg space-y-4 [padding-bottom:calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5"
      >
        <p id="app-confirm-message" className="whitespace-pre-line text-[15px] leading-relaxed text-slate-800">{ask.message}</p>
        {ask.kind === 'prompt' && (
          <input
            key={ask.id}
            ref={inputRef}
            type="text"
            defaultValue={ask.initial}
            className="h-10 w-full rounded border border-slate-300 px-3 text-[16px] outline-none focus:border-indigo-500"
          />
        )}
        <div className="flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={no} className="h-10 min-w-[96px] rounded bg-black/[0.07] px-4 text-[14px] text-slate-700 hover:bg-black/[0.11]">{ask.cancel}</button>
          <button
            ref={okRef}
            type="submit"
            className={`h-10 min-w-[96px] rounded px-5 text-[14px] font-bold text-white ${ask.danger ? 'bg-[#c62828] hover:bg-[#b71c1c]' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >{ask.ok}</button>
        </div>
      </form>
    </div>
  );
}
