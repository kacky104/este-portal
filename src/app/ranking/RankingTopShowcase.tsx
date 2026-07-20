'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/app/lib/supabase/client';
import { areaLabel } from '@/app/lib/areaLabel';

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
}: {
  salonId: number;
  salonName: string;
  area: string | null;
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
      className="mb-5 rounded-3xl p-[2.5px] shadow-md"
      style={{ background: 'linear-gradient(135deg,#F9D976,#E8A317,#F7C948,#B8860B)' }}
    >
      <div className="rounded-[22px] bg-white p-4">
        {/* ヘッダー：王冠バッジ ＋ 第1位ラベル ＋ 店名 */}
        <div className="flex items-center gap-3 mb-3">
          <span
            className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center shadow"
            style={{ background: 'linear-gradient(135deg,#F7C948,#E8A317)', border: '1px solid #E8A317' }}
          >
            <svg viewBox="0 0 576 512" width="22" height="22" fill="#5A3E00" aria-hidden>
              <path d="M309 106c11.4-7 19-19.7 19-34 0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34l-39.5 74c-9.8 16.4-32.4 20-47 7.4L86 158c5-6.4 8-14.4 8-23 0-22.1-17.9-40-40-40S14 92.9 14 115s17.9 40 40 40c1.7 0 3.5-.1 5.1-.3l45.5 244.5c3.2 17.9 18.8 30.8 37 30.8h332.8c18.2 0 33.8-12.9 37-30.8L516.9 154.7c1.7.2 3.4.3 5.1.3 22.1 0 40-17.9 40-40s-17.9-40-40-40-40 17.9-40 40c0 8.6 3 16.6 8 23l-76.5 69.9c-14.6 12.6-37.2 9-47-7.4L309 106z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black tracking-wide" style={{ color: '#B8860B' }}>総合ランキング 第1位</p>
            <Link
              href={`/salon/${salonId}`}
              className="block text-lg font-black text-slate-900 truncate hover:text-pink-600 transition-colors"
            >
              {salonName || '—'}
            </Link>
            {area && (
              <span className="inline-block mt-0.5 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                {areaLabel(area)}
              </span>
            )}
          </div>
        </div>

        {/* 所属セラピスト：最大8枚（4列×2段・ランダム） */}
        {cards.length > 0 && (
          <div className="grid grid-cols-4 gap-1.5">
            {cards.map((c) => (
              <Link
                key={c.id}
                href={`/therapist/${c.id}`}
                className="relative block aspect-[3/4] overflow-hidden rounded-lg bg-slate-100 group shadow-sm ring-1 ring-amber-100"
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
