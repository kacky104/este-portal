'use client';

import { useState } from 'react';

// 求人詳細の「求人詳細（募集要項）」「新着情報」2タブ。親（page.tsx）はサーバーコンポーネントのため、
// 各タブの中身は server 側で描画済みの ReactNode をスロットとして受け取り、ここでは表示切替のみ行う
// （データは初期レンダで両方取得済み・タブ切替はクライアントサイドのみでURLは変えない）。
// 2ページ目以降（?page=N でアクセス）は initialTab='news' で「新着情報」を初期表示にする。
export function JobDetailTabs({
  details,
  news,
  newsCount,
  initialTab = 'details',
}: {
  details: React.ReactNode;
  news: React.ReactNode;
  newsCount: number;
  initialTab?: 'details' | 'news';
}) {
  const [tab, setTab] = useState<'details' | 'news'>(initialTab);

  const tabBtn = (key: 'details' | 'news', label: string, count?: number) => {
    const active = tab === key;
    return (
      <button
        type="button"
        onClick={() => setTab(key)}
        aria-selected={active}
        role="tab"
        className="flex-1 text-sm font-bold py-2.5 rounded-xl transition-colors"
        style={
          active
            ? { background: 'linear-gradient(95deg,#10B981,#84CC16)', color: '#fff' }
            : { color: '#059669', background: 'transparent' }
        }
      >
        {label}
        {typeof count === 'number' && count > 0 && (
          <span
            className="ml-1.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full align-middle"
            style={active ? { background: 'rgba(255,255,255,0.25)', color: '#fff' } : { background: '#D1FAE5', color: '#059669' }}
          >
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="mt-4">
      {/* タブバー（グリーン系・既存カードトーンに合わせた枠付きピル） */}
      <div role="tablist" className="flex gap-1.5 p-1 rounded-2xl border border-emerald-100 bg-white shadow-sm">
        {tabBtn('details', '求人詳細')}
        {tabBtn('news', '新着情報', newsCount)}
      </div>

      {/* 両スロットとも常にDOMに描画し、非アクティブ側を hidden で隠す（切替はクライアントのみ）。 */}
      <div className="mt-4">
        <div className={tab === 'details' ? '' : 'hidden'}>{details}</div>
        <div className={tab === 'news' ? '' : 'hidden'}>{news}</div>
      </div>
    </div>
  );
}
