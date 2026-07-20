'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { Breadcrumb } from '@/app/components/Breadcrumb';
import RankingTopShowcase from './RankingTopShowcase';
import { getTheme, breadcrumbCurrentColor, type SalonTheme } from '@/app/lib/themes';
import type { SalonRankItem, TherapistRankItem, PrevRankMaps, ShowcaseSalonData } from '@/app/lib/ranking';
import { RankDelta } from './RankDelta';
import { RankingHeading } from './RankingHeading';
import { RankingTherapistShowcase } from './RankingTherapistShowcase';

// タブごとのテーマ（サロン詳細と同じテーマ定義を流用）：総合=ホワイト / 店舗=ブラック / セラピスト=ピンク。
const TAB_THEME = { overall: 'white', salon: 'black', therapist: 'pink' } as const;
type TabKey = keyof typeof TAB_THEME;

function RankBadge({ rank, theme }: { rank: number; theme: SalonTheme }) {
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
    <span
      className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-black"
      style={{ background: theme.bg, color: theme.body, border: `1px solid ${theme.cardBorder}` }}
    >
      {rank}
    </span>
  );
}

function Chevron({ color }: { color: string }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="flex-shrink-0 opacity-60"
      aria-hidden
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function EmptyState({ theme }: { theme: SalonTheme }) {
  return (
    <div className="py-14 text-center text-sm" style={{ color: theme.body }}>
      今週のランキングはまだ集計中です。
      <br />
      アクセスが貯まると順位が表示されます。
    </div>
  );
}

export default function RankingTabs({
  overallRanking,
  salonRanking,
  therapistRanking,
  heroes,
  wallpapers,
  prevRanks,
  showcaseData,
}: {
  overallRanking: SalonRankItem[];
  salonRanking: SalonRankItem[];
  therapistRanking: TherapistRankItem[];
  heroes: { overall: string | null; salon: string | null; therapist: string | null };
  wallpapers: Record<string, string>;
  prevRanks: PrevRankMaps;
  showcaseData: Record<number, ShowcaseSalonData>;
}) {
  const [tab, setTab] = useState<TabKey>('overall');
  const theme = getTheme(TAB_THEME[tab]);
  const heroUrl = heroes[tab] ?? null; // タブ別ヒーロー画像

  const cardStyle = {
    background: theme.card,
    borderColor: theme.cardBorder,
  } as const;

  // テーマ壁紙（設定があれば）をテーマ色の半透明オーバーレイ越しに敷く。サロン詳細と同じ方式。
  const wallpaperUrl = wallpapers[theme.key] ?? null;
  const bgLayerStyle: CSSProperties = {
    backgroundColor: theme.bg,
    ...(wallpaperUrl
      ? {
          backgroundImage: `linear-gradient(${theme.bg}D9, ${theme.bg}D9), url(${wallpaperUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : {}),
  };

  return (
    <div className="min-h-screen transition-colors duration-300" style={{ color: theme.text }}>
      {/* テーマ背景（壁紙＋オーバーレイ）を全面に固定配置。コンテンツはこの上に重なる。 */}
      <div className="fixed inset-0 -z-10 transition-colors duration-300" style={bgLayerStyle} aria-hidden />

      {/* ─── Header（テーマに関わらず白のバー） ─── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon />
            <NotificationBell />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="pb-10">
        {/* パンくず（テーマ連動の文字色） */}
        <div className="max-w-3xl mx-auto px-4 pt-10">
          <Breadcrumb current="福岡のメンズエステ人気ランキング" currentColor={breadcrumbCurrentColor(theme.key)} />
        </div>

        {/* ヒーロー画像（タブ別）：幅いっぱい（ビューポート端まで） */}
        {heroUrl && (
          // スマホは全幅（端まで）、PCはコンテンツ幅に収めて角丸に（大きくなりすぎ防止）。
          <div className="mb-6 sm:max-w-3xl sm:mx-auto sm:px-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroUrl} alt="週間ランキング" className="block w-full h-auto sm:rounded-2xl sm:shadow-sm" />
          </div>
        )}

        <div className="max-w-3xl mx-auto px-4">
          {/* タブ（総合 / 店舗 / セラピスト）。角なし・隙間なしのセグメント。スマホは幅いっぱい。 */}
          <div className="flex sm:justify-center mb-5">
            <div className="flex w-full sm:w-auto">
              {([
                ['overall', '総合'],
                ['salon', '店舗'],
                ['therapist', 'セラピスト'],
              ] as const).map(([key, label], i) => {
                const selected = tab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    aria-pressed={selected}
                    className={`flex-1 sm:flex-none flex items-center justify-center px-2 sm:px-10 py-2.5 border text-sm font-bold transition-colors ${
                      i > 0 ? '-ml-px' : ''
                    } ${selected ? 'relative z-10' : ''}`}
                    style={
                      selected
                        ? { background: `${theme.heading}1A`, color: theme.heading, borderColor: theme.heading }
                        : { background: theme.card, color: theme.body, borderColor: theme.cardBorder }
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── 総合：1位は所属セラピストを並べた豪華ショーケース、2位以降は通常リスト ── */}
          {tab === 'overall' && (
            <>
              <RankingHeading
                title="総合ランキング TOP10"
                description={<>店舗と所属セラピスト全員の週間アクセスを合算した<br className="sm:hidden" />福岡のメンズエステ総合の人気ランキングです</>}
                bodyColor={theme.body}
              />
              {overallRanking.length === 0 ? (
                <div className="rounded-3xl border shadow-sm overflow-hidden transition-colors duration-300" style={cardStyle}>
                  <EmptyState theme={theme} />
                </div>
              ) : (
                overallRanking.map((s) => (
                  <RankingTopShowcase
                    key={s.id}
                    rank={s.rank}
                    salonId={s.id}
                    salonName={s.name}
                    area={s.area}
                    area2={s.area2}
                    dispatchType={s.dispatchType}
                    prevRank={prevRanks.overall[String(s.id)]}
                    data={showcaseData[s.id] ?? { therapists: [], catchphrase: '', price: '', hours: '', closedDays: '', image: '' }}
                    theme={theme}
                    variant="overall"
                  />
                ))
              )}
            </>
          )}

          {/* ── 店舗 ── */}
          {tab === 'salon' && (
            <>
              <RankingHeading
                title="店舗ランキング TOP10"
                description={<>店舗ページへの週間アクセスによる<br className="sm:hidden" />福岡のメンズエステ店舗の人気ランキングです</>}
                bodyColor={theme.body}
              />
              {salonRanking.length === 0 ? (
                <div className="rounded-3xl border shadow-sm overflow-hidden transition-colors duration-300" style={cardStyle}>
                  <EmptyState theme={theme} />
                </div>
              ) : (
                salonRanking.map((s) => (
                  <RankingTopShowcase
                    key={s.id}
                    rank={s.rank}
                    salonId={s.id}
                    salonName={s.name}
                    area={s.area}
                    area2={s.area2}
                    dispatchType={s.dispatchType}
                    prevRank={prevRanks.salon[String(s.id)]}
                    data={showcaseData[s.id] ?? { therapists: [], catchphrase: '', price: '', hours: '', closedDays: '', image: '' }}
                    theme={theme}
                    variant="salon"
                  />
                ))
              )}
            </>
          )}

          {/* ── セラピスト ── */}
          {tab === 'therapist' && (
            <>
              <RankingHeading
                title="セラピストランキング TOP50"
                description={<>セラピスト個別ページへの週間アクセスによる<br className="sm:hidden" />福岡のメンズエステ人気セラピストランキングです</>}
                bodyColor={theme.body}
              />
              {therapistRanking.length === 0 ? (
                <div className="rounded-3xl border shadow-sm overflow-hidden transition-colors duration-300" style={cardStyle}>
                  <EmptyState theme={theme} />
                </div>
              ) : (
                <>
                  {therapistRanking.slice(0, 4).map((t) => (
                    <RankingTherapistShowcase
                      key={t.id}
                      rank={t.rank}
                      compact={t.rank >= 4}
                      id={t.id}
                      name={t.name}
                      salonName={t.salonName}
                      area={t.area}
                      profileImageUrl={t.profileImageUrl}
                      bodyType={t.bodyType}
                      featureBadges={t.featureBadges}
                      catchphrase={t.catchphrase}
                      isAvailableNow={t.isAvailableNow}
                      availableUntil={t.availableUntil}
                      isAvailableNowCast={t.isAvailableNowCast}
                      availableUntilCast={t.availableUntilCast}
                      todayIsActive={t.todayIsActive}
                      todayStart={t.todayStart}
                      todayEnd={t.todayEnd}
                      prevRank={prevRanks.therapist[String(t.id)]}
                      theme={theme}
                    />
                  ))}
                  {therapistRanking.length > 4 && (
                    <div className="rounded-3xl border shadow-sm overflow-hidden transition-colors duration-300" style={cardStyle}>
                      <ul>
                        {therapistRanking.slice(4).map((t, idx, arr) => (
                          <li
                            key={t.id}
                            style={idx < arr.length - 1 ? { borderBottom: `1px solid ${theme.cardBorder}` } : undefined}
                          >
                            <Link
                              href={`/therapist/${t.id}`}
                              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-pink-500/10"
                            >
                              <RankBadge rank={t.rank} theme={theme} />
                              <span className="flex-shrink-0 w-11 h-11 rounded-full overflow-hidden bg-slate-100 relative">
                                {t.profileImageUrl ? (
                                  <Image src={t.profileImageUrl} alt={t.name} fill className="object-cover" sizes="44px" />
                                ) : (
                                  <span className="absolute inset-0 flex items-center justify-center text-slate-300 font-bold">
                                    {t.name.charAt(0) || '—'}
                                  </span>
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-bold truncate" style={{ color: theme.heading }}>{t.name || '—'}</span>
                                {t.salonName && (
                                  <span className="block text-[11px] truncate" style={{ color: theme.body }}>{t.salonName}</span>
                                )}
                              </span>
                              <RankDelta current={t.rank} prev={prevRanks.therapist[String(t.id)]} />
                              <Chevron color={theme.body} />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </>
          )}

        </div>
      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
