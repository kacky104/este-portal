'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { pickBandNotice, shortDate, loadReadIds, saveReadId } from '@/lib/opsNotices';
import { useOpsNotices, NoticeBody } from './OpsNoticeParts';

// マイページ上の「運営からのお知らせ」の帯（第862便・2026-09-26・カッキーさんの指示）。
// ★ 1行だけ・白地にグレーの枠（★ お支払いのお願い＝黄・止まっている警告＝赤より目立たせない）。
// ★ 出すのは公開から14日以内のうち、いちばん新しく公開した1件。★ 無ければ帯ごと出さない。
// ★ タイトルを押すとその場で説明が開く（開いたら「NEW」が消える・このブラウザで覚える）。★「すべて見る」で /mypage/notices。

export function OpsNoticeBar() {
  const { notices } = useOpsNotices();
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<number[]>([]);
  useEffect(() => { setReadIds(loadReadIds()); }, []);

  const n = pickBandNotice(notices);
  if (!n) return null;
  const unread = !readIds.includes(n.id);

  return (
    <div className="max-w-2xl mx-auto px-3 pt-2">
      <div className="border border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <span className="flex-shrink-0 text-[11px] font-bold text-slate-400">運営から</span>
          <button
            type="button"
            onClick={() => {
              setOpen((v) => !v);
              if (unread) { saveReadId(n.id); setReadIds((x) => [...x, n.id]); }
            }}
            aria-expanded={open}
            className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
          >
            <span className="flex-shrink-0 text-[12px] font-bold text-slate-500 tabular-nums">{shortDate(n.notice_date)}</span>
            <span className="min-w-0 truncate text-[13px] font-bold text-slate-700 hover:text-pink-600">{n.title}</span>
            {unread && <span className="flex-shrink-0 text-[9px] font-black text-white bg-pink-500 px-1 leading-4">NEW</span>}
            <span className="flex-shrink-0 text-[10px] text-slate-400">{open ? '▲' : '▼'}</span>
          </button>
          <Link href="/mypage/notices" className="flex-shrink-0 text-[11px] text-slate-400 underline hover:text-pink-600">
            すべて見る
          </Link>
        </div>
        {open && (
          <div className="border-t border-slate-100 px-3 py-2.5">
            <NoticeBody text={n.body} />
          </div>
        )}
      </div>
    </div>
  );
}
