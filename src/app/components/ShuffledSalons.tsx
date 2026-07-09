'use client';

import { useState, useEffect, useRef, Fragment } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { checkDutyStatus } from '@/lib/dutyStatus';
import { isNewFaceActive } from '@/lib/newFace';
import { isImasuguLiveCamel } from '@/lib/imasugu';
import { NewBadge } from '@/components/NewBadge';
import { SalonNameRow } from './SalonNameRow';
import { SaveButton } from './SaveButton';
import { useSalonTherapists, type TherapistThumb } from './useSalonTherapists';
import { areaLabel } from '../lib/areaLabel';
import { areaHref, DISPATCH_AREA } from '../lib/areas';
import { shuffleEvery30min } from '@/lib/shuffle';
import type { Salon } from '@/app/lib/salons';

export type { Salon };

const GRADIENTS = [
  'from-pink-300 to-rose-400',
  'from-fuchsia-300 to-pink-400',
  'from-rose-300 to-pink-500',
  'from-pink-400 to-fuchsia-400',
];

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  return (
    <span className="flex items-center gap-px">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < full ? 'text-pink-500' : 'text-slate-300'} style={{ fontSize: '14px', lineHeight: 1 }}>
          ★
        </span>
      ))}
    </span>
  );
}

// 口コミ評価の表示（カード共通）。0件は「口コミなし」、1件以上は ★＋数値（小数1位）＋件数。
// 各表示箇所の flex コンテナ内に並べる前提で、要素を Fragment で返す。
function RatingDisplay({ rating, reviewCount }: { rating: number; reviewCount: number }) {
  if (reviewCount === 0) {
    return <span className="text-slate-400 text-xs">口コミなし</span>;
  }
  return (
    <>
      <StarRating rating={rating} />
      <span className="text-pink-600 font-bold text-sm">{rating.toFixed(1)}</span>
      <span className="text-slate-400 text-xs">({reviewCount}件)</span>
    </>
  );
}

// ── Therapist mini card (matches TherapistScroller Card design) ──

function TherapistMiniCard({ therapist, index, showAge = false, compact = false }: { therapist: TherapistThumb; index: number; showAge?: boolean; compact?: boolean }) {
  const grad = GRADIENTS[index % GRADIENTS.length];
  const dutyStatus = !therapist.onDuty
    ? 'off'
    : !therapist.workHours
      ? 'onDuty'
      : checkDutyStatus(therapist.workHours).status;
  const availableNow = isImasuguLiveCamel(therapist);

  return (
    <Link
      href={`/therapist/${therapist.id}`}
      className={`relative flex-shrink-0 ${compact ? 'w-[92px] h-[134px]' : 'w-[105px] h-[153px]'} overflow-hidden shadow-md hover:-translate-y-1 hover:shadow-xl transition-all duration-300`}
      onClick={e => e.stopPropagation()}
    >
      {/* background */}
      {therapist.imageUrl ? (
        <Image src={therapist.imageUrl} alt={therapist.name} fill className="object-cover" sizes="120px" />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${grad} flex items-center justify-center`}>
          <span className="text-white/30 font-bold text-3xl">{therapist.name.charAt(0)}</span>
        </div>
      )}

      {/* bottom gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />

      {/* 右上バッジ：今すぐの子は出勤状況バッジを出さず、今すぐを点滅表示。それ以外は出勤状況バッジ。 */}
      {availableNow ? (
        <span className="absolute top-1.5 right-1.5 animate-pulse" style={{ background: 'linear-gradient(to right, #ec4899, #f97316)', color: 'white', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' }}>
          今すぐ
        </span>
      ) : (
        <>
          {dutyStatus === 'off' && (
            <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/90 text-slate-400 border border-slate-200">
              お休み
            </span>
          )}
          {dutyStatus === 'onDuty' && (
            <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white text-emerald-500 border border-emerald-100 animate-pulse">
              出勤中
            </span>
          )}
          {dutyStatus === 'before' && (
            <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/90 text-blue-500 border border-blue-100">
              出勤予定
            </span>
          )}
          {dutyStatus === 'after' && (
            <span className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/90 text-slate-400 border border-slate-200">
              受付終了
            </span>
          )}
        </>
      )}

      {/* text overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-2 text-white">
        {showAge && isNewFaceActive(therapist.isNewFace, therapist.newFaceSince) && (
          <div className="mb-0.5"><NewBadge /></div>
        )}
        <div className="flex items-center gap-1 min-w-0">
          <p className="font-bold text-[11px] leading-tight drop-shadow line-clamp-1 min-w-0">{therapist.name}</p>
          {showAge && therapist.age && (
            <span className="font-bold text-[11px] leading-tight drop-shadow flex-shrink-0">（{therapist.age}）</span>
          )}
          {!showAge && isNewFaceActive(therapist.isNewFace, therapist.newFaceSince) && <NewBadge />}
        </div>
        {therapist.workHours && (dutyStatus === 'onDuty' || dutyStatus === 'before') && (
          <p className={`text-pink-200 font-medium mt-0.5 text-center ${compact ? 'text-[11px] whitespace-nowrap' : 'text-[13px]'}`}>{therapist.workHours}</p>
        )}
      </div>
    </Link>
  );
}

// ── Therapist mini cards row (hover auto-scroll / touch swipe) ──

function TherapistMiniCardsRow({ therapists, salonId, showAge = false, compact = false }: { therapists: TherapistThumb[]; salonId: number; showAge?: boolean; compact?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef    = useRef<number | null>(null);

  const startScroll = () => {
    const step = () => {
      const el = scrollRef.current;
      if (!el) return;
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 1) return;
      el.scrollLeft += 1.2;
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  const stopScroll = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const displayed = therapists.slice(0, 10);

  return (
    <div
      ref={scrollRef}
      className="flex gap-[3px] overflow-x-auto pb-1"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
      onMouseEnter={startScroll}
      onMouseLeave={stopScroll}
      onClick={e => e.stopPropagation()}
    >
      {displayed.map((t, i) => (
        <TherapistMiniCard key={t.id} therapist={t} index={i} showAge={showAge} compact={compact} />
      ))}

      {/* View-all button */}
      <Link
        href={`/salon/${salonId}`}
        className={`relative flex-shrink-0 ${compact ? 'w-[92px] h-[134px]' : 'w-[105px] h-[153px]'} rounded-2xl overflow-hidden border border-pink-200 bg-gradient-to-b from-pink-50 to-fuchsia-100 flex flex-col items-center justify-center gap-2 hover:from-pink-100 hover:to-fuchsia-200 transition-colors shadow-sm`}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-10 rounded-full bg-white/70 flex items-center justify-center shadow-sm">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-pink-500">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        </div>
        <p className="text-[11px] font-bold text-pink-600 text-center leading-snug">
          一覧を<br />見る
        </p>
      </Link>
    </div>
  );
}

// ── 店名の1行自動縮小（デスクトップ wideLayout 用） ──
// 店名行が2行になりそうなとき、利用可能幅に収まるまでフォントを段階的に下げて1行を保つ。
// flex 行の中で min-w-0 により自分の幅が縮むので、その幅に対して文字幅を測って縮小する。
function WideAutoFitName({ name }: { name: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const MAX = 18; // 既定（text-lg 相当。zoom で表示はさらに拡大される）
  const MIN = 11;
  const [size, setSize] = useState(MAX);

  useEffect(() => {
    const fit = () => {
      const c = containerRef.current;
      const t = textRef.current;
      if (!c || !t) return;
      let s = MAX;
      t.style.fontSize = `${s}px`;
      while (t.scrollWidth > c.clientWidth && s > MIN) {
        s -= 0.5;
        t.style.fontSize = `${s}px`;
      }
      setSize(s);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [name]);

  return (
    <div ref={containerRef} className="min-w-0 overflow-hidden">
      <span
        ref={textRef}
        className="inline-block max-w-full whitespace-nowrap font-bold text-slate-900 group-hover:text-pink-700 transition-colors leading-snug"
        style={{ fontSize: `${size}px`, overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {name}
      </span>
    </div>
  );
}

// ── Salon card ────────────────────────────────────────────────

export function SalonCard({ salon, therapists, showAge = false, areaNextToDuty = false, ratingAtBottom = false, compactTherapists = false, showSaveButton = false, wideDesktop = false, nameBanner = false }: { salon: Salon; therapists: TherapistThumb[]; showAge?: boolean; areaNextToDuty?: boolean; ratingAtBottom?: boolean; compactTherapists?: boolean; showSaveButton?: boolean; wideDesktop?: boolean; nameBanner?: boolean }) {
  const router = useRouter();
  const onDutyCount = therapists.filter(t => t.onDuty).length;

  // 共通の小要素（モバイル/デスクトップ両レイアウトで使い回し）
  const hoursEl = (
    <span className="inline-flex items-center gap-1 text-xs text-slate-500 min-w-0">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 flex-shrink-0">
        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
      </svg>
      <span className="truncate">{salon.hours}</span>
    </span>
  );
  const dutyBadge = (
    <span className="inline-flex items-center gap-1 flex-shrink-0" style={{ background: '#fef3c7', color: '#92400e', borderRadius: '20px', padding: '3px 10px', fontSize: '12px' }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#92400e', flexShrink: 0 }}>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
      出勤 <span style={{ color: '#ec4899', fontSize: '15px', fontWeight: 700 }}>{onDutyCount}</span>名
    </span>
  );
  // 出張バッジ：only（出張のみ）のときだけ出す（青）。available/none では出さない。
  const dispatchBadge = salon.dispatchType === 'only' ? (
    <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-300">
      出張のみ
    </span>
  ) : null;
  // 地域バッジ（ピンク）＋出張バッジをまとめて1要素に（areaBadge を出す全箇所で揃う）。
  // エリアが「出張」のサロンは拠点地域が無いので地域バッジは出さない。
  const areaBadge = (
    <>
      {salon.area !== DISPATCH_AREA && (
        <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-200">
          {areaLabel(salon.area)}
        </span>
      )}
      {dispatchBadge}
    </>
  );
  const ratingEl = (
    <div className="flex items-center gap-1.5">
      <RatingDisplay rating={salon.rating} reviewCount={salon.reviewCount} />
    </div>
  );
  const priceEl = <p className="text-pink-600 font-bold text-sm whitespace-nowrap flex-shrink-0">{salon.price}</p>;
  const detailBtn = (
    <span className="flex-shrink-0 px-4 py-2 rounded-xl bg-pink-600 text-white font-bold text-xs group-hover:bg-pink-500 transition-colors shadow-sm shadow-pink-500/20">
      詳しく見る →
    </span>
  );
  const therapistThumbs = therapists.length > 0 ? (
    <div className={compactTherapists ? 'mb-2' : 'mb-4'}>
      <TherapistMiniCardsRow therapists={therapists} salonId={salon.id} showAge={showAge} compact={compactTherapists} />
    </div>
  ) : null;

  // ── 従来（モバイル/タブレット）の縦積みレイアウト ──
  const stackedLayout = (
    <div className={`flex flex-col flex-1${wideDesktop ? ' lg:hidden' : ''}`}>
      {/* 1. サロン名（＋トップページのみ保存ボタン）。1行自動縮小。
          バナー時（nameBanner）はカード上端の全幅帯で店名を描画するため、ここでは出さない。 */}
      {nameBanner ? null : showSaveButton ? (
        <SalonNameRow salonId={salon.id} salonName={salon.name} showSaveButton />
      ) : (
        <h3 className="font-bold text-lg text-slate-900 group-hover:text-pink-700 transition-colors leading-snug mb-3">
          {salon.name}
        </h3>
      )}

      {/* 2. 評価・エリア・タグなどの情報。
          compactTherapists（トップ/保存）はバッジ行（出勤数・地域）の上下余白を半分に
          （上: 店名 mb-3=12px を -mt-1.5 で 6px に、下: バッジ行 mb-1=4px ＋ ブロック mb-0.5=2px の計6px）。 */}
      <div className={compactTherapists ? 'mb-0.5 -mt-1.5' : 'mb-2'}>
        {/* Hours + 出勤中バッジ（営業時間は ratingAtBottom=トップ/保存では下の料金横に移動するためここでは非表示） */}
        <div className={`flex items-center gap-2 text-xs flex-wrap ${compactTherapists ? 'mb-1' : 'mb-2'}`}>
          {!ratingAtBottom && (
            <div className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 flex-shrink-0">
                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
              </svg>
              <span className="text-slate-500">{salon.hours}</span>
            </div>
          )}
          {dutyBadge}
          {areaNextToDuty && areaBadge}
        </div>

        {/* Stars + count + area */}
        {!ratingAtBottom && (
          <div className="flex items-center gap-2 mb-2">
            <RatingDisplay rating={salon.rating} reviewCount={salon.reviewCount} />
            {!areaNextToDuty && areaBadge}
          </div>
        )}
      </div>

      {/* 3. セラピスト写真の横スクロール */}
      {therapistThumbs}

      {/* Rating (top page) or Price + CTA */}
      <div className={`flex items-center justify-between ${compactTherapists ? 'pt-[5px]' : 'pt-3.5'} border-t border-slate-200 mt-auto`}>
        {ratingAtBottom ? (
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <RatingDisplay rating={salon.rating} reviewCount={salon.reviewCount} />
            </div>
            {/* 料金の右隣に営業時間（1行固定：料金はフル表示、営業時間が縮む/省略） */}
            <div className="flex items-center gap-2 min-w-0 flex-nowrap">
              <p className="text-pink-600 font-bold text-sm whitespace-nowrap flex-shrink-0">{salon.price}</p>
              {hoursEl}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-[11px] text-slate-400 mb-0.5">料金目安</p>
            <p className="text-pink-600 font-bold text-sm whitespace-nowrap">{salon.price}</p>
          </div>
        )}
        {detailBtn}
      </div>
    </div>
  );

  // ── デスクトップ1列・幅広レイアウト（lg のみ。トップページ wideDesktop 時） ──
  const wideLayout = wideDesktop && (
    <div className="hidden lg:flex lg:flex-col flex-1">
      {/* 1段目: 店名（長い場合はフォント自動縮小で1行維持）→ 営業時間 → 地域 →（右端）保存ボタン */}
      <div className="flex items-center gap-2.5 mb-2.5">
        {/* バナー時（nameBanner）は店名・保存ボタンをカード上端の全幅帯へ移すため、ここでは出さない。 */}
        {!nameBanner && <WideAutoFitName name={salon.name} />}
        {hoursEl}
        {areaBadge}
        {!nameBanner && showSaveButton && (
          <span className="ml-auto flex-shrink-0">
            <SaveButton kind="salon" item={{ id: salon.id, name: salon.name }} variant="paw" />
          </span>
        )}
      </div>

      {/* 2段目: ☆評価 → 料金 → 出勤数 →（右端）詳しく見る。上に細い区切り線。
          1行固定（折り返さない）：料金・出勤はフル表示、評価側が min-w-0 で縮む。 */}
      <div className="flex items-center gap-3 min-w-0 flex-nowrap pt-2.5 mb-3 border-t border-slate-200/70">
        <div className="min-w-0 flex items-center gap-1.5 overflow-hidden">{ratingEl}</div>
        {priceEl}
        {dutyBadge}
        <span className="ml-auto flex-shrink-0">{detailBtn}</span>
      </div>

      {/* 3段目: セラピストサムネ列 */}
      {therapistThumbs}
    </div>
  );

  return (
    <div
      className={`group border border-slate-200 bg-white shadow-sm hover:border-pink-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-pink-500/10 transition-all duration-300 flex flex-col cursor-pointer overflow-hidden${
        // デスクトップ(lg)はセラピストカード5枚ぶん（5×92+4×3=472）＋左右パディング40 = 512px。
        // salon-card-zoom で lg のみ比率そのまま拡大（512px×1.413≒723px）。左寄せのため右側に余白。モバイル/タブレットは無効。
        wideDesktop ? ' lg:w-[512px] lg:max-w-full salon-card-zoom' : ''
      }`}
      onClick={() => router.push(`/salon/${salon.id}`)}
    >
      {/* Pink shimmer top line */}
      <div className="h-px bg-gradient-to-r from-transparent via-pink-400/60 to-transparent" />

      {/* トップページのみ：店名の全幅バナー帯（淡ピンクグラデ＋濃ピンク文字）。保存ボタンも帯内に置く。
          店名はモバイル/デスクトップ共通のため、ここでカードレベルに1回だけ描画する。 */}
      {nameBanner && (
        <div
          className="px-5 py-1"
          style={{
            background: 'linear-gradient(to right, #fdf2f8, #fce7f3)',
            borderBottom: '1px solid #fbcfe8',
          }}
        >
          <SalonNameRow salonId={salon.id} salonName={salon.name} showSaveButton={showSaveButton} nameBanner />
        </div>
      )}

      {/* トップページ（compactTherapists）はカード下の余白を約1/3（pb 20px→7px）に。
          nameBanner 時は店名が上端のバナー帯へ移っているため、本体の上パディングを pt-5(20px)→pt-2.5(10px) に
          詰めて、バッジ行の上の空白を下の空白（PC: mb-2.5=10px／SP: -mt-1.5補正後 約4px）と揃える。 */}
      <div className={`${compactTherapists ? `px-5 ${nameBanner ? 'pt-2.5' : 'pt-5'} pb-[7px]` : nameBanner ? 'px-5 pt-2.5 pb-5' : 'p-5'} flex flex-col flex-1`}>
        {stackedLayout}
        {wideLayout}
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────

function SalonCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white animate-pulse shadow-sm overflow-hidden">
      <div className="h-px bg-pink-100" />
      <div className="p-5 space-y-3.5">
        <div className="flex justify-between gap-2">
          <div className="h-4 bg-slate-200 rounded-lg w-2/3" />
          <div className="h-5 w-16 bg-slate-200 rounded-full flex-shrink-0" />
        </div>
        <div className="h-3 bg-slate-200 rounded-lg w-1/2" />
        <div className="h-3 bg-slate-200 rounded-lg w-1/3" />
        <div className="flex gap-1.5">
          <div className="h-5 w-16 bg-slate-200 rounded-full" />
          <div className="h-5 w-14 bg-slate-200 rounded-full" />
        </div>
        <div className="flex gap-[3px]">
          {[1, 2, 3].map(i => (
            <div key={i} className="w-[105px] h-[153px] bg-slate-200 rounded-2xl flex-shrink-0" />
          ))}
        </div>
        <div className="space-y-2">
          <div className="h-3 bg-slate-200 rounded-lg" />
          <div className="h-3 bg-slate-200 rounded-lg w-5/6" />
        </div>
      </div>
    </div>
  );
}

// ── ShuffledSalons ────────────────────────────────────────────

export function ShuffledSalons({ salons, areas, showAge = false, areaNextToDuty = false, ratingAtBottom = false, compactTherapists = false, showSaveButton = false, wideDesktop = false, nameBanner = false, tabsAsLinks = false, currentArea, includeDispatch = false, heading, shuffleSalt = '', showAreaTitle = false, insertBlocks }: { salons: Salon[]; areas: string[]; showAge?: boolean; areaNextToDuty?: boolean; ratingAtBottom?: boolean; compactTherapists?: boolean; showSaveButton?: boolean; wideDesktop?: boolean; nameBanner?: boolean; tabsAsLinks?: boolean; currentArea?: string; includeDispatch?: boolean; heading?: React.ReactNode; shuffleSalt?: string; showAreaTitle?: boolean; insertBlocks?: { afterIndex: number; node: React.ReactNode; zoom?: boolean }[] }) {
  const [list,            setList]            = useState<Salon[]>([]);
  const [activeArea,      setActiveArea]      = useState('福岡全域');
  // tabsAsLinks 時はページ自体が絞り込み対象を表すため、currentArea を選択中エリアとして使う
  // （クリックは別ページへの遷移＝Link。内部の activeArea state は使わない）。
  const activeAreaEffective = currentArea ?? activeArea;

  // セラピストサムネイル取得は共有フックに集約（保存ページと同一ロジック）
  const salonTherapists = useSalonTherapists(salons);

  // shuffle on mount：30分ごとに1度だけ並びが変わる決定的シャッフル（同じ30分は誰がリロードしても同じ、
  // :00/:30 で入れ替わる）。salt でトップ/地域/各エリアを独立に回す。クライアント mount で確定するため
  // ISR キャッシュ（revalidate=600）を凍結させない（初期 list=[] で SSR とクライアント初期描画は一致＝不一致なし）。
  useEffect(() => {
    setList(shuffleEvery30min(salons, shuffleSalt));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // エリア一致判定。includeDispatch 時（出張ページ）は、選択中の出張エリアに限り
  // dispatch_type が none 以外（available/only）のサロンも OR で含める。
  const matchesArea = (s: Salon, area: string) =>
    s.area === area || (includeDispatch && area === activeAreaEffective && s.dispatchType !== 'none');

  const filtered =
    activeAreaEffective === '福岡全域' ? list : list.filter(s => matchesArea(s, activeAreaEffective));

  /* ── Area filter tabs ── */
  const tabs = (
    <div className="mb-8">
      <div
        className="flex flex-wrap justify-center gap-1 pb-2 sm:flex-nowrap sm:justify-start sm:gap-2 sm:overflow-x-auto"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
      >
        {areas.map(area => {
          const active = activeAreaEffective === area;
          const cls = `flex-shrink-0 flex items-center px-2 py-1 rounded-full text-sm font-medium transition-all sm:gap-1.5 sm:px-4 sm:py-2 ${
            active
              ? 'bg-pink-600 text-white shadow-md shadow-pink-500/25'
              : 'border border-slate-200 bg-white text-slate-600 hover:border-pink-300 hover:text-pink-600 shadow-sm'
          }`;
          const inner = areaLabel(area);
          return tabsAsLinks ? (
            <Link key={area} href={areaHref(area)} className={cls} aria-current={active ? 'page' : undefined}>
              {inner}
            </Link>
          ) : (
            <button key={area} onClick={() => setActiveArea(area)} className={cls}>
              {inner}
            </button>
          );
        })}
      </div>
    </div>
  );

  // 地域タブ（tabs）の直上に出すセクション見出し「エリアから探す」。
  // 本体の既存セクション見出し（「出勤中のセラピスト」等）と同一マークアップ：
  // 左のグラデ縦バー ＋ 標準色（text-slate-900）のタイトル。フクエス本体のTOP/地域ページのみ表示。
  const areaSectionTitle = showAreaTitle ? (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-1 h-6 rounded-full bg-gradient-to-b from-pink-400 to-rose-500" />
      <h2 className="text-xl font-bold text-slate-900">
        エリアから探す
      </h2>
    </div>
  ) : null;

  // 地域見出し→地域バッジ列（tabs）を最上部に置き、その下に見出し（heading）→ カード一覧の順で表示する。
  const tabsAndHeading = (
    <>
      {areaSectionTitle}
      {tabs}
      {heading}
    </>
  );

  if (list.length === 0) {
    return (
      <>
        {tabsAndHeading}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {salons.map(s => <SalonCardSkeleton key={s.id} />)}
        </div>
      </>
    );
  }

  if (filtered.length === 0) {
    return (
      <>
        {tabsAndHeading}
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-4 opacity-40">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <p className="text-sm">このエリアの掲載サロンはまだありません</p>
        </div>
        {/* 0件エリアでもピックアップ枠等の挿入ブロックは出す（カードが無いだけで枠は表示したい）。
            ラッパ幅は通常時の zoom:false ブロックと同じ（723px＝カード列と同じ幅感）。 */}
        {[...(insertBlocks ?? [])]
          .filter((b) => b.node != null)
          .sort((a, b) => a.afterIndex - b.afterIndex)
          .map((b, i) => (
            <div key={`empty-block-${i}`} className="my-6 lg:w-[calc(512px*1.413)] lg:max-w-full">
              {b.node}
            </div>
          ))}
      </>
    );
  }

  const cards = filtered.map(salon => (
    <SalonCard
      key={salon.id}
      salon={salon}
      therapists={salonTherapists[salon.id] ?? []}
      showAge={showAge}
      areaNextToDuty={areaNextToDuty}
      ratingAtBottom={ratingAtBottom}
      compactTherapists={compactTherapists}
      showSaveButton={showSaveButton}
      wideDesktop={wideDesktop}
      nameBanner={nameBanner}
    />
  ));

  // ブロック挿入（insertBlocks 指定時のみ。トップページが渡す）：カード配列を各 afterIndex の直下で分割する。
  // 並び順・件数・フィルタ（filtered/cards）には一切手を触れず、描画位置の分割のみ行う（既存ロジック不変）。
  // afterIndex 昇順にセグメント分割し、各セグメント直後に対応ブロックを差し込む。カードが afterIndex 枚未満の
  // ブロックは「その時点の最後のカードの直下（＝最下部）」に出る。
  const blocks = [...(insertBlocks ?? [])]
    .filter((b) => b.node != null)
    .sort((a, b) => a.afterIndex - b.afterIndex);
  const hasInsert = blocks.length > 0;
  // segments.length === blocks.length + 1（最後のセグメントは末尾ブロック以降の残り）。
  const segments: React.ReactNode[][] = [];
  let segStart = 0;
  for (const b of blocks) {
    segments.push(cards.slice(segStart, b.afterIndex));
    segStart = b.afterIndex;
  }
  segments.push(cards.slice(segStart));

  // デスクトップのトップ（wideDesktop）：左にカード列（左寄せ・約723px）、右の余白に縦長ブロック。
  // 外側 flex の items-stretch で縦長ブロックの高さがカード列に揃う＝下端が最後尾カードに一致。
  if (wideDesktop) {
    return (
      <>
        {tabsAndHeading}
        <div className="lg:flex lg:gap-5 lg:items-stretch">
          {hasInsert ? (
            // 左カラムを1つの flex 子にまとめ、その内部でカード列をセグメント分割して各ブロックを挟む（右カラムの2分割を避ける）。
            // Fragment で余分なDOMを増やさず、grid/ブロックを lg:flex-shrink-0 の直接の子に保つ（従来の描画・余白を維持）。
            <div className="lg:flex-shrink-0">
              {segments.map((seg, i) => (
                <Fragment key={`seg-${i}`}>
                  {(i === 0 || seg.length > 0) && (
                    <div className={`grid sm:grid-cols-2 lg:grid-cols-1 lg:justify-items-start gap-5${i > 0 ? ' mt-5' : ''}`}>{seg}</div>
                  )}
                  {blocks[i] && (
                    // zoom:true（バナー）は card と同じ基準幅512px＋salon-card-zoom(≒×1.413)＝723px で左右端をカードに一致。
                    // zoom:false（新人スクローラー等）は等倍のまま、ラッパ幅を zoom:true の実効幅 calc(512px*1.413)=723.456px に固定
                    //   ＝カード列と左右端を一致させつつ、lg:flex-shrink-0 列が内部 overflow-x-auto の中身幅まで拡張して
                    //   ページ横スクロールを起こすのを防ぐ（内部スクロールに収める）。zoom/幅指定は lg のみ＝SP不変。
                    <div className={blocks[i].zoom ? 'my-6 lg:w-[512px] lg:max-w-full salon-card-zoom' : 'my-6 lg:w-[calc(512px*1.413)] lg:max-w-full'}>{blocks[i].node}</div>
                  )}
                </Fragment>
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-1 lg:justify-items-start lg:flex-shrink-0 gap-5">
              {cards}
            </div>
          )}
          {/* 右の縦長カラム（lg のみ表示・幅は余白いっぱい）。fukuXバナー＋「準備中」ブロックを縦に積む。 */}
          <div className="hidden lg:flex lg:flex-1 flex-col gap-5">
            {/* fukuX バナー（独立ブロック・「準備中」の直前）。クリックで /x へ。アスペクト比1200:630維持で歪ませない。 */}
            <Link
              href="/x"
              aria-label="fukuX メンズエステ専用SNS"
              className="block border border-pink-100 overflow-hidden shadow-sm"
            >
              <Image
                src="/ogp-fukux.png"
                alt="fukuX メンズエステ専用SNS"
                width={1200}
                height={630}
                className="w-full h-auto"
              />
            </Link>
            {/* 既存「PRこの枠は準備中です」ブロック（中身・見た目とも不変。flex-1 で残り高さを埋める）。 */}
            <aside className="flex-1 flex flex-col rounded-2xl border border-pink-100 bg-gradient-to-b from-pink-50 via-white to-fuchsia-50/40 overflow-hidden shadow-sm">
              <div className="p-6 text-center">
                <div className="w-12 h-12 mx-auto rounded-full bg-white border border-pink-200 flex items-center justify-center shadow-sm mb-3">
                  <span className="text-pink-500 text-xl leading-none">◆</span>
                </div>
                <p className="text-sm font-bold text-pink-600 mb-1">PR</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">この枠は準備中です</p>
              </div>
            </aside>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {tabsAndHeading}
      {hasInsert ? (
        segments.map((seg, i) => (
          <Fragment key={`seg-${i}`}>
            {(i === 0 || seg.length > 0) && (
              <div className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-5${i > 0 ? ' mt-5' : ''}`}>{seg}</div>
            )}
            {/* 非wideDesktop（zoom列なし）：ブロックはフル幅の通常ブロックで元々 overflow しないが、
                内部 overflow-x-auto を container 幅内に確実に収める（max-w-full min-w-0＝flex文脈に置かれても膨張しない）。 */}
            {blocks[i] && <div className="my-6 max-w-full min-w-0">{blocks[i].node}</div>}
          </Fragment>
        ))
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {cards}
        </div>
      )}
    </>
  );
}
