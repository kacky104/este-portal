'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { saveReadId, type OpsNotice } from '@/lib/opsNotices';
import { NoticeBody } from '../../OpsNoticeParts';

// 運営からのお知らせの個別ページ（第865便・2026-09-26・カッキーさんの指示）。
// ★ 帯・一覧のタイトルから来る。★ 開いたら「読んだ」にする（NEW が消える・このブラウザで覚える）。
// ★ 読むのは RLS（店舗オーナー・公開のものだけ）。★ 見つからない（下書きに戻した・消した）ときはそう書く。

function longDate(ymd: string): string {
  return `${Number(ymd.slice(0, 4))}年${Number(ymd.slice(5, 7))}月${Number(ymd.slice(8, 10))}日`;
}

export default function OpsNoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const noticeId = Number(id);
  const [notice, setNotice] = useState<OpsNotice | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');

  useEffect(() => {
    if (!Number.isFinite(noticeId)) { setState('missing'); return; }
    let alive = true;
    void createClient()
      .from('ops_notices')
      .select('id, notice_date, title, body, published_at')
      .eq('id', noticeId)
      .eq('is_published', true)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        if (!data) { setState('missing'); return; }
        setNotice(data as OpsNotice);
        setState('ok');
        saveReadId(noticeId);
      });
    return () => { alive = false; };
  }, [noticeId]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <Link href="/mypage/notices" className="text-sm text-slate-500 underline">‹ お知らせ一覧</Link>
          <Link href="/mypage" className="text-sm text-pink-600 underline">マイページへ戻る</Link>
        </div>
        {state === 'loading' ? (
          <p className="text-sm text-slate-400">読み込み中…</p>
        ) : state === 'missing' || !notice ? (
          <p className="text-sm text-slate-500 bg-white border border-slate-200 p-6">このお知らせは見つかりませんでした（公開が終わった可能性があります）。</p>
        ) : (
          <article className="bg-white border border-slate-200 p-5 sm:p-7">
            <p className="text-xs font-bold text-slate-400">運営からのお知らせ・{longDate(notice.notice_date)}</p>
            <h1 className="mt-1.5 text-lg sm:text-xl font-bold text-slate-800 leading-snug">{notice.title}</h1>
            <div className="mt-4 pt-4 border-t border-slate-100 [&_p]:text-[15px] [&_p]:leading-loose">
              <NoticeBody text={notice.body} />
            </div>
          </article>
        )}
      </div>
    </div>
  );
}
