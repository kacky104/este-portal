import Link from 'next/link';
import Image from 'next/image';
import type { HeroBanner } from '@/app/lib/heroBanners';

// 求人一覧ページのバナーカードセクション（全求人ページ共通）。サーバーコンポーネント。
// オーナーが設定した求人バナー画像（16:9・文言焼き込み済み）を縦積みで表示し、
// バナー全体を /jobs/[id] へのリンクにする。画像の上にテキストは重ねない
// （バナーに文言が焼き込まれている前提。サロン名・求人名は画像下に控えめに添える）。
// 既存の求人一覧（JobCard）とは別枠で、置き換えではなく追加。
// 見出し（title）はページ条件のキーワード（例「福岡メンズエステのセラピスト求人」）で、各ページの h1 を担う。
// ※ 見出し(h1)は常に描画する（バナー画像が0枚でも）。求人一覧ブロックをページ最下部へ移した設計のため、
//   h1 を一覧見出し側で昇格させると h1 が最下部に来てしまう。h1 はこの上部ブロックで常に1つ確保し、
//   一覧見出し（JobListHeading）は常に h2 とする。バナー画像は0枚なら省略（見出しのみ描画）。

export type { HeroBanner };

// title は見出し文言（既定「注目の求人」）。呼び出し元で差し替え可能にし、指定なしのページは従来どおり。
// priority=true のページ（このブロックがファーストビューのLCPになるページ＝タグページ）でのみ、
// 先頭バナー1枚だけ next/image の priority を付ける（2件目以降は lazy 維持）。既定 false で他ページは全 lazy。
export function JobHeroBanners({
  banners,
  title = '注目の求人',
  priority = false,
}: {
  banners: HeroBanner[];
  title?: string;
  priority?: boolean;
}) {
  const hasBanners = banners.length > 0;

  // h1 は常に1行に収める。掛け合わせページの長い文言（最長「その他福岡市内×高バック率のセラピスト求人」=21字）が
  // SP(幅375px想定・見出し可用幅≈329px)で折り返すのを、文字数に応じたフォント段階縮小で防ぐ。
  //   〜14字: text-lg（現状サイズ維持。「博多駅のセラピスト求人」等の短文はここ）
  //   15〜20字: SPのみ1段階小（text-base=16px。/jobsトップ「福岡メンズエステのセラピスト求人」=16字はここ）
  //   21字〜: SPのみ2段階小（text-sm=14px。可読性下限。21字×14px≈294px<329pxで1行に収まる）
  // PC(md:)は常に text-lg 相当を維持し、既存ページの見た目を一切変えない（可用幅≈722pxで最長でも余裕）。
  // ≤20字の2階層は確実に1行内に収まるため whitespace-nowrap で1行を保証。極端に長い想定外タイトルは
  // はみ出し（横スクロール）よりも折り返しを許容するフォールバックとし、最小階層には nowrap を付けない。
  const titleLen = [...title].length;
  const h1SizeClass =
    titleLen <= 14
      ? 'text-lg whitespace-nowrap'
      : titleLen <= 20
        ? 'text-base md:text-lg whitespace-nowrap'
        : 'text-sm md:text-lg';

  return (
    <section className="mb-8">
      {/* 見出し（フクエスワークのブランドグラデ グリーン→ライム）。h1 は常に描画する（バナー0枚でも）。 */}
      <div className="flex items-center gap-2.5">
        <span className="w-1 h-5 rounded-full shrink-0" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
        <h1
          className={`${h1SizeClass} font-extrabold inline-block`}
          style={{
            background: 'linear-gradient(95deg,#10B981,#84CC16)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}
        >
          {title}
        </h1>
      </div>
      {/* 30分入れ替えの注記（見出し h1 構造には含めない・控えめなグレー小文字）。バナー0枚でも表示。
          このブロックのバナー(heroBanners=deriveHeroBanners)は30分バケットでシャッフルされるため表記と一致。 */}
      <p className={`text-xs text-gray-500 mt-1 ${hasBanners ? 'mb-3' : ''}`}>表示順は30分ごとに入れ替わります</p>

      {/* 16:9バナーの縦積み（1列・コンテナ幅いっぱい）。バナー0枚なら省略（見出しのみ）。 */}
      {hasBanners && (
      <div className="space-y-4">
        {banners.map((b, i) => (
          <Link
            key={b.id}
            href={`/jobs/${b.id}`}
            className="block rounded-2xl overflow-hidden shadow-md hover:shadow-lg transition-shadow border border-emerald-100"
          >
            <Image
              src={b.heroImageUrl}
              alt={`${b.salonName}｜${b.title}`}
              width={1280}
              height={720}
              // LCP最適化：priority 指定ページの先頭バナー(i===0)のみ eager 読み込み。他は next/image 既定の lazy。
              priority={priority && i === 0}
              sizes="(max-width: 768px) 100vw, 768px"
              className="w-full h-auto"
            />
            {/* 文言はバナー画像に焼き込み済みのため画像上には重ねず、下に控えめに添える。 */}
            <div className="px-3 py-2 bg-white">
              <p className="text-[11px] font-medium text-slate-500 line-clamp-1">{b.salonName}</p>
              <p className="text-xs font-bold text-slate-800 line-clamp-1">{b.title}</p>
            </div>
          </Link>
        ))}
      </div>
      )}
    </section>
  );
}
