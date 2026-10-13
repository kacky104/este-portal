'use client';

import { useEffect, useState } from 'react';
import { claimVisitPoints, getPointClaimState } from '@/app/actions/points';
import { POINT_PENDING_KEY, parsePendingClaim } from '@/lib/points';

// 会員ページの「受け取れるポイントがあります」の帯（第1444便）。
// ★ 同意書の完了画面で、ログインしていなかったときに覚えた券（このブラウザ・24時間）があれば出す。
// ★ 受け取ったら、ページを読み直して残高を出し直す。

export function PendingPointsBanner() {
  const [token, setToken] = useState<string | null>(null);
  const [points, setPoints] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(POINT_PENDING_KEY); } catch { return; }
    const p = parsePendingClaim(raw);
    if (!p) { try { if (raw) localStorage.removeItem(POINT_PENDING_KEY); } catch { /* 何もしない */ } return; }
    getPointClaimState(p.token).then((r) => {
      if (r.ok && r.view.kind === 'open') { setToken(p.token); setPoints(r.view.points); }
      else { try { localStorage.removeItem(POINT_PENDING_KEY); } catch { /* 何もしない */ } }
    }).catch(() => { /* 出さない */ });
  }, []);

  if (!token) return null;

  const claim = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await claimVisitPoints(token);
      if (!r.ok) { setMsg(r.error); return; }
      try { if (r.status !== 'daily') localStorage.removeItem(POINT_PENDING_KEY); } catch { /* 何もしない */ }
      if (r.status === 'ok') { window.location.reload(); return; }
      setMsg(r.message);
      if (r.status !== 'daily') setToken(null);
    } catch {
      setMsg('通信できませんでした。もう一度お試しください');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3">
      <p className="text-sm font-bold text-pink-700">受け取れる来店ポイントがあります（{points}pt）</p>
      <button type="button" onClick={claim} disabled={busy}
        className="ml-auto rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
        style={{ background: 'linear-gradient(90deg,#FB923C,#DB2777)' }}>
        {busy ? '受け取っています…' : '受け取る'}
      </button>
      {msg && <p className="w-full text-xs font-bold text-amber-700">{msg}</p>}
    </div>
  );
}
