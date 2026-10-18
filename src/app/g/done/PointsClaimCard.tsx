'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { claimVisitPoints } from '@/app/actions/points';
import { notifyPointsChanged } from '@/lib/pointsEvents';
import { POINT_CLAIM_HOURS, POINT_PENDING_KEY, POINT_SIGNUP, POINT_USE_UNIT, POINT_USE_YEN, POINT_VISIT_NOTE } from '@/lib/points';
import type { ClaimView } from '@/app/lib/points/server';

// 同意書の完了画面の「来店ポイント」（第1444便・2026-10-14・カッキーさん）。
// ★ 加盟店で同意したときだけ出る（券 c がある）。受け取るのはお客様のスマホで、ログインした会員だけ。
// ★ ログインしていないときは、券をこのブラウザに覚えておく（24時間）。ログイン・登録のあとはこの画面に戻ってくる。
//   その場で受け取らなくても、同じスマホでフクエスの会員ページ（ポイント）を開けば受け取れる。
// ★ お店の名前・予約の中身は出さない。

const BRAND = 'linear-gradient(90deg, #FB923C, #DB2777)';

export function PointsClaimCard({
  token, view, loggedIn, balance, returnPath,
}: {
  token: string; view: ClaimView; loggedIn: boolean; balance: number | null; returnPath: string;
}) {
  const [state, setState] = useState<ClaimView>(view);
  const [bal, setBal] = useState<number | null>(balance);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  // ★ 第1553便: LINE のアプリ内ブラウザか（effect 内の setState をやめ、useSyncExternalStore で読む）
  const inLine = useSyncExternalStore(noopSubscribe, isLineBrowser, () => false);

  // ★ 受け取れる券は、このブラウザに覚えておく（ログインの行き来・あとから会員ページで受け取るため）
  useEffect(() => {
    try {
      if (view.kind === 'open') {
        localStorage.setItem(POINT_PENDING_KEY, JSON.stringify({ token, exp: new Date(view.expiresAt).getTime() }));
      } else {
        const raw = localStorage.getItem(POINT_PENDING_KEY);
        if (raw && raw.includes(token)) localStorage.removeItem(POINT_PENDING_KEY);
      }
    } catch { /* 使えない環境では、その場で受け取ってもらう */ }
  }, [token, view]);

  if (state.kind === 'none') return null;
  const points = state.points;

  const claim = async () => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await claimVisitPoints(token);
      if (!r.ok) { setErr(r.error); return; }
      setMsg(r.message);
      setBal(r.balance);
      if (r.status === 'ok') notifyPointsChanged(r.balance, r.points || points); // ★ 第1552便: ヘッダーの数字も変える
      if (r.status === 'ok' || r.status === 'mine') setState({ kind: 'claimed', points: r.points || points, mine: true });
      else if (r.status === 'expired') setState({ kind: 'expired', points });
      else if (r.status === 'taken') setState({ kind: 'claimed', points, mine: false });
      else setState({ kind: 'expired', points }); // ★ 第1447便: 1日1回・無効も、この券はもう使えない（ボタンを出さない・文は msg）
      try { localStorage.removeItem(POINT_PENDING_KEY); } catch { /* 何もしない */ }
    } catch {
      setErr('通信できませんでした。もう一度お試しください');
    } finally {
      setBusy(false);
    }
  };

  const loginHref = `/login?redirectTo=${encodeURIComponent(returnPath)}`;
  const signupHref = `/login?mode=signup&redirectTo=${encodeURIComponent(returnPath)}`;

  return (
    <section className="mx-4 mb-6 mt-2 border border-pink-200 bg-gradient-to-b from-pink-50 to-white px-4 py-4 text-center text-slate-800">
      <p className="text-[12px] font-bold tracking-[0.08em] text-pink-600">フクエスポイント</p>
      <p className="mt-1 text-[18px] font-black">
        来店ポイント <span className="bg-clip-text text-[36px] leading-none text-transparent" style={{ backgroundImage: BRAND }}>{points}pt</span>
        {POINT_VISIT_NOTE && <span className="ml-1 align-middle text-[11px] font-bold text-pink-600">（{POINT_VISIT_NOTE}）</span>}
      </p>

      {state.kind === 'open' && loggedIn && (
        <button type="button" onClick={claim} disabled={busy}
          className="mt-3 w-full py-3 text-[15px] font-bold text-white disabled:opacity-60" style={{ backgroundImage: BRAND }}>
          {busy ? '受け取っています…' : `${points}pt を受け取る`}
        </button>
      )}

      {state.kind === 'open' && !loggedIn && (
        <>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
            フクエス会員（無料）になると受け取れます。
            {/* ★ 第1450便: 会員登録のポイントも合わせて */}
            <br /><b className="text-pink-600">今なら会員登録で {POINT_SIGNUP}pt ＋ 来店 {points}pt ＝ {POINT_SIGNUP + points}pt</b>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href={signupHref} rel="noreferrer" className="py-3 text-[14px] font-bold text-white" style={{ backgroundImage: BRAND }}>無料で会員登録</a>
            <a href={loginHref} rel="noreferrer" className="border border-pink-300 bg-white py-3 text-[14px] font-bold text-pink-600">ログインして受け取る</a>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
            {POINT_CLAIM_HOURS}時間以内なら、あとからでも、このスマホでフクエスの会員ページ（ポイント）を開くと受け取れます。
          </p>
          {inLine && (
            <p className="mt-2 border-l-4 border-amber-400 bg-amber-50 px-2 py-1.5 text-left text-[11.5px] leading-relaxed text-amber-800">
              LINE の中で開いています。ふだん Safari や Chrome でフクエスにログインしている方は、右上のメニューから「ブラウザで開く」を選ぶと、そのまま受け取れます。
            </p>
          )}
        </>
      )}

      {state.kind === 'claimed' && (
        <p className="mt-2 text-[14px] font-bold text-emerald-700">
          {msg || (state.mine ? 'この来店のポイントは受け取り済みです' : 'この来店のポイントは受け取り済みです')}
        </p>
      )}
      {state.kind === 'claimed' && state.mine && bal != null && (
        <p className="mt-1 text-[13px] text-slate-600">いまのポイント：<b className="text-slate-800">{bal.toLocaleString()}pt</b></p>
      )}
      {state.kind === 'expired' && <p className="mt-2 text-[13px] font-bold text-slate-500">{msg || `受け取りの期限（同意から${POINT_CLAIM_HOURS}時間）が過ぎました`}</p>}
      {state.kind === 'open' && msg && <p className="mt-2 text-[13px] font-bold text-amber-700">{msg}</p>}
      {err && <p className="mt-2 text-[13px] font-bold text-rose-600">{err}</p>}

      <p className="mt-3 text-[11.5px] leading-relaxed text-slate-500">
        {POINT_USE_UNIT.toLocaleString()}pt で {POINT_USE_YEN.toLocaleString()}円引き（フクエスポイント加盟店で）
      </p>
      {/* ★ 第1445便: 「くわしく」は折り返さないよう2行目に1つで出す */}
      <p className="mt-1 whitespace-nowrap text-[12px]">
        <a href="/points" rel="noreferrer" className="font-bold text-pink-600 underline">くわしく</a>
        {state.kind === 'claimed' && state.mine && <a href="/member/points" rel="noreferrer" className="ml-3 font-bold text-pink-600 underline">ポイントを見る</a>}
      </p>
    </section>
  );
}

function noopSubscribe(): () => void { return () => {}; }
function isLineBrowser(): boolean { return /\bLine\//i.test(navigator.userAgent); }
