'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { areaLabel } from '@/app/lib/areaLabel';
import type { SalonRankItem, TherapistRankItem } from '@/app/lib/ranking';

// 順位バッジ（1〜3位は金銀銅、それ以降はグレーの数字）。
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
    <span className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-black bg-slate-100 text-slate-400 border border-slate-200">
      {rank}
    </span>
  );
}

function AreaChip({ area }: { area: string | null }) {
  if (!area) return null;
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-100 font-medium">
      {areaLabel(area)}
    </span>
  );
}

// 右端の「開く」シェブロン（アクセス数は非表示なので、タップ可能な誘目として置く）。
function Chevron() {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="flex-shrink-0 text-slate-300"
      aria-hidden
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function EmptyState() {
  return (
    <div className="py-14 text-center text-sm text-slate-400">
      今週のランキングはまだ集計中です。
      <br />
      アクセスが貯まると順位が表示されます。
    </div>
  );
}

// 店舗系（店舗／総合）の一覧。行の見た目は共通。
function SalonList({ items }: { items: SalonRankItem[] }) {
  if (items.length === 0) return <EmptyState />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((s) => (
        <li key={s.id}>
          <Link
            href={`/salon/${s.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-pink-50/30 transition-colors"
          >
            <RankBadge rank={s.rank} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800 truncate">{s.name || '—'}</p>
              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                <AreaChip area={s.area} />
                <AreaChip area={s.area2} />
              </div>
            </div>
            <Chevron />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function RankingTabs({
  overallRanking,
  salonRanking,
  therapistRanking,
}: {
  overallRanking: SalonRankItem[];
  salonRanking: SalonRankItem[];
  therapistRanking: TherapistRankItem[];
}) {
  const [tab, setTab] = useState<'overall' | 'salon' | 'therapist'>('overall');

  return (
    <div>
      {/* タブ（総合 / 店舗 / セラピスト）。角なし・隙間なしのセグメント。スマホは幅いっぱい、PCは中央寄せ・自動幅。 */}
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
                } ${
                  selected
                    ? 'relative z-10 bg-pink-50 text-pink-600 border-pink-300'
                    : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 総合ランキング（店舗＋所属セラピストの合算・店舗表示） ── */}
      {tab === 'overall' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <SalonList items={overallRanking} />
        </div>
      )}

      {/* ── 店舗ランキング ── */}
      {tab === 'salon' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <SalonList items={salonRanking} />
        </div>
      )}

      {/* ── セラピストランキング ── */}
      {tab === 'therapist' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          {therapistRanking.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-slate-100">
              {therapistRanking.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/therapist/${t.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-pink-50/30 transition-colors"
                  >
                    <RankBadge rank={t.rank} />
                    <span className="flex-shrink-0 w-11 h-11 rounded-full overflow-hidden bg-slate-100 relative">
                      {t.profileImageUrl ? (
                        <Image
                          src={t.profileImageUrl}
                          alt={t.name}
                          fill
                          className="object-cover"
                          sizes="44px"
                        />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center text-slate-300 font-bold">
                          {t.name.charAt(0) || '—'}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-800 truncate">{t.name || '—'}</span>
                      {t.salonName && (
                        <span className="block text-[11px] text-slate-400 truncate">{t.salonName}</span>
                      )}
                    </span>
                    <Chevron />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400 text-center mt-4 leading-relaxed">
        ※ 総合は「店舗＋所属セラピスト全員」の週間アクセスを合算した順位です。<br />
        毎週月曜0時（日本時間）に新しい週の集計へ切り替わります。
      </p>
    </div>
  );
}
