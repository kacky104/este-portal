import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EMBED_SITE_URL } from '@/app/embed/salon/[id]/embedShared';
import { fetchHpPageData, type HpPageData } from '@/app/hp/_lib/data';
import { HP_NOT_PUBLIC_METADATA } from '@/app/hp/_lib/meta';
import { fetchHpReviews } from '@/app/hp/_lib/subpageData';
import { HpShell } from '@/app/hp/_templates/HpShell';
import { Crumb, SecHead } from '@/app/hp/_templates/parts';
import { getSalonReviewStats } from '@/app/lib/reviews';
import { HP_DEMO_SLUG, normalizeHpSiteKey } from '@/app/lib/hpSite';

// 口コミページ（2026-08-11 マルチページ化 第2弾）。
//
// - URL: 独自ドメインなら /voice、暫定URLなら /hp/{slug}/voice
// - トップの埋め込み（iframe・3件）と違い、このページはHPが自分で一覧を描く
//   （ひな形のデザインに馴染む・最新30件）。承認済みのみ・取得は lib/reviews.ts に集約。
// - ★ デモ店（slug='demo'）だけは全店の口コミを出す（サンプルとして中身を見せるため）。
//   実店舗は必ず自店のぶんだけ＋平均評価も出す。
// - 出る条件: blocks.multipage が true ＋ 口コミブロックが ON。
// - ★ 常に noindex。口コミの正規ページはフクエス本体（/salon/[id]/reviews）にあり、
//   ここに一覧を出して index させると本体との重複コンテンツになるため。sitemap にも載せない。

export const revalidate = 600;
// ★ Next 16 では revalidate（ISR）を効かせるために空配列の generateStaticParams が要る。
export async function generateStaticParams() {
  return [];
}

/** このページを出してよいか（メタと本体で同じ判定を使う）。 */
function isOpen(data: HpPageData): boolean {
  if (data.site.status !== 'live') return false;
  if (!data.site.blocks.multipage) return false;
  return data.site.blocks.reviews.on;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isOpen(data)) return HP_NOT_PUBLIC_METADATA;
  return {
    title: `口コミ｜${data.salon.name}`,
    robots: { index: false, follow: true }, // 冒頭コメント参照（本体と重複するため常に noindex）
  };
}

/** ★を5個並べる（埋め込みウィジェットと同じ簡易表示）。色はひな形のアクセント。 */
function Stars({ value }: { value: number }) {
  const filled = Math.round(value);
  return (
    <span className="hp-voice-stars" aria-label={`5点満点中${value}点`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= filled ? '' : 'hp-voice-star-off'}>★</span>
      ))}
    </span>
  );
}

export default async function HpVoicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isOpen(data)) notFound();

  const { salon, basePath } = data;
  const homeHref = basePath || '/';
  const isDemo = normalizeHpSiteKey(slug) === HP_DEMO_SLUG;
  const [reviews, stats] = await Promise.all([
    fetchHpReviews(salon.id, isDemo),
    // 平均評価は自店モードのときだけ出す（全店の平均を1店のHPに出しても意味が無い）
    isDemo ? Promise.resolve(null) : getSalonReviewStats(salon.id),
  ]);
  const moreHref = isDemo ? `${EMBED_SITE_URL}/reviews` : `${EMBED_SITE_URL}/salon/${salon.id}/reviews`;

  return (
    <HpShell data={data} page="voice">
      <section id="voice" className="hp-sec hp-sec-reviews" style={{ order: 1 }}>
        <Crumb homeHref={homeHref} label="口コミ" />
        <SecHead no="06" en="Voice" jp="口コミ" />

        {stats && stats.avgOverall != null && (
          <p className="hp-voice-summary">
            <Stars value={stats.avgOverall} />
            <span className="hp-voice-score">{stats.avgOverall.toFixed(1)}</span>
            <span className="hp-voice-count">（{stats.count}件）</span>
          </p>
        )}

        {reviews.length === 0 ? (
          <p className="hp-note">口コミはまだありません</p>
        ) : (
          reviews.map((r) => (
            <div key={r.id} className="hp-card">
              <div className="hp-card-title">
                <Stars value={r.overall} />
                <span className="hp-voice-score">{r.overall.toFixed(1)}</span>
              </div>
              <div className="hp-card-body">{r.body}</div>
              <div className="hp-card-meta">
                {r.nickname} さん
                {r.therapistName ? ` → ${r.therapistName}さん` : ''}
                {r.salonName ? `｜${r.salonName}` : ''}
                {r.createdAt ? `｜${r.createdAt.slice(0, 10).replaceAll('-', '/')}` : ''}
              </div>
            </div>
          ))
        )}

        {/* 続きはフクエス本体へ（rel は noopener だけ＝計測を殺さない）。
            2本のリンクは div で1本ずつ包んで全ひな形で縦に並べる */}
        <div>
          <a className="hp-more" href={moreHref} target="_blank" rel="noopener">
            口コミをもっと見る →
          </a>
        </div>
        <div>
          <a className="hp-more" href={homeHref}>← ホームへ戻る</a>
        </div>
      </section>
    </HpShell>
  );
}
