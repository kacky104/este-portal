import Link from 'next/link';
import Image from 'next/image';
import type { PickupJob } from '@/app/lib/jobs';

// おすすめ求人（ピックアップ）横スクロールスライダー。サーバーコンポーネント（時間依存レンダリング無し）。
// 本体トップの「ピックアップサロン」スライダーと同系統のバナー風カード（写真全面＋下部グラデ＋白文字重ね）を、
// 1枚見せではなくモバイル・PC共通で 2.2枚見せにしたもの。JSカルーセルは使わず CSS スクロール
// （overflow-x-auto + scroll-snap）のみ。
// 重要: 横オーバーフローはトラック（overflow-x-auto の div）内に閉じ込め、ページ全体を広げない。
// カード幅は 2.2枚見せで端が覗く＝スクロール可能と分かる（gap-3=0.75rem を差し引いて算出）。
export function PickupSlider({ jobs }: { jobs: PickupJob[] }) {
  // 0件時はセクションごと非表示（呼び出し側でも制御するが二重防御）。
  if (jobs.length === 0) return null;

  return (
    <section className="mb-8">
      {/* 見出し（フクエスワークのブランドグラデ グリーン→ライム） */}
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-1 h-5 rounded-full" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
        <h2
          className="text-lg font-extrabold inline-block"
          style={{
            background: 'linear-gradient(95deg,#10B981,#84CC16)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}
        >
          おすすめ求人
        </h2>
      </div>

      {/* トラック：横スクロール＋スナップ。overflow はこの要素内に閉じ込める。
          -mx-4 px-4 で左右パディング分まで端を使い、スクロール端の見切れを自然にする（親 main の px-4 と対）。 */}
      <div className="-mx-4 overflow-x-auto snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-3 px-4">
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={`/jobs/${job.id}`}
              className="snap-start flex-shrink-0 w-[calc((100%-1.5rem)/2.2)] relative aspect-[4/3] rounded-2xl overflow-hidden shadow-lg"
            >
              {/* サロン画像を全面表示。無い場合はブランドグラデを全面に敷く（テキストは同様に重ねる）。 */}
              {job.imageUrl ? (
                <Image
                  src={job.imageUrl}
                  alt={job.salon.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 45vw, 340px"
                />
              ) : (
                <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,#10B981,#84CC16)' }} />
              )}

              {/* 下部グラデーションオーバーレイ（本体スライダー同系統） */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

              {/* PICKUP バッジ（本体のピンク系は流用せず、フクエスワークのグリーン→ライム） */}
              <span
                className="absolute top-2 left-2 text-[10px] font-black text-white px-2 py-0.5 rounded-full shadow tracking-wide"
                style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}
              >
                ✦ PICKUP
              </span>

              {/* 下部テキスト（白文字＋drop-shadow）：サロン名（大きめ）＋求人タイトル＋給与 */}
              <div className="absolute bottom-0 left-0 right-0 p-2.5">
                <p className="text-white font-bold text-sm leading-tight drop-shadow line-clamp-1">{job.salon.name}</p>
                <p className="text-white/90 text-[11px] leading-snug mt-0.5 drop-shadow line-clamp-2">{job.title}</p>
                {job.salaryText && (
                  <p className="text-white text-[11px] font-bold mt-1 drop-shadow line-clamp-1">{job.salaryText}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
