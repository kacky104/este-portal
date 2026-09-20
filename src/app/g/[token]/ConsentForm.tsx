'use client';

import { useEffect, useRef, useState } from 'react';
import { submitConsent } from '@/app/actions/consent';

// 同意書の入力（第560便）。☑＋スマホの画面に指でサイン → セラピストが確認して送信。
// ★ 端末には何も保存しない（localStorage・クッキーを使わない）。
// ★ 送信後は location.replace で「了承しました」の画面に置き換える（戻るで同意書に戻れない）。
// ★ サインは線の長さが一定以上ないと送信できない（点だけ・空欄では送れない）。

const MIN_INK = 150; // サインとして認める線の長さ（px）

export function ConsentForm({
  token, title, body, candidates,
}: {
  token: string;
  title: string;
  body: string;
  candidates: { bookingId: string; timeLabel: string; agreed: boolean }[];
}) {
  const [bookingId, setBookingId] = useState(candidates.length === 1 ? candidates[0].bookingId : '');
  const [checked, setChecked] = useState(false);
  const [ink, setInk] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [redo, setRedo] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef<{ x: number; y: number } | null>(null);

  const cur = candidates.find((c) => c.bookingId === bookingId) ?? null;
  const already = !!cur?.agreed && !redo;

  // キャンバスを画面の幅に合わせる（高精細）
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      const g = c.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, r.width, r.height);
      g.lineWidth = 2.5;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = '#111827';
      setInk(0);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [already]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = pos(e);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const g = e.currentTarget.getContext('2d');
    if (!g) return;
    const p = pos(e);
    const q = drawing.current;
    g.beginPath();
    g.moveTo(q.x, q.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    setInk((v) => v + Math.hypot(p.x - q.x, p.y - q.y));
    drawing.current = p;
  };
  const up = () => { drawing.current = null; };
  const clear = () => {
    const c = canvasRef.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const r = c.getBoundingClientRect();
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, r.width, r.height);
    setInk(0);
  };

  const canSend = !!bookingId && checked && ink >= MIN_INK && !busy;

  const send = async () => {
    const c = canvasRef.current;
    if (!c || !canSend) return;
    setBusy(true); setErr('');
    const r = await submitConsent(token, bookingId, true, c.toDataURL('image/png'));
    if (!r.ok) { setBusy(false); setErr(r.error); return; }
    window.location.replace(`/g/done?t=${encodeURIComponent(r.timeLabel)}`);
  };

  return (
    <main className="mx-auto w-full max-w-md bg-white px-4 pb-10 pt-6 text-slate-800">
      {title && <h1 className="mb-3 text-[19px] font-black">{title}</h1>}
      <div className="whitespace-pre-wrap border border-slate-200 bg-slate-50 p-3 text-[14px] leading-relaxed">{body}</div>

      {candidates.length > 1 && (
        <div className="mt-4">
          <p className="mb-1 text-[13px] font-bold text-slate-600">ご予約の時刻を選んでください</p>
          <div className="flex flex-wrap gap-2">
            {candidates.map((c) => (
              <button
                key={c.bookingId}
                type="button"
                onClick={() => { setBookingId(c.bookingId); setRedo(false); }}
                className={`border px-3 py-2 text-[15px] font-bold ${bookingId === c.bookingId ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'}`}
              >
                {c.timeLabel}〜{c.agreed ? '（了承済）' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {already ? (
        <div className="mt-5 border border-emerald-300 bg-emerald-50 p-4 text-center">
          <p className="text-[16px] font-black text-emerald-800">{cur?.timeLabel}〜の予約はもう了承済みです</p>
          <button type="button" onClick={() => setRedo(true)} className="mt-3 border border-slate-300 bg-white px-4 py-2 text-[13px] font-bold text-slate-600">
            サインし直す
          </button>
        </div>
      ) : (
        <>
          <label className="mt-5 flex cursor-pointer items-start gap-3 border-2 border-slate-300 p-3">
            <input type="checkbox" className="mt-0.5 h-6 w-6 shrink-0 accent-indigo-600" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <span className="text-[16px] font-bold">上記の内容をすべて了承します</span>
          </label>

          <div className="mt-4">
            <div className="mb-1 flex items-center">
              <p className="text-[13px] font-bold text-slate-600">サイン（指で書いてください）</p>
              <button type="button" onClick={clear} className="ml-auto text-[13px] font-bold text-slate-500 underline">書き直す</button>
            </div>
            <canvas
              ref={canvasRef}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onPointerLeave={up}
              className="h-[180px] w-full touch-none border-2 border-dashed border-slate-400 bg-white"
            />
          </div>

          <p className="mt-4 text-[13px] leading-relaxed text-slate-600">セラピストが内容を確認のうえ、送信してください。</p>
          {err && <p className="mt-2 text-[14px] font-bold text-rose-600">{err}</p>}
          <button
            type="button"
            disabled={!canSend}
            onClick={send}
            className="mt-3 w-full bg-indigo-600 py-3.5 text-[16px] font-bold text-white disabled:bg-slate-300"
          >
            {busy ? '送信中…' : '送信する'}
          </button>
          {!canSend && !busy && (
            <p className="mt-2 text-center text-[12px] text-slate-400">
              {!bookingId ? '予約の時刻を選んでください' : !checked ? '☑を入れてください' : 'サインを書いてください'}
            </p>
          )}
        </>
      )}
    </main>
  );
}
