'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { splitLinks, type OpsNotice } from '@/lib/opsNotices';

// 運営からのお知らせの部品（第862便）。★ 帯（OpsNoticeBar）と一覧（/mypage/notices）で共用。

/** 公開中のお知らせ（RLS: 店舗オーナー・公開のものだけ）。★ 読めなければ空＝帯は出ない（画面は止めない） */
export function useOpsNotices(): { notices: OpsNotice[]; loaded: boolean } {
  const [notices, setNotices] = useState<OpsNotice[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    void createClient()
      .from('ops_notices')
      .select('id, notice_date, title, body, published_at')
      .eq('is_published', true)
      .order('notice_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (!alive) return;
        setNotices((data ?? []) as OpsNotice[]);
        setLoaded(true);
      });
    return () => { alive = false; };
  }, []);
  return { notices, loaded };
}

/** 本文（改行そのまま・URL は押せるリンク） */
export function NoticeBody({ text }: { text: string }) {
  if (!text) return <p className="text-[13px] text-slate-400">くわしい説明はありません。</p>;
  return (
    <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
      {splitLinks(text).map((p, i) =>
        p.url ? (
          <a key={i} href={p.t} target="_blank" rel="noopener noreferrer" className="text-pink-600 underline break-all">{p.t}</a>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
    </p>
  );
}
