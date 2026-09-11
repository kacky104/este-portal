'use client';

import Link from 'next/link';
import type { WorkNewsFeedItem } from '@/app/lib/workNewsFeed';
// 名前・タイトルの1行自動縮小フィット。★ フクエス本体の新着ブロックと同じものを流用。
import { AutoFitName } from '@/app/x/AutoFitName';

// フクエスワークの「店舗新着情報」の行リスト（/jobs トップのブロックと /jobs/news 一覧で共用）。
// ★ 1行 = サムネイル＋日付＋店名＋タイトル（＋48時間以内は NEW!! バッジ）。
// ★ 行タップで【その店の求人詳細】へ（/jobs/<求人ID>）。★ 新着情報1本ごとのページは作らない。
// ★ 形はフクエス本体の SalonNewsList と同じ。★ 色だけフクエスワークの緑にそろえる。

// 日付ラベル（JST・M/D）。
function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }).format(d);
}

export function WorkNewsFeedList({ items }: { items: WorkNewsFeedItem[] }) {
  // NEW!! は published_at が48時間以内（★ 求人詳細の新着タブと同じ基準）。
  // ★ ISR の再生成時に評価されるので、多少の誤差は許容。
  const newCutoffMs = Date.now() - 48 * 60 * 60 * 1000;

  if (items.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 overflow-hidden shadow-sm divide-y divide-slate-100">
      {items.map((n) => {
        const publishedMs = n.publishedAt ? new Date(n.publishedAt).getTime() : NaN;
        const isNew = !Number.isNaN(publishedMs) && publishedMs >= newCutoffMs;
        return (
          <Link
            key={n.id}
            href={`/jobs/${n.jobId}`}
            className="flex items-center gap-3 px-3 py-[3px] hover:bg-emerald-50/60 transition-colors"
          >
            {/* サムネイル（角90度・画像なしはフクエスワークの肉球）。 */}
            <span className="w-12 h-12 overflow-hidden bg-white flex items-center justify-center flex-shrink-0">
              {n.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={n.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/logo-fukuwork.png" alt="" className="w-8 h-8 object-contain" loading="lazy" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              {/* 1段目: 日付（固定）＋店名（11→8pxの1行フィット）＋NEW!!（縮めない） */}
              <div className="flex items-center gap-2 text-[11px] leading-none">
                <span className="text-slate-400 flex-shrink-0">{formatShortDate(n.publishedAt)}</span>
                <AutoFitName
                  name={n.salonName}
                  max={11}
                  min={8}
                  className="gap-2"
                  textClassName="font-bold leading-none text-emerald-600"
                  after={
                    isNew ? (
                      <span
                        className="flex-shrink-0 text-[9px] font-black text-white rounded-full px-1.5 py-0.5 leading-none"
                        style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}
                      >
                        NEW!!
                      </span>
                    ) : undefined
                  }
                />
              </div>
              {/* 2段目: タイトル（14→10pxの1行フィット） */}
              <div className="mt-1">
                <AutoFitName name={n.title} max={14} min={10} textClassName="font-bold text-slate-800" />
              </div>
            </div>

            <span className="text-slate-300 flex-shrink-0" aria-hidden>
              ›
            </span>
          </Link>
        );
      })}
    </div>
  );
}
