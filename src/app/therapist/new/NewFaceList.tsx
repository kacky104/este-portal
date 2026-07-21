// 「本日出勤中のセラピスト」一覧（WorkingTherapists）と同じ Card・同じ grid レイアウトを踏襲。
// データは page（Server）が ISR で取得して props で渡すため、ここでは自己フェッチせず描画だけ行う。
import { Card, type TherapistItem } from '@/app/components/TherapistScroller';

export function NewFaceList({ therapists }: { therapists: TherapistItem[] }) {
  if (therapists.length === 0) {
    return (
      <div className="text-center py-10 text-sm text-slate-400 border border-dashed border-emerald-100 rounded-2xl bg-emerald-50/20">
        現在、新人セラピストはおりません ✿
      </div>
    );
  }

  // スマホ（<640px）のみ：gap を詰め、カードをセル幅いっぱい（元の比率）にして少し大きく表示（WorkingTherapists と同一）。
  return (
    <div className="grid grid-cols-3 lg:grid-cols-5 gap-1 sm:gap-3 justify-items-center max-sm:[&>a]:!w-full max-sm:[&>a]:!h-auto max-sm:[&>a]:!aspect-[105/153]">
      {therapists.map((t, i) => <Card key={t.id} therapist={t} index={i} showAge />)}
    </div>
  );
}
