'use client';

import { Suspense, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { ApprovedReview, TherapistReviewRankItem } from '@/app/lib/reviews';
import { ReviewList } from '@/app/components/ReviewList';
import { PaginatedReviewList } from '@/app/components/PaginatedReviewList';

// /reviews のタブ（新着 / セラピスト / 殿堂入り）。
// - 新着：従来どおり全店舗の承認済み口コミを新着順（20件/ページ）。
// - セラピスト：口コミ50件以下のセラピストを件数の多い順（TOP50人・同数は総合平均が高い順）。
// - 殿堂入り：口コミ51件以上のセラピスト（件数の多い順）。
// タブ状態は /ranking と同方式で URL ハッシュに保存し、リロード時に復元（ISR を壊さないようクライアント側のみ）。
const TAB_KEYS = ['new', 'therapist', 'hall'] as const;
type TabKey = (typeof TAB_KEYS)[number];
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// 順位バッジ：1〜3位はメダル色、4位以降は黄テーマの淡色（/ranking の RankBadge と同意匠）。
function RankBadge({ rank }: { rank: number }) {
  const medal =
    rank === 1
      ? { bg: 'linear-gradient(135deg,#F7C948,#E8A317)', ring: '#E8A317', text: '#5A3E00' }
      : rank === 2
      ? { bg: 'linear-gradient(135deg,#D7DEE5,#AEB8C2)', ring: '#AEB8C2', text: '#3A4450' }
      : rank === 3
      ? { bg: 'linear-gradient(135deg,#E7B98F,#CD8B54)', ring: '#CD8B54', text: '#5A3418' }
      : null;

  if (medal) {
    return (
      <span
        className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shadow-sm"
        style={{ background: medal.bg, color: medal.text, border: `1px solid ${medal.ring}` }}
      >
        {rank}
      </span>
    );
  }
  return (
    <span className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-black bg-amber-50 text-amber-700 border border-amber-200">
      {rank}
    </span>
  );
}

// 殿堂入り用の王冠バッジ（金のグラデ丸に王冠アイコン）。
function CrownBadge() {
  return (
    <span
      className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center shadow-sm"
      style={{ background: 'linear-gradient(135deg,#F7C948,#E8A317)', border: '1px solid #E8A317' }}
      aria-label="殿堂入り"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#5A3E00" aria-hidden>
        <path d="M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-1.6 9.2a1 1 0 01-1 .8H5.6a1 1 0 01-1-.8L3 8z" />
      </svg>
    </span>
  );
}

function Chevron() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="flex-shrink-0 opacity-60"
      aria-hidden
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

// タブ内見出し（タイトル＋説明）。黄テーマに合わせた配色。
function TabHeading({ title, description }: { title: string; description: ReactNode }) {
  return (
    <div className="mb-5 text-center">
      <h2 className="text-lg sm:text-xl font-black tracking-wide text-amber-700">{title}</h2>
      <p className="mt-1.5 text-xs sm:text-sm leading-relaxed text-slate-600">{description}</p>
    </div>
  );
}

// ランキング1行：順位（or 王冠）＋丸アイコン＋名前・所属店＋件数・★総合平均。行全体でセラピストページへ。
function RankRow({ t, badge, hall }: { t: TherapistReviewRankItem; badge: ReactNode; hall?: boolean }) {
  return (
    <Link
      href={`/therapist/${t.id}`}
      className={`flex items-center gap-3 px-4 py-3 transition-colors ${hall ? 'hover:bg-amber-100/50' : 'hover:bg-amber-50'}`}
    >
      {badge}
      <span className="flex-shrink-0 w-11 h-11 rounded-full overflow-hidden bg-slate-100 relative">
        {t.image ? (
          <Image src={t.image} alt={t.name} fill className="object-cover" sizes="44px" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-slate-300 font-bold">
            {t.name.charAt(0) || '—'}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold truncate text-slate-800">{t.name || '—'}</span>
        {t.salonName && <span className="block text-[11px] truncate text-slate-500">{t.salonName}</span>}
      </span>
      <span className="flex-shrink-0 text-right">
        <span className="block text-sm font-black text-amber-600 tabular-nums">
          {t.reviewCount}
          <span className="ml-0.5 text-[10px] font-bold text-slate-400">件</span>
        </span>
        <span className="block text-[11px] font-bold text-slate-500 tabular-nums">
          <span className="text-amber-400">★</span> {t.avgOverall.toFixed(1)}
        </span>
      </span>
      <Chevron />
    </Link>
  );
}

function EmptyCard({ children }: { children: ReactNode }) {
  return (
    <div className="text-center py-16 text-slate-400 text-sm border border-dashed border-amber-100 rounded-3xl bg-amber-50/10">
      {children}
    </div>
  );
}

export default function ReviewsTabs({
  reviews,
  ranking,
  hallOfFame,
}: {
  reviews: ApprovedReview[];
  ranking: TherapistReviewRankItem[];
  hallOfFame: TherapistReviewRankItem[];
}) {
  const [tab, setTab] = useState<TabKey>('new');
  // リロード時に直前のタブを復元（/ranking と同方式・URL ハッシュ）。
  useIsoLayoutEffect(() => {
    const h = window.location.hash.replace('#', '');
    if ((TAB_KEYS as readonly string[]).includes(h)) setTab(h as TabKey);
  }, []);
  const changeTab = (key: TabKey) => {
    setTab(key);
    try {
      const url = key === 'new' ? window.location.pathname + window.location.search : `#${key}`;
      window.history.replaceState(null, '', url);
    } catch {}
  };

  return (
    <div>
      {/* タブ（新着 / セラピスト / 殿堂入り）。/ranking と同じ角なし・隙間なしセグメント。スマホは幅いっぱい。 */}
      <div className="flex sm:justify-center mb-5">
        <div className="flex w-full sm:w-auto">
          {([
            ['new', '新着'],
            ['therapist', 'セラピスト'],
            ['hall', '殿堂入り'],
          ] as const).map(([key, label], i) => {
            const selected = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => changeTab(key)}
                aria-pressed={selected}
                className={`flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-10 py-2.5 border text-sm font-bold transition-colors ${
                  i > 0 ? '-ml-px' : ''
                } ${
                  selected
                    ? 'relative z-10 bg-amber-500/10 text-amber-700 border-amber-500'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 新着：従来どおり全店舗の口コミを新着順（20件/ページ） ── */}
      {tab === 'new' &&
        (reviews.length === 0 ? (
          <EmptyCard>口コミはまだありません</EmptyCard>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <Suspense fallback={<ReviewList reviews={reviews.slice(0, 20)} />}>
              <PaginatedReviewList reviews={reviews} pageSize={20} />
            </Suspense>
          </div>
        ))}

      {/* ── セラピスト：口コミ数ランキング（50件以下・TOP50人） ── */}
      {tab === 'therapist' && (
        <>
          <TabHeading
            title="セラピスト口コミ数ランキング TOP50"
            description={
              <>
                口コミ件数の多い順のセラピストランキングです
                <br className="sm:hidden" />
                （51件以上は殿堂入りへ）
              </>
            }
          />
          {ranking.length === 0 ? (
            <EmptyCard>口コミのあるセラピストはまだいません</EmptyCard>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <ul>
                {ranking.map((t, idx) => (
                  <li key={t.id} className={idx < ranking.length - 1 ? 'border-b border-slate-100' : undefined}>
                    <RankRow t={t} badge={<RankBadge rank={t.rank} />} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* ── 殿堂入り：口コミ51件以上のレジェンド（金の特別カード） ── */}
      {tab === 'hall' && (
        <>
          <TabHeading
            title="殿堂入りセラピスト"
            description={
              <>
                口コミ51件以上を達成した
                <br className="sm:hidden" />
                殿堂入りセラピストです
              </>
            }
          />
          {hallOfFame.length === 0 ? (
            <EmptyCard>
              殿堂入りセラピストはまだいません
              <br />
              <span className="text-xs">口コミが51件以上になると殿堂入りします</span>
            </EmptyCard>
          ) : (
            <div
              className="rounded-2xl shadow-sm overflow-hidden"
              style={{
                border: '1px solid #E8A317',
                background: 'linear-gradient(160deg,#FFFBEB 0%,#FFFFFF 45%,#FEF3C7 100%)',
              }}
            >
              <ul>
                {hallOfFame.map((t, idx) => (
                  <li key={t.id} className={idx < hallOfFame.length - 1 ? 'border-b border-amber-200/60' : undefined}>
                    <RankRow t={t} badge={<CrownBadge />} hall />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
