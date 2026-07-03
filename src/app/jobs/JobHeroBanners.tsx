import Link from 'next/link';
import Image from 'next/image';

// /jobs トップの「注目の求人」バナーセクション。サーバーコンポーネント。
// オーナーが設定した求人バナー画像（16:9・文言焼き込み済み）を縦積みで表示し、
// バナー全体を /jobs/[id] へのリンクにする。画像の上にテキストは重ねない
// （バナーに文言が焼き込まれている前提。サロン名・求人名は画像下に控えめに添える）。
// 既存の求人一覧（JobCard）とは別枠で、置き換えではなく追加。0件時はセクションごと非表示。

export type HeroBanner = {
  id: number;
  title: string;
  heroImageUrl: string;
  salonName: string;
};

export function JobHeroBanners({ banners }: { banners: HeroBanner[] }) {
  if (banners.length === 0) return null;

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
          注目の求人
        </h2>
      </div>

      {/* 16:9バナーの縦積み（1列・コンテナ幅いっぱい）。 */}
      <div className="space-y-4">
        {banners.map((b) => (
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
    </section>
  );
}
