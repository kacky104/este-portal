'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { pickBandNotice, shortDate, loadReadIds, saveReadId } from '@/lib/opsNotices';
import { useOpsNotices, NoticeBody } from './OpsNoticeParts';

// マイページ上の「運営からのお知らせ」の帯（第862便・2026-09-26・カッキーさんの指示）。
// ★ 1行だけ・白地にグレーの枠（★ お支払いのお願い＝黄・止まっている警告＝赤より目立たせない）。
// ★ 出すのは公開から14日以内のうち、いちばん新しく公開した1件。★ 無ければ帯ごと出さない。
// ★ タイトルを押すとその場で説明が開く（開いたら「NEW」が消える・このブラウザで覚える）。★「すべて見る」で /mypage/notices。

// ★ 第863便: PC は本文（main）と同じ拡大（zoom 1.2）・同じ横幅（max-w-2xl px-4）にして、下のブロックと端をそろえる。
export function OpsNoticeBar({ zoom = 1 }: { zoom?: number }) {
  const { notices } = useOpsNotices();
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<number[]>([]);
  useEffect(() => { setReadIds(loadReadIds()); }, []);

  const n = pickBandNotice(notices);
  if (!n) return null;
  const unread = !readIds.includes(n.id);

  return (
    <div className="max-w-2xl mx-auto px-4 pt-3" style={zoom === 1 ? undefined : { zoom }}>
      <div className="border border-slate-200 bg-white">
        <div className="flex items-center gap-1.5 sm:gap-3 px-2.5 sm:px-4 py-1.5 sm:py-2.5">
          {/* ★ 第864便: スマホでは「運営から」を出さない（タイトルを長く見せる） */}
          <span className="hidden sm:inline flex-shrink-0 text-[12px] font-bold text-slate-400">運営から</span>
          <button
            type="button"
            onClick={() => {
              setOpen((v) => !v);
              if (unread) { saveReadId(n.id); setReadIds((x) => [...x, n.id]); }
            }}
            aria-expanded={open}
            className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
          >
            <span className="flex-shrink-0 text-[12px] sm:text-[14px] font-bold text-slate-500 tabular-nums">{shortDate(n.notice_date)}</span>
            <span className="min-w-0 truncate text-[13px] sm:text-[15px] font-bold text-slate-700 hover:text-pink-600">{n.title}</span>
            {unread && <span className="flex-shrink-0 text-[9px] sm:text-[10px] font-black text-white bg-pink-500 px-1 leading-4 sm:leading-5">NEW</span>}
            <span className="flex-shrink-0 text-[10px] text-slate-400">{open ? '▲' : '▼'}</span>
          </button>
          <Link href="/mypage/notices" className="flex-shrink-0 text-[11px] sm:text-[12px] text-slate-400 underline hover:text-pink-600">
            すべて見る
          </Link>
        </div>
        {open && (
          <div className="border-t border-slate-100 px-3 sm:px-4 py-2.5 sm:py-3">
            <NoticeBody text={n.body} />
          </div>
        )}
      </div>
    </div>
  );
}
