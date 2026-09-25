'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { shortDate, loadReadIds } from '@/lib/opsNotices';
import { useOpsNotices } from '../OpsNoticeParts';

// 店舗マイページ「運営からのお知らせ」一覧（第862便）。★ 公開中のものが日付の新しい順に並ぶ。
// ★ 第865便: 押すと個別ページ /mypage/notices/[id] へ（その場で開く形はやめた）。

export default function OpsNoticesPage() {
  const { notices, loaded } = useOpsNotices();
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
            {notices.map((n) => (
              <li key={n.id}>
                <Link href={`/mypage/notices/${n.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 group">
                  <span className="flex-shrink-0 w-12 text-sm font-bold text-slate-500 tabular-nums">{shortDate(n.notice_date)}</span>
                  <span className="flex-1 min-w-0 text-[15px] font-bold text-slate-800 group-hover:text-pink-600">{n.title}</span>
                  {!readIds.includes(n.id) && <span className="flex-shrink-0 text-[10px] font-black text-white bg-pink-500 px-1.5 leading-5">NEW</span>}
                  <span className="flex-shrink-0 text-slate-400">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
