'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { RankDelta } from './RankDelta';
import { salonMetaText } from './salonMeta';
import { AutoFitText } from '@/app/components/AutoFitText';
import type { ShowcaseSalonData, ShowcaseCard } from '@/app/lib/ranking';

// フィッシャー–イエーツでシャッフル（クライアント描画専用）。
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 画像ありを優先し最大 count 枚を選ぶ。randomize=false は SSR/初期表示用（決定的）。
function pickCards(list: ShowcaseCard[], count: number, randomize: boolean): ShowcaseCard[] {
  const withImg = list.filter((t) => t.img);
  const noImg = list.filter((t) => !t.img);
  const a = randomize ? [...shuffle(withImg), ...shuffle(noImg)] : [...withImg, ...noImg];
  return a.slice(0, count);
}

// 総合ランキングのショーケース。1〜3位=8枚(4×2)＋金/銀/銅、4位以降=4枚(1行)＋ダーク。
// データはサーバーで一括取得したものを props で受け取る（個別 fetch なし＝高速）。
export default function RankingTopShowcase({
  rank,
  salonId,
  salonName,
  area,
  area2,
  dispatchType,
  prevRank,
  data,
}: {
  rank: number;
  salonId: number;
  salonName: string;
  area: string | null;
  area2: string | null;
  dispatchType: 'none' | 'available' | 'only';
  prevRank?: number;
  data: ShowcaseSalonData;
}) {
  const count = rank <= 3 ? 8 : 4;
  // SSRは決定的な並び、マウント後にシャッフル（開くたびランダム・ハイドレーション不整合なし）。
  const [cards, setCards] = useState<ShowcaseCard[]>(() => pickCards(data.therapists, count, false));
  useEffect(() => {
    setCards(pickCards(data.therapists, count, true));
  }, [data.therapists, count]);

  const metaText = salonMetaText(area, area2, dispatchType);
  const detailLine = [
    data.price || null,
    `営業時間：${data.hours || '問い合わせ'}`,
    `定休日：${data.closedDays || '問い合わせ'}`,
  ].filter(Boolean).join(' / ');

  // 順位バッジ：1金/2銀/3銅はリボンメダル、4位以降は番号バッジ。
  const medal =
    rank === 1 ? { c: '#E8A317', s: '#CE8C0C', r: '#F7C948', n: '#5A3E00' }
    : rank === 2 ? { c: '#C4CBD4', s: '#9AA3AE', r: '#E4E9EF', n: '#37414D' }
    : rank === 3 ? { c: '#D69A62', s: '#A96B36', r: '#EAC29A', n: '#5A3418' }
    : null;

  // 順位別の外枠色（1金/2銀/3銅、4位以降は薄いグレーのノーマル枠）。中身（背景）は全順位とも白。
  const frameBg =
    rank === 1 ? 'linear-gradient(135deg,#F9D976,#E8A317,#F7C948,#B8860B)'
    : rank === 2 ? 'linear-gradient(135deg,#EEF1F5,#AEB8C2,#D7DEE5,#8A94A0)'
    : rank === 3 ? 'linear-gradient(135deg,#EEC59B,#CD8B54,#E7B98F,#A96B36)'
    : 'linear-gradient(135deg,#E5E7EB,#CBD5E1)';
  const innerCls = 'bg-white p-1';
  const nameColor = '#334155';
  const metaColor = '#64748b';
  const catchColor =
    rank === 1 ? '#B8860B'
    : rank === 2 ? '#6B7684'
    : rank === 3 ? '#A96B36'
    : '#64748B';
  const cardPlaceholder = 'bg-slate-100';
  // 「この店舗を見る」ボタンも順位色に合わせる（白文字が読める濃さの左→右グラデ）。
  const buttonBg =
    rank === 1 ? 'linear-gradient(to right,#E8A317,#F7C948)'
    : rank === 2 ? 'linear-gradient(to right,#8A94A0,#AEB8C2)'
    : rank === 3 ? 'linear-gradient(to right,#A96B36,#CD8B54)'
    : 'linear-gradient(to right,#64748B,#94A3B8)';

  return (
    <div className="mb-5 p-[2.5px] shadow-md" style={{ background: frameBg }}>
      <div className={innerCls}>
        {/* ヘッダー：左に順位バッジ、右に店名（1行オートフィット） */}
        <div className="flex items-center gap-2 mb-2">
          <span className="flex-shrink-0 w-14 h-14" aria-label={`第${rank}位`}>
            {medal ? (
              <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm" aria-hidden>
                <path d="M36 48 L24 92 L40 82 L45 94 L52 60 Z" fill="#D64550" />
                <path d="M64 48 L76 92 L60 82 L55 94 L48 60 Z" fill="#B23742" />
                <circle cx="50" cy="40" r="30" fill={medal.c} stroke={medal.s} strokeWidth="3" />
                <circle cx="50" cy="40" r="30" fill="none" stroke={medal.r} strokeWidth="1.5" strokeDasharray="2 3" />
                <text x="50" y="51" textAnchor="middle" fontSize="30" fontWeight="900" fill={medal.n}>{rank}</text>
              </svg>
            ) : (
              <span
                className="w-full h-full rounded-full flex items-center justify-center font-black text-base shadow-sm"
                style={{ background: 'linear-gradient(135deg,#E5E7EB,#9CA3AF)', color: '#1f2937', border: '1px solid #cbd5e1' }}
              >
                {rank}
              </span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <Link href={`/salon/${salonId}`} className="block hover:opacity-90 transition-opacity">
              <AutoFitText text={salonName || '—'} max={22} min={12} className="font-black" style={{ color: nameColor }} />
            </Link>
            <div className="mt-0.5 flex items-center gap-1.5">
              <RankDelta current={rank} prev={prevRank} />
              <span className="min-w-0 truncate text-[11px]" style={{ color: metaColor }}>{metaText}</span>
            </div>
          </div>
        </div>

        {/* 所属セラピスト（1〜3位=8枚/4×2、4位以降=4枚/1行・ランダム） */}
        {cards.length > 0 && (
          <div className="grid grid-cols-4">
            {cards.map((c) => (
              <Link
                key={c.id}
                href={`/therapist/${c.id}`}
                className={`relative block aspect-[3/4] overflow-hidden group ${cardPlaceholder}`}
              >
                {c.img ? (
                  <Image
                    src={c.img}
                    alt={c.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                    sizes="(max-width:640px) 24vw, 130px"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-slate-400 font-bold text-lg">
                    {c.name.charAt(0) || '—'}
                  </span>
                )}
                {c.isNew && (
                  <span className="absolute top-1 left-1 text-[8px] font-bold px-1 py-0.5 rounded-full bg-emerald-500 text-white leading-none">
                    NEW
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1 pt-3 pb-1">
                  <p className="text-white text-[10px] font-bold leading-tight truncate drop-shadow">
                    {c.name}
                    {c.age && <span className="text-[9px] font-normal opacity-90">（{c.age}）</span>}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* キャッチフレーズ＋料金/営業時間/定休日（1行） */}
        {(data.catchphrase || data.price || data.hours || data.closedDays) && (
          <div className="mt-2 text-center leading-relaxed">
            {data.catchphrase && (
              <p className="text-[13px] font-bold leading-snug" style={{ color: catchColor }}>{data.catchphrase}</p>
            )}
            <AutoFitText text={detailLine} max={12} min={9} className="mt-1 text-center" style={{ color: metaColor }} />
          </div>
        )}

        {/* 店舗ページへ */}
        <Link
          href={`/salon/${salonId}`}
          className="mt-3 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-white text-sm font-bold shadow-sm hover:opacity-90 transition-opacity"
          style={{ background: buttonBg }}
        >
          この店舗を見る
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
