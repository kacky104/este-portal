import Image from 'next/image';
import { JobDescriptionCollapse } from './JobDescriptionCollapse';
import { WORK_NEWS_NEW_HOURS, type WorkNewsItem } from '@/app/lib/jobs';

// 新着情報（work_news）の一覧描画（サーバーコンポーネント・表示専任）。
// 求人詳細タブ（/jobs/[id]）と過去ページ（/jobs/[id]/news/[page]）の両方から流用。
// ページネーションは呼び出し側が担う（ここは一覧＋空表示のみ。動的入力に依存しない）。
// 折りたたみは求人詳細と同じ x非依存の JobDescriptionCollapse を流用。NEW判定は ISR 生成時（サーバー）で確定。

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric',
  }).format(d);
}

export function JobNewsList({ rows }: { rows: WorkNewsItem[] }) {
  // 新着（NEW）バッジ：published_at が現在から WORK_NEWS_NEW_HOURS（48h）以内。
  const newCutoffMs = Date.now() - WORK_NEWS_NEW_HOURS * 60 * 60 * 1000;

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-100 bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-slate-400">新着情報はまだありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((n) => {
        const pubMs = n.publishedAt ? new Date(n.publishedAt).getTime() : NaN;
        const isNew = !Number.isNaN(pubMs) && pubMs >= newCutoffMs;
        return (
          <article key={n.id} className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
            {/* NEWバッジ＋日付 */}
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              {isNew && (
                <span
                  className="text-[10px] font-extrabold text-white tracking-wide px-2 py-0.5 rounded-full shadow-sm"
                  style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}
                >
                  NEW
                </span>
              )}
              <span className="text-xs text-slate-400">{formatDate(n.publishedAt)}</span>
            </div>

            {/* タイトル */}
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-1 h-5 rounded-full flex-shrink-0" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
              <h3 className="font-bold text-slate-900 leading-snug break-words min-w-0">{n.title}</h3>
            </div>

            {/* 画像（あれば・16:9） */}
            {n.imageUrl && (
              <div className="mb-3 rounded-xl overflow-hidden border border-emerald-100">
                <Image
                  src={n.imageUrl}
                  alt={n.title}
                  width={1280}
                  height={720}
                  sizes="(max-width: 768px) 100vw, 768px"
                  className="w-full h-auto object-cover"
                />
              </div>
            )}

            {/* 本文（改行保持・モバイルは10行で折りたたみ＝求人詳細と同じ JobDescriptionCollapse を流用） */}
            {n.content && <JobDescriptionCollapse text={n.content} />}
          </article>
        );
      })}
    </div>
  );
}
