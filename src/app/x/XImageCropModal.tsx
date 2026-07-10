'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// 比率ラベル用のGCD（1500×500→3:1、1280×720→16:9）。
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

// 画像のクロップエディタ（X方式）。固定比率の枠に対し、画像をドラッグ移動＋スライダーでズームし、
// 枠内だけを outWidth×outHeight の WebP（非対応環境は jpeg）に切り抜いて onSave(blob) で返す。
// デフォルトはヘッダー用の 3:1（1500×500）。バナー等は outWidth/outHeight/title を指定して流用する。
export function XImageCropModal({
  file,
  onCancel,
  onSave,
  outWidth = 1500,
  outHeight = 500,
  title = 'ヘッダー画像を調整',
}: {
  file: File;
  onCancel: () => void;
  onSave: (blob: Blob) => void;
  outWidth?: number;
  outHeight?: number;
  title?: string;
}) {
  const OUT_W = outWidth;
  const OUT_H = outHeight;
  const ratioDiv = gcd(OUT_W, OUT_H);
  const ratioLabel = `${OUT_W / ratioDiv}:${OUT_H / ratioDiv}`;
  const objectUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const frameRef = useRef<HTMLDivElement | null>(null);

  const [nat, setNat] = useState<{ w: number; h: number } | null>(null); // 画像の naturalWidth/Height
  const [frameW, setFrameW] = useState(0); // 枠の実表示幅(px)。高さは frameW/3。
  const [scale, setScale] = useState(1); // 表示倍率（画像naturalに対する）
  const [minScale, setMinScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // 枠中心から画像中心へのずれ(px)
  const [busy, setBusy] = useState(false);

  const frameH = frameW * (OUT_H / OUT_W);

  // ObjectURL はアンマウント時に解放。
  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);

  // 枠の実表示幅を取得（レイアウト後・リサイズ時）。
  useEffect(() => {
    const measure = () => {
      const el = frameRef.current;
      if (el) setFrameW(el.getBoundingClientRect().width);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // 画像読み込み完了で natural サイズを保持。
  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNat({ w: img.naturalWidth, h: img.naturalHeight });
  };

  // 画像・枠サイズが揃ったら minScale（cover）を計算して初期化。
  useEffect(() => {
    if (!nat || frameW === 0) return;
    const cover = Math.max(frameW / nat.w, frameH / nat.h);
    setMinScale(cover);
    setScale(cover);
    setOffset({ x: 0, y: 0 });
  }, [nat, frameW, frameH]);

  // オフセットのクランプ（画像が枠を完全に覆う＝黒帯を出さない）。
  const clamp = useCallback(
    (o: { x: number; y: number }, s: number) => {
      if (!nat) return o;
      const dispW = nat.w * s;
      const dispH = nat.h * s;
      const maxX = Math.max(0, (dispW - frameW) / 2);
      const maxY = Math.max(0, (dispH - frameH) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, o.x)),
        y: Math.min(maxY, Math.max(-maxY, o.y)),
      };
    },
    [nat, frameW, frameH]
  );

  // スライダーでのズーム（変更後 offset を再クランプ）。
  const onZoom = (s: number) => {
    setScale(s);
    setOffset((o) => clamp(o, s));
  };

  // ドラッグ（Pointer Events でマウス・タッチ統一）。
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const start = dragRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    setOffset((o) => clamp({ x: o.x + dx, y: o.y + dy }, scale));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* すでに解放済み等は無視 */
    }
  };

  // Esc で破棄＋body スクロールロック。
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onCancel]);

  // 切り抜き→Blob 化。枠の中心＝画像中心＋offset。source rect を元画像座標で求めて drawImage。
  const handleSave = async () => {
    if (busy || !nat || frameW === 0) return;
    setBusy(true);
    try {
      const img = new Image();
      img.src = objectUrl;
      await img.decode();

      // 枠内に見えている領域を元画像座標に逆変換。
      // 表示は「画像中心 = 枠中心 + offset」なので、枠左上の元画像座標は
      // sx = nat.w/2 - (frameW/2 + offset.x)/scale（offset が正＝画像を右下へ動かした＝元画像の左上側が見える）。
      const sw = frameW / scale;
      const sh = frameH / scale;
      const sx = nat.w / 2 - (frameW / 2 + offset.x) / scale;
      const sy = nat.h / 2 - (frameH / 2 + offset.y) / scale;

      const canvas = document.createElement('canvas');
      canvas.width = OUT_W;
      canvas.height = OUT_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas 2d context を取得できませんでした');
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/webp', 0.85)
      );
      if (blob) {
        onSave(blob);
        return;
      }
      // webp 非対応環境は jpeg にフォールバック。
      const jpeg = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85)
      );
      if (jpeg) {
        onSave(jpeg);
        return;
      }
      throw new Error('画像の切り抜きに失敗しました');
    } catch {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onCancel}
    >
      <div
        className="w-full sm:max-w-lg bg-[color:var(--x-surface)] rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[88dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー: キャンセル（左）／タイトル／保存（右）。スクロールしても操作できるよう sticky。 */}
        <div className="sticky top-0 z-10 bg-[color:var(--x-surface)] flex items-center justify-between px-4 py-3 border-b border-[color:var(--x-border)]">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm font-bold text-[color:var(--x-text-secondary)] hover:text-[color:var(--x-text-primary)] transition-colors px-2 py-1"
          >
            キャンセル
          </button>
          <h2 className="text-sm font-black text-[color:var(--x-text-primary)]">{title}</h2>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy || !nat}
            className="text-sm font-bold text-white rounded-full px-4 py-1.5 shadow-sm hover:opacity-95 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
          >
            {busy ? '処理中...' : '保存'}
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* クロップ枠（固定比率・黒背景・ドラッグで移動）。touch-action:none で画面スクロールと干渉させない。
              比率が可変になったため aspect は Tailwind ではなく inline style で指定（任意値クラスはビルド時静的のみ）。 */}
          <div
            ref={frameRef}
            className="relative w-full overflow-hidden rounded-xl bg-black cursor-move select-none"
            style={{ touchAction: 'none', aspectRatio: `${OUT_W} / ${OUT_H}` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {nat && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={objectUrl}
                alt=""
                onLoad={onImgLoad}
                draggable={false}
                className="absolute left-1/2 top-1/2 max-w-none pointer-events-none"
                style={{
                  width: nat.w * scale,
                  height: nat.h * scale,
                  transform: `translate(-50%,-50%) translate(${offset.x}px, ${offset.y}px)`,
                }}
              />
            )}
            {/* natural 取得用の隠し img（初回ロード）。nat 確定後は上の表示 img が使われる。 */}
            {!nat && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={objectUrl} alt="" onLoad={onImgLoad} className="opacity-0" />
            )}
          </div>

          {/* ズームスライダー（min=cover, max=cover*3） */}
          <div className="flex items-center gap-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[color:var(--x-text-muted)] flex-shrink-0">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
            <input
              type="range"
              min={minScale}
              max={minScale * 3}
              step={0.01}
              value={scale}
              onChange={(e) => onZoom(Number(e.target.value))}
              disabled={!nat}
              className="flex-1 accent-indigo-500"
            />
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[color:var(--x-text-muted)] flex-shrink-0">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
              <line x1="8" y1="11" x2="14" y2="11" />
              <line x1="11" y1="8" x2="11" y2="14" />
            </svg>
          </div>

          <p className="text-[10px] text-[color:var(--x-text-muted)] text-center">
            ドラッグで位置を調整・スライダーで拡大縮小できます（{ratioLabel}で切り抜かれます）。
          </p>
        </div>
      </div>
    </div>
  );
}
