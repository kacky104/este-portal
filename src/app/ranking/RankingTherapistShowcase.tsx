import Link from 'next/link';
import Image from 'next/image';
import { RankDelta } from './RankDelta';
import { AutoFitText } from '@/app/components/AutoFitText';
import { FeatureBadges } from '@/components/FeatureBadges';
import { ShowcaseDutyBadge } from './ShowcaseDutyBadge';
import { areaLabel } from '@/app/lib/areaLabel';
import type { SalonTheme } from '@/app/lib/themes';
import { parseBodyType } from '@/lib/bodyType';

// セラピストランキング1位の豪華ショーケース。枠の左半分を大きな写真カードにする。
export function RankingTherapistShowcase({
  rank,
  id,
  name,
  salonName,
  area,
  profileImageUrl,
  bodyType,
  featureBadges,
  catchphrase,
  isAvailableNow,
  availableUntil,
  isAvailableNowCast,
  availableUntilCast,
  todayIsActive,
  todayStart,
  todayEnd,
  prevRank,
  theme,
  compact = false,
}: {
  rank: number;
  id: number;
  name: string;
  salonName: string;
  area: string | null;
  profileImageUrl: string | null;
  bodyType: string | null;
  featureBadges: string[];
  catchphrase: string | null;
  isAvailableNow: boolean;
  availableUntil: string | null;
  isAvailableNowCast: boolean;
  availableUntilCast: string | null;
  todayIsActive: boolean;
  todayStart: string | null;
  todayEnd: string | null;
  prevRank?: number;
  theme: SalonTheme;
  compact?: boolean;
}) {
  const darkTheme = theme.key === 'black';
  const nameColor = darkTheme ? theme.heading : '#334155';
  const subColor = darkTheme ? theme.body : '#64748b';
  // 順位ごとの配色（1=金 / 2=銀 / 3=銅）。
  const MEDAL: Record<number, { border: string; button: string; circle: string; stroke: string; num: string; ribbonL: string; ribbonR: string; area: string }> = {
    1: { border: 'linear-gradient(135deg,#F9D976,#E8A317,#F7C948,#B8860B)', button: 'linear-gradient(to right,#E8A317,#F7C948)', circle: '#E8A317', stroke: '#CE8C0C', num: '#5A3E00', ribbonL: '#D64550', ribbonR: '#B23742', area: 'bg-amber-50 text-amber-700 border-amber-200' },
    2: { border: 'linear-gradient(135deg,#F5F5F7,#B8BCC2,#E4E6E9,#8E9297)', button: 'linear-gradient(to right,#9AA0A6,#C9CDD3)', circle: '#C2C6CC', stroke: '#8E9297', num: '#3A3F45', ribbonL: '#6B7280', ribbonR: '#4B5563', area: 'bg-slate-50 text-slate-600 border-slate-200' },
    3: { border: 'linear-gradient(135deg,#EABF98,#B87333,#D89C66,#8A5323)', button: 'linear-gradient(to right,#B87333,#D89C66)', circle: '#CD7F32', stroke: '#9C5A21', num: '#4A2A10', ribbonL: '#C05B2E', ribbonR: '#94421F', area: 'bg-orange-50 text-orange-700 border-orange-200' },
    4: { border: 'linear-gradient(135deg,#E7EDF5,#9FB3C8,#D6E0EC,#7D93AB)', button: 'linear-gradient(to right,#7D93AB,#A9BED2)', circle: '#8FA6BC', stroke: '#6B8199', num: '#2C3E50', ribbonL: '#5B7186', ribbonR: '#425568', area: 'bg-slate-50 text-slate-600 border-slate-200' },
  };
  const m = MEDAL[rank <= 3 ? rank : 4] ?? MEDAL[1];
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
    <div className="mb-5 p-[2.5px] shadow-md" style={{ background: m.border }}>
      <div style={{ background: darkTheme ? theme.card : '#ffffff' }}>
        <div className={`flex ${compact ? 'h-44' : ''}`}>
          {/* 左半分：セラピストの大きな写真カード */}
          <Link
            href={`/therapist/${id}`}
            className={`relative block flex-shrink-0 overflow-hidden bg-slate-100 group ${compact ? 'w-[37.5%] h-full' : 'w-1/2 aspect-[3/4]'}`}
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
            {/* 出勤バッジ（画像右上） */}
            <ShowcaseDutyBadge
              isAvailableNow={isAvailableNow}
              availableUntil={availableUntil}
              isAvailableNowCast={isAvailableNowCast}
              availableUntilCast={availableUntilCast}
              todayIsActive={todayIsActive}
              todayStart={todayStart}
              todayEnd={todayEnd}
            />
          </Link>

          {/* 右半分：情報 */}
          <div className={`flex-1 min-w-0 flex flex-col justify-start px-1 ${compact ? 'gap-0.5 py-1 overflow-hidden' : 'gap-1.5 py-2'}`}>
            {/* 順位バッジ（位置そのまま）＋右隣に 名前(上)／スリーサイズ(下) */}
            <div className="flex items-start gap-1 min-w-0">
              <span className="flex-shrink-0 w-12 h-12" aria-label={`第${rank}位`}>
                <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow" aria-hidden>
                  <path d="M36 48 L24 92 L40 82 L45 94 L52 60 Z" fill={m.ribbonL} />
                  <path d="M64 48 L76 92 L60 82 L55 94 L48 60 Z" fill={m.ribbonR} />
                  <circle cx="50" cy="40" r="30" fill={m.circle} stroke={m.stroke} strokeWidth="3" />
                  <text x="50" y="51" textAnchor="middle" fontSize="30" fontWeight="900" fill={m.num}>{rank}</text>
                </svg>
              </span>
              <span className="flex-shrink-0 -ml-2 mt-1"><RankDelta current={rank} prev={prevRank} /></span>
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
            {/* キャッチフレーズ（特徴バッジの下・中央寄せ） */}
            {!compact && catchphrase && (
              <AutoFitText text={catchphrase} max={13} min={10} className="mt-auto font-bold text-center" style={{ color: '#db2777' }} />
            )}
            {/* エリアバッジ・ボタン・店名を一番下へ寄せる */}
            <div className={`mt-auto flex flex-col ${compact ? 'gap-0.5 pt-0.5' : 'gap-1.5 pt-1.5'}`}>
              {area && (
                <span className={`inline-block self-center text-[10px] px-2 py-0.5 rounded-full border font-medium ${m.area}`}>{areaLabel(area)}</span>
              )}
              <Link
                href={`/therapist/${id}`}
                className="flex items-center justify-center gap-1.5 py-2 rounded-full text-white text-[13px] font-bold shadow-sm hover:opacity-90 transition-opacity"
                style={{ background: m.button }}
              >
                このセラピストを見る
                <span aria-hidden>→</span>
              </Link>
              {/* 店名（中央寄せ） */}
              {salonName && <span className="max-w-full text-center text-[12px] truncate" style={{ color: subColor }}>{salonName}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
