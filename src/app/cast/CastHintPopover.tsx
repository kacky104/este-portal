'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { quickOpenMyTherapistX } from '@/app/actions/xProfile';

// ★ 第1061便（2026-10-01・カッキーさん）: fukuX の加点の案内を、本文のカードからヘッダーの「？」アイコンに移した。
//   ・未開設の子: 「サイトを見る」の左に「？」→ 押すと「開設すると毎週+10点」のカード（紫）
//   ・開設済みで赤バッジがまだの子: fukuX の丸いアイコンの左に「？」→ 押すと「赤バッジで毎週+5点」のカード（赤）
//   ・赤バッジを取ったら「？」は出ない（page.tsx 側の条件）
//   ★ 赤バッジの条件（件数）は秘密。画面には「投稿をがんばると」とだけ書く（第1059便）。
//   見た目は CastXIcon と同じ 36px 角丸の枠。外側タップ・Esc で閉じる。
// ★ 第1481便（2026-10-14・カッキーさん）: 未開設の子のボタンは「？」ではなく fukuX のロゴに。カードは開設のハードルを下げる文言
//   （写メ日記と一緒に投稿できる・DM とコメントは最初からオフ・開設したら何もしなくてよい）。加点の話はカードから外した。
// ★ 第1595便（2026-10-21・カッキーさん）: 「開設する」はその場でワンタップ開設（/x の登録画面へは行かない）。
//   名前と写真はセラピストページのまま・ID は自動。開設できたらページを読み直す（ヘッダーが fukuX のアイコンに変わる）。

const BADGE_PATH =
  'M12 1.5l2.5 2.1 3.3-.3.9 3.2 2.8 1.8-1.3 3 1.3 3-2.8 1.8-.9 3.2-3.3-.3L12 22.5l-2.5-2.1-3.3.3-.9-3.2L2.5 15.7l1.3-3-1.3-3 2.8-1.8.9-3.2 3.3.3z';

export function CastHintPopover({ kind }: { kind: 'open' | 'badge' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [openErr, setOpenErr] = useState('');
  const [opened, setOpened] = useState(false);

  const quickOpen = async () => {
    if (opening || opened) return;
    setOpening(true);
    setOpenErr('');
    let res: Awaited<ReturnType<typeof quickOpenMyTherapistX>>;
    try {
      res = await quickOpenMyTherapistX();
    } catch {
      setOpening(false);
      setOpenErr('通信できませんでした。電波のよい場所で、もう一度押してください。');
      return;
    }
    setOpening(false);
    if (!res.ok) { setOpenErr(res.error); return; }
    setOpened(true);
    window.setTimeout(() => { setOpen(false); router.refresh(); }, 1400);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = kind === 'open' ? 'fukuXの開設のご案内' : '赤い認証バッジでランキングに加点';
  const ring = kind === 'open' ? { borderColor: '#C4B5FD', color: '#7C3AED' } : { borderColor: '#FCA5A5', color: '#EF4444' };

  return (
    // ★ 吹き出しの位置はヘッダー（sticky＝位置の基準）に対して右端から 16px。ボタン基準にすると
    //   スマホで左にはみ出すので、ボタンの外側の div は relative にしない。
    <div ref={ref}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 rounded-xl border bg-white/80 flex items-center justify-center text-[17px] font-black leading-none hover:opacity-80 transition-opacity"
        style={ring}
      >
        {kind === 'open' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/fukux-mark.png" alt="" className="w-6 h-6" />
        ) : '?'}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={label}
          className="absolute right-4 top-[calc(100%+8px)] w-[min(calc(100vw-32px),360px)] z-40 drop-shadow-xl"
        >
          {kind === 'open' ? (
            <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-3.5 py-3">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/fukux-mark.png" alt="fukuX" className="w-9 h-9 flex-shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-violet-800 leading-snug">
                    {opened ? 'フクエックスを開設しました' : 'フクエックスはメンズエステ専用SNSです'}
                  </span>
                  {!opened && (
                    <span className="block text-[11px] text-violet-600/90 leading-snug mt-1">ボタン1つで開設。フクエスで書いた写メ日記を自動投稿。最初メッセージ・コメントはオフ設定。増える作業なし。お店の為にぜひ開設をお願いします。</span>
                  )}
                </span>
                {!opened && (
                  <button
                    type="button"
                    onClick={quickOpen}
                    disabled={opening}
                    className="flex-shrink-0 px-3 py-1.5 rounded-xl bg-violet-600 text-white text-[11px] font-bold whitespace-nowrap disabled:opacity-60"
                  >
                    {opening ? '開設中...' : '開設する'}
                  </button>
                )}
              </div>
              {openErr && <p className="mt-2 text-[11px] font-bold text-rose-600">{openErr}</p>}
            </div>
          ) : (
            <Link
              href="/x/guide/therapist"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 px-3.5 py-3 hover:-translate-y-0.5 transition-transform"
            >
              {/* 実物と同じ赤い認証バッジ（VerifiedBadge kind='therapist' の形・#EF4444） */}
              <span className="w-9 h-9 flex-shrink-0 inline-flex items-center justify-center" aria-hidden>
                <svg viewBox="0 0 24 24" width="30" height="30">
                  <path fill="#EF4444" d={BADGE_PATH} />
                  <path fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M8.2 12.2l2.6 2.6 5-5.4" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-red-700 leading-snug">fukuXで赤い認証バッジが付くと、人気セラピストランキングにさらに毎週+5点</span>
                <span className="block text-[11px] text-red-600/90 leading-snug mt-0.5">お店に所属して、fukuXの投稿をがんばると付きます</span>
              </span>
              <span className="flex-shrink-0 px-3 py-1.5 rounded-xl bg-red-500 text-white text-[11px] font-bold whitespace-nowrap">やり方を見る</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
