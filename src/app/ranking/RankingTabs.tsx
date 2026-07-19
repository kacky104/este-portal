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

function Views({ views }: { views: number }) {
  return (
    <span className="flex-shrink-0 text-right">
      <span className="text-sm font-black text-slate-800 tabular-nums">{views.toLocaleString()}</span>
      <span className="ml-0.5 text-[10px] text-slate-400 font-medium">アクセス</span>
    </span>
  );
}

function EmptyState() {
  return (
    <div className="py-14 text-center text-sm text-slate-400">
      今週のアクセスデータはまだありません。
      <br />
      集計が貯まると順位が表示されます。
    </div>
  );
}

export default function RankingTabs({
  salonRanking,
  therapistRanking,
}: {
  salonRanking: SalonRankItem[];
  therapistRanking: TherapistRankItem[];
}) {
  const [tab, setTab] = useState<'salon' | 'therapist'>('salon');

  return (
    <div>
      {/* タブ（店舗 / セラピスト）。/admin 等と同系統のピンクチップ。 */}
      <div className="flex justify-center gap-2 mb-5">
        {([
          ['salon', '店舗', salonRanking.length],
          ['therapist', 'セラピスト', therapistRanking.length],
        ] as const).map(([key, label, count]) => {
          const selected = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={selected}
              className={`inline-flex items-center gap-1.5 px-6 py-2.5 rounded-full border text-sm font-bold transition-colors ${
                selected
                  ? 'bg-pink-50 text-pink-600 border-pink-300'
                  : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
              }`}
            >
              {label}
              <span
                className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black leading-none ${
                  selected ? 'bg-pink-500 text-white' : 'bg-slate-100 text-slate-400'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── 店舗ランキング ── */}
      {tab === 'salon' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          {salonRanking.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="divide-y divide-slate-100">
              {salonRanking.map((s) => (
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
                    <Views views={s.views} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
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
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-pink-50/30 transition-colors">
                    <RankBadge rank={t.rank} />
                    <Link href={`/therapist/${t.id}`} className="flex items-center gap-3 min-w-0 flex-1">
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
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-slate-800 truncate">{t.name || '—'}</span>
                        {t.salonName && (
                          <span className="block text-[11px] text-slate-400 truncate">{t.salonName}</span>
                        )}
                      </span>
                    </Link>
                    <Views views={t.views} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400 text-center mt-4 leading-relaxed">
        ※ アクセス数は各詳細ページの週間閲覧数を集計したものです。<br />
        毎週月曜0時（日本時間）にリセットされ、新しい週の集計が始まります。
      </p>
    </div>
  );
}
