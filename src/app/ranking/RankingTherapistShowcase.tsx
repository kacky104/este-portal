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
  isAvailableNowImport,
  availableUntilImport,
  todayIsActive,
  todayStart,
  todayEnd,
  prevRank,
  theme,
  compact = false,
  mini = false,
  micro = false,
  nano = false,
  medalWallpaperUrl = null,
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
  isAvailableNowImport: boolean;
  availableUntilImport: string | null;
  todayIsActive: boolean;
  todayStart: string | null;
  todayEnd: string | null;
  prevRank?: number;
  theme: SalonTheme;
  compact?: boolean;
  mini?: boolean;
  micro?: boolean;
  nano?: boolean;
  /** ★ 1〜10位の地に敷くテーマ壁紙（1位=gold / 2位=silver / 3位=yellow / 4〜6位=purple / 7〜10位=green）。
   *  ★ どれを渡すかは呼ぶ側（RankingTabs）が決める。
   *  ★ 未設定（null）なら白のまま。 */
  medalWallpaperUrl?: string | null;
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
    11: { border: 'linear-gradient(135deg,#F4F7FB,#CBD6E2,#EAF0F6,#B4C3D4)', button: 'linear-gradient(to right,#AEBECF,#D2DBE7)', circle: '#C6D1DD', stroke: '#A2B2C3', num: '#64748B', ribbonL: '#9AA9BB', ribbonR: '#8090A2', area: 'bg-slate-50 text-slate-500 border-slate-200' },
    21: { border: 'linear-gradient(135deg,#FBFCFE,#DFE7EF,#F3F7FB,#CDD8E3)', button: 'linear-gradient(to right,#CBD6E2,#E6ECF3)', circle: '#DCE3EB', stroke: '#C0CCD8', num: '#8A97A6', ribbonL: '#BCC7D4', ribbonR: '#A8B6C4', area: 'bg-slate-50 text-slate-400 border-slate-100' },
    31: { border: 'linear-gradient(135deg,#FDFEFF,#E9EEF4,#F8FAFC,#DAE1EA)', button: 'linear-gradient(to right,#DAE2EB,#EFF3F7)', circle: '#E7ECF1', stroke: '#D0D8E0', num: '#A6B0BC', ribbonL: '#D0D8E1', ribbonR: '#C2CBD5', area: 'bg-slate-50 text-slate-400 border-slate-100' },
  };
  const m = MEDAL[nano ? 31 : micro ? 21 : mini ? 11 : rank <= 3 ? rank : 4] ?? MEDAL[1];
  const tight = compact || mini; // 4位以降の詰めレイアウト
  // カップ数バッジのサイズ（カードが小さいほど縮小）。
  const cupCls = micro ? 'bottom-1 left-1 w-6 h-6 text-[11px] ring-1' : tight ? 'bottom-1.5 left-1.5 w-8 h-8 text-base ring-1' : 'bottom-2 left-2 w-10 h-10 text-xl ring-2';
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

  // ★ 1〜10位は、白地の代わりに順位ごとの壁紙を敷く（薄く・文字が読める濃さで）。
  //   ★ 1位=ゴールド / 2位=シルバー / 3位=イエロー / 4〜6位=パープル / 7〜10位=グリーン
  //     （2026-09-09・カッキーさんの指示。★ どの色を渡すかは呼ぶ側＝RankingTabs が決める）。
  //   ★ 11位以降（mini・micro・nano）はカードが小さいので白のまま。
  const wallpaperTier = !mini && !micro && !nano;
  const topThreeBgStyle: React.CSSProperties =
    wallpaperTier && !darkTheme && medalWallpaperUrl
      ? {
          backgroundColor: '#ffffff',
          backgroundImage: `linear-gradient(rgba(255,255,255,0.88), rgba(255,255,255,0.88)), url(${medalWallpaperUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : { background: darkTheme ? theme.card : '#ffffff' };

  return (
    <div className={`p-[2.5px] shadow-md ${rank >= 30 && rank <= 39 ? 'mb-[5px]' : rank >= 20 && rank <= 29 ? 'mb-[10px]' : rank >= 10 && rank <= 19 ? 'mb-[15px]' : 'mb-5'}`} style={{ background: m.border }}>
      {/* ★★ 1〜10位の地は【順位ごとのテーマ壁紙】
          （1位=ゴールド／2位=シルバー／3位=イエロー／4〜6位=パープル／7〜10位=グリーン）。
          ★ そのまま敷くと名前・スリーサイズが読めないので、白を88%(E0)重ねて薄い金の地にする
            （★ 店舗詳細やランキングの背景と同じ「壁紙＋不透明オーバーレイ」の作法）。
          ★ 11位以降・ブラックテーマ・壁紙が未設定のときは、今までどおり白（theme.card）。 */}
      <div style={topThreeBgStyle}>
        <div className={`flex ${nano ? 'aspect-[16/3]' : compact ? 'h-44 sm:h-auto' : ''}`}>
          {/* 左半分：セラピストの大きな写真カード。
              ★ 1〜3位（既定サイズ）だけ lg 以上で 1/2 → 1/4 に細くする（2026-08-20 第25便・案A-2）。
                カードの高さは縦長写真（3:4）が決めるため、PCの広い幅（1150px）で 1/2 のままだと
                写真が縦に伸び、右の情報欄の下6割が空白になる（実測: 空き291px）。
                lg:w-1/4 なら高さが下がって情報欄と釣り合う。lg 未満（スマホ・タブレット）は従来のまま。 */}
          <Link
            href={`/therapist/${id}`}
            className={`relative block flex-shrink-0 overflow-hidden bg-slate-100 group ${nano ? 'w-[16%] h-full' : micro ? 'w-[18.75%] aspect-[3/4]' : mini ? 'w-1/4 aspect-[3/4]' : compact ? 'w-[37.5%] h-full sm:h-auto sm:aspect-[3/4]' : 'w-1/2 lg:w-1/4 aspect-[3/4]'}`}
          >
            {profileImageUrl ? (
              <Image
                src={profileImageUrl}
                alt={name}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
                sizes="(max-width:640px) 46vw, 288px"
              />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-slate-300 font-bold text-3xl">{name.charAt(0) || '—'}</span>
            )}
            {cup && (
              <span className={`absolute flex items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-rose-600 text-white font-black leading-none shadow-lg ring-white/80 ${cupCls}`}>
                {cup.toUpperCase()}
              </span>
            )}
            {/* 出勤バッジ（画像右上。11位以降は地域バッジ横に移動するためここでは非表示） */}
            {!mini && (
              <ShowcaseDutyBadge
                isAvailableNow={isAvailableNow}
                availableUntil={availableUntil}
                isAvailableNowCast={isAvailableNowCast}
                availableUntilCast={availableUntilCast}
                isAvailableNowImport={isAvailableNowImport}
                availableUntilImport={availableUntilImport}
                todayIsActive={todayIsActive}
                todayStart={todayStart}
                todayEnd={todayEnd}
              />
            )}
          </Link>

          {/* 右半分：情報 */}
          <div className={`flex-1 min-w-0 flex flex-col justify-start px-1 ${tight ? 'gap-0.5 py-1' : 'gap-1.5 py-2'} ${compact || micro ? 'overflow-hidden' : ''}`}>
            {/* 順位バッジ（位置そのまま）＋右隣に 名前(上)／スリーサイズ(下) */}
            <div className="flex items-start gap-1 min-w-0">
              {/* ★ 31位以降（nano）は横長で背が低いので、順位バッジも小さくする（2026-09-09）。 */}
              <span className={`flex-shrink-0 ${nano ? 'w-9 h-9' : 'w-12 h-12'}`} aria-label={`第${rank}位`}>
                <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow" aria-hidden>
                  <path d="M36 48 L24 92 L40 82 L45 94 L52 60 Z" fill={m.ribbonL} />
                  <path d="M64 48 L76 92 L60 82 L55 94 L48 60 Z" fill={m.ribbonR} />
                  <circle cx="50" cy="40" r="30" fill={m.circle} stroke={m.stroke} strokeWidth="3" />
                  <text x="50" y="51" textAnchor="middle" fontSize="30" fontWeight="900" fill={m.num}>{rank}</text>
                </svg>
              </span>
              <span className="flex-shrink-0 -ml-2 mt-1"><RankDelta current={rank} prev={prevRank} /></span>
              <div className="flex-1 min-w-0 ml-1">
                {micro ? (
                  <>
                    {/* 名前＋スリーサイズを横並び */}
                    <div className={`flex items-baseline gap-1 min-w-0 ${nano ? 'justify-start' : 'justify-center'}`}>
                      <Link href={`/therapist/${id}`} className="min-w-0 hover:opacity-90 transition-opacity">
                        <span className="block text-[14px] font-black truncate" style={{ color: nameColor }}>{name || '—'}</span>
                      </Link>
                      {bodySizes && (
                        <span className="flex-shrink-0 text-[10px] font-bold whitespace-nowrap" style={{ color: nameColor }}>{bodySizes}</span>
                      )}
                      {nano && (
                        <Link
                          href={`/therapist/${id}`}
                          className="ml-auto self-center flex-shrink-0 inline-flex items-center gap-0.5 rounded-full text-white text-[9px] font-bold px-1.5 py-0.5 shadow-sm hover:opacity-90 transition-opacity"
                          style={{ background: m.button }}
                        >
                          見る<span aria-hidden>→</span>
                        </Link>
                      )}
                    </div>
                    {/* スリーサイズがあった場所に 出勤バッジ＋地域バッジ */}
                    <div className={`flex items-center gap-1 mt-0.5 min-w-0 ${nano ? 'justify-start' : 'justify-center'}`}>
                      <ShowcaseDutyBadge
                        isAvailableNow={isAvailableNow}
                        availableUntil={availableUntil}
                        isAvailableNowCast={isAvailableNowCast}
                        availableUntilCast={availableUntilCast}
                        isAvailableNowImport={isAvailableNowImport}
                        availableUntilImport={availableUntilImport}
                        todayIsActive={todayIsActive}
                        todayStart={todayStart}
                        todayEnd={todayEnd}
                        className="flex-shrink-0"
                      />
                      {area && (
                        <span className={`flex-shrink-0 inline-block text-[10px] px-2 py-0.5 rounded-full border font-medium ${m.area}`}>{areaLabel(area)}</span>
                      )}
                      {nano && salonName && (
                        <span className="min-w-0 flex-1 text-[10px] truncate" style={{ color: subColor }}>{salonName}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {/* 名前（バッジの上・2行になる場合はフォント縮小で1行に）
                        ★★ 1〜3位は PC（lg以上）だけ大きくする（2026-09-09・カッキーさんの指示）。
                          ★ AutoFitText は文字サイズを JS で決めるので、CSS の lg: では変えられない。
                            → 【2つ描いて片方を隠す】。★ 隠れている側は幅0で min まで縮むが、見えないので害はない
                              （画面幅を変えると resize で測り直される）。
                          ★ 4位以降（tight）は今までどおり1つだけ。 */}
                    <Link href={`/therapist/${id}`} className="block hover:opacity-90 transition-opacity">
                      {!tight ? (
                        <>
                          <div className="lg:hidden">
                            <AutoFitText text={name || '—'} max={18} min={12} className="font-black text-center" style={{ color: nameColor }} />
                          </div>
                          <div className="hidden lg:block">
                            <AutoFitText text={name || '—'} max={28} min={18} className="font-black text-center" style={{ color: nameColor }} />
                          </div>
                        </>
                      ) : (
                        <AutoFitText text={name || '—'} max={18} min={12} className="font-black text-center" style={{ color: nameColor }} />
                      )}
                    </Link>
                    {/* スリーサイズ（名前の下・こちらも1行に自動フィット） */}
                    {bodySizes && (
                      !tight ? (
                        <>
                          <div className="lg:hidden">
                            <AutoFitText text={bodySizes} max={15} min={11} className="font-bold mt-0.5 text-center" style={{ color: nameColor }} />
                          </div>
                          <div className="hidden lg:block">
                            <AutoFitText text={bodySizes} max={21} min={14} className="font-bold mt-1 text-center" style={{ color: nameColor }} />
                          </div>
                        </>
                      ) : (
                        <AutoFitText text={bodySizes} max={15} min={11} className="font-bold mt-0.5 text-center" style={{ color: nameColor }} />
                      )
                    )}
                  </>
                )}
              </div>
            </div>
            {/* 特徴バッジ（順位バッジの下・中央寄せ。11位以降は非表示） */}
            {!mini && <FeatureBadges badges={featureBadges} className="justify-center" />}
            {/* キャッチフレーズ（特徴バッジの下・中央寄せ）
                ★★ 4〜10位（compact）は【白い空白のまん中】に出す（2026-09-09・カッキーさんの指示）。
                  ★ 特徴バッジとボタンの間が大きく空いていたので、その余白そのものに置く。
                  ★ flex-1 で余白を丸ごともらい、その中で上下中央に。★ 下のボタン等は mt-auto のまま動かない。
                ★ 11位以降（mini・micro・nano）はカードが低いので、今までどおり出さない。 */}
            {catchphrase && !mini && (
              compact ? (
                // ★ 出すのは PC（lg以上）だけ（2026-09-09・カッキーさんの指示）。
                //   ★ スマホ〜タブレットの 4〜10位は高さ固定（h-44）で余白が無い。★ 今までどおり出さない。
                <div className="hidden lg:flex flex-1 min-h-0 items-center justify-center px-1">
                  {/* ★ PCのキャッチフレーズは2倍（13→26 / 最小10→20。2026-09-09・カッキーさんの指示）。
                      ★ 入りきらないぶんは AutoFitText が最小まで自動で縮める。 */}
                  <AutoFitText text={catchphrase} max={26} min={20} className="w-full font-bold text-center" style={{ color: '#db2777' }} />
                </div>
              ) : (
                !tight && (
                  <>
                    <div className="lg:hidden mt-auto">
                      <AutoFitText text={catchphrase} max={13} min={10} className="font-bold text-center" style={{ color: '#db2777' }} />
                    </div>
                    <div className="hidden lg:block mt-auto">
                      {/* ★ PCのキャッチフレーズは2倍（18→36 / 最小13→26。2026-09-09・カッキーさんの指示）。 */}
                      <AutoFitText text={catchphrase} max={36} min={26} className="font-bold text-center" style={{ color: '#db2777' }} />
                    </div>
                  </>
                )
              )
            )}
            {/* エリアバッジ・ボタン・店名を一番下へ寄せる */}
            <div className={`mt-auto flex flex-col ${tight ? 'gap-0.5 pt-0.5' : 'gap-1.5 pt-1.5'}`}>
              {micro ? null : mini ? (
                <div className="self-center flex items-center justify-center gap-1">
                  <ShowcaseDutyBadge
                    isAvailableNow={isAvailableNow}
                    availableUntil={availableUntil}
                    isAvailableNowCast={isAvailableNowCast}
                    availableUntilCast={availableUntilCast}
                    isAvailableNowImport={isAvailableNowImport}
                    availableUntilImport={availableUntilImport}
                    todayIsActive={todayIsActive}
                    todayStart={todayStart}
                    todayEnd={todayEnd}
                    className="flex-shrink-0"
                  />
                  {area && (
                    <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full border font-medium ${m.area}`}>{areaLabel(area)}</span>
                  )}
                </div>
              ) : (
                area && (
                  <span className={`inline-block self-center px-2 py-0.5 rounded-full border font-medium ${m.area} ${tight ? 'text-[10px]' : 'text-[10px] lg:text-[13px] lg:px-3 lg:py-1'}`}>{areaLabel(area)}</span>
                )
              )}
              {!nano && (
                <Link
                  href={`/therapist/${id}`}
                  className={`flex items-center justify-center gap-1.5 rounded-full text-white font-bold shadow-sm hover:opacity-90 transition-opacity ${tight ? 'py-2 text-[13px]' : 'py-2 text-[13px] lg:py-3 lg:text-[17px]'}`}
                  style={{ background: m.button }}
                >
                  このセラピストを見る
                  <span aria-hidden>→</span>
                </Link>
              )}
              {/* 店名（中央寄せ） */}
              {!nano && salonName && (
                <span className={`max-w-full text-center truncate ${tight ? 'text-[12px]' : 'text-[12px] lg:text-[15px]'}`} style={{ color: subColor }}>{salonName}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
