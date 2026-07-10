'use client';

import Link from 'next/link';
import type { SalonNewsItem } from '@/app/lib/salonNews';
// 名前・タイトルの1行自動縮小フィット。fukuX用に作った共通コンポーネントだが中身はサイト非依存なので流用。
import { AutoFitName } from '@/app/x/AutoFitName';

// サロン新着情報の行リスト（トップの5件ブロックと /news 一覧で共用）。
// 1行 = サムネイル＋日付＋サロン名＋タイトル（＋48時間以内は NEW!! バッジ）。行タップでサロンのお知らせページへ。
// 店名・タイトルは折り返さず、収まらないときだけフォントを段階縮小して1行に収める（AutoFitName 使用のためクライアント）。

// 日付ラベル（JST・M/D）。
function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }).format(d);
}

export function SalonNewsList({ items }: { items: SalonNewsItem[] }) {
  // 新着バッジ（NEW!!）判定はサロン別お知らせページと同一（published_at が48時間以内）。
  // ISR（10分）ごとの再生成時に評価されるため多少の誤差は許容。
  const newCutoffMs = Date.now() - 48 * 60 * 60 * 1000;

  return (
    // 枠は角丸なし（90度・「掲載サロン一覧」と同じ直角方針）。
    <div className="bg-white border border-slate-200 overflow-hidden shadow-sm divide-y divide-slate-100">
      {items.map((n) => {
        const publishedMs = n.publishedAt ? new Date(n.publishedAt).getTime() : NaN;
        const isNew = !Number.isNaN(publishedMs) && publishedMs >= newCutoffMs;
        return (
          <Link
            key={n.id}
            href={`/salon/${n.salonId}/news`}
            className="flex items-center gap-3 px-3 py-[3px] hover:bg-pink-50/60 transition-colors"
          >
            {/* サムネイル（角90度・画像なしはフクエスのロゴ）。行の上下余白は py-[3px]（従来py-2.5=10pxの約1/3）。 */}
            <span className="w-12 h-12 overflow-hidden bg-white flex items-center justify-center flex-shrink-0">
              {n.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={n.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/logo.png" alt="" className="w-8 h-8 object-contain" loading="lazy" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              {/* 1段目: 日付（固定）＋サロン名（11→8pxの1行フィット）＋NEW!!（縮めない・after配置） */}
              <div className="flex items-center gap-2 text-[11px] leading-none">
                <span className="text-slate-400 flex-shrink-0">{formatShortDate(n.publishedAt)}</span>
                <AutoFitName
                  name={n.salonName}
                  max={11}
                  min={8}
                  className="gap-2"
                  textClassName="font-bold text-pink-500 leading-none"
                  after={
                    isNew ? (
                      <span className="flex-shrink-0 text-[9px] font-black text-white bg-gradient-to-r from-pink-500 to-rose-500 rounded-full px-1.5 py-0.5 leading-none">
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
