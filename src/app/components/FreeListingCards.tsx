'use client';

import { useRouter } from 'next/navigation';
import { SalonNameRow } from './SalonNameRow';
import { areaLabel } from '@/app/lib/areaLabel';
import { DISPATCH_AREA } from '@/app/lib/areas';
import type { FreeListing } from '@/app/lib/salons';

// 無料掲載枠（listing_plan='free'）のカード。TOP のカード一覧の一番下に、
// 有料店のカードと同じ見た目で1列に並べる（第369便）。
// ★ 見出しは付けない（有料店と地続きに見せる＝カッキーさん指示 2026-09-15）。
// ★★ 有料カード（ShuffledSalons.tsx の SalonCard）との違いは3つだけ:
//     1. 店名バーに保存ボタン（肉球）を出さない
//     2. 中身は営業時間と地域バッジだけ（一言・評価・料金・出勤数・セラピスト・「詳しく見る」は出さない）
//     3. 送客計測（ImpressionMark）を入れない（有料店へ出すレポートの数字に混ぜない）
// ★ 外枠・細線・帯の色や余白は SalonCard からそのまま写している。あちらを直したらここも見ること。
export function FreeListingCards({ items }: { items: FreeListing[] }) {
  const router = useRouter();
  if (items.length === 0) return null;

  return (
    // 有料カードの grid と同じ（TOP は1列・lg は左寄せ・間隔 gap-5）。
    <div className="grid grid-cols-1 lg:justify-items-start gap-5">
      {items.map((s) => {
        // 地域バッジ（有料カードと同じ出し分け：出張エリアは出さない・第2エリアは重複時に出さない）。
        const badges = [
          ...(s.area && s.area !== DISPATCH_AREA ? [areaLabel(s.area)] : []),
          ...(s.area2 && s.area2 !== s.area && s.area2 !== DISPATCH_AREA ? [areaLabel(s.area2)] : []),
        ];
        return (
          <div
            key={s.id}
            // ★ SalonCard の外枠と同じ。lg の 512px＋salon-card-zoom も同じ
            //   （差し込み枠側が calc(512px*1.413) なので、ここで拡大してちょうど収まる）。
            className="group border border-slate-200 bg-white shadow-sm hover:border-pink-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-pink-500/10 transition-all duration-300 flex flex-col cursor-pointer overflow-hidden lg:w-[512px] lg:max-w-full salon-card-zoom"
            onClick={() => router.push(`/salon/${s.id}`)}
          >
            {/* 上端のピンクの細線（有料カードと同じ） */}
            <div className="h-px bg-gradient-to-r from-transparent via-pink-400/60 to-transparent" />

            {/* 店名バー（有料カードと同じ帯）。★ showSaveButton は渡さない＝肉球なし */}
            <div
              className="px-5 py-0.5"
              style={{ background: 'linear-gradient(to right, #fdf2f8, #fce7f3)', borderBottom: '1px solid #fbcfe8' }}
            >
              <SalonNameRow salonId={s.id} salonName={s.name} nameBanner />
            </div>

            {/* 本体。余白は有料カードの nameBanner＋compact のとき（px-5 pt-2.5 pb-[7px]）と同じ。 */}
            <div className="px-5 pt-2.5 pb-[7px] flex flex-col flex-1">
              {/* ★ 一言を出したくなったら、この位置に SalonCard の catchEl と同じ <p> を1つ足す。 */}
              <div className="flex items-center gap-2 text-xs flex-wrap mb-1">
                {s.hours && (
                  <div className="flex items-center gap-1.5">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 flex-shrink-0">
                      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                    </svg>
                    <span className="text-slate-500">{s.hours}</span>
                  </div>
                )}
                {badges.map((b) => (
                  <span key={b} className="flex-shrink-0 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-200">
                    {b}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
