'use client';

// ★★ 第1550便（2026-10-17・カッキーさん）: 写真が無いセラピストに使う画像（お店の既定画像）。
//   ★ セラピスト一覧のいちばん下に、たたんだ状態で置く（ふだんは邪魔にならないように）。#placeholder で開いて飛べる。
//   ★ 保存先はフクエスのマイページと同じ（どちらで変えても同じ画像）。
//   ★ ブラウザで縦横1440以内の JPEG に縮めてから送る（サーバーアクションの上限 1MB の内側）。サーバーでも JPEG に作り直す。

import { useEffect, useRef, useState } from 'react';
import { getConecfPlaceholder, saveConecfPlaceholder, deleteConecfPlaceholder } from '@/app/actions/conecfGirls';
import { revalidateSalon } from '@/app/lib/revalidateTop';

async function shrinkToJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('read'));
      el.src = url;
    });
    const scale = Math.min(1, 1440 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PlaceholderCard({ onToast }: { onToast: (m: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    // ★ #placeholder で来たら開いて見せる（セラピスト編集の案内から飛んでくる）
    if (typeof window !== 'undefined' && window.location.hash === '#placeholder') {
      setOpen(true);
      // ★ 一覧の読み込みで位置がずれるので、少し待ってから見える所へ
      window.setTimeout(() => document.getElementById('placeholder')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 600);
    }
    void getConecfPlaceholder().then((r) => { if (alive && r.ok) setUrl(r.data.url); if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const blob = await shrinkToJpeg(file);
      const fd = new FormData();
      fd.append('file', blob, 'placeholder.jpg');
      const r = await saveConecfPlaceholder(fd);
      if (!r.ok) { onToast(r.error); return; }
      setUrl(r.data.url);
      void revalidateSalon(r.data.salonId);
      onToast('写真が無いセラピストの画像を変えました');
    } catch {
      onToast('画像を読み込めませんでした（JPEG・PNG・WebP にしてください）');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!window.confirm('写真が無いセラピストの画像を外しますか？（フクエスでは共通の画像になり、駅ちかへは送らなくなります）')) return;
    setBusy(true);
    const r = await deleteConecfPlaceholder();
    setBusy(false);
    if (!r.ok) { onToast(r.error); return; }
    setUrl(null);
    void revalidateSalon(r.data.salonId);
    onToast('画像を外しました');
  };

  return (
    <details id="placeholder" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="bg-white border border-slate-200">
      <summary className="cursor-pointer select-none px-4 py-3 text-[14px] font-bold text-slate-700 flex items-center gap-2">
        写真が無いセラピストに使う画像
        {loaded && <span className={`text-[11px] font-normal px-2 py-0.5 ${url ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{url ? '設定済み' : '未設定'}</span>}
      </summary>
      <div className="px-4 pb-4 space-y-3">
        <p className="text-[12.5px] text-slate-500 leading-relaxed">
          写真がまだ1枚も無いセラピストに使います。フクエスのカードに出るほか、駅ちかの1枚目にも送ります（駅ちかは写真が1枚も無いとプロフィールを保存しないため）。
          本物の写真を入れると、駅ちかの1枚目も本物に入れ替わります。
          <br />
          ※ 女の子本人以外の人物の写真は使わないでください（駅ちかの規約で禁止されています）。「NO PHOTO」などの画像がおすすめです。縦長（3:4）・横300×縦400以上。
          フクエスのマイページの「セラピストの既定画像」と同じ画像です（どちらで変えても同じです）。
        </p>
        <div className="flex items-end gap-4">
          <div className="w-[96px] h-[128px] bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
            {url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={url} alt="写真が無いセラピストに使う画像" className="w-full h-full object-cover" />
              : <span className="text-[11px] text-slate-400">未設定</span>}
          </div>
          <div className="flex flex-col gap-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void onPick(e)} />
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
              className="h-9 px-4 border border-indigo-300 text-indigo-700 text-[13px] font-bold bg-white hover:bg-indigo-50 disabled:opacity-40">
              {busy ? '保存しています…' : url ? '画像を変更' : '画像を選ぶ'}
            </button>
            {url && (
              <button type="button" disabled={busy} onClick={() => void onDelete()}
                className="h-9 px-4 border border-rose-200 text-rose-600 text-[13px] bg-white hover:bg-rose-50 disabled:opacity-40">
                外す
              </button>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}
