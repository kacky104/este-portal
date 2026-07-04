import type { TherapistVoice } from '@/app/lib/jobs';

// 求人詳細の「在籍セラピストの声」。店側が入力したインタビュー形式コメントを表示（server component）。
// 各カード: ★★★★☆（塗り/空5個・インラインSVG・lucide不使用）＋年代＋コメント全文。
// 0件ならセクションごと非表示（呼び出し側でも制御するが二重防御）。
// ※Googleの self-serving review 規約に抵触するため JSON-LD には一切載せない（表示のみ）。

// 星5個（塗り=amber / 空=slate）。rating は 1-5 の整数（sanitize 済み前提）。
function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`5段階中${rating}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} width="16" height="16" viewBox="0 0 24 24" className="block" aria-hidden="true">
          <path
            d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.9 6.19 20.9l1.11-6.47L2.6 9.85l6.5-.95L12 2.5z"
            fill={rating >= n ? '#F59E0B' : '#E5E7EB'}
          />
        </svg>
      ))}
    </span>
  );
}

export function JobVoices({ voices }: { voices: TherapistVoice[] }) {
  if (voices.length === 0) return null;

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm mt-4">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-1 h-5 rounded-full" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
        <h2 className="font-bold text-slate-900">在籍セラピストの声</h2>
      </div>

      <div className="space-y-3">
        {voices.map((v, i) => (
          <div key={i} className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Stars rating={v.rating} />
              <span className="text-xs font-bold text-slate-500">{v.ageGroup}</span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap break-words">{v.comment}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
