import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EMBED_SITE_URL } from '@/app/embed/salon/[id]/embedShared';
import { fetchHpPageData, type HpPageData } from '@/app/hp/_lib/data';
import { HP_NOT_PUBLIC_METADATA } from '@/app/hp/_lib/meta';
import { fetchHpDiaryItems } from '@/app/hp/_lib/subpageData';
import { HpShell } from '@/app/hp/_templates/HpShell';
import { Crumb, SecHead } from '@/app/hp/_templates/parts';
import { HP_DEMO_SLUG, normalizeHpSiteKey } from '@/app/lib/hpSite';

// 写メ日記ページ（2026-08-11 マルチページ化 第2弾）。
//
// - URL: 独自ドメインなら /diary、暫定URLなら /hp/{slug}/diary
// - トップの埋め込み（iframe・最大12件）と違い、このページはHPが自分で一覧を描く
//   （ひな形のデザインに馴染む・件数も多い＝最新36件）。取得条件は埋め込みと同じ。
//   サムネイルはフクエス本体の日記詳細を新しいタブで開く（実流入の導線）。
// - ★ デモ店（slug='demo'）だけは全店の日記を出す（サンプルサイトとして中身を見せるため。
//   デモ用サロン自身には日記が無い）。実店舗は必ず自店のぶんだけ。
// - 出る条件: blocks.multipage が true ＋ 写メ日記ブロックが ON。
//   therapist/system と違い ON/OFF を存在条件に使う（OFF＝日記をHPに載せない意思表示）。
// - ★ 常に noindex。日記の本文・正規ページはフクエス本体（/diary/[id]）にあり、
//   ここに一覧を出して index させると本体との重複コンテンツになるため。
//   人がドロワーやフッターから開く一覧ページとしてだけ機能させる。sitemap にも載せない。

export const revalidate = 600;
// ★ Next 16 では revalidate（ISR）を効かせるために空配列の generateStaticParams が要る。
export async function generateStaticParams() {
  return [];
}

/** このページを出してよいか（メタと本体で同じ判定を使う）。 */
function isOpen(data: HpPageData): boolean {
  if (data.site.status !== 'live') return false;
  if (!data.site.blocks.multipage) return false;
  return data.site.blocks.diary.on;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isOpen(data)) return HP_NOT_PUBLIC_METADATA;
  return {
    title: `写メ日記｜${data.salon.name}`,
    robots: { index: false, follow: true }, // 冒頭コメント参照（本体と重複するため常に noindex）
  };
}

export default async function HpDiaryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isOpen(data)) notFound();

  const { salon, basePath } = data;
  const homeHref = basePath || '/';
  const isDemo = normalizeHpSiteKey(slug) === HP_DEMO_SLUG;
  const items = await fetchHpDiaryItems(salon.id, isDemo);
  // 「もっと見る」の行き先。デモは全店の日記一覧、実店舗は自店の日記一覧（どちらもフクエス本体）
  const moreHref = isDemo ? `${EMBED_SITE_URL}/diary` : `${EMBED_SITE_URL}/salon/${salon.id}/diary`;

  return (
    <HpShell data={data} page="diary">
      <section id="diary" className="hp-sec hp-sec-diary" style={{ order: 1 }}>
        <Crumb homeHref={homeHref} label="写メ日記" />
        <SecHead no="05" en="Diary" jp="写メ日記" />

        {items.length === 0 ? (
          <p className="hp-note">写メ日記はまだありません</p>
        ) : (
          <div className="hp-dy-grid">
            {items.map((e) => (
              <a
                key={e.id}
                className="hp-dy-card"
                href={`${EMBED_SITE_URL}/diary/${e.id}?from=salon`}
                target="_blank"
                rel="noopener"
                title={e.title || `${e.therapistName}の写メ日記`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="hp-dy-thumb" src={e.image} alt={e.title || `${e.therapistName}の写メ日記`} loading="lazy" />
                <span className="hp-dy-name">
                  {e.therapistName}
                  {e.salonName ? `（${e.salonName}）` : ''}
                </span>
              </a>
            ))}
          </div>
        )}

        {/* 続きはフクエス本体へ（rel は noopener だけ＝計測を殺さない）。
            2本のリンクは div で1本ずつ包んで全ひな形で縦に並べる（A/Cの hp-more は inline-block のため） */}
        <div>
          <a className="hp-more" href={moreHref} target="_blank" rel="noopener">
            写メ日記をもっと見る →
          </a>
        </div>
        <div>
          <a className="hp-more" href={homeHref}>← ホームへ戻る</a>
        </div>
      </section>
    </HpShell>
  );
}
