'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { shortDate, loadReadIds, saveReadId } from '@/lib/opsNotices';
import { useOpsNotices, NoticeBody } from '../OpsNoticeParts';

// 店舗マイページ「運営からのお知らせ」一覧（第862便）。★ 公開中のものが日付の新しい順に並ぶ。★ 押すと説明が開く。

export default function OpsNoticesPage() {
  const { notices, loaded } = useOpsNotices();
  const [openId, setOpenId] = useState<number | null>(null);
  const [readIds, setReadIds] = useState<number[]>([]);
  useEffect(() => { setReadIds(loadReadIds()); }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-slate-800">運営からのお知らせ</h1>
          <Link href="/mypage" className="text-sm text-pink-600 underline">マイページへ戻る</Link>
        </div>
        {!loaded ? (
          <p className="text-sm text-slate-400">読み込み中…</p>
        ) : notices.length === 0 ? (
          <p className="text-sm text-slate-500 bg-white border border-slate-200 p-6">いまはお知らせはありません。</p>
        ) : (
          <ul className="bg-white border border-slate-200 divide-y divide-slate-100">
            {notices.map((n) => {
              const open = openId === n.id;
              const unread = !readIds.includes(n.id);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => {
                      setOpenId(open ? null : n.id);
                      if (unread) { saveReadId(n.id); setReadIds((x) => [...x, n.id]); }
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="flex-shrink-0 w-12 text-sm font-bold text-slate-500 tabular-nums">{shortDate(n.notice_date)}</span>
                    <span className="flex-1 min-w-0 text-[15px] font-bold text-slate-800">{n.title}</span>
                    {unread && <span className="flex-shrink-0 text-[10px] font-black text-white bg-pink-500 px-1.5 leading-5">NEW</span>}
                    <span className="flex-shrink-0 text-xs text-slate-400">{open ? '▲' : '▼'}</span>
                  </button>
                  {open && (
                    <div className="px-4 pb-4 pl-[4.75rem]">
                      <NoticeBody text={n.body} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
