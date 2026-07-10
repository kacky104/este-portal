// 読み込み中プレースホルダ（スケルトン）。x-card の上に淡いバーを並べ animate-pulse。
// グラデ/白テーマ両対応（x-card がテーマで地色を出し分ける）。データ取得待ちの体感を改善する。

export function XPostSkeleton() {
  return (
    <div className="x-card rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-4 animate-pulse">
      <div className="flex items-center gap-2.5">
        <div className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-1/3 rounded bg-slate-200" />
          <div className="h-2.5 w-1/4 rounded bg-slate-100" />
        </div>
      </div>
      <div className="mt-3 ml-[50px] space-y-2">
        <div className="h-3 w-3/4 rounded bg-slate-200" />
        <div className="h-3 w-1/2 rounded bg-slate-100" />
      </div>
    </div>
  );
}

export function XRowSkeleton() {
  return (
    <div className="x-card flex items-center gap-3 rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-3 animate-pulse">
      <div className="w-11 h-11 rounded-full bg-slate-200 flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-1/3 rounded bg-slate-200" />
        <div className="h-2.5 w-1/2 rounded bg-slate-100" />
      </div>
    </div>
  );
}

export function XListSkeleton({ rows = 5, variant = 'post' }: { rows?: number; variant?: 'post' | 'row' }) {
  return (
    <div className={variant === 'post' ? 'space-y-3' : 'space-y-2'}>
      {Array.from({ length: rows }).map((_, i) =>
        variant === 'post' ? <XPostSkeleton key={i} /> : <XRowSkeleton key={i} />
      )}
    </div>
  );
}
