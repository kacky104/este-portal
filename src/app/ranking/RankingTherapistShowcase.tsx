import Link from 'next/link';
import Image from 'next/image';
import { RankDelta } from './RankDelta';
import { AutoFitText } from '@/app/components/AutoFitText';
import { FeatureBadges } from '@/components/FeatureBadges';
import { areaLabel } from '@/app/lib/areaLabel';
import type { SalonTheme } from '@/app/lib/themes';
import { parseBodyType } from '@/lib/bodyType';

// セラピストランキング1位の豪華ショーケース。枠の左半分を大きな写真カードにする。
export function RankingTherapistShowcase({
  id,
  name,
  salonName,
  area,
  profileImageUrl,
  bodyType,
  featureBadges,
  prevRank,
  theme,
}: {
  id: number;
  name: string;
  salonName: string;
  area: string | null;
  profileImageUrl: string | null;
  bodyType: string | null;
  featureBadges: string[];
  prevRank?: number;
  theme: SalonTheme;
}) {
  const darkTheme = theme.key === 'black';
  const nameColor = darkTheme ? theme.heading : '#334155';
  const subColor = darkTheme ? theme.body : '#64748b';
  const bd = parseBodyType(bodyType);
  const cup = bd?.cup ?? null;
  // スリーサイズ（カップ数は出さない。カップは画像上のバッジで表示）。
  const bodySizes = bd
    ? [
        bd.height && `T${bd.height}`,
        bd.bust && `B${bd.bust}`,
        bd.waist && `W${bd.waist}`,
        bd.hip && `H${bd.hip}`,
      ]
        .filter(Boolean)
        .join(' ')
    : '';

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
            {cup && (
              <span className="absolute bottom-2 left-2 flex items-center justify-center w-11 h-11 rounded-full bg-gradient-to-br from-pink-500 to-rose-600 text-white text-2xl font-black leading-none shadow-lg ring-2 ring-white/80">
                {cup.toUpperCase()}
              </span>
            )}
          </Link>

          {/* 右半分：情報 */}
          <div className="flex-1 min-w-0 flex flex-col justify-start gap-1.5 px-1 py-2">
            {/* 順位バッジ（位置そのまま）＋右隣に 名前(上)／スリーサイズ(下) */}
            <div className="flex items-start gap-1 min-w-0">
              <span className="flex-shrink-0 w-12 h-12" aria-label="第1位">
                <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow" aria-hidden>
                  <path d="M36 48 L24 92 L40 82 L45 94 L52 60 Z" fill="#D64550" />
                  <path d="M64 48 L76 92 L60 82 L55 94 L48 60 Z" fill="#B23742" />
                  <circle cx="50" cy="40" r="30" fill="#E8A317" stroke="#CE8C0C" strokeWidth="3" />
                  <text x="50" y="51" textAnchor="middle" fontSize="30" fontWeight="900" fill="#5A3E00">1</text>
                </svg>
              </span>
              <span className="flex-shrink-0 -ml-2 mt-1"><RankDelta current={1} prev={prevRank} /></span>
              <div className="flex-1 min-w-0 ml-1">
                {/* 名前（バッジの上・2行になる場合はフォント縮小で1行に） */}
                <Link href={`/therapist/${id}`} className="block hover:opacity-90 transition-opacity">
                  <AutoFitText text={name || '—'} max={18} min={12} className="font-black text-center" style={{ color: nameColor }} />
                </Link>
                {/* スリーサイズ（名前の下・こちらも1行に自動フィット） */}
                {bodySizes && (
                  <AutoFitText text={bodySizes} max={15} min={11} className="font-bold mt-0.5 text-center" style={{ color: nameColor }} />
                )}
              </div>
            </div>
            {/* 特徴バッジ（順位バッジの下・中央寄せ） */}
            <FeatureBadges badges={featureBadges} className="justify-center" />
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
