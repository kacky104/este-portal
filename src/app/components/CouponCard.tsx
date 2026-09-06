import { getCouponColor } from '@/app/lib/couponColors';

// クーポン1枚の見た目。
//
// ★★★ ここが【唯一の正】です。
//   ★ お客様が見る /salon/{id}/coupon と、/mypage の入力画面のプレビューが、同じものを使う。
//   ★ 別々に書くと、プレビューが本物とずれる。★ ずれたプレビューは、無いより悪い
//     （店舗様は見た目を確かめたつもりで、確かめられていない）。
//   ★ 色は src/app/lib/couponColors.ts が唯一のソース。ここでは決めない。

/** 有効期限の表示整形（"2026-07-31" → "2026年7月31日"）。★ 読めない値は空にする（嘘を書かない）。 */
export function formatCouponValidUntil(d: string): string {
  const dt = new Date(`${d}T00:00:00+09:00`);
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric',
  }).format(dt);
}

export function CouponCard({
  title,
  discount,
  conditions,
  validUntil,
  color,
}: {
  title: string;
  discount: string;
  conditions?: string | null;
  validUntil?: string | null;
  color?: string | null;
}) {
  // 券の色プリセット（未設定/不明値は既定色にフォールバック）
  const cc = getCouponColor(color ?? null);
  const validLabel = validUntil ? formatCouponValidUntil(validUntil) : '';
  return (
    <div className="rounded-[20px] bg-white shadow-md overflow-hidden flex flex-col">
      {/* 上部カラー帯（~60px、プリセット色 → やや暗めの同系グラデ） */}
      <div
        className="relative flex items-center px-5 min-h-[64px] py-3"
        style={{ background: `linear-gradient(135deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.36) 100%), ${cc.background}` }}
      >
        <h3
          className="font-bold text-white text-base break-words pr-20"
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
        >
          {title}
        </h3>
        {/* 点線の丸スタンプ風（右）：フクエス／を見た！ */}
        <div
          className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full border-2 border-dashed flex flex-col items-center justify-center text-white text-center leading-none"
          style={{ borderColor: 'rgba(255,255,255,0.85)', textShadow: '0 1px 2px rgba(0,0,0,0.45)' }}
        >
          <span className="text-[9px] font-bold">フクエス</span>
          <span className="text-[9px] font-bold mt-0.5">を見た！</span>
        </div>
      </div>

      {/* 本文 */}
      <div className="p-5 flex flex-col gap-2">
        {/* 割引額（大きく・濃いトーン） */}
        <p className="text-2xl font-extrabold leading-tight break-words" style={{ color: cc.accent }}>
          {discount}
        </p>

        {/* 説明（条件） */}
        {conditions && (
          <p className="text-sm text-slate-500 leading-relaxed break-words whitespace-pre-wrap">{conditions}</p>
        )}

        {/* 有効期限 */}
        {validLabel && (
          <p className="text-xs text-slate-400">有効期限：{validLabel}まで</p>
        )}

        {/* 点線区切り＋必須文言（全クーポン共通・固定表示） */}
        <div className="mt-1 border-t border-dashed border-slate-200" />
        <p className="text-xs text-slate-500 leading-relaxed">
          ご利用の際は
          <span className="font-bold" style={{ color: cc.accent }}>『フクエスを見た！』</span>
          とお伝えください
        </p>
      </div>
    </div>
  );
}
