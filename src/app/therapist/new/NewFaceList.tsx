// 「本日出勤中のセラピスト」一覧（WorkingTherapists）と同じ Card・同じ grid レイアウトを踏襲。
// データは page（Server）が ISR で取得して props で渡すため、ここでは自己フェッチせず描画だけ行う。
import { Card, type TherapistItem } from '@/app/components/TherapistScroller';
import { TherapistPickupBanner } from '@/app/components/TherapistPickupBanner';
import type { TherapistPickupBanner as PickupBanner } from '@/app/lib/therapistPickupBanners';

// セラピストピックアップ枠の挿入位置：スマホ3列×5段＝15枚目の直下（PCでは3段目相当）。
// カードが15枚未満のときは最後のカードの直下（＝最下部）に出す。
const PICKUP_AFTER = 15;

export function NewFaceList({ therapists, pickupBanners = [] }: { therapists: TherapistItem[]; pickupBanners?: PickupBanner[] }) {
  if (therapists.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-slate-400 border border-dashed border-emerald-100 rounded-2xl bg-emerald-50/20">
        現在、新人セラピストはおりません ✿
      </div>
    );
  }

  const hasPickup = pickupBanners.length > 0;
  // この index のカード直下にバナーを挿入（件数が PICKUP_AFTER 未満なら最後のカード直下）。
  const insertAt = Math.min(PICKUP_AFTER, therapists.length) - 1;

  // スマホ（<640px）のみ：gap を詰め、カードをセル幅いっぱい（元の比率）にして少し大きく表示（WorkingTherapists と同一）。
  // ピックアップバナーは col-span-full で全幅行として挿入（カード間に入る全幅帯）。
  return (
    <div className="grid grid-cols-3 lg:grid-cols-5 gap-1 sm:gap-3 justify-items-center max-sm:[&>a]:!w-full max-sm:[&>a]:!h-auto max-sm:[&>a]:!aspect-[105/153]">
      {therapists.flatMap((t, i) => {
        const card = <Card key={t.id} therapist={t} index={i} showAge />;
        if (hasPickup && i === insertAt) {
          return [
            card,
            <div key="pickup" className="col-span-full w-full justify-self-stretch my-4 sm:my-6">
              <TherapistPickupBanner banners={pickupBanners} />
            </div>,
          ];
        }
        return [card];
      })}
    </div>
  );
}
