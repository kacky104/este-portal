'use client';

import { useEffect, useRef, useState } from 'react';

// ★ 第1429便（2026-10-13・カッキーさん）: 同意書のサインを「横向き・画面いっぱい」で書く。
//   ・スマホが縦のまま（回転ロック中など）のときは、画面の中身を 90° 回して出す → スマホを横にすると正しい向きで書ける
//   ・スマホの自動回転で画面が横になっているときは、回さずにそのまま全面に出す
//   ・「決定」で、書いたサインを元のサイン欄（小さい枠）に縮めて写す → 送信のしかたは今までどおり（保存の形も同じ）
//   ・端末には何も保存しない

type Props = {
  onDone: (src: HTMLCanvasElement, ink: number) => void;
  onClose: () => void;
};

const BAR = 52; // 上のボタンの帯の高さ（px）

export function SignatureFullscreen({ onDone, onClose }: Props) {
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  const [ink, setInk] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef<{ x: number; y: number } | null>(null);

  // 画面の大きさ（回転・アドレスバーの出入りで変わる）
  useEffect(() => {
    const read = () => { setVw(window.innerWidth); setVh(window.innerHeight); };
    read();
    window.addEventListener('resize', read);
    // 書いている間は後ろの画面が動かないように
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('resize', read); document.body.style.overflow = prev; };
  }, []);

  const rot = vh > vw; // 縦のまま → 中身を 90° 回す
  const boxW = rot ? vh : vw; // 横向きにしたときの幅
  const boxH = rot ? vw : vh;
  const padW = boxW;
  const padH = Math.max(1, boxH - BAR);

  // キャンバスの用意（大きさが変わったら描き直し＝白紙に）
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || padW <= 0 || padH <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(padW * dpr);
    c.height = Math.round(padH * dpr);
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, padW, padH);
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#111827';
    setInk(0);
  }, [padW, padH]);

  // 画面上の指の位置 → キャンバスの中の位置（回しているときは 90° 戻す）
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (rot) return { x: e.clientY, y: vw - e.clientX - BAR };
    return { x: e.clientX, y: e.clientY - BAR };
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
    const g = canvasRef.current?.getContext('2d');
    if (!g) return;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, padW, padH);
    setInk(0);
  };

  if (!vw || !vh) return null;

  // 回すとき: 横 vh × 縦 vw の箱を、左上を軸に 90° 回して画面の右端に置く
  const boxStyle: React.CSSProperties = rot
    ? { position: 'fixed', top: 0, left: vw, width: boxW, height: boxH, transform: 'rotate(90deg)', transformOrigin: 'top left' }
    : { position: 'fixed', top: 0, left: 0, width: boxW, height: boxH };

  return (
    <div className="fixed inset-0 z-50 bg-white">
      <div style={boxStyle} className="bg-white text-slate-800">
        <div className="flex items-center gap-2 border-b border-slate-200 px-3" style={{ height: BAR }}>
          <button type="button" onClick={onClose} className="px-2 py-2 text-[14px] font-bold text-slate-500">やめる</button>
          <p className="flex-1 truncate text-center text-[13px] font-bold text-slate-500">
            {rot ? 'スマホを横にして、下の白いところにサインしてください' : '下の白いところにサインしてください'}
          </p>
          <button type="button" onClick={clear} className="px-2 py-2 text-[14px] font-bold text-slate-500 underline">書き直す</button>
          <button
            type="button"
            disabled={ink < 1}
            onClick={() => { const c = canvasRef.current; if (c) onDone(c, ink); }}
            className="bg-indigo-600 px-4 py-2 text-[15px] font-bold text-white disabled:bg-slate-300"
          >
            決定
          </button>
        </div>
        <div className="relative" style={{ width: padW, height: padH }}>
          {/* 書く場所の目安（薄い線）。キャンバスの下に置く＝サインの画像には入らない */}
          <div className="pointer-events-none absolute inset-x-[8%] bottom-[22%] border-b-2 border-dashed border-slate-300" />
          <canvas
            ref={canvasRef}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={up}
            style={{ width: padW, height: padH, mixBlendMode: 'multiply' }}
            className="relative block touch-none"
          />
        </div>
      </div>
    </div>
  );
}
