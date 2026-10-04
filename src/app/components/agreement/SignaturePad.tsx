'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// 手書きのサインの枠（第1174便）。★ 書き方・保存の形は CRM の同意書（/g/[token]/ConsentForm.tsx）と同じ:
//   指やマウスで書く → 横600px に縮めて WebP（書き出せない端末は PNG）の data URL にする。
// ★ 端末には何も保存しない。★ 線の長さ（ink）を親に知らせる＝点だけ・空欄では送れないようにするため。

const SAVE_WIDTH = 600;
export const SIGNATURE_MIN_INK = 150; // サインとして認める線の長さ（px）

export type SignaturePadHandle = { toDataUrl: () => string; clear: () => void };

export const SignaturePad = forwardRef<SignaturePadHandle, { onInk: (ink: number) => void; className?: string }>(
  function SignaturePad({ onInk, className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawing = useRef<{ x: number; y: number } | null>(null);
    const ink = useRef(0);

    const wipe = () => {
      const c = canvasRef.current;
      const g = c?.getContext('2d');
      if (!c || !g) return;
      const r = c.getBoundingClientRect();
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, r.width, r.height);
      ink.current = 0;
      onInk(0);
    };

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
        ink.current = 0;
        onInk(0);
      };
      fit();
      window.addEventListener('resize', fit);
      return () => window.removeEventListener('resize', fit);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      clear: wipe,
      toDataUrl: () => {
        const src = canvasRef.current;
        if (!src) return '';
        const w = Math.min(SAVE_WIDTH, src.width);
        const h = Math.max(1, Math.round((src.height * w) / src.width));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const g = c.getContext('2d');
        if (!g) return src.toDataURL('image/png');
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, w, h);
        g.imageSmoothingQuality = 'high';
        g.drawImage(src, 0, 0, w, h);
        const webp = c.toDataURL('image/webp', 0.8);
        return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
      },
    }));

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
      ink.current += Math.hypot(p.x - q.x, p.y - q.y);
      onInk(ink.current);
      drawing.current = p;
    };
    const up = () => { drawing.current = null; };

    return (
      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        className={className ?? 'h-[180px] w-full touch-none border-2 border-dashed border-slate-400 bg-white'}
      />
    );
  },
);
