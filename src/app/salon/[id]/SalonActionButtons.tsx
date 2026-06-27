import { SaveButton } from '@/app/components/SaveButton';

// サロン詳細ページの主要アクション（ネット予約／電話をする）。
//
// ── 今回は「見た目のみ」。後日データを繋ぐ“口”だけ用意する ──
//  - reserveUrl : ネット予約URL。指定時は <a href> で予約ページへ（外部想定で target=_blank）。
//                 未設定（undefined / null）のときは無効プレビュー表示。
//                 ※本番運用では「未設定なら非表示」にする想定（呼び出し側で出し分け、または
//                   このコンポーネント先頭で reserveUrl も phone も無ければ null を返す等）。
//  - phone      : 電話番号。指定時は tel: リンク（スマホは発信／PCも tel: で対応）。
//                 未設定のときは無効プレビュー表示。本番運用では「未設定なら非表示」想定。
//
// 現状は予約/電話の props を渡していないため、両ボタンとも「押しても何も起きない」プレビュー。
// データ接続時は <SalonActionButtons reserveUrl={...} phone={salon.phone} /> と渡すだけで機能する。
//
// salonId / salonName を渡すと、右端にサロン保存ボタン（SaveButton paw）を表示する。
// 保存状態は SaveButton 側が localStorage で自己完結管理するため、ここでの初期状態取得は不要。
export function SalonActionButtons({
  reserveUrl,
  phone,
  salonId,
  salonName,
}: {
  reserveUrl?: string | null;
  phone?: string | null;
  salonId?: number;
  salonName?: string;
}) {
  const base =
    'flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold shadow-sm transition-all';

  // 主CTA＝ネット予約（ブランドグラデ：オレンジ→マゼンタ）。
  const reserveStyle: React.CSSProperties = { background: 'linear-gradient(to right,#FB923C,#DB2777)' };
  // 副CTA＝電話をする（白地＋ブランド枠の従ボタン）。
  const phoneStyle: React.CSSProperties = { color: '#DB2777', border: '1.5px solid #F4B6CE' };

  const calendarIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
  const phoneIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );

  return (
    <div className="flex items-stretch gap-2.5 sm:gap-3 mb-4">
      {/* ── ネット予約（主CTA） ── */}
      {reserveUrl ? (
        <a href={reserveUrl} target="_blank" rel="noopener noreferrer" className={`${base} text-white hover:brightness-105`} style={reserveStyle}>
          {calendarIcon}ネット予約
        </a>
      ) : (
        // reserveUrl 未設定：今は無効（押下しても何も起きない）。データ接続後は href を差し込むだけ。
        <button type="button" aria-disabled="true" className={`${base} text-white cursor-default`} style={reserveStyle}>
          {calendarIcon}ネット予約
        </button>
      )}

      {/* ── 電話をする（副CTA） ── */}
      {phone ? (
        <a href={`tel:${phone}`} className={`${base} bg-white hover:bg-pink-50`} style={phoneStyle}>
          {phoneIcon}電話をする
        </a>
      ) : (
        // phone 未設定：今は無効。データ接続後は tel: の番号を差し込むだけ。
        <button type="button" aria-disabled="true" className={`${base} bg-white cursor-default`} style={phoneStyle}>
          {phoneIcon}電話をする
        </button>
      )}

      {/* ── サロン保存ボタン（右端・既存 SaveButton paw を流用。状態は SaveButton 側で自己完結） ── */}
      {salonId != null && (
        <span className="flex-shrink-0 inline-flex items-center">
          <SaveButton kind="salon" item={{ id: salonId, name: salonName ?? '' }} variant="paw" />
        </span>
      )}
    </div>
  );
}
