'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/app/lib/supabase/client';
import { areaLabel } from '@/app/lib/areaLabel';
import { RankDelta } from './RankDelta';
import { SalonTypeBadge } from './SalonTypeBadge';
import { AutoFitText } from '@/app/components/AutoFitText';

type Card = { id: string; name: string; age: string | null; img: string | null; isNew: boolean };

// フィッシャー–イエーツでシャッフル（クライアント描画専用）。
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 総合ランキング1位の豪華ショーケース。
// その店舗の所属セラピストを最大8枚（4列×2段）ランダムで表示する。金枠＋王冠で豪華に。
export default function RankingTopShowcase({
  salonId,
  salonName,
  area,
  dispatchType,
  prevRank,
}: {
  salonId: number;
  salonName: string;
  area: string | null;
  dispatchType: 'none' | 'available' | 'only';
  prevRank?: number;
}) {
  const [cards, setCards] = useState<Card[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('therapists')
        .select('id, name, age, profile_image_url, is_new_face')
        .eq('salon_id', salonId);
      if (!active || !data) return;
      // 画像ありを優先し、それぞれシャッフルして最大8枚。
      const withImg = shuffle(data.filter((t) => t.profile_image_url));
      const noImg = shuffle(data.filter((t) => !t.profile_image_url));
      const pick = [...withImg, ...noImg].slice(0, 8).map((t) => ({
        id: String(t.id),
        name: (t.name as string) ?? '',
        age: (t.age as string | null) ?? null,
        img: (t.profile_image_url as string | null) ?? null,
        isNew: Boolean(t.is_new_face),
      }));
      setCards(pick);
    })();
    return () => {
      active = false;
    };
  }, [salonId]);

  return (
    <div
      className="mb-5 p-[2.5px] shadow-md"
      style={{ background: 'linear-gradient(135deg,#F9D976,#E8A317,#F7C948,#B8860B)' }}
    >
      <div className="bg-white p-1">
        {/* ヘッダー：左上に「王冠＋1」バッジ、店名は中央（右にバッジ幅スペーサーで中央寄せ・1行オートフィット） */}
        <div className="flex items-center gap-2 mb-2">
          <span className="flex-shrink-0 w-14 h-14" aria-label="第1位">
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm" aria-hidden>
              <path d="M36 48 L24 92 L40 82 L45 94 L52 60 Z" fill="#D64550" />
              <path d="M64 48 L76 92 L60 82 L55 94 L48 60 Z" fill="#B23742" />
              <circle cx="50" cy="40" r="30" fill="#E8A317" stroke="#CE8C0C" strokeWidth="3" />
              <circle cx="50" cy="40" r="30" fill="none" stroke="#F7C948" strokeWidth="1.5" strokeDasharray="2 3" />
              <text x="50" y="51" textAnchor="middle" fontSize="30" fontWeight="900" fill="#5A3E00">1</text>
            </svg>
          </span>
          <div className="min-w-0 flex-1 text-center">
            <Link href={`/salon/${salonId}`} className="block hover:opacity-90 transition-opacity">
              <AutoFitText text={salonName || '—'} max={20} min={12} className="text-center font-black text-slate-900" />
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center justify-center gap-1.5">
              <RankDelta current={1} prev={prevRank} />
              {area && (
                <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-100 font-medium">
                  {areaLabel(area)}
                </span>
              )}
              <SalonTypeBadge dispatchType={dispatchType} />
            </div>
          </div>
          <span className="flex-shrink-0 w-14" aria-hidden />
        </div>

        {/* 所属セラピスト：最大8枚（4列×2段・ランダム） */}
        {cards.length > 0 && (
          <div className="grid grid-cols-4">
            {cards.map((c) => (
              <Link
                key={c.id}
                href={`/therapist/${c.id}`}
                className="relative block aspect-[3/4] overflow-hidden bg-slate-100 group"
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
                  <span className="absolute inset-0 flex items-center justify-center text-slate-300 font-bold text-lg">
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

        {/* 店舗ページへ */}
        <Link
          href={`/salon/${salonId}`}
          className="mt-3 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-white text-sm font-bold shadow-sm hover:opacity-90 transition-opacity"
          style={{ background: 'linear-gradient(to right,#E8A317,#F7C948)' }}
        >
          この店舗を見る
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
