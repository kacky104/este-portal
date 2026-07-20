// 店舗の区分バッジ（地域バッジの右横）。
//   出張専門（dispatch_type='only'）＝「出張専門」／それ以外＝「メンズエステ/ルーム（個室）」。
export function SalonTypeBadge({ dispatchType }: { dispatchType: 'none' | 'available' | 'only' }) {
  const isDispatch = dispatchType === 'only';
  const label = isDispatch ? '出張専門' : 'メンズエステ/ルーム（個室）';
  const cls = isDispatch
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-sky-50 text-sky-700 border-sky-200';
  return (
    <span className={`flex-shrink-0 text-[9px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}
