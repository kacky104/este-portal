'use client';

import { useState } from 'react';
import { spendVisitPoints } from '@/app/actions/points';
import { POINT_USE_UNIT, POINT_USE_YEN } from '@/lib/points';
import type { UseView } from '@/app/lib/points/server';

// 同意書の完了画面の「フクエスポイントを使う」（第1454便・2026-10-14・カッキーさん）。
// ★ 加盟店で同意したときだけ（券 c がある）。使えるのはログインした会員本人・1,000pt 以上・予約1件に1回・予約の終わりの時刻まで。
// ★ 使ったあとは、この画面が「使用済み」の証拠になる（お支払いのときにセラピストに見せてもらう）。開き直しても同じ表示。
// ★ 負担はフクエス。お店の売上・女子報酬は変わらない（CRM の予約カードに「フクエスポイント −1,000円（フクエス負担）」と出る）。
// ★ お店の名前・予約の中身は出さない。

const BRAND = 'linear-gradient(90deg, #FB923C, #DB2777)';

export function PointsUseCard({ token, view, loggedIn, returnPath }: { token: string; view: UseView; loggedIn: boolean; returnPath: string }) {
  const [state, setState] = useState<UseView>(view);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [balanceAfter, setBalanceAfter] = useState<number | null>(null);

  if (state.kind === 'none') return null;
  if (state.kind === 'closed') return err ? <p className="mx-4 mt-4 text-center text-[13px] font-bold text-rose-600">{err}</p> : null;

  // ── 使用済み（この画面を見せてもらう）──
  if (state.kind === 'used') {
    return (
      <section className="mx-4 mb-4 mt-4 border-2 border-emerald-500 bg-emerald-50 px-4 py-4 text-center text-slate-800">
        <p className="text-[12px] font-bold tracking-[0.08em] text-emerald-700">✓ フクエスポイント 使用済み</p>
        <p className="mt-1 text-[34px] font-black leading-none text-emerald-700">{state.yen.toLocaleString()}円引き</p>
        <p className="mt-3 text-[14px] font-bold leading-relaxed text-slate-700">
          お支払いのときに、この画面を<br />セラピストにお見せください。
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-500">料金から {state.yen.toLocaleString()}円を引いた額をお支払いください。</p>
        {state.mine && balanceAfter != null && (
          <p className="mt-2 text-[12px] text-slate-600">いまのポイント：<b className="text-slate-800">{balanceAfter.toLocaleString()}pt</b></p>
        )}
      </section>
    );
  }

  // ── 使える（ログインしていない）──
  if (!loggedIn || state.balance == null) {
    const loginHref = `/login?redirectTo=${encodeURIComponent(returnPath)}`;
    return (
      <p className="mx-4 mt-4 text-center text-[12px] leading-relaxed text-slate-500">
        {POINT_USE_UNIT.toLocaleString()}pt 以上お持ちの方は、
        <a href={loginHref} rel="noreferrer" className="font-bold text-pink-600 underline">ログイン</a>
        すると、このご予約で {POINT_USE_YEN.toLocaleString()}円引きに使えます。
      </p>
    );
  }

  // ── 使える（ポイントが足りない）→ 出さない（下の来店ポイントの欄に「1,000pt で 1,000円引き」がある）──
  if (state.balance < POINT_USE_UNIT) return null;

  const spend = async () => {
    setBusy(true); setErr('');
    try {
      const r = await spendVisitPoints(token);
      if (!r.ok) { setErr(r.error); return; }
      if (r.status === 'ok' || r.status === 'used') {
        setBalanceAfter(r.balance);
        setState({ kind: 'used', mine: true, yen: POINT_USE_YEN });
      } else if (r.status === 'short') {
        setErr(r.message);
        setState({ kind: 'open', balance: r.balance });
      } else {
        setErr(r.message);
        setState({ kind: 'closed' });
      }
    } catch {
      setErr('通信できませんでした。もう一度お試しください');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <section className="mx-4 mb-4 mt-4 border-2 border-pink-300 bg-white px-4 py-4 text-center text-slate-800">
      <p className="text-[12px] font-bold tracking-[0.08em] text-pink-600">フクエスポイントを使う</p>
      <p className="mt-1 text-[18px] font-black">
        <span className="bg-clip-text text-[30px] leading-none text-transparent" style={{ backgroundImage: BRAND }}>{POINT_USE_UNIT.toLocaleString()}pt</span> で {POINT_USE_YEN.toLocaleString()}円引き
      </p>
      <p className="mt-1 text-[13px] text-slate-600">いまのポイント：<b className="text-slate-800">{state.balance.toLocaleString()}pt</b></p>
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)} disabled={busy}
          className="mt-3 w-full py-3 text-[15px] font-bold text-white disabled:opacity-60" style={{ backgroundImage: BRAND }}>
          {POINT_USE_UNIT.toLocaleString()}pt 使って {POINT_USE_YEN.toLocaleString()}円引きにする
        </button>
      ) : (
        <div className="mt-3 border border-pink-200 bg-pink-50 px-3 py-3">
          <p className="text-[13px] font-bold leading-relaxed text-slate-700">
            このご予約で {POINT_USE_UNIT.toLocaleString()}pt 使います。<br />使ったポイントは戻せません。よろしいですか？
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" onClick={spend} disabled={busy} className="py-2.5 text-[14px] font-bold text-white disabled:opacity-60" style={{ backgroundImage: BRAND }}>
              {busy ? '使っています…' : '使う'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="border border-slate-300 bg-white py-2.5 text-[14px] font-bold text-slate-600">やめる</button>
          </div>
        </div>
      )}
      {err && <p className="mt-2 text-[13px] font-bold text-rose-600">{err}</p>}
      <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
        お支払いの前に押して、この画面をセラピストにお見せください。1回のご来店で {POINT_USE_YEN.toLocaleString()}円まで・お店のクーポンと一緒に使えます。
      </p>
    </section>
  );
}
