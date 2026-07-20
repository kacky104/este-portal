import Link from 'next/link';
import Image from 'next/image';
import { RankDelta } from './RankDelta';
import { areaLabel } from '@/app/lib/areaLabel';
import type { SalonTheme } from '@/app/lib/themes';
import { formatBodySizes } from '@/lib/bodyType';

// セラピストランキング1位の豪華ショーケース。枠の左半分を大きな写真カードにする。
export function RankingTherapistShowcase({
  id,
  name,
  salonName,
  area,
  profileImageUrl,
  bodyType,
  prevRank,
  theme,
}: {
  id: number;
  name: string;
  salonName: string;
  area: string | null;
  profileImageUrl: string | null;
  bodyType: string | null;
  prevRank?: number;
  theme: SalonTheme;
}) {
  const darkTheme = theme.key === 'black';
  const nameColor = darkTheme ? theme.heading : '#334155';
  const subColor = darkTheme ? theme.body : '#64748b';
  const bodySizes = formatBodySizes(bodyType);
  return (
    <div className="mb-5 p-[2.5px] shadow-md" style={{ background: 'linear-gradient(135deg,#F9D976,#E8A317,#F7C948,#B8860B)' }}>
      <div style={{ background: darkTheme ? theme.card : '#ffffff' }}>
        <div className="flex">
          {/* 左半分：セラピストの大きな写真カード */}
          <Link
            href={`/therapist/${id}`}
            className="relative block w-1/2 flex-shrink-0 aspect-[3/4] overflow-hidden bg-slate-100 group"
          >
            {profileImageUrl ? (
              <Image
                src={profileImageUrl}
                alt={name}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
                sizes="(max-width:640px) 46vw, 230px"
              />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-slate-300 font-bold text-3xl">{name.charAt(0) || '—'}</span>
            )}
          </Link>

          {/* 右半分：情報 */}
          <div className="flex-1 min-w-0 flex flex-col justify-start gap-1.5 p-2">
            <div className="flex items-center gap-1 min-w-0">
              <span className="flex-shrink-0 w-12 h-12" aria-label="第1位">
                <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow" aria-hidden>
                  <path d="M36 48 L24 92 L40 82 L45 94 L52 60 Z" fill="#D64550" />
                  <path d="M64 48 L76 92 L60 82 L55 94 L48 60 Z" fill="#B23742" />
                  <circle cx="50" cy="40" r="30" fill="#E8A317" stroke="#CE8C0C" strokeWidth="3" />
                  <text x="50" y="51" textAnchor="middle" fontSize="30" fontWeight="900" fill="#5A3E00">1</text>
                </svg>
              </span>
              <span className="flex-shrink-0 -ml-2"><RankDelta current={1} prev={prevRank} /></span>
              <Link href={`/therapist/${id}`} className="min-w-0 ml-1 hover:opacity-90 transition-opacity">
                <span className="block text-lg font-black truncate" style={{ color: nameColor }}>{name || '—'}</span>
              </Link>
            </div>
            {bodySizes && <span className="text-[12px] font-semibold truncate" style={{ color: nameColor }}>{bodySizes}</span>}
            {salonName && <span className="text-[12px] truncate" style={{ color: subColor }}>{salonName}</span>}
            {area && (
              <span className="inline-block self-start text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">{areaLabel(area)}</span>
            )}
            <Link
              href={`/therapist/${id}`}
              className="mt-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-white text-[13px] font-bold shadow-sm hover:opacity-90 transition-opacity"
              style={{ background: 'linear-gradient(to right,#E8A317,#F7C948)' }}
            >
              このセラピストを見る
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
