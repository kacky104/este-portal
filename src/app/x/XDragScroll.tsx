'use client';

import { useRef, type ReactNode } from 'react';

// ★★ 第1006便（2026-09-30・カッキーさん）: スクロールバーを出さずに、PC でも横に動かせる横スクロール枠。
// ★ マウスでつかんで左右にドラッグ／マウスホイール（縦回し）でも横に動く。スマホは今まで通り指でスクロール。
export function XDragScroll({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return; // 指はブラウザのスクロールに任せる
    const el = ref.current;
    if (!el) return;
    drag.current = { x: e.clientX, left: el.scrollLeft, moved: false };
    el.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) d.moved = true;
    el.scrollLeft = d.left - dx;
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (el && drag.current) {
      try { el.releasePointerCapture(e.pointerId); } catch { /* 取れていないときは無視 */ }
    }
    // ★ ドラッグしたあとの「離した瞬間のクリック」でリンクに飛ばないようにする
    if (drag.current?.moved) {
      const stop = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
      el?.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => el?.removeEventListener('click', stop, { capture: true }), 0);
    }
    drag.current = null;
  };
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    // 縦回しのホイールを横スクロールに（横に動かせる余地があるときだけ）
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth) {
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  };

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={onWheel}
      className={`overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden cursor-grab active:cursor-grabbing select-none ${className}`}
    >
      {children}
    </div>
  );
}
