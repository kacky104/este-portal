'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { createCastInviteLink } from '@/app/actions/castInvite';

// ★ 第887便（カッキーさん）: 「リンク・QRで招待」ボタンと小窓（QR・リンクのコピー・LINEで送る）。
// ★ コネックエフのセラピスト編集（CastLinkField）・マイページのセラピスト編集・マイページのセラピストカードで使う。
// ★ variant='compact' はセラピストカード用（52×22 の「QR」ボタン。★ カードの大きさを変えない）。

type Props = {
  therapistId: string | number;
  salonId: number;
  therapistName?: string;
  onToast: (m: string) => void;
  variant?: 'full' | 'compact';
  tone?: 'indigo' | 'pink';
  /** 小窓を閉じたとき（呼び元で状態を読み直すなら） */
  onClosed?: () => void;
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function CastInviteLinkButton({ therapistId, salonId, therapistName, onToast, variant = 'full', tone = 'pink', onClosed }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [qr, setQr] = useState('');

  useEffect(() => {
    if (!link) { setQr(''); return; }
    let alive = true;
    QRCode.toDataURL(link.url, { width: 240, margin: 1 }).then((d) => { if (alive) setQr(d); }).catch(() => { if (alive) setQr(''); });
    return () => { alive = false; };
  }, [link]);

  const make = async () => {
    setBusy(true);
    const r = await createCastInviteLink({ therapistId: String(therapistId), salonId });
    setBusy(false);
    if (!r.ok) { onToast(r.error); return; }
    setLink({ url: r.url, expiresAt: r.expiresAt });
  };

  const onOpen = () => { setOpen(true); if (!link) void make(); };
  const onClose = () => { setOpen(false); onClosed?.(); };

  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); onToast('リンクをコピーしました'); }
    catch { onToast('コピーできませんでした。リンクを長押しでコピーしてください'); }
  };

  const lineText = link ? `セラピストページの連携はこちらから（24時間有効）\n${link.url}` : '';

  const primary = tone === 'indigo' ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-pink-500 hover:bg-pink-600 text-white';
  const outline = tone === 'indigo' ? 'border-indigo-300 text-indigo-700 hover:bg-indigo-50' : 'border-pink-300 text-pink-600 hover:bg-pink-50';

  return (
    <>
      {variant === 'compact' ? (
        <button type="button" onClick={onOpen} title="リンク・QRで招待"
          className="w-[52px] h-[22px] inline-flex items-center justify-center rounded-none border border-pink-300 bg-white text-pink-600 text-[11px] font-bold flex-shrink-0 hover:bg-pink-50">
          QR
        </button>
      ) : (
        <button type="button" onClick={onOpen}
          className={`h-9 px-4 text-[13px] font-bold border whitespace-nowrap bg-white ${outline} ${tone === 'pink' ? 'rounded-xl' : ''}`}>
          リンク・QRで招待
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center px-4" onClick={onClose}>
          <div className="w-full max-w-sm bg-white shadow-xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-[15px] font-bold text-slate-800">
                {therapistName ? `${therapistName}さんを` : ''}リンク・QRで招待
              </p>
              <button type="button" onClick={onClose} className="text-slate-400 text-[18px] leading-none px-1" aria-label="閉じる">×</button>
            </div>
            <p className="text-[12.5px] text-slate-500 leading-relaxed">
              本人にQRを読み取ってもらうか、リンクを送ってください。本人が自分のメールアドレスを入れると招待メールが届き、パスワードを決めると連携されます。
            </p>
            {busy && !link ? (
              <p className="text-[13px] text-slate-400 py-6 text-center">リンクを作っています…</p>
            ) : link ? (
              <>
                <div className="flex justify-center">
                  {qr
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={qr} alt="招待リンクのQRコード" className="w-[200px] h-[200px]" />
                    : <div className="w-[200px] h-[200px] bg-slate-100" />}
                </div>
                <p className="text-[11.5px] text-slate-500 break-all border border-slate-200 bg-slate-50 px-2 py-1.5 select-all">{link.url}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => void copy()} className={`h-9 text-[13px] font-bold ${primary}`}>リンクをコピー</button>
                  <a href={`https://line.me/R/share?text=${encodeURIComponent(lineText)}`} target="_blank" rel="noopener noreferrer"
                    className="h-9 inline-flex items-center justify-center text-[13px] font-bold text-white bg-[#06c755] hover:opacity-90">
                    LINEで送る
                  </a>
                </div>
                <p className="text-[12px] text-amber-700 leading-relaxed">
                  有効期限：{fmt(link.expiresAt)} まで（24時間・1回だけ使えます）。
                </p>
                <button type="button" disabled={busy} onClick={() => void make()} className="text-[12px] font-bold text-slate-500 underline disabled:opacity-50">
                  {busy ? '作り直しています…' : 'リンクを作り直す（前のリンクは使えなくなります）'}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => void make()} className={`w-full h-9 text-[13px] font-bold ${primary}`}>リンクを作る</button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
