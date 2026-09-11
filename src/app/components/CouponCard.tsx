import { getCouponColor } from '@/app/lib/couponColors';

// クーポン1枚の見た目。
//
// ★★★ ここが【唯一の正】です。
//   ★ お客様が見る /salon/{id}/coupon と、/mypage の入力画面のプレビュー、VIPレターが、同じものを使う。
//   ★ 別々に書くと、プレビューが本物とずれる。★ ずれたプレビューは、無いより悪い
//     （店舗様は見た目を確かめたつもりで、確かめられていない）。
//   ★ 色は src/app/lib/couponColors.ts が唯一のソース。ここでは決めない。
//
// ★★ 2026-09-08：カッキーさんの指示で「もっと煌びやかに・神秘的に・豪華に」装飾した。
//   足したもの（動きの CSS は globals.css の「クーポン券の装飾」の節）:
//     1. 外周の金枠（2px）＋その上をゆっくり一周する光の弧（.coupon-lux）
//     2. 見出し帯：上からの光・斜めの細い模様・小さな輝き ✦ ・4.5秒に1回横切る光（.coupon-lux-band）
//     3. スタンプ丸を二重リング＋わずかに傾ける
//     4. 本文：ごく薄い色のグラデ地＋四隅の飾り罫＋金の細線＋中央に ◆ の区切り
//     5. 割引額を金属光沢のグラデ文字に
//   ★ 色は今までどおりプリセット（cc.background / cc.accent）から作る。券の色を選べる仕組みは変えていない。
//   ★ 動きを減らす設定の人には CSS 側で全部止まる。

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

  // アクセント色からつくる、うすい派生色（本文の地・飾り罫）。★ プリセットは 6桁hex なので透明度は末尾2桁で足せる。
  const a08 = `${cc.accent}14`; // 約8%
  const a20 = `${cc.accent}33`; // 約20%
  const a40 = `${cc.accent}66`; // 約40%

  return (
    // 外周：金枠(2px)＋その上を光の弧が一周（.coupon-lux）。影は色に合わせてほんのり色づける。
    <div
      className="coupon-lux relative rounded-[22px] p-[2px] shadow-[0_14px_34px_-12px_rgba(0,0,0,0.45)]"
      style={{
        background: `linear-gradient(140deg, #C9A227 0%, #FBF0C6 18%, #B8860B 34%, #FFF7DA 52%, #C9A227 68%, #F6E7B0 84%, #B8860B 100%)`,
      }}
    >
      <div className="relative rounded-[20px] bg-white overflow-hidden flex flex-col">
        {/* 上部カラー帯（プリセット色＋上からの光＋斜めの細い模様） */}
        <div
          className="coupon-lux-band relative flex items-center px-5 min-h-[72px] py-3 overflow-hidden"
          style={{
            background: `radial-gradient(120% 180% at 12% -40%, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0) 58%), linear-gradient(135deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.40) 100%), ${cc.background}`,
          }}
        >
          {/* 斜めの細い模様（神秘的な織り地のイメージ）。文字の下に敷く。 */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none opacity-60"
            style={{
              backgroundImage:
                'repeating-linear-gradient(115deg, rgba(255,255,255,0.10) 0px, rgba(255,255,255,0.10) 1px, rgba(255,255,255,0) 1px, rgba(255,255,255,0) 10px)',
            }}
          />
          {/* 小さな輝き（点滅の間隔をずらす） */}
          <span aria-hidden className="coupon-sparkle absolute left-2 top-2 text-white/90 text-[10px] leading-none drop-shadow">✦</span>
          <span aria-hidden className="coupon-sparkle absolute left-[38%] bottom-1.5 text-white/80 text-[8px] leading-none" style={{ animationDelay: '1.1s' }}>✦</span>
          <span aria-hidden className="coupon-sparkle absolute right-[26%] top-2.5 text-white/85 text-[9px] leading-none" style={{ animationDelay: '2s' }}>✦</span>

          <h3
            className="relative z-[2] font-bold text-white text-base tracking-wide break-words pr-20"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.55), 0 0 12px rgba(255,255,255,0.35)' }}
          >
            {title}
          </h3>

          {/* 点線の丸スタンプ風（右）：フクエス／を見た！ ★ 二重リング＋わずかに傾ける */}
          <div
            className="absolute right-4 top-1/2 z-[2] w-[52px] h-[52px] rounded-full flex flex-col items-center justify-center text-white text-center leading-none"
            style={{
              transform: 'translateY(-50%) rotate(-8deg)',
              border: '1px solid rgba(255,255,255,0.45)',
              boxShadow: '0 0 10px rgba(255,255,255,0.35), inset 0 0 10px rgba(255,255,255,0.20)',
              textShadow: '0 1px 2px rgba(0,0,0,0.45)',
            }}
          >
            <span
              aria-hidden
              className="absolute inset-[3px] rounded-full border-2 border-dashed"
              style={{ borderColor: 'rgba(255,255,255,0.9)' }}
            />
            <span className="relative text-[9px] font-bold">フクエス</span>
            <span className="relative text-[9px] font-bold mt-0.5">を見た！</span>
          </div>

          {/* 帯の下の金の細線 */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-px pointer-events-none"
            style={{ background: 'linear-gradient(90deg, rgba(201,162,39,0) 0%, rgba(255,246,214,0.95) 50%, rgba(201,162,39,0) 100%)' }}
          />
        </div>

        {/* 本文（ごく薄い色のグラデ地＋四隅の飾り罫） */}
        <div
          className="relative p-5 pt-4 flex flex-col gap-2"
          style={{ background: `linear-gradient(180deg, ${a08} 0%, #FFFFFF 42%, #FFFFFF 100%)` }}
        >
          {/* 四隅の飾り罫 */}
          <span aria-hidden className="absolute left-2 top-2 w-3.5 h-3.5 pointer-events-none" style={{ borderLeft: `1px solid ${a40}`, borderTop: `1px solid ${a40}` }} />
          <span aria-hidden className="absolute right-2 top-2 w-3.5 h-3.5 pointer-events-none" style={{ borderRight: `1px solid ${a40}`, borderTop: `1px solid ${a40}` }} />
          <span aria-hidden className="absolute left-2 bottom-2 w-3.5 h-3.5 pointer-events-none" style={{ borderLeft: `1px solid ${a40}`, borderBottom: `1px solid ${a40}` }} />
          <span aria-hidden className="absolute right-2 bottom-2 w-3.5 h-3.5 pointer-events-none" style={{ borderRight: `1px solid ${a40}`, borderBottom: `1px solid ${a40}` }} />

          {/* 割引額（大きく・金属光沢のグラデ文字） */}
          <p
            className="text-2xl font-extrabold leading-tight break-words"
            style={{
              backgroundImage: `linear-gradient(100deg, ${cc.accent} 0%, color-mix(in srgb, ${cc.accent} 45%, #FFFFFF) 42%, ${cc.accent} 72%, color-mix(in srgb, ${cc.accent} 60%, #FFFFFF) 100%)`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              filter: `drop-shadow(0 1px 0 rgba(255,255,255,0.9)) drop-shadow(0 2px 6px ${a20})`,
            }}
          >
            {discount}
          </p>

          {/* 説明（条件） */}
          {conditions && (
            <p className="text-sm text-slate-600 leading-relaxed break-words whitespace-pre-wrap">{conditions}</p>
          )}

          {/* 有効期限 */}
          {validLabel && (
            <p className="text-xs text-slate-400">有効期限：{validLabel}まで</p>
          )}

          {/* 区切り（点線＋中央に ◆）＋必須文言（全クーポン共通・固定表示） */}
          <div className="relative mt-2 mb-1 flex items-center gap-2" aria-hidden>
            <span className="flex-1 h-px" style={{ background: `linear-gradient(90deg, transparent, ${a40})` }} />
            <span className="text-[9px] leading-none" style={{ color: cc.accent }}>◆</span>
            <span className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${a40}, transparent)` }} />
          </div>
          {/* ★ 「ご利用の際は」は外した（2026-09-11・カッキーさんの指示）。★ 短く『…』から始める。 */}
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="font-bold" style={{ color: cc.accent }}>『フクエスを見た！』</span>
            とお伝えください
          </p>
        </div>
      </div>
    </div>
  );
}
